// The trusted "browser" service: with the browser surface enabled, node_repl's trusted worker loads this module
// (NODE_REPL_TRUSTED_SERVICES, registered by `cua serve` through buildLaunch) in place of the vendor's
// @oai/browser-desktop service, and every request is delegated to that vendor module, named by the launcher in
// CUA_BROWSER_VENDOR_SERVICE (never by agent input). The vendor service exports only handleRpc; it registers its
// turn-ended hook through globalThis.nodeRepl.addTurnEndedHandler when `setup` initialises it (browser-service.mjs, the
// turn tracker `ph`), and the trusted worker gives this module and the vendor module the same nodeRepl, so delegating
// handleRpc keeps its hooks and its task cleanup.
//
// Secret substitution. The vendor client sends nodeRepl.rpc("browser", {method, params}) with method "execute" or
// "executeWithRecovery" and params the flat agent command {type, ...payload}. Exactly these pinned commands
// (@oai/browser-desktop 0.1.1) are eligible, and only when the eligible string is entirely `{{secret:<label>}}`:
//   {type:"playwright_locator_fill", browser_id, tab_id, selector, value, replace, timeout_ms?}      value
//   {type:"tab_ax_action", browser_id, tab_id, action:{kind:"paste", element_index, text, format?}}  action.text
//   {type:"tab_ax_action", browser_id, tab_id, action:{kind:"type_text", element_index, text}}      action.text
//   {type:"tab_ax_action", browser_id, tab_id, action:{kind:"set_value", element_index, value}}     action.value
// with string ids/selector/text, a boolean replace, a positive integer timeout_ms, element_index a non-negative
// integer (or null for paste/type_text), and paste only in text format. Every command may also carry
// client_timeout_ms (a positive integer, or absent/undefined): the vendor client's transport adds it to each command
// it sends (FunctionAgentTransport.send in browser-client.mjs). Everything else is delegated untouched:
// other commands and fields, values that merely contain a marker, and playwright_evaluate/CDP/script strings, which
// are never scanned. The stored value is read from the connection's secret store (src/secrets/store.mjs) and placed in a copy of the
// request handed to the vendor.
//
// Failing closed: an invalid or unknown label, an unsafe or unreadable store file, secrets off or unavailable, a reference in
// any other shape of an eligible command, or a vendor browser service other than the pinned version fails before
// anything is entered. After substitution the vendor can fail on two channels: a rejected promise, and the resolved
// envelope {ok:false, error} that executeWithRecovery returns for recovery errors (browser-service.mjs X2). A
// substituted call that fails on either becomes one fixed, bounded diagnostic classified by the vendor's error class
// and its enumerated reason, never its text; unsubstituted calls keep the vendor's own result and errors.
import {readFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseReference} from '../secrets/reference.mjs';
import {
  SecretInputError, NOTHING_ENTERED, isPlainObject, propertyKey, matchesShape, invalidLabel, unavailable, readFailure,
  inputFailed, secretsFromEnv,
} from './secret-input.mjs';

export const PINNED_VENDOR_VERSION = '0.1.1';
const VENDOR_PACKAGE = '@oai/browser-desktop';

const isString = value => typeof value === 'string';
const isIndex = value => Number.isInteger(value) && value >= 0;
const isNullableIndex = value => value === null || isIndex(value);
const isPositiveInt = value => Number.isInteger(value) && value > 0;
const SERVICE_METHODS = ['execute', 'executeWithRecovery'];
const REQUEST_KEYS = ['method', 'params'];

const FILL = {
  fields: {
    type: isString, browser_id: isString, tab_id: isString, selector: isString, value: isString,
    replace: value => typeof value === 'boolean', timeout_ms: isPositiveInt, client_timeout_ms: isPositiveInt,
  },
  optional: ['timeout_ms', 'client_timeout_ms'],
};
const AX_COMMAND = {fields: {type: isString, browser_id: isString, tab_id: isString, action: isPlainObject, client_timeout_ms: isPositiveInt}, optional: ['client_timeout_ms']};
const AX_ACTIONS = {
  paste: {field: 'text', fields: {kind: isString, element_index: isNullableIndex, text: isString, format: value => value === 'text'}, optional: ['format']},
  type_text: {field: 'text', fields: {kind: isString, element_index: isNullableIndex, text: isString}},
  set_value: {field: 'value', fields: {kind: isString, element_index: isIndex, value: isString}},
};

// Enumerated reasons of the pinned vendor errors (BrowserUseSecurityError reasons, the `eT` table; the
// BrowserCredentialRecoveryError reasons, `I6`). Only these fixed strings are repeated in a diagnostic.
const SECURITY_REASONS = new Set([
  'approval_cancelled', 'approval_failed_closed', 'approval_unavailable', 'browser_capability_blocked',
  'browser_capability_unavailable', 'browser_context_unavailable', 'browser_navigation_blocked',
  'enterprise_policy_blocked', 'enterprise_policy_unavailable', 'guardian_denied', 'guardian_timed_out',
  'navigation_url_policy_blocked', 'persisted_user_denied', 'site_status_blocked', 'site_status_unavailable', 'user_declined',
]);
const RECOVERY_REASONS = new Set([
  'credential_delivery_in_progress', 'credential_observation_restricted', 'retained_data_restricted',
  'credential_state_unavailable', 'protected_command_failed', 'browser_security_restricted', 'browser_security_unavailable',
]);

