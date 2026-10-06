// The MCP Streamable HTTP handler (src/mcp/http.mjs) over its abstract request and response, the shape the relay
// adapter (E3) drives as well as node:http. Most tests serve in-process connections (createServer over the in-memory
// fake upstream of mcp-harness.mjs) so the order of every reply is the test's; the last ones serve real connections
// (openConnection on a scratch home whose runtime is the fake upstream process) to prove what a session releases.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createMcpHttp} from '../src/mcp/http.mjs';
import {createServer} from '../src/mcp/server.mjs';
import {fakeUpstream, tick} from './fixtures/mcp-harness.mjs';
import {fakeInstalledHome, installedHomeSupported} from './fixtures/installed-home.mjs';
import {scratch} from './fixtures/runtime-fixture.mjs';

const CREDENTIAL = 'c'.repeat(64);
const INITIALIZE = {jsonrpc: '2.0', id: 0, method: 'initialize', params: {protocolVersion: '2025-03-26', capabilities: {elicitation: {}}, clientInfo: {name: 'test', version: '0'}}};
const UPSTREAM_INIT = {protocolVersion: '2025-06-18', capabilities: {tools: {}}, serverInfo: {name: 'rmcp', version: '1.5.0'}, instructions: 'Upstream.'};
const call = (id, name, args = {}) => ({jsonrpc: '2.0', id, method: 'tools/call', params: {name, arguments: args}});

// In-process connections: each session's createServer runs over a fake upstream that answers initialize by itself;
// everything else waits for the test (`opened[i].upstream`).
function inProcess() {
  const opened = [];
  const open = async ({sessionId, input, output}) => {
    if (open.failWith) throw Object.assign(new Error('open failed'), {code: open.failWith});
    const upstream = fakeUpstream();
    const send = upstream.send;
    upstream.send = msg => {
      send(msg);
      if (msg.method === 'initialize') queueMicrotask(() => upstream.reply(msg, UPSTREAM_INIT));
    };
    const server = createServer({input, output, upstream, sessionId, diagnostics: () => {}, completionDeadlineMs: 100, teardownBudgetMs: 100});
    const closed = server.closed.then(result => ({...result, listingLeftover: false}));
    const connection = {sessionId, closed, upstream, close: reason => { server.close(reason); return closed; }, get state() { return server.state; }};
    opened.push(connection);
    return connection;
  };
  open.opened = opened;
  return open;
}

// A response recorder satisfying {writeHead, write, end}, with its SSE events parsed.
function recorder() {
  const res = {
    status: undefined, headers: {}, body: '', ended: false,
    writeHead(status, headers = {}) {
      assert.equal(res.status, undefined, 'writeHead once');
      res.status = status;
      for (const [k, v] of Object.entries(headers)) res.headers[k.toLowerCase()] = v;
    },
    write(chunk) { assert.ok(!res.ended, 'no write after end'); res.body += chunk; },
    end(chunk) { assert.ok(!res.ended, 'end once'); if (chunk !== undefined) res.body += chunk; res.ended = true; },
    events() {
      return res.body.split('\n\n').filter(Boolean).map(block => {
        const event = {};
        for (const line of block.split('\n')) {
          const at = line.indexOf(': ');
          event[line.slice(0, at)] = line.slice(at + 2);
        }
        return {id: event.id, message: JSON.parse(event.data)};
      });
    },
    messages: () => res.events().map(e => e.message),
    json: () => JSON.parse(res.body),
  };
  return res;
}

async function until(predicate, label = 'condition', ms = 2000) {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await tick(2);
  }
}

