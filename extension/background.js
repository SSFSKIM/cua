// cua's Chrome extension: the service worker. It exposes Chrome's primitives (tabs, windows, tab groups,
// chrome.debugger) to cua's native host (io.github.ssfskim.cua, src/chrome/host.mjs in the cua checkout) over native
// messaging, and keeps no state beyond the debuggees it attached, which tab group serves which (window, session), and
// which tabs the host asked it to guard. Every session, turn and ownership rule lives in the host. Spec (in the cua repository):
// docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md, "The extension" and "The extension protocol".
//
// The wire is JSON-RPC 2.0 with the host's peer conventions (src/chrome/protocol.mjs; an extension cannot import from
// the checkout, so this is a copy of the half it needs): an error reply is {code, message} with Chrome's own message
// verbatim, an unknown method answers code -1 "No handler registered for method: <m>", a failing handler code 1. The
// extension sends no requests, only notifications: hello (first), debugger.event, debugger.detached, tabs.removed,
// tabs.updated, tabs.popup. Native messaging frames each message; the host refuses to send one over Chrome's 1 MB limit.
//
// Page guards (the only code cua runs in pages, and only in tabs the host owns): Chrome detaches chrome.debugger from a
// tab, and refuses to attach it again, while a frame of another extension is in the tab ("Cannot access a
// chrome-extension:// URL of different extension"); input-helper and password-manager extensions draw such frames when
// a field is focused. The guard blanks every other extension's frame in a guarded tab (srcdoc "", as the ChatGPT
// extension's foreign-frame monitor does) when it appears and whenever the host asks before an attach, and routes a
// user-activated window.open or target=_blank link of the page to the host, which opens it as the session's tab
// (tabs.popup) instead of Chrome opening a tab no session owns. A tab is guarded from tabs.create {guard} or tabs.guard
// until tabs.unguard, its removal or the port dropping; each new document of a guarded tab is guarded as it commits.
//
// Connection: at load and on runtime.onStartup/onInstalled the worker connects and says hello. While disconnected it
// retries every 5 s, and the cua-reconnect alarm retries every minute (it wakes a suspended worker). When the port
// drops, every held debuggee is detached: a host that is gone cannot clean up. A host that refuses this extension
// (hostRefused {code, message}) is shown in the popup. protocol_mismatch and hello_invalid repeat until the host or the
// extension is updated, and every attempt spawns a host that writes a log, so after them only the alarm retries, backing
// off from 1 minute doubling to 60 (kept in storage.session, so a worker the alarm wakes honours it); onStartup and
// onInstalled start over. The popup is told of every change (cua.changed) so an open one stays current.
'use strict';

const HOST_NAME = 'io.github.ssfskim.cua';
const PROTOCOL_VERSION = 1;
const RETRY_MS = 5000;
const ALARM = 'cua-reconnect';
const INSTANCE_KEY = 'extensionInstanceId';
const DEBUGGER_VERSION = '1.3';
const LASTING_REFUSALS = new Set(['protocol_mismatch', 'hello_invalid']);
const BACKOFF_KEY = 'lastingRefusal';     // storage.session: {refusal, streak, notBefore}
const MINUTE_MS = 60_000;
const MAX_BACKOFF_MINUTES = 60;
const GUARD_KEY = '__cuaPageGuard';         // the isolated world's guard (frames, popup bridge)
const POPUPS_KEY = '__cuaPagePopups';       // the page's own world's window.open / link interceptor
const POPUP_EVENT = 'cua:popup-request';    // the page world asking the isolated world to open a URL
const SETTLE_MS = 1000;                     // how long a requested sweep waits for blanked frames to unload

let port = null;           // the open native port
let peer = null;           // its JSON-RPC peer
let connecting = null;     // the connect in progress
let retryTimer = null;
let refusal = null;        // the host's hostRefused {code, message} on the latest port
let lastError = null;      // Chrome's reason the latest port closed
let instanceIdLoad = null;
const held = new Map();    // debuggee key -> the debuggee this extension attached
const groups = new Map();  // windowId + session key -> promise of the Chrome tab group cua made for it
const guarded = new Set(); // tabIds the host owns and asked to guard

