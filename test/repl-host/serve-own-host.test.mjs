// A real cua connection (src/mcp/connection.mjs) on cua's own REPL host: the proxy, its anchor-owned process group,
// the supervisor and kernel, the scoped sandbox state the proxy stamps, end_task's turn_ended completion and the
// connection's teardown. The installed runtime is a forged home (test/fixtures/installed-home.mjs) whose sandbox
// launcher is the recording double (on macOS in place of sandbox-exec, on Linux of the pinned codex-linux-sandbox,
// standing where `cua install` places it and named with its own SHA-256 as the pinned one); no vendor process runs.
// The production banner imports cua's own facade (src/cua-api/bootstrap.mjs), so the chain banner -> kernel -> host ->
// trusted worker -> cua's browser wrapper and service runs for real and the first cell carries the first-call document.
// Needs Node 24 or later for the kernel (CUA_NODE).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync, chmodSync, mkdirSync, readFileSync, realpathSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {PassThrough} from 'node:stream';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {scratchUserHome} from '../fixtures/runtime-fixture.mjs';
import {fakeInstalledHome, installedHomeSupported, NO_SCOPED_LAUNCH} from '../fixtures/installed-home.mjs';
import {openConnection} from '../../src/mcp/connection.mjs';
import {homeLayout} from '../../src/runtime/layout.mjs';
import {kernelNode} from './kernel-harness.mjs';
import {launches, sandboxDouble} from './supervisor-harness.mjs';
import {REPL_HOST_META_KEY, REPL_HOST_NAME, REPL_HOST_VERSION} from '../../src/repl-host/identity.mjs';
import {toolOverrides} from '../../src/repl-host/instructions.mjs';
import {helperFor, sha256Of, verifyHelper as verifyLinuxHelper} from '../../src/sandbox/linux.mjs';

const {node, skip: noNode} = kernelNode();
const skip = noNode || (!installedHomeSupported && 'no checked-in pin for this host') || NO_SCOPED_LAUNCH;

