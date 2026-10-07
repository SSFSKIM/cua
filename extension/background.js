// cua's Chrome extension: the service worker. It exposes Chrome's primitives (tabs, windows, tab groups,
// chrome.debugger) to cua's native host (io.github.ssfskim.cua, src/chrome/host.mjs in the cua checkout) over native
// messaging, and keeps no state beyond the debuggees it attached and which tab group serves which (window, session).
// Every session, turn and ownership rule lives in the host. Spec (in the cua repository):
// docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md, "The extension" and "The extension protocol".
//
// The wire is JSON-RPC 2.0 with the host's peer conventions (src/chrome/protocol.mjs; an extension cannot import from
// the checkout, so this is a copy of the half it needs): an error reply is {code, message} with Chrome's own message
// verbatim, an unknown method answers code -1 "No handler registered for method: <m>", a failing handler code 1. The
// extension sends no requests, only notifications: hello (first), debugger.event, debugger.detached, tabs.removed,
// tabs.updated. Native messaging frames each message; the host refuses to send one over Chrome's 1 MB limit.
//
// Connection: at load and on runtime.onStartup/onInstalled the worker connects and says hello. While disconnected it
// retries every 5 s, and the cua-reconnect alarm retries every minute (it wakes a suspended worker). When the port
// drops, every held debuggee is detached: a host that is gone cannot clean up. A host that refuses this extension
// (hostRefused {code, message}) is shown in the popup; protocol_mismatch and hello_invalid would only repeat, so after
// them only the alarm retries.
'use strict';

const HOST_NAME = 'io.github.ssfskim.cua';
const PROTOCOL_VERSION = 1;
const RETRY_MS = 5000;
const ALARM = 'cua-reconnect';
const INSTANCE_KEY = 'extensionInstanceId';
const DEBUGGER_VERSION = '1.3';
const LASTING_REFUSALS = new Set(['protocol_mismatch', 'hello_invalid']);

let port = null;           // the open native port
let peer = null;           // its JSON-RPC peer
let connecting = null;     // the connect in progress
let retryTimer = null;
let refusal = null;        // the host's hostRefused {code, message} on the latest port
let lastError = null;      // Chrome's reason the latest port closed
let instanceIdLoad = null;
const held = new Map();    // debuggee key -> the debuggee this extension attached
const groups = new Map();  // windowId + session key -> the Chrome tab group cua made for it

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

// --- the primitives the host asks for -------------------------------------------------------------------------------

async function groupTab(tab, {key, title}) {
  const k = groupKey(tab.windowId, key);
  const known = groups.get(k);
  if (known !== undefined) {
    const group = await chrome.tabGroups.get(known).catch(() => null);
    if (group?.windowId === tab.windowId) {
      await chrome.tabs.group({groupId: known, tabIds: [tab.id]});
      return;
    }
    groups.delete(k);           // the user closed it or dragged it to another window
  }
  const groupId = await chrome.tabs.group({tabIds: [tab.id], createProperties: {windowId: tab.windowId}});
  groups.set(k, groupId);
  if (title) await chrome.tabGroups.update(groupId, {title});
}