const keyOf = d => (d.targetId != null ? `target:${d.targetId}` : `tab:${d.tabId}`);
const debuggeeOf = d => (d?.targetId != null ? {targetId: d.targetId} : {tabId: d?.tabId});
const groupKey = (windowId, key) => `${windowId}\u0000${key}`;
const notAttached = error => /Debugger is not attached/.test(error?.message ?? '');

// --- the instance id ------------------------------------------------------------------------------------------------

// A UUID minted on first run and kept under storage.local.extensionInstanceId (the key the vendor service's and cua's
// profile readers look for; writing it also creates the profile's Local Extension Settings/<id>/ directory).
function loadInstanceId() {
  instanceIdLoad ??= (async () => {
    const stored = (await chrome.storage.local.get(INSTANCE_KEY))[INSTANCE_KEY];
    if (typeof stored === 'string' && stored) return stored;
    const minted = crypto.randomUUID();
    await chrome.storage.local.set({[INSTANCE_KEY]: minted});
    return minted;
  })().catch(error => { instanceIdLoad = null; throw error; });
  return instanceIdLoad;
}

// --- page guards ----------------------------------------------------------------------------------------------------

// Runs in a guarded tab's frames, in this extension's isolated world (chrome.scripting serializes it: no closure over
// the worker). Installs once per document, then every call sweeps and resolves {blanked} once the frames it blanked
// have unloaded (at most `settleMs`). Another extension's iframe gets srcdoc "" (it then holds an empty document, and
// its owner's script keeps a live element); a <frame> gets about:blank. Closed shadow roots are reached through
// chrome.dom. The popup bridge accepts one request per user activation from the page world's interceptor.
function pageGuard(key, popupEvent, settleMs) {
  const g = globalThis;
  if (!g[key]) {
    const ownId = chrome.runtime.id;
    const openOrClosed = chrome.dom?.openOrClosedShadowRoot;
    const foreign = url => {
      const u = typeof url === 'string' ? url.trim() : '';
      if (!u.startsWith('chrome-extension://')) return false;
      try { const {host} = new URL(u); return host !== '' && host !== ownId; } catch { return false; }
    };
    const shadowOf = el => {
      if (typeof openOrClosed === 'function') try { return openOrClosed(el) ?? null; } catch {}
      return el.shadowRoot ?? null;
    };
    const unloading = new Set();
    const watched = new WeakSet();
    let blanked = 0;
    const check = el => {
      const frame = el.tagName === 'IFRAME' || el.tagName === 'FRAME';
      if (frame && (foreign(el.getAttribute('src')) || foreign(el.src)) && !(el.tagName === 'IFRAME' && el.getAttribute('srcdoc') === '')) {
        unloading.add(el);
        el.addEventListener('load', () => unloading.delete(el), {once: true});
        if (el.tagName === 'IFRAME') el.setAttribute('srcdoc', ''); else el.setAttribute('src', 'about:blank');
        blanked++;
      }
      const root = shadowOf(el);
      if (root) watch(root);
    };
    const scan = node => {
      if (node.nodeType === 1) check(node);
      for (const el of node.querySelectorAll?.('*') ?? []) check(el);
    };
    const observer = new MutationObserver(records => {
      for (const r of records) {
        if (r.type === 'attributes') check(r.target);
        for (const n of r.addedNodes ?? []) if (n.nodeType === 1) scan(n);
      }
    });
    function watch(root) {
      if (watched.has(root)) return;
      watched.add(root);
      observer.observe(root, {subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'srcdoc']});
      scan(root);
    }
    let allowance = true;
    const renew = event => { if (event.isTrusted) allowance = true; };
    const onPopup = event => {
      if (typeof event.detail !== 'string' || navigator.userActivation?.isActive === false) return;
      event.preventDefault();   // handled: the page world does not fall back to Chrome's window.open
      if (!allowance) return;
      allowance = false;
      chrome.runtime.sendMessage({type: 'cua.popup', url: event.detail}).catch(() => {});
    };
    document.addEventListener('click', renew, true);
    document.addEventListener('keydown', renew, true);
    document.addEventListener(popupEvent, onPopup);
    g[key] = {
      sweep() {
        const before = blanked;
        if (watched.has(document)) scan(document); else watch(document);
        const count = blanked - before;
        const settled = Promise.all([...unloading].map(el => new Promise(resolve => el.addEventListener('load', resolve, {once: true}))));
        return Promise.race([settled, new Promise(resolve => setTimeout(resolve, settleMs))]).then(() => ({blanked: count}));
      },
      stop() {
        observer.disconnect();
        document.removeEventListener('click', renew, true);
        document.removeEventListener('keydown', renew, true);
        document.removeEventListener(popupEvent, onPopup);
        delete g[key];
      },
    };
  }
  return g[key].sweep();
}

