// External contract: the Chrome client mode's protocol behaviours MAWS's cold broker relies on (MAWS P5 O17, "The
// agent's browser with no app"; its plan is MAWS docs/doperpowers/plans/2026-11-01-p5-o17-browser.md, R6 point 6; cua
// #251). With no MAWS app attached, mawsd answers cua's client-mode connection from a broker that greets with MAWS's
// hello, answers the inventory primitives (tabs.query, windows.query, debugger.getTargets) with [] and starts the
// render host only at the first other primitive. Each test below pins one behaviour the broker depends on, at the
// boundary MAWS sees: the frames cua writes to the MAWS socket.
//
// A failing test here means a change would break MAWS's broker: tell the MAWS architect before changing the behaviour,
// and change the broker's expectation and this file together.
//
// Platform-independent by construction: no Chrome, no GUI, and the relay's peer check is given a stand-in addon that
// admits this process (the check itself is pinned in chrome-client-mode.test.mjs; here it only has to let the vendor
// side through), so the tests run in the `test` gate on any runner.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connect, createServer} from 'node:net';
import {join} from 'node:path';
import {CLIENT_RETRY_MS, HELLO_WAIT_MS, startClientBackends} from '../src/chrome/client-mode.mjs';
import {createPeer, encodeFrame, frameDecoder} from '../src/chrome/protocol.mjs';
import {createBrowserService} from '../src/browser-service/index.mjs';
import {blankPageCdp} from '../scripts/probe/chrome/host-layer.mjs';
import {MAWS_PROFILE_NAME, startFakeMawsPeer} from './helpers/fake-maws-peer.mjs';
import {nativePipeConnect} from './fixtures/native-pipe.mjs';
import {shortScratch} from './fixtures/runtime-fixture.mjs';

// Captured before any test mocks the timers: the real clock, for waits on real socket I/O.
const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
const sleep = ms => new Promise(resolve => realSetTimeout(resolve, ms));
// How long "nothing more is sent" is watched for. The host is purely reactive (no timer of its own writes to MAWS).
const QUIET_MS = 150;

// One behaviour of the contract; its failure names the consumer and who to tell.
const contract = (n, name, fn) => test(`MAWS O17 contract ${n}: ${name}`, async t => {
  try {
    await fn(t);
  } catch (error) {
    if (error instanceof Error) error.message = `MAWS O17's cold broker relies on contract ${n}: tell the MAWS architect before changing it.\n${error.message}`;
    throw error;
  }
});

