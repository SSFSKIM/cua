// The standalone MCP server: one stdio connection, one owned runtime (one JavaScript heap), one random session ID.
//
//   client ──stdio──▶ server ──stdio──▶ relocated vendor node cua-repl ──▶ node_repl ──socket──▶ native helper
//
// Routing rules:
// - Every client request forwarded upstream gets a proxy-owned upstream ID, and the server's own requests (the
//   private turn_ended completion) come from the same counter, so the two namespaces can never collide and an internal
//   reply can never answer a caller. Requests the runtime sends the client keep the runtime's IDs; the server sends
//   the client none of its own.
// - js/js_reset go through the task state machine (task.mjs): serialized, stamped with the session ID, the task ID as
//   turn ID and a fresh call ID. end_task, secrets_list and (with the browser surface) profiles_list are answered here;
//   hidden upstream tools are refused.
// - profiles_list reads the registered Chrome profiles (src/profiles) when asked: key, readiness, the instance id of a
//   ready profile, the reason of one that is not (with what to tell the user in the text); never a Chrome directory.
//   Readiness includes the live check (a bound instance among the live backends), so it can take a runtime launch.
// - secrets_list asks the connection's secrets provider (its private broker, src/secrets/broker.mjs) for labels; it
//   never sees a value. Without a provider, or when the provider says why secrets are unavailable, it reports that.
// - Control traffic is never queued behind JavaScript: cancellations and elicitation answers go straight upstream.
// - Image MIME types are corrected; accepted app approvals get `_meta.persist`.
// On EOF or a signal the connection becomes terminal (Closing), makes a bounded best-effort completion, then tears
// down the owned runtime and the secrets broker, concurrently and within the teardown budget, and writes any local
// reply still being computed (a profiles_list listing) before the MCP stream's final bounded flush. A failure
// (completion uncertainty, runtime exit) does the same without the completion attempt.
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
import {chmodSync, mkdirSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {TaskLifecycle} from './task.mjs';
import {spawnUpstream} from './upstream.mjs';
import {
  LOCAL_TOOLS, WORK_TOOLS, correctImages, hostNotesFor, modelTools, persistAccepted, profileView, statusResult, withHostNotes,
} from './surface.mjs';
import {resolveRuntime} from '../runtime/manifest.mjs';
import {buildLaunch, SKY_SERVICE, BROWSER_SERVICE} from '../runtime/launch.mjs';
import {fail} from '../runtime/errors.mjs';
import {homeLayout, realHome} from '../runtime/layout.mjs';
import {locateHelper} from '../secrets/helper.mjs';
import {openSecrets} from '../secrets/broker.mjs';
import {chromeFacts} from '../profiles/chrome.mjs';
import {reasonText} from '../profiles/registry.mjs';
import {profileReadiness} from '../profiles/commands.mjs';
import {listLiveBackends} from '../profiles/inventory.mjs';

const idKey = id => JSON.stringify(id);
const PERSIST_MODES = ['session', 'always', 'none'];
const COMPLETION_CODES = new Set(['completion_timeout', 'completion_failed']);
const NOT_CONFIGURED = {
  unavailable: {code: 'secrets_not_configured', message: 'secret storage is not configured for this server'},
  close: async () => ({confirmed: true, steps: []}),
};
const LIST_CODES = new Set(['not_configured', 'disconnected', 'timeout', 'protocol', 'unauthorized', 'denied', 'locked', 'unavailable']);
const SURFACES = ['computer', 'browser'];
const NO_PROFILES = {list: () => []};

export function createServer({
  input, output, upstream, sessionId = randomUUID(), secrets = NOT_CONFIGURED, surfaces = ['computer'], profiles = NO_PROFILES,
  persist = 'session', hostNotes = hostNotesFor(surfaces), model,
  completionDeadlineMs = 5000, teardownBudgetMs = 5000, newId = randomUUID,
  diagnostics = line => process.stderr.write(`cua serve: ${line}\n`),
}) {
  let nextUpstreamId = 0;
  let clientModel = model;
  let tearingDown = false;
  let shutdown = null;
  let resolveClosed;
  const closed = new Promise(resolve => { resolveClosed = resolve; });
  const upstreamPending = new Map();   // upstream ID -> {resolve, clientKey?}
  const upstreamIdOf = new Map();      // client ID key -> upstream ID, for cancellation
  const queuedWork = new Map();        // client ID key -> lifecycle ticket, for withdrawing queued work
  const elicitations = new Set();      // runtime request ID keys awaiting the client's answer
  const localReplies = new Set();      // local tool replies still being computed (profiles_list may take a launch)

  // The client transport. Losing it closes the connection like EOF; callers are still settled internally, just not
  // answered.
  let transportOpen = true;
  const transportLost = () => { transportOpen = false; close('transport'); };
  output.on('error', transportLost);
  output.on('close', transportLost);
  const write = msg => {
    if (!transportOpen || output.destroyed || output.writableEnded) return;
    output.write(JSON.stringify(msg) + '\n');
  };
  const respond = (id, result) => write({jsonrpc: '2.0', id, result});
  const respondError = (id, code, message) => write({jsonrpc: '2.0', id, error: {code, message}});

  const turnMeta = (taskId, callId) => ({
    callId, threadId: sessionId, sessionId,
    'x-codex-turn-metadata': {session_id: sessionId, thread_id: sessionId, turn_id: taskId, call_id: callId, model: clientModel ?? 'mcp-client'},
  });

  function upstreamRequest(method, params, {clientKey} = {}) {
    const id = ++nextUpstreamId;
    return new Promise(resolve => {
      upstreamPending.set(id, {resolve, clientKey});
      if (clientKey !== undefined) upstreamIdOf.set(clientKey, id);
      if (upstream.send({jsonrpc: '2.0', id, method, params}) === false) settleUpstream(id, {error: {code: -32000, message: 'cua: the runtime is not running'}});
    });
  }

  function settleUpstream(id, reply) {
    const entry = upstreamPending.get(id);
    if (!entry) return;
    upstreamPending.delete(id);
    if (entry.clientKey !== undefined && upstreamIdOf.get(entry.clientKey) === id) upstreamIdOf.delete(entry.clientKey);
    entry.resolve(reply);
  }

  // The runtime can no longer answer: every outstanding upstream request resolves to an error reply once.
  function abandonUpstream(code) {
    for (const id of [...upstreamPending.keys()]) settleUpstream(id, {error: {code: -32000, message: `cua: ${code}: the runtime is no longer available`}});
  }

  const lifecycle = new TaskLifecycle({
    sessionId, completionDeadlineMs, newId,
    complete: ({taskId, callId}) => upstreamRequest('tools/call', {
      name: 'turn_ended',
      arguments: {hook_event_name: 'Stop', session_id: sessionId, turn_id: taskId},
      _meta: turnMeta(taskId, callId),
    }),
    onTerminal: info => {
      if (info.state !== 'failed') return;
      diagnostics(`connection failed (${info.code}${info.stage ? `, ${info.stage}` : ''}); tearing down its runtime`);
      abandonUpstream('connection_failed');
      close('failed');
    },
  });
  const terminal = () => lifecycle.state === 'failed' || lifecycle.state === 'closing';

  function rejectionResult(error, {endTask = false} = {}) {
    const structured = {status: 'error', ...(endTask ? {ended: false} : {}), code: error.code};
    if (error.detail?.stage) structured.stage = error.detail.stage;
    if (COMPLETION_CODES.has(error.code)) structured.nativeCleanup = 'unconfirmed';
    return statusResult(structured, {isError: true, message: `cua: ${error.message}`});
  }

  function runWork(msg) {
    const key = idKey(msg.id);
    const ticket = lifecycle.submit(({taskId, callId}) => upstreamRequest('tools/call', {
      ...msg.params,
      _meta: {...(msg.params._meta ?? {}), ...turnMeta(taskId, callId)},
    }, {clientKey: key}));
    queuedWork.set(key, ticket);
    ticket.promise.then(({taskId, reply}) => {
      if (queuedWork.get(key) === ticket) queuedWork.delete(key);
      if (reply.error) return write({jsonrpc: '2.0', id: msg.id, error: reply.error});
      const result = correctImages(reply.result ?? {});
      respond(msg.id, {...result, _meta: {...(result._meta ?? {}), 'cua/taskId': taskId}});
    }, error => {
      if (queuedWork.get(key) === ticket) queuedWork.delete(key);
      if (error.code !== 'cancelled') respond(msg.id, rejectionResult(error));
    });
  }

  function endTask(msg) {
    lifecycle.endTask().then(
      result => respond(msg.id, statusResult(result)),
      error => respond(msg.id, rejectionResult(error, {endTask: true})),
    );
  }

  async function secretsList(msg) {
    if (secrets.unavailable) {
      const {code, message} = secrets.unavailable;
      return respond(msg.id, statusResult({status: 'unavailable', code}, {isError: true, message: `cua: ${message}`}));
    }
    try {
      const labels = [...await secrets.list()].sort();
      respond(msg.id, statusResult({status: 'ok', labels}));
    } catch (error) {
      const code = LIST_CODES.has(error?.code) ? error.code : 'unavailable';
      respond(msg.id, statusResult({status: 'error', code}, {isError: true, message: `cua: secret labels could not be listed (${code})`}));
    }
  }

  // A profile that is not ready says why in the text too: binding (and choosing between profiles) is the user's step.
  async function profilesList(msg) {
    try {
      const list = await profiles.list();
      const notReady = list.filter(p => !p.ready).map(p => `${p.key} is not ready (${p.reason}): ${reasonText(p)}.`);
      const message = notReady.length ? `${notReady.join('\n')}\nTell the user; do not bind or pick a profile for them.` : undefined;
      respond(msg.id, statusResult({status: 'ok', profiles: list.map(profileView)}, {message}));
    } catch (error) {
      const code = error?.code === 'profiles_invalid' ? 'profiles_invalid' : 'unavailable';
      respond(msg.id, statusResult({status: 'error', code}, {isError: true, message: `cua: the registered profiles could not be read (${code}); run cua profiles list for details`}));
    }
  }

  function passThrough(msg, rewrite = result => result) {
    upstreamRequest(msg.method, msg.params, {clientKey: idKey(msg.id)}).then(reply => {
      if (reply.error) write({jsonrpc: '2.0', id: msg.id, error: reply.error});
      else respond(msg.id, rewrite(reply.result));
    });
  }

  function onRequest(msg) {
    if (msg.method === 'tools/call') {
      const name = msg.params?.name;
      if (WORK_TOOLS.has(name)) return runWork(msg);
      if (name === 'end_task') return endTask(msg);
      const browserOnly = name === 'profiles_list' && !surfaces.includes('browser');
      if (!LOCAL_TOOLS.has(name) || browserOnly) return respondError(msg.id, -32602, `Unknown tool: ${name}`);
      if (terminal()) return respond(msg.id, rejectionResult({code: lifecycle.state === 'failed' ? 'connection_failed' : 'connection_closing', message: 'this connection accepts no more work'}));
      const reply = name === 'profiles_list' ? profilesList(msg) : secretsList(msg);
      localReplies.add(reply);
      return reply.finally(() => localReplies.delete(reply));
    }
    if (terminal()) return respondError(msg.id, -32000, `cua: ${lifecycle.state === 'failed' ? 'connection_failed' : 'connection_closing'}: this connection accepts no more requests`);
    if (msg.method === 'initialize') {
      clientModel ??= typeof msg.params?.clientInfo?.name === 'string' ? msg.params.clientInfo.name : undefined;
      return passThrough(msg, result => ({...result, instructions: withHostNotes(result?.instructions, hostNotes)}));
    }
    if (msg.method === 'tools/list') return passThrough(msg, result => ({...result, tools: modelTools(result?.tools, {surfaces})}));
    return passThrough(msg);
  }

  function onNotification(msg) {
    if (lifecycle.state === 'failed') return;
    if (msg.method === 'notifications/cancelled') {
      const key = idKey(msg.params?.requestId);
      if (queuedWork.get(key)?.cancel()) return;            // withdrawn before it reached the runtime
      const upstreamId = upstreamIdOf.get(key);
      if (upstreamId !== undefined) upstream.send({...msg, params: {...msg.params, requestId: upstreamId}});
      return;                                                 // end_task and local tools are not cancellable
    }
    upstream.send(msg);
  }

  // The client answering a request the runtime sent it (an elicitation, typically).
  function onClientResponse(msg) {
    if (lifecycle.state === 'failed') return;
    const key = idKey(msg.id);
    if (elicitations.delete(key) && msg.result) msg = {...msg, result: persistAccepted(msg.result, persist)};
    upstream.send(msg);
  }

  // readline re-emits an input error on its interface, where an unhandled one would throw out of the stream before
  // the input's own listener runs; both lead to the same close.
  const inputFailed = () => close('eof');
  createInterface({input}).on('line', line => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return respondError(null, -32700, 'Parse error'); }
    if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) return respondError(null, -32600, 'Invalid Request');
    if (msg.method !== undefined && msg.id !== undefined) onRequest(msg);
    else if (msg.method !== undefined) onNotification(msg);
    else if (msg.id !== undefined) onClientResponse(msg);
  }).on('error', inputFailed);
  input.on('end', () => close('eof'));
  input.on('error', inputFailed);

  upstream.onMessage(msg => {
    if (msg.method !== undefined) {
      if (lifecycle.state === 'failed') return;
      if (msg.id !== undefined && msg.method === 'elicitation/create') elicitations.add(idKey(msg.id));
      return write(msg);
    }
    if (msg.id !== undefined) settleUpstream(msg.id, msg);
  });
  upstream.onExit(info => {
    if (tearingDown) return;
    diagnostics(`runtime exited unexpectedly (${info.error ?? (info.signal ? `signal ${info.signal}` : `code ${info.code}`)})`);
    lifecycle.fail('upstream_exit');
    abandonUpstream('connection_failed');
  });

  // Bounded: a host that stops reading must not hold the server open. After the budget the transport is destroyed,
  // dropping whatever it could not take.
  async function flush(budgetMs = 1000) {
    if (!transportOpen || output.destroyed || output.writableEnded) return;
    let timer;
    const drained = await Promise.race([
      new Promise(resolve => output.write('', () => resolve(true))),
      new Promise(resolve => { timer = setTimeout(() => resolve(false), budgetMs); }),
    ]);
    clearTimeout(timer);
    if (!drained) {
      diagnostics('the client did not read the final replies within 1 s; closing the MCP stream without them');
      output.destroy();
    }
  }

  function close(reason = 'eof') {
    shutdown ??= (async () => {
      const failed = reason === 'failed';
      const {completion} = failed ? {completion: 'failed'} : await lifecycle.close();
      lifecycle.abandon();
      tearingDown = true;
      const [teardown, secretsTeardown] = await Promise.all([
        upstream.terminate({budgetMs: teardownBudgetMs}),
        secrets.close({budgetMs: teardownBudgetMs}),
      ]);
      abandonUpstream(lifecycle.state === 'failed' ? 'connection_failed' : 'connection_closing');
      if (!teardown.confirmed) diagnostics(`runtime teardown unconfirmed after ${teardown.steps.join(', ')}: ${teardown.reason ?? 'no reason given'}; owned processes may remain`);
      else if (teardown.steps.length > 1) diagnostics(`runtime teardown needed ${teardown.steps.slice(1).join(' then ')}; every owned process is gone`);
      if (!secretsTeardown.confirmed) diagnostics(`secrets broker teardown unconfirmed after ${secretsTeardown.steps.join(', ')}: ${secretsTeardown.reason ?? 'no reason given'}`);
      if (completion !== 'none' && completion !== 'ended' && !failed) diagnostics(`task completion at close: ${completion}; native cleanup unconfirmed`);
      // A local reply still being computed is written before the final flush, so the flush's bound covers it too; after
      // it, nothing would drop it from a stream the client stopped reading. A readiness listing is bounded and always
      // tears its own runtime down.
      await Promise.allSettled([...localReplies]);
      await flush();
      input.destroy?.();
      const clean = !failed && lifecycle.state !== 'failed' && teardown.confirmed && secretsTeardown.confirmed && (completion === 'none' || completion === 'ended');
      const result = {code: clean ? 0 : 1, reason, completion, teardown, secrets: secretsTeardown};
      resolveClosed(result);
      return result;
    })();
    return shutdown;
  }

  return {sessionId, closed, close, get state() { return lifecycle.state; }};
}

