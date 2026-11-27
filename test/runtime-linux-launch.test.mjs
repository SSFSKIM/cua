// The launch record on Linux (Phase F, #115 M3; cua's own runtime since #171 M6a): the X11 and session-bus variables
// pass through the ambient allowlist (the bus address derived from XDG_RUNTIME_DIR when an SSH session lacks it), the
// sandbox is cua's pinned helper under the home, cells import from cua's ModuleTree, and no macOS helper app is named.
// The Node is the managed one or CUA_NODE, never one under the vendor's tree; the vendor's engine, retired by cua 0.30.0
// (M6b), is refused before any launch. A macOS launch is unchanged by any of these variables.
import './helpers/scratch-home.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, existsSync, mkdirSync, realpathSync, statSync, symlinkSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {buildLaunch, createLaunchDirs, removeLaunchDirs, ownHostNode, replHostFor, SKY_SERVICE, BROWSER_SERVICE, ENGINE_SERVICE_DIR, LINUX_ENGINE_SERVICE,
  REPL_HOST_DIR, CUA_API_DIR, CUA_API_DOCS_DIR, SANDBOX_DIR, BIN_DIR, BROWSER_SERVICE_IMPL_DIR, SERVICE_SUPPORT_DIRS} from '../src/runtime/launch.mjs';
import {CUA_ENTRY, parsePin, resolveRuntime, runtimeFor} from '../src/runtime/manifest.mjs';
import {MIN_ENGINE_VERSION} from '../src/services/engine/linux/client.mjs';
import {scratch, fixturePin, forgeActiveRuntime} from './fixtures/runtime-fixture.mjs';
import {fakeInstalledEngine, fakeManagedNode, fakeModuleTree} from './fixtures/own-linux-runtime.mjs';
import {helperFor} from '../src/sandbox/linux.mjs';
import {assertSandboxFits} from '../src/runtime/sandbox.mjs';

