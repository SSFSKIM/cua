// The launch record on Linux (Phase F): the X11 and session-bus variables pass through the ambient allowlist (the bus
// address derived from XDG_RUNTIME_DIR when an SSH session lacks it), the vendor's Linux helper is pinned through
// OAI_SKY_LINUX_BIN, the sandbox is the pinned `codex` file, and no macOS helper app is named. A macOS launch is
// unchanged by any of these variables.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {realpathSync} from 'node:fs';
import {join} from 'node:path';
import {buildLaunch, SKY_SERVICE, BROWSER_SERVICE} from '../src/runtime/launch.mjs';
import {parsePin, runtimeFor} from '../src/runtime/manifest.mjs';
import {scratch, fixturePin, linuxFixturePin} from './fixtures/runtime-fixture.mjs';

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

test('a Linux computer-use launch passes the desktop session through and pins the Linux helper and sandbox CLI', t => {
  const {home, runtime} = linux(t, 'arm64');
  const p = runtime.paths;
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, services: {sky: SKY_SERVICE}});
  assert.deepEqual(env, {
    HOME: '/home/u', USER: 'u', LOGNAME: 'u', LANG: 'C.UTF-8', ...DESKTOP,
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    CODEX_HOME: join(home, 'state', 'codex'),
    CUA_REPL_NODE_REPL_PATH: p.nodeRepl,
    CUA_REPL_ENABLED_SURFACES: 'computer',
    NODE_REPL_NODE_PATH: p.node,
    NODE_REPL_NODE_MODULE_DIRS: p.moduleDir,
    NODE_REPL_TRUSTED_SERVICES: env.NODE_REPL_TRUSTED_SERVICES,
    NODE_REPL_TRUSTED_CODE_PATHS: env.NODE_REPL_TRUSTED_CODE_PATHS,
    NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS: '1000',
    NODE_REPL_DISABLE_ANALYTICS: '1',
    CODEX_CLI_PATH: join(runtime.root, 'codex'),
    OAI_SKY_LINUX_BIN: join(runtime.root, 'cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64'),
    CUA_SKY_VENDOR_SERVICE: p.skyVendorService,
  });
  assert.equal(JSON.parse(env.NODE_REPL_TRUSTED_SERVICES).sky, SKY_SERVICE);
});

test('without DBUS_SESSION_BUS_ADDRESS the bus is derived from XDG_RUNTIME_DIR; with neither, no bus variable is set', t => {
  const {home, runtime} = linux(t);
  const {DBUS_SESSION_BUS_ADDRESS, ...ssh} = AMBIENT;
  assert.equal(buildLaunch({runtime, home, sessionId: SESSION, ambient: ssh}).env.DBUS_SESSION_BUS_ADDRESS, 'unix:path=/run/user/1000/bus');
  const {XDG_RUNTIME_DIR, ...bare} = ssh;
  const env = buildLaunch({runtime, home, sessionId: SESSION, ambient: bare}).env;
  assert.equal('DBUS_SESSION_BUS_ADDRESS' in env || 'XDG_RUNTIME_DIR' in env, false);
});

test('a Linux browser-only launch configures no computer-use helper', t => {
  const {home, runtime} = linux(t);
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, surfaces: ['browser'], services: {browser: BROWSER_SERVICE}});
  assert.equal(env.CUA_REPL_ENABLED_SURFACES, 'browser');
  for (const key of ['OAI_SKY_LINUX_BIN', 'CUA_SKY_VENDOR_SERVICE', 'SKY_CUA_SERVICE_PATH']) assert.equal(key in env, false, key);
  assert.equal(env.CUA_BROWSER_VENDOR_SERVICE, runtime.paths.browserVendorService);
  assert.equal(env.CODEX_CLI_PATH, join(runtime.root, 'codex'));
});

test('a macOS launch ignores the Linux desktop variables', t => {
  const {home, runtime} = runtimeOf(t, fixturePin({sha256: 'a'.repeat(64), length: 1}));
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT});
  for (const key of [...Object.keys(DESKTOP), 'OAI_SKY_LINUX_BIN']) assert.equal(key in env, false, key);
  assert.equal(env.SKY_CUA_SERVICE_PATH, runtime.paths.skyServiceApp);
});
