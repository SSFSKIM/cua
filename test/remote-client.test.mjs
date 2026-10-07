// The device session client (src/remote/client.mjs) against the real Streamable HTTP handler (src/mcp/http.mjs) on an
// ephemeral loopback node:http server, its sessions served by in-process connections over the fake upstream of
// mcp-harness.mjs (no runtime, no network beyond loopback). A front in the test's hands can answer in the relay's or a
// TLS proxy's place, or cut a response, before a request reaches the handler.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer as createHttpServer} from 'node:http';
import {createMcpHttp} from '../src/mcp/http.mjs';
import {openDeviceSession, probeDevice, DeviceError} from '../src/remote/client.mjs';
import {inProcessConnections as inProcess, tick} from './fixtures/mcp-harness.mjs';

const CREDENTIAL = 'c'.repeat(64);
const INITIALIZE_PARAMS = {protocolVersion: '2025-11-25', capabilities: {elicitation: {}}, clientInfo: {name: 'claude-code', version: '2.1.292'}};
const FAST = {firstMs: 10, maxMs: 40, budgetMs: 400};
const call = (name, args = {}) => ['tools/call', {name, arguments: args}];

async function until(predicate, label = 'condition', ms = 3000) {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await tick(2);
  }
}

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, {'Content-Type': 'application/json', ...headers});
  res.end(JSON.stringify(body));
};
// What the relay answers for a device with no link, and what a TLS proxy answers with the relay down.
const deviceOffline = res => json(res, 503, {jsonrpc: '2.0', id: null, error: {code: -32000, message: 'cua-relay: device offline'}});
const badGateway = res => { res.writeHead(502, {'Content-Type': 'text/html'}); res.end('<html>502 Bad Gateway</html>'); };

// A device endpoint. `requests` records every request as it arrived (method, headers, parsed body, response);
// `front(entry)`, when set, may answer it instead of the handler by returning true.
async function device(t, options = {}) {
  const open = inProcess();
  const diagnostics = [];
  const http = createMcpHttp({home: '/nowhere', env: {}, clientCredential: CREDENTIAL, open, diagnostics: line => diagnostics.push(line), ...options});
  const requests = [];
  const ctx = {http, open, requests, diagnostics, front: null, upstreamOf: n => open.opened[n].upstream};
  const server = createHttpServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const entry = {method: req.method, headers: req.headers, message: body.length ? JSON.parse(body) : undefined, res};
    requests.push(entry);
    if (ctx.front?.(entry)) return;
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    http.handle({method: req.method, url: req.url, headers: req.headers, body: [body], signal: controller.signal}, {
      writeHead: (status, headers) => {
        res.writeHead(status, headers);
        if (headers?.['Content-Type'] === 'text/event-stream') res.flushHeaders();
      },
      write: chunk => res.write(chunk),
      end: chunk => res.end(chunk),
    });
  });
  await new Promise(resolve => server.listen({host: '127.0.0.1', port: 0}, resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await http.close('eof');
  });
  ctx.endpoint = `http://127.0.0.1:${server.address().port}/mcp`;
  ctx.posts = method => requests.filter(r => r.method === 'POST' && r.message?.method === method);
  ctx.gets = () => requests.filter(r => r.method === 'GET');
  // Opens a session on this device; closed after the test.
  ctx.session = async (extra = {}) => {
    const session = await openDeviceSession({endpoint: ctx.endpoint, credential: CREDENTIAL, initializeParams: INITIALIZE_PARAMS,
      backoff: FAST, diagnostics: line => diagnostics.push(line), ...extra});
    t.after(() => session.close());
    return session;
  };
  return ctx;
}

const rejectsWith = async (promise, code) => {
  const error = await promise.then(value => assert.fail(`expected ${code}, got ${JSON.stringify(value)}`), e => e);
  assert.ok(error instanceof DeviceError, `${error.stack}`);
  assert.equal(error.code, code, error.message);
  return error;
};

const credentialFree = d => {
  for (const line of d.diagnostics) assert.ok(!line.includes(CREDENTIAL), `a diagnostic carries the credential: ${line}`);
};

