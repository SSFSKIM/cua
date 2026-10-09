// The cua host with a MAWS peer (docs/doperpowers/specs/2026-10-08-maws-in-app-browser-design.md, "Host changes for a
// MAWS peer"): a hello carrying profileName turns the vendor's moveMouse into the cursor.move primitive and names the
// backend's profile; every peer gets the command's timeoutMs; tabs.adopted owns an announced popup without creating
// one. The Chrome extension's hello (no profileName) keeps moveMouse the no-op it was.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHost, DEFAULT_CDP_TIMEOUT_MS} from '../src/chrome/host.mjs';
import {createFakeCuaExtension} from './helpers/fake-cua-extension.mjs';
import {createFakeMawsExtension} from './helpers/fake-maws-peer.mjs';

function setup(ext) {
  const logs = [];
  const host = createHost({extension: ext.api, hello: ext.hello(), home: null, log: line => logs.push(line)});
  ext.onNotify = (method, params) => host.onExtensionNotification({method, params});
  const client = () => ({notes: [], notify(method, params) { this.notes.push({method, params}); }});
  const session = (c, sessionId, turn = 't1') => ({
    call: (method, params = {}) => host.handleBackendRequest(c, {method, params: {...params, session_id: sessionId, turn_id: turn, session_context: 'live'}}),
    end: () => host.handleBackendRequest(c, {method: 'turnEnded', params: {session_id: sessionId, turn_id: turn}}),
  });
  const sent = method => ext.calls.filter(x => x.method === method).map(x => x.params);
  return {ext, host, logs, client, session, sent};
}

test('getInfo names a MAWS peer\'s profile (metadata.profileName); a Chrome hello adds nothing', async () => {
  const maws = setup(createFakeMawsExtension({instanceId: 'maws:app-1', version: '0.9.0'}));
  const info = await maws.host.handleBackendRequest(maws.client(), {method: 'getInfo', params: {}});
  assert.deepEqual(info.metadata, {extensionInstanceId: 'maws:app-1', profileName: 'MAWS'});
  assert.equal(info.family, 'chrome');
  assert.equal(info.type, 'extension');
  const chrome = setup(createFakeCuaExtension());
  const plain = await chrome.host.handleBackendRequest(chrome.client(), {method: 'getInfo', params: {}});
  assert.deepEqual(plain.metadata, {extensionInstanceId: chrome.ext.instanceId});
});

test('moveMouse on a MAWS peer becomes cursor.move on the session\'s tab; another session\'s tab is refused', async () => {
  const {client, session, sent, ext} = setup(createFakeMawsExtension());
  const a = session(client(), 'sA');
  const tab = await a.call('createTab', {});
  assert.deepEqual(await a.call('moveMouse', {tabId: tab.id, x: 12, y: 34}), {});
  assert.deepEqual(sent('cursor.move'), [{tabId: tab.id, x: 12, y: 34}]);
  assert.deepEqual(ext.cursor, [{tabId: tab.id, x: 12, y: 34}]);
  await assert.rejects(session(client(), 'sB').call('moveMouse', {tabId: tab.id, x: 1, y: 1}), /tab owned by another session/);
  assert.equal(sent('cursor.move').length, 1);
});

test('a hello without profileName keeps moveMouse a no-op that asks the extension nothing', async () => {
  const {client, session, ext} = setup(createFakeCuaExtension());
  const a = session(client(), 'sA');
  const tab = await a.call('createTab', {});
  const before = ext.calls.length;
  assert.deepEqual(await a.call('moveMouse', {tabId: tab.id, x: 5, y: 6}), {});
  assert.equal(ext.calls.length, before);
});

test('executeCdp forwards the command\'s deadline as timeoutMs on every peer: the vendor\'s when given, else the 10 s default', async () => {
  for (const ext of [createFakeMawsExtension(), createFakeCuaExtension()]) {
    const {client, session, sent} = setup(ext);
    const a = session(client(), 'sA');
    const tab = await a.call('createTab', {});
    await a.call('attach', {tabId: tab.id});
    await a.call('executeCdp', {target: {tabId: tab.id}, method: 'Runtime.evaluate', commandParams: {expression: '1'}, timeoutMs: 2750});
    await a.call('executeCdp', {target: {tabId: tab.id}, method: 'Runtime.evaluate', commandParams: {expression: '2'}});
    assert.deepEqual(sent('debugger.sendCommand').filter(p => p.method === 'Runtime.evaluate').map(p => p.timeoutMs), [2750, DEFAULT_CDP_TIMEOUT_MS]);
  }
});

test('tabs.adopted: a live turn owns the announced tab as one it created, as its active tab, and creates none', async () => {
  const {ext, host, client, session, sent, logs} = setup(createFakeMawsExtension());
  const a = session(client(), 'sA');
  const opener = await a.call('createTab', {});
  await a.call('attach', {tabId: opener.id});
  const creates = sent('tabs.create').length;
  const child = ext.adopt(opener.id, 'about:blank');
  await host.onExtensionNotification({method: 'tabs.adopted', params: {openerTabId: opener.id, tabId: child.id, url: 'about:blank'}});
  assert.equal(sent('tabs.create').length, creates, 'no second tab is opened for it');
  const tabs = await a.call('getTabs', {});
  assert.deepEqual(tabs.map(t => [t.id, t.active]), [[opener.id, false], [child.id, true]]);
  assert.ok(logs.includes(`session sA adopted tab ${child.id} from tab ${opener.id}`), logs.join('\n'));
  await a.call('attach', {tabId: child.id});
  // Owned as created by the turn: its end closes both (neither is marked).
  await a.end();
  assert.equal(ext.state.tabs.has(child.id), false);
  assert.equal(ext.state.tabs.has(opener.id), false);
});

test('tabs.adopted from a tab no live turn owns is logged and left to the person', async () => {
  const {ext, host, client, session, logs} = setup(createFakeMawsExtension());
  const user = ext.addTab();
  const loose = ext.addTab();
  await host.onExtensionNotification({method: 'tabs.adopted', params: {openerTabId: user.id, tabId: loose.id, url: 'https://x.invalid/'}});
  const b = session(client(), 'sB');
  const kept = await b.call('createTab', {});
  await b.call('markTab', {tabId: kept.id, status: 'deliverable'});
  await b.end();
  const later = ext.addTab();
  await host.onExtensionNotification({method: 'tabs.adopted', params: {openerTabId: kept.id, tabId: later.id, url: 'https://x.invalid/'}});
  assert.equal(logs.filter(l => /adopted tab \d+ from tab \d+ left to the person: no current turn owns the opener/.test(l)).length, 2, logs.join('\n'));
  const c = session(client(), 'sC');
  await assert.rejects(c.call('attach', {tabId: later.id}), /is not part of browser session/);
  assert.equal(ext.state.tabs.has(later.id), true);
});