// CUA_SHIM_SURFACES: computer (the default), browser, or both (comma-separated, any order).
function surfacesFrom(value = 'computer') {
  const named = value.split(',').map(s => s.trim());
  if (!named.length || !named.every(s => SURFACES.includes(s)) || new Set(named).size !== named.length)
    fail('invalid_setting', 'CUA_SHIM_SURFACES must be computer, browser or computer,browser');
  return SURFACES.filter(s => named.includes(s));
}

export function settingsFrom(env) {
  const persist = env.CUA_SHIM_PERSIST ?? 'session';
  if (!PERSIST_MODES.includes(persist)) fail('invalid_setting', `CUA_SHIM_PERSIST must be one of ${PERSIST_MODES.join(', ')}`);
  const surfaces = surfacesFrom(env.CUA_SHIM_SURFACES);
  const hostNotes = env.CUA_SHIM_HOST_NOTES === 'none' ? '' : (env.CUA_SHIM_HOST_NOTES ?? hostNotesFor(surfaces));
  const secrets = env.CUA_SHIM_SECRETS ?? 'on';
  if (!['on', 'off'].includes(secrets)) fail('invalid_setting', 'CUA_SHIM_SECRETS must be on or off');
  return {persist, hostNotes, model: env.CUA_SHIM_MODEL, secrets: secrets === 'on', surfaces};
}

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

