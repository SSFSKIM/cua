#!/usr/bin/env node
// cua's native-messaging host: one per Chrome profile, spawned by Chrome through the launcher `cua chrome register`
// writes. It serves the pinned vendor browser service's backend protocol on a Unix socket and drives Chrome through the
// cua extension's primitives over native messaging (stdin/stdout). Spec:
// docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md ("The host").
//
//   vendor browser service ──socket (u32-framed JSON-RPC)──▶ this host ──stdio (native messaging)──▶ cua extension
//
// The extension holds no state beyond the debuggees it attached; every session, turn and ownership rule lives here:
// - getInfo is answered from the host's own state (it never waits on the extension: an unanswered getInfo costs every
//   listBrowsers the vendor's 5 s bound) and has no agentRequestHeaderEnabled, so the service runs no identity check
//   and no Codex login is needed; no metadata.extensionId either (M7's rule).
// - A session is created by the first request carrying its session_id and bound to the socket client that sent it. A
//   tab is owned by at most one session; a request naming another session's tab is refused with
//   "tab owned by another session", one naming a tab no session owns with the vendor's "not part of browser session".
// - A tab belongs to the turn that created, claimed, resumed or last used it. turnEnded acts on that turn's tabs only:
//   unmarked created tabs close; unmarked claimed tabs and deliverables are released open (created ones leave the
//   group; cua never groups a user's tab); handoff tabs stay owned with the debugger detached and resume on the
//   session's next turn (a request carrying a turn_id the session has not seen, or at once when their turnEnded
//   arrives after that turn began). A turn that has ended takes no new tabs; a Chrome-internal tab is never claimed.
//   A client disconnect ends every turn of its sessions and releases their handed-off tabs open.
// - executeCdp passes CDP through unchanged (Target.getTargets is the getTargets primitive, as the vendor extension
//   intercepts it), enforces timeoutMs (default 10 s) and on timeout detaches the tab unless preserveDebuggerOnTimeout,
//   answering the vendor extension's timeout wording; the next command then answers "Debugger unattached", the string
//   the service's single re-attach recovers from (browser-service.mjs 47585-47595).
// - A detach the user caused (canceled_by_user) is forwarded as onCDPDetach and the tab is never attached again.
// - Owned tabs are guarded (extension/background.js, "Page guards"): created tabs from creation, every tab again before
//   each attach (waited for at most GUARD_WAIT_MS), until the turn releases or hands it off (not waited for). An attach Chrome refuses because another extension's frame is
//   in the tab ("Cannot access a chrome-extension:// URL of different extension") is retried once after a sweep. A page's
//   window.open in an owned tab of the session's current turn (tabs.popup) opens as the session's tab, active.
// - Every request the extension refuses is logged with its method, debuggee or tab and Chrome's message (never CDP
//   params, which can carry substituted secrets).
// - The browser `viewport` capability (getInfo) arrives as executeUnhandledCommand browser_viewport_set/_reset. The size
//   is kept on the session's active tab (or, with no tab yet, for the next tab the turn attaches) and applied with
//   Emulation.setDeviceMetricsOverride when set on an attached tab, at every attach of the tab and again on an attach of
//   a tab already attached; reset clears it. Chrome drops the override with the debugger, so a released tab loses it
//   and a handoff tab gets it back when the next turn attaches it (the ChatGPT extension's setViewport, Os/Ps and
//   takeViewportSizeForAttach). Frame targets get none: an out-of-process frame is sized by its parent page.
// - Downloads: the service approves a download itself (Fetch.requestPaused → Fetch.continueResponse through executeCdp)
//   and then waits for the backend's onDownloadChange {id, filename, url, status} notifications: `started` matched by
//   the URL it approved, then `complete` | `failed` | `canceled` by id, the filename of the last one being the path
//   PlaywrightDownload.path() answers (browser-service.mjs 60890-61125). The extension reports Chrome's download
//   items (downloads.created, downloads.changed) while it holds a debuggee; the host maps them to that shape and tells
//   every connected client, without session_id, as the ChatGPT extension does (the service matches by URL and id).
//   allowDownload is never asked of an `extension` backend (BS 61001-61010), so it stays unhandled.
// Vendor references (@oai/browser-desktop 0.1.1 in ChatGPT 26.928.40906): the backend client browser-service.mjs
// 67808-68110; the ChatGPT extension's session model (hehggadaopoacecdllhhajmbjkdcmajg 1.26.901.11451, background.js):
// endTurnUnlocked, resumeHandoffIfPresent, executeCdp/mg (timeout), Os/Zf (attach, "Another debugger" as success).
import {chmodSync, closeSync, existsSync, mkdirSync, openSync, realpathSync, renameSync, rmSync, writeFileSync, writeSync} from 'node:fs';
import {connect, createServer} from 'node:net';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPeer, frameDecoder, NO_HANDLER} from './protocol.mjs';
import {backendDir, logDir, PROTOCOL_VERSION, socketNameFor} from './extension.mjs';

