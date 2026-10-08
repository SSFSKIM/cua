// A `chrome.*` stub for loading the cua extension's service worker (extension/background.js) in node:test, no Chrome.
// It models the slice of Chrome the extension uses: tabs, windows, tab groups, chrome.debugger (debuggees by tabId or
// OOPIF targetId, child sessions, events, detaches), runtime (native port, lifecycle events, popup messages),
// storage.local/session and alarms. Every API returns a promise and rejects with Chrome's documented error wording.
// chrome.debugger follows Chromium: a second attach by the same extension fails with "Another debugger is already
// attached" while DevTools and other extensions attach alongside; a CDP-level error rejects with the protocol error as a
// JSON string; commands pending when a debuggee detaches reject with "Detached while handling command.".
//
// Each tab holds a fake page (test/helpers/fake-page.mjs; a new one per navigation) where chrome.scripting runs the
// extension's page guards as Chrome does, serialized into the page's own or the extension's isolated world. Chrome's
// rule about other extensions' frames is modelled: while such a frame is committed in a tab, chrome.debugger refuses to
// attach it ("Cannot access a chrome-extension:// URL of different extension"), and one committing while the tab is
// attached detaches it. A page's chrome.runtime.sendMessage reaches the worker with the tab as sender.
//
// The native port is the point: `runtime.connectNative(name)` spawns the real host (src/chrome/host.mjs) as Chrome does
// — a child process with the home baked into its environment, u32-framed JSON on stdin/stdout — or, with
// `nativeHost: 'fake'`, connects to a test-held JSON-RPC peer (`hostPeers`) for primitive-level checks. Chrome's limits
// are enforced: a host->extension message over 1 MB tears the port down, as Chrome does.
//
// `load()` runs background.js in a fresh vm context whose timers are the stub's (`timers`, fired by `fireTimers()`) and
// whose clock is `stub.now` (advanced by `advance(ms)`), so the 5 s retry and the alarm backoff are observable without
// waiting. Loading twice with the same stub is a service worker restart: storage
// survives, the worker's memory does not.
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {createPeer, encodeFrame, frameDecoder} from '../../src/chrome/protocol.mjs';
import {CUA_EXTENSION_ID, CUA_HOST_NAME} from '../../src/chrome/extension.mjs';
import {createFakePage} from './fake-page.mjs';

export const EXTENSION_DIR = fileURLToPath(new URL('../../extension/', import.meta.url));
export const HOST = fileURLToPath(new URL('../../src/chrome/host.mjs', import.meta.url));
export const MANIFEST = JSON.parse(readFileSync(new URL('manifest.json', `file://${EXTENSION_DIR}`), 'utf8'));
const MAX_TO_EXTENSION_BYTES = 1024 * 1024;
const later = () => new Promise(resolve => setImmediate(resolve));

function event() {
  const listeners = [];
  return {
    addListener: fn => { listeners.push(fn); },
    removeListener: fn => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
    hasListener: fn => listeners.includes(fn),
    get count() { return listeners.length; },
    dispatch: (...args) => listeners.map(fn => fn(...args)),
    clear: () => { listeners.length = 0; },
  };
}

const keyOf = d => (d?.targetId !== undefined ? `target:${d.targetId}` : `tab:${d?.tabId}`);
const fail = message => Promise.reject(new Error(message));

