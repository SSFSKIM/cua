import './helpers/scratch-home.mjs'; // first: the native engine's selection must not read the account's own settings
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, existsSync, mkdirSync, statSync, writeFileSync, realpathSync, symlinkSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {PassThrough} from 'node:stream';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {buildLaunch, createLaunchDirs, replHostFor, ownHostNode, NODE_FLOOR, SKY_SERVICE, BROWSER_SERVICE, BROWSER_SERVICE_IMPL_DIR, CUA_API_DIR, CUA_API_DOCS_DIR, REPL_HOST_DIR, REPL_HOST_SUPERVISOR, SANDBOX_DIR, SERVICE_SUPPORT_DIRS, ENGINE_SERVICE_DIR, BIN_DIR, COMPAT_EXECUTABLE} from '../src/runtime/launch.mjs';
import {assertSandboxFits, assertTrustedServicesContained} from '../src/runtime/sandbox.mjs';
import {writeCuaRecord, writeVendorRecord} from './fixtures/route-records.mjs';
import {parsePin, resolveRuntime, runtimeFor} from '../src/runtime/manifest.mjs';
import {scratch, scratchUserHome, fixturePin} from './fixtures/runtime-fixture.mjs';
import {fakeInstalledHome} from './fixtures/installed-home.mjs';
import {CuaError} from '../src/runtime/errors.mjs';
import {STORE_RELATIVE, connectionSecrets} from '../src/secrets/store.mjs';
import {openConnection} from '../src/mcp/connection.mjs';
import {listLiveBackends} from '../src/profiles/inventory.mjs';
import {inspectRuntime, summarize} from '../src/runtime/doctor.mjs';
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

// The deny list buildLaunch resolves for AMBIENT's HOME and `home` (src/sandbox/policy.mjs denyListFor), on macOS.
const darwinDenyList = (home, session = SESSION) => ({deny: [join('/Users/someone', STORE_RELATIVE), '/Users/someone/.config/cua', home],
  reexpose: [join(home, 'runtimes'), join(home, 'node'), join(home, 'run', session), join(home, 'run', session, 'tmp')], metadataOnly: [home, join(home, 'run')], tiers: []});

test('the launch environment is an allowlist: OS basics plus relocated settings, nothing ambient that could redirect it', t => {
  const {home, runtime} = fixtureRuntime(t);
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT});
  const p = runtime.paths;
  assert.deepEqual(env, {
    HOME: '/Users/someone', USER: 'someone', LOGNAME: 'someone', TMPDIR: join(home, 'run', SESSION, 'tmp'), LANG: 'en_US.UTF-8',
    __CF_USER_TEXT_ENCODING: '0x1F5:0x0:0x0',
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    CUA_SANDBOX_DENY_READ: JSON.stringify(darwinDenyList(home)),
    CODEX_HOME: join(home, 'state', 'codex'),
    CUA_REPL_NODE_REPL_PATH: p.nodeRepl,
    CUA_REPL_ENABLED_SURFACES: 'computer',
    NODE_REPL_NODE_PATH: p.node,
    NODE_REPL_NODE_MODULE_DIRS: p.moduleDir,
    NODE_REPL_TRUSTED_CODE_PATHS: [p.moduleDir, SANDBOX_DIR, BIN_DIR].join(':'),
    NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS: '1000',
    NODE_REPL_DISABLE_ANALYTICS: '1',
    CODEX_CLI_PATH: COMPAT_EXECUTABLE,
    CUA_COMPAT_NODE: p.node,
    SKY_CUA_SERVICE_PATH: p.skyServiceApp,
    CUA_SKY_SERVICE: p.skyVendorService,
    CUA_ENGINE_SCREENSHOTS: join(home, 'run', SESSION, 'screenshots'),
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
  assert.deepEqual(env.NODE_REPL_TRUSTED_CODE_PATHS.split(':'), [runtime.paths.moduleDir, SANDBOX_DIR, BIN_DIR, dirname(wrapper), ...SERVICE_SUPPORT_DIRS, ENGINE_SERVICE_DIR]);
  assert.equal(env.CUA_SKY_SERVICE, runtime.paths.skyVendorService);
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
  assert.deepEqual(trusted, [runtime.paths.moduleDir, join(repo, 'src', 'sandbox'), join(repo, 'bin'), join(repo, 'src', 'services'), join(repo, 'src', 'secrets'), join(repo, 'src', 'services', 'engine')]);
  for (const root of trusted) {
    assert.ok(!(root + '/').startsWith(join(home, 'state') + '/') && !(root + '/').startsWith(join(home, 'run') + '/'), `${root} is runtime-writable state`);
  }
  assert.equal(JSON.parse(env.NODE_REPL_TRUSTED_SERVICES).sky, join(repo, 'src', 'services', 'sky.mjs'));
});

// cua's own engine service (#117) is what the sky wrapper delegates to when the launch names it in CUA_SKY_SERVICE (the
// selection is M1b's), from the vendor's trusted worker (comparison A's lane) as from the own host's: its directory is
// trusted wherever the wrapper is, though it may not exist yet, and never where the engine cannot serve (Linux) or
// without the wrapper.
// (The own host refuses macOS computer sessions until M1b's selection; its launch takes the same trusted list.)
test('with the sky wrapper registered on macOS, cua\'s engine service directory is trusted code; not on Linux, not without the wrapper', t => {
  const {home, runtime} = fixtureRuntime(t);
  const repo = realpathSync(new URL('..', import.meta.url).pathname);
  assert.equal(ENGINE_SERVICE_DIR, join(repo, 'src', 'services', 'engine'));
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, services: {sky: SKY_SERVICE}});
  assert.ok(env.NODE_REPL_TRUSTED_CODE_PATHS.split(':').includes(ENGINE_SERVICE_DIR));
  const unregistered = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT}).env;
  assert.ok(!unregistered.NODE_REPL_TRUSTED_CODE_PATHS.split(':').includes(ENGINE_SERVICE_DIR), 'the vendor\'s own service, which imports nothing of cua\'s');
  const browserOnly = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'vendor'}, surfaces: ['browser'], services: {browser: BROWSER_SERVICE}}).env;
  assert.ok(!browserOnly.NODE_REPL_TRUSTED_CODE_PATHS.split(':').includes(ENGINE_SERVICE_DIR));
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

test('the browser surface registers the trusted browser wrapper and configures cua\'s browser service', t => {
  const {home, runtime} = fixtureRuntime(t);
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, surfaces: ['computer', 'browser'], services: {sky: SKY_SERVICE, browser: BROWSER_SERVICE}});
  assert.equal(env.CUA_REPL_ENABLED_SURFACES, 'computer,browser');
  assert.deepEqual(JSON.parse(env.NODE_REPL_TRUSTED_SERVICES), {sky: SKY_SERVICE, browser: BROWSER_SERVICE});
  assert.equal(env.BROWSER_USE_AVAILABLE_BACKENDS, 'chrome');
  assert.equal(env.CUA_SKY_SERVICE, runtime.paths.skyVendorService);
  // cua's sockets are always listed (none here), so the service looks nowhere else; no network or security override.
  assert.equal(env.BROWSER_USE_BACKEND_PATHS, '');
  assert.deepEqual(Object.keys(env).filter(k => /BROWSER/.test(k)).sort(), ['BROWSER_USE_AVAILABLE_BACKENDS', 'BROWSER_USE_BACKEND_PATHS']);
  assert.deepEqual(env.NODE_REPL_TRUSTED_CODE_PATHS.split(':'), [runtime.paths.moduleDir, SANDBOX_DIR, BIN_DIR, dirname(BROWSER_SERVICE), ...SERVICE_SUPPORT_DIRS, ENGINE_SERVICE_DIR, BROWSER_SERVICE_IMPL_DIR]);
});

test('a browser-only launch has no computer-use service or native helper configuration', t => {
  const {home, runtime} = fixtureRuntime(t);
  for (const host of ['vendor', 'cua']) {
    const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: host}, resolveOwnNode: () => '/fixture/node24/bin/node', surfaces: ['browser'], services: {browser: BROWSER_SERVICE}});
    assert.equal(env.CUA_REPL_ENABLED_SURFACES, 'browser', host);
    assert.deepEqual(JSON.parse(env[host === 'cua' ? 'CUA_REPL_TRUSTED_SERVICES' : 'NODE_REPL_TRUSTED_SERVICES']), {browser: BROWSER_SERVICE}, host);
    assert.equal(env.SKY_CUA_SERVICE_PATH, undefined, host);
    assert.equal(env.CUA_SKY_SERVICE, undefined, host);
    assert.equal(env.CUA_ENGINE_SCREENSHOTS, undefined, host);
    // The vendor host runs cua's compat executable since #115 M2; cua's own host on macOS runs cua's own (sandbox-exec).
    if (host === 'vendor') assert.equal(env.CODEX_CLI_PATH, COMPAT_EXECUTABLE, `${host}: the runtime sandbox is kept whatever the surface`);
    else assert.deepEqual([env.CUA_REPL_SANDBOX_EXEC, env.CODEX_CLI_PATH, env.CODEX_HOME], ['/usr/bin/sandbox-exec', undefined, undefined], `${host}: cua's own sandbox, whatever the surface`);
  }
});

