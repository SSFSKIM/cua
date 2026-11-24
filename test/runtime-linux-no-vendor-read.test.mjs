// "No vendor tree read" (#171 M6a; the pre-flight's §3.5): with any engine selection but `vendor`, a Linux session's
// open and launch open, stat, list and run nothing under <home>/runtimes/, and name no such path to the runtime. Shown
// with the tree present, not only with it gone: a recorder over node:fs (its synchronous, callback and promise
// functions) and node:child_process watches resolveRuntime, replHostFor, buildLaunch and assertSandboxFits for a default
// computer session and a browser-only one, in a home whose vendor tree is installed and whose PATH leads to the vendor
// tree's bin. Its negative control is the Node lookup this cua still runs on macOS (ownHostNode's darwin branch, the
// Linux one before M6a), which must be recorded stat-ing the vendor's bin/node. The traced live cell (§5.2, E1) is the
// check on reads by any route the recorder does not wrap. The recorder (./helpers/vendor-tree-recorder.mjs) notes each
// path as the call reaches it, through links and PATH, and also watches a real `cua serve` from its first line.
import './helpers/scratch-home.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {buildLaunch, nativeEngineFor, ownHostNode, replHostFor, SKY_SERVICE, BROWSER_SERVICE} from '../src/runtime/launch.mjs';
import {linuxRelease, loadLinuxRuntime, resolveRuntime} from '../src/runtime/manifest.mjs';
import {assertSandboxConfines, assertSandboxFits} from '../src/runtime/sandbox.mjs';
import {useRuntime} from '../src/runtime/install.mjs';
import {inspectRuntime} from '../src/runtime/doctor.mjs';
import {helperFor} from '../src/sandbox/linux.mjs';
import {projectRoot} from '../src/secrets/project.mjs';
import {MIN_ENGINE_VERSION} from '../src/services/engine/linux/client.mjs';
import {forgeActiveRuntime, scratchUserHome, shortScratch} from './fixtures/runtime-fixture.mjs';
import {fakeInstalledEngine, fakeManagedNode, fakeModuleTree} from './fixtures/own-linux-runtime.mjs';
import {inVendorTree, recorded, startRecording, within} from './helpers/vendor-tree-recorder.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));

const LINUX = {platform: 'linux', arch: 'x64'};
const SESSION = '6f1c2d3e-0000-4000-8000-0000000006a3';

// A home as `cua install` leaves it after M6a, the vendor tree kept beside it: the module tree, the managed Node, an
// engine recorded at the minimum, and the vendor's release with an executable bin/node.
function homeWithVendorTree(t) {
  const s = shortScratch();
  t.after(s.cleanup);
  const home = fs.realpathSync(s.dir);
  fakeModuleTree(home, LINUX);
  fakeManagedNode(home, LINUX);
  fakeInstalledEngine(home, MIN_ENGINE_VERSION);
  const {root} = forgeActiveRuntime(home, {node: '#!/bin/sh\necho v24.21.0\n'}, {host: LINUX, ownRuntime: false});
  const vendorNode = join(root, 'cua_node', 'bin', 'node');
  assert.ok(fs.statSync(vendorNode).mode & 0o111, 'the vendor tree holds an executable Node');
  const user = scratchUserHome(t);
  return {home, runtimes: join(home, 'runtimes'), vendorNode, ambient: {HOME: user, USER: 'u', PATH: `${dirname(vendorNode)}:/usr/bin:/bin`, DISPLAY: ':0', XDG_RUNTIME_DIR: '/run/user/1000'}};
}

// A session's open and launch, as a connection makes them (src/mcp/connection.mjs), with the platform's default engine.
function session({home, ambient}, surfaces) {
  const runtime = resolveRuntime({home, host: LINUX});
  const replHost = replHostFor({platform: 'linux', arch: LINUX.arch, surfaces, ambient, home});
  const services = Object.assign({}, ...surfaces.map(s => (s === 'computer' ? {sky: SKY_SERVICE} : {browser: BROWSER_SERVICE})));
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient, surfaces, replHost, services, sandbox: 'scoped'});
  assertSandboxFits('scoped', launch);
  return {runtime, replHost, launch};
}