test('open sends the local client\'s own initialize params, then notifications/initialized, and holds the standing GET; every request carries the bearer, and later ones the session and the negotiated version', async t => {
  const d = await device(t);
  const session = await d.session();
  assert.equal(session.sessionId, [...d.http.sessions.keys()][0], 'the device\'s own session id');
  assert.equal(session.initializeResult.protocolVersion, '2025-06-18');
  assert.match(session.initializeResult.instructions, /Host notes/, 'the device\'s host notes');
  const upstream = d.upstreamOf(0);
  const init = await upstream.nextRequest('initialize');
  assert.deepEqual(init.params, INITIALIZE_PARAMS, 'the runtime sees the real client and its elicitation capability');
  await upstream.next(m => m.method === 'notifications/initialized', {label: 'notifications/initialized'});
  await until(() => d.gets().length === 1, 'the standing GET');
  assert.equal(d.http.sessions.get(session.sessionId).get !== null, true, 'the device holds it as the session\'s GET stream');

  const answer = session.request('ping', {});
  upstream.reply(await upstream.nextRequest('ping'), {});
  assert.deepEqual(await answer, {result: {}});

  const [first, ...later] = d.requests;
  assert.equal(first.message.method, 'initialize');
  assert.equal(first.headers['mcp-session-id'], undefined);
  assert.match(first.headers.accept, /application\/json/);
  assert.match(first.headers.accept, /text\/event-stream/);
  assert.ok(later.length >= 3);
  for (const r of d.requests) assert.equal(r.headers.authorization, `Bearer ${CREDENTIAL}`, `${r.method} ${r.message?.method}`);
  for (const r of later) {
    assert.equal(r.headers['mcp-session-id'], session.sessionId);
    assert.equal(r.headers['mcp-protocol-version'], '2025-06-18');
  }
  const ids = d.requests.filter(r => r.message?.id !== undefined).map(r => r.message.id);
  assert.equal(new Set(ids).size, ids.length, 'the client\'s own ids, never reused');
  credentialFree(d);
});

test('a request answered on an SSE stream resolves {result}; a JSON-RPC error resolves {error}; a JSON answer is read as well', async t => {
  const d = await device(t);
  const session = await d.session();
  const upstream = d.upstreamOf(0);
  const ran = session.request(...call('js', {code: '1 + 1', timeout_ms: 5000}));
  const js = await upstream.nextCall('js');
  assert.deepEqual(js.params.arguments, {code: '1 + 1', timeout_ms: 5000});
  upstream.text(js, '2');
  const {result} = await ran;
  assert.equal(result.content[0].text, '2');
  assert.equal(result.isError, false);

  const failed = session.request('tools/list', {});
  upstream.replyError(await upstream.nextRequest('tools/list'), {code: -32601, message: 'no'});
  assert.deepEqual(await failed, {error: {code: -32601, message: 'no'}});

  d.front = entry => {
    if (entry.message?.method !== 'resources/list') return false;
    json(entry.res, 200, {jsonrpc: '2.0', id: entry.message.id, result: {resources: []}});
    return true;
  };
  assert.deepEqual(await session.request('resources/list', {}), {result: {resources: []}});
});

test('a server request reaches onMessage with the device\'s id and is answered through respond; notifications pass unchanged', async t => {
  const d = await device(t);
  const messages = [];
  const session = await d.session({onMessage: msg => messages.push(msg)});
  const upstream = d.upstreamOf(0);
  const ran = session.request(...call('js', {code: 'approve me'}));
  const js = await upstream.nextCall('js');
  const elicit = {jsonrpc: '2.0', id: 'e1', method: 'elicitation/create', params: {message: 'Allow TextEdit?', requestedSchema: {type: 'object', properties: {}}}};
  upstream.emit(elicit);
  upstream.emit({jsonrpc: '2.0', method: 'notifications/message', params: {level: 'info', data: 'hello'}});
  await until(() => messages.length === 2, 'both messages');
  assert.deepEqual(messages, [elicit, {jsonrpc: '2.0', method: 'notifications/message', params: {level: 'info', data: 'hello'}}]);
  await session.respond('e1', {result: {action: 'accept', content: {}}});
  const answer = await upstream.next(m => m.id === 'e1' && m.method === undefined, {label: 'the answer upstream'});
  assert.equal(answer.result.action, 'accept');
  const posted = d.requests.find(r => r.message?.id === 'e1');
  assert.equal(posted.res.statusCode, 202);
  upstream.text(js, 'approved');
  assert.equal((await ran).result.content[0].text, 'approved');

  // A message that arrives with no request open reaches onMessage through the standing GET.
  upstream.emit({jsonrpc: '2.0', method: 'notifications/message', params: {level: 'info', data: 'idle'}});
  await until(() => messages.length === 3, 'a message on the standing GET');
  assert.equal(messages[2].params.data, 'idle');
});