// The browser surface always runs cua's own service (#79 removed the vendor selection with the ChatGPT extension
// route): a home with no Chrome registration, one whose only record is the removed route's, and one on cua's own
// route launch alike, and a CUA_BROWSER_SERVICE left in the caller's environment is not read.
test('every home runs cua\'s browser service with the browser surface: its directory is trusted, and nothing wider; CUA_BROWSER_SERVICE is ignored', t => {
  const repo = realpathSync(new URL('..', import.meta.url).pathname);
  assert.equal(BROWSER_SERVICE_IMPL_DIR, join(repo, 'src', 'browser-service'));
  const HOMES = {'no registration': () => {}, 'the removed route\'s record only': home => writeVendorRecord(home), 'cua\'s record': home => writeCuaRecord(home)};
  for (const [homeLabel, register] of Object.entries(HOMES)) {
    const {home, runtime} = fixtureRuntime(t);
    register(home);
    for (const service of [undefined, '', 'vendor', 'cua', 'openai']) {
      const label = `${homeLabel}, CUA_BROWSER_SERVICE=${JSON.stringify(service)}`;
      const ambient = service === undefined ? AMBIENT : {...AMBIENT, CUA_BROWSER_SERVICE: service};
      // On the vendor host, whose launch names its trusted roots NODE_REPL_TRUSTED_CODE_PATHS (the own host's are below).
      const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...ambient, CUA_REPL_HOST: 'vendor'}, surfaces: ['browser'], services: {browser: BROWSER_SERVICE}});
      assert.deepEqual(Object.keys(env).filter(k => /BROWSER/.test(k)).sort(), ['BROWSER_USE_AVAILABLE_BACKENDS', 'BROWSER_USE_BACKEND_PATHS'], label);
      assert.equal(env.BROWSER_USE_AVAILABLE_BACKENDS, 'chrome', label);
      assert.equal(env.BROWSER_USE_BACKEND_PATHS, '', `${label}: no socket of cua's is listed, and none of OpenAI's is looked for`);
      assert.deepEqual(env.NODE_REPL_TRUSTED_CODE_PATHS.split(':'), [runtime.paths.moduleDir, SANDBOX_DIR, BIN_DIR, dirname(BROWSER_SERVICE), ...SERVICE_SUPPORT_DIRS, BROWSER_SERVICE_IMPL_DIR], label);
      for (const wider of [repo, join(repo, 'src'), home]) assert.ok(!env.NODE_REPL_TRUSTED_CODE_PATHS.split(':').includes(wider), `${label}: ${wider}`);
      // The default host, cua's own for a browser-only session on macOS, trusts it too.
      const own = buildLaunch({runtime, home, sessionId: SESSION, ambient, resolveOwnNode: () => '/fixture/node24/bin/node', surfaces: ['browser'], services: {browser: BROWSER_SERVICE}});
      assert.deepEqual(own.replHost, {host: 'cua', reason: 'browser_only'}, label);
      assert.ok(own.env.CUA_REPL_TRUSTED_CODE_PATHS.split(':').includes(BROWSER_SERVICE_IMPL_DIR), label);
      assert.deepEqual(Object.keys(own.env).filter(k => /BROWSER/.test(k)).sort(), ['BROWSER_USE_AVAILABLE_BACKENDS', 'BROWSER_USE_BACKEND_PATHS'], label);
      assert.equal(own.env.BROWSER_USE_BACKEND_PATHS, '', label);
    }
  }
});

test('BROWSER_USE_BACKEND_PATHS lists cua\'s host sockets present at launch, whatever the home\'s records', t => {
  const {home, runtime} = fixtureRuntime(t);
  writeVendorRecord(home);
  const socket = join(home, 'chrome', 'b', 'abcdef012345.sock');
  mkdirSync(dirname(socket), {recursive: true});
  writeFileSync(socket, '');
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'vendor'}, surfaces: ['browser'], services: {browser: BROWSER_SERVICE}});
  assert.equal(env.BROWSER_USE_BACKEND_PATHS, socket);
});

test('without the browser surface nothing of the browser is configured, CUA_BROWSER_SERVICE set or not', t => {
  const {home, runtime} = fixtureRuntime(t);
  for (const service of ['cua', 'vendor', 'openai']) {
    const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_BROWSER_SERVICE: service}});
    assert.deepEqual(Object.keys(env).filter(k => /BROWSER/.test(k)), [], service);
    assert.ok(!env.NODE_REPL_TRUSTED_CODE_PATHS.split(':').includes(BROWSER_SERVICE_IMPL_DIR), service);
  }
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

// The own host's Node as a connection resolves it (ownHostNode), injected: one that finds a Node 24 or later, and one
// that finds none, as ownHostNode refuses (repl_host_node, with the candidates it tried).
const NODE24 = '/fixture/node24/bin/node';
const TRIED = ['CUA_NODE (unset)', 'the node running cua /fixture/node22 (v22.23.2)', 'node on PATH (not found)'];
const withNode = () => NODE24;
const withoutNode = () => { throw Object.assign(new CuaError('repl_host_node', 'cua\'s own REPL host needs Node 24 or later, and none was found'), {tried: TRIED}); };
// `extra` is more of the caller's environment (a browser setting the selection must not read).
// The engine inputs are fixed (no engine.json, the default vendor engine), so a machine's own settings never leak in.
const hostFor = (platform, surfaces, host, resolveOwnNode = withNode, extra = {}) => outcome(() => replHostFor({platform, surfaces,
  ambient: host === undefined ? extra : {...extra, CUA_REPL_HOST: host}, resolveOwnNode, engine: {config: () => ({}), installed: () => null}}));
// The vendor engine by default, as a macOS computer selection carries it.
const DEFAULT_VENDOR_ENGINE = {engine: 'vendor', reason: 'default', status: 'pass'};
// A resolver that counts its calls, so a test can say whether (and how often) a selection asked for Node.
const counted = resolve => { const fn = () => { fn.calls++; return resolve(); }; fn.calls = 0; return fn; };
// Browser settings the host selection ignores: MAWS client mode, and a CUA_BROWSER_SERVICE #79 no longer reads.
const IGNORED = [{}, {CUA_BROWSER_BACKENDS: '/maws/a.sock'}, {CUA_BROWSER_SERVICE: 'vendor'}, {CUA_BROWSER_SERVICE: 'cua'}];