for (const surfaces of [['computer'], ['browser']]) {
  test(`a Linux ${surfaces[0] === 'computer' ? 'computer session on cua\'s engine' : 'browser-only session'} opens and launches with nothing under runtimes/ opened, stat-ed, listed or run`, t => {
    const h = homeWithVendorTree(t);
    let opened;
    const seen = recorded(() => { opened = session(h, surfaces); });
    assert.ok(seen.length > 0, 'the recorder saw the open\'s own reads');
    assert.ok(seen.some(({path}) => within(path, join(h.home, 'modules'))), 'it saw the module tree\'s check');
    assert.deepEqual(inVendorTree(seen, h.home), [], 'nothing under runtimes/');
    // and the launch names no such path to the runtime: no value of its environment, no trusted code path, no root
    const {launch} = opened;
    for (const [name, value] of Object.entries(launch.env)) assert.ok(!value.includes(h.runtimes), `${name} names the vendor tree: ${value}`);
    for (const key of ['cwd', 'sessionTmp', 'kernelDir', 'managedNodeRoot', 'stagingRoot', 'sandboxHelperRoot', 'engineRoot', 'modulesRoot', 'command'])
      assert.ok(!String(launch[key]).includes(h.runtimes), key);
    assert.equal(launch.env.CUA_REPL_NODE_MODULE_DIRS, opened.runtime.paths.moduleDir, 'cells import from the ModuleTree');
    assert.ok(within(launch.env.CUA_REPL_NODE_MODULE_DIRS, join(h.home, 'modules')));
    assert.equal(launch.command, join(h.home, 'node', opened.runtime.manifest.parts.node.version, 'bin', 'node'), 'the managed Node, not the vendor\'s on PATH');
    if (surfaces.includes('computer')) assert.equal(launch.env.CUA_ENGINE_BIN, join(h.home, 'engine', 'linux', 'cua-engine'));
  });
}

test('the negative control: the Node lookup this cua still runs on macOS, the Linux one before M6a, is recorded stat-ing the vendor\'s bin/node', t => {
  const h = homeWithVendorTree(t);
  const seen = recorded(() => ownHostNode({ambient: h.ambient, home: h.home, platform: 'darwin'}));
  assert.ok(seen.some(({call, path}) => call === 'statSync' && path === h.vendorNode), JSON.stringify(inVendorTree(seen, h.home)));
});

// ---- the overrides and the managed parts, each a way into the tree (#171 M6a, task 149's fix wave 1) ----

// Runs `fn` under the recorder, expecting it to throw `code` -> {error, inTree: the calls seen naming a path there}.
function refusedWithoutReading(h, fn, code) {
  let error;
  const seen = recorded(() => { try { fn(); } catch (caught) { error = caught; } });
  assert.equal(error?.code, code, error?.message ?? 'not refused');
  return {error, inTree: inVendorTree(seen, h.home)};
}
const selectEngine = (h, env) => nativeEngineFor({env: {HOME: h.ambient.HOME, ...env}, platform: 'linux', arch: LINUX.arch, home: h.home});
const linuxNode = (h, ambient, versionOf = () => 'v24.22.0') => ownHostNode({ambient, home: h.home, platform: 'linux', arch: LINUX.arch, versionOf});