test('notify posts a notification (202); a failed respond or notify rejects with its classified code', async t => {
  const d = await device(t);
  const session = await d.session();
  const upstream = d.upstreamOf(0);
  await session.notify('notifications/roots/list_changed', {});
  await upstream.next(m => m.method === 'notifications/roots/list_changed', {label: 'the notification upstream'});
  d.front = entry => entry.method === 'POST' && entry.message?.id === 'x' && (deviceOffline(entry.res), true);
  await rejectsWith(session.respond('x', {error: {code: -1, message: 'declined'}}), 'device_offline');
});

test('an aborted request becomes the device\'s notifications/cancelled with the client\'s id; a late answer still resolves it', async t => {
  const d = await device(t);
  const session = await d.session();
  const upstream = d.upstreamOf(0);
  const controller = new AbortController();
  const ran = session.request(...call('js', {code: 'long'}), {signal: controller.signal});
  const js = await upstream.nextCall('js');
  controller.abort('the user pressed escape');
  const cancelled = await until(() => d.posts('notifications/cancelled').length === 1, 'the cancellation').then(() => d.posts('notifications/cancelled')[0]);
  const [post] = d.posts('tools/call');
  assert.deepEqual(cancelled.message.params, {requestId: post.message.id, reason: 'the user pressed escape'});
  await upstream.next(m => m.method === 'notifications/cancelled', {label: 'the cancellation upstream'});
  upstream.text(js, 'stopped');
  assert.equal((await ran).result.content[0].text, 'stopped');
});

test('a cancelled request the device withdraws before dispatch, so never answers, rejects cancelled instead of resuming', async t => {
  const d = await device(t);
  const session = await d.session();
  const upstream = d.upstreamOf(0);
  const first = session.request(...call('js', {code: 'first'}));
  const js = await upstream.nextCall('js');
  const controller = new AbortController();
  const queued = session.request(...call('js', {code: 'queued'}), {signal: controller.signal});
  await until(() => d.posts('tools/call').length === 2, 'the queued call to reach the device');
  await tick(20);
  controller.abort();
  await rejectsWith(queued, 'cancelled');
  assert.equal(d.gets().filter(g => g.headers['last-event-id']).length, 0, 'no resumption for a cancelled request');
  upstream.text(js, 'done');
  assert.equal((await first).result.content[0].text, 'done');
});

test('a POST stream cut mid-request is resumed by GET with Last-Event-ID across 503 device offline and 502, and the answer replayed', async t => {
  const d = await device(t);
  const session = await d.session();
  const upstream = d.upstreamOf(0);
  const ran = session.request(...call('js', {code: 'long'}));
  const js = await upstream.nextCall('js');
  await tick(30);    // the priming event reaches the client
  const refusals = [deviceOffline, badGateway];
  d.front = entry => {
    if (entry.method !== 'GET' || !entry.headers['last-event-id'] || !refusals.length) return false;
    refusals.shift()(entry.res);
    return true;
  };
  d.posts('tools/call')[0].res.destroy();
  await until(() => d.gets().filter(g => g.headers['last-event-id']).length === 2, 'two refused resumes');
  upstream.text(js, 'finished while the client was away');
  const {result} = await ran;
  assert.equal(result.content[0].text, 'finished while the client was away');
  const resumes = d.gets().filter(g => g.headers['last-event-id']);
  assert.equal(resumes.length, 3);
  for (const r of resumes) assert.match(r.headers['last-event-id'], /^\d+-0$/, 'the priming event\'s id');
  assert.equal(d.posts('tools/call').length, 1, 'never resent');
  assert.equal(session.sessionId, [...d.http.sessions.keys()][0], 'the same session, no new initialize');
  assert.equal(d.posts('initialize').length, 1);
  credentialFree(d);
});

