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
//
// Downloads (Mf): a response is a download when it is an attachment, or of a type Chrome would not show (anything
// but HTML, PDF, images and video), or (while the wait asks for it) a PDF, image or video; never a redirect. A
// download nobody waits for is failed (BlockedByClient). waitForEvent("download") lets the next one through (the
// media download only its own request and the redirects that follow it), marking a shown type as an attachment so
// Chrome saves it, then waits for the host's onDownloadChange notifications: the `started` download whose URL is the
// one let through, then its `complete` (`failed` and `canceled` fail the wait), all within one budget (120 s by
// default and at most). The path a download id answers is the filename Chrome last reported, a full path under
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
import {BrowserServiceError, isDeadlineError} from './errors.mjs';
import {tabIdOf} from './tabs.mjs';

const DOCUMENT_RESPONSES = {requestStage: 'Response', resourceType: 'Document'};                                     // wc
const REQUESTS = {requestStage: 'Request'};                                                                           // SY
// A release keeps the debugger when Chrome is slow to answer: the tab is not given up over one paused response (sa).
const KEEP_DEBUGGER = {preserveOnTimeout: true};

export class DocumentResponses extends Emitter {                                                                      // yf
  constructor(cdp) {
    super();
    this.cdp = cdp;
    cdp.addTabAttachHandler((tabId, options) => {
      if (!this.setupByTab.has(tabId)) return this.ensureInterceptionReady(tabId, options);
    });
    cdp.on('tabDetached', tabId => {
      this.ownedResponsesByTab.delete(tabId);
      this.setupByTab.delete(tabId);
      this.requestInterceptorsByTab.delete(tabId);
      this.configurationByTab.delete(tabId);
      this.configuredRequestsByTab.delete(tabId);
      this.emit('tabDetached', tabId);
    });
    cdp.on('event', event => { this.handleEvent(event).catch(() => {}); });
  }

  cdp;
  ownedResponsesByTab = new Map();               // tabId -> the request ids of its paused responses being released
  setupByTab = new Map();                        // tabId -> the Fetch.enable of its attachment
  requestInterceptorsByTab = new Map();          // tabId -> [{interceptor, priority}], highest priority first
  configurationByTab = new Map();
  configuredRequestsByTab = new Set();           // tabs whose Fetch.enable includes the request stage

  ensureInterceptionReady(tabId, options = {}) {
    const existing = this.setupByTab.get(tabId);
    if (existing != null) return existing;
    const setup = this.cdp.call(tabId, 'Fetch.enable', {patterns: [DOCUMENT_RESPONSES]}, options);
    this.setupByTab.set(tabId, setup);
    setup.catch(() => { if (this.setupByTab.get(tabId) === setup) this.setupByTab.delete(tabId); });
    return setup;
  }

  // `interceptor(params)` sees each paused document request of the tab -> 'handled' | 'block' | anything (continue);
  // -> remove.
  async addRequestInterceptor(tabId, interceptor, priority = 0) {
    await this.ensureInterceptionReady(tabId);
    const interceptors = this.requestInterceptorsByTab.get(tabId) ?? [];
    const entry = {interceptor, priority};
    interceptors.push(entry);
    interceptors.sort((a, b) => b.priority - a.priority);
    this.requestInterceptorsByTab.set(tabId, interceptors);
    try {
      await this.configureRequestInterception(tabId);
    } catch (error) {
      interceptors.splice(interceptors.indexOf(entry), 1);
      if (interceptors.length === 0) this.requestInterceptorsByTab.delete(tabId);
      throw error;
    }
    return async () => {
      const current = this.requestInterceptorsByTab.get(tabId);
      if (current == null) return;
      const i = current.indexOf(entry);
      if (i < 0) return;
      current.splice(i, 1);
      if (current.length === 0) this.requestInterceptorsByTab.delete(tabId);
      await this.configureRequestInterception(tabId);
    };
  }

  // Whether the service is releasing a paused document response of the tab (raw CDP waits for none to be left).
  hasOwnedPausedResponses(tabId) { return (this.ownedResponsesByTab.get(tabId)?.size ?? 0) > 0; }

