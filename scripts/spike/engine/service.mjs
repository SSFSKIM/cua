// The own native engine spike's service (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, M0 "Spike";
// Design "The service"; the Decision Log's "M0 spike pre-flight"): the module src/services/sky.mjs (the trusted `sky`
// wrapper) delegates to through CUA_SKY_VENDOR_SERVICE, in the vendor service's place. It exports handleRpc, as the
// vendor's does, and answers the facade (src/cua-api) unchanged:
//   {type: 'setup'}                         → {target: 'mac', methods: the 11 names}
//   {type: 'execute', method, args: [input]} → what the vendor's method returns
// by forwarding to cua's engine (./client.mjs) at the bundle CUA_ENGINE_APP names. Every app-scoped method first
// resolves the app (`resolve_app`), refuses what the engine refuses (the forbidden list), then asks one elicitation per
// (connection, app) with the vendor's message and meta (R/A-contract.md §2.6) and answers repeats itself, accepts and
// declines alike, as the supervisor's approval memory will from M1a; the engine call runs under
// `nodeRepl.withSuspendedTimeout` with the resolved path in place of `app`, as the vendor's policy wrapper does.
// `get_app_state` always asks for the screenshot, since the facade's getAXState and getScreenshot send the same request
// and the vendor captures on every observation (F §4.8), and renders the Skyshot with the stand-in renderer
// (./render.mjs); there is no diff in the spike, so the default mode returns the full text too.
//
// Result meta (Design "The service", Result meta; spec at 25fa9b1): codex/toolSurface per call; cua/nativeEngine {engine,
// version, build} and cua/engineMs (the client's time around the socket round trip of the method's own request) on
// every result; on a get_app_state result cua/settle from the Skyshot's `settle` ("capped" when the settle that
// preceded the observation hit its cap: the settle runs at the next observation, not inside the action); and on input
// results and input errors the engine's meta as cua/inputRoute, cua/actionInterval {startedAt, endedAt}, cua/receivedAt
// and cua/hidIdleMs. Response meta merges by key across an execution's calls, so every call first resets these
// per-call keys to null and a call that does not set one leaves no earlier call's value standing as its own.
//
// Spike-only (not advertised by setup, so the facade and the model never see it; a cell reaches it through
// `nodeRepl.rpc('sky', …)`, which the wrapper delegates untouched): {type: 'spike', op: 'last_observation', app} →
// {app, skyshot, text} of the latest observation of that app (by the string it was asked with, or its resolved path),
// or null: the raw Skyshot JSON beside the text the facade got from the same observation, for the goldens and for the
// engine's per-phase `timings`.
import {mkdirSync, chmodSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createEngineClient, SkyComputerUseError} from './client.mjs';
import {render} from './render.mjs';

export const METHODS = ['list_apps', 'get_app_state', 'click', 'drag', 'paste', 'perform_secondary_action', 'press_key', 'scroll', 'select_text', 'set_value', 'type_text'];
const APP_SCOPED = new Set(METHODS.filter(method => method !== 'list_apps'));
const TOOL_SURFACE = 'codex/toolSurface';
const CHROME = 'com.google.Chrome';

// Risk (Design "Policy and approvals": terminals and browsers high, with the subtitle). The vendor's lists as E §6.1
// reads them, with Chrome, which the binary's string uniquing hides from its browser list; the subtitle is the
// vendor's sentence naming Computer Use rather than ChatGPT.
const HIGH_RISK = new Set([
  'com.apple.Terminal', 'com.googlecode.iterm2', 'dev.warp.Warp-Stable', 'net.kovidgoyal.kitty', 'com.github.wez.wezterm', 'com.mitchellh.ghostty',
  'com.raphaelamorim.rio', 'dev.commandline.waveterm', 'org.alacritty', 'co.zeit.hyper', 'org.tabby',
  'com.apple.Safari', 'com.apple.SafariTechnologyPreview', 'com.openai.atlas', 'com.openai.atlas.alpha', 'com.openai.atlas.beta', 'ai.perplexity.comet',
  'com.brave.Browser', 'com.microsoft.edgemac', 'com.operasoftware.Opera', 'com.vivaldi.Vivaldi', 'company.thebrowser.Browser',
  'company.thebrowser.browser', 'company.thebrowser.dia', 'org.chromium.Chromium', 'org.mozilla.firefox', 'org.mozilla.nightly',
  'com.duckduckgo.macos.browser', CHROME,
].map(id => id.toLowerCase()));
const RISK_SUBTITLE = 'Allowing Computer Use to use this app introduces new risks, including those related to prompt injection attacks, such as data theft or loss. Carefully monitor Computer Use while it uses this app.';
// Answers kept for the connection's lifetime (the vendor host stored allowed and denied); a cancel is asked again.
const REMEMBERED = new Set(['accept', 'decline']);
// The per-call keys, reset at the start of every call (see the header).
const PER_CALL = {'cua/engineMs': null, 'cua/settle': null, 'cua/inputRoute': null, 'cua/actionInterval': null, 'cua/receivedAt': null, 'cua/hidIdleMs': null};