const primitives = {
  'tabs.query': async () => (await chrome.tabs.query({})).map(({id, windowId, url, title, active, groupId}) => ({id, windowId, url, title, active, groupId})),

  'tabs.get': async ({tabId}) => {
    const {id, windowId, url, title, status} = await chrome.tabs.get(tabId);
    return {id, windowId, url, title, status};
  },

  // Agent tabs never take the user's focus, and sit in their session's group so the user sees which not to touch.
  // Grouping is cosmetic: a tab Chrome would not group is still the host's.
  'tabs.create': async ({url, windowId, group}) => {
    const tab = await chrome.tabs.create({...(url != null ? {url} : {}), ...(windowId != null ? {windowId} : {}), active: false});
    if (group) await groupTab(tab, group).catch(error => console.warn(`cua: cannot group tab ${tab.id}: ${error?.message ?? error}`));
    return {id: tab.id, windowId: tab.windowId};
  },

  'tabs.remove': async ({tabId}) => { await chrome.tabs.remove(tabId); return {}; },

  'tabs.ungroup': async ({tabId}) => { await chrome.tabs.ungroup(tabId); return {}; },

  // A group the user closed has nothing left to rename.
  'group.title': async ({windowId, key, title}) => {
    const k = groupKey(windowId, key);
    const groupId = groups.get(k);
    if (groupId !== undefined) await chrome.tabGroups.update(groupId, {title}).catch(() => groups.delete(k));
    return {};
  },

  'windows.query': async () => (await chrome.windows.getAll({})).map(({id, focused, type}) => ({id, focused, type})),

  'windows.create': async ({focused = false}) => ({id: (await chrome.windows.create({focused, type: 'normal'})).id}),

  // Chrome refuses a second attach by the same extension with "Another debugger is already attached"; when this
  // extension is the holder that is success (alreadyHeld), and the host relies on telling the two apart.
  'debugger.attach': async debuggee => {
    const d = debuggeeOf(debuggee);
    try {
      await chrome.debugger.attach(d, DEBUGGER_VERSION);
    } catch (error) {
      if (held.has(keyOf(d)) && /Another debugger is already attached/.test(error?.message ?? '')) return {alreadyHeld: true};
      throw error;
    }
    held.set(keyOf(d), d);
    return {alreadyHeld: false};
  },

  'debugger.detach': async debuggee => {
    const d = debuggeeOf(debuggee);
    try { await chrome.debugger.detach(d); } finally { held.delete(keyOf(d)); }
    return {};
  },

  // A child session (Target.attachedToTarget, flatten) is addressed by its sessionId within the debuggee.
  'debugger.sendCommand': async ({debuggee, sessionId, method, params}) => {
    const d = debuggeeOf(debuggee);
    try {
      return await chrome.debugger.sendCommand(sessionId != null ? {...d, sessionId} : d, method, params);
    } catch (error) {
      if (notAttached(error)) held.delete(keyOf(d));
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
    hostRefused: ({code, message}) => { refusal = {code: String(code), message: String(message ?? '')}; },
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

function clearRetry() {
  if (retryTimer !== null) clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleRetry() {
  clearRetry();
  retryTimer = setTimeout(() => { retryTimer = null; connect(); }, RETRY_MS);
}

async function open() {
  const extensionInstanceId = await loadInstanceId();
  if (port) return;
  const p = chrome.runtime.connectNative(HOST_NAME);
  port = p;
  peer = createPeer(p);
  refusal = null;
  lastError = null;
  const portPeer = peer;
  p.onMessage.addListener(message => { if (port === p) portPeer.receive(message); });
  p.onDisconnect.addListener(() => closed(p));
  portPeer.notify('hello', {extensionId: chrome.runtime.id, extensionInstanceId, version: chrome.runtime.getManifest().version, protocolVersion: PROTOCOL_VERSION});
}

function connect() {
  if (port) return Promise.resolve();
  if (connecting) return connecting;
  clearRetry();
  connecting = open()
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
  if (!(refusal && LASTING_REFUSALS.has(refusal.code))) scheduleRetry();
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
  if (held.delete(keyOf(debuggee))) tell('debugger.detached', {debuggee, reason});
});

chrome.tabs.onRemoved.addListener(tabId => tell('tabs.removed', {tabId}));

chrome.tabs.onUpdated.addListener((tabId, change) => {
  const fields = Object.fromEntries(['url', 'title', 'status'].filter(k => change[k] !== undefined).map(k => [k, change[k]]));
  if (Object.keys(fields).length) tell('tabs.updated', {tabId, ...fields});
});

// The popup's question: is the host connected, and if not, why.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'cua.status' || sender?.id !== chrome.runtime.id) return false;
  loadInstanceId().catch(() => null).then(instanceId => sendResponse({
    hostName: HOST_NAME, connected: port !== null && refusal === null, refusal, error: port ? null : lastError, instanceId, debuggees: held.size,
  }));
  return true;
});

chrome.runtime.onStartup.addListener(() => { connect(); });
chrome.runtime.onInstalled.addListener(() => { connect(); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) connect(); });
chrome.alarms.get(ALARM).then(alarm => alarm ?? chrome.alarms.create(ALARM, {periodInMinutes: 1})).catch(() => {});
connect();
