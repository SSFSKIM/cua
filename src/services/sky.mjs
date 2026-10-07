// The trusted "sky" service: node_repl's trusted worker loads this module (NODE_REPL_TRUSTED_SERVICES, registered by
// `cua serve` through buildLaunch) in place of the vendor's @oai/sky/service, and every request is delegated to that
// vendor module, named by the launcher in CUA_SKY_VENDOR_SERVICE (never by agent input). The vendor sky service
// exports only handleRpc and registers no lifecycle hooks, so delegating handleRpc keeps everything it does.
//
// Secret substitution. Exactly these pinned commands (@oai/sky 0.7.5, as the cua API sends them through
// nodeRepl.rpc("sky", …)) are eligible, and only when the eligible field is entirely `{{secret:<label>}}`. macOS:
//   {type:"execute", method:"paste",     args:[{app, text, format?}]}      text    (format absent or "text")
//   {type:"execute", method:"type_text", args:[{app, text}]}               text
//   {type:"execute", method:"set_value", args:[{app, element_index, value}]} value   (element_index an integer)
// Linux (tinysky_alt/bind_linux_app.js: paste is sent as type_text; setValue does not exist there):
//   {type:"execute", method:"type_text", args:[{window, text}]}            text    (window as the vendor returns it:
//                                                                                   a plain object of primitives with
//                                                                                   a positive integer id)
// with a string method and string app/text/value: since the vendor looks methods up by coerced property key, a
// reference in a request that only coerces to one of these (e.g. method ["paste"]) fails closed too.
// The stored value is read from the connection's secret store (src/secrets/store.mjs, the directory the launcher
// names) and placed in a copy of the request handed to the vendor. Everything else is delegated untouched: other methods,
// other fields, text that merely contains a marker, and arbitrary JavaScript, which is never scanned.
//
// Failing closed: a reference with an invalid label, an unknown label, a store file that is unsafe or unreadable,
// secrets turned off or unavailable, or a reference in any other shape of an eligible command fails before anything is
// delivered. If the vendor fails after substitution, the rejection is a fixed, bounded diagnostic instead of the vendor's error, whose
// message, stack or properties may carry the value (SkyComputerUseError keeps the request it sent). The trusted worker
// returns a rejection's message to model code and console output to the model, so this module never logs, and no
// error it raises carries a cause, a vendor payload or anything derived from the value. Labels are not secret.
import {pathToFileURL} from 'node:url';
import {parseReference} from '../secrets/reference.mjs';
import {
  SecretInputError, NOTHING_ENTERED, isPlainObject, propertyKey, matchesShape, invalidLabel, unavailable, readFailure, inputFailed, secretsFromEnv,
} from './secret-input.mjs';

export {SecretInputError};

// Each eligible command's input: its keys and the primitive type each must have (`optional` keys may be absent).
const isString = value => typeof value === 'string';
const isPrimitive = value => value === null || ['string', 'number', 'boolean'].includes(typeof value);
// The Linux window a bound app carries (sky_linux's get_window_state/list_windows entry, measured on Ubuntu 24.04:
// app, focused, height, id, modal, title, width, window_type, x, y): any primitive fields, a positive integer id.
const isLinuxWindow = value => isPlainObject(value) && Number.isSafeInteger(value.id) && value.id > 0 && Object.values(value).every(isPrimitive);
const ELIGIBLE_BY_PLATFORM = {
  darwin: {
    paste: {field: 'text', fields: {app: isString, text: isString, format: value => value === 'text'}, optional: ['format']},
    type_text: {field: 'text', fields: {app: isString, text: isString}, optional: []},
    set_value: {field: 'value', fields: {app: isString, element_index: Number.isInteger, value: isString}, optional: []},
  },
  linux: {
    type_text: {field: 'text', fields: {window: isLinuxWindow, text: isString}, optional: []},
  },
};
// Every method name some platform makes eligible: a reference in any of them is matched, and a shape this platform
// does not pin is refused (unsupported_secret_shape) rather than delivered.
const ALL_METHODS = new Set(Object.values(ELIGIBLE_BY_PLATFORM).flatMap(rules => Object.keys(rules)));
const FIELD_OF = {paste: 'text', type_text: 'text', set_value: 'value'};
const REQUEST_KEYS = ['type', 'method', 'args'];

