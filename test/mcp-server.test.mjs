// Protocol behavior of the standalone MCP server against a fake upstream: tool surface, instructions, request-ID
// namespaces, cancellation routing, elicitation forwarding/persistence and image MIME correction.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertModelSeesText, harness, initialized, UPSTREAM_TOOLS, textOf, structured, tick} from './fixtures/mcp-harness.mjs';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SecretStoreError, connectionSecrets} from '../src/secrets/store.mjs';

const PNG_AS_JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD';

test('initialize forwards upstream and appends host notes within the 2048-character instructions cap', async () => {
  const h = harness();
  const response = await initialized(h);
  const instructions = response.result.instructions;
  assert.match(instructions, /^UI automation through cua_repl/);
  assert.match(instructions, /Host notes/);
  assert.match(instructions, /end_task/);
  assert.ok(instructions.length <= 2048, `${instructions.length} characters`);
  assert.equal(response.result.serverInfo.name, 'rmcp');
});

test('host notes can be replaced or disabled', async () => {
  const replaced = harness({server: {hostNotes: 'Custom notes.'}});
  assert.equal((await initialized(replaced)).result.instructions, 'UI automation through cua_repl using the initialized cua API.\n\nCustom notes.');
  const none = harness({server: {hostNotes: ''}});
  assert.equal((await initialized(none)).result.instructions, 'UI automation through cua_repl using the initialized cua API.');
});

test('tools/list exposes exactly js, js_reset, end_task and secrets_list, preserving upstream js/js_reset descriptions and schemas', async () => {
  const h = harness();
  await initialized(h);
  const list = h.client.request('tools/list', {});
  h.upstream.reply(await h.upstream.nextRequest('tools/list'), {tools: UPSTREAM_TOOLS});
  const {result} = await list.response;
  assert.deepEqual(result.tools.map(t => t.name), ['js', 'js_reset', 'end_task', 'secrets_list']);
  const byName = Object.fromEntries(result.tools.map(t => [t.name, t]));
  for (const name of ['js', 'js_reset']) {
    const upstream = UPSTREAM_TOOLS.find(t => t.name === name);
    // js carries cua's rules ahead of the vendor's own description (issue #73).
    assert.ok(byName[name].description.endsWith(name === 'js' ? `\n\n${upstream.description}` : upstream.description), name);
    if (name === 'js_reset') assert.equal(byName[name].description, upstream.description);
    assert.deepEqual(byName[name].inputSchema, upstream.inputSchema);
  }
  for (const tool of result.tools) {
    assert.equal(typeof tool._meta['anthropic/searchHint'], 'string', tool.name);
    assert.equal(tool._meta['anthropic/alwaysLoad'], undefined, tool.name);
  }
  assert.deepEqual(byName.end_task.inputSchema, {type: 'object', properties: {}, additionalProperties: false});
  assert.deepEqual(byName.secrets_list.inputSchema, {type: 'object', properties: {}, additionalProperties: false});
});

test('hidden upstream tools cannot be called: turn_ended and js_add_node_module_dir never reach upstream', async () => {
  const h = harness();
  await initialized(h);
  const before = h.upstream.sent.length;
  for (const name of ['turn_ended', 'js_add_node_module_dir', 'no_such_tool']) {
    const call = h.client.call(name, {hook_event_name: 'Stop', session_id: 'forged', turn_id: 'forged', path: '/tmp'});
    const response = await call.response;
    assert.equal(response.error.code, -32602, name);
    assert.match(response.error.message, new RegExp(name));
  }
  await tick(10);
  assert.equal(h.upstream.sent.length, before);
});

test('secrets_list without a secrets provider reports storage as not configured, with no labels', async () => {
  const h = harness();
  await initialized(h);
  const response = await h.client.call('secrets_list').response;
  assert.equal(response.result.isError, true);
  assert.deepEqual(structured(response), {status: 'unavailable', code: 'secrets_not_configured'});
  assert.equal('labels' in structured(response), false);
  assert.equal(h.upstream.calls('secrets_list').length, 0);
});

