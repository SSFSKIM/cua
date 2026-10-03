// `cua login` and the login status check, against a fake `codex` executable: argument handling, the allowlisted
// environment with the owned CODEX_HOME, TTY refusal and exit-code mapping. No real login ever runs here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, realpathSync, statSync, symlinkSync, writeFileSync, chmodSync} from 'node:fs';
import {join} from 'node:path';
import {loginInvocation, runLogin, loginStatus, LOGIN_STATES} from '../src/runtime/login.mjs';
import {REPO, scratch, forgeActiveRuntime, fakeCodexScript, FAKE_CODEX_SENTINEL} from './fixtures/runtime-fixture.mjs';

const CLI = join(REPO, 'bin', 'cua.mjs');
const darwinArm = process.platform === 'darwin' && process.arch === 'arm64';

function fakeRuntime(dir, options) {
  const codexCli = join(dir, 'codex');
  writeFileSync(codexCli, fakeCodexScript(options));
  chmodSync(codexCli, 0o755);
  return {paths: {codexCli}};
}
const fakeLog = codexHome => existsSync(join(codexHome, 'fake-codex.log')) ? readFileSync(join(codexHome, 'fake-codex.log'), 'utf8') : null;
const envOf = log => Object.fromEntries(log.split('\n').filter(l => l.startsWith('env:')).map(l => { const s = l.slice(4); const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; }));
const argvOf = log => log.split('\n').filter(l => l.startsWith('argv:')).map(l => l.slice(5).trim());

test('the invocation runs the bundled CLI against the owned CODEX_HOME with an allowlisted environment', t => {
  const s = scratch();
  t.after(s.cleanup);
  const runtime = {paths: {codexCli: '/r/CodexCLI.app/Contents/MacOS/codex'}};
  const ambient = {HOME: '/Users/u', USER: 'u', LANG: 'en_US.UTF-8', TERM: 'xterm-256color', HTTPS_PROXY: 'http://proxy:3128',
    CODEX_HOME: '/Users/u/.codex', OPENAI_API_KEY: 'sk-ambient', CODEX_API_KEY: 'k', NODE_OPTIONS: '--require x', PATH: '/evil/bin', RUST_LOG: 'trace'};
  const login = loginInvocation({runtime, home: s.dir, mode: 'login', ambient});
  assert.equal(login.command, '/r/CodexCLI.app/Contents/MacOS/codex');
  assert.deepEqual(login.args, ['login']);
  assert.equal(login.env.CODEX_HOME, join(realpathSync(s.dir), 'state', 'codex'));
  assert.equal(login.codexHome, login.env.CODEX_HOME);
  assert.equal(login.env.PATH, '/usr/bin:/bin:/usr/sbin:/sbin');
  for (const key of ['HOME', 'USER', 'LANG', 'TERM', 'HTTPS_PROXY']) assert.equal(login.env[key], ambient[key], key);
  for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'NODE_OPTIONS', 'RUST_LOG']) assert.equal(key in login.env, false, key);
  assert.deepEqual(loginInvocation({runtime, home: s.dir, mode: 'device-auth', ambient}).args, ['login', '--device-auth']);
  assert.deepEqual(loginInvocation({runtime, home: s.dir, mode: 'status', ambient}).args, ['login', 'status']);
  assert.throws(() => loginInvocation({runtime, home: s.dir, mode: 'with-api-key', ambient}), /mode/);
});

test('an owned CODEX_HOME that resolves to the user Codex home is refused', t => {
  const s = scratch();
  t.after(s.cleanup);
  const user = join(s.dir, 'user');
  mkdirSync(join(user, '.codex'), {recursive: true});
  const home = join(s.dir, 'cua');
  mkdirSync(join(home, 'state'), {recursive: true});
  symlinkSync(join(user, '.codex'), join(home, 'state', 'codex'));
  assert.throws(() => loginInvocation({runtime: {paths: {codexCli: '/r/codex'}}, home, mode: 'status', ambient: {HOME: user}}),
    err => err.code === 'codex_home_not_owned');
});

test('login refuses without a terminal and runs nothing', async t => {
  const s = scratch();
  t.after(s.cleanup);
  const runtime = fakeRuntime(s.dir);
  const home = join(s.dir, 'home');
  await assert.rejects(runLogin({home, runtime, isTTY: () => false}), err => err.code === 'tty_required' && /terminal/.test(err.message));
  assert.equal(existsSync(join(home, 'state', 'codex', 'fake-codex.log')), false);
});

test('at a terminal, login creates the owned CODEX_HOME privately and runs codex login (or --device-auth), returning its exit code', async t => {
  const s = scratch();
  t.after(s.cleanup);
  const home = join(s.dir, 'home');
  const codexHome = join(realpathSync(s.dir), 'home', 'state', 'codex');
  const ambient = {HOME: s.dir, OPENAI_API_KEY: 'sk-ambient', CODEX_HOME: '/elsewhere'};
  const code = await runLogin({home, runtime: fakeRuntime(s.dir, {exit: 0}), isTTY: () => true, ambient, stdio: 'ignore'});
  assert.equal(code, 0);
  assert.equal(statSync(codexHome).mode & 0o777, 0o700);
  assert.equal(statSync(join(realpathSync(s.dir), 'home', 'state')).mode & 0o777, 0o700);
  const log = fakeLog(codexHome);
  assert.deepEqual(argvOf(log), ['login']);
  const env = envOf(log);
  assert.equal(env.CODEX_HOME, codexHome);
  assert.equal('OPENAI_API_KEY' in env, false);

  const device = await runLogin({home, deviceAuth: true, runtime: fakeRuntime(s.dir, {exit: 7}), isTTY: () => true, ambient, stdio: 'ignore'});
  assert.equal(device, 7);
  assert.deepEqual(argvOf(fakeLog(codexHome)), ['login', 'login --device-auth']);
});

