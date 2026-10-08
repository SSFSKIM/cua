// The cua host's backend semantics (src/chrome/host.mjs createHost) against the fake cua extension, in process: every
// row of the spec's coverage table and every rule of "Sessions, turns, ownership"
// (docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md). The program around it (stdio, socket, status
// file, exit) is test/chrome-host-run.test.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHost, GUARD_WAIT_MS} from '../src/chrome/host.mjs';
import {NO_HANDLER} from '../src/chrome/protocol.mjs';
import {createFakeCuaExtension} from './helpers/fake-cua-extension.mjs';

const OTHER = 'tab owned by another session';
// The ChatGPT extension's browser capability (background.js `rh`), byte for byte: the service lists capabilities whose
// id it knows and validates {id, description} (browser-service.mjs `iE`, `DN`).
const VIEWPORT_CAPABILITY = {id: 'viewport', description: 'Controls an explicit browser viewport override for responsive or device-size testing. Use it when a task calls for specific dimensions or breakpoint validation; otherwise leave it unset so the browser uses its normal viewport. Reset temporary overrides before finishing unless the user asked to keep them.'};
const settle = () => new Promise(r => setImmediate(r));

function setup(options = {}) {
  const ext = createFakeCuaExtension(options);
  const logs = [];
  const host = createHost({extension: ext.api, hello: ext.hello(), home: null, log: line => logs.push(line)});
  ext.onNotify = (method, params) => host.onExtensionNotification({method, params});
  const client = () => { const c = {notes: [], notify(method, params) { c.notes.push({method, params}); }}; return c; };
  const call = (c, method, params = {}) => host.handleBackendRequest(c, {method, params});
  // A session as the vendor service speaks it: every request carries session_id, turn_id and session_context.
  const session = (c, sessionId, turn = 't1') => {
    const s = {
      id: sessionId, turn,
      call: (method, params = {}) => call(c, method, {...params, session_id: sessionId, turn_id: s.turn, session_context: 'live'}),
      end: (turnId = s.turn) => call(c, 'turnEnded', {session_id: sessionId, turn_id: turnId}),
    };
    return s;
  };
  const sent = method => ext.calls.filter(x => x.method === method).map(x => x.params);
  return {ext, host, client, call, session, logs, sent};
}

test('getInfo is answered from the host\'s own state: extension type, no header field, no extensionId', async () => {
  const {ext, call, client} = setup({version: '1.2.3'});
  const info = await call(client(), 'getInfo', {session_id: 's', turn_id: 't', session_context: 'live'});
  assert.deepEqual(info, {type: 'extension', family: 'chrome', name: 'cua', version: '1.2.3', capabilities: {browser: [VIEWPORT_CAPABILITY], tab: []}, metadata: {extensionInstanceId: ext.instanceId}});
  assert.equal('agentRequestHeaderEnabled' in info, false);
  assert.equal(ext.calls.length, 0, 'getInfo never waits on the extension');
});

test('fallback methods and unknown ones answer the vendor\'s exact No-handler string with code -1', async () => {
  const {call, client} = setup();
  const c = client();
  for (const method of ['executeCdpWithCachedExpression', 'executeTabRead', 'followSessionTab', 'allowDownload', 'browserAuthNewTargetProtection', 'getUserHistory', 'getBookmarks', 'finalizeTabs']) {
    await assert.rejects(call(c, method, {session_id: 's', turn_id: 't'}), e => e.message === NO_HANDLER(method) && e.code === -1, method);
  }
});

test('ping answers pong, moveMouse succeeds and does nothing, a session request without its ids is refused', async () => {
  const {call, client, session, ext} = setup();
  const c = client();
  assert.equal(await call(c, 'ping', {}), 'pong');
  assert.deepEqual(await session(c, 's').call('moveMouse', {tabId: 1, x: 1, y: 2}), {});
  assert.equal(ext.calls.length, 0);
  await assert.rejects(call(c, 'getTabs', {}), /getTabs requires session_id and turn_id/);
});

test('createTab: inactive, in the session\'s own "cua" group, in the preferred window, else the focused normal one', async () => {
  const {ext, client, session, sent} = setup({windows: [{id: 1, focused: false, type: 'normal'}, {id: 2, focused: true, type: 'normal'}, {id: 3, focused: false, type: 'popup'}]});
  const a = session(client(), 'sA');
  const t1 = await a.call('createTab', {});
  assert.equal(t1.active, true, 'the vendor reports the created tab as the logical active one');
  assert.equal(ext.state.tabs.get(t1.id).windowId, 2);
  assert.equal(ext.state.tabs.get(t1.id).active, false, 'never takes the user\'s focus');
  assert.deepEqual(sent('tabs.create')[0], {url: 'about:blank', windowId: 2, group: {key: 'sA', title: 'cua'}, guard: true}, 'guarded from its first document on');
  const t2 = await a.call('createTab', {preferredWindowId: 1});
  assert.equal(ext.state.tabs.get(t2.id).windowId, 1);
  const t3 = await a.call('createTab', {preferredWindowId: 3});
  assert.equal(ext.state.tabs.get(t3.id).windowId, 2, 'a non-normal preferred window is not used');
  const t4 = await a.call('createTab', {preferredWindowId: 77});
  assert.equal(ext.state.tabs.get(t4.id).windowId, 2);
});

test('createTab with no focused window takes any normal one; with no window at all it creates one unfocused', async () => {
  const one = setup({windows: [{id: 5, focused: false, type: 'normal'}]});
  const t = await one.session(one.client(), 's').call('createTab', {});
  assert.equal(one.ext.state.tabs.get(t.id).windowId, 5);
  assert.equal(one.sent('windows.create').length, 0);

  const none = setup({windows: []});
  const created = await none.session(none.client(), 's').call('createTab', {});
  assert.deepEqual(none.sent('windows.create'), [{focused: false}]);
  const win = none.ext.state.tabs.get(created.id).windowId;
  assert.equal(none.ext.state.windows.get(win).focused, false);
});

