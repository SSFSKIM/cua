// The connection/task state machine through the MCP surface, against a fake upstream that answers only when told to.
// Covers the spec's lifecycle table: Idle/Active/Ending transitions, terminal Failed/Closing on uncertainty, exactly-
// once settlement of every caller, bounded teardown of owned resources, and no revival from late replies.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness, initialized, structured, textOf, tick} from './fixtures/mcp-harness.mjs';

const turnOf = msg => msg.params._meta['x-codex-turn-metadata'].turn_id;

async function startJs(h, code = 'work', id) {
  const call = h.client.call('js', {code}, id === undefined ? {} : {id});
  const up = await h.upstream.next(m => m.method === 'tools/call' && m.params.name === 'js' && m.params.arguments.code === code, {label: `upstream js ${code}`});
  return {call, up};
}

function assertRejected(response, code) {
  assert.equal(response.result?.isError, true, JSON.stringify(response));
  assert.equal(structured(response).status, 'error');
  assert.equal(structured(response).code, code);
}

test('Idle + end_task is a no-op with no upstream completion', async () => {
  const h = harness();
  await initialized(h);
  const response = await h.client.call('end_task').response;
  assert.equal(response.result.isError, false);
  assert.deepEqual(structured(response), {status: 'noop', ended: false});
  assert.equal(h.upstream.calls('turn_ended').length, 0);
});

test('Active + end_task waits for running js, then sends one matching turn_ended; success returns to Idle', async () => {
  const h = harness({server: {sessionId: 'sess-E'}});
  await initialized(h);
  const {call, up} = await startJs(h);
  const taskId = turnOf(up);
  const end = h.client.call('end_task');
  await tick(20);
  assert.equal(h.upstream.calls('turn_ended').length, 0, 'completion must wait for quiescence');
  h.upstream.text(up, 'done');
  assert.equal(textOf(await call.response), 'done');
  const turnEnded = await h.upstream.nextCall('turn_ended');
  assert.deepEqual(turnEnded.params.arguments, {hook_event_name: 'Stop', session_id: 'sess-E', turn_id: taskId});
  const meta = turnEnded.params._meta['x-codex-turn-metadata'];
  assert.equal(meta.session_id, 'sess-E');
  assert.equal(meta.turn_id, taskId);
  assert.notEqual(meta.call_id, up.params._meta.callId);
  h.upstream.reply(turnEnded, {content: [{type: 'text', text: '{}'}], isError: false});
  const ended = await end.response;
  assert.equal(ended.result.isError, false);
  assert.deepEqual(structured(ended), {status: 'ended', ended: true, taskId});

  // Back in Idle: a repeat is a no-op and the next js starts a new task.
  assert.deepEqual(structured(await h.client.call('end_task').response), {status: 'noop', ended: false});
  const next = await startJs(h, 'next');
  assert.notEqual(turnOf(next.up), taskId);
  assert.equal(h.upstream.calls('turn_ended').length, 1);
});

test('Ending rejects new work as task-ending and drops queued work that never started', async () => {
  const h = harness();
  await initialized(h);
  const {call, up} = await startJs(h, 'running');
  const queued = h.client.call('js', {code: 'queued'});
  const end = h.client.call('end_task');
  assertRejected(await queued.response, 'task_ending');
  const late = await h.client.call('js', {code: 'late'}).response;
  assertRejected(late, 'task_ending');
  const reset = await h.client.call('js_reset').response;
  assertRejected(reset, 'task_ending');
  h.upstream.text(up, 'ok');
  await call.response;
  h.upstream.reply(await h.upstream.nextCall('turn_ended'), {content: [], isError: false});
  assert.equal(structured(await end.response).status, 'ended');
  assert.deepEqual(h.upstream.calls('js').map(m => m.params.arguments.code), ['running']);
  assert.equal(h.upstream.calls('js_reset').length, 0);
});

