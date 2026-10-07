// The cua host's backend semantics (src/chrome/host.mjs createHost) against the fake cua extension, in process: every
// row of the spec's coverage table and every rule of "Sessions, turns, ownership"
// (docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md). The program around it (stdio, socket, status
// file, exit) is test/chrome-host-run.test.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHost} from '../src/chrome/host.mjs';
import {NO_HANDLER} from '../src/chrome/protocol.mjs';
import {createFakeCuaExtension} from './helpers/fake-cua-extension.mjs';

const OTHER = 'tab owned by another session';
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
  assert.deepEqual(info, {type: 'extension', family: 'chrome', name: 'cua', version: '1.2.3', capabilities: {browser: [], tab: []}, metadata: {extensionInstanceId: ext.instanceId}});
  assert.equal('agentRequestHeaderEnabled' in info, false);
  assert.equal(ext.calls.length, 0, 'getInfo never waits on the extension');
});

test('fallback methods and unknown ones answer the vendor\'s exact No-handler string with code -1', async () => {
  const {call, client} = setup();
  const c = client();
  for (const method of ['executeCdpWithCachedExpression', 'executeTabRead', 'followSessionTab', 'allowDownload', 'browserAuthNewTargetProtection', 'executeUnhandledCommand', 'getUserHistory', 'getBookmarks', 'finalizeTabs']) {
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
  assert.deepEqual(sent('tabs.create')[0], {url: 'about:blank', windowId: 2, group: {key: 'sA', title: 'cua'}});
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

test('attach is idempotent, an already-held debuggee is success, and another debugger is a refusal with Chrome\'s wording', async () => {
  const {ext, client, session, sent} = setup();
  const a = session(client(), 'sA');
  const tab = await a.call('createTab', {});
  ext.state.held.add(`tab:${tab.id}`);
  assert.deepEqual(await a.call('attach', {tabId: tab.id}), {});
  assert.deepEqual(await a.call('attach', {tabId: tab.id}), {});
  assert.equal(sent('debugger.attach').length, 1);
  const other = await a.call('createTab', {});
  ext.state.foreign.add(`tab:${other.id}`);
  await assert.rejects(a.call('attach', {tabId: other.id}), e => e.message === `Another debugger is already attached to the tab with id: ${other.id}.`);
  await assert.rejects(a.call('executeCdp', {target: {tabId: other.id}, method: 'Page.enable'}), /Debugger unattached/);
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
  assert.deepEqual(await a.call('getUserTabs', {}), []);
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