test('secrets_list returns the provider\'s labels and nothing else', async () => {
  const h = harness({server: {secrets: {list: async () => ['b', 'a']}}});
  await initialized(h);
  const response = await h.client.call('secrets_list').response;
  assert.equal(response.result.isError, false);
  assert.deepEqual(structured(response), {status: 'ok', labels: ['a', 'b']});
  assert.deepEqual(JSON.parse(textOf(response)), {status: 'ok', labels: ['a', 'b']});
  assertModelSeesText(response);
  assert.equal(h.upstream.calls('secrets_list').length, 0);
});

test('secrets_list over the connection\'s store omits reserved CUA_DEVICE_ keys (device credentials) and keeps the rest', async t => {
  const home = mkdtempSync(join(tmpdir(), 'cua-home-'));
  t.after(() => rmSync(home, {recursive: true, force: true}));
  const dir = join(home, '.config', 'claude-secrets');
  mkdirSync(dir, {recursive: true, mode: 0o700});
  for (const key of ['WORK_PASSWORD', 'CUA_DEVICE_nuadM_MUKSbSN4L59EffLQ', 'CUA_DEVICE_', 'Cua_Device_jMTkLnzn_rsbzoZAHJ8EbQ', 'CUA_DEVICES', 'A_CUA_DEVICE_x'])
    writeFileSync(join(dir, key), 'sentinel-value', {mode: 0o600});
  const h = harness({server: {secrets: connectionSecrets({enabled: true, env: {HOME: home}})}});
  await initialized(h);
  const response = await h.client.call('secrets_list').response;
  assert.deepEqual(structured(response), {status: 'ok', labels: ['A_CUA_DEVICE_x', 'CUA_DEVICES', 'WORK_PASSWORD']});
  assert.ok(!JSON.stringify(response).includes('sentinel-value'));
});

test('secrets_list reports an unavailable provider and a failed listing by code, value-free', async () => {
  const unavailable = harness({server: {secrets: {unavailable: {code: 'secrets_disabled', message: 'secret storage is turned off for this server (CUA_SHIM_SECRETS=off)'}}}});
  await initialized(unavailable);
  const u = await unavailable.client.call('secrets_list').response;
  assert.equal(u.result.isError, true);
  assert.deepEqual(structured(u), {status: 'unavailable', code: 'secrets_disabled'});
  assert.match(textOf(u), /CUA_SHIM_SECRETS=off/);

  const failure = new SecretStoreError('unreadable', {errno: 'EACCES'});
  const locked = harness({server: {secrets: {list: async () => { throw failure; }}}});
  await initialized(locked);
  const l = await locked.client.call('secrets_list').response;
  assert.equal(l.result.isError, true);
  assert.deepEqual(structured(l), {status: 'error', code: 'unreadable'});

  const odd = harness({server: {secrets: {list: async () => { throw new Error('raw detail that must not surface'); }}}});
  await initialized(odd);
  const o = await odd.client.call('secrets_list').response;
  assert.deepEqual(structured(o), {status: 'error', code: 'unavailable'});
  assert.doesNotMatch(textOf(o), /raw detail/);
});

test('client and internal requests use proxy-owned upstream IDs; responses return under the caller\'s own ID', async () => {
  const h = harness();
  await initialized(h);
  // A numeric and a string ID that look alike must stay distinct callers.
  const numeric = h.client.request('ping', {}, 7);
  const string = h.client.request('ping', {}, '7');
  const a = await h.upstream.nextRequest('ping');
  const b = await h.upstream.next(m => m.method === 'ping' && m.id !== a.id);
  assert.notEqual(a.id, b.id);
  h.upstream.reply(b, {from: 'second'});
  h.upstream.reply(a, {from: 'first'});
  assert.deepEqual((await numeric.response).result, {from: 'first'});
  assert.deepEqual((await string.response).result, {from: 'second'});

  // The internal completion request (turn_ended) is answered upstream but never surfaces to the client.
  const js = h.client.call('js', {code: '1'}, {id: 1});
  h.upstream.text(await h.upstream.nextCall('js'), 'ok');
  await js.response;
  const end = h.client.call('end_task', {}, {id: 2});
  h.upstream.reply(await h.upstream.nextCall('turn_ended'), {content: [{type: 'text', text: '{}'}], isError: false});
  const ended = await end.response;
  assert.equal(structured(ended).status, 'ended');
  assertModelSeesText(ended);
  await tick(10);
  // One response per client request (initialize, two pings, js, end_task) and nothing else.
  const responses = h.client.frames.filter(f => f.method === undefined).map(f => JSON.stringify(f.id)).sort();
  assert.deepEqual(responses, ['"7"', '1', '1', '2', '7']);
});