test('tab groups are per session: two sessions never share or rename each other\'s group', async () => {
  const {ext, client, session} = setup();
  const a = session(client(), 'sA'), b = session(client(), 'sB');
  const ta = await a.call('createTab', {}), tb = await b.call('createTab', {});
  const ga = ext.state.tabs.get(ta.id).groupId, gb = ext.state.tabs.get(tb.id).groupId;
  assert.notEqual(ga, gb);
  await a.call('nameSession', {name: 'Research'});
  assert.equal(ext.state.groups.get(ga).title, 'Research');
  assert.equal(ext.state.groups.get(gb).title, 'cua');
  const ta2 = await a.call('createTab', {});
  assert.equal(ext.state.tabs.get(ta2.id).groupId, ga, 'later tabs join the renamed group');
});

test('getTabs lists only the session\'s own tabs, with the last created or claimed one active', async () => {
  const {ext, client, session} = setup();
  const user = ext.addTab({url: 'https://mine.fixture.invalid/', title: 'Mine'});
  const a = session(client(), 'sA'), b = session(client(), 'sB');
  const a1 = await a.call('createTab', {}), a2 = await a.call('createTab', {});
  await b.call('createTab', {});
  const listed = await a.call('getTabs', {});
  assert.deepEqual(listed.map(t => t.id).sort(), [a1.id, a2.id].sort());
  assert.deepEqual(listed.filter(t => t.active).map(t => t.id), [a2.id]);
  assert.ok(!listed.some(t => t.id === user.id));
  assert.deepEqual(Object.keys(listed[0]).sort(), ['active', 'id', 'title', 'url']);
});

test('another session\'s tab: attach, executeCdp, detach, markTab and claimUserTab are refused with "tab owned by another session"', async () => {
  const {client, session, sent} = setup();
  const a = session(client(), 'sA'), b = session(client(), 'sB');
  const tab = await a.call('createTab', {});
  await a.call('attach', {tabId: tab.id});
  for (const [method, params] of [['attach', {tabId: tab.id}], ['detach', {tabId: tab.id}], ['markTab', {tabId: tab.id, status: 'deliverable'}],
    ['executeCdp', {target: {tabId: tab.id}, method: 'Runtime.evaluate', commandParams: {expression: '1'}}], ['claimUserTab', {tabId: tab.id}],
    ['attachTarget', {tabId: tab.id, targetId: `T-${tab.id}-f1`}], ['getCommittedTabUrl', {tabId: tab.id}]])
    await assert.rejects(b.call(method, params), e => e.message === OTHER, method);
  assert.equal(sent('debugger.sendCommand').length, 0);
  assert.equal(sent('debugger.attach').length, 1, 'only A\'s attach reached the extension');
});

test('a tab no session owns is refused for attach and executeCdp; it must be created or claimed first', async () => {
  const {ext, client, session} = setup();
  const user = ext.addTab();
  const a = session(client(), 'sA');
  await assert.rejects(a.call('attach', {tabId: user.id}), new RegExp(`Tab ${user.id} is not part of browser session sA`));
  await assert.rejects(a.call('executeCdp', {target: {tabId: user.id}, method: 'Page.enable'}), /is not part of browser session sA/);
  await assert.rejects(a.call('attach', {tabId: 'x'}), /attach requires an integer tabId/);
});

test('executeCdp passes CDP through unchanged: method, params, child sessionId; Target.getTargets is the getTargets primitive', async () => {
  const seen = [];
  const {client, session, sent} = setup({cdp: x => { seen.push(x); return x.method === 'Runtime.evaluate' ? {result: {type: 'number', value: 2}} : {ok: x.method}; }});
  const a = session(client(), 'sA');
  const tab = await a.call('createTab', {});
  await assert.rejects(a.call('executeCdp', {target: {tabId: tab.id}, method: 'Page.enable', commandParams: {}}), e => e.message === 'Debugger unattached');
  await a.call('attach', {tabId: tab.id});
  assert.deepEqual(await a.call('executeCdp', {target: {tabId: tab.id}, method: 'Runtime.evaluate', commandParams: {expression: '1+1'}}), {result: {type: 'number', value: 2}});
  assert.deepEqual(await a.call('executeCdp', {target: {tabId: tab.id, sessionId: 'CHILD-1'}, method: 'DOM.enable', commandParams: {x: 1}}), {ok: 'DOM.enable'});
  assert.deepEqual(seen.map(x => [x.debuggee, x.sessionId, x.method, x.params]), [[{tabId: tab.id}, undefined, 'Runtime.evaluate', {expression: '1+1'}], [{tabId: tab.id}, 'CHILD-1', 'DOM.enable', {x: 1}]]);
  const targets = await a.call('executeCdp', {target: {tabId: tab.id}, method: 'Target.getTargets', commandParams: {}});
  assert.ok(Array.isArray(targets.targetInfos) && targets.targetInfos.some(t => t.tabId === tab.id));
  assert.equal(sent('debugger.getTargets').length, 1);
  await assert.rejects(a.call('executeCdp', {target: {tabId: tab.id, sessionId: 'S', targetId: 'T'}, method: 'DOM.enable'}), /either sessionId or targetId, not both/);
});

test('attach is idempotent, an already-held debuggee is success, and an attach Chrome refuses is a refusal with Chrome\'s wording', async () => {
  const {ext, client, session, sent} = setup();
  const a = session(client(), 'sA');
  const tab = await a.call('createTab', {});
  ext.state.held.add(`tab:${tab.id}`);
  assert.deepEqual(await a.call('attach', {tabId: tab.id}), {});
  assert.deepEqual(await a.call('attach', {tabId: tab.id}), {});
  assert.equal(sent('debugger.attach').length, 1);
  const other = await a.call('createTab', {});
  ext.state.tabs.get(other.id).url = 'chrome://settings/';
  await assert.rejects(a.call('attach', {tabId: other.id}), e => e.message === 'Cannot access a chrome:// URL');
  await assert.rejects(a.call('executeCdp', {target: {tabId: other.id}, method: 'Page.enable'}), /Debugger unattached/);
});

