import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, mkdirSync, writeFileSync, realpathSync, symlinkSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {PassThrough} from 'node:stream';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {buildLaunch, browserServiceFor, browserSelectionFor, replHostFor, ownHostNode, NODE_FLOOR, SKY_SERVICE, BROWSER_SERVICE, BROWSER_SERVICE_IMPL_DIR, REPL_HOST_DIR, REPL_HOST_SUPERVISOR, SERVICE_SUPPORT_DIRS} from '../src/runtime/launch.mjs';
import {assertSandboxFits, assertTrustedServicesContained} from '../src/runtime/sandbox.mjs';
import {writeCuaRecord, writeVendorRecord} from './fixtures/route-records.mjs';
import {parsePin, resolveRuntime, runtimeFor} from '../src/runtime/manifest.mjs';
import {scratch, fixturePin} from './fixtures/runtime-fixture.mjs';
import {fakeInstalledHome} from './fixtures/installed-home.mjs';
import {connectionSecrets} from '../src/secrets/store.mjs';
import {openConnection} from '../src/mcp/connection.mjs';
import {listLiveBackends} from '../src/profiles/inventory.mjs';
import {inspectRuntime} from '../src/runtime/doctor.mjs';
import {hostIdentity, REPL_HOST_META_KEY, REPL_HOST_NAME, REPL_HOST_VERSION} from '../src/repl-host/identity.mjs';
import {toolOverrides} from '../src/repl-host/instructions.mjs';

const SESSION = '6f1c2d3e-0000-4000-8000-000000000001';
const AMBIENT = {
  HOME: '/Users/someone', USER: 'someone', LOGNAME: 'someone', TMPDIR: '/var/folders/x/T/', LANG: 'en_US.UTF-8',
  __CF_USER_TEXT_ENCODING: '0x1F5:0x0:0x0', PATH: '/opt/homebrew/bin:/usr/bin', SHELL: '/bin/zsh',
  CODEX_HOME: '/Users/someone/.codex', NODE_OPTIONS: '--require /evil.js', SECRET_TOKEN: 'nope',
  NODE_REPL_TRUSTED_SERVICES: '{"sky":"/evil.mjs"}', NODE_REPL_NODE_MODULE_DIRS: '/Applications/ChatGPT.app/x',
  NODE_REPL_TRUSTED_CODE_PATHS: '/', NODE_REPL_UNTRUSTED_ENV_ALLOWLIST: 'SECRET_TOKEN', NODE_REPL_WORKER_WRAPPER: '/w.mjs',
  NODE_REPL_DENIED_PATHS: '', NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS: '/tmp/x.sock', NODE_REPL_HOST_SERVICES_PIPE_PATH: '/tmp/h',
  SKY_CUA_SERVICE_NATIVE_PIPE_PATH: '/tmp/other.sock', SKY_CUA_SERVICE_PATH: '/Applications/Other.app',
  BROWSER_USE_AVAILABLE_BACKENDS: 'chrome,iab', CUA_REPL_ENABLED_SURFACES: 'browser,computer', CUA_REPL_BROWSER_ENV: 'x',
  CUA_SHIM_CODEX_HOME: '/tmp/x', CUA_HOME: '/elsewhere',
};

function fixtureRuntime(t) {
  const s = scratch();
  t.after(s.cleanup);
  const home = realpathSync(s.dir);
  const pin = parsePin(fixturePin({sha256: 'a'.repeat(64), length: 1}));
  return {home, dir: s.dir, runtime: runtimeFor({home, pin, record: null})};
}

test('the launch runs the relocated vendor node on the relocated cua-repl entry, in an owned per-connection directory', t => {
  const {home, runtime} = fixtureRuntime(t);
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT});
  assert.equal(launch.command, runtime.paths.node);
  assert.deepEqual(launch.args, [runtime.paths.cuaRepl]);
  assert.equal(launch.cwd, join(home, 'run', SESSION));
});

test('the launch environment is an allowlist: OS basics plus relocated settings, nothing ambient that could redirect it', t => {
  const {home, runtime} = fixtureRuntime(t);
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT});
  const p = runtime.paths;
  assert.deepEqual(env, {
    HOME: '/Users/someone', USER: 'someone', LOGNAME: 'someone', TMPDIR: '/var/folders/x/T/', LANG: 'en_US.UTF-8',
    __CF_USER_TEXT_ENCODING: '0x1F5:0x0:0x0',
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    CODEX_HOME: join(home, 'state', 'codex'),
    CUA_REPL_NODE_REPL_PATH: p.nodeRepl,
    CUA_REPL_ENABLED_SURFACES: 'computer',
    NODE_REPL_NODE_PATH: p.node,
    NODE_REPL_NODE_MODULE_DIRS: p.moduleDir,
    NODE_REPL_TRUSTED_CODE_PATHS: p.moduleDir,
    NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS: '1000',
    NODE_REPL_DISABLE_ANALYTICS: '1',
    CODEX_CLI_PATH: p.codexCli,
    SKY_CUA_SERVICE_PATH: p.skyServiceApp,
    CUA_SKY_VENDOR_SERVICE: p.skyVendorService,
  });
});

test('native-only launches never enable or configure the browser surface', t => {
  const {home, runtime} = fixtureRuntime(t);
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT});
  assert.equal(env.CUA_REPL_ENABLED_SURFACES, 'computer');
  assert.deepEqual(Object.keys(env).filter(k => /BROWSER/.test(k)), []);
  assert.equal(env.NODE_REPL_TRUSTED_SERVICES, undefined, 'unset lets the vendor launcher pick only @oai/sky/service for the computer surface');
});

test('a trusted sky wrapper is registered by real path; its directory and the owned modules it imports are trusted alongside the vendor modules', t => {
  const {home, dir, runtime} = fixtureRuntime(t);
  const wrapper = join(home, 'wrapper-src', 'services', 'sky.mjs');
  mkdirSync(dirname(wrapper), {recursive: true});
  writeFileSync(wrapper, 'export async function handleRpc() {}\n');
  // Registered through a symlink (as with `npm link`): the trusted worker checks real paths.
  symlinkSync(join(home, 'wrapper-src'), join(dir, 'linked'));
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, services: {sky: join(dir, 'linked', 'services', 'sky.mjs')}});
  assert.deepEqual(JSON.parse(env.NODE_REPL_TRUSTED_SERVICES), {sky: wrapper});
  assert.deepEqual(env.NODE_REPL_TRUSTED_CODE_PATHS.split(':'), [runtime.paths.moduleDir, dirname(wrapper), ...SERVICE_SUPPORT_DIRS]);
  assert.equal(env.CUA_SKY_VENDOR_SERVICE, runtime.paths.skyVendorService);
});

test('services must be existing absolute modules for a known service name', t => {
  const {home, runtime} = fixtureRuntime(t);
  const expect = code => err => { assert.equal(err.code, code); return true; };
  assert.throws(() => buildLaunch({runtime, home, sessionId: SESSION, services: {sky: 'relative/sky.mjs'}}), expect('invalid_service'));
  assert.throws(() => buildLaunch({runtime, home, sessionId: SESSION, services: {sky: join(home, 'absent.mjs')}}), expect('invalid_service'));
  assert.throws(() => buildLaunch({runtime, home, sessionId: SESSION, services: {browser: '/x.mjs'}}), expect('invalid_service'));
});