test('the REPL host follows the selection table: macOS computer keeps vendor, Linux and browser-only sessions default to cua\'s own host', () => {
  const vendor = reason => ({host: 'vendor', reason});
  const own = reason => ({host: 'cua', reason, node: NODE24});
  for (const unset of [undefined, '']) for (const extra of IGNORED) {
    const label = what => `${what}, CUA_REPL_HOST=${JSON.stringify(unset)}, ${JSON.stringify(extra)}`;
    for (const [platform, surfaces, expected] of [
      ['linux', COMPUTER, own('linux')],
      ['linux', BROWSER, own('linux')],
      ['linux', BOTH, own('linux')],
      ['darwin', BROWSER, own('browser_only')],
      ['darwin', COMPUTER, {...vendor('macos_native_peer_requires_vendor'), engine: DEFAULT_VENDOR_ENGINE}],
      ['darwin', BOTH, {...vendor('macos_native_peer_requires_vendor'), engine: DEFAULT_VENDOR_ENGINE}],   // MAWS client mode does not override macOS computer
    ]) {
      const resolve = counted(withNode);
      assert.deepEqual(hostFor(platform, surfaces, unset, resolve, extra), expected, label(`${platform} ${surfaces}`));
      assert.equal(resolve.calls, expected.host === 'cua' ? 1 : 0, label(`${platform} ${surfaces}: Node is asked for only where the default is cua's host, once`));
    }
  }
  for (const surfaces of [COMPUTER, BROWSER, BOTH]) for (const extra of IGNORED) {
    const resolve = counted(withNode);
    assert.deepEqual(hostFor('darwin', surfaces, 'vendor', resolve, extra), {...vendor('explicit'), ...(surfaces.includes('computer') ? {engine: DEFAULT_VENDOR_ENGINE} : {})}, `${surfaces}: an explicit vendor is the rollback on macOS`);
    const linux = hostFor('linux', surfaces, 'vendor', resolve, extra);
    assert.equal(linux.code, 'repl_host_refused', `${surfaces}: the vendor host is retired on Linux (#115 M3, #135)`);
    assert.match(linux.message, /CUA_REPL_HOST=vendor is not supported on Linux.*#135/);
    assert.equal(resolve.calls, 0, 'the rollback (or its refusal) never probes Node');
  }
});

// The browser no longer decides the host (#79): a home with no Chrome registration, or whose only record is the removed
// ChatGPT extension route's, selects as cua's own route does, through the home the launch resolves from.
test('a home with no registration or only the removed route\'s record selects the host as any other: browser-only on macOS is cua\'s own, CUA_REPL_HOST=cua is honoured', t => {
  for (const register of [() => {}, home => writeVendorRecord(home)]) {
    const {home, runtime} = fixtureRuntime(t);
    register(home);
    const launch = (surfaces, ambient = AMBIENT) => outcome(() => buildLaunch({runtime, home, sessionId: SESSION, ambient, surfaces, resolveOwnNode: withNode,
      services: Object.assign({}, surfaces.includes('computer') ? {sky: SKY_SERVICE} : {}, {browser: BROWSER_SERVICE})}).replHost);
    assert.deepEqual(launch(BROWSER), {host: 'cua', reason: 'browser_only'});
    assert.deepEqual(launch(BOTH), {host: 'vendor', reason: 'macos_native_peer_requires_vendor'});
    for (const extra of IGNORED) {
      assert.deepEqual(replHostFor({platform: 'darwin', surfaces: BROWSER, ambient: extra, home, resolveOwnNode: withNode}), {host: 'cua', reason: 'browser_only', node: NODE24}, JSON.stringify(extra));
      assert.deepEqual(launch(BROWSER, {...AMBIENT, ...extra, CUA_REPL_HOST: 'cua'}), {host: 'cua', reason: 'explicit'}, `CUA_REPL_HOST=cua with ${JSON.stringify(extra)}`);
    }
    assert.equal(launch(BOTH, {...AMBIENT, CUA_REPL_HOST: 'cua'}).code, 'repl_host_refused', 'macOS computer is refused for its helper, not for the browser');
    assert.doesNotMatch(launch(BOTH, {...AMBIENT, CUA_REPL_HOST: 'cua'}).message, /ChatGPT|CUA_BROWSER_SERVICE|cua chrome register/);
  }
});

test('with no Node 24 or later, a macOS session the table moves to cua\'s own host keeps the vendor host, naming why and what was tried; Linux, with no vendor host, is refused', () => {
  for (const unset of [undefined, '']) {
    assert.deepEqual(hostFor('darwin', BROWSER, unset, withoutNode), {host: 'vendor', reason: 'own_host_node_unavailable', nodeTried: TRIED});
    for (const surfaces of [COMPUTER, BROWSER, BOTH])
      assert.deepEqual(hostFor('linux', surfaces, unset, withoutNode), {code: 'repl_host_node', message: 'cua\'s own REPL host needs Node 24 or later, and none was found'}, surfaces);
  }
  // Sessions that keep the vendor host for another reason keep that reason.
  assert.deepEqual(hostFor('darwin', BOTH, undefined, withoutNode), {host: 'vendor', reason: 'macos_native_peer_requires_vendor', engine: DEFAULT_VENDOR_ENGINE});
  // A CUA_NODE that is not an absolute path is an invalid setting, refused, not a missing Node.
  const invalid = () => { throw new CuaError('invalid_setting', 'CUA_NODE must be the absolute path of a Node executable'); };
  assert.equal(hostFor('linux', COMPUTER, undefined, invalid).code, 'invalid_setting');
  // The default resolver is the production one: an implicit Linux session with an unusable CUA_NODE and no other Node.
  const s = scratch();
  try {
    const old = fakeNode(realpathSync(s.dir), 'old/node', '22.23.2');
    const selected = outcome(() => replHostFor({platform: 'linux', surfaces: COMPUTER, ambient: {CUA_NODE: old, PATH: dirname(old)}}));
    assert.deepEqual(Number(process.versions.node.split('.')[0]) >= NODE_FLOOR ? selected.reason : selected.code,
      Number(process.versions.node.split('.')[0]) >= NODE_FLOOR ? 'linux' : 'repl_host_node', 'the node running cua is the second candidate');
  } finally { s.cleanup(); }
});

test('an explicit CUA_REPL_HOST=cua is honoured where the own host can run, and otherwise refused before launch, never downgraded to vendor', () => {
  for (const extra of IGNORED) for (const [platform, surfaces] of [['linux', COMPUTER], ['linux', BROWSER], ['linux', BOTH], ['darwin', BROWSER]])
    assert.deepEqual(hostFor(platform, surfaces, 'cua', withNode, extra), {host: 'cua', reason: 'explicit', node: NODE24}, `${platform} ${surfaces} ${JSON.stringify(extra)}`);
  // With no Node 24 or later an explicit cua is refused with the resolver's diagnostic, never downgraded to vendor.
  for (const [platform, surfaces] of [['linux', COMPUTER], ['darwin', BROWSER]])
    assert.deepEqual(hostFor(platform, surfaces, 'cua', withoutNode), {code: 'repl_host_node', message: 'cua\'s own REPL host needs Node 24 or later, and none was found'});

  // macOS computer with the vendor engine: the vendor helper's peer rule, the only refusal left.
  for (const surfaces of [COMPUTER, BOTH]) for (const extra of IGNORED) {
    const result = hostFor('darwin', surfaces, 'cua', withNode, extra);
    assert.equal(result.code, 'repl_host_refused', `${surfaces}: ${JSON.stringify(result)}`);
    for (const pattern of [/macOS/, /CUA_NATIVE_ENGINE=cua/, /CUA_SHIM_SURFACES=browser/]) assert.match(result.message, pattern);
  }

  // Whatever the inputs: no override selects cua exactly where an explicit cua is honoured and a Node 24 resolves,
  // and never refuses; cua is cua or a refusal; without a Node 24 macOS keeps the vendor host and Linux refuses.
  for (const platform of ['darwin', 'linux']) for (const surfaces of [COMPUTER, BROWSER, BOTH]) {
    const cua = hostFor(platform, surfaces, 'cua');
    assert.ok(cua.host === 'cua' || cua.code === 'repl_host_refused', JSON.stringify(cua));
    const implicit = hostFor(platform, surfaces, undefined);
    assert.equal(implicit.host, cua.host === 'cua' ? 'cua' : 'vendor', JSON.stringify(implicit));
    const without = hostFor(platform, surfaces, undefined, withoutNode);
    assert.ok(platform === 'linux' ? without.code === 'repl_host_node' : without.host === 'vendor', JSON.stringify(without));
  }
});

test('an unknown CUA_REPL_HOST is refused', () => {
  for (const value of ['Cua', 'own', ' cua', 'cua,vendor', 'node_repl'])
    assert.equal(hostFor('linux', COMPUTER, value).code, 'invalid_repl_host', value);
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
  // The refusal carries the candidates it tried, for a selection that falls back to the vendor host to name them.
  try { ownHostNode({ambient: {CUA_NODE: v22, PATH: dirname(oldOnPath)}, execPath: broken}); assert.fail('resolved'); } catch (error) {
    assert.deepEqual(error.tried, [`CUA_NODE ${v22} (v22.23.2)`, `the node running cua ${broken} (no readable version)`, `node on PATH ${dirname(oldOnPath)}/node (v23.11.1)`]);
  }
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

  const node = realpathSync(fakeNode(dir, 'n/node', '24.1.0'));
  const browserOnly = {surfaces: BROWSER, services: {browser: BROWSER_SERVICE}};
  const own = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'cua', CUA_NODE: node}, ...browserOnly});
  assert.deepEqual(own.replHost, {host: 'cua', reason: 'explicit'});
  assert.equal(own.command, node);
  assert.deepEqual(own.args, ['--disable-sigusr1', REPL_HOST_SUPERVISOR]);
  assert.equal(own.cwd, join(home, 'run', SESSION));
  assert.equal(buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'cua', CUA_NODE: '/not/consulted'}, replHost: {host: 'cua', reason: 'explicit', node}, ...browserOnly}).command, node,
    'the Node the connection\'s selection resolved once is used as given');
  const resolveOwnNode = () => node;
  const implicit = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, resolveOwnNode, ...browserOnly});
  assert.deepEqual([implicit.replHost, implicit.command], [{host: 'cua', reason: 'browser_only'}, node], 'browser-only on macOS defaults to the own host');
  const noNode = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, resolveOwnNode: () => ownHostNode({ambient: {}, execPath: join(dir, 'absent')}), ...browserOnly});
  assert.deepEqual([noNode.replHost, noNode.command], [{host: 'vendor', reason: 'own_host_node_unavailable'}, runtime.paths.node], 'and keeps the vendor host where no Node 24 resolves');
  assert.equal(outcome(() => buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'cua', CUA_NODE: 'node'}, ...browserOnly})).code, 'invalid_setting');
  assert.equal(outcome(() => buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'cua'}})).code, 'repl_host_refused', 'macOS computer');
  assert.equal(outcome(() => buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'own'}, ...browserOnly})).code, 'invalid_repl_host');
});

test('the own host\'s environment: the same allowlist and surface, service and secret settings, its own settings under owned names, no vendor host path', t => {
  const {home, dir, runtime} = fixtureRuntime(t);
  const node = realpathSync(fakeNode(dir, 'n/node', '24.1.0'));
  const p = runtime.paths;
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'cua', CUA_NODE: node}, surfaces: BROWSER, services: {browser: BROWSER_SERVICE}, secretsUnavailable: 'secrets_disabled'});
  assert.deepEqual(env, {
    HOME: '/Users/someone', USER: 'someone', LOGNAME: 'someone', TMPDIR: join(home, 'run', SESSION, 'tmp'), LANG: 'en_US.UTF-8',
    __CF_USER_TEXT_ENCODING: '0x1F5:0x0:0x0',
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    CUA_SANDBOX_DENY_READ: JSON.stringify(darwinDenyList(home)),
    CUA_REPL_ENABLED_SURFACES: 'browser',
    CUA_REPL_NODE_PATH: node,
    CUA_REPL_OWNED_GROUP: '1',
    CUA_REPL_NODE_MODULE_DIRS: p.moduleDir,
    CUA_REPL_JS_BANNER: `await import(${JSON.stringify(pathToFileURL(join(CUA_API_DIR, 'bootstrap.mjs')).href)});\n`,
    CUA_REPL_UNTRUSTED_ENV_ALLOWLIST: 'CUA_REPL_ENABLED_SURFACES,CUA_REPL_BROWSER_ENV',
    CUA_REPL_TOOL_OVERRIDES: JSON.stringify(toolOverrides({platform: 'darwin', surfaces: ['browser']})),
    CUA_REPL_TRUSTED_SERVICES: JSON.stringify({browser: BROWSER_SERVICE}),
    CUA_REPL_TRUSTED_RPC_ENABLED: '1',
    CUA_REPL_TRUSTED_CODE_PATHS: [REPL_HOST_DIR, CUA_API_DIR, CUA_API_DOCS_DIR, p.moduleDir, SANDBOX_DIR, BIN_DIR, dirname(BROWSER_SERVICE), ...SERVICE_SUPPORT_DIRS, BROWSER_SERVICE_IMPL_DIR].join(':'),
    CUA_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS: '1000',
    NODE_REPL_DISABLE_ANALYTICS: '1',
    CUA_REPL_SANDBOX_EXEC: '/usr/bin/sandbox-exec',
    BROWSER_USE_AVAILABLE_BACKENDS: 'chrome',
    BROWSER_USE_BACKEND_PATHS: '',
    CUA_SECRETS_UNAVAILABLE: 'secrets_disabled',
  });
  assert.equal(Object.keys(env).some(k => k.startsWith('NODE_REPL_') && k !== 'NODE_REPL_DISABLE_ANALYTICS'), false, 'none of the vendor host\'s own settings');
  assert.equal(env.CUA_REPL_NODE_REPL_PATH, undefined);
});

