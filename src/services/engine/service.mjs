// cua's own macOS engine service (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Design "The service";
// #117): the module CUA_SKY_SERVICE names in place of @oai/sky's service, which the trusted wrapper src/services/sky.mjs
// delegates to. It exports handleRpc, as the vendor's does, and answers the facade (src/cua-api) unchanged:
//
//   {type: 'setup'}                          -> {target: 'mac', methods: the 11 names}
//   {type: 'execute', method, args: [input]} -> what the vendor's method returns: list_apps its rows, get_app_state
//                                               {app, screenshot: {url} | null, text}, every input method undefined
//
// by forwarding to cua's engine (./client.mjs) at the bundle CUA_ENGINE_APP names. Every method but list_apps runs under
// the policy (./policy.mjs): the app resolved, refused when forbidden, approved by an elicitation on every call (the
// host remembers the answer per connection), and the action run on the resolved path. The service adds, around a request
// it otherwise forwards in the facade's shape:
//
// - App resolution once per (connection, app string) (the Decision Log's pre-flight entry as revised 2026-10-19): the
//   identity is kept and resolved again only when an observation names another pid than the kept one, or the engine
//   answers runningApplicationNotFound. The engine resolves for itself on every request and enforces the forbidden list
//   there, so the kept identity skips nothing that guards. An observation of another bundle than the approved one is
//   discarded and the call redone once (resolved, approved, observed), so no text of an unapproved app is returned.
// - Observation: get_app_state always asks for the screenshot, since the facade's getAXState and getScreenshot send the
//   same request and the vendor captures on every observation. The image goes to the directory the launcher names in
//   CUA_ENGINE_SCREENSHOTS, under the session's run directory, which the kernel may read; the engine creates it, outside
//   every sandbox and never through a symbolic link, since the worker writes nothing in the default mode. The Skyshot
//   becomes the model's text through ./observations.mjs: the numbering over the engine's tokens, the renderer, and the
//   diff per (connection, app).
// - Index translation: an element_index becomes `element`, the token the app's latest observation numbered so, and every
//   execute carries the lineage of that observation (coordinates and keys too), which the engine checks.
// - Result meta, per call (response meta merges by key across an execution's calls, so each call resets its keys and
//   one that does not set a key leaves no earlier call's value standing as its own): codex/toolSurface (the policy's);
//   cua/nativeEngine {engine, version, build} on every result; cua/engineMs, the client's time around the socket round
//   trip of the method's own request, null when it never reached the engine (a decline, an index the service refused);
//   cua/settle on an observation whose settle hit its cap; on input results and input errors the engine's meta as
//   cua/inputRoute, cua/actionInterval {startedAt, endedAt}, cua/receivedAt, cua/hidIdleMs, and cua/activationGuardMs
//   and cua/pointUnconfirmed when the engine sends them. (cua/serviceMs is the wrapper's, M2a.)
import {createEngineClient} from './client.mjs';
import {createObservations} from './observations.mjs';
import {createPolicy, toolSurface} from './policy.mjs';

export const METHODS = ['list_apps', 'get_app_state', 'click', 'drag', 'paste', 'perform_secondary_action', 'press_key', 'scroll', 'select_text', 'set_value', 'type_text'];
const APP_SCOPED = new Set(METHODS.filter(method => method !== 'list_apps'));
// The keys a call sets only sometimes, reset at its start.
const PER_CALL = {
  'cua/engineMs': null, 'cua/settle': null, 'cua/inputRoute': null, 'cua/actionInterval': null, 'cua/receivedAt': null, 'cua/hidIdleMs': null,
  'cua/activationGuardMs': null, 'cua/pointUnconfirmed': null,
};

// An observation of another bundle than the approved one (internal: the call is redone once).
class IdentityChanged extends Error {}

// The engine's input meta as result meta.
function inputMeta(meta) {
  return {
    'cua/inputRoute': meta.inputRoute ?? null,
    'cua/actionInterval': {startedAt: meta.startedAt ?? null, endedAt: meta.endedAt ?? null},
    'cua/receivedAt': meta.receivedAt ?? null,
    'cua/hidIdleMs': meta.hidIdleMs ?? null,
    ...(meta.activationGuardMs !== undefined ? {'cua/activationGuardMs': meta.activationGuardMs} : {}),
    ...(meta.pointUnconfirmed !== undefined ? {'cua/pointUnconfirmed': meta.pointUnconfirmed} : {}),
  };
}

