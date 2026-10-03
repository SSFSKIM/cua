// M10 elicitation policy for the --with-tabs probe. The probe answers the vendor's server requests itself, and it
// accepts exactly one kind: the browser service's origin-access request for the probe's own running test page,
// identified by structured fields only (never the human-readable message), answered for the session only. Everything
// else (user-tab origins, downloads, raw CDP, history, lookalike or two-origin requests, persistent all-sites grants,
// URL-mode or input-asking forms, unknown shapes) is declined and recorded by kind.
//
// Accepted shape (vendor-shapes.mjs, BS:36462-36502): form mode; an empty object schema (asks for no input);
// _meta.connector_id "browser-use", codex_approval_kind "mcp_tool_call", tool_name "access_browser_origin";
// _meta.origin and _meta.tool_params (exactly {origin}) both equal the probe origin as a whole string; no all-sites
// scope; `persist`, if present, only offers "session"/"always" (the reply always chooses "session").
// Requests that may have been the vendor asking for the probe page in a shape the probe refuses make the run's
// elicitation verdict BLOCKED (declined, never widened): `unstructuredOwnOrigin`, an unknown shape whose message
// mentions the probe origin (the message only classifies, it never accepts), and `refusedOwnOrigin`, an origin-access
// request whose structured fields name the probe origin but fail the rule (two origins, all-sites grant, URL mode,
// input-asking form, unknown persistence offer). Lookalike hosts, other ports and user-tab origins are not the probe
// page: plain declines, recorded by kind.
//
// `persist` in a request is the vendor offering persistence options to a UI (it sends "always" whenever persistent
// approval is allowed, the default: BS:62136, 62877), not a grant; the probe's reply alone chooses, and is always
// "session". A request for a grant wider than one origin (the all-sites scope key) is declined.
import {sanitizeVendorText} from './classify.mjs';
import {ALL_SITES_SCOPE_KEY} from './vendor-shapes.mjs';

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const PERSIST_OFFERS = ['session', 'always'];

function kindOf(meta) {
  switch (meta.tool_name) {
    case 'access_browser_origin': return 'origin-access';
    case 'access_browser_origin_with_raw_cdp': return 'raw-cdp';
    case 'download_browser_files': case 'upload_browser_files': return 'file-transfer';
  }
  if (meta.sensitive_data === 'browsing_history') return 'history';
  if (isObject(meta.tool_params) && Array.isArray(meta.tool_params.asset_origins)) return 'page-asset';
  return 'unknown';
}

const offersOnlyKnownPersistence = persist => persist === undefined
  || (typeof persist === 'string' && PERSIST_OFFERS.includes(persist))
  || (Array.isArray(persist) && persist.length > 0 && persist.every(p => PERSIST_OFFERS.includes(p)));

const asksForNothing = schema => isObject(schema) && schema.type === 'object' && isObject(schema.properties) && Object.keys(schema.properties).length === 0;

// -> {accept, kind, mode, ownOrigin, unstructuredOwnOrigin, reason}
export function decideElicitation(msg, {origin}) {
  if (msg?.method !== 'elicitation/create') return {accept: false, kind: 'other-request', mode: null, ownOrigin: false, unstructuredOwnOrigin: false, reason: 'not an elicitation'};
  const params = isObject(msg.params) ? msg.params : {};
  const meta = isObject(params._meta) ? params._meta : {};
  const kind = kindOf(meta);
  const mode = typeof params.mode === 'string' ? params.mode : null;
  const ownOrigin = typeof origin === 'string' && meta.origin === origin;
  const unstructuredOwnOrigin = kind === 'unknown' && typeof origin === 'string' && typeof params.message === 'string' && params.message.includes(origin);
  const namesOwnOrigin = typeof origin === 'string' && (ownOrigin || JSON.stringify(meta.tool_params ?? null).includes(JSON.stringify(origin)));
  const decline = reason => ({accept: false, kind, mode, ownOrigin, unstructuredOwnOrigin, ...(kind === 'origin-access' && namesOwnOrigin ? {refusedOwnOrigin: true} : {}), reason});
  if (typeof origin !== 'string') return decline('no probe origin');
  if (kind !== 'origin-access') return decline(`kind ${kind}`);
  if (mode !== 'form' || 'url' in params) return decline('not a form-mode request');
  if (!asksForNothing(params.requestedSchema)) return decline('the form asks for input');
  if (meta.connector_id !== 'browser-use' || meta.codex_approval_kind !== 'mcp_tool_call') return decline('not the browser-use approval');
  const toolParams = meta.tool_params;
  if (!isObject(toolParams) || Object.keys(toolParams).length !== 1 || toolParams.origin !== origin || meta.origin !== origin) return decline('not exactly the probe origin');
  if (ALL_SITES_SCOPE_KEY in meta) return decline('asks for a grant wider than one origin');
  if (!offersOnlyKnownPersistence(meta.persist)) return decline('unknown persistence offer');
  return {accept: true, kind, mode, ownOrigin: true, unstructuredOwnOrigin: false, reason: 'the probe origin'};
}

// The M9 policy: decline everything, recording the same inventory.
export function declineAll(msg) {
  return {...decideElicitation(msg, {origin: undefined}), accept: false};
}

export function answerFor(decision) {
  return decision.accept ? {action: 'accept', content: {}, _meta: {persist: 'session'}} : {action: 'decline'};
}

export function inventoryEntry(msg, decision) {
  const message = isObject(msg?.params) ? msg.params.message : undefined;
  return {
    method: typeof msg?.method === 'string' ? msg.method.slice(0, 40) : null,
    kind: decision.kind, mode: decision.mode, ownOrigin: decision.ownOrigin,
    ...(decision.unstructuredOwnOrigin ? {unstructuredOwnOrigin: true} : {}),
    ...(decision.refusedOwnOrigin ? {refusedOwnOrigin: true} : {}),
    answered: decision.accept ? 'accept (session)' : (decision.kind === 'other-request' ? 'error' : 'decline'),
    reason: decision.reason,
    text: sanitizeVendorText(message ?? '', 120),
  };
}
