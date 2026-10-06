// The server's side of the per-connection broker: starting `cua-keychain broker` with its configuration on stdin,
// the ready handshake, listing through it, and bounded close. A JavaScript stand-in plays the helper here; the actual
// Swift broker runs under `npm run test:helper`.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, existsSync, readFileSync, writeFileSync, mkdirSync, realpathSync} from 'node:fs';
import {join} from 'node:path';
import net from 'node:net';
import {rmSync} from 'node:fs';
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
    const readyTimeoutMs = mode === 'silent' ? 300 : 3000;  // only `silent` is about the timeout; the others must answer in time
    const started = Date.now();
    const error = await startBroker({...f.helper, endpoint: f.endpoint, readyTimeoutMs}).then(() => null, e => e);
    assert.ok(error instanceof CuaError, mode);
    assert.equal(error.code, code, mode);
    // The failure path waits at most the ready timeout, then closes the helper within its 1 s budget; ×3 for load.
    assert.ok(Date.now() - started < (readyTimeoutMs + 1000) * 3, `${mode}: ${Date.now() - started} ms`);
    if (mode === 'refuse') assert.match(error.message, /endpoint_exists/);
    const {argv} = f.record();
    assert.deepEqual(argv, ['broker']);
  }
});

test('close is bounded against a helper that ignores EOF and SIGTERM, and removes the endpoint it left', async t => {
  const f = setup(t, 'stubborn');
  const broker = await startBroker({...f.helper, endpoint: f.endpoint});
  const budgetMs = 1000;
  const started = Date.now();
  const closed = await broker.close({budgetMs});
  assert.ok(Date.now() - started < budgetMs * 3, `${Date.now() - started} ms`);  // ×3: headroom for a loaded machine
  assert.deepEqual(closed.steps, ['eof', 'SIGTERM', 'SIGKILL']);
  assert.equal(closed.confirmed, true);
  assert.equal(alive(broker.pid), false);
  assert.equal(existsSync(f.endpoint), false);
});

test('an endpoint that cannot be removed (EACCES) makes close unconfirmed with a reason instead of rejecting', async t => {
  const f = setup(t, 'stubborn');
  const dir = join(f.dir, 'locked');
  mkdirSync(dir);
  const endpoint = join(dir, 'b.sock');
  const broker = await startBroker({...f.helper, endpoint});
  chmodSync(dir, 0o500);
  let closed;
  try { closed = await broker.close({budgetMs: 1000}); } finally { chmodSync(dir, 0o700); }
  assert.equal(closed.confirmed, false);
  assert.deepEqual(closed.steps, ['eof', 'SIGTERM', 'SIGKILL']);
  assert.match(closed.reason, /could not be removed \(EACCES\)/);
  assert.equal(alive(broker.pid), false);
  assert.equal(existsSync(endpoint), true, 'the socket really is still there');
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

// An independent listener at `path`, standing in for a socket cua does not own.
async function foreignListener(t, path) {
  const server = net.createServer(socket => socket.end());
  await new Promise(resolve => server.listen(path, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return server;
}
const connects = path => new Promise(resolve => {
  const socket = net.createConnection(path);
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
});

test('a broker that never became ready leaves an existing endpoint alone', async t => {
  for (const command of ['refuse', 'missing']) {
    const f = setup(t, 'refuse');
    await foreignListener(t, f.endpoint);
    const helper = command === 'missing' ? {...f.helper, command: join(f.dir, 'no-such-helper')} : f.helper;
    const error = await startBroker({...helper, endpoint: f.endpoint}).then(() => null, e => e);
    assert.equal(error?.code, 'broker_failed', command);
    assert.equal(existsSync(f.endpoint), true, command);
    assert.equal(await connects(f.endpoint), true, command);
  }
});

test('close removes only the socket the broker created, never one that replaced it', async t => {
  const f = setup(t, 'stubborn');
  const broker = await startBroker({...f.helper, endpoint: f.endpoint});
  rmSync(f.endpoint);
  await foreignListener(t, f.endpoint);
  const closed = await broker.close({budgetMs: 1000});
  assert.equal(closed.confirmed, true);
  assert.equal(alive(broker.pid), false);
  assert.equal(existsSync(f.endpoint), true);
  assert.equal(await connects(f.endpoint), true);
});