test('the scoped preflight protects the own host\'s trusted roots, its own code among them', t => {
  const {home, dir, runtime} = fixtureRuntime(t);
  const node = fakeNode(dir, 'n/node', '24.1.0');
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'cua', CUA_NODE: node}, surfaces: BROWSER, services: {browser: BROWSER_SERVICE}});
  assertSandboxFits('scoped', launch);
  const overlap = outcome(() => assertSandboxFits('scoped', {...launch, env: {...launch.env, TMPDIR: dirname(REPL_HOST_DIR)}}));
  assert.equal(overlap.code, 'sandbox_conflict');
  assert.match(overlap.message, new RegExp(`the trusted code path ${REPL_HOST_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assertSandboxFits('scoped', {...launch, replHost: {host: 'vendor', reason: 'explicit'}, env: {...launch.env, TMPDIR: dirname(REPL_HOST_DIR), CUA_REPL_TRUSTED_CODE_PATHS: undefined}});
});

// #115 M1: the caller's TMPDIR is no longer a write root, so a conflicting write root now comes from the home itself: a
// run directory that resolves into a trusted code path (repl-parity's confinement/trusted-write-root-overlap builds this).
test('a home whose run directory resolves into the runtime\'s modules fails the scoped preflight on either host', t => {
  const {home, dir, runtime} = fixtureRuntime(t);
  const node = fakeNode(dir, 'n/node', '24.1.0');
  mkdirSync(runtime.paths.moduleDir, {recursive: true});
  symlinkSync(runtime.paths.moduleDir, join(home, 'run'));
  for (const ambient of [AMBIENT, {...AMBIENT, CUA_REPL_HOST: 'cua', CUA_NODE: node}]) {
    const launch = ambient === AMBIENT ? buildLaunch({runtime, home, sessionId: SESSION, ambient}) : buildLaunch({runtime, home, sessionId: SESSION, ambient, surfaces: BROWSER, services: {browser: BROWSER_SERVICE}});
    const overlap = outcome(() => assertSandboxFits('scoped', launch));
    assert.equal(overlap.code, 'sandbox_conflict', launch.replHost.host);
    assert.match(overlap.message, /the trusted code path/);
    assertSandboxFits('disabled', launch);
  }
});

for (const [name, label, key] of [['node', 'the Node cua installed for its own REPL host', 'managedNodeRoot'], ['staging', 'cua install\'s staging directory', 'stagingRoot']]) {
  test(`the scoped preflight protects $CUA_HOME/${name} (${label}) on either host, by real path`, t => {
    const {home, dir, runtime} = fixtureRuntime(t);
    const node = fakeNode(dir, 'n/node', '24.1.0');
    const own = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'cua', CUA_NODE: node}, surfaces: BROWSER, services: {browser: BROWSER_SERVICE}});
    const vendor = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT});
    const root = join(realpathSync(home), name);
    assert.equal(own[key], root);
    assert.equal(vendor[key], root);
    assert.equal(Object.values(own.env).includes(root), false, 'the root is the proxy\'s to protect, not a runtime setting');
    mkdirSync(join(root, 'inner'), {recursive: true});
    symlinkSync(root, join(dir, `${name}-alias`));
    const escaped = `${label} ${root}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const launch of [own, vendor]) {
      assertSandboxFits('scoped', launch);
      for (const tmpdir of [root, join(root, 'inner', 'tmp'), join(dir, `${name}-alias`), join(dir, `${name}-alias`, 'later')]) {
        const overlap = outcome(() => assertSandboxFits('scoped', {...launch, env: {...launch.env, TMPDIR: tmpdir}}));
        assert.equal(overlap.code, 'sandbox_conflict', `${launch.replHost.host} ${tmpdir}`);
        assert.match(overlap.message, new RegExp(escaped));
      }
      assertSandboxFits('disabled', {...launch, env: {...launch.env, TMPDIR: root}});
    }
    // Protected before it exists, too.
    const fresh = fixtureRuntime(t);
    const launch = buildLaunch({runtime: fresh.runtime, home: fresh.home, sessionId: SESSION, ambient: AMBIENT});
    assert.equal(outcome(() => assertSandboxFits('scoped', {...launch, env: {...launch.env, TMPDIR: join(realpathSync(fresh.home), name)}})).code, 'sandbox_conflict');
  });
}

test('an own-host launch refuses a trusted service outside every trusted root, through a symlink too, before anything starts', t => {
  const {home, dir, runtime} = fixtureRuntime(t);
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

test('a launch given the connection\'s REPL host uses it, not a fresh resolution: nothing may switch the runtime under an open connection', t => {
  const {home, runtime} = fixtureRuntime(t);
  const node = '/fixture/node24/bin/node';
  const replHost = replHostFor({platform: 'darwin', surfaces: BROWSER, ambient: {}, home, resolveOwnNode: () => node});
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'vendor'}, surfaces: BROWSER, services: {browser: BROWSER_SERVICE}, replHost,
    resolveOwnNode: () => assert.fail('a launch given the selection does not resolve Node again')});
  assert.deepEqual([launch.replHost, launch.command], [{host: 'cua', reason: 'browser_only'}, node]);
  const fresh = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'vendor'}, surfaces: BROWSER, services: {browser: BROWSER_SERVICE}});
  assert.deepEqual(fresh.replHost, {host: 'vendor', reason: 'explicit'});
});

test('the host identity names the answering host and its version: the own host\'s owned version, the vendor\'s runtime release', () => {
  assert.equal(REPL_HOST_NAME, 'cua-repl-host');
  assert.equal(REPL_HOST_META_KEY, 'cua/replHost');
  assert.match(REPL_HOST_VERSION, /^\d+\.\d+\.\d+$/);
  // Bumped once per milestone that changes what the own host answers (#116): 0.2.0 at M1, 0.3.0 for M2 and M3, 0.4.0
  // for M4's Linux native route, 0.5.0 for M5's default switch (with M4's lifeline and strerror changes), so no
  // recorded handshake or evidence of an earlier host passes for this one.
  assert.equal(REPL_HOST_VERSION, '0.5.0');
  assert.deepEqual(hostIdentity({host: 'cua', release: '26.928.40906-darwin-arm64'}), {host: 'cua', version: REPL_HOST_VERSION});
  assert.deepEqual(hostIdentity({host: 'vendor', release: '26.928.40906-darwin-arm64'}), {host: 'vendor', version: '26.928.40906-darwin-arm64'});
});

// The matrix through both launch consumers (a connection, src/mcp/connection.mjs, and the independent browser-only
// profiles listing, src/profiles/inventory.mjs) and doctor's repl.host row: every home (no registration, the removed
// ChatGPT route's record only, cua's record, both), browser setting the selection ignores, surface set and explicit
// host, on both platforms, with and without a Node 24 or later for the own host, agrees with replHostFor, and every
// launch with the browser surface runs cua's service. Nothing is spawned: prepareLaunch captures the launch and stops
// it. The Node is injected (resolveOwnNode), so the matrix does not depend on the Node running the tests.
test('connections, the profiles listing and doctor agree with the selection table on every home, surface set, explicit host and Node', async t => {
  const STOP = Object.assign(new Error('stopped before spawn'), {code: 'test_stop'});
  const capture = launches => launch => { launches.push(launch); throw STOP; };
  const usernsPass = async () => ({status: 'pass'});
  const helperPass = helper => helper;   // the pinned Linux sandbox helper's check (#115 M3), passing
  const ROUTES = {
    'no registration': () => {},
    'the removed route\'s record': home => writeVendorRecord(home),
    'cua\'s record': home => writeCuaRecord(home),
    'both records': home => { writeVendorRecord(home); writeCuaRecord(home); },
  };
  const BROWSER_SETTINGS = {'nothing set': {}, 'MAWS client mode': {CUA_BROWSER_BACKENDS: '/maws/a.sock'}, 'CUA_BROWSER_SERVICE=vendor (ignored)': {CUA_BROWSER_SERVICE: 'vendor'}};
  const HOSTS = {'host unset': {}, 'host vendor': {CUA_REPL_HOST: 'vendor'}, 'host cua': {CUA_REPL_HOST: 'cua'}};
  // An explicit vendor never asks for Node, so the no-Node column repeats only the other two.
  const NODES = {'Node 24': {resolve: withNode, hosts: Object.keys(HOSTS)}, 'no Node 24': {resolve: withoutNode, hosts: ['host unset', 'host cua']}};
  // What every consumer must show: replHostFor's selection, the own host's included.
  const expected = ({platform, surfaces, env, home, resolveOwnNode}) => outcome(() => replHostFor({platform, surfaces, ambient: env, home, resolveOwnNode}));
  const recorded = r => (r.code ? r : {host: r.host, reason: r.reason});   // a launch records {host, reason}
  const cuaService = (launch, label) => {
    assert.deepEqual(Object.keys(launch.env).filter(k => /BROWSER/.test(k)).sort(), ['BROWSER_USE_AVAILABLE_BACKENDS', 'BROWSER_USE_BACKEND_PATHS'], label);
    assert.ok((launch.env.CUA_REPL_TRUSTED_CODE_PATHS ?? launch.env.NODE_REPL_TRUSTED_CODE_PATHS).split(':').includes(BROWSER_SERVICE_IMPL_DIR), label);
  };
  const doctorStubs = {inspectHelper: async () => ({socket: '/x', holders: []}), inspectSecrets: async () => ({dir: '/none', exists: false}), inspectAgent: async () => [],
    inspectChrome: async () => [], inspectLinux: async () => [], verifySignatures: async () => []};
  const words = r => (r.code ? `refused (${r.code}): ${r.message}` : `${r.host} host (${r.reason})`);
  const status = (...rs) => (rs.some(r => r.code) ? 'fail' : rs.some(r => r.reason === 'own_host_node_unavailable') ? 'warn' : 'pass');
  let rows = 0;
  for (const host of [DARWIN, LINUX]) {
    for (const [routeLabel, register] of Object.entries(ROUTES)) {
      const home = fakeInstalledHome(t, {host});
      register(home);
      const runtime = resolveRuntime({home, host});
      for (const [nodeLabel, {resolve, hosts}] of Object.entries(NODES)) for (const [browserLabel, browserEnv] of Object.entries(BROWSER_SETTINGS)) for (const hostLabel of hosts) {
        const base = {PATH: '/usr/bin:/bin', CUA_SHIM_SECRETS: 'off', ...browserEnv, ...HOSTS[hostLabel]};
        // The independent listing: browser only, whatever the connection's surfaces.
        const listingExpected = expected({platform: host.platform, surfaces: BROWSER, env: base, home, resolveOwnNode: resolve});
        const listed = [];
        const listing = await listLiveBackends({home, runtime, ambient: base, tabCounts: false, probeUserns: usernsPass, verifyHelper: helperPass, resolveOwnNode: resolve, prepareLaunch: capture(listed)}).then(() => ({}), error => error);
        const label = `${host.platform}, ${routeLabel}, ${nodeLabel}, ${browserLabel}, ${hostLabel}`;
        if (listingExpected.code) assert.deepEqual({code: listing.code, message: listing.message, launches: listed.length}, {...listingExpected, launches: 0}, `listing: ${label}`);
        else {
          assert.deepEqual({code: listing.code, replHost: listed[0]?.replHost, command: listed[0]?.command}, {code: 'test_stop', replHost: recorded(listingExpected),
            command: listingExpected.host === 'cua' ? NODE24 : runtime.paths.node}, `listing: ${label}`);
          cuaService(listed[0], `listing: ${label}`);
        }

        for (const surfaces of [COMPUTER, BROWSER, BOTH]) {
          const env = {...base, CUA_SHIM_SURFACES: surfaces.join(',')};
          const sessionExpected = expected({platform: host.platform, surfaces, env, home, resolveOwnNode: resolve});
          const full = `${label}, ${surfaces}`;
          const launches = [];
          const input = new PassThrough(), output = new PassThrough();
          const frames = [];
          createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
          const resolveOwnNode = counted(resolve);
          const opened = await openConnection({home, env, host, sessionId: randomUUID(), input, output, diagnostics: () => {}, prepareLaunch: capture(launches), probeUserns: usernsPass, verifyHelper: helperPass,
            chrome: {}, listBackends: async () => ({backends: []}), resolveOwnNode}).then(connection => ({connection}), error => ({error}));
          if (sessionExpected.code) {
            assert.deepEqual({code: opened.error?.code, message: opened.error?.message}, sessionExpected, `connection: ${full}`);
          } else {
            assert.ok(opened.connection, `connection: ${full}: ${opened.error?.message}`);
            input.write(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'matrix', version: '0'}}}) + '\n');
            for (let i = 0; i < 200 && !frames.length; i++) await new Promise(resolve => setTimeout(resolve, 5));
            input.end();
            await opened.connection.closed;
            assert.deepEqual(launches.map(l => [l.replHost, l.command]), [[recorded(sessionExpected), sessionExpected.host === 'cua' ? NODE24 : runtime.paths.node]], `connection: ${full}`);
            if (surfaces.includes('browser')) cuaService(launches[0], `connection: ${full}`);
          }
          assert.ok(resolveOwnNode.calls <= 1, `connection: ${full}: Node is resolved at most once per connection (${resolveOwnNode.calls})`);

          const row = (await inspectRuntime({home, env, host, resolveOwnNode: resolve, ...doctorStubs})).checks.find(c => c.name === 'repl.host');
          assert.equal(row?.status, status(sessionExpected, listingExpected), `doctor: ${full}: ${row?.detail}`);
          assert.ok(row.detail.startsWith(`${words(sessionExpected)}`), `doctor: ${full}: ${row.detail}`);
          assert.ok(row.detail.includes(`profile listing (browser only): ${words(listingExpected)}`), `doctor: ${full}: ${row.detail}`);
          rows++;
        }
      }
    }
  }
  assert.equal(rows, 2 * 4 * 3 * (3 + 2) * 3);
});