export const DEFAULT_CDP_TIMEOUT_MS = 10_000;
// How long an attach waits for the page guard's sweep before attaching anyway.
export const GUARD_WAIT_MS = 1500;
// Chrome tears the port down on a host->extension message over 1 MB; the extension may send up to 64 MiB.
export const MAX_TO_EXTENSION_BYTES = 1024 * 1024;
export const MAX_FROM_EXTENSION_BYTES = 64 * 1024 * 1024;
const LIVE_PROBE_MS = 500;
const SESSION_EXEMPT = new Set(['getInfo', 'turnEnded', 'ping']);
// The vendor's browser capability, as the ChatGPT extension advertises it (the service validates {id, description}).
export const VIEWPORT_CAPABILITY = {id: 'viewport', description: 'Controls an explicit browser viewport override for responsive or device-size testing. Use it when a task calls for specific dimensions or breakpoint validation; otherwise leave it unset so the browser uses its normal viewport. Reset temporary overrides before finishing unless the user asked to keep them.'};
const MARKS = new Set(['handoff', 'deliverable']);
const OTHER_SESSION = 'tab owned by another session';
const TIMED_OUT = Symbol('timed out');
// Pages chrome.debugger cannot drive and a user tab may not be claimed for (the vendor refuses chrome:// the same way).
const INTERNAL_URL = /^(chrome|chrome-extension|chrome-untrusted|devtools):\/\//;
// Chrome's refusal while another extension's frame is in the tab.
const FOREIGN_FRAME = /Cannot access a chrome-extension:\/\/ URL of different extension/;

class HostError extends Error {
  constructor(message, code = 1) { super(message); this.code = code; }
}
const refuse = (message, code) => { throw new HostError(message, code); };
const notPart = (s, tabId) => `Tab ${tabId} is not part of browser session ${s.id}`;
const turnOver = (s, turn) => (s.closed ? `Browser session ${s.id} has ended: its client disconnected` : `Browser session ${s.id} turn ${turn} has ended`);
const tolerateNotAttached = error => { if (!/not attached/i.test(error?.message ?? '')) throw error; };
// What a refusal is about: the debuggee, tab or window, and the CDP method; never CDP params.
function describe(method, params) {
  const p = params ?? {};
  const d = method === 'debugger.sendCommand' ? p.debuggee : (p.tabId !== undefined || p.targetId !== undefined ? p : null);
  const picked = {
    ...(d?.tabId !== undefined ? {tabId: d.tabId} : {}), ...(d?.targetId !== undefined ? {targetId: d.targetId} : {}),
    ...(p.sessionId !== undefined ? {sessionId: p.sessionId} : {}), ...(p.windowId !== undefined ? {windowId: p.windowId} : {}),
    ...(p.openerTabId !== undefined ? {openerTabId: p.openerTabId} : {}),
  };
  return `${JSON.stringify(picked)}${method === 'debugger.sendCommand' ? ` ${p.method}` : ''}`;
}

