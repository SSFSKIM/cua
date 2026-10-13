// Ported from readable chatgpt-26.928.40906 BS:48977-49183 (ra, navigate_tab_url); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: hO, gO and bO (BS:47079-47137, back, forward and reload); EO, mJ, AO, fJ, PO, hJ, kO, eo and bJ
// (BS:49220-49300, the navigation's events and the URL shown in errors).
//
// The four navigation commands. A navigation is armed before it is sent: the wait accepts the main frame committing a
// document other than the one it left (or the URL asked for, or a same-document move), then its DOMContentLoaded or
// load event. Every CDP call of the command shares one Deadline of timeout_ms (10 s by default), so the host's own
// timeouts never outlast the command. The history commands wait, as the vendor's do, for a load that starts within
// 250 ms (cdp.mjs waitForPageLoadEvent). Dropped from ra: site status and the URL policy's authorization and the
// history restoration after a blocked navigation (no site policy), the extension's Page.navigationBlocked, the
// download interception of document responses (M2's downloads.mjs registers its own) and the credential observation
// gate. The URL itself is checked as the vendor's Cz checks it (errors.mjs checkNavigationUrl).
import {Deadline, LOAD_MS} from './budgets.mjs';
import {checkNavigationUrl} from './errors.mjs';

const normalizedUrl = url => {                                                                                       // eo
  if (typeof url !== 'string') return undefined;
  try { return new URL(url).href; } catch { return url; }
};

// The URL an error may show: http(s) only, without credentials, query or fragment (bJ).
function shownUrl(url) {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.username = ''; u.password = ''; u.search = ''; u.hash = '';
    const text = u.toString();
    return u.pathname === '/' ? text.slice(0, -1) : text;
  } catch {
    return null;
  }
}

const isObject = value => typeof value === 'object' && value != null;                                                // df
const isLoadEvent = event => event.method === 'Page.domContentEventFired' || event.method === 'Page.loadEventFired';  // kO
const isPageSource = event => event.source.sessionId == null;                                                        // hn

function isMainFrameCommit(event, mainFrameId) {                                                                     // PO
  if (event.method !== 'Page.frameNavigated' || !isObject(event.params) || !isObject(event.params.frame)) return false;
  return mainFrameId != null ? event.params.frame.id === mainFrameId : !('parentId' in event.params.frame);
}

function leftOrReached(url, previousUrl, targetUrl) {                                                                // AO
  if (url == null) return false;
  if ((targetUrl != null && url === targetUrl) || (previousUrl != null && url !== previousUrl)) return true;
  return previousUrl == null && targetUrl == null;
}

// The wait's predicate (mJ): a same-document move to a new URL at once; else a main-frame commit away from the old
// document (or the main frame starting to load), then its load event.
function navigationSettled({mainFrameId, previousUrl, targetUrl}) {
  let committed = false;
  return event => {
    if (event.method === 'Page.navigatedWithinDocument') return leftOrReached(normalizedUrl(event.params?.url), previousUrl, targetUrl);
    if (isMainFrameCommit(event, mainFrameId) && leftOrReached(normalizedUrl(event.params.frame.url), previousUrl, targetUrl)) committed = true;
    if (event.method === 'Page.frameStartedLoading' && mainFrameId != null && isObject(event.params) && event.params.frameId === mainFrameId) committed = true;
    return committed && isLoadEvent(event);
  };
}

async function mainFrame(tabId, session, deadline) {                                                                 // EO
  try {
    return (await session.cdp.call(tabId, 'Page.getFrameTree', undefined, {deadline})).frameTree?.frame;
  } catch {
    return undefined;
  }
}

const timeoutOf = params => (typeof params.timeout_ms === 'number' ? params.timeout_ms : LOAD_MS);

function positiveTab(params, type) {
  const tabId = Number(params.tab_id);
  if (!Number.isInteger(tabId) || tabId <= 0) throw new Error(`${type} requires a positive integer tab_id`);
  return tabId;
}

