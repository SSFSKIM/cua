import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {prepareCommand} from '../../scripts/repl-parity/topology.mjs';
import {prepareNative, cleanupNative} from '../../scripts/native-baseline/prepare.mjs';
import {serveCommand} from '../../scripts/native-baseline/remote.mjs';
import {spawnGeditScript} from '../../scripts/native-baseline/linux.mjs';

const xSession = {DISPLAY: ':7', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1234/bus', XDG_RUNTIME_DIR: '/run/user/1234', XAUTHORITY: '/run/user/1234/x-cookie'};
test('a declared cloud device prepares without inheriting the VM discovery home', () => {
  const cloud = prepareCommand({device: 'cua-bench', commit: 'abcdef0'});
  assert.equal(cloud.args[2], 'cua-bench');
  assert.doesNotMatch(cloud.args.at(-1), /cua-h4|\/home\/admin|192\.168\.64|cua-parity-node/);
  assert.match(prepareCommand({device: 'cua-linux', commit: 'abcdef0'}).args.at(-1), /\/home\/admin\/\.local\/share\/cua-h4/);
  assert.throws(() => prepareCommand({device: 'undeclared-device', commit: 'abcdef0'}), /declared/);
});

test('fresh native preparation installs both runtimes in an owned home, removes ambient overrides and cleans only its home', t => {
  const parent = mkdtempSync(join(tmpdir(), 'native-prepare-test-'));
  t.after(() => rmSync(parent, {recursive:true, force:true}));
  const calls = [];
  const prepared = prepareNative({device:'cua-bench'}, {
    directoryRoot:parent, tempRoot:'/different-tmp', ambient:{HOME:'/home/bench', CUA_HOME:'/foreign/h4', CUA_NODE:'/foreign/node', ...xSession},
    desktop:() => xSession,
    run:(exe,args,options) => { calls.push({exe,args,env:options.env}); return ''; },
    inspect:({source}) => ({home:source, ownNode:{path:join(source,'node/24.22.0/bin/node'),version:'v24.22.0'}}),
  });
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].args.slice(-2),['bin/cua.mjs','install']);
  assert.equal(calls[0].env.CUA_HOME,prepared.home);
  assert.equal(calls[0].env.CUA_NODE,undefined);
  assert.equal(calls[0].env.CUA_NATIVE_ENGINE,'vendor', 'preparation never builds its own engine, even after the default flips');
  assert.equal(calls[0].env.HOME,`${prepared.home}.home`, 'the user HOME is the cua home\'s sibling');
  assert.deepEqual(prepared.xSession,xSession);
  assert.equal(prepared.nodeMode,'managed');
  assert.ok(existsSync(prepared.home));
  assert.throws(() => cleanupNative({...prepared,token:'wrong'},{directoryRoot:parent}),/ownership/);
  cleanupNative(prepared,{directoryRoot:parent});
  assert.equal(existsSync(prepared.home),false);
});

test('preparation rejects a fallback Node and removes the failed install', t => {
  const parent=mkdtempSync(join(tmpdir(),'native-prepare-test-'));t.after(()=>rmSync(parent,{recursive:true,force:true}));
  let installed;
  assert.throws(()=>prepareNative({device:'cua-bench'},{directoryRoot:parent,tempRoot:'/different-tmp',desktop:()=>xSession,run:(_e,_a,o)=>{installed=o.env.CUA_HOME;},inspect:({source})=>({home:source,ownNode:{path:'/usr/bin/node',version:'v24.22.0'}})}),/managed Node/);
  assert.equal(existsSync(installed),false);
});

