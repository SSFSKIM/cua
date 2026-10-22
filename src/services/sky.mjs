// The trusted "sky" service: node_repl's trusted worker loads this module (NODE_REPL_TRUSTED_SERVICES, registered by
// `cua serve` through buildLaunch) in place of the vendor's @oai/sky/service, and every request is delegated to the sky
// service the launcher names in CUA_SKY_SERVICE (never agent input): the vendor's @oai/sky/service, or on macOS cua's own
// (src/services/engine/, #117), which raises the vendor's error classes and names. Either exports only handleRpc and
// registers no lifecycle hooks, so delegating handleRpc keeps everything it does.
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
// names) and placed in a copy of the request handed to the vendor. On macOS that copy also carries `concealed: true`,
// which tells cua's engine the text is a secret: it is never pasted, and is keyed only under an input source the engine
// reads reliably, else refused before anything is entered (concealedInputUnavailable); the vendor's service reads only
// the fields it names and ignores the mark. sky_linux gets exactly its pinned shape. Everything else is delegated
// untouched: other methods, other fields, text that merely contains a marker, and arbitrary JavaScript, which is never
// scanned.
//
// Failing closed: a reference with an invalid label, a reserved one (a device credential: secret_reserved) or an unknown
// one, a store file that is unsafe or unreadable, secrets turned off or unavailable, or a reference in any other shape
// of an eligible command fails before anything is delivered. If the vendor fails after substitution, the rejection is a fixed, bounded diagnostic instead of the vendor's error, whose
// message, stack or properties may carry the value (SkyComputerUseError keeps the request it sent). The trusted worker
// returns a rejection's message to model code and console output to the model, so this module never logs, and no
// error it raises carries a cause, a vendor payload or anything derived from the value. Labels are not secret.
//
// Launching applications on Linux (#115 M3, docs/doperpowers/specs/2026-10-17-own-sandbox-design.md, Design "Linux
// computer sessions"): this service runs in the confined trusted worker, and sky_linux, its child, launches an
// application by fork/exec, so the application would start inside the worker's sandbox and die there (#115 M0's probe).
// So `{type: "execute", method: "launch_app", args: [{app}]}` with a string `app` and nothing else is answered here: the
// id must be in sky_linux's own inventory (`list_apps`), else it fails with sky_linux's sentence (`launchable
// application "<app>" was not found`); its desktop entry is found as the XDG specification finds a desktop file id
// (desktopEntryFor), and the supervisor launches it outside the sandbox (nodeRepl.launchServices.openApplication,
// src/repl-host/launch-services.mjs). It answers as the vendor's launch_app does (undefined). Any other launch_app shape
// goes to the vendor unchanged, as on macOS.
//
// Approvals on Linux (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, "The service", Policy and approvals,
// its Linux sentence): sky_linux has no policy of its own, so this wrapper asks through the policy module
// (./engine/policy.mjs createLinuxPolicy) where the vendor would be reached: after its own refusals (a secret reference
// it will not expand fails without asking), before a secret is read, and for launch_app once the id is found in
// sky_linux's inventory. A request the user did not approve reaches nothing. On macOS the service asks for itself (cua's
// engine service and the vendor's alike), so the wrapper asks nothing there.
import {statSync} from 'node:fs';
import {isAbsolute, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseReference} from '../secrets/reference.mjs';
import {createLinuxPolicy} from './engine/policy.mjs';
import {
  SecretInputError, NOTHING_ENTERED, isPlainObject, propertyKey, matchesShape, refuseUnusable, unavailable, readFailure, inputFailed, inputFailedUnentered, concealedInputUnavailable,
  interventionKind, userIntervened, secretsFromEnv,
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
    paste: {field: 'text', fields: {app: isString, text: isString, format: value => value === 'text'}, optional: ['format'], conceal: true},
    type_text: {field: 'text', fields: {app: isString, text: isString}, optional: [], conceal: true},
    set_value: {field: 'value', fields: {app: isString, element_index: Number.isInteger, value: isString}, optional: [], conceal: true},
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

// Error names a SkyComputerUseError may carry that a diagnostic repeats: the pinned vendor's (ServerErrorCode in @oai/sky
// errors.js); the five cua's engine raises that the vendor has no name for (the native engine spec's Interfaces); and
// the names a concealed set_value can stop under in cua's engine: its element's resolution, the element not settable,
// the value not of the element's type, the focus click finding nothing to click, the write refused. All are fixed
// names, never the value. invalidNumber and invalidDate do say the secret does not parse as the element's type, which
// is what the model must know to stop retrying it there. Anything else from the service is withheld.
const ADMITTED_ERROR_NAMES = new Set([
  'senderProcessNotAuthenticated', 'couldNotGetRequestData', 'couldNotGetRequestTypeName', 'couldNotResolveRequestType',
  'unhandledEvent', 'unknownError', 'appNotAllowed', 'runningApplicationNotFound', 'accessibilityError',
  'permissionsNotGranted', 'invalidApp', 'noActiveSession', 'userStoppedSession', 'incompatibleClientVersion',
  'permissionsPending', 'blockedURL', 'userIntervened', 'couldNotGetSenderPID', 'ambiguousApp',
  'couldNotGetBootstrapPort', 'screenLocked', 'jsonRPCError',
  'concealedInputUnavailable', 'inputSourceChanged', 'noScreenshotForCoordinates', 'activationFailed', 'windowMinimized',
  'elementNoLongerValid', 'elementAmbiguousBeforeRefetch', 'elementAmbiguousAfterRefetch', 'valueNotSettable', 'invalidNumber',
  'invalidDate', 'unsupportedValueType', 'cannotClickOffscreenElement', 'actionFailed',
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
    if (error.name === 'SkyComputerUseError' && ADMITTED_ERROR_NAMES.has(error.errorName)) return error.errorName;
    if (error.name === 'SkyComputerUseTransportError') return 'transport';
    if (/^Computer Use was not approved to use /.test(error.message)) return 'not_approved';
    if (/^Computer Use is (blocked from using|not allowed to use) the app /.test(error.message)) return 'app_blocked';
  }
  return 'failed';
}

// The desktop entry of desktop file id `id` (`org.gnome.gedit.desktop`, `kde-okular.desktop`) in the XDG data
// directories `env` names ($XDG_DATA_HOME or ~/.local/share first, then $XDG_DATA_DIRS or /usr/local/share:/usr/share),
// or null. As the Desktop Entry Specification maps them, a dash in the id may stand for a subdirectory of
// applications/; the first directory that has the entry wins.
export function desktopEntryFor(id, env) {
  if (typeof id !== 'string' || !/^[^/.][^/]*\.desktop$/.test(id)) return null;
  const file = path => { try { return statSync(path).isFile(); } catch { return false; } };
  const dir = path => { try { return statSync(path).isDirectory(); } catch { return false; } };
  const find = (base, rest) => {
    if (file(join(base, rest))) return join(base, rest);
    for (let i = rest.indexOf('-'); i > 0; i = rest.indexOf('-', i + 1)) {
      const sub = join(base, rest.slice(0, i));
      if (dir(sub)) { const found = find(sub, rest.slice(i + 1)); if (found) return found; }
    }
    return null;
  };
  const home = isAbsolute(env.XDG_DATA_HOME ?? '') ? env.XDG_DATA_HOME : join(env.HOME ?? '/', '.local', 'share');
  for (const data of [home, ...(env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(isAbsolute)]) {
    const found = find(join(data, 'applications'), id);
    if (found) return found;
  }
  return null;
}

// Exactly `{type: 'execute', method: 'launch_app', args: [{app: <string>}]}`: the app id, else null.
function launchAppId(request) {
  if (!isPlainObject(request) || request.type !== 'execute' || request.method !== 'launch_app' || !Object.keys(request).every(key => REQUEST_KEYS.includes(key))) return null;
  const input = Array.isArray(request.args) && request.args.length === 1 ? request.args[0] : null;
  return isPlainObject(input) && Object.keys(input).length === 1 && typeof input.app === 'string' ? input.app : null;
}

// `loadVendor` resolves the vendor service module; `secrets` reads a label's value (the file store);
// `secretsUnavailable`, when set, is the launch's reason this connection has no store; `platform` picks the pinned
// shapes (the process's own; the vendor target matches the platform it runs on). On Linux `openApplication` (the
// trusted worker's nodeRepl.launchServices.openApplication) launches a desktop entry outside the sandbox, and `env`
// names the XDG data directories it is found in. On Linux the approvals are asked through `nodeRepl` (the trusted
// worker's: createElicitation, requestMeta).
// On macOS every request's time through handleRpc, success or failure, is set as `cua/serviceMs` through
// `setResponseMeta` (the trusted worker's nodeRepl.setResponseMeta, on either host) read with `now`.
export function createSkyService({loadVendor, secrets, secretsUnavailable = null, platform = process.platform, env = process.env,
  nodeRepl = globalThis.nodeRepl, openApplication = target => globalThis.nodeRepl.launchServices.openApplication(target),
  now = () => performance.now(), setResponseMeta = meta => globalThis.nodeRepl?.setResponseMeta?.(meta)}) {
  const eligible = ELIGIBLE_BY_PLATFORM[platform] ?? {};
  let vendor = null;
  const vendorService = () => (vendor ??= loadVendor());
  const linuxPolicy = platform === 'linux'
    ? createLinuxPolicy({nodeRepl, listWindows: async () => (await vendorService()).handleRpc({type: 'execute', method: 'list_windows', args: []})})
    : null;
  // Resolves once `request` may reach the vendor: on Linux, approved (or not app-scoped); elsewhere at once.
  const approved = request => linuxPolicy?.approve(request, propertyKey(request?.method));

  async function launchLinuxApp(app, request) {
    const apps = await (await vendorService()).handleRpc({type: 'execute', method: 'list_apps', args: []});
    const entry = Array.isArray(apps) && apps.some(listed => listed?.id === app) ? desktopEntryFor(app, env) : null;
    if (!entry) throw new Error(`launchable application "${app}" was not found`);
    await approved(request);
    await openApplication({applicationPath: entry});
  }

  // cua/serviceMs (the native engine spec's Design, "Result meta"): everything below the wrapper, the service's policy
  // and approval and the engine together, so a single-call row separates the host's transport from it, on the vendor's
  // engine and on cua's alike. Response meta merges by key per execution, so a multi-call cell keeps its last call's.
  async function handleRpc(request) {
    if (platform !== 'darwin') return delegate(request);
    const started = now();
    try {
      return await delegate(request);
    } finally {
      setResponseMeta({'cua/serviceMs': Math.round((now() - started) * 1000) / 1000});
    }
  }

  async function delegate(request) {
    const app = platform === 'linux' ? launchAppId(request) : null;
    if (app !== null) return launchLinuxApp(app, request);
    const plan = substitutionFor(request, eligible);
    if (!plan) {
      await approved(request);
      return (await vendorService()).handleRpc(request);
    }

    const {method, rule, field, input, reference} = plan;
    refuseUnusable(reference);
    checkShape(plan);
    if (secretsUnavailable) throw unavailable(secretsUnavailable);
    const service = await vendorService();
    await approved(request);
    let value;
    try { value = await secrets.read(reference.label); } catch (error) { throw readFailure(error, reference.label); }

    try {
      return await service.handleRpc({type: 'execute', method, args: [{...input, [field]: value, ...(rule.conceal ? {concealed: true} : {})}]});
    } catch (error) {
      const kind = vendorFailureKind(error);
      // cua's engine refused the concealed request before entering anything: no keyed route it trusts, and no paste.
      if (kind === 'concealedInputUnavailable') throw concealedInputUnavailable(method, reference.label);
      // cua's engine says nothing was posted (its input meta's startedAt null), whatever the error's name.
      const unentered = error?.name === 'SkyComputerUseError' && Boolean(error.meta) && error.meta.startedAt === null;
      // The user intervened: which of its two sentences, so the model knows whether to wait or to re-query.
      const intervened = kind === 'userIntervened' ? interventionKind(error.message) : null;
      if (intervened) throw userIntervened(method, reference.label, intervened, unentered);
      if (unentered) throw inputFailedUnentered(method, reference.label, kind);
      throw inputFailed(method, reference.label, kind);
    }
  }
  return {handleRpc};
}

// The service as the trusted worker runs it, configured by the launch environment.
export function skyServiceFromEnv(env = process.env) {
  const servicePath = env.CUA_SKY_SERVICE;
  return createSkyService({
    loadVendor: async () => {
      if (!servicePath) throw new Error('cua: the sky service is not configured for this runtime (CUA_SKY_SERVICE) [sky_not_configured]');
      return import(pathToFileURL(servicePath).href);
    },
    ...secretsFromEnv(env),
    env,
  });
}

let service = null;
export function handleRpc(request) {
  service ??= skyServiceFromEnv();
  return service.handleRpc(request);
}