const SESSION = '6f1c2d3e-0000-4000-8000-000000000002';
const DESKTOP = {DISPLAY: ':0', XAUTHORITY: '/home/u/.Xauthority', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus', XDG_RUNTIME_DIR: '/run/user/1000', XDG_DATA_DIRS: '/usr/local/share:/usr/share'};
const AMBIENT = {HOME: '/home/u', USER: 'u', LOGNAME: 'u', LANG: 'C.UTF-8', PATH: '/home/u/bin:/usr/bin', ...DESKTOP,
  OAI_SKY_LINUX_BIN: '/tmp/evil', SKY_CUA_SERVICE_PATH: '/tmp/Other.app', XDG_CONFIG_HOME: '/home/u/.config', WAYLAND_DISPLAY: 'wayland-0', NODE_OPTIONS: '--require /evil.js'};

function scratchHome(t) {
  const s = scratch();
  t.after(s.cleanup);
  return realpathSync(s.dir);
}
// cua's own Linux runtime in a scratch home (its module tree), resolved as a connection resolves it, and by default an
// engine at the minimum, which the default selection takes.
function linux(t, arch = 'x64', {engine = true} = {}) {
  const home = scratchHome(t);
  const host = {platform: 'linux', arch};
  fakeModuleTree(home, host);
  const enginePath = engine ? fakeInstalledEngine(home, MIN_ENGINE_VERSION) : null;
  return {home, host, enginePath, runtime: resolveRuntime({home, host})};
}

const NODE = '/opt/node-24/bin/node';
const ownNode = () => NODE;

// Linux runs cua's own host only (#115 M3): its children go through the pinned helper, the worker alone has the network
// with the computer surface, and no Codex CLI or CODEX_HOME is named. Cells import from the ModuleTree, which is no
// trusted code: nothing trusted imports from it (#171 M6a).
test('a Linux computer-use launch runs cua\'s own host on cua\'s engine: the desktop session, the ModuleTree, the pinned sandbox helper, the worker\'s network', t => {
  const {home, runtime, enginePath} = linux(t, 'arm64');
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, services: {sky: SKY_SERVICE}, resolveOwnNode: ownNode});
  assert.deepEqual(launch.replHost, {host: 'cua', reason: 'linux'});
  assert.equal(launch.command, NODE);
  const {env} = launch;
  const helper = helperFor({home, arch: 'arm64'});
  assert.deepEqual(env, {
    HOME: '/home/u', USER: 'u', LOGNAME: 'u', LANG: 'C.UTF-8', ...DESKTOP, TMPDIR: join(home, 'run', SESSION, 'tmp'),
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    CUA_SANDBOX_DENY_READ: env.CUA_SANDBOX_DENY_READ,
    CUA_REPL_ENABLED_SURFACES: 'computer', CUA_REPL_NODE_PATH: NODE, CUA_REPL_OWNED_GROUP: '1', CUA_REPL_NODE_MODULE_DIRS: runtime.paths.moduleDir,
    CUA_REPL_JS_BANNER: env.CUA_REPL_JS_BANNER, CUA_REPL_UNTRUSTED_ENV_ALLOWLIST: 'CUA_REPL_ENABLED_SURFACES,CUA_REPL_BROWSER_ENV', CUA_REPL_TOOL_OVERRIDES: env.CUA_REPL_TOOL_OVERRIDES,
    CUA_REPL_TRUSTED_SERVICES: env.CUA_REPL_TRUSTED_SERVICES, CUA_REPL_TRUSTED_RPC_ENABLED: '1', CUA_REPL_TRUSTED_CODE_PATHS: env.CUA_REPL_TRUSTED_CODE_PATHS,
    CUA_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS: '1000', NODE_REPL_DISABLE_ANALYTICS: '1',
    CUA_REPL_SANDBOX_HELPER: join(home, 'sandbox', helper.path.split('/').at(-2), 'codex-linux-sandbox'), CUA_REPL_SANDBOX_HELPER_SHA256: helper.sha256,
    CUA_REPL_WORKER_NETWORK: 'enabled',
    CUA_SKY_SERVICE: LINUX_ENGINE_SERVICE, CUA_ENGINE_BIN: enginePath, CUA_DESKTOP_MODE: 'shared',
  });
  assert.equal(runtime.paths.moduleDir, join(home, 'modules', runtime.manifest.parts.modules.lock, 'node_modules'), 'the module base is the ModuleTree');
  assert.equal(JSON.parse(env.CUA_REPL_TRUSTED_SERVICES).sky, SKY_SERVICE);
  assert.deepEqual(env.CUA_REPL_TRUSTED_CODE_PATHS.split(':'), [REPL_HOST_DIR, CUA_API_DIR, CUA_API_DOCS_DIR, SANDBOX_DIR, BIN_DIR, join(SKY_SERVICE, '..'), ...SERVICE_SUPPORT_DIRS],
    'cua\'s own code only: the ModuleTree is not trusted, and cua\'s macOS engine service is never trusted on Linux (#171)');
  assert.ok(!env.CUA_REPL_TRUSTED_CODE_PATHS.split(':').includes(ENGINE_SERVICE_DIR));
  assert.equal(launch.sandboxHelperRoot, join(home, 'sandbox'), 'the helper\'s directory, which the scoped preflight protects');
  assert.equal(launch.modulesRoot, join(home, 'modules'), 'the module trees, which the scoped preflight protects');
  // The Linux shape of the deny list (#115 M0c): the home's private directories and run/ one by one, the session re-exposed.
  const {deny, reexpose} = JSON.parse(env.CUA_SANDBOX_DENY_READ);
  assert.deepEqual(deny.slice(-4), ['state', 'remote', 'chrome', 'run'].map(dir => join(home, dir)));
  assert.deepEqual(reexpose, [join(home, 'run', SESSION), join(home, 'run', SESSION, 'tmp')]);
  assert.equal(launch.kernelDir, null, 'under scoped the kernel works in its run directory');
});

