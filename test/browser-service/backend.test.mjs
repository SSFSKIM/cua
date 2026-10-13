// The backend transport (src/browser-service/backend.mjs): u32-framed JSON-RPC over the trusted worker's nativePipe,
// the session fields on every session request, notifications in, discovery of backend sockets, the session API the
// CDP controller and the tab registry call (the vendor's uh) and the turn-ended tracker (ph). The unit tests drive an
// in-memory pipe; the integration tests drive the real host program (src/chrome/host.mjs) with the fake extension.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {endianness} from 'node:os';
import {mkdirSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {
  connect, Backend, BackendApi, discoverBackends, backendPaths, TurnEndedTracker, turnMetadata, sessionIdOf,
} from '../../src/browser-service/backend.mjs';
import {Deadline} from '../../src/browser-service/budgets.mjs';
import {nativePipe, startRealHost, waitFor} from './support/real-host.mjs';
import {shortScratch} from '../fixtures/runtime-fixture.mjs';

const LE = endianness() === 'LE';
const frame = message => {
  const body = Buffer.from(JSON.stringify(message));
  const header = Buffer.alloc(4);
  if (LE) header.writeUInt32LE(body.length); else header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
};
const settle = () => new Promise(resolve => setImmediate(resolve));
const rejection = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };

// The nativePipe stream surface (write/on/off/end; data, close, error) with the far end in the test's hands: `sent`
// holds what the service wrote, decoded; `deliver` pushes bytes to the service; `answer` replies to a request by id.
function memoryPipe() {
  const listeners = {data: new Set(), close: new Set(), error: new Set()};
  const sent = [];
  let ended = false;
  const stream = Object.freeze({
    write(bytes) {
      const buffer = Buffer.from(bytes);
      const length = LE ? buffer.readUInt32LE(0) : buffer.readUInt32BE(0);
      sent.push(JSON.parse(buffer.subarray(4, 4 + length).toString('utf8')));
    },
    on(event, listener) { listeners[event].add(listener); },
    off(event, listener) { listeners[event].delete(listener); },
    end() { ended = true; },
  });
  return {
    stream, sent, get ended() { return ended; },
    deliver(bytes) { for (const l of listeners.data) l(Buffer.from(bytes)); },
    answer(id, outcome) { this.deliver(frame({jsonrpc: '2.0', id, ...outcome})); },
    close() { for (const l of listeners.close) l(); },
    fail(error) { for (const l of listeners.error) l(error); },
  };
}

test('a request is one u32-framed JSON-RPC message with the session fields, and resolves with the result', async () => {
  const pipe = memoryPipe();
  const backend = new Backend(pipe.stream);
  const pending = backend.request('createTab', {preferredWindowId: 4}, {sessionId: 's1', turnId: 't1'});
  assert.deepEqual(pipe.sent, [{jsonrpc: '2.0', id: 1, method: 'createTab', params: {preferredWindowId: 4, session_id: 's1', turn_id: 't1', session_context: 'live'}}]);
  pipe.answer(1, {result: {id: 12}});
  assert.deepEqual(await pending, {id: 12});
  const exempt = backend.request('ping');
  assert.deepEqual(pipe.sent[1], {jsonrpc: '2.0', id: 2, method: 'ping', params: {}}, 'no session, no session fields');
  pipe.answer(2, {result: 'pong'});
  assert.equal(await exempt, 'pong');
});

test('frames split across chunks and several in one chunk are both decoded', async () => {
  const pipe = memoryPipe();
  const backend = new Backend(pipe.stream);
  const a = backend.request('ping'), b = backend.request('ping');
  const bytes = Buffer.concat([frame({jsonrpc: '2.0', id: 1, result: 'one'}), frame({jsonrpc: '2.0', id: 2, result: 'two'})]);
  pipe.deliver(bytes.subarray(0, 3));
  pipe.deliver(bytes.subarray(3, 20));
  pipe.deliver(bytes.subarray(20));
  assert.deepEqual(await Promise.all([a, b]), ['one', 'two']);
});