function setup(t, options = {}) {
  const open = options.open ?? inProcess();
  const diagnostics = [];
  const http = createMcpHttp({home: '/nowhere', env: {}, clientCredential: CREDENTIAL, open, diagnostics: line => diagnostics.push(line), ...options});
  t.after(() => http.close('eof'));
  // Sends one request; `body` may be an object, an array (a batch) or a raw string. Returns its recorder at once and,
  // as `done`, the handler's promise.
  const send = ({method = 'POST', url = '/mcp', session, body, headers = {}, auth = `Bearer ${CREDENTIAL}`, read} = {}) => {
    const controller = new AbortController();
    const chunks = body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))];
    const req = {
      method, url, signal: controller.signal,
      headers: {
        'content-type': 'application/json', accept: 'application/json, text/event-stream',
        ...(auth ? {authorization: auth} : {}), ...(session ? {'mcp-session-id': session} : {}), ...headers,
      },
      body: read ?? (async function* () { yield* chunks; })(),
    };
    const res = recorder();
    const done = http.handle(req, res);
    return {res, done, abort: () => controller.abort()};
  };
  const initialize = async (headers = {}) => {
    const {res, done} = send({body: INITIALIZE, headers});
    await done;
    assert.equal(res.status, 200, res.body);
    return res.headers['mcp-session-id'];
  };
  const upstreamOf = n => open.opened[n].upstream;
  return {http, open, send, initialize, upstreamOf, diagnostics};
}

test('initialize without a session header opens a session and answers the InitializeResult as JSON with its Mcp-Session-Id', async t => {
  const {http, open, send} = setup(t);
  const {res, done} = send({body: INITIALIZE});
  await done;
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/json');
  const sessionId = res.headers['mcp-session-id'];
  assert.match(sessionId, /^[0-9a-f-]{36}$/);
  assert.equal(open.opened[0].sessionId, sessionId, 'the session id is the connection\'s own');
  assert.ok(http.sessions.has(sessionId));
  const reply = res.json();
  assert.equal(reply.id, 0);
  assert.equal(reply.result.serverInfo.name, 'rmcp');
  assert.match(reply.result.instructions, /Host notes/);
  assert.ok(res.ended);
});

