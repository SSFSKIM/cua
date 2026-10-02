// A fake Playwright Extension peer for the M7 contract spike. It is NOT the installed extension and never touches
// Chrome: tabs, debugger sessions and CDP answers are synthetic. It reproduces the extension side of the relay wire,
// protocol v2, from the installed extension's code (mmlmfjhmonkocbjadbfplnigmagldckm 0.4.0, lib/background.mjs):
//
//   20-26    only chrome.debugger.attach/detach/sendCommand and chrome.tabs.create/remove are callable
//   27-32    forwarded events: chrome.debugger.onEvent/onDetach, chrome.tabs.onCreated/onRemoved
//   56-61    {method:"extension.initialized", params:[]}
//   66-72    an offer is {method:"chrome.tabs.onCreated", params:[tab]}, skipped for tabs it already counts attached
//   73-84    a user release (tab dragged out of the group) detaches and sends onDetach [{tabId}, "target_closed"]
//   103-118  on close every attached tab is detached; the last detached tab closes the connection
//   119-177  events are forwarded only for tabs in its attached set (onCreated by openerTabId); target_closed
//            schedules one re-offer after 150 ms, verified after 2500 ms, with a 3000 ms cooldown
//   178-217  replies are {id, result} (result ?? {}) or {id, error: <string>}; unparseable input gets
//            {error:{code:-32700, message}} with no id; only chrome.debugger.attach updates its attached set
//   373-374  a connection starts with the selected tab's offer, THEN extension.initialized
//
// Messages are JSON text exactly as the extension would put in WebSocket text frames; the transport here is an
// in-process callback, because WebSocket framing, Origin and the connect handshake are live gates, not M7 facts.
// Synthetic Chrome error strings follow chrome.debugger's documented wording and are marked as synthetic in reports.
const ALLOWED = new Set(['chrome.debugger.attach', 'chrome.debugger.detach', 'chrome.debugger.sendCommand', 'chrome.tabs.create', 'chrome.tabs.remove']);
// CDP methods this fixture answers without inventing page state; everything else is refused.
const NEUTRAL_CDP = new Set(['Page.enable', 'Runtime.runIfWaitingForDebugger', 'Emulation.setFocusEmulationEnabled', 'Target.setAutoAttach']);
export const SOURCE_TIMING = {reattachDelayMs: 150, reattachVerifyMs: 2500, reattachCooldownMs: 3000};