// #115 M3: under default run/ is denied to the Linux kernel whole, as under scoped; since nothing is writable to it and
// bubblewrap re-binds only writable roots inside a denied directory, it works in its own directory outside run/
// (<home>/kernel/<session>, its TMPDIR that directory's tmp/), which the launch names and createLaunchDirs makes.
test('a Linux launch under default names the kernel\'s own directory outside run/, and run/ stays denied', t => {
  const {home, runtime} = linux(t, 'arm64');
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, services: {sky: SKY_SERVICE}, resolveOwnNode: ownNode, sandbox: 'default'});
  const kernelDir = join(home, 'kernel', SESSION);
  assert.equal(launch.kernelDir, kernelDir);
  assert.equal(launch.env.CUA_REPL_KERNEL_DIR, kernelDir);
  assert.equal(launch.cwd, join(home, 'run', SESSION), 'the host and the worker keep the run directory');
  const {deny} = JSON.parse(launch.env.CUA_SANDBOX_DENY_READ);
  assert.deepEqual(deny.slice(-4), ['state', 'remote', 'chrome', 'run'].map(dir => join(home, dir)));
  createLaunchDirs(launch);
  for (const dir of [kernelDir, join(kernelDir, 'tmp')]) assert.equal(statSync(dir).mode & 0o777, 0o700, dir);
  removeLaunchDirs(launch);
  assert.equal(existsSync(kernelDir), false, 'removed with the run directory');
  assert.equal(existsSync(launch.cwd), false);
  const macHome = scratchHome(t);
  const mac = buildLaunch({runtime: runtimeFor({home: macHome, pin: parsePin(fixturePin({sha256: 'a'.repeat(64), length: 1})), record: null}), home: macHome, sessionId: SESSION, ambient: AMBIENT, resolveOwnNode: ownNode, sandbox: 'default'});
  assert.equal(mac.kernelDir ?? null, null, 'macOS re-exposes the run directory inside its deny list, so nothing moves there');
  assert.equal(mac.env.CUA_REPL_KERNEL_DIR, undefined);
});

test('the vendor host is refused on Linux (#135), explicitly or as a fallback: no Node 24 refuses the session', t => {
  const {home, runtime} = linux(t, 'arm64');
  assert.throws(() => buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'vendor'}, services: {sky: SKY_SERVICE}}),
    error => error.code === 'repl_host_refused' && /CUA_REPL_HOST=vendor is not supported on Linux/.test(error.message) && /#135/.test(error.message));
  assert.throws(() => buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, services: {sky: SKY_SERVICE},
    resolveOwnNode: () => { throw Object.assign(new Error('none'), {code: 'repl_host_node', tried: []}); }}), {code: 'repl_host_node'});
  assert.throws(() => buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, services: {sky: SKY_SERVICE}, replHost: {host: 'vendor', reason: 'explicit'}}),
    {code: 'repl_host_refused'}, 'a vendor selection handed in is refused too');
});

test('without DBUS_SESSION_BUS_ADDRESS the bus is derived from XDG_RUNTIME_DIR; with neither, no bus variable is set', t => {
  const {home, runtime} = linux(t);
  const {DBUS_SESSION_BUS_ADDRESS, ...ssh} = AMBIENT;
  assert.equal(buildLaunch({runtime, home, sessionId: SESSION, ambient: ssh, resolveOwnNode: ownNode}).env.DBUS_SESSION_BUS_ADDRESS, 'unix:path=/run/user/1000/bus');
  const {XDG_RUNTIME_DIR, ...bare} = ssh;
  const env = buildLaunch({runtime, home, sessionId: SESSION, ambient: bare, resolveOwnNode: ownNode}).env;
  assert.equal('DBUS_SESSION_BUS_ADDRESS' in env || 'XDG_RUNTIME_DIR' in env, false);
});