test('an error reply rejects with the host\'s message and code', async () => {
  const pipe = memoryPipe();
  const backend = new Backend(pipe.stream);
  const pending = backend.request('executeCdp', {}, {sessionId: 's', turnId: 't'});
  pipe.answer(1, {error: {code: 1, message: 'Debugger unattached'}});
  const error = await rejection(pending);
  assert.equal(error.message, 'Debugger unattached');
  assert.equal(error.code, 1);
});

test('notifications reach their handlers until unsubscribed; the backend answers the host\'s ping and refuses other requests', async () => {
  const pipe = memoryPipe();
  const backend = new Backend(pipe.stream);
  const seen = [];
  const off = backend.on('onCDPEvent', params => seen.push(params));
  pipe.deliver(frame({jsonrpc: '2.0', method: 'onCDPEvent', params: {source: {tabId: 3}, method: 'Page.loadEventFired', params: {}}}));
  off();
  pipe.deliver(frame({jsonrpc: '2.0', method: 'onCDPEvent', params: {source: {tabId: 3}, method: 'Page.frameNavigated'}}));
  assert.deepEqual(seen.map(p => p.method), ['Page.loadEventFired']);
  pipe.deliver(frame({jsonrpc: '2.0', id: 77, method: 'ping', params: {}}));
  pipe.deliver(frame({jsonrpc: '2.0', id: 78, method: 'frobnicate', params: {}}));
  await settle();
  assert.deepEqual(pipe.sent, [
    {jsonrpc: '2.0', id: 77, result: 'pong'},
    {jsonrpc: '2.0', id: 78, error: {code: -1, message: 'No handler registered for method: frobnicate'}},
  ]);
});

test('the pipe closing rejects every pending request and every later one, and tells the close listeners once', async () => {
  const pipe = memoryPipe();
  const backend = new Backend(pipe.stream);
  const closes = [];
  backend.onClose(error => closes.push(error?.message));
  const pending = backend.request('getTabs', {}, {sessionId: 's', turnId: 't'});
  pipe.close();
  assert.equal((await rejection(pending)).message, 'native pipe closed before response');
  assert.equal(backend.closed, true);
  assert.equal((await rejection(backend.request('ping'))).message, 'native pipe is closed');
  pipe.close();
  await settle();
  assert.deepEqual(closes, ['native pipe closed before response']);
});

test('a malformed frame closes the transport; close() ends the pipe', async () => {
  const pipe = memoryPipe();
  const backend = new Backend(pipe.stream);
  const pending = backend.request('ping');
  const header = Buffer.alloc(4);
  if (LE) header.writeUInt32LE(3); else header.writeUInt32BE(3);
  pipe.deliver(Buffer.concat([header, Buffer.from('{x}')]));
  assert.match((await rejection(pending)).message, /JSON/);
  assert.equal(backend.closed, true);
  const other = memoryPipe();
  const second = new Backend(other.stream);
  await second.close();
  assert.equal(other.ended, true);
  assert.equal(second.closed, true);
});

test('a request whose deadline is spent is never sent; one outliving its deadline rejects with timeout', async () => {
  const pipe = memoryPipe();
  const backend = new Backend(pipe.stream);
  const spent = await rejection(backend.request('attach', {tabId: 1}, {sessionId: 's', turnId: 't', deadline: new Deadline(0)}));
  assert.equal(spent.code, 'timeout');
  assert.deepEqual(pipe.sent, []);
  const slow = await rejection(backend.request('attach', {tabId: 1}, {sessionId: 's', turnId: 't', deadline: new Deadline(20)}));
  assert.equal(slow.code, 'timeout');
  assert.equal(pipe.sent.length, 1);
});