test('a resume names the last event seen: a server message delivered before the cut is not delivered twice', async t => {
  const d = await device(t);
  const messages = [];
  const session = await d.session({onMessage: msg => messages.push(msg)});
  const upstream = d.upstreamOf(0);
  const ran = session.request(...call('js', {code: 'long'}));
  const js = await upstream.nextCall('js');
  upstream.emit({jsonrpc: '2.0', method: 'notifications/progress', params: {progressToken: 1, progress: 1}});
  await until(() => messages.length === 1, 'the first event');
  d.posts('tools/call')[0].res.destroy();
  await until(() => d.gets().some(g => g.headers['last-event-id']), 'the resume');
  upstream.emit({jsonrpc: '2.0', method: 'notifications/progress', params: {progressToken: 1, progress: 2}});
  upstream.text(js, 'done');
  await ran;
  assert.deepEqual(messages.map(m => m.params.progress), [1, 2]);
  assert.match(d.gets().find(g => g.headers['last-event-id']).headers['last-event-id'], /^\d+-1$/);
});

test('a spent resume budget answers device_offline, the attempts spaced 1x doubling to the ceiling', async t => {
  const d = await device(t);
  const session = await d.session({backoff: {firstMs: 20, maxMs: 80, budgetMs: 400}});
  const upstream = d.upstreamOf(0);
  const ran = session.request(...call('js', {code: 'long'}));
  await upstream.nextCall('js');
  await tick(30);
  const at = [];
  d.front = entry => entry.method === 'GET' && entry.headers['last-event-id'] && (at.push(Date.now()), deviceOffline(entry.res), true);
  const cut = Date.now();
  d.posts('tools/call')[0].res.destroy();
  const error = await rejectsWith(ran, 'device_offline');
  const elapsed = Date.now() - cut;
  assert.ok(elapsed >= 380 && elapsed < 1500, `${elapsed} ms`);
  const gaps = at.slice(1).map((t0, i) => t0 - at[i]);
  assert.ok(gaps.length >= 4, `${gaps}`);
  assert.ok(gaps[0] >= 15, `first gap ${gaps}`);
  assert.ok(gaps[1] >= 35, `second gap ${gaps}`);
  assert.ok(gaps[2] >= 75, `third gap, at the ceiling ${gaps}`);
  assert.ok(gaps.slice(0, -1).every(g => g < 80 + 150), `capped: ${gaps}`);
  assert.doesNotMatch(error.message, new RegExp(CREDENTIAL));
});

test('a resume the device no longer knows (an ordinary standing GET, which never answers) is bounded by the budget, not retried forever', async t => {
  const d = await device(t);
  const session = await d.session();
  const upstream = d.upstreamOf(0);
  const ran = session.request(...call('js', {code: 'long'}));
  await upstream.nextCall('js');
  await tick(30);
  // Every resume names a stream the device has forgotten, so it opens the session's ordinary GET stream instead,
  // replacing the client's standing GET, whose reopening in turn ends it.
  d.front = entry => {
    if (entry.method === 'GET' && entry.headers['last-event-id']) entry.headers['last-event-id'] = '999-0';
    return false;
  };
  const cut = Date.now();
  d.posts('tools/call')[0].res.destroy();
  await rejectsWith(ran, 'device_offline');
  assert.ok(Date.now() - cut < 2000, `${Date.now() - cut} ms`);
  assert.ok(d.gets().filter(g => g.headers['last-event-id'] && g.res.statusCode === 200).length >= 2, 'the resumes were attached, and ended without an answer');
});

test('a POST that fails before any event id answers device_offline and is never resent: the socket cut, or a 502 from the proxy', async t => {
  const d = await device(t);
  const session = await d.session();
  d.front = entry => {
    if (entry.message?.method !== 'tools/call') return false;
    if (entry.message.params.arguments.code === 'cut') entry.res.destroy();
    else badGateway(entry.res);
    return true;
  };
  await rejectsWith(session.request(...call('js', {code: 'cut'})), 'device_offline');
  await rejectsWith(session.request(...call('js', {code: '502'})), 'device_offline');
  await tick(50);
  assert.equal(d.posts('tools/call').length, 2, 'each sent once');
  assert.equal(d.gets().filter(g => g.headers['last-event-id']).length, 0, 'no resumption without an event id');
  d.front = null;
  const upstream = d.upstreamOf(0);
  const ran = session.request('ping', {});
  upstream.reply(await upstream.nextRequest('ping'), {});
  assert.deepEqual(await ran, {result: {}}, 'the session is still usable');
});