// A browser-only launch needs Node, the ModuleTree and the helper: no engine, of either kind, and no vendor tree, so it
// builds in a home with neither, CUA_NATIVE_ENGINE=vendor set or not (the pre-flight's §3.3).
test('a Linux browser-only launch with no engine and no vendor tree builds, naming Node, the ModuleTree and the helper only', t => {
  const {home, runtime} = linux(t, 'x64', {engine: false});
  for (const ambient of [AMBIENT, {...AMBIENT, CUA_NATIVE_ENGINE: 'vendor'}, {...AMBIENT, CUA_NATIVE_ENGINE: 'cua'}]) {
    const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient, surfaces: ['browser'], services: {browser: BROWSER_SERVICE}, resolveOwnNode: ownNode});
    const {env} = launch;
    assert.equal(env.CUA_REPL_ENABLED_SURFACES, 'browser');
    for (const key of ['OAI_SKY_LINUX_BIN', 'CUA_SKY_SERVICE', 'SKY_CUA_SERVICE_PATH', 'CUA_ENGINE_BIN', 'CUA_DESKTOP_MODE']) assert.equal(key in env, false, key);
    assert.deepEqual(Object.keys(env).filter(key => /BROWSER/.test(key)).sort(), ['BROWSER_USE_AVAILABLE_BACKENDS', 'BROWSER_USE_BACKEND_PATHS'], 'cua\'s browser service, given cua\'s sockets');
    assert.deepEqual([env.CUA_REPL_SANDBOX_HELPER, env.CUA_REPL_WORKER_NETWORK, env.CODEX_CLI_PATH], [helperFor({home, arch: 'x64'}).path, undefined, undefined],
      'confined by the helper, the worker with no network: nothing it runs needs one');
    assert.equal(launch.command, NODE);
    assert.equal(env.CUA_REPL_NODE_MODULE_DIRS, runtime.paths.moduleDir);
    assert.deepEqual(env.CUA_REPL_TRUSTED_CODE_PATHS.split(':'), [REPL_HOST_DIR, CUA_API_DIR, CUA_API_DOCS_DIR, SANDBOX_DIR, BIN_DIR, join(BROWSER_SERVICE, '..'), ...SERVICE_SUPPORT_DIRS, BROWSER_SERVICE_IMPL_DIR]);
    assert.equal(launch.linuxEngine, null);
    assert.equal(existsSync(join(home, 'runtimes')), false);
  }
});

test('a macOS launch ignores the Linux desktop variables', t => {
  const home = scratchHome(t);
  const runtime = runtimeFor({home, pin: parsePin(fixturePin({sha256: 'a'.repeat(64), length: 1})), record: null});
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT});
  for (const key of [...Object.keys(DESKTOP), 'OAI_SKY_LINUX_BIN']) assert.equal(key in launch.env, false, key);
  assert.equal(launch.env.SKY_CUA_SERVICE_PATH, runtime.paths.skyServiceApp);
  assert.equal(launch.modulesRoot, null, 'no macOS launch changes (M6a)');
});

// launch_app starts what an XDG applications directory holds outside the sandbox (src/repl-host/launch-services.mjs), so
// under scoped no applications directory of the launch's environment may overlap a directory cells can write: the
// preflight refuses that layout, whether the directory exists yet or not.
test('scoped on Linux: an XDG applications directory inside a write root is refused before anything starts', t => {
  const {home, runtime} = linux(t);
  const build = ambient => buildLaunch({runtime, home, sessionId: SESSION, ambient, services: {sky: SKY_SERVICE}, resolveOwnNode: ownNode});
  assertSandboxFits('scoped', build(AMBIENT));
  const inRun = build({...AMBIENT, XDG_DATA_DIRS: `/usr/share:${join(home, 'run', SESSION, 'share')}`});
  assert.throws(() => assertSandboxFits('scoped', inRun), error => error.code === 'sandbox_conflict' && /XDG applications directory/.test(error.message));
  mkdirSync(join(home, 'run', SESSION), {recursive: true});
  symlinkSync(join(home, 'run', SESSION), join(home, 'alias'));
  const linked = build({...AMBIENT, XDG_DATA_DIRS: join(home, 'alias', 'tmp', 'share')});
  assert.throws(() => assertSandboxFits('scoped', linked), error => error.code === 'sandbox_conflict' && /XDG applications directory/.test(error.message), 'through a symlink too');
  assertSandboxFits('default', inRun);
});

// ---- the vendor's engine, retired (#171 M6b; its pre-flight's §2.1) ----

