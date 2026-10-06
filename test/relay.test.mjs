// The relay (relay/server.mjs) in-process, on an ephemeral loopback port, over real WebSockets: a fake agent (a ws
// client holding a device credential) answers the channels by hand, and a fake device (fetch) is the cloud client.
// The relay and these tests need the `ws` package; without it (`npm ci` not run) they skip and say so.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {once} from 'node:events';
import {connect} from 'node:net';
import {join} from 'node:path';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {tick} from './fixtures/mcp-harness.mjs';

const ws = await import('ws').catch(() => null);
const relayModule = ws ? await import('../relay/server.mjs') : null;
const needsWs = {skip: ws ? false : 'needs the ws package: run npm ci'};

const hex = () => randomBytes(32).toString('hex');
const sha256 = text => createHash('sha256').update(text).digest('hex');
const DEVICE = {id: 'dev-one', device: hex(), client: hex()};
const OTHER = {id: 'dev-two', device: hex(), client: hex()};

async function until(predicate, label = 'condition', ms = 3000) {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await tick(5);
  }
}

async function startRelay(t, options = {}) {
  const s = scratch();
  t.after(s.cleanup);
  const devicesFile = join(s.dir, 'devices.json');
  const table = {};
  for (const d of [DEVICE, OTHER]) table[d.id] = {deviceCredentialSha256: sha256(d.device), clientCredentialSha256: sha256(d.client)};
  writeFileSync(devicesFile, JSON.stringify(table));
  const diagnostics = [];
  const relay = await relayModule.startRelay({port: 0, devicesFile, diagnostics: line => diagnostics.push(line), ...options});
  t.after(() => relay.close());
  const base = `http://127.0.0.1:${relay.port}`;
  return {relay, base, diagnostics, endpoint: `${base}/d/${DEVICE.id}/mcp`};
}

// A fake agent: connects with `credential`, says hello as `hello` (the device id; none when null), records every frame
// it receives.
async function fakeAgent(t, base, {credential = DEVICE.device, hello = DEVICE.id, autoPong = true} = {}) {
  const socket = new ws.WebSocket(`${base.replace('http', 'ws')}/ws`, {headers: {authorization: `Bearer ${credential}`}, autoPong});
  const frames = [];
  const counts = {pings: 0};
  const closed = new Promise(resolve => socket.on('close', (code, reason) => resolve({code, reason: reason.toString()})));
  socket.on('message', data => frames.push(JSON.parse(data.toString())));
  socket.on('ping', () => { counts.pings++; });
  socket.on('error', () => {});
  t.after(() => socket.terminate());
  const opened = await new Promise(resolve => {
    socket.once('open', () => resolve(true));
    socket.once('unexpected-response', (_request, response) => resolve(response.statusCode));
    socket.once('error', () => resolve(false));
  });
  const send = frame => socket.send(JSON.stringify(frame));
  if (opened === true && hello) send({t: 'hello', deviceId: hello});
  // The frames of one channel, and the channel of the n-th `open`.
  const of = ch => frames.filter(f => f.ch === ch);
  return {
    socket, frames, closed, opened, send, of,
    get pings() { return counts.pings; },
    async opening(n) {
      await until(() => frames.filter(f => f.t === 'open').length > n, `open frame ${n}`);
      return frames.filter(f => f.t === 'open')[n];
    },
    requestBody: ch => Buffer.concat(of(ch).filter(f => f.t === 'body').map(f => Buffer.from(f.data, 'base64'))).toString('utf8'),
    ended: ch => until(() => of(ch).some(f => f.t === 'end'), `end of channel ${ch}`),
    respond(ch, status, headers, chunks = []) {
      send({ch, t: 'head', status, headers});
      for (const chunk of chunks) send({ch, t: 'data', data: Buffer.from(chunk).toString('base64')});
      send({ch, t: 'end'});
    },
  };
}

// Resolves `promise`, or fails after `ms`.
const within = (promise, ms, label) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), ms).unref())]);

// Online once the relay has taken the hello (a request then reaches the agent instead of 503): the n-th time.
const online = (diagnostics, id = DEVICE.id, n = 1) =>
  until(() => diagnostics.filter(line => line.includes(`device ${id} online`)).length >= n, `device ${id} online`);