test('connect needs the trusted worker\'s nativePipe bridge', async () => {
  await assert.rejects(connect('/tmp/x.sock', {nativePipe: null}), /privileged native pipe bridge is not available/);
  await assert.rejects(connect('/nonexistent/cua-no.sock', {nativePipe}), /ENOENT|ECONNREFUSED/);
});

// --- the session API (the vendor's uh) --------------------------------------------------------------------------------

function sessionApi(options = {}) {
  const {meta = {session_id: 's1', turn_id: 't1'}, tracker = null} = options;
  const pipe = memoryPipe();
  const backend = new Backend(pipe.stream);
  const state = {meta: 'meta' in options ? options.meta : meta};
  const api = new BackendApi(backend, {getTurnMetadata: () => state.meta, turnEndedTracker: tracker});
  // Answers every request the API makes, by method.
  const answers = {getInfo: {type: 'extension', family: 'chrome', name: 'cua', version: '0.3.0', capabilities: {browser: [], tab: []}, metadata: {extensionInstanceId: 'i1'}}};
  const auto = () => { for (const m of pipe.sent) if (m.id && !m.answered) { m.answered = true; pipe.answer(m.id, Object.hasOwn(answers, m.method) ? (answers[m.method] instanceof Error ? {error: {code: 1, message: answers[m.method].message}} : {result: answers[m.method]}) : {result: {}}); } };
  return {pipe, backend, api, state, answers, auto};
}

// Runs `call` with every request answered as it is sent.
async function answered(h, call) {
  const p = call();
  p.catch(() => {});
  for (let i = 0; i < 20; i++) { h.auto(); await settle(); }
  return await p;
}

test('session requests carry the live turn\'s session_id and turn_id; a subagent turn uses its thread id', async () => {
  const h = sessionApi();
  await answered(h, () => h.api.createTab(7));
  assert.deepEqual(h.pipe.sent.at(-1).params, {preferredWindowId: 7, session_id: 's1', turn_id: 't1', session_context: 'live'});
  h.state.meta = {session_id: 's1', thread_source: 'subagent', thread_id: 'th9', turn_id: 't2'};
  await answered(h, () => h.api.markTab(5, 'handoff'));
  assert.deepEqual(h.pipe.sent.at(-1).params, {tabId: 5, status: 'handoff', session_id: 'th9', turn_id: 't2', session_context: 'live'});
  assert.equal(h.api.getCurrentSessionId(), 'th9');
  assert.equal(h.api.getCurrentTurnId(), 't2');
});

test('without turn metadata a session request reuses the last session as "cached"; with neither it fails', async () => {
  const h = sessionApi();
  await answered(h, () => h.api.getTabs());
  h.state.meta = undefined;
  await answered(h, () => h.api.attach(3));
  assert.deepEqual(h.pipe.sent.at(-1).params, {tabId: 3, session_id: 's1', turn_id: 't1', session_context: 'cached'});
  const fresh = sessionApi({meta: undefined});
  assert.throws(() => fresh.api.getSessionParams(), /Missing required browser session_id/);
  const noTurn = sessionApi({meta: {session_id: 's'}});
  assert.throws(() => noTurn.api.getSessionParams(), /Missing required browser turn_id/);
});

test('getInfo is cached as clientInfo, needs no session, and a ChatGPT-extension backend is refused as unsupported_backend', async () => {
  const fresh = sessionApi({meta: undefined});
  const info = await answered(fresh, () => fresh.api.getInfo());
  assert.equal(info.name, 'cua');
  assert.equal(fresh.api.clientInfo, info);
  assert.deepEqual(fresh.pipe.sent.at(-1).params, {}, 'no metadata: getInfo goes without session fields (the host exempts it)');
  const h = sessionApi();
  h.answers.getInfo = {type: 'extension', family: 'chrome', name: 'ChatGPT', capabilities: {}, agentRequestHeaderEnabled: false, metadata: {}};
  const refused = await rejection(answered(h, () => h.api.getInfo()));
  assert.equal(refused.name, 'BrowserServiceError');
  assert.equal(refused.code, 'unsupported_backend');
});

