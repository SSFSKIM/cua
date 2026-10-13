// Ported from readable chatgpt-26.928.40906 BS:9102-9330 (J0, Cg and tT, the navigation URL check and its sentences; eT and tt, the security error); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: Cz (BS:37738-37765, the check's caller), the CDP deadline sentence and its test (BS:48758-48767, kv and of),
// the dialog sentence (BS:48749), "Tab not found" (BS:62061-62071), "Browser is not available" (BS:68379-68385).
//
// What is kept of the vendor's error class: one error type with a code from a closed vocabulary and a retryable flag.
// What is dropped: the security framing ("Browser Use rejected this action due to browser security policy...", the
// workaround warning), the decision sources and every reason that belonged to site status, approval, Auto-review,
// enterprise policy, persisted grants and the extension's navigation blocking (the spec, "What the service keeps,
// lifts and drops"). The wrapper (src/services/browser.mjs) classifies a rejection by `name` and `code` alone.

export const KEPT_REASONS = new Set([
  'invalid_url', 'unsupported_protocol', 'tab_not_found', 'browser_not_found', 'dialog_open', 'tab_detached',
  'strict_mode_violation', 'timeout', 'evaluate_interrupted', 'download_not_found', 'file_chooser_not_found',
  'unsupported_command', 'unsupported_backend', 'browser_capability_unavailable',
]);

// A failure the same call may get past by being made again, unchanged, once the moment has passed.
const RETRYABLE = new Set(['timeout', 'tab_detached', 'browser_not_found']);

export class BrowserServiceError extends Error {
  name = 'BrowserServiceError';
  code;
  retryable;
  constructor(code, message, {retryable = RETRYABLE.has(code), cause} = {}) {
    if (!KEPT_REASONS.has(code)) throw new TypeError(`unknown browser service error code: ${String(code)}`);
    if (typeof message !== 'string' || message === '') throw new TypeError(`browser service error ${code} needs a message`);
    super(message, cause === undefined ? undefined : {cause});
    this.code = code;
    this.retryable = retryable;
  }
}

// The vendor's sentence for a CDP operation whose command ran out of budget (kv).
export const DEADLINE_EXCEEDED = 'CDP operation exceeded its deadline before command dispatch';

const ALLOWED_PROTOCOLS = Object.freeze(['http:', 'https:']);
const ALWAYS_ALLOWED = new Set(['about:blank']);
const CANNOT_VISIT = 'Browser use cannot visit the requested page.';

// The sentences of the reasons the service raises itself, by code. Reasons whose sentence comes from a later
// milestone's port (strict mode, evaluate interruption, downloads, file choosers) are built there with
// `new BrowserServiceError(code, message)`.
const SENTENCES = {
  invalid_url: () => `${CANNOT_VISIT} The requested URL is invalid.`,
  unsupported_protocol: () => `${CANNOT_VISIT} The requested URL protocol is not allowed. Allowed protocols: ${ALLOWED_PROTOCOLS.map(p => `"${p}"`).join(', ')}.`,
  tab_not_found: (tabId, tabs = []) => `Tab not found: ${tabId}. Existing tabs: ${tabs.length
    ? tabs.map(t => `${t.id}|${t.title ?? '<no title>'}|${t.url ?? '<no url>'}`).join(', ') : 'none'}`,
  browser_not_found: id => `Browser is not available: ${id}`,
  dialog_open: type => `A ${type} JavaScript dialog is active in this tab. Use \`tab.getJsDialog()\` to get it and dismiss it first.`,
  timeout: () => DEADLINE_EXCEEDED,
  tab_detached: () => 'Debugger unattached',
  unsupported_command: type => `Unsupported browser command: ${type}`,
  unsupported_backend: () => 'This browser backend is not supported by the cua browser service: it requires the ChatGPT extension\'s agent request headers.',
  browser_capability_unavailable: id => `This browser does not provide the "${id}" capability.`,
};

// -> a BrowserServiceError with the code's sentence; a code without a sentence of its own takes `args[0]` as its message.
export function serviceError(code, ...args) {
  const sentence = SENTENCES[code];
  return new BrowserServiceError(code, sentence ? sentence(...args) : String(args[0]));
}

// The vendor's navigation URL check (Cz over J0): about:blank and http(s) pass, anything else is refused before a
// navigation is attempted. A missing URL is no check.
export function checkNavigationUrl(url) {
  if (typeof url !== 'string' || ALWAYS_ALLOWED.has(url)) return;
  let parsed;
  try { parsed = new URL(url); } catch { throw serviceError('invalid_url'); }
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) throw serviceError('unsupported_protocol');
}

// The vendor's test for a failure that is a deadline or a timeout (of): such failures are rethrown where other
// failures of an optional setup step are tolerated.
export function isDeadlineError(error) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /(?:deadline|timed out)/i.test(message);
}
