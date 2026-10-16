// The live repl-parity fixtures build their own environments; an explicit CUA_NODE (the own host's Node, needed where the
// proxy's and PATH's Node are older than the floor, as on the cua-linux VM) must survive every one of them. And the
// failing-sandbox launcher a boundary probe writes must name its marker path as data, never as shell syntax.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {boundaryPreflightEnv, boundaryServeEnv, cellsServeEnv, failingSandboxScript} from './fixture-launch.mjs';
import {remoteCapabilityLane} from '../../scripts/repl-parity/capability.mjs';
import {cellsCommand, prepareCommand} from '../../scripts/repl-parity/topology.mjs';

const NODE = '/opt/node-24/bin/node';
const scratch = {dir: '/tmp/scratch-home', userHome: '/tmp/scratch-home/user'};
const ambient = {PATH: '/usr/bin', TMPDIR: '/tmp/t', DISPLAY: ':0', SECRET_TOKEN: 'owner-only', CUA_NODE: NODE};

test('serve-cells keeps an explicit CUA_NODE in the connection environment it rebuilds, and nothing else of the ambient', () => {
  const env = cellsServeEnv(ambient, {scratch, sandbox: 'scoped', host: 'cua'});
  assert.equal(env.CUA_NODE, NODE);
  assert.equal(env.SECRET_TOKEN, undefined);
  assert.equal(env.CUA_REPL_HOST, 'cua');
  assert.equal(env.DISPLAY, ':0');
  assert.equal('CUA_NODE' in cellsServeEnv({...ambient, CUA_NODE: undefined}, {scratch, sandbox: 'scoped', host: 'cua'}), false);
  assert.equal('CUA_NODE' in cellsServeEnv({...ambient, CUA_NODE: ''}, {scratch, sandbox: 'scoped', host: 'cua'}), false);
});

test('managed mode survives boundary child rebuilding without importing an ambient Node override',()=>{
 const env=boundaryServeEnv({...ambient,CUA_PARITY_NODE_MODE:'managed'},{tmp:'/tmp/b',home:'/owned',host:'cua',facts:{},control:'/tmp/control'});
 assert.equal(env.CUA_PARITY_NODE_MODE,'managed');assert.equal(env.CUA_NODE,undefined);
 assert.equal(cellsServeEnv({...ambient,CUA_PARITY_NODE_MODE:'managed'},{scratch,host:'cua',sandbox:'scoped'}).CUA_NODE,undefined);
});
test('the boundary probe passes an explicit CUA_NODE to its serve-cells children and its negative preflights', () => {
  const child = boundaryServeEnv(ambient, {tmp: '/tmp/b/tmp', home: '/tmp/cua-home', host: 'cua', facts: {release: 'r'}, control: '/tmp/b/c1', sandbox: 'scoped', witness: false, brokenSandbox: ''});
  assert.equal(child.CUA_NODE, NODE);
  assert.equal(child.CUA_PARITY_REMOTE, '1');
  assert.equal(child.SECRET_TOKEN, undefined);
  const preflight = boundaryPreflightEnv(ambient, {scratch, tmp: '/tmp/b/tmp', host: 'cua'});
  assert.equal(preflight.CUA_NODE, NODE);
  assert.equal(preflight.CUA_SHIM_SANDBOX, 'scoped');
  assert.equal('CUA_NODE' in boundaryPreflightEnv({PATH: '/usr/bin'}, {scratch, tmp: '/tmp/b/tmp', host: 'cua'}), false);
});

test('every remote lane passes only a recorded diagnostic Node override, never a source resolution or shell setting', async () => {
  const facts = {device: 'cua-linux', checkout: '/home/admin/cua-parity', home: '/home/admin/.local/share/cua', commit: 'abc', release: 'pin', node: 'v22.23.3', platform: 'linux',
    ownNode: {path: NODE, version: 'v24.18.0'},nodeOverride:NODE};
  const lane = await remoteCapabilityLane({...facts, host: 'cua'},
    {start: async () => ({executionFacts: {...facts, dirty: false}, userHome: '/tmp/u', home: '/tmp/h', close: async () => {}})});
  const script = lane.command.args.at(-1);
  const clearing = script.slice(script.indexOf('env -i'), script.indexOf(' node test/repl-parity/serve-capability-client.mjs'));
  // Run that very `env -i` prefix here with `env` as its command: the recorded Node is set whatever the shell has.
  const run = ambientNode => execFileSync('/bin/sh', ['-c', `${clearing} env`], {encoding: 'utf8', env: {PATH: process.env.PATH, ...(ambientNode === undefined ? {} : {CUA_NODE: ambientNode}), SECRET_TOKEN: 'owner-only'}});
  assert.match(run(undefined), new RegExp(`^CUA_NODE=${NODE}$`, 'm'));
  assert.match(run('/shell/profile/node'), new RegExp(`^CUA_NODE=${NODE}$`, 'm'));
  assert.doesNotMatch(run(NODE), /SECRET_TOKEN/);
  const cells = cellsCommand({...facts, host: 'cua'}).args.at(-1);
  const resultingEnv=script=>execFileSync('/bin/sh',['-c',script.slice(script.lastIndexOf('exec env'),script.lastIndexOf(' node test/'))+' /usr/bin/env'],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',CUA_NODE:'/ambient/node'}});
  assert.match(resultingEnv(cells),new RegExp(`^CUA_NODE=${NODE}$`,'m'));
  const managed=cellsCommand({...facts,nodeOverride:null,host:'cua'}).args.at(-1);
  assert.doesNotMatch(resultingEnv(managed),/^CUA_NODE=/m);
  assert.throws(() => prepareCommand({device: 'cua-linux', commit: 'abcdef1', profile: 'me', node: 'node'}), /absolute/);
});

test('the failing-sandbox launcher writes its marker at the literal path, however the path is spelt', t => {
  const dir = mkdtempSync(join(tmpdir(), 'cua-bounds-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const pwned = join(dir, 'pwned');
  // Run from `dir`, a substitution in the path would create `pwned` there.
  const marker = join(dir, `odd $(touch pwned) \`touch pwned\` 'q' "d"`);
  const script = join(dir, 'failing-sandbox');
  writeFileSync(script, failingSandboxScript(marker));
  chmodSync(script, 0o700);
  let status = 0;
  try { execFileSync(script, [], {cwd: dir, stdio: ['ignore', 'ignore', 'pipe']}); } catch (error) { status = error.status; }
  assert.equal(status, 73);
  assert.equal(readFileSync(marker, 'utf8'), 'invoked');
  assert.equal(existsSync(pwned), false);
});
