// cua's own REPL host (docs/doperpowers/specs/2026-10-14-own-repl-host-design.md, #116): the process `buildLaunch`
// (src/runtime/launch.mjs) starts in place of the vendor's Node -> cua-repl -> Rust node_repl when a connection selects
// cua's host. It speaks MCP (JSON-RPC 2.0, one message per line on stdin/stdout; stdout carries nothing else) with
// cua's proxy (src/mcp/server.mjs), answers the HostMcp contract (./tools.mjs) and supplies the vendor supervisor's
// behaviour around its two children, each launched lazily under the retained sandbox (src/runtime/sandbox.mjs
// sandboxPolicy/sandboxArgs) for the policy each call's `codex/sandbox-state-meta` carries:
// - the kernel (./kernel.mjs, KernelWire), which runs cells: the host times executions, assembles their results
//   (./results.mjs) and owns the kernel's lifecycle;
// - the trusted worker (./trusted-worker.mjs, TrustedServiceWire), which runs the registered trusted services
//   (CUA_REPL_TRUSTED_SERVICES) with the privileged nodeRepl (./privileged-node-repl.mjs, PrivilegedRuntime). It starts
//   at the first service request and outlives kernel resets and timeouts (a fresh bootstrap sets its services up
//   again), so service state such as browser connections and turn hooks persists; a sandbox-policy change, its own exit
//   or the host's shutdown ends it.
//
// Executions, in the spec's linearization points:
// - ready + js: an execution id is allocated and the budget (timeout_ms, default 30,000 ms; ./budget.mjs) starts before
//   the code is sent; js and js_reset run one at a time, in arrival order.
// - running + output, images, service requests, elicitations: routed under that execution's id; anything a child
//   sends for another execution is refused (`node_repl exec context not found`) or dropped. MCP control traffic (ping,
//   cancellation, elicitation answers) stays live.
// - running + trusted_service_request / trusted_service_hooks: become the worker's `service` / `run_hooks` with the
//   execution's request meta and form-elicitation support; the worker's `trusted_service_response` goes back to the
//   kernel that asked, by request id, and never to a later kernel generation.
// - running + suspend_timeout / resume_timeout from the worker: the budget pauses and resumes (nested).
// - running + submitted_code_complete: the submitted code and its tracked background work have drained; the budget
//   ends there, and the after-code hooks run under their own per-hook deadlines (the worker's), on success and error.
// - running + exec_result: the result is assembled once, with the response meta trusted code set.
// - running + cancellation: nothing is stopped; the eventual result still settles (the vendor's behaviour).
// - running + timeout: the kernel's generation ends first (its later messages are dropped), then it is killed; the
//   timeout sentence answers the call once and the next execution starts a fresh kernel, bindings gone.
// - js_reset: the kernel is stopped (bindings gone, a fresh banner next time); the task identity is the proxy's.
// - turn_ended: the session/turn key is reserved before the worker's turn-ended handlers start (concurrently, each
//   under its own deadline); every request for that key shares the one acknowledgement.
// - a child ends while an execution waits on it: the kernel's exit diagnostic answers the execution; the worker's exit
//   fails the service requests it held (`trusted Node process exited unexpectedly`) and the next request starts a fresh
//   one. Nothing uncertain is ever replayed.
// - EOF on stdin: nothing new is admitted; what was admitted settles and is answered, then the children are stopped
//   and the host exits 0. A signal stops them at once.
//
// What crosses the host between the children and the client is re-serialized with its object keys sorted (arrays kept
// in order), as the vendor's serde maps do: request meta, service requests and results, elicitation schemas and
// answers, response meta (observed on the pinned node_repl, 2026-10-14).
//
// Settings (environment, owned names; src/runtime/launch.mjs builds them): CUA_REPL_NODE_PATH (the Node both children
// run on, absolute), CODEX_CLI_PATH (the sandbox launcher; without it no sandboxed execution runs at all), CODEX_HOME
// (the launcher's), CUA_REPL_TRUSTED_SERVICES and CUA_REPL_TRUSTED_RPC_ENABLED (the worker and cells' rpc),
// CUA_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS, CUA_REPL_TOOL_OVERRIDES (the tool text, ./tools.mjs), and for the kernel
// CUA_REPL_JS_BANNER, CUA_REPL_UNTRUSTED_ENV_ALLOWLIST (and the names it lists), CUA_REPL_NODE_MODULE_DIRS. The
// kernel's environment is only these and HOME, PATH, TMPDIR, TMP and LC_ALL, never the host's own; the worker, trusted
// code, gets the host's whole (already allowlisted) environment, as the vendor's does.
import {randomUUID} from 'node:crypto';
import {delimiter, dirname, isAbsolute} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {REPL_HOST_META_KEY, REPL_HOST_VERSION} from './identity.mjs';
import {InvalidParams, initializeResult, jsArguments, parseToolOverrides, resetArguments, toolsFor, turnEndedArguments} from './tools.mjs';
import {assembleResult, imageFromDataUrl, sentenceResult} from './results.mjs';
import {ownedGroupReaper, startKernelChild} from './kernel-child.mjs';
import {executionBudget} from './budget.mjs';
import {DEFAULT_CONNECT_TIMEOUT_MS, nativePipeRelay} from './native-pipe.mjs';
import {elicitationOutcome, elicitationParams, formElicitationSupported} from './elicitation.mjs';
import {launchServicesAction} from './launch-services.mjs';
import {SANDBOX_META_KEY, SandboxStateError, sandboxArgs, sandboxPolicy} from '../runtime/sandbox.mjs';