// `cua serve`: resolve the installed runtime, start this connection's secrets broker (unless secrets are off or the
// Keychain helper is not built), launch the runtime for a fresh connection session in an owned working directory with
// the enabled surfaces (CUA_SHIM_SURFACES) and their trusted services registered (src/services/sky.mjs for computer
// use, src/services/browser.mjs for the browser) and the broker's endpoint and token (or the reason there is no
// broker) in its environment, serve stdin/stdout until EOF or a signal, and remove what it created (including the
// session's app-approval file the runtime wrote). With the browser surface, profiles_list reads $CUA_HOME's profile
// registry and, when a profile is bound, checks it against the live backends with one bounded listing launch
// (inventory.mjs, no tab counts); the connection's close waits for such a listing (so serve keeps its signal handlers
// meanwhile), and serve exits 1 when a listing's runtime could not be confirmed stopped. Returns the exit code.
// `keychainHelper` is the located helper and `prepareLaunch` may adjust the launch record; both exist for tests and the
// opt-in live probes (scripts/probe-secrets.mjs points the sky service at a controlled fake target) and are not
// reachable from the CLI.
// `chrome` (the Chrome facts) and `listBackends` (the readiness listing) exist for tests only.
export async function serve({home, env = process.env, input = process.stdin, output = process.stdout, keychainHelper = locateHelper({home}),
  prepareLaunch = launch => launch, diagnostics = line => process.stderr.write(`cua serve: ${line}\n`), chrome = chromeFacts(),
  listBackends}) {
  const {secrets: secretsEnabled, ...settings} = settingsFrom(env);
  const services = {computer: {sky: SKY_SERVICE}, browser: {browser: BROWSER_SERVICE}};
  const runtime = resolveRuntime({home});
  listBackends ??= () => listLiveBackends({home, runtime, ambient: env, tabCounts: false});
  const sessionId = randomUUID();
  mkdirSync(homeLayout(realHome(home)).run, {recursive: true, mode: 0o700});
  const secrets = await openSecrets({enabled: secretsEnabled, helper: keychainHelper, home, sessionId, ambient: env, diagnostics});
  let launch;
  try {
    launch = prepareLaunch(buildLaunch({
      runtime, home, sessionId, ambient: env, surfaces: settings.surfaces,
      services: Object.assign({}, ...settings.surfaces.map(s => services[s])),
      broker: secrets.broker, secretsUnavailable: secrets.unavailable?.code,
    }));
    mkdirSync(launch.env.CODEX_HOME, {recursive: true, mode: 0o700});
    mkdirSync(launch.cwd, {mode: 0o700});
    chmodSync(launch.cwd, 0o700);
  } catch (error) {
    await secrets.close();
    throw error;
  }
  const onSignal = () => server.close('signal');
  let listingLeftover = false;
  let server;
  let code;
  try {
    const profiles = {list: async () => {
      const {profiles: list, listingError} = await profileReadiness({home, chrome, listBackends});
      if (listingError) diagnostics(`profiles_list: the live Chrome extension backends could not be listed (${listingError.code})`);
      if (listingError?.code === 'runtime_teardown_unconfirmed') listingLeftover = true;
      return list;
    }};
    server = createServer({input, output, sessionId, upstream: spawnUpstream(launch), secrets, profiles, diagnostics, ...settings});
    for (const signal of SIGNALS) process.on(signal, onSignal);
    code = (await server.closed).code;
  } finally {
    for (const signal of SIGNALS) process.off(signal, onSignal);
    await secrets.close();
    rmSync(launch.cwd, {recursive: true, force: true});
    // The runtime records a "session" app approval under this connection's random session ID, which no later
    // connection can use; it goes with the connection. Other sessions' files are never touched.
    rmSync(join(launch.env.CODEX_HOME, 'computer-use', 'sessions', `${sessionId}.toml`), {force: true});
  }
  if (!listingLeftover) return code;
  diagnostics('a profiles_list readiness listing\'s runtime could not be confirmed stopped; owned processes may remain');
  return 1;
}