// Error names of the pinned vendor SkyComputerUseError (ServerErrorCode in @oai/sky errors.js). Only these fixed
// names are repeated in a diagnostic; anything else from the vendor is withheld.
const VENDOR_ERROR_NAMES = new Set([
  'senderProcessNotAuthenticated', 'couldNotGetRequestData', 'couldNotGetRequestTypeName', 'couldNotResolveRequestType',
  'unhandledEvent', 'unknownError', 'appNotAllowed', 'runningApplicationNotFound', 'accessibilityError',
  'permissionsNotGranted', 'invalidApp', 'noActiveSession', 'userStoppedSession', 'incompatibleClientVersion',
  'permissionsPending', 'blockedURL', 'userIntervened', 'couldNotGetSenderPID', 'ambiguousApp',
  'couldNotGetBootstrapPort', 'screenLocked', 'jsonRPCError',
]);

// The substitution a request asks for: null to delegate it untouched, or {method, rule, input, reference, request}.
// The vendor indexes its client with request.method, so eligibility uses the coerced key (see propertyKey).
function substitutionFor(request, eligible) {
  if (request === null || typeof request !== 'object' || Array.isArray(request) || request.type !== 'execute') return null;
  const method = propertyKey(request.method);
  if (method === null || !ALL_METHODS.has(method)) return null;
  if (!Array.isArray(request.args) || request.args[0] === null || typeof request.args[0] !== 'object') return null;
  const field = FIELD_OF[method];
  const input = request.args[0];
  const reference = parseReference(input[field]);
  if (!reference) return null;
  return {method, rule: Object.hasOwn(eligible, method) ? eligible[method] : null, field, input, reference, request};
}

// Exactly the pinned request: a string method, one plain-object argument, only the pinned keys, each of its pinned
// primitive type (paste only in text format).
function checkShape({method, rule, field, input, request}) {
  if (!rule) throw new SecretInputError('unsupported_secret_shape', `a {{secret:…}} reference is not expanded in ${method} on this platform; ${NOTHING_ENTERED}`);
  const keys = Object.keys(rule.fields);
  const pinned = typeof request.method === 'string'
    && request.args.length === 1
    && Object.keys(request).every(key => REQUEST_KEYS.includes(key))
    && matchesShape(input, rule.fields, rule.optional);
  if (!pinned) throw new SecretInputError('unsupported_secret_shape', `a {{secret:…}} reference is expanded only as the whole ${field} of ${method} in its pinned shape (${keys.join(', ')}${method === 'paste' ? '; text format' : ''}); ${NOTHING_ENTERED}`);
}

// A fixed classification of a vendor failure, never its text.
function vendorFailureKind(error) {
  if (error instanceof Error) {
    if (error.name === 'SkyComputerUseError' && VENDOR_ERROR_NAMES.has(error.errorName)) return error.errorName;
    if (error.name === 'SkyComputerUseTransportError') return 'transport';
    if (/^Computer Use was not approved to use /.test(error.message)) return 'not_approved';
    if (/^Computer Use is (blocked from using|not allowed to use) the app /.test(error.message)) return 'app_blocked';
  }
  return 'failed';
}

// `loadVendor` resolves the vendor service module; `secrets` reads a label's value (the file store);
// `secretsUnavailable`, when set, is the launch's reason this connection has no store; `platform` picks the pinned
// shapes (the process's own; the vendor target matches the platform it runs on).
export function createSkyService({loadVendor, secrets, secretsUnavailable = null, platform = process.platform}) {
  const eligible = ELIGIBLE_BY_PLATFORM[platform] ?? {};
  let vendor = null;
  const vendorService = () => (vendor ??= loadVendor());

  async function handleRpc(request) {
    const plan = substitutionFor(request, eligible);
    if (!plan) return (await vendorService()).handleRpc(request);

    const {method, field, input, reference} = plan;
    if (reference.invalid) throw invalidLabel();
    checkShape(plan);
    if (secretsUnavailable) throw unavailable(secretsUnavailable);
    const service = await vendorService();
    let value;
    try { value = await secrets.read(reference.label); } catch (error) { throw readFailure(error, reference.label); }

    try {
      return await service.handleRpc({type: 'execute', method, args: [{...input, [field]: value}]});
    } catch (error) {
      throw inputFailed(method, reference.label, vendorFailureKind(error));
    }
  }
  return {handleRpc};
}

// The service as the trusted worker runs it, configured by the launch environment.
export function skyServiceFromEnv(env = process.env) {
  const vendorPath = env.CUA_SKY_VENDOR_SERVICE;
  return createSkyService({
    loadVendor: async () => {
      if (!vendorPath) throw new Error('cua: the vendor sky service is not configured for this runtime [sky_not_configured]');
      return import(pathToFileURL(vendorPath).href);
    },
    ...secretsFromEnv(env),
  });
}

let service = null;
export function handleRpc(request) {
  service ??= skyServiceFromEnv();
  return service.handleRpc(request);
}
