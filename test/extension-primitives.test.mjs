// The cua extension's primitives and connection rules, driven from a test-held host peer (the chrome.* stub's
// `nativeHost: 'fake'`): what the real host relies on but cannot be made to show — debugger.attach's alreadyHeld, the
// verbatim errors, the group bookkeeping, hostRefused and the retry rules, a worker restart. Spec:
// docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md, "The extension protocol".
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CUA_HOST_NAME} from '../src/chrome/extension.mjs';
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

test('after a worker restart Chrome still holds its attachments: an attach adopts them, and a port drop then detaches them', async () => {
  const {stub, host} = await start();
  const tab = stub.addTab();
  const frame = stub.addFrame(tab.id);
  await host.request('debugger.attach', {tabId: tab.id});
  await host.request('debugger.attach', {targetId: frame});
  // The worker restarts with the port up (Chrome keeps the attachments, the worker's memory is gone).
  stub.load();
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