test('js calls carry the connection session, the task as turn ID and a distinct call ID; client _meta is kept', async () => {
  const h = harness({server: {sessionId: 'sess-A'}});
  await initialized(h, {clientInfo: {name: 'some-host', version: '1'}});
  const first = h.client.call('js', {code: 'a'}, {meta: {progressToken: 'p1', 'claudecode/toolUseId': 'toolu_1'}});
  const up1 = await h.upstream.nextCall('js');
  h.upstream.text(up1, 'a');
  const r1 = await first.response;
  const second = h.client.call('js', {code: 'b'});
  const up2 = await h.upstream.nextCall('js', {after: h.upstream.sent.indexOf(up1) + 1});
  h.upstream.text(up2, 'b');
  const r2 = await second.response;

  const m1 = up1.params._meta;
  const m2 = up2.params._meta;
  assert.equal(m1.progressToken, 'p1');
  assert.equal(m1['claudecode/toolUseId'], 'toolu_1');
  for (const m of [m1, m2]) {
    assert.equal(m.sessionId, 'sess-A');
    assert.equal(m.threadId, 'sess-A');
    assert.equal(m['x-codex-turn-metadata'].session_id, 'sess-A');
    assert.equal(m['x-codex-turn-metadata'].thread_id, 'sess-A');
    assert.equal(m['x-codex-turn-metadata'].model, 'some-host');
    assert.equal(m['x-codex-turn-metadata'].call_id, m.callId);
  }
  // The task ID is minted by the server, not taken from the caller's toolUseId.
  assert.notEqual(m1['x-codex-turn-metadata'].turn_id, 'toolu_1');
  assert.equal(m1['x-codex-turn-metadata'].turn_id, m2['x-codex-turn-metadata'].turn_id);
  assert.notEqual(m1.callId, m2.callId);
  assert.notEqual(m1.callId, m1['x-codex-turn-metadata'].turn_id);
  assert.equal(r1.result._meta['cua/taskId'], m1['x-codex-turn-metadata'].turn_id);
  assert.equal(r2.result._meta['cua/taskId'], m1['x-codex-turn-metadata'].turn_id);
  assert.deepEqual(up1.params.arguments, {code: 'a'});
});