test('every request the extension refuses is logged with its method, debuggee and Chrome\'s message, never CDP params', async () => {
  const {ext, client, session, logs} = setup();
  const a = session(client(), 'sA');
  const tab = await a.call('createTab', {});
  ext.state.tabs.get(tab.id).url = 'chrome://settings/';
  await assert.rejects(a.call('attach', {tabId: tab.id}));
  const ok = await a.call('createTab', {});
  await a.call('attach', {tabId: ok.id});
  ext.state.held.delete(`tab:${ok.id}`);
  await assert.rejects(a.call('executeCdp', {target: {tabId: ok.id, sessionId: 'CHILD-1'}, method: 'Input.insertText', commandParams: {text: 'hunter2-secret'}}));
  await assert.rejects(a.call('getCommittedTabUrl', {tabId: 4242}));
  assert.ok(logs.includes(`extension refused debugger.attach {"tabId":${tab.id}}: Cannot access a chrome:// URL`), logs.join('\n'));
  assert.ok(logs.includes(`extension refused debugger.sendCommand {"tabId":${ok.id},"sessionId":"CHILD-1"} Input.insertText: Debugger is not attached to the tab with id: ${ok.id}.`), logs.join('\n'));
  assert.equal(logs.some(l => l.includes('hunter2')), false, 'CDP params never reach the log');
});

test('another extension\'s frame: attach guards the tab first, a refusal for such a frame is swept and retried once, and logged', async () => {
  const {ext, client, session, sent, logs} = setup();
  const c = client();
  const a = session(c, 'sA');
  const tab = await a.call('createTab', {});
  await a.call('attach', {tabId: tab.id});
  assert.deepEqual(ext.calls.filter(x => ['tabs.guard', 'debugger.attach'].includes(x.method)).map(x => x.method), ['tabs.guard', 'debugger.attach'], 'guarded before the attach');

  // The helper extension draws its frame: Chrome detaches; the service re-attaches and the guard's sweep clears it.
  ext.addForeignFrame(tab.id);
  await settle();
  assert.deepEqual(c.notes.at(-1), {method: 'onCDPDetach', params: {tabId: tab.id, reason: 'target_closed'}});
  await a.call('attach', {tabId: tab.id});
  assert.equal(ext.state.held.has(`tab:${tab.id}`), true);
  assert.equal(sent('debugger.attach').length, 2, 'no refusal, so no retry');

  // A frame its extension puts back once: the attach is refused, swept again and retried once.
  await a.call('detach', {tabId: tab.id});
  ext.addForeignFrame(tab.id, {sticky: 1});
  await a.call('attach', {tabId: tab.id});
  assert.equal(sent('debugger.attach').length, 4);
  assert.ok(logs.includes(`extension refused debugger.attach {"tabId":${tab.id}}: Cannot access a chrome-extension:// URL of different extension`));
  assert.ok(logs.some(l => l.startsWith(`tab ${tab.id}: another extension's frame blocked the debugger; swept {"frames":1,"blanked":1}, retrying once`)), logs.join('\n'));

  // One that survives both sweeps: refused with Chrome's wording after exactly one retry; the next attach tries again.
  await a.call('detach', {tabId: tab.id});
  ext.addForeignFrame(tab.id, {sticky: 2});
  await assert.rejects(a.call('attach', {tabId: tab.id}), e => e.message === 'Cannot access a chrome-extension:// URL of different extension');
  assert.equal(sent('debugger.attach').length, 6);
  await a.call('attach', {tabId: tab.id});
  assert.equal(ext.state.held.has(`tab:${tab.id}`), true);

  // Frames go the same way: a target attach is retried after a sweep of its tab.
  const frame = `T-${tab.id}-1`;
  ext.state.foreign.set(tab.id, [{extensionId: 'x', sticky: 1}]);
  await a.call('attachTarget', {tabId: tab.id, targetId: frame});
  assert.deepEqual(sent('tabs.guard').slice(-2), [{tabId: tab.id}, {tabId: tab.id}]);
  assert.equal(ext.state.held.has(`target:${frame}`), true);
});

test('a guard that never answers (an open JavaScript dialog blocks chrome.scripting) neither blocks the attach nor the turn\'s end', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {ext, client, session, sent, logs} = setup();
  const a = session(client(), 'sA');
  const tab = await a.call('createTab', {});
  ext.stall('tabs.guard');
  ext.stall('tabs.unguard');
  let attached = false;
  const attach = a.call('attach', {tabId: tab.id}).then(() => { attached = true; });
  for (let i = 0; i < 5; i++) await settle();
  t.mock.timers.tick(GUARD_WAIT_MS - 1);
  for (let i = 0; i < 5; i++) await settle();
  assert.equal(attached, false, 'waits for the sweep up to the bound');
  t.mock.timers.tick(1);
  await attach;
  assert.equal(ext.state.held.has(`tab:${tab.id}`), true, 'attached anyway: attaching is how the agent dismisses the dialog');
  assert.ok(logs.includes(`tab ${tab.id}: guard unanswered after ${GUARD_WAIT_MS} ms; attaching without waiting for it`));

  // The turn ends with the tab handed off: the unguard is asked and not waited for.
  await a.call('markTab', {tabId: tab.id, status: 'handoff'});
  await a.end();
  assert.deepEqual(sent('tabs.unguard'), [{tabId: tab.id}]);
});

