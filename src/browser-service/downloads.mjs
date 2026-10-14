// Ported from readable chatgpt-26.928.40906 BS:60883-61180 (class Mf, the downloads, with gM, bM, LZ, u_, FZ, d_, UZ and qZ); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: class yf, the document responses (BS:53611-53860, with wc, sa and SY); YO, playwright_wait_for_download
// (BS:50015-50031); LO, playwright_download_path (BS:49544-49552).
//
// Downloads, the vendor's way, over two parts.
//
// DocumentResponses (yf): every tab the controller attaches has its document responses paused (Fetch.enable at the
// response stage, set up by an attach handler on the attachment's budget), and the service releases each one: a failed
// response's request is continued, a response the downloads claim is theirs, every other is continued unchanged.
// While a request interceptor is installed (the media download) document requests are paused too and shown to it.
// Changed (M2 task 1 review): a release the service makes on its own is sent again when Chrome refuses it, and when it
// cannot land the tab's paused requests are let go (Fetch disabled and set up again, or the tab detached), where the
// vendor forgets a failed release and leaves the navigation paused; a request paused after its interceptor left is
// released too; the media download's setup carries the command's deadline.
//
// Downloads (Mf): a response is a download when it is an attachment, or of a type Chrome would not show (anything
// but HTML, PDF, images and video), or (while the wait asks for it) a PDF, image or video; never a redirect. A
// download nobody waits for is failed (BlockedByClient). waitForEvent("download") lets the next one through (the
// media download only its own request and the redirects that follow it), marking a shown type as an attachment so
// Chrome saves it, then waits for the host's onDownloadChange notifications: the `started` download whose URL is the
// one let through and no other wait has taken (the earliest listening wait owns it: a fix of the vendor's shared
// matcher, under which two tabs downloading one URL both got the first download), then its `complete` (`failed` and
// `canceled` fail the wait), all within one budget (120 s by default and at most). The path a download id answers is the filename Chrome last reported, a full path under
// Chrome's own download directory (the host's). One download at a time per tab.
//
// The vendor's wait suspends its timer only across its download approval (ensureDownloadAllowed, an elicitation the
// person answers); cua has no approval prompts (owner's ruling), so its wait runs on one budget. A Chrome dialog the
// person must pass (Chrome's "Ask where to save") holds the download in progress, which the wait sits through within
// its budget, as the vendor's does. Nothing here logs: no file's contents, no URL, no path.
//
// Dropped from yf: the `response` and `requestResolution` events (site instructions and credential protection, both
// dropped), so a released response is never rewritten. Dropped from Mf: the download policy and approval
// (ensureDownloadAllowed, ensureDownloadSourcePolicyAllowed) and allowDownload, which the vendor asks only of in-app
// and CDP backends (cua's backends are extensions).
import {DOWNLOAD_MS, Deadline, clamp} from './budgets.mjs';
import {Emitter} from './cdp.mjs';
import {BrowserServiceError, DEADLINE_EXCEEDED, isDeadlineError} from './errors.mjs';
import {tabIdOf} from './tabs.mjs';

const DOCUMENT_RESPONSES = {requestStage: 'Response', resourceType: 'Document'};                                     // wc
const REQUESTS = {requestStage: 'Request'};                                                                           // SY
// A release keeps the debugger when Chrome is slow to answer: the tab is not given up over one paused response (sa).
const KEEP_DEBUGGER = {preserveOnTimeout: true};
// A paused request the service releases on its own is given RELEASE_MS for at most RELEASE_ATTEMPTS answers; when
// none lands, the tab's Fetch domain is disabled (Chrome then lets every paused request go on, measured with a headless
// Chromium probe, M2 task 1 review) and set up again, each on RECOVERY_MS; when even that fails the tab is detached,
// which releases them with the debugger. A paused navigation is never left behind, except while a JavaScript dialog
// blocks the tab's commands (the vendor's gap, recorded).
const RELEASE_MS = 3000, RELEASE_ATTEMPTS = 3, RECOVERY_MS = 3000, CLEANUP_MS = 3000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const messageOf = error => (error instanceof Error ? error.message : String(error ?? ''));
// Chrome no longer holds the request: it went on, was cancelled, or the Fetch domain or the debugger is gone.
const isAlreadyReleased = error => (error instanceof BrowserServiceError && error.code === 'tab_detached')
  || /Invalid InterceptionId|Fetch domain is not enabled/.test(messageOf(error));
