// HostMcp's contract: the own host's tools are the vendor's base tools, as M0 recorded them through cua's proxy, and its
// argument errors are the vendor's sentences (observed on the pinned node_repl, 2026-10-14).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {InvalidParams, PROTOCOL_VERSIONS, SERVER_INSTRUCTIONS, initializeResult, jsArguments, resetArguments, toolsFor, turnEndedArguments} from '../../src/repl-host/tools.mjs';
import {REPL_HOST_NAME, REPL_HOST_VERSION} from '../../src/repl-host/identity.mjs';
import {jsRulesFor, modelTools} from '../../src/mcp/surface.mjs';

const recorded = JSON.parse(readFileSync(new URL('../../docs/evidence/2026-10-14-own-repl-host-parity/m0/vendor-1/tools.json', import.meta.url), 'utf8')).tools;

test('through cua\'s proxy the own host\'s tools are exactly the effective contract M0 recorded from the vendor host', () => {
  const shown = modelTools(toolsFor({sandboxed: true}), {surfaces: ['browser'], platform: 'darwin', browserService: 'cua'});
  assert.deepEqual(shown.filter(t => ['js', 'js_reset'].includes(t.name)), recorded.filter(t => ['js', 'js_reset'].includes(t.name)));
  assert.ok(recorded.find(t => t.name === 'js').description.startsWith(jsRulesFor(['browser'], {platform: 'darwin'})), 'the recorded text is cua\'s rules over the base text');
});

test('the base tools: js, js_reset and the private turn_ended, in the vendor\'s order, without the hidden module-directory tool', () => {
  const tools = toolsFor({sandboxed: true});
  assert.deepEqual(tools.map(t => t.name), ['js', 'js_reset', 'turn_ended']);
  const [js, reset, turnEnded] = tools;
  assert.equal(Object.hasOwn(js.inputSchema.properties.timeout_ms, 'default'), false, 'the 30 s default is advertised in words, never as a schema default');
  assert.deepEqual(js.inputSchema.required, ['code']);
  assert.equal(Object.hasOwn(reset.inputSchema, 'required'), false);
  assert.deepEqual(reset.annotations, {readOnlyHint: true, destructiveHint: false, openWorldHint: false});
  assert.deepEqual(turnEnded.annotations, {idempotentHint: true});
  assert.deepEqual(turnEnded._meta, {ui: {visibility: []}});
  assert.deepEqual(turnEnded.inputSchema.required, ['hook_event_name', 'session_id', 'turn_id']);
  assert.equal(Object.hasOwn(toolsFor({sandboxed: false})[0], 'annotations'), false, 'js is annotated only when the host can sandbox it');
  assert.deepEqual(toolsFor({sandboxed: false})[1].annotations, reset.annotations);
});

test('initialize names cua-repl-host and its version, negotiates the protocol as rmcp 1.5.0 does and advertises the sandbox meta only when it can sandbox', () => {
  const result = initializeResult({protocolVersion: '2025-06-18', sandboxed: true});
  assert.deepEqual(result, {
    protocolVersion: '2025-06-18',
    capabilities: {experimental: {'codex/sandbox-state-meta': {}}, tools: {listChanged: true}},
    serverInfo: {name: REPL_HOST_NAME, version: REPL_HOST_VERSION},
    instructions: SERVER_INSTRUCTIONS,
  });
  for (const version of PROTOCOL_VERSIONS) assert.equal(initializeResult({protocolVersion: version, sandboxed: true}).protocolVersion, version);
  assert.equal(initializeResult({protocolVersion: '2099-01-01', sandboxed: true}).protocolVersion, '2025-11-25');
  assert.equal(initializeResult({sandboxed: true}).protocolVersion, '2025-11-25');
  assert.deepEqual(initializeResult({protocolVersion: '2025-06-18', sandboxed: false}).capabilities, {tools: {listChanged: true}});
});

const refusal = fn => { try { fn(); } catch (error) { assert.ok(error instanceof InvalidParams, error.message); return error.message; } assert.fail('accepted'); };

test('js arguments: code required, timeout_ms a nonzero integer defaulting to 30000, a non-empty title; the vendor\'s sentences otherwise', () => {
  assert.deepEqual(jsArguments({code: '1'}), {code: '1', timeoutMs: 30000});
  assert.deepEqual(jsArguments({code: '1', timeout_ms: 50, title: 'x'.repeat(81)}), {code: '1', timeoutMs: 50, title: 'x'.repeat(81)}, 'the title\'s length limit is advertised, not enforced');
  assert.deepEqual(jsArguments({code: '1', timeout_ms: null, title: null}), {code: '1', timeoutMs: 30000});
  const cases = [
    [{code: '1', timeout_ms: 0}, 'js: invalid value: integer `0`, expected a nonzero u64'],
    [{code: '1', timeout_ms: -1}, 'js: invalid value: integer `-1`, expected a nonzero u64'],
    [{code: '1', timeout_ms: '5'}, 'js: invalid type: string "5", expected a nonzero u64'],
    [{code: '1', timeout_ms: 5.5}, 'js: invalid type: floating point `5.5`, expected a nonzero u64'],
    [{code: '1', title: ''}, 'js: title must be non-empty'],
    [{code: '1', foo: 1}, 'js: unknown field `foo`, expected one of `title`, `code`, `timeout_ms`'],
    [{}, 'js: missing field `code`'],
    [undefined, 'js: missing field `code`'],
    [{code: 5}, 'js: invalid type: integer `5`, expected a string'],
    [{code: null}, 'js: invalid type: null, expected a string'],
  ];
  for (const [args, sentence] of cases) assert.equal(refusal(() => jsArguments(args)), sentence, JSON.stringify(args));
});

test('js_reset takes no arguments, and turn_ended takes three non-empty ids', () => {
  resetArguments({});
  resetArguments(undefined);
  assert.equal(refusal(() => resetArguments({x: 1})), 'js_reset: unknown field `x`, there are no fields');
  assert.deepEqual(turnEndedArguments({hook_event_name: 'Stop', session_id: 's', turn_id: 't'}), {hookEventName: 'Stop', sessionId: 's', turnId: 't'});
  assert.equal(refusal(() => turnEndedArguments({hook_event_name: 'Stop', session_id: 's'})), 'turn_ended: missing field `turn_id`');
  assert.equal(refusal(() => turnEndedArguments({hook_event_name: '', session_id: 's', turn_id: 't'})), 'turn_ended requires non-empty event, session, and turn IDs');
});