test('the secret store directory reaches the launch environment only as an explicit value', t => {
  const {home, runtime} = fixtureRuntime(t);
  const dir = '/Users/u/.config/claude-secrets';
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, secretsDir: dir});
  assert.equal(env.CUA_SECRETS_DIR, dir);
  assert.equal(env.CUA_SECRETS_UNAVAILABLE, undefined);
  assert.equal(env.NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS, undefined);
  assert.equal(env.NODE_REPL_UNTRUSTED_ENV_ALLOWLIST, undefined, 'cells must not be granted the secrets variables');
  const without = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT}).env;
  assert.equal(Object.keys(without).some(k => k.startsWith('CUA_SECRETS_')), false);
  assert.throws(() => buildLaunch({runtime, home, sessionId: SESSION, secretsDir: 'relative/dir'}), err => err.code === 'invalid_secrets_dir');
  // The project's directory travels beside the global one, never alone.
  const projectDir = `${dir}/projects/-Users-u-repo`;
  const tiered = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, secretsDir: dir, secretsProjectDir: projectDir}).env;
  assert.equal(tiered.CUA_SECRETS_DIR, dir);
  assert.equal(tiered.CUA_SECRETS_PROJECT_DIR, projectDir);
  assert.throws(() => buildLaunch({runtime, home, sessionId: SESSION, secretsDir: dir, secretsProjectDir: 'relative/dir'}), err => err.code === 'invalid_secrets_dir');
  assert.throws(() => buildLaunch({runtime, home, sessionId: SESSION, secretsProjectDir: projectDir}), err => err.code === 'invalid_secrets_dir');
});

test('the launch carries only the store directories the connection resolved, never ones from the session\'s environment', t => {
  const {home, runtime} = fixtureRuntime(t);
  const ambient = {...AMBIENT, HOME: '/Users/u', CUA_SECRETS_PROJECT_DIR: '/tmp/planted', CUA_SECRETS_DIR: '/tmp/planted-global'};
  const off = buildLaunch({runtime, home, sessionId: SESSION, ambient}).env;
  assert.equal(Object.keys(off).some(k => k.startsWith('CUA_SECRETS_')), false);
  const secrets = connectionSecrets({enabled: true, env: ambient, project: '/work/repo'});
  const on = buildLaunch({runtime, home, sessionId: SESSION, ambient, secretsDir: secrets.dir, secretsProjectDir: secrets.projectDir}).env;
  assert.equal(on.CUA_SECRETS_DIR, '/Users/u/.config/claude-secrets');
  assert.equal(on.CUA_SECRETS_PROJECT_DIR, '/Users/u/.config/claude-secrets/projects/-work-repo');
});

test('the session id becomes a path segment, so only plain identifiers are accepted', t => {
  const {home, runtime} = fixtureRuntime(t);
  for (const bad of ['', '../x', 'a/b', '.', '..', 'x'.repeat(200)])
    assert.throws(() => buildLaunch({runtime, home, sessionId: bad}), err => err.code === 'invalid_session_id', JSON.stringify(bad));
});

test('the launch resolves the home to its real path so trusted paths match what the worker sees', t => {
  const {home, dir, runtime} = fixtureRuntime(t);
  symlinkSync(home, join(dir, 'home-link'));
  const {env, cwd} = buildLaunch({runtime, home: join(dir, 'home-link'), sessionId: SESSION, ambient: AMBIENT});
  assert.equal(env.CODEX_HOME, join(home, 'state', 'codex'));
  assert.equal(cwd, join(home, 'run', SESSION));
});

test('trusted code is only the vendor modules and owned source, never a directory the runtime or model code writes', t => {
  const {home, runtime} = fixtureRuntime(t);
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, services: {sky: SKY_SERVICE}});
  const repo = realpathSync(new URL('..', import.meta.url).pathname);
  const trusted = env.NODE_REPL_TRUSTED_CODE_PATHS.split(':');
  assert.deepEqual(trusted, [runtime.paths.moduleDir, join(repo, 'src', 'services'), join(repo, 'src', 'secrets')]);
  for (const root of trusted) {
    assert.ok(!(root + '/').startsWith(join(home, 'state') + '/') && !(root + '/').startsWith(join(home, 'run') + '/'), `${root} is runtime-writable state`);
  }
  assert.equal(JSON.parse(env.NODE_REPL_TRUSTED_SERVICES).sky, join(repo, 'src', 'services', 'sky.mjs'));
});

test('without a store the launch tells the trusted worker why, so a secret reference fails with that reason', t => {
  const {home, runtime} = fixtureRuntime(t);
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, secretsUnavailable: 'secrets_disabled'});
  assert.equal(env.CUA_SECRETS_UNAVAILABLE, 'secrets_disabled');
  assert.equal(env.CUA_SECRETS_DIR, undefined);
  const both = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, secretsDir: '/h/.config/claude-secrets', secretsUnavailable: 'secrets_disabled'}).env;
  assert.equal(both.CUA_SECRETS_UNAVAILABLE, undefined, 'a store wins');
  assert.throws(() => buildLaunch({runtime, home, sessionId: SESSION, secretsUnavailable: 'Bad Reason!'}), err => err.code === 'invalid_secrets_reason');
});

// ---- surfaces (M11) -------------------------------------------------------------------------------------------

test('the browser surface registers the trusted browser wrapper and configures the vendor browser service', t => {
  const {home, runtime} = fixtureRuntime(t);
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, surfaces: ['computer', 'browser'], services: {sky: SKY_SERVICE, browser: BROWSER_SERVICE}});
  assert.equal(env.CUA_REPL_ENABLED_SURFACES, 'computer,browser');
  assert.deepEqual(JSON.parse(env.NODE_REPL_TRUSTED_SERVICES), {sky: SKY_SERVICE, browser: BROWSER_SERVICE});
  assert.equal(env.CUA_BROWSER_VENDOR_SERVICE, runtime.paths.browserVendorService);
  assert.equal(env.BROWSER_USE_AVAILABLE_BACKENDS, 'chrome');
  assert.equal(env.CUA_SKY_VENDOR_SERVICE, runtime.paths.skyVendorService);
  // The vendor discovers its hosts itself; no explicit backend list, no network or security override.
  for (const key of ['BROWSER_USE_BACKEND_PATHS', 'BROWSER_USE_DISABLE_AMBIENT_NETWORK', 'BROWSER_USE_SECURITY_MODE', 'BROWSER_USE_PREFERRED_EXTENSION_INSTANCE_ID'])
    assert.equal(env[key], undefined, key);
  assert.deepEqual(Object.keys(env).filter(k => /BROWSER/.test(k)).sort(), ['BROWSER_USE_AVAILABLE_BACKENDS', 'CUA_BROWSER_SERVICE', 'CUA_BROWSER_VENDOR_SERVICE']);
  assert.equal(env.CUA_BROWSER_SERVICE, 'vendor', 'a home with no registration is on the ChatGPT extension route: the vendor\'s service, written out');
  assert.deepEqual(env.NODE_REPL_TRUSTED_CODE_PATHS.split(':'), [runtime.paths.moduleDir, dirname(BROWSER_SERVICE), ...SERVICE_SUPPORT_DIRS]);
});