test('nothing but initialize opens a session: a request without a session header is 400 and opens nothing', async t => {
  const {http, open, send} = setup(t);
  for (const body of [call(1, 'js', {code: '1'}), {jsonrpc: '2.0', method: 'notifications/initialized'}, [INITIALIZE, call(1, 'js')]]) {
    const {res, done} = send({body});
    await done;
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  for (const method of ['GET', 'DELETE']) {
    const {res, done} = send({method});
    await done;
    assert.equal(res.status, 400, method);
  }
  assert.equal(open.opened.length, 0);
  assert.equal(http.sessions.size, 0);
});

test('a missing or wrong bearer is 401 before the body is read; a foreign or null Origin is 403; requests without Origin pass', async t => {
  const {send, initialize} = setup(t, {allowedOrigins: ['https://allowed.example', 'null']});
  const unread = {[Symbol.asyncIterator]() { throw new Error('the body was read'); }};
  for (const auth of [undefined, `Bearer ${'c'.repeat(63)}`, `Bearer ${CREDENTIAL}x`, `Basic ${CREDENTIAL}`, CREDENTIAL]) {
    for (const method of ['POST', 'GET', 'DELETE', 'PUT']) {
      const {res, done} = send({method, auth: auth ?? '', read: unread, url: method === 'PUT' ? '/elsewhere' : '/mcp'});
      await done;
      assert.equal(res.status, 401, `${method} ${auth}`);
    }
  }
  for (const origin of ['https://evil.example', 'null']) {
    const {res, done} = send({body: INITIALIZE, headers: {origin}, read: unread});
    await done;
    assert.equal(res.status, 403, origin);
  }
  assert.ok(await initialize({origin: 'https://allowed.example'}));
});

test('protocol versions 2025-03-26 and 2025-06-18 (or none) are accepted and any other is 400; other paths 404, other methods 405', async t => {
  const {send, initialize} = setup(t, {maxSessions: 4});
  assert.ok(await initialize());
  assert.ok(await initialize({'mcp-protocol-version': '2025-03-26'}));
  const session = await initialize({'mcp-protocol-version': '2025-06-18'});
  for (const [request, status] of [
    [{body: INITIALIZE, headers: {'mcp-protocol-version': '2024-11-05'}}, 400],
    [{session, body: {jsonrpc: '2.0', method: 'notifications/initialized'}, headers: {'mcp-protocol-version': 'nonsense'}}, 400],
    [{url: '/other', body: INITIALIZE}, 404],
    [{url: '/mcp/extra', body: INITIALIZE}, 404],
    [{method: 'PUT', session, body: INITIALIZE}, 405],
  ]) {
    const {res, done} = send(request);
    await done;
    assert.equal(res.status, status, JSON.stringify(request));
  }
});

test('initialize with a session header is 400; an unknown session is 404; invalid JSON is 400 with a parse error and no session effect', async t => {
  const {http, send, initialize} = setup(t);
  const session = await initialize();
  let {res, done} = send({session, body: INITIALIZE});
  await done;
  assert.equal(res.status, 400);
  ({res, done} = send({session: 'no-such-session', body: call(1, 'js', {code: '1'})}));
  await done;
  assert.equal(res.status, 404);
  for (const method of ['GET', 'DELETE']) {
    ({res, done} = send({method, session: 'no-such-session'}));
    await done;
    assert.equal(res.status, 404, method);
  }
  for (const body of ['{"jsonrpc":', '']) {
    ({res, done} = send({session, body}));
    await done;
    assert.equal(res.status, 400);
    assert.deepEqual(res.json(), {jsonrpc: '2.0', id: null, error: {code: -32700, message: 'Parse error'}});
  }
  const broken = {async *[Symbol.asyncIterator]() { yield Buffer.from('{"jsonrpc"'); throw new Error('aborted'); }};
  ({res, done} = send({session, read: broken}));
  await done;
  assert.equal(res.status, 400, 'a body the client stopped sending');
  for (const body of ['[]', '[1]', '"text"', 'null']) {
    ({res, done} = send({session, body}));
    await done;
    assert.equal(res.status, 400, body);
    assert.equal(res.json().error.code, -32600, body);
  }
  assert.ok(http.sessions.has(session), 'the session is unaffected');
});

test('a POST of notifications or responses only is 202 with no body and reaches the connection', async t => {
  const {send, initialize, upstreamOf} = setup(t);
  const session = await initialize();
  const {res, done} = send({session, body: {jsonrpc: '2.0', method: 'notifications/initialized'}});
  await done;
  assert.equal(res.status, 202);
  assert.equal(res.body, '');
  assert.ok(res.ended);
  await upstreamOf(0).next(m => m.method === 'notifications/initialized');
});

test('a session that cannot open answers 500 with -32000 cua: <code> and leaves no session', async t => {
  const {http, open, send} = setup(t);
  open.failWith = 'runtime_not_installed';
  const {res, done} = send({body: INITIALIZE});
  await done;
  assert.equal(res.status, 500);
  assert.deepEqual(res.json(), {jsonrpc: '2.0', id: 0, error: {code: -32000, message: 'cua: runtime_not_installed'}});
  assert.equal(res.headers['mcp-session-id'], undefined);
  assert.equal(http.sessions.size, 0);
});

test('a request\'s response goes on the POST stream that carried it, with two concurrent POSTs answered out of order', async t => {
  const {send, initialize, upstreamOf} = setup(t);
  const session = await initialize();
  const upstream = upstreamOf(0);
  const a = send({session, body: call('a', 'js', {code: 'slow'})});
  const js = await upstream.nextCall('js');
  const b = send({session, body: {jsonrpc: '2.0', id: 'b', method: 'ping'}});
  const ping = await upstream.nextRequest('ping');
  upstream.reply(ping, {});
  await until(() => b.res.ended, 'stream b to end');
  assert.equal(b.res.status, 200);
  assert.equal(b.res.headers['content-type'], 'text/event-stream');
  assert.equal(b.res.headers['cache-control'], 'no-cache');
  assert.deepEqual(b.res.messages(), [{jsonrpc: '2.0', id: 'b', result: {}}]);
  assert.equal(a.res.ended, false);
  assert.equal(a.res.body, '');
  upstream.text(js, 'slow done');
  await until(() => a.res.ended, 'stream a to end');
  assert.deepEqual(a.res.messages().map(m => m.id), ['a']);
  const [ea] = a.res.events();
  const [eb] = b.res.events();
  assert.match(ea.id, /^\d+-1$/);
  assert.match(eb.id, /^\d+-1$/);
  assert.notEqual(ea.id, eb.id, 'each POST stream has its own id');
});

test('a batch is split into lines and its stream ends once every request in it is answered', async t => {
  const {send, initialize, upstreamOf} = setup(t);
  const session = await initialize();
  const upstream = upstreamOf(0);
  const batch = send({session, body: [{jsonrpc: '2.0', id: 1, method: 'ping'}, {jsonrpc: '2.0', method: 'notifications/initialized'}, {jsonrpc: '2.0', id: 2, method: 'ping'}]});
  const first = await upstream.nextRequest('ping');
  const second = await upstream.next(m => m.method === 'ping' && m.id !== first.id, {label: 'second ping'});
  upstream.reply(second, {});
  await until(() => batch.res.messages().length === 1, 'one response');
  assert.equal(batch.res.ended, false);
  upstream.reply(first, {});
  await until(() => batch.res.ended, 'batch stream to end');
  assert.deepEqual(batch.res.messages().map(m => m.id), [2, 1]);
  assert.deepEqual(batch.res.events().map(e => e.id.split('-')[1]), ['1', '2']);
});

test('a server-initiated request goes to the oldest open POST stream, else the GET stream, else a buffer drained into the next stream', async t => {
  const {send, initialize, upstreamOf} = setup(t);
  const session = await initialize();
  const upstream = upstreamOf(0);
  const older = send({session, body: call(1, 'js', {code: 'one'})});
  await upstream.nextCall('js');
  const newer = send({session, body: {jsonrpc: '2.0', id: 2, method: 'ping'}});
  await upstream.nextRequest('ping');
  const get = send({method: 'GET', session});
  await until(() => get.res.status === 200, 'GET stream');
  assert.equal(get.res.headers['content-type'], 'text/event-stream');

  const elicit = n => ({jsonrpc: '2.0', id: `e${n}`, method: 'elicitation/create', params: {message: `approve ${n}`, requestedSchema: {type: 'object', properties: {}}}});
  upstream.emit(elicit(1));
  await until(() => older.res.messages().length === 1, 'elicitation on the oldest POST stream');
  assert.equal(older.res.messages()[0].method, 'elicitation/create');
  assert.deepEqual([newer.res.body, get.res.body], ['', '']);

  older.abort();
  newer.abort();
  upstream.emit(elicit(2));
  await until(() => get.res.messages().length === 1, 'elicitation on the GET stream');
  assert.equal(get.res.messages()[0].id, 'e2');
  assert.equal(get.res.events()[0].id, undefined, 'GET stream events carry no id');

  get.abort();
  upstream.emit(elicit(3));
  upstream.emit({jsonrpc: '2.0', method: 'notifications/message', params: {level: 'info', data: 'log'}});
  await tick(10);
  const next = send({method: 'GET', session});
  await until(() => next.res.messages().length === 2, 'the buffer drained into the next stream');
  assert.deepEqual(next.res.messages().map(m => m.id ?? m.method), ['e3', 'notifications/message']);
});

test('the buffer of undeliverable server messages is capped: a session that would exceed it is closed', async t => {
  const {http, send, initialize, upstreamOf, diagnostics} = setup(t, {bufferLimit: 1024});
  const session = await initialize();
  const upstream = upstreamOf(0);
  upstream.emit({jsonrpc: '2.0', method: 'notifications/message', params: {data: 'x'.repeat(600)}});
  await tick(10);
  assert.ok(http.sessions.has(session), 'under the cap');
  upstream.emit({jsonrpc: '2.0', method: 'notifications/message', params: {data: 'y'.repeat(600)}});
  await until(() => !http.sessions.has(session), 'the session to close');
  assert.ok(diagnostics.some(line => /buffer/.test(line) && line.includes(session)), diagnostics.join('\n'));
  const {res, done} = send({session, body: {jsonrpc: '2.0', id: 1, method: 'ping'}});
  await done;
  assert.equal(res.status, 404);
});

test('a response whose POST stream dropped is kept and replayed on a GET naming that stream in Last-Event-ID', async t => {
  const {send, initialize, upstreamOf} = setup(t);
  const session = await initialize();
  const upstream = upstreamOf(0);
  const post = send({session, body: call(1, 'js', {code: 'long'})});
  const js = await upstream.nextCall('js');
  upstream.emit({jsonrpc: '2.0', method: 'notifications/progress', params: {progressToken: 1, progress: 1}});
  await until(() => post.res.events().length === 1, 'a first event');
  const [{id: lastEventId}] = post.res.events();
  post.abort();
  await tick(5);
  upstream.text(js, 'cell finished');
  await tick(10);
  assert.equal(post.res.events().length, 1, 'nothing more on the dropped stream');

  const resumed = send({method: 'GET', session, headers: {'last-event-id': lastEventId}});
  await until(() => resumed.res.ended, 'the replay to end');
  assert.equal(resumed.res.status, 200);
  const events = resumed.res.events();
  assert.equal(events.length, 1);
  assert.equal(events[0].message.id, 1);
  assert.match(events[0].message.result.content[0].text, /cell finished/);
  assert.equal(events[0].id, `${lastEventId.split('-')[0]}-2`, 'the stream\'s numbering continues');

  // Replayed once: the same Last-Event-ID now names no stream and opens the ordinary GET stream.
  const again = send({method: 'GET', session, headers: {'last-event-id': lastEventId}});
  await until(() => again.res.status === 200, 'a plain GET stream');
  assert.equal(again.res.ended, false);
  assert.equal(again.res.body, '');
});

test('a resumed stream that is still waiting stays open for the rest of its responses', async t => {
  const {send, initialize, upstreamOf} = setup(t);
  const session = await initialize();
  const upstream = upstreamOf(0);
  const post = send({session, body: [{jsonrpc: '2.0', id: 1, method: 'ping'}, {jsonrpc: '2.0', id: 2, method: 'ping'}]});
  const first = await upstream.nextRequest('ping');
  upstream.reply(first, {});
  await until(() => post.res.events().length === 1, 'the first response');
  const [{id: lastEventId}] = post.res.events();
  post.abort();
  await tick(5);
  const resumed = send({method: 'GET', session, headers: {'last-event-id': lastEventId}});
  await until(() => resumed.res.status === 200, 'the resumed stream');
  assert.equal(resumed.res.body, '', 'nothing after the last event id to replay yet');
  const second = await upstream.next(m => m.method === 'ping' && m.id !== first.id, {label: 'second ping'});
  upstream.reply(second, {});
  await until(() => resumed.res.ended, 'the resumed stream to end');
  assert.deepEqual(resumed.res.messages().map(m => m.id), [2]);
});

test('a second GET stream is 409 while one is open', async t => {
  const {send, initialize} = setup(t);
  const session = await initialize();
  const get = send({method: 'GET', session});
  await until(() => get.res.status === 200, 'GET stream');
  const second = send({method: 'GET', session});
  await second.done;
  assert.equal(second.res.status, 409);
  get.abort();
  await tick(5);
  const third = send({method: 'GET', session});
  await until(() => third.res.status === 200, 'a GET after the first went away');
});

test('notifications/cancelled for a request ends its stream, since the cancelled request is never answered', async t => {
  const {send, initialize, upstreamOf} = setup(t);
  const session = await initialize();
  const upstream = upstreamOf(0);
  const running = send({session, body: call(1, 'js', {code: 'first'})});
  await upstream.nextCall('js');
  const queued = send({session, body: call(2, 'js', {code: 'queued'})});
  await tick(10);
  const cancel = send({session, body: {jsonrpc: '2.0', method: 'notifications/cancelled', params: {requestId: 2}}});
  await cancel.done;
  assert.equal(cancel.res.status, 202);
  await until(() => queued.res.ended, 'the cancelled request\'s stream to end');
  assert.deepEqual(queued.res.messages(), []);
  assert.equal(running.res.ended, false);
});

test('DELETE ends the session: the id is 404 from then on, and the answer comes once the connection has closed', async t => {
  const {http, open, send, initialize} = setup(t);
  const session = await initialize();
  const get = send({method: 'GET', session});
  await until(() => get.res.status === 200, 'GET stream');
  let closedFirst = false;
  open.opened[0].closed.then(() => { closedFirst = true; });
  const del = send({method: 'DELETE', session});
  assert.equal(http.sessions.has(session), false, 'gone as soon as DELETE is accepted');
  const during = send({session, body: {jsonrpc: '2.0', id: 1, method: 'ping'}});
  await during.done;
  assert.equal(during.res.status, 404);
  await del.done;
  assert.equal(closedFirst, true, 'closed before DELETE answered');
  assert.equal(del.res.status, 200);
  assert.ok(get.res.ended, 'the session\'s streams end');
  const after = send({method: 'DELETE', session});
  await after.done;
  assert.equal(after.res.status, 404);
});

test('a connection that closes on its own ends its streams and leaves the session 404', async t => {
  const {http, send, initialize, upstreamOf} = setup(t);
  const session = await initialize();
  const post = send({session, body: call(1, 'js', {code: 'exit'})});
  await upstreamOf(0).nextCall('js');
  upstreamOf(0).exit({code: 3, signal: null});
  await until(() => post.res.ended, 'the stream to end');
  assert.equal(post.res.messages()[0].result.structuredContent.code, 'connection_failed', 'the failure answer is delivered first');
  await until(() => !http.sessions.has(session), 'the session to go');
  const {res, done} = send({session, body: {jsonrpc: '2.0', id: 2, method: 'ping'}});
  await done;
  assert.equal(res.status, 404);
});

test('an idle session closes; an open POST stream or a pending elicitation keeps it, and the quiet time restarts after them', async t => {
  const {http, send, initialize, upstreamOf} = setup(t, {idleMs: 60});
  const session = await initialize();
  const upstream = upstreamOf(0);
  const post = send({session, body: call(1, 'js', {code: 'long'})});
  const js = await upstream.nextCall('js');
  await tick(150);
  assert.ok(http.sessions.has(session), 'an open POST stream is not idle');

  upstream.emit({jsonrpc: '2.0', id: 'e1', method: 'elicitation/create', params: {message: 'approve', requestedSchema: {type: 'object', properties: {}}}});
  upstream.text(js, 'done');
  await until(() => post.res.ended, 'the js call to end');
  await tick(150);
  assert.ok(http.sessions.has(session), 'a pending elicitation is not idle');

  const answer = send({session, body: {jsonrpc: '2.0', id: 'e1', result: {action: 'accept', content: {}}}});
  await answer.done;
  assert.equal(answer.res.status, 202);
  await tick(20);
  assert.ok(http.sessions.has(session), 'the quiet time starts when the session stops being busy');
  await until(() => !http.sessions.has(session), 'the idle close', 1000);
});

test('a dropped POST stream whose request is still running keeps the session from idling', async t => {
  const {http, send, initialize, upstreamOf} = setup(t, {idleMs: 40});
  const session = await initialize();
  const post = send({session, body: call(1, 'js', {code: 'long'})});
  await upstreamOf(0).nextCall('js');
  post.abort();
  await tick(150);
  assert.ok(http.sessions.has(session));
});

test('at the cap an Idle session is evicted for a new initialize; a session with a running call or an open task is not, and the initialize is 503', async t => {
  const {http, send, initialize, upstreamOf, diagnostics} = setup(t);
  const first = await initialize();
  const second = await initialize();
  assert.ok(!http.sessions.has(first) && http.sessions.has(second), 'the idle first session was evicted');
  assert.ok(diagnostics.some(line => line.includes(first) && /evict/.test(line)), diagnostics.join('\n'));
  const gone = send({session: first, body: {jsonrpc: '2.0', id: 1, method: 'ping'}});
  await gone.done;
  assert.equal(gone.res.status, 404);

  const upstream = upstreamOf(1);
  const post = send({session: second, body: call(1, 'js', {code: 'long'})});
  const js = await upstream.nextCall('js');
  let refused = send({body: INITIALIZE});
  await refused.done;
  assert.equal(refused.res.status, 503);
  assert.deepEqual(refused.res.json(), {jsonrpc: '2.0', id: 0, error: {code: -32000, message: 'cua: session limit reached (1)'}});

  upstream.text(js, 'done');
  await until(() => post.res.ended, 'the call to end');
  refused = send({body: INITIALIZE});
  await refused.done;
  assert.equal(refused.res.status, 503, 'a task still open (no end_task yet) is not Idle');

  const end = send({session: second, body: call(2, 'end_task')});
  const turnEnded = await upstream.nextCall('turn_ended');
  upstream.text(turnEnded, '{}');
  await until(() => end.res.ended, 'end_task');
  assert.ok(await initialize(), 'once the task ended the session is Idle and evicted');
  assert.equal(http.sessions.has(second), false);
});

test('with a cap of 2 two sessions live side by side, and close(signal) closes both', async t => {
  const {http, open, initialize} = setup(t, {maxSessions: 2});
  const [a, b] = [await initialize(), await initialize()];
  assert.notEqual(a, b);
  assert.deepEqual([...http.sessions.keys()], [a, b]);
  await http.close('signal');
  assert.equal(http.sessions.size, 0);
  const results = await Promise.all(open.opened.map(c => c.closed));
  assert.deepEqual(results.map(r => r.reason), ['signal', 'signal']);
});

// Real connections: openConnection on a scratch home whose runtime is the fake upstream process.
test('over real connections, DELETE answers only after the session\'s run entries are released', {skip: !installedHomeSupported}, async t => {
  const home = fakeInstalledHome(t);
  const http = createMcpHttp({home, env: {...process.env, CUA_SHIM_SECRETS: 'off'}, clientCredential: CREDENTIAL, diagnostics: () => {}});
  t.after(() => http.close('eof'));
  const send = (method, session, body) => {
    const res = recorder();
    const done = http.handle({method, url: '/mcp', signal: new AbortController().signal,
      headers: {authorization: `Bearer ${CREDENTIAL}`, ...(session ? {'mcp-session-id': session} : {})},
      body: (async function* () { if (body) yield Buffer.from(JSON.stringify(body)); })()}, res);
    return {res, done};
  };
  const init = send('POST', null, INITIALIZE);
  await init.done;
  const session = init.res.headers['mcp-session-id'];
  assert.equal(init.res.json().result.serverInfo.name, 'fake-upstream');
  const list = send('POST', session, {jsonrpc: '2.0', id: 1, method: 'tools/list'});
  await until(() => list.res.ended, 'tools/list', 10_000);
  assert.deepEqual(list.res.messages()[0].result.tools.map(tool => tool.name), ['js', 'js_reset', 'end_task', 'secrets_list']);
  assert.ok(existsSync(join(home, 'run', session)) && existsSync(join(home, 'run', `${session}.pid`)));
  const del = send('DELETE', session);
  await del.done;
  assert.equal(del.res.status, 200);
  assert.deepEqual(readdirSync(join(home, 'run')), []);
});

test('over real connections, a home with nothing installed fails the open as cua: runtime_not_installed and claims nothing', async t => {
  const s = scratch();
  t.after(s.cleanup);
  const http = createMcpHttp({home: s.dir, env: {CUA_SHIM_SECRETS: 'off'}, clientCredential: CREDENTIAL, diagnostics: () => {}});
  const res = recorder();
  await http.handle({method: 'POST', url: '/mcp', signal: new AbortController().signal, headers: {authorization: `Bearer ${CREDENTIAL}`},
    body: (async function* () { yield Buffer.from(JSON.stringify(INITIALIZE)); })()}, res);
  assert.equal(res.status, 500);
  assert.equal(res.json().error.message, 'cua: runtime_not_installed');
  assert.equal(existsSync(join(s.dir, 'run')), false);
});
