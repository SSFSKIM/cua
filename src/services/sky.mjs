// The trusted "sky" service: node_repl's trusted worker loads this module (NODE_REPL_TRUSTED_SERVICES, registered by
// `cua serve` through buildLaunch) in place of the vendor's @oai/sky/service, and every request is delegated to that
// vendor module, named by the launcher in CUA_SKY_VENDOR_SERVICE (never by agent input). The vendor sky service
// exports only handleRpc and registers no lifecycle hooks, so delegating handleRpc keeps everything it does.
//
// Secret substitution. Exactly these pinned commands (@oai/sky 0.7.5 mac targets, as the cua API sends them through
// nodeRepl.rpc("sky", …)) are eligible, and only when the eligible field is entirely `{{secret:<label>}}`:
//   {type:"execute", method:"paste",     args:[{app, text, format?}]}      text    (format absent or "text")
//   {type:"execute", method:"type_text", args:[{app, text}]}               text
//   {type:"execute", method:"set_value", args:[{app, element_index, value}]} value   (element_index an integer)
// with a string method and string app/text/value: since the vendor looks methods up by coerced property key, a
// reference in a request that only coerces to one of these (e.g. method ["paste"]) fails closed too.
// The stored value is read from this connection's private broker (src/secrets/client.mjs, over nodeRepl.nativePipe)
// and placed in a copy of the request handed to the vendor. Everything else is delegated untouched: other methods,
// other fields, text that merely contains a marker, and arbitrary JavaScript, which is never scanned.
//
// Failing closed: a reference with an invalid label, an unknown label, a denied or locked Keychain, secrets turned off
// or unavailable, or a reference in any other shape of an eligible command fails before anything is delivered. If the
// vendor fails after substitution, the rejection is a fixed, bounded diagnostic instead of the vendor's error, whose
// message, stack or properties may carry the value (SkyComputerUseError keeps the request it sent). The trusted worker
// returns a rejection's message to model code and console output to the model, so this module never logs, and no
// error it raises carries a cause, a vendor payload or anything derived from the value. Labels are not secret.
import {pathToFileURL} from 'node:url';
import {parseReference} from '../secrets/reference.mjs';
import {BROKER_ENV, BrokerError, brokerClientFromEnv} from '../secrets/client.mjs';

// Each eligible command's input: its keys and the primitive type each must have (`optional` keys may be absent).
const isString = value => typeof value === 'string';
const ELIGIBLE = {
  paste: {field: 'text', fields: {app: isString, text: isString, format: value => value === 'text'}, optional: ['format']},
  type_text: {field: 'text', fields: {app: isString, text: isString}, optional: []},
  set_value: {field: 'value', fields: {app: isString, element_index: Number.isInteger, value: isString}, optional: []},
};
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

// Broker client codes -> what the caller is told. Codes absent here (transport and protocol failures) mean secrets
// are unavailable on this connection.
const BROKER_OUTCOMES = {
  not_found: 'secret_not_found',
  denied: 'secret_denied',
  locked: 'secret_locked',
  unsupported_value: 'secret_unsupported_value',
  invalid_label: 'invalid_secret_label',
};
const LAUNCH_CODE = /^[a-z][a-z_]{0,63}$/;
const NOTHING_ENTERED = 'nothing was entered';

export class SecretInputError extends Error {
  constructor(code, sentence) {
    super(`cua: ${sentence} [${code}]`);
    this.name = 'SecretInputError';
    this.code = code;
  }
}

const isPlainObject = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

// The property key the vendor service would look the method up by: it indexes its client with request.method, which
// coerces (["paste"] reaches paste), so eligibility is judged on the same key and the pinned shape then demands a
// plain string. Requests arrive JSON-decoded, so coercion runs no foreign code; anything uncoercible is ineligible.
function methodKey(method) {
  if (typeof method === 'string') return method;
  try { return String(method); } catch { return null; }
}

// The substitution a request asks for: null to delegate it untouched, or {method, rule, input, reference, request}.
function substitutionFor(request) {
  if (!isPlainObject(request) || request.type !== 'execute') return null;
  const method = methodKey(request.method);
  if (method === null || !Object.hasOwn(ELIGIBLE, method)) return null;
  if (!Array.isArray(request.args) || request.args[0] === null || typeof request.args[0] !== 'object') return null;
  const rule = ELIGIBLE[method];
  const input = request.args[0];
  const reference = parseReference(input[rule.field]);
  if (!reference) return null;
  return {method, rule, input, reference, request};
}

