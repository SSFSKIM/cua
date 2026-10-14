// Ported from readable chatgpt-26.928.40906 BS:53872-54010 (the raw CDP method gate: EY, AY, PY, kY, I1's refusals, IY, RY and R1, with wf, LY and vc); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: vf, O1 and M1, tab_cdp_call and tab_cdp_events (BS:54173-54245); Fi (BS:18371-18380); NY (BS:54151-54160);
// the payloads (BS:34855-34900).
//
// tab.capabilities.get("cdp"): raw DevTools Protocol commands to a tab or one of its attached child targets, and the
// tab's buffered events, for a backend that announces the tab capability `cdp`. cua's host announces none (its tabs
// are DOM-only), so on its route both commands fail with browser_capability_unavailable and the model never sees the
// capability. Where it is announced, the vendor's gate applies: only the listed domains, never the ones that reach
// past the tab (storage, targets, WebAuthn), never the methods that would subvert what the service itself manages
// (document interception, file choosers, downloads, typing, navigation and history: each refusal names the API to use
// instead), and no raw Fetch or Network or Target call while a media download's interceptor or a document response
// the service is releasing is in play. A call's budget is its timeout_ms, 3 s by default, and the debugger is kept
// when it runs out.
// Changed: the gate's opening is the backend's announcement, where the vendor reads a Codex config switch
// (assertFullCdpEnabled) and offers the command only to extension and in-app backends. Dropped: the per-origin
// approval, origin policy and site checks of every URL a raw call names (ensureFullCdpAllowed, ensureRawCdpUrlAllowed
// over D1's URL extraction: no site policy, no approval prompts), and the browser-auth event protection.
import {DOCUMENT_RESPONSES} from './downloads.mjs';
import {serviceError} from './errors.mjs';
import {tabIdOf} from './tabs.mjs';

const RAW_CALL_MS = 3000;

const DOMAINS = new Set([                                                                                             // EY
  'Accessibility', 'Audits', 'CacheStorage', 'Console', 'CSS', 'Database', 'Debugger', 'DOM', 'DOMDebugger', 'DOMSnapshot',
  'Emulation', 'Fetch', 'IO', 'Input', 'Inspector', 'Log', 'Network', 'Overlay', 'Page', 'Performance', 'Profiler', 'Runtime',
  'Storage', 'Target', 'Tracing', 'WebAudio', 'WebAuthn',
]);
const REFUSED_DOMAINS = new Set(['CacheStorage', 'Database', 'Storage', 'Target', 'WebAuthn']);                      // AY
const REFUSED_METHODS = new Set([                                                                                     // PY, and I1's "block"
  'DOM.getFileInfo', 'DOM.setFileInputFiles', 'Input.dispatchKeyEvent', 'Input.setInterceptDrags', 'Network.clearBrowserCookies',
  'Network.deleteDeviceBoundSession', 'Network.enableDeviceBoundSessions', 'Network.getAllCookies', 'Network.getResponseBodyForInterception',
  'Network.setCookieControls', 'Network.setExtraHTTPHeaders', 'Network.setRequestInterception', 'Network.takeResponseBodyForInterceptionAsStream',
  'Page.addScriptToEvaluateOnLoad', 'Page.addScriptToEvaluateOnNewDocument', 'Page.crash', 'Page.disable', 'Page.getNavigationHistory',
  'Page.resetNavigationHistory', 'Page.setAdBlockingEnabled', 'Page.setBypassCSP', 'Page.setDownloadBehavior', 'Page.setInterceptFileChooserDialog',
  'Page.setRPHRegistrationMode', 'Page.setSPCTransactionMode', 'Tracing.requestMemoryDump',
  'Input.dispatchDragEvent', 'Network.continueInterceptedRequest', 'Network.getCertificate', 'Network.loadNetworkResource',
  'Network.replayXHR', 'Page.navigate', 'Page.navigateToHistoryEntry',
]);
const INSTEAD = new Map([                                                                                             // kY
  ['Fetch.disable', 'Use Fetch.enable with an empty patterns array to clear raw interception.'],
  ['Fetch.enable', 'Use explicit non-Document resourceType patterns; Browser Use reserves Document responses for browser-managed navigation.'],
  ['DOM.setFileInputFiles', 'Use tab.playwright.waitForEvent("filechooser") and chooser.setFiles(...) instead.'],
  ['Input.dispatchDragEvent', 'Use tab.playwright.waitForEvent("filechooser") and chooser.setFiles(...) instead for file uploads.'],
  ['Input.dispatchKeyEvent', 'Use tab.cua.type(...) or tab.cua.keypress(...) instead.'],
  ['Network.getAllCookies', 'Use Network.getCookies with explicit URLs instead.'],
  ['Page.getNavigationHistory', 'For supported history navigation, use tab.back() or tab.forward() instead.'],
  ['Page.navigate', 'Use tab.goto(url) instead.'],
  ['Page.navigateToHistoryEntry', 'Use tab.back() or tab.forward() instead.'],
  ['Page.reload', 'Use tab.reload() instead.'],
  ['Page.setDownloadBehavior', 'Use tab.playwright.waitForEvent("download") before triggering a download instead.'],
  ['Page.setInterceptFileChooserDialog', 'Use tab.playwright.waitForEvent("filechooser") and chooser.setFiles(...) instead.'],
]);

