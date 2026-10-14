// Ported from readable chatgpt-26.928.40906 BS:44114-44134 (UB, tab_browser_auth_handoff: its capability check, BX's request check and Ys's page check); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: BX (BS:45641-45675); Ys (BS:45408-45425) with He, TI and CI (BS:36378-36397); the result (BS:35096-35111);
// mc, the manual handoff's mark (BS:46288-46304).
//
// tab.capabilities.get("browserAuth").request(...), for a backend that announces the tab capability `browserAuth`
// (cua's host does not, so on its route the command is refused as the vendor refuses it there and the model never sees
// the capability). cua serves the local form only: the tab is handed to the person, who signs in themselves in the
// page in their own browser. The request is checked as the vendor checks it (distinct field and option ids and
// selectors, no submit click on a credential field, else locator_invalid; the tab's main frame still on the request's
// origin, else origin_changed or page_changed), then the tab is marked `handoff`, so at the turn's end the agent lets go of it (its debugger detached)
// and it stays open for the person until the session's next turn resumes it, and the answer is
// {status: 'declined', reason: 'user_took_over'}: the vendor's result for a person who chose to sign in themselves.
// Its document (docs-content.mjs, capabilities/tab/browserAuth) says so. Dropped, with nothing in their place: the
// secure ChatGPT credential form (the runtime's elicitation and the GaaS auth broker), credential validation, filling
// and submission, the automated safety review, the email OTP, the credential observation gate and every submission
// diagnostic, and the QR path (the vendor decodes a visible QR code to carry its sign-in link to the ChatGPT form; in
// the local form the person scans the code on their own screen, so no decoder is needed and none is vendored).
import {BrowserServiceError} from './errors.mjs';
import {tabIdOf} from './tabs.mjs';

const TYPE = 'tab_browser_auth_handoff';

// The origin of a web URL, or null (He over TI and CI).
function webOrigin(url) {
  if (typeof url !== 'string' || url.trim().length === 0) return null;
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null;
}

// Every field and option has its own id and selector, an option's fields are fields of the request, and a submit click
// is not on a credential field (BX).
function distinctTargets(request) {
  const fieldIds = new Set(), selectors = new Set();
  for (const field of request.fields ?? []) {
    if (fieldIds.has(field.id) || selectors.has(field.selector)) return false;
    fieldIds.add(field.id);
    selectors.add(field.selector);
  }
  if (request.options != null) {
    const optionIds = new Set(), optionSelectors = new Set();
    for (const option of request.options) {
      if (optionIds.has(option.id)) return false;
      optionIds.add(option.id);
      if (option.selector != null) {
        if (optionSelectors.has(option.selector) || selectors.has(option.selector)) return false;
        optionSelectors.add(option.selector);
      }
      const ids = option.field_ids ?? [];
      if (new Set(ids).size !== ids.length || ids.some(id => !fieldIds.has(id))) return false;
    }
  }
  // A submit click must not land on a credential field (pressing Enter in one is how such a form submits).
  return request.submit == null || request.submit.action === 'press_enter' || !selectors.has(request.submit.selector);
}

// The tab's main frame, or the status naming why it is not the page the request describes (Ys).
async function signInPage(session, tabId, origin) {
  const {frameTree} = await session.cdp.call(tabId, 'Page.getFrameTree');
  const {id, loaderId, securityOrigin, url} = frameTree.frame;
  const expected = origin ?? webOrigin(url);
  if (expected == null || webOrigin(securityOrigin) !== expected || webOrigin(url) !== expected) return 'origin_changed';
  if (!id || !loaderId || !securityOrigin || !url) return 'page_changed';
  return null;
}

export const AUTH_HANDOFF_HANDLERS = {
  async tab_browser_auth_handoff(params, session) {                                                                  // UB
    if (!session.capabilities.tab.some(capability => capability?.id === 'browserAuth')) {
      throw new BrowserServiceError('browser_capability_unavailable', `${session.clientInfo.name} does not support command "${TYPE}".`);
    }
    if (!distinctTargets(params)) return {status: 'locator_invalid'};
    const tabId = tabIdOf(params.tab_id);
    const changed = await signInPage(session, tabId, params.origin);
    if (changed != null) return {status: changed};
    await session.tabs.mark(tabId, 'handoff');
    return {status: 'declined', reason: 'user_took_over'};
  },
};