// `extension` is {request(method, params)}; a client is {notify(method, params)}; `hello` is the extension's hello.
// With a `home`, the status (<name>.json beside the socket) is rewritten on every change.
export function createHost({extension: port, hello, home = null, now = () => new Date(), log = () => {}, pid = process.pid}) {
  const sessions = new Map();           // session_id -> session
  const owners = new Map();             // tabId -> {session, tab}
  const targets = new Map();            // attached OOPIF targetId -> owning tabId
  const downloads = new Map();          // Chrome download id -> {filename, url} of a download still in progress
  const statusPath = home ? join(backendDir(home), `${socketNameFor(hello.extensionInstanceId)}.json`) : null;
  let closed = false;
  // The extension's primitives, every refusal logged (the log is how a refused attach is diagnosed after the fact).
  const extension = {request: (method, params) => port.request(method, params).catch(error => {
    log(`extension refused ${method} ${describe(method, params)}: ${error?.message ?? error}`);
    throw error;
  })};
  const quiet = promise => promise.catch(() => {});   // already logged

  function status() {
    return {
      instanceId: hello.extensionInstanceId, extensionVersion: hello.version, protocolVersion: hello.protocolVersion, pid,
      sessions: [...sessions.values()].map(s => ({session_id: s.id, turn_id: s.turn,
        tabs: [...s.tabs.values()].map(t => ({tabId: t.tabId, origin: t.origin, mark: t.mark, attached: t.attached}))})),
      updatedAt: now().toISOString(),
    };
  }

  function changed() {
    if (!statusPath || closed) return;
    const tmp = `${statusPath}.${pid}.tmp`;
    try {
      writeFileSync(tmp, `${JSON.stringify(status(), null, 1)}\n`, {mode: 0o600});
      renameSync(tmp, statusPath);
    } catch (error) { log(`status_write_failed: ${error.message}`); }
  }

  // --- sessions, turns and ownership --------------------------------------------------------------------------------

  function sessionFor(client, sessionId, turn) {
    let s = sessions.get(sessionId);
    if (!s) {
      s = {id: sessionId, client, turn: null, seen: new Set(), ended: new Set(), title: 'cua', activeTabId: null, tabs: new Map(), closed: false, pendingViewport: null};
      sessions.set(sessionId, s);
      log(`session ${sessionId} opened`);
    }
    s.client = client;
    if (!s.seen.has(turn)) {
      s.seen.add(turn);
      s.turn = turn;
      for (const tab of s.tabs.values()) {
        if (tab.state !== 'handoff') continue;
        Object.assign(tab, {state: 'active', mark: 'none', turnId: turn});
        s.activeTabId ??= tab.tabId;
      }
      changed();
    }
    return s;
  }

  const newTab = (tabId, windowId, turnId, origin) => ({tabId, windowId, turnId, origin, mark: 'none', state: 'active', attached: false, targets: new Set(), canceledByUser: false, viewport: null});

  function own(s, tab) {
    s.tabs.set(tab.tabId, tab);
    owners.set(tab.tabId, {session: s, tab});
  }

  function dropTarget(tab, targetId) {
    tab.targets.delete(targetId);
    if (targets.get(targetId) === tab.tabId) targets.delete(targetId);
  }

  function release(s, tab) {
    s.tabs.delete(tab.tabId);
    if (owners.get(tab.tabId)?.tab === tab) owners.delete(tab.tabId);
    for (const targetId of [...tab.targets]) dropTarget(tab, targetId);
    if (s.activeTabId === tab.tabId) s.activeTabId = null;
  }

  function ownedTab(s, tabId, method) {
    if (!Number.isInteger(tabId)) refuse(`${method} requires an integer tabId`);
    const owner = owners.get(tabId);
    if (owner && owner.session !== s) refuse(OTHER_SESSION);
    if (!owner || owner.tab.state !== 'active') refuse(notPart(s, tabId));
    return owner.tab;
  }

  // The current turn adopts a tab it uses, so a late turnEnded for an earlier turn never closes it.
  function touch(s, tab, turn) {
    if (turn !== s.turn || tab.turnId === turn || s.ended.has(turn)) return;
    tab.turnId = turn;
    changed();
  }

  const stillOwned = (s, tab) => owners.get(tab.tabId)?.tab === tab && tab.state === 'active' && !s.closed;

  // Detaches every debuggee of a tab, forgetting them first so events racing the detach are dropped.
  function detachAll(tab) {
    const debuggees = [...(tab.attached ? [{tabId: tab.tabId}] : []), ...[...tab.targets].map(targetId => ({targetId}))];
    tab.attached = false;
    for (const targetId of [...tab.targets]) dropTarget(tab, targetId);
    return Promise.all(debuggees.map(d => quiet(extension.request('debugger.detach', d).catch(tolerateNotAttached))));
  }

  async function endTurn(s, turn) {
    if (s.pendingViewport?.turn === turn) s.pendingViewport = null;
    const work = [];
    for (const tab of [...s.tabs.values()]) {
      if (tab.state !== 'active' || tab.turnId !== turn) continue;
      const detached = detachAll(tab);
      if (tab.mark === 'handoff') {
        // A late turnEnded: the session's next turn has already begun, so the handoff resumes into it now (waiting for
        // the next first-seen turn would strand the tab for the whole of the current one).
        if (turn !== s.turn && s.turn !== null && !s.ended.has(s.turn) && !s.closed) {
          Object.assign(tab, {mark: 'none', turnId: s.turn});
          s.activeTabId ??= tab.tabId;
        } else {
          tab.state = 'handoff';
          unguard(tab);                     // the user works in it until the session resumes it
        }
        work.push(detached);
        continue;
      }
      release(s, tab);
      work.push(detached.then(() => {
        if (tab.origin === 'created' && tab.mark === 'none') return quiet(extension.request('tabs.remove', {tabId: tab.tabId}));
        unguard(tab);
        if (tab.origin === 'created') return quiet(extension.request('tabs.ungroup', {tabId: tab.tabId}));
      }));
    }
    changed();
    await Promise.all(work);
    log(`session ${s.id} turn ${turn} ended`);
  }

  // Never awaited: a page that cannot run scripts now (an open alert or beforeunload dialog blocks its renderer) must not
  // hold up a turn's end.
  const unguard = tab => { quiet(extension.request('tabs.unguard', {tabId: tab.tabId})); };

  // A sweep of the tab, waited for at most GUARD_WAIT_MS: an open JavaScript dialog stops chrome.scripting until it is
  // dismissed, and attaching is how the agent dismisses it. Resolves the sweep's result, or null.
  async function sweep(tabId) {
    let timer;
    const bound = new Promise(resolve => { timer = setTimeout(() => resolve(TIMED_OUT), GUARD_WAIT_MS); });
    try {
      const result = await Promise.race([extension.request('tabs.guard', {tabId}).catch(() => null), bound]);
      if (result !== TIMED_OUT) return result;
      log(`tab ${tabId}: guard unanswered after ${GUARD_WAIT_MS} ms; attaching without waiting for it`);
      return null;
    } finally { clearTimeout(timer); }
  }

  // Attaches a debuggee of an owned tab after guarding the tab; Chrome refusing it for another extension's frame gets one
  // more sweep and one retry.
  async function attachGuarded(tabId, debuggee) {
    await sweep(tabId);
    try {
      return await extension.request('debugger.attach', debuggee);
    } catch (error) {
      if (!FOREIGN_FRAME.test(error?.message ?? '')) throw error;
      const swept = await sweep(tabId);
      log(`tab ${tabId}: another extension's frame blocked the debugger; swept ${JSON.stringify(swept)}, retrying once`);
      return await extension.request('debugger.attach', debuggee);
    }
  }

  // The session's logical active tab, as getTabs reports it (live tabs aside): the last created or claimed, else the first.
  function activeTabOf(s) {
    const tabs = [...s.tabs.values()].filter(t => t.state === 'active');
    return tabs.find(t => t.tabId === s.activeTabId) ?? tabs[0] ?? null;
  }

  // Sends the tab's viewport override (or its clearing) to the attached tab debuggee.
  const sendViewport = tab => extension.request('debugger.sendCommand', {debuggee: {tabId: tab.tabId},
    ...(tab.viewport ? {method: 'Emulation.setDeviceMetricsOverride', params: {...tab.viewport, deviceScaleFactor: 1, mobile: false}}
      : {method: 'Emulation.clearDeviceMetricsOverride', params: {}})});

  // browser_viewport_set ({width, height}) and browser_viewport_reset (null): applied at once to an attached tab; a tab
  // Chrome detached behind the host's back is forgotten as detached, so the service's re-attach applies it.
  async function setViewport(s, turn, size) {
    if (s.ended.has(turn)) refuse(turnOver(s, turn));
    const tab = activeTabOf(s);
    if (!tab) {
      s.pendingViewport = size ? {turn, size} : null;
      return {};
    }
    touch(s, tab, turn);
    tab.viewport = size;
    s.pendingViewport = null;
    if (tab.attached) await sendViewport(tab).catch(error => forgetLostDebugger(tab, error));
    return {};
  }

  // Chrome answering "Debugger is not attached" for a tab the host holds: the host forgets the attachment (the next
  // attach is real and applies the viewport); anything else is the caller's error.
  function forgetLostDebugger(tab, error) {
    if (!/Debugger is not attached/.test(error?.message ?? '')) throw error;
    if (tab.attached) { tab.attached = false; changed(); }
  }

  const positiveInt = v => Number.isSafeInteger(v) && v > 0;
  const unhandled = {
    browser_viewport_set: ({width, height}, s, turn) => {
      if (!positiveInt(width) || !positiveInt(height)) refuse('browser_viewport_set requires positive integer width and height');
      return setViewport(s, turn, {width, height});
    },
    browser_viewport_reset: (params, s, turn) => setViewport(s, turn, null),
  };

  async function pickWindow(preferred) {
    const normal = (await extension.request('windows.query', {})).filter(w => w.type === 'normal');
    const chosen = normal.find(w => w.id === preferred) ?? normal.find(w => w.focused) ?? normal[0];
    if (chosen) return chosen.id;
    return (await extension.request('windows.create', {focused: false})).id;
  }

  // --- the backend methods ------------------------------------------------------------------------------------------

  const handlers = {
    getInfo: () => ({type: 'extension', family: 'chrome', name: 'cua', version: hello.version, capabilities: {browser: [VIEWPORT_CAPABILITY], tab: []},
      metadata: {extensionInstanceId: hello.extensionInstanceId}}),

    ping: () => 'pong',

    moveMouse: () => ({}),

    async getTabs(params, s) {
      const live = new Map((await extension.request('tabs.query', {})).map(t => [t.id, t]));
      const out = [];
      let stale = false;
      for (const tab of [...s.tabs.values()]) {
        if (tab.state !== 'active') continue;
        const info = live.get(tab.tabId);
        if (!info) { release(s, tab); stale = true; continue; }
        out.push({id: tab.tabId, title: info.title, url: info.url, active: false});
      }
      const activeId = out.some(t => t.id === s.activeTabId) ? s.activeTabId : out[0]?.id;
      for (const t of out) t.active = t.id === activeId;
      if (stale) changed();
      return out;
    },

    async createTab({preferredWindowId}, s, turn) {
      if (s.ended.has(turn)) refuse(turnOver(s, turn));
      const windowId = await pickWindow(preferredWindowId);
      const created = await extension.request('tabs.create', {url: 'about:blank', windowId, group: {key: s.id, title: s.title}, guard: true});
      if (s.closed || s.ended.has(turn)) {
        await quiet(extension.request('tabs.remove', {tabId: created.id}));
        refuse(turnOver(s, turn));
      }
      own(s, newTab(created.id, created.windowId ?? windowId, turn, 'created'));
      s.activeTabId = created.id;
      changed();
      return {id: created.id, title: '', url: 'about:blank', active: true};
    },

    async attach({tabId}, s, turn) {
      const tab = ownedTab(s, tabId, 'attach');
      if (tab.canceledByUser) refuse(`Tab ${tabId}: the user canceled debugging; cua does not attach it again`);
      touch(s, tab, turn);
      // A size set before the turn had a tab goes to the first tab it attaches (another turn's is never applied).
      if (s.pendingViewport?.turn === turn && !tab.viewport) {
        tab.viewport = s.pendingViewport.size;
        s.pendingViewport = null;
      }
      if (tab.attached) {
        if (!tab.viewport) return {};
        // Re-applied, as the ChatGPT extension does; a debuggee Chrome lost without telling us is attached again.
        try { await sendViewport(tab); return {}; } catch (error) { forgetLostDebugger(tab, error); }
      }
      await attachGuarded(tabId, {tabId});
      if (!stillOwned(s, tab)) {
        await quiet(extension.request('debugger.detach', {tabId}).catch(tolerateNotAttached));
        refuse(notPart(s, tabId));
      }
      tab.attached = true;
      changed();
      if (tab.viewport) await sendViewport(tab);
      return {};
    },

    async detach({tabId}, s) {
      const tab = ownedTab(s, tabId, 'detach');
      if (!tab.attached) return {};
      tab.attached = false;
      changed();
      await extension.request('debugger.detach', {tabId}).catch(tolerateNotAttached);
      return {};
    },

    async attachTarget({tabId, targetId}, s, turn) {
      const tab = ownedTab(s, tabId, 'attachTarget');
      if (typeof targetId !== 'string' || !targetId) refuse('attachTarget requires a targetId');
      const holder = targets.get(targetId);
      if (holder !== undefined && holder !== tabId) refuse(owners.get(holder)?.session === s ? `Target ${targetId} belongs to tab ${holder}` : OTHER_SESSION);
      if (tab.canceledByUser) refuse(`Tab ${tabId}: the user canceled debugging; cua does not attach it again`);
      touch(s, tab, turn);
      if (tab.targets.has(targetId)) return {};
      await attachGuarded(tabId, {targetId});
      if (!stillOwned(s, tab)) {
        await quiet(extension.request('debugger.detach', {targetId}).catch(tolerateNotAttached));
        refuse(notPart(s, tabId));
      }
      tab.targets.add(targetId);
      targets.set(targetId, tabId);
      return {};
    },

    async detachTarget({tabId, targetId}, s) {
      const tab = ownedTab(s, tabId, 'detachTarget');
      if (!tab.targets.has(targetId)) return {};
      dropTarget(tab, targetId);
      await extension.request('debugger.detach', {targetId}).catch(tolerateNotAttached);
      return {};
    },

    async executeCdp({target, method, commandParams, timeoutMs, preserveDebuggerOnTimeout}, s, turn) {
      if (typeof method !== 'string') refuse('executeCdp requires a method');
      const {tabId, sessionId, targetId} = target ?? {};
      if (sessionId != null && targetId != null) refuse('CDP target must provide either sessionId or targetId, not both.');
      const tab = ownedTab(s, tabId, 'executeCdp');
      touch(s, tab, turn);
      if (!tab.attached) refuse('Debugger unattached');
      let debuggee = {tabId};
      if (targetId != null) {
        if (!tab.targets.has(targetId)) refuse(`Debugger is not attached to the target with id: ${targetId}.`);
        debuggee = {targetId};
      }
      const limit = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_CDP_TIMEOUT_MS;
      const command = method === 'Target.getTargets'
        ? extension.request('debugger.getTargets', {}).then(targetInfos => ({targetInfos}))
        : extension.request('debugger.sendCommand', {debuggee, ...(sessionId != null ? {sessionId} : {}), method, params: commandParams ?? {}});
      let timer;
      const timeout = new Promise((resolve, reject) => { timer = setTimeout(() => reject(TIMED_OUT), limit); });
      try {
        return await Promise.race([command, timeout]);
      } catch (error) {
        if (error === TIMED_OUT) {
          if (preserveDebuggerOnTimeout !== true && tab.attached) {
            tab.attached = false;
            changed();
            await quiet(extension.request('debugger.detach', {tabId}).catch(tolerateNotAttached));
          }
          refuse(`Timed out after ${limit}ms waiting for CDP command ${method}.`);
        }
        // Chrome lost the debuggee without telling us: forget it, so the service's re-attach really attaches.
        if (targetId == null && /Debugger is not attached/.test(error?.message ?? '') && tab.attached) { tab.attached = false; changed(); }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },

    // The service's commands without a handler of its own (browser-service.mjs executeUnhandledCommand); the ChatGPT
    // extension's wording for one it does not know.
    executeUnhandledCommand(params, s, turn) {
      const handler = Object.hasOwn(unhandled, params.type) ? unhandled[params.type] : null;
      if (!handler) refuse(`cua does not support command "${params.type}".`);
      return handler(params, s, turn);
    },

    async getUserTabs() {
      return (await extension.request('tabs.query', {})).filter(t => !owners.has(t.id))
        .map(({id, title, url}) => ({id, ...(title != null ? {title} : {}), ...(url != null ? {url} : {})}));
    },

    async claimUserTab({tabId}, s, turn) {
      if (!Number.isInteger(tabId)) refuse('claimUserTab requires an integer tabId');
      if (owners.has(tabId) && owners.get(tabId).session !== s) refuse(OTHER_SESSION);
      if (s.ended.has(turn)) refuse(turnOver(s, turn));
      const info = await extension.request('tabs.get', {tabId});
      if (INTERNAL_URL.test(info.url ?? '')) refuse(`Chrome internal tab ${tabId} cannot be claimed`);
      const owner = owners.get(tabId);
      if (owner && owner.session !== s) refuse(OTHER_SESSION);
      if (s.closed || s.ended.has(turn)) refuse(turnOver(s, turn));
      const tab = owner?.tab ?? newTab(tabId, info.windowId, turn, 'claimed');
      if (!owner) own(s, tab);
      if (tab.state === 'handoff') Object.assign(tab, {state: 'active', mark: 'none'});
      touch(s, tab, turn);
      s.activeTabId = tabId;
      changed();
      return {id: tabId, ...(info.title != null ? {title: info.title} : {}), ...(info.url != null ? {url: info.url} : {}), active: true};
    },

    async getCommittedTabUrl({tabId}, s) {
      ownedTab(s, tabId, 'getCommittedTabUrl');
      return (await extension.request('tabs.get', {tabId})).url ?? null;
    },

    markTab({tabId, status: mark}, s, turn) {
      if (!MARKS.has(mark)) refuse('markTab status must be "handoff" or "deliverable"');
      const tab = ownedTab(s, tabId, 'markTab');
      touch(s, tab, turn);
      tab.mark = mark;
      changed();
      return {};
    },

    async nameSession({name}, s) {
      if (typeof name !== 'string' || !name.trim()) refuse('nameSession requires a name');
      s.title = name;
      const windows = new Set([...s.tabs.values()].filter(t => t.origin === 'created').map(t => t.windowId));
      for (const windowId of windows) await extension.request('group.title', {windowId, key: s.id, title: name});
      return {};
    },

    async turnEnded({session_id: sessionId, turn_id: turn}) {
      if (typeof sessionId !== 'string' || typeof turn !== 'string') refuse('turnEnded requires session_id and turn_id');
      const s = sessions.get(sessionId);
      if (!s) return {};
      s.seen.add(turn);
      s.ended.add(turn);
      await endTurn(s, turn);
      return {};
    },
  };

  // --- what the extension tells the host ----------------------------------------------------------------------------

  function ownerOf(debuggee) {
    const targetId = debuggee?.targetId;
    const tabId = targetId !== undefined ? targets.get(targetId) : debuggee?.tabId;
    const owner = owners.get(tabId);
    if (!owner || owner.tab.state !== 'active') return null;
    if (targetId === undefined && !owner.tab.attached) return null;
    return {...owner, tabId, targetId};
  }

  function tell(s, method, params) {
    try { s.client?.notify(method, params); } catch (error) { log(`notify ${method} to session ${s.id} failed: ${error.message}`); }
  }

  // What every client with a session is told (a download belongs to no session the host can name).
  function tellAll(method, params) {
    for (const client of new Set([...sessions.values()].map(s => s.client))) {
      try { client.notify(method, params); } catch (error) { log(`notify ${method} failed: ${error.message}`); }
    }
  }

  // The service's status for Chrome's download state: a change without a state keeps the download in progress (a
  // filename arriving); interrupted is the user's cancel or a failure (chrome.downloads.InterruptReason).
  function downloadStatus({state, error}) {
    if (state === 'complete') return 'complete';
    if (state === 'interrupted') return error === 'USER_CANCELED' ? 'canceled' : 'failed';
    return 'in_progress';
  }

  const notifications = {
    'debugger.event'({debuggee, sessionId, method, params}) {
      const o = ownerOf(debuggee);
      if (!o) return;
      tell(o.session, 'onCDPEvent', {source: {tabId: o.tabId, ...(sessionId ? {sessionId} : {}), ...(o.targetId !== undefined ? {targetId: o.targetId} : {})}, method, params});
    },
    'debugger.detached'({debuggee, reason}) {
      const o = ownerOf(debuggee);
      if (!o) return;
      if (o.targetId !== undefined) dropTarget(o.tab, o.targetId); else o.tab.attached = false;
      if (reason === 'canceled_by_user') o.tab.canceledByUser = true;
      changed();
      tell(o.session, 'onCDPDetach', {tabId: o.tabId, ...(o.targetId !== undefined ? {targetId: o.targetId} : {}), reason});
    },
    'tabs.removed'({tabId}) {
      const owner = owners.get(tabId);
      if (!owner) return;
      release(owner.session, owner.tab);
      changed();
    },
    // Chrome's download items as the extension reports them (while it holds a debuggee), in the service's shape: the
    // id as a string, the url the download ended at, the filename Chrome has settled on so far (its full path once
    // known). A change of a download that began unreported is dropped: the service never saw its start.
    'downloads.created'({id, url, finalUrl, filename}) {
      if (id == null) return;
      const d = {filename: typeof filename === 'string' ? filename : '', url: typeof finalUrl === 'string' && finalUrl ? finalUrl : (typeof url === 'string' ? url : '')};
      downloads.set(id, d);
      tellAll('onDownloadChange', {id: String(id), filename: d.filename, url: d.url, status: 'started'});
    },
    'downloads.changed'({id, filename, finalUrl, state, error}) {
      const d = downloads.get(id);
      if (!d) return;
      if (typeof filename === 'string') d.filename = filename;
      if (typeof finalUrl === 'string' && finalUrl) d.url = finalUrl;
      const status = downloadStatus({state, error});
      if (status !== 'in_progress') downloads.delete(id);
      tellAll('onDownloadChange', {id: String(id), filename: d.filename, url: d.url, status});
    },
    // A guarded page opening a URL: the session whose current turn owns the opener takes it as a created tab, the turn's
    // active one, as if the agent had created it; anything else (the turn is over, the opener was released) is dropped.
    async 'tabs.popup'({openerTabId, url}) {
      const owner = owners.get(openerTabId);
      const s = owner?.session, turn = owner?.tab.turnId;
      const live = () => owners.get(openerTabId)?.tab === owner.tab && owner.tab.state === 'active' && !s.closed && turn === s.turn && !s.ended.has(turn);
      if (!owner || !live() || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        log(`popup from tab ${openerTabId} dropped: no current turn owns the tab`);
        return;
      }
      const created = await extension.request('tabs.create', {url, openerTabId, group: {key: s.id, title: s.title}, guard: true});
      if (!live()) {
        await quiet(extension.request('tabs.remove', {tabId: created.id}));
        return;
      }
      own(s, newTab(created.id, created.windowId, turn, 'created'));
      s.activeTabId = created.id;
      changed();
      log(`session ${s.id} took popup tab ${created.id} from tab ${openerTabId}`);
    },
  };

  changed();
  return {
    methods: Object.keys(handlers),
    async handleBackendRequest(client, {method, params}) {
      const handler = Object.hasOwn(handlers, method) ? handlers[method] : null;
      if (!handler) refuse(NO_HANDLER(method), -1);
      const p = params ?? {};
      if (SESSION_EXEMPT.has(method)) return await handler(p);
      if (typeof p.session_id !== 'string' || typeof p.turn_id !== 'string') refuse(`${method} requires session_id and turn_id`);
      return await handler(p, sessionFor(client, p.session_id, p.turn_id), p.turn_id);
    },
    async clientClosed(client) {
      await Promise.all([...sessions.values()].filter(s => s.client === client).map(async s => {
        s.closed = true;
        sessions.delete(s.id);
        for (const turn of new Set([...s.tabs.values()].filter(t => t.state === 'active').map(t => t.turnId))) await endTurn(s, turn);
        for (const tab of [...s.tabs.values()]) {
          release(s, tab);
          if (tab.origin === 'created') await quiet(extension.request('tabs.ungroup', {tabId: tab.tabId}));
        }
        changed();
        log(`session ${s.id} closed with its client`);
      }));
    },
    // Resolves when the notification has been handled (tests await it; the program does not).
    async onExtensionNotification({method, params}) {
      if (!Object.hasOwn(notifications, method)) return;
      try { await notifications[method](params ?? {}); } catch (error) { log(`extension notification ${method} failed: ${error?.message ?? error}`); }
    },
    extensionClosed() {
      closed = true;
      for (const s of sessions.values()) s.closed = true;
      sessions.clear();
      owners.clear();
      targets.clear();
    },
    status,
  };
}

// --- the program ----------------------------------------------------------------------------------------------------

// A socket file with a listener behind it is live; one refusing (or not a socket) is stale and removed. A listener that
// neither accepts nor refuses within the bound counts as live: it is never stolen.
function socketIsLive(path) {
  if (!existsSync(path)) return Promise.resolve(false);
  return new Promise(resolve => {
    const socket = connect(path);
    const done = live => { clearTimeout(timer); socket.destroy(); if (!live) rmSync(path, {force: true}); resolve(live); };
    const timer = setTimeout(() => done(true), LIVE_PROBE_MS);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

const listen = (server, path) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(path, () => { server.off('error', reject); resolve(); });
});

// The program's main, over any stream pair: waits for the extension's hello, listens at $CUA_HOME/chrome/b/<name>.sock,
// serves socket clients until the native port closes, then cleans up and resolves {code, reason}. It refuses (code 1,
// a `hostRefused {code, message}` notification to the extension) a hello of another protocol major
// (protocol_mismatch), one without an instance id (hello_invalid), and a socket another host serves (already_served).
export async function runHost({stdin, stdout, env = process.env, home = env.CUA_HOME, pid = process.pid, captureProcessErrors = false}) {
  if (!home) return {code: 2, reason: 'home_missing', message: 'CUA_HOME is not set; the launcher `cua chrome register` writes sets it'};
  const backends = backendDir(home), logs = logDir(home);
  mkdirSync(backends, {recursive: true, mode: 0o700});
  mkdirSync(logs, {recursive: true, mode: 0o700});
  let logPath = join(logs, `${pid}.log`);
  const logFd = openSync(logPath, 'w', 0o600);
  const log = line => { try { writeSync(logFd, `${new Date().toISOString()} ${line}\n`); } catch {} };
  log(`start pid=${pid} node=${process.version}`);
  if (captureProcessErrors) {
    const fatal = error => { log(`fatal: ${error?.stack ?? error}`); process.exit(1); };
    process.on('uncaughtException', fatal);
    process.on('unhandledRejection', fatal);
  }

  let host = null;
  let portClosed;
  const closedPort = new Promise(resolve => { portClosed = resolve; });
  let gotHello;
  const helloSeen = new Promise(resolve => { gotHello = resolve; });
  const forward = method => params => host?.onExtensionNotification({method, params});
  const extension = createPeer({
    send: bytes => { if (!stdout.destroyed && !stdout.writableEnded) stdout.write(bytes); },
    maxFrameBytes: MAX_TO_EXTENSION_BYTES,
    onError: (error, method) => log(`extension notification ${method} failed: ${error?.stack ?? error}`),
    handlers: {hello: params => gotHello(params), 'debugger.event': forward('debugger.event'), 'debugger.detached': forward('debugger.detached'),
      'tabs.removed': forward('tabs.removed'), 'tabs.updated': forward('tabs.updated'), 'tabs.popup': forward('tabs.popup'),
      'downloads.created': forward('downloads.created'), 'downloads.changed': forward('downloads.changed')},
  });
  const push = frameDecoder(MAX_FROM_EXTENSION_BYTES);
  stdin.on('data', chunk => {
    let messages;
    try { messages = push(chunk); } catch (error) { log(`extension frame error: ${error.message}`); portClosed('frame_error'); return; }
    for (const message of messages) extension.receive(message);
  });
  stdin.once('end', () => portClosed('end'));
  stdin.once('close', () => portClosed('close'));
  stdin.on('error', error => { log(`stdin error: ${error.message}`); portClosed('stdin_error'); });
  stdout.on('error', error => { log(`stdout error: ${error.message}`); portClosed('stdout_error'); });

  const finish = (code, reason) => { log(`exit ${code} (${reason})`); try { closeSync(logFd); } catch {} return {code, reason, logPath}; };
  const refuseExtension = async (code, message) => {
    log(`refused ${code}: ${message}`);
    try { extension.notify('hostRefused', {code, message}); } catch {}
    await new Promise(resolve => (stdout.destroyed || stdout.writableEnded ? resolve() : stdout.write(Buffer.alloc(0), resolve)));
    return finish(1, code);
  };

  const first = await Promise.race([helloSeen.then(hello => ({hello})), closedPort.then(reason => ({reason}))]);
  if (!first.hello) return finish(1, 'port_closed_before_hello');
  const hello = first.hello;
  if (typeof hello.extensionInstanceId !== 'string' || !hello.extensionInstanceId) return await refuseExtension('hello_invalid', 'hello carries no extensionInstanceId');
  if (Math.trunc(Number(hello.protocolVersion)) !== PROTOCOL_VERSION)
    return await refuseExtension('protocol_mismatch', `the extension speaks protocol ${hello.protocolVersion}; this host speaks ${PROTOCOL_VERSION}`);

  const name = socketNameFor(hello.extensionInstanceId);
  log(`hello instance=${hello.extensionInstanceId} version=${hello.version} protocol=${hello.protocolVersion} socket=${name}`);
  const socketPath = join(backends, `${name}.sock`);
  if (await socketIsLive(socketPath)) return await refuseExtension('already_served', `another host serves ${socketPath}`);

  const sockets = new Set();
  const server = createServer(socket => {
    sockets.add(socket);
    const client = {notify: (method, params) => peer.notify(method, params)};
    const peer = createPeer({
      send: bytes => { if (!socket.destroyed) socket.write(bytes); },
      onError: (error, method) => log(`client notification ${method} failed: ${error?.message ?? error}`),
      handlers: Object.fromEntries(host.methods.map(method => [method, params => host.handleBackendRequest(client, {method, params})])),
    });
    const decode = frameDecoder();
    socket.on('data', chunk => {
      try { for (const message of decode(chunk)) peer.receive(message); } catch (error) { log(`client frame error: ${error.message}`); socket.destroy(); }
    });
    socket.on('error', () => {});
    socket.once('close', () => {
      sockets.delete(socket);
      peer.close('client closed');
      host.clientClosed(client).catch(error => log(`client cleanup failed: ${error.message}`));
    });
  });
  try {
    await listen(server, socketPath);
  } catch (error) {
    if (error.code === 'EADDRINUSE') return await refuseExtension('already_served', `another host serves ${socketPath}`);
    return await refuseExtension('listen_failed', `cannot listen at ${socketPath}: ${error.message}`);
  }
  chmodSync(socketPath, 0o600);
  // Connections are accepted from the next turn on; the host exists before the first one arrives.
  host = createHost({extension, hello, home, log, pid});
  // The log takes the profile's name only now: a host refused above never replaces the serving host's log.
  const named = join(logs, `${name}.log`);
  try { renameSync(logPath, named); logPath = named; } catch (error) { log(`log rename failed: ${error.message}`); }
  log(`listening ${socketPath}`);

  const reason = await closedPort;
  log(`native port closed (${reason})`);
  extension.close('extension disconnected');
  host.extensionClosed();
  await new Promise(resolve => setImmediate(resolve));       // refused requests' replies reach their clients
  // The status file goes first, then close() unlinks the socket path at once (libuv) while waiting for clients: from
  // then on a successor may take the path, so nothing at it is removed after this point.
  rmSync(join(backends, `${name}.json`), {force: true});
  for (const socket of sockets) socket.end();
  const ended = new Promise(resolve => server.close(resolve));
  const forced = setTimeout(() => { for (const socket of sockets) socket.destroy(); }, 1000);
  await ended;
  clearTimeout(forced);
  return finish(0, 'port_closed');
}

async function main() {
  const result = await runHost({stdin: process.stdin, stdout: process.stdout, env: process.env, captureProcessErrors: true});
  if (result.reason === 'home_missing') process.stderr.write(`cua host: home_missing: ${result.message}\n`);
  process.exit(result.code);
}

const invoked = process.argv[1] && (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (invoked) main();