export const KERNEL = fileURLToPath(new URL('./kernel.mjs', import.meta.url));
export const TRUSTED_WORKER = fileURLToPath(new URL('./trusted-worker.mjs', import.meta.url));
const KERNEL_ENV = ['HOME', 'PATH', 'TMPDIR', 'TMP', 'LC_ALL'];
const KERNEL_SETTINGS = ['CUA_REPL_JS_BANNER', 'CUA_REPL_UNTRUSTED_ENV_ALLOWLIST', 'CUA_REPL_NODE_MODULE_DIRS'];
export const TIMEOUT_SENTENCE = 'js execution timed out; kernel reset, rerun your request';
export const RESET_SENTENCE = 'js kernel reset';
export const EMPTY_SOURCE_SENTENCE = 'js expects non-empty JavaScript source';
export const SHUTTING_DOWN_SENTENCE = 'js execution unavailable because the runtime manager is shutting down';
export const NO_SANDBOX_SENTENCE = 'js sandbox unavailable: no sandbox launcher is configured (CODEX_CLI_PATH), and JavaScript never runs unconfined in its place; nothing was run';
export const NO_TRUSTED_SERVICES = 'No trusted RPC services are configured';
export const TRUSTED_EXIT_SENTENCE = 'trusted Node process exited unexpectedly';
export const EXEC_CONTEXT_NOT_FOUND = 'node_repl exec context not found';
const hostMarker = {host: 'cua', version: REPL_HOST_VERSION};

// serde_json's maps are sorted, so a JSON value crossing the vendor's host has its keys in byte order, at every depth;
// arrays keep their order.
export const sortedJson = value => (Array.isArray(value) ? value.map(sortedJson)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortedJson(value[key])])) : value);