test('guards end with ownership: a handed-off tab and tabs released open are unguarded, a closed tab is not asked', async () => {
  const {ext, client, session, sent} = setup();
  const userTab = ext.addTab({title: 'Users own'});
  const a = session(client(), 'sA');
  const plain = await a.call('createTab', {}), deliverable = await a.call('createTab', {}), handoff = await a.call('createTab', {});
  await a.call('claimUserTab', {tabId: userTab.id});
  for (const t of [plain, deliverable, handoff, userTab]) await a.call('attach', {tabId: t.id});
  assert.deepEqual([...ext.state.guarded].sort(), [plain.id, deliverable.id, handoff.id, userTab.id].sort());
  await a.call('markTab', {tabId: deliverable.id, status: 'deliverable'});
  await a.call('markTab', {tabId: handoff.id, status: 'handoff'});
  await a.end();
  for (let i = 0; i < 5; i++) await settle();
  assert.deepEqual(sent('tabs.unguard').map(p => p.tabId).sort(), [deliverable.id, handoff.id, userTab.id].sort());
  assert.deepEqual([...ext.state.guarded], [], 'the closed tab left with its removal');

  // The handoff resumes next turn: guarded again before its attach.
  a.turn = 't2';
  await a.call('attach', {tabId: handoff.id});
  assert.equal(ext.state.guarded.has(handoff.id), true);
});

test('a guarded page\'s popup becomes the session\'s active tab in the opener\'s window and group; outside a live turn it is dropped', async () => {
  const {ext, host, client, session, sent, logs} = setup();
  const w2 = ext.addWindow();
  const a = session(client(), 'sA');
  const opener = await a.call('createTab', {preferredWindowId: w2});
  await a.call('nameSession', {name: 'Checkout'});
  await host.onExtensionNotification({method: 'tabs.popup', params: {openerTabId: opener.id, url: 'https://popup.invalid/x'}});
  const created = sent('tabs.create').at(-1);
  assert.deepEqual(created, {url: 'https://popup.invalid/x', openerTabId: opener.id, group: {key: 'sA', title: 'Checkout'}, guard: true});
  const tabs = await a.call('getTabs', {});
  const popup = tabs.find(t => t.id !== opener.id);
  assert.deepEqual(tabs.map(t => [t.id, t.active]), [[opener.id, false], [popup.id, true]], 'listed without a claim, as the active tab');
  assert.equal(ext.state.tabs.get(popup.id).windowId, w2);
  assert.equal(ext.state.tabs.get(popup.id).groupId, ext.state.tabs.get(opener.id).groupId);
  assert.ok(logs.includes(`session sA took popup tab ${popup.id} from tab ${opener.id}`));
  await a.call('attach', {tabId: popup.id});

  // It belongs to the turn like a created tab: the turn's end closes it.
  await a.end();
  assert.equal(ext.state.tabs.has(popup.id), false);

  // A tab no session owns, a released tab, and an ended turn's tab take no popup.
  const b = session(client(), 'sB');
  const kept = await b.call('createTab', {});
  await b.call('markTab', {tabId: kept.id, status: 'deliverable'});
  await b.end();
  const before = sent('tabs.create').length;
  const user = ext.addTab();
  await host.onExtensionNotification({method: 'tabs.popup', params: {openerTabId: user.id, url: 'https://popup.invalid/'}});
  await host.onExtensionNotification({method: 'tabs.popup', params: {openerTabId: kept.id, url: 'https://popup.invalid/'}});
  assert.equal(sent('tabs.create').length, before);
  assert.equal(logs.filter(l => l.includes('dropped: no current turn owns the tab')).length, 2);
});

test('executeCdp times out at 10 s by default and detaches the tab, so the next command answers "Debugger unattached"', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const {ext, client, session} = setup();
  const a = session(client(), 'sA');
  const tab = await a.call('createTab', {});
  await a.call('attach', {tabId: tab.id});
  ext.holdCdp('Page.navigate');
  let outcome = null;
  a.call('executeCdp', {target: {tabId: tab.id}, method: 'Page.navigate', commandParams: {url: 'x'}}).then(r => { outcome = {r}; }, e => { outcome = {e}; });
  for (let i = 0; i < 5; i++) await settle();
  t.mock.timers.tick(9_999);
  for (let i = 0; i < 5; i++) await settle();
  assert.equal(outcome, null);
  t.mock.timers.tick(1);
  for (let i = 0; i < 10; i++) await settle();
  assert.equal(outcome?.e?.message, 'Timed out after 10000ms waiting for CDP command Page.navigate.');
  assert.equal(ext.state.held.has(`tab:${tab.id}`), false, 'the debugger was detached');
  await assert.rejects(a.call('executeCdp', {target: {tabId: tab.id}, method: 'Page.enable'}), e => e.message === 'Debugger unattached');
  await a.call('attach', {tabId: tab.id});
  assert.equal(ext.state.held.has(`tab:${tab.id}`), true, 'the service\'s re-attach works');
});

test('executeCdp honours timeoutMs, and preserveDebuggerOnTimeout keeps the debugger', async () => {
  const {ext, client, session} = setup();
  const a = session(client(), 'sA');
  const tab = await a.call('createTab', {});
  await a.call('attach', {tabId: tab.id});
  ext.holdCdp('Runtime.evaluate');
  await assert.rejects(a.call('executeCdp', {target: {tabId: tab.id}, method: 'Runtime.evaluate', commandParams: {}, timeoutMs: 20, preserveDebuggerOnTimeout: true}),
    e => e.message === 'Timed out after 20ms waiting for CDP command Runtime.evaluate.');
  assert.equal(ext.state.held.has(`tab:${tab.id}`), true);
  assert.deepEqual(await a.call('executeCdp', {target: {tabId: tab.id}, method: 'Page.enable', commandParams: {}}), {});
  ext.releaseCdp('Runtime.evaluate');
});