const isDialogBlocked = error => error instanceof BrowserServiceError && error.code === 'dialog_open';
const bounded = (work, deadline) => (deadline == null ? work : deadline.race(work));

export class DocumentResponses extends Emitter {                                                                      // yf
  // `releaseMs` and `recoveryMs` only for tests.
  constructor(cdp, {releaseMs = RELEASE_MS, recoveryMs = RECOVERY_MS} = {}) {
    super();
    this.cdp = cdp;
    this.releaseMs = releaseMs;
    this.recoveryMs = recoveryMs;
    cdp.addTabAttachHandler((tabId, options) => {
      if (!this.setupByTab.has(tabId)) return this.ensureInterceptionReady(tabId, options);
    });
    cdp.on('tabDetached', tabId => {
      this.forgetTab(tabId);
      this.requestInterceptorsByTab.delete(tabId);
      this.configurationByTab.delete(tabId);
      this.emit('tabDetached', tabId);
    });
    cdp.on('event', event => { this.handleEvent(event).catch(() => {}); });
  }

  cdp;
  releaseMs;
  recoveryMs;
  ownedResponsesByTab = new Map();               // tabId -> the request ids of its paused responses being released
  setupByTab = new Map();                        // tabId -> the Fetch.enable of its attachment
  requestInterceptorsByTab = new Map();          // tabId -> [{interceptor, priority}], highest priority first
  configurationByTab = new Map();
  configuredRequestsByTab = new Set();           // tabs whose Fetch.enable includes the request stage
  recoveriesByTab = new Map();                   // tabId -> the recovery under way

  ensureInterceptionReady(tabId, options = {}) {
    const existing = this.setupByTab.get(tabId);
    if (existing != null) return existing;
    const setup = this.cdp.call(tabId, 'Fetch.enable', {patterns: [DOCUMENT_RESPONSES]}, options);
    this.setupByTab.set(tabId, setup);
    setup.catch(() => { if (this.setupByTab.get(tabId) === setup) this.setupByTab.delete(tabId); });
    return setup;
  }

  // `interceptor(params)` sees each paused document request of the tab -> 'handled' | 'block' | anything (continue);
  // -> remove. Setting up is bounded by `deadline` (the caller's command); removing has a budget of its own.
  async addRequestInterceptor(tabId, interceptor, priority = 0, {deadline} = {}) {
    const options = deadline == null ? {} : {deadline};
    await bounded(this.ensureInterceptionReady(tabId, options), deadline);
    const interceptors = this.requestInterceptorsByTab.get(tabId) ?? [];
    const entry = {interceptor, priority};
    interceptors.push(entry);
    interceptors.sort((a, b) => b.priority - a.priority);
    this.requestInterceptorsByTab.set(tabId, interceptors);
    const remove = async () => {
      const current = this.requestInterceptorsByTab.get(tabId);
      if (current == null) return;
      const i = current.indexOf(entry);
      if (i < 0) return;
      current.splice(i, 1);
      if (current.length === 0) this.requestInterceptorsByTab.delete(tabId);
      await this.configureRequestInterception(tabId, {deadline: new Deadline(CLEANUP_MS)});
    };
    try {
      await bounded(this.configureRequestInterception(tabId, options), deadline);
    } catch (error) {
      await remove().catch(() => {});
      throw error;
    }
    return remove;
  }

  // Whether the service is releasing a paused document response of the tab (raw CDP waits for none to be left).
  hasOwnedPausedResponses(tabId) { return (this.ownedResponsesByTab.get(tabId)?.size ?? 0) > 0; }

  hasRequestInterceptors(tabId) { return this.requestInterceptorsByTab.has(tabId); }

  // With a `deadline` (a download wait's), the release is the caller's: its failure is thrown and the response stays
  // owned for the caller's own cleanup (failResponse). Without one it is the service's, recovered if it cannot land.
  async continueResponse(tabId, requestId, overrides, {deadline} = {}) {
    await this.releasePaused(tabId, requestId, 'Fetch.continueResponse', {requestId, ...overrides}, deadline);
  }