async function navigateUrl(params, session) {
  const tabId = Number(params.tab_id);
  const url = params.url;
  checkNavigationUrl(url);
  const timeoutMs = timeoutOf(params);
  const deadline = new Deadline(timeoutMs);
  const abort = new AbortController();
  const sessionId = session.getCurrentSessionId();
  const state = await session.cdp.readDocumentState(tabId, {deadline});
  const previousUrl = normalizedUrl(state?.href);
  const targetUrl = normalizedUrl(url);
  await session.cdp.call(tabId, 'Page.enable', {}, {deadline});
  const frame = await mainFrame(tabId, session, deadline);
  const settled = navigationSettled({mainFrameId: frame?.id, previousUrl, targetUrl});
  // What the page did before the navigation was sent: it must not have navigated on its own meanwhile.
  let current = frame;
  let started = null;
  let detached = false;
  const onEvent = event => {
    if (event.source.tabId !== tabId || event.source.sessionId != null || event.source.targetId != null) return;
    if (event.method === 'Page.frameStartedNavigating' && event.params?.frameId === frame?.id) started = event.params;
    if (event.method === 'Page.frameNavigated' && event.params?.frame?.parentId == null) current = event.params.frame;
  };
  const onDetached = id => { if (id === tabId) detached = true; };
  session.cdp.on('event', onEvent);
  session.cdp.on('tabDetached', onDetached);
  const waited = session.cdp.waitForEvent(tabId, event => isPageSource(event) && settled(event), {
    timeoutMs: Math.max(1, deadline.remaining()),
    timeoutMessage: `Timed out waiting for tab ${tabId} to navigate to ${url}.`,
    signal: abort.signal,
  }).then(event => ({event}), error => (abort.signal.aborted ? {event: undefined} : {error}));
  try {
    const result = await session.cdp.call(tabId, 'Page.navigate', {url}, {
      deadline,
      beforeDispatch: () => {
        if (abort.signal.aborted || detached || session.getCurrentSessionId() !== sessionId) throw new Error('The browser session changed before navigation started.');
        if (current !== frame || started != null) throw new Error('The tab changed before navigation started.');
      },
    });
    if (result.errorText) {
      const shown = shownUrl(url) ?? 'this page';
      throw new Error(`Browser Use cannot open ${shown} in tab ${tabId}. Browser reported: ${result.errorText.replaceAll(url, shown)}`);
    }
    const outcome = await waited;
    if ('error' in outcome) throw outcome.error;
    return {};
  } finally {
    abort.abort();
    session.cdp.removeListener('event', onEvent);
    session.cdp.removeListener('tabDetached', onDetached);
  }
}

// Back or forward: the history entry next to the current one, then its load (hO, gO).
async function moveInHistory(params, session, type, step) {
  const tabId = positiveTab(params, type);
  const deadline = new Deadline(timeoutOf(params));
  const history = await session.cdp.call(tabId, 'Page.getNavigationHistory', undefined, {deadline});
  const entry = history.entries[history.currentIndex + step];
  if (!entry) throw new Error(step < 0 ? 'Cannot navigate back: no previous page in history.' : 'Cannot navigate forward: no next page in history.');
  const loaded = session.cdp.waitForPageLoadEvent(tabId, {timeoutMs: Math.max(1, deadline.remaining())});
  await session.cdp.call(tabId, 'Page.navigateToHistoryEntry', {entryId: entry.id}, {deadline});
  await loaded;
  return {};
}

export const NAVIGATION_HANDLERS = {
  navigate_tab_url: navigateUrl,
  navigate_tab_back: (params, session) => moveInHistory(params, session, 'navigate_tab_back', -1),
  navigate_tab_forward: (params, session) => moveInHistory(params, session, 'navigate_tab_forward', 1),
  async navigate_tab_reload(params, session) {
    const tabId = positiveTab(params, 'navigate_tab_reload');
    const deadline = new Deadline(timeoutOf(params));
    const loaded = session.cdp.waitForPageLoadEvent(tabId, {timeoutMs: Math.max(1, deadline.remaining())});
    await session.cdp.call(tabId, 'Page.reload', {}, {deadline});
    await loaded;
    return {};
  },
};