test('a "Debugger is not attached" answer from Chrome resyncs the host, so the service\'s re-attach really attaches', async () => {
  const {ext, client, session, sent} = setup();
  const a = session(client(), 'sA');
  const tab = await a.call('createTab', {});
  await a.call('attach', {tabId: tab.id});
  ext.state.held.delete(`tab:${tab.id}`);    // lost without an event
  await assert.rejects(a.call('executeCdp', {target: {tabId: tab.id}, method: 'Page.enable'}), /Debugger is not attached to the tab with id/);
  await a.call('attach', {tabId: tab.id});
  assert.equal(sent('debugger.attach').length, 2);
});

test('frames: attachTarget attaches {targetId}, executeCdp with target {tabId, targetId} reaches that debuggee, detachTarget releases it', async () => {
  const seen = [];
  const {client, session, sent} = setup({cdp: x => { seen.push(x.debuggee); return {}; }});
  const a = session(client(), 'sA'), b = session(client(), 'sB');
  const tab = await a.call('createTab', {});
  await a.call('attach', {tabId: tab.id});
  const frame = `T-${tab.id}-f1`;
  await assert.rejects(a.call('executeCdp', {target: {tabId: tab.id, targetId: frame}, method: 'DOM.enable'}), new RegExp(`not attached to the target with id: ${frame}`));
  await a.call('attachTarget', {tabId: tab.id, targetId: frame});
  assert.deepEqual(sent('debugger.attach').at(-1), {targetId: frame});
  await a.call('executeCdp', {target: {tabId: tab.id, targetId: frame}, method: 'DOM.enable'});
  assert.deepEqual(seen, [{targetId: frame}]);
  const btab = await b.call('createTab', {});
  await b.call('attach', {tabId: btab.id});
  await assert.rejects(b.call('executeCdp', {target: {tabId: btab.id, targetId: frame}, method: 'DOM.enable'}), /not attached to the target/, 'B cannot reach A\'s frame through its own tab');
  await assert.rejects(b.call('attachTarget', {tabId: btab.id, targetId: frame}), e => e.message === OTHER);
  await a.call('detachTarget', {tabId: tab.id, targetId: frame});
  assert.deepEqual(sent('debugger.detach').at(-1), {targetId: frame});
});

test('CDP events and detaches reach only the owning session\'s client, with source {tabId, sessionId?, targetId?}', async () => {
  const {ext, client, session} = setup();
  const ca = client(), cb = client();
  const a = session(ca, 'sA'), b = session(cb, 'sB');
  const tab = await a.call('createTab', {});
  await b.call('createTab', {});
  await a.call('attach', {tabId: tab.id});
  const frame = `T-${tab.id}-f1`;
  await a.call('attachTarget', {tabId: tab.id, targetId: frame});
  ext.cdpEvent({tabId: tab.id}, 'Page.loadEventFired', {timestamp: 1});
  ext.cdpEvent({tabId: tab.id}, 'Runtime.consoleAPICalled', {type: 'log'}, 'CHILD-1');
  ext.cdpEvent({targetId: frame}, 'Page.frameNavigated', {frame: {}});
  await settle();
  assert.deepEqual(ca.notes, [
    {method: 'onCDPEvent', params: {source: {tabId: tab.id}, method: 'Page.loadEventFired', params: {timestamp: 1}}},
    {method: 'onCDPEvent', params: {source: {tabId: tab.id, sessionId: 'CHILD-1'}, method: 'Runtime.consoleAPICalled', params: {type: 'log'}}},
    {method: 'onCDPEvent', params: {source: {tabId: tab.id, targetId: frame}, method: 'Page.frameNavigated', params: {frame: {}}}},
  ]);
  assert.deepEqual(cb.notes, []);
});

test('a user-initiated detach is forwarded as onCDPDetach and the tab is never re-attached', async () => {
  const {ext, client, session} = setup();
  const ca = client();
  const a = session(ca, 'sA');
  const tab = await a.call('createTab', {});
  await a.call('attach', {tabId: tab.id});
  ext.userCancel({tabId: tab.id});
  await settle();
  assert.deepEqual(ca.notes, [{method: 'onCDPDetach', params: {tabId: tab.id, reason: 'canceled_by_user'}}]);
  await assert.rejects(a.call('attach', {tabId: tab.id}), /canceled debugging/);
  assert.equal(ext.state.held.has(`tab:${tab.id}`), false);
});

test('turnEnded: unmarked created tabs close, deliverable and claimed ones are released open, handoff stays owned and detached', async () => {
  const {ext, host, client, session, sent} = setup();
  const userTab = ext.addTab({title: 'Users own'});
  const a = session(client(), 'sA');
  const plain = await a.call('createTab', {}), deliverable = await a.call('createTab', {}), handoff = await a.call('createTab', {});
  for (const t of [plain, deliverable, handoff]) await a.call('attach', {tabId: t.id});
  await a.call('claimUserTab', {tabId: userTab.id});
  await a.call('attach', {tabId: userTab.id});
  await a.call('markTab', {tabId: deliverable.id, status: 'deliverable'});
  await a.call('markTab', {tabId: handoff.id, status: 'handoff'});
  await assert.rejects(a.call('markTab', {tabId: handoff.id, status: 'done'}), /markTab status must be "handoff" or "deliverable"/);
  await a.end();
  assert.equal(ext.state.tabs.has(plain.id), false, 'the unmarked created tab is closed');
  assert.equal(ext.state.tabs.has(deliverable.id), true);
  assert.equal(ext.state.tabs.get(deliverable.id).groupId, -1, 'the deliverable leaves the group');
  assert.equal(ext.state.tabs.has(userTab.id), true, 'the claimed user tab stays open');
  assert.equal(sent('tabs.ungroup').some(p => p.tabId === userTab.id), false, 'a user tab is never ungrouped (cua never grouped it)');
  assert.equal(ext.state.tabs.has(handoff.id), true);
  assert.notEqual(ext.state.tabs.get(handoff.id).groupId, -1, 'the handoff tab stays in the session group');
  assert.deepEqual([...ext.state.held], [], 'every debugger of the turn is detached');
  const status = host.status();
  assert.deepEqual(status.sessions.map(s => [s.session_id, s.tabs]), [['sA', [{tabId: handoff.id, origin: 'created', mark: 'handoff', attached: false}]]]);
  const userTabs = await a.call('getUserTabs', {});
  assert.ok(userTabs.some(t => t.id === deliverable.id) && userTabs.some(t => t.id === userTab.id) && !userTabs.some(t => t.id === handoff.id));
});

