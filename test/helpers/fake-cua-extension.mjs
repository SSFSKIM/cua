// A fake cua extension: the extension protocol's primitives (spec, Interfaces and Dependencies, "The extension
// protocol") over synthetic Chrome state, for the host's tests and the H1 vendor probe. No Chrome is involved: windows,
// tabs, tab groups, debuggees and CDP answers are made up here. Chrome's errors use the documented wordings
// (chrome.tabs: "No tab with id: N."; chrome.debugger: "No tab with given id N.", "Another debugger is already attached
// to the tab with id: N.", "Debugger is not attached to the tab with id: N.").
//
// Two wirings: `api` ({request(method, params)}, answered on a later turn) plugs straight into createHost, with
// `onNotify` receiving the extension's notifications; `connect({toHost, fromHost})` speaks real native-messaging
// frames to a host's stdin/stdout through src/chrome/protocol.mjs and says hello first, as the extension does.
import {randomUUID} from 'node:crypto';
import {createPeer, frameDecoder} from '../../src/chrome/protocol.mjs';

const later = () => new Promise(resolve => setImmediate(resolve));
const keyOf = debuggee => (debuggee?.targetId !== undefined ? `target:${debuggee.targetId}` : `tab:${debuggee?.tabId}`);
const debuggeeOf = key => (key.startsWith('target:') ? {targetId: key.slice(7)} : {tabId: Number(key.slice(4))});

// The default CDP answers: Runtime.evaluate returns its expression as a string value (so a round trip is visible);
// Target.attachedToTarget is never invented. Everything else answers {}.
export function defaultCdp({method, params}) {
  if (method === 'Runtime.evaluate') return {result: {type: 'string', value: `fake-evaluated:${params?.expression ?? ''}`}};
  return {};
}