test('getInfo and getUserTabs do not become the cached session; other requests do', async () => {
  const h = sessionApi();
  await answered(h, () => h.api.getInfo());
  await answered(h, () => h.api.getUserTabs());
  assert.equal(h.api.lastSessionParams, null);
  await answered(h, () => h.api.nameSession('case-1'));
  assert.deepEqual(h.api.lastSessionParams, {session_id: 's1', turn_id: 't1'});
  assert.deepEqual(h.pipe.sent.at(-1).params, {name: 'case-1', session_id: 's1', turn_id: 't1', session_context: 'live'});
});

test('getCommittedTabUrl falls back to the tab list when the backend has no handler for it', async () => {
  const h = sessionApi();
  h.answers.getCommittedTabUrl = new Error('No handler registered for method: getCommittedTabUrl');
  h.answers.getTabs = [{id: 4, url: 'https://a.test/x'}];
  assert.equal(await answered(h, () => h.api.getCommittedTabUrl(4)), 'https://a.test/x');
  assert.equal(h.api.committedTabUrlSupported, false);
  assert.equal((await rejection(answered(h, () => h.api.getCommittedTabUrl(9)))).message, 'Tab not found: 9');
});

test('onPageEvent notifications queue until taken', async () => {
  const h = sessionApi();
  h.pipe.deliver(frame({jsonrpc: '2.0', method: 'onPageEvent', params: {tabId: 1, kind: 'a'}}));
  h.pipe.deliver(frame({jsonrpc: '2.0', method: 'onPageEvent', params: {tabId: 1, kind: 'b'}}));
  assert.deepEqual(h.api.takePageEvents().map(e => e.kind), ['a', 'b']);
  assert.deepEqual(h.api.takePageEvents(), []);
});

test('turn tracking: once getInfo is known each session request registers the turn; the turn\'s end detaches then tells the backend', async () => {
  const tracked = [];
  const tracker = {track: (turn, handler) => tracked.push({turn, handler})};
  const h = sessionApi({tracker});
  await answered(h, () => h.api.getTabs());
  assert.equal(tracked.length, 0, 'not before the backend\'s info is known (the vendor\'s rule)');
  await answered(h, () => h.api.getInfo());
  await answered(h, () => h.api.getTabs());
  assert.deepEqual(tracked.map(x => x.turn), [{session_id: 's1', turn_id: 't1'}]);
  const order = [];
  h.api.detachTurn = async stillCurrent => { order.push(`detach:${stillCurrent()}`); assert.equal(h.api.endingTurnId, 't1'); };
  await answered(h, () => tracked[0].handler({session_id: 's1', turn_id: 't1'}));
  order.push(h.pipe.sent.at(-1).method);
  assert.deepEqual(order, ['detach:true', 'turnEnded']);
  assert.deepEqual(h.pipe.sent.at(-1).params, {session_id: 's1', turn_id: 't1'}, 'turnEnded carries exactly the ended turn');
  assert.equal(h.api.endingTurnId, undefined);
  h.api.detachTurn = async () => { order.push('detached another turn'); };
  await answered(h, () => tracked[0].handler({session_id: 's1', turn_id: 'old'}));
  assert.equal(order.includes('detached another turn'), false, 'a turn that is not the current one is only reported');
  assert.deepEqual(h.pipe.sent.at(-1).params, {session_id: 's1', turn_id: 'old'});
});