test('repeated end_task during Ending coalesces into one upstream completion and one result', async () => {
  const h = harness();
  await initialized(h);
  const {call, up} = await startJs(h);
  const first = h.client.call('end_task');
  const second = h.client.call('end_task');
  h.upstream.text(up, 'ok');
  await call.response;
  h.upstream.reply(await h.upstream.nextCall('turn_ended'), {content: [], isError: false});
  const [a, b] = [await first.response, await second.response];
  assert.deepEqual(structured(a), structured(b));
  assert.equal(structured(a).status, 'ended');
  await tick(20);
  assert.equal(h.upstream.calls('turn_ended').length, 1);
});

for (const [label, answer] of [
  ['an isError completion result', (h, msg) => h.upstream.reply(msg, {content: [{type: 'text', text: 'handler failed'}], isError: true})],
  ['a JSON-RPC completion error', (h, msg) => h.upstream.replyError(msg, {code: -32603, message: 'turn-ended handlers timed out'})],
]) {
  test(`${label} fails the connection terminally: no success, no no-op, no new task`, async () => {
    const h = harness();
    const releaseTeardown = h.upstream.holdTeardown();
    await initialized(h);
    const {call, up} = await startJs(h);
    h.upstream.text(up, 'ok');
    await call.response;
    const end = h.client.call('end_task');
    answer(h, await h.upstream.nextCall('turn_ended'));
    const response = await end.response;
    assertRejected(response, 'completion_failed');
    assert.equal(structured(response).ended, false);
    assert.equal(structured(response).nativeCleanup, 'unconfirmed');
    assertRejected(await h.client.call('end_task').response, 'connection_failed');
    assertRejected(await h.client.call('js', {code: 'new'}).response, 'connection_failed');
    assertRejected(await h.client.call('js_reset').response, 'connection_failed');
    releaseTeardown();
    const closed = await h.server.closed;
    assert.equal(closed.code, 1);
    assert.equal(h.upstream.terminations.length, 1);
    assert.deepEqual(h.upstream.calls('js').map(m => m.params.arguments.code), ['work']);
  });
}

test('JS that ignores cancellation times out completion: the caller is failed once and a late reply cannot revive anything', async () => {
  const h = harness();
  const releaseTeardown = h.upstream.holdTeardown();
  await initialized(h);
  const {up} = await startJs(h, 'while(true){}', 'stuck');
  h.client.notify('notifications/cancelled', {requestId: 'stuck'});
  await h.upstream.next(m => m.method === 'notifications/cancelled');
  const end = h.client.call('end_task');
  const response = await end.response;
  assertRejected(response, 'completion_timeout');
  assert.equal(structured(response).stage, 'quiescence');
  assert.equal(h.upstream.calls('turn_ended').length, 0, 'no completion without quiescence');
  const stuck = await h.client.response('stuck');
  assertRejected(stuck, 'connection_failed');

  // During teardown: new work is rejected, and a late reply for the old task is neither relayed nor admitted.
  assertRejected(await h.client.call('js', {code: 'after deadline'}).response, 'connection_failed');
  h.upstream.text(up, 'late result');
  await tick(20);
  assert.equal(h.client.responsesFor('stuck').length, 1);
  assert.deepEqual(h.upstream.calls('js').map(m => m.params.arguments.code), ['while(true){}']);
  releaseTeardown();
  const closed = await h.server.closed;
  assert.equal(closed.code, 1);
  assert.equal(h.upstream.terminations.length, 1);
});

test('a turn_ended that never answers times out at the acknowledgement stage', async () => {
  const h = harness();
  const releaseTeardown = h.upstream.holdTeardown();
  await initialized(h);
  const {call, up} = await startJs(h);
  h.upstream.text(up, 'ok');
  await call.response;
  const end = h.client.call('end_task');
  const turnEnded = await h.upstream.nextCall('turn_ended');
  const response = await end.response;
  assertRejected(response, 'completion_timeout');
  assert.equal(structured(response).stage, 'acknowledgement');
  // A late acknowledgement does not turn the failure into success or reopen the connection.
  h.upstream.reply(turnEnded, {content: [], isError: false});
  await tick(20);
  assertRejected(await h.client.call('end_task').response, 'connection_failed');
  releaseTeardown();
  assert.equal((await h.server.closed).code, 1);
});