test('doctor\'s repl.host row names no browser route: a browser-only session is cua\'s own host on every home', async t => {
  const stubs = {host: DARWIN, inspectHelper: async () => ({socket: '/x', holders: []}), inspectSecrets: async () => ({dir: '/none', exists: false}), inspectAgent: async () => [],
    inspectChrome: async () => [], verifySignatures: async () => []};
  const homeWith = register => {
    const s = scratch();
    t.after(s.cleanup);
    register(s.dir);
    return s.dir;
  };
  const row = async (home, env) => (await inspectRuntime({home, env: {CUA_SHIM_SURFACES: 'browser', ...env}, resolveOwnNode: withNode, ...stubs})).checks.find(c => c.name === 'repl.host');
  for (const home of [homeWith(() => {}), homeWith(writeVendorRecord), homeWith(writeCuaRecord)]) for (const env of IGNORED) {
    const browserOnly = await row(home, env);
    assert.equal(browserOnly.status, 'pass', browserOnly.detail);
    assert.ok(browserOnly.detail.startsWith(`cua host (browser_only) on Node ${NODE24}`), browserOnly.detail);
    assert.doesNotMatch(browserOnly.detail, /Browser route|ChatGPT/);
  }
  const computer = await row(homeWith(() => {}), {CUA_SHIM_SURFACES: 'computer'});
  assert.match(computer.detail, /^vendor host \(macos_native_peer_requires_vendor\)/);
  const invalid = await row(homeWith(() => {}), {CUA_REPL_HOST: 'own'});
  assert.equal(invalid.status, 'fail');
  assert.match(invalid.detail, /CUA_REPL_HOST must be cua or vendor/);
});

test('doctor\'s repl.host row explains the M5 defaults, and warns with the remedies where no Node 24 lets a session default to cua\'s own host', async t => {
  const s = scratch();
  t.after(s.cleanup);
  const stubs = {inspectHelper: async () => ({socket: '/x', holders: []}), inspectSecrets: async () => ({dir: '/none', exists: false}), inspectAgent: async () => [],
    inspectChrome: async () => [], inspectLinux: async () => [], verifySignatures: async () => []};
  const row = async (host, env, resolveOwnNode, home = s.dir) => (await inspectRuntime({home, host, env, resolveOwnNode, ...stubs})).checks.find(c => c.name === 'repl.host');

  const browserOnly = await row(DARWIN, {CUA_SHIM_SURFACES: 'browser'}, withNode);
  assert.equal(browserOnly.status, 'pass');
  assert.ok(browserOnly.detail.startsWith(`cua host (browser_only) on Node ${NODE24}: CUA_REPL_HOST is unset, and cua's own host is the default for a browser-only session;`), browserOnly.detail);
  assert.match(browserOnly.detail, /CUA_REPL_HOST=vendor/, 'names the rollback');
  const linux = await row(LINUX, {CUA_SHIM_SURFACES: 'computer', DISPLAY: ':0'}, withNode);
  assert.ok(linux.detail.startsWith(`cua host (linux) on Node ${NODE24}: CUA_REPL_HOST is unset, and cua's own host is the only one on Linux`), linux.detail);
  assert.match(linux.detail, /the vendor host is retired there, #115/);
  assert.doesNotMatch(linux.detail, /CUA_REPL_HOST=cua or vendor chooses/, 'no vendor rollback on Linux (#115 M3)');
  assert.ok(linux.detail.includes(`The profile listing (browser only): cua host (linux) on Node ${NODE24}`), linux.detail);

  // No Node 24: both the session and the listing keep the vendor host, and the row is a warning naming the remedies,
  // `cua install` (which installs the pinned Node for the own host) first.
  const resolve = counted(withoutNode);
  const warned = await row(DARWIN, {CUA_SHIM_SURFACES: 'browser'}, resolve);
  assert.equal(warned.status, 'warn');
  assert.equal(resolve.calls, 1, 'doctor resolves Node once for the session and the listing, as a connection does');
  for (const pattern of [/^vendor host \(own_host_node_unavailable\)/, /cua's own host needs Node 24 or later/, new RegExp(TRIED.map(x => x.replace(/[()]/g, '\\$&')).join(', ')),
    /run `cua install` \(it installs the pinned Node 24 for it under \$CUA_HOME\/node\)/, /install Node 24 or later yourself/, /set CUA_NODE to the absolute path of one/, /The profile listing \(browser only\): vendor host \(own_host_node_unavailable\)/])
    assert.match(warned.detail, pattern);
  // A session that keeps the vendor host anyway (macOS computer) still warns for its listing, which would default to cua.
  const computer = await row(DARWIN, {CUA_SHIM_SURFACES: 'computer,browser'}, withoutNode);
  assert.equal(computer.status, 'warn');
  assert.match(computer.detail, /^vendor host \(macos_native_peer_requires_vendor\)/);
  // An explicit cua with no Node 24 is a refusal, as the connection's is.
  const explicit = await row(DARWIN, {CUA_SHIM_SURFACES: 'browser', CUA_REPL_HOST: 'cua'}, withoutNode);
  assert.equal(explicit.status, 'fail');
  assert.match(explicit.detail, /^refused \(repl_host_node\)/);
  // A CUA_NODE that is not an absolute path fails the row whatever the selection, as `cua serve` refuses it at start
  // (settingsFrom): an explicit vendor host never asks for Node, and still fails, as do the defaults.
  for (const [home, env] of [[s.dir, {CUA_REPL_HOST: 'vendor'}], [s.dir, {}], [s.dir, {CUA_SHIM_SURFACES: 'computer'}]]) {
    const resolve = counted(withNode);
    const invalid = await row(DARWIN, {CUA_SHIM_SURFACES: 'browser', ...env, CUA_NODE: 'relative/node'}, resolve, home);
    assert.equal(invalid.status, 'fail', JSON.stringify(env));
    assert.match(invalid.detail, /^CUA_NODE must be the absolute path of a Node executable; every connection is refused/, JSON.stringify(env));
    assert.equal(resolve.calls, 0, 'refused on its form, before any selection');
  }
  // The summary names a warning without calling the setup unhealthy.
  const report = await inspectRuntime({home: s.dir, host: DARWIN, env: {CUA_SHIM_SURFACES: 'browser'}, resolveOwnNode: withoutNode, ...stubs});
  assert.match(summarize({...report, ok: true}), /warn: repl\.host/);
});

// ---- #115 M1: the per-session TMPDIR, the deny list, cua's own sandbox on macOS ----------------------------------

test('every launch gets its session\'s own TMPDIR, never the caller\'s, on both hosts; createLaunchDirs makes the run directory and it private', t => {
  const {home, dir, runtime} = fixtureRuntime(t);
  const node = fakeNode(dir, 'n/node', '24.1.0');
  for (const ambient of [AMBIENT, {...AMBIENT, CUA_REPL_HOST: 'cua', CUA_NODE: node}]) {
    const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient, ...(ambient.CUA_REPL_HOST ? {surfaces: ['browser'], services: {browser: BROWSER_SERVICE}} : {})});
    assert.equal(launch.sessionTmp, join(home, 'run', SESSION, 'tmp'), launch.replHost.host);
    assert.equal(launch.env.TMPDIR, launch.sessionTmp, launch.replHost.host);
  }
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT});
  assert.equal(existsSync(launch.cwd), false, 'buildLaunch creates nothing');
  createLaunchDirs(launch);
  for (const path of [launch.cwd, launch.sessionTmp, launch.env.CODEX_HOME]) assert.equal(statSync(path).mode & 0o777, 0o700, path);
  chmodSync(launch.sessionTmp, 0o755);
  createLaunchDirs(launch);
  assert.equal(statSync(launch.sessionTmp).mode & 0o777, 0o700, 'a reused session temp is made private again');
});

