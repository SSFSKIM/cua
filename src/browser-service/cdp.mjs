// Ported from readable chatgpt-26.928.40906 BS:47183-48757 (class cf, the CDP controller); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: Qn, the event emitter (BS:47139-47174); KX, yO, XX, JX and dt (BS:47176-47182); the helpers after the class
// (BS:48805-48946: YX, sf, ZX, QX, vO, eJ, hn, xO, uf, TO, CO, oJ, iJ, sJ, aJ, lJ, cJ, uJ).
//
// One controller per backend: it attaches tabs on first use, routes each CDP call to a tab or to an out-of-process
// frame's session, re-attaches once when the backend answers "Debugger unattached", and turns the backend's events
// into one stream (`event`, `tabAttached`, `tabDetached`) and a raw event queue per tab. It tracks JavaScript dialogs:
// while one is open in a tab every command to the tab but Page.handleJavaScriptDialog fails with dialog_open, and a
// beforeunload dialog is accepted at once (answering the others is M2's dialogs.mjs). Every call carries the command's
// Deadline (budgets.mjs) as the backend's timeoutMs.
//
// Options of a call: {deadline, timeoutMs, preserveOnTimeout, beforeDispatch, prepareDispatch}. `beforeDispatch()` runs
// immediately before the command is handed to the backend (the no-replay rule marks a user script dispatched there);
// `prepareDispatch()` is awaited before that, within the deadline.
//
// Dropped from cf: OpenAI's browser-auth machinery (credential target protection, service-worker start protection and
// bypass, raw network suppression, the auth branch of dialog handling), MCP-app document targets (forDocument), cached
// CDP expressions, telemetry spans and Sentry tags, and the extension's Page.navigationBlocked classification (the
// browser_navigation_blocked reason is not kept; cua's host never sends the event). Changed: an onCDPDetach naming a
// frame target drops that frame's session only, where the vendor forgets the whole tab (and with it an open dialog).
import {BrowserServiceError, DEADLINE_EXCEEDED, isDeadlineError, serviceError} from './errors.mjs';

const UNATTACHED = 'Debugger unattached';
const RAW_EVENT_LIMIT = 1000;                 // yO
const RETIRED_SCREENCAST_MS = 10000;          // XX
const RETIRED_SCREENCAST_LIMIT = 32;          // JX
const LOAD_CLASSIFICATION_MS = 250;
const DIALOG_TYPES = new Set(['alert', 'beforeunload', 'confirm', 'prompt']);

const messageOf = error => (error instanceof Error ? error.message : typeof error === 'string' ? error : '');
const isNested = target => target.sessionId != null || target.targetId != null;                      // dt
const isUnattached = error => messageOf(error) === UNATTACHED;
const isNotAttached = error => isUnattached(error) || messageOf(error).includes('Debugger is not attached');
// The host's and the extensions' wordings for a CDP command that ran out of time (eJ).
const isCdpTimeout = error => {
  const m = messageOf(error);
  return m.startsWith('Timed out running CDP command "') || m.startsWith('Timed out translating CDP input command "')
    || (m.startsWith('Timed out after ') && m.includes('ms waiting for CDP command '));
};

// A failure the controller can name: a tab the debugger lost and could not get back, or a command the backend timed out.
function classified(error) {
  if (error instanceof BrowserServiceError) return error;
  if (isNotAttached(error)) return new BrowserServiceError('tab_detached', messageOf(error), {cause: error});
  if (isCdpTimeout(error)) return new BrowserServiceError('timeout', messageOf(error), {cause: error});
  return error;
}

// The deadline arithmetic of a call's options (kt, af, ta, lf, wO).
const checkDeadline = options => { options.deadline?.check(); };
const callTimeout = options => (options.deadline ? options.deadline.timeoutMs(options.timeoutMs) : options.timeoutMs);
const dispatchTimeout = options => { options.beforeDispatch?.(); return callTimeout(options); };
const withinDeadline = (work, options) => (options.deadline ? options.deadline.race(work) : work);
const afterChecking = async (options, start) => { checkDeadline(options); return await withinDeadline(start(), options); };
// What an attachment made for a command may use of the command's options: its budget, never its dispatch hooks (the
// no-replay rule's beforeDispatch marks the command's own dispatch, not the setup's).
const setupOptions = options => ({
  ...(options.deadline !== undefined ? {deadline: options.deadline} : {}),
  ...(options.timeoutMs !== undefined ? {timeoutMs: options.timeoutMs} : {}),
});

const targetIdOf = info => (typeof info?.targetId === 'string' ? info.targetId : typeof info?.id === 'string' ? info.id : undefined);   // sf
const inTab = (info, tabId) => !('tabId' in info) || info.tabId == null || info.tabId === tabId;                                    // ZX
const isFrameCandidate = (info, hint) => info.type === 'iframe' || (info.type === 'other' && hint.url != null && info.url === hint.url);  // QX
const isFrameTarget = info => info.type === 'iframe' || info.type === 'other';                                                     // vO
const isPageSource = event => event.source.sessionId == null;                                                                       // hn
const isTopSource = event => isPageSource(event) && event.source.targetId == null;                                                  // uf
const isMainFrameNavigation = event => typeof event.source.tabId === 'number' && isTopSource(event) && event.params.frame.parentId == null;  // TO
const isMainFrameEvent = (event, mainFrames) => typeof event.source.tabId === 'number' && isPageSource(event) && mainFrames.get(event.source.tabId) === event.params.frameId;  // CO
const fromTarget = (event, target) => (target.sessionId != null ? event.source.sessionId === target.sessionId
  : target.targetId != null ? event.source.targetId === target.targetId : isTopSource(event));                                    // oJ
const sameDialogTarget = (target, source) => (target.sessionId != null ? target.sessionId === source.sessionId
  : target.tabId === source.tabId && source.sessionId == null);                                                                     // aJ
const screencastSessionOf = event => {                                                                                              // xO
  const id = event.params == null ? undefined : Reflect.get(event.params, 'sessionId');
  return typeof id === 'number' ? id : undefined;
};
const dialogTarget = (tabId, source) => (typeof source.sessionId === 'string' ? {tabId, sessionId: source.sessionId} : {tabId});

function pageExceptionMessage(details) {                                                                                            // YX
  const value = details.exception?.value;
  return `Browser Use encountered an error interacting with this webpage: ${(typeof value === 'string' ? value : details.exception?.description) ?? details.text ?? 'JavaScript evaluation failed'}`;
}