test('status maps codex login status exit codes to value-free states', async t => {
  const s = scratch();
  t.after(s.cleanup);
  const home = join(s.dir, 'home');
  const codexHome = join(home, 'state', 'codex');
  // No owned CODEX_HOME yet: not logged in, and nothing is run or created.
  const absent = await loginStatus({home, runtime: fakeRuntime(s.dir, {exit: 0})});
  assert.equal(absent.state, LOGIN_STATES.notLoggedIn);
  assert.equal(existsSync(codexHome), false);

  mkdirSync(codexHome, {recursive: true, mode: 0o700});
  assert.equal((await loginStatus({home, runtime: fakeRuntime(s.dir, {exit: 0})})).state, LOGIN_STATES.loggedIn);
  assert.deepEqual(argvOf(fakeLog(codexHome)), ['login status']);
  assert.equal((await loginStatus({home, runtime: fakeRuntime(s.dir, {exit: 1})})).state, LOGIN_STATES.notLoggedIn);
  const odd = await loginStatus({home, runtime: fakeRuntime(s.dir, {exit: 3})});
  assert.equal(odd.state, LOGIN_STATES.unknown);
  assert.match(odd.reason, /exited 3/);
  const started = Date.now();
  const slow = await loginStatus({home, runtime: fakeRuntime(s.dir, {exit: 0, sleep: 5}), timeoutMs: 300});
  assert.equal(slow.state, LOGIN_STATES.unknown);
  assert.match(slow.reason, /did not answer/);
  assert.ok(Date.now() - started < 4000, 'the timeout bounds the check');
  const missing = await loginStatus({home, runtime: {paths: {codexCli: join(s.dir, 'nonexistent')}}});
  assert.equal(missing.state, LOGIN_STATES.unknown);
  for (const r of [absent, odd, slow, missing]) assert.doesNotMatch(JSON.stringify(r), new RegExp(FAKE_CODEX_SENTINEL));
});

function cua(args, home) {
  return spawnSync(process.execPath, [CLI, ...args], {env: {...process.env, CUA_HOME: home}, encoding: 'utf8', timeout: 60_000});
}

test('cua login accepts only --device-auth or --status; anything else is a usage error that runs nothing', t => {
  const s = scratch();
  t.after(s.cleanup);
  const home = join(s.dir, 'home');
  forgeActiveRuntime(home, {codexCli: fakeCodexScript()});
  mkdirSync(join(home, 'state', 'codex'), {recursive: true});
  for (const args of [['--with-api-key'], ['--with-access-token'], ['--with-access-token', 'tok'], ['extra'], ['--status', '--device-auth'],
    ['--json'], ['--status', '--json'], ['-c', 'x=1'], ['--config=x'], ['status']]) {
    const r = cua(['login', ...args], home);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
    assert.match(r.stderr, /login takes only --device-auth or --status/);
    assert.doesNotMatch(r.stderr, /tok\b/, 'usage errors never repeat what was passed');
  }
  assert.equal(fakeLog(join(home, 'state', 'codex')), null);
});

test('cua login without a terminal refuses clearly and runs nothing', {skip: !darwinArm}, t => {
  const s = scratch();
  t.after(s.cleanup);
  const home = join(s.dir, 'home');
  forgeActiveRuntime(home, {codexCli: fakeCodexScript()});
  const r = cua(['login'], home);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /tty_required/);
  assert.match(r.stderr, /terminal/);
  assert.equal(existsSync(join(home, 'state', 'codex', 'fake-codex.log')), false);
});

test('cua login --status prints a value-free result and maps the exit code', {skip: !darwinArm}, t => {
  const s = scratch();
  t.after(s.cleanup);
  for (const [exit, status, message] of [[0, 0, /has a Codex login/], [1, 1, /no Codex login.*cua login/]]) {
    const home = join(s.dir, `home-${exit}`);
    forgeActiveRuntime(home, {codexCli: fakeCodexScript({exit})});
    mkdirSync(join(home, 'state', 'codex'), {recursive: true});
    const r = cua(['login', '--status'], home);
    assert.equal(r.status, status, r.stderr);
    assert.match(r.stdout + r.stderr, message);
    assert.doesNotMatch(r.stdout + r.stderr, new RegExp(FAKE_CODEX_SENTINEL));
  }
});

test('cua login with no installed runtime gives the existing install guidance', {skip: !darwinArm}, t => {
  const s = scratch();
  t.after(s.cleanup);
  const r = cua(['login', '--status'], join(s.dir, 'empty'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /runtime_not_installed/);
  assert.match(r.stderr, /cua install/);
});