// Execute the generated shell with a harmless node double. This catches quoting, env-option ordering and inheritance.
test('serve and gedit use the recorded X session, not an account-cookie guess', () => {
  const options={device:'cua-bench',checkout:'/tmp',home:'/scratch/cua',userHome:'/scratch/cua/home',host:'cua',platform:'linux',display:':7',xSession};
  const script=serveCommand(options).args.at(-1);
  const shell=script.replace('exec env ','env ').replace(/node .*$/, 'sh -c \'printf "%s|%s|%s|%s" "$DISPLAY" "$XAUTHORITY" "$DBUS_SESSION_BUS_ADDRESS" "${CUA_NODE-unset}"\'');
  const result=execFileSync('/bin/sh',['-c',shell],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:'/wrong',CUA_NODE:'/foreign/node'}});
  assert.equal(result,':7|/run/user/1234/x-cookie|unix:path=/run/user/1234/bus|unset');
  // Parse/evaluate the generated gedit program with imports replaced by boundary doubles; no GUI is launched.
  const command=spawnGeditScript({display:':7',role:'scratch',xSession});
  const source=execFileSync('/bin/sh',['-c',`node() { printf '%s' "$3"; }; ${command}`],{encoding:'utf8'});
  let captured;
  const stripped=source.replace(/^import .*;$/gm,'');
  new Function('spawn','randomBytes','mkdtempSync','writeFileSync','homedir','join','process','console',stripped)(
    (_exe,_args,opts)=>{captured=opts;return {once(){},pid:42,unref(){}};},()=>({toString:()=> 'abcdef'}),()=>'/tmp/cua-native-baseline-AbCdEf',()=>{},()=>'/wrong',join,{env:{HOME:'/wrong',XAUTHORITY:'/wrong/cookie'}},{log(){}});
  for(const [key,value] of Object.entries(xSession))assert.equal(captured.env[key],value);
});

test('an authless cloud X session cannot inherit a login cookie or bus when opening gedit', () => {
  const command=spawnGeditScript({display:':0',role:'scratch',xSession:{DISPLAY:':0'},userHome:'/scratch/home'});
  const source=execFileSync('/bin/sh',['-c',`node() { printf '%s' "$3"; }; ${command}`],{encoding:'utf8'});
  let captured;
  new Function('spawn','randomBytes','mkdtempSync','writeFileSync','homedir','join','process','console',source.replace(/^import .*;$/gm,''))(
    (_exe,_args,opts)=>{captured=opts.env;return {once(){},pid:42,unref(){}};},()=>({toString:()=> 'abcdef'}),()=>'/tmp/cua-native-baseline-AbCdEf',()=>{},()=>'/wrong',join,{env:{HOME:'/wrong',XAUTHORITY:'/wrong/cookie',DBUS_SESSION_BUS_ADDRESS:'wrong-bus',PATH:'/usr/bin'}},{log(){}});
  assert.equal(captured.XAUTHORITY,undefined);
  assert.equal(captured.DBUS_SESSION_BUS_ADDRESS,undefined);
  assert.equal(captured.HOME,'/scratch/home');
});

test('different SSH locales cannot change gedit or serve locale, including the legacy VM launch form', () => {
  const ambientLocales = [
    {LANG:'en_US.UTF-8',LC_ALL:'en_US.UTF-8',LC_CTYPE:'en_US.UTF-8',LC_MESSAGES:'en_US.UTF-8',LANGUAGE:'en_US'},
    {LANG:'fr_FR.UTF-8',LC_ALL:'fr_FR.UTF-8',LC_CTYPE:'fr_FR.UTF-8',LC_MESSAGES:'fr_FR.UTF-8',LANGUAGE:'fr_FR'},
  ];
  for (const ambient of ambientLocales) {
    for (const session of [undefined,xSession]) {
      const command=spawnGeditScript({display:':7',role:'scratch',xSession:session,userHome:'/scratch/home'});
      const source=execFileSync('/bin/sh',['-c',`node() { printf '%s' "$3"; }; ${command}`],{encoding:'utf8'});
      let captured;
      new Function('spawn','randomBytes','mkdtempSync','writeFileSync','homedir','join','process','console',source.replace(/^import .*;$/gm,''))(
        (_exe,_args,opts)=>{captured=opts.env;return {once(){},pid:42,unref(){}};},()=>({toString:()=> 'abcdef'}),()=>'/tmp/cua-native-baseline-AbCdEf',()=>{},()=>'/account',join,{env:{PATH:'/usr/bin',HOME:'/account',...ambient}},{log(){}});
      const locale=Object.fromEntries(Object.entries(captured).filter(([key])=>key==='LANG'||key==='LANGUAGE'||key.startsWith('LC_')));
      assert.deepEqual(locale,{LANG:'C.UTF-8'});
    }
    const script=serveCommand({device:'cua-bench',checkout:'/tmp',home:'/scratch',userHome:'/scratch/home',host:'cua',platform:'linux',display:':7',xSession}).args.at(-1);
    const shell=script.replace('exec env ','env ').replace(/node .*$/, 'sh -c \'printf "%s|%s|%s|%s|%s" "$LANG" "${LC_ALL-unset}" "${LC_CTYPE-unset}" "${LC_MESSAGES-unset}" "${LANGUAGE-unset}"\'');
    assert.equal(execFileSync('/bin/sh',['-c',shell],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:'/account',...ambient}}),'C.UTF-8|unset|unset|unset|unset');
  }
});

