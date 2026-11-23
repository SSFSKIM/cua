// The service's side of cua's native engine wire (src/services/engine/protocol.mjs; docs/doperpowers/specs/2026-10-18-
// own-native-engine-design.md, Design "Protocol", Interfaces EngineProtocol): the frame codec and its 8 MiB bound both
// ways, the vendor's response check, and the engine's errors as the vendor's error classes, whose errorName
// src/services/sky.mjs classifies unchanged (engine-only names passed through).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {frame} from './helpers/fake-engine.mjs';
import {
  CLIENT_API_VERSION, FrameDecoder, MAX_FRAME, SkyComputerUseError, SkyComputerUseTransportError, encodeFrame, serverError, validResponse,
} from '../src/services/engine/protocol.mjs';

test('the wire speaks cua-engine-1 in frames of a 4-byte little-endian length then UTF-8 JSON, decoded across chunk boundaries', () => {
  assert.equal(CLIENT_API_VERSION, 'cua-engine-1');
  const bytes = encodeFrame({jsonrpc: '2.0', id: 1, method: 'ping', params: {clientApiVersion: CLIENT_API_VERSION}});
  assert.equal(bytes.readUInt32LE(0), bytes.length - 4);
  assert.equal(JSON.parse(bytes.subarray(4).toString('utf8')).method, 'ping');
  const decoder = new FrameDecoder();
  const two = Buffer.concat([frame({a: 'é'}), frame({b: 2})]);
  assert.deepEqual(decoder.push(two.subarray(0, 3)), []);
  assert.deepEqual(decoder.push(two.subarray(3, 9)), []);
  assert.deepEqual(decoder.push(two.subarray(9)), [{a: 'é'}, {b: 2}]);
  assert.throws(() => new FrameDecoder().push(frame('not json')), error => error instanceof SkyComputerUseTransportError
    && error.message === 'cua engine returned an invalid JSON-RPC response');
});

test('the 8 MiB bound holds both ways: an outgoing frame above it is refused before writing, an incoming header above it is a transport error', () => {
  assert.equal(MAX_FRAME, 8 * 1024 * 1024);
  // {"t":"…"} is 8 bytes of JSON around the text: exactly the bound encodes, one byte more does not.
  assert.equal(encodeFrame({t: 'x'.repeat(MAX_FRAME - 8)}).length, MAX_FRAME + 4);
  assert.throws(() => encodeFrame({t: 'x'.repeat(MAX_FRAME - 7)}), error => error instanceof SkyComputerUseTransportError
    && error.message === `cua engine frame is too large: ${MAX_FRAME + 1}`);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(MAX_FRAME + 1, 0);
  assert.throws(() => new FrameDecoder().push(header), error => error instanceof SkyComputerUseTransportError
    && error.message === `cua engine frame is too large: ${MAX_FRAME + 1}`);
  const exact = Buffer.alloc(4);
  exact.writeUInt32LE(MAX_FRAME, 0);
  assert.deepEqual(new FrameDecoder().push(exact), [], 'exactly 8 MiB is allowed and waits for its body');
});

test('a response is valid only as the vendor checks it: a numeric id, jsonrpc 2.0, exactly one of result and error, an error with a numeric code and a string message', () => {
  assert.ok(validResponse({jsonrpc: '2.0', id: 1, result: null}));
  assert.ok(validResponse({jsonrpc: '2.0', id: 1, error: {code: -10005, message: 'x', errorName: 'y'}}));
  for (const bad of [null, [], {jsonrpc: '2.0', id: '1', result: 1}, {jsonrpc: '1.0', id: 1, result: 1}, {jsonrpc: '2.0', id: 1},
    {jsonrpc: '2.0', id: 1, result: 1, error: {code: 1, message: 'x'}}, {jsonrpc: '2.0', id: 1, error: {code: '1', message: 'x'}},
    {jsonrpc: '2.0', id: 1, error: {code: 1}}, {jsonrpc: '2.0', id: 1, error: null}]) {
    assert.equal(validResponse(bad), false, JSON.stringify(bad));
  }
});

test('an engine error is SkyComputerUseError: the vendor\'s message envelope, its fields, the engine\'s errorName passed through, the input meta kept', () => {
  const meta = {inputRoute: 3, startedAt: null, endedAt: null, receivedAt: 1, hidIdleMs: 20, activationGuardMs: 41.5};
  const intervened = serverError({code: -10016, message: 'The user changed \'TextEdit\'.', errorName: 'userIntervened', meta});
  assert.ok(intervened instanceof SkyComputerUseError && intervened instanceof Error);
  assert.equal(intervened.name, 'SkyComputerUseError');
  assert.equal(intervened.code, -10016);
  assert.equal(intervened.errorName, 'userIntervened');
  assert.equal(intervened.message, 'Computer Use server error -10016: The user changed \'TextEdit\'.');
  assert.equal(intervened.request, null);
  assert.equal(intervened.requestType, 'jsonRPC');
  assert.deepEqual(intervened.meta, meta);

  // Engine-only names under -10005 reach the wrapper as they are, so it admits the value-free ones and refuses the rest.
  for (const name of ['noWindowsAvailable', 'timeoutReached', 'concealedInputUnavailable', 'inputSourceChanged', 'noScreenshotForCoordinates',
    'activationFailed', 'menuBarItemUnsupported', 'elementNoLongerValid']) {
    const error = serverError({code: -10005, message: name, errorName: name});
    assert.equal(error.errorName, name);
    assert.equal(error.meta, null);
  }
  // Without a name, the vendor's mapping: its name for a code it knows, else jsonRPCError.
  assert.equal(serverError({code: -10014, message: 'x'}).errorName, 'permissionsPending');
  assert.equal(serverError({code: -32602, message: 'x'}).errorName, 'jsonRPCError');
  assert.equal(serverError({code: -32001, message: 'Request deadline exceeded', errorName: 'deadlineExceeded'}).errorName, 'deadlineExceeded');
});

test('interruption mapping names dispatched preparation and attempted writes without leaking unknown metadata', () => {
  const error = serverError({code: -10016, message: 'untrusted runtime sentence', errorName: 'userIntervened', meta: {
    interruption: {phase: 'in-flight', effects: ['focus-click-posted', 'value-write-attempted', 'input-posted', 'private-value']},
  }});
  assert.match(error.message, /preparation\/focus click was posted/i);
  assert.match(error.message, /value write was attempted/i);
  assert.match(error.message, /dispatched input may still complete/i);
  assert.doesNotMatch(error.message, /private-value|untrusted runtime sentence/);
  assert.equal(error.code, -10016);
  assert.equal(error.errorName, 'userIntervened');
});

test('request teardown is visible even when the refused action posted no ordinary input', () => {
  const error = serverError({code: -10016, message: 'native teardown refusal', errorName: 'userIntervened', meta: {
    startedAt: null, endedAt: null,
    interruption: {phase: 'in-flight', effects: ['activation-teardown-attempted']},
  }});
  assert.match(error.message, /interrupted after possible effects/i);
  assert.match(error.message, /activation teardown was attempted/i);
  assert.match(error.message, /deactivation.*may have been posted/i);
  assert.doesNotMatch(error.message, /refused before any effects/i);
});
