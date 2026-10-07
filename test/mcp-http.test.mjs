// The MCP Streamable HTTP handler (src/mcp/http.mjs) over its abstract request and response, the shape the relay
// adapter (E3) drives as well as node:http. Most tests serve in-process connections (createServer over the in-memory
// fake upstream of mcp-harness.mjs) so the order of every reply is the test's; the last ones serve real connections
// (openConnection on a scratch home whose runtime is the fake upstream process) to prove what a session releases.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createMcpHttp} from '../src/mcp/http.mjs';
import {inProcessConnections as inProcess, tick} from './fixtures/mcp-harness.mjs';
import {fakeInstalledHome, installedHomeSupported} from './fixtures/installed-home.mjs';
import {scratch} from './fixtures/runtime-fixture.mjs';

const CREDENTIAL = 'c'.repeat(64);
const INITIALIZE = {jsonrpc: '2.0', id: 0, method: 'initialize', params: {protocolVersion: '2025-03-26', capabilities: {elicitation: {}}, clientInfo: {name: 'test', version: '0'}}};
const call = (id, name, args = {}) => ({jsonrpc: '2.0', id, method: 'tools/call', params: {name, arguments: args}});

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
    // Every SSE event in order; a priming event (named `priming`) has `message: null`.
    // Comment blocks (`: keepalive`) are not events and are left out.
    allEvents() {
      return res.body.split('\n\n').filter(block => block && !block.startsWith(':')).map(block => {
        const event = {};
        for (const line of block.split('\n')) {
          const at = line.indexOf(': ');
          event[line.slice(0, at)] = line.slice(at + 2);
        }
        return {id: event.id, retry: event.retry, event: event.event, message: event.event === 'priming' ? null : JSON.parse(event.data)};
      });
    },
    events: () => res.allEvents().filter(e => e.message !== null),
    primings: () => res.allEvents().filter(e => e.message === null).map(e => e.id),
    comments: () => res.body.split('\n\n').filter(block => block.startsWith(':')),
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