// The mini's native runs reuse one approved runtime copy (the spec's Decision Log, "native runs on the mini"): a new
// on-disk copy of the native helper raises a one-time screen-capture confirmation, so no run installs one.
test('an approved runtime is reused in place: no install, its state/ and run/ stashed and restored, the real HOME', async t => {
  const {mkdirSync, writeFileSync, readFileSync, readdirSync, realpathSync} = await import('node:fs');
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'native-prepare-test-')));
  t.after(() => rmSync(parent, {recursive:true, force:true}));
  const approved = join(parent, 'approved'), root = join(parent, 'scratch');
  mkdirSync(join(approved, 'state', 'codex'), {recursive: true});
  writeFileSync(join(approved, 'state', 'codex', 'kept'), 'task 1');
  mkdirSync(join(approved, 'run'));
  const helper = join(approved, 'runtimes', 'r1', 'Sky.app');
  const locate = home => ({release: 'r1', root: join(home, 'runtimes', 'r1'), helper: join(home, 'runtimes', 'r1', 'Sky.app'), executable: join(home, 'runtimes', 'r1', 'Sky.app', 'Contents', 'MacOS', 'Sky'), pinned: 'r1'});
  const calls = [];
  const options = {directoryRoot: root, tempRoot: '/different-tmp', userHomeDir: '/Users/owner', locate, usersOf: () => [],
    run: (...a) => { calls.push(a); return ''; }, inspect: ({source}) => ({home: source, ownNode: {path: join(source, 'node/24.22.0/bin/node'), version: 'v24.22.0'}})};
  const prepared = prepareNative({device: 'mini', approvedHome: approved}, options);
  assert.equal(calls.length, 0, 'nothing is installed');
  assert.equal(prepared.home, approved);
  assert.equal(prepared.userHome, '/Users/owner');
  assert.equal(prepared.configHome, join(prepared.scratch, 'config'));
  assert.deepEqual(prepared.runtimeReuse, {approvedHome: approved, release: 'r1', runtimeRoot: join(approved, 'runtimes', 'r1'), helper,
    executable: join(helper, 'Contents', 'MacOS', 'Sky'), reason: 'a new on-disk copy of the native helper raises a one-time screen-capture confirmation; the approved copy is reused'});
  assert.deepEqual(readdirSync(approved), ['.cua-native-admission'], 'state/ and run/ are stashed away; the run holds the admission');
  mkdirSync(join(approved, 'state', 'handshake'), {recursive: true});   // what the run writes
  mkdirSync(join(approved, 'run', 'session'), {recursive: true});
  assert.throws(() => cleanupNative({...prepared, token: 'wrong'}, {directoryRoot: root, usersOf: () => []}), /ownership/);
  assert.deepEqual(cleanupNative(prepared, {directoryRoot: root, usersOf: () => []}), {removed: true, restored: ['state', 'run'], helpersStopped: []});
  assert.equal(readFileSync(join(approved, 'state', 'codex', 'kept'), 'utf8'), 'task 1');
  assert.deepEqual(readdirSync(join(approved, 'state')), ['codex']);
  assert.deepEqual(readdirSync(join(approved, 'run')), []);
  assert.equal(existsSync(prepared.scratch), false);
});

test('an approved runtime is refused when it is not the pinned release, is in use, or the device is not macOS', async t => {
  const {mkdirSync} = await import('node:fs');
  const parent = mkdtempSync(join(tmpdir(), 'native-prepare-test-'));
  t.after(() => rmSync(parent, {recursive:true, force:true}));
  const approved = join(parent, 'approved'), root = join(parent, 'scratch');
  mkdirSync(join(approved, 'state'), {recursive: true});
  const base = {directoryRoot: root, tempRoot: '/different-tmp', userHomeDir: '/Users/owner', usersOf: () => [], run: () => { throw new Error('installed'); },
    inspect: ({source}) => ({home: source, ownNode: {path: join(source, 'node/24.22.0/bin/node'), version: 'v24.22.0'}})};
  const locate = pinned => home => ({release: 'r1', root: join(home, 'runtimes', 'r1'), helper: join(home, 'runtimes', 'r1', 'Sky.app'), pinned});
  assert.throws(() => prepareNative({device: 'mini', approvedHome: approved}, {...base, locate: locate('r2')}), /not the pinned release r2/);
  assert.throws(() => prepareNative({device: 'mini', approvedHome: approved}, {...base, locate: locate('r1'), usersOf: () => [4242]}), /in use by 1 process/);
  assert.throws(() => prepareNative({device: 'cua-bench', approvedHome: approved}, {...base, locate: locate('r1'), desktop: () => xSession}), /macOS/);
  assert.equal(existsSync(join(approved, 'state')), true, 'nothing moved on a refusal');
});