test('the turn-ended tracker registers one node_repl hook and runs each turn\'s handlers once', async () => {
  const hooks = [];
  const runtime = {addTurnEndedHandler: hook => { hooks.push(hook); return () => hooks.splice(hooks.indexOf(hook), 1); }};
  const tracker = new TurnEndedTracker(runtime);
  assert.equal(hooks.length, 1);
  assert.equal(hooks[0].timeoutMs, 4000);
  const ran = [];
  const handler = turn => { ran.push(turn.turn_id); };
  tracker.track({session_id: 's', turn_id: 't1'}, handler);
  tracker.track({session_id: 's', turn_id: 't1'}, handler);
  tracker.track({session_id: 'other', turn_id: 't1'}, () => ran.push('other'));
  await hooks[0].run({session_id: 's', turn_id: 't1'});
  await hooks[0].run({session_id: 's', turn_id: 't1'});
  assert.deepEqual(ran, ['t1'], 'one run per handler and turn; other sessions untouched');
  tracker.track({session_id: 's', turn_id: 't2'}, () => { throw new Error('cleanup failed'); });
  await hooks[0].run({session_id: 's', turn_id: 't2'});
  tracker.dispose();
  assert.equal(hooks.length, 0);
  assert.throws(() => new TurnEndedTracker({}), /requires Node REPL turn-ended hooks/);
});

test('turnMetadata reads x-codex-turn-metadata as an object or JSON text; sessionIdOf prefers a subagent\'s thread', () => {
  assert.deepEqual(turnMetadata({requestMeta: {'x-codex-turn-metadata': {session_id: 'a', turn_id: 'b'}}}), {session_id: 'a', turn_id: 'b'});
  assert.deepEqual(turnMetadata({requestMeta: {'x-codex-turn-metadata': '{"session_id":"a"}'}}), {session_id: 'a'});
  assert.equal(turnMetadata({requestMeta: {'x-codex-turn-metadata': '{bad'}}), undefined);
  assert.equal(turnMetadata({}), undefined);
  assert.equal(turnMetadata(undefined), undefined);
  assert.equal(sessionIdOf({session_id: 'a'}), 'a');
  assert.equal(sessionIdOf({session_id: 'a', thread_source: 'subagent', thread_id: 'th'}), 'th');
  assert.equal(sessionIdOf(undefined), undefined);
});

// --- discovery --------------------------------------------------------------------------------------------------------

test('backendPaths: BROWSER_USE_BACKEND_PATHS verbatim (absolute, deduplicated, empty entries skipped), else the vendor socket directory', async t => {
  assert.deepEqual(await backendPaths({BROWSER_USE_BACKEND_PATHS: '/a/one.sock::/b/two.sock:/a/one.sock'}), ['/a/one.sock', '/b/two.sock']);
  assert.deepEqual(await backendPaths({BROWSER_USE_BACKEND_PATHS: ''}), [], 'an empty list is a list (no scan)');
  await assert.rejects(backendPaths({BROWSER_USE_BACKEND_PATHS: 'relative.sock'}), /BROWSER_USE_BACKEND_PATHS entries must be absolute/);
  const scratch = shortScratch('cua-bp-');
  t.after(scratch.cleanup);
  mkdirSync(join(scratch.dir, 'reg'));
  writeFileSync(join(scratch.dir, 'reg', 'x.sock'), '');
  assert.deepEqual(await backendPaths({}, {socketDir: join(scratch.dir, 'reg')}), [join(scratch.dir, 'reg', 'x.sock')]);
  assert.deepEqual(await backendPaths({}, {socketDir: join(scratch.dir, 'missing')}), []);
});