test('image results get their real MIME type', async () => {
  const h = harness();
  await initialized(h);
  const call = h.client.call('js', {code: 'shot'});
  h.upstream.reply(await h.upstream.nextCall('js'), {content: [{type: 'image', mimeType: 'image/png', data: PNG_AS_JPEG}, {type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo'}], isError: false});
  const {result} = await call.response;
  assert.deepEqual(result.content.map(c => c.mimeType), ['image/jpeg', 'image/png']);
});

test('elicitations are forwarded while js is pending; an accepted answer gets session persistence and reaches upstream unqueued', async () => {
  const h = harness();
  await initialized(h);
  const call = h.client.call('js', {code: 'bind app'});
  const upJs = await h.upstream.nextCall('js');
  h.upstream.emit({jsonrpc: '2.0', id: 900, method: 'elicitation/create', params: {message: 'Allow Computer Use to use "TextEdit"?', requestedSchema: {type: 'object', properties: {}}}});
  const elicitation = await h.client.next(m => m.method === 'elicitation/create');
  assert.equal(elicitation.id, 'cua-elicitation-1', 'under the connection\'s own id; the answer goes back under the runtime\'s');
  h.client.send({jsonrpc: '2.0', id: elicitation.id, result: {action: 'accept'}});
  const answer = await h.upstream.next(m => m.id === 900 && m.method === undefined, {label: 'elicitation answer'});
  assert.deepEqual(answer.result, {action: 'accept', content: {}, _meta: {persist: 'session'}});
  h.upstream.text(upJs, 'bound');
  assert.equal(textOf(await call.response), 'bound');
});

test('a declined elicitation is forwarded unchanged and persistence can be disabled', async () => {
  const h = harness({server: {persist: 'none'}});
  await initialized(h);
  h.upstream.emit({jsonrpc: '2.0', id: 'e1', method: 'elicitation/create', params: {message: 'x'}});
  const e1 = await h.client.next(m => m.method === 'elicitation/create');
  h.client.send({jsonrpc: '2.0', id: e1.id, result: {action: 'decline'}});
  assert.deepEqual((await h.upstream.next(m => m.id === 'e1' && m.method === undefined)).result, {action: 'decline'});
  h.upstream.emit({jsonrpc: '2.0', id: 'e2', method: 'elicitation/create', params: {message: 'y'}});
  const e2 = await h.client.next(m => m.method === 'elicitation/create' && m.params.message === 'y');
  h.client.send({jsonrpc: '2.0', id: e2.id, result: {action: 'accept', content: {}}});
  assert.deepEqual((await h.upstream.next(m => m.id === 'e2' && m.method === undefined)).result, {action: 'accept', content: {}});
});

// The connection's approval memory (#117 M3; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Interfaces,
// ApprovalMemory): a computer-use app approval (connector_id "computer-use", keyed by tool_params.app) the client
// accepted with _meta.persist, or declined, answers its repeats on this connection without asking the client again.
const approvalRequest = (id, app, {connector = 'computer-use'} = {}) => ({jsonrpc: '2.0', id, method: 'elicitation/create', params: {
  message: `Allow Computer Use to use "${app}"?`, mode: 'form', requestedSchema: {type: 'object', properties: {}},
  _meta: {codex_approval_kind: 'mcp_tool_call', connector_id: connector, persist: ['session'], tool_name: 'click', tool_params: {app}}}});
const upstreamAnswer = (h, id) => h.upstream.next(m => m.id === id && m.method === undefined, {label: `the answer to ${id}`});
const clientAsked = h => h.client.frames.filter(m => m.method === 'elicitation/create').map(m => m.params._meta?.tool_params?.app ?? null);
const REMEMBERED = action => ({action, content: {source: 'computer-use-persisted-state'}});
// Emits the runtime's request `msg` and resolves the frame the client got for it (under the connection's own id).
const relayed = (h, msg, label = `the client's copy of ${msg.id}`) => {
  const after = h.client.frames.length;
  h.upstream.emit(msg);
  return h.client.next(m => m.method === 'elicitation/create', {after, label});
};

test('an app the client accepted or declined is answered from the connection\'s memory on its repeats, any tool, never asking again', async () => {
  const h = harness();
  await initialized(h);
  const first = await relayed(h, approvalRequest(1, 'com.apple.TextEdit'));
  h.client.send({jsonrpc: '2.0', id: first.id, result: {action: 'accept', content: {}}});
  assert.deepEqual((await upstreamAnswer(h, 1)).result, {action: 'accept', content: {}, _meta: {persist: 'session'}}, 'the first answer is the client\'s');
  h.upstream.emit(approvalRequest(2, 'com.apple.TextEdit'));
  assert.deepEqual((await upstreamAnswer(h, 2)).result, REMEMBERED('accept'));

  const third = await relayed(h, approvalRequest(3, 'com.apple.finder'));
  h.client.send({jsonrpc: '2.0', id: third.id, result: {action: 'decline'}});
  assert.deepEqual((await upstreamAnswer(h, 3)).result, {action: 'decline'});
  h.upstream.emit(approvalRequest(4, 'com.apple.finder'));
  assert.deepEqual((await upstreamAnswer(h, 4)).result, REMEMBERED('decline'), 'a model retrying a declined app is not re-prompted');
  assert.deepEqual(clientAsked(h), ['com.apple.TextEdit', 'com.apple.finder'], 'the client was asked once per app');

  const next = harness();
  await initialized(next);
  await relayed(next, approvalRequest(1, 'com.apple.TextEdit'), 'a new connection asks again');
});

test('the runtime withdrawing an elicitation names it to the client by the id the client was given', async () => {
  const h = harness();
  await initialized(h);
  const asked = await relayed(h, approvalRequest(5, 'com.apple.TextEdit'));
  const after = h.client.frames.length;
  h.upstream.emit({jsonrpc: '2.0', method: 'notifications/cancelled', params: {requestId: 5, reason: 'gone'}});
  const cancelled = await h.client.next(m => m.method === 'notifications/cancelled', {after});
  assert.deepEqual(cancelled.params, {requestId: asked.id, reason: 'gone'});
});

test('an answer the runtime would reject is never remembered: malformed content or _meta, or an error beside a result, accept and decline alike', async () => {
  const h = harness();
  await initialized(h);
  let id = 0;
  // Each reply is answered twice for the same app; neither may come back from memory.
  const twice = async (app, reply) => {
    for (let i = 0; i < 2; i++) {
      const asked = await relayed(h, approvalRequest(++id, app)).catch(() => null);
      assert.ok(asked, `${app}: asked the client again (${JSON.stringify(reply)})`);
      h.client.send({jsonrpc: '2.0', id: asked.id, ...reply});
      await upstreamAnswer(h, id);
    }
  };
  const bad = [
    {result: {action: 'accept', content: [], _meta: {persist: 'session'}}},
    {result: {action: 'accept', content: 'x', _meta: {persist: 'session'}}},
    {result: {action: 'accept', content: {}, _meta: 'session'}},
    {result: {action: 'accept', content: {}, _meta: [{persist: 'session'}]}},
    {error: {code: -1, message: 'refused'}, result: {action: 'accept', content: {}, _meta: {persist: 'session'}}},
    {result: {action: 'decline', content: []}},
    {result: {action: 'decline', _meta: 'x'}},
    {error: {code: -1, message: 'refused'}, result: {action: 'decline'}},
  ];
  for (const [i, reply] of bad.entries()) await twice(`com.example.app${i}`, reply);
  assert.equal(clientAsked(h).length, bad.length * 2, 'every one asked the client again');
});

test('a cancel, an error reply, a malformed answer, an accept without persistence and another connector\'s elicitation are never remembered', async () => {
  const h = harness();
  await initialized(h);
  let id = 0;
  const ask = async (app, reply, options) => {
    const n = ++id;
    const asked = await relayed(h, approvalRequest(n, app, options));
    h.client.send({jsonrpc: '2.0', id: asked.id, ...reply});
    await upstreamAnswer(h, n);
  };
  for (let i = 0; i < 2; i++) await ask('com.apple.Notes', {result: {action: 'cancel'}});
  for (let i = 0; i < 2; i++) await ask('com.apple.Notes', {error: {code: -1, message: 'no'}});
  for (let i = 0; i < 2; i++) await ask('com.apple.Notes', {result: {action: 'granted'}});
  for (let i = 0; i < 2; i++) await ask('com.apple.Notes', {result: {action: 'accept', content: {}, _meta: {fixture: 'client meta, no persist'}}});
  for (let i = 0; i < 2; i++) await ask('com.apple.Notes', {result: {action: 'accept', content: {}}}, {connector: 'browser-use'});
  assert.equal(clientAsked(h).length, 10, 'every one asked the client');

  const none = harness({server: {persist: 'none'}});
  await initialized(none);
  for (const n of [1, 2]) {
    const asked = await relayed(none, approvalRequest(n, 'com.apple.TextEdit'));
    none.client.send({jsonrpc: '2.0', id: asked.id, result: {action: 'accept', content: {}}});
    assert.deepEqual((await upstreamAnswer(none, n)).result, {action: 'accept', content: {}}, 'CUA_SHIM_PERSIST=none: asked every time');
  }
});

test('cancelling an in-flight js forwards notifications/cancelled with the upstream ID and does not end the task', async () => {
  const h = harness();
  await initialized(h);
  const call = h.client.call('js', {code: 'await sleep()'}, {id: 'c1'});
  const upJs = await h.upstream.nextCall('js');
  h.client.notify('notifications/cancelled', {requestId: 'c1', reason: 'user'});
  const cancel = await h.upstream.next(m => m.method === 'notifications/cancelled');
  assert.deepEqual(cancel.params, {requestId: upJs.id, reason: 'user'});
  // The runtime may still answer; the answer is relayed and the task stays open.
  h.upstream.text(upJs, 'finished anyway');
  await call.response;
  assert.equal(h.upstream.calls('turn_ended').length, 0);
  const next = h.client.call('js', {code: 'again'});
  const upNext = await h.upstream.nextCall('js', {after: h.upstream.sent.indexOf(upJs) + 1});
  assert.equal(upNext.params._meta['x-codex-turn-metadata'].turn_id, upJs.params._meta['x-codex-turn-metadata'].turn_id);
  h.upstream.text(upNext, 'ok');
  await next.response;
});

test('js calls are serialized; cancelling a queued call removes it without dispatch or reply', async () => {
  const h = harness();
  await initialized(h);
  const first = h.client.call('js', {code: 'first'}, {id: 'q1'});
  h.client.call('js', {code: 'second'}, {id: 'q2'});
  const third = h.client.call('js', {code: 'third'}, {id: 'q3'});
  const up1 = await h.upstream.nextCall('js');
  await tick(10);
  assert.equal(h.upstream.calls('js').length, 1, 'second call must wait for the first');
  h.client.notify('notifications/cancelled', {requestId: 'q2'});
  await tick(10);
  assert.equal(h.upstream.sent.filter(m => m.method === 'notifications/cancelled').length, 0, 'a queued call is not forwarded');
  h.upstream.text(up1, 'one');
  await first.response;
  const up3 = await h.upstream.next(m => m.method === 'tools/call' && m.params.arguments?.code === 'third');
  assert.deepEqual(h.upstream.calls('js').map(m => m.params.arguments.code), ['first', 'third']);
  h.upstream.text(up3, 'three');
  await third.response;
  await tick(10);
  assert.deepEqual(h.client.responsesFor('q2'), []);
});

test('js_reset is serialized behind running js and keeps the task identity', async () => {
  const h = harness();
  await initialized(h);
  const js = h.client.call('js', {code: 'x'});
  const upJs = await h.upstream.nextCall('js');
  const reset = h.client.call('js_reset');
  await tick(10);
  assert.equal(h.upstream.calls('js_reset').length, 0);
  h.upstream.text(upJs, 'x');
  await js.response;
  const upReset = await h.upstream.nextCall('js_reset');
  assert.equal(upReset.params._meta['x-codex-turn-metadata'].turn_id, upJs.params._meta['x-codex-turn-metadata'].turn_id);
  h.upstream.reply(upReset, {content: [{type: 'text', text: 'js kernel reset'}], isError: false});
  assert.equal((await reset.response).result._meta['cua/taskId'], upJs.params._meta['x-codex-turn-metadata'].turn_id);
  assert.equal(h.upstream.calls('turn_ended').length, 0, 'reset is not task completion');
});

test('a runtime error reply to js is relayed as is and leaves the task open', async () => {
  const h = harness();
  await initialized(h);
  const call = h.client.call('js', {code: 'throw 1'});
  h.upstream.replyError(await h.upstream.nextCall('js'), {code: -32603, message: 'boom'});
  assert.deepEqual((await call.response).error, {code: -32603, message: 'boom'});
  const end = h.client.call('end_task');
  h.upstream.reply(await h.upstream.nextCall('turn_ended'), {content: [], isError: false});
  assert.equal(structured(await end.response).status, 'ended');
});

test('unparseable client input gets a JSON-RPC parse error; upstream notifications pass through', async () => {
  const h = harness();
  await initialized(h);
  h.client.raw('{not json');
  const error = await h.client.next(m => m.error?.code === -32700);
  assert.equal(error.id, null);
  h.upstream.emit({jsonrpc: '2.0', method: 'notifications/message', params: {level: 'info', data: 'hello'}});
  assert.equal((await h.client.next(m => m.method === 'notifications/message')).params.data, 'hello');
});

test('a cancel arriving in the same input chunk as its js call is still forwarded upstream', async () => {
  const h = harness();
  await initialized(h);
  h.client.raw([
    JSON.stringify({jsonrpc: '2.0', id: 'same', method: 'tools/call', params: {name: 'js', arguments: {code: 'x'}}}),
    JSON.stringify({jsonrpc: '2.0', method: 'notifications/cancelled', params: {requestId: 'same'}}),
  ].join('\n'));
  const upJs = await h.upstream.nextCall('js');
  const cancel = await h.upstream.next(m => m.method === 'notifications/cancelled', {label: 'forwarded cancel'});
  assert.equal(cancel.params.requestId, upJs.id);
});

test('a request before initialize (Claude Code\'s server/discover probe) is refused locally, never reaches the runtime, and initialize still succeeds', async () => {
  const h = harness();
  const probe = h.client.request('server/discover', {_meta: {'io.modelcontextprotocol/protocolVersion': '2026-07-28'}}, 'server-discover-probe-1');
  const response = await probe.response;
  assert.equal(response.id, 'server-discover-probe-1');
  assert.equal(response.error.code, -32601);
  assert.match(response.error.message, /server\/discover/);
  await tick(10);
  assert.equal(h.upstream.sent.length, 0);
  const init = await initialized(h);
  assert.equal(init.result.serverInfo.name, 'rmcp');
  assert.equal(h.upstream.sent.filter(m => m.method === 'server/discover').length, 0);
});

// EngineAttestation (#117, docs/doperpowers/specs/2026-10-18-own-native-engine-design.md; the Decision Log's "M1b
// pre-flight" item 4): every js and js_reset result of a macOS computer session carries `cua/nativeEngine`. The launch's
// attestation fills it in; a value the service set (cua's engine's, from its ping) passes through untouched, so a
// harness sees a service that disagrees with the selection rather than a silent label.
test('js and js_reset results carry the connection\'s engine attestation; the service\'s own passes through', async () => {
  const launched = {engine: 'vendor', version: '26.924.1001281', build: '26.928.40906-darwin-arm64'};
  const h = harness({server: {nativeEngine: launched}});
  await initialized(h);
  const plain = h.client.call('js', {code: 'a'});
  h.upstream.reply(await h.upstream.nextCall('js'), {content: [{type: 'text', text: 'a'}], isError: false, _meta: {'codex/toolSurface': 'x'}});
  const plainMeta = (await plain.response).result._meta;
  assert.deepEqual(plainMeta['cua/nativeEngine'], launched);
  assert.equal(plainMeta['codex/toolSurface'], 'x');
  const service = {engine: 'cua', version: '0.2.0', build: 'b2'};
  const after = h.upstream.sent.length;
  const served = h.client.call('js', {code: 'b'});
  h.upstream.reply(await h.upstream.nextCall('js', {after}), {content: [{type: 'text', text: 'b'}], isError: false, _meta: {'cua/nativeEngine': service}});
  assert.deepEqual((await served.response).result._meta['cua/nativeEngine'], service);
  const reset = h.client.call('js_reset');
  h.upstream.reply(await h.upstream.nextCall('js_reset'), {content: [{type: 'text', text: 'js kernel reset'}], isError: false});
  assert.deepEqual((await reset.response).result._meta['cua/nativeEngine'], launched);
  // Without one (no computer surface on macOS), nothing is added.
  const none = harness();
  await initialized(none);
  const call = none.client.call('js', {code: 'c'});
  none.upstream.reply(await none.upstream.nextCall('js'), {content: [{type: 'text', text: 'c'}], isError: false});
  assert.equal(Object.hasOwn((await call.response).result._meta, 'cua/nativeEngine'), false);
});