const waitFor = async (predicate, what, ms = 5000) => {
  const deadline = Date.now() + ms;
  while (!predicate()) { if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`); await sleep(5); }
};

function home(t) {
  const s = shortScratch('cua-cc-');
  t.after(s.cleanup);
  return s.dir;
}

// A bare Unix-socket server standing in for a MAWS that misbehaves (silent, or dropping connections), closed with its
// connections after the test whatever happens. -> {accepted (the first connection), close()}.
async function rawServer(t, path, onConnection) {
  const sockets = new Set();
  let first;
  const accepted = new Promise(resolve => { first = resolve; });
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.once('close', () => sockets.delete(socket));
    first(socket);
    onConnection(socket);
  });
  await new Promise(resolve => server.listen(path, resolve));
  const close = () => new Promise(resolve => { for (const s of sockets) s.destroy(); server.close(() => resolve()); });
  t.after(close);
  return {accepted, close};
}

// A peer identity addon that admits this process (and so the vendor clients these tests run in it).
const admitSelf = {
  version: 1,
  peer: () => ({pid: process.pid, uid: process.getuid()}),
  process: pid => (pid === process.pid ? {ppid: 1, start: 1} : null),
};

// What cua wrote to one MAWS connection: every request and notification, in order.
const wire = connection => connection.port.received.filter(m => typeof m.method === 'string');
const methods = connection => wire(connection).map(m => m.method);
// The primitives the broker answers with [] while cold (anything else starts the render host).
const INVENTORY = new Set(['tabs.query', 'windows.query', 'debugger.getTargets']);
const inventory = list => list.filter(m => INVENTORY.has(m));

// cua's client mode against a fake MAWS peer at `path`, with the relay admitting this process.
async function connected(t, {extension = {}, path} = {}) {
  const h = home(t);
  const peer = await startFakeMawsPeer({path: path ?? join(h, 'p.sock'), extension});
  t.after(() => peer.stop());
  const client = startClientBackends({home: h, paths: [peer.path], peerAddon: admitSelf});
  t.after(() => client.close());
  await client.waitForHellos();
  assert.equal(client.entries()[0].ready, true);
  return {h, peer, client, connection: peer.connections[0], hostPath: client.hostPaths()[0]};
}

// The vendor's side of the host socket, request by request (the backend protocol the browser service speaks).
function vendorClient(path) {
  return new Promise((resolve, reject) => {
    const socket = connect(path);
    const peer = createPeer({send: bytes => socket.write(bytes)});
    const decode = frameDecoder();
    socket.on('data', chunk => { for (const m of decode(chunk)) peer.receive(m); });
    socket.once('error', reject);
    socket.once('connect', () => resolve({
      request: (method, params = {}) => peer.request(method, params),
      call: (method, params = {}) => peer.request(method, {session_id: 's', turn_id: 't', ...params}),
      close: () => socket.destroy(),
    }));
  });
}

// cua's browser service (what the vendor's listBrowsers, createBrowserTab and tab.screenshot run in production) on the
// client-mode host, under a stand-in node_repl runtime.
async function browserService(t, hostPath) {
  const runtime = {
    env: {BROWSER_USE_BACKEND_PATHS: hostPath, BROWSER_USE_AVAILABLE_BACKENDS: 'chrome'},
    requestMeta: {'x-codex-turn-metadata': {session_id: 'session-a', turn_id: 'turn-1'}},
    nativePipe: {createConnection: nativePipeConnect},
    addTurnEndedHandler: () => () => {},
  };
  const service = createBrowserService({runtime});
  t.after(() => service.dispose());
  const execute = params => service.handleRpc({method: 'execute', params});
  await service.handleRpc({method: 'setup', params: {environment: 'codex-app'}});
  const [browser] = await execute({type: 'list_browsers'});
  return {service, execute, browserId: browser.id};
}

// ---- 1 -------------------------------------------------------------------------------------------------------------

contract(1, 'no backend request at the host\'s start: nothing before MAWS\'s hello, nothing after it until a consumer asks', async t => {
  // Before the hello: a MAWS that accepts and stays silent hears nothing from cua.
  const h = home(t);
  const silentPath = join(h, 'silent.sock');
  const heard = [];
  const silent = await rawServer(t, silentPath, socket => socket.on('data', chunk => heard.push(chunk)));
  const waiting = startClientBackends({home: h, paths: [silentPath], peerAddon: admitSelf});
  t.after(() => waiting.close());
  await silent.accepted;
  await sleep(QUIET_MS);
  assert.deepEqual(heard, [], 'cua writes nothing to MAWS before MAWS\'s hello');
  await waiting.close();
  await silent.close();

  // After the hello: the host listens and sends nothing, and the consumer's start (the browser service's setup and
  // list_browsers, getInfo and ping on the host socket) is answered from the host's own state.
  const {connection, hostPath} = await connected(t);
  await sleep(QUIET_MS);
  assert.deepEqual(methods(connection), [], 'nothing sent once the host listens');
  const {browserId} = await browserService(t, hostPath);
  assert.equal(typeof browserId, 'string');
  const vendor = await vendorClient(hostPath);
  t.after(() => vendor.close());
  assert.equal((await vendor.request('getInfo')).metadata.profileName, MAWS_PROFILE_NAME);
  assert.equal(await vendor.request('ping'), 'pong');
  await sleep(QUIET_MS);
  assert.deepEqual(methods(connection), [], 'no request to MAWS for getInfo, ping, setup or list_browsers');
});

// ---- 2 -------------------------------------------------------------------------------------------------------------

contract(2, 'tabs.query, windows.query and debugger.getTargets are sent only on a consumer\'s demand, one per request', async t => {
  const {connection, hostPath} = await connected(t);
  const vendor = await vendorClient(hostPath);
  t.after(() => vendor.close());
  let seen = 0;
  // The frames each consumer request makes cua send, from the last one on.
  const sentFor = async request => { await request(); await sleep(QUIET_MS); const out = methods(connection).slice(seen); seen = methods(connection).length; return out; };

  await sleep(QUIET_MS);
  assert.deepEqual(methods(connection), [], 'no inventory read on its own');
  assert.deepEqual(await sentFor(() => vendor.call('getTabs')), ['tabs.query']);
  assert.deepEqual(await sentFor(() => vendor.call('getUserTabs')), ['tabs.query']);
  const tab = await vendor.call('createTab');
  seen = methods(connection).length;
  assert.deepEqual(inventory(await sentFor(() => vendor.call('attach', {tabId: tab.id}))), [], 'an attach reads no inventory');
  assert.deepEqual(await sentFor(() => vendor.call('executeCdp', {target: {tabId: tab.id}, method: 'Target.getTargets'})), ['debugger.getTargets']);
  assert.deepEqual(inventory(await sentFor(() => vendor.call('executeCdp', {target: {tabId: tab.id}, method: 'Runtime.evaluate', commandParams: {expression: '1'}}))),
    [], 'an ordinary command reads no inventory');
  await sleep(QUIET_MS);
  assert.equal(methods(connection).length, seen, 'and none after it');
});

// ---- 3 -------------------------------------------------------------------------------------------------------------

contract(3, 'tab creation is windows.query, then windows.create only when no normal window exists, then tabs.create in that window', async t => {
  // No window (the broker answers windows.query with []): cua's create_tab sends exactly these three, in this order.
  const cold = await connected(t, {extension: {windows: []}});
  const {execute, browserId} = await browserService(t, cold.hostPath);
  const {id} = await execute({type: 'create_tab', browser_id: browserId});
  await sleep(QUIET_MS);
  const [query, create, tabsCreate, ...rest] = wire(cold.connection);
  assert.deepEqual([query.method, query.params], ['windows.query', {}]);
  assert.deepEqual([create.method, create.params], ['windows.create', {focused: false}]);
  const windowId = cold.connection.ext.state.windows.keys().next().value;
  assert.deepEqual([tabsCreate.method, tabsCreate.params], ['tabs.create', {url: 'about:blank', windowId, group: {key: 'session-a', title: 'cua'}, guard: true}]);
  assert.equal(String(cold.connection.ext.state.tabs.keys().next().value), id);
  assert.deepEqual(rest.map(m => m.method), [], 'creating the tab sends nothing more');

  // A normal window exists: no windows.create; the tab goes to the focused normal window. A window that is not
  // `normal` (a popup) counts as none.
  const warm = await connected(t, {extension: {windows: [{id: 7, focused: false, type: 'normal'}, {id: 8, focused: true, type: 'normal'}]}});
  const vendor = await vendorClient(warm.hostPath);
  t.after(() => vendor.close());
  await vendor.call('createTab');
  assert.deepEqual(wire(warm.connection).map(m => [m.method, m.params.windowId]), [['windows.query', undefined], ['tabs.create', 8]]);
  const popup = await connected(t, {extension: {windows: [{id: 9, focused: true, type: 'popup'}]}});
  const other = await vendorClient(popup.hostPath);
  t.after(() => other.close());
  await other.call('createTab');
  assert.deepEqual(methods(popup.connection), ['windows.query', 'windows.create', 'tabs.create']);
});

// ---- 4 -------------------------------------------------------------------------------------------------------------

contract(4, 'a screenshot sends no Page.enable: its image is its own screencast\'s frame, or a capture\'s answer', async t => {
  let peer = null;
  let dpr = 1, frameSession = 0;
  const FRAME = 'RlJFU0g=', CAPTURE = 'Q0FQVFVSRQ==';
  const blank = new Map();   // connection ext -> its blank page
  const cdp = request => {
    const {ext} = peer.connections.at(-1);
    if (!blank.has(ext)) blank.set(ext, blankPageCdp(ext));
    const {debuggee, method, params} = request;
    if (method === 'Runtime.evaluate' && params?.expression === 'window.devicePixelRatio') return {result: {type: 'number', value: dpr}};
    // The frame comes only because of the screencast this lease started (MAWS's event scope: Page.enable alone never
    // subscribes frames).
    if (method === 'Page.startScreencast') {
      setImmediate(() => ext.cdpEvent(debuggee, 'Page.screencastFrame', {data: FRAME, sessionId: ++frameSession, metadata: {timestamp: Date.now() / 1000 + 1}}));
      return {};
    }
    if (method === 'Page.captureScreenshot') return {data: CAPTURE};
    return blank.get(ext)(request);
  };
  const env = await connected(t, {extension: {cdp}});
  peer = env.peer;
  const {execute, browserId} = await browserService(t, env.hostPath);
  const {id} = await execute({type: 'create_tab', browser_id: browserId});
  const shoot = () => execute({type: 'tab_screenshot', browser_id: browserId, tab_id: id});
  const commands = () => wire(env.connection).filter(m => m.method === 'debugger.sendCommand').map(m => m.params.method);
  // The tab's first CDP use attaches it (the CDP controller's lazy attach, src/browser-service/cdp.mjs); the attach's
  // own preamble is not the screenshot's and is not pinned here.
  assert.deepEqual(await shoot(), {data: FRAME});

  // The contract is what a screenshot sends and where its image comes from; its other reads (the page's scale and
  // viewport) and their order are its own.
  let before = commands().length;
  assert.deepEqual(await shoot(), {data: FRAME}, 'the image is the frame MAWS sent after the screenshot\'s Page.startScreencast');
  let own = commands().slice(before);
  assert.ok(own.includes('Page.startScreencast'), `the screenshot started its own screencast: ${own}`);
  assert.ok(!own.includes('Page.enable'), `no Page.enable among the screenshot's commands: ${own}`);

  dpr = 0.5;   // a page zoomed out is captured without a screencast
  before = commands().length;
  assert.deepEqual(await shoot(), {data: CAPTURE}, 'the image is the Page.captureScreenshot answer');
  own = commands().slice(before);
  assert.ok(own.includes('Page.captureScreenshot'), `the screenshot asked for a capture: ${own}`);
  assert.ok(!own.includes('Page.enable'), `no Page.enable among the screenshot's commands: ${own}`);
});

