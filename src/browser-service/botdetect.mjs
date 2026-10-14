// Ported from readable chatgpt-26.928.40906 BS:54514-54559 (W1, tab_bot_detection_report, with VY, KY and XY); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: the payload and result (BS:34768-34796).
//
// tab.capabilities.get("botDetection"), for a backend that announces it (the vendor's cloud browsers; cua's host does
// not, so the model never reaches this on its route; the vendor's handler does not check the announcement, nor does
// this). A report names why the open page blocks the agent and answers {status: 'reported', hostname}, the page's
// hostname or null. Changed: the vendor's report is its telemetry event (browser_use_bot_detection_reported, with the
// hostname); cua has no telemetry, so the report is recorded nowhere and nothing leaves the machine. Nothing here needs
// the vendor's QR decoder, which belongs to its browser-auth flow, so none is ported.
import {tabIdOf} from './tabs.mjs';

const REASONS = ['captcha_failed', 'access_denied', 'challenge_loop', 'unexpected_bot_error'];

function reason(value) {
  if (!REASONS.includes(value)) {
    throw new Error(`Invalid enum value. Expected ${REASONS.map(r => `'${r}'`).join(' | ')}, received '${value}'`);
  }
  return value;
}

function hostnameOf(url) {                                                                                             // KY
  if (url == null || url.length === 0) return null;
  try {
    const {hostname} = new URL(url);
    return hostname.length === 0 ? null : hostname;
  } catch {
    return null;
  }
}

export const BOT_DETECTION_HANDLERS = {
  async tab_bot_detection_report(params, session) {                                                                  // W1
    reason(params.reason);
    const tabId = tabIdOf(params.tab_id);
    const url = (await session.cdp.readDocumentState(tabId))?.href ?? session.cdp.currentTopLevelUrl(tabId);         // XY
    return {status: 'reported', hostname: hostnameOf(url)};
  },
};