// Runs in the page's own world (window.open is the page's), in the top frame only (a sandboxed subframe without
// allow-popups must not open tabs through it). A user-activated window.open of an http(s) URL into a new browsing
// context (no target, "" or _blank), or a click on such a link with target=_blank, is offered to the isolated world;
// when it takes it the page gets a stand-in window (null with noopener) and the host opens the URL as the session's
// tab. Left to Chrome: a call with window features (a sized popup, typically a sign-in flow that needs
// window.opener), every named target (it may name a frame or window anywhere in the frame tree), and anything without
// user activation (Chrome's popup blocker decides those).
function pagePopups(key, popupEvent) {
  const g = globalThis;
  if (g[key]) return true;
  const original = window.open;
  const NO_OPENER = /^(?:noopener|noreferrer)(?:\s*=\s*(?:1|yes|true))?$/i;
  const offer = url => {
    if (navigator.userActivation?.isActive === false) return false;
    let href;
    try { href = new URL(url, document.baseURI); } catch { return false; }
    if (href.protocol !== 'http:' && href.protocol !== 'https:') return false;
    return !document.dispatchEvent(new CustomEvent(popupEvent, {cancelable: true, detail: href.href}));
  };
  const fresh = target => target === '' || target.toLowerCase() === '_blank';
  const open = function (url, target, features) {
    const tokens = String(features ?? '').split(',').map(t => t.trim()).filter(Boolean);
    if (url == null || url === '' || !fresh(String(target ?? '')) || tokens.some(t => !NO_OPENER.test(t)) || !offer(String(url)))
      return original.apply(this, arguments);
    return tokens.length ? null : {closed: false, focus() {}, blur() {}, close() {}, postMessage() {}};
  };
  const onClick = event => {
    if (event.defaultPrevented || event.button !== 0) return;
    const a = event.composedPath().find(n => n?.tagName === 'A' && typeof n.href === 'string');
    if (!a || (a.hasAttribute('download') && a.origin === location.origin)) return;
    if (a.target.toLowerCase() !== '_blank') return;
    if (offer(a.href)) event.preventDefault();
  };
  // Armed in the capture phase, judged after the page's own handlers (which may cancel the click or navigate).
  const arm = () => { window.removeEventListener('click', onClick); window.addEventListener('click', onClick, {once: true}); };
  window.open = open;
  window.addEventListener('click', arm, true);
  g[key] = {stop() {
    window.removeEventListener('click', arm, true);
    window.removeEventListener('click', onClick);
    if (window.open === open) window.open = original;
    delete g[key];
  }};
  return true;
}

function pageUnguard(key) {
  globalThis[key]?.stop();
  return true;
}

// Guards every frame of the tab (the top frame's page-world interceptor first, so the bridge never sees a request it
// cannot route) and sweeps; resolves {frames, blanked}. Chrome's refusal (a page cua may not script) rejects verbatim.
// An unguard (or the port dropping) that arrived meanwhile wins: what this call installed is removed again.
async function guardFrames(tabId) {
  try {
    await chrome.scripting.executeScript({target: {tabId, frameIds: [0]}, injectImmediately: true, world: 'MAIN', func: pagePopups, args: [POPUPS_KEY, POPUP_EVENT]}).catch(() => {});
    const results = await chrome.scripting.executeScript({target: {tabId, allFrames: true}, injectImmediately: true, func: pageGuard, args: [GUARD_KEY, POPUP_EVENT, SETTLE_MS]});
    return {frames: results.length, blanked: results.reduce((n, r) => n + (r?.result?.blanked ?? 0), 0)};
  } finally {
    if (!guarded.has(tabId)) unguardFrames(tabId).catch(() => {});
  }
}

