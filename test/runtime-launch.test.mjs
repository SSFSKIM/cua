import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, realpathSync, symlinkSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {buildLaunch, SKY_SERVICE, SERVICE_SUPPORT_DIRS} from '../src/runtime/launch.mjs';
import {parsePin, runtimeFor} from '../src/runtime/manifest.mjs';
import {scratch, fixturePin} from './fixtures/runtime-fixture.mjs';

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

test('a broker endpoint reaches the launch environment only as explicit values, never as a sandbox socket allowance', t => {
  const {home, runtime} = fixtureRuntime(t);
  const broker = {endpoint: join(home, 'run', SESSION, 'broker.sock'), token: 'capability-token-for-test'};
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, broker});
  assert.equal(env.CUA_SECRETS_BROKER_ENDPOINT, broker.endpoint);
  assert.equal(env.CUA_SECRETS_BROKER_TOKEN, broker.token);
  assert.equal(env.NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS, undefined);
  assert.equal(env.NODE_REPL_UNTRUSTED_ENV_ALLOWLIST, undefined, 'cells must not be granted the broker variables');
  const without = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT}).env;
  assert.equal(Object.keys(without).some(k => k.startsWith('CUA_SECRETS_')), false);
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

test('without a broker the launch tells the trusted worker why, so a secret reference fails with that reason', t => {
  const {home, runtime} = fixtureRuntime(t);
  const {env} = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, secretsUnavailable: 'secrets_disabled'});
  assert.equal(env.CUA_SECRETS_UNAVAILABLE, 'secrets_disabled');
  assert.equal(env.CUA_SECRETS_BROKER_ENDPOINT, undefined);
  const broker = {endpoint: join(home, 'run', 'b.sock'), token: 'capability-token-for-test'};
  const withBroker = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, broker, secretsUnavailable: 'secrets_disabled'}).env;
  assert.equal(withBroker.CUA_SECRETS_UNAVAILABLE, undefined, 'a running broker wins');
  assert.throws(() => buildLaunch({runtime, home, sessionId: SESSION, secretsUnavailable: 'Bad Reason!'}), err => err.code === 'invalid_secrets_reason');
});
