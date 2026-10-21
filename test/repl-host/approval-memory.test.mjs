// The own host and the approval memory (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Interfaces,
// ApprovalMemory; Decision Log "M3.1, maws-3f's rulings" item 2): the memory is cua's MCP connection's
// (src/mcp/approval-memory.mjs, tested in test/mcp-approval-memory.test.mjs, test/mcp-server.test.mjs and, across the
// idle stop, test/serve-lazy.test.mjs), so this host asks the client every time, and a client's answer that arrives
// after the asking worker ended reaches no other worker. A real supervisor, kernel and trusted worker over MCP, with a
// fixture trusted service that asks the vendor's computer-use app approval as its policy does (R/A-contract.md §2.6).
// Needs Node 24 or later (CUA_NODE); skips visibly otherwise.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {kernelNode} from './kernel-harness.mjs';
import {startHost, texts} from './supervisor-harness.mjs';
import {TRUSTED_EXIT_SENTENCE} from '../../src/repl-host/supervisor.mjs';
import {isTextEditApproval} from '../../scripts/accept/lib.mjs';

const {node, skip} = kernelNode();
const own = {skip};

// The policy's elicitation for `app` (its bundle id) and `display`, under `tool`; returns the answer it got, or the
// rejection's message. `{pid: true}` answers the worker's pid instead.
const APPROVAL_SERVICE = `export async function handleRpc({pid, app, display, tool = 'get_app_state', connector = 'computer-use'}) {
  if (pid) return process.pid;
  try {
    return await nodeRepl.createElicitation({message: 'Allow Computer Use to use "' + display + '"?', meta: {
      codex_approval_kind: 'mcp_tool_call', connector_id: connector, connector_name: 'Computer Use', persist: ['session'], riskLevel: 'low',
      tool_name: tool, tool_params: {app}, tool_params_display: [{name: 'app', display_name: 'App', value: display}]}});
  } catch (error) { return {rejected: error.message}; }
}`;
const ask = (host, request, options) => host.js(`nodeRepl.write(JSON.stringify(await nodeRepl.rpc('approve', ${JSON.stringify(request)})));`, options)
  .then(result => JSON.parse(texts(result).at(-1)));
const workerPid = (host, options) => ask(host, {pid: true}, options);
const asked = host => host.serverRequests.filter(m => m.method === 'elicitation/create');
const TEXTEDIT = {app: 'com.apple.TextEdit', display: 'TextEdit'};
const FINDER = {app: 'com.apple.finder', display: 'Finder'};

// The client as cua's proxy presents it: an accept carries the connection's persist mode (CUA_SHIM_PERSIST, default session).
const answering = (answers, persist = 'session') => msg => {
  const action = answers[msg.params._meta?.tool_params?.app] ?? 'cancel';
  return {result: action === 'accept' ? {action, content: {}, ...(persist === 'none' ? {} : {_meta: {persist}})} : {action}};
};

test('the host asks the client for every approval, a repeat of an accepted or declined app included: the memory is the connection\'s, above it', own, async t => {
  const host = await startHost(t, {node, capabilities: {elicitation: {}}, services: {approve: APPROVAL_SERVICE},
    onServerRequest: answering({'com.apple.TextEdit': 'accept', 'com.apple.finder': 'decline'})});
  assert.deepEqual(await ask(host, TEXTEDIT), {action: 'accept', content: {}, _meta: {persist: 'session'}});
  assert.equal(isTextEditApproval(asked(host)[0]), true, 'the request the harness matcher accepts, as the vendor host sends it');
  assert.deepEqual(await ask(host, TEXTEDIT), {action: 'accept', content: {}, _meta: {persist: 'session'}});
  assert.deepEqual(await ask(host, FINDER), {action: 'decline', content: null, _meta: null});
  assert.deepEqual(await ask(host, FINDER), {action: 'decline', content: null, _meta: null});
  assert.equal(asked(host).length, 4);
});

test('an answer that arrives after the asking worker ended goes to no other worker: the next worker\'s ask is asked anew', own, async t => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const answer = answering({'com.apple.TextEdit': 'accept'});
  let first = true;
  const host = await startHost(t, {node, capabilities: {elicitation: {}}, services: {approve: APPROVAL_SERVICE},
    onServerRequest: msg => (first ? (first = false, held.then(() => answer(msg))) : answer(msg))});
  const asking = await workerPid(host);
  const cell = host.js(`await nodeRepl.rpc('approve', ${JSON.stringify(TEXTEDIT)});`);
  for (let i = 0; i < 250 && asked(host).length === 0; i++) await delay(20);
  assert.equal(asked(host).length, 1, 'the client holds the question');
  process.kill(asking, 'SIGKILL');
  assert.match(texts(await cell).join('\n'), new RegExp(TRUSTED_EXIT_SENTENCE), 'the cell fails with its worker');
  release();
  await delay(50);
  assert.deepEqual(await ask(host, TEXTEDIT), {action: 'accept', content: {}, _meta: {persist: 'session'}}, 'the next worker asks the client itself');
  assert.notEqual(await workerPid(host), asking, 'another worker asked');
  assert.equal(asked(host).length, 2);
});