function unguardFrames(tabId) {
  const target = {tabId, allFrames: true};
  return Promise.all([
    chrome.scripting.executeScript({target, injectImmediately: true, world: 'MAIN', func: pageUnguard, args: [POPUPS_KEY]}),
    chrome.scripting.executeScript({target, injectImmediately: true, func: pageUnguard, args: [GUARD_KEY]}),
  ]);
}

// --- the primitives the host asks for -------------------------------------------------------------------------------

// Joins the (window, key) group, or makes it. The map holds the group's promise from the moment it is being made, so
// concurrent creates for one session join one group; a group the user closed or dragged to another window is replaced.
async function groupTab(tab, {key, title}) {
  const k = groupKey(tab.windowId, key);
  for (let known = groups.get(k); known !== undefined; known = groups.get(k)) {
    const groupId = await known.catch(() => undefined);
    const group = groupId === undefined ? null : await chrome.tabGroups.get(groupId).catch(() => null);
    if (group?.windowId === tab.windowId) {
      await chrome.tabs.group({groupId, tabIds: [tab.id]});
      return;
    }
    if (groups.get(k) === known) groups.delete(k);
  }
  const making = chrome.tabs.group({tabIds: [tab.id], createProperties: {windowId: tab.windowId}}).then(async groupId => {
    if (title) await chrome.tabGroups.update(groupId, {title}).catch(() => {});
    return groupId;
  });
  groups.set(k, making);
  await making.catch(error => {
    if (groups.get(k) === making) groups.delete(k);
    throw error;
  });
}

const primitives = {
  'tabs.query': async () => (await chrome.tabs.query({})).map(({id, windowId, url, title, active, groupId}) => ({id, windowId, url, title, active, groupId})),

  'tabs.get': async ({tabId}) => {
    const {id, windowId, url, title, status} = await chrome.tabs.get(tabId);
    return {id, windowId, url, title, status};
  },

  // Agent tabs never take the user's focus, and sit in their session's group so the user sees which not to touch.
  // Grouping is cosmetic: a tab Chrome would not group is still the host's. A tab opened for a page (openerTabId) opens
  // in its opener's window; `guard` guards it from its first document on.
  'tabs.create': async ({url, windowId, group, openerTabId, guard}) => {
    const w = windowId ?? (openerTabId != null ? (await chrome.tabs.get(openerTabId)).windowId : undefined);
    const tab = await chrome.tabs.create({...(url != null ? {url} : {}), ...(w != null ? {windowId: w} : {}),
      ...(openerTabId != null ? {openerTabId} : {}), active: false});
    if (guard === true) guarded.add(tab.id);
    if (group) await groupTab(tab, group).catch(error => console.warn(`cua: cannot group tab ${tab.id}: ${error?.message ?? error}`));
    return {id: tab.id, windowId: tab.windowId};
  },

  // Guards the tab and sweeps its frames now: the host asks before every attach.
  'tabs.guard': async ({tabId}) => {
    guarded.add(tabId);
    return await guardFrames(tabId);
  },

  'tabs.unguard': async ({tabId}) => {
    if (!guarded.delete(tabId)) return {};
    await unguardFrames(tabId);
    return {};
  },

  'tabs.remove': async ({tabId}) => { await chrome.tabs.remove(tabId); return {}; },

  'tabs.ungroup': async ({tabId}) => { await chrome.tabs.ungroup(tabId); return {}; },

  // A group the user closed has nothing left to rename.
  'group.title': async ({windowId, key, title}) => {
    const k = groupKey(windowId, key);
    const known = groups.get(k);
    const groupId = await known?.catch(() => undefined);
    if (groupId !== undefined) await chrome.tabGroups.update(groupId, {title}).catch(() => { if (groups.get(k) === known) groups.delete(k); });
    return {};
  },

  'windows.query': async () => (await chrome.windows.getAll({})).map(({id, focused, type}) => ({id, focused, type})),

  'windows.create': async ({focused = false}) => ({id: (await chrome.windows.create({focused, type: 'normal'})).id}),

  // Chromium answers "Another debugger is already attached" only to the extension that already holds the debuggee
  // (DevTools and other extensions attach alongside): an attachment Chrome kept while this worker forgot it, e.g. after a
  // worker restart. It is adopted, as the vendor extension does, and is success for the host.
  'debugger.attach': async debuggee => {
    const d = debuggeeOf(debuggee);
    let alreadyHeld = false;
    try {
      await chrome.debugger.attach(d, DEBUGGER_VERSION);
    } catch (error) {
      if (!/Another debugger is already attached/.test(error?.message ?? '')) throw error;
      alreadyHeld = true;
    }
    held.set(keyOf(d), d);
    changed();
    return {alreadyHeld};
  },

  'debugger.detach': async debuggee => {
    const d = debuggeeOf(debuggee);
    try { await chrome.debugger.detach(d); } finally { held.delete(keyOf(d)); changed(); }
    return {};
  },

  // A child session (Target.attachedToTarget, flatten) is addressed by its sessionId within the debuggee.
  'debugger.sendCommand': async ({debuggee, sessionId, method, params}) => {
    const d = debuggeeOf(debuggee);
    try {
      return await chrome.debugger.sendCommand(sessionId != null ? {...d, sessionId} : d, method, params);
    } catch (error) {
      if (notAttached(error) && held.delete(keyOf(d))) changed();
      throw error;
    }
  },

  'debugger.getTargets': () => chrome.debugger.getTargets(),

  held: () => [...held.values()],
};

