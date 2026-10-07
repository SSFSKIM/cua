// The host's two wires share one framing and one JSON-RPC peer (src/chrome/protocol.mjs), and its fixed names live in
// src/chrome/extension.mjs. Spec: docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md, "The extension
// protocol" and Interfaces and Dependencies.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {encodeFrame, frameDecoder, NO_HANDLER, createPeer, HEADER_BYTES} from '../src/chrome/protocol.mjs';
import {CUA_EXTENSION_ID, CUA_HOST_NAME, PROTOCOL_VERSION, extensionIdFromKey, socketNameFor, backendDir, logDir} from '../src/chrome/extension.mjs';

// The public half of the owner's key (S0 evidence, docs/evidence/2026-10-07-s0-no-header-spike.md); H3a's test
// recomputes the id from extension/manifest.json, which will carry this value as `key`.
const PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApCrhXD2s4AbSBxHsJxiAaEHRdamtfTiRhMLNZcbhEuQUS3PgbguhQHOTqwXxOF/GKaFb6LgDtGB9qQBtiZkGbq+KL0QlDAVsgBLYMGkQbS7ceohkyHBHXcwLCPW/bq4U48U3eNy8VK4EMTrMX1Mr/k+BxbttbLJ5LQahM8dhS6a9r+9TMMoaVUHaCC7PNVQiVCaCUTJ9EvgIfy+ijFByg2lBTv0vU8Kjqpkhnta184YbSbSxx4eWGQ+ZBEFlTHI00uardYziUmlbX31n35B4lZ9UOkiFFwKpI7gQ9dddLr/87QWcXK3ZVoWokIM1uW/h7lT8hFy/DATTPXItmuvytQIDAQAB';

test('the extension id derives from the public key as Chrome does, and names are fixed', () => {
  assert.equal(extensionIdFromKey(PUBLIC_KEY), CUA_EXTENSION_ID);
  assert.equal(CUA_EXTENSION_ID, 'jkejaaijdfpohkdhankllbekkhmnippb');
  assert.match(CUA_EXTENSION_ID, /^[a-p]{32}$/);
  assert.equal(CUA_HOST_NAME, 'io.github.ssfskim.cua');
  assert.equal(PROTOCOL_VERSION, 1);
});

test('socket names are the first 12 hex chars of sha256(instanceId), under the home\'s chrome/b', () => {
  const id = '3f1c6c1e-2a3b-4c5d-8e9f-0123456789ab';
  assert.equal(socketNameFor(id), createHash('sha256').update(id).digest('hex').slice(0, 12));
  assert.match(socketNameFor(id), /^[0-9a-f]{12}$/);
  assert.notEqual(socketNameFor(id), socketNameFor(`${id}x`));
  assert.equal(backendDir('/h'), '/h/chrome/b');
  assert.equal(logDir('/h'), '/h/chrome/logs');
});

test('frames are a u32 native-order byte length then UTF-8 JSON; the decoder splits and joins chunks', () => {
  const frame = encodeFrame({method: 'é'});
  assert.equal(frame.readUInt32LE(0), frame.length - HEADER_BYTES);
  const push = frameDecoder();
  const two = Buffer.concat([encodeFrame({a: 1}), encodeFrame({b: 2})]);
  assert.deepEqual(push(two.subarray(0, 3)), []);
  assert.deepEqual(push(two.subarray(3, 12)), [{a: 1}]);
  assert.deepEqual(push(two.subarray(12)), [{b: 2}]);
  assert.throws(() => frameDecoder(4)(encodeFrame({long: true})), /exceeds limit/);
});

// Two peers wired back to back, each delivering the other's frames on a later turn, as a socket would.
function pair({handlersA = {}, handlersB = {}, maxA, maxB} = {}) {
  const wire = {a: [], b: []};
  let a, b;
  const deliver = (to, bytes) => setImmediate(() => { for (const m of frameDecoder()(bytes)) to.receive(m); });
  a = createPeer({send: bytes => { wire.a.push(bytes); deliver(b, bytes); }, handlers: handlersA, ...(maxA ? {maxFrameBytes: maxA} : {})});
  b = createPeer({send: bytes => { wire.b.push(bytes); deliver(a, bytes); }, handlers: handlersB, ...(maxB ? {maxFrameBytes: maxB} : {})});
  return {a, b, wire};
}

