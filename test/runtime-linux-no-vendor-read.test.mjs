// "No vendor tree read" (#171 M6a; the pre-flight's §3.5): with any engine selection but `vendor`, a Linux session's
// open and launch open, stat, list and run nothing under <home>/runtimes/, and name no such path to the runtime. Shown
// with the tree present, not only with it gone: a recorder over node:fs (its synchronous, callback and promise
// functions) and node:child_process watches resolveRuntime, replHostFor, buildLaunch and assertSandboxFits for a default
// computer session and a browser-only one, in a home whose vendor tree is installed and whose PATH leads to the vendor
// tree's bin. Its negative control is the Node lookup this cua still runs on macOS (ownHostNode's darwin branch, the
// Linux one before M6a), which must be recorded stat-ing the vendor's bin/node. The traced live cell (§5.2, E1) is the
// check on reads by any route the recorder does not wrap. The recorder (./helpers/vendor-tree-recorder.mjs) notes each
// path as the call reaches it, through links and PATH, and also watches a real `cua serve` from its first line.
// #171 M6b (its pre-flight's §3.4) adds install's and doctor's own reads and writes: the linked fixtures replayed through
// the whole of doctor and of install, and full installs whose staging/ is a link into a recorded release, each run with
// the release's report stubbed (nothing under runtimes/) and real (only the report's own lstat, readdir and one open).
import './helpers/scratch-home.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {buildLaunch, nativeEngineFor, ownHostNode, replHostFor, SKY_SERVICE, BROWSER_SERVICE} from '../src/runtime/launch.mjs';
import {linuxRelease, loadLinuxRuntime, resolveRuntime} from '../src/runtime/manifest.mjs';
import {assertSandboxConfines, assertSandboxFits} from '../src/runtime/sandbox.mjs';
import {installLinuxEngine, installSandboxHelper, useRuntime} from '../src/runtime/install.mjs';
import {installLinux} from '../src/runtime/linux-install.mjs';
import {installModuleTree, loadModuleLock, loadModuleProvenance} from '../src/runtime/module-tree.mjs';
import {installNode} from '../src/runtime/node-install.mjs';
import {buildLinuxEngine} from '../src/runtime/linux-engine.mjs';
import {retiredTrees} from '../src/runtime/retired-tree.mjs';
import {stagingGuard} from '../src/runtime/vendor-tree.mjs';
import {inspectRuntime} from '../src/runtime/doctor.mjs';
import {helperFor, loadHelperPin} from '../src/sandbox/linux.mjs';
import {projectRoot} from '../src/secrets/project.mjs';
import {MIN_ENGINE_VERSION} from '../src/services/engine/linux/client.mjs';
import {scratchUserHome, shortScratch} from './fixtures/runtime-fixture.mjs';
import {RETIRED, plantRetiredRelease} from './fixtures/retired-release.mjs';
import {fakeInstalledEngine, fakeManagedNode, fakeModuleTree, moduleHostOf} from './fixtures/own-linux-runtime.mjs';
import {writeFixtureModules} from './fixtures/module-registry.mjs';
import {inVendorTree, recorded, startRecording, within} from './helpers/vendor-tree-recorder.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));

const LINUX = {platform: 'linux', arch: 'x64'};
const SESSION = '6f1c2d3e-0000-4000-8000-0000000006a3';