test('discovery against the real host: one browser with cua\'s getInfo answer, a session API over the socket, reused on the next pass', async t => {
  const host = await startRealHost(t, {version: '0.3.0'});
  const env = {BROWSER_USE_BACKEND_PATHS: `${host.socketPath}:/nonexistent/cua-dead.sock`};
  const meta = {session_id: 'disc', turn_id: 't1'};
  const createApi = backend => new BackendApi(backend, {getTurnMetadata: () => meta});
  const found = await discoverBackends(env, {nativePipe, createApi});
  t.after(() => Promise.all(found.map(b => b.api.close())));
  assert.equal(found.length, 1, 'the dead path is skipped');
  const [browser] = found;
  assert.equal(browser.path, host.socketPath);
  assert.match(browser.id, /^\d+$/);
  assert.deepEqual(browser.info, {type: 'extension', family: 'chrome', name: 'cua', version: '0.3.0',
    capabilities: {browser: [{id: 'viewport', description: browser.info.capabilities.browser[0].description}], tab: []},
    metadata: {extensionInstanceId: host.ext.instanceId}});
  assert.ok(browser.api instanceof BackendApi);
  const again = await discoverBackends(env, {nativePipe, createApi, previous: found});
  assert.equal(again.length, 1);
  assert.equal(again[0], found[0], 'a listed path keeps its browser (id and connection)');
  const dropped = await discoverBackends({BROWSER_USE_BACKEND_PATHS: ''}, {nativePipe, createApi, previous: found});
  assert.deepEqual(dropped, []);
  await waitFor(() => browser.api.backend.closed, 'the dropped browser\'s connection to close');
});

test('discovery skips a backend that never answers getInfo within the bound, and a backend type outside BROWSER_USE_AVAILABLE_BACKENDS', async t => {
  const scratch = shortScratch('cua-dv-');
  t.after(scratch.cleanup);
  const silentPath = join(scratch.dir, 'silent.sock');
  const silent = createServer();
  await new Promise(resolve => silent.listen(silentPath, resolve));
  const sockets = new Set();
  silent.on('connection', socket => sockets.add(socket));
  t.after(() => new Promise(resolve => { for (const s of sockets) s.destroy(); silent.close(resolve); }));
  const started = Date.now();
  assert.deepEqual(await discoverBackends({BROWSER_USE_BACKEND_PATHS: silentPath}, {nativePipe, infoTimeoutMs: 50}), []);
  assert.ok(Date.now() - started < 2000);
  const host = await startRealHost(t);
  assert.deepEqual(await discoverBackends({BROWSER_USE_BACKEND_PATHS: host.socketPath, BROWSER_USE_AVAILABLE_BACKENDS: 'iab'}, {nativePipe}), []);
  const chrome = await discoverBackends({BROWSER_USE_BACKEND_PATHS: host.socketPath, BROWSER_USE_AVAILABLE_BACKENDS: 'chrome'}, {nativePipe});
  t.after(() => Promise.all(chrome.map(b => b.api.close())));
  assert.equal(chrome.length, 1);
});

test('the session API through the real host: create a tab, attach, run CDP, receive its events, and the turn\'s end closes the tab', async t => {
  const host = await startRealHost(t);
  const meta = {session_id: 'real', turn_id: 't1'};
  const backend = await connect(host.socketPath, {nativePipe});
  const api = new BackendApi(backend, {getTurnMetadata: () => meta});
  t.after(() => api.close());
  assert.equal((await api.getInfo()).name, 'cua');
  const tab = await api.createTab();
  assert.equal(tab.url, 'about:blank');
  await api.attach(tab.id);
  const events = [];
  api.addEventListener('onCDPEvent', e => events.push(e));
  const evaluated = await api.executeCdp({target: {tabId: tab.id}, method: 'Runtime.evaluate', commandParams: {expression: '1+1'}, timeoutMs: 1000});
  assert.equal(evaluated.result.value, 'fake-evaluated:1+1');
  host.ext.cdpEvent({tabId: tab.id}, 'Page.loadEventFired', {timestamp: 1});
  await waitFor(() => events.length === 1, 'the CDP event');
  assert.deepEqual(events[0], {source: {tabId: tab.id}, method: 'Page.loadEventFired', params: {timestamp: 1}});
  assert.equal(await api.getCommittedTabUrl(tab.id), 'about:blank');
  assert.deepEqual((await api.getTabs()).map(t => t.id), [tab.id]);
  await api.turnEnded({session_id: 'real', turn_id: 't1'});
  await waitFor(() => !host.ext.state.tabs.has(tab.id), 'the unmarked created tab to close at turn end');
});