// A path whose `..` comes after a link into the tree: spelled outside it, resolved by the kernel inside it. The guard
// walks the path as the kernel does, so it sees the link's target before it climbs.
test('an override whose `..` follows a link into the tree is refused, nothing there stat-ed or probed: CUA_LINUX_ENGINE_BIN and CUA_NODE', t => {
  const h = homeWithVendorTree(t);
  const vendorBin = dirname(h.vendorNode);
  fs.writeFileSync(join(vendorBin, 'cua-engine'), '#!/bin/sh\necho "cua-engine 9.9.9 (vendor)"\n', {mode: 0o755});
  fs.mkdirSync(join(vendorBin, 'deeper'));
  const outside = join(h.home, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(join(vendorBin, 'deeper'), join(outside, 'into'));
  for (const env of [{CUA_NATIVE_ENGINE: 'cua'}, {}]) {
    const {error, inTree} = refusedWithoutReading(h, () => selectEngine(h, {...env, CUA_LINUX_ENGINE_BIN: `${outside}/into/../cua-engine`}), 'invalid_setting');
    assert.deepEqual(inTree, [], error.message);
    assert.match(error.message, /vendor's tree/);
  }
  const probed = [];
  const probe = path => { probed.push(path); return 'v24.21.0'; };
  const {error, inTree} = refusedWithoutReading(h, () => linuxNode(h, {CUA_NODE: `${outside}/into/../node`}, probe), 'invalid_setting');
  assert.deepEqual(inTree, [], error.message);
  // a relative link target that climbs through a link into the tree
  fs.symlinkSync('into/../node', join(outside, 'relative'));
  assert.deepEqual(refusedWithoutReading(h, () => linuxNode(h, {CUA_NODE: join(outside, 'relative')}, probe), 'invalid_setting').inTree, []);
  assert.deepEqual(probed, [], 'the version probe was never handed a path');
});

// A link whose relative target climbs out of another link: the kernel climbs from where that link leads, outside the
// tree, while a lexical reading of the same target lands inside it. Selection, the launch and the scoped preflight
// must all follow the kernel's resolution, which selection approved, and touch nothing in the tree (fix wave 2).
function lexicalTrap(h, name) {
  const outside = join(h.home, 'outside');
  fs.mkdirSync(join(outside, 'deep', 'x'), {recursive: true});
  fs.symlinkSync(join(outside, 'deep', 'x'), join(outside, 'd'));
  const engine = join(outside, 'runtimes', 'r', 'cua-engine');   // outside's own runtimes/, not the home's tree
  fs.mkdirSync(dirname(engine), {recursive: true});
  fs.writeFileSync(engine, `#!/bin/sh\necho "cua-engine ${MIN_ENGINE_VERSION} (0123456789ab)"\n`, {mode: 0o755});
  // from outside/: d/../.. is outside/ by the kernel (d is outside/deep/x), and the home itself by a lexical reading
  fs.symlinkSync('d/../../runtimes/r/cua-engine', join(outside, name));
  // the kernel's answer (realpath(3)); Node's own realpathSync reads `..` in a link target lexically, the trap itself
  assert.equal(fs.realpathSync.native(join(outside, name)), engine, 'the kernel resolves it outside the tree');
  return {link: join(outside, name), engine};
}

test('an accepted CUA_LINUX_ENGINE_BIN through a link a lexical reading would place in the tree: selection, launch and the scoped preflight touch nothing there', t => {
  const h = homeWithVendorTree(t);
  const {link, engine} = lexicalTrap(h, 'engine-link');
  const ambient = {...h.ambient, CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: link};
  let opened;
  const seen = recorded(() => { opened = session({...h, ambient}, ['computer']); });
  assert.deepEqual(inVendorTree(seen, h.home), []);
  assert.equal(opened.launch.env.CUA_ENGINE_BIN, engine, 'the launch runs the file selection approved');
});

test('an installed engine reached through such a link: its guarded resolution is what is checked, run and protected, and nothing in the tree is touched', t => {
  const h = homeWithVendorTree(t);
  const {engine} = lexicalTrap(h, 'unused');
  // the recorded engine lives outside the tree; the home's engine path is a link with the same climbing target
  fs.copyFileSync(join(h.home, 'engine', 'linux', 'cua-engine'), engine);
  fs.rmSync(join(h.home, 'engine', 'linux', 'cua-engine'));
  fs.symlinkSync('../../outside/d/../../runtimes/r/cua-engine', join(h.home, 'engine', 'linux', 'cua-engine'));   // spelled, not path.join-ed: join would read the `..` lexically
  assert.equal(fs.realpathSync.native(join(h.home, 'engine', 'linux', 'cua-engine')), engine);
  let opened;
  const seen = recorded(() => { opened = session(h, ['computer']); });
  assert.deepEqual(inVendorTree(seen, h.home), []);
  assert.equal(opened.launch.env.CUA_ENGINE_BIN, engine);
});

test('the managed Node\'s pointer or install record linked into the tree: refused, nothing there read', t => {
  for (const file of ['pointer', 'record']) {
    const h = homeWithVendorTree(t);
    const {version} = JSON.parse(fs.readFileSync(join(h.home, 'node', 'current.json'), 'utf8'));
    const own = file === 'pointer' ? join(h.home, 'node', 'current.json') : join(h.home, 'node', version, 'install.json');
    const planted = join(h.runtimes, 'planted.json');
    fs.copyFileSync(own, planted);
    fs.rmSync(own);
    fs.symlinkSync(planted, own);
    const {error, inTree} = refusedWithoutReading(h, () => linuxNode(h, {}), 'runtime_not_installed');
    assert.deepEqual(inTree, [], `${file}: ${error.message}`);
    assert.match(error.message, /vendor's tree/, file);
  }
});

// The installer would take the place such a link leads to as the engine's, so the remedy names the link to move aside
// first (task 156), and the installer refuses it the same way (test/linux-engine.test.mjs).
test('the installed engine, its install record or its directory linked into the tree: refused, nothing there read, the link named to move aside before the installer', t => {
  for (const name of ['install.json', 'cua-engine', '']) {
    const h = homeWithVendorTree(t);
    const own = join(h.home, 'engine', 'linux', name);
    const planted = join(h.runtimes, `planted-${name || 'linux'}`);
    fs.cpSync(own, planted, {recursive: true});
    fs.rmSync(own, {recursive: true});
    fs.symlinkSync(planted, own.replace(/\/$/, ''));
    for (const env of [{}, {CUA_NATIVE_ENGINE: 'cua'}]) {
      const {error, inTree} = refusedWithoutReading(h, () => selectEngine(h, env), 'engine_not_installed');
      assert.deepEqual(inTree, [], error.message);
      assert.match(error.message, /vendor's tree/);
      assert.ok(error.message.includes(`: move ${own.replace(/\/$/, '')} aside, then run \`node `), `${name || 'the directory'}: ${error.message}`);
    }
  }
});

// ---- the whole-branch review's findings (#171 M6a, task 156) ----

// Runs the async `fn` recorded -> {error, seen}.
async function recordedAsync(fn) {
  const recording = startRecording();
  let error, seen;
  try { await fn(); } catch (caught) { error = caught; } finally { seen = recording.stop(); }
  return {error, seen};
}

// The vendor's tree moved to another volume, <home>/runtimes left as a link to it.
function relocateTree(t, h) {
  const volume = shortScratch('cua-volume-');
  t.after(volume.cleanup);
  const physical = join(fs.realpathSync(volume.dir), 'vendor-runtimes');
  fs.cpSync(h.runtimes, physical, {recursive: true});
  fs.rmSync(h.runtimes, {recursive: true});
  fs.symlinkSync(physical, h.runtimes);
  return {physical, vendorNode: join(physical, relative(h.runtimes, h.vendorNode))};
}

test('a vendor tree relocated behind a runtimes link: CUA_NODE and CUA_LINUX_ENGINE_BIN naming its files by their physical path are refused, nothing there touched', t => {
  const h = homeWithVendorTree(t);
  const {vendorNode} = relocateTree(t, h);
  const engine = join(dirname(vendorNode), 'cua-engine');
  fs.writeFileSync(engine, `#!/bin/sh\necho "cua-engine ${MIN_ENGINE_VERSION} (0123456789ab)"\n`, {mode: 0o755});
  const probed = [];
  const node = refusedWithoutReading(h, () => linuxNode(h, {CUA_NODE: vendorNode}, path => { probed.push(path); return 'v24.22.0'; }), 'invalid_setting');
  assert.deepEqual(node.inTree, [], node.error.message);
  assert.match(node.error.message, /vendor's tree/);
  assert.deepEqual(probed, [], 'the version probe was never handed a path');
  for (const env of [{CUA_NATIVE_ENGINE: 'cua'}, {}]) {
    const selected = refusedWithoutReading(h, () => selectEngine(h, {...env, CUA_LINUX_ENGINE_BIN: engine}), 'invalid_setting');
    assert.deepEqual(selected.inTree, [], selected.error.message);
  }
  // and the ordinary sessions, PATH leading to the relocated bin, open with nothing of it touched
  const ambient = {...h.ambient, PATH: `${dirname(vendorNode)}:/usr/bin:/bin`};
  for (const surfaces of [['computer'], ['browser']]) assert.deepEqual(inVendorTree(recorded(() => session({...h, ambient}, surfaces)), h.home), [], surfaces[0]);
});

// The pinned helper's installed path a link into the tree: its bytes are neither read nor run, by the connection's
// preflight or by doctor's row, and the remedy names the link to move aside.
test('the sandbox helper\'s installed path linked into the tree: the preflight refuses it, nothing there read, and doctor says the same', async t => {
  const h = homeWithVendorTree(t);
  const {path} = helperFor({home: h.home, arch: LINUX.arch});
  const planted = join(h.runtimes, 'codex-linux-sandbox');
  fs.writeFileSync(planted, '#!/bin/sh\nexit 0\n', {mode: 0o755});
  fs.mkdirSync(dirname(path), {recursive: true});
  fs.symlinkSync(planted, path);
  for (const surfaces of [['browser'], ['computer']]) {
    const {error, seen} = await recordedAsync(async () => {
      const {launch} = session(h, surfaces);
      assert.ok(!Object.values(launch.env).some(value => value.includes(h.runtimes)), 'the launch names no path in the tree');
      await assertSandboxConfines('scoped', {platform: 'linux', launch, probe: async () => ({status: 'pass'})});
    });
    assert.equal(error?.code, 'sandbox_unavailable', error?.message ?? 'not refused');
    assert.deepEqual(inVendorTree(seen, h.home), [], surfaces[0]);
    assert.match(error.message, /vendor's tree/);
    assert.ok(error.hint.startsWith(`move ${path} aside, then`), error.hint);
  }
  const {checks} = await inspectRuntime({home: h.home, env: {HOME: h.ambient.HOME, DISPLAY: ':9'}, host: LINUX, verifySignatures: () => assert.fail('codesign'),
    inspectHelper: () => assert.fail('the native socket helper'), inspectSecrets: async () => ({dir: '/nowhere', exists: false}),
    inspectLinux: async () => [], inspectChrome: async () => [], inspectAgent: async () => [], readLinuxCapabilities: async () => null});
  const row = checks.find(check => check.name === 'sandbox.launcher');
  assert.equal(row.status, 'fail', row.detail);
  assert.match(row.detail, new RegExp(`vendor's tree.*move ${path} aside`));
});

// `cua serve`, the real stdio entry point, with the vendor tree's bin first on PATH and a git there: from its first line
// to the end of a browser-only session's open, nothing under runtimes/ is opened, stat-ed, listed or run. The project
// lookup for the secret store runs git (src/secrets/project.mjs), which that PATH would find in the tree.
test('a real cua serve with the vendor tree\'s bin first on PATH runs nothing there: the project lookup\'s git, the open', {skip: process.platform !== 'linux' && 'cua serve takes its Linux branch only on Linux'}, async t => {
  const h = homeWithVendorTree(t);
  fs.writeFileSync(join(dirname(h.vendorNode), 'git'), '#!/bin/sh\nexit 1\n', {mode: 0o755});
  const out = join(h.home, 'recorded.json');
  const preload = pathToFileURL(join(REPO, 'test', 'helpers', 'vendor-tree-preload.mjs')).href;
  const child = spawn(process.execPath, ['--import', preload, join(REPO, 'bin', 'cua.mjs'), 'serve'], {
    cwd: REPO, stdio: ['pipe', 'pipe', 'pipe'], env: {...h.ambient, CUA_HOME: h.home, CUA_SHIM_SURFACES: 'browser', CUA_RECORDED_OUT: out}});
  let stdout = '', stderr = '', exited = false;
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exit = new Promise(resolve => child.on('exit', () => { exited = true; resolve(); }));
  child.stdin.on('error', () => {});
  child.stdin.write(`${JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'no-vendor-read', version: '0'}}})}\n`);
  // The home holds no sandbox helper, so the open ends at the preflight, which refuses it: the whole open
  // before it, the project lookup first, is what the recorder watches.
  for (let i = 0; i < 400 && !exited && !stdout.includes('"id":1'); i++) await new Promise(r => setTimeout(r, 25));
  child.stdin.end();
  await exit;
  assert.match(stdout + stderr, /sandbox_unavailable|"id":1/, 'serve reached the preflight');
  const seen = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.ok(seen.some(({path}) => within(path, join(h.home, 'modules'))), 'the recorder saw the open');
  assert.ok(seen.some(({call}) => call === 'execFileSync' || call === 'spawnSync'), 'and the project lookup');
  assert.deepEqual(inVendorTree(seen, h.home), []);
});

test('the project lookup on Linux skips a PATH entry in the vendor\'s tree, as spelled or by its real path, and asks a git outside it', t => {
  const h = homeWithVendorTree(t);
  const bin = dirname(h.vendorNode);
  fs.writeFileSync(join(bin, 'git'), '#!/bin/sh\nexit 1\n', {mode: 0o755});
  const outside = join(h.home, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(bin, join(outside, 'bin'));   // the same directory, spelled outside the tree
  const hostGit = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {cwd: REPO, encoding: 'utf8'});
  for (const PATH of [`${bin}:/usr/bin:/bin`, `${join(outside, 'bin')}:/usr/bin:/bin`]) {
    let root;
    const seen = recorded(() => { root = projectRoot(REPO, {env: {PATH}, platform: 'linux', home: h.home}); });
    assert.deepEqual(inVendorTree(seen, h.home), [], PATH);
    if (hostGit.status === 0) assert.equal(root, dirname(hostGit.stdout.trim()), 'a git outside the tree answered');
  }
});

// `cua runtime use` on Linux reads and writes the pointer only where install would: a link or a FIFO at current.json is
// named to be moved aside, never followed, read or blocked on.
const RELEASE = linuxRelease(loadLinuxRuntime({host: LINUX}), LINUX.arch);

test('cua runtime use on Linux: a current.json that is a link into the tree is refused, nothing there read, the link left', async t => {
  const h = homeWithVendorTree(t);
  const pointer = join(h.home, 'current.json');
  const planted = join(h.runtimes, 'current.json');
  fs.writeFileSync(planted, JSON.stringify({schema: 1, release: RELEASE}));
  fs.rmSync(pointer);
  fs.symlinkSync(planted, pointer);
  const {error, seen} = await recordedAsync(() => useRuntime({home: h.home, release: RELEASE, host: LINUX}));
  assert.equal(error?.code, 'target_occupied', error?.message ?? 'not refused');
  assert.ok(error.hint.startsWith(`move ${pointer} aside, then`), error.hint);
  assert.deepEqual(inVendorTree(seen, h.home), []);
  assert.equal(fs.readlinkSync(pointer), planted);
});

// A vendor pin that does not parse is the vendor's lane's problem: `runtime use` of this cua's own release resolves the
// derived name first and reads no vendor pin, and only a different name is classified against them.
test('cua runtime use on Linux: a malformed vendor pin does not block this cua\'s own release; another name is unknown_release, no pin read (#171 M6b)', async t => {
  const h = homeWithVendorTree(t);
  const pins = fileURLToPath(new URL('../runtime/releases/', import.meta.url));
  const readFileSync = fs.readFileSync;
  fs.readFileSync = function (path, ...rest) {
    return typeof path === 'string' && `${dirname(path)}/` === pins && path.endsWith('.json') ? '{"malformed": ' : readFileSync.call(this, path, ...rest);
  };
  syncBuiltinESMExports();
  try {
    const used = await useRuntime({home: h.home, release: RELEASE, host: LINUX});
    assert.equal(used.release, RELEASE);
    await assert.rejects(useRuntime({home: h.home, release: '26.928.40906-linux-x64', host: LINUX}), {code: 'unknown_release'});
  } finally {
    fs.readFileSync = readFileSync;
    syncBuiltinESMExports();
  }
});

test('cua runtime use on Linux: a FIFO at current.json is refused at once, never opened', {skip: spawnSync('mkfifo', ['--help']).error && 'no mkfifo'}, t => {
  const h = homeWithVendorTree(t);
  fs.rmSync(join(h.home, 'current.json'));
  assert.equal(spawnSync('mkfifo', [join(h.home, 'current.json')]).status, 0);
  // In a child, so a FIFO opened for reading blocks it and not this test's process.
  const script = `import {useRuntime} from ${JSON.stringify(pathToFileURL(join(REPO, 'src', 'runtime', 'install.mjs')).href)};
try { await useRuntime({home: ${JSON.stringify(h.home)}, release: ${JSON.stringify(RELEASE)}, host: ${JSON.stringify(LINUX)}}); console.log('used'); }
catch (error) { console.log(error.code); }`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {encoding: 'utf8', timeout: 10_000, env: {...process.env, HOME: h.ambient.HOME}});
  assert.equal(run.signal, null, 'it did not block on the FIFO');
  assert.equal(run.stdout.trim(), 'target_occupied', run.stderr);
});

// ---- the confirm-only review's findings (task 156, fix wave 2) ----

// A directory of the home's own a link into the tree: <home>/sandbox (above the helper), and the staging and engine
// directories a browser-only session's scoped preflight protects. The open refuses it before anything resolves it.
test('a home directory that is a link into the tree, the sandbox helper\'s, staging\'s or the engine\'s: the open refuses it, nothing there resolved', t => {
  for (const [name, surfaces] of [['sandbox', ['browser']], ['sandbox', ['computer']], ['staging', ['browser']], ['engine', ['browser']]]) {
    const h = homeWithVendorTree(t);
    const own = join(h.home, name);
    const planted = join(h.runtimes, `planted-${name}`);
    if (fs.existsSync(own)) { fs.cpSync(own, planted, {recursive: true}); fs.rmSync(own, {recursive: true}); }
    else fs.mkdirSync(name === 'sandbox' ? join(planted, 'rust-v0.163.0') : planted, {recursive: true});
    if (name === 'sandbox') fs.writeFileSync(join(planted, 'rust-v0.163.0', 'codex-linux-sandbox'), '#!/bin/sh\nexit 0\n', {mode: 0o755});
    fs.symlinkSync(planted, own);
    let error;
    const seen = recorded(() => { try { session(h, surfaces); } catch (caught) { error = caught; } });
    assert.ok(error, `${name} (${surfaces}): not refused`);
    assert.match(error.message, /vendor's tree/, `${name}: ${error.message}`);
    assert.ok(`${error.message} ${error.hint}`.includes(`move ${own} aside`), `${name}: ${error.message} ${error.hint}`);
    assert.deepEqual(inVendorTree(seen, h.home), [], `${name} (${surfaces})`);
  }
});

// The helper that was outside the tree at the open and is a link into it by a later (lazy or idle) launch: the
// connection does not repeat its preflight there, so the launch's own construction refuses it.
test('a helper that becomes a link into the tree after the open: the next confined launch\'s construction refuses it; a disabled one names no path there', t => {
  const h = homeWithVendorTree(t);
  const runtime = resolveRuntime({home: h.home, host: LINUX});
  const replHost = replHostFor({platform: 'linux', arch: LINUX.arch, surfaces: ['browser'], ambient: h.ambient, home: h.home});
  const launchWith = sandbox => buildLaunch({runtime, home: h.home, sessionId: SESSION, ambient: h.ambient, surfaces: ['browser'], replHost, services: {browser: BROWSER_SERVICE}, sandbox});
  launchWith('scoped');
  const {path} = helperFor({home: h.home, arch: LINUX.arch});
  const planted = join(h.runtimes, 'codex-linux-sandbox');
  fs.writeFileSync(planted, '#!/bin/sh\nexit 0\n', {mode: 0o755});
  fs.mkdirSync(dirname(path), {recursive: true});
  fs.symlinkSync(planted, path);
  for (const sandbox of ['scoped', 'default']) {
    let error;
    const seen = recorded(() => { try { launchWith(sandbox); } catch (caught) { error = caught; } });
    assert.equal(error?.code, 'sandbox_unavailable', `${sandbox}: ${error?.message ?? 'not refused'}`);
    assert.ok(error.hint.startsWith(`move ${path} aside, then`), error.hint);
    assert.deepEqual(inVendorTree(seen, h.home), [], sandbox);
  }
  const open = launchWith('disabled');
  assert.ok(!Object.values(open.env).some(value => value.includes(h.runtimes)), 'a disabled launch names nothing in the tree');
});

// A home that can be searched but not listed: whether its runtimes/ is a link cannot be read, so the boundary of the
// vendor's tree cannot be established, and an override is refused rather than approved without it.
test('a cua home that cannot be listed: an override naming the relocated vendor Node by its physical path is refused, not approved', {skip: process.getuid?.() === 0 && 'root lists any directory'}, t => {
  const h = homeWithVendorTree(t);
  const {vendorNode} = relocateTree(t, h);
  fs.chmodSync(h.home, 0o311);
  try {
    const probed = [];
    let error;
    try { linuxNode(h, {CUA_NODE: vendorNode}, path => { probed.push(path); return 'v24.22.0'; }); } catch (caught) { error = caught; }
    assert.equal(error?.code, 'layout_invalid', error?.message ?? 'approved');
    assert.match(error.message, /cannot be listed/);
    assert.deepEqual(probed, [], 'the version probe was never handed a path');
  } finally {
    fs.chmodSync(h.home, 0o700);
  }
});

// The guarded git lookup keeps PATH's meaning: an entry's `..` after a link is the kernel's, and a relative entry is
// taken against the directory git would run in, as the PATH search did before the guard.
test('the project lookup on Linux keeps PATH\'s meaning: `..` after a link is the kernel\'s, and a relative entry is the working directory\'s', t => {
  const h = homeWithVendorTree(t);
  const scratch = join(h.home, 'path-meaning');
  const fakeGit = (dir, root) => { fs.mkdirSync(dir, {recursive: true}); fs.writeFileSync(join(dir, 'git'), `#!/bin/sh\necho ${root}/.git\necho ${root}\n`, {mode: 0o755}); };
  fakeGit(join(scratch, 'deep'), '/kernel');                   // where outside/a/.. leads by the kernel
  fakeGit(join(scratch, 'outside'), '/lexical');               // where a lexical reading of outside/a/.. lands
  fs.mkdirSync(join(scratch, 'deep', 'x'));
  fs.symlinkSync(join(scratch, 'deep', 'x'), join(scratch, 'outside', 'a'));
  assert.equal(projectRoot(scratch, {env: {PATH: `${join(scratch, 'outside', 'a')}/..`}, platform: 'linux', home: h.home}), '/kernel');
  const work = join(scratch, 'work');
  fakeGit(join(work, 'tools'), '/relative');
  assert.equal(projectRoot(work, {env: {PATH: 'tools:/nonexistent'}, platform: 'linux', home: h.home}), '/relative');
});
