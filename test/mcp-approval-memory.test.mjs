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
  memory.record(textEdit, {action: 'accept', content: {}, _meta: {persist: 'session'}});
  const remembered = {action: 'accept', content: {source: PERSISTED_STATE_SOURCE}};
  assert.deepEqual(memory.recall(textEdit), remembered);
  assert.deepEqual(memory.recall(approval('com.apple.TextEdit', {tool_name: 'click', riskLevel: 'high'})), remembered, 'keyed by the app alone, whatever the tool');
  assert.equal(memory.recall(approval('com.apple.finder')), null, 'another app asks');

  memory.record(approval('com.apple.finder'), {action: 'decline'});
  assert.deepEqual(memory.recall(approval('com.apple.finder')), {action: 'decline', content: {source: PERSISTED_STATE_SOURCE}});

  for (const [label, result] of [['cancel', {action: 'cancel'}], ['an error reply', null], ['malformed', {action: 'granted'}],
    ['accept the client did not ask to remember (CUA_SHIM_PERSIST=none)', {action: 'accept', content: {}}],
    ['accept with an unknown persist', {action: 'accept', content: {}, _meta: {persist: 'forever'}}]]) {
    const app = approval('com.apple.Notes');
    memory.record(app, result);
    assert.equal(memory.recall(app), null, label);
  }
  for (const other of [
    {...textEdit, _meta: {...textEdit._meta, connector_id: 'browser-use'}},
    {...textEdit, _meta: {...textEdit._meta, tool_params: {}}},
    {...textEdit, _meta: {...textEdit._meta, tool_params: {app: ''}}},
    {...textEdit, _meta: {...textEdit._meta, tool_params: 'com.apple.TextEdit'}},
    {...textEdit, _meta: null},
  ]) {
    memory.record(other, {action: 'decline'});
    assert.equal(memory.recall(other), null, JSON.stringify(other._meta));
  }
  assert.deepEqual(memory.recall(textEdit), remembered, 'none of those touched the remembered app');
  assert.equal(approvalMemory().recall(textEdit), null, 'another connection\'s memory starts empty');
});