export function createFakeExtension({send, timing = SOURCE_TIMING, firstTabId = 1001} = {}) {
  let nextTabId = firstTabId;
  let nextChild = 1;
  const tabs = new Map();               // the synthetic browser's tabs
  const debuggerAttached = new Set();   // chrome.debugger state: tabs this extension's debugger is attached to
  const attachedTabs = new Set();       // the extension's own bookkeeping (RelayConnection._attachedTabs)
  const pendingReattach = new Set();
  const recentReattach = new Set();
  const children = new Map();           // child sessionId -> {tabId, targetId}
  const childFrames = new Map();        // tabId -> number of synthetic out-of-process iframes to announce
  const commands = [];                  // every command received, as {method, target} metadata
  const timers = new Set();
  let hasEverAttached = false;
  let closed = false;
  let holdReplies = false;                // scenario switch: record commands but never answer (an unresponsive peer)
  const holdMethods = new Set();          // scenario switch: perform these commands but withhold their replies
  const held = [];
  let onclose = () => {};

  const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
  const out = message => { if (!closed) send(JSON.stringify(message)); };

  function addTab(props = {}) {
    const id = nextTabId++;
    const tab = {id, index: tabs.size, windowId: 1, active: false, url: props.url ?? 'about:blank', title: props.title ?? '', ...(props.openerTabId ? {openerTabId: props.openerTabId} : {})};
    tabs.set(id, tab);
    if (props.childFrames) childFrames.set(id, props.childFrames);
    return tab;
  }

  function offer(tabId) {                       // RelayConnection.attachTab
    if (closed || attachedTabs.has(tabId)) return;
    out({method: 'chrome.tabs.onCreated', params: [tabs.get(tabId)]});
  }

  function notifyAttached(tabId) { attachedTabs.add(tabId); hasEverAttached = true; pendingReattach.delete(tabId); }

  function checkLast() {
    if (hasEverAttached && attachedTabs.size === 0 && pendingReattach.size === 0) close('All controlled tabs detached');
  }

  function chromeEvent(method, args) {          // RelayConnection._onChromeEvent
    const tabId = method === 'chrome.tabs.onCreated' ? args[0].openerTabId : method === 'chrome.tabs.onRemoved' ? args[0] : args[0]?.tabId;
    if (tabId === undefined || !attachedTabs.has(tabId)) return;
    out({method, params: args});
    if (method === 'chrome.debugger.onDetach') {
      attachedTabs.delete(tabId);
      if (args[1] === 'target_closed' && scheduleReattach(tabId)) return;
      checkLast();
    }
  }

  function scheduleReattach(tabId) {
    if (closed || recentReattach.has(tabId)) return false;
    recentReattach.add(tabId);
    later(timing.reattachCooldownMs, () => recentReattach.delete(tabId));
    pendingReattach.add(tabId);
    later(timing.reattachDelayMs, () => {
      if (closed || !pendingReattach.has(tabId)) return;
      if (!tabs.has(tabId)) { pendingReattach.delete(tabId); checkLast(); return; }
      if (attachedTabs.has(tabId)) { pendingReattach.delete(tabId); return; }
      offer(tabId);
      later(timing.reattachVerifyMs, () => {
        if (closed || !pendingReattach.has(tabId)) return;
        pendingReattach.delete(tabId);
        if (!attachedTabs.has(tabId)) checkLast();
      });
    });
    return true;
  }

  function close(reason) {
    if (closed) return;
    for (const tabId of [...attachedTabs]) { debuggerAttached.delete(tabId); attachedTabs.delete(tabId); }
    pendingReattach.clear();
    closed = true;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    onclose(reason);
  }

  // Synthetic chrome.* behaviour. Errors are thrown as Error so the reply carries error.message, as in the extension.
  function invoke(method, args) {
    if (method === 'chrome.tabs.create') return addTab({url: args[0]?.url});
    if (method === 'chrome.tabs.remove') {
      const tabId = args[0];
      if (!tabs.has(tabId)) throw new Error(`No tab with id: ${tabId}.`);
      if (debuggerAttached.delete(tabId)) chromeEvent('chrome.debugger.onDetach', [{tabId}, 'target_closed']);
      tabs.delete(tabId);
      chromeEvent('chrome.tabs.onRemoved', [tabId, {windowId: 1, isWindowClosing: false}]);
      return undefined;
    }
    const target = args[0] ?? {};
    const tabId = target.tabId;
    if (!tabs.has(tabId)) throw new Error(`No tab with given id ${tabId}.`);
    if (method === 'chrome.debugger.attach') {
      if (debuggerAttached.has(tabId)) throw new Error(`Another debugger is already attached to the tab with id: ${tabId}.`);
      debuggerAttached.add(tabId);
      return undefined;
    }
    if (!debuggerAttached.has(tabId)) throw new Error(`Debugger is not attached to the tab with id: ${tabId}.`);
    if (method === 'chrome.debugger.detach') { debuggerAttached.delete(tabId); return undefined; }
    // chrome.debugger.sendCommand(target, method, params)
    const [, cdpMethod, cdpParams] = args;
    if (target.sessionId !== undefined) {
      const child = children.get(target.sessionId);
      if (!child || child.tabId !== tabId) throw new Error(`{"code":-32001,"message":"Session with given id not found."}`);
    }
    if (!NEUTRAL_CDP.has(cdpMethod)) throw new Error(`fixture refuses CDP ${cdpMethod}: synthetic peer, no real browser`);
    if (cdpMethod === 'Target.setAutoAttach' && cdpParams?.flatten && target.sessionId === undefined) {
      const count = childFrames.get(tabId) ?? 0;
      childFrames.delete(tabId);
      for (let i = 0; i < count; i++) {
        const sessionId = `FIXTURE-SESSION-${nextChild}`;
        const targetId = `FIXTURE-TARGET-${nextChild++}`;
        children.set(sessionId, {tabId, targetId});
        later(0, () => chromeEvent('chrome.debugger.onEvent', [{tabId}, 'Target.attachedToTarget',
          {sessionId, targetInfo: {targetId, type: 'iframe', title: '', url: 'https://child.fixture.invalid/', attached: true, canAccessOpener: false}, waitingForDebugger: false}]));
      }
    }
    return undefined;
  }

  return {
    tabs, debuggerAttached, attachedTabs, children, commands,
    set onclose(fn) { onclose = fn; },
    get closed() { return closed; },
    set holdReplies(value) { holdReplies = value; },
    addTab,
    // The connect sequence (ConnectedTabGroup constructor): offer the selected tab, then announce initialization.
    connect(selectedTabId) { offer(selectedTabId); out({method: 'extension.initialized', params: []}); },
    offer,
    async receive(text) {
      if (closed) return;                       // a closed WebSocket delivers nothing
      let message;
      try { message = JSON.parse(text); } catch (error) { out({error: {code: -32700, message: `Error parsing message: ${error.message}`}}); return; }
      commands.push({method: message.method, ...(String(message.method).startsWith('chrome.debugger.') ? {debuggee: message.params?.[0]} : {}), ...(message.method === 'chrome.debugger.sendCommand' ? {cdp: message.params?.[1]} : {})});
      if (holdReplies) return;
      const response = {id: message.id};
      try {
        if (!ALLOWED.has(message.method)) throw new Error(`Unknown method: ${message.method}`);
        const args = message.params ?? [];
        const result = invoke(message.method, args);
        if (message.method === 'chrome.debugger.attach' && args[0]?.tabId !== undefined) notifyAttached(args[0].tabId);
        response.result = result ?? {};
      } catch (error) {
        response.error = error.message;
      }
      if (holdMethods.has(message.method)) held.push(response); else out(response);
    },
    holdRepliesFor(method) { holdMethods.add(method); },
    releaseHeld() { holdMethods.clear(); for (const response of held.splice(0)) out(response); },
    get heldCount() { return held.length; },
    // Browser-side events the scenarios drive. Each mirrors what Chrome or the user would cause.
    cdpEvent(source, method, params) { if (debuggerAttached.has(source.tabId)) chromeEvent('chrome.debugger.onEvent', [source, method, params]); },
    userCancel(tabId) { if (debuggerAttached.delete(tabId)) chromeEvent('chrome.debugger.onDetach', [{tabId}, 'canceled_by_user']); },
    transientTargetClose(tabId) { if (debuggerAttached.delete(tabId)) chromeEvent('chrome.debugger.onDetach', [{tabId}, 'target_closed']); },
    userReleaseFromGroup(tabId) {                // RelayConnection.detachTab
      if (closed || !attachedTabs.has(tabId)) return;
      debuggerAttached.delete(tabId);
      attachedTabs.delete(tabId);
      out({method: 'chrome.debugger.onDetach', params: [{tabId}, 'target_closed']});
      checkLast();
    },
    openPopup(openerTabId) { const tab = addTab({url: 'https://popup.fixture.invalid/', openerTabId}); chromeEvent('chrome.tabs.onCreated', [tab]); return tab; },
    userDisconnect() { close('User disconnected'); },
    sendRaw(text) { if (!closed) send(text); },
    dispose() { close('fixture disposed'); },
  };
}