// `nodeRepl` is the trusted worker's; `client` the engine client (one per connection, since the worker is the
// connection's), made from nodeRepl.env.CUA_ENGINE_APP when not given.
export function createService({nodeRepl, client = null}) {
  const identities = new Map();   // app string -> Promise of resolve_app's answer, kept for the connection
  const observations = createObservations();

  const setMeta = meta => nodeRepl?.setResponseMeta?.(meta);
  const engine = () => {
    if (client) return client;
    const appPath = nodeRepl?.env?.CUA_ENGINE_APP;
    if (typeof appPath !== 'string' || !appPath.startsWith('/')) {
      throw new Error('cua: the native engine is not configured for this runtime: CUA_ENGINE_APP must name the engine bundle by absolute path [engine_not_configured]');
    }
    return (client = createEngineClient({nodeRepl, appPath}));
  };
  const nativeEngine = identity => ({engine: 'cua', version: identity.engineVersion, build: identity.build});

  // One engine request; the engine's identity goes into the result meta, an input error's meta too, and the round trip
  // unless `own` is false (the policy's resolve_app, whose round trip is not the method's).
  async function call(method, args, options, {own = true} = {}) {
    const c = engine();
    try {
      const {result, engineMs} = await c.execute(method, args, options);
      setMeta({'cua/nativeEngine': nativeEngine(c.identity), ...(own ? {'cua/engineMs': Math.round(engineMs * 1000) / 1000} : {})});
      return result;
    } catch (error) {
      setMeta({...(c.identity ? {'cua/nativeEngine': nativeEngine(c.identity)} : {}), ...(own ? {'cua/engineMs': null} : {})});
      if (error?.name === 'SkyComputerUseError' && error.meta) setMeta(inputMeta(error.meta));
      throw error;
    }
  }

  // The kept identity of `app`, resolved on first use; concurrent first calls share the one request.
  function identityFor(app) {
    let pending = identities.get(app);
    if (!pending) {
      pending = call('resolve_app', {app}, {suspend: false}, {own: false});
      identities.set(app, pending);
      pending.catch(() => forget(app, pending));
    }
    return pending;
  }
  const forget = (app, pending) => { if (identities.get(app) === pending) identities.delete(app); };

  const policy = createPolicy({nodeRepl, resolve: identityFor});

  // The launcher's screenshot directory (src/runtime/launch.mjs), passed on for the engine to create: nothing here writes.
  function screenshotDirectory() {
    const dir = nodeRepl?.env?.CUA_ENGINE_SCREENSHOTS;
    if (typeof dir !== 'string' || !dir.startsWith('/')) {
      throw new Error('cua: the engine\'s screenshot directory is not configured for this runtime: CUA_ENGINE_SCREENSHOTS must name it by absolute path [engine_not_configured]');
    }
    return dir;
  }

  async function getAppState(given, input, target, outputDirectory) {
    const args = {app: target.appPath, includeScreenshot: true, outputDirectory, ...(input.disableDiff !== undefined ? {disableDiff: input.disableDiff} : {})};
    const skyshot = await call('get_app_state', args);
    const seen = skyshot.app ?? {};
    if ((seen.bundleIdentifier ?? null) !== (target.bundleIdentifier ?? null) || (seen.pid ?? null) !== (target.pid ?? null)) {
      forget(given, identities.get(given));
      if ((seen.bundleIdentifier ?? null) !== (target.bundleIdentifier ?? null)) throw new IdentityChanged();
    }
    const text = observations.observe(target.appPath, skyshot, {disableDiff: input.disableDiff === true});
    if (skyshot.settle) setMeta({'cua/settle': skyshot.settle});
    return {app: target.appPath, screenshot: skyshot.screenshot?.url ? {url: skyshot.screenshot.url} : null, text};
  }

  // Every other app-scoped method: forwarded in the facade's shape with the resolved path, the element token for an
  // element_index, and the lineage of the app's latest observation.
  async function act(method, input, target) {
    const {element_index: index, ...args} = input;
    let lineage = observations.lineage(target.appPath);
    if (index !== undefined) {
      const element = observations.element(target.appPath, index);
      args.element = element.token;
      lineage = element.lineage;
    }
    const result = await call(method, args, {lineage});
    if (result?.meta) setMeta(inputMeta(result.meta));
    return undefined;
  }

  async function appScoped(method, raw, redo = false) {
    setMeta(PER_CALL);
    const outputDirectory = method === 'get_app_state' ? screenshotDirectory() : null;
    let given = null;
    try {
      return await policy.withPolicy(method, raw, (input, target) => {
        given = raw.app;
        return method === 'get_app_state' ? getAppState(given, input, target, outputDirectory) : act(method, input, target);
      });
    } catch (error) {
      if (error instanceof IdentityChanged) {
        if (!redo) return appScoped(method, raw, true);
        throw new Error(`Computer Use could not observe ${given}: the app it names changed during the call; retry`);
      }
      if (given !== null && error?.name === 'SkyComputerUseError' && error.errorName === 'runningApplicationNotFound') forget(given, identities.get(given));
      throw error;
    }
  }

  async function listApps() {
    setMeta(PER_CALL);
    setMeta(toolSurface(null));
    const rows = await call('list_apps', {}, {suspend: false});
    return rows.map(row => Object.fromEntries(Object.entries({id: row.id, displayName: row.displayName, isRunning: row.isRunning, lastUsedDate: row.lastUsedDate, useCount: row.useCount})
      .filter(([, value]) => value !== undefined)));
  }

  async function handleRpc(request) {
    switch (request?.type) {
      case 'setup': return {target: 'mac', methods: [...METHODS]};
      case 'execute': {
        const method = request.method;
        if (method === 'list_apps') return listApps();
        if (!APP_SCOPED.has(method)) throw new Error(`Sky runtime method is not available: ${method}`);
        return appScoped(method, Array.isArray(request.args) ? request.args[0] : undefined);
      }
      default: throw new Error(`Unsupported sky request type: ${String(request?.type)}`);
    }
  }
  return {handleRpc};
}

// The service as the trusted worker loads it: one per worker (the worker is the connection's), on the worker's nodeRepl.
let service = null;
export function handleRpc(request) {
  service ??= createService({nodeRepl: globalThis.nodeRepl});
  return service.handleRpc(request);
}