test('the completion deadline covers quiescence and acknowledgement together', async () => {
  const h = harness({server: {completionDeadlineMs: 120}});
  await initialized(h);
  const {call, up} = await startJs(h);
  const end = h.client.call('end_task');
  const started = Date.now();
  await tick(80);
  h.upstream.text(up, 'ok');
  await call.response;
  await h.upstream.nextCall('turn_ended');
  const response = await end.response;
  assertRejected(response, 'completion_timeout');
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 200, `deadline is total, not per stage (${elapsed} ms)`);
});

test('EOF while Idle closes without completion and tears down', async () => {
  const h = harness();
  await initialized(h);
  h.client.eof();
  const closed = await h.server.closed;
  assert.equal(closed.code, 0);
  assert.equal(h.upstream.calls('turn_ended').length, 0);
  assert.equal(h.upstream.terminations.length, 1);
});

test('EOF while Active lets running js finish, completes the task best-effort, then tears down', async () => {
  const h = harness();
  await initialized(h);
  const {call, up} = await startJs(h);
  const taskId = turnOf(up);
  h.client.eof();
  await tick(10);
  assert.equal(h.upstream.terminations.length, 0, 'teardown waits for the bounded completion attempt');
  h.upstream.text(up, 'finished');
  assert.equal(textOf(await call.response), 'finished');
  const turnEnded = await h.upstream.nextCall('turn_ended');
  assert.equal(turnEnded.params.arguments.turn_id, taskId);
  h.upstream.reply(turnEnded, {content: [], isError: false});
  const closed = await h.server.closed;
  assert.equal(closed.code, 0);
  assert.equal(h.upstream.terminations.length, 1);
});

test('a completion that succeeds after close began does not return the connection to Idle', async () => {
  const h = harness();
  const releaseTeardown = h.upstream.holdTeardown();
  await initialized(h);
  const {call, up} = await startJs(h);
  h.upstream.text(up, 'ok');
  await call.response;
  const end = h.client.call('end_task');
  const turnEnded = await h.upstream.nextCall('turn_ended');
  const closing = h.server.close('signal');
  h.upstream.reply(turnEnded, {content: [], isError: false});
  assert.equal(structured(await end.response).status, 'ended');
  assertRejected(await h.client.call('js', {code: 'after close'}).response, 'connection_closing');
  assertRejected(await h.client.call('end_task').response, 'connection_closing');
  releaseTeardown();
  assert.equal((await closing).code, 0);
  assert.deepEqual(h.upstream.calls('js').map(m => m.params.arguments.code), ['work']);
});

test('EOF racing a completion deadline: the deadline still fails the completion and teardown runs once', async () => {
  const h = harness();
  await initialized(h);
  const {up} = await startJs(h, 'stuck', 'stuck');
  const end = h.client.call('end_task');
  h.client.eof();
  assertRejected(await end.response, 'completion_timeout');
  const stuck = await h.client.response('stuck');
  assert.equal(stuck.result.isError, true);
  h.upstream.text(up, 'late');
  const closed = await h.server.closed;
  assert.equal(closed.code, 1);
  assert.equal(h.upstream.terminations.length, 1);
  assert.equal(h.client.responsesFor('stuck').length, 1);
});