export function createChromeStub({home, nativeHost = 'process', hostInstalled = true,
  windows = [{id: 1, focused: true, type: 'normal'}], cdp = defaultCdp} = {}) {
  let nextTabId = 100, nextWindowId = 50, nextGroupId = 900, nextTarget = 1;
  const state = {
    windows: new Map(windows.map(w => [w.id, {...w}])),
    tabs: new Map(),
    groups: new Map(),           // groupId -> {id, windowId, title}
    frames: new Map(),           // OOPIF targetId -> {tabId, url}
    attached: new Map(),         // debuggee key -> the debuggee the extension attached
    devtools: new Set(),         // debuggee keys another client (DevTools, another extension) is attached to, alongside
    pending: new Map(),          // debuggee key -> rejecters of its commands in flight
    storage: {},
    session: {},                 // storage.session: survives a worker restart, not a browser restart
    alarms: new Map(),
  };
  // Every chrome.* call the extension made: {api, args}. Chrome serializes what crosses its API, and so does the stub:
  // the worker's objects belong to the vm context's realm, the copies to the test's.
  const calls = [];
  const record = (api, ...args) => calls.push({api, args: structuredClone(args)});
  const timers = [];             // the worker's pending setTimeouts: {ms, fn}
  const console = {lines: [], log: (...a) => console.lines.push(a.join(' ')), warn: (...a) => console.lines.push(a.join(' ')),
    error: (...a) => console.lines.push(a.join(' ')), info: () => {}, debug: () => {}};
  const ports = [];              // every native port: {name, posted, connected, child?, peer?}
  const hostPeers = [];          // nativeHost 'fake': the test's end of each port

  const ev = {
    tabsRemoved: event(), tabsUpdated: event(), debuggerEvent: event(), debuggerDetach: event(),
    startup: event(), installed: event(), message: event(), alarm: event(), groupRemoved: event(),
  };

  const pages = new Map();       // tabId -> its fake page
  function loadPage(tabId, url) {
    const page = createFakePage({url, extensionId: CUA_EXTENSION_ID,
      sendMessage: message => stub.sendMessage(message, {id: CUA_EXTENSION_ID, tab: tabInfo(state.tabs.get(tabId)), frameId: 0}),
      onCommit: () => { if (pages.get(tabId) === page && page.foreignFrames().length) detachFor(d => d.tabId === tabId || state.frames.get(d.targetId)?.tabId === tabId, 'target_closed'); }});
    pages.set(tabId, page);
    return page;
  }
  function addTab({windowId = [...state.windows.keys()][0], url = 'https://user.fixture.invalid/', title = 'User tab', active = false, openerTabId} = {}) {
    const id = nextTabId++;
    const tab = {id, windowId, url, title, active, groupId: -1, status: 'complete', index: [...state.tabs.values()].filter(t => t.windowId === windowId).length,
      ...(openerTabId !== undefined ? {openerTabId} : {})};
    state.tabs.set(id, tab);
    loadPage(id, url);
    return tab;
  }
  const tabInfo = t => ({...t});
  const FOREIGN_FRAME = 'Cannot access a chrome-extension:// URL of different extension';
  function detachFor(predicate, reason) {
    for (const [key, d] of [...state.attached]) {
      if (!predicate(d)) continue;
      state.attached.delete(key);
      for (const reject of state.pending.get(key) ?? []) reject(new Error('Detached while handling command.'));
      state.pending.delete(key);
      ev.debuggerDetach.dispatch({...d}, reason);
    }
  }
  function removeTab(tabId) {
    detachFor(d => d.tabId === tabId || state.frames.get(d.targetId)?.tabId === tabId, 'target_closed');
    for (const [targetId, f] of state.frames) if (f.tabId === tabId) state.frames.delete(targetId);
    const tab = state.tabs.get(tabId);
    state.tabs.delete(tabId);
    pages.delete(tabId);
    if (tab?.groupId >= 0 && ![...state.tabs.values()].some(t => t.groupId === tab.groupId)) {
      state.groups.delete(tab.groupId);
      ev.groupRemoved.dispatch({id: tab.groupId});
    }
    ev.tabsRemoved.dispatch(tabId, {windowId: tab?.windowId, isWindowClosing: false});
  }
  function requireDebuggee(d) {
    if (d?.targetId !== undefined) {
      if (!state.frames.has(d.targetId) && !pageTarget(d.targetId)) throw new Error(`No target with given id ${d.targetId}.`);
    } else if (!state.tabs.has(d?.tabId)) throw new Error(`No tab with given id ${d?.tabId}.`);
  }
  const attachedByAnyone = key => state.attached.has(key) || state.devtools.has(key);
  const heldCdp = new Map();     // CDP method -> resolvers of commands the test holds unanswered
  const pageTarget = targetId => [...state.tabs.values()].find(t => `PAGE-${t.id}` === targetId);
  const notAttached = d => (d?.targetId !== undefined ? `Debugger is not attached to the target with id: ${d.targetId}.` : `Debugger is not attached to the tab with id: ${d?.tabId}.`);
  const call = (api, fn) => async (...args) => { record(api, ...args); await later(); return fn(...args); };

  // --- the native port --------------------------------------------------------------------------------------------

  function connectNative(name) {
    record('runtime.connectNative', name);
    const onMessage = event(), onDisconnect = event();
    const entry = {name, posted: [], connected: true, child: null, peer: null};
    ports.push(entry);
    const drop = error => {
      if (!entry.connected) return;
      entry.connected = false;
      chrome.runtime.lastError = error ? {message: error} : undefined;
      try { onDisconnect.dispatch(port); } finally { chrome.runtime.lastError = undefined; }
    };
    const deliver = message => { if (entry.connected) onMessage.dispatch(JSON.parse(JSON.stringify(message)), port); };
    const port = {
      name, onMessage, onDisconnect,
      postMessage(message) {
        if (!entry.connected) throw new Error('Attempting to use a disconnected port object');
        entry.posted.push(JSON.parse(JSON.stringify(message)));
        if (entry.child) entry.child.stdin.write(encodeFrame(message));
        if (entry.peer) { const copy = JSON.parse(JSON.stringify(message)); setImmediate(() => entry.peer.receive(copy)); }
      },
      // The extension closing its end: no onDisconnect on this side; the host sees its stdin end.
      disconnect() { if (!entry.connected) return; entry.connected = false; entry.child?.stdin.end(); entry.closeFake?.(); },
    };
    entry.port = port;
    if (name !== CUA_HOST_NAME || !hostInstalled) {
      setImmediate(() => drop('Specified native messaging host not found.'));
      return port;
    }
    if (nativeHost === 'process') {
      const child = spawn(process.execPath, [HOST], {env: {PATH: process.env.PATH, CUA_HOME: home}, stdio: ['pipe', 'pipe', 'ignore']});
      entry.child = child;
      child.stdin.on('error', () => {});
      const push = frameDecoder(MAX_TO_EXTENSION_BYTES);
      child.stdout.on('data', chunk => {
        let messages;
        try { messages = push(chunk); } catch {
          // Chrome's reaction to an oversized host message: the port is torn down and the host killed.
          child.kill('SIGKILL');
          drop('Error when communicating with the native messaging host.');
          return;
        }
        for (const m of messages) deliver(m);
      });
      // 'close', not 'exit': Chrome delivers what the host wrote before it reports the port closed.
      child.once('close', () => { entry.exited = true; drop('Native host has exited.'); });
    } else {
      const peer = createPeer({
        send: bytes => { for (const m of frameDecoder()(bytes)) setImmediate(() => deliver(m)); },
        handlers: {hello: params => { host.hello = params; }},
      });
      const host = {peer, hello: null, request: (m, p) => peer.request(m, p), notify: (m, p) => peer.notify(m, p),
        get received() { return entry.posted; },
        // The host going away (it exited, or Chrome closed it), after what it already sent is delivered.
        exit(error = 'Native host has exited.') { peer.close('port closed'); setImmediate(() => drop(error)); },
        get connected() { return entry.connected; }};
      entry.peer = peer;
      entry.closeFake = () => peer.close('port closed');
      hostPeers.push(host);
    }
    return port;
  }

  // --- chrome.* ---------------------------------------------------------------------------------------------------

  const chrome = {
    runtime: {
      id: CUA_EXTENSION_ID,
      lastError: undefined,
      getManifest: () => JSON.parse(JSON.stringify(MANIFEST)),
      connectNative,
      sendMessage: message => stub.sendMessage(message),
      onStartup: ev.startup, onInstalled: ev.installed, onMessage: ev.message,
    },
    storage: {
      local: {
        get: async keys => {
          record('storage.local.get', keys);
          await later();
          const names = keys == null ? Object.keys(state.storage) : [keys].flat();
          return Object.fromEntries(names.filter(k => Object.hasOwn(state.storage, k)).map(k => [k, structuredClone(state.storage[k])]));
        },
        set: async items => { record('storage.local.set', items); await later(); Object.assign(state.storage, structuredClone(items)); },
      },
      session: {
        get: async keys => {
          await later();
          const names = keys == null ? Object.keys(state.session) : [keys].flat();
          return Object.fromEntries(names.filter(k => Object.hasOwn(state.session, k)).map(k => [k, structuredClone(state.session[k])]));
        },
        set: async items => { await later(); Object.assign(state.session, structuredClone(items)); },
        remove: async keys => { await later(); for (const k of [keys].flat()) delete state.session[k]; },
      },
    },
    alarms: {
      create: async (name, info) => { record('alarms.create', name, info); state.alarms.set(name, {name, ...info}); },
      get: async name => (state.alarms.has(name) ? {...state.alarms.get(name)} : undefined),
      clear: async name => state.alarms.delete(name),
      onAlarm: ev.alarm,
    },
    windows: {
      getAll: call(`windows.getAll`, () => [...state.windows.values()].map(w => ({...w}))),
      create: call(`windows.create`, ({focused = true, type = 'normal'} = {}) => {
        const id = nextWindowId++;
        state.windows.set(id, {id, focused, type});
        addTab({windowId: id, url: 'chrome://newtab/', title: 'New Tab', active: true});
        return {id, focused, type};
      }),
    },
    tabs: {
      query: call(`tabs.query`, () => [...state.tabs.values()].map(tabInfo)),
      get: call(`tabs.get`, tabId => (state.tabs.has(tabId) ? tabInfo(state.tabs.get(tabId)) : fail(`No tab with id: ${tabId}.`))),
      create: call(`tabs.create`, ({url = 'chrome://newtab/', windowId, active = true, openerTabId} = {}) => {
        const w = windowId ?? [...state.windows.values()].find(x => x.focused)?.id;
        if (!state.windows.has(w)) return fail(`No window with id: ${windowId}.`);
        if (openerTabId !== undefined && state.tabs.get(openerTabId)?.windowId !== w) return fail(`Tab opener must be in the same window as the updated tab.`);
        return tabInfo(addTab({windowId: w, url, title: '', active, openerTabId}));
      }),
      remove: call(`tabs.remove`, tabIds => {
        for (const id of [tabIds].flat()) if (!state.tabs.has(id)) return fail(`No tab with id: ${id}.`);
        for (const id of [tabIds].flat()) removeTab(id);
      }),
      group: call(`tabs.group`, ({tabIds, groupId, createProperties}) => {
        const ids = [tabIds].flat();
        for (const id of ids) if (!state.tabs.has(id)) return fail(`No tab with id: ${id}.`);
        let g;
        if (groupId !== undefined) {
          g = state.groups.get(groupId);
          if (!g) return fail(`No group with id: ${groupId}.`);
        } else {
          const windowId = createProperties?.windowId ?? state.tabs.get(ids[0]).windowId;
          g = {id: nextGroupId++, windowId, title: ''};
          state.groups.set(g.id, g);
        }
        for (const id of ids) Object.assign(state.tabs.get(id), {groupId: g.id, windowId: g.windowId});
        return g.id;
      }),
      ungroup: call(`tabs.ungroup`, tabIds => {
        for (const id of [tabIds].flat()) if (!state.tabs.has(id)) return fail(`No tab with id: ${id}.`);
        for (const id of [tabIds].flat()) state.tabs.get(id).groupId = -1;
      }),
      onRemoved: ev.tabsRemoved, onUpdated: ev.tabsUpdated,
    },
    tabGroups: {
      get: call(`tabGroups.get`, groupId => (state.groups.has(groupId) ? {...state.groups.get(groupId)} : fail(`No group with id: ${groupId}.`))),
      update: call(`tabGroups.update`, (groupId, props) => {
        const g = state.groups.get(groupId);
        if (!g) return fail(`No group with id: ${groupId}.`);
        Object.assign(g, props);
        return {...g};
      }),
      onRemoved: ev.groupRemoved,
    },
    debugger: {
      attach: call(`debugger.attach`, (debuggee, version) => {
        if (version !== '1.3') return fail(`Requested protocol version is not supported: ${version}.`);
        requireDebuggee(debuggee);
        const tabId = debuggee.tabId ?? state.frames.get(debuggee.targetId)?.tabId;
        if (pages.get(tabId)?.foreignFrames().length) return fail(FOREIGN_FRAME);
        const key = keyOf(debuggee);
        if (state.attached.has(key))
          return fail(`Another debugger is already attached to the ${debuggee.targetId !== undefined ? 'target' : 'tab'} with id: ${debuggee.targetId ?? debuggee.tabId}.`);
        state.attached.set(key, debuggee.targetId !== undefined ? {targetId: debuggee.targetId} : {tabId: debuggee.tabId});
      }),
      detach: call(`debugger.detach`, debuggee => {
        if (!state.attached.delete(keyOf(debuggee))) return fail(notAttached(debuggee));
      }),
      sendCommand: call(`debugger.sendCommand`, async (target, method, params) => {
        const key = keyOf(target);
        if (!state.attached.has(key)) return fail(notAttached(target));
        if (heldCdp.has(method)) {
          return await new Promise((resolve, reject) => {
            heldCdp.get(method).push(resolve);
            state.pending.set(key, [...(state.pending.get(key) ?? []), reject]);
          });
        }
        try {
          return await cdp({target, method, params, stub});
        } catch (error) {
          // The protocol's own error: Chrome hands the extension its JSON as the message.
          if (error instanceof CdpError) throw new Error(JSON.stringify({code: error.code, message: error.message}));
          throw error;
        }
      }),
      getTargets: call(`debugger.getTargets`, () => [
        // Chromium's SerializeTarget: an OOPIF is type "other"; `attached` is true for any client, not only this one.
        ...[...state.tabs.values()].map(t => ({type: 'page', id: `PAGE-${t.id}`, tabId: t.id, attached: attachedByAnyone(`tab:${t.id}`), title: t.title, url: t.url})),
        ...[...state.frames].map(([id, f]) => ({type: 'other', id, attached: attachedByAnyone(`target:${id}`), title: '', url: f.url})),
      ]),
      onEvent: ev.debuggerEvent, onDetach: ev.debuggerDetach,
    },
    // Runs `func` in the tab's page, in the page's own world (MAIN) or the extension's; one frame (the main one). A page
    // cua's host permissions do not reach (not http(s)) is refused.
    scripting: {
      executeScript: async ({target, func, args = [], world = 'ISOLATED', injectImmediately}) => {
        calls.push({api: 'scripting.executeScript', args: [{target: structuredClone(target), func: func?.name, args: structuredClone(args), world, injectImmediately}]});
        await later();
        const tab = state.tabs.get(target?.tabId);
        if (!tab) return fail(`No tab with id: ${target?.tabId}.`);
        if (tab.url.startsWith('chrome://')) return fail('Cannot access a chrome:// URL');
        // Chrome 154's wording, seen live for an agent tab's about:blank (#81 evidence).
        if (!/^https?:/.test(tab.url)) return fail(`Cannot access contents of url "${tab.url}". Extension manifest must request permission to access this host.`);
        const page = pages.get(tab.id);
        const result = await page.run(world === 'MAIN' ? 'main' : 'isolated', `(${func.toString()})(...${JSON.stringify(args)})`);
        return [{frameId: 0, documentId: `doc-${tab.id}-${page.url}`, result: result === undefined ? null : JSON.parse(JSON.stringify(result))}];
      },
    },
  };

  const stub = {
    chrome, state, calls, timers, console, ports, hostPeers, events: ev,
    callsOf: api => calls.filter(c => c.api === api).map(c => c.args),
    // Runs extension/background.js (or `source`) in a fresh worker context.
    load(source = readFileSync(new URL('background.js', `file://${EXTENSION_DIR}`), 'utf8')) {
      // A restarted worker starts from nothing: the previous one's listeners and timers are gone.
      for (const e of Object.values(ev)) e.clear();
      for (const t of timers) t.cleared = true;
      const context = vm.createContext({
        chrome, console, crypto: globalThis.crypto, TextEncoder,
        Date: stubDate(),
        setTimeout: (fn, ms) => { const timer = {fn, ms, cleared: false}; timers.push(timer); return timer; },
        clearTimeout: timer => { if (timer) timer.cleared = true; },
      });
      context.self = context;
      context.globalThis = context;
      vm.runInContext(source, context, {filename: 'background.js'});
      return context;
    },
    // The worker dies (Chrome stopped it) and a new one loads: the dead worker's ports close from its side (no
    // onDisconnect runs in it, so it detaches nothing) and their hosts see the port end; Chrome keeps the debugger
    // attachments, which belong to the extension, not the worker.
    restartWorker() {
      for (const entry of ports) if (entry.connected) entry.port.disconnect();
      return stub.load();
    },
    // Fires every pending worker timer (optionally only those of `ms`), returning the delays fired.
    fireTimers(ms) {
      const due = timers.filter(t => !t.cleared && (ms === undefined || t.ms === ms));
      for (const t of due) { t.cleared = true; t.fn(); }
      return due.map(t => t.ms);
    },
    pendingTimers: () => timers.filter(t => !t.cleared).map(t => t.ms),
    fireAlarm(name) { ev.alarm.dispatch({name, scheduledTime: stub.now}); },
    now: Date.now(),
    advance(ms) { stub.now += ms; },
    // CDP commands of `method` stay unanswered until released (or their debuggee detaches).
    holdCdp(method) { heldCdp.set(method, []); },
    releaseCdp(method, result = {}) { for (const resolve of heldCdp.get(method) ?? []) resolve(result); heldCdp.delete(method); },
    // The popup (or, with `sender`, a page's content script) asking the worker something, as chrome.runtime.sendMessage does.
    sendMessage(message, sender = {id: CUA_EXTENSION_ID}) {
      return new Promise((resolve, reject) => {
        let answered = false;
        const results = ev.message.dispatch(structuredClone(message), structuredClone(sender), response => { answered = true; resolve(structuredClone(response)); });
        if (!answered && !results.includes(true)) reject(new Error('The message port closed before a response was received.'));
      });
    },
    get port() { return ports.at(-1); },
    addTab, removeTab,
    addWindow({focused = false, type = 'normal'} = {}) { const id = nextWindowId++; state.windows.set(id, {id, focused, type}); return id; },
    // An out-of-process iframe in a tab: a target chrome.debugger can attach by targetId.
    addFrame(tabId, url = 'http://127.0.0.1:9/frame') { const id = `OOPIF-${nextTarget++}`; state.frames.set(id, {tabId, url}); return id; },
    // Browser-side happenings a test drives.
    cdpEvent(source, method, params = {}) {
      const {sessionId, ...debuggee} = source;
      if (state.attached.has(keyOf(debuggee))) ev.debuggerEvent.dispatch({...source}, method, params);
    },
    userCancel(debuggee) { detachFor(d => keyOf(d) === keyOf(debuggee), 'canceled_by_user'); },
    userCloseTab(tabId) { if (state.tabs.has(tabId)) removeTab(tabId); },
    // A new document in the tab (a fresh page: whatever was injected into the old one is gone).
    navigate(tabId, url, title) {
      const tab = state.tabs.get(tabId);
      Object.assign(tab, {url, title, status: 'complete'});
      loadPage(tabId, url);
      ev.tabsUpdated.dispatch(tabId, {url, title, status: 'complete'}, tabInfo(tab));
    },
    page: tabId => pages.get(tabId),
    // Ends every spawned host (test cleanup).
    async shutdown() {
      await Promise.all(ports.filter(p => p.child && !p.exited).map(p => new Promise(resolve => {
        p.child.once('close', resolve);
        p.child.stdin.end();
        setTimeout(() => p.child.kill('SIGKILL'), 2000).unref();
      })));
    },
  };
  // The worker's Date: real dates, but Date.now() is the stub's clock.
  function stubDate() {
    return class extends Date { static now() { return stub.now; } };
  }
  return stub;
}

// A CDP handler throws this for a protocol-level error (what Chrome reports as {"code":…,"message":…}).
export class CdpError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// Runtime.evaluate echoes its expression (so a round trip is visible); everything else answers {}.
export function defaultCdp({method, params}) {
  if (method === 'Runtime.evaluate') return {result: {type: 'string', value: `evaluated:${params?.expression ?? ''}`}};
  return {};
}
