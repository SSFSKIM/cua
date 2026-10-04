// M7 prototype bridge: the CUA browser-backend JSON-RPC surface on one side, the Playwright Extension relay wire
// (protocol v2) on the other. A knowledge spike, not production code: it exists to show which backend methods can be
// represented over the extension's five commands, with ownership enforced HERE (the extension itself will attach to
// any tab id it is given; see fake-extension.mjs and background.mjs:199-208).
//
// Vendor-side citations (@oai/browser-desktop 0.1.1, ChatGPT 26.928.40906, scripts/browser-service.mjs):
//   10352-10485  JSON-RPC peer: an error reply rejects with the bare string error.message; an unknown method is
//                answered {code:-1, message:"No handler registered for method: <m>"}; a handler throw is code 1
//   67810-67890  optional executeCdpWithCachedExpression: falls back only on that exact string
//   67942-67955  optional getCommittedTabUrl: falls back only on that exact string (extension -> getTabs().url)
//   68061-68110  every session request (all but turnEnded/ping) carries session_id, turn_id, session_context
//   47189-47215  onCDPDetach params carry tabId; onCDPEvent params are {source:{tabId,sessionId?}, method, params}
//   47585-47595  "Debugger unattached" / "...Debugger is not attached..." from executeCdp triggers one re-attach
//   48392-48410  a target names at most one of sessionId/targetId
//   48485-48517  child sessions come from Target.attachedToTarget (flatten) and keep {tabId, sessionId}
export const NO_HANDLER = method => `No handler registered for method: ${method}`;
const SESSION_EXEMPT = new Set(['getInfo', 'turnEnded', 'ping']);

export class BackendError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// Truthful raw getInfo for each candidate kind. No metadata.extensionInstanceId/extensionId: the extension offers no
// authenticated profile id, and the vendor would otherwise read Chrome's Local State and copy the extension's
// LevelDB settings to resolve one (browser-service.mjs:67352-67470). No agentRequestHeaderEnabled unless a scenario
// states it, and never true: the adapter cannot add agent request headers.
export function backendInfo(kind, {agentRequestHeaderEnabled} = {}) {
  const base = {type: kind, name: 'Chrome (M7 fixture)', capabilities: {browser: [], tab: []}};
  if (kind === 'extension') Object.assign(base, {family: 'chrome'});
  if (agentRequestHeaderEnabled !== undefined) base.agentRequestHeaderEnabled = agentRequestHeaderEnabled;
  return base;
}

// The connect page's URL carries the relay endpoint and the token; never expose a chrome-extension:// query or hash.
function exposedTab(tab) {
  let url = tab.url;
  if (typeof url === 'string' && url.startsWith('chrome-extension://')) { const u = new URL(url); url = `${u.protocol}//${u.host}${u.pathname}`; }
  return {id: tab.id, ...(tab.title ? {title: tab.title} : {}), ...(url ? {url} : {})};
}

