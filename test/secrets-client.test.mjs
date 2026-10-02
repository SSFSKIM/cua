// The trusted-side broker client against a scripted broker on a real unix socket. The broker here is a protocol
// double for the client's own behavior; the actual Swift broker is exercised by `npm run test:helper`.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {join} from 'node:path';
import {brokerClient, brokerClientFromEnv, BrokerError, BROKER_ENV} from '../src/secrets/client.mjs';
import {scratch, shortScratch} from './fixtures/runtime-fixture.mjs';

const TOKEN = 't'.repeat(43);
const SENTINEL = 'sentinel-value-7f3a';

const frame = object => {
  const body = Buffer.from(typeof object === 'string' ? object : JSON.stringify(object));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
};

// A broker that decodes one request per connection and answers with `respond(request)`, which returns a reply object,
// a raw Buffer, or null to hang up.
async function scriptedBroker(t, respond) {
  const s = shortScratch();
  t.after(s.cleanup);
  const endpoint = join(s.dir, 'b.sock');
  const requests = [];
  const server = net.createServer(socket => {
    let buffer = Buffer.alloc(0);
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4 || buffer.length < 4 + buffer.readUInt32BE(0)) return;
      const request = JSON.parse(buffer.subarray(4, 4 + buffer.readUInt32BE(0)).toString('utf8'));
      requests.push(request);
      const reply = respond(request);
      if (reply === null) return socket.destroy();
      if (reply === 'hang') return;
      socket.end(Buffer.isBuffer(reply) ? reply : frame(reply));
    });
    socket.on('error', () => {});
  });
  await new Promise(resolve => server.listen(endpoint, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return {endpoint, requests, connections: () => new Promise(r => server.getConnections((_, n) => r(n)))};
}

const viaNet = path => net.createConnection(path);
const code = async (promise) => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };

test('read sends one framed, token-bearing request and returns the value', async t => {
  const broker = await scriptedBroker(t, () => ({ok: true, value: SENTINEL}));
  const client = brokerClient({endpoint: broker.endpoint, token: TOKEN, connect: viaNet});
  assert.equal(await client.read('work-password'), SENTINEL);
  assert.deepEqual(broker.requests, [{v: 1, token: TOKEN, op: 'read', label: 'work-password'}]);
});

test('list returns labels only', async t => {
  const broker = await scriptedBroker(t, () => ({ok: true, labels: ['a', 'b']}));
  const client = brokerClient({endpoint: broker.endpoint, token: TOKEN, connect: viaNet});
  assert.deepEqual(await client.list(), ['a', 'b']);
  assert.deepEqual(broker.requests, [{v: 1, token: TOKEN, op: 'list'}]);
});

test('typed broker outcomes become BrokerErrors with the same code and no value', async t => {
  for (const outcome of ['not_found', 'denied', 'locked', 'unavailable', 'unauthorized', 'invalid_label', 'unsupported_value', 'malformed', 'oversized', 'response_too_large']) {
    const broker = await scriptedBroker(t, () => ({ok: false, error: outcome}));
    const error = await code(brokerClient({endpoint: broker.endpoint, token: TOKEN, connect: viaNet}).read('k'));
    assert.ok(error instanceof BrokerError, outcome);
    assert.equal(error.code, outcome);
    assert.doesNotMatch(error.message, /sentinel/);
  }
});

test('an invalid label is refused before any connection', async t => {
  const broker = await scriptedBroker(t, () => ({ok: true, value: SENTINEL}));
  const client = brokerClient({endpoint: broker.endpoint, token: TOKEN, connect: viaNet});
  for (const label of ['bad label', '', '{{secret:x}}', 'x'.repeat(129)]) assert.equal((await code(client.read(label))).code, 'invalid_label');
  assert.equal(broker.requests.length, 0);
});

test('malformed or wrongly shaped replies are protocol errors that never carry the reply', async t => {
  const replies = [
    Buffer.from('xx'),                                  // short header, then EOF
    frame('{not json ' + SENTINEL),                     // invalid JSON
    frame({ok: true, value: 7, note: SENTINEL}),        // read without a string value
    frame({ok: true, labels: SENTINEL}),                // (for read) no value
    frame({ok: false, error: SENTINEL}),                // unknown error code
    frame([SENTINEL]),                                  // not an object
  ];
  for (const reply of replies) {
    const broker = await scriptedBroker(t, () => reply);
    const error = await code(brokerClient({endpoint: broker.endpoint, token: TOKEN, connect: viaNet}).read('k'));
    assert.ok(['protocol', 'disconnected'].includes(error.code), `${error.code} for ${reply}`);
    assert.doesNotMatch(error.message + String(error.stack), new RegExp(SENTINEL));
  }
});

test('an oversized reply header is refused without buffering the body', async t => {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(64 << 20);
  const broker = await scriptedBroker(t, () => Buffer.concat([header, Buffer.from(SENTINEL)]));
  const error = await code(brokerClient({endpoint: broker.endpoint, token: TOKEN, connect: viaNet}).read('k'));
  assert.equal(error.code, 'protocol');
  assert.doesNotMatch(error.message, new RegExp(SENTINEL));
});

