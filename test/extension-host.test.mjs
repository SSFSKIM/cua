// The cua extension (extension/background.js) against the real host (src/chrome/host.mjs), no Chrome: the worker runs
// under the chrome.* stub (test/helpers/chrome-stub.mjs), whose runtime.connectNative spawns host.mjs as Chrome does,
// and a socket client speaks the vendor backend wire to that host. Spec:
// docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md, "The extension", "The extension protocol", H3a.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {connect} from 'node:net';
import {join} from 'node:path';
import {createPeer, frameDecoder} from '../src/chrome/protocol.mjs';
import {backendDir, CUA_EXTENSION_ID, CUA_HOST_NAME, PROTOCOL_VERSION, socketNameFor} from '../src/chrome/extension.mjs';
import {CdpError, createChromeStub, MANIFEST} from './helpers/chrome-stub.mjs';
import {shortScratch} from './fixtures/runtime-fixture.mjs';

const waitFor = async (predicate, what, ms = 5000) => {
  const deadline = Date.now() + ms;
  while (!(await predicate())) { if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`); await new Promise(r => setTimeout(r, 5)); }
};
const status = stub => stub.sendMessage({type: 'cua.status'});
// A socket file can outlive a killed host; serving means a connection is accepted.
const serving = path => new Promise(resolve => {
  const socket = connect(path);
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
});

// The worker loaded in a scratch home; resolves once its host listens.
async function start(t, options = {}) {
  const scratch = shortScratch('cua-x-');
  const stub = createChromeStub({home: scratch.dir, ...options});
  t.after(async () => { await stub.shutdown(); scratch.cleanup(); });
  stub.load();
  await waitFor(() => stub.port?.posted.length > 0, 'hello');
  const id = stub.port.posted[0].params.extensionInstanceId;
  const name = socketNameFor(id);
  const socketPath = join(backendDir(scratch.dir), `${name}.sock`);
  const statusPath = join(backendDir(scratch.dir), `${name}.json`);
  await waitFor(() => existsSync(socketPath), 'the host socket');
  return {stub, home: scratch.dir, id, socketPath, hostStatus: () => JSON.parse(readFileSync(statusPath, 'utf8'))};
}

// A backend client as the vendor service is one: u32-framed JSON-RPC 2.0, notifications recorded.
function backendClient(t, path) {
  return new Promise((resolve, reject) => {
    const socket = connect(path);
    t.after(() => socket.destroy());
    const notes = [];
    const peer = createPeer({send: bytes => socket.write(bytes),
      handlers: {onCDPEvent: p => { notes.push({method: 'onCDPEvent', params: p}); }, onCDPDetach: p => { notes.push({method: 'onCDPDetach', params: p}); }}});
    const decode = frameDecoder();
    socket.on('data', chunk => { for (const m of decode(chunk)) peer.receive(m); });
    socket.once('error', reject);
    socket.on('close', () => peer.close('socket closed'));
    socket.once('connect', () => resolve({
      notes,
      session(sessionId, turn = 't1') {
        return {call: (method, params = {}) => peer.request(method, {...params, session_id: sessionId, turn_id: turn, session_context: 'test'}),
          end: () => peer.request('turnEnded', {session_id: sessionId, turn_id: turn})};
      },
      request: (method, params) => peer.request(method, params),
    }));
  });
}

test('at load the worker connects to the cua host, says hello first with a minted instance id it keeps, and the host serves it', async t => {
  const {stub, id, socketPath} = await start(t);
  assert.deepEqual(stub.callsOf('runtime.connectNative'), [[CUA_HOST_NAME]]);
  assert.deepEqual(stub.port.posted[0], {jsonrpc: '2.0', method: 'hello',
    params: {extensionId: CUA_EXTENSION_ID, extensionInstanceId: id, version: MANIFEST.version, protocolVersion: PROTOCOL_VERSION}});
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(stub.state.storage.extensionInstanceId, id, 'kept under the key the vendor and cua\'s directory map read');
  assert.deepEqual(stub.state.alarms.get('cua-reconnect'), {name: 'cua-reconnect', periodInMinutes: 1});

  const c = await backendClient(t, socketPath);
  assert.deepEqual(await c.request('getInfo', {}), {type: 'extension', family: 'chrome', name: 'cua', version: MANIFEST.version,
    capabilities: {browser: [], tab: []}, metadata: {extensionInstanceId: id}});

  // The lifecycle wake-ups and the alarm do nothing while the port is up.
  stub.events.startup.dispatch();
  stub.events.installed.dispatch({reason: 'update'});
  stub.fireAlarm('cua-reconnect');
  await new Promise(r => setTimeout(r, 30));
  assert.equal(stub.ports.length, 1);
  assert.deepEqual(await status(stub), {hostName: CUA_HOST_NAME, connected: true, refusal: null, error: null, instanceId: id, debuggees: 0});
  assert.deepEqual(stub.console.lines, []);
});

test('createTab opens an inactive tab in the session\'s own group; nameSession renames only that group; turn end closes or ungroups', async t => {
  const {stub, socketPath, hostStatus} = await start(t);
  const user = stub.addTab({title: 'Mine', url: 'https://user.invalid/', active: true});
  const c = await backendClient(t, socketPath);
  const a = c.session('sess-a'), b = c.session('sess-b');
  const a1 = await a.call('createTab', {}), a2 = await a.call('createTab', {}), b1 = await b.call('createTab', {});
  const tab = id => stub.state.tabs.get(id);

  for (const args of stub.callsOf('tabs.create')) assert.equal(args[0].active, false, 'agent tabs never take the user\'s focus');
  assert.equal(tab(a1.id).active, false);
  assert.equal(tab(user.id).active, true);
  assert.equal(tab(a1.id).groupId, tab(a2.id).groupId, 'one group per session and window');
  assert.notEqual(tab(a1.id).groupId, tab(b1.id).groupId, 'sessions never share a group');
  assert.equal(stub.state.groups.get(tab(a1.id).groupId).title, 'cua');
  assert.equal(tab(user.id).groupId, -1);

  await a.call('nameSession', {name: 'Checkout flow'});
  assert.equal(stub.state.groups.get(tab(a1.id).groupId).title, 'Checkout flow');
  assert.equal(stub.state.groups.get(tab(b1.id).groupId).title, 'cua');

  await a.call('markTab', {tabId: a2.id, status: 'deliverable'});
  await a.end();
  assert.equal(stub.state.tabs.has(a1.id), false, 'the unmarked created tab closed');
  assert.equal(tab(a2.id).groupId, -1, 'the deliverable stays open and leaves the group');
  assert.ok(tab(b1.id), 'the other session\'s tab is untouched');
  assert.deepEqual(hostStatus().sessions.find(s => s.session_id === 'sess-a').tabs, []);
});

test('attach, executeCdp, events and child sessions relay through chrome.debugger; Target.getTargets is the getTargets primitive', async t => {
  const {stub, socketPath, hostStatus} = await start(t);
  const c = await backendClient(t, socketPath);
  const s = c.session('sess');
  const {id} = await s.call('createTab', {});
  await s.call('attach', {tabId: id});
  assert.deepEqual(stub.callsOf('debugger.attach'), [[{tabId: id}, '1.3']]);
  assert.equal(hostStatus().sessions[0].tabs[0].attached, true);
  assert.equal((await status(stub)).debuggees, 1);

  assert.deepEqual(await s.call('executeCdp', {target: {tabId: id}, method: 'Runtime.evaluate', commandParams: {expression: '6*7'}}),
    {result: {type: 'string', value: 'evaluated:6*7'}});
  await s.call('executeCdp', {target: {tabId: id, sessionId: 'CHILD-1'}, method: 'Runtime.enable'});
  assert.deepEqual(stub.callsOf('debugger.sendCommand').map(([target, method]) => [target, method]),
    [[{tabId: id}, 'Runtime.evaluate'], [{tabId: id, sessionId: 'CHILD-1'}, 'Runtime.enable']]);

  const {targetInfos} = await s.call('executeCdp', {target: {tabId: id}, method: 'Target.getTargets'});
  assert.ok(targetInfos.some(x => x.tabId === id && x.attached === true));
  assert.equal(stub.callsOf('debugger.sendCommand').length, 2, 'Target.getTargets never goes through sendCommand');

  stub.cdpEvent({tabId: id}, 'Page.loadEventFired', {timestamp: 1});
  stub.cdpEvent({tabId: id, sessionId: 'CHILD-1'}, 'Runtime.consoleAPICalled', {type: 'log'});
  await waitFor(() => c.notes.length === 2, 'two CDP events');
  assert.deepEqual(c.notes, [
    {method: 'onCDPEvent', params: {source: {tabId: id}, method: 'Page.loadEventFired', params: {timestamp: 1}}},
    {method: 'onCDPEvent', params: {source: {tabId: id, sessionId: 'CHILD-1'}, method: 'Runtime.consoleAPICalled', params: {type: 'log'}}},
  ]);

  // An attachment Chrome kept for this extension (its worker forgot it) is adopted: the host's attach succeeds.
  const kept = await s.call('createTab', {});
  stub.state.attached.set(`tab:${kept.id}`, {tabId: kept.id});
  assert.deepEqual(await s.call('attach', {tabId: kept.id}), {});
  assert.equal((await status(stub)).debuggees, 2);
  await s.call('detach', {tabId: kept.id});

  await s.call('detach', {tabId: id});
  assert.equal(stub.state.attached.size, 0);
  assert.equal((await status(stub)).debuggees, 0);
});

test('a CDP-level error reaches the backend client verbatim, as the JSON string Chrome gives', async t => {
  const {socketPath} = await start(t, {cdp: ({method}) => {
    if (method === 'DOM.describeNode') throw new CdpError(-32000, 'Could not find node with given id');
    return {};
  }});
  const c = await backendClient(t, socketPath);
  const s = c.session('sess');
  const {id} = await s.call('createTab', {});
  await s.call('attach', {tabId: id});
  await assert.rejects(s.call('executeCdp', {target: {tabId: id}, method: 'DOM.describeNode', commandParams: {nodeId: 9}}),
    {message: '{"code":-32000,"message":"Could not find node with given id"}'});
});

test('commands in flight when the user cancels debugging or closes the tab fail with Chrome\'s "Detached while handling command."', async t => {
  const {stub, socketPath} = await start(t);
  const c = await backendClient(t, socketPath);
  const s = c.session('sess');
  stub.holdCdp('Page.navigate');
  for (const cut of [id => stub.userCancel({tabId: id}), id => stub.userCloseTab(id)]) {
    const {id} = await s.call('createTab', {});
    await s.call('attach', {tabId: id});
    const inFlight = s.call('executeCdp', {target: {tabId: id}, method: 'Page.navigate', commandParams: {url: 'http://127.0.0.1:9/'}});
    await waitFor(() => stub.state.pending.size === 1, 'the command reaching Chrome');
    cut(id);
    await assert.rejects(inFlight, {message: 'Detached while handling command.'});
  }
});

test('a cross-origin iframe attaches by targetId: commands are routed to it and its events name it', async t => {
  const {stub, socketPath} = await start(t);
  const c = await backendClient(t, socketPath);
  const s = c.session('sess');
  const {id} = await s.call('createTab', {});
  await s.call('attach', {tabId: id});
  const frame = stub.addFrame(id);
  await s.call('attachTarget', {tabId: id, targetId: frame});
  assert.deepEqual(stub.callsOf('debugger.attach').at(-1), [{targetId: frame}, '1.3']);

  assert.deepEqual(await s.call('executeCdp', {target: {tabId: id, targetId: frame}, method: 'Runtime.evaluate', commandParams: {expression: 'frame'}}),
    {result: {type: 'string', value: 'evaluated:frame'}});
  assert.deepEqual(stub.callsOf('debugger.sendCommand').at(-1).slice(0, 2), [{targetId: frame}, 'Runtime.evaluate']);

  stub.cdpEvent({targetId: frame}, 'Runtime.executionContextCreated', {context: {id: 3}});
  await waitFor(() => c.notes.length === 1, 'the frame event');
  assert.deepEqual(c.notes[0].params.source, {tabId: id, targetId: frame});
  assert.equal((await status(stub)).debuggees, 2);

  await s.call('detachTarget', {tabId: id, targetId: frame});
  assert.deepEqual([...stub.state.attached.values()], [{tabId: id}]);
});

test('a detach the user caused and a tab the user closed reach the host', async t => {
  const {stub, socketPath, hostStatus} = await start(t);
  const c = await backendClient(t, socketPath);
  const s = c.session('sess');
  const one = await s.call('createTab', {}), two = await s.call('createTab', {});
  await s.call('attach', {tabId: one.id});
  stub.userCancel({tabId: one.id});
  await waitFor(() => c.notes.length === 1, 'the detach');
  assert.deepEqual(c.notes[0], {method: 'onCDPDetach', params: {tabId: one.id, reason: 'canceled_by_user'}});
  assert.equal((await status(stub)).debuggees, 0);

  stub.userCloseTab(two.id);
  await waitFor(() => !hostStatus().sessions[0].tabs.some(x => x.tabId === two.id), 'the host releasing the closed tab');
  assert.deepEqual((await s.call('getTabs')).map(x => x.id), [one.id]);
});

test('a profile with no normal window gets one, unfocused, and the tab opens there', async t => {
  const {stub, socketPath} = await start(t, {windows: [{id: 7, focused: true, type: 'popup'}]});
  const c = await backendClient(t, socketPath);
  const {id} = await c.session('sess').call('createTab', {});
  assert.deepEqual(stub.callsOf('windows.create'), [[{focused: false, type: 'normal'}]]);
  const created = stub.state.tabs.get(id);
  assert.notEqual(created.windowId, 7);
  assert.equal(stub.state.windows.get(created.windowId).focused, false);
});

test('an over-1 MB message to the extension is refused (message_too_large) and never sent; a large answer from it arrives', async t => {
  const big = 'x'.repeat(2 * 1024 * 1024);
  const {stub, socketPath} = await start(t, {cdp: ({method, params}) => (method === 'Page.captureScreenshot' ? {data: big} : {echo: params?.expression ?? null})});
  const c = await backendClient(t, socketPath);
  const s = c.session('sess');
  const {id} = await s.call('createTab', {});
  await s.call('attach', {tabId: id});
  const sent = stub.callsOf('debugger.sendCommand').length;
  await assert.rejects(s.call('executeCdp', {target: {tabId: id}, method: 'Runtime.evaluate', commandParams: {expression: big}}), {message: 'message_too_large'});
  assert.equal(stub.callsOf('debugger.sendCommand').length, sent, 'the extension never saw it');
  assert.equal(stub.port.connected, true, 'Chrome did not tear the port down');
  assert.deepEqual(await s.call('executeCdp', {target: {tabId: id}, method: 'Runtime.evaluate', commandParams: {expression: 'small'}}), {echo: 'small'});
  assert.equal((await s.call('executeCdp', {target: {tabId: id}, method: 'Page.captureScreenshot'})).data.length, big.length);
});

test('when the port drops the worker detaches every debuggee it holds, then retries every 5 s and is served again at the same path', async t => {
  const {stub, id, socketPath} = await start(t);
  const c = await backendClient(t, socketPath);
  const s = c.session('sess');
  const tab = await s.call('createTab', {});
  await s.call('attach', {tabId: tab.id});
  const frame = stub.addFrame(tab.id);
  await s.call('attachTarget', {tabId: tab.id, targetId: frame});
  assert.equal(stub.state.attached.size, 2);

  stub.port.child.kill('SIGKILL');
  await waitFor(() => stub.state.attached.size === 0, 'every debuggee detached');
  assert.deepEqual(new Set(stub.callsOf('debugger.detach').map(([d]) => JSON.stringify(d))),
    new Set([JSON.stringify({tabId: tab.id}), JSON.stringify({targetId: frame})]));
  assert.deepEqual(await status(stub), {hostName: CUA_HOST_NAME, connected: false, refusal: null, error: 'Native host has exited.', instanceId: id, debuggees: 0});
  assert.deepEqual(stub.pendingTimers(), [5000]);

  stub.fireTimers(5000);
  await waitFor(() => stub.ports.length === 2 && stub.port.posted.length > 0, 'the reconnect');
  assert.equal(stub.port.posted[0].params.extensionInstanceId, id);
  await waitFor(() => serving(socketPath), 'the socket at its pre-listed path');
  const again = await backendClient(t, socketPath);
  assert.equal((await again.request('getInfo', {})).metadata.extensionInstanceId, id);
  assert.equal((await status(stub)).connected, true);
});

test('a host of another protocol refuses with hostRefused: the popup status shows protocol_mismatch and only the minute alarm retries', async t => {
  const scratch = shortScratch('cua-x-');
  const stub = createChromeStub({home: scratch.dir});
  t.after(async () => { await stub.shutdown(); scratch.cleanup(); });
  const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
  assert.match(source, /const PROTOCOL_VERSION = 1;/);
  stub.load(source.replace('const PROTOCOL_VERSION = 1;', 'const PROTOCOL_VERSION = 2;'));
  await waitFor(async () => !(await status(stub)).connected && stub.port?.exited, 'the refusal and the host exiting');
  const seen = await status(stub);
  assert.equal(seen.refusal.code, 'protocol_mismatch');
  assert.match(seen.refusal.message, /speaks protocol 2; this host speaks 1/);
  assert.deepEqual(stub.pendingTimers(), [], 'no 5 s retry against a host that will refuse again');

  stub.fireAlarm('cua-reconnect');
  await new Promise(r => setTimeout(r, 50));
  assert.equal(stub.ports.length, 1, 'backed off: no host spawned on the next alarm');
  stub.advance(60_000);
  stub.fireAlarm('cua-reconnect');
  await waitFor(() => stub.ports.length === 2, 'the alarm\'s retry');
  await waitFor(async () => stub.port.exited && !(await status(stub)).connected, 'the second refusal');
  assert.equal((await status(stub)).refusal.code, 'protocol_mismatch');
});

test('another extension\'s frame cannot wedge an agent tab, a page\'s window.open becomes the session\'s tab, and refusals reach the host log', async t => {
  const {stub, home, id, socketPath, hostStatus} = await start(t);
  const c = await backendClient(t, socketPath);
  const s = c.session('sess');
  const guarded = tabId => stub.page(tabId).run('isolated', 'globalThis.__cuaPageGuard !== undefined');

  // An agent tab: guarded from its first real document; the helper's frame on focus is blanked, the debugger stays.
  const {id: tab} = await s.call('createTab', {});
  await s.call('attach', {tabId: tab});
  stub.navigate(tab, 'https://site.invalid/login', 'Login');
  await waitFor(() => guarded(tab), 'the guard in the agent tab');
  stub.page(tab).addForeignFrame();
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(stub.page(tab).foreignFrames(), []);
  assert.equal(c.notes.some(n => n.method === 'onCDPDetach'), false);
  assert.deepEqual(await s.call('executeCdp', {target: {tabId: tab}, method: 'Runtime.evaluate', commandParams: {expression: 'ok'}}), {result: {type: 'string', value: 'evaluated:ok'}});

  // A user tab already showing such a frame: claiming and attaching it sweeps first, so Chrome lets the debugger in.
  const user = stub.addTab({url: 'https://user.invalid/', title: 'Mine'});
  stub.page(user.id).addForeignFrame('aaaabbbbccccddddeeeeffffgggghhhh', {shadow: 'closed'});
  await new Promise(r => setImmediate(r));
  await assert.rejects(stub.chrome.debugger.attach({tabId: user.id}, '1.3'), {message: 'Cannot access a chrome-extension:// URL of different extension'});
  await s.call('claimUserTab', {tabId: user.id});
  await s.call('attach', {tabId: user.id});
  assert.equal(stub.state.attached.has(`tab:${user.id}`), true);

  // The page opens a window on the agent's click: the session owns the new tab, active, in its group; no claim.
  const page = stub.page(tab);
  page.click(page.document.body.appendChild(page.element('button')));
  await page.run('main', 'window.open("/receipt")');
  await waitFor(async () => (await s.call('getTabs')).length === 3, 'the popup in the session');
  const listed = await s.call('getTabs');
  const popup = listed.find(x => x.id !== tab && x.id !== user.id);
  assert.equal(popup.active, true);
  assert.equal(stub.state.tabs.get(popup.id).url, 'https://site.invalid/receipt');
  assert.equal(stub.state.tabs.get(popup.id).openerTabId, tab);
  assert.equal(stub.state.tabs.get(popup.id).groupId, stub.state.tabs.get(tab).groupId);
  assert.equal(stub.state.tabs.get(popup.id).active, false, 'never takes the user\'s focus');
  assert.ok(hostStatus().sessions[0].tabs.some(x => x.tabId === popup.id && x.origin === 'created'));

  // The turn ends: the popup closes like any created tab, the claimed user tab is unguarded and released.
  await s.end();
  assert.equal(stub.state.tabs.has(popup.id), false);
  await waitFor(async () => !(await guarded(user.id)), 'the claimed tab unguarded (not waited for by turnEnded)');

  // The host log names what Chrome refused (here: guarding about:blank before the first navigation) and the popup.
  const log = readFileSync(join(home, 'chrome', 'logs', `${socketNameFor(id)}.log`), 'utf8');
  assert.match(log, new RegExp(`extension refused tabs\\.guard \\{"tabId":${tab}\\}: Cannot access contents of the page`));
  assert.match(log, new RegExp(`session sess took popup tab ${popup.id} from tab ${tab}`));
});