test('the standing GET is reopened when it drops, and messages reach onMessage on the new one', async t => {
  const d = await device(t);
  const messages = [];
  const session = await d.session({onMessage: msg => messages.push(msg)});
  await until(() => d.gets().length === 1, 'the standing GET');
  d.front = entry => entry.method === 'GET' && d.gets().length === 2 && (badGateway(entry.res), true);
  d.gets()[0].res.destroy();
  await until(() => d.gets().length === 3, 'the GET reopened after a refused attempt');
  await until(() => d.http.sessions.get(session.sessionId).get !== null, 'the device to hold it');
  for (const g of d.gets()) assert.equal(g.headers['last-event-id'], undefined);
  d.upstreamOf(0).emit({jsonrpc: '2.0', method: 'notifications/message', params: {level: 'info', data: 'after'}});
  await until(() => messages.length === 1, 'a message on the reopened GET');
});

test('close sends DELETE, which ends the device session; closed settles closed; later requests reject device_session_ended and the GET is not reopened', async t => {
  const d = await device(t);
  const session = await d.session();
  await until(() => d.gets().length === 1, 'the standing GET');
  await session.close();
  const [del] = d.requests.filter(r => r.method === 'DELETE');
  assert.equal(del.headers['mcp-session-id'], session.sessionId);
  assert.equal(del.headers.authorization, `Bearer ${CREDENTIAL}`);
  assert.equal(d.http.sessions.size, 0);
  assert.deepEqual(await session.closed, {code: 'closed'});
  await session.close();
  assert.equal(d.requests.filter(r => r.method === 'DELETE').length, 1, 'close is idempotent');
  await rejectsWith(session.request('ping', {}), 'device_session_ended');
  await tick(60);
  assert.equal(d.gets().length, 1);
});

test('close also rejects a request still in flight, and a DELETE that fails or hangs is logged, never thrown, and bounded at 2 s', async t => {
  const d = await device(t);
  const session = await d.session();
  const ran = session.request(...call('js', {code: 'long'}));
  await d.upstreamOf(0).nextCall('js');
  const rejected = rejectsWith(ran, 'device_session_ended');
  d.front = entry => entry.method === 'DELETE';    // never answered
  const started = Date.now();
  await session.close();
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 1900 && elapsed < 3000, `${elapsed} ms`);
  await rejected;
  assert.ok(d.diagnostics.some(line => /DELETE/.test(line)), d.diagnostics.join('\n'));

  const other = await device(t);
  const second = await other.session();
  other.front = entry => entry.method === 'DELETE' && (badGateway(entry.res), true);
  await second.close();
  assert.ok(other.diagnostics.some(line => /DELETE.*502/.test(line)), other.diagnostics.join('\n'));
  credentialFree(d);
  credentialFree(other);
});

test('a session the device ended answers device_session_ended, and closed settles with it', async t => {
  const d = await device(t);
  // The standing GET, which the device's end also ends, is reopened (and finds the session gone) only after the call.
  const session = await d.session({backoff: {firstMs: 2000, maxMs: 2000, budgetMs: 400}});
  await until(() => d.http.sessions.get(session.sessionId)?.get, 'the standing GET');
  await d.http.endSessions('eof');
  await rejectsWith(session.request(...call('js', {code: '1'})), 'device_session_ended');
  assert.deepEqual(await session.closed, {code: 'device_session_ended'});
  assert.equal(d.posts('tools/call').length, 1);
});

test('a session ended by the device while a request was out: the resume is 404 and the request rejects device_session_ended', async t => {
  const d = await device(t);
  const session = await d.session();
  const ran = session.request(...call('js', {code: 'long'}));
  await d.upstreamOf(0).nextCall('js');
  await tick(30);
  // The stream drops; while the client is away the device ends the session, so the resume finds it gone.
  let away = true;
  d.front = entry => entry.method === 'GET' && entry.headers['last-event-id'] && away && (deviceOffline(entry.res), true);
  d.posts('tools/call')[0].res.destroy();
  await until(() => d.gets().some(g => g.headers['last-event-id']), 'a refused resume');
  await d.http.endSessions('eof');
  away = false;
  await rejectsWith(ran, 'device_session_ended');
  assert.deepEqual(await session.closed, {code: 'device_session_ended'});
});