test('a broker that hangs up or never answers yields disconnected or timeout, and the connection is closed', async t => {
  const gone = await scriptedBroker(t, () => null);
  assert.equal((await code(brokerClient({endpoint: gone.endpoint, token: TOKEN, connect: viaNet}).read('k'))).code, 'disconnected');
  const silent = await scriptedBroker(t, () => 'hang');
  const started = Date.now();
  assert.equal((await code(brokerClient({endpoint: silent.endpoint, token: TOKEN, connect: viaNet, timeoutMs: 200}).read('k'))).code, 'timeout');
  assert.ok(Date.now() - started < 2000);
  await new Promise(r => setTimeout(r, 50));
  assert.equal(await silent.connections(), 0);
});

test('a missing endpoint is disconnected; a connect function that throws is disconnected', async t => {
  const s = scratch();
  t.after(s.cleanup);
  assert.equal((await code(brokerClient({endpoint: join(s.dir, 'none.sock'), token: TOKEN, connect: viaNet}).read('k'))).code, 'disconnected');
  const throwing = brokerClient({endpoint: '/x.sock', token: TOKEN, connect: async () => { throw new Error(`denied ${SENTINEL}`); }});
  const error = await code(throwing.read('k'));
  assert.equal(error.code, 'disconnected');
  assert.doesNotMatch(error.message, new RegExp(SENTINEL));
});

test('the client takes its endpoint and token from the trusted worker environment and is not configured without them', async t => {
  const broker = await scriptedBroker(t, () => ({ok: true, value: SENTINEL}));
  const client = brokerClientFromEnv({env: {[BROKER_ENV.endpoint]: broker.endpoint, [BROKER_ENV.token]: TOKEN}, connect: viaNet});
  assert.equal(await client.read('k'), SENTINEL);
  assert.equal(broker.requests[0].token, TOKEN);
  for (const env of [{}, {[BROKER_ENV.endpoint]: broker.endpoint}, {[BROKER_ENV.token]: TOKEN}]) {
    const unconfigured = brokerClientFromEnv({env, connect: viaNet});
    assert.equal((await code(unconfigured.read('k'))).code, 'not_configured');
  }
});

test('without a connect function the client uses nodeRepl.nativePipe and never falls back to node:net', async t => {
  const broker = await scriptedBroker(t, () => ({ok: true, value: SENTINEL}));
  const client = brokerClient({endpoint: broker.endpoint, token: TOKEN});
  assert.equal((await code(client.read('k'))).code, 'disconnected', 'no nativePipe in this process');
  assert.equal(broker.requests.length, 0);
  const used = [];
  globalThis.nodeRepl = {nativePipe: {createConnection: async path => { used.push(path); return net.createConnection(path); }}};
  t.after(() => { delete globalThis.nodeRepl; });
  assert.equal(await client.read('k'), SENTINEL);
  assert.deepEqual(used, [broker.endpoint]);
});

test('a transport whose setup or write throws settles once as disconnected, closes the stream and leaks nothing', async () => {
  const shapes = {
    'write throws': () => ({on() {}, write() { throw new Error(`write ${SENTINEL}`); }}),
    'on throws': () => ({on() { throw new Error(`on ${SENTINEL}`); }, write() {}}),
    'no stream': () => null,
  };
  for (const [name, make] of Object.entries(shapes)) {
    let destroyed = 0;
    const client = brokerClient({endpoint: '/x.sock', token: TOKEN, timeoutMs: 2000, connect: async () => {
      const stream = make();
      if (stream) stream.destroy = () => { destroyed++; };
      return stream;
    }});
    const started = Date.now();
    const error = await code(client.read('k'));
    assert.equal(error.code, 'disconnected', name);
    assert.ok(Date.now() - started < 1000, `${name} waited for the timeout`);
    assert.doesNotMatch(error.message + String(error.stack), new RegExp(SENTINEL), name);
    if (name !== 'no stream') assert.equal(destroyed, 1, name);
  }
});

test('a reply that is not valid UTF-8, or carries bytes past its frame, is a protocol error', async t => {
  const invalid = Buffer.concat([Buffer.from('{"ok":true,"value":"a'), Buffer.from([0xff, 0xfe]), Buffer.from('"}')]);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(invalid.length);
  const surplus = Buffer.concat([frame({ok: true, value: SENTINEL}), Buffer.from('extra')]);
  for (const reply of [Buffer.concat([header, invalid]), surplus]) {
    const broker = await scriptedBroker(t, () => reply);
    const error = await code(brokerClient({endpoint: broker.endpoint, token: TOKEN, connect: viaNet}).read('k'));
    assert.equal(error.code, 'protocol');
    assert.doesNotMatch(error.message, new RegExp(SENTINEL));
  }
});