test('the deny list is resolved once, from the store directories and HOME the worker gets: secrets on and off', t => {
  const {home, dir, runtime} = fixtureRuntime(t);
  const user = join(dir, 'user');
  const store = join(user, STORE_RELATIVE);
  mkdirSync(join(store, 'projects'), {recursive: true});
  mkdirSync(join(dir, 'elsewhere', 'tier'), {recursive: true});
  symlinkSync(join(dir, 'elsewhere', 'tier'), join(store, 'projects', '-linked'));
  const ambient = {...AMBIENT, HOME: user};
  const off = buildLaunch({runtime, home, sessionId: SESSION, ambient, secretsUnavailable: 'secrets_disabled'});
  const real = path => realpathSync(path);
  assert.deepEqual(JSON.parse(off.env.CUA_SANDBOX_DENY_READ), off.denyRead);
  assert.deepEqual(off.denyRead.deny, [real(store), real(join(dir, 'elsewhere', 'tier')), join(real(user), '.config', 'cua'), home],
    'secrets off: the default store for this HOME, which exists whatever the setting, with its symlinked tier\'s target');
  const other = join(dir, 'other-store');
  mkdirSync(other);
  const on = buildLaunch({runtime, home, sessionId: SESSION, ambient, secretsDir: other});
  assert.equal(on.env.CUA_SECRETS_DIR, other);
  assert.deepEqual(on.denyRead.deny, [real(other), join(real(user), '.config', 'cua'), home], 'secrets on: the store the worker reads from');
  assert.deepEqual(on.denyRead.reexpose, [join(home, 'runtimes'), join(home, 'node'), join(home, 'run', SESSION), join(home, 'run', SESSION, 'tmp')]);
});

test('macOS: cua\'s own host runs cua\'s own sandbox (sandbox-exec), without the Codex CLI or CODEX_HOME; the vendor host runs cua\'s compat executable with CODEX_HOME', t => {
  const {home, dir, runtime} = fixtureRuntime(t);
  const node = fakeNode(dir, 'n/node', '24.1.0');
  const own = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_REPL_HOST: 'cua', CUA_NODE: node}, surfaces: BROWSER, services: {browser: BROWSER_SERVICE}});
  assert.deepEqual([own.env.CUA_REPL_SANDBOX_EXEC, own.env.CODEX_CLI_PATH, own.env.CODEX_HOME], ['/usr/bin/sandbox-exec', undefined, undefined]);
  assert.ok(own.env.CUA_REPL_TRUSTED_CODE_PATHS.split(':').includes(SANDBOX_DIR), 'src/sandbox is trusted code');
  const vendor = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT});
  assert.deepEqual([vendor.env.CUA_REPL_SANDBOX_EXEC, vendor.env.CODEX_CLI_PATH, vendor.env.CODEX_HOME], [undefined, COMPAT_EXECUTABLE, join(home, 'state', 'codex')]);
  assert.ok(vendor.env.NODE_REPL_TRUSTED_CODE_PATHS.split(':').includes(SANDBOX_DIR));
});

test('the scoped preflight protects the deny list and src/sandbox; only the launch\'s own run directory and session temp may lie in a deny target', t => {
  const {home, dir, runtime} = fixtureRuntime(t);
  const node = fakeNode(dir, 'n/node', '24.1.0');
  // The user's home beside the cua home, never inside it: a store or ~/.config/cua under the home is refused outright.
  const elsewhere = scratch();
  t.after(elsewhere.cleanup);
  const user = join(realpathSync(elsewhere.dir), 'user');
  const own = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, HOME: user, CUA_REPL_HOST: 'cua', CUA_NODE: node}, surfaces: BROWSER, services: {browser: BROWSER_SERVICE}});
  const vendor = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, HOME: user}});
  for (const launch of [own, vendor]) {
    assertSandboxFits('scoped', launch);
    for (const [tmpdir, what] of [[join(home, 'run', 'other-session'), 'what JavaScript cells may not read'], [join(user, '.config', 'cua', 'x'), 'what JavaScript cells may not read'],
      [join(user, STORE_RELATIVE), 'what JavaScript cells may not read'], [SANDBOX_DIR, 'the trusted code path'], [dirname(SANDBOX_DIR), 'the trusted code path']]) {
      const overlap = outcome(() => assertSandboxFits('scoped', {...launch, env: {...launch.env, TMPDIR: tmpdir}}));
      assert.equal(overlap.code, 'sandbox_conflict', `${launch.replHost.host} ${tmpdir}`);
      assert.ok(overlap.message.includes(what), overlap.message);
    }
  }
});

// Overlapping layouts (review finding, #115 M1): with the cua home under the store, the store under the home, or
// ~/.config/cua under the home, the kernel's deny targets overlap. The connection refuses them before its handshake in
// scoped and default alike, and the scoped exception for the run directory never covers the store.
test('a layout whose deny targets overlap fails the preflight in scoped and default, on either host; disabled serves', t => {
  const {dir, runtime} = fixtureRuntime(t);
  const node = fakeNode(dir, 'n/node', '24.1.0');
  const elsewhere = scratch();
  t.after(elsewhere.cleanup);
  const user = join(realpathSync(elsewhere.dir), 'user');
  const store = join(user, STORE_RELATIVE);
  mkdirSync(join(store, 'cua'), {recursive: true});
  const layouts = {
    'the cua home under the store': {home: join(store, 'cua'), ambient: {HOME: user}},
    'the store under the cua home': {home: dir, ambient: {HOME: user}, secretsDir: join(dir, 'state', 'secrets')},
    '~/.config/cua under the cua home': {home: dir, ambient: {HOME: join(dir, 'user')}},
  };
  for (const [label, {home, ambient, secretsDir}] of Object.entries(layouts)) {
    for (const host of [{}, {CUA_REPL_HOST: 'cua', CUA_NODE: node}]) {
      const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, ...ambient, ...host}, secretsDir, surfaces: BROWSER, services: {browser: BROWSER_SERVICE}});
      for (const mode of ['scoped', 'default']) {
        const refused = outcome(() => assertSandboxFits(mode, launch));
        assert.equal(refused.code, 'sandbox_conflict', `${label}, ${launch.replHost.host}, ${mode}`);
        assert.match(refused.message, /what JavaScript cells may not read overlaps/);
      }
      assertSandboxFits('disabled', launch);
    }
  }
});

// #115 M1 review round 2: the store's tiers are discovered strictly for a confined connection only. A disabled one
// confines nothing, so an unreadable projects/ does not refuse it, and its launch carries no deny list.
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
test('a projects/ whose tiers cannot be established (0111, 0000, 0444) refuses a confined launch; a disabled one is built without a deny list', {skip: asRoot && 'root lists any directory'}, t => {
  const {home, runtime} = fixtureRuntime(t);
  const user = scratchUserHome(t);
  const projects = join(user, STORE_RELATIVE, 'projects');
  mkdirSync(projects, {recursive: true});
  // An external tier behind it: readable by its real path, so a projects/ that hides it refuses, whatever the mode.
  mkdirSync(join(user, 'elsewhere-tier'));
  symlinkSync(join(user, 'elsewhere-tier'), join(projects, '-a-project'));
  const build = sandbox => buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, HOME: user}, sandbox});
  let disabled;
  for (const mode of [0o111, 0o000, 0o444]) {
    chmodSync(projects, mode);
    try {
      for (const sandbox of ['scoped', 'default', undefined]) assert.equal(outcome(() => build(sandbox)).code, 'sandbox_state_invalid', `${mode.toString(8)} ${sandbox}`);
      disabled = build('disabled');
    } finally { chmodSync(projects, 0o700); }
  }
  assert.equal(disabled.denyRead, null);
  assert.equal('CUA_SANDBOX_DENY_READ' in disabled.env, false, 'no list reaches the runtime');
  assertSandboxFits('disabled', disabled);
});

// ---- #117: the native engine's selection, host switch and attestation (docs/doperpowers/specs/2026-10-18-own-native-
// engine-design.md, "Engine selection, host switch and retirement"; Interfaces EngineSelection, EngineAttestation) ----

// The approved engine as installedEngine answers it, and the inputs of every cell: the engine setting (and where it
// comes from), the default (vendor until M5 flips it), CUA_REPL_HOST, Node 24 and whether an approved engine exists.
const APP = {bundlePath: '/Users/someone/Library/Application Support/cua/engine/cua Engine.app', engineVersion: '0.2.0', build: 'f'.repeat(64), approvedAt: '2026-10-20T00:00:00.000Z'};
const SETTINGS = {
  'unset': {env: {}, config: {}, explicit: false},
  'CUA_NATIVE_ENGINE=vendor': {env: {CUA_NATIVE_ENGINE: 'vendor'}, config: {engine: 'cua'}, explicit: true, engine: 'vendor'},
  'CUA_NATIVE_ENGINE=cua': {env: {CUA_NATIVE_ENGINE: 'cua'}, config: {engine: 'vendor'}, explicit: true, engine: 'cua'},
  'engine.json vendor': {env: {}, config: {engine: 'vendor'}, explicit: true, engine: 'vendor'},
  'engine.json cua': {env: {CUA_NATIVE_ENGINE: ''}, config: {engine: 'cua'}, explicit: true, engine: 'cua'},
  'CUA_NATIVE_ENGINE=Cua': {env: {CUA_NATIVE_ENGINE: 'Cua'}, config: {}, invalid: true},
  'engine.json own': {env: {}, config: {engine: 'own'}, invalid: true},
};
// The table as the spec writes it, row by row (an independent statement of it, not a call into launch.mjs): the outcome
// of one cell -> {code} | {host, reason, engine, status}.
function tableCell({setting, defaultEngine, host, node, installed}) {
  if (setting.invalid) return {code: 'invalid_setting'};
  const engine = setting.engine ?? defaultEngine;
  const explicit = setting.explicit || host === 'cua';   // "cua (default) | cua | any | any: as the explicit cua rows"
  if (engine === 'vendor') {
    if (host === 'cua') return {code: 'repl_host_refused'};
    return {host: 'vendor', reason: host === 'vendor' ? 'explicit' : 'macos_native_peer_requires_vendor', engine: 'vendor', status: 'pass'};
  }
  if (explicit) {
    if (!installed) return {code: 'engine_not_installed'};
    if (host === 'vendor') return {host: 'vendor', reason: 'explicit', engine: 'cua', status: 'pass'};   // comparison A's lane
    if (!node) return {code: 'repl_host_node'};
    return {host: 'cua', reason: host === 'cua' ? 'explicit' : 'cua_engine', engine: 'cua', status: 'pass'};
  }
  // The default cua (M5 on), CUA_REPL_HOST unset or vendor, until M6.
  if (!installed) return {host: 'vendor', reason: 'engine_not_installed', engine: 'vendor', status: 'warn'};
  if (host === 'vendor') return {host: 'vendor', reason: 'explicit', engine: 'cua', status: 'pass'};
  if (!node) return {host: 'vendor', reason: 'own_host_node_unavailable', engine: 'vendor', status: 'warn'};
  return {host: 'cua', reason: 'cua_engine', engine: 'cua', status: 'pass'};
}
// replHostFor on macOS computer with the cell's inputs injected; counts what it asked for.
function selectCell({setting, defaultEngine, host, node, installed}, surfaces = COMPUTER) {
  const asked = {config: 0, installed: 0, node: 0};
  const ambient = {...setting.env, ...(host === undefined ? {} : {CUA_REPL_HOST: host})};
  const result = outcome(() => replHostFor({platform: 'darwin', surfaces, ambient, resolveOwnNode: () => { asked.node++; return (node ? withNode : withoutNode)(); },
    engine: {defaultEngine, config: () => { asked.config++; return setting.config; }, installed: () => { asked.installed++; return installed ? APP : null; }}}));
  return {result, asked};
}
const shapeOf = result => (result.code ? {code: result.code} : {host: result.host, reason: result.reason, engine: result.engine.engine, status: result.engine.status});