// The host's settings from its environment.
export function hostSettings(env, {cwd}) {
  const node = env.CUA_REPL_NODE_PATH;
  if (typeof node !== 'string' || !isAbsolute(node)) throw new Error('CUA_REPL_NODE_PATH must be the absolute path of the kernel\'s Node');
  const codexCli = env.CODEX_CLI_PATH && isAbsolute(env.CODEX_CLI_PATH) ? env.CODEX_CLI_PATH : null;
  const moduleDirs = (env.CUA_REPL_NODE_MODULE_DIRS ?? '').split(delimiter).filter(dir => isAbsolute(dir));
  const kernelEnv = {};
  for (const key of KERNEL_ENV) if (typeof env[key] === 'string') kernelEnv[key] = env[key];
  for (const key of KERNEL_SETTINGS) if (typeof env[key] === 'string') kernelEnv[key] = env[key];
  const rpcEnabled = env.CUA_REPL_TRUSTED_RPC_ENABLED === '1';
  if (rpcEnabled) kernelEnv.CUA_REPL_TRUSTED_RPC_ENABLED = '1';
  for (const name of (env.CUA_REPL_UNTRUSTED_ENV_ALLOWLIST ?? '').split(',').map(s => s.trim()).filter(Boolean))
    if (typeof env[name] === 'string') kernelEnv[name] = env[name];
  let services = {};
  if (env.CUA_REPL_TRUSTED_SERVICES) {
    try { services = JSON.parse(env.CUA_REPL_TRUSTED_SERVICES); } catch { services = null; }
    if (services === null || typeof services !== 'object' || Array.isArray(services)) throw new Error('CUA_REPL_TRUSTED_SERVICES must be a JSON object');
  }
  const pipeTimeout = Number(env.CUA_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS);
  const workerEnv = Object.fromEntries(Object.entries(env).filter(([, value]) => typeof value === 'string'));
  return {node, codexCli, codexHome: env.CODEX_HOME ?? null, workingDir: cwd, kernelEnv, workerEnv,
    services: rpcEnabled && Object.keys(services).length > 0, toolOverrides: parseToolOverrides(env.CUA_REPL_TOOL_OVERRIDES),
    pipeConnectTimeoutMs: Number.isSafeInteger(pipeTimeout) && pipeTimeout > 0 ? pipeTimeout : DEFAULT_CONNECT_TIMEOUT_MS,
    readPaths: [dirname(node), dirname(KERNEL), ...moduleDirs], sessionId: randomUUID().replaceAll('-', '')};
}

// A child launch of `command` ([node, ...args]) with `env` for `policy` (sandboxPolicy) -> {command, args, env, cwd,
// key}; `key` names the policy, the same for both children, so a call under another policy gets fresh ones.
function childLaunch(settings, policy, command, env) {
  if (policy.disabled) return {command: command[0], args: command.slice(1), env: {...env}, cwd: settings.workingDir, key: 'disabled'};
  const args = sandboxArgs(policy, command);
  const cwd = policy.cwd ?? settings.workingDir;
  return {command: settings.codexCli, args, env: {...env, ...(settings.codexHome ? {CODEX_HOME: settings.codexHome} : {})}, cwd, key: JSON.stringify([cwd, policy.filesystem])};
}

export function kernelLaunch(settings, policy) {
  return childLaunch(settings, policy, [settings.node, '--experimental-vm-modules', KERNEL, '--session-id', settings.sessionId, '--working-dir', settings.workingDir], settings.kernelEnv);
}

export function workerLaunch(settings, policy) {
  return childLaunch(settings, policy, [settings.node, '--experimental-vm-modules', TRUSTED_WORKER, settings.workingDir], settings.workerEnv);
}

