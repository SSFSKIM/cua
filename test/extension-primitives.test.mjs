// The cua extension's primitives and connection rules, driven from a test-held host peer (the chrome.* stub's
// `nativeHost: 'fake'`): what the real host relies on but cannot be made to show — debugger.attach's alreadyHeld, the
// verbatim errors, the group bookkeeping, hostRefused and the retry rules, a worker restart. Spec:
// docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md, "The extension protocol".
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CUA_EXTENSION_ID, CUA_HOST_NAME} from '../src/chrome/extension.mjs';
import {createChromeStub} from './helpers/chrome-stub.mjs';

const waitFor = async (predicate, what, ms = 3000) => {
  const deadline = Date.now() + ms;
  while (!(await predicate())) { if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`); await new Promise(r => setTimeout(r, 2)); }
};
const status = stub => stub.sendMessage({type: 'cua.status'});

async function start(options = {}) {
  const stub = createChromeStub({nativeHost: 'fake', ...options});
  stub.load();
  await waitFor(() => stub.hostPeers[0]?.hello, 'hello');
  return {stub, host: stub.hostPeers[0]};
}

test('debugger.attach adopts what Chrome says this extension already holds (alreadyHeld: true); DevTools alongside is no obstacle', async () => {
  const {stub, host} = await start();
  const tab = stub.addTab();
  const frame = stub.addFrame(tab.id);
  assert.deepEqual(await host.request('debugger.attach', {tabId: tab.id}), {alreadyHeld: false});
  assert.deepEqual(await host.request('debugger.attach', {tabId: tab.id}), {alreadyHeld: true});
  assert.deepEqual(await host.request('debugger.attach', {targetId: frame}), {alreadyHeld: false});
  assert.deepEqual(await host.request('held', {}), [{tabId: tab.id}, {targetId: frame}]);

  // DevTools (or another extension) attached to a tab: Chromium attaches this extension alongside.
  const inspected = stub.addTab();
  stub.state.devtools.add(`tab:${inspected.id}`);
  assert.deepEqual(await host.request('debugger.attach', {tabId: inspected.id}), {alreadyHeld: false});
  assert.deepEqual(await host.request('debugger.detach', {tabId: inspected.id}), {});
  await assert.rejects(host.request('debugger.attach', {tabId: 999}), {message: 'No tab with given id 999.', code: 1});
  assert.equal((await host.request('held', {})).length, 2);

  // Chrome detached the tab behind the extension's back (the user's cancel): no longer held, so not "already held".
  stub.userCancel({tabId: tab.id});
  await waitFor(() => host.received.some(m => m.method === 'debugger.detached'), 'the detach notification');
  assert.deepEqual(host.received.find(m => m.method === 'debugger.detached').params, {debuggee: {tabId: tab.id}, reason: 'canceled_by_user'});
  assert.deepEqual(await host.request('held', {}), [{targetId: frame}]);
  assert.deepEqual(await host.request('debugger.attach', {tabId: tab.id}), {alreadyHeld: false});

  assert.deepEqual(await host.request('debugger.detach', {targetId: frame}), {});
  await assert.rejects(host.request('debugger.detach', {targetId: frame}), {message: `Debugger is not attached to the target with id: ${frame}.`});
  await assert.rejects(host.request('debugger.sendCommand', {debuggee: {targetId: frame}, method: 'Runtime.enable'}), {message: `Debugger is not attached to the target with id: ${frame}.`});
});

test('after the worker dies Chrome still holds its attachments: the new worker\'s attach adopts them, and a port drop then detaches them', async () => {
  const {stub, host} = await start();
  const tab = stub.addTab();
  const frame = stub.addFrame(tab.id);
  await host.request('debugger.attach', {tabId: tab.id});
  await host.request('debugger.attach', {targetId: frame});
  // The worker dies: its port closes and that host goes; the attachments stay with Chrome, the worker's memory is gone.
  stub.restartWorker();
  assert.equal(host.connected, false, 'the dead worker\'s port closed');
  assert.equal(stub.state.attached.size, 2, 'Chrome kept the attachments (the dead worker ran no cleanup)');
  await waitFor(() => stub.hostPeers[1]?.hello, 'the new worker\'s hello');
  const again = stub.hostPeers[1];
  assert.deepEqual(await again.request('held', {}), []);
  assert.deepEqual(await again.request('debugger.attach', {tabId: tab.id}), {alreadyHeld: true});
  assert.deepEqual(await again.request('debugger.attach', {targetId: frame}), {alreadyHeld: true});
  assert.deepEqual(await again.request('held', {}), [{tabId: tab.id}, {targetId: frame}]);
  again.exit();
  await waitFor(() => stub.state.attached.size === 0, 'the adopted debuggees detached on port drop');
});

test('the peer answers an unknown method with the exact No-handler string and Chrome\'s errors verbatim', async () => {
  const {stub, host} = await start();
  await assert.rejects(host.request('tabs.duplicate', {tabId: 1}), {message: 'No handler registered for method: tabs.duplicate', code: -1});
  await assert.rejects(host.request('tabs.get', {tabId: 4242}), {message: 'No tab with id: 4242.', code: 1});
  const tab = stub.addTab({title: 'T', url: 'https://t.invalid/'});
  assert.deepEqual(await host.request('tabs.get', {tabId: tab.id}), {id: tab.id, windowId: 1, url: 'https://t.invalid/', title: 'T', status: 'complete'});
  assert.deepEqual(await host.request('tabs.query', {}), [{id: tab.id, windowId: 1, url: 'https://t.invalid/', title: 'T', active: false, groupId: -1}]);
  assert.deepEqual(await host.request('windows.query', {}), [{id: 1, focused: true, type: 'normal'}]);
  const frame = stub.addFrame(tab.id);
  stub.state.devtools.add(`target:${frame}`);
  assert.deepEqual(await host.request('debugger.getTargets', {}), [{type: 'page', id: `PAGE-${tab.id}`, tabId: tab.id, attached: false, title: 'T', url: 'https://t.invalid/'},
    {type: 'other', id: frame, attached: true, title: '', url: 'http://127.0.0.1:9/frame'}]);
  assert.deepEqual(stub.console.lines, []);
});

test('tab removals and url/title/status updates are told to the host; nothing else is', async () => {
  const {stub, host} = await start();
  const tab = stub.addTab();
  stub.navigate(tab.id, 'https://next.invalid/', 'Next');
  stub.events.tabsUpdated.dispatch(tab.id, {audible: true}, {...tab});
  stub.userCloseTab(tab.id);
  await waitFor(() => host.received.some(m => m.method === 'tabs.removed'), 'tabs.removed');
  assert.deepEqual(host.received.slice(1).map(({method, params}) => ({method, params})), [
    {method: 'tabs.updated', params: {tabId: tab.id, url: 'https://next.invalid/', title: 'Next', status: 'complete'}},
    {method: 'tabs.removed', params: {tabId: tab.id}},
  ]);
});

test('groups are per (window, key): a closed or moved group is replaced, group.title renames only its own, and a failed group leaves the tab', async () => {
  const {stub, host} = await start();
  const w2 = stub.addWindow();
  const a = await host.request('tabs.create', {url: 'about:blank', windowId: 1, group: {key: 'S', title: 'cua'}});
  const b = await host.request('tabs.create', {url: 'about:blank', windowId: w2, group: {key: 'S', title: 'cua'}});
  assert.deepEqual(a, {id: a.id, windowId: 1});
  const g = id => stub.state.tabs.get(id).groupId;
  assert.notEqual(g(a.id), g(b.id), 'one group per window');
  assert.equal(stub.state.groups.get(g(b.id)).windowId, w2);

  await host.request('group.title', {windowId: 1, key: 'S', title: 'Renamed'});
  assert.equal(stub.state.groups.get(g(a.id)).title, 'Renamed');
  assert.equal(stub.state.groups.get(g(b.id)).title, 'cua');
  assert.deepEqual(await host.request('group.title', {windowId: 1, key: 'nobody', title: 'x'}), {});

  // The user closed the group's last tab: the group is gone, the next tab gets a new one.
  const old = g(a.id);
  stub.userCloseTab(a.id);
  const c = await host.request('tabs.create', {url: 'about:blank', windowId: 1, group: {key: 'S', title: 'Renamed'}});
  assert.notEqual(g(c.id), old);
  assert.equal(stub.state.groups.get(g(c.id)).title, 'Renamed');
  // The user dragged the group to another window: the next tab in window 1 gets a group there.
  stub.state.groups.get(g(c.id)).windowId = w2;
  const d = await host.request('tabs.create', {url: 'about:blank', windowId: 1, group: {key: 'S', title: 'Renamed'}});
  assert.equal(stub.state.groups.get(g(d.id)).windowId, 1);
  assert.equal(stub.state.tabs.get(d.id).windowId, 1);
  // group.title after the group vanished: nothing to rename.
  stub.state.groups.delete(g(d.id));
  assert.deepEqual(await host.request('group.title', {windowId: 1, key: 'S', title: 'y'}), {});

  // Grouping is cosmetic: when Chrome refuses it, the tab is still created and reported.
  const tabGroup = stub.chrome.tabs.group;
  stub.chrome.tabs.group = () => Promise.reject(new Error('Tabs cannot be edited right now (user may be dragging a tab).'));
  const e = await host.request('tabs.create', {url: 'about:blank', windowId: 1, group: {key: 'S', title: 'Renamed'}});
  stub.chrome.tabs.group = tabGroup;
  assert.equal(stub.state.tabs.get(e.id).groupId, -1);
  assert.match(stub.console.lines.join('\n'), /cannot group tab .*user may be dragging/);

  assert.deepEqual(await host.request('tabs.ungroup', {tabId: c.id}), {});
  assert.equal(g(c.id), -1);
  assert.deepEqual(await host.request('tabs.remove', {tabId: c.id}), {});
  assert.equal(stub.state.tabs.has(c.id), false);
  const w = await host.request('windows.create', {focused: false});
  assert.deepEqual(Object.keys(w), ['id']);
  assert.equal(stub.state.windows.get(w.id).focused, false);
});

test('concurrent tabs.create for one (window, session) share one new group', async () => {
  const {stub, host} = await start();
  const made = await Promise.all([1, 2, 3].map(() => host.request('tabs.create', {url: 'about:blank', windowId: 1, group: {key: 'S', title: 'cua'}})));
  assert.equal(new Set(made.map(t => stub.state.tabs.get(t.id).groupId)).size, 1);
  assert.equal(stub.callsOf('tabs.group').filter(([args]) => args.createProperties).length, 1);
  assert.equal(stub.state.groups.size, 1);
});

// Every host refuses with a lasting code; resolves once the n-th port is refused and closed.
async function refuse(stub, n) {
  await waitFor(() => stub.hostPeers[n]?.hello, `host ${n}'s hello`);
  stub.hostPeers[n].notify('hostRefused', {code: 'protocol_mismatch', message: 'the extension speaks protocol 1; this host speaks 2'});
  stub.hostPeers[n].exit();
  await waitFor(async () => !stub.hostPeers[n].connected && (await status(stub)).refusal && !(await status(stub)).connected, `host ${n}'s refusal`);
  await new Promise(r => setTimeout(r, 10));
}
// The alarm at `ms` after now spawns nothing until the backoff passes, then one host.
async function alarmAfter(stub, minutes) {
  const ports = stub.ports.length;
  stub.advance(minutes * 60_000 - 1);
  stub.fireAlarm('cua-reconnect');
  await new Promise(r => setTimeout(r, 20));
  assert.equal(stub.ports.length, ports, `nothing before ${minutes} min`);
  stub.advance(1);
  stub.fireAlarm('cua-reconnect');
  await waitFor(() => stub.ports.length === ports + 1, `the attempt at ${minutes} min`);
}

test('after a lasting refusal the alarm retries with backoff doubling to an hour, across worker restarts; onStartup/onInstalled reset it', async () => {
  const stub = createChromeStub({nativeHost: 'fake'});
  stub.load();
  await refuse(stub, 0);
  let n = 1;
  for (const minutes of [1, 2, 4, 8, 16, 32, 60, 60]) {
    await alarmAfter(stub, minutes);
    await refuse(stub, n++);
  }
  assert.deepEqual(stub.pendingTimers(), [], 'never the 5 s retry');

  // A restarted worker (the alarm woke it) keeps the backoff and still shows why.
  stub.load();
  await new Promise(r => setTimeout(r, 20));
  assert.equal(stub.hostPeers.length, n, 'the restarted worker did not connect at load');
  assert.equal((await status(stub)).refusal.code, 'protocol_mismatch');
  await alarmAfter(stub, 60);
  await refuse(stub, n++);

  // Chrome starting (or the extension updating) tries at once and starts the backoff over.
  stub.events.startup.dispatch();
  await waitFor(() => stub.hostPeers.length === n + 1, 'the startup attempt');
  await refuse(stub, n++);
  await alarmAfter(stub, 1);
  await refuse(stub, n++);
  stub.events.installed.dispatch({reason: 'update'});
  await waitFor(() => stub.hostPeers.length === n + 1, 'the update attempt');
});

test('opening the popup while a lasting refusal backs off clears the backoff and tries once at once; only then', async () => {
  const stub = createChromeStub({nativeHost: 'fake'});
  stub.load();
  await refuse(stub, 0);
  let n = 1;
  for (const minutes of [1, 2, 4, 8, 16, 32, 60]) { await alarmAfter(stub, minutes); await refuse(stub, n++); }
  // At the hour cap; the user updated cua and opens the popup.
  const elements = Object.fromEntries(['host', 'instance', 'debuggees'].map(id => [id, {textContent: ''}]));
  const {start: startPopup} = await import('../extension/popup.js');
  await startPopup({getElementById: id => elements[id]}, stub.chrome);
  await waitFor(() => stub.hostPeers.length === n + 1 && stub.hostPeers[n].hello, 'the popup\'s attempt');
  // Refused again: the popup re-renders on the change, and that spawns nothing more.
  await refuse(stub, n++);
  await waitFor(() => elements.host.textContent.includes('protocol_mismatch'), 'the popup showing the refusal');
  await new Promise(r => setTimeout(r, 30));
  assert.equal(stub.hostPeers.length, n, 'one attempt per popup open');
  // The backoff started over: the next alarm attempt is a minute away.
  await alarmAfter(stub, 1);
  await refuse(stub, n++);

  // Connected, or disconnected for another reason (the 5 s retry covers it): opening the popup spawns nothing.
  stub.events.startup.dispatch();
  await waitFor(() => stub.hostPeers[n]?.hello, 'a serving host');
  await startPopup({getElementById: id => elements[id]}, stub.chrome);
  await new Promise(r => setTimeout(r, 20));
  assert.equal(stub.hostPeers.length, n + 1);
  stub.hostPeers[n].exit();
  await waitFor(() => stub.pendingTimers().length === 1, 'the 5 s retry');
  await startPopup({getElementById: id => elements[id]}, stub.chrome);
  await new Promise(r => setTimeout(r, 20));
  assert.equal(stub.hostPeers.length, n + 1);
});

test('hostRefused is kept for the popup; a transient refusal (already_served) retries in 5 s, and a later serving port clears it', async () => {
  const {stub, host} = await start();
  host.notify('hostRefused', {code: 'already_served', message: 'another host serves /h/chrome/b/abc.sock'});
  await waitFor(async () => (await status(stub)).refusal, 'the refusal');
  assert.equal((await status(stub)).connected, false, 'a refused port is not connected');
  host.exit();
  await waitFor(() => !host.connected && stub.pendingTimers().length === 1, 'the port closing');
  const seen = await status(stub);
  assert.deepEqual(seen.refusal, {code: 'already_served', message: 'another host serves /h/chrome/b/abc.sock'});
  assert.deepEqual(stub.pendingTimers(), [5000]);
  stub.fireTimers();
  await waitFor(() => stub.hostPeers[1]?.hello, 'the second hello');
  const now = await status(stub);
  assert.equal(now.connected, true);
  assert.equal(now.refusal, null);
});

test('with no host registered the worker reports Chrome\'s reason and keeps retrying every 5 s', async () => {
  const stub = createChromeStub({nativeHost: 'fake', hostInstalled: false});
  stub.load();
  await waitFor(async () => (await status(stub)).error, 'the failure');
  assert.deepEqual(await status(stub), {hostName: CUA_HOST_NAME, connected: false, refusal: null,
    error: 'Specified native messaging host not found.', instanceId: stub.state.storage.extensionInstanceId, debuggees: 0});
  assert.deepEqual(stub.pendingTimers(), [5000]);
  stub.fireTimers();
  await waitFor(() => stub.ports.length === 2 && stub.pendingTimers().length === 1, 'the next attempt and its retry');
  // The minute alarm attempts at once and replaces the pending retry rather than adding one.
  stub.fireAlarm('cua-reconnect');
  await waitFor(() => stub.ports.length === 3 && stub.pendingTimers().length === 1, 'the alarm\'s attempt');
  assert.deepEqual(stub.pendingTimers(), [5000]);
});

test('a restarted worker keeps the instance id, and its load plus the startup events open one port, not three', async () => {
  const {stub, host} = await start();
  const id = host.hello.extensionInstanceId;
  host.exit();
  await waitFor(() => !host.connected, 'the old port closing');
  // Chrome starts again: the worker loads (connecting at top level) and onStartup/onInstalled fire at once.
  stub.load();
  stub.events.startup.dispatch();
  stub.events.installed.dispatch({reason: 'chrome_update'});
  await waitFor(() => stub.hostPeers[1]?.hello, 'the restarted worker\'s hello');
  await new Promise(r => setTimeout(r, 20));
  assert.equal(stub.hostPeers.length, 2);
  assert.equal(stub.hostPeers[1].hello.extensionInstanceId, id);
  assert.equal(stub.callsOf('storage.local.set').length, 1, 'minted once');
});

// --- page guards: other extensions' frames and popups in tabs the host owns ----------------------------------------

const FOREIGN = 'Cannot access a chrome-extension:// URL of different extension';
const turn = () => new Promise(r => setImmediate(r));
const guardIn = (stub, tabId) => stub.page(tabId).run('isolated', 'globalThis.__cuaPageGuard !== undefined');

test('tabs.guard blanks other extensions\' frames (also in closed shadow roots) and waits for them to unload: Chrome\'s attach refusal clears', async () => {
  const {stub, host} = await start();
  const tab = stub.addTab({url: 'https://site.invalid/login'});
  const page = stub.page(tab.id);
  const helper = page.addForeignFrame();
  const hidden = page.addForeignFrame('aaaabbbbccccddddeeeeffffgggghhhh', {shadow: 'closed'});
  const own = page.addForeignFrame(CUA_EXTENSION_ID, {path: '/popup.html'});
  await turn();
  assert.equal(page.foreignFrames().length, 2);
  await assert.rejects(host.request('debugger.attach', {tabId: tab.id}), {message: FOREIGN, code: 1});

  assert.deepEqual(await host.request('tabs.guard', {tabId: tab.id}), {frames: 1, blanked: 2});
  assert.equal(helper.getAttribute('srcdoc'), '');
  assert.equal(hidden.getAttribute('srcdoc'), '');
  assert.equal(own.getAttribute('srcdoc'), null, 'this extension\'s own frames are left alone');
  assert.deepEqual(page.foreignFrames(), [], 'unloaded by the time the sweep answers');
  assert.deepEqual(await host.request('debugger.attach', {tabId: tab.id}), {alreadyHeld: false});

  // While guarded, a frame appearing (or a frame pointed at another extension) is blanked before it commits: no detach.
  page.addForeignFrame();
  const late = page.element('iframe');
  page.document.body.appendChild(late);
  late.setAttribute('src', 'chrome-extension://pejdijmoenmkgeppbflobdenhhabjlaj/completion_list.html');
  for (let i = 0; i < 3; i++) await turn();
  assert.deepEqual(page.foreignFrames(), []);
  assert.equal(stub.state.attached.has(`tab:${tab.id}`), true);
  assert.equal(host.received.some(m => m.method === 'debugger.detached'), false);
  // A second sweep finds nothing new.
  assert.deepEqual(await host.request('tabs.guard', {tabId: tab.id}), {frames: 1, blanked: 0});
});

test('a guarded tab is guarded again on every new document; an unguarded one is never scripted; unguard and the port dropping remove the guard', async () => {
  const {stub, host} = await start();
  const user = stub.addTab({url: 'https://user.invalid/'});
  stub.navigate(user.id, 'https://user.invalid/next', 'Next');
  const made = await host.request('tabs.create', {url: 'about:blank', windowId: 1, guard: true});
  // about:blank is no page cua may script: the sweep is refused with Chrome's message, nothing else happens.
  await assert.rejects(host.request('tabs.guard', {tabId: made.id}), {message: /Cannot access contents of the page/});
  stub.navigate(made.id, 'https://agent.invalid/', 'Agent');
  await waitFor(() => guardIn(stub, made.id), 'the guard in the new document');
  assert.equal(stub.calls.some(c => c.api === 'scripting.executeScript' && c.args[0].target.tabId === user.id), false, 'a tab nobody guards is never scripted');
  assert.deepEqual(stub.callsOf('scripting.executeScript').filter(([a]) => a.target.tabId === made.id).map(([a]) => [a.world, a.func, a.target.allFrames, a.injectImmediately]).slice(-2),
    [['MAIN', 'pagePopups', true, true], ['ISOLATED', 'pageGuard', true, true]]);

  await host.request('debugger.attach', {tabId: made.id});
  assert.deepEqual(await host.request('tabs.unguard', {tabId: made.id}), {});
  assert.equal(await guardIn(stub, made.id), false);
  assert.equal(await stub.page(made.id).run('main', 'window.open === open && globalThis.__cuaPagePopups === undefined'), true);
  stub.page(made.id).addForeignFrame();
  await waitFor(() => host.received.some(m => m.method === 'debugger.detached'), 'Chrome detaching for the unguarded frame');
  assert.deepEqual(host.received.find(m => m.method === 'debugger.detached').params, {debuggee: {tabId: made.id}, reason: 'target_closed'});

  // Guarded again, then the host goes: the worker removes the guards it can no longer be asked to remove.
  await host.request('tabs.guard', {tabId: made.id});
  host.exit();
  await waitFor(async () => !(await guardIn(stub, made.id)), 'the guard removed on port drop');
});

test('a guarded page\'s user-activated window.open and target links go to the host as tabs.popup; the page gets a stand-in', async () => {
  const {stub, host} = await start();
  const made = await host.request('tabs.create', {url: 'https://agent.invalid/start', windowId: 1, guard: true});
  await host.request('tabs.guard', {tabId: made.id});
  const page = stub.page(made.id);
  const popups = () => host.received.filter(m => m.method === 'tabs.popup').map(m => m.params);
  const button = page.document.body.appendChild(page.element('button'));

  page.click(button);
  assert.equal(await page.run('main', 'JSON.stringify(window.open("/next?x=1"))'), '{"closed":false}');
  await waitFor(() => popups().length === 1, 'the popup request');
  assert.deepEqual(popups(), [{openerTabId: made.id, url: 'https://agent.invalid/next?x=1'}]);
  // One per activation: a second open of the same click is swallowed, not sent and not given to Chrome.
  await page.run('main', 'window.open("https://agent.invalid/again")');
  // noopener: null, as the web platform answers, and still the session's tab.
  page.click(button);
  assert.equal(await page.run('main', 'window.open("https://other.invalid/", "_blank", "noopener")'), null);
  await waitFor(() => popups().length === 2, 'the noopener popup');
  assert.equal(popups()[1].url, 'https://other.invalid/');

  // Left to Chrome: a sized popup (needs window.opener), no user activation, this context's own targets, non-http(s).
  page.click(button);
  await page.run('main', 'window.open("https://idp.invalid/auth", "signin", "width=500,height=600")');
  await page.run('main', 'window.open("/self", "_self")');
  await page.run('main', 'window.open("mailto:x@y.invalid")');
  page.navigator.userActivation.isActive = false;
  await page.run('main', 'window.open("/no-gesture")');
  assert.deepEqual(page.nativeOpens.map(o => o.url), ['https://idp.invalid/auth', '/self', 'mailto:x@y.invalid', '/no-gesture']);

  // A link with a target opens as the session's tab; one without a target navigates the tab itself (not touched).
  const link = page.document.body.appendChild(page.element('a'));
  link.setAttribute('href', '/linked');
  link.setAttribute('target', '_blank');
  assert.equal(page.click(link).defaultPrevented, true);
  const plain = page.document.body.appendChild(page.element('a'));
  plain.setAttribute('href', '/same-tab');
  assert.equal(page.click(plain).defaultPrevented, false);
  await waitFor(() => popups().length === 3, 'the link popup');
  assert.equal(popups()[2].url, 'https://agent.invalid/linked');
  assert.equal(page.nativeOpens.length, 4);

  // The worker only relays its own guard's requests from tabs it guards.
  const user = stub.addTab({url: 'https://user.invalid/'});
  await stub.sendMessage({type: 'cua.popup', url: 'https://x.invalid/'}, {id: CUA_EXTENSION_ID, tab: {id: user.id}, frameId: 0}).catch(() => {});
  await stub.sendMessage({type: 'cua.popup', url: 'https://x.invalid/'}, {id: 'someoneelse', tab: {id: made.id}, frameId: 0}).catch(() => {});
  await stub.sendMessage({type: 'cua.popup', url: 'javascript:alert(1)'}, {id: CUA_EXTENSION_ID, tab: {id: made.id}, frameId: 0}).catch(() => {});
  await turn();
  assert.equal(popups().length, 3);

  // tabs.create for a popup opens in the opener's window, with the opener, guarded.
  const w2 = stub.addWindow();
  const there = await host.request('tabs.create', {url: 'about:blank', windowId: w2});
  const child = await host.request('tabs.create', {url: 'https://agent.invalid/linked', openerTabId: there.id, guard: true});
  assert.equal(child.windowId, w2);
  assert.equal(stub.state.tabs.get(child.id).openerTabId, there.id);
  await host.request('tabs.unguard', {tabId: child.id});
  assert.ok(stub.callsOf('scripting.executeScript').some(([a]) => a.target.tabId === child.id && a.func === 'pageUnguard'), 'it was guarded');
});