function numericTab(tabId, what) {
  const n = Number(tabId);
  if (!Number.isFinite(n)) throw new Error(`${what} requires numeric tab_id`);
  return n;
}

// The vendor's 36-line emitter (Qn): listeners run in order, synchronously, over a copy of the list.
class Emitter {
  listeners = {};
  addListener(name, listener) {
    (this.listeners[name] ??= []).push(listener);
    return this;
  }
  on(name, listener) { return this.addListener(name, listener); }
  removeListener(name, listener) {
    const list = this.listeners[name];
    const i = list?.lastIndexOf(listener) ?? -1;
    if (i >= 0) list.splice(i, 1);
    return this;
  }
  emit(name, ...args) {
    const list = this.listeners[name];
    if (list == null || list.length === 0) return false;
    for (const listener of [...list]) listener.apply(this, args);
    return true;
  }
}

export class CdpController extends Emitter {
  // `api` is the backend's session API (backend.mjs BackendApi): addEventListener, attach, detach, attachTarget,
  // detachTarget, executeCdp, getCommittedTabUrl.
  constructor(api) {
    super();
    this.api = api;
    this.api.addEventListener('onCDPDetach', detach => {
      if (typeof detach.tabId === 'number' && detach.targetId != null && this.attachedTabIds.has(detach.tabId)) {
        this.forgetFrameTarget(detach.tabId, detach.targetId);
        return;
      }
      const tabId = this.attachedTabIdForCdpEvent(detach)
        ?? (typeof detach.tabId === 'number' && this.tabAttachmentPromises.has(detach.tabId) ? detach.tabId : undefined);
      if (tabId != null) this.forgetAttachedTab(tabId);
    });
    this.api.addEventListener('onCDPEvent', received => {
      const tabId = this.attachedTabIdForCdpEvent(received.source);
      if (tabId == null) return;
      if (!this.isInternalScreencastEvent(tabId, received)) this.recordRawCdpEvent(tabId, received);
      const event = {...received, source: {...received.source, tabId}};
      this.handleTargetEvent(event);
      this.emit('event', event);
    });
    this.addTabAttachHandler(async (tabId, options) => {
      await this.call(tabId, 'Page.enable', undefined, options);
      await this.enableOopifAutoAttach(tabId, options);
    });
    this.addTabCleanupHandler(async tabId => { await this.detachAttachedFrameTargets(tabId); });
    this.on('event', event => { this.handleJavaScriptDialogEvent(event); });
    this.dialogs = Object.freeze({
      current: tabId => this.getJsDialog(tabId),
      blockIfOpen: tabId => this.throwIfJsDialogBlocksMethod(numericTab(tabId, 'blockIfOpen'), undefined),
    });
  }

  api;
  // {current(tabId) -> {id, type} | undefined, blockIfOpen(tabId)}: the tab's open dialog, and the dialog_open refusal.
  dialogs;
  fileChoosersById = new Map();
  attachedTabIds = new Set();
  tabAttachmentPromises = new Map();
  attachmentBudgets = new WeakMap();            // attachment promise -> the starter's {deadline, timeoutMs}
  initializingTabIds = new Set();
  tabAttachHandlers = new Set();
  tabCleanupHandlers = new Set();
  frameSessionsByTabId = new Map();             // tabId -> Map(frameId | targetId -> session)
  frameSessionsBySessionId = new Map();         // sessionId -> {frameId, sessionId, target, targetId}
  initializedFrameSessions = new WeakSet();
  frameSessionInitializationPromises = new WeakMap();
  attachedFrameTargetIdsByTabId = new Map();
  oopifAutoAttachTabIds = new Set();
  rawCdpEventsByTabId = new Map();
  rawCdpEventEvictedThroughSequenceByTabId = new Map();
  rawCdpEventSequenceByTabId = new Map();
  activeInternalScreencastsByTabId = new Map();
  screencastQueuesByTabId = new Map();
  rawScreencastTabIds = new Set();
  retiredInternalScreencastSessionsByTabId = new Map();
  mainFrameIdsByTabId = new Map();
  topLevelSecurityOriginsByTabId = new Map();
  jsDialogsByTabId = new Map();
  jsDialogSequence = 0;
  topLevelUrlsByTabId = new Map();

  // --- the spec's interface ------------------------------------------------------------------------------------------

  async attach(tabId) { await this.ensureAttachedTab(numericTab(tabId, 'attach')); }

  async detach(tabId) { await this.detachTab(tabId); }

  // `target` is a tab id or {tabId, sessionId? | targetId?}.
  async send(target, method, params, options = {}) {
    const resolved = typeof target === 'object' && target != null ? {...target, tabId: numericTab(target.tabId, 'callCdp')} : {tabId: numericTab(target, 'callCdp')};
    return await this.executeTargetCdp(resolved, method, params, options);
  }

  // --- calls ---------------------------------------------------------------------------------------------------------

  async call(tabId, method, params, options = {}) {
    return await this.callTarget({tabId: numericTab(tabId, 'callCdp')}, method, params, options);
  }

  async callTarget(target, method, params, options = {}) {
    return await this.executeTargetCdp(target, method, params, options);
  }

  // A raw CDP call (tab_cdp_call): the debugger is kept on timeout, and the screencast commands take the screencast lock.
  async callRawCdp(tabId, method, params, options = {}) {
    const n = numericTab(tabId, 'callRawCdp');
    const {target, ...rest} = options;
    const resolved = this.rawCdpTarget(n, target);
    const run = async () => await this.executeTargetCdp(resolved, method, params, {...rest, preserveOnTimeout: true});
    if (isNested(resolved) || (method !== 'Page.startScreencast' && method !== 'Page.stopScreencast')) return await run();
    return await this.withScreencastLock(n, async () => {
      const result = await run();
      if (method === 'Page.startScreencast') this.rawScreencastTabIds.add(n); else this.rawScreencastTabIds.delete(n);
      return result;
    });
  }

  isTabAttached(tabId) { return this.attachedTabIds.has(Number(tabId)); }

  async readCommittedTabUrl(tabId) {
    const n = Number(tabId);
    const url = await this.api.getCommittedTabUrl(n);
    if (url != null) this.topLevelUrlsByTabId.set(n, url);
    return url;
  }