export function createAdapter({kind, info = backendInfo(kind), sendToExtension, notify, renewalWindowMs = 2500, releaseWaitMs = 1000}) {
  let nextId = 1;
  let initialized = false;
  let connected = true;
  const pending = new Map();
  const offered = new Map();      // tabId -> tab: explicit offers (ownership grants) not since released
  const created = new Map();      // tabId -> tab: tabs this adapter created through chrome.tabs.create
  const attached = new Set();     // tabs whose debugger this adapter holds
  // target_closed on a tab we held suspends ownership; only the extension's renewed offer inside the window restores
  // it (and re-attaches, as the extension's own re-offer protocol expects). tabId -> {timer, waiters}
  const renewable = new Map();
  const children = new Map();     // sessionId -> {tabId, targetId}
  const sessions = new Set();
  // Task ownership epoch: turnEnded advances it. An attach started in an older epoch that succeeds late is undone (the
  // debugger really was attached, so it is detached again), never recorded as held.
  let epoch = 0;
  const attaching = new Set();    // settled-promises of attaches in flight
  const releaseFailures = [];     // undo detaches that failed, reported by the next turnEnded
  const events = [];              // metadata log of extension->adapter traffic, for the report

  const owned = tabId => offered.has(tabId) || created.has(tabId);

  function call(method, params) {
    if (!connected) return Promise.reject(new BackendError(1, 'extension disconnected'));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, {resolve, reject});
      sendToExtension(JSON.stringify({id, method, params}));
    });
  }

  function onExtensionMessage(text) {
    let message;
    try { message = JSON.parse(text); } catch { events.push({kind: 'protocol-error', code: 'unparseable'}); return; }
    if (message.id !== undefined && !('method' in message)) {
      const p = pending.get(message.id);
      events.push({kind: 'reply', ok: !('error' in message), errorType: 'error' in message ? typeof message.error : null});
      if (!p) return;
      pending.delete(message.id);
      if ('error' in message) p.reject(new BackendError(1, typeof message.error === 'string' ? message.error : JSON.stringify(message.error)));
      else p.resolve(message.result);
      return;
    }
    if (message.method === undefined) { events.push({kind: 'protocol-error', code: message.error?.code ?? null}); return; }
    events.push({kind: 'event', method: message.method});
    const args = message.params ?? [];
    switch (message.method) {
      case 'extension.initialized': initialized = true; return;
      case 'chrome.tabs.onCreated': return onOffer(args[0]);
      case 'chrome.debugger.onEvent': return onCdpEvent(args[0], args[1], args[2]);
      case 'chrome.debugger.onDetach': return onDetach(args[0]?.tabId, args[1]);
      case 'chrome.tabs.onRemoved': offered.delete(args[0]); created.delete(args[0]); return;
    }
  }

  function onOffer(tab) {
    if (!Number.isInteger(tab?.id)) return;
    offered.set(tab.id, tab);
    const renewal = renewable.get(tab.id);
    if (!renewal) return;
    // A renewed offer for a tab whose debugger dropped with target_closed while we held it. A user cancellation or a
    // released connection never reaches `renewable`, so this is never a forced re-attachment.
    endRenewal(tab.id, renewal, attached.has(tab.id) ? Promise.resolve(true) : attachDebugger(tab.id).then(() => true, () => false));
  }

  // The one path that takes debugger control. Its side effect is real even when the reply arrives after the task
  // ended, so a stale success detaches before rejecting; a failed undo is kept for turnEnded to report.
  function attachDebugger(tabId) {
    const started = epoch;
    const attempt = call('chrome.debugger.attach', [{tabId}, '1.3']).then(async () => {
      if (started === epoch && connected) { attached.add(tabId); return; }
      await call('chrome.debugger.detach', [{tabId}]).catch(error => { releaseFailures.push({tabId, error: error.message}); });
      throw new BackendError(1, `Tab ${tabId}: the task ended while attaching; control was released`);
    });
    const tracked = attempt.catch(() => {}).finally(() => attaching.delete(tracked));
    attaching.add(tracked);
    return attempt;
  }

  function endRenewal(tabId, renewal, outcome) {
    clearTimeout(renewal.timer);
    renewable.delete(tabId);
    outcome.then(ok => { for (const resolve of renewal.waiters) resolve(ok); });
  }

  function suspend(tabId) {
    const renewal = {waiters: [], timer: setTimeout(() => endRenewal(tabId, renewal, Promise.resolve(false)), renewalWindowMs)};
    renewable.set(tabId, renewal);
  }

  function onCdpEvent(source, method, params) {
    if (!attached.has(source?.tabId)) return;
    if (method === 'Target.attachedToTarget' && params?.sessionId) children.set(params.sessionId, {tabId: source.tabId, targetId: params.targetInfo?.targetId});
    if (method === 'Target.detachedFromTarget' && params?.sessionId) children.delete(params.sessionId);
    notify('onCDPEvent', {source: {tabId: source.tabId, ...(source.sessionId ? {sessionId: source.sessionId} : {})}, method, params});
  }

  function onDetach(tabId, reason) {
    if (!Number.isInteger(tabId)) return;
    const held = attached.delete(tabId);
    for (const [sessionId, child] of children) if (child.tabId === tabId) children.delete(sessionId);
    // Any debugger loss releases ownership, of offered and created tabs alike. A user cancellation (canceled_by_user)
    // or group release (also sent as target_closed, background.mjs:73-84) is final; only target_closed on a held tab
    // may be renewed by the extension's re-offer.
    offered.delete(tabId);
    created.delete(tabId);
    if (held && reason === 'target_closed') suspend(tabId);
    if (held) notify('onCDPDetach', {tabId, reason});
  }

  function onExtensionClose() {
    if (!connected) return;
    connected = false;
    for (const p of pending.values()) p.reject(new BackendError(1, 'extension disconnected'));
    pending.clear();
    for (const tabId of [...attached]) { attached.delete(tabId); notify('onCDPDetach', {tabId, reason: 'extension_disconnected'}); }
    for (const [tabId, renewal] of renewable) endRenewal(tabId, renewal, Promise.resolve(false));
    offered.clear(); created.clear(); children.clear();
  }

  function requireTab(tabId) {
    if (!Number.isInteger(tabId) || tabId <= 0) throw new BackendError(1, 'tabId must be a positive integer');
    if (!owned(tabId)) throw new BackendError(1, `Tab ${tabId} is not offered to this connection`);
  }

  function resolveTarget(target) {
    const {tabId, sessionId, targetId} = target ?? {};
    if (sessionId !== undefined && targetId !== undefined) throw new BackendError(1, 'CDP target must provide either sessionId or targetId, not both.');
    requireTab(tabId);
    if (!attached.has(tabId)) throw new BackendError(1, `Debugger is not attached to the tab with id: ${tabId}.`);
    if (sessionId !== undefined) {
      if (children.get(sessionId)?.tabId !== tabId) throw new BackendError(1, `CDP session ${sessionId} is not attached to tab ${tabId}.`);
      return {tabId, sessionId};
    }
    if (targetId !== undefined) {
      // chrome.debugger events for a targetId debuggee carry no tabId and the extension drops them
      // (background.mjs:170-176), so a targetId is only usable as an alias of a known flattened child session.
      const match = [...children].find(([, child]) => child.tabId === tabId && child.targetId === targetId);
      if (!match) throw new BackendError(1, `CDP target ${targetId} is not attached to tab ${tabId}.`);
      return {tabId, sessionId: match[0]};
    }
    return {tabId};
  }

  const handlers = {
    async getInfo() { return info; },
    async getTabs() { return [...new Map([...offered, ...created]).values()].map(exposedTab); },
    async createTab() {
      const tab = await call('chrome.tabs.create', [{url: 'about:blank', active: false}]);
      created.set(tab.id, tab);
      return exposedTab(tab);
    },
    async attach({tabId}) {
      const renewal = Number.isInteger(tabId) ? renewable.get(tabId) : undefined;
      if (renewal && !(await new Promise(resolve => renewal.waiters.push(resolve))))
        throw new BackendError(1, `Tab ${tabId} was released and not offered again`);
      requireTab(tabId);
      if (attached.has(tabId)) return {};
      await attachDebugger(tabId);
      return {};
    },
    async detach({tabId}) {
      requireTab(tabId);
      if (!attached.has(tabId)) return {};
      attached.delete(tabId);
      await call('chrome.debugger.detach', [{tabId}]);
      return {};
    },
    async executeCdp({target, method, commandParams}) {
      if (typeof method !== 'string') throw new BackendError(1, 'executeCdp requires a method');
      return await call('chrome.debugger.sendCommand', [resolveTarget(target), method, commandParams ?? {}]);
    },
    async closeTab({tabId}) {         // not a vendor method; the probe uses it to show user tabs are never closed
      if (!created.has(tabId)) throw new BackendError(1, `Tab ${tabId} was not created by this connection; refusing to close it`);
      await call('chrome.tabs.remove', [tabId]);
      created.delete(tabId);
      return {};
    },
    async turnEnded() {
      // Release debugger control at task end; keep every tab open (user tabs and deliverables alike). Advancing the
      // epoch first means a pending renewal can no longer re-attach and an in-flight attach undoes itself on success.
      epoch++;
      for (const [tabId, renewal] of renewable) endRenewal(tabId, renewal, Promise.resolve(false));
      const failures = releaseFailures.splice(0);
      for (const tabId of [...attached]) {
        attached.delete(tabId);
        await call('chrome.debugger.detach', [{tabId}]).catch(error => failures.push({tabId, error: error.message}));
      }
      // Acknowledge only once in-flight attaches have settled (each stale success has been detached), within a bound.
      const inflight = [...attaching];
      let timer;
      const settled = await Promise.race([Promise.all(inflight).then(() => true), new Promise(r => { timer = setTimeout(() => r(false), releaseWaitMs); })]);
      clearTimeout(timer);
      failures.push(...releaseFailures.splice(0));
      if (!settled || failures.length)
        throw new BackendError(1, `turnEnded: debugger release unconfirmed (${!settled ? `${attaching.size} attach still in flight` : ''}${!settled && failures.length ? '; ' : ''}${failures.map(f => `tab ${f.tabId}: ${f.error}`).join('; ')})`);
      return {};
    },
  };

  async function handleRequest(method, params = {}) {
    const handler = Object.hasOwn(handlers, method) ? handlers[method] : null;
    if (!handler) throw new BackendError(-1, NO_HANDLER(method));
    if (!SESSION_EXEMPT.has(method)) {
      if (typeof params.session_id !== 'string' || typeof params.turn_id !== 'string') throw new BackendError(1, `${method} requires session_id and turn_id`);
      sessions.add(params.session_id);
    }
    if (method !== 'getInfo' && !connected) throw new BackendError(1, 'extension disconnected');
    if (method !== 'getInfo' && method !== 'turnEnded' && !initialized) throw new BackendError(1, 'extension has not initialized');
    return await handler(params);
  }

  return {
    handleRequest, onExtensionMessage, onExtensionClose,
    dispose() { for (const [tabId, renewal] of renewable) endRenewal(tabId, renewal, Promise.resolve(false)); },
    state: () => ({epoch, attaching: attaching.size, initialized, connected, offered: [...offered.keys()], created: [...created.keys()], attached: [...attached], renewable: [...renewable.keys()], children: [...children.keys()], sessions: sessions.size, pending: pending.size}),
    events,
  };
}