// CUA_NATIVE_ENGINE=vendor is refused at the selection, its tree installed or not, so no launch is built for it.
test('the vendor selection, its tree installed, is refused before any launch: engine_retired', t => {
  const {home, host, runtime} = linux(t, 'x64', {engine: false});
  forgeActiveRuntime(home, {}, {host, ownRuntime: false});
  const ambient = {...AMBIENT, CUA_NATIVE_ENGINE: 'vendor'};
  assert.throws(() => replHostFor({platform: 'linux', arch: host.arch, surfaces: ['computer'], ambient, home, resolveOwnNode: ownNode}), {code: 'engine_retired'});
  assert.throws(() => buildLaunch({runtime, home, sessionId: SESSION, ambient, services: {sky: SKY_SERVICE}, resolveOwnNode: ownNode}), {code: 'engine_retired'});
});

// buildLaunch takes cua's engine from the bound selection and runs nothing else: a Linux computer selection without
// cua's `bin` is a programming error, the vendor's tree it once carried included, and no environment names the vendor's
// helper or a module of @oai/sky.
test('a Linux computer launch requires cua\'s engine from the selection: anything else is a TypeError, and nothing names the vendor\'s engine', t => {
  const {home, runtime, enginePath} = linux(t, 'x64');
  const vendor = {release: 'bound', bin: '/bound/sky_linux_x64', service: '/bound/sky/service.js', moduleDir: '/bound/node_modules'};
  for (const engine of [{engine: 'vendor', reason: 'explicit', status: 'pass', vendor}, {engine: 'vendor', reason: 'explicit', status: 'pass'}, undefined]) {
    const replHost = {host: 'cua', reason: 'linux', node: NODE, ...(engine ? {engine} : {})};
    assert.throws(() => buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, replHost, services: {sky: SKY_SERVICE}}), TypeError, JSON.stringify(engine));
  }
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, services: {sky: SKY_SERVICE}, resolveOwnNode: ownNode});
  assert.equal(env.CUA_ENGINE_BIN, enginePath);
  assert.equal('OAI_SKY_LINUX_BIN' in env, false);
  for (const [name, value] of Object.entries(env)) assert.doesNotMatch(value, /@oai\/sky|sky_linux/, name);
  // A browser-only launch with CUA_NATIVE_ENGINE=vendor builds: it asks for no engine.
  assert.equal(buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_NATIVE_ENGINE: 'vendor'}, surfaces: ['browser'], services: {browser: BROWSER_SERVICE}, resolveOwnNode: ownNode}).linuxEngine, null);
});

// ---- the Node (#171 M6a; the pre-flight's §3.3, F2, F2a) ----

const LINUX_X64 = {platform: 'linux', arch: 'x64'};
const INSTALLER = `node ${CUA_ENTRY} install`;
// ownHostNode on a Linux host with a counted version probe: every path it is asked to run.
function probed() {
  const ran = [];
  const versionOf = path => { ran.push(path); return 'v24.22.0'; };
  return {ran, versionOf};
}
const linuxNode = (home, ambient, versionOf, execPath = '/usr/local/bin/node') => ownHostNode({ambient, home, platform: 'linux', arch: 'x64', versionOf, execPath});

test('the Linux Node: the managed one cua installed, at its pinned version or behind it; never the node running cua or node on PATH', t => {
  const home = scratchHome(t);
  const userBin = join(home, 'user-bin');
  mkdirSync(userBin);
  writeFileSync(join(userBin, 'node'), '#!/bin/sh\necho v24.99.0\n', {mode: 0o755});
  const ambient = {PATH: `${userBin}:/usr/bin`};
  const {ran, versionOf} = probed();
  assert.throws(() => linuxNode(home, ambient, versionOf), error => error.code === 'runtime_not_installed' && /its Node is not installed/.test(error.message)
    && /node \S+\/bin\/cua\.mjs install/.test(error.hint) && !error.message.includes(userBin) && !error.message.includes('/usr/local/bin/node'));
  const pinned = fakeManagedNode(home, LINUX_X64);
  assert.equal(linuxNode(home, ambient, versionOf), pinned, 'at the record\'s version');
  const behind = fakeManagedNode(home, LINUX_X64, {version: '24.0.0'});
  assert.equal(linuxNode(home, ambient, versionOf), behind, 'behind the pin, at or above the floor: it runs (doctor warns)');
  writeFileSync(behind, '#!/bin/sh\necho v24.0.1\n');
  assert.throws(() => linuxNode(home, ambient, versionOf), error => error.code === 'runtime_not_installed' && error.message.includes('is not the binary its install record names'),
    'bytes that are not its record\'s');
  // the recorded bytes, but no longer executable: it would fail at spawn, so the open refuses it, still without a probe
  const unrunnable = fakeManagedNode(home, LINUX_X64);
  chmodSync(unrunnable, 0o644);
  if (process.getuid?.() !== 0)
    assert.throws(() => linuxNode(home, ambient, versionOf), error => error.code === 'runtime_not_installed' && /is not executable/.test(error.message));
  assert.deepEqual(ran, [], 'nothing is run: the managed Node\'s version is its record\'s, its bytes checked');
});