  async failResponse(tabId, requestId) {
    await this.releasePaused(tabId, requestId, 'Fetch.failRequest', {requestId, errorReason: 'BlockedByClient'});
  }

  // Sends one release of a paused request, again on failure, until it lands or Chrome no longer holds the request; a
  // caller's deadline ends the attempts with their failure, the service's own budget with a recovery.
  async releasePaused(tabId, requestId, method, params, deadline) {
    const budget = deadline ?? new Deadline(this.releaseMs);
    let failure;
    for (let attempt = 1; attempt <= RELEASE_ATTEMPTS && !budget.expired(); attempt += 1) {
      try {
        await this.cdp.call(tabId, method, params, {...KEEP_DEBUGGER, deadline: budget});
        this.release(tabId, requestId);
        return;
      } catch (error) {
        if (isAlreadyReleased(error)) {
          this.release(tabId, requestId);
          return;
        }
        if (isDialogBlocked(error)) throw error;
        failure = error;
      }
      if (attempt < RELEASE_ATTEMPTS) await sleep(Math.min(50, budget.remaining()));
    }
    if (deadline != null) throw failure ?? new BrowserServiceError('timeout', DEADLINE_EXCEEDED);
    await this.recover(tabId);
  }

  // Every paused request of the tab let go: its Fetch domain disabled and set up again, or else the tab detached.
  recover(tabId) {
    let recovery = this.recoveriesByTab.get(tabId);
    if (recovery == null) {
      recovery = (async () => {
        try {
          await this.cdp.call(tabId, 'Fetch.disable', {}, {...KEEP_DEBUGGER, deadline: new Deadline(this.recoveryMs)});
        } catch (error) {
          if (isDialogBlocked(error)) return;
          await this.cdp.detach(tabId).catch(() => {});
          return;
        }
        const interceptors = this.requestInterceptorsByTab.has(tabId);
        this.forgetTab(tabId);
        this.emit('released', tabId);
        const deadline = new Deadline(this.recoveryMs);
        await this.ensureInterceptionReady(tabId, {deadline}).catch(() => {});
        if (interceptors) await this.configureRequestInterception(tabId, {deadline}).catch(() => {});
      })().finally(() => { this.recoveriesByTab.delete(tabId); });
      this.recoveriesByTab.set(tabId, recovery);
    }
    return recovery;
  }

  forgetTab(tabId) {
    this.ownedResponsesByTab.delete(tabId);
    this.setupByTab.delete(tabId);
    this.configuredRequestsByTab.delete(tabId);
  }

  async handleEvent(event) {
    if (event.method !== 'Fetch.requestPaused') return;
    const tabId = event.source.tabId;
    if (typeof tabId !== 'number' || event.source.sessionId != null || event.source.targetId != null) return;
    const params = event.params;
    // A paused request (only the service turns the request stage on) is always released, also when the interceptor
    // that asked for the stage is already gone (the vendor leaves it paused then).
    if (params.responseStatusCode == null && params.responseErrorReason == null) {
      await this.handleRequest(tabId, params);
      return;
    }
    if (params.resourceType !== 'Document') return;
    const requestId = params.requestId;
    const owned = this.ownedResponsesByTab.get(tabId) ?? new Set();
    owned.add(requestId);
    this.ownedResponsesByTab.set(tabId, owned);
    if (params.responseErrorReason != null) {
      await this.releasePaused(tabId, requestId, 'Fetch.continueRequest', {requestId});
      return;
    }
    let claimed = false;
    this.emit('intercept', tabId, params, () => { claimed = true; });
    if (claimed) return;
    await this.continueResponse(tabId, requestId);
  }

  // Fetch.enable with or without the request stage, as the tab's interceptors need; one reconfiguration at a time,
  // each on the budget of the call that asked for it.
  configureRequestInterception(tabId, options = {}) {
    const configured = (this.configurationByTab.get(tabId) ?? Promise.resolve()).catch(() => {}).then(async () => {
      if (!this.cdp.isTabAttached(tabId)) return;
      const wanted = this.requestInterceptorsByTab.has(tabId);
      if (this.configuredRequestsByTab.has(tabId) === wanted) return;
      await this.cdp.call(tabId, 'Fetch.enable', {patterns: wanted ? [REQUESTS, DOCUMENT_RESPONSES] : [DOCUMENT_RESPONSES]}, {...KEEP_DEBUGGER, ...options});
      if (wanted) this.configuredRequestsByTab.add(tabId); else this.configuredRequestsByTab.delete(tabId);
    });
    this.configurationByTab.set(tabId, configured);
    configured.finally(() => { if (this.configurationByTab.get(tabId) === configured) this.configurationByTab.delete(tabId); }).catch(() => {});
    return configured;
  }