test('a browser-only launch has no computer-use service or native helper configuration', t => {
  const {home, runtime} = fixtureRuntime(t);
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, surfaces: ['browser'], services: {browser: BROWSER_SERVICE}});
  assert.equal(env.CUA_REPL_ENABLED_SURFACES, 'browser');
  assert.deepEqual(JSON.parse(env.NODE_REPL_TRUSTED_SERVICES), {browser: BROWSER_SERVICE});
  assert.equal(env.SKY_CUA_SERVICE_PATH, undefined);
  assert.equal(env.CUA_SKY_VENDOR_SERVICE, undefined);
  assert.equal(env.CODEX_CLI_PATH, runtime.paths.codexCli, 'the runtime sandbox is kept whatever the surface');
});

test('cua\'s service is the default selection on the cua route, unset or empty, as well as named: its directory is trusted, and nothing wider', t => {
  const {home, runtime} = fixtureRuntime(t);
  writeCuaRecord(home);
  const repo = realpathSync(new URL('..', import.meta.url).pathname);
  assert.equal(BROWSER_SERVICE_IMPL_DIR, join(repo, 'src', 'browser-service'));
  for (const ambient of [AMBIENT, {...AMBIENT, CUA_BROWSER_SERVICE: ''}, {...AMBIENT, CUA_BROWSER_SERVICE: 'cua'}]) {
    const label = JSON.stringify(ambient.CUA_BROWSER_SERVICE);
    const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient, surfaces: ['browser'], services: {browser: BROWSER_SERVICE}});
    assert.equal(env.CUA_BROWSER_SERVICE, 'cua', `${label}: the selection is written out, so the wrapper never falls back on a default`);
    assert.deepEqual(env.NODE_REPL_TRUSTED_CODE_PATHS.split(':'), [runtime.paths.moduleDir, dirname(BROWSER_SERVICE), ...SERVICE_SUPPORT_DIRS, BROWSER_SERVICE_IMPL_DIR], label);
    for (const wider of [repo, join(repo, 'src'), home]) assert.ok(!env.NODE_REPL_TRUSTED_CODE_PATHS.split(':').includes(wider), `${label}: ${wider}`);
    assert.equal(env.CUA_BROWSER_VENDOR_SERVICE, runtime.paths.browserVendorService, `${label}: the vendor stays configured for the switch back`);
    assert.equal(env.BROWSER_USE_AVAILABLE_BACKENDS, 'chrome', label);
  }
});

test('the vendor selection, the one-release rollback, is explicit and trusts no cua service directory', t => {
  const {home, runtime} = fixtureRuntime(t);
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_BROWSER_SERVICE: 'vendor'}, surfaces: ['browser'], services: {browser: BROWSER_SERVICE}});
  assert.equal(env.CUA_BROWSER_SERVICE, 'vendor');
  assert.deepEqual(env.NODE_REPL_TRUSTED_CODE_PATHS.split(':'), [runtime.paths.moduleDir, dirname(BROWSER_SERVICE), ...SERVICE_SUPPORT_DIRS]);
  assert.equal(env.CUA_BROWSER_VENDOR_SERVICE, runtime.paths.browserVendorService);
});

// The default follows the home's active Chrome route (spec 2026-10-13-own-browser-service-design.md, Decision Log, M5
// task 1 and its review): the route backend discovery uses (chromeRoute, the most recent registration), so the service
// and the sockets it is given always agree. cua's service on the cua route or in MAWS client mode, the vendor's
// otherwise (no registration is the ChatGPT extension route, as effectiveRoute reads it).
test('unset, the browser service follows the active route: none, vendor, cua, both in each order, MAWS client mode; an explicit value always wins', t => {
  const home = ({vendor, cua} = {}) => {
    const s = scratch();
    t.after(s.cleanup);
    const dir = realpathSync(s.dir);
    if (vendor !== undefined) writeVendorRecord(dir, {at: vendor});
    if (cua !== undefined) writeCuaRecord(dir, {at: cua});
    return dir;
  };
  const routes = {
    'no registration': [home(), 'vendor', 'chatgpt_extension_route'],
    'vendor route': [home({vendor: 1000}), 'vendor', 'chatgpt_extension_route'],
    'cua route': [home({cua: 1000}), 'cua', 'cua_route'],
    'both, cua registered last': [home({vendor: 1000, cua: 2000}), 'cua', 'cua_route'],
    'both, vendor registered last': [home({vendor: 2000, cua: 1000}), 'vendor', 'chatgpt_extension_route'],
  };
  for (const ambient of [{}, {CUA_BROWSER_SERVICE: ''}]) {
    for (const [label, [dir, service, reason]] of Object.entries(routes)) {
      assert.deepEqual(browserServiceFor(ambient, dir), {service, reason}, label);
      assert.deepEqual(browserServiceFor({...ambient, CUA_BROWSER_BACKENDS: '/maws/a.sock'}, dir), service === 'cua' ? {service, reason} : {service: 'cua', reason: 'maws_client_mode'}, `${label}, MAWS client mode`);
    }
    assert.deepEqual(browserServiceFor({...ambient, CUA_BROWSER_BACKENDS: ':'}, routes['no registration'][0]), {service: 'vendor', reason: 'chatgpt_extension_route'}, 'an empty backend list is no client mode');
  }
  for (const [label, [dir]] of Object.entries(routes)) {
    assert.deepEqual(browserServiceFor({CUA_BROWSER_SERVICE: 'cua'}, dir), {service: 'cua', reason: 'explicit'}, label);
    assert.deepEqual(browserServiceFor({CUA_BROWSER_SERVICE: 'vendor'}, dir), {service: 'vendor', reason: 'explicit'}, label);
    assert.deepEqual(browserServiceFor({CUA_BROWSER_SERVICE: 'vendor', CUA_BROWSER_BACKENDS: '/maws/a.sock'}, dir), {service: 'vendor', reason: 'explicit'}, label);
  }
  assert.throws(() => browserServiceFor({CUA_BROWSER_SERVICE: 'openai'}, routes['no registration'][0]), err => err.code === 'invalid_browser_service');
});

test('with both registrations the launch\'s service and its backend sockets follow the same route, whichever was registered last', t => {
  for (const [vendorAt, cuaAt, service] of [[2000, 1000, 'vendor'], [1000, 2000, 'cua']]) {
    const {home, runtime} = fixtureRuntime(t);
    writeVendorRecord(home, {at: vendorAt});
    writeCuaRecord(home, {at: cuaAt});
    const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, surfaces: ['browser'], services: {browser: BROWSER_SERVICE}});
    assert.equal(env.CUA_BROWSER_SERVICE, service, `${service} registered last`);
    if (service === 'vendor') assert.equal(env.BROWSER_USE_BACKEND_PATHS, undefined, 'the vendor service discovers OpenAI\'s hosts itself');
    else assert.equal(typeof env.BROWSER_USE_BACKEND_PATHS, 'string', 'cua\'s service is given cua\'s host sockets');
    assert.equal(env.NODE_REPL_TRUSTED_CODE_PATHS.split(':').includes(BROWSER_SERVICE_IMPL_DIR), service === 'cua');
  }
});