test('a handoff tab resumes on the session\'s next turn: getTabs lists it and it can be attached again', async () => {
  const {ext, client, session} = setup();
  const a = session(client(), 'sA');
  const tab = await a.call('createTab', {});
  await a.call('attach', {tabId: tab.id});
  await a.call('markTab', {tabId: tab.id, status: 'handoff'});
  await a.end();
  const b = session(client(), 'sB', 'u1');
  await assert.rejects(b.call('claimUserTab', {tabId: tab.id}), e => e.message === OTHER, 'another session cannot claim a handed-off tab');
  a.turn = 't2';
  const listed = await a.call('getTabs', {});
  assert.deepEqual(listed.map(t => [t.id, t.active]), [[tab.id, true]]);
  await a.call('attach', {tabId: tab.id});
  assert.equal(ext.state.held.has(`tab:${tab.id}`), true);
  await a.end('t2');
  assert.equal(ext.state.tabs.has(tab.id), false, 'resumed without a new mark, it is an ordinary created tab of turn t2');
});

test('a late turnEnded for turn N leaves turn N+1\'s tabs', async () => {
  const {ext, host, client, session} = setup();
  const a = session(client(), 'sA', 'task-1');
  const first = await a.call('createTab', {});
  a.turn = 'task-2';
  const second = await a.call('createTab', {});
  await a.call('attach', {tabId: second.id});
  await a.end('task-1');
  assert.equal(ext.state.tabs.has(first.id), false);
  assert.equal(ext.state.tabs.has(second.id), true);
  assert.equal(ext.state.held.has(`tab:${second.id}`), true);
  assert.deepEqual(host.status().sessions[0].tabs.map(t => t.tabId), [second.id]);
});

test('a handoff tab whose turnEnded arrives after the next turn began resumes into that turn at once', async () => {
  const {ext, host, client, session} = setup();
  const a = session(client(), 'sA', 'task-1');
  const tab = await a.call('createTab', {});
  await a.call('attach', {tabId: tab.id});
  await a.call('markTab', {tabId: tab.id, status: 'handoff'});
  a.turn = 'task-2';
  await a.call('getTabs', {});                // task-2 has begun; task-1's turnEnded is late
  await a.end('task-1');
  assert.equal(ext.state.held.has(`tab:${tab.id}`), false, 'the handoff detached the debugger');
  assert.deepEqual((await a.call('getTabs', {})).map(t => t.id), [tab.id], 'task-2 lists it without waiting for a third turn');
  await a.call('attach', {tabId: tab.id});
  assert.deepEqual(host.status().sessions[0].tabs, [{tabId: tab.id, origin: 'created', mark: 'none', attached: true}]);
  await a.end('task-2');
  assert.equal(ext.state.tabs.has(tab.id), false, 'unmarked in task-2, it closes with task-2');
});

test('a tab of turn N used by turn N+1 before turn N ends belongs to N+1', async () => {
  const {ext, client, session} = setup();
  const a = session(client(), 'sA', 'task-1');
  const tab = await a.call('createTab', {});
  a.turn = 'task-2';
  await a.call('attach', {tabId: tab.id});
  await a.end('task-1');
  assert.equal(ext.state.tabs.has(tab.id), true);
  await a.end('task-2');
  assert.equal(ext.state.tabs.has(tab.id), false);
});

test('a turn that has ended takes no new tabs; one ending while createTab is in flight closes the new tab', async () => {
  const {ext, client, session, sent} = setup();
  const a = session(client(), 'sA', 'task-1');
  await a.call('getTabs', {});
  await a.end('task-1');
  await assert.rejects(a.call('createTab', {}), /turn task-1 has ended/);
  assert.equal(sent('tabs.create').length, 0, 'no tab was created for the ended turn');
  a.turn = 'task-2';
  const pending = a.call('createTab', {});
  await a.end('task-2');
  await assert.rejects(pending, /turn task-2 has ended/);
  await settle(); await settle();
  assert.deepEqual([...ext.state.tabs.keys()], [], 'the tab created after the turn ended was closed');
});

test('getUserTabs lists tabs no session owns; claimUserTab leases one and returns {id, title, url}; getCommittedTabUrl reads it', async () => {
  const {ext, client, session} = setup();
  const user = ext.addTab({url: 'http://127.0.0.1:5000/marker', title: 'Marker'});
  const a = session(client(), 'sA'), b = session(client(), 'sB');
  const own = await a.call('createTab', {});
  const listed = await b.call('getUserTabs', {});
  assert.deepEqual(listed, [{id: user.id, title: 'Marker', url: 'http://127.0.0.1:5000/marker'}]);
  assert.ok(!listed.some(t => t.id === own.id));
  const claimed = await b.call('claimUserTab', {tabId: user.id});
  assert.deepEqual(claimed, {id: user.id, title: 'Marker', url: 'http://127.0.0.1:5000/marker', active: true});
  assert.deepEqual(await b.call('claimUserTab', {tabId: user.id}), claimed, 'claiming again is idempotent');
  assert.equal(await b.call('getCommittedTabUrl', {tabId: user.id}), 'http://127.0.0.1:5000/marker');
  await assert.rejects(a.call('claimUserTab', {tabId: user.id}), e => e.message === OTHER);
  await assert.rejects(b.call('claimUserTab', {tabId: 4242}), /No tab with id: 4242\./);
  for (const url of ['chrome://settings/', 'chrome-extension://abc/page.html', 'devtools://devtools/bundled/inspector.html', 'chrome-untrusted://print/']) {
    const internal = ext.addTab({url, title: 'Internal'});
    await assert.rejects(b.call('claimUserTab', {tabId: internal.id}), e => e.message === `Chrome internal tab ${internal.id} cannot be claimed`, url);
  }
  assert.ok((await a.call('getUserTabs', {})).every(t => t.id !== user.id));
});

