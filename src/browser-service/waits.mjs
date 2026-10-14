// Ported from readable chatgpt-26.928.40906 BS:50194-50349 (r1, n1 and s1, the page waits; Dv, DJ and BJ, a load state; o1, OJ, i1, MJ, gc and Bv, a URL's wait); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: t1 (BS:50098-50193, networkidle) and hn (BS:48875).
//
// The three page waits of tab.playwright. A load state is the document's readyState when it already holds, else the
// DOMContentLoaded or load event that follows; networkidle is Chrome's networkIdle lifecycle event for the main frame's
// current document. A URL is a glob ('**' any characters, '*' any but a slash, anchored at both ends) matched against
// the document's URL, else against the main frame's next commit or same-document navigation; `wait_until` then waits
// for that load state. waitForTimeout sleeps, uncapped, as the vendor's does.
//
// Budgets as the vendor's phases: the URL's wait and the load state after it each get `timeout_ms`, clamped (3 s by
// default, at most 120 s); every CDP call carries its phase's Deadline. An explicit zero is one attempt, its calls
// bounded by 3 s (the M1b ruling): the document is checked once. Dropped: the extension's Page.navigationBlocked
// events (fn, gn), which cua's host never sends, and the telemetry span.
import {Deadline, clamp} from './budgets.mjs';
import {BrowserServiceError} from './errors.mjs';
import {attemptBudget} from './selectors.mjs';
import {tabIdOf} from './tabs.mjs';

const isObject = value => typeof value === 'object' && value != null;                                              // Bv
const stringField = (value, key) => (isObject(value) && typeof value[key] === 'string' ? value[key] : undefined);   // gc
const isPageSource = event => event.source.sessionId == null;                                                      // hn
const isNested = source => source.sessionId != null || source.targetId != null;                                    // dt

const reachedReadyState = (readyState, state) => (state === 'domcontentloaded' && readyState === 'interactive') || readyState === 'complete';  // DJ
const isLoadEvent = (event, state) => (state === 'domcontentloaded' && event.method === 'Page.domContentEventFired')
  || event.method === 'Page.loadEventFired';                                                                         // BJ

// A Playwright URL glob as an anchored regular expression's source (MJ).
export function globPattern(glob) {
  let source = '^';
  for (let i = 0; i < glob.length;) {
    const character = glob[i];
    if (character === '*') {
      const any = glob[i + 1] === '*';
      source += any ? '.*' : '[^/]*';
      i += any ? 2 : 1;
      continue;
    }
    source += /[\\.^$|()[\]{}+?]/.test(character) ? `\\${character}` : character;
    i += 1;
  }
  return `${source}$`;
}

// The URL a main-frame navigation event committed, when `matches` takes it (i1): a same-document move of the main
// frame, or a main-frame commit (by the frame id when known, else a frame without a parent).
function navigatedUrl(event, mainFrameId, matches) {
  if (event.method === 'Page.navigatedWithinDocument') {
    if (mainFrameId != null && stringField(event.params, 'frameId') !== mainFrameId) return undefined;
    const url = stringField(event.params, 'url');
    return url != null && matches(url) ? url : undefined;
  }
  if (event.method !== 'Page.frameNavigated' || !isObject(event.params) || !isObject(event.params.frame)) return undefined;
  const {frame} = event.params;
  if (mainFrameId != null ? stringField(frame, 'id') !== mainFrameId : stringField(frame, 'parentId') != null) return undefined;
  const url = stringField(frame, 'url');
  return url != null && matches(url) ? url : undefined;
}

async function mainFrameIdOf(cdp, tabId, deadline) {                                                                // OJ
  try {
    return (await cdp.call(tabId, 'Page.getFrameTree', undefined, {deadline})).frameTree?.frame?.id;
  } catch {
    return undefined;
  }
}