  async handleRequest(tabId, params) {
    for (const {interceptor} of [...(this.requestInterceptorsByTab.get(tabId) ?? [])]) {
      let decision;
      try {
        decision = await interceptor(params);
      } catch {
        decision = 'block';
      }
      if (decision === 'handled') return;
      if (decision === 'block') {
        await this.releasePaused(tabId, params.requestId, 'Fetch.failRequest', {requestId: params.requestId, errorReason: 'BlockedByClient'});
        return;
      }
    }
    await this.releasePaused(tabId, params.requestId, 'Fetch.continueRequest', {requestId: params.requestId});
  }

  release(tabId, requestId) {
    const owned = this.ownedResponsesByTab.get(tabId);
    if (owned == null) return;
    owned.delete(requestId);
    if (owned.size === 0) this.ownedResponsesByTab.delete(tabId);
  }
}

// --- what a response is (gM, bM, u_, FZ, d_, UZ, qZ, LZ) ----------------------------------------------------------------

const headerOf = (headers, name) => headers?.find(h => h.name.toLowerCase() === name)?.value;                          // u_
const isAttachment = headers => /^attachment(?:\s*;|\s*$)/i.test(headerOf(headers, 'content-disposition') ?? '');      // gM
const mimeTypeOf = headers => headerOf(headers, 'content-type')?.split(';', 1)[0]?.trim().toLowerCase();               // bM
const isMedia = type => type === 'application/pdf' || type?.startsWith('image/') === true || type?.startsWith('video/') === true;  // d_
const isShown = type => type === 'text/html' || isMedia(type);                                                         // FZ
const isRedirectStatus = status => status === 301 || status === 302 || status === 303 || status === 307 || status === 308;  // qZ
const isRedirect = params => isRedirectStatus(params.responseStatusCode) && headerOf(params.responseHeaders, 'location') != null;  // UZ

// The response a let-through shown type is released with, so Chrome saves it: its headers with the disposition made
// `attachment` (LZ); none for a response that is already a download.
function attachmentOverrides(params) {
  if (params.responseStatusCode == null || params.responseHeaders == null || isAttachment(params.responseHeaders) || !isMedia(mimeTypeOf(params.responseHeaders))) return undefined;
  const hasDisposition = params.responseHeaders.some(h => h.name.toLowerCase() === 'content-disposition');
  return {
    responseCode: params.responseStatusCode,
    ...(params.responseStatusText ? {responsePhrase: params.responseStatusText} : {}),
    responseHeaders: hasDisposition
      ? params.responseHeaders.map(h => (h.name.toLowerCase() === 'content-disposition' ? {...h, value: h.value.replace(/^[^;]*/u, 'attachment')} : h))
      : [...params.responseHeaders, {name: 'Content-Disposition', value: 'attachment'}],
  };
}

const NO_LONGER_PAUSED = 'The paused download response is no longer available.';

export class Downloads extends Emitter {                                                                              // Mf
  // `api` the backend's BackendApi (onDownloadChange), `documentResponses` the session's DocumentResponses.
  constructor(api, documentResponses) {
    super();
    this.api = api;
    this.documentResponses = documentResponses;
    api.addEventListener('onDownloadChange', change => {
      if (change.session_id == null || api.matchesCurrentSessionId(change.session_id)) {
        this.filenamesById.set(change.id, change.filename);
        this.emit('change', change);
      }
    });
    documentResponses.on('tabDetached', tabId => {
      this.downloadIntents.delete(tabId);
      this.allowedDownloadUrlsByTabId.delete(tabId);
      this.pendingDownloadRequestsByTabId.delete(tabId);
    });
    // A recovery let every paused response of the tab go on, a paused download's with them.
    documentResponses.on('released', tabId => { this.pendingDownloadRequestsByTabId.delete(tabId); });
    documentResponses.on('intercept', (tabId, params, claim) => {
      const intent = this.downloadIntents.get(tabId);
      const requested = intent?.type === 'next' || (intent?.type === 'request' && intent.requestIds.has(params.requestId));
      if (this.isDownload(params, requested)) {
        claim();
        this.handleDownloadResponse(tabId, params, requested).catch(() => {});
      }
    });
  }