test('a client disconnect ends every turn of its sessions and releases handed-off tabs open', async () => {
  const {ext, host, client, session} = setup();
  const ca = client(), cb = client();
  const a = session(ca, 'sA', 'task-1'), keeper = session(ca, 'sK'), b = session(cb, 'sB');
  const t1 = await a.call('createTab', {});
  a.turn = 'task-2';                          // task-1 never saw its turnEnded
  const t2 = await a.call('createTab', {});
  await a.call('attach', {tabId: t2.id});
  const kept = await keeper.call('createTab', {});
  await keeper.call('markTab', {tabId: kept.id, status: 'handoff'});
  await keeper.end();
  const tb = await b.call('createTab', {});
  await host.clientClosed(ca);
  assert.equal(ext.state.tabs.has(t1.id), false);
  assert.equal(ext.state.tabs.has(t2.id), false);
  assert.equal(ext.state.tabs.has(kept.id), true, 'the handed-off tab stays open');
  assert.equal(ext.state.tabs.get(kept.id).groupId, -1, 'and leaves the group');
  assert.deepEqual(host.status().sessions.map(s => s.session_id), ['sB']);
  assert.equal(ext.state.tabs.has(tb.id), true, 'another client\'s session is untouched');
  assert.ok((await b.call('getUserTabs', {})).some(t => t.id === kept.id));
});

test('a tab the user closes is no longer owned', async () => {
  const {ext, host, client, session} = setup();
  const a = session(client(), 'sA');
  const tab = await a.call('createTab', {});
  await a.call('attach', {tabId: tab.id});
  ext.userCloseTab(tab.id);
  await settle();
  assert.deepEqual(host.status().sessions[0].tabs, []);
  assert.deepEqual(await a.call('getTabs', {}), []);
});

test('status() is the <name>.json shape', async () => {
  const {ext, host, client, session} = setup({version: '0.2.0'});
  const a = session(client(), 'sA');
  const tab = await a.call('createTab', {});
  await a.call('attach', {tabId: tab.id});
  const status = host.status();
  assert.deepEqual(Object.keys(status).sort(), ['extensionVersion', 'instanceId', 'pid', 'protocolVersion', 'sessions', 'updatedAt']);
  assert.equal(status.instanceId, ext.instanceId);
  assert.equal(status.extensionVersion, '0.2.0');
  assert.equal(status.protocolVersion, 1);
  assert.equal(status.pid, process.pid);
  assert.ok(!Number.isNaN(Date.parse(status.updatedAt)));
  assert.deepEqual(status.sessions, [{session_id: 'sA', turn_id: 't1', tabs: [{tabId: tab.id, origin: 'created', mark: 'none', attached: true}]}]);
});

// ---- the viewport capability (executeUnhandledCommand browser_viewport_set / browser_viewport_reset) ------------------

// The service's payload: {type, browser_id, height?, width?} plus the session fields (browser-service.mjs `aI`, `sI`).
const viewportSet = (s, width, height) => s.call('executeUnhandledCommand', {type: 'browser_viewport_set', browser_id: 'b1', height, width});
const viewportReset = s => s.call('executeUnhandledCommand', {type: 'browser_viewport_reset', browser_id: 'b1'});
// Every Emulation command the extension was asked for, in order: [debuggee, method, params].
const emulation = ext => ext.calls.filter(c => c.method === 'debugger.sendCommand' && c.params.method.startsWith('Emulation.'))
  .map(c => [c.params.debuggee, c.params.method, c.params.params]);