test('a home on the ChatGPT extension route launches the vendor\'s service by default, written out, with no cua service directory trusted', t => {
  const {home, runtime} = fixtureRuntime(t);
  writeVendorRecord(home);
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, surfaces: ['browser'], services: {browser: BROWSER_SERVICE}});
  assert.equal(env.CUA_BROWSER_SERVICE, 'vendor');
  assert.ok(!env.NODE_REPL_TRUSTED_CODE_PATHS.split(':').includes(BROWSER_SERVICE_IMPL_DIR));
  const explicit = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_BROWSER_SERVICE: 'cua'}, surfaces: ['browser'], services: {browser: BROWSER_SERVICE}}).env;
  assert.equal(explicit.CUA_BROWSER_SERVICE, 'cua', 'an explicit value wins over the route');
  assert.ok(explicit.NODE_REPL_TRUSTED_CODE_PATHS.split(':').includes(BROWSER_SERVICE_IMPL_DIR));
});

test('an unknown browser service selection is refused; without the browser surface the selection is ignored', t => {
  const {home, runtime} = fixtureRuntime(t);
  for (const value of ['Cua', 'openai', ' cua', 'cua,vendor'])
    assert.throws(() => buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_BROWSER_SERVICE: value}, surfaces: ['browser'], services: {browser: BROWSER_SERVICE}}), err => err.code === 'invalid_browser_service', value);
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_BROWSER_SERVICE: 'cua'}});
  assert.deepEqual(Object.keys(env).filter(k => /BROWSER/.test(k)), []);
  assert.ok(!env.NODE_REPL_TRUSTED_CODE_PATHS.split(':').includes(BROWSER_SERVICE_IMPL_DIR));
});

test('surfaces are canonical: computer by default, order-independent, and only the two vendor surfaces', t => {
  const {home, runtime} = fixtureRuntime(t);
  assert.equal(buildLaunch({runtime, home, sessionId: SESSION}).env.CUA_REPL_ENABLED_SURFACES, 'computer');
  const reversed = buildLaunch({runtime, home, sessionId: SESSION, surfaces: ['browser', 'computer'], services: {sky: SKY_SERVICE, browser: BROWSER_SERVICE}});
  assert.equal(reversed.env.CUA_REPL_ENABLED_SURFACES, 'computer,browser');
  for (const bad of [[], ['iab'], ['computer', 'computer'], 'computer', [' browser']])
    assert.throws(() => buildLaunch({runtime, home, sessionId: SESSION, surfaces: bad}), err => err.code === 'invalid_surfaces', JSON.stringify(bad));
});

test('registered services must match the enabled surfaces exactly, so no surface silently runs without its wrapper', t => {
  const {home, runtime} = fixtureRuntime(t);
  const expect = err => err.code === 'invalid_service';
  assert.throws(() => buildLaunch({runtime, home, sessionId: SESSION, surfaces: ['computer', 'browser'], services: {sky: SKY_SERVICE}}), expect);
  assert.throws(() => buildLaunch({runtime, home, sessionId: SESSION, surfaces: ['browser'], services: {sky: SKY_SERVICE, browser: BROWSER_SERVICE}}), expect);
  assert.throws(() => buildLaunch({runtime, home, sessionId: SESSION, services: {browser: BROWSER_SERVICE}}), expect);
});

// ---- REPL host selection (spec 2026-10-14-own-repl-host-design.md, "Selection is a connection fact") ----------------

const EARLY = 1_760_000_000;
const LATE = 1_760_090_000;
const DARWIN = {platform: 'darwin', arch: 'arm64'};
const LINUX = {platform: 'linux', arch: 'x64'};
const COMPUTER = ['computer'];
const BROWSER = ['browser'];
const BOTH = ['computer', 'browser'];
const outcome = fn => { try { return fn(); } catch (error) { return {code: error.code, message: error.message}; } };

// A scratch Node stand-in: an executable that answers --version as a Node of `version` would (or fails).
function fakeNode(dir, name, version) {
  const path = join(dir, name);
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, version === null ? '#!/bin/sh\nexit 3\n' : `#!/bin/sh\necho v${version}\n`);
  chmodSync(path, 0o755);
  return path;
}

test('the browser selection keeps its provenance: the setting\'s explicitness, the active route and the registration that decided it', t => {
  const home = ({vendor, cua} = {}) => {
    const s = scratch();
    t.after(s.cleanup);
    if (vendor !== undefined) writeVendorRecord(s.dir, {at: vendor});
    if (cua !== undefined) writeCuaRecord(s.dir, {at: cua});
    return realpathSync(s.dir);
  };
  const none = home(), chatgpt = home({vendor: EARLY}), cua = home({cua: EARLY});
  const cuaLast = home({vendor: EARLY, cua: LATE}), vendorLast = home({vendor: LATE, cua: EARLY});
  for (const unset of [{}, {CUA_BROWSER_SERVICE: ''}]) {
    assert.deepEqual(browserSelectionFor(unset, none), {service: 'vendor', reason: 'chatgpt_extension_route', explicit: false, route: null, registration: null});
    assert.deepEqual(browserSelectionFor(unset, chatgpt), {service: 'vendor', reason: 'chatgpt_extension_route', explicit: false, route: 'vendor', registration: {route: 'vendor', at: EARLY * 1000}});
    assert.deepEqual(browserSelectionFor(unset, cua), {service: 'cua', reason: 'cua_route', explicit: false, route: 'cua', registration: {route: 'cua', at: EARLY * 1000}});
    assert.deepEqual(browserSelectionFor(unset, cuaLast), {service: 'cua', reason: 'cua_route', explicit: false, route: 'cua', registration: {route: 'cua', at: LATE * 1000}});
    assert.deepEqual(browserSelectionFor(unset, vendorLast), {service: 'vendor', reason: 'chatgpt_extension_route', explicit: false, route: 'vendor', registration: {route: 'vendor', at: LATE * 1000}});
    assert.deepEqual(browserSelectionFor({...unset, CUA_BROWSER_BACKENDS: '/maws/a.sock'}, chatgpt), {service: 'cua', reason: 'maws_client_mode', explicit: false, route: 'vendor', registration: null}, 'MAWS, not a registration, decided it');
  }
  assert.deepEqual(browserSelectionFor({CUA_BROWSER_SERVICE: 'cua'}, chatgpt), {service: 'cua', reason: 'explicit', explicit: true, route: 'vendor', registration: null});
  assert.deepEqual(browserSelectionFor({CUA_BROWSER_SERVICE: 'vendor'}, cua), {service: 'vendor', reason: 'explicit', explicit: true, route: 'cua', registration: null});
  // browserServiceFor stays the {service, reason} projection its consumers (doctor, the live runners' attestation) read.
  for (const dir of [none, chatgpt, cua, cuaLast, vendorLast]) {
    const {service, reason} = browserSelectionFor({}, dir);
    assert.deepEqual(browserServiceFor({}, dir), {service, reason});
  }
  assert.throws(() => browserSelectionFor({CUA_BROWSER_SERVICE: 'openai'}, none), err => err.code === 'invalid_browser_service');
});