// --- the native port ------------------------------------------------------------------------------------------------

function createPeer(p) {
  const send = message => { try { p.postMessage(message); } catch {} };   // the port closed meanwhile
  const notifications = {
    hostRefused: ({code, message}) => { refusal = {code: String(code), message: String(message ?? '')}; changed(); },
  };
  async function answer({id, method, params}) {
    const primitive = Object.hasOwn(primitives, method) ? primitives[method] : null;
    if (!primitive) return send({jsonrpc: '2.0', id, error: {code: -1, message: `No handler registered for method: ${method}`}});
    try {
      send({jsonrpc: '2.0', id, result: (await primitive(params ?? {})) ?? null});
    } catch (error) {
      send({jsonrpc: '2.0', id, error: {code: typeof error?.code === 'number' ? error.code : 1, message: String(error?.message ?? error)}});
    }
  }
  return {
    receive(message) {
      if (!message || typeof message !== 'object' || typeof message.method !== 'string') return;   // no requests sent, so no replies
      if (message.id !== undefined && message.id !== null) return answer(message);
      if (Object.hasOwn(notifications, message.method)) notifications[message.method](message.params ?? {});
    },
    notify: (method, params) => send({jsonrpc: '2.0', method, params}),
  };
}

function tell(method, params) {
  peer?.notify(method, params);
}

// Tells an open popup to re-read the status; with no popup open nobody answers, which is fine.
function changed() {
  chrome.runtime.sendMessage({type: 'cua.changed'}).catch(() => {});
}