// ---- 5 -------------------------------------------------------------------------------------------------------------

contract(5, 'a launch waits HELLO_WAIT_MS (5 s) for MAWS\'s hello; a connection that fails or ends is retried every CLIENT_RETRY_MS (5 s), for the process\'s life', async t => {
  assert.equal(HELLO_WAIT_MS, 5000);
  assert.equal(CLIENT_RETRY_MS, 5000);
  const h = home(t);
  // The clock is mocked; the oracle is what MAWS sees under it: when the launch's wait ends and when connections arrive.
  // A timer only fires if it was set before the clock moves, so each step first waits until the client is idle with a
  // wait armed (some timer pending, nothing set or cleared for a moment). That gate reads neither a delay nor who set
  // the timer.
  t.mock.timers.enable({apis: ['setTimeout']});
  const mockedSet = globalThis.setTimeout, mockedClear = globalThis.clearTimeout;
  const pending = new Set();
  let changes = 0;
  globalThis.setTimeout = (fn, ms, ...args) => {
    const id = mockedSet((...a) => { pending.delete(id); changes += 1; fn(...a); }, ms, ...args);
    pending.add(id);
    changes += 1;
    return id;
  };
  globalThis.clearTimeout = id => { if (pending.delete(id)) changes += 1; return mockedClear(id); };
  t.after(() => { globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout; t.mock.timers.reset(); });
  const tick = ms => t.mock.timers.tick(ms);
  const armed = async () => {
    for (;;) {
      await waitFor(() => pending.size > 0, 'the client arming its next wait');
      const seen = changes;
      await sleep(20);
      if (changes === seen && pending.size > 0) return;
    }
  };

  // The launch's wait: a MAWS that accepts and has not said hello yet holds it for exactly HELLO_WAIT_MS, never longer.
  const silentPath = join(h, 'silent.sock');
  let silentConnections = 0;
  const silent = await rawServer(t, silentPath, () => { silentConnections += 1; });
  const launch = startClientBackends({home: h, paths: [silentPath], peerAddon: admitSelf});
  t.after(() => launch.close());
  const socket = await silent.accepted;
  let waited = false;
  launch.waitForHellos().then(() => { waited = true; });
  await armed();
  tick(HELLO_WAIT_MS - 1);
  await sleep(20);
  assert.equal(waited, false, 'still waiting just before 5 s');
  tick(1);
  await waitFor(() => waited, 'the hello wait ending at 5 s', 1000);   // bounded: a longer wait fails here, never hangs
  // The wait bounds the launch only: the connection keeps waiting for the hello, with no retry, however long, and a
  // late hello still connects.
  tick(3 * CLIENT_RETRY_MS);
  await sleep(30);
  assert.equal(silentConnections, 1, 'no second connection while the first waits for its hello');
  assert.equal(launch.entries()[0].ready, false);
  socket.write(encodeFrame({jsonrpc: '2.0', method: 'hello', params: {extensionId: 'maws', extensionInstanceId: 'maws:late', version: '0.1.0', protocolVersion: 1, profileName: 'MAWS'}}));
  await waitFor(() => launch.entries()[0].ready, 'the late hello connecting');
  await launch.close();
  await silent.close();

  // The retry cycle. A MAWS that drops every connection before its hello: one attempt at once, then one every 5 s.
  const path = join(h, 'p.sock');
  let attempts = 0;
  const dropping = await rawServer(t, path, s => { attempts += 1; s.destroy(); });
  const client = startClientBackends({home: h, paths: [path], peerAddon: admitSelf});
  t.after(() => client.close());
  await waitFor(() => attempts === 1, 'the first attempt, made at once');
  for (let n = 2; n <= 4; n += 1) {
    await armed();
    tick(CLIENT_RETRY_MS - 1);
    await sleep(30);
    assert.equal(attempts, n - 1, `no attempt ${n} before 5 s`);
    tick(1);
    await waitFor(() => attempts === n, `attempt ${n} at 5 s`);
  }
  // Nothing listening (ENOENT) for one cycle: the attempt after it is again 5 s on.
  await armed();
  await dropping.close();
  tick(CLIENT_RETRY_MS);
  await armed();
  // MAWS comes up: connected at the next 5 s, not before.
  let peer = await startFakeMawsPeer({path});
  tick(CLIENT_RETRY_MS - 1);
  await sleep(30);
  assert.equal(peer.connections.length, 0);
  tick(1);
  await waitFor(() => client.entries()[0].ready, 'connecting at 5 s');
  // MAWS quits and comes back (its relaunch while the engine lives): the lost connection is retried on the same cycle.
  await peer.stop();
  await waitFor(() => !client.entries()[0].ready, 'the connection lost');
  await armed();
  peer = await startFakeMawsPeer({path});
  t.after(() => peer.stop());
  tick(CLIENT_RETRY_MS - 1);
  await sleep(30);
  assert.equal(peer.connections.length, 0);
  tick(1);
  await waitFor(() => client.entries()[0].ready && peer.live().length === 1, 'reconnecting at 5 s');
});

