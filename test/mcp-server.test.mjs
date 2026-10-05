// Protocol behavior of the standalone MCP server against a fake upstream: tool surface, instructions, request-ID
// namespaces, cancellation routing, elicitation forwarding/persistence and image MIME correction.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness, initialized, UPSTREAM_TOOLS, textOf, structured, tick} from './fixtures/mcp-harness.mjs';

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

test('tools/list exposes exactly js, js_reset, end_task and secrets_list, preserving upstream js/js_reset schemas', async () => {
  const h = harness();
  await initialized(h);
  const list = h.client.request('tools/list', {});
  h.upstream.reply(await h.upstream.nextRequest('tools/list'), {tools: UPSTREAM_TOOLS});
  const {result} = await list.response;
  assert.deepEqual(result.tools.map(t => t.name), ['js', 'js_reset', 'end_task', 'secrets_list']);
  const byName = Object.fromEntries(result.tools.map(t => [t.name, t]));
  for (const name of ['js', 'js_reset']) {
    const upstream = UPSTREAM_TOOLS.find(t => t.name === name);
    assert.equal(byName[name].description, upstream.description);
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
  const h = harness({server: {secrets: {list: async () => ['b', 'a'], close: async () => ({confirmed: true, steps: ['eof']})}}});
  await initialized(h);
  const response = await h.client.call('secrets_list').response;
  assert.equal(response.result.isError, false);
  assert.deepEqual(structured(response), {status: 'ok', labels: ['a', 'b']});
  assert.deepEqual(JSON.parse(textOf(response)), {status: 'ok', labels: ['a', 'b']});
  assert.equal(h.upstream.calls('secrets_list').length, 0);
});

test('secrets_list reports an unavailable provider and a failed listing by code, value-free', async () => {
  const unavailable = harness({server: {secrets: {unavailable: {code: 'helper_not_built', message: 'the Keychain helper is not built'}, close: async () => ({confirmed: true, steps: []})}}});
  await initialized(unavailable);
  const u = await unavailable.client.call('secrets_list').response;
  assert.equal(u.result.isError, true);
  assert.deepEqual(structured(u), {status: 'unavailable', code: 'helper_not_built'});
  assert.match(textOf(u), /not built/);

  const failure = Object.assign(new Error('the Keychain is locked'), {code: 'locked'});
  const locked = harness({server: {secrets: {list: async () => { throw failure; }, close: async () => ({confirmed: true, steps: []})}}});
  await initialized(locked);
  const l = await locked.client.call('secrets_list').response;
  assert.equal(l.result.isError, true);
  assert.deepEqual(structured(l), {status: 'error', code: 'locked'});

  const odd = harness({server: {secrets: {list: async () => { throw new Error('raw detail that must not surface'); }, close: async () => ({confirmed: true, steps: []})}}});
  await initialized(odd);
  const o = await odd.client.call('secrets_list').response;
  assert.deepEqual(structured(o), {status: 'error', code: 'unavailable'});
  assert.doesNotMatch(textOf(o), /raw detail/);
});

test('close tears the secrets broker down with the runtime, inside the teardown budget', async () => {
  const closes = [];
  const h = harness({server: {secrets: {list: async () => [], close: async options => { closes.push(options); return {confirmed: true, steps: ['eof']}; }}}});
  await initialized(h);
  h.client.eof();
  const closed = await h.server.closed;
  assert.equal(closed.code, 0);
  assert.deepEqual(closes, [{budgetMs: 150}]);
  assert.deepEqual(closed.secrets, {confirmed: true, steps: ['eof']});
});

test('an unconfirmed broker teardown is reported and makes the exit nonzero', async () => {
  const h = harness({server: {secrets: {list: async () => [], close: async () => ({confirmed: false, steps: ['eof', 'SIGTERM', 'SIGKILL'], reason: 'the broker helper did not exit'})}}});
  await initialized(h);
  h.client.eof();
  const closed = await h.server.closed;
  assert.equal(closed.code, 1);
  assert.ok(h.client.diagnostics.some(line => /secrets broker teardown unconfirmed.*did not exit/.test(line)), h.client.diagnostics.join('\n'));
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
  assert.equal(structured(await end.response).status, 'ended');
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
  assert.equal(elicitation.id, 900);
  h.client.send({jsonrpc: '2.0', id: 900, result: {action: 'accept'}});
  const answer = await h.upstream.next(m => m.id === 900 && m.method === undefined, {label: 'elicitation answer'});
  assert.deepEqual(answer.result, {action: 'accept', content: {}, _meta: {persist: 'session'}});
  h.upstream.text(upJs, 'bound');
  assert.equal(textOf(await call.response), 'bound');
});

test('a declined elicitation is forwarded unchanged and persistence can be disabled', async () => {
  const h = harness({server: {persist: 'none'}});
  await initialized(h);
  h.upstream.emit({jsonrpc: '2.0', id: 'e1', method: 'elicitation/create', params: {message: 'x'}});
  await h.client.next(m => m.method === 'elicitation/create');
  h.client.send({jsonrpc: '2.0', id: 'e1', result: {action: 'decline'}});
  assert.deepEqual((await h.upstream.next(m => m.id === 'e1' && m.method === undefined)).result, {action: 'decline'});
  h.upstream.emit({jsonrpc: '2.0', id: 'e2', method: 'elicitation/create', params: {message: 'y'}});
  await h.client.next(m => m.id === 'e2');
  h.client.send({jsonrpc: '2.0', id: 'e2', result: {action: 'accept', content: {}}});
  assert.deepEqual((await h.upstream.next(m => m.id === 'e2' && m.method === undefined)).result, {action: 'accept', content: {}});
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