  currentTopLevelUrl(tabId) {
    const n = Number(tabId);
    if (Number.isFinite(n)) return this.topLevelUrlsByTabId.get(n);
  }

  // The tab's raw events after `afterSequence` (or, waiting up to `timeoutMs` for one, after now), filtered by
  // `methods` and `target`, at most `limit`: {cursor, events, hasMore, truncated}.
  async readRawCdpEvents(tabId, options = {}) {
    const n = numericTab(tabId, 'readRawCdpEvents');
    const after = options.afterSequence ?? (options.timeoutMs == null ? undefined : this.rawCdpEventSequenceForTab(n));
    await this.ensureAttachedTab(n);
    const from = after ?? this.rawCdpEventSequenceForTab(n);
    const now = this.rawCdpEventsResult(n, from, options);
    if (now.events.length > 0 || now.truncated || options.timeoutMs == null || options.timeoutMs <= 0) return now;
    return await new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.removeListener('event', onEvent);
        this.removeListener('tabDetached', onDetached);
        clearTimeout(timer);
        resolve(this.rawCdpEventsResult(n, from, options));
      };
      const onEvent = () => {
        const result = this.rawCdpEventsResult(n, from, options);
        if (result.events.length > 0 || result.truncated) finish();
      };
      const onDetached = detached => { if (detached === n) finish(); };
      const timer = setTimeout(finish, options.timeoutMs);
      this.addListener('event', onEvent);
      this.addListener('tabDetached', onDetached);
      onEvent();
    });
  }

  async executeTargetCdp(target, method, params, options = {}, retry = true) {
    this.throwIfJsDialogBlocksMethod(target.tabId, method);
    checkDeadline(options);
    const canRetry = retry && !isNested(target) && !this.initializingTabIds.has(target.tabId);
    try {
      await withinDeadline(this.ensureAttachedTab(target.tabId, setupOptions(options)), options);
    } catch (error) {
      if (isUnattached(error) && canRetry) return await this.executeTargetCdp(target, method, params, options, false);
      throw classified(error);
    }
    if (options.prepareDispatch != null) await afterChecking(options, options.prepareDispatch);
    // A dialog may have opened, or the budget run out, while the tab was attached or the dispatch prepared.
    this.throwIfJsDialogBlocksMethod(target.tabId, method);
    checkDeadline(options);
    const attachment = this.attachedTabIds.has(target.tabId) ? this.tabAttachmentPromises.get(target.tabId) : undefined;
    const timeoutMs = dispatchTimeout(options);
    try {
      // The answer is awaited only until the deadline: once dispatched, the command is never sent again.
      return await this.api.executeCdp({
        target, method, commandParams: params ?? {},
        ...(options.preserveOnTimeout === true ? {preserveDebuggerOnTimeout: true} : {}),
        ...(timeoutMs !== undefined ? {timeoutMs} : {}),
      }, {deadline: options.deadline});
    } catch (error) {
      if (isNotAttached(error)) {
        if (attachment != null && this.tabAttachmentPromises.get(target.tabId) === attachment) this.forgetAttachedTab(target.tabId);
        if (canRetry) return await this.executeTargetCdp(target, method, params, options, false);
      }
      throw classified(error);
    }
  }

  // Asks Chrome to auto-attach the tab's out-of-process frames (flattened sessions), once per attachment.
  async enableOopifAutoAttach(tabId, options = {}) {
    const n = numericTab(tabId, 'enableOopifAutoAttach');
    if (this.oopifAutoAttachTabIds.has(n)) return;
    checkDeadline(options);
    await withinDeadline(this.ensureAttachedTab(n, setupOptions(options)), options);
    if (this.oopifAutoAttachTabIds.has(n)) return;
    await this.enableOopifAutoAttachForTarget({tabId: n}, options);
    this.oopifAutoAttachTabIds.add(n);
  }

  // --- frames --------------------------------------------------------------------------------------------------------

  // The target of a frame known by its frame or target id ({tabId, sessionId} or {tabId, targetId}), or null.
  targetForFrame(tabId, frameId) {
    const n = Number(tabId);
    return Number.isFinite(n) ? this.frameSessionsByTabId.get(n)?.get(frameId)?.target ?? null : null;
  }

  targetIdForFrame(tabId, frameId) {
    const n = Number(tabId);
    return Number.isFinite(n) ? this.frameSessionsByTabId.get(n)?.get(frameId)?.targetId ?? null : null;
  }

  // The target of frame `frameId`, attaching its out-of-process target when it is not known yet; null when the frame
  // is in the tab's own process (or gone). `hint` may name the frame's `url` or a `parentTarget` to check ownership in.
  async targetForFrameOrAttach(tabId, frameId, options = {}, hint = {}) {
    const n = Number(tabId);
    if (!Number.isFinite(n)) return null;
    if (frameId != null) {
      const known = this.frameSessionsByTabId.get(n)?.get(frameId);
      if (known != null) {
        await this.tryInitializeAttachedFrameSession(known, options);
        return known.target;
      }
    }
    checkDeadline(options);
    await withinDeadline(this.ensureAttachedTab(n, setupOptions(options)), options);
    const targets = await this.callTarget({tabId: n}, 'Target.getTargets', {}, options).catch(() => null);
    checkDeadline(options);
    const inThisTab = targets?.targetInfos.filter(info => inTab(info, n)) ?? [];
    const exact = inThisTab.find(info => isFrameTarget(info) && targetIdOf(info) === frameId);
    const candidates = inThisTab.filter(info => isFrameCandidate(info, hint));
    const byUrl = hint.url == null ? [] : candidates.filter(info => info.url === hint.url);
    const chosen = exact ?? (byUrl.length === 1 ? byUrl[0] : undefined);
    const targetId = targetIdOf(chosen);
    if (chosen == null || targetId == null) return null;
    if (exact == null && (!('tabId' in chosen) || chosen.tabId !== n) && this.frameSessionsByTabId.get(n)?.has(targetId) !== true) {
      const parent = hint.parentTarget ?? {tabId: n};
      if (parent.tabId !== n) return null;
      const owner = await this.callTarget(parent, 'DOM.getFrameOwner', {frameId: targetId}, options).catch(() => null);
      checkDeadline(options);
      if (typeof owner?.backendNodeId !== 'number') return null;
    }
    return (await this.attachDebuggerFrameTarget(n, targetId, frameId, options)) ?? (frameId == null ? null : this.targetForFrame(n, frameId));
  }

  async attachDebuggerFrameTarget(tabId, targetId, frameId, options) {
    const sessionKey = `target:${targetId}`;
    const existing = this.frameSessionsByTabId.get(tabId)?.get(targetId) ?? this.frameSessionsBySessionId.get(sessionKey);
    if (existing != null) {
      if (existing.target.tabId !== tabId) return null;
      if (frameId != null) this.setFrameSessionForFrame(tabId, frameId, existing);
      await this.tryInitializeAttachedFrameSession(existing, options);
      return existing.target;
    }
    if (typeof this.api.attachTarget !== 'function') return null;
    checkDeadline(options);
    try {
      await this.api.attachTarget(tabId, targetId);
    } catch {
      checkDeadline(options);
      return null;
    }
    const session = this.frameSessionsByTabId.get(tabId)?.get(targetId) ?? this.frameSessionsBySessionId.get(sessionKey)
      ?? {frameId: null, sessionId: sessionKey, target: {tabId, targetId}, targetId};
    this.frameSessionsBySessionId.set(session.sessionId, session);
    this.setFrameSessionTargetId(tabId, targetId, session);
    this.setFrameSessionForFrame(tabId, frameId ?? targetId, session);
    this.rememberAttachedFrameTarget(tabId, targetId);
    checkDeadline(options);
    await this.tryInitializeAttachedFrameSession(session, options);
    return session.target;
  }

  // --- page helpers ----------------------------------------------------------------------------------------------------

  async evaluateJavascript(tabId, expression, options = {}) {
    const params = {expression, returnByValue: options.returnByValue ?? true};
    if (options.awaitPromise != null) params.awaitPromise = options.awaitPromise;
    const result = await this.call(tabId, 'Runtime.evaluate', params, {timeoutMs: options.timeoutMs, deadline: options.deadline});
    if (result.exceptionDetails != null) throw new Error(pageExceptionMessage(result.exceptionDetails));
    return result.result?.value;
  }

  // {href, readyState, painted?} of the tab's document, or undefined when it cannot be read (or `deadline` is spent).
  async readDocumentState(tabId, options = {}) {
    try {
      const state = await this.evaluateJavascript(tabId, options.includePaint === true
        ? "({ href: window.location.href, readyState: document.readyState, painted: performance.getEntriesByType('paint').some(entry => entry.name === 'first-paint' || entry.name === 'first-contentful-paint') })"
        : '({ href: window.location.href, readyState: document.readyState })', setupOptions(options));
      const n = Number(tabId);
      if (Number.isFinite(n) && typeof state?.href === 'string' && state.href.length > 0) this.topLevelUrlsByTabId.set(n, state.href);
      return state;
    } catch {
      return undefined;
    }
  }

  // Resolves when a navigation of `target` (a tab id or a frame target) has loaded: a load that starts within
  // `classificationTimeoutMs` (250 ms) is waited for until its DOMContentLoaded or load event, or `timeoutMs`; a
  // same-document navigation or a back/forward-cache restore ends it at once; nothing starting ends it after the window.
  async waitForPageLoadEvent(target, options) {
    const t = typeof target === 'object' ? target : {tabId: numericTab(target, 'waitForPageLoadEvent')};
    await new Promise(resolve => {
      let started = false;
      const navigated = new Set();
      const finish = () => {
        this.removeListener('event', onEvent);
        clearTimeout(timer);
        resolve();
      };
      const onEvent = event => {
        if (event.source.tabId !== t.tabId || !fromTarget(event, t)) return;
        switch (event.method) {
          case 'Page.navigatedWithinDocument':
            if ((isNested(t) || isMainFrameEvent(event, this.mainFrameIdsByTabId)) && !navigated.has(event.params.frameId)) finish();
            return;
          case 'Page.frameStartedLoading':
          case 'Page.frameNavigated':
            if (event.method === 'Page.frameNavigated') {
              if (event.params.type === 'BackForwardCacheRestore') {
                if (isNested(t) || isMainFrameNavigation(event)) finish();
                return;
              }
              navigated.add(event.params.frame.id);
            }
            if (started) return;
            started = true;
            clearTimeout(timer);
            timer = setTimeout(finish, options.timeoutMs);
            return;
          case 'Page.domContentEventFired':
          case 'Page.loadEventFired':
            if (started) finish();
        }
      };
      let timer = setTimeout(finish, options.classificationTimeoutMs ?? LOAD_CLASSIFICATION_MS);
      this.addListener('event', onEvent);
    });
  }

  // Resolves with the first event of the tab `predicate` accepts (or undefined when `initialCheck()` resolves true),
  // after running `action()` with the listener armed; rejects on `signal` abort, or after `timeoutMs` with a timeout
  // error carrying `timeoutMessage`.
  async waitForEvent(tabId, predicate, options) {
    const n = numericTab(tabId, 'waitForEvent');
    if (options.signal?.aborted) throw new Error('waitForEvent aborted');
    const outcome = Promise.withResolvers();
    let settled = false;
    const succeed = event => { if (!settled) { settled = true; outcome.resolve(event); } };
    const fail = error => { if (!settled) { settled = true; outcome.reject(error); } };
    const onAbort = () => fail(new Error('waitForEvent aborted'));
    const onEvent = event => {
      if (settled || event.source.tabId !== n) return;
      try {
        if (predicate(event)) succeed(event);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(`waitForEvent predicate failed: ${String(error)}`));
      }
    };
    const timer = setTimeout(() => fail(new BrowserServiceError('timeout',
      options.timeoutMessage || `Timed out after ${options.timeoutMs}ms waiting for a browser event.`)), options.timeoutMs);
    outcome.promise.catch(() => {});
    try {
      options.signal?.addEventListener('abort', onAbort, {once: true});
      this.addListener('event', onEvent);
      if (options.initialCheck != null) options.initialCheck().then(ok => { if (ok) succeed(); }, fail);
      if (!options.signal?.aborted) await options.action?.();
      return await outcome.promise;
    } finally {
      this.removeListener('event', onEvent);
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
  }

  // Runs `work(isOwnFrame)` with a screencast of the service's own (screenshots); its frames stay out of the raw queue.
  // Nothing runs while a raw screencast (tab_cdp_call) holds the tab.
  async withInternalScreencast(tabId, work) {
    const n = numericTab(tabId, 'withInternalScreencast');
    return await this.withScreencastLock(n, async () => {
      if (this.rawScreencastTabIds.has(n)) return;
      const screencast = {sessionIds: new Set()};
      this.activeInternalScreencastsByTabId.set(n, screencast);
      try {
        return await work(event => this.isCurrentInternalScreencastEvent(n, screencast, event));
      } finally {
        if (this.activeInternalScreencastsByTabId.get(n) === screencast) this.activeInternalScreencastsByTabId.delete(n);
        this.retireInternalScreencast(n, screencast);
      }
    });
  }

  async detachAllTabs() {
    await Promise.allSettled([...this.tabAttachmentPromises.keys()].map(async tabId => this.detachTab(tabId)));
  }

  // --- dialogs -------------------------------------------------------------------------------------------------------

  getJsDialog(tabId) {
    const n = numericTab(tabId, 'getJsDialog');
    const dialog = this.jsDialogsByTabId.get(n);
    if (dialog != null) return {id: dialog.id, type: dialog.type};
  }

  // The tab's dialog record {id, type, message, promptText, url, target} when `dialogId` is the open one.
  activeJsDialog(tabId, dialogId) {
    const n = numericTab(tabId, 'handleJsDialog');
    if (!dialogId) throw new Error('handleJsDialog requires a dialog_id');
    const dialog = this.jsDialogsByTabId.get(n);
    if (dialog == null || dialog.id !== dialogId) throw new Error('JavaScript dialog is no longer active');
    return dialog;
  }

  updateJsDialogPrompt(tabId, dialogId, text) {
    const dialog = this.activeJsDialog(tabId, dialogId);
    if (dialog.type !== 'prompt') throw new Error('Only prompt dialogs accept text');
    dialog.promptText = text;
  }

  deleteJsDialog(tabId, dialogId) {
    const n = numericTab(tabId, 'handleJsDialog');
    if (!dialogId) throw new Error('handleJsDialog requires a dialog_id');
    if (this.jsDialogsByTabId.get(n)?.id === dialogId) this.jsDialogsByTabId.delete(n);
  }

  // --- tabs ----------------------------------------------------------------------------------------------------------

  async closeTab(tabId) {
    const n = numericTab(tabId, 'closeTab');
    const page = (await this.call(n, 'Target.getTargets', {})).targetInfos.find(info => ('tabId' in info ? info.tabId === n : false));
    await this.ensureAttachedTab(n);
    try {
      await this.runTabCleanupHandlers(n);
      const targetId = targetIdOf(page);
      await this.api.executeCdp(targetId != null
        ? {target: {tabId: n}, method: 'Target.closeTarget', commandParams: {targetId}}
        : {target: {tabId: n}, method: 'Page.close', commandParams: {}});
    } finally {
      this.forgetAttachedTab(n);
    }
  }

  async detachTab(tabId) {
    const n = numericTab(tabId, 'detachTab');
    while (!this.attachedTabIds.has(n)) {
      const attaching = this.tabAttachmentPromises.get(n);
      if (attaching == null) return;
      await attaching.catch(() => {});
    }
    try {
      await this.runTabCleanupHandlers(n);
      await this.api.detach(n);
    } finally {
      this.forgetAttachedTab(n);
    }
  }

  // `handler(tabId)` runs before a tab is detached or closed; -> remove.
  addTabCleanupHandler(handler) {
    this.tabCleanupHandlers.add(handler);
    return () => { this.tabCleanupHandlers.delete(handler); };
  }

  // `handler(tabId, options)` runs once each time a tab is attached (its deadline failures fail the attach); -> remove.
  addTabAttachHandler(handler) {
    this.tabAttachHandlers.add(handler);
    return () => { this.tabAttachHandlers.delete(handler); };
  }

  async runTabAttachHandlers(tabId, options) {
    const results = await Promise.allSettled([...this.tabAttachHandlers].map(async handler => handler(tabId, options)));
    const failed = results.find(r => r.status === 'rejected' && isDeadlineError(r.reason));
    if (failed?.status === 'rejected') throw failed.reason;
  }

  async runTabCleanupHandlers(tabId) {
    await Promise.allSettled([...this.tabCleanupHandlers].map(async handler => handler(tabId)));
  }

  deleteFileChoosersForTab(tabId) {
    for (const [id, chooser] of this.fileChoosersById) if (chooser.tabId === tabId) this.fileChoosersById.delete(id);
  }

  // Attaches the tab once for all callers. `options` ({deadline, timeoutMs}) is the budget of the caller that starts
  // the attachment: every setup command (attach, focus emulation, the attach handlers' Page.enable and auto-attach) is
  // given what is left of it at its own dispatch, and none is dispatched once it is spent. A caller that joined an
  // attachment which then timed out because its starter's deadline ran out attaches again on its own budget; any
  // other failure (a refusal, or a timeout of the starter's own smaller per-call bound) is everyone's.
  async ensureAttachedTab(tabId, options = {}) {
    if (this.attachedTabIds.has(tabId)) return;
    if (this.initializingTabIds.has(tabId)) throw new Error(UNATTACHED);
    let attaching = this.tabAttachmentPromises.get(tabId);
    const joined = attaching != null;
    if (attaching == null) {
      attaching = (async () => {
        checkDeadline(options);
        await this.api.attach(tabId);
        await this.enableFocusEmulation(tabId, options);
        if (this.tabAttachmentPromises.get(tabId) !== attaching) throw new Error('Debugger detached while attaching');
        this.attachedTabIds.add(tabId);
        this.initializingTabIds.add(tabId);
        try {
          this.emit('tabAttached', tabId);
          await this.runTabAttachHandlers(tabId, options);
        } finally {
          this.initializingTabIds.delete(tabId);
          if (!this.attachedTabIds.has(tabId)) this.forgetAttachedTab(tabId, true);
        }
        if (!this.attachedTabIds.has(tabId)) throw new Error(UNATTACHED);
      })();
      this.tabAttachmentPromises.set(tabId, attaching);
      this.attachmentBudgets.set(attaching, options);
    }
    try {
      await attaching;
    } catch (error) {
      if (this.tabAttachmentPromises.get(tabId) === attaching) this.forgetAttachedTab(tabId);
      if (joined && this.failedOnStarterBudget(attaching, error) && !options.deadline?.expired()) return await this.ensureAttachedTab(tabId, options);
      throw error;
    }
  }

  // Whether an attachment failed because its starter's deadline ran out: a timeout, in the service's words (the check
  // before a dispatch) or the host's (it enforces each setup command's timeoutMs), with the starter's deadline spent.
  // The host starts its clock only after the service computed the allowance, so when the starter's deadline bounded
  // the command, the deadline has passed by the time the host's answer arrives; when the starter's smaller per-call
  // timeoutMs bounded it, the deadline still has time left.
  failedOnStarterBudget(attaching, error) {
    const timedOut = (error instanceof BrowserServiceError && error.code === 'timeout') || messageOf(error) === DEADLINE_EXCEEDED || isCdpTimeout(error);
    return timedOut && this.attachmentBudgets.get(attaching)?.deadline?.expired() === true;
  }

  async enableFocusEmulation(tabId, options) {
    try {
      const timeoutMs = callTimeout(options);
      await this.api.executeCdp({target: {tabId}, method: 'Emulation.setFocusEmulationEnabled', commandParams: {enabled: true},
        ...(timeoutMs !== undefined ? {timeoutMs} : {})}, {deadline: options.deadline});
    } catch (error) {
      if (isDeadlineError(error)) throw error;
    }
  }

  async enableOopifAutoAttachForTarget(target, options = {}) {
    const base = {autoAttach: true, flatten: true, waitForDebuggerOnStart: false};
    const timeout = () => {
      const ms = dispatchTimeout(options);
      return ms !== undefined ? {timeoutMs: ms} : {};
    };
    try {
      await this.api.executeCdp({target, method: 'Target.setAutoAttach', commandParams: {...base, filter: [{type: 'iframe', exclude: false}]}, ...timeout()}, {deadline: options.deadline});
    } catch (error) {
      if (isDeadlineError(error)) throw error;
      try {
        await this.api.executeCdp({target, method: 'Target.setAutoAttach', commandParams: base, ...timeout()}, {deadline: options.deadline});
      } catch (second) {
        if (isDeadlineError(second)) throw second;
        checkDeadline(options);
      }
    }
  }

  // --- the raw event queue -------------------------------------------------------------------------------------------

  recordRawCdpEvent(tabId, event) {
    const trackedTargetId = event.source.targetId
      ?? (event.source.sessionId == null ? undefined : this.frameSessionsBySessionId.get(event.source.sessionId)?.targetId);
    const record = {
      method: event.method,
      ...(event.params == null ? {} : {params: {...event.params}}),
      sequence: this.nextRawCdpEventSequence(tabId),
      source: event.source,
      ...(trackedTargetId == null ? {} : {trackedTargetId}),
    };
    const events = this.rawCdpEventsByTabId.get(tabId) ?? [];
    events.push(record);
    if (events.length > RAW_EVENT_LIMIT) {
      const last = events.splice(0, events.length - RAW_EVENT_LIMIT).at(-1);
      if (last != null) this.rawCdpEventEvictedThroughSequenceByTabId.set(tabId, last.sequence);
    }
    this.rawCdpEventsByTabId.set(tabId, events);
  }

  rawCdpEventsResult(tabId, after, options) {
    const events = this.rawCdpEventsByTabId.get(tabId) ?? [];
    const truncated = after < (this.rawCdpEventEvictedThroughSequenceByTabId.get(tabId) ?? 0);
    const matching = events.filter(e => e.sequence > after && (options.methods == null || options.methods.includes(e.method))
      && this.matchesRawCdpEventTarget(e, options.target));
    const page = matching.slice(0, options.limit ?? matching.length)
      .map(e => ({method: e.method, ...(e.params == null ? {} : {params: e.params}), sequence: e.sequence, source: e.source}));
    const hasMore = matching.length > page.length;
    const last = page.at(-1);
    return {cursor: hasMore && last != null ? last.sequence : this.rawCdpEventSequenceForTab(tabId), events: page, hasMore, truncated};
  }

  rawCdpEventSequenceForTab(tabId) { return this.rawCdpEventSequenceByTabId.get(tabId) ?? 0; }

  nextRawCdpEventSequence(tabId) {
    const next = this.rawCdpEventSequenceForTab(tabId) + 1;
    this.rawCdpEventSequenceByTabId.set(tabId, next);
    return next;
  }

  rawCdpTarget(tabId, target) {
    if (target?.sessionId != null && target.targetId != null) throw new Error('CDP target must provide either sessionId or targetId, not both.');
    if (target?.sessionId != null) {
      const session = this.frameSessionsBySessionId.get(target.sessionId);
      if (session?.target.tabId !== tabId) throw new Error(`CDP session ${target.sessionId} is not attached to tab ${tabId}.`);
      return session.target;
    }
    if (target?.targetId != null) {
      const session = this.frameSessionsByTabId.get(tabId)?.get(target.targetId);
      if (session == null) throw new Error(`CDP target ${target.targetId} is not attached to tab ${tabId}.`);
      return session.target;
    }
    return {tabId};
  }

  matchesRawCdpEventTarget(event, target) {
    if (target?.sessionId != null) return event.source.sessionId === target.sessionId;
    if (target?.targetId == null) return true;
    return event.source.targetId === target.targetId || event.trackedTargetId === target.targetId;
  }

  discardRawCdpEventsForTab(tabId) {
    const sequence = this.rawCdpEventSequenceForTab(tabId);
    if (sequence > 0) this.rawCdpEventEvictedThroughSequenceByTabId.set(tabId, Math.max(sequence, this.rawCdpEventEvictedThroughSequenceByTabId.get(tabId) ?? 0));
    this.rawCdpEventsByTabId.delete(tabId);
  }

  // --- screencasts ---------------------------------------------------------------------------------------------------

  async withScreencastLock(tabId, work) {
    const previous = this.screencastQueuesByTabId.get(tabId) ?? Promise.resolve();
    let release = () => {};
    const held = new Promise(resolve => { release = resolve; });
    const queued = previous.then(() => held);
    this.screencastQueuesByTabId.set(tabId, queued);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (this.screencastQueuesByTabId.get(tabId) === queued) this.screencastQueuesByTabId.delete(tabId);
    }
  }

  isInternalScreencastEvent(tabId, event) {
    if (!isTopSource(event)) return false;
    const active = this.activeInternalScreencastsByTabId.get(tabId);
    if (event.method === 'Page.screencastVisibilityChanged') return active != null;
    if (event.method !== 'Page.screencastFrame') return false;
    const session = screencastSessionOf(event);
    if (session != null && this.activeRetiredInternalScreencastSessions(tabId).has(session)) return true;
    if (active == null) return false;
    if (session != null) active.sessionIds.add(session);
    return true;
  }

  isCurrentInternalScreencastEvent(tabId, screencast, event) {
    if (this.activeInternalScreencastsByTabId.get(tabId) !== screencast || !isTopSource(event)) return false;
    if (event.method === 'Page.screencastVisibilityChanged') return true;
    if (event.method !== 'Page.screencastFrame') return false;
    const session = screencastSessionOf(event);
    return session != null && screencast.sessionIds.has(session);
  }

  activeRetiredInternalScreencastSessions(tabId) {
    const retired = this.retiredInternalScreencastSessionsByTabId.get(tabId) ?? new Map();
    const now = Date.now();
    for (const [session, {expiresAt}] of retired) if (expiresAt <= now) retired.delete(session);
    if (retired.size === 0) this.retiredInternalScreencastSessionsByTabId.delete(tabId);
    return retired;
  }

  retireInternalScreencast(tabId, screencast) {
    if (screencast.sessionIds.size === 0) return;
    const retired = this.activeRetiredInternalScreencastSessions(tabId);
    const expiresAt = Date.now() + RETIRED_SCREENCAST_MS;
    for (const session of screencast.sessionIds) retired.set(session, {expiresAt});
    while (retired.size > RETIRED_SCREENCAST_LIMIT) {
      const oldest = retired.keys().next().value;
      if (oldest == null) break;
      retired.delete(oldest);
    }
    this.retiredInternalScreencastSessionsByTabId.set(tabId, retired);
  }

  // --- routing -------------------------------------------------------------------------------------------------------

  // The attached tab an event or detach source {tabId?, sessionId?, targetId?} belongs to.
  attachedTabIdForCdpEvent(source) {
    if (typeof source.tabId === 'number') return this.attachedTabIds.has(source.tabId) ? source.tabId : undefined;
    if (source.sessionId != null) return this.frameSessionsBySessionId.get(source.sessionId)?.target.tabId;
    if (source.targetId != null) {
      for (const [tabId, sessions] of this.frameSessionsByTabId) if (sessions.has(source.targetId)) return tabId;
    }
  }

  forgetAttachedTab(tabId, force = false) {
    if (this.initializingTabIds.has(tabId)) {
      this.attachedTabIds.delete(tabId);
      return;
    }
    this.tabAttachmentPromises.delete(tabId);
    if (!this.attachedTabIds.has(tabId) && !force) return;
    this.deleteFileChoosersForTab(tabId);
    // The frame targets attached for the tab stay remembered (the vendor's choice): the host may still hold their
    // debuggees after losing the tab's, and the next detach or close releases them.
    this.deleteFrameSessionsForTab(tabId);
    this.jsDialogsByTabId.delete(tabId);
    this.oopifAutoAttachTabIds.delete(tabId);
    this.discardRawCdpEventsForTab(tabId);
    this.rawScreencastTabIds.delete(tabId);
    this.retiredInternalScreencastSessionsByTabId.delete(tabId);
    this.mainFrameIdsByTabId.delete(tabId);
    this.topLevelSecurityOriginsByTabId.delete(tabId);
    this.topLevelUrlsByTabId.delete(tabId);
    this.attachedTabIds.delete(tabId);
    this.emit('tabDetached', tabId);
  }

  // A frame target the backend detached (the frame went away or its process changed): its session only.
  forgetFrameTarget(tabId, targetId) {
    const session = this.frameSessionsByTabId.get(tabId)?.get(targetId) ?? this.frameSessionsBySessionId.get(`target:${targetId}`);
    if (session != null && session.target.tabId === tabId) this.deleteFrameSession(session);
    this.attachedFrameTargetIdsByTabId.get(tabId)?.delete(targetId);
  }

  handleTargetEvent(event) {
    switch (event.method) {
      case 'Target.attachedToTarget': this.handleAttachedToTarget(event); return;
      case 'Target.detachedFromTarget': this.handleDetachedFromTarget(event); return;
      case 'Page.frameNavigated':
        if (isMainFrameNavigation(event)) {
          const tabId = event.source.tabId;
          const origin = event.params.frame.securityOrigin;
          this.mainFrameIdsByTabId.set(tabId, event.params.frame.id);
          this.topLevelUrlsByTabId.set(tabId, event.params.frame.url);
          if (this.topLevelSecurityOriginsByTabId.get(tabId) !== origin) this.discardRawCdpEventsForTab(tabId);
          this.topLevelSecurityOriginsByTabId.set(tabId, origin);
        }
        this.handleFrameNavigated(event);
        return;
      case 'Page.navigatedWithinDocument':
        if (isMainFrameEvent(event, this.mainFrameIdsByTabId)) this.topLevelUrlsByTabId.set(event.source.tabId, event.params.url);
        return;
      case 'Page.frameDetached': this.handleFrameDetached(event);
    }
  }

  handleAttachedToTarget(event) {
    const tabId = event.source.tabId;
    const info = event.params.targetInfo;
    const sessionId = event.params.sessionId;
    if (typeof tabId !== 'number' || typeof sessionId !== 'string' || !isFrameTarget(info)) return;
    const targetId = targetIdOf(info);
    if (targetId == null) return;
    const known = this.frameSessionsBySessionId.get(sessionId);
    if (known != null) {
      this.setFrameSessionTargetId(tabId, targetId, known);
      return;
    }
    const session = {frameId: null, sessionId, target: {tabId, sessionId}, targetId};
    this.frameSessionsBySessionId.set(sessionId, session);
    this.setFrameSessionTargetId(tabId, targetId, session);
  }

  handleDetachedFromTarget(event) {
    const session = this.frameSessionsBySessionId.get(event.params.sessionId);
    if (session != null) this.deleteFrameSession(session);
  }

  handleFrameNavigated(event) {
    const sessionId = event.source.sessionId;
    const tabId = event.source.tabId;
    const frameId = event.params.frame.id;
    if (typeof tabId !== 'number' || typeof sessionId !== 'string') return;
    const session = this.frameSessionsBySessionId.get(sessionId);
    if (session != null && (session.frameId == null || session.frameId === frameId)) this.setFrameSessionForFrame(tabId, frameId, session);
  }

  handleFrameDetached(event) {
    const tabId = event.source.tabId;
    if (typeof tabId !== 'number') return;
    const session = this.frameSessionsByTabId.get(tabId)?.get(event.params.frameId);
    if (session != null) this.deleteFrameSession(session);
  }

  async initializeAttachedFrameSession(session, options = {}) {
    if (this.initializedFrameSessions.has(session)) return;
    const pending = this.frameSessionInitializationPromises.get(session);
    if (pending != null) {
      try {
        await afterChecking(options, () => pending);
        return;
      } catch {
        checkDeadline(options);
        return await this.initializeAttachedFrameSession(session, options);
      }
    }
    checkDeadline(options);
    const running = this.runAttachedFrameSessionInitialization(session, options)
      .then(() => { this.initializedFrameSessions.add(session); })
      .finally(() => { if (this.frameSessionInitializationPromises.get(session) === running) this.frameSessionInitializationPromises.delete(session); });
    this.frameSessionInitializationPromises.set(session, running);
    await withinDeadline(running, options);
  }

  async tryInitializeAttachedFrameSession(session, options) {
    await this.initializeAttachedFrameSession(session, options).catch(() => {});
    checkDeadline(options ?? {});
  }

  async runAttachedFrameSessionInitialization(session, options = {}) {
    const timeout = () => {
      const ms = dispatchTimeout(options);
      return ms !== undefined ? {timeoutMs: ms} : {};
    };
    const bound = {deadline: options.deadline};
    await this.api.executeCdp({target: session.target, method: 'Page.enable', commandParams: {}, ...timeout()}, bound);
    await this.api.executeCdp({target: session.target, method: 'Runtime.enable', commandParams: {}, ...timeout()}, bound);
    const tree = await this.api.executeCdp({target: session.target, method: 'Page.getFrameTree', commandParams: {}, ...timeout()}, bound);
    if (this.frameSessionsBySessionId.get(session.sessionId) !== session) return;
    this.setFrameSessionForFrame(session.target.tabId, tree.frameTree.frame.id, session);
  }

  setFrameSessionForFrame(tabId, frameId, session) {
    const sessions = this.frameSessionsByTabId.get(tabId) ?? new Map();
    this.frameSessionsByTabId.set(tabId, sessions);
    if (session.frameId != null && session.frameId !== frameId && session.frameId !== session.targetId) sessions.delete(session.frameId);
    session.frameId = frameId;
    sessions.set(frameId, session);
  }

  setFrameSessionTargetId(tabId, targetId, session) {
    const sessions = this.frameSessionsByTabId.get(tabId) ?? new Map();
    this.frameSessionsByTabId.set(tabId, sessions);
    if (session.targetId !== targetId && session.targetId !== session.frameId) sessions.delete(session.targetId);
    session.targetId = targetId;
    sessions.set(targetId, session);
  }

  deleteFrameSession(session) {
    this.frameSessionsBySessionId.delete(session.sessionId);
    if (this.jsDialogsByTabId.get(session.target.tabId)?.target.sessionId === session.sessionId) this.jsDialogsByTabId.delete(session.target.tabId);
    const sessions = this.frameSessionsByTabId.get(session.target.tabId);
    if (session.frameId != null) sessions?.delete(session.frameId);
    sessions?.delete(session.targetId);
  }

  deleteFrameSessionsForTab(tabId) {
    const sessions = this.frameSessionsByTabId.get(tabId);
    if (sessions == null) return;
    for (const session of sessions.values()) this.frameSessionsBySessionId.delete(session.sessionId);
    this.frameSessionsByTabId.delete(tabId);
  }

  rememberAttachedFrameTarget(tabId, targetId) {
    const targets = this.attachedFrameTargetIdsByTabId.get(tabId) ?? new Set();
    this.attachedFrameTargetIdsByTabId.set(tabId, targets);
    targets.add(targetId);
  }

  async detachAttachedFrameTargets(tabId) {
    const targets = this.attachedFrameTargetIdsByTabId.get(tabId);
    if (targets == null) return;
    this.attachedFrameTargetIdsByTabId.delete(tabId);
    if (typeof this.api.detachTarget === 'function') await Promise.allSettled([...targets].map(async targetId => this.api.detachTarget(tabId, targetId)));
  }

  // --- dialog tracking -----------------------------------------------------------------------------------------------

  handleJavaScriptDialogEvent(event) {
    if (event.method === 'Page.javascriptDialogOpening') {
      this.rememberJsDialog(event);
      if (event.params.type === 'beforeunload') this.allowBeforeUnload(event);
      return;
    }
    if (event.method === 'Page.javascriptDialogClosed') this.deleteJsDialogForTarget(event.source);
  }

  rememberJsDialog(event) {
    const tabId = this.attachedTabIdForCdpEvent(event.source);
    if (tabId == null) return;
    const type = event.params.type;
    if (!DIALOG_TYPES.has(type)) return;
    this.jsDialogsByTabId.set(tabId, {
      id: this.nextJsDialogId(), message: event.params.message ?? '', promptText: event.params.defaultPrompt ?? '',
      target: dialogTarget(tabId, event.source), type, url: event.params.url ?? '',
    });
  }

  // A page leaving is never held up by its beforeunload prompt.
  async allowBeforeUnload(event) {
    const tabId = this.attachedTabIdForCdpEvent(event.source);
    if (tabId == null) return;
    await this.callTarget(dialogTarget(tabId, event.source), 'Page.handleJavaScriptDialog', {accept: true}).catch(() => {});
  }

  deleteJsDialogForTarget(source) {
    const tabId = this.attachedTabIdForCdpEvent(source);
    if (tabId == null) return;
    const dialog = this.jsDialogsByTabId.get(tabId);
    if (dialog != null && sameDialogTarget(dialog.target, source)) this.jsDialogsByTabId.delete(tabId);
  }

  throwIfJsDialogBlocksMethod(tabId, method) {
    if (method === 'Page.handleJavaScriptDialog') return;
    const dialog = this.jsDialogsByTabId.get(tabId);
    if (dialog != null) throw serviceError('dialog_open', dialog.type);
  }

  nextJsDialogId() {
    this.jsDialogSequence += 1;
    return String(this.jsDialogSequence);
  }
}
