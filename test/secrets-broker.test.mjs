// The server's side of the per-connection broker: starting `cua-keychain broker` with its configuration on stdin,
// the ready handshake, listing through it, and bounded close. A JavaScript stand-in plays the helper here; the actual
// Swift broker runs under `npm run test:helper`.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, writeFileSync, mkdirSync, realpathSync} from 'node:fs';
import {join} from 'node:path';
import {startBroker, endpointFor, openSecrets} from '../src/secrets/broker.mjs';
import {CuaError} from '../src/runtime/errors.mjs';
import {REPO, scratch, shortScratch} from './fixtures/runtime-fixture.mjs';

const FAKE = join(REPO, 'test', 'fixtures', 'fake-keychain-helper.mjs');
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

function setup(t, mode = 'serve', secrets = {'work-password': 'pw-sentinel', other: 'o'}) {
  const s = shortScratch();
  t.after(s.cleanup);
  const record = join(s.dir, 'record.json');
  const helper = {
    command: process.execPath, args: [FAKE, 'broker'],
    env: {FAKE_HELPER_MODE: mode, FAKE_HELPER_SECRETS: JSON.stringify(secrets), FAKE_HELPER_RECORD: record},
  };
  return {dir: realpathSync(s.dir), endpoint: join(realpathSync(s.dir), 'b.sock'), helper, record: () => JSON.parse(readFileSync(record, 'utf8'))};
}

test('the broker gets its endpoint and a fresh random token on stdin only, lists labels, and closes on EOF', async t => {
  const f = setup(t);
  const broker = await startBroker({...f.helper, endpoint: f.endpoint, ambient: {HOME: '/Users/x', AMBIENT_SECRET: 'nope', PATH: '/opt/bin'}});
  assert.equal(broker.endpoint, f.endpoint);
  assert.match(broker.token, /^[A-Za-z0-9_-]{43}$/);
  const {argv, env, config} = f.record();
  assert.deepEqual(argv, ['broker']);
  assert.deepEqual(config, {socket: f.endpoint, token: broker.token});
  assert.equal(env.AMBIENT_SECRET, undefined);
  assert.equal(env.HOME, '/Users/x');
  assert.equal(env.PATH, '/usr/bin:/bin:/usr/sbin:/sbin');
  assert.equal(Object.values(env).some(v => String(v).includes(broker.token)), false);
  assert.deepEqual(await broker.list(), ['other', 'work-password']);

  const closed = await broker.close({budgetMs: 2000});
  assert.deepEqual(closed, {confirmed: true, steps: ['eof']});
  assert.equal(alive(broker.pid), false);
  assert.equal(existsSync(f.endpoint), false);
  assert.equal(await broker.close(), closed, 'close is idempotent');
});

test('each broker gets a different token', async t => {
  const tokens = [];
  for (let i = 0; i < 2; i++) {
    const f = setup(t);
    const broker = await startBroker({...f.helper, endpoint: f.endpoint});
    tokens.push(broker.token);
    await broker.close();
  }
  assert.notEqual(tokens[0], tokens[1]);
});

test('a helper that refuses, never answers or speaks another protocol fails classified and is not left running', async t => {
  for (const [mode, code] of [['refuse', 'broker_failed'], ['silent', 'broker_timeout'], ['protocol-2', 'helper_incompatible']]) {
    const f = setup(t, mode);
    const started = Date.now();
    const error = await startBroker({...f.helper, endpoint: f.endpoint, readyTimeoutMs: 300}).then(() => null, e => e);
    assert.ok(error instanceof CuaError, mode);
    assert.equal(error.code, code, mode);
    assert.ok(Date.now() - started < 3000, mode);
    if (mode === 'refuse') assert.match(error.message, /endpoint_exists/);
    const {argv} = f.record();
    assert.deepEqual(argv, ['broker']);
  }
});

test('close is bounded against a helper that ignores EOF and SIGTERM, and removes the endpoint it left', async t => {
  const f = setup(t, 'stubborn');
  const broker = await startBroker({...f.helper, endpoint: f.endpoint});
  const started = Date.now();
  const closed = await broker.close({budgetMs: 1000});
  assert.ok(Date.now() - started < 2000);
  assert.deepEqual(closed.steps, ['eof', 'SIGTERM', 'SIGKILL']);
  assert.equal(closed.confirmed, true);
  assert.equal(alive(broker.pid), false);
  assert.equal(existsSync(f.endpoint), false);
});

test('endpoints are per-connection sockets under run/, refused when too long for a unix socket', t => {
  const s = shortScratch();
  t.after(s.cleanup);
  const home = realpathSync(s.dir);
  const session = '6f1c2d3e-0000-4000-8000-000000000001';
  assert.equal(endpointFor(home, session), join(home, 'run', `${session}.sock`));
  const deep = join(home, 'x'.repeat(80));
  assert.throws(() => endpointFor(deep, session), error => error.code === 'endpoint_path_too_long');
});

test('openSecrets reports why secrets are unavailable instead of failing the connection', async t => {
  const s = shortScratch();
  t.after(s.cleanup);
  const home = realpathSync(s.dir);
  mkdirSync(join(home, 'run'));
  const session = '6f1c2d3e-0000-4000-8000-000000000002';
  const diagnostics = [];
  const note = line => diagnostics.push(line);

  const off = await openSecrets({enabled: false, home, sessionId: session, diagnostics: note});
  assert.deepEqual(off.unavailable.code, 'secrets_disabled');
  const unbuilt = await openSecrets({enabled: true, helper: {built: false, path: '/nowhere/cua-keychain'}, home, sessionId: session, diagnostics: note});
  assert.equal(unbuilt.unavailable.code, 'helper_not_built');
  assert.match(unbuilt.unavailable.message, /npm run build:helper/);
  const f = setup(t, 'refuse');
  const refused = await openSecrets({enabled: true, helper: {built: true, ...f.helper}, home, sessionId: session, diagnostics: note});
  assert.equal(refused.unavailable.code, 'broker_failed');
  assert.ok(diagnostics.some(line => /secrets are unavailable on this connection/.test(line)));
  for (const unavailable of [off, unbuilt, refused]) {
    assert.equal(unavailable.broker, undefined);
    assert.deepEqual(await unavailable.close(), {confirmed: true, steps: []});
  }

  const g = setup(t, 'serve', {k: 'v'});
  const open = await openSecrets({enabled: true, helper: {built: true, ...g.helper}, home, sessionId: session, diagnostics: note});
  assert.equal(open.broker.endpoint, join(home, 'run', `${session}.sock`));
  assert.deepEqual(await open.list(), ['k']);
  assert.equal((await open.close()).confirmed, true);
  assert.equal(existsSync(open.broker.endpoint), false);
});

test('a helper path that cannot be executed fails fast as broker_failed', async t => {
  const f = setup(t);
  const started = Date.now();
  const error = await startBroker({command: join(f.dir, 'no-such-helper'), endpoint: f.endpoint}).then(() => null, e => e);
  assert.equal(error?.code, 'broker_failed');
  assert.ok(Date.now() - started < 1000, `${Date.now() - started} ms`);
});