// Literal selections, so the table below reads as the spec's table does.
const selection = (service, reason, {route = null, registration = null} = {}) => ({service, reason, explicit: reason === 'explicit', route, registration});
const NO_REGISTRATION = selection('vendor', 'chatgpt_extension_route');
const CHATGPT_ROUTE = selection('vendor', 'chatgpt_extension_route', {route: 'vendor', registration: {route: 'vendor', at: EARLY * 1000}});
const CUA_ROUTE = selection('cua', 'cua_route', {route: 'cua', registration: {route: 'cua', at: EARLY * 1000}});
const MAWS = selection('cua', 'maws_client_mode', {route: 'vendor'});
const EXPLICIT_CUA = selection('cua', 'explicit', {route: 'vendor'});
const EXPLICIT_VENDOR = selection('vendor', 'explicit', {route: 'cua'});
const SELECTIONS = {NO_REGISTRATION, CHATGPT_ROUTE, CUA_ROUTE, MAWS, EXPLICIT_CUA, EXPLICIT_VENDOR};
const hostFor = (platform, surfaces, browserSelection, host) => outcome(() => replHostFor({platform, surfaces, ambient: host === undefined ? {} : {CUA_REPL_HOST: host}, browserSelection: surfaces.includes('browser') ? browserSelection : null}));

test('the REPL host follows the selection table: vendor browser routes and macOS computer keep vendor, every other session keeps the staged vendor default until M5', () => {
  const vendor = reason => ({host: 'vendor', reason});
  for (const unset of [undefined, '']) {
    const label = what => `${what}, CUA_REPL_HOST=${JSON.stringify(unset)}`;
    for (const [platform, surfaces, browserSelection, expected] of [
      ['darwin', BROWSER, NO_REGISTRATION, vendor('vendor_browser_route')],
      ['linux', BOTH, CHATGPT_ROUTE, vendor('vendor_browser_route')],
      ['linux', BROWSER, EXPLICIT_VENDOR, vendor('vendor_browser_route')],
      ['darwin', BOTH, NO_REGISTRATION, vendor('vendor_browser_route')],
      ['linux', COMPUTER, null, vendor('staged_vendor_default')],
      ['linux', BROWSER, CUA_ROUTE, vendor('staged_vendor_default')],
      ['linux', BOTH, MAWS, vendor('staged_vendor_default')],
      ['darwin', BROWSER, CUA_ROUTE, vendor('staged_vendor_default')],
      ['darwin', BROWSER, MAWS, vendor('staged_vendor_default')],
      ['darwin', BROWSER, EXPLICIT_CUA, vendor('staged_vendor_default')],
      ['darwin', COMPUTER, null, vendor('macos_native_peer_requires_vendor')],
      ['darwin', BOTH, CUA_ROUTE, vendor('macos_native_peer_requires_vendor')],
      ['darwin', BOTH, MAWS, vendor('macos_native_peer_requires_vendor')],   // MAWS client mode does not override macOS computer
    ]) assert.deepEqual(hostFor(platform, surfaces, browserSelection, unset), expected, label(`${platform} ${surfaces} ${JSON.stringify(browserSelection)}`));
  }
  for (const platform of ['darwin', 'linux']) for (const surfaces of [COMPUTER, BROWSER, BOTH]) for (const browserSelection of Object.values(SELECTIONS))
    assert.deepEqual(hostFor(platform, surfaces, browserSelection, 'vendor'), vendor('explicit'), `${platform} ${surfaces}: an explicit vendor is the rollback everywhere`);
});