const override = (tabId, width, height) => [{tabId}, 'Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false}];
const cleared = tabId => [{tabId}, 'Emulation.clearDeviceMetricsOverride', {}];

test('viewport set on an attached tab applies the override at once and answers {} (the service parses an empty object)', async () => {
  const {ext, client, session} = setup();
  const a = session(client(), 'sA');
  const tab = await a.call('createTab', {});
  await a.call('attach', {tabId: tab.id});
  assert.deepEqual(await viewportSet(a, 800, 600), {});
  assert.deepEqual(emulation(ext), [override(tab.id, 800, 600)]);
});

test('viewport set before the attach is kept on the tab and applied by the attach; re-attaches apply it again', async () => {
  const {ext, host, client, session, sent} = setup();
  const c = client();
  const a = session(c, 'sA');
  const tab = await a.call('createTab', {});
  await viewportSet(a, 800, 600);
  assert.deepEqual(emulation(ext), [], 'nothing to apply to before the debugger is attached');
  await a.call('attach', {tabId: tab.id});
  const order = ext.calls.filter(x => x.method === 'debugger.attach' || x.params?.method?.startsWith?.('Emulation.')).map(x => x.method);
  assert.deepEqual(order, ['debugger.attach', 'debugger.sendCommand'], 'applied after the attach, before it answers');
  assert.deepEqual(emulation(ext), [override(tab.id, 800, 600)]);

  // An attach of a tab already attached re-applies it (the ChatGPT extension's Os), with no second debugger.attach.
  await a.call('attach', {tabId: tab.id});
  assert.equal(sent('debugger.attach').length, 1);
  assert.deepEqual(emulation(ext).length, 2);

  // Chrome detaches the tab (another extension's frame): the service's re-attach applies it to the new debugger session.
  ext.addForeignFrame(tab.id);
  await settle();
  await a.call('attach', {tabId: tab.id});
  assert.equal(sent('debugger.attach').length, 2);
  assert.deepEqual(emulation(ext).at(-1), override(tab.id, 800, 600));

  // Chrome lost the debuggee without telling the host: the re-apply finds it and the attach is real.
  ext.state.held.delete(`tab:${tab.id}`);
  await a.call('attach', {tabId: tab.id});
  assert.equal(sent('debugger.attach').length, 3);
  assert.equal(ext.state.held.has(`tab:${tab.id}`), true);
  assert.deepEqual(emulation(ext).at(-1), override(tab.id, 800, 600));
  assert.equal(host.status().sessions[0].tabs[0].attached, true);
});

test('viewport reset clears the override on an attached tab, and later attaches send nothing', async () => {
  const {ext, client, session} = setup();
  const a = session(client(), 'sA');
  const tab = await a.call('createTab', {});
  await a.call('attach', {tabId: tab.id});
  await viewportSet(a, 1024, 768);
  assert.deepEqual(await viewportReset(a), {});
  assert.deepEqual(emulation(ext), [override(tab.id, 1024, 768), cleared(tab.id)]);
  await a.call('detach', {tabId: tab.id});
  await a.call('attach', {tabId: tab.id});
  await a.call('attach', {tabId: tab.id});
  assert.equal(emulation(ext).length, 2);
});

test('viewport set goes to the session\'s active tab only; frame targets never get it', async () => {
  const {ext, client, session} = setup();
  const a = session(client(), 'sA'), b = session(client(), 'sB');
  const first = await a.call('createTab', {}), second = await a.call('createTab', {});
  const others = await b.call('createTab', {});
  for (const t of [first, second]) await a.call('attach', {tabId: t.id});
  await b.call('attach', {tabId: others.id});
  await viewportSet(a, 800, 600);
  assert.deepEqual(emulation(ext), [override(second.id, 800, 600)], 'the last created tab, as getTabs reports it active');
  await a.call('attach', {tabId: first.id});
  await b.call('attach', {tabId: others.id});
  await a.call('attachTarget', {tabId: second.id, targetId: `T-${second.id}-1`});
  assert.equal(emulation(ext).length, 1);
});

test('viewport set with no tab yet waits for the turn\'s first attach; a turn\'s end drops it unused', async () => {
  const {ext, client, session} = setup();
  const a = session(client(), 'sA');
  await viewportSet(a, 800, 600);
  const tab = await a.call('createTab', {});
  await a.call('attach', {tabId: tab.id});
  assert.deepEqual(emulation(ext), [override(tab.id, 800, 600)]);

  const b = session(client(), 'sB');
  await viewportSet(b, 640, 480);
  await b.end();
  b.turn = 't2';
  const later = await b.call('createTab', {});
  await b.call('attach', {tabId: later.id});
  assert.equal(emulation(ext).length, 1, 'the ended turn\'s size is not applied');
  b.turn = 't1';
  await assert.rejects(viewportSet(b, 1, 1), e => e.message === 'Browser session sB turn t1 has ended', 'an ended turn sets nothing');
  assert.equal(emulation(ext).length, 1);
});

test('viewport at turn end: a released tab loses it; a handoff tab keeps it and gets it back on the next turn\'s attach', async () => {
  const {ext, client, session} = setup();
  const user = ext.addTab({url: 'https://user.fixture.invalid/'});
  const a = session(client(), 'sA');
  await a.call('claimUserTab', {tabId: user.id});
  await a.call('attach', {tabId: user.id});
  await viewportSet(a, 800, 600);
  await a.end();
  assert.equal(ext.state.held.has(`tab:${user.id}`), false, 'detached: Chrome drops the override with the debugger');
  a.turn = 't2';
  await a.call('claimUserTab', {tabId: user.id});
  await a.call('attach', {tabId: user.id});
  assert.equal(emulation(ext).length, 1, 'claimed again, it has no viewport');

  const handoff = await a.call('createTab', {});
  await a.call('attach', {tabId: handoff.id});
  await viewportSet(a, 390, 844);
  await a.call('markTab', {tabId: handoff.id, status: 'handoff'});
  await a.end();
  assert.equal(ext.state.held.has(`tab:${handoff.id}`), false);
  a.turn = 't3';
  await a.call('attach', {tabId: handoff.id});
  assert.deepEqual(emulation(ext).at(-1), override(handoff.id, 390, 844));
});

test('viewport set on a debuggee Chrome lost forgets the attachment, so the service\'s re-attach is real and applies it', async () => {
  const {ext, host, client, session} = setup();
  const a = session(client(), 'sA');
  const tab = await a.call('createTab', {});
  await a.call('attach', {tabId: tab.id});
  ext.state.held.delete(`tab:${tab.id}`);
  assert.deepEqual(await viewportSet(a, 800, 600), {});
  assert.equal(host.status().sessions[0].tabs[0].attached, false);
  await assert.rejects(a.call('executeCdp', {target: {tabId: tab.id}, method: 'Page.enable'}), e => e.message === 'Debugger unattached');
  await a.call('attach', {tabId: tab.id});
  assert.deepEqual(emulation(ext).at(-1), override(tab.id, 800, 600));
});

test('executeUnhandledCommand: a malformed size is refused; a command cua does not know answers the extension\'s wording', async () => {
  const {ext, client, session} = setup();
  const a = session(client(), 'sA');
  await a.call('createTab', {});
  for (const [width, height] of [[0, 600], [800, -1], [800.5, 600], ['800', 600], [undefined, 600]])
    await assert.rejects(viewportSet(a, width, height), /browser_viewport_set requires positive integer width and height/);
  await assert.rejects(a.call('executeUnhandledCommand', {type: 'browser_management_call', browser_id: 'b1'}),
    e => e.message === 'cua does not support command "browser_management_call".' && e.code !== -1);
  assert.equal(emulation(ext).length, 0);
});