test('peer: requests resolve with results; ids count from 1 per direction; replies carry jsonrpc 2.0', async () => {
  const {a, b, wire} = pair({handlersB: {add: ({x, y}) => x + y}, handlersA: {who: () => 'a'}});
  assert.equal(await a.request('add', {x: 2, y: 3}), 5);
  assert.equal(await a.request('add', {x: 1, y: 1}), 2);
  assert.equal(await b.request('who', {}), 'a');
  const sent = wire.a.map(bytes => frameDecoder()(bytes)[0]).filter(m => m.method);
  assert.deepEqual(sent.map(m => m.id), [1, 2]);
  assert.ok(sent.every(m => m.jsonrpc === '2.0'));
  assert.equal(frameDecoder()(wire.b[0])[0].id, 1, 'B answers id 1');
  assert.equal(frameDecoder()(wire.b[2])[0].id, 1, 'B\'s own first request is also id 1');
});

test('peer: an unknown method answers the vendor\'s exact No-handler string with code -1; a throw is code 1 with the bare message', async () => {
  const {a, wire} = pair({handlersB: {boom: () => { throw new Error('Debugger is not attached to the tab with id: 7.'); }}});
  await assert.rejects(a.request('getUserHistory', {}), e => e.message === NO_HANDLER('getUserHistory') && e.code === -1);
  assert.equal(NO_HANDLER('getUserHistory'), 'No handler registered for method: getUserHistory');
  await assert.rejects(a.request('boom', {}), e => e.message === 'Debugger is not attached to the tab with id: 7.' && e.code === 1);
  const replies = wire.b.map(bytes => frameDecoder()(bytes)[0]);
  assert.deepEqual(replies[1].error, {code: 1, message: 'Debugger is not attached to the tab with id: 7.'});
});

test('peer: notifications reach their handler, an unknown one is ignored, and nothing is answered', async () => {
  const seen = [];
  const {a, wire} = pair({handlersB: {'debugger.event': params => seen.push(params)}});
  a.notify('debugger.event', {method: 'Page.loadEventFired'});
  a.notify('unknown.event', {});
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(seen, [{method: 'Page.loadEventFired'}]);
  assert.equal(wire.b.length, 0);
  assert.equal(frameDecoder()(wire.a[0])[0].id, undefined);
});

test('peer: a frame over maxFrameBytes is never sent: a request rejects with message_too_large, a reply becomes that error', async () => {
  const {a, wire} = pair({maxA: 1024, maxB: 1024, handlersB: {echo: ({s}) => s, grow: ({n}) => 'x'.repeat(n)}});
  await assert.rejects(a.request('echo', {s: 'x'.repeat(2000)}), e => e.message === 'message_too_large');
  assert.equal(wire.a.length, 0, 'the oversized request was not sent');
  assert.throws(() => a.notify('n', {s: 'x'.repeat(2000)}), /message_too_large/);
  assert.equal((await a.request('grow', {n: 10})).length, 10);
  await assert.rejects(a.request('grow', {n: 2000}), e => e.message === 'message_too_large');
  assert.ok(wire.b.every(bytes => bytes.length <= 1024 + HEADER_BYTES), 'no frame over the limit was sent');
});

test('peer: close rejects pending and later requests with the reason, and drops later input', async () => {
  const sent = [];
  const peer = createPeer({send: bytes => sent.push(bytes)});
  const pending = peer.request('tabs.query', {});
  peer.close('extension disconnected');
  await assert.rejects(pending, e => e.message === 'extension disconnected');
  await assert.rejects(peer.request('tabs.query', {}), e => e.message === 'extension disconnected');
  peer.receive({jsonrpc: '2.0', id: 1, result: []});
  assert.equal(sent.length, 1);
});