test('an explicit CUA_REPL_HOST=cua is honoured where the own host can run, and otherwise refused before launch, never downgraded to vendor', () => {
  for (const [platform, surfaces, browserSelection] of [['linux', COMPUTER, null], ['linux', BROWSER, CUA_ROUTE], ['linux', BOTH, MAWS], ['darwin', BROWSER, CUA_ROUTE], ['darwin', BROWSER, MAWS], ['darwin', BROWSER, EXPLICIT_CUA],
    ['linux', COMPUTER, EXPLICIT_VENDOR]])   // without the browser surface the browser setting is not read, as the launch ignores it
    assert.deepEqual(hostFor(platform, surfaces, browserSelection, 'cua'), {host: 'cua', reason: 'explicit'}, `${platform} ${surfaces} ${browserSelection?.reason}`);

  const refused = (platform, surfaces, browserSelection, ...patterns) => {
    const result = hostFor(platform, surfaces, browserSelection, 'cua');
    assert.equal(result.code, 'repl_host_refused', `${platform} ${surfaces} ${browserSelection?.reason}: ${JSON.stringify(result)}`);
    for (const pattern of patterns) assert.match(result.message, pattern);
  };
  // The explicitly contradictory pair: a migration diagnostic.
  refused('linux', BROWSER, EXPLICIT_VENDOR, /CUA_REPL_HOST=cua and CUA_BROWSER_SERVICE=vendor contradict/, /unset CUA_BROWSER_SERVICE/, /CUA_REPL_HOST=vendor/);
  refused('darwin', BOTH, EXPLICIT_VENDOR, /contradict/);
  // An implicit vendor-browser route: the route, the registration that decided it, and how to move the home.
  refused('darwin', BROWSER, NO_REGISTRATION, /the ChatGPT extension route/, /no Chrome registration/, /cua chrome register/);
  refused('linux', BOTH, CHATGPT_ROUTE, /the ChatGPT extension route/, new RegExp(`cua chrome register --vendor\\) of ${new Date(EARLY * 1000).toISOString()}`), /Run `cua chrome register` to move this home to the cua route/);
  // macOS computer: the native helper's peer rule.
  refused('darwin', COMPUTER, null, /macOS/, /#117/, /CUA_SHIM_SURFACES=browser/);
  refused('darwin', BOTH, CUA_ROUTE, /#117/);
  refused('darwin', BOTH, MAWS, /#117/);

  // Whatever the inputs: no override never selects cua before M5, vendor is always vendor, cua is cua or a refusal.
  for (const platform of ['darwin', 'linux']) for (const surfaces of [COMPUTER, BROWSER, BOTH]) for (const browserSelection of Object.values(SELECTIONS)) {
    assert.equal(hostFor(platform, surfaces, browserSelection, undefined).host, 'vendor');
    const cua = hostFor(platform, surfaces, browserSelection, 'cua');
    assert.ok(cua.host === 'cua' || cua.code === 'repl_host_refused', JSON.stringify(cua));
  }
});

test('an unknown CUA_REPL_HOST is refused', () => {
  for (const value of ['Cua', 'own', ' cua', 'cua,vendor', 'node_repl'])
    assert.equal(hostFor('linux', COMPUTER, null, value).code, 'invalid_repl_host', value);
});

test('the own host\'s Node is the first of CUA_NODE, the running node and node on PATH whose --version is at least 24, resolved to its real path', t => {
  assert.equal(NODE_FLOOR, 24);
  const s = scratch();
  t.after(s.cleanup);
  const dir = realpathSync(s.dir);
  const v26 = fakeNode(dir, 'a/node26', '26.0.0'), v24 = fakeNode(dir, 'b/node24', '24.0.0'), v22 = fakeNode(dir, 'c/node22', '22.23.2');
  const broken = fakeNode(dir, 'd/broken', null);
  const onPath = fakeNode(dir, 'path/node', '24.18.0');
  const oldOnPath = fakeNode(dir, 'oldpath/node', '23.11.1');
  symlinkSync(v26, join(dir, 'linked-node'));
  const PATH = `relative/bin:${join(dir, 'empty')}:${dirname(onPath)}`;

  assert.equal(ownHostNode({ambient: {CUA_NODE: v26, PATH}, execPath: v24}), v26, 'an explicit CUA_NODE that qualifies comes first');
  assert.equal(ownHostNode({ambient: {CUA_NODE: join(dir, 'linked-node')}, execPath: v22}), v26, 'resolved to the real executable');
  assert.equal(ownHostNode({ambient: {CUA_NODE: v22, PATH}, execPath: v24}), v24, 'then the node running cua');
  assert.equal(ownHostNode({ambient: {CUA_NODE: '', PATH}, execPath: v22}), onPath, 'then node on PATH, skipping relative and empty entries');
  assert.equal(outcome(() => ownHostNode({ambient: {PATH: `${dirname(oldOnPath)}:${dirname(onPath)}`}, execPath: v22})).code, 'repl_host_node', 'only the first node on PATH is a candidate, the one a shell would run');

  const none = outcome(() => ownHostNode({ambient: {CUA_NODE: broken, PATH: dirname(oldOnPath)}, execPath: v22}));
  assert.equal(none.code, 'repl_host_node');
  for (const pattern of [/Node 24 or later/, new RegExp(`CUA_NODE ${broken} \\(no readable version\\)`), new RegExp(`the node running cua ${v22} \\(v22\\.23\\.2\\)`),
    new RegExp(`node on PATH ${dirname(oldOnPath)}/node \\(v23\\.11\\.1\\)`), /set CUA_NODE to the absolute path of a Node 24 or later/, /vendor/])
    assert.match(none.message, pattern);
  const missing = outcome(() => ownHostNode({ambient: {CUA_NODE: join(dir, 'absent'), PATH: join(dir, 'empty')}, execPath: v22}));
  assert.match(missing.message, /CUA_NODE .*absent \(not found\)/);
  assert.match(missing.message, /node on PATH \(not found\)/);
  for (const bad of ['node', 'bin/node', '~/node']) assert.equal(outcome(() => ownHostNode({ambient: {CUA_NODE: bad}, execPath: v26})).code, 'invalid_setting', bad);
});

test('the launch records the host it runs; an explicit cua host runs the own supervisor on the resolved user Node, never the vendor\'s', t => {
  const {home, dir, runtime} = fixtureRuntime(t);
  const vendor = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT});
  assert.deepEqual(vendor.replHost, {host: 'vendor', reason: 'macos_native_peer_requires_vendor'});
  assert.equal(vendor.command, runtime.paths.node);
  assert.equal(Object.keys(vendor.env).some(k => k === 'CUA_REPL_HOST' || k === 'CUA_NODE'), false, 'the selection is the proxy\'s, not the runtime\'s');
  const explicitVendor = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'vendor', CUA_NODE: '/x/node'}});
  assert.deepEqual(explicitVendor.replHost, {host: 'vendor', reason: 'explicit'});
  assert.deepEqual(explicitVendor.env, vendor.env, 'an explicit vendor launch is the vendor launch');

  writeCuaRecord(home);
  const node = realpathSync(fakeNode(dir, 'n/node', '24.1.0'));
  const browserOnly = {surfaces: BROWSER, services: {browser: BROWSER_SERVICE}};
  const own = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'cua', CUA_NODE: node}, ...browserOnly});
  assert.deepEqual(own.replHost, {host: 'cua', reason: 'explicit'});
  assert.equal(own.command, node);
  assert.deepEqual(own.args, ['--disable-sigusr1', REPL_HOST_SUPERVISOR]);
  assert.equal(own.cwd, join(home, 'run', SESSION));
  assert.equal(buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'cua', CUA_NODE: '/not/consulted'}, ownNode: node, ...browserOnly}).command, node,
    'a Node the connection resolved once is used as given');
  assert.equal(outcome(() => buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'cua', CUA_NODE: 'node'}, ...browserOnly})).code, 'invalid_setting');
  assert.equal(outcome(() => buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'cua'}})).code, 'repl_host_refused', 'macOS computer');
  assert.equal(outcome(() => buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'own'}, ...browserOnly})).code, 'invalid_repl_host');
});

test('the own host\'s environment: the same allowlist and surface, service and secret settings, its own settings under owned names, no vendor host path', t => {
  const {home, dir, runtime} = fixtureRuntime(t);
  writeCuaRecord(home);
  const node = realpathSync(fakeNode(dir, 'n/node', '24.1.0'));
  const p = runtime.paths;
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'cua', CUA_NODE: node}, surfaces: BROWSER, services: {browser: BROWSER_SERVICE}, secretsUnavailable: 'secrets_disabled'});
  assert.deepEqual(env, {
    HOME: '/Users/someone', USER: 'someone', LOGNAME: 'someone', TMPDIR: '/var/folders/x/T/', LANG: 'en_US.UTF-8',
    __CF_USER_TEXT_ENCODING: '0x1F5:0x0:0x0',
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    CODEX_HOME: join(home, 'state', 'codex'),
    CUA_REPL_ENABLED_SURFACES: 'browser',
    CUA_REPL_NODE_PATH: node,
    CUA_REPL_OWNED_GROUP: '1',
    CUA_REPL_NODE_MODULE_DIRS: p.moduleDir,
    CUA_REPL_JS_BANNER: 'await import("@oai/cua/tinyskyAlt");\n',
    CUA_REPL_UNTRUSTED_ENV_ALLOWLIST: 'CUA_REPL_ENABLED_SURFACES,CUA_REPL_BROWSER_ENV',
    CUA_REPL_TOOL_OVERRIDES: JSON.stringify(toolOverrides({platform: 'darwin', surfaces: ['browser']})),
    CUA_REPL_TRUSTED_SERVICES: JSON.stringify({browser: BROWSER_SERVICE}),
    CUA_REPL_TRUSTED_RPC_ENABLED: '1',
    CUA_REPL_TRUSTED_CODE_PATHS: [REPL_HOST_DIR, p.moduleDir, dirname(BROWSER_SERVICE), ...SERVICE_SUPPORT_DIRS, BROWSER_SERVICE_IMPL_DIR].join(':'),
    CUA_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS: '1000',
    NODE_REPL_DISABLE_ANALYTICS: '1',
    CODEX_CLI_PATH: p.codexCli,
    CUA_BROWSER_VENDOR_SERVICE: p.browserVendorService,
    BROWSER_USE_AVAILABLE_BACKENDS: 'chrome',
    CUA_BROWSER_SERVICE: 'cua',
    BROWSER_USE_BACKEND_PATHS: env.BROWSER_USE_BACKEND_PATHS,
    CUA_SECRETS_UNAVAILABLE: 'secrets_disabled',
  });
  assert.equal(Object.keys(env).some(k => k.startsWith('NODE_REPL_') && k !== 'NODE_REPL_DISABLE_ANALYTICS'), false, 'none of the vendor host\'s own settings');
  assert.equal(env.CUA_REPL_NODE_REPL_PATH, undefined);
});