  hasRequestInterceptors(tabId) { return this.requestInterceptorsByTab.has(tabId); }

  async continueResponse(tabId, requestId, overrides, options = {}) {
    await this.cdp.call(tabId, 'Fetch.continueResponse', {requestId, ...overrides}, {...KEEP_DEBUGGER, ...options});
    this.release(tabId, requestId);
  }

  async failResponse(tabId, requestId) {
    await this.cdp.call(tabId, 'Fetch.failRequest', {requestId, errorReason: 'BlockedByClient'}, KEEP_DEBUGGER);
    this.release(tabId, requestId);
  }

  async handleEvent(event) {
    if (event.method !== 'Fetch.requestPaused') return;
    const tabId = event.source.tabId;
    if (typeof tabId !== 'number' || event.source.sessionId != null || event.source.targetId != null) return;
    const params = event.params;
    if (params.responseStatusCode == null && params.responseErrorReason == null) {
      if (!this.requestInterceptorsByTab.has(tabId) && !this.configuredRequestsByTab.has(tabId)) return;
      await this.handleRequest(tabId, params);
      return;
    }
    if (params.resourceType !== 'Document') return;
    const requestId = params.requestId;
    const owned = this.ownedResponsesByTab.get(tabId) ?? new Set();
    owned.add(requestId);
    this.ownedResponsesByTab.set(tabId, owned);
    if (params.responseErrorReason != null) {
      await this.cdp.call(tabId, 'Fetch.continueRequest', {requestId}, KEEP_DEBUGGER);
      this.release(tabId, requestId);
      return;
    }
    let claimed = false;
    this.emit('intercept', tabId, params, () => { claimed = true; });
    if (claimed) return;
    await this.continueResponse(tabId, requestId);
  }

  // Fetch.enable with or without the request stage, as the tab's interceptors need; one reconfiguration at a time.
  configureRequestInterception(tabId) {
    const configured = (this.configurationByTab.get(tabId) ?? Promise.resolve()).catch(() => {}).then(async () => {
      if (!this.cdp.isTabAttached(tabId)) return;
      const wanted = this.requestInterceptorsByTab.has(tabId);
      if (this.configuredRequestsByTab.has(tabId) === wanted) return;
      await this.cdp.call(tabId, 'Fetch.enable', {patterns: wanted ? [REQUESTS, DOCUMENT_RESPONSES] : [DOCUMENT_RESPONSES]}, KEEP_DEBUGGER);
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
        await this.cdp.call(tabId, 'Fetch.failRequest', {requestId: params.requestId, errorReason: 'BlockedByClient'}, KEEP_DEBUGGER);
        return;
      }
    }
    await this.cdp.call(tabId, 'Fetch.continueRequest', {requestId: params.requestId}, KEEP_DEBUGGER);
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
  // let through as a download -> release.
  async enableMediaDownload(tabId, url, frameId) {
    const target = new URL(url);
    target.hash = '';
    const requestIds = new Set();
    const removeInterceptor = await this.documentResponses.addRequestInterceptor(tabId, params => {
      if (params.resourceType !== 'Document' || params.frameId !== frameId) return;
      if ((requestIds.size === 0 && params.request.url === target.href) || (params.redirectedRequestId != null && requestIds.has(params.redirectedRequestId))) {
        requestIds.add(params.requestId);
      }
    });
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

  waitForCompletedDownload(tabId) {
    let id = null;
    let cancel = () => {};
    const promise = new Promise((resolve, reject) => {
      const onChange = change => {
        if (id == null) {
          if (change.status === 'started' && change.url === this.allowedDownloadUrlsByTabId.get(tabId)) id = change.id;
          return;
        }
        if (change.id !== id || change.status === 'started' || change.status === 'in_progress') return;
        cancel();
        if (change.status === 'complete') resolve(change);
        else if (change.status === 'failed') reject(new Error(`Download ${change.id} failed.`));
        else if (change.status === 'canceled') reject(new Error(`Download ${change.id} was canceled.`));
      };
      cancel = () => { this.removeListener('change', onChange); };
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