// ---- 6 -------------------------------------------------------------------------------------------------------------

contract(6, 'a hello with a non-empty profileName makes the backend a cursor peer: a last tab closes with no keep-window tabs.create; an empty or absent one does not', async t => {
  // Three peers alike in all but the hello's profileName.
  for (const [label, helloFields, cursorPeer] of [
    ['profileName "MAWS"', {extensionId: 'maws', profileName: 'MAWS'}, true],
    ['profileName ""', {extensionId: 'maws', profileName: ''}, false],
    ['no profileName', {extensionId: 'maws'}, false],
  ]) {
    const {connection, hostPath} = await connected(t, {extension: {helloFields}});
    const vendor = await vendorClient(hostPath);
    t.after(() => vendor.close());
    const since = (n, what) => methods(connection).slice(n).filter(m => what.includes(m));
    const info = await vendor.request('getInfo');
    assert.equal(info.metadata.profileName, cursorPeer ? 'MAWS' : undefined, `${label}: getInfo's profile name`);

    // The turn's end closes the turn's created tab, its window's only tab.
    const tab = await vendor.call('createTab');
    let n = methods(connection).length;
    await vendor.request('turnEnded', {session_id: 's', turn_id: 't'});
    await sleep(QUIET_MS);
    assert.deepEqual(since(n, ['tabs.query', 'windows.query', 'tabs.create', 'tabs.remove']),
      cursorPeer ? ['tabs.remove'] : ['tabs.query', 'windows.query', 'tabs.create', 'tabs.remove'], `${label}: a turn's end closing a last tab`);
    if (!cursorPeer) assert.deepEqual(wire(connection).find((m, i) => i >= n && m.method === 'tabs.create').params, {windowId: 1}, `${label}: the keep-window New Tab page`);
    assert.equal(connection.ext.state.tabs.has(tab.id), false);

    // The agent's own close (cua's tab.close: Target.closeTarget through executeCdp), and the agent's cursor.
    const turn2 = {session_id: 's', turn_id: 't2'};
    const next = await vendor.call('createTab', turn2);
    await vendor.call('attach', {...turn2, tabId: next.id});
    n = methods(connection).length;
    await vendor.call('moveMouse', {...turn2, tabId: next.id, x: 5, y: 6});
    assert.deepEqual(since(n, ['cursor.move']), cursorPeer ? ['cursor.move'] : [], `${label}: moveMouse`);
    // A cursor peer gets the close as sent; any other peer has it preceded by the target lookup and the window check
    // (the window keeps the first close's New Tab page here, so that check opens no other).
    n = methods(connection).length;
    await vendor.call('executeCdp', {...turn2, target: {tabId: next.id}, method: 'Target.closeTarget', commandParams: {targetId: `T-${next.id}`}});
    await sleep(QUIET_MS);
    assert.deepEqual(since(n, ['debugger.getTargets', 'tabs.query', 'windows.query', 'tabs.create', 'debugger.sendCommand']),
      cursorPeer ? ['debugger.sendCommand'] : ['debugger.getTargets', 'tabs.query', 'windows.query', 'debugger.sendCommand'], `${label}: Target.closeTarget`);
  }
});