test('protocol versions 2025-03-26, 2025-06-18 and 2025-11-25 (or none) are accepted and an unknown one is 400; other paths 404, other methods 405', async t => {
  const {send, initialize} = setup(t, {maxSessions: 4});
  assert.ok(await initialize());
  assert.ok(await initialize({'mcp-protocol-version': '2025-03-26'}));
  assert.ok(await initialize({'mcp-protocol-version': '2025-11-25'}));
  const session = await initialize({'mcp-protocol-version': '2025-06-18'});
  for (const [request, status] of [
    [{body: INITIALIZE, headers: {'mcp-protocol-version': '2024-11-05'}}, 400],
    [{body: INITIALIZE, headers: {'mcp-protocol-version': '2026-01-01'}}, 400],
    [{session, body: {jsonrpc: '2.0', method: 'notifications/initialized'}, headers: {'mcp-protocol-version': '2026-01-01'}}, 400],
    [{method: 'GET', session, headers: {'mcp-protocol-version': '2026-01-01'}}, 400],
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

test('the version a session negotiated with its runtime is accepted on that session, and only there', async t => {
  const {open, send, initialize} = setup(t, {maxSessions: 4});
  open.negotiate = '2025-11-25';
  const current = await initialize();
  open.negotiate = '2026-01-01';
  const newer = await initialize();
  open.negotiate = undefined;
  const plain = await initialize();
  const notify = {jsonrpc: '2.0', method: 'notifications/initialized'};
  for (const [session, version, status] of [
    [current, '2025-11-25', 202],
    [newer, '2026-01-01', 202],
    [plain, '2025-11-25', 202],
    [plain, '2026-01-01', 400],
    [current, '2026-01-01', 400],
    [newer, '2027-01-01', 400],
  ]) {
    const {res, done} = send({session, body: notify, headers: {'mcp-protocol-version': version}});
    await done;
    assert.equal(res.status, status, `${version} on the session that negotiated ${session === newer ? '2026-01-01' : session === current ? '2025-11-25' : '2025-06-18'}`);
  }
  const get = send({method: 'GET', session: newer, headers: {'mcp-protocol-version': '2026-01-01'}});
  await until(() => get.res.status === 200, 'a GET with the negotiated version');
  const del = send({method: 'DELETE', session: newer, headers: {'mcp-protocol-version': '2026-01-01'}});
  await del.done;
  assert.equal(del.res.status, 200);
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
  assert.equal(b.res.headers['cache-control'], 'no-cache, no-transform', 'no proxy or CDN buffers or compresses the stream');
  assert.deepEqual(b.res.messages(), [{jsonrpc: '2.0', id: 'b', result: {}}]);
  assert.equal(a.res.ended, false);
  assert.deepEqual(a.res.events(), []);
  upstream.text(js, 'slow done');
  await until(() => a.res.ended, 'stream a to end');
  assert.deepEqual(a.res.messages().map(m => m.id), ['a']);
  for (const stream of [a, b]) {
    const [first, ...rest] = stream.res.allEvents();
    assert.equal(first.message, null, 'every POST stream opens with a priming event');
    assert.match(first.id, /^\d+-0$/);
    assert.equal(first.retry, '15000', 'carrying the reconnection delay');
    assert.ok(stream.res.body.startsWith(`retry: 15000\nid: ${first.id}\nevent: priming\ndata: {}\n\n`), stream.res.body);
    assert.equal(rest.length, 1);
    assert.equal(rest[0].id, first.id.replace(/-0$/, '-1'));
  }
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
  assert.deepEqual([newer.res.events(), get.res.body], [[], '']);

  older.abort();
  newer.abort();
  upstream.emit(elicit(2));
  await until(() => get.res.messages().length === 1, 'elicitation on the GET stream');
  assert.equal(get.res.messages()[0].id, 'e2');
  assert.equal(get.res.events()[0].id, undefined, 'GET stream events carry no id');
  assert.deepEqual(get.res.primings(), [], 'and the GET stream has no priming event');

  get.abort();
  upstream.emit(elicit(3));
  upstream.emit({jsonrpc: '2.0', method: 'notifications/message', params: {level: 'info', data: 'log'}});
  await tick(10);
  const next = send({method: 'GET', session});
  await until(() => next.res.messages().length === 2, 'the buffer drained into the next stream');
  assert.deepEqual(next.res.messages().map(m => m.id ?? m.method), ['e3', 'notifications/message']);
});

test('the agent log records each server request sent to the client and how it was answered, never its content', async t => {
  const {send, initialize, upstreamOf, diagnostics} = setup(t);
  const session = await initialize();
  const upstream = upstreamOf(0);
  const post = send({session, body: call(1, 'js', {code: 'one'})});
  await upstream.nextCall('js');
  const secretish = 'Allow Computer Use to use "Calculator"?';
  const elicit = (id, extra = {}) => ({jsonrpc: '2.0', id, method: 'elicitation/create', params: {message: secretish, requestedSchema: {type: 'object', properties: {}}}, ...extra});
  upstream.emit(elicit('e1'));
  await until(() => post.res.messages().length === 1, 'the elicitation on the POST stream');
  upstream.emit(elicit(7));
  upstream.emit({jsonrpc: '2.0', id: 'r1', method: 'roots/list'});
  await until(() => post.res.messages().length === 3, 'all three requests');
  const sent = diagnostics.filter(l => / sent to the client$/.test(l));
  assert.deepEqual(sent, [
    `session ${session}: elicitation/create "e1" sent to the client`,
    `session ${session}: elicitation/create 7 sent to the client`,
    `session ${session}: roots/list "r1" sent to the client`,
  ]);
  const answer = send({session, body: [
    {jsonrpc: '2.0', id: 'e1', result: {action: 'accept', content: {secret: 'hunter2'}}},
    {jsonrpc: '2.0', id: 7, result: {action: 'decline'}},
    {jsonrpc: '2.0', id: 'r1', error: {code: -32601, message: 'no roots here'}},
  ]});
  await answer.done;
  const answered = diagnostics.filter(l => / answered /.test(l));
  assert.equal(answered.length, 3, diagnostics.join('\n'));
  assert.match(answered[0], new RegExp(`^session ${session}: elicitation/create "e1" answered accept after \\d+ ms$`));
  assert.match(answered[1], new RegExp(`^session ${session}: elicitation/create 7 answered decline after \\d+ ms$`));
  assert.match(answered[2], new RegExp(`^session ${session}: roots/list "r1" answered error after \\d+ ms$`));
  // An answer to a request the session never sent is not logged; a strange action is not echoed.
  upstream.emit(elicit('e2'));
  await until(() => post.res.messages().length === 4, 'e2');
  const odd = send({session, body: [{jsonrpc: '2.0', id: 'e2', result: {action: 'sure, my password is x'}}, {jsonrpc: '2.0', id: 'nobody', result: {}}]});
  await odd.done;
  assert.match(diagnostics.at(-1), /elicitation\/create "e2" answered result after \d+ ms$/);
  assert.equal(diagnostics.filter(l => /nobody/.test(l)).length, 0);
  for (const line of diagnostics) assert.ok(!line.includes('Calculator') && !line.includes('hunter2') && !line.includes('password'), line);
});

test('a server request held in the buffer is logged as sent when it reaches a stream', async t => {
  const {send, initialize, upstreamOf, diagnostics} = setup(t);
  const session = await initialize();
  upstreamOf(0).emit({jsonrpc: '2.0', id: 'e1', method: 'elicitation/create', params: {message: 'm', requestedSchema: {type: 'object', properties: {}}}});
  await tick(10);
  assert.equal(diagnostics.some(l => / sent to the client$/.test(l)), false, 'buffered, not yet sent');
  const get = send({method: 'GET', session});
  await until(() => get.res.messages().length === 1, 'the drained elicitation');
  assert.ok(diagnostics.includes(`session ${session}: elicitation/create "e1" sent to the client`), diagnostics.join('\n'));
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
  const {send, initialize, upstreamOf} = setup(t, {streamGraceMs: 30});
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

  // Once the completed stream's grace has passed, the same Last-Event-ID names no stream and opens the ordinary GET stream.
  await tick(60);
  const again = send({method: 'GET', session, headers: {'last-event-id': lastEventId}});
  await until(() => again.res.status === 200, 'a plain GET stream');
  assert.equal(again.res.ended, false);
  assert.equal(again.res.body, '');
});

test('a stream that completed keeps its events for the grace period, so an answer sent into a dead link is replayed; then it is gone', async t => {
  const {send, initialize, upstreamOf} = setup(t, {streamGraceMs: 50});
  const session = await initialize();
  const upstream = upstreamOf(0);
  const post = send({session, body: call(1, 'js', {code: 'quick'})});
  const js = await upstream.nextCall('js');
  const [priming] = post.res.primings();
  upstream.text(js, 'answered into the void');
  await until(() => post.res.ended, 'the stream to complete');   // as far as the agent knows, delivered

  const resumed = send({method: 'GET', session, headers: {'last-event-id': priming}});
  await until(() => resumed.res.ended, 'the replay to end');
  assert.deepEqual(resumed.res.events().map(e => [e.id, e.message.id]), [[priming.replace(/-0$/, '-1'), 1]]);
  assert.match(resumed.res.events()[0].message.result.content[0].text, /answered into the void/);

  await tick(80);
  const late = send({method: 'GET', session, headers: {'last-event-id': priming}});
  await until(() => late.res.status === 200, 'a plain GET stream');
  assert.equal(late.res.ended, false, 'past the grace the id names no stream');
  assert.equal(late.res.body, '');
});

test('a request body over the limit is 413 and reaches no session', async t => {
  const {send, initialize, upstreamOf} = setup(t, {bodyLimit: 1000});
  const session = await initialize();
  const big = send({session, body: call(1, 'js', {code: 'x'.repeat(2000)})});
  await big.done;
  assert.equal(big.res.status, 413);
  assert.equal(big.res.json().error.code, -32000);
  await tick(10);
  assert.deepEqual(upstreamOf(0).calls('js'), []);
  const opening = send({body: {...INITIALIZE, params: {...INITIALIZE.params, pad: 'y'.repeat(2000)}}});
  await opening.done;
  assert.equal(opening.res.status, 413, 'initialize too');
});

// An SSE parser as WHATWG specifies dispatch (an event with an empty data buffer is never dispatched), reporting each
// event's type, data and the last event id it carried.
function parseSse(text) {
  const events = [];
  let data = '';
  let type = '';
  let lastEventId = '';
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (line === '') {
      if (data !== '') events.push({type: type || 'message', data: data.slice(0, -1), lastEventId});
      data = '';
      type = '';
      continue;
    }
    if (line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') type = value;
    else if (field === 'data') data += `${value}\n`;
    else if (field === 'id' && !value.includes('\0')) lastEventId = value;
  }
  return events;
}

// What an SSE-normalising proxy did to the stream (ngrok's edge, Surprises): every event re-serialised with its
// empty-valued fields dropped and its fields in another order; comments dropped.
const normalised = text => text.split('\n\n').filter(block => block && !block.startsWith(':'))
  .map(block => `${block.split('\n').filter(line => !/^[a-z]+: ?$/.test(line)).reverse().join('\n')}\n\n`).join('');

test('the priming event surfaces its id to an SSE client and is never taken for a message, also through a proxy that drops empty fields', async t => {
  const {send, initialize, upstreamOf} = setup(t);
  const session = await initialize();
  const upstream = upstreamOf(0);
  const post = send({session, body: call(1, 'js', {code: 'x'})});
  upstream.text(await upstream.nextCall('js'), 'done');
  await until(() => post.res.ended, 'the stream to end');
  for (const [label, text] of [['as sent', post.res.body], ['through the proxy', normalised(post.res.body)]]) {
    const events = parseSse(text);
    const priming = events.find(e => e.lastEventId.endsWith('-0'));
    assert.ok(priming, `${label}: the priming id reaches the client`);
    assert.notEqual(priming.type, 'message', `${label}: and the client does not parse it as a message`);
    // Claude Code's client parses only unnamed (`message`) events as JSON-RPC messages.
    const messages = events.filter(e => e.type === 'message').map(e => JSON.parse(e.data));
    assert.deepEqual(messages.map(m => m.id), [1], label);
  }
  // The form this replaced: through the proxy its id never reached the client.
  assert.equal(parseSse(normalised('retry: 15000\nid: 3-0\ndata: \n\n')).length, 0);
});

test('a js call whose stream dropped after only its priming event is replayed whole on Last-Event-ID <stream>-0', async t => {
  const {http, send, initialize, upstreamOf} = setup(t, {bufferLimit: 64});
  const session = await initialize();
  const upstream = upstreamOf(0);
  const post = send({session, body: call(1, 'js', {code: 'long'})});
  const js = await upstream.nextCall('js');
  const [priming] = post.res.primings();
  assert.match(priming, /^\d+-0$/);
  assert.deepEqual(post.res.events(), [], 'nothing but the priming event yet');
  post.abort();
  await tick(5);
  assert.ok(http.sessions.get(session).routes.size === 1, 'the call is still awaited');
  upstream.text(js, 'cell finished');
  await tick(10);

  const resumed = send({method: 'GET', session, headers: {'last-event-id': priming}});
  await until(() => resumed.res.ended, 'the replay to end');
  assert.deepEqual(resumed.res.primings(), [], 'a resume replays responses, not the priming event');
  const events = resumed.res.events();
  assert.deepEqual(events.map(e => e.id), [priming.replace(/-0$/, '-1')]);
  assert.equal(events[0].message.id, 1);
  assert.match(events[0].message.result.content[0].text, /cell finished/);
  assert.ok(http.sessions.has(session), 'priming events never count toward the 64-byte buffer');
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

test('a newer GET replaces the standing stream, which ends; the older one going away later leaves the newer in place', async t => {
  const {send, initialize, upstreamOf} = setup(t);
  const session = await initialize();
  const log = data => upstreamOf(0).emit({jsonrpc: '2.0', method: 'notifications/message', params: {level: 'info', data}});
  const get = send({method: 'GET', session});
  await until(() => get.res.status === 200, 'GET stream');
  const second = send({method: 'GET', session});
  await until(() => second.res.status === 200, 'the newer GET stream');
  assert.ok(get.res.ended, 'the older standing stream ended');
  log('one');
  await until(() => second.res.messages().length === 1, 'a server message on the newer stream');
  assert.deepEqual(get.res.messages(), []);
  get.abort();
  await tick(5);
  log('two');
  await until(() => second.res.messages().length === 2, 'the newer stream still standing');
  assert.equal(second.res.ended, false);
});

test('notifications/cancelled for a request withdrawn before dispatch ends its stream, since it is never answered', async t => {
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
  assert.equal(queued.res.primings().length, 1, 'only its priming event');
  assert.equal(running.res.ended, false);
});

test('notifications/cancelled for a request already dispatched keeps its stream, which the runtime\'s late answer ends', async t => {
  const {send, initialize, upstreamOf} = setup(t);
  const session = await initialize();
  const upstream = upstreamOf(0);
  const running = send({session, body: call(1, 'js', {code: 'running'})});
  const js = await upstream.nextCall('js');
  const cancel = send({session, body: {jsonrpc: '2.0', method: 'notifications/cancelled', params: {requestId: 1}}});
  await cancel.done;
  await upstream.next(m => m.method === 'notifications/cancelled', {label: 'the cancellation upstream'});
  await tick(10);
  assert.equal(running.res.ended, false, 'the dispatched request keeps its stream');
  upstream.text(js, 'interrupted');
  await until(() => running.res.ended, 'the late answer to end the stream');
  assert.deepEqual(running.res.messages().map(m => m.id), [1]);
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

test('an idle session closes; an open POST stream, or an elicitation pending while a call is unanswered, keeps it, and the quiet time restarts after them', async t => {
  const {http, send, initialize, upstreamOf} = setup(t, {idleMs: 60});
  const session = await initialize();
  const upstream = upstreamOf(0);
  const get = send({method: 'GET', session});
  await until(() => get.res.status === 200, 'GET stream');
  const post = send({session, body: call(1, 'js', {code: 'long'})});
  const js = await upstream.nextCall('js');
  await tick(150);
  assert.ok(http.sessions.has(session), 'an open POST stream is not idle');

  upstream.emit({jsonrpc: '2.0', id: 'e1', method: 'elicitation/create', params: {message: 'approve', requestedSchema: {type: 'object', properties: {}}}});
  await until(() => post.res.messages().length === 1, 'the elicitation on the js call\'s stream');
  post.abort();
  await tick(150);
  assert.ok(http.sessions.has(session), 'an elicitation pending while its call is unanswered is not idle while a stream of the session is open');

  const answer = send({session, body: {jsonrpc: '2.0', id: 'e1', result: {action: 'accept', content: {}}}});
  await answer.done;
  assert.equal(answer.res.status, 202);
  upstream.text(js, 'done');
  await tick(20);
  assert.ok(http.sessions.has(session), 'the quiet time starts when the session stops being busy');
  await until(() => !http.sessions.has(session), 'the idle close', 1000);
});

test('an elicitation pending once every call it could block is answered does not hold the session, even with the GET stream open', async t => {
  const {http, send, initialize, upstreamOf} = setup(t, {idleMs: 60});
  const session = await initialize();
  const upstream = upstreamOf(0);
  const get = send({method: 'GET', session});
  await until(() => get.res.status === 200, 'GET stream');
  const post = send({session, body: call(1, 'js', {code: 'asks'})});
  const js = await upstream.nextCall('js');
  upstream.emit({jsonrpc: '2.0', id: 'e1', method: 'elicitation/create', params: {message: 'approve', requestedSchema: {type: 'object', properties: {}}}});
  await until(() => post.res.messages().length === 1, 'the elicitation on the js call\'s stream');
  upstream.text(js, 'done without the approval');
  await until(() => post.res.ended, 'the js call to end');
  upstream.emit({jsonrpc: '2.0', id: 'e2', method: 'elicitation/create', params: {message: 'approve', requestedSchema: {type: 'object', properties: {}}}});
  await until(() => get.res.messages().length === 1, 'an elicitation outside any call, on the GET stream');
  await until(() => !http.sessions.has(session), 'the idle close although two elicitations are pending and the GET is open', 1000);
});

test('an elicitation pending behind a js call whose stream dropped, with no stream open, does not hold the session: the client vanished mid-approval', async t => {
  const {http, send, initialize, upstreamOf} = setup(t, {idleMs: 60});
  const session = await initialize();
  const upstream = upstreamOf(0);
  const post = send({session, body: call(1, 'js', {code: 'needs approval'})});
  await upstream.nextCall('js');
  upstream.emit({jsonrpc: '2.0', id: 'e1', method: 'elicitation/create', params: {message: 'approve', requestedSchema: {type: 'object', properties: {}}}});
  await until(() => post.res.messages().length === 1, 'the elicitation on the js call\'s stream');
  await tick(150);
  assert.ok(http.sessions.has(session), 'busy while the stream is open');
  post.abort();
  await until(() => !http.sessions.has(session), 'the idle close although the js call is unanswered', 1000);
});

test('silent SSE streams carry a keepalive comment, never an event, and stop when the stream ends', async t => {
  const {send, initialize, upstreamOf} = setup(t, {keepaliveMs: 25});
  const session = await initialize();
  const upstream = upstreamOf(0);
  const get = send({method: 'GET', session});
  const post = send({session, body: call(1, 'js', {code: 'long'})});
  const js = await upstream.nextCall('js');
  await until(() => post.res.comments().length >= 2 && get.res.comments().length >= 2, 'keepalive comments on both streams');
  assert.deepEqual(post.res.comments().slice(0, 2), [': keepalive', ': keepalive']);
  assert.deepEqual(post.res.events(), []);
  assert.equal(post.res.primings().length, 1);
  const [priming] = post.res.primings();
  post.abort();
  const written = post.res.body.length;
  upstream.text(js, 'done');
  await tick(80);
  assert.equal(post.res.body.length, written, 'nothing after the stream ended');
  const resumed = send({method: 'GET', session, headers: {'last-event-id': priming}});
  await until(() => resumed.res.ended, 'the replay');
  assert.deepEqual(resumed.res.comments(), [], 'comments are never replayed');
  assert.deepEqual(resumed.res.events().map(e => e.message.id), [1]);
  get.abort();
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

test('at the cap a session whose task is open but whose client left (no stream for abandonedMs, nothing unanswered) is evicted; one holding its GET or with a call unanswered is not', async t => {
  const {http, send, initialize, upstreamOf} = setup(t, {abandonedMs: 80});
  const first = await initialize();
  const upstream = upstreamOf(0);
  const get = send({method: 'GET', session: first});
  await until(() => get.res.status === 200, 'GET stream');
  const post = send({session: first, body: call(1, 'js', {code: 'one'})});
  upstream.text(await upstream.nextCall('js'), 'done');
  await until(() => post.res.ended, 'the js call to end');
  await tick(150);
  const refused = async why => {
    const r = send({body: INITIALIZE});
    await r.done;
    assert.equal(r.res.status, 503, why);
  };
  await refused('a session holding its standing GET is never evicted mid-task');

  get.abort();
  await refused('not before abandonedMs without a stream');
  const dropped = send({session: first, body: call(2, 'js', {code: 'two'})});
  const running = await upstream.next(m => m.method === 'tools/call' && m.params?.arguments?.code === 'two');
  dropped.abort();
  await tick(150);
  await refused('a call still unanswered keeps it, whatever its streams');

  upstream.text(running, 'done');
  await tick(10);
  const second = await initialize();
  assert.ok(second && !http.sessions.has(first), 'once answered, the session no stream has held for abandonedMs is evicted');
});

test('the client credential may be a function, read at each request: a rotation takes effect at once, and none refuses every bearer', async t => {
  let current = CREDENTIAL;
  const {send, initialize} = setup(t, {clientCredential: () => current});
  const session = await initialize();
  const ping = async (auth, id) => {
    const r = send({session, auth, body: {jsonrpc: '2.0', id, method: 'ping'}});
    await r.done;
    return r.res.status;
  };
  current = 'd'.repeat(64);
  assert.equal(await ping(`Bearer ${CREDENTIAL}`, 1), 401, 'the old credential no longer passes');
  assert.notEqual(await ping(`Bearer ${'d'.repeat(64)}`, 2), 401, 'the new one does');
  current = null;
  for (const auth of [`Bearer ${'d'.repeat(64)}`, 'Bearer null', 'Bearer ']) assert.equal(await ping(auth, 3), 401, auth);
});

test('endSessions ends every open session and its streams, and the handler goes on serving new ones', async t => {
  const {http, send, initialize} = setup(t, {maxSessions: 2});
  const sessions = [await initialize(), await initialize()];
  const get = send({method: 'GET', session: sessions[0]});
  await until(() => get.res.status === 200, 'GET stream');
  await http.endSessions('eof');
  assert.equal(http.sessions.size, 0);
  assert.ok(get.res.ended, 'the standing stream ended');
  const gone = send({session: sessions[1], body: {jsonrpc: '2.0', id: 1, method: 'ping'}});
  await gone.done;
  assert.equal(gone.res.status, 404);
  assert.ok(await initialize(), 'a new session opens');
});

test('a connection whose release fails is logged, not an unhandled rejection: DELETE still answers and the session is gone', async t => {
  const failing = async options => {
    const connection = await inProcess()(options);
    const closed = connection.closed.then(() => { throw Object.assign(new Error('rm failed'), {code: 'EACCES'}); });
    return {...connection, closed, close: reason => { connection.close(reason); return closed; }, get state() { return connection.state; }};
  };
  const {http, send, initialize, diagnostics} = setup(t, {open: failing});
  const session = await initialize();
  const del = send({method: 'DELETE', session});
  await del.done;
  assert.equal(del.res.status, 200);
  assert.equal(http.sessions.has(session), false);
  await tick(10);
  assert.ok(diagnostics.some(line => line.includes(session) && /rm failed/.test(line)), diagnostics.join('\n'));
  assert.ok(await initialize(), 'the agent serves the next session');
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

// The console refusal (E2): js and js_reset need the Mac's screen, which a locked or background session cannot drive.
const CONSOLE_LOCKED = {status: 'error', code: 'console_locked'};
const consoleAs = state => {
  const read = async () => { read.reads++; if (state instanceof Error) throw state; return state; };
  read.reads = 0;
  return read;
};

test('js and js_reset over HTTP are answered console_locked while the screen is locked or the session is off the console, and never reach the runtime', async t => {
  for (const state of [{onConsole: true, locked: true}, {onConsole: false, locked: false}]) {
    const read = consoleAs(state);
    const {send, initialize, upstreamOf, diagnostics} = setup(t, {console: read});
    const session = await initialize();
    const upstream = upstreamOf(0);
    for (const [id, name] of [[1, 'js'], [2, 'js_reset']]) {
      const {res} = send({session, body: call(id, name, name === 'js' ? {code: '1'} : {})});
      await until(() => res.ended, `${name} to be answered`);
      assert.equal(res.status, 200);
      const [reply] = res.messages();
      assert.equal(reply.id, id);
      assert.equal(reply.result.isError, true);
      assert.deepEqual(reply.result.structuredContent, CONSOLE_LOCKED);
      assert.match(reply.result.content[0].text, /^cua: the Mac's screen is locked or the session is not on the console; unlock it and retry/);
    }
    assert.equal(read.reads, 2, 'the console is read for each call');
    assert.deepEqual([...upstream.calls('js'), ...upstream.calls('js_reset')], []);
    assert.ok(diagnostics.some(line => line.includes(session) && /js refused: (the screen is locked|this user's session is not on the console)/.test(line)), diagnostics.join('\n'));
    // Everything else still reaches the runtime; tools/list is not a console action.
    const list = send({session, body: {jsonrpc: '2.0', id: 3, method: 'tools/list'}});
    upstream.reply(await upstream.nextRequest('tools/list'), {tools: []});
    await until(() => list.res.ended, 'tools/list');
    assert.equal(read.reads, 2, 'only js and js_reset read the console');
  }
});

test('in a batch only the console actions are refused; with the console unlocked, or unreadable, js goes through', async t => {
  const locked = consoleAs({onConsole: true, locked: true});
  const {send, initialize, upstreamOf} = setup(t, {console: locked, maxSessions: 3});
  let session = await initialize();
  let upstream = upstreamOf(0);
  const batch = send({session, body: [call(1, 'js', {code: '1'}), {jsonrpc: '2.0', id: 2, method: 'ping'}]});
  upstream.reply(await upstream.nextRequest('ping'), {});
  await until(() => batch.res.ended, 'the batch');
  assert.deepEqual(batch.res.messages().map(m => [m.id, m.result.structuredContent ?? m.result]).sort(), [[1, CONSOLE_LOCKED], [2, {}]]);
  assert.deepEqual(upstream.calls('js'), []);

  for (const [read, logged] of [
    [consoleAs({onConsole: true, locked: false}), null],
    [consoleAs(Object.assign(new Error('ioreg failed'), {code: 'console_unreadable'})), /the console state could not be read \(console_unreadable\); the call goes through/],
  ]) {
    const {send: post, initialize: open, upstreamOf: upstreamAt, diagnostics} = setup(t, {console: read});
    session = await open();
    upstream = upstreamAt(0);
    const js = post({session, body: call(1, 'js', {code: 'through'})});
    upstream.text(await upstream.nextCall('js'), 'ran');
    await until(() => js.res.ended, 'js');
    assert.equal(js.res.messages()[0].result.isError, false);
    assert.equal(read.reads, 1);
    if (logged) assert.match(diagnostics.join('\n'), logged);
  }
});

test('a message POSTed while a js call waits for the console check reaches the connection after that call', async t => {
  let release;
  const read = () => new Promise(resolve => { release = () => resolve({onConsole: true, locked: false}); });
  // What the connection reads, in order.
  const received = [];
  const base = inProcess();
  const open = async options => {
    options.input.on('data', chunk => received.push(...chunk.toString().split('\n').filter(Boolean).map(line => JSON.parse(line).method)));
    return base(options);
  };
  open.opened = base.opened;
  const {send, initialize} = setup(t, {console: read, open});
  const session = await initialize();
  send({session, body: call(1, 'js', {code: 'first'})});
  await until(() => release, 'the console check to start');
  const cancel = send({session, body: {jsonrpc: '2.0', method: 'notifications/cancelled', params: {requestId: 1}}});
  await cancel.done;
  assert.equal(cancel.res.status, 202, 'the notification is accepted at once');
  await tick(10);
  assert.deepEqual(received, ['initialize'], 'it waits behind the js call');
  release();
  await until(() => received.length === 3, 'both messages to reach the connection');
  assert.deepEqual(received, ['initialize', 'tools/call', 'notifications/cancelled']);
});

// The console header (Phase G): a request without a session header doubles as a client's probe of the device
// (src/remote/client.mjs probeDevice, a session-less POST of ping), so its 400 says whether js would be refused now.
test('the session-less 400 carries Cua-Console: locked while the console refuses js; unlocked or unreadable, it carries none', async t => {
  const PING = {jsonrpc: '2.0', id: 1, method: 'ping'};
  for (const [state, header] of [
    [{onConsole: true, locked: true}, 'locked'],
    [{onConsole: false, locked: false}, 'locked'],
    [{onConsole: true, locked: false}, undefined],
    [Object.assign(new Error('ioreg failed'), {code: 'console_unreadable'}), undefined],
  ]) {
    const read = consoleAs(state);
    const {http, open, send} = setup(t, {console: read});
    for (const request of [{body: PING}, {method: 'GET'}, {method: 'DELETE'}]) {
      const {res, done} = send(request);
      await done;
      assert.equal(res.status, 400, JSON.stringify(request));
      assert.equal(res.headers['cua-console'], header, `${JSON.stringify(state)} ${request.method ?? 'POST'}`);
      assert.equal(res.json().error.code, -32000);
    }
    assert.equal(read.reads, 3, 'the console is read for each session-less request');
    assert.equal(open.opened.length, 0);
    assert.equal(http.sessions.size, 0);
  }
});

test('an unauthorized probe learns nothing of the console, and requests on a session never carry the header', async t => {
  const read = consoleAs({onConsole: true, locked: true});
  const {send, initialize, upstreamOf} = setup(t, {console: read});
  const probe = send({body: {jsonrpc: '2.0', id: 1, method: 'ping'}, auth: `Bearer ${'d'.repeat(64)}`});
  await probe.done;
  assert.equal(probe.res.status, 401);
  assert.equal(probe.res.headers['cua-console'], undefined);
  assert.equal(read.reads, 0, 'the bearer is checked before the console is read');
  const session = await initialize();
  const ping = send({session, body: {jsonrpc: '2.0', id: 2, method: 'ping'}});
  upstreamOf(0).reply(await upstreamOf(0).nextRequest('ping'), {});
  await until(() => ping.res.ended, 'ping on the session');
  assert.equal(ping.res.status, 200);
  assert.equal(ping.res.headers['cua-console'], undefined);
  const unknown = send({session: 'no-such-session', body: {jsonrpc: '2.0', id: 3, method: 'ping'}});
  await unknown.done;
  assert.equal(unknown.res.status, 404);
  assert.equal(unknown.res.headers['cua-console'], undefined);
  assert.equal(read.reads, 0);
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