function clearRetry() {
  if (retryTimer !== null) clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleRetry() {
  clearRetry();
  retryTimer = setTimeout(() => { retryTimer = null; connect(); }, RETRY_MS);
}

// The backoff after a lasting refusal: whether an alarm (or a worker's load) may try now. It also restores the refusal
// for the popup in a worker started since.
async function backedOff() {
  const backoff = (await chrome.storage.session.get(BACKOFF_KEY))[BACKOFF_KEY];
  if (!backoff) return false;
  if (!port) refusal ??= backoff.refusal;
  return Date.now() < backoff.notBefore;
}

async function recordRefusal(lasting) {
  if (!lasting) return chrome.storage.session.remove(BACKOFF_KEY);
  const streak = ((await chrome.storage.session.get(BACKOFF_KEY))[BACKOFF_KEY]?.streak ?? 0) + 1;
  const minutes = Math.min(2 ** (streak - 1), MAX_BACKOFF_MINUTES);
  await chrome.storage.session.set({[BACKOFF_KEY]: {refusal: lasting, streak, notBefore: Date.now() + minutes * MINUTE_MS}});
}

async function open({gated}) {
  const extensionInstanceId = await loadInstanceId();
  if (port || (gated && await backedOff())) return;
  const p = chrome.runtime.connectNative(HOST_NAME);
  port = p;
  peer = createPeer(p);
  refusal = null;
  lastError = null;
  const portPeer = peer;
  p.onMessage.addListener(message => { if (port === p) portPeer.receive(message); });
  p.onDisconnect.addListener(() => closed(p));
  portPeer.notify('hello', {extensionId: chrome.runtime.id, extensionInstanceId, version: chrome.runtime.getManifest().version, protocolVersion: PROTOCOL_VERSION});
  changed();
}

// `gated`: an alarm or a worker's load, which honour the backoff after a lasting refusal; the 5 s retry never runs
// after one, and onStartup/onInstalled clear it first.
function connect({gated = false} = {}) {
  if (port) return Promise.resolve();
  if (connecting) return connecting;
  clearRetry();
  connecting = open({gated})
    .catch(error => { lastError = String(error?.message ?? error); scheduleRetry(); })
    .finally(() => { connecting = null; });
  return connecting;
}

function closed(p) {
  if (port !== p) return;
  port = null;
  peer = null;
  lastError = chrome.runtime.lastError?.message ?? 'disconnected';
  const debuggees = [...held.values()];
  held.clear();
  for (const d of debuggees) chrome.debugger.detach(d).catch(() => {});
  const tabs = [...guarded];
  guarded.clear();
  for (const tabId of tabs) unguardFrames(tabId).catch(() => {});
  const lasting = refusal && LASTING_REFUSALS.has(refusal.code) ? refusal : null;
  if (!lasting) scheduleRetry();
  recordRefusal(lasting).catch(() => {});
  changed();
}

// --- what Chrome tells the extension --------------------------------------------------------------------------------

// Chrome names the debuggee an event comes from as it was attached ({tabId} or {targetId}), plus a child sessionId.
function sourceDebuggee(source) {
  if (source.targetId != null && (held.has(`target:${source.targetId}`) || source.tabId == null)) return {targetId: source.targetId};
  return {tabId: source.tabId};
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  tell('debugger.event', {debuggee: sourceDebuggee(source), ...(source.sessionId != null ? {sessionId: source.sessionId} : {}), method, params});
});

chrome.debugger.onDetach.addListener((source, reason) => {
  const debuggee = sourceDebuggee(source);
  if (!held.delete(keyOf(debuggee))) return;
  tell('debugger.detached', {debuggee, reason});
  changed();
});

chrome.tabs.onRemoved.addListener(tabId => {
  guarded.delete(tabId);
  tell('tabs.removed', {tabId});
});

// A guarded tab's new document is guarded as its URL commits, and every frame again when it has loaded (frames that
// arrived since); both are no-ops in a document already guarded.
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (guarded.has(tabId) && (change.url !== undefined || change.status === 'complete')) guardFrames(tabId).catch(() => {});
  const fields = Object.fromEntries(['url', 'title', 'status'].filter(k => change[k] !== undefined).map(k => [k, change[k]]));
  if (Object.keys(fields).length) tell('tabs.updated', {tabId, ...fields});
});

// The popup's question: is the host connected, and if not, why. A popup that just opened (`retry`) while a lasting
// refusal backs off also clears the backoff and tries once now: the user who updated cua should not wait out an hour.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // A guarded page's popup, from this extension's own page guard: the host decides whether the session takes it.
  if (message?.type === 'cua.popup') {
    const tabId = sender?.tab?.id;
    if (sender?.id === chrome.runtime.id && guarded.has(tabId) && typeof message.url === 'string' && /^https?:\/\//i.test(message.url))
      tell('tabs.popup', {openerTabId: tabId, url: message.url});
    return false;
  }
  if (message?.type !== 'cua.status' || sender?.id !== chrome.runtime.id) return false;
  Promise.all([loadInstanceId().catch(() => null), backedOff().catch(() => false)]).then(([instanceId]) => {
    sendResponse({hostName: HOST_NAME, connected: port !== null && refusal === null, refusal, error: port ? null : lastError, instanceId, debuggees: held.size});
    if (message.retry === true && !port && !connecting && LASTING_REFUSALS.has(refusal?.code)) fresh();
  });
  return true;
});

// Chrome starting and the extension installing or updating try at once and start any backoff over.
const fresh = () => {
  chrome.storage.session.remove(BACKOFF_KEY).catch(() => {}).then(() => connecting).then(() => connect());
};
chrome.runtime.onStartup.addListener(fresh);
chrome.runtime.onInstalled.addListener(fresh);
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) connect({gated: true}); });
chrome.alarms.get(ALARM).then(alarm => alarm ?? chrome.alarms.create(ALARM, {periodInMinutes: 1})).catch(() => {});
connect({gated: true});