  api;
  documentResponses;
  filenamesById = new Map();                     // download id -> the filename Chrome last reported
  activeDownloadTabs = new Set();
  downloadIntents = new Map();                   // tabId -> {type: 'next'} | {type: 'request', requestIds}
  allowedDownloadUrlsByTabId = new Map();        // tabId -> the URL of the download let through
  pendingDownloadRequestsByTabId = new Map();    // tabId -> {requestId, responseOverrides, url}: a paused download
  claimedDownloadIds = new Set();                // the downloads a wait has taken as its own

  async withDownload(tabId, work) {
    if (this.activeDownloadTabs.has(tabId)) throw new Error('A download is already in progress in this tab. Wait for it to finish before starting another.');
    this.activeDownloadTabs.add(tabId);
    try {
      return await work();
    } finally {
      this.activeDownloadTabs.delete(tabId);
    }
  }

  // The next download of the tab is let through.
  async enableDownload(tabId) {
    this.allowedDownloadUrlsByTabId.delete(tabId);
    this.downloadIntents.set(tabId, {type: 'next'});
  }

  // Only the document request for `url` (its fragment aside) in frame `frameId`, and the redirects that follow it, is
  // let through as a download -> release. Setting up is bounded by the command's `deadline`.
  async enableMediaDownload(tabId, url, frameId, {deadline} = {}) {
    const target = new URL(url);
    target.hash = '';
    const requestIds = new Set();
    const removeInterceptor = await this.documentResponses.addRequestInterceptor(tabId, params => {
      if (params.resourceType !== 'Document' || params.frameId !== frameId) return;
      if ((requestIds.size === 0 && params.request.url === target.href) || (params.redirectedRequestId != null && requestIds.has(params.redirectedRequestId))) {
        requestIds.add(params.requestId);
      }
    }, 0, {deadline});
    this.allowedDownloadUrlsByTabId.delete(tabId);
    this.downloadIntents.set(tabId, {type: 'request', requestIds});
    return async () => {
      try {
        await this.disableDownload(tabId);
      } finally {
        await removeInterceptor();
      }
    };
  }

  async disableDownload(tabId) {
    this.downloadIntents.delete(tabId);
    this.allowedDownloadUrlsByTabId.delete(tabId);
    await this.failPendingDownloadRequest(tabId);
  }

  // The download let through, once complete: its last onDownloadChange {id, filename, url, status}.
  async waitForDownload(tabId, timeoutMs) {
    const deadline = new Deadline(timeoutMs);
    const timedOut = () => new BrowserServiceError('timeout', `Timed out after ${timeoutMs}ms waiting for download.`);
    const {promise: expired, reject} = Promise.withResolvers();
    expired.catch(() => {});
    const timer = setTimeout(() => reject(timedOut()), timeoutMs);
    const request = this.waitForDownloadRequest(tabId);
    let completed;
    try {
      const paused = await Promise.race([request.promise, expired]);
      if (deadline.expired()) throw timedOut();
      if (this.pendingDownloadRequestsByTabId.get(tabId)?.requestId !== paused.requestId) throw new Error(NO_LONGER_PAUSED);
      this.allowedDownloadUrlsByTabId.set(tabId, paused.url);
      completed = this.waitForCompletedDownload(tabId);
      completed.promise.catch(() => {});
      await Promise.race([this.documentResponses.continueResponse(tabId, paused.requestId, paused.responseOverrides, {deadline}), expired]);
      if (this.pendingDownloadRequestsByTabId.get(tabId)?.requestId !== paused.requestId) throw new Error(NO_LONGER_PAUSED);
      this.pendingDownloadRequestsByTabId.delete(tabId);
      return await Promise.race([completed.promise, expired]);
    } catch (error) {
      // The release's own deadline running out is the wait's timeout, in the wait's words.
      if (deadline.expired() && isDeadlineError(error)) throw timedOut();
      throw error;
    } finally {
      clearTimeout(timer);
      request.cancel();
      completed?.cancel();
      await this.disableDownload(tabId);
    }
  }