// Exactly the pinned request: a string method, one plain-object argument, only the pinned keys, each of its pinned
// primitive type (paste only in text format).
function checkShape({method, rule, input, request}) {
  const keys = Object.keys(rule.fields);
  const pinned = typeof request.method === 'string'
    && request.args.length === 1
    && isPlainObject(input)
    && Object.keys(request).every(key => REQUEST_KEYS.includes(key))
    && Object.keys(input).every(key => keys.includes(key))
    && keys.every(key => Object.hasOwn(input, key) ? rule.fields[key](input[key]) : rule.optional.includes(key));
  if (!pinned) throw new SecretInputError('unsupported_secret_shape', `a {{secret:…}} reference is expanded only as the whole ${rule.field} of ${method} in its pinned shape (${keys.join(', ')}${method === 'paste' ? '; text format' : ''}); ${NOTHING_ENTERED}`);
}

function unavailable(reason) {
  if (reason === 'secrets_disabled') return new SecretInputError('secrets_disabled', `secrets are turned off for this server (CUA_SHIM_SECRETS=off); ${NOTHING_ENTERED}`);
  return new SecretInputError('secrets_unavailable', `secrets are unavailable on this connection (${reason}); ${NOTHING_ENTERED}`);
}

function readFailure(error, label) {
  const code = error instanceof BrokerError ? error.code : 'error';
  switch (BROKER_OUTCOMES[code]) {
    case 'secret_not_found': return new SecretInputError('secret_not_found', `no secret named "${label}" (secrets_list shows the stored labels); ${NOTHING_ENTERED}`);
    case 'secret_denied': return new SecretInputError('secret_denied', `Keychain access to secret "${label}" was denied; ${NOTHING_ENTERED}`);
    case 'secret_locked': return new SecretInputError('secret_locked', `the Keychain is locked, so secret "${label}" could not be read; ${NOTHING_ENTERED}`);
    case 'secret_unsupported_value': return new SecretInputError('secret_unsupported_value', `secret "${label}" is not valid UTF-8 text; ${NOTHING_ENTERED}`);
    case 'invalid_secret_label': return invalidLabel();
    default: return unavailable(code);
  }
}

const invalidLabel = () => new SecretInputError('invalid_secret_label', `a {{secret:…}} reference must name a label of 1-128 letters, digits, '.', '_' or '-', starting with a letter or digit; ${NOTHING_ENTERED}`);

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

// `loadVendor` resolves the vendor service module; `secrets` reads a label's value (a broker client);
// `secretsUnavailable`, when set, is the launch's reason this connection has no broker.
export function createSkyService({loadVendor, secrets, secretsUnavailable = null}) {
  let vendor = null;
  const vendorService = () => (vendor ??= loadVendor());

  async function handleRpc(request) {
    const plan = substitutionFor(request);
    if (!plan) return (await vendorService()).handleRpc(request);

    const {method, rule, input, reference} = plan;
    if (reference.invalid) throw invalidLabel();
    checkShape(plan);
    if (secretsUnavailable) throw unavailable(secretsUnavailable);
    const service = await vendorService();
    let value;
    try { value = await secrets.read(reference.label); } catch (error) { throw readFailure(error, reference.label); }

    try {
      return await service.handleRpc({type: 'execute', method, args: [{...input, [rule.field]: value}]});
    } catch (error) {
      throw new SecretInputError('secret_input_failed', `${method} with secret "${reference.label}" failed (${vendorFailureKind(error)}) after the secret was read; it may have been partly entered. The runtime's error is withheld because it can contain the secret`);
    }
  }
  return {handleRpc};
}

// The service as the trusted worker runs it, configured by the launch environment.
export function skyServiceFromEnv(env = process.env) {
  const vendorPath = env.CUA_SKY_VENDOR_SERVICE;
  const reason = env[BROKER_ENV.unavailable];
  const secrets = brokerClientFromEnv({env});
  const configured = env[BROKER_ENV.endpoint] && env[BROKER_ENV.token];
  return createSkyService({
    loadVendor: async () => {
      if (!vendorPath) throw new Error('cua: the vendor sky service is not configured for this runtime [sky_not_configured]');
      return import(pathToFileURL(vendorPath).href);
    },
    secrets,
    secretsUnavailable: configured ? null : (LAUNCH_CODE.test(reason ?? '') ? reason : 'secrets_not_configured'),
  });
}

let service = null;
export function handleRpc(request) {
  service ??= skyServiceFromEnv();
  return service.handleRpc(request);
}