export function createFakeCuaExtension({instanceId = randomUUID(), version = '0.1.0', protocolVersion = 1,
  windows = [{id: 1, focused: true, type: 'normal'}], tabs = [], cdp = defaultCdp} = {}) {
  let nextTabId = 100;
  let nextWindowId = 50;
  let nextGroupId = 900;
  let connected = true;
  const state = {
    windows: new Map(windows.map(w => [w.id, {...w}])),
    tabs: new Map(),
    groups: new Map(),          // groupId -> {id, windowId, key, title}
    held: new Set(),            // debuggee keys this extension holds
    foreign: new Set(),         // debuggee keys another debugger (DevTools, another extension) holds
  };
  const calls = [];             // every primitive the host asked for: {method, params}
  const hold = new Map();       // CDP method -> pending resolvers: never answered while held
  let onNotify = () => {};

  function addTab({windowId = [...state.windows.keys()][0], url = 'https://user.fixture.invalid/', title = 'User tab', active = false} = {}) {
    const id = nextTabId++;
    state.tabs.set(id, {id, windowId, url, title, active, groupId: -1, status: 'complete'});
    return state.tabs.get(id);
  }
  for (const t of tabs) addTab(t);

  const tabOr = (tabId, message) => { const tab = state.tabs.get(tabId); if (!tab) throw new Error(message); return tab; };
  function groupFor(windowId, key, title) {
    for (const g of state.groups.values()) if (g.windowId === windowId && g.key === key) return g;
    const g = {id: nextGroupId++, windowId, key, title};
    state.groups.set(g.id, g);
    return g;
  }
  function requireDebuggee(debuggee) {
    if (debuggee?.targetId !== undefined) {
      const [tabId] = String(debuggee.targetId).match(/^T-(\d+)/)?.slice(1).map(Number) ?? [];
      if (!state.tabs.has(tabId)) throw new Error(`No target with given id ${debuggee.targetId}.`);
    } else tabOr(debuggee?.tabId, `No tab with given id ${debuggee?.tabId}.`);
  }
  const notAttached = debuggee => (debuggee?.targetId !== undefined
    ? `Debugger is not attached to the target with id: ${debuggee.targetId}.`
    : `Debugger is not attached to the tab with id: ${debuggee?.tabId}.`);

  const primitives = {
    'tabs.query': () => [...state.tabs.values()].map(({id, windowId, url, title, active, groupId}) => ({id, windowId, url, title, active, groupId})),
    'tabs.create': ({url = 'about:blank', windowId, group}) => {
      if (!state.windows.has(windowId)) throw new Error(`No window with id: ${windowId}.`);
      const tab = addTab({windowId, url, title: '', active: false});
      if (group) tab.groupId = groupFor(windowId, group.key, group.title).id;
      return {id: tab.id, windowId};
    },
    'tabs.remove': ({tabId}) => {
      tabOr(tabId, `No tab with id: ${tabId}.`);
      removeTab(tabId);
      return {};
    },
    'tabs.get': ({tabId}) => {
      const {id, windowId, url, title, status} = tabOr(tabId, `No tab with id: ${tabId}.`);
      return {id, windowId, url, title, status};
    },
    'tabs.ungroup': ({tabId}) => { tabOr(tabId, `No tab with id: ${tabId}.`).groupId = -1; return {}; },
    'group.title': ({windowId, key, title}) => {
      for (const g of state.groups.values()) if (g.windowId === windowId && g.key === key) g.title = title;
      return {};
    },
    'windows.query': () => [...state.windows.values()].map(({id, focused, type}) => ({id, focused, type})),
    'windows.create': ({focused = false}) => {
      const id = nextWindowId++;
      state.windows.set(id, {id, focused, type: 'normal'});
      return {id};
    },
    'debugger.attach': debuggee => {
      requireDebuggee(debuggee);
      const key = keyOf(debuggee);
      if (state.held.has(key)) return {alreadyHeld: true};
      if (state.foreign.has(key)) throw new Error(`Another debugger is already attached to the tab with id: ${debuggee.tabId ?? debuggee.targetId}.`);
      state.held.add(key);
      return {alreadyHeld: false};
    },
    'debugger.detach': debuggee => {
      if (!state.held.delete(keyOf(debuggee))) throw new Error(notAttached(debuggee));
      return {};
    },
    'debugger.sendCommand': async ({debuggee, sessionId, method, params}) => {
      if (!state.held.has(keyOf(debuggee))) throw new Error(notAttached(debuggee));
      if (hold.has(method)) return await new Promise(resolve => hold.get(method).push(resolve));
      return cdp({debuggee, sessionId, method, params});
    },
    'debugger.getTargets': () => [...state.tabs.values()].map(t => ({type: 'page', id: `T-${t.id}`, tabId: t.id, attached: state.held.has(`tab:${t.id}`), title: t.title, url: t.url})),
    held: () => [...state.held].map(debuggeeOf),
  };

  function removeTab(tabId) {
    for (const key of [...state.held]) {
      const d = debuggeeOf(key);
      if (d.tabId === tabId || String(d.targetId ?? '').startsWith(`T-${tabId}-`)) { state.held.delete(key); emit('debugger.detached', {debuggee: d, reason: 'target_closed'}); }
    }
    state.tabs.delete(tabId);
    emit('tabs.removed', {tabId});
  }

  function emit(method, params) { if (connected) onNotify(method, params); }

  async function handle(method, params = {}) {
    calls.push({method, params});
    await later();
    if (!connected) throw new Error('extension disconnected');
    const primitive = Object.hasOwn(primitives, method) ? primitives[method] : null;
    if (!primitive) throw Object.assign(new Error(`No handler registered for method: ${method}`), {code: -1});
    return await primitive(params);
  }

  const hello = () => ({extensionId: 'jkejaaijdfpohkdhankllbekkhmnippb', extensionInstanceId: instanceId, version, protocolVersion});

  return {
    instanceId, version, state, calls, hello,
    api: {request: handle},
    set onNotify(fn) { onNotify = fn; },
    addTab,
    addWindow({focused = false, type = 'normal'} = {}) { const id = nextWindowId++; state.windows.set(id, {id, focused, type}); return id; },
    // Browser-side happenings a test drives.
    cdpEvent(debuggee, method, params, sessionId) {
      if (state.held.has(keyOf(debuggee))) emit('debugger.event', {debuggee, ...(sessionId ? {sessionId} : {}), method, params});
    },
    userCancel(debuggee) {
      if (state.held.delete(keyOf(debuggee))) emit('debugger.detached', {debuggee, reason: 'canceled_by_user'});
    },
    userCloseTab(tabId) { if (state.tabs.has(tabId)) removeTab(tabId); },
    holdCdp(method) { hold.set(method, []); },
    releaseCdp(method, result = {}) { for (const resolve of hold.get(method) ?? []) resolve(result); hold.delete(method); },
    // The native port, as the real extension holds it: hello first, then requests answered and notifications sent.
    connect({toHost, fromHost, sendHello = true, helloParams}) {
      const received = [];
      const peer = createPeer({send: bytes => { if (!toHost.destroyed && !toHost.writableEnded) toHost.write(bytes); },
        handlers: Object.fromEntries(Object.keys(primitives).map(m => [m, params => handle(m, params)]))});
      const push = frameDecoder();
      fromHost.on('data', chunk => { for (const m of push(chunk)) { received.push(m); peer.receive(m); } });
      onNotify = (method, params) => { try { peer.notify(method, params); } catch {} };
      if (sendHello) peer.notify('hello', helloParams ?? hello());
      return {
        peer, received,
        // The port dropping: the extension stops answering and the host's stdin ends.
        disconnect() { connected = false; peer.close('port closed'); if (!toHost.writableEnded) toHost.end(); },
      };
    },
    disconnect() { connected = false; },
  };
}