// Serves MCP on `input`/`output` -> {closed: Promise<exit code>, shutdown()}. `startKernel` is the child seam for both
// children (tests); `launchServices` the LaunchServices boundary; `log` gets diagnostics (stderr).
export function createSupervisor({input, output, env, cwd = process.cwd(), startKernel = startKernelChild, log = line => process.stderr.write(`cua-repl-host: ${line}\n`),
  reaper = env.CUA_REPL_OWNED_GROUP === '1' ? ownedGroupReaper : () => null, launchServices = launchServicesAction}) {
  const settings = hostSettings(env, {cwd});
  // In the proxy's owned group (src/runtime/launch.mjs sets CUA_REPL_OWNED_GROUP; the reaper checks the group itself),
  // whatever a finished child left in the group is removed with it. The trusted worker, long-lived, is registered with
  // `own` while it runs, so a kernel's end never takes it or the helpers it started.
  const groupReaper = reaper();
  const reap = groupReaper?.reap ?? (() => {});
  const sandboxed = settings.codexCli !== null;
  let initialized = false;
  let formSupported = false;  // the client's initialize offered form elicitation
  let closing = false;
  let kernel = null;          // the current kernel generation {child, key}: only its messages reach an execution
  let worker = null;          // the current trusted worker {child, key, pending, turns, relay, release}
  let terminated = false;     // a forced shutdown began: nothing launches any more
  let execCounter = 0;
  let execution = null;       // the execution waiting on the kernel
  let work = Promise.resolve();
  const turns = new Map();    // JSON [session, turn] -> the acknowledgement promise
  let turnCounter = 0;
  let clientRequestCounter = 0;
  const clientRequests = new Map();   // MCP id this host sent the client -> {worker, id} (an elicitation)
  let resolveClosed;
  const closed = new Promise(resolve => { resolveClosed = resolve; });

  const write = message => { if (!output.destroyed && output.writable) output.write(`${JSON.stringify(message)}\n`); };
  const respond = (id, result) => write({jsonrpc: '2.0', id, result});
  const respondError = (id, code, message) => write({jsonrpc: '2.0', id, error: {code, message}});
  const toolResult = (id, result) => respond(id, {...result, _meta: {...(result._meta ?? {}), [REPL_HOST_META_KEY]: {...hostMarker}}});
  // The execution a child's message is for, if it is the one waiting.
  const executionOf = message => (execution && message.exec_id === execution.id ? execution : null);

  // ---- the kernel ----
  function launchKernel(launch) {
    const self = {key: launch.key};
    self.child = startKernel(launch, {reap,
      onMessage: message => { if (kernel === self) fromKernel(self, message); },
      onEnd: ({expected, diagnostic}) => {
        if (kernel === self) kernel = null;
        if (expected) return;
        if (execution?.kernel === self) settle(execution, sentenceResult(diagnostic));
        else log(diagnostic);
      },
    });
    return self;
  }

  // Ends a child's generation, then stops it: nothing it sends from here on reaches an execution. Every caller waits
  // for every stop in flight, so nothing (a drain, a forced shutdown) sees a child gone while its cleanup, reaping
  // included, is still running.
  const stops = new Set();
  const stopping = child => { const stop = child.stop(); stops.add(stop); stop.finally(() => stops.delete(stop)); };
  async function stopKernel() {
    const current = kernel;
    if (current) {
      kernel = null;
      stopping(current.child);
    }
    await Promise.all([...stops]);
  }

  // An emitted image for `current` (or for no execution) -> the reply to the child that sent it.
  function emitImage(current, message) {
    if (!current) return {type: 'emit_image_result', id: message.id, ok: false, error: EXEC_CONTEXT_NOT_FOUND};
    const {image, error} = imageFromDataUrl(message.image_url);
    if (error) return {type: 'emit_image_result', id: message.id, ok: false, error};
    current.images.push(image);
    return {type: 'emit_image_result', id: message.id, ok: true};
  }

  function fromKernel(self, message) {
    const current = execution?.kernel === self && message.exec_id === execution.id ? execution : null;
    switch (message.type) {
      case 'submitted_code_complete':
        if (current) {
          current.durationMs = typeof message.execution_duration_ms === 'number' ? message.execution_duration_ms : null;
          current.budget.stop();
        }
        return;
      case 'exec_result':
        if (execution?.kernel === self && message.id === execution.id) settle(execution, assembleResult({
          ok: message.ok === true, error: typeof message.error === 'string' ? message.error : String(message.error),
          output: typeof message.output === 'string' ? message.output : '', namedOutputs: Array.isArray(message.named_outputs) ? message.named_outputs.map(String) : [],
          images: execution.images, contentItems: Array.isArray(message.content_items) ? message.content_items : [], durationMs: execution.durationMs,
          responseMeta: execution.responseMeta,
        }));
        return;
      case 'emit_image':
        return self.child.send(emitImage(current, message));
      case 'trusted_service_request':
      case 'trusted_service_hooks':
        return toWorker(self, current, message);
      default:
    }
  }

  function settle(current, result) {
    if (current.settled) return;
    current.settled = true;
    current.budget?.stop();
    if (execution === current) execution = null;
    current.resolve(result);
  }

  // ---- the trusted worker (TrustedServiceWire) ----
  // A kernel's request for the worker: `service` for nodeRepl.rpc, `run_hooks` for the after-code hooks. Without
  // services there is nothing to run: requests fail as the vendor's do, hooks are done at once; without a running worker
  // no hook was ever registered, so hooks never start one.
  function toWorker(kernelSelf, current, message) {
    const answer = fields => kernelSelf.child.send({type: 'trusted_service_response', id: message.id, ...fields});
    const hooks = message.type === 'trusted_service_hooks';
    if (!settings.services) return answer(hooks ? {ok: true, value: null} : {ok: false, error: NO_TRUSTED_SERVICES});
    if (!current) return answer({ok: false, error: EXEC_CONTEXT_NOT_FOUND});
    if (hooks && !worker) return answer({ok: true, value: null});
    const self = worker ?? launchWorker(current.policy);
    if (!self) return answer({ok: false, error: TRUSTED_EXIT_SENTENCE});
    self.pending.set(message.id, kernelSelf);
    const sent = self.child.send(sortedJson({
      type: hooks ? 'run_hooks' : 'service', id: message.id, exec_id: current.id,
      ...(hooks ? {} : {service: message.service, request: message.request}),
      request_meta: current.requestMeta, form_elicitation_supported: formSupported,
    }));
    if (!sent) {
      self.pending.delete(message.id);
      answer({ok: false, error: TRUSTED_EXIT_SENTENCE});
    }
  }

  function launchWorker(policy) {
    if (terminated) return null;
    const launch = workerLaunch(settings, policy);
    const self = {key: launch.key, pending: new Map(), turns: new Map(), release: () => {}};
    self.relay = nativePipeRelay({send: message => self.child.send(message), connectTimeoutMs: settings.pipeConnectTimeoutMs});
    self.child = startKernel(launch, {exitSentence: TRUSTED_EXIT_SENTENCE,
      reap: () => { self.release(); reap(); },
      onMessage: message => { if (worker === self) fromWorker(self, message); },
      onEnd: ending => workerEnded(self, ending),
    });
    worker = self;
    // Registered before anything else can run: no kernel's end may take the worker or what it starts.
    if (self.child.pid && groupReaper) self.release = groupReaper.own(self.child.pid);
    return self;
  }

  function workerEnded(self, {expected, diagnostic}) {
    if (worker === self) worker = null;
    self.relay.closeAll();
    // The service requests it held fail for whichever kernel still waits on them; its turn handlers are over.
    for (const [id, kernelSelf] of self.pending) kernelSelf.child.send({type: 'trusted_service_response', id, ok: false, error: TRUSTED_EXIT_SENTENCE, output: [], content_items: []});
    self.pending.clear();
    for (const resolve of self.turns.values()) resolve();
    self.turns.clear();
    for (const [id, request] of clientRequests) if (request.worker === self) clientRequests.delete(id);
    if (!expected) log(diagnostic);
  }

  async function stopWorker() {
    const current = worker;
    if (current) {
      worker = null;
      stopping(current.child);
    }
    await Promise.all([...stops]);
  }

  function fromWorker(self, message) {
    const reply = payload => self.child.send(payload);
    const current = executionOf(message);
    switch (message.type) {
      case 'trusted_service_response': {
        const kernelSelf = self.pending.get(message.id);
        if (!kernelSelf) return;
        self.pending.delete(message.id);
        // Only to the kernel that asked, and only while it lives: a later generation never sees an earlier one's reply.
        if (kernel === kernelSelf) kernelSelf.child.send(sortedJson(message));
        return;
      }
      case 'turn_ended_result': {
        const resolve = self.turns.get(message.id);
        self.turns.delete(message.id);
        return resolve?.();
      }
      case 'emit_image':
        return reply(emitImage(current, message));
      case 'elicit':
        return elicit(self, current, message);
      case 'suspend_timeout':
        return current?.budget.suspend();
      case 'resume_timeout':
        return current?.budget.resume();
      case 'response_meta':
        if (execution && message.id === execution.id && message.response_meta && typeof message.response_meta === 'object' && !Array.isArray(message.response_meta))
          execution.responseMeta = sortedJson(message.response_meta);
        return;
      case 'launch_services_action':
        if (!current) return reply({type: 'privileged_result', id: message.id, ok: false, error: EXEC_CONTEXT_NOT_FOUND});
        return void launchServices(message).then(
          () => reply({type: 'privileged_result', id: message.id, ok: true}),
          error => reply({type: 'privileged_result', id: message.id, ok: false, error: error.message}));
      case 'native_pipe_request':
        return self.relay.handle(message);
      default:
        // A privileged request this host does not serve (the vendor's config, fetch and telemetry bridges, which the
        // ported worker never sends) is refused rather than left waiting.
        if (typeof message.id === 'string' && typeof message.type === 'string')
          reply({type: 'privileged_result', id: message.id, ok: false, error: `unsupported trusted request: ${message.type}`});
    }
  }

  // nodeRepl.createElicitation: asked of the client through cua's proxy; the answer goes back to the worker that asked.
  function elicit(self, current, message) {
    const answer = fields => self.child.send(sortedJson({type: 'elicitation_result', id: message.id, ...fields}));
    if (!current) return answer({ok: false, error: EXEC_CONTEXT_NOT_FOUND});
    const {params, error} = elicitationParams(message, {formSupported});
    if (error) return answer({ok: false, error});
    const id = clientRequestCounter++;
    clientRequests.set(id, {worker: self, id: message.id});
    write({jsonrpc: '2.0', id, method: 'elicitation/create', params: sortedJson(params)});
  }

  function onClientResponse(msg) {
    const request = clientRequests.get(msg.id);
    if (!request) return;
    clientRequests.delete(msg.id);
    if (worker !== request.worker) return;
    request.worker.child.send(sortedJson({type: 'elicitation_result', id: request.id, ...elicitationOutcome(msg)}));
  }

  // ---- tool calls ----
  // Serialized js/js_reset work; returns once the call's result was written.
  function enqueue(task) {
    work = work.then(task).catch(error => log(`internal error: ${error.stack ?? error.message}`));
    return work;
  }

  async function runJs(id, {code, timeoutMs}, policy, requestMeta) {
    if (terminated) return toolResult(id, sentenceResult(SHUTTING_DOWN_SENTENCE));
    if (!policy.disabled && !sandboxed) return toolResult(id, sentenceResult(NO_SANDBOX_SENTENCE));
    const launch = kernelLaunch(settings, policy);
    // A policy change takes both children: neither keeps running under the old policy.
    if (kernel && kernel.key !== launch.key) await stopKernel();
    if (worker && worker.key !== launch.key) await stopWorker();
    // A forced shutdown may have begun while the old children stopped: then nothing launches or runs.
    if (terminated) return toolResult(id, sentenceResult(SHUTTING_DOWN_SENTENCE));
    kernel ??= launchKernel(launch);
    const current = {id: `exec-${++execCounter}`, kernel, policy, requestMeta, images: [], durationMs: null, responseMeta: null, settled: false};
    const result = new Promise(resolve => { current.resolve = resolve; });
    execution = current;
    current.budget = executionBudget(timeoutMs, async () => {
      if (current.settled) return;
      if (kernel === current.kernel) await stopKernel();
      settle(current, sentenceResult(TIMEOUT_SENTENCE));
    });
    current.kernel.child.send({type: 'exec', id: current.id, code, ...(requestMeta ? {request_meta: requestMeta} : {}), form_elicitation_supported: formSupported});
    toolResult(id, await result);
  }

  async function runReset(id) {
    if (terminated) return toolResult(id, sentenceResult(SHUTTING_DOWN_SENTENCE));
    await stopKernel();
    toolResult(id, sentenceResult(RESET_SENTENCE, {isError: false}));
  }

  // The worker's turn-ended handlers for this turn; resolves when they are done (or there is no worker to run any).
  function notifyTurnEnded({hookEventName, sessionId, turnId}, requestMeta) {
    const self = worker;
    if (!self || terminated) return Promise.resolve();
    const id = `turn-ended-${turnCounter++}`;
    return new Promise(resolve => {
      self.turns.set(id, resolve);
      const sent = self.child.send(sortedJson({type: 'turn_ended', id, event: {hook_event_name: hookEventName, session_id: sessionId, turn_id: turnId}, request_meta: requestMeta}));
      if (!sent) { self.turns.delete(id); resolve(); }
    });
  }

  // The key is reserved before the handlers start; every request for it shares the one acknowledgement.
  function turnEnded(id, args, requestMeta) {
    const key = JSON.stringify([args.sessionId, args.turnId]);
    if (!turns.has(key)) turns.set(key, notifyTurnEnded(args, requestMeta).then(() => sentenceResult('{}', {isError: false})));
    return turns.get(key).then(result => toolResult(id, result));
  }

  // The call's `_meta` without the sandbox state, sorted, or null.
  function requestMetaOf(meta) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
    const {[SANDBOX_META_KEY]: _sandbox, ...rest} = meta;
    return sortedJson(rest);
  }

  function toolsCall(msg) {
    const params = msg.params ?? {};
    const {name, arguments: args, _meta: meta} = params;
    if (typeof name !== 'string') return respondError(msg.id, -32601, 'tools/call');
    try {
      if (name === 'js') {
        const parsed = jsArguments(args);
        let policy;
        try { policy = sandboxPolicy(meta && Object.hasOwn(meta, SANDBOX_META_KEY) ? meta[SANDBOX_META_KEY] : undefined, {readPaths: settings.readPaths}); } catch (error) {
          if (error instanceof SandboxStateError) throw new InvalidParams(`js: ${SANDBOX_META_KEY}: ${error.message}`);
          throw error;
        }
        if (!parsed.code.trim()) return toolResult(msg.id, sentenceResult(EMPTY_SOURCE_SENTENCE));
        const requestMeta = requestMetaOf(meta);
        if (closing) return toolResult(msg.id, sentenceResult(SHUTTING_DOWN_SENTENCE));
        return enqueue(() => runJs(msg.id, parsed, policy, requestMeta));
      }
      if (name === 'js_reset') {
        resetArguments(args);
        return enqueue(() => runReset(msg.id));
      }
      if (name === 'turn_ended') return turnEnded(msg.id, turnEndedArguments(args), requestMetaOf(meta));
      return toolResult(msg.id, sentenceResult(`unknown tool: ${name}`));
    } catch (error) {
      if (error instanceof InvalidParams) return respondError(msg.id, -32602, error.message);
      throw error;
    }
  }

  function onRequest(msg) {
    if (msg.method === 'initialize') {
      initialized = true;
      formSupported = formElicitationSupported(msg.params?.capabilities);
      return respond(msg.id, initializeResult({protocolVersion: msg.params?.protocolVersion, sandboxed, overrides: settings.toolOverrides}));
    }
    if (!initialized) return respondError(msg.id, -32002, 'server not initialized');
    switch (msg.method) {
      case 'ping': return respond(msg.id, {});
      case 'tools/list': return respond(msg.id, {tools: toolsFor({sandboxed, overrides: settings.toolOverrides})});
      case 'tools/call': return toolsCall(msg);
      case 'resources/list': return respond(msg.id, {resources: []});
      case 'resources/templates/list': return respond(msg.id, {resourceTemplates: []});
      case 'prompts/list': return respond(msg.id, {prompts: []});
      default: return respondError(msg.id, -32601, String(msg.method));
    }
  }

  createInterface({input}).on('line', line => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return log(`dropped a non-JSON line (${line.length} characters)`); }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
    // Notifications (initialized, cancelled) need nothing: a running cell is never stopped by a cancellation.
    // Responses answer the elicitations this host asked the client.
    if (msg.method !== undefined && msg.id !== undefined) onRequest(msg);
    else if (msg.method === undefined && msg.id !== undefined) onClientResponse(msg);
  });

  // EOF: what was admitted settles and is answered, then the children go and the host exits. A signal (forced) does
  // not wait, and overrides a drain under way: the waiting execution is answered that the host is shutting down,
  // nothing queued launches, and the children are stopped at once.
  const flushed = () => new Promise(resolve => (output.writableEnded || output.destroyed ? resolve() : output.write('', resolve)));
  let draining = null;
  let forced = null;
  function shutdown({drain}) {
    closing = true;
    if (drain) {
      draining ??= (async () => {
        await Promise.all([work, ...turns.values()]);
        await Promise.all([stopKernel(), stopWorker()]);
        await flushed();
        resolveClosed(0);
      })();
      return forced ?? draining;
    }
    forced ??= (async () => {
      terminated = true;
      if (execution) settle(execution, sentenceResult(SHUTTING_DOWN_SENTENCE));
      await Promise.all([stopKernel(), stopWorker()]);
      await flushed();
      resolveClosed(0);
    })();
    return forced;
  }
  input.once('end', () => shutdown({drain: true}));
  input.once('error', () => shutdown({drain: true}));

  return {closed, shutdown: () => shutdown({drain: false})};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let supervisor;
  try {
    supervisor = createSupervisor({input: process.stdin, output: process.stdout, env: process.env});
  } catch (error) {
    process.stderr.write(`cua-repl-host: ${error.message}\n`);
    process.exit(1);
  }
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.once(signal, () => { supervisor.shutdown().then(() => process.exit(0)); });
  supervisor.closed.then(code => process.exit(code));
}