// The vendor policy's input check (S/targets/mac/computer-use-policy.js): an object whose `app` is a non-empty string
// data property.
function checkedInput(input) {
  if (typeof input !== 'object' || input === null) throw new Error('Computer Use app approval requires an object input');
  const app = Object.getOwnPropertyDescriptor(input, 'app');
  if (!app || !('value' in app)) throw new Error('Computer Use app approval requires app to be a plain data property');
  if (typeof app.value !== 'string' || app.value.trim() === '') throw new Error('Computer Use app approval requires a non-empty app');
  return input;
}

// The call id of the turn metadata, as the vendor's policy reads it for tool_call_id.
function toolCallId(nodeRepl) {
  let metadata = nodeRepl.requestMeta?.['x-codex-turn-metadata'];
  if (typeof metadata === 'string') { try { metadata = JSON.parse(metadata); } catch { return undefined; } }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  for (const key of ['call_id', 'item_id']) if (typeof metadata[key] === 'string' && metadata[key].trim()) return metadata[key].trim();
  return undefined;
}

function required(nodeRepl, name) {
  if (typeof nodeRepl?.[name] !== 'function') throw new Error(`Computer Use requires nodeRepl.${name}`);
  return nodeRepl[name].bind(nodeRepl);
}

// `nodeRepl` is the trusted worker's; `client` the engine client (one per connection: the worker is the connection's),
// made from nodeRepl.env.CUA_ENGINE_APP when not given.
export function createService({nodeRepl, client = null}) {
  const approvals = new Map();      // approval key → Promise<action>
  const observations = new Map();   // app string or resolved path → {app, skyshot, text}
  const lineages = new Map();       // resolved path → the lineage of its last observation
  let outputDirectory = null;

  const engine = () => {
    if (client) return client;
    const appPath = nodeRepl.env?.CUA_ENGINE_APP;
    if (typeof appPath !== 'string' || !appPath.startsWith('/')) throw new Error('cua: the spike engine is not configured: CUA_ENGINE_APP must name the engine bundle by absolute path');
    return (client = createEngineClient({nodeRepl, appPath}));
  };
  const setMeta = meta => nodeRepl.setResponseMeta?.(meta);
  const startCall = () => setMeta(PER_CALL);
  const toolSurface = bundle => setMeta({[TOOL_SURFACE]: {app: bundle ? {appId: bundle, kind: 'appId'} : null, kind: 'computerUse'}, ...(bundle === CHROME ? {'codex/computerUseChrome': true} : {})});

  // The engine's identity, and any launch wait, under the suspended budget.
  async function connected() {
    const c = engine();
    if (!c.connected) await required(nodeRepl, 'withSuspendedTimeout')(() => c.connect());
    return c;
  }

  // One engine request; its round trip and the engine's identity go into the result meta.
  async function call(method, args, options) {
    const c = await connected();
    try {
      const {result, engineMs} = await c.execute(method, args, options);
      setMeta({'cua/nativeEngine': nativeEngine(c), 'cua/engineMs': Math.round(engineMs * 1000) / 1000});
      return result;
    } catch (error) {
      // Response meta merges by key: a failed call must not leave an earlier call's round trip standing as its own.
      setMeta({...(c.identity ? {'cua/nativeEngine': nativeEngine(c)} : {}), 'cua/engineMs': null});
      if (error instanceof SkyComputerUseError && error.meta) setMeta(inputMeta(error.meta));
      throw error;
    }
  }
  const nativeEngine = c => ({engine: 'cua', version: c.identity.engineVersion, build: c.identity.build});

  async function resolve(app) {
    try {
      return await call('resolve_app', {app});
    } catch (error) {
      // The forbidden list: the vendor's policy refuses with a plain sentence, not a server error.
      if (error instanceof SkyComputerUseError && error.errorName === 'appNotAllowed') throw new Error(error.message.replace(/^Computer Use server error -?\d+: /, ''));
      throw error;
    }
  }

  async function ask(toolName, target, key) {
    const bundle = target.bundleIdentifier ?? target.appPath;
    const risk = HIGH_RISK.has(String(bundle).toLowerCase()) ? 'high' : 'low';
    const callId = toolCallId(nodeRepl);
    const answer = await required(nodeRepl, 'createElicitation')({
      message: `Allow Computer Use to use "${target.displayName}"?`,
      meta: {
        codex_approval_kind: 'mcp_tool_call', connector_id: 'computer-use', connector_name: 'Computer Use', persist: ['session'], riskLevel: risk,
        ...(risk === 'high' ? {subtitle: RISK_SUBTITLE} : {}), ...(callId ? {tool_call_id: callId} : {}),
        tool_name: toolName, tool_params: {app: bundle}, tool_params_display: [{name: 'app', display_name: 'App', value: target.displayName}],
      },
    });
    if (!REMEMBERED.has(answer?.action)) approvals.delete(key);
    return answer?.action;
  }

  async function approve(toolName, target) {
    const key = target.bundleIdentifier ?? target.appPath;
    let decision = approvals.get(key);
    if (!decision) {
      decision = ask(toolName, target, key);
      approvals.set(key, decision);
      decision.catch(() => approvals.delete(key));
    }
    if (await decision !== 'accept') throw new Error(`Computer Use was not approved to use ${target.displayName}`);
  }

  function screenshotDirectory() {
    if (outputDirectory) return outputDirectory;
    const dir = join(nodeRepl.env?.TMPDIR || tmpdir(), 'cua-engine-screenshots');
    mkdirSync(dir, {recursive: true, mode: 0o700});
    chmodSync(dir, 0o700);
    return (outputDirectory = dir);
  }

  async function getAppState(given, target) {
    const args = {app: target.appPath, includeScreenshot: true, outputDirectory: screenshotDirectory(), ...(given.disableDiff !== undefined ? {disableDiff: given.disableDiff} : {})};
    const skyshot = await call('get_app_state', args);
    const text = render(skyshot);
    const observation = {app: target.appPath, skyshot, text};
    observations.set(given.app, observation);
    observations.set(target.appPath, observation);
    lineages.set(target.appPath, skyshot.lineage);
    if (skyshot.settle) setMeta({'cua/settle': skyshot.settle});
    return {app: target.appPath, screenshot: skyshot.screenshot?.url ? {url: skyshot.screenshot.url} : null, text};
  }

  // An input method (and every other app-scoped one the spike engine does not implement yet): forwarded as the facade
  // sent it, by path, with the lineage the last observation of the app carried.
  async function act(method, given, target) {
    const lineage = lineages.get(target.appPath);
    const result = await call(method, {...given, app: target.appPath}, lineage ? {lineage} : {});
    if (result?.meta) setMeta(inputMeta(result.meta));
    return undefined;
  }

  async function appScoped(method, raw) {
    startCall();
    toolSurface(null);
    const given = checkedInput(raw);
    const target = await resolve(given.app);
    toolSurface(target.bundleIdentifier);
    await approve(method, target);
    return required(nodeRepl, 'withSuspendedTimeout')(() => (method === 'get_app_state' ? getAppState(given, target) : act(method, given, target)));
  }

  async function listApps() {
    startCall();
    toolSurface(null);
    const rows = await call('list_apps', {});
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
      case 'spike':
        if (request.op === 'last_observation') return observations.get(request.app) ?? null;
        throw new Error(`unknown spike request: ${String(request.op)}`);
      default: throw new Error(`Unsupported sky request type: ${String(request?.type)}`);
    }
  }
  return {handleRpc};
}

// The engine's input meta as result meta.
function inputMeta(meta) {
  return {
    ...(meta.inputRoute !== undefined ? {'cua/inputRoute': meta.inputRoute} : {}),
    'cua/actionInterval': {startedAt: meta.startedAt ?? null, endedAt: meta.endedAt ?? null},
    ...(meta.receivedAt !== undefined ? {'cua/receivedAt': meta.receivedAt} : {}),
    ...(meta.hidIdleMs !== undefined ? {'cua/hidIdleMs': meta.hidIdleMs} : {}),
  };
}

// The service as the trusted worker loads it: one per worker, on the worker's nodeRepl.
let service = null;
export function handleRpc(request) {
  service ??= createService({nodeRepl: globalThis.nodeRepl});
  return service.handleRpc(request);
}