test('the engine selection covers every cell of the table: setting, default, CUA_REPL_HOST, Node 24 and an approved engine', () => {
  let cells = 0;
  for (const [settingLabel, setting] of Object.entries(SETTINGS)) for (const defaultEngine of ['vendor', 'cua']) for (const host of [undefined, 'vendor', 'cua'])
    for (const node of [true, false]) for (const installed of [true, false]) for (const surfaces of [COMPUTER, BOTH]) {
      const cell = {setting, defaultEngine, host, node, installed};
      const label = `${settingLabel}, default ${defaultEngine}, CUA_REPL_HOST=${host ?? 'unset'}, ${node ? 'Node 24' : 'no Node 24'}, ${installed ? 'installed' : 'not installed'}, ${surfaces}`;
      const {result, asked} = selectCell(cell, surfaces);
      assert.deepEqual(shapeOf(result), tableCell(cell), label);
      // What a cell may ask for: engine.json only when CUA_NATIVE_ENGINE is unset or empty, the approved engine only when
      // the setting is cua (its codesign read is the costly one), Node only on the own host's path; each at most once.
      assert.ok(asked.config <= 1 && asked.installed <= 1 && asked.node <= 1, `${label}: ${JSON.stringify(asked)}`);
      assert.equal(asked.config, setting.env.CUA_NATIVE_ENGINE ? 0 : 1, `${label}: engine.json read`);
      const engine = setting.invalid ? null : setting.engine ?? defaultEngine;
      assert.equal(asked.installed, engine === 'cua' ? 1 : 0, `${label}: the approved engine is read only for cua's engine`);
      if (asked.node) assert.ok(engine === 'cua' && installed && host !== 'vendor', `${label}: Node only on the own host's path`);
      if (result.engine?.engine === 'cua') assert.deepEqual(result.engine.app, {bundlePath: APP.bundlePath, engineVersion: APP.engineVersion, build: APP.build}, label);
      if (result.host === 'cua') assert.equal(result.node, NODE24, label);
      cells++;
    }
  assert.equal(cells, 7 * 2 * 3 * 2 * 2 * 2);
});

test('the rows written out: today\'s path, the target, comparison A\'s lane and the until-M6 fallbacks of a default cua', () => {
  const pick = (settingLabel, defaultEngine, host, node, installed) => shapeOf(selectCell({setting: SETTINGS[settingLabel], defaultEngine, host, node, installed}).result);
  // vendor (any), CUA_REPL_HOST unset or vendor: today's path.
  assert.deepEqual(pick('unset', 'vendor', undefined, true, true), {host: 'vendor', reason: 'macos_native_peer_requires_vendor', engine: 'vendor', status: 'pass'});
  assert.deepEqual(pick('CUA_NATIVE_ENGINE=vendor', 'cua', 'vendor', false, false), {host: 'vendor', reason: 'explicit', engine: 'vendor', status: 'pass'});
  // vendor (any), CUA_REPL_HOST=cua: refused with today's sentence.
  assert.deepEqual(pick('CUA_NATIVE_ENGINE=vendor', 'vendor', 'cua', true, true), {code: 'repl_host_refused'});
  // cua (explicit), unset or cua, Node, installed: the target.
  assert.deepEqual(pick('CUA_NATIVE_ENGINE=cua', 'vendor', undefined, true, true), {host: 'cua', reason: 'cua_engine', engine: 'cua', status: 'pass'});
  assert.deepEqual(pick('engine.json cua', 'vendor', 'cua', true, true), {host: 'cua', reason: 'explicit', engine: 'cua', status: 'pass'});
  // cua (explicit), no Node: refused; never a fallback.
  assert.deepEqual(pick('CUA_NATIVE_ENGINE=cua', 'vendor', undefined, false, true), {code: 'repl_host_node'});
  // cua (explicit or default), vendor host, installed: comparison A's lane.
  assert.deepEqual(pick('CUA_NATIVE_ENGINE=cua', 'vendor', 'vendor', false, true), {host: 'vendor', reason: 'explicit', engine: 'cua', status: 'pass'});
  assert.deepEqual(pick('unset', 'cua', 'vendor', true, true), {host: 'vendor', reason: 'explicit', engine: 'cua', status: 'pass'});
  // The default cua (M5 on): the target, and the three until-M6 rows that warn rather than break a session.
  assert.deepEqual(pick('unset', 'cua', undefined, true, true), {host: 'cua', reason: 'cua_engine', engine: 'cua', status: 'pass'});
  assert.deepEqual(pick('unset', 'cua', undefined, true, false), {host: 'vendor', reason: 'engine_not_installed', engine: 'vendor', status: 'warn'});
  assert.deepEqual(pick('unset', 'cua', undefined, false, true), {host: 'vendor', reason: 'own_host_node_unavailable', engine: 'vendor', status: 'warn'});
  assert.deepEqual(pick('unset', 'cua', 'vendor', true, false), {host: 'vendor', reason: 'engine_not_installed', engine: 'vendor', status: 'warn'});
  // The default cua with CUA_REPL_HOST=cua is the explicit rows.
  assert.deepEqual(pick('unset', 'cua', 'cua', true, false), {code: 'engine_not_installed'});
  assert.deepEqual(pick('unset', 'cua', 'cua', false, true), {code: 'repl_host_node'});
  // An unknown value.
  assert.deepEqual(pick('CUA_NATIVE_ENGINE=Cua', 'vendor', undefined, true, true), {code: 'invalid_setting'});
});

