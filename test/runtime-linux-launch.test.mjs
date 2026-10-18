// The launch record on Linux (Phase F, #115 M3): the X11 and session-bus variables pass through the ambient allowlist
// (the bus address derived from XDG_RUNTIME_DIR when an SSH session lacks it), the vendor's Linux helper is pinned
// through OAI_SKY_LINUX_BIN, the sandbox is cua's pinned helper under the home, and no macOS helper app is named. A
// macOS launch is unchanged by any of these variables.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {realpathSync} from 'node:fs';
import {join} from 'node:path';
import {buildLaunch, SKY_SERVICE, BROWSER_SERVICE} from '../src/runtime/launch.mjs';
import {parsePin, runtimeFor} from '../src/runtime/manifest.mjs';
import {scratch, fixturePin, linuxFixturePin} from './fixtures/runtime-fixture.mjs';
import {helperFor} from '../src/sandbox/linux.mjs';

const SESSION = '6f1c2d3e-0000-4000-8000-000000000002';
const DESKTOP = {DISPLAY: ':0', XAUTHORITY: '/home/u/.Xauthority', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus', XDG_RUNTIME_DIR: '/run/user/1000', XDG_DATA_DIRS: '/usr/local/share:/usr/share'};
const AMBIENT = {HOME: '/home/u', USER: 'u', LOGNAME: 'u', LANG: 'C.UTF-8', PATH: '/home/u/bin:/usr/bin', ...DESKTOP,
  OAI_SKY_LINUX_BIN: '/tmp/evil', SKY_CUA_SERVICE_PATH: '/tmp/Other.app', XDG_CONFIG_HOME: '/home/u/.config', WAYLAND_DISPLAY: 'wayland-0', NODE_OPTIONS: '--require /evil.js'};

function runtimeOf(t, pinJson) {
  const s = scratch();
  t.after(s.cleanup);
  const home = realpathSync(s.dir);
  return {home, runtime: runtimeFor({home, pin: parsePin(pinJson), record: null})};
}
const linux = (t, arch = 'x64') => runtimeOf(t, linuxFixturePin({arch, sha256: 'a'.repeat(64), length: 1}));

const NODE = '/opt/node-24/bin/node';
const ownNode = () => NODE;

// Linux runs cua's own host only (#115 M3): its children go through the pinned helper, the worker alone has the network
// with the computer surface, and no Codex CLI or CODEX_HOME is named.
test('a Linux computer-use launch runs cua\'s own host: the desktop session, the pinned Linux helper, the pinned sandbox helper, the worker\'s network', t => {
  const {home, runtime} = linux(t, 'arm64');
  const p = runtime.paths;
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, services: {sky: SKY_SERVICE}, resolveOwnNode: ownNode});
  assert.deepEqual(launch.replHost, {host: 'cua', reason: 'linux'});
  assert.equal(launch.command, NODE);
  const {env} = launch;
  const helper = helperFor({home, arch: 'arm64'});
  assert.deepEqual(env, {
    HOME: '/home/u', USER: 'u', LOGNAME: 'u', LANG: 'C.UTF-8', ...DESKTOP, TMPDIR: join(home, 'run', SESSION, 'tmp'),
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    CUA_SANDBOX_DENY_READ: env.CUA_SANDBOX_DENY_READ,
    CUA_REPL_ENABLED_SURFACES: 'computer', CUA_REPL_NODE_PATH: NODE, CUA_REPL_OWNED_GROUP: '1', CUA_REPL_NODE_MODULE_DIRS: p.moduleDir,
    CUA_REPL_JS_BANNER: env.CUA_REPL_JS_BANNER, CUA_REPL_UNTRUSTED_ENV_ALLOWLIST: 'CUA_REPL_ENABLED_SURFACES,CUA_REPL_BROWSER_ENV', CUA_REPL_TOOL_OVERRIDES: env.CUA_REPL_TOOL_OVERRIDES,
    CUA_REPL_TRUSTED_SERVICES: env.CUA_REPL_TRUSTED_SERVICES, CUA_REPL_TRUSTED_RPC_ENABLED: '1', CUA_REPL_TRUSTED_CODE_PATHS: env.CUA_REPL_TRUSTED_CODE_PATHS,
    CUA_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS: '1000', NODE_REPL_DISABLE_ANALYTICS: '1',
    CUA_REPL_SANDBOX_HELPER: join(home, 'sandbox', helper.path.split('/').at(-2), 'codex-linux-sandbox'), CUA_REPL_SANDBOX_HELPER_SHA256: helper.sha256,
    CUA_REPL_WORKER_NETWORK: 'enabled',
    OAI_SKY_LINUX_BIN: join(runtime.root, 'cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64'),
    CUA_SKY_VENDOR_SERVICE: p.skyVendorService,
  });
  assert.equal(JSON.parse(env.CUA_REPL_TRUSTED_SERVICES).sky, SKY_SERVICE);
  assert.equal(launch.sandboxHelperRoot, join(home, 'sandbox'), 'the helper\'s directory, which the scoped preflight protects');
  // The Linux shape of the deny list (#115 M0c): the home's private directories and run/ one by one, the session re-exposed.
  const {deny, reexpose} = JSON.parse(env.CUA_SANDBOX_DENY_READ);
  assert.deepEqual(deny.slice(-4), ['state', 'remote', 'chrome', 'run'].map(dir => join(home, dir)));
  assert.deepEqual(reexpose, [join(home, 'run', SESSION), join(home, 'run', SESSION, 'tmp')]);
  // Under default nothing is writable, so nothing would be re-bound inside a denied run/: run/ is left out there.
  const readOnly = JSON.parse(buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, services: {sky: SKY_SERVICE}, resolveOwnNode: ownNode, sandbox: 'default'}).env.CUA_SANDBOX_DENY_READ);
  assert.deepEqual(readOnly.deny.slice(-3), ['state', 'remote', 'chrome'].map(dir => join(home, dir)));
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

test('a Linux browser-only launch configures no computer-use helper', t => {
  const {home, runtime} = linux(t);
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, surfaces: ['browser'], services: {browser: BROWSER_SERVICE}, resolveOwnNode: ownNode});
  assert.equal(env.CUA_REPL_ENABLED_SURFACES, 'browser');
  for (const key of ['OAI_SKY_LINUX_BIN', 'CUA_SKY_VENDOR_SERVICE', 'SKY_CUA_SERVICE_PATH']) assert.equal(key in env, false, key);
  assert.deepEqual(Object.keys(env).filter(key => /BROWSER/.test(key)).sort(), ['BROWSER_USE_AVAILABLE_BACKENDS', 'BROWSER_USE_BACKEND_PATHS'], 'cua\'s browser service, given cua\'s sockets');
  assert.deepEqual([env.CUA_REPL_SANDBOX_HELPER, env.CUA_REPL_WORKER_NETWORK, env.CODEX_CLI_PATH], [helperFor({home, arch: 'x64'}).path, undefined, undefined],
    'confined by the helper, the worker with no network: nothing it runs needs one');
});

test('a macOS launch ignores the Linux desktop variables', t => {
  const {home, runtime} = runtimeOf(t, fixturePin({sha256: 'a'.repeat(64), length: 1}));
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT});
  for (const key of [...Object.keys(DESKTOP), 'OAI_SKY_LINUX_BIN']) assert.equal(key in env, false, key);
  assert.equal(env.SKY_CUA_SERVICE_PATH, runtime.paths.skyServiceApp);
});
