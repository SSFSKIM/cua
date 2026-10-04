// Actual Swift helper, driven from Node (part of `npm run test:helper`, never `npm test`): the server's broker
// lifecycle (src/secrets/broker.mjs) and the trusted client (src/secrets/client.mjs) against the real broker. Storage
// is the test host's in-memory store; the production binary is only sent requests it must refuse before any storage
// call, so nothing here touches the Keychain.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, realpathSync} from 'node:fs';
import {join} from 'node:path';
import {startBroker} from '../../../src/secrets/broker.mjs';
import {brokerClient} from '../../../src/secrets/client.mjs';
import {BUILD_OUTPUT} from '../../../src/secrets/helper.mjs';
import {TESTHOST, setThroughTerminal} from '../fixtures/seed.mjs';

const BIN = process.env.CUA_KEYCHAIN_BIN_DIR;
const testhost = BIN ? join(BIN, 'cua-keychain-testhost') : TESTHOST;
const production = BIN ? join(BIN, 'cua-keychain') : BUILD_OUTPUT;
const viaNet = path => net.createConnection(path);
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

function dir(t) {
  const d = realpathSync(mkdtempSync('/tmp/ckn-'));
  t.after(() => rmSync(d, {recursive: true, force: true}));
  return d;
}

async function testhostBroker(t, {seed = {'work-password': 'pw-sentinel-41', other: 'o'}, fail = {}} = {}) {
  const endpoint = join(dir(t), 'b.sock');
  const broker = await startBroker({command: testhost, endpoint, env: {CUA_KEYCHAIN_TESTHOST_SEED: JSON.stringify(seed), CUA_KEYCHAIN_TESTHOST_FAIL: JSON.stringify(fail)}});
  t.after(() => broker.close());
  return broker;
}

const rejection = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };

function rawExchange(endpoint, bytes) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint);
    let buffer = Buffer.alloc(0);
    socket.on('data', chunk => { buffer = Buffer.concat([buffer, chunk]); });
    socket.on('end', () => resolve(buffer.length >= 4 ? JSON.parse(buffer.subarray(4, 4 + buffer.readUInt32BE(0)).toString('utf8')) : null));
    socket.on('error', reject);
    socket.write(bytes);
  });
}
const frame = body => { const h = Buffer.alloc(4); h.writeUInt32BE(body.length); return Buffer.concat([h, body]); };

test('the client reads values and lists labels through the actual broker with the token the server generated', async t => {
  const broker = await testhostBroker(t);
  const client = brokerClient({endpoint: broker.endpoint, token: broker.token, connect: viaNet});
  assert.equal(await client.read('work-password'), 'pw-sentinel-41');
  assert.deepEqual(await client.list(), ['other', 'work-password']);
  assert.deepEqual(await broker.list(), ['other', 'work-password']);
});

test('a wrong token gets nothing; missing, denied and locked secrets are typed, value-free outcomes', async t => {
  const broker = await testhostBroker(t, {seed: {a: 'va-zz', b: 'vb-zz', c: 'vc-zz'}, fail: {b: 'denied', c: 'locked'}});
  const forged = brokerClient({endpoint: broker.endpoint, token: 'f'.repeat(43), connect: viaNet});
  for (const error of await Promise.all([rejection(forged.read('a')), rejection(forged.list())])) assert.equal(error.code, 'unauthorized');
  const client = brokerClient({endpoint: broker.endpoint, token: broker.token, connect: viaNet});
  for (const [label, code] of [['missing', 'not_found'], ['b', 'denied'], ['c', 'locked']]) {
    const error = await rejection(client.read(label));
    assert.equal(error.code, code);
    assert.doesNotMatch(error.message, /-zz/);
  }
});

test('oversized and malformed requests are refused by the actual broker', async t => {
  const broker = await testhostBroker(t);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(1 << 20);
  assert.deepEqual(await rawExchange(broker.endpoint, header), {ok: false, error: 'oversized'});
  assert.deepEqual(await rawExchange(broker.endpoint, frame(Buffer.from('{"v":1'))), {ok: false, error: 'malformed'});
  assert.deepEqual(await rawExchange(broker.endpoint, frame(Buffer.from(JSON.stringify({v: 1, token: broker.token, op: 'read', label: 'x', also: 1})))), {ok: false, error: 'malformed'});
});

test('closing stops the helper on EOF and removes its endpoint; a killed helper reads as disconnected and its socket is removed', async t => {
  const broker = await testhostBroker(t);
  assert.deepEqual(await broker.close(), {confirmed: true, steps: ['eof']});
  assert.equal(alive(broker.pid), false);
  assert.equal(existsSync(broker.endpoint), false);

  const killed = await testhostBroker(t);
  process.kill(killed.pid, 'SIGKILL');
  await killed.exited;
  const client = brokerClient({endpoint: killed.endpoint, token: killed.token, connect: viaNet});
  assert.equal((await rejection(client.read('work-password'))).code, 'disconnected');
  assert.equal((await killed.close()).confirmed, true);
  assert.equal(existsSync(killed.endpoint), false);
});

test('the broker never replaces an existing path', async t => {
  const endpoint = join(dir(t), 'taken.sock');
  writeFileSync(endpoint, 'not a socket');
  const error = await rejection(startBroker({command: testhost, endpoint}));
  assert.equal(error.code, 'broker_failed');
  assert.match(error.message, /endpoint_exists/);
  assert.equal(readFileSync(endpoint, 'utf8'), 'not a socket');
});

test('the production helper\'s broker refuses unauthenticated, malformed and oversized requests before any storage call', async t => {
  const endpoint = join(dir(t), 'p.sock');
  const broker = await startBroker({command: production, endpoint});
  t.after(() => broker.close());
  const forged = brokerClient({endpoint, token: 'f'.repeat(43), connect: viaNet});
  assert.equal((await rejection(forged.read('cua-never-stored'))).code, 'unauthorized');
  assert.equal((await rejection(forged.list())).code, 'unauthorized');
  assert.deepEqual(await rawExchange(endpoint, frame(Buffer.from('nope'))), {ok: false, error: 'malformed'});
  const header = Buffer.alloc(4);
  header.writeUInt32BE(1 << 20);
  assert.deepEqual(await rawExchange(endpoint, header), {ok: false, error: 'oversized'});
  assert.deepEqual(await broker.close(), {confirmed: true, steps: ['eof']});
  assert.equal(existsSync(endpoint), false);
});

test('the seeding fixture types a value at the helper\'s hidden prompt without it appearing anywhere', async () => {
  const report = await setThroughTerminal({helper: testhost, label: 'seeded', value: 'seed-sentinel-8c1'});
  assert.deepEqual(report, {exit: 0, signal: null, timedOut: false, failedStep: null, terminalRestored: true, echoed: false});
  assert.throws(() => setThroughTerminal({helper: testhost, label: 'x', value: 'line\rbreak'}), TypeError);
});
