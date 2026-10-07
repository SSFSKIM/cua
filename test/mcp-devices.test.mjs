// Phase G: the target in the stdio server. A stdio connection (createServer over the harness's fake local upstream)
// with a device directory (src/remote/directory.mjs) built from a temporary $HOME's registry and secret store, reaching
// devices served by the real Streamable HTTP handler (src/mcp/http.mjs) on ephemeral loopback ports, whose sessions are
// in-process connections over fake upstreams (mcp-harness.mjs inProcessConnections). A front in front of each device
// rewrites /d/<id>/mcp to /mcp as the relay does, and may answer or cut a request first.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createServer as createHttpServer} from 'node:http';
import {createMcpHttp} from '../src/mcp/http.mjs';
import {openDeviceSession} from '../src/remote/client.mjs';
import {addDevice} from '../src/remote/devices.mjs';
import {clientSecretKey} from '../src/remote/device.mjs';
import {deviceDirectory} from '../src/remote/directory.mjs';
import {fileStore, storeDir} from '../src/secrets/store.mjs';
import {harness, initialized, inProcessConnections, structured, textOf, tick, UPSTREAM_TOOLS} from './fixtures/mcp-harness.mjs';
import {scratch} from './fixtures/runtime-fixture.mjs';

const CLIENT_INIT = {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'test-client', version: '0'}};

async function until(predicate, label = 'condition', ms = 3000) {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await tick(2);
  }
}

// A temporary $HOME holding the registry and the store.
function userHome(t) {
  const s = scratch();
  t.after(s.cleanup);
  const env = {HOME: s.dir};
  return {env, store: fileStore({dir: storeDir(env)})};
}