  waitForDownloadRequest(tabId) {
    const pending = this.pendingDownloadRequestsByTabId.get(tabId);
    if (pending != null) return {cancel: () => {}, promise: Promise.resolve(pending)};
    let cancel = () => {};
    const promise = new Promise(resolve => {
      const onRequest = (requestTab, paused) => {
        if (requestTab !== tabId) return;
        cancel();
        resolve(paused);
      };
      cancel = () => { this.removeListener('request', onRequest); };
      this.addListener('request', onRequest);
    });
    return {cancel, promise};
  }

  // The download let through, by the first `started` notification of its URL no other wait has taken: notifications
  // reach the waits in the order they began listening, and each is owned by the first that matches it, so two tabs
  // downloading one URL never receive the same download (the vendor's waits would both take the first).
  waitForCompletedDownload(tabId) {
    let id = null;
    let cancel = () => {};
    const promise = new Promise((resolve, reject) => {
      const onChange = change => {
        if (id == null) {
          if (change.status === 'started' && change.url === this.allowedDownloadUrlsByTabId.get(tabId) && !this.claimedDownloadIds.has(change.id)) {
            id = change.id;
            this.claimedDownloadIds.add(id);
          }
          return;
        }
        if (change.id !== id || change.status === 'started' || change.status === 'in_progress') return;
        cancel();
        if (change.status === 'complete') resolve(change);
        else if (change.status === 'failed') reject(new Error(`Download ${change.id} failed.`));
        else if (change.status === 'canceled') reject(new Error(`Download ${change.id} was canceled.`));
      };
      // Chrome reports a download's start once, so its claim is dropped with the wait.
      cancel = () => {
        this.removeListener('change', onChange);
        if (id != null) this.claimedDownloadIds.delete(id);
      };
      this.addListener('change', onChange);
    });
    return {cancel, promise};
  }

  getPath(downloadId) { return this.filenamesById.get(downloadId) ?? null; }

  isDownload(params, requested = false) {
    const type = mimeTypeOf(params.responseHeaders);
    return params.resourceType === 'Document' && !isRedirect(params)
      && (isAttachment(params.responseHeaders) || (requested && isMedia(type)) || !isShown(type));
  }

  async handleDownloadResponse(tabId, params, requested) {
    if (!requested) {
      await this.documentResponses.failResponse(tabId, params.requestId);
      return;
    }
    const paused = {requestId: params.requestId, responseOverrides: attachmentOverrides(params), url: params.request.url};
    this.pendingDownloadRequestsByTabId.set(tabId, paused);
    this.downloadIntents.delete(tabId);
    this.emit('request', tabId, paused);
  }

  async failPendingDownloadRequest(tabId) {
    const pending = this.pendingDownloadRequestsByTabId.get(tabId);
    if (pending == null) return;
    await this.documentResponses.failResponse(tabId, pending.requestId);
    if (this.pendingDownloadRequestsByTabId.get(tabId)?.requestId === pending.requestId) this.pendingDownloadRequestsByTabId.delete(tabId);
  }
}

export const DOWNLOAD_HANDLERS = {
  async playwright_wait_for_download(params, session) {                                                              // YO
    const tabId = tabIdOf(params.tab_id);
    return await session.downloads.withDownload(tabId, async () => {
      const timeoutMs = clamp(params.timeout_ms ?? DOWNLOAD_MS, DOWNLOAD_MS);
      await session.downloads.enableDownload(tabId);
      try {
        return {download_id: (await session.downloads.waitForDownload(tabId, timeoutMs)).id};
      } finally {
        await session.downloads.disableDownload(tabId);
      }
    });
  },

  async playwright_download_path(params, session) {                                                                  // LO
    tabIdOf(params.tab_id);
    if (typeof params.download_id !== 'string' || params.download_id.length === 0) throw new Error('playwright_download_path requires a download_id');
    return {path: session.downloads.getPath(params.download_id)};
  },
};
