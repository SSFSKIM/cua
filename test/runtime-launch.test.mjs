import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, realpathSync, symlinkSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {buildLaunch, browserServiceFor, SKY_SERVICE, BROWSER_SERVICE, BROWSER_SERVICE_IMPL_DIR, SERVICE_SUPPORT_DIRS} from '../src/runtime/launch.mjs';
import {writeCuaRecord, writeVendorRecord} from './fixtures/route-records.mjs';
import {parsePin, runtimeFor} from '../src/runtime/manifest.mjs';
import {scratch, fixturePin} from './fixtures/runtime-fixture.mjs';
import {connectionSecrets} from '../src/secrets/store.mjs';

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