// A device: its own credential, the real handler behind a relay-like front on an ephemeral port.
async function device(t, options = {}) {
  const credential = randomBytes(32).toString('hex');
  const deviceId = randomBytes(16).toString('base64url');
  const open = inProcessConnections();
  const diagnostics = [];
  const http = createMcpHttp({home: '/nowhere', env: {}, clientCredential: credential, open, diagnostics: line => diagnostics.push(line), ...options});
  const requests = [];
  const d = {credential, deviceId, http, open, requests, diagnostics, front: null, upstreamOf: n => open.opened[n].upstream};
  const server = createHttpServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const entry = {method: req.method, url: req.url, headers: req.headers, message: body.length ? JSON.parse(body) : undefined, res, body};
    requests.push(entry);
    if (d.front?.(entry)) return;
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    const url = req.url === `/d/${deviceId}/mcp` ? '/mcp' : req.url;
    http.handle({method: req.method, url, headers: req.headers, body: [body], signal: controller.signal}, {
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
  d.relayUrl = `http://127.0.0.1:${server.address().port}`;
  d.posts = method => requests.filter(r => r.method === 'POST' && r.message?.method === method);
  d.deletes = () => requests.filter(r => r.method === 'DELETE');
  return d;
}

// Registers `d` as `name` in the home's registry, its credential stored unless `credential` says otherwise.
async function register(home, name, d, {credential = d.credential} = {}) {
  addDevice({env: home.env, name, relayUrl: d.relayUrl, deviceId: d.deviceId});
  if (credential) await home.store.write(clientSecretKey(d.deviceId), credential);
}

// A local stdio connection with the device tools, initialized.
async function local(t, home, server = {}) {
  const h = harness({server: {devices: deviceDirectory({env: home.env}), surfaces: ['computer', 'browser'], profiles: {list: () => []}, ...server}});
  t.after(async () => {
    h.client.eof();
    await h.server.closed;
  });
  await initialized(h);
  return h;
}

const use = async (h, name) => (await h.client.call('devices_use', {device: name}).response);
// A devices_use answer's fields, less its note and the device's host notes (asserted where they are the subject).
const switchFields = response => { const {note, hostNotes, ...fields} = structured(response); return fields; };
const code = response => structured(response)?.code;

const credentialFree = (h, ...devices) => {
  const seen = JSON.stringify(h.client.frames) + h.client.diagnostics.join('\n');
  for (const d of devices) assert.ok(!seen.includes(d.credential), 'a frame or a diagnostic carries a device credential');
};

test('a connection with a device directory lists devices_list and devices_use after its own tools; without one, neither exists', async t => {
  const home = userHome(t);
  const h = await local(t, home);
  const list = h.client.request('tools/list', {});
  h.upstream.reply(await h.upstream.nextRequest('tools/list'), {tools: UPSTREAM_TOOLS});
  const tools = (await list.response).result.tools;
  assert.deepEqual(tools.map(tool => tool.name), ['js', 'js_reset', 'end_task', 'secrets_list', 'profiles_list', 'devices_list', 'devices_use']);
  assert.deepEqual(tools.find(tool => tool.name === 'devices_use').inputSchema.required, ['device']);

  const plain = harness();
  await initialized(plain);
  const plainList = plain.client.request('tools/list', {});
  plain.upstream.reply(await plain.upstream.nextRequest('tools/list'), {tools: UPSTREAM_TOOLS});
  assert.deepEqual((await plainList.response).result.tools.map(tool => tool.name), ['js', 'js_reset', 'end_task', 'secrets_list']);
  assert.equal((await plain.client.call('devices_list').response).error.code, -32602, 'an unknown tool there');
});

test('devices_list: local first and current; each device probed online, locked, unauthorized, credential_missing or offline, with no session opened', async t => {
  const home = userHome(t);
  const mini = await device(t);
  const locked = await device(t, {console: () => ({onConsole: true, locked: true})});
  const wrong = await device(t);
  const bare = await device(t);
  const gone = await device(t);
  await register(home, 'mini', mini);
  await register(home, 'locked', locked);
  await register(home, 'wrong', wrong, {credential: 'f'.repeat(64)});
  await register(home, 'bare', bare, {credential: null});
  addDevice({env: home.env, name: 'gone', relayUrl: 'http://127.0.0.1:1', deviceId: gone.deviceId});
  await home.store.write(clientSecretKey(gone.deviceId), gone.credential);
  const h = await local(t, home);

  const response = await h.client.call('devices_list').response;
  assert.equal(response.result.isError, false);
  assert.deepEqual(structured(response), {status: 'ok', current: 'local', devices: [
    {name: 'local', status: 'online'},
    {name: 'bare', deviceId: bare.deviceId, relay: bare.relayUrl, status: 'unauthorized', code: 'credential_missing'},
    {name: 'gone', deviceId: gone.deviceId, relay: 'http://127.0.0.1:1', status: 'offline', code: 'relay_unreachable'},
    {name: 'locked', deviceId: locked.deviceId, relay: locked.relayUrl, status: 'locked'},
    {name: 'mini', deviceId: mini.deviceId, relay: mini.relayUrl, status: 'online'},
    {name: 'wrong', deviceId: wrong.deviceId, relay: wrong.relayUrl, status: 'unauthorized'},
  ]});
  for (const d of [mini, locked, wrong, bare]) {
    assert.equal(d.posts('initialize').length, 0, 'a probe never opens a session');
    assert.equal(d.http.sessions.size, 0);
  }
  credentialFree(h, mini, locked, wrong, gone);
});

test('devices_use opens a session with the local client\'s own initialize params and answers with the device\'s notes; every tool then routes there, tagged with the device', async t => {
  const home = userHome(t);
  const mini = await device(t);
  await register(home, 'mini', mini);
  const h = await local(t, home);

  const switched = await use(h, 'mini');
  assert.equal(switched.result.isError, false);
  const {note, hostNotes, ...fields} = structured(switched);
  assert.deepEqual(fields, {status: 'ok', device: 'mini', previous: 'local'});
  assert.match(textOf(switched), /every tool .* now drives mini/);
  assert.match(textOf(switched), /Upstream\.\n\nHost notes:/, 'the device\'s own instructions, its host notes included');
  // Claude Code shows a client only the structured content of a result that has one (its text is dropped), so the
  // notes are in both, once each.
  assert.match(note, /every tool .* now drives mini/);
  assert.match(hostNotes, /^Upstream\.\n\nHost notes:/);
  assert.equal(textOf(switched).split('Host notes:').length, 2, 'the text carries the notes once');
  const deviceUp = mini.upstreamOf(0);
  assert.deepEqual((await deviceUp.nextRequest('initialize')).params, CLIENT_INIT, 'the device\'s runtime sees the real client');
  assert.deepEqual(structured(await h.client.call('devices_list').response).current, 'mini');

  const ran = h.client.call('js', {code: 'hostname()', timeout_ms: 5000}, {meta: {progressToken: 'p1'}});
  const js = await deviceUp.nextCall('js');
  assert.deepEqual(js.params.arguments, {code: 'hostname()', timeout_ms: 5000}, 'the client\'s own params');
  assert.equal(js.params._meta.progressToken, 'p1', 'the client\'s _meta reaches the device');
  deviceUp.text(js, 'mini.local');
  const result = (await ran.response).result;
  assert.equal(result.content[0].text, 'mini.local');
  assert.equal(result._meta['cua/device'], 'mini');
  assert.equal(typeof result._meta['cua/taskId'], 'string', 'the device\'s own task id passes through');
  assert.equal(result._meta['cua/deviceSession'], undefined, 'the session devices_use opened is not new to the model');

  const reset = h.client.call('js_reset');
  deviceUp.reply(await deviceUp.nextCall('js_reset'), {content: [{type: 'text', text: 'reset'}], isError: false});
  assert.equal((await reset.response).result._meta['cua/device'], 'mini');

  const secrets = await h.client.call('secrets_list').response;
  assert.equal(secrets.result._meta['cua/device'], 'mini');
  assert.equal(structured(secrets).code, 'secrets_not_configured', 'the device\'s own answer');

  // A JSON-RPC error from the device is relayed as an error (this device has no browser surface).
  const profiles = await h.client.call('profiles_list').response;
  assert.equal(profiles.error.code, -32602);
  assert.match(profiles.error.message, /profiles_list/);

  assert.equal(h.upstream.calls('js').length + h.upstream.calls('js_reset').length, 0, 'the local runtime saw none of it');
  credentialFree(h, mini);
});

test('devices_use is refused task_open while a task is open, local or remote; end_task on the device ends its session; naming the current target is a no-op', async t => {
  const home = userHome(t);
  const mini = await device(t);
  await register(home, 'mini', mini);
  const h = await local(t, home);

  assert.deepEqual(structured(await use(h, 'local')), {status: 'ok', device: 'local', previous: 'local'});
  const localJs = h.client.call('js', {code: '1'});
  h.upstream.text(await h.upstream.nextCall('js'), 'local');
  await localJs.response;
  const refusedLocal = await use(h, 'mini');
  assert.equal(refusedLocal.result.isError, true);
  assert.equal(code(refusedLocal), 'task_open');
  assert.equal(mini.posts('initialize').length, 0, 'nothing was opened');
  const endLocal = h.client.call('end_task');
  h.upstream.reply(await h.upstream.nextCall('turn_ended'), {content: [], isError: false});
  assert.equal(structured(await endLocal.response).status, 'ended');

  assert.equal(structured(await use(h, 'mini')).status, 'ok');
  const deviceUp = mini.upstreamOf(0);
  const ran = h.client.call('js', {code: '2'});
  deviceUp.text(await deviceUp.nextCall('js'), 'remote');
  await ran.response;
  const refusedRemote = await use(h, 'local');
  assert.equal(code(refusedRemote), 'task_open');
  assert.match(textOf(refusedRemote), /end_task/);
  assert.equal(structured(await h.client.call('devices_list').response).current, 'mini', 'the target is unchanged');

  const ended = h.client.call('end_task');
  deviceUp.reply(await deviceUp.nextCall('turn_ended'), {content: [], isError: false});
  const endResult = (await ended.response).result;
  assert.equal(endResult.structuredContent.status, 'ended');
  assert.equal(endResult._meta['cua/device'], 'mini');
  assert.equal(mini.deletes().length, 1, 'end_task ended the device session');
  assert.equal(mini.http.sessions.size, 0, 'and the device released it before end_task answered');

  const returned = structured(await use(h, 'local'));
  assert.deepEqual({...returned, note: undefined}, {status: 'ok', device: 'local', previous: 'mini', note: undefined});
  assert.match(returned.note, /drives this machine \(local\) again/, 'said where the model reads it');
  const after = h.upstream.sent.length;
  const back = h.client.call('js', {code: 'hostname()'});
  h.upstream.text(await h.upstream.nextCall('js', {after}), 'macbook.local');
  const backResult = (await back.response).result;
  assert.equal(backResult.content[0].text, 'macbook.local');
  assert.equal(backResult._meta['cua/device'], undefined, 'a local result is not tagged');
});

test('the first call after end_task opens a new device session lazily and says its REPL state is fresh; end_task with no session answers noop without opening one', async t => {
  const home = userHome(t);
  const mini = await device(t);
  await register(home, 'mini', mini);
  const h = await local(t, home);
  await use(h, 'mini');
  const first = h.client.call('js', {code: '1'});
  mini.upstreamOf(0).text(await mini.upstreamOf(0).nextCall('js'), 'one');
  await first.response;
  const ended = h.client.call('end_task');
  mini.upstreamOf(0).reply(await mini.upstreamOf(0).nextCall('turn_ended'), {content: [], isError: false});
  await ended.response;

  const noop = await h.client.call('end_task').response;
  assert.equal(structured(noop).status, 'noop');
  assert.equal(noop.result._meta['cua/device'], 'mini');
  assert.equal(mini.posts('initialize').length, 1, 'no session was opened to say noop');

  const again = h.client.call('js', {code: '2'});
  await until(() => mini.open.opened.length === 2, 'a second device session');
  mini.upstreamOf(1).text(await mini.upstreamOf(1).nextCall('js'), 'two');
  const result = (await again.response).result;
  assert.equal(result._meta['cua/deviceSession'], 'new');
  assert.match(result.content[0].text, /new session on mini.*REPL state is fresh/);
  assert.equal(result.content.at(-1).text, 'two', 'the device\'s own content follows');
  assert.equal(mini.posts('initialize').length, 2);
});

test('a session the device ended with no task open is re-opened once and the call retried; with a task open the call answers device_session_ended', async t => {
  const home = userHome(t);
  const mini = await device(t);
  await register(home, 'mini', mini);
  const h = await local(t, home);
  await use(h, 'mini');
  // Evicted, being Idle, by another client at the device's cap; the client has not noticed (its standing stream's
  // reopening is held), so the call's own POST is what the device refuses with 404.
  mini.front = entry => entry.method === 'GET';
  await mini.http.endSessions('eof');
  const retried = h.client.call('js', {code: 'after eviction'});
  await until(() => mini.open.opened.length === 2, 'the re-opened session');
  mini.front = null;
  const js = await mini.upstreamOf(1).nextCall('js');
  assert.equal(js.params.arguments.code, 'after eviction');
  mini.upstreamOf(1).text(js, 'ran once');
  const result = (await retried.response).result;
  assert.equal(result._meta['cua/deviceSession'], 'new');
  assert.match(textOf({result}), /REPL state is fresh/);
  assert.equal(result.content.at(-1).text, 'ran once');
  assert.equal(mini.upstreamOf(0).calls('js').length, 0, 'the first session never ran it');
  assert.equal(mini.posts('tools/call').filter(r => r.res.statusCode === 404).length, 1);

  // A task is open now: the session's end loses its REPL state, which no retry can bring back.
  await mini.http.endSessions('eof');
  const lost = await h.client.call('js', {code: 'needs the old state'}).response;
  assert.equal(lost.result.isError, true);
  assert.deepEqual(structured(lost), {status: 'error', code: 'device_session_ended', device: 'mini'});
  assert.match(textOf(lost), /mini.*REPL state is gone/);
  assert.equal(mini.open.opened.length, 2, 'not retried');
  assert.equal(structured(await use(h, 'local')).status, 'ok', 'the lost task does not hold the target');

  // No task open, and the client learned of the end from its standing stream first: the call is never sent on the
  // ended session, so it too is retried on a new one.
  await use(h, 'mini');
  const noticed = () => h.client.diagnostics.filter(line => /^device mini: the device ended the session/.test(line)).length;
  const before = noticed();
  await mini.http.endSessions('eof');
  await until(() => noticed() > before, 'the client noticing the end');
  const again = h.client.call('js', {code: 'after a noticed end'});
  await until(() => mini.open.opened.length === 4, 'another re-opened session');
  mini.upstreamOf(3).text(await mini.upstreamOf(3).nextCall('js'), 'fine');
  assert.equal((await again.response).result._meta['cua/deviceSession'], 'new');
  assert.equal(mini.upstreamOf(2).calls('js').length, 0);
});

test('a call running when the device ends its session answers device_session_ended, never retried', async t => {
  const home = userHome(t);
  const mini = await device(t);
  await register(home, 'mini', mini);
  const h = await local(t, home);
  await use(h, 'mini');
  const running = h.client.call('js', {code: 'long'});
  await mini.upstreamOf(0).nextCall('js');
  await mini.http.endSessions('eof');
  const response = await running.response;
  assert.equal(code(response), 'device_session_ended');
  assert.match(textOf(response), /whether it ran there is unknown/);
  await tick(50);
  assert.equal(mini.open.opened.length, 1, 'a js cell must not run twice');
  const next = h.client.call('js', {code: 'next'});
  await until(() => mini.open.opened.length === 2, 'a new session for the next call');
  mini.upstreamOf(1).text(await mini.upstreamOf(1).nextCall('js'), 'ok');
  assert.equal((await next.response).result._meta['cua/deviceSession'], 'new');
});

test('an elicitation from the device reaches the local client as cua-device-<n>, and its answer returns under the device\'s id, unchanged', async t => {
  const home = userHome(t);
  const mini = await device(t);
  await register(home, 'mini', mini);
  const h = await local(t, home, {persist: 'always'});     // the device's own mode is session
  await use(h, 'mini');
  const deviceUp = mini.upstreamOf(0);
  const ran = h.client.call('js', {code: 'open Calculator'});
  const js = await deviceUp.nextCall('js');
  deviceUp.emit({jsonrpc: '2.0', id: 7, method: 'elicitation/create', params: {message: 'Allow Calculator?', requestedSchema: {type: 'object', properties: {}}}});
  deviceUp.emit({jsonrpc: '2.0', method: 'notifications/message', params: {level: 'info', data: 'hello'}});
  const asked = await h.client.next(m => m.method === 'elicitation/create', {label: 'the elicitation'});
  assert.equal(asked.id, 'cua-device-1');
  assert.equal(asked.params.message, 'Allow Calculator?');
  assert.deepEqual((await h.client.next(m => m.method === 'notifications/message', {label: 'the notification'})).params, {level: 'info', data: 'hello'});
  h.client.send({jsonrpc: '2.0', id: 'cua-device-1', result: {action: 'accept', content: {}}});
  const answer = await deviceUp.next(m => m.id === 7 && m.method === undefined, {label: 'the answer on the device'});
  assert.deepEqual(answer.result, {action: 'accept', content: {}, _meta: {persist: 'session'}}, 'the device\'s own persist mode, not the local one');
  assert.equal(h.upstream.sent.filter(m => m.id === 'cua-device-1' || m.id === 7).length, 0, 'the local runtime never sees it');
  // A request the device withdraws is withdrawn under the id the local client knows it by.
  deviceUp.emit({jsonrpc: '2.0', id: 8, method: 'elicitation/create', params: {message: 'Allow Notes?', requestedSchema: {type: 'object', properties: {}}}});
  assert.equal((await h.client.next(m => m.method === 'elicitation/create' && m.id === 'cua-device-2', {label: 'the second elicitation'})).params.message, 'Allow Notes?');
  deviceUp.emit({jsonrpc: '2.0', method: 'notifications/cancelled', params: {requestId: 8, reason: 'the cell timed out'}});
  const withdrawn = await h.client.next(m => m.method === 'notifications/cancelled', {label: 'the withdrawal'});
  assert.deepEqual(withdrawn.params, {requestId: 'cua-device-2', reason: 'the cell timed out'});
  deviceUp.text(js, 'opened');
  assert.equal((await ran.response).result.content[0].text, 'opened');
});

test('a local cancellation becomes the device\'s notifications/cancelled; a call the device withdraws is never answered', async t => {
  const home = userHome(t);
  const mini = await device(t);
  await register(home, 'mini', mini);
  const h = await local(t, home);
  await use(h, 'mini');
  const deviceUp = mini.upstreamOf(0);
  const running = h.client.call('js', {code: 'long'});
  const js = await deviceUp.nextCall('js');
  const queued = h.client.call('js', {code: 'queued behind it'});
  await until(() => mini.posts('tools/call').length === 2, 'the queued call on the device');
  await tick(30);
  h.client.notify('notifications/cancelled', {requestId: queued.id, reason: 'the user pressed escape'});
  h.client.notify('notifications/cancelled', {requestId: running.id});
  const cancelled = await deviceUp.next(m => m.method === 'notifications/cancelled', {label: 'the running call\'s cancellation'});
  assert.equal(cancelled.params.requestId, js.id, 'the device runtime\'s own id for it');
  deviceUp.text(js, 'stopped');
  assert.equal((await running.response).result.content[0].text, 'stopped', 'a dispatched call still answers');
  await tick(100);
  assert.deepEqual(h.client.responsesFor(queued.id), [], 'the withdrawn call is never answered');
  assert.equal(deviceUp.calls('js').length, 1);
});

test('a call cancelled while its lazy open is under way is never answered, and the open is abandoned', async t => {
  const home = userHome(t);
  const mini = await device(t);
  await register(home, 'mini', mini);
  const h = await local(t, home);
  await use(h, 'mini');
  const first = h.client.call('js', {code: '1'});
  mini.upstreamOf(0).text(await mini.upstreamOf(0).nextCall('js'), 'one');
  await first.response;
  const ended = h.client.call('end_task');
  mini.upstreamOf(0).reply(await mini.upstreamOf(0).nextCall('turn_ended'), {content: [], isError: false});
  await ended.response;

  let held = null;
  mini.front = entry => entry.message?.method === 'initialize' && (held = entry, true);
  const opening = h.client.call('js', {code: 'never'});
  await until(() => held, 'the held initialize');
  h.client.notify('notifications/cancelled', {requestId: opening.id});
  await tick(100);
  assert.deepEqual(h.client.responsesFor(opening.id), []);
  mini.front = null;
  const next = h.client.call('js', {code: 'next'});
  await until(() => mini.open.opened.length === 2, 'a fresh open');
  mini.upstreamOf(1).text(await mini.upstreamOf(1).nextCall('js'), 'fine');
  assert.equal((await next.response).result._meta['cua/deviceSession'], 'new');
});

test('a POST stream cut mid-call is resumed by Last-Event-ID and the result delivered in the same call, with no new initialize', async t => {
  const home = userHome(t);
  const mini = await device(t);
  await register(home, 'mini', mini);
  const h = await local(t, home);
  await use(h, 'mini');
  const deviceUp = mini.upstreamOf(0);
  const ran = h.client.call('js', {code: 'long'});
  const js = await deviceUp.nextCall('js');
  await tick(30);
  mini.posts('tools/call')[0].res.destroy();
  await until(() => mini.requests.some(r => r.method === 'GET' && r.headers['last-event-id']), 'the resume');
  deviceUp.text(js, 'finished while the stream was down');
  const result = (await ran.response).result;
  assert.equal(result.content[0].text, 'finished while the stream was down');
  assert.equal(result._meta['cua/deviceSession'], undefined);
  assert.equal(mini.posts('initialize').length, 1);
  assert.equal(mini.posts('tools/call').length, 1, 'never resent');
});

test('devices_use failures are classified and leave the target unchanged', async t => {
  const home = userHome(t);
  const mini = await device(t);
  const wrong = await device(t);
  const bare = await device(t);
  const busy = await device(t);
  const broken = await device(t);
  await register(home, 'mini', mini);
  await register(home, 'wrong', wrong, {credential: 'f'.repeat(64)});
  await register(home, 'bare', bare, {credential: null});
  await register(home, 'busy', busy);
  await register(home, 'broken', broken);
  addDevice({env: home.env, name: 'gone', relayUrl: 'http://127.0.0.1:1', deviceId: randomBytes(16).toString('base64url')});
  await home.store.write(clientSecretKey((await import('../src/remote/devices.mjs')).readDevices({env: home.env}).gone.deviceId), 'a'.repeat(64));
  broken.open.failWith = 'runtime_not_installed';
  // Another client holds the busy device's only session with a call running.
  const other = await openDeviceSession({endpoint: `${busy.relayUrl}/d/${busy.deviceId}/mcp`, credential: busy.credential, initializeParams: CLIENT_INIT});
  t.after(() => other.close());
  other.request('tools/call', {name: 'js', arguments: {code: 'busy'}}).catch(() => {});
  await busy.upstreamOf(0).nextCall('js');
  const h = await local(t, home);
  await use(h, 'mini');

  const cases = {
    nowhere: 'device_unknown', bare: 'credential_missing', wrong: 'device_unauthorized', gone: 'device_offline',
    busy: 'session_limit', broken: 'device_failed',
  };
  for (const [name, expected] of Object.entries(cases)) {
    const response = await use(h, name);
    assert.equal(response.result.isError, true, name);
    assert.equal(code(response), expected, `${name}: ${textOf(response)}`);
    assert.equal(structured(await h.client.call('devices_list').response).current, 'mini', `${name}: the target is unchanged`);
  }
  assert.match(textOf(await use(h, 'bare')), new RegExp(`/secret ${clientSecretKey(bare.deviceId)}`), 'the user\'s step is named');
  assert.match(textOf(await use(h, 'broken')), /runtime_not_installed/);
  assert.equal(mini.http.sessions.size, 1, 'the current device session is kept');
  const invalid = await h.client.call('devices_use', {}).response;
  assert.equal(invalid.error.code, -32602);
  credentialFree(h, mini, wrong, busy, broken);
});

test('switching from one device to another ends the first device\'s session; the local connection\'s close ends the current one before closed settles', async t => {
  const home = userHome(t);
  const mini = await device(t);
  const macbook = await device(t);
  await register(home, 'mini', mini);
  await register(home, 'macbook', macbook);
  const h = harness({server: {devices: deviceDirectory({env: home.env})}});
  await initialized(h);
  await use(h, 'mini');
  assert.deepEqual(switchFields(await use(h, 'macbook')), {status: 'ok', device: 'macbook', previous: 'mini'});
  assert.equal(mini.deletes().length, 1);
  assert.equal(mini.http.sessions.size, 0);
  assert.equal(macbook.http.sessions.size, 1);

  h.client.eof();
  await h.server.closed;
  assert.equal(macbook.deletes().length, 1);
  assert.equal(macbook.http.sessions.size, 0, 'released before the local connection closed');
});

test('calls that arrive while devices_use is switching wait for it, so each runs on the target its arrival order implies', async t => {
  const home = userHome(t);
  const mini = await device(t);
  await register(home, 'mini', mini);
  const h = await local(t, home);
  let held = null;
  mini.front = entry => entry.message?.method === 'initialize' && (held = entry, true);
  const switching = h.client.call('devices_use', {device: 'mini'});
  const ran = h.client.call('js', {code: 'after the switch'});
  await until(() => held, 'the held initialize');
  await tick(30);
  assert.equal(h.upstream.calls('js').length, 0, 'the call did not run locally meanwhile');
  mini.front = null;
  mini.requests.splice(mini.requests.indexOf(held), 1);
  // Hand the held initialize to the handler now.
  const replay = await fetch(`${mini.relayUrl}/d/${mini.deviceId}/mcp`, {method: 'POST', headers: held.headers, body: held.body});
  held.res.writeHead(replay.status, Object.fromEntries(replay.headers));
  held.res.end(Buffer.from(await replay.arrayBuffer()));
  assert.equal(structured(await switching.response).status, 'ok');
  const js = await mini.upstreamOf(0).nextCall('js');
  mini.upstreamOf(0).text(js, 'on mini');
  assert.equal((await ran.response).result._meta['cua/device'], 'mini');
});

// Ends the device task on `mini` (session n) so the next call opens a session lazily.
async function endRemoteTask(h, mini, n = 0) {
  const ran = h.client.call('js', {code: 'task'});
  mini.upstreamOf(n).text(await mini.upstreamOf(n).nextCall('js'), 'done');
  await ran.response;
  const ended = h.client.call('end_task');
  mini.upstreamOf(n).reply(await mini.upstreamOf(n).nextCall('turn_ended'), {content: [], isError: false});
  await ended.response;
}

// Holds the next initialize the device receives; release() hands it to the handler.
function holdInitialize(d) {
  const hold = {entry: null};
  d.front = entry => entry.message?.method === 'initialize' && (hold.entry = entry, true);
  hold.release = async () => {
    d.front = null;
    const {entry} = hold;
    const replay = await fetch(`${d.relayUrl}/d/${d.deviceId}/mcp`, {method: 'POST', headers: entry.headers, body: entry.body});
    entry.res.writeHead(replay.status, Object.fromEntries(replay.headers));
    entry.res.end(Buffer.from(await replay.arrayBuffer()));
  };
  return hold;
}

test('a js waiting for its lazy open already holds the task open: devices_use is refused task_open', async t => {
  const home = userHome(t);
  const mini = await device(t);
  await register(home, 'mini', mini);
  const h = await local(t, home);
  await use(h, 'mini');
  await endRemoteTask(h, mini);
  const hold = holdInitialize(mini);
  const ran = h.client.call('js', {code: 'opening'});
  await until(() => hold.entry, 'the held initialize');
  assert.equal(code(await use(h, 'local')), 'task_open');
  await hold.release();
  mini.upstreamOf(1).text(await mini.upstreamOf(1).nextCall('js'), 'ran');
  assert.equal((await ran.response).result.content.at(-1).text, 'ran');
  assert.equal(mini.http.sessions.size, 1, 'the session with the open task was kept');
  assert.equal(code(await use(h, 'local')), 'task_open');
});

test('the new-session note goes on the first answer a lazily opened session gives, once, even when the call that opened it was withdrawn', async t => {
  const home = userHome(t);
  const mini = await device(t);
  await register(home, 'mini', mini);
  const h = await local(t, home);
  await use(h, 'mini');
  await endRemoteTask(h, mini);
  const hold = holdInitialize(mini);
  const opener = h.client.call('js', {code: 'withdrawn'});
  await until(() => hold.entry, 'the held initialize');
  const secrets = [h.client.call('secrets_list'), h.client.call('secrets_list')];
  await tick(20);
  h.client.notify('notifications/cancelled', {requestId: opener.id});
  await hold.release();
  const listed = await Promise.all(secrets.map(async call => (await call.response).result));
  assert.deepEqual(listed.map(result => result._meta['cua/deviceSession']).filter(Boolean), ['new'], 'one note for the session, on the first answer');
  assert.match(listed.find(result => result._meta['cua/deviceSession']).content[0].text, /new session on mini/);
  const after = h.client.call('js', {code: 'later'});
  mini.upstreamOf(1).text(await mini.upstreamOf(1).nextCall('js'), 'later');
  assert.equal((await after.response).result._meta['cua/deviceSession'], undefined, 'said once per session');
  assert.deepEqual(h.client.responsesFor(opener.id), []);
  assert.equal(mini.upstreamOf(1).calls('js').length, 1, 'the withdrawn call never ran');
});

test('stray ids are dropped: an answer to a cua-device- id no longer awaited, and a device cancellation naming no request of its', async t => {
  const home = userHome(t);
  const mini = await device(t);
  await register(home, 'mini', mini);
  const h = await local(t, home);
  await use(h, 'mini');
  const deviceUp = mini.upstreamOf(0);
  const ran = h.client.call('js', {code: 'x'});
  const js = await deviceUp.nextCall('js');
  h.client.send({jsonrpc: '2.0', id: 'cua-device-99', result: {action: 'accept', content: {}}});
  deviceUp.emit({jsonrpc: '2.0', method: 'notifications/cancelled', params: {requestId: 42}});
  deviceUp.emit({jsonrpc: '2.0', method: 'notifications/message', params: {level: 'info', data: 'after'}});
  await h.client.next(m => m.method === 'notifications/message', {label: 'the later notification'});
  assert.equal(h.client.frames.filter(m => m.method === 'notifications/cancelled').length, 0, 'the device\'s raw id never reaches the client');
  await tick(30);
  assert.equal(h.upstream.sent.filter(m => m.id === 'cua-device-99').length, 0, 'never sent to the local runtime');
  assert.equal(deviceUp.sent.filter(m => m.id === 'cua-device-99').length, 0);
  assert.ok(h.client.diagnostics.some(line => /cua-device-99.*dropped/.test(line)));
  deviceUp.text(js, 'x');
  await ran.response;
});

test('end_task on a device gone offline answers device_offline with ended:false and frees the target', async t => {
  const home = userHome(t);
  const mini = await device(t);
  await register(home, 'mini', mini);
  const h = await local(t, home);
  await use(h, 'mini');
  const ran = h.client.call('js', {code: 'x'});
  mini.upstreamOf(0).text(await mini.upstreamOf(0).nextCall('js'), 'x');
  await ran.response;
  mini.front = entry => {
    entry.res.writeHead(503, {'Content-Type': 'application/json'});
    entry.res.end(JSON.stringify({jsonrpc: '2.0', id: null, error: {code: -32000, message: 'cua-relay: device offline'}}));
    return true;
  };
  const ended = await h.client.call('end_task').response;
  assert.deepEqual(structured(ended), {status: 'error', ended: false, code: 'device_offline', device: 'mini'});
  assert.match(textOf(ended), /the device session is closed; devices_use still works/);
  assert.deepEqual(switchFields(await use(h, 'local')), {status: 'ok', device: 'local', previous: 'mini'});
});

test('a cancelled devices_use is never answered and leaves the target; a js queued behind a switch can be cancelled and never runs', async t => {
  const home = userHome(t);
  const mini = await device(t);
  await register(home, 'mini', mini);
  const h = await local(t, home);
  let hold = holdInitialize(mini);
  const switching = h.client.call('devices_use', {device: 'mini'});
  await until(() => hold.entry, 'the held initialize');
  h.client.notify('notifications/cancelled', {requestId: switching.id});
  await tick(50);
  assert.deepEqual(h.client.responsesFor(switching.id), []);
  assert.equal(structured(await h.client.call('devices_list').response).current, 'local');
  hold.entry.res.destroy();

  hold = holdInitialize(mini);
  const again = h.client.call('devices_use', {device: 'mini'});
  await until(() => hold.entry, 'the second held initialize');
  const queued = h.client.call('js', {code: 'never'});
  await tick(20);
  h.client.notify('notifications/cancelled', {requestId: queued.id});
  await hold.release();
  assert.equal(structured(await again.response).status, 'ok');
  await tick(50);
  assert.deepEqual(h.client.responsesFor(queued.id), []);
  assert.equal(mini.upstreamOf(0).calls('js').length + h.upstream.calls('js').length, 0);
});

test('a session end with no task open retries secrets_list once on a new session', async t => {
  const home = userHome(t);
  const mini = await device(t);
  await register(home, 'mini', mini);
  const h = await local(t, home);
  await use(h, 'mini');
  mini.front = entry => entry.method === 'GET';
  await mini.http.endSessions('eof');
  const listed = h.client.call('secrets_list');
  await until(() => mini.open.opened.length === 2, 'the re-opened session');
  mini.front = null;
  const result = (await listed.response).result;
  assert.equal(result.structuredContent.code, 'secrets_not_configured', 'the device\'s answer');
  assert.equal(result._meta['cua/deviceSession'], 'new');
  assert.match(result.structuredContent['cua/note'], /new session on mini.*REPL state is fresh/, 'in the structured content too, which is all Claude Code shows');
});

test('closing the connection answers what is in flight connection_closing: a remote js, and a devices_use still opening', async t => {
  const home = userHome(t);
  const mini = await device(t);
  const other = await device(t);
  await register(home, 'mini', mini);
  await register(home, 'other', other);
  const h = harness({server: {devices: deviceDirectory({env: home.env})}});
  await initialized(h);
  await use(h, 'mini');
  await endRemoteTask(h, mini);
  const ran = h.client.call('js', {code: 'long'});
  await until(() => mini.open.opened.length === 2, 'the lazy session');
  await mini.upstreamOf(1).nextCall('js');
  h.client.eof();
  await h.server.closed;
  const response = await ran.response;
  assert.equal(code(response), 'connection_closing');
  assert.doesNotMatch(textOf(response), /next call/);
  assert.equal(mini.http.sessions.size, 0);

  const second = await device(t);
  await register(home, 'second', second);
  const h2 = harness({server: {devices: deviceDirectory({env: home.env})}});
  await initialized(h2);
  const hold = holdInitialize(second);
  const switching = h2.client.call('devices_use', {device: 'second'});
  await until(() => hold.entry, 'the held initialize');
  h2.client.eof();
  await h2.server.closed;
  assert.equal(code(await switching.response), 'connection_closing');
  hold.entry.res.destroy();
});

test('a call queued between two devices_use runs on the target of the first, and the second is refused task_open', async t => {
  const home = userHome(t);
  const mini = await device(t);
  const mac = await device(t);
  await register(home, 'mini', mini);
  await register(home, 'mac', mac);
  const h = await local(t, home);
  const first = h.client.call('devices_use', {device: 'mini'});
  const ran = h.client.call('js', {code: 'on mini'});
  const second = h.client.call('devices_use', {device: 'mac'});
  assert.equal(structured(await first.response).status, 'ok');
  const js = await mini.upstreamOf(0).nextCall('js');
  assert.equal(js.params.arguments.code, 'on mini');
  const refused = await second.response;
  assert.equal(code(refused), 'task_open');
  assert.equal(mac.posts('initialize').length, 0, 'the second switch opened nothing');
  mini.upstreamOf(0).text(js, 'mini');
  const result = (await ran.response).result;
  assert.equal(result._meta['cua/device'], 'mini');
  assert.equal(structured(await h.client.call('devices_list').response).current, 'mini');
});

test('a connection closing while devices_use DELETEs the previous device\'s session ends the new one too and answers connection_closing before closed settles', async t => {
  const home = userHome(t);
  const mini = await device(t);
  const mac = await device(t);
  await register(home, 'mini', mini);
  await register(home, 'mac', mac);
  const h = harness({server: {devices: deviceDirectory({env: home.env})}});
  await initialized(h);
  await use(h, 'mini');
  let heldDelete = null;
  mini.front = entry => entry.method === 'DELETE' && (heldDelete = entry, true);
  const switching = h.client.call('devices_use', {device: 'mac'});
  await until(() => heldDelete, 'mini\'s held DELETE');
  assert.equal(mac.http.sessions.size, 1, 'mac\'s session is open, not yet the target');
  h.client.eof();
  await h.server.closed;
  assert.equal(mac.deletes().length, 1, 'the new device\'s session is DELETEd');
  assert.equal(mac.http.sessions.size, 0);
  // Asserted as answered: the devices_use settles inside the close, before its final flush.
  assert.equal(h.client.responsesFor(switching.id).length, 1, 'answered before closed settled');
  assert.equal(code(h.client.responsesFor(switching.id)[0]), 'connection_closing');
  heldDelete.res.destroy();
});