// Waits until the main frame's current document is network-idle, within `deadline` (t1).
async function waitForNetworkIdle(cdp, tabId, deadline) {
  const calls = {deadline: attemptBudget(deadline), preserveOnTimeout: true};
  const timedOut = () => new BrowserServiceError('timeout', `Timed out waiting for networkidle in tab ${tabId}.`);
  let frame;
  let idle = false;
  let failure;
  const early = [];
  let wake = Promise.withResolvers();
  const onEvent = event => {
    if (event.source.tabId !== tabId || isNested(event.source)) return;
    if (event.method !== 'Page.frameNavigated' && event.method !== 'Page.lifecycleEvent') return;
    if (frame == null) { early.push(event); return; }
    if (event.method === 'Page.frameNavigated') {
      if (event.params.frame.parentId != null) return;
      if (frame.id !== event.params.frame.id || frame.loaderId !== event.params.frame.loaderId) {
        frame = event.params.frame;
        idle = false;
      }
    } else if (event.params.name === 'networkIdle' && event.params.frameId === frame.id && event.params.loaderId === frame.loaderId) {
      idle = true;
    }
    wake.resolve();
  };
  const onDetached = detached => {
    if (detached !== tabId) return;
    failure ??= new BrowserServiceError('tab_detached', `Tab ${tabId} detached while waiting for networkidle.`);
    wake.resolve();
  };
  cdp.on('event', onEvent);
  cdp.on('tabDetached', onDetached);
  try {
    await cdp.call(tabId, 'Page.enable', {}, calls);
    ({frameTree: {frame}} = await cdp.call(tabId, 'Page.getFrameTree', undefined, calls));
    for (const event of early.splice(0)) onEvent(event);
    await cdp.call(tabId, 'Page.setLifecycleEventsEnabled', {enabled: true}, calls);
    // The idle flag before the clock: a document already idle when observed succeeds, also on a zero budget.
    while (true) {
      if (failure != null) throw failure;
      if (idle) return;
      if (deadline.expired()) throw timedOut();
      wake = Promise.withResolvers();
      const timer = setTimeout(wake.resolve, deadline.remaining());
      try {
        await wake.promise;
      } finally {
        clearTimeout(timer);
      }
    }
  } catch (error) {
    throw failure ?? (deadline.expired() ? timedOut() : error);
  } finally {
    cdp.removeListener('event', onEvent);
    cdp.removeListener('tabDetached', onDetached);
  }
}

// Waits until the tab's document reaches `state` (load, domcontentloaded or networkidle), within `deadline` (Dv).
export async function waitForLoadState(cdp, tabId, state = 'load', deadline) {
  if (state === 'networkidle') {
    await waitForNetworkIdle(cdp, tabId, deadline);
    return;
  }
  const calls = attemptBudget(deadline);
  await cdp.call(tabId, 'Page.enable', {}, {deadline: calls});
  // The event listener is armed first; the initial observation of the document then runs to its end (within its own
  // calls' bound) even when the budget is shorter, as an explicit zero is: a state that already holds succeeds.
  const abort = new AbortController();
  const event = cdp.waitForEvent(tabId, e => isPageSource(e) && isLoadEvent(e, state), {
    timeoutMs: deadline.remaining(), signal: abort.signal, timeoutMessage: `Timed out waiting for ${state} in tab ${tabId}.`,
  });
  event.catch(() => {});
  const fired = event.then(() => true, () => new Promise(() => {}));
  try {
    const observed = cdp.readDocumentState(tabId, {deadline: calls}).then(document => reachedReadyState(document?.readyState, state));
    if (await Promise.race([fired, observed])) return;
    await event;
  } finally {
    abort.abort();
  }
}

// The load state a URL wait waits for after the URL, in a phase of its own (o1).
async function waitUntil(waitUntilState, tabId, budget, cdp) {
  switch (waitUntilState) {
    case undefined:
    case 'commit':
      return;
    case 'load':
    case 'domcontentloaded':
    case 'networkidle':
      await waitForLoadState(cdp, tabId, waitUntilState, new Deadline(budget));
  }
}

export const WAIT_HANDLERS = {
  async playwright_wait_for_load_state(params, session) {
    await waitForLoadState(session.cdp, tabIdOf(params.tab_id), params.state ?? 'load', new Deadline(clamp(params.timeout_ms)));
    return {};
  },

  async playwright_wait_for_timeout(params) {
    tabIdOf(params.tab_id);
    await new Promise(resolve => setTimeout(resolve, params.timeout_ms));
    return {};
  },

  async playwright_wait_for_url(params, session) {
    if (typeof params.url !== 'string' || !params.url) throw new Error('playwright_wait_for_url requires a url');
    const {cdp} = session;
    const tabId = tabIdOf(params.tab_id);
    const budget = clamp(params.timeout_ms);
    const deadline = new Deadline(budget);
    const calls = attemptBudget(deadline);
    const pattern = new RegExp(globPattern(params.url));
    const matches = url => pattern.test(url);
    await cdp.call(tabId, 'Page.enable', {}, {deadline: calls});
    let state = await cdp.readDocumentState(tabId, {deadline: calls});
    if (state?.href && matches(state.href)) {
      await waitUntil(params.wait_until, tabId, budget, cdp);
      return {url: state.href};
    }
    const mainFrameId = await mainFrameIdOf(cdp, tabId, calls);
    const event = await cdp.waitForEvent(tabId, e => isPageSource(e) && navigatedUrl(e, mainFrameId, matches) != null, {
      timeoutMs: deadline.remaining(),
      timeoutMessage: `Timed out waiting for URL ${params.url} in tab ${tabId}.`,
      initialCheck: async () => {
        state = await cdp.readDocumentState(tabId, {deadline: calls});
        return state?.href != null && matches(state.href);
      },
    });
    const url = event ? navigatedUrl(event, mainFrameId, matches) : state?.href;
    await waitUntil(params.wait_until, tabId, budget, cdp);
    return url == null ? {} : {url};
  },
};
