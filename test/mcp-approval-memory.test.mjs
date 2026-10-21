// The connection's approval memory as a unit (src/mcp/approval-memory.mjs); the proxy's use of it, across idle stops
// and late answers, is in test/mcp-server.test.mjs and test/serve-lazy.test.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PERSISTED_STATE_SOURCE, approvalMemory} from '../src/mcp/approval-memory.mjs';

// An `elicitation/create` request's params for the vendor's computer-use app approval (R/A-contract.md §2.6).
const approval = (app, meta = {}) => ({message: `Allow Computer Use to use "${app}"?`, mode: 'form', requestedSchema: {type: 'object', properties: {}},
  _meta: {codex_approval_kind: 'mcp_tool_call', connector_id: 'computer-use', persist: ['session'], riskLevel: 'low', tool_name: 'get_app_state', tool_params: {app}, ...meta}});

test('a connection\'s accept or decline of a computer-use app answers its repeats; a cancel, other connectors and an unremembered accept ask again', () => {
  const memory = approvalMemory();
  const textEdit = approval('com.apple.TextEdit');
  assert.equal(memory.recall(textEdit), null, 'nothing is known before the client answered');
  memory.record(textEdit, {result: {action: 'accept', content: {}, _meta: {persist: 'session'}}});
  const remembered = {action: 'accept', content: {source: PERSISTED_STATE_SOURCE}};
  assert.deepEqual(memory.recall(textEdit), remembered);
  assert.deepEqual(memory.recall(approval('com.apple.TextEdit', {tool_name: 'click', riskLevel: 'high'})), remembered, 'keyed by the app alone, whatever the tool');
  assert.equal(memory.recall(approval('com.apple.finder')), null, 'another app asks');

  memory.record(approval('com.apple.finder'), {result: {action: 'decline'}});
  assert.deepEqual(memory.recall(approval('com.apple.finder')), {action: 'decline', content: {source: PERSISTED_STATE_SOURCE}});

  // Only a reply the runtime takes (src/repl-host/elicitation.mjs elicitationOutcome) is an answer.
  const persisted = {_meta: {persist: 'session'}};
  for (const [label, reply] of [['cancel', {result: {action: 'cancel'}}], ['an error reply', {error: {code: -1, message: 'no'}}],
    ['an error beside an accept', {error: {code: -1, message: 'no'}, result: {action: 'accept', content: {}, ...persisted}}],
    ['an error beside a decline', {error: {code: -1, message: 'no'}, result: {action: 'decline'}}],
    ['an unknown action', {result: {action: 'granted'}}], ['no result', {}],
    ['an accept with array content', {result: {action: 'accept', content: [], ...persisted}}],
    ['an accept with string content', {result: {action: 'accept', content: 'x', ...persisted}}],
    ['an accept with array _meta', {result: {action: 'accept', content: {}, _meta: [{persist: 'session'}]}}],
    ['a decline with array content', {result: {action: 'decline', content: []}}],
    ['a decline with string _meta', {result: {action: 'decline', _meta: 'x'}}],
    ['accept the client did not ask to remember (CUA_SHIM_PERSIST=none)', {result: {action: 'accept', content: {}}}],
    ['accept with an unknown persist', {result: {action: 'accept', content: {}, _meta: {persist: 'forever'}}}]]) {
    const app = approval('com.apple.Notes');
    memory.record(app, reply);
    assert.equal(memory.recall(app), null, label);
  }
  for (const other of [
    {...textEdit, _meta: {...textEdit._meta, connector_id: 'browser-use'}},
    {...textEdit, _meta: {...textEdit._meta, tool_params: {}}},
    {...textEdit, _meta: {...textEdit._meta, tool_params: {app: ''}}},
    {...textEdit, _meta: {...textEdit._meta, tool_params: 'com.apple.TextEdit'}},
    {...textEdit, _meta: null},
  ]) {
    memory.record(other, {result: {action: 'decline'}});
    assert.equal(memory.recall(other), null, JSON.stringify(other._meta));
  }
  assert.deepEqual(memory.recall(textEdit), remembered, 'none of those touched the remembered app');
  assert.equal(approvalMemory().recall(textEdit), null, 'another connection\'s memory starts empty');
});