// The substitution a request asks for: null to delegate it untouched, or the plan. Eligibility uses coerced keys
// (the vendor looks the service method up by property key); checkShape then demands the exact pinned types.
function substitutionFor(request) {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) return null;
  if (!SERVICE_METHODS.includes(propertyKey(request.method))) return null;
  const params = request.params;
  if (params === null || typeof params !== 'object') return null;
  const type = propertyKey(params.type);
  if (type === 'playwright_locator_fill') {
    const reference = parseReference(params.value);
    return reference && {what: 'fill', reference, request};
  }
  if (type === 'tab_ax_action') {
    const action = params.action;
    if (action === null || typeof action !== 'object') return null;
    const kind = propertyKey(action.kind);
    if (kind === null || !Object.hasOwn(AX_ACTIONS, kind)) return null;
    const rule = AX_ACTIONS[kind];
    const reference = parseReference(action[rule.field]);
    return reference && {what: kind, reference, request, rule};
  }
  return null;
}

function checkShape(plan) {
  const {request} = plan;
  const outer = typeof request.method === 'string' && Object.keys(request).every(key => REQUEST_KEYS.includes(key));
  const pinned = plan.what === 'fill'
    ? outer && matchesShape(request.params, FILL.fields, FILL.optional)
    : outer && matchesShape(request.params, AX_COMMAND.fields, AX_COMMAND.optional) && matchesShape(request.params.action, plan.rule.fields, plan.rule.optional);
  if (pinned) return;
  const where = plan.what === 'fill'
    ? 'the whole value of a Playwright locator fill (browser_id, tab_id, selector, value, replace, timeout_ms)'
    : `the whole ${plan.rule.field} of a tab ${plan.what} action (${Object.keys(plan.rule.fields).join(', ')}${plan.what === 'paste' ? '; text format' : ''})`;
  throw new SecretInputError('unsupported_secret_shape', `a {{secret:…}} reference is expanded in the browser only as ${where} in its pinned shape; ${NOTHING_ENTERED}`);
}

function substituted(plan, value) {
  const {request} = plan;
  if (plan.what === 'fill') return {method: request.method, params: {...request.params, value}};
  return {method: request.method, params: {...request.params, action: {...request.params.action, [plan.rule.field]: value}}};
}

// A fixed classification of a vendor rejection, never its text.
function rejectionKind(error) {
  if (error !== null && typeof error === 'object') {
    if (error.name === 'BrowserUseSecurityError' && SECURITY_REASONS.has(error.reason)) return `security:${error.reason}`;
    if (error.name === 'BrowserCredentialRecoveryError' && RECOVERY_REASONS.has(error.details?.reason)) return `recovery:${error.details.reason}`;
    if (error.name === 'ZodError') return 'invalid_command';
  }
  return 'failed';
}
const envelopeKind = details => RECOVERY_REASONS.has(details?.reason) ? `recovery:${details.reason}` : 'recovery';

// `loadVendor` resolves the vendor service module; `vendorVersion` its package version (or null); `secrets` reads a
// label's value (the file store); `secretsUnavailable`, when set, is the launch's reason there is no store.
export function createBrowserService({loadVendor, vendorVersion, secrets, secretsUnavailable = null}) {
  let vendor = null;
  const vendorService = () => (vendor ??= loadVendor());

  async function handleRpc(request) {
    const plan = substitutionFor(request);
    if (!plan) return (await vendorService()).handleRpc(request);

    const {reference} = plan;
    if (reference.invalid) throw invalidLabel();
    checkShape(plan);
    if (secretsUnavailable) throw unavailable(secretsUnavailable);
    const service = await vendorService();
    const version = await vendorVersion();
    if (version !== PINNED_VENDOR_VERSION) throw new SecretInputError('unsupported_browser_runtime', `secret input in the browser is pinned to ${VENDOR_PACKAGE} ${PINNED_VENDOR_VERSION}; this runtime has ${/^\d+\.\d+\.\d+$/.test(version ?? '') ? version : 'an unknown version'}; ${NOTHING_ENTERED}`);
    let value;
    try { value = await secrets.read(reference.label); } catch (error) { throw readFailure(error, reference.label); }

    const what = plan.what === 'fill' ? 'fill' : `tab ${plan.what}`;
    let result;
    try {
      result = await service.handleRpc(substituted(plan, value));
    } catch (error) {
      throw inputFailed(what, reference.label, rejectionKind(error));
    }
    if (isPlainObject(result) && result.ok === false) throw inputFailed(what, reference.label, envelopeKind(result.error));
    return result;
  }
  return {handleRpc};
}

// The vendor package's version, read from the package.json above its scripts/ directory; null when it is not the
// expected package or cannot be read.
async function packageVersion(vendorPath) {
  try {
    const pkg = JSON.parse(await readFile(join(dirname(vendorPath), '..', 'package.json'), 'utf8'));
    return pkg?.name === VENDOR_PACKAGE && typeof pkg.version === 'string' ? pkg.version : null;
  } catch { return null; }
}

// The service as the trusted worker runs it, configured by the launch environment.
export function browserServiceFromEnv(env = process.env) {
  const vendorPath = env.CUA_BROWSER_VENDOR_SERVICE;
  return createBrowserService({
    loadVendor: async () => {
      if (!vendorPath) throw new Error('cua: the vendor browser service is not configured for this runtime [browser_not_configured]');
      return import(pathToFileURL(vendorPath).href);
    },
    vendorVersion: async () => vendorPath ? packageVersion(vendorPath) : null,
    ...secretsFromEnv(env),
  });
}

let service = null;
export function handleRpc(request) {
  service ??= browserServiceFromEnv();
  return service.handleRpc(request);
}
