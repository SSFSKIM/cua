// Ported from readable chatgpt-26.928.40906 BS:27559-27610 (GS, browser_user_history, and TW, its query check); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: rh.history (BS:64792-64794); uh.getUserHistory (BS:67988-67990); the payload and result (BS:32483-32510).
//
// browser.history({queries?, from?, to?, limit?}): the person's browsing history, read by the backend (its
// getUserHistory), each item {url, title?, dateVisited}. The query is checked as the vendor checks it, then forwarded;
// the backend decides what it can answer. No backend serves getUserHistory yet: cua's host (whose extension has no
// `history` permission until #83) and MAWS refuse it in their own words ("No handler registered for method:
// getUserHistory"), which is the vendor's result on cua's host too, so the member stays in the manifest as the vendor
// keeps it and is unavailable until a host serves the request. Like the vendor's, the command checks no announced
// capability: a host's answer is the gate. Dropped: the vendor's history approval prompt and its Codex history policy
// (Np's browser_user_history check and xI, BS:37090-37107 and BS:36332-36366; la.getHistoryPermission): no approval
// prompts of cua's own and no Codex config.

const QUERIES = 'browser_user_history requires queries to be a non-empty array of strings';

// The vendor's query check (TW): the fields given, each as the backend expects it.
function historyQuery(params) {
  const query = {};
  if (params.queries != null) {
    if (!Array.isArray(params.queries) || params.queries.length === 0) throw new Error(QUERIES);
    const queries = [];
    for (const q of params.queries) {
      if (typeof q !== 'string') throw new Error(QUERIES);
      queries.push(q);
    }
    query.queries = queries;
  }
  if (params.limit != null) {
    if (!Number.isInteger(params.limit) || params.limit <= 0) throw new Error('browser_user_history requires limit to be a positive integer');
    query.limit = params.limit;
  }
  for (const bound of ['from', 'to']) {
    if (params[bound] == null) continue;
    if (typeof params[bound] !== 'string' || Number.isNaN(Date.parse(params[bound]))) {
      throw new Error(`browser_user_history requires ${bound} to be a valid date`);
    }
    query[bound] = params[bound];
  }
  return query;
}

export const HISTORY_HANDLERS = {
  async browser_user_history(params, session) {                                                                      // GS
    const items = await session.api.getUserHistory(historyQuery(params));
    return {items: items.map(item => ({url: item.url, ...(item.title == null ? {} : {title: item.title}), dateVisited: item.dateVisited}))};
  },
};