test('an explicitly selected own host answers a real connection: handshake, cells, reset, end_task and an owned teardown', {skip}, async t => {
  const home = fakeInstalledHome(t);
  const records = join(home, 'double');
  const execDouble = sandboxDouble(home, {records, exec: true});
  // On Linux the helper double stands where `cua install` places the pinned helper, and the launch names its SHA-256 as
  // the pinned one: the connection's preflight and the supervisor's check before each child verify the double's bytes.
  const helper = process.platform === 'linux' ? helperFor({home, arch: process.arch}) : null;
  let helperSha = null;
  if (helper) {
    mkdirSync(dirname(helper.path), {recursive: true});
    copyFileSync(sandboxDouble(dirname(helper.path), {records}), helper.path);
    chmodSync(helper.path, 0o755);
    helperSha = sha256Of(readFileSync(helper.path));
  }
  const verifyHelper = helper && (named => verifyLinuxHelper({...named, sha256: helperSha}));
  // cua's own sandbox runs sandbox-exec (macOS) or the pinned helper (Linux), which the doubles stand in for: the launch
  // record's one seam.
  const prepareLaunch = launch => (launch.env.CUA_REPL_SANDBOX_EXEC ? {...launch, env: {...launch.env, CUA_REPL_SANDBOX_EXEC: execDouble}}
    : launch.env.CUA_REPL_SANDBOX_HELPER === helper?.path ? {...launch, env: {...launch.env, CUA_REPL_SANDBOX_HELPER_SHA256: helperSha}} : launch);
  const env = {PATH: '/usr/bin:/bin', HOME: scratchUserHome(t), TMPDIR: process.env.TMPDIR, CUA_REPL_HOST: 'cua', CUA_NODE: node,
    CUA_SHIM_SURFACES: 'browser', CUA_SHIM_SECRETS: 'off', CUA_RUNTIME_IDLE_MS: '0'};
  const input = new PassThrough(), output = new PassThrough();
  const pending = new Map();
  createInterface({input: output}).on('line', line => { const msg = JSON.parse(line); pending.get(msg.id)?.(msg); });
  const connection = await openConnection({home, env, sessionId: randomUUID(), input, output, diagnostics: () => {}, chrome: {profiles: []}, listBackends: async () => ({backends: []}), prepareLaunch, ...(verifyHelper ? {verifyHelper} : {})});
  t.after(() => connection.close('test end'));
  let id = 0;
  const request = (method, params) => new Promise(resolve => { const n = ++id; pending.set(n, resolve); input.write(`${JSON.stringify({jsonrpc: '2.0', id: n, method, params})}\n`); });
  const call = async (name, args = {}) => (await request('tools/call', {name, arguments: args})).result;

  const init = await request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'own-host-test', version: '0'}});
  assert.deepEqual(init.result.serverInfo, {name: REPL_HOST_NAME, version: REPL_HOST_VERSION});
  const listed = (await request('tools/list', {})).result.tools;
  assert.deepEqual(listed.map(tool => tool.name), ['js', 'js_reset', 'end_task', 'secrets_list', 'profiles_list', 'devices_list', 'devices_use'].filter(name => !name.startsWith('devices')));
  const effective = toolOverrides({platform: process.platform, surfaces: ['browser']}).tools;
  assert.ok(listed[0].description.endsWith(effective.js.description), 'the effective js text, below the proxy\'s host rules');
  assert.equal(listed[0].inputSchema.properties.code.description, effective.js.field_descriptions.code);
  assert.equal(listed[1].description, effective.js_reset.description);

  const first = await call('js', {code: 'let kept=41;nodeRepl.write(JSON.stringify(Object.keys(nodeRepl.requestMeta)))'});
  assert.equal(first.isError, false, JSON.stringify(first.content));
  assert.deepEqual(first._meta[REPL_HOST_META_KEY], {host: 'cua', version: REPL_HOST_VERSION});
  assert.equal(typeof first._meta['cua/taskId'], 'string');
  const doc = name => readFileSync(new URL(`../../docs/cua-api/${name}`, import.meta.url), 'utf8');
  assert.equal(first.content[0].text, `${doc('core.md')}\n${doc('confirmations.md')}`, 'the bootstrap\'s first-call document leads the first cell');
  assert.deepEqual(JSON.parse(first.content[1].text), ['callId', 'sessionId', 'threadId', 'x-codex-turn-metadata'], 'the proxy\'s turn metadata, without its sandbox state');
  assert.equal((await call('js', {code: 'nodeRepl.write(kept+1)'})).content[0].text, '42');
  assert.deepEqual(JSON.parse((await call('js', {code: 'nodeRepl.write(JSON.stringify([Object.keys(cua).sort(), typeof agent.browsers.list, await cua.listBrowsers({emit: false})]))'})).content[0].text),
    [['browsers', 'createBrowserTab', 'getBrowser', 'getState', 'getTab', 'initialize', 'listBrowsers', 'listTabs', 'rewriteDocumentation'], 'function', []],
    'the owned facade, set up through the trusted worker and cua\'s browser service (no backends here)');
  const [launch, workerLaunch, ...more] = launches(records);
  assert.equal(more.length, 0, 'one kernel and one trusted worker');
  const run = join(homeLayout(realpathSync(home)).run);
  for (const child of [launch, workerLaunch]) {
    if (process.platform === 'darwin') assert.ok(child.argv.some(a => a.startsWith('-DWRITABLE_ROOT_1=') && a.startsWith(`-DWRITABLE_ROOT_1=${run}/`)), 'the scoped policy the proxy sent, for both children: the run directory writable');
    else {
      // The helper's argv (src/sandbox/linux.mjs linuxCommand): the run directory as the policy's cwd, its project root.
      const [policyCwdFlag, policyCwd, commandCwdFlag, commandCwd, profileFlag, , separator] = child.argv;
      assert.deepEqual([policyCwdFlag, commandCwdFlag, profileFlag, separator], ['--sandbox-policy-cwd', '--command-cwd', '--permission-profile', '--']);
      assert.ok(policyCwd.startsWith(`${run}/`) && commandCwd === policyCwd, 'the scoped policy the proxy sent, for both children: the run directory its cwd');
      const {network, file_system: {entries}} = JSON.parse(child.argv[5]);
      assert.equal(network, 'restricted');
      for (const kind of ['project_roots', 'tmpdir']) assert.ok(entries.some(e => e.path.type === 'special' && e.path.value.kind === kind && e.access === 'write'), `${kind} writable`);
    }
  }
  if (process.platform === 'darwin') {
    const excluded = argv => argv.some(a => /^-DREADABLE_ROOT_\d+_EXCLUDED_\d+=/.test(a) && a.endsWith(`=${realpathSync(home)}`));
    assert.ok(excluded(launch.argv), 'the kernel is denied the cua home');
    assert.ok(!excluded(workerLaunch.argv), 'the worker is not');
  } else {
    const denied = argv => JSON.parse(argv[5]).file_system.entries.filter(e => e.access === 'none' && e.path.type === 'path').map(e => e.path.path);
    assert.ok(['run', 'state'].every(dir => denied(launch.argv).includes(join(realpathSync(home), dir))), 'the kernel is denied the cua home\'s state and runs');
    assert.deepEqual(denied(workerLaunch.argv), [], 'the worker is not');
  }
  assert.match(workerLaunch.argv.at(-2), /src\/repl-host\/trusted-worker\.mjs$/);
  assert.equal((await call('js_reset')).content[0].text, 'js kernel reset');
  assert.deepEqual((await call('js', {code: 'nodeRepl.write(typeof kept)'})).content.map(item => item.text), [`${doc('core.md')}\n${doc('confirmations.md')}`, 'undefined'],
    'bindings gone, and a fresh bootstrap writes the first-call document again');
  const ended = (await call('end_task')).structuredContent;
  assert.deepEqual([ended.status, ended.ended], ['ended', true]);

  input.end();
  const closed = await connection.closed;
  assert.equal(closed.code, 0);
  assert.equal(closed.teardown.confirmed, true);
});