// A home as `cua install` leaves it after M6a, the vendor tree kept beside it: the module tree, the managed Node, an
// engine recorded at the minimum, and the vendor's release an older cua's install recorded, with an executable bin/node
// and current.json naming it.
function homeWithVendorTree(t) {
  const s = shortScratch();
  t.after(s.cleanup);
  const home = fs.realpathSync(s.dir);
  fakeModuleTree(home, LINUX);
  fakeManagedNode(home, LINUX);
  fakeInstalledEngine(home, MIN_ENGINE_VERSION);
  const {root} = plantRetiredRelease(home);
  fs.writeFileSync(join(home, 'current.json'), JSON.stringify({schema: 1, release: RETIRED.x64.release}));
  const vendorNode = join(root, 'cua_node', 'bin', 'node');
  fs.writeFileSync(vendorNode, '#!/bin/sh\necho v24.21.0\n');
  assert.ok(fs.statSync(vendorNode).mode & 0o111, 'the vendor tree holds an executable Node');
  const user = scratchUserHome(t);
  return {home, runtimes: join(home, 'runtimes'), release: root, vendorNode, ambient: {HOME: user, USER: 'u', PATH: `${dirname(vendorNode)}:/usr/bin:/bin`, DISPLAY: ':0', XDG_RUNTIME_DIR: '/run/user/1000'}};
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
  // The git that answered there, ahead of /usr/bin: on macOS /usr/bin/git is an xcrun shim whose lookup alone can take
  // seconds on a loaded runner, past the project lookup's 5 s bound (a hosted test-2 flake, task 167's fix wave 1).
  const gitDir = dirname(spawnSync('sh', ['-c', 'command -v git'], {encoding: 'utf8'}).stdout.trim() || '/usr/bin/git');
  for (const PATH of [`${bin}:${gitDir}:/usr/bin:/bin`, `${join(outside, 'bin')}:${gitDir}:/usr/bin:/bin`]) {
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

// ---- #171 M6b: install's and doctor's own reads and writes (the pre-flight's §3.4, §5.1) ----

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const HELPER_BYTES = Buffer.from('#!/bin/sh\nexit 0\n');
const REAL_HELPER_PIN = loadHelperPin();
// Pins of the test's own, each naming bytes the test lays or serves (the real assets are never fetched).
const helperPin = bytes => ({...REAL_HELPER_PIN, assets: {...REAL_HELPER_PIN.assets, 'linux-x64': {url: 'https://fixture.invalid/codex-linux-sandbox', length: bytes.length, sha256: sha256(bytes)}}});
const enginePinFor = bytes => ({version: MIN_ENGINE_VERSION, release: `linux-engine-v${MIN_ENGINE_VERSION}`,
  assets: {x64: {url: 'https://fixture.invalid/cua-engine', sha256: sha256(bytes)}, arm64: {url: 'https://fixture.invalid/cua-engine-arm64', sha256: sha256('arm64')}}});
const NODE_VERSION = loadLinuxRuntime({host: LINUX}).node.version;
const nodePinFor = ({sha256: hash, length}) => ({schema: 1, version: NODE_VERSION, platform: 'linux', arch: 'x64',
  archive: {url: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz`, length, sha256: hash}, notes: 'fixture'});
// The engine fakeInstalledEngine lays, and the archive fakeManagedNode's record names.
const FAKE_ENGINE = Buffer.from(`#!/bin/sh\necho "cua-engine ${MIN_ENGINE_VERSION} (0123456789ab)"\n`);
const FAKE_NODE_ARCHIVE = {sha256: 'a'.repeat(64), length: 1};
const NO_RETIRED = () => ({trees: [], lines: []});

// What the release's report itself touches in `home`, recorded alone: what "only its own" is held to.
const own = seen => seen.map(({call, path}) => `${call} ${path}`).sort();
const reportsOwn = home => own(inVendorTree(recorded(() => retiredTrees({home})), home));

// Every entry of the release: its type, size, mode, mtime and bytes, and the release directory's own mtime.
function releaseState(root) {
  return fs.readdirSync(root, {recursive: true}).sort().map(rel => {
    const stat = fs.lstatSync(join(root, rel));
    return [rel, stat.mode, stat.size, stat.mtimeMs, stat.isFile() ? sha256(fs.readFileSync(join(root, rel))) : null];
  }).concat([['.', fs.lstatSync(root).mtimeMs]]);
}

// Doctor whole over the home, with the release's report `retired` (a stub, or the real one when undefined).
const doctorOf = (h, retired) => inspectRuntime({home: h.home, env: {HOME: h.ambient.HOME, DISPLAY: ':9'}, host: LINUX, verifySignatures: () => assert.fail('codesign'),
  inspectHelper: () => assert.fail('the native socket helper'), inspectSecrets: async () => ({dir: '/nowhere', exists: false}),
  inspectLinux: async () => [], inspectChrome: async () => [], inspectAgent: async () => [], readLinuxCapabilities: async () => null, ...(retired ? {retired} : {})});

// Install whole over the home with the real installers, each held to the parts the home holds or to the archives
// `serve` and `modules` give, with the release's report `retired`. `fetched` lists every URL asked for.
function installOf(h, {retired, serve = {}, nodePin = nodePinFor(FAKE_NODE_ARCHIVE), enginePin = enginePinFor(FAKE_ENGINE), helper = helperPin(HELPER_BYTES), modules} = {}) {
  const fetched = [];
  const fetch = async url => {
    fetched.push(url);
    const bytes = serve[url];
    return bytes ? new Response(bytes, {headers: {'content-length': String(bytes.length)}}) : modules ? modules.fetch(url) : new Response('gone', {status: 404});
  };
  const run = () => installLinux({values: {}, home: h.home, env: {HOME: h.ambient.HOME}, host: LINUX,
    installModules: options => installModuleTree({...options, host: moduleHostOf(LINUX), fetch, ...(modules ? {lock: modules.lock, provenance: modules.provenance} : {})}),
    installHelper: options => installSandboxHelper({...options, pin: helper, host: LINUX, fetch}),
    installNode: options => installNode({...options, host: LINUX, fetch}), nodePins: () => [nodePin],
    installEngine: options => installLinuxEngine({...options, host: LINUX, fetch}), enginePin: () => enginePin,
    ...(retired ? {retired} : {})});
  return {run, fetched};
}

// Runs the async `fn` recorded -> {value, error, seen}.
async function recordedRun(fn) {
  const recording = startRecording();
  let value, error, seen;
  try { value = await fn(); } catch (caught) { error = caught; } finally { seen = recording.stop(); }
  return {value, error, seen};
}

// A home holding every part as an install leaves it, the helper included, with the vendor's recorded release beside.
function wholeHome(t) {
  const h = homeWithVendorTree(t);
  const {path} = helperFor({home: h.home, arch: LINUX.arch});
  fs.mkdirSync(dirname(path), {recursive: true});
  fs.writeFileSync(path, HELPER_BYTES, {mode: 0o755});
  return {...h, helper: path};
}
// Replaces `own` (a file or directory of the home's) with a link to a copy of it planted under runtimes/ -> `own`.
function linkIntoTree(h, path) {
  const planted = join(h.runtimes, `planted-${relative(h.home, path).replaceAll('/', '-')}`);
  if (fs.existsSync(path)) { fs.cpSync(path, planted, {recursive: true}); fs.rmSync(path, {recursive: true}); } else fs.mkdirSync(planted, {recursive: true});
  fs.mkdirSync(dirname(path), {recursive: true});
  fs.symlinkSync(planted, path);
  return path;
}

// The linked fixtures above, each a part of the home made a link into the tree, and a node/ and a modules/ that are
// themselves such links (§3.4). `node`: the Node step's refusal and doctor's runtime.node must name the link.
const LINKED = {
  'the Node pointer': h => ({link: linkIntoTree(h, join(h.home, 'node', 'current.json')), node: true}),
  'the Node record': h => ({link: linkIntoTree(h, join(h.home, 'node', NODE_VERSION, 'install.json')), node: true}),
  'node/': h => ({link: linkIntoTree(h, join(h.home, 'node')), node: true}),
  'modules/': h => ({link: linkIntoTree(h, join(h.home, 'modules'))}),
  'the engine': h => ({link: linkIntoTree(h, join(h.home, 'engine', 'linux', 'cua-engine'))}),
  'the engine record': h => ({link: linkIntoTree(h, join(h.home, 'engine', 'linux', 'install.json'))}),
  'engine/linux/': h => ({link: linkIntoTree(h, join(h.home, 'engine', 'linux'))}),
  'engine/': h => ({link: linkIntoTree(h, join(h.home, 'engine'))}),
  'the helper': h => ({link: linkIntoTree(h, h.helper)}),
  'sandbox/': h => ({link: linkIntoTree(h, join(h.home, 'sandbox'))}),
  'staging/': h => ({link: linkIntoTree(h, join(h.home, 'staging'))}),
  'current.json': h => ({link: linkIntoTree(h, join(h.home, 'current.json'))}),
  // the deny list's directories and state/codex, which doctor's sandbox row resolves by their real paths (fix wave 1)
  'state/': h => ({link: linkIntoTree(h, join(h.home, 'state')), sandbox: true}),
  'state/codex/': h => ({link: linkIntoTree(h, join(h.home, 'state', 'codex')), sandbox: true}),
  'remote/': h => ({link: linkIntoTree(h, join(h.home, 'remote')), sandbox: true}),
  'chrome/': h => ({link: linkIntoTree(h, join(h.home, 'chrome')), sandbox: true}),
  'run/': h => ({link: linkIntoTree(h, join(h.home, 'run')), sandbox: true}),
  // a session record in a real run/ that is a link into the tree: doctor's sweep reads no record through a link
  'a run/ record': h => {
    const record = join(h.home, 'run', '6f1c2d3e-0000-4000-8000-0000000006b2.pid');
    const planted = join(h.runtimes, 'planted.pid');
    fs.mkdirSync(dirname(record), {recursive: true});
    fs.writeFileSync(planted, '123\n');
    fs.symlinkSync(planted, record);
    return {link: record};
  },
};

test('the replay: each linked part through the whole of doctor and of install, the report stubbed then real, touches nothing under runtimes/ but the report\'s own, and a reinstall acquires nothing', async t => {
  for (const [name, link] of Object.entries(LINKED)) {
    const h = wholeHome(t);
    const linked = link(h);
    const before = releaseState(h.release);
    const yardstick = reportsOwn(h.home);
    assert.ok(yardstick.some(entry => entry.startsWith('openSync ')) && yardstick.some(entry => entry.startsWith('opendirSync ')), 'the report names the release and walks it');
    for (const [label, retired] of [['stubbed', NO_RETIRED], ['real', undefined]]) {
      const doctor = await recordedRun(() => doctorOf(h, retired));
      assert.equal(doctor.error, undefined, `${name}, doctor (${label}): ${doctor.error?.stack}`);
      assert.deepEqual(own(inVendorTree(doctor.seen, h.home)), label === 'stubbed' ? [] : yardstick, `${name}, doctor (${label})`);
      const install = installOf(h, {retired});
      const installed = await recordedRun(install.run);
      assert.equal(installed.error, undefined, `${name}, install (${label}): ${installed.error?.stack}`);
      assert.deepEqual(own(inVendorTree(installed.seen, h.home)), label === 'stubbed' ? [] : yardstick, `${name}, install (${label})`);
      assert.deepEqual(install.fetched, [], `${name}: a reinstall acquires nothing`);
      if (linked.node) {
        // install refuses the Node step, naming the link; doctor's runtime.node names it as what blocks the installer
        const {node} = installed.value.report;
        assert.equal(node.failed?.code, 'target_occupied', `${name}: ${JSON.stringify(node)}`);
        assert.match(node.failed.message, /under the vendor's tree, and cua does not install its Node through it$/);
        assert.equal(node.failed.hint, `move ${linked.link} aside first`, name);
        const row = doctor.value.checks.find(c => c.name === 'runtime.node');
        assert.equal(row.status, 'fail', name);
        assert.ok(row.detail.includes(`move ${linked.link} aside, then`), `${name}: ${row.detail}`);
      }
      if (linked.sandbox) {
        const row = doctor.value.checks.find(c => c.name === 'sandbox');
        assert.equal(row.status, 'fail', name);
        assert.ok(row.detail.includes(`under the vendor's tree`) && row.detail.includes(`move ${linked.link} aside, then`), `${name}: ${row.detail}`);
      }
      if (label === 'real') {
        assert.deepEqual(installed.value.report.retired.map(tree => tree.path), [h.release], name);
        assert.ok(doctor.value.checks.some(c => c.name === 'runtime.retired' && c.status === 'skip'), name);
      }
    }
    assert.deepEqual(releaseState(h.release), before, `${name}: the release is as it was`);
  }
});

// ---- full installs with staging/ a link into the recorded release ----

// The archives a full install takes, each served by URL: the module tree's fixture registry, the helper, a Node tarball
// and the engine.
function servedArchives(t) {
  const s = shortScratch();
  t.after(s.cleanup);
  const registry = writeFixtureModules(join(s.dir, 'modules-pins'));
  const modules = {lock: loadModuleLock(registry.dir), provenance: loadModuleProvenance(registry.dir), fetch: registry.fetch};
  const top = `node-v${NODE_VERSION}-linux-x64`;
  fs.mkdirSync(join(s.dir, 'node-tree', top, 'bin'), {recursive: true});
  fs.writeFileSync(join(s.dir, 'node-tree', top, 'bin', 'node'), `#!/bin/sh\necho v${NODE_VERSION}\n`, {mode: 0o755});
  fs.writeFileSync(join(s.dir, 'node-tree', top, 'LICENSE'), 'licence\n');
  const tarball = join(s.dir, 'node.tar.gz');
  assert.equal(spawnSync('tar', ['-czf', tarball, '-C', join(s.dir, 'node-tree'), top]).status, 0);
  const nodeBytes = fs.readFileSync(tarball);
  const nodePin = nodePinFor({sha256: sha256(nodeBytes), length: nodeBytes.length});
  const engine = Buffer.from(`#!/bin/sh\necho "cua-engine ${MIN_ENGINE_VERSION} (fedcba987654)"\n`);
  const helper = helperPin(HELPER_BYTES);
  const enginePin = enginePinFor(engine);
  return {modules, nodePin, enginePin, helper,
    serve: {[helper.assets['linux-x64'].url]: HELPER_BYTES, [nodePin.archive.url]: nodeBytes, [enginePin.assets.x64.url]: engine}};
}
const PARTS = {
  'the module tree': (h, a) => fs.rmSync(join(h.home, 'modules', a.modules.lock.hash), {recursive: true}),
  'the helper': h => fs.rmSync(helperFor({home: h.home, arch: LINUX.arch}).path),
  'Node': h => fs.rmSync(join(h.home, 'node', NODE_VERSION), {recursive: true}),
  'the engine': h => fs.rmSync(join(h.home, 'engine', 'linux', 'cua-engine')),
};
const LANE = {'the module tree': 'modules', 'the helper': 'sandboxHelper', 'Node': 'node', 'the engine': 'engine'};

// A home holding only the recorded release; with `missing`, every part placed first by this same install through a
// real staging/, then that part removed. -> {h, archives}.
async function stagedHome(t, {missing} = {}) {
  const s = shortScratch();
  t.after(s.cleanup);
  const home = fs.realpathSync(s.dir);
  const {root} = plantRetiredRelease(home);
  const h = {home, runtimes: join(home, 'runtimes'), release: root, ambient: {HOME: scratchUserHome(t)}};
  const archives = servedArchives(t);
  if (missing) {
    const {value} = await recordedRun(installOf(h, archives).run);
    assert.equal(value.ok, true, JSON.stringify(value.report.error));
    PARTS[missing](h, archives);
  }
  return {h, archives};
}
// staging/ made a link to a directory inside the recorded release.
function linkStaging(h) {
  fs.rmSync(join(h.home, 'staging'), {recursive: true, force: true});
  fs.symlinkSync(join(h.release, 'cua_node', 'lib'), join(h.home, 'staging'));
}
const refusedStaging = (h, failed) => {
  const staging = join(h.home, 'staging');
  assert.equal(failed?.code, 'target_occupied', JSON.stringify(failed));
  assert.equal(failed.message, `${staging} leads to ${h.runtimes}, under the vendor's tree, and cua does not install through it`);
  assert.equal(failed.hint, `move ${staging} aside first`);
};

// The full install over `h`, run with the report stubbed and then real, its guard on: the lanes in `refused` refuse,
// naming the link, before anything is created; the others acquire nothing; nothing is recorded under runtimes/ but the
// report's own; the release is as it was.
async function installsRefused(h, archives, refused) {
  const before = releaseState(h.release);
  const yardstick = reportsOwn(h.home);
  for (const [label, retired] of [['stubbed', NO_RETIRED], ['real', undefined]]) {
    const install = installOf(h, {...archives, retired});
    const {value, seen} = await recordedRun(install.run);
    for (const lane of Object.values(LANE)) {
      if (refused.includes(lane)) refusedStaging(h, value.report[lane].failed);
      else assert.equal(value.report[lane].changed, false, `${lane}: ${JSON.stringify(value.report[lane])}`);
    }
    assert.deepEqual(install.fetched, [], 'nothing was fetched');
    assert.equal(value.ok, false);
    assert.deepEqual(own(inVendorTree(seen, h.home)), label === 'stubbed' ? [] : yardstick, label);
  }
  assert.deepEqual(releaseState(h.release), before, 'the release\'s listing, bytes and mtimes are as before; no temp directory was made there');
}

// The negative control: with the guard off through its seam, the same install is recorded making its scratch directory
// inside the release, which a recorder that saw nothing would otherwise pass.
async function unguardedReaches(h, archives) {
  stagingGuard.enabled = false;
  try {
    const {seen} = await recordedRun(installOf(h, {...archives, retired: NO_RETIRED}).run);
    return seen.some(({call, reached}) => call === 'mkdtempSync' && within(reached, h.release));
  } finally { stagingGuard.enabled = true; }
}

test('a full install with every part missing and staging/ a link into the recorded release: each acquiring lane refuses it, naming it, before it creates anything', async t => {
  const {h, archives} = await stagedHome(t);
  linkStaging(h);
  await installsRefused(h, archives, Object.values(LANE));
  // each fresh lane refused before it created anything of its own: no node/, modules/, sandbox/ or engine/
  assert.deepEqual(fs.readdirSync(h.home).sort(), ['runtimes', 'staging']);
  assert.equal(await unguardedReaches(h, archives), true, 'the negative control: unguarded, the mkdtemp lands in the release');
});

for (const part of Object.keys(PARTS)) {
  test(`a full install with ${part} alone missing and staging/ a link into the recorded release: that lane's own guard refuses it; the others acquire nothing`, async t => {
    const {h, archives} = await stagedHome(t, {missing: part});
    linkStaging(h);
    await installsRefused(h, archives, [LANE[part]]);
    assert.equal(await unguardedReaches(h, archives), true, 'the negative control');
  });
}

test('a staging/ that is absent, or a real directory, installs as today: every part placed', async t => {
  for (const real of [false, true]) {
    const {h, archives} = await stagedHome(t);
    if (real) fs.mkdirSync(join(h.home, 'staging'));
    const {value} = await recordedRun(installOf(h, archives).run);
    assert.equal(value.ok, true, JSON.stringify(value.report.error));
    for (const lane of Object.values(LANE)) assert.equal(value.report[lane].changed, true, lane);
  }
});

test('a local build\'s placing with staging/ a link into the recorded release: refused, naming it, before anything is created; unguarded, its mkdtemp lands there', async t => {
  const {h} = await stagedHome(t);
  linkStaging(h);
  const source = join(h.home, 'source');
  fs.mkdirSync(join(source, 'target', 'release'), {recursive: true});
  fs.writeFileSync(join(source, 'Cargo.toml'), '[package]\n');
  fs.writeFileSync(join(source, 'target', 'release', 'cua-engine'), '#!/bin/sh\necho local\n', {mode: 0o755});
  const run = (command, args) => (args[0] === '--version' ? {status: 0, stdout: `cua-engine ${MIN_ENGINE_VERSION} (0123456789ab)\n`} : {status: 0, stdout: ''});
  const build = () => buildLinuxEngine({home: h.home, sourceRoot: source, cargo: '/fixture/cargo', run, host: LINUX});
  const before = releaseState(h.release);
  const {error, seen} = await recordedRun(build);
  refusedStaging(h, error);
  assert.deepEqual(inVendorTree(seen, h.home), []);
  assert.deepEqual(releaseState(h.release), before);
  stagingGuard.enabled = false;
  try {
    const unguarded = await recordedRun(build);
    assert.ok(unguarded.seen.some(({call, reached}) => call === 'mkdtempSync' && within(reached, h.release)), 'the negative control');
  } finally { stagingGuard.enabled = true; }
});