test('a serve of a reused runtime gets the real HOME and the run\'s own XDG_CONFIG_HOME', () => {
  const options = {device: 'mini', checkout: '/tmp', home: '/Users/owner/cua-115/home', userHome: '/Users/owner', configHome: '/scratch/run-1/config', host: 'vendor', platform: 'darwin'};
  const script = serveCommand(options).args.at(-1);
  const shell = script.replace('exec env ', 'env ').replace(/node .*$/, 'sh -c \'printf "%s|%s|%s" "$HOME" "$XDG_CONFIG_HOME" "$CUA_HOME"\'');
  assert.equal(execFileSync('/bin/sh', ['-c', shell], {encoding: 'utf8', env: {PATH: process.env.PATH, HOME: '/wrong'}}), '/Users/owner|/scratch/run-1/config|/Users/owner/cua-115/home');
});

test('the in-use check sees other processes naming the home, never the preparing process or its callers', async t => {
  const {spawn, execFileSync: run} = await import('node:child_process');
  const {mkdtempSync: mk, realpathSync} = await import('node:fs');
  const home = realpathSync(mk(join(tmpdir(), 'native-inuse-test-')));
  t.after(() => rmSync(home, {recursive: true, force: true}));
  const module = new URL('../../scripts/native-baseline/prepare.mjs', import.meta.url).href;
  const probe = `import {processesUsing} from ${JSON.stringify(module)}; console.log(JSON.stringify(processesUsing(${JSON.stringify(home)})));`;
  // The preparing process and its shell both name the home on their command lines, as the ssh preparation does.
  assert.deepEqual(JSON.parse(run('/bin/sh', ['-c', `node --input-type=module -e '${probe}' ${home}`], {encoding: 'utf8'})), []);
  const other = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)', home], {stdio: 'ignore'});   // another process naming the home
  t.after(() => other.kill());
  await new Promise(r => setTimeout(r, 200));
  assert.deepEqual(JSON.parse(run('/bin/sh', ['-c', `node --input-type=module -e '${probe}' ${home}`], {encoding: 'utf8'})), [other.pid]);
});

test('a mini run\'s serves carry a TMPDIR of the run\'s own (0700), the witness of which run a helper belongs to; Linux runs do not', async t => {
  const {statSync, realpathSync} = await import('node:fs');
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'native-prepare-test-')));
  t.after(() => rmSync(parent, {recursive: true, force: true}));
  const inspect = ({source}) => ({home: source, ownNode: {path: join(source, 'node/24.22.0/bin/node'), version: 'v24.22.0'}});
  const mini = prepareNative({device: 'mini'}, {directoryRoot: join(parent, 'm'), tempRoot: '/different-tmp', run: () => '', inspect});
  assert.equal(mini.tmpdir, join(mini.home, 'harness-tmp'));
  assert.equal(statSync(mini.tmpdir).mode & 0o777, 0o700);
  const linux = prepareNative({device: 'cua-bench'}, {directoryRoot: join(parent, 'l'), tempRoot: '/different-tmp', desktop: () => xSession, run: () => '', inspect});
  assert.equal(linux.tmpdir, undefined);
  const script = serveCommand({device: 'mini', checkout: '/tmp', home: mini.home, userHome: mini.userHome, tmpdir: mini.tmpdir, host: 'cua', platform: 'darwin', surface: 'browser'}).args.at(-1);
  const shell = script.replace('exec env ', 'env ').replace(/node .*$/, 'sh -c \'printf "%s" "$TMPDIR"\'');
  assert.equal(execFileSync('/bin/sh', ['-c', shell], {encoding: 'utf8', env: {PATH: process.env.PATH, TMPDIR: '/caller-tmp'}}), mini.tmpdir);
});