test('CUA_NODE on Linux: a good Node is used; one under the vendor\'s tree, by its spelling or through a link, is refused before anything runs', t => {
  const home = scratchHome(t);
  fakeManagedNode(home, LINUX_X64);
  const good = join(home, 'own-node');
  writeFileSync(good, '#!/bin/sh\necho v24.1.0\n', {mode: 0o755});
  const {ran, versionOf} = probed();
  assert.equal(linuxNode(home, {CUA_NODE: good}, versionOf), good, 'it stands in for the managed Node');
  assert.deepEqual(ran, [good]);
  const vendorNode = join(home, 'runtimes', '26.928.40906-linux-x64', 'cua_node', 'bin', 'node');
  mkdirSync(join(vendorNode, '..'), {recursive: true});
  writeFileSync(vendorNode, '#!/bin/sh\necho v24.21.0\n', {mode: 0o755});
  const link = join(home, 'outside-link');
  symlinkSync(vendorNode, link);
  const dirLink = join(home, 'vendor-bin');
  symlinkSync(join(vendorNode, '..'), dirLink);
  for (const path of [vendorNode, link, join(dirLink, 'node'), join(home, 'x', '..', 'runtimes', 'r', 'node')]) {
    ran.length = 0;
    assert.throws(() => linuxNode(home, {CUA_NODE: path}, versionOf), error => error.code === 'invalid_setting' && error.message.includes(path) && /vendor's tree/.test(error.message)
      && error.message.includes(INSTALLER), path);
    assert.deepEqual(ran, [], `${path}: no probe run`);
  }
  // a path the kernel would refuse (ENOTDIR: through a regular file, or a file with a trailing slash) is refused as
  // written, with no probe run, never reinterpreted (fix wave 2)
  ran.length = 0;
  for (const path of [`${join(home, 'plain')}/../own-node`, `${good}/`, `${good}/.`]) {
    writeFileSync(join(home, 'plain'), 'not a directory');
    assert.throws(() => linuxNode(home, {CUA_NODE: path}, versionOf), error => error.code === 'invalid_setting' && /not a directory/.test(error.message) && error.message.includes(INSTALLER), path);
  }
  assert.deepEqual(ran, []);
  // each refusal gives the override's own fix, then the installer that restores the managed Node
  assert.throws(() => linuxNode(home, {CUA_NODE: join(home, 'absent')}, versionOf), error => error.code === 'repl_host_node' && error.message.includes(INSTALLER));
  assert.throws(() => linuxNode(home, {CUA_NODE: good}, () => 'v22.12.0'), error => error.code === 'repl_host_node' && error.message.includes('v22.12.0') && error.message.includes(INSTALLER));
  assert.throws(() => linuxNode(home, {CUA_NODE: 'node'}, versionOf), {code: 'invalid_setting'});
});

test('the darwin Node lookup is unchanged: CUA_NODE, the managed Node, the node running cua, node on PATH', t => {
  const home = scratchHome(t);
  const bin = join(home, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'node'), '#!/bin/sh\n', {mode: 0o755});
  const versions = {[realpathSync(join(bin, 'node'))]: 'v24.3.0'};
  assert.equal(ownHostNode({ambient: {PATH: bin}, home, platform: 'darwin', execPath: '/nonexistent/node', versionOf: path => versions[path] ?? null}), realpathSync(join(bin, 'node')));
});