test('the three engine_not_installed refusals and the refusal precedence: unknown value, host setting, approved engine, Node', () => {
  const refusal = (settingLabel, host, node, installed, defaultEngine = 'vendor') => selectCell({setting: SETTINGS[settingLabel], defaultEngine, host, node, installed}).result;
  // engine_not_installed whatever the host and the Node: the explicit cua with no approved engine.
  for (const host of [undefined, 'vendor', 'cua']) for (const node of [true, false]) {
    const refused = refusal('CUA_NATIVE_ENGINE=cua', host, node, false);
    assert.equal(refused.code, 'engine_not_installed', `${host} ${node}`);
    assert.match(refused.message, /cua install --engine/);
    assert.match(refused.message, /cua engine build/);
    assert.match(refused.message, /CUA_NATIVE_ENGINE=vendor/);
  }
  assert.match(refusal('engine.json cua', undefined, true, false).message, /engine\.json/, 'names where the setting came from');
  // An unknown value first, whatever else would refuse.
  for (const label of ['CUA_NATIVE_ENGINE=Cua', 'engine.json own']) for (const host of [undefined, 'vendor', 'cua']) for (const node of [true, false]) {
    const refused = refusal(label, host, node, false);
    assert.equal(refused.code, 'invalid_setting', `${label} ${host} ${node}`);
    assert.match(refused.message, /must be vendor or cua/);
  }
  assert.equal(refusal('CUA_NATIVE_ENGINE=Cua', undefined, true, true).message, 'CUA_NATIVE_ENGINE must be vendor or cua');
  // The host setting before the approved engine and Node: the vendor engine with CUA_REPL_HOST=cua, whose sentence
  // names the setting that selected the vendor engine and CUA_NATIVE_ENGINE=cua as the way to cua's own host.
  const host = refusal('CUA_NATIVE_ENGINE=vendor', 'cua', false, false);
  assert.equal(host.code, 'repl_host_refused');
  for (const pattern of [/on macOS and the vendor engine \(CUA_NATIVE_ENGINE=vendor\)/, /only the vendor host's node_repl/, /Set CUA_NATIVE_ENGINE=cua/, /CUA_REPL_HOST=vendor/]) assert.match(host.message, pattern);
  assert.doesNotMatch(host.message, /#117/);
  assert.match(refusal('unset', 'cua', true, true).message, /vendor engine \(the default engine \(vendor\)\)/);
  // Node last: it names Node 24 and CUA_REPL_HOST=vendor as the way to run cua's engine on the vendor host.
  const node = refusal('CUA_NATIVE_ENGINE=cua', undefined, false, true);
  assert.equal(node.code, 'repl_host_node');
  for (const pattern of [/Node 24 or later/, /CUA_REPL_HOST=vendor/, /cua's engine/]) assert.match(node.message, pattern);
  // An unreadable engine.json is the setting's refusal too.
  const unreadable = outcome(() => replHostFor({platform: 'darwin', surfaces: COMPUTER, ambient: {}, resolveOwnNode: withNode,
    engine: {config: () => { throw new CuaError('engine_settings_invalid', '/Users/someone/.config/cua/engine.json is not a JSON object'); }, installed: () => APP}}));
  assert.deepEqual(unreadable, {code: 'invalid_setting', message: '/Users/someone/.config/cua/engine.json is not a JSON object'});
});

test('the engine setting is read only for the computer surface on macOS: Linux and browser-only sessions ignore it', () => {
  const never = () => assert.fail('not asked outside macOS computer');
  for (const [platform, surfaces] of [['linux', COMPUTER], ['linux', BOTH], ['darwin', BROWSER]]) for (const value of ['cua', 'vendor', 'nonsense']) {
    const selected = replHostFor({platform, surfaces, ambient: {CUA_NATIVE_ENGINE: value}, resolveOwnNode: withNode, engine: {config: never, installed: never}});
    assert.equal(selected.engine, undefined, `${platform} ${surfaces} ${value}`);
    assert.equal(selected.host, 'cua');
  }
});

test('the production engine inputs: engine.json and the approved engine are read from the caller\'s HOME', t => {
  const s = scratch();
  t.after(s.cleanup);
  const user = realpathSync(s.dir);
  const dir = join(user, 'Library', 'Application Support', 'cua', 'engine');
  // No engine.json and no approved engine: the default (vendor) without asking for the bundle.
  assert.deepEqual(replHostFor({platform: 'darwin', surfaces: COMPUTER, ambient: {HOME: user}, resolveOwnNode: withNode}).engine, {engine: 'vendor', reason: 'default', status: 'pass'});
  mkdirSync(join(user, '.config', 'cua'), {recursive: true});
  writeFileSync(join(user, '.config', 'cua', 'engine.json'), JSON.stringify({engine: 'cua', signingIdentity: 'unused'}));
  const refused = outcome(() => replHostFor({platform: 'darwin', surfaces: COMPUTER, ambient: {HOME: user}, resolveOwnNode: withNode}));
  assert.equal(refused.code, 'engine_not_installed');
  assert.ok(refused.message.includes(join(dir, 'cua Engine.app')), refused.message);
  writeFileSync(join(user, '.config', 'cua', 'engine.json'), '[]');
  assert.equal(outcome(() => replHostFor({platform: 'darwin', surfaces: COMPUTER, ambient: {HOME: user}, resolveOwnNode: withNode})).code, 'invalid_setting');
});

// The engine's selection carried into the launch: the service module and the bundle the trusted worker gets, and the
// attestation the proxy stamps.
test('with cua\'s engine the launch names cua\'s service and the approved bundle on either host, and never the vendor helper', t => {
  const {home, runtime} = fixtureRuntime(t);
  const cuaEngine = {engine: 'cua', reason: 'explicit', status: 'pass', app: {bundlePath: APP.bundlePath, engineVersion: APP.engineVersion, build: APP.build}};
  const launchWith = (replHost, surfaces = COMPUTER) => buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, surfaces, replHost,
    services: Object.assign({}, surfaces.includes('computer') ? {sky: SKY_SERVICE} : {}, surfaces.includes('browser') ? {browser: BROWSER_SERVICE} : {})});
  const engineService = join(ENGINE_SERVICE_DIR, 'service.mjs');
  for (const replHost of [{host: 'cua', reason: 'cua_engine', node: NODE24, engine: cuaEngine}, {host: 'vendor', reason: 'explicit', engine: cuaEngine}]) {
    const launch = launchWith(replHost);
    const label = `${replHost.host} host`;
    assert.equal(launch.env.CUA_SKY_SERVICE, engineService, label);
    assert.equal(launch.env.CUA_ENGINE_APP, APP.bundlePath, label);
    assert.equal(launch.env.CUA_ENGINE_SCREENSHOTS, join(home, 'run', SESSION, 'screenshots'), label);
    assert.equal('SKY_CUA_SERVICE_PATH' in launch.env, false, `${label}: nothing may open the vendor helper`);
    assert.ok(launch.env[replHost.host === 'cua' ? 'CUA_REPL_TRUSTED_CODE_PATHS' : 'NODE_REPL_TRUSTED_CODE_PATHS'].split(':').includes(ENGINE_SERVICE_DIR), label);
    assert.deepEqual(launch.nativeEngine, {engine: 'cua', version: APP.engineVersion, build: APP.build}, label);
    assert.deepEqual(launch.replHost, {host: replHost.host, reason: replHost.reason}, label);
  }
  // The own host's launch of cua's engine runs the supervisor; the vendor host's runs the vendor's cua-repl.
  assert.deepEqual(launchWith({host: 'cua', reason: 'cua_engine', node: NODE24, engine: cuaEngine}).args, ['--disable-sigusr1', REPL_HOST_SUPERVISOR]);
  assert.deepEqual(launchWith({host: 'vendor', reason: 'explicit', engine: cuaEngine}).args, [runtime.paths.cuaRepl]);
  // The vendor engine: today's environment and the launcher's attestation.
  const vendor = launchWith({host: 'vendor', reason: 'macos_native_peer_requires_vendor', engine: {engine: 'vendor', reason: 'default', status: 'pass'}});
  assert.equal(vendor.env.CUA_SKY_SERVICE, runtime.paths.skyVendorService);
  assert.equal(vendor.env.SKY_CUA_SERVICE_PATH, runtime.paths.skyServiceApp);
  assert.equal('CUA_ENGINE_APP' in vendor.env, false);
  assert.deepEqual(vendor.nativeEngine, {engine: 'vendor', version: null, build: runtime.release}, 'the fixture helper has no Info.plist');
  // A launch that resolves its own selection is today's.
  assert.deepEqual(buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, services: {sky: SKY_SERVICE}}).env, vendor.env);
  // No attestation without the computer surface.
  assert.equal(launchWith({host: 'cua', reason: 'browser_only', node: NODE24}, BROWSER).nativeEngine, null);
});

test('the vendor engine\'s attestation names the helper bundle\'s version and the runtime release', t => {
  const {home, runtime} = fixtureRuntime(t);
  mkdirSync(join(runtime.paths.skyServiceApp, 'Contents'), {recursive: true});
  writeFileSync(join(runtime.paths.skyServiceApp, 'Contents', 'Info.plist'), '<?xml version="1.0"?><plist version="1.0"><dict>\n'
    + '\t<key>CFBundleShortVersionString</key>\n\t<string>26.924.1001281</string>\n\t<key>CFBundleVersion</key>\n\t<string>1001281</string>\n</dict></plist>\n');
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT});
  assert.deepEqual(launch.nativeEngine, {engine: 'vendor', version: '26.924.1001281', build: runtime.release});
});

// Doctor's repl.host row under the engine selection: the host and reason a macOS computer session gets, refusals with
// their code, the engine named after the host's explanation, and a warning exactly where the table warns.
test('doctor\'s repl.host row follows the engine selection: host and reason, the engine it drives, refusals and warnings', async t => {
  const s = scratch();
  t.after(s.cleanup);
  const stubs = {host: DARWIN, inspectHelper: async () => ({socket: '/x', holders: []}), inspectSecrets: async () => ({dir: '/none', exists: false}), inspectAgent: async () => [],
    inspectChrome: async () => [], verifySignatures: async () => []};
  const row = async (env, {installed = true, defaultEngine = 'vendor', resolveOwnNode = withNode} = {}) => (await inspectRuntime({home: s.dir, env: {CUA_SHIM_SURFACES: 'computer,browser', ...env}, resolveOwnNode,
    engine: {defaultEngine, config: () => ({}), installed: () => (installed ? APP : null)}, ...stubs})).checks.find(c => c.name === 'repl.host');
  const today = await row({});
  assert.equal(today.status, 'pass');
  assert.match(today.detail, /^vendor host \(macos_native_peer_requires_vendor\): .*; native engine vendor \(default\): /);
  const target = await row({CUA_NATIVE_ENGINE: 'cua'});
  assert.equal(target.status, 'pass');
  assert.ok(target.detail.startsWith(`cua host (cua_engine) on Node ${NODE24}: `), target.detail);
  assert.match(target.detail, /; native engine cua \(explicit\): CUA_NATIVE_ENGINE=cua; .*cua Engine\.app/);
  assert.ok(target.detail.includes(APP.bundlePath) && target.detail.includes(APP.engineVersion), target.detail);
  const laneA = await row({CUA_NATIVE_ENGINE: 'cua', CUA_REPL_HOST: 'vendor'});
  assert.match(laneA.detail, /^vendor host \(explicit\): CUA_REPL_HOST=vendor; native engine cua \(explicit\)/);
  for (const [env, options, code] of [[{CUA_NATIVE_ENGINE: 'cua'}, {installed: false}, 'engine_not_installed'], [{CUA_NATIVE_ENGINE: 'cua'}, {resolveOwnNode: withoutNode}, 'repl_host_node'],
    [{CUA_NATIVE_ENGINE: 'own'}, {}, 'invalid_setting'], [{CUA_NATIVE_ENGINE: 'vendor', CUA_REPL_HOST: 'cua'}, {}, 'repl_host_refused']]) {
    const refused = await row(env, options);
    assert.equal(refused.status, 'fail', JSON.stringify(env));
    assert.ok(refused.detail.startsWith(`refused (${code}): `), refused.detail);
  }
  // The default cua's until-M6 rows warn, naming why the session keeps the vendor host and engine.
  const notInstalled = await row({}, {defaultEngine: 'cua', installed: false});
  assert.equal(notInstalled.status, 'warn');
  assert.match(notInstalled.detail, /^vendor host \(engine_not_installed\): .*cua install --engine.*; native engine vendor \(engine_not_installed\)/);
  const noNode = await row({}, {defaultEngine: 'cua', resolveOwnNode: withoutNode});
  assert.equal(noNode.status, 'warn');
  assert.match(noNode.detail, /^vendor host \(own_host_node_unavailable\): .*; native engine vendor \(own_host_node_unavailable\)/);
  // The listing (browser only) never names an engine.
  assert.doesNotMatch(target.detail.split('. The profile listing (browser only): ')[1], /native engine/);
});
