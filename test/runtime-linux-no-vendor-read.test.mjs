// "No vendor tree read" (#171 M6a; the pre-flight's §3.5): with any engine selection but `vendor`, a Linux session's
// open and launch open, stat, list and run nothing under <home>/runtimes/, and name no such path to the runtime. Shown
// with the tree present, not only with it gone: a recorder over node:fs (its synchronous, callback and promise
// functions) and node:child_process watches resolveRuntime, replHostFor, buildLaunch and assertSandboxFits for a default
// computer session and a browser-only one, in a home whose vendor tree is installed and whose PATH leads to the vendor
// tree's bin. Its negative control is the Node lookup this cua still runs on macOS (ownHostNode's darwin branch, the
// Linux one before M6a), which must be recorded stat-ing the vendor's bin/node. The traced live cell (§5.2, E1) is the
// check on reads by any route the recorder does not wrap.
import './helpers/scratch-home.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {dirname, join, relative, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildLaunch, nativeEngineFor, ownHostNode, replHostFor, SKY_SERVICE, BROWSER_SERVICE} from '../src/runtime/launch.mjs';
import {resolveRuntime} from '../src/runtime/manifest.mjs';
import {assertSandboxFits} from '../src/runtime/sandbox.mjs';
import {MIN_ENGINE_VERSION} from '../src/services/engine/linux/client.mjs';
import {forgeActiveRuntime, scratchUserHome, shortScratch} from './fixtures/runtime-fixture.mjs';
import {fakeInstalledEngine, fakeManagedNode, fakeModuleTree} from './fixtures/own-linux-runtime.mjs';

const LINUX = {platform: 'linux', arch: 'x64'};
const SESSION = '6f1c2d3e-0000-4000-8000-0000000006a3';

// Every path a call names: strings, file URLs and buffers among its arguments, and the strings of an argument list.
const pathsOf = args => args.flatMap(arg => (typeof arg === 'string' ? [arg] : arg instanceof URL ? [fileURLToPath(arg)] : Buffer.isBuffer(arg) ? [arg.toString()]
  : Array.isArray(arg) ? arg.filter(item => typeof item === 'string') : []));

// Runs `fn` with every function of node:fs, fs.promises and node:child_process wrapped to note the paths it is given,
// the ESM bindings refreshed so the modules under test call the wrappers -> [{call, path}].
function recorded(fn) {
  const seen = [];
  const restore = [];
  const wrap = (owner, name, label = name) => {
    const original = owner[name];
    if (typeof original !== 'function' || /^[A-Z]/.test(name)) return;
    const wrapper = function (...args) {
      for (const path of pathsOf(args)) seen.push({call: label, path});
      return original.apply(this, args);
    };
    Object.assign(wrapper, original);
    owner[name] = wrapper;
    restore.push(() => { owner[name] = original; });
  };
  for (const name of Object.keys(fs)) wrap(fs, name);
  wrap(fs.realpathSync, 'native', 'realpathSync.native');
  wrap(fs.realpath, 'native', 'realpath.native');
  for (const name of Object.keys(fs.promises)) wrap(fs.promises, name, `promises.${name}`);
  for (const name of Object.keys(childProcess)) wrap(childProcess, name);
  syncBuiltinESMExports();
  try {
    fn();
  } finally {
    for (const undo of restore.reverse()) undo();
    syncBuiltinESMExports();
  }
  return seen;
}

const within = (path, root) => { const rel = relative(root, path); return rel === '' || (!isAbsolute(rel) && !rel.startsWith('..')); };

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
    assert.deepEqual(seen.filter(({path}) => within(path, h.runtimes)), [], 'nothing under runtimes/');
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
  assert.ok(seen.some(({call, path}) => call === 'statSync' && path === h.vendorNode), JSON.stringify(seen.filter(({path}) => within(path, h.runtimes))));
});

// ---- the overrides and the managed parts, each a way into the tree (#171 M6a, task 149's fix wave 1) ----

// Runs `fn` under the recorder, expecting it to throw `code` -> {error, inTree: the calls seen naming a path there}.
function refusedWithoutReading(h, fn, code) {
  let error;
  const seen = recorded(() => { try { fn(); } catch (caught) { error = caught; } });
  assert.equal(error?.code, code, error?.message ?? 'not refused');
  return {error, inTree: seen.filter(({path}) => within(path, h.runtimes))};
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

test('the installed engine\'s install record linked into the tree: refused, nothing there read', t => {
  const h = homeWithVendorTree(t);
  const own = join(h.home, 'engine', 'linux', 'install.json');
  const planted = join(h.runtimes, 'engine-record.json');
  fs.copyFileSync(own, planted);
  fs.rmSync(own);
  fs.symlinkSync(planted, own);
  for (const env of [{}, {CUA_NATIVE_ENGINE: 'cua'}]) {
    const {error, inTree} = refusedWithoutReading(h, () => selectEngine(h, env), 'engine_not_installed');
    assert.deepEqual(inTree, [], error.message);
    assert.match(error.message, /vendor's tree/);
  }
});