const post = (endpoint, body, headers = {}, client = DEVICE.client) => fetch(endpoint, {method: 'POST', body: JSON.stringify(body), headers: {
  authorization: `Bearer ${client}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers}});

test('a request to /d/<device>/mcp is a channel: the path rewritten to /mcp, only the forwarded headers, the body streamed, the answer streamed back', needsWs, async t => {
  const {endpoint, base, diagnostics} = await startRelay(t);
  const agent = await fakeAgent(t, base);
  await online(diagnostics);
  const body = {jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'js', arguments: {code: 'x'.repeat(200_000)}}};
  const pending = post(`${endpoint}?ignored=1`, body, {'mcp-session-id': 's-1', 'last-event-id': '1-0', 'mcp-protocol-version': '2025-06-18',
    origin: 'https://example.test', cookie: 'secret=1', 'x-forwarded-for': '10.0.0.1', 'x-extra': 'no'});
  const open = await agent.opening(0);
  assert.equal(open.method, 'POST');
  assert.equal(open.path, '/mcp');
  assert.deepEqual(Object.keys(open.headers).sort(), ['accept', 'authorization', 'content-type', 'last-event-id', 'mcp-protocol-version', 'mcp-session-id', 'origin']);
  assert.equal(open.headers.authorization, `Bearer ${DEVICE.client}`, 'the authorization header is forwarded unchanged');
  assert.equal(open.headers['mcp-session-id'], 's-1');
  await agent.ended(open.ch);
  assert.deepEqual(JSON.parse(agent.requestBody(open.ch)), body);

  agent.respond(open.ch, 200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Mcp-Session-Id': 's-1'},
    ['retry: 15000\nid: 1-0\nevent: priming\ndata: {}\n\n', 'id: 1-1\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n']);
  const res = await pending;
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  assert.equal(res.headers.get('mcp-session-id'), 's-1');
  assert.equal(res.headers.get('x-accel-buffering'), 'no', 'SSE responses tell a proxy not to buffer');
  assert.equal(await res.text(), 'retry: 15000\nid: 1-0\nevent: priming\ndata: {}\n\nid: 1-1\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n');

  const json = post(endpoint, {jsonrpc: '2.0', id: 0, method: 'initialize'});
  const second = await agent.opening(1);
  assert.notEqual(second.ch, open.ch);
  agent.respond(second.ch, 200, {'Content-Type': 'application/json'}, ['{"ok":true}']);
  const plain = await json;
  assert.equal(plain.headers.get('x-accel-buffering'), null, 'only SSE responses carry the proxy hint');
  assert.deepEqual(await plain.json(), {ok: true});
});

test('the client bearer is checked against clientCredentialSha256 before the device map; offline devices answer 503; other paths 404', needsWs, async t => {
  const {endpoint, base} = await startRelay(t);
  const statusOf = async (url, headers, method = 'POST') => {
    const res = await fetch(url, {method, headers: {'content-type': 'application/json', ...headers}, ...(method === 'POST' ? {body: '{}'} : {})});
    const text = await res.text();
    return {status: res.status, auth: res.headers.get('www-authenticate'), body: text};
  };
  for (const headers of [{}, {authorization: `Bearer ${OTHER.client}`}, {authorization: `Bearer ${DEVICE.device}`}, {authorization: `Basic ${DEVICE.client}`}, {authorization: `Bearer ${DEVICE.client}x`}]) {
    const r = await statusOf(endpoint, headers);
    assert.equal(r.status, 401, JSON.stringify(headers));
    assert.equal(r.auth, null, 'no WWW-Authenticate (it would send Claude Code into OAuth discovery)');
    assert.equal(JSON.parse(r.body).error.code, -32000);
  }
  assert.equal((await statusOf(`${base}/d/nobody/mcp`, {authorization: `Bearer ${DEVICE.client}`})).status, 401, 'an unknown device is indistinguishable from a wrong bearer');
  const offline = await statusOf(endpoint, {authorization: `Bearer ${DEVICE.client}`});
  assert.equal(offline.status, 503);
  assert.match(JSON.parse(offline.body).error.message, /device offline/);
  for (const path of ['/', '/mcp', `/d/${DEVICE.id}/other`, `/d/${DEVICE.id}/mcp/extra`, '/ws'])
    assert.equal((await statusOf(`${base}${path}`, {authorization: `Bearer ${DEVICE.client}`}, 'GET')).status, 404, path);
});

test('the WebSocket bearer is checked against deviceCredentialSha256; a hello naming another device closes with 4003', needsWs, async t => {
  const {base, endpoint, diagnostics} = await startRelay(t);
  for (const credential of [DEVICE.client, hex(), '']) {
    const refused = await fakeAgent(t, base, {credential});
    assert.equal(refused.opened, 401, 'the client credential (or none) cannot connect as the device');
  }
  const impostor = await fakeAgent(t, base, {credential: OTHER.device, hello: DEVICE.id});
  assert.equal((await impostor.closed).code, 4003);
  const status = await fetch(endpoint, {method: 'POST', body: '{}', headers: {authorization: `Bearer ${DEVICE.client}`}});
  assert.equal(status.status, 503, 'the device never came online through another device\'s credential');
  await status.text();
  assert.ok(diagnostics.some(line => /4003/.test(line)));
  for (const line of diagnostics) for (const secret of [DEVICE.device, DEVICE.client, OTHER.device, OTHER.client]) assert.ok(!line.includes(secret), 'no credential in the relay log');
});

test('two concurrent POSTs are two channels on one WebSocket, each answered on its own request', needsWs, async t => {
  const {endpoint, base, diagnostics} = await startRelay(t);
  const agent = await fakeAgent(t, base);
  await online(diagnostics);
  const a = post(endpoint, {jsonrpc: '2.0', id: 'a', method: 'tools/call'});
  const b = post(endpoint, {jsonrpc: '2.0', id: 'b', method: 'tools/call'});
  const first = await agent.opening(0);
  const second = await agent.opening(1);
  await agent.ended(first.ch);
  await agent.ended(second.ch);
  const idOf = ch => JSON.parse(agent.requestBody(ch)).id;
  const answer = ch => agent.respond(ch, 200, {'Content-Type': 'application/json'}, [JSON.stringify({answered: idOf(ch)})]);
  answer(second.ch);
  answer(first.ch);
  assert.deepEqual(await (await a).json(), {answered: 'a'});
  assert.deepEqual(await (await b).json(), {answered: 'b'});
});

test('a client that goes away aborts its channel; an agent abort is 502 before the head and a cut stream after it; frames for unknown channels are dropped', needsWs, async t => {
  const {endpoint, base, diagnostics} = await startRelay(t);
  const agent = await fakeAgent(t, base);
  await online(diagnostics);

  const controller = new AbortController();
  const leaving = fetch(endpoint, {method: 'POST', body: '{}', signal: controller.signal, headers: {authorization: `Bearer ${DEVICE.client}`}});
  const left = await agent.opening(0);
  agent.send({ch: left.ch, t: 'head', status: 200, headers: {'Content-Type': 'text/event-stream'}});
  const response = await leaving;
  assert.equal(response.status, 200);
  controller.abort();
  await until(() => agent.of(left.ch).some(f => f.t === 'abort'), 'abort frame for the departed client');

  const early = post(endpoint, {jsonrpc: '2.0', id: 2, method: 'tools/call'});
  const failing = await agent.opening(1);
  agent.send({ch: failing.ch, t: 'abort'});
  const failed = await early;
  assert.equal(failed.status, 502);
  assert.equal(JSON.parse(await failed.text()).error.code, -32000);

  const late = post(endpoint, {jsonrpc: '2.0', id: 3, method: 'tools/call'});
  const cut = await agent.opening(2);
  agent.send({ch: cut.ch, t: 'head', status: 200, headers: {'Content-Type': 'text/event-stream'}});
  agent.send({ch: cut.ch, t: 'data', data: Buffer.from('id: 1-0\nevent: priming\ndata: {}\n\n').toString('base64')});
  const streaming = await late;
  const reading = streaming.text();
  agent.send({ch: cut.ch, t: 'abort'});
  await assert.rejects(reading, 'the client sees the stream cut, not ended');

  const impossible = post(endpoint, {jsonrpc: '2.0', id: 5, method: 'tools/call'});
  const bad = await agent.opening(3);
  agent.send({ch: bad.ch, t: 'head', status: 'not a status', headers: {}});
  assert.equal((await impossible).status, 502, 'a head the relay cannot write fails its request, not the relay');
  await until(() => agent.of(bad.ch).some(f => f.t === 'abort'), 'the agent told to drop the channel');

  agent.send({ch: 9999, t: 'data', data: 'AAAA'});
  agent.send({ch: 9998, t: 'end'});
  agent.socket.send('not json');
  await until(() => diagnostics.filter(line => /unknown channel|not a frame/.test(line)).length >= 3, 'dropped frames logged');
  const still = post(endpoint, {jsonrpc: '2.0', id: 4, method: 'tools/call'});
  const alive = await agent.opening(4);
  agent.respond(alive.ch, 202, {});
  assert.equal((await still).status, 202, 'the socket survives frames it cannot place');
});

test('losing the device WebSocket fails its open channels: 502 before the head, a cut stream after it', needsWs, async t => {
  const {endpoint, base, diagnostics} = await startRelay(t);
  const agent = await fakeAgent(t, base);
  await online(diagnostics);
  const waiting = post(endpoint, {jsonrpc: '2.0', id: 1, method: 'tools/call'});
  const streaming = post(endpoint, {jsonrpc: '2.0', id: 2, method: 'tools/call'});
  await agent.opening(0);
  const second = await agent.opening(1);
  agent.send({ch: second.ch, t: 'head', status: 200, headers: {'Content-Type': 'text/event-stream'}});
  const stream = await streaming;
  agent.socket.terminate();
  assert.equal((await waiting).status, 502);
  await assert.rejects(stream.text());
  const after = await fetch(endpoint, {method: 'POST', body: '{}', headers: {authorization: `Bearer ${DEVICE.client}`}});
  assert.equal(after.status, 503);
  await after.text();
});

test('a newer WebSocket for a device replaces the older, which is closed with 4001 (replaced)', needsWs, async t => {
  const {endpoint, base, diagnostics} = await startRelay(t);
  const older = await fakeAgent(t, base);
  await online(diagnostics);
  const newer = await fakeAgent(t, base);
  await online(diagnostics, DEVICE.id, 2);
  assert.deepEqual(await older.closed, {code: 4001, reason: 'replaced'});
  const answered = post(endpoint, {jsonrpc: '2.0', id: 1, method: 'ping'});
  const open = await newer.opening(0);
  newer.respond(open.ch, 200, {'Content-Type': 'application/json'}, ['{}']);
  assert.equal((await answered).status, 200);
  assert.equal(older.frames.filter(f => f.t === 'open').length, 0);
});

test('the relay pings every WebSocket and closes one that misses two pongs', needsWs, async t => {
  const {base, diagnostics} = await startRelay(t, {pingMs: 40});
  const silent = await fakeAgent(t, base, {credential: OTHER.device, hello: OTHER.id, autoPong: false});
  const answering = await fakeAgent(t, base);
  await online(diagnostics);
  const closed = await within(silent.closed, 2000, 'the silent socket to be dropped');
  assert.equal(closed.code, 1006, 'terminated, not closed in order');
  assert.ok(silent.pings >= 2);
  assert.ok(diagnostics.some(line => /dev-two.*pong/.test(line)), diagnostics.join('\n'));
  await tick(200);
  assert.equal(answering.socket.readyState, ws.WebSocket.OPEN, 'a socket that answers its pings stays');
  assert.ok(answering.pings >= 4);
});

test('a refused upgrade\'s socket is destroyed, so a peer that stays open cannot hold the relay\'s close', needsWs, async t => {
  const {relay, base} = await startRelay(t);
  const {port} = new URL(base);
  // allowHalfOpen: the peer reads the refusal and its end, and keeps its own side open.
  const peer = connect({host: '127.0.0.1', port: Number(port), allowHalfOpen: true});
  peer.on('error', () => {});
  t.after(() => peer.destroy());
  await once(peer, 'connect');
  let answer = '';
  peer.on('data', chunk => { answer += chunk; });
  peer.write(['GET /ws HTTP/1.1', `Host: 127.0.0.1:${port}`, 'Upgrade: websocket', 'Connection: Upgrade',
    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version: 13', `Authorization: Bearer ${DEVICE.client}`, '', ''].join('\r\n'));
  await within(once(peer, 'end'), 2000, 'the refusal');
  assert.match(answer, /^HTTP\/1\.1 401 /);
  // The peer never ends its side; the relay must not wait for it.
  await within(relay.close(), 2000, 'the relay to close');
});

test('a channel frame sent before hello is dropped and the device stays offline until its hello', needsWs, async t => {
  const {endpoint, base, diagnostics} = await startRelay(t);
  const agent = await fakeAgent(t, base, {hello: null});
  agent.send({ch: 1, t: 'head', status: 200, headers: {}});
  await until(() => diagnostics.some(line => /before hello/.test(line)), 'the dropped frame logged');
  const offline = await post(endpoint, {jsonrpc: '2.0', id: 1, method: 'ping'});
  assert.equal(offline.status, 503);
  await offline.text();
  agent.send({t: 'hello', deviceId: DEVICE.id});
  await online(diagnostics);
  const answered = post(endpoint, {jsonrpc: '2.0', id: 2, method: 'ping'});
  agent.respond((await agent.opening(0)).ch, 202, {});
  assert.equal((await answered).status, 202);
});

test('a request body over the limit is 413 and its channel aborted', needsWs, async t => {
  const {endpoint, base, diagnostics} = await startRelay(t, {bodyLimit: 1000});
  const agent = await fakeAgent(t, base);
  await online(diagnostics);
  const res = await post(endpoint, {jsonrpc: '2.0', id: 1, method: 'tools/call', params: {code: 'x'.repeat(5000)}});
  assert.equal(res.status, 413);
  assert.equal((await res.json()).error.code, -32000);
  const open = await agent.opening(0);
  await until(() => agent.of(open.ch).some(f => f.t === 'abort'), 'the agent told to drop the channel');
  assert.ok(agent.requestBody(open.ch).length <= 1000 + 65536, 'forwarding stopped at the limit');
});

test('a client that stops reading loses its response once the relay holds more than the limit for it', needsWs, async t => {
  const {endpoint, base, diagnostics} = await startRelay(t, {responseBufferLimit: 1 << 20});
  const agent = await fakeAgent(t, base);
  await online(diagnostics);
  const {port} = new URL(base);
  const peer = connect({host: '127.0.0.1', port: Number(port)});
  peer.on('error', () => {});
  t.after(() => peer.destroy());
  await once(peer, 'connect');
  const body = JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call'});
  peer.write([`POST ${new URL(endpoint).pathname} HTTP/1.1`, `Host: 127.0.0.1:${port}`, `Authorization: Bearer ${DEVICE.client}`,
    'Content-Type: application/json', `Content-Length: ${body.length}`, '', body].join('\r\n'));
  const open = await agent.opening(0);
  peer.pause();   // never reads again
  agent.send({ch: open.ch, t: 'head', status: 200, headers: {'Content-Type': 'text/event-stream'}});
  const chunk = Buffer.alloc(1 << 20, 'x').toString('base64');
  for (let i = 0; i < 64 && !agent.of(open.ch).some(f => f.t === 'abort'); i++) {
    agent.send({ch: open.ch, t: 'data', data: chunk});
    await tick(5);
  }
  await until(() => agent.of(open.ch).some(f => f.t === 'abort'), 'the agent told to drop the channel');
  assert.ok(diagnostics.some(line => /unsent/.test(line)), diagnostics.join('\n'));
});

test('a devices file that is not a device table refuses to start', needsWs, async t => {
  const s = scratch();
  t.after(s.cleanup);
  const file = join(s.dir, 'devices.json');
  for (const text of ['[]', '{"d": {"deviceCredentialSha256": "abc", "clientCredentialSha256": "def"}}', 'not json', `{"d": {"deviceCredentialSha256": "${sha256('a')}"}}`]) {
    writeFileSync(file, text);
    await assert.rejects(relayModule.startRelay({port: 0, devicesFile: file, diagnostics: () => {}}), /devices/, text);
  }
});
