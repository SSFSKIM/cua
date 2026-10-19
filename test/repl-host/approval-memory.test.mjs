// The own host's approval memory (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, "Policy and approvals";
// Interfaces, ApprovalMemory) end to end: a real supervisor, kernel and trusted worker over MCP, with a fixture trusted
// service that asks the vendor's computer-use app approval as its policy does (R/A-contract.md §2.6). Per connection, a
// repeat for the same app is answered from memory, accepts and declines alike, across a worker replacement (an answer
// that arrives after the asking worker ended included); a new connection asks again. Needs Node 24 or later (CUA_NODE); skips visibly otherwise.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {kernelNode} from './kernel-harness.mjs';
import {startHost, texts} from './supervisor-harness.mjs';
import {PERSISTED_STATE_SOURCE} from '../../src/repl-host/elicitation.mjs';
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
const REMEMBERED = action => ({action, content: {source: PERSISTED_STATE_SOURCE}, _meta: null});
const TEXTEDIT = {app: 'com.apple.TextEdit', display: 'TextEdit'};
const FINDER = {app: 'com.apple.finder', display: 'Finder'};

// The client as cua's proxy presents it: an accept carries the connection's persist mode (CUA_SHIM_PERSIST, default session).
const answering = (answers, persist = 'session') => msg => {
  const action = answers[msg.params._meta?.tool_params?.app] ?? 'cancel';
  return {result: action === 'accept' ? {action, content: {}, ...(persist === 'none' ? {} : {_meta: {persist}})} : {action}};
};

test('a repeat of an approved or declined app is answered from the connection\'s memory, the accept marked persisted, never asking the client again', own, async t => {
  const host = await startHost(t, {node, capabilities: {elicitation: {}}, services: {approve: APPROVAL_SERVICE},
    onServerRequest: answering({'com.apple.TextEdit': 'accept', 'com.apple.finder': 'decline'})});
  assert.deepEqual(await ask(host, TEXTEDIT), {action: 'accept', content: {}, _meta: {persist: 'session'}}, 'the first ask is the client\'s');
  assert.equal(asked(host).length, 1);
  assert.equal(isTextEditApproval(asked(host)[0]), true, 'the request the harness matcher accepts, as the vendor host sends it');
  assert.deepEqual(await ask(host, TEXTEDIT), REMEMBERED('accept'));
  assert.deepEqual(await ask(host, {...TEXTEDIT, tool: 'click'}), REMEMBERED('accept'), 'any tool on the same app');
  assert.equal(asked(host).length, 1, 'the client was asked once');

  assert.deepEqual(await ask(host, FINDER), {action: 'decline', content: null, _meta: null});
  assert.deepEqual(await ask(host, FINDER), REMEMBERED('decline'), 'a model retrying a declined app is not re-prompted');
  assert.equal(asked(host).length, 2);
});

test('a cancel, an accept the connection does not remember (CUA_SHIM_PERSIST=none) and another connector\'s elicitation ask every time', own, async t => {
  const host = await startHost(t, {node, capabilities: {elicitation: {}}, services: {approve: APPROVAL_SERVICE},
    onServerRequest: answering({'com.apple.TextEdit': 'accept', 'com.apple.Notes': 'cancel'}, 'none')});
  await ask(host, TEXTEDIT);
  assert.deepEqual(await ask(host, TEXTEDIT), {action: 'accept', content: {}, _meta: null});
  await ask(host, {app: 'com.apple.Notes', display: 'Notes'});
  await ask(host, {app: 'com.apple.Notes', display: 'Notes'});
  assert.equal(asked(host).length, 4);
  const other = await startHost(t, {node, capabilities: {elicitation: {}}, services: {approve: APPROVAL_SERVICE}, onServerRequest: answering({'com.apple.TextEdit': 'accept'})});
  await ask(other, {...TEXTEDIT, connector: 'browser-use'});
  await ask(other, {...TEXTEDIT, connector: 'browser-use'});
  assert.equal(asked(other).length, 2, 'only computer-use approvals are remembered');
});

test('the memory is the connection\'s: it survives the worker\'s replacement, and a new connection asks again', own, async t => {
  const host = await startHost(t, {node, capabilities: {elicitation: {}}, services: {approve: APPROVAL_SERVICE}, onServerRequest: answering({'com.apple.TextEdit': 'accept'})});
  await ask(host, TEXTEDIT);
  const asking = await workerPid(host);
  // A sandbox-policy change replaces the trusted worker (trusted-worker.test.mjs); the supervisor, and the memory, stay.
  assert.deepEqual(await ask(host, TEXTEDIT, {mode: 'disabled'}), REMEMBERED('accept'));
  assert.notEqual(await workerPid(host, {mode: 'disabled'}), asking, 'another worker answered');
  assert.equal(asked(host).length, 1);
  const next = await startHost(t, {node, capabilities: {elicitation: {}}, services: {approve: APPROVAL_SERVICE}, onServerRequest: answering({'com.apple.TextEdit': 'accept'})});
  assert.deepEqual(await ask(next, TEXTEDIT), {action: 'accept', content: {}, _meta: {persist: 'session'}});
  assert.equal(asked(next).length, 1, 'a new connection asks again');
});

test('an answer that arrives after the asking worker ended is still the connection\'s: the next worker\'s ask is answered from memory', own, async t => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const answer = answering({'com.apple.TextEdit': 'accept'});
  const host = await startHost(t, {node, capabilities: {elicitation: {}}, services: {approve: APPROVAL_SERVICE},
    onServerRequest: msg => held.then(() => answer(msg))});
  const asking = await workerPid(host);
  const cell = host.js(`await nodeRepl.rpc('approve', ${JSON.stringify(TEXTEDIT)});`);
  for (let i = 0; i < 250 && asked(host).length === 0; i++) await delay(20);
  assert.equal(asked(host).length, 1, 'the client holds the question');
  process.kill(asking, 'SIGKILL');
  assert.match(texts(await cell).join('\n'), new RegExp(TRUSTED_EXIT_SENTENCE), 'the cell fails with its worker');
  release();
  await delay(50);
  assert.deepEqual(await ask(host, TEXTEDIT), REMEMBERED('accept'), 'the late answer was remembered');
  assert.notEqual(await workerPid(host), asking, 'another worker asked');
  assert.equal(asked(host).length, 1, 'the client was asked once');
});