test('open classifies its refusals: 401, relay 503 device offline, 502, session limit, an open the device failed, the relay unreachable, an unreadable answer', async t => {
  const d = await device(t);
  const open = extra => openDeviceSession({endpoint: d.endpoint, credential: CREDENTIAL, initializeParams: INITIALIZE_PARAMS, backoff: FAST, ...extra});
  await rejectsWith(open({credential: 'd'.repeat(64)}), 'device_unauthorized');
  d.front = entry => (deviceOffline(entry.res), true);
  await rejectsWith(open(), 'device_offline');
  d.front = entry => (badGateway(entry.res), true);
  await rejectsWith(open(), 'device_offline');
  d.front = entry => (entry.res.writeHead(200, {'Content-Type': 'text/html'}), entry.res.end('<html>'), true);
  await rejectsWith(open(), 'device_protocol');
  d.front = null;
  d.open.failWith = 'runtime_not_installed';
  const failed = await rejectsWith(open(), 'device_failed');
  assert.match(failed.message, /runtime_not_installed/);
  d.open.failWith = undefined;

  // At the device's cap of 1 a session with a call running is not Idle, so a second open is refused.
  const busy = await d.session();
  busy.request(...call('js', {code: 'long'})).catch(() => {});
  await d.upstreamOf(d.open.opened.length - 1).nextCall('js');
  await rejectsWith(open(), 'session_limit');

  const closed = createHttpServer();
  await new Promise(resolve => closed.listen({host: '127.0.0.1', port: 0}, resolve));
  const {port} = closed.address();
  await new Promise(resolve => closed.close(resolve));
  await rejectsWith(open({endpoint: `http://127.0.0.1:${port}/mcp`}), 'device_offline');
  credentialFree(d);
});

test('a request refused 401 rejects device_unauthorized; a device answer the client cannot read rejects device_protocol', async t => {
  const d = await device(t);
  const session = await d.session();
  d.front = entry => entry.message?.method === 'tools/list' && (json(entry.res, 401, {jsonrpc: '2.0', id: null, error: {code: -32000, message: 'cua-relay: unauthorized'}}), true);
  await rejectsWith(session.request('tools/list', {}), 'device_unauthorized');
  d.front = entry => entry.message?.method === 'tools/list' && (entry.res.writeHead(200, {'Content-Type': 'text/plain'}), entry.res.end('hm'), true);
  await rejectsWith(session.request('tools/list', {}), 'device_protocol');
});

test('probeDevice: online on the device\'s session-less 400, locked with Cua-Console, unauthorized, offline with its code; it never opens a session', async t => {
  let consoleState = {onConsole: true, locked: false};
  const d = await device(t, {console: () => consoleState});
  const probe = extra => probeDevice({endpoint: d.endpoint, credential: CREDENTIAL, ...extra});
  assert.deepEqual(await probe(), {status: 'online'});
  const [sent] = d.requests;
  assert.equal(sent.method, 'POST');
  assert.equal(sent.message.method, 'ping');
  assert.equal(sent.headers['mcp-session-id'], undefined);
  assert.equal(sent.headers.authorization, `Bearer ${CREDENTIAL}`);
  consoleState = {onConsole: true, locked: true};
  assert.deepEqual(await probe(), {status: 'locked'});
  consoleState = {onConsole: false, locked: false};
  assert.deepEqual(await probe(), {status: 'locked'});
  assert.deepEqual(await probe({credential: 'd'.repeat(64)}), {status: 'unauthorized'});
  d.front = entry => (deviceOffline(entry.res), true);
  assert.deepEqual(await probe(), {status: 'offline'});
  d.front = entry => (badGateway(entry.res), true);
  assert.deepEqual(await probe(), {status: 'offline', code: 'relay_unreachable'});
  d.front = () => true;    // never answered
  const started = Date.now();
  assert.deepEqual(await probe({timeoutMs: 100}), {status: 'offline', code: 'timeout'});
  assert.ok(Date.now() - started < 1000);
  assert.equal(d.open.opened.length, 0, 'no session was opened');
  assert.equal(d.http.sessions.size, 0);

  const closed = createHttpServer();
  await new Promise(resolve => closed.listen({host: '127.0.0.1', port: 0}, resolve));
  const {port} = closed.address();
  await new Promise(resolve => closed.close(resolve));
  assert.deepEqual(await probe({endpoint: `http://127.0.0.1:${port}/mcp`}), {status: 'offline', code: 'relay_unreachable'});
});