const isRecord = value => typeof value === 'object' && value != null && !Array.isArray(value);                        // vc
const domainOf = method => { const dot = method.indexOf('.'); return dot > 0 ? method.slice(0, dot) : null; };       // LY
const notSupported = method => (INSTEAD.has(method)                                                                   // wf
  ? `This method is not supported through raw CDP. ${INSTEAD.get(method)}` : 'This method is not supported through raw CDP.');

// A system trace (Perfetto or systrace) reaches past the tab (NY).
function isSystemTrace(params) {
  const config = params?.traceConfig;
  return params?.perfettoConfig != null || params?.tracingBackend === 'system'
    || (typeof params?.options === 'string' && params.options.split(',').some(option => option.trim() === 'enable-systrace'))
    || (isRecord(config) && (config.enableSystrace === true || config.memoryDumpConfig != null));
}

// Parameters that make an otherwise permitted method reach past the tab (RY).
function hasRefusedParams(method, params) {
  switch (method) {
    case 'Fetch.continueResponse':
    case 'Fetch.fulfillRequest': return params?.binaryResponseHeaders != null;
    case 'Network.configureDurableMessages': return params?.maxTotalBufferSize != null;
    case 'Network.enable': return params?.enableDurableMessages === true;
    case 'Page.createIsolatedWorld': return params?.grantUniveralAccess === true;
    case 'Page.reload': return params?.scriptToEvaluateOnLoad != null;
    case 'Tracing.start': return isSystemTrace(params);
    default: return false;
  }
}

// The method and parameters a raw call may send -> the parameters to send (IY, R1). To the tab itself (not a child
// target) the service's document interception is kept: Fetch.disable is refused, and Fetch.enable must name only
// non-Document resource types, the service's own pattern added back.
export function permittedRawCall(method, params, {preserveDocumentInterception}) {
  const domain = domainOf(method);
  if (domain == null || !DOMAINS.has(domain) || REFUSED_DOMAINS.has(domain) || REFUSED_METHODS.has(method) || hasRefusedParams(method, params)) {
    throw new Error(notSupported(method));
  }
  if (!preserveDocumentInterception) return params;
  if (method === 'Fetch.disable') throw new Error(notSupported(method));
  if (method !== 'Fetch.enable') return params;
  const patterns = params?.patterns;
  if (!Array.isArray(patterns) || patterns.some(p => !isRecord(p) || typeof p.resourceType !== 'string' || p.resourceType === 'Document')) {
    throw new Error(notSupported(method));
  }
  return {...params, patterns: [...patterns, DOCUMENT_RESPONSES]};
}

// The backend offers raw CDP: it announced the tab capability (and the launch did not disable it), and it is a backend
// type the vendor offers it on (Fi: extensions and in-app browsers).
function requireRawCdp(session) {
  if (!session.capabilities.tab.some(capability => capability?.id === 'cdp')) {
    throw serviceError('browser_capability_unavailable', 'cdp');
  }
  if (session.clientInfo.type !== 'extension' && session.clientInfo.type !== 'iab') {
    throw new Error('Full CDP access is currently only available for browser extension and in-app browser tabs.');
  }
}

const childTarget = target => (target == null ? undefined : {sessionId: target.session_id, targetId: target.target_id});   // vf

export const RAW_CDP_HANDLERS = {
  async tab_cdp_call(params, session) {                                                                              // O1
    requireRawCdp(session);
    const tabId = tabIdOf(params.tab_id);
    const target = childTarget(params.target);
    const sent = permittedRawCall(params.method, params.params, {preserveDocumentInterception: target == null});
    const guard = () => {
      if (session.documentResponses.hasRequestInterceptors(tabId) && /^(?:Fetch|Network|Target)\./.test(params.method)) {
        throw new Error('Raw CDP is unavailable while Browser Use is protecting a browser request.');
      }
      if (session.documentResponses.hasOwnedPausedResponses(tabId)) {
        throw new Error('Raw CDP is unavailable while Browser Use is resolving a paused document response.');
      }
    };
    guard();
    return (await session.cdp.callRawCdp(tabId, params.method, sent, {
      beforeDispatch: guard,
      prepareDispatch: () => session.documentResponses.ensureInterceptionReady(tabId),
      target,
      timeoutMs: params.timeout_ms ?? RAW_CALL_MS,
    })) ?? {};
  },

  async tab_cdp_events(params, session) {                                                                            // M1
    requireRawCdp(session);
    return await session.cdp.readRawCdpEvents(tabIdOf(params.tab_id), {
      afterSequence: params.after_sequence, limit: params.limit, methods: params.methods, target: childTarget(params.target), timeoutMs: params.timeout_ms,
    });
  },
};