test('upstream exit fails every pending caller exactly once and closes without hanging', async () => {
  const h = harness();
  const releaseTeardown = h.upstream.holdTeardown();
  await initialized(h);
  const {up} = await startJs(h, 'running', 'r1');
  const list = h.client.request('tools/list', {}, 'list');
  await h.upstream.nextRequest('tools/list');
  h.upstream.exit({code: null, signal: 'SIGSEGV'});
  assertRejected(await h.client.response('r1'), 'connection_failed');
  const listResponse = await list.response;
  assert.equal(listResponse.error.code, -32000);
  assert.match(listResponse.error.message, /connection_failed/);
  h.upstream.text(up, 'late');
  assertRejected(await h.client.call('js', {code: 'new'}).response, 'connection_failed');
  releaseTeardown();
  assert.equal((await h.server.closed).code, 1);
  await tick(20);
  assert.equal(h.client.responsesFor('r1').length, 1);
  assert.equal(h.client.responsesFor('list').length, 1);
});

test('upstream exit during Ending reports a failed completion, never success', async () => {
  const h = harness();
  await initialized(h);
  const {call, up} = await startJs(h);
  h.upstream.text(up, 'ok');
  await call.response;
  const end = h.client.call('end_task');
  await h.upstream.nextCall('turn_ended');
  h.upstream.exit({code: 1, signal: null});
  assertRejected(await end.response, 'completion_failed');
  assert.equal((await h.server.closed).code, 1);
});

test('an elicitation answer reaches upstream while end_task waits for the js that asked', async () => {
  const h = harness();
  await initialized(h);
  const {call, up} = await startJs(h);
  h.upstream.emit({jsonrpc: '2.0', id: 77, method: 'elicitation/create', params: {message: 'Allow Computer Use to use "TextEdit"?'}});
  await h.client.next(m => m.method === 'elicitation/create');
  const end = h.client.call('end_task');
  h.client.send({jsonrpc: '2.0', id: 77, result: {action: 'decline'}});
  await h.upstream.next(m => m.id === 77 && m.method === undefined);
  h.upstream.text(up, 'declined');
  await call.response;
  h.upstream.reply(await h.upstream.nextCall('turn_ended'), {content: [], isError: false});
  assert.equal(structured(await end.response).status, 'ended');
});

test('an unconfirmed teardown makes the close nonzero and is reported', async () => {
  const h = harness();
  h.upstream.terminateImpl = async () => ({confirmed: false, steps: ['eof', 'SIGTERM', 'SIGKILL']});
  await initialized(h);
  h.client.eof();
  const closed = await h.server.closed;
  assert.equal(closed.code, 1);
  assert.equal(closed.teardown.confirmed, false);
  assert.ok(h.client.diagnostics.some(line => /unconfirmed/.test(line)));
});

test('when the client transport is gone, pending callers are settled internally and the server still closes', async () => {
  const h = harness();
  await initialized(h);
  await startJs(h, 'stuck', 'gone');
  h.output.destroy();
  h.upstream.exit({code: 1, signal: null});
  const closed = await h.server.closed;
  assert.equal(closed.code, 1);
});

test('losing the client output transport alone closes the connection like EOF', async () => {
  const h = harness();
  await initialized(h);
  const {up} = await startJs(h, 'running');
  h.output.destroy();
  // stdin stays open; the task must not stay Active forever.
  h.upstream.text(up, 'done');
  const turnEnded = await h.upstream.nextCall('turn_ended');
  h.upstream.reply(turnEnded, {content: [], isError: false});
  const closed = await h.server.closed;
  assert.equal(closed.reason, 'transport');
  assert.equal(closed.completion, 'ended');
  assert.equal(h.upstream.terminations.length, 1);
});

test('an error on the client input stream closes the connection like EOF and tears down its runtime', async () => {
  const h = harness();
  await initialized(h);
  assert.doesNotThrow(() => h.input.emit('error', Object.assign(new Error('read EIO'), {code: 'EIO'})));
  assert.equal(h.server.state, 'closing');
  const closed = await h.server.closed;
  assert.equal(closed.reason, 'eof');
  assert.equal(closed.code, 0);
  assert.equal(h.upstream.terminations.length, 1);
});