test('the scoped preflight protects the own host\'s trusted roots, its own code among them', t => {
  const {home, dir, runtime} = fixtureRuntime(t);
  writeCuaRecord(home);
  const node = fakeNode(dir, 'n/node', '24.1.0');
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'cua', CUA_NODE: node}, surfaces: BROWSER, services: {browser: BROWSER_SERVICE}});
  assertSandboxFits('scoped', launch);
  const overlap = outcome(() => assertSandboxFits('scoped', {...launch, env: {...launch.env, TMPDIR: dirname(REPL_HOST_DIR)}}));
  assert.equal(overlap.code, 'sandbox_conflict');
  assert.match(overlap.message, new RegExp(`the trusted code path ${REPL_HOST_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assertSandboxFits('scoped', {...launch, replHost: {host: 'vendor', reason: 'explicit'}, env: {...launch.env, TMPDIR: dirname(REPL_HOST_DIR), CUA_REPL_TRUSTED_CODE_PATHS: undefined}});
});

test('an own-host launch refuses a trusted service outside every trusted root, through a symlink too, before anything starts', t => {
  const {home, dir, runtime} = fixtureRuntime(t);
  writeCuaRecord(home);
  const node = realpathSync(fakeNode(dir, 'n/node', '24.1.0'));
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'cua', CUA_NODE: node}, surfaces: BROWSER, services: {browser: BROWSER_SERVICE}});
  assertTrustedServicesContained(launch);
  const root = join(dir, 'root'), outside = join(dir, 'outside');
  mkdirSync(root);
  mkdirSync(outside);
  writeFileSync(join(root, 'good.mjs'), 'export function handleRpc() {}\n');
  writeFileSync(join(outside, 'evil.mjs'), 'export function handleRpc() {}\n');
  symlinkSync(join(outside, 'evil.mjs'), join(root, 'linked.mjs'));
  symlinkSync(root, join(dir, 'root-link'));
  const check = (services, roots = root) => outcome(() => assertTrustedServicesContained({...launch, env: {...launch.env, CUA_REPL_TRUSTED_SERVICES: JSON.stringify(services), CUA_REPL_TRUSTED_CODE_PATHS: roots}}));
  assert.equal(check({browser: join(root, 'good.mjs')}), undefined);
  assert.equal(check({browser: join(dir, 'root-link', 'good.mjs')}, join(dir, 'root-link')), undefined, 'a root named through a link is its real path');
  assert.equal(check({browser: join(outside, 'evil.mjs')}).code, 'trusted_service_untrusted', 'a module outside the roots');
  const viaLink = check({browser: join(root, 'linked.mjs')});
  assert.equal(viaLink.code, 'trusted_service_untrusted', 'a link inside a root to a module outside it');
  assert.match(viaLink.message, /resolves to .*outside\/evil\.mjs, outside every trusted code path/);
  assert.equal(check({browser: join(root, '..', 'outside', 'evil.mjs')}).code, 'trusted_service_untrusted', 'a .. escape');
  assert.equal(check({browser: 'root/good.mjs'}).code, 'trusted_service_untrusted', 'a relative service');
  assert.equal(check({browser: join(root, 'good.mjs')}, `relative/root:${root}`).code, 'trusted_service_untrusted', 'a relative root');
  assert.equal(check({browser: join(root, 'good.mjs')}, `${join(dir, 'absent')}:${root}`), undefined, 'a root that does not exist is ignored, as the worker ignores it');
});

test('a launch given the connection\'s selections uses them, not a fresh resolution: the route may move under an open connection', t => {
  const {home, runtime} = fixtureRuntime(t);
  writeCuaRecord(home, {at: EARLY});
  const browserSelection = browserSelectionFor({}, home);
  const replHost = replHostFor({platform: 'darwin', surfaces: BROWSER, ambient: {}, browserSelection});
  writeVendorRecord(home, {at: LATE});   // the ChatGPT route is now the most recent registration
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, surfaces: BROWSER, services: {browser: BROWSER_SERVICE}, browserSelection, replHost});
  assert.equal(launch.env.CUA_BROWSER_SERVICE, 'cua');
  assert.deepEqual(launch.replHost, {host: 'vendor', reason: 'staged_vendor_default'});
  const fresh = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, surfaces: BROWSER, services: {browser: BROWSER_SERVICE}});
  assert.equal(fresh.env.CUA_BROWSER_SERVICE, 'vendor');
  assert.deepEqual(fresh.replHost, {host: 'vendor', reason: 'vendor_browser_route'});
});

test('the host identity names the answering host and its version: the own host\'s owned version, the vendor\'s runtime release', () => {
  assert.equal(REPL_HOST_NAME, 'cua-repl-host');
  assert.equal(REPL_HOST_META_KEY, 'cua/replHost');
  assert.match(REPL_HOST_VERSION, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(hostIdentity({host: 'cua', release: '26.928.40906-darwin-arm64'}), {host: 'cua', version: REPL_HOST_VERSION});
  assert.deepEqual(hostIdentity({host: 'vendor', release: '26.928.40906-darwin-arm64'}), {host: 'vendor', version: '26.928.40906-darwin-arm64'});
});

// The matrix through both launch consumers (a connection, src/mcp/connection.mjs, and the independent browser-only
// profiles listing, src/profiles/inventory.mjs) and doctor's repl.host row: every route (no registration, ChatGPT active,
// cua active, both orderings, MAWS client mode), surface set and explicit pair, on both platforms, agrees with
// replHostFor. Nothing is spawned: prepareLaunch captures the launch and stops it.
test('connections, the profiles listing and doctor agree with the selection table on every route, surface set and explicit pair', async t => {
  const STOP = Object.assign(new Error('stopped before spawn'), {code: 'test_stop'});
  const capture = launches => launch => { launches.push(launch); throw STOP; };
  const usernsPass = async () => ({status: 'pass'});
  const node = (() => { const s = scratch(); t.after(s.cleanup); return fakeNode(realpathSync(s.dir), 'node', '24.18.0'); })();
  const ROUTES = {
    'no registration': () => {},
    'ChatGPT active': home => writeVendorRecord(home, {at: EARLY}),
    'cua active': home => writeCuaRecord(home, {at: EARLY}),
    'both, cua last': home => { writeVendorRecord(home, {at: EARLY}); writeCuaRecord(home, {at: LATE}); },
    'both, ChatGPT last': home => { writeCuaRecord(home, {at: EARLY}); writeVendorRecord(home, {at: LATE}); },
  };
  const BROWSER_SETTINGS = {'service unset': {}, 'MAWS client mode': {CUA_BROWSER_BACKENDS: '/maws/a.sock'}, 'service vendor': {CUA_BROWSER_SERVICE: 'vendor'}, 'service cua': {CUA_BROWSER_SERVICE: 'cua'}};
  const HOSTS = {'host unset': {}, 'host vendor': {CUA_REPL_HOST: 'vendor'}, 'host cua': {CUA_REPL_HOST: 'cua'}};
  // What every consumer must show: replHostFor's selection, the own host's included.
  const expected = ({platform, surfaces, env, home}) => outcome(() => replHostFor({platform, surfaces, ambient: env, browserSelection: surfaces.includes('browser') ? browserSelectionFor(env, home) : null}));
  const doctorStubs = {inspectHelper: async () => ({socket: '/x', holders: []}), inspectSecrets: async () => ({dir: '/none', exists: false}), inspectAgent: async () => [],
    inspectChrome: async () => [], inspectLogin: async () => ({state: 'logged-out'}), inspectLinux: async () => [], verifySignatures: async () => []};
  const words = r => (r.code ? `refused (${r.code}): ${r.message}` : `${r.host} host (${r.reason})`);
  let rows = 0;
  for (const host of [DARWIN, LINUX]) {
    for (const [routeLabel, register] of Object.entries(ROUTES)) {
      const home = fakeInstalledHome(t, {host});
      register(home);
      const runtime = resolveRuntime({home, host});
      for (const [browserLabel, browserEnv] of Object.entries(BROWSER_SETTINGS)) for (const [hostLabel, hostEnv] of Object.entries(HOSTS)) {
        const base = {PATH: '/usr/bin:/bin', CUA_NODE: node, CUA_SHIM_SECRETS: 'off', ...browserEnv, ...hostEnv};
        // The independent listing: browser only, whatever the connection's surfaces.
        const listingExpected = expected({platform: host.platform, surfaces: BROWSER, env: base, home});
        const listed = [];
        const listing = await listLiveBackends({home, runtime, ambient: base, tabCounts: false, probeUserns: usernsPass, prepareLaunch: capture(listed)}).then(() => ({}), error => error);
        const label = `${host.platform}, ${routeLabel}, ${browserLabel}, ${hostLabel}`;
        if (listingExpected.code) assert.deepEqual({code: listing.code, message: listing.message, launches: listed.length}, {...listingExpected, launches: 0}, `listing: ${label}`);
        else assert.deepEqual({code: listing.code, replHost: listed[0]?.replHost}, {code: 'test_stop', replHost: listingExpected}, `listing: ${label}`);

        for (const surfaces of [COMPUTER, BROWSER, BOTH]) {
          const env = {...base, CUA_SHIM_SURFACES: surfaces.join(',')};
          const sessionExpected = expected({platform: host.platform, surfaces, env, home});
          const full = `${label}, ${surfaces}`;
          const launches = [];
          const input = new PassThrough(), output = new PassThrough();
          const frames = [];
          createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
          const opened = await openConnection({home, env, host, sessionId: randomUUID(), input, output, diagnostics: () => {}, prepareLaunch: capture(launches), probeUserns: usernsPass,
            chrome: {}, listBackends: async () => ({backends: []})}).then(connection => ({connection}), error => ({error}));
          if (sessionExpected.code) {
            assert.deepEqual({code: opened.error?.code, message: opened.error?.message}, sessionExpected, `connection: ${full}`);
          } else {
            assert.ok(opened.connection, `connection: ${full}: ${opened.error?.message}`);
            input.write(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'matrix', version: '0'}}}) + '\n');
            for (let i = 0; i < 200 && !frames.length; i++) await new Promise(resolve => setTimeout(resolve, 5));
            input.end();
            await opened.connection.closed;
            assert.deepEqual(launches.map(l => l.replHost), [sessionExpected], `connection: ${full}`);
          }

          const row = (await inspectRuntime({home, env, host, ...doctorStubs})).checks.find(c => c.name === 'repl.host');
          assert.equal(row?.status, sessionExpected.code || listingExpected.code ? 'fail' : 'pass', `doctor: ${full}: ${row?.detail}`);
          assert.ok(row.detail.startsWith(`${words(sessionExpected)}`), `doctor: ${full}: ${row.detail}`);
          assert.ok(row.detail.includes(`profile listing (browser only): ${words(listingExpected)}`), `doctor: ${full}: ${row.detail}`);
          if (surfaces.includes('browser') && !env.CUA_BROWSER_SERVICE) assert.match(row.detail, /Browser route: /, `doctor names the route: ${full}`);
          rows++;
        }
      }
    }
  }
  assert.equal(rows, 2 * 5 * 4 * 3 * 3);
});

test('doctor\'s repl.host row names the route and the registration that decided it, or their absence', async t => {
  const stubs = {host: DARWIN, inspectHelper: async () => ({socket: '/x', holders: []}), inspectSecrets: async () => ({dir: '/none', exists: false}), inspectAgent: async () => [],
    inspectChrome: async () => [], inspectLogin: async () => ({state: 'logged-out'}), verifySignatures: async () => []};
  const homeWith = ({vendor, cua} = {}) => {
    const s = scratch();
    t.after(s.cleanup);
    if (vendor !== undefined) writeVendorRecord(s.dir, {at: vendor});
    if (cua !== undefined) writeCuaRecord(s.dir, {at: cua});
    return s.dir;
  };
  const row = async (home, env) => (await inspectRuntime({home, env: {CUA_SHIM_SURFACES: 'browser', ...env}, ...stubs})).checks.find(c => c.name === 'repl.host');
  const iso = at => new Date(at * 1000).toISOString();
  for (const [home, env, pattern] of [
    [homeWith(), {}, /Browser route: the ChatGPT extension route, as a home with no Chrome registration is read/],
    [homeWith({vendor: EARLY}), {}, new RegExp(`Browser route: the ChatGPT extension route, by its registration \\(cua chrome register --vendor\\) of ${iso(EARLY)}`)],
    [homeWith({vendor: EARLY, cua: LATE}), {}, new RegExp(`Browser route: the cua route, by cua's registration \\(cua chrome register\\) of ${iso(LATE)}`)],
    [homeWith({vendor: EARLY}), {CUA_BROWSER_BACKENDS: '/maws/a.sock'}, /Browser route: MAWS's in-app browser \(CUA_BROWSER_BACKENDS\), no registration deciding/],
    [homeWith({cua: EARLY}), {CUA_BROWSER_SERVICE: 'vendor'}, /Browser route: CUA_BROWSER_SERVICE=vendor/],
  ]) assert.match((await row(home, env)).detail, pattern);
  const computer = await row(homeWith(), {CUA_SHIM_SURFACES: 'computer'});
  assert.match(computer.detail, /^vendor host \(macos_native_peer_requires_vendor\)/);
  assert.match(computer.detail, /no browser surface/);
  const invalid = await row(homeWith(), {CUA_REPL_HOST: 'own'});
  assert.equal(invalid.status, 'fail');
  assert.match(invalid.detail, /CUA_REPL_HOST must be cua or vendor/);
});
