// cua's own REPL host (docs/doperpowers/specs/2026-10-14-own-repl-host-design.md, #116): the process `buildLaunch`
// (src/runtime/launch.mjs) starts in place of the vendor's Node -> cua-repl -> Rust node_repl when a connection selects
// cua's host. It speaks MCP (JSON-RPC 2.0, one message per line on stdin/stdout; stdout carries nothing else) with
// cua's proxy (src/mcp/server.mjs), answers the HostMcp contract (./tools.mjs) and supplies the vendor supervisor's
// behaviour around the ported kernel (./kernel.mjs, KernelWire): it launches the kernel lazily under the retained
// sandbox (src/runtime/sandbox.mjs sandboxPolicy/sandboxArgs) for the policy each call's `codex/sandbox-state-meta`
// carries, times executions, assembles their results (./results.mjs) and owns the kernel's lifecycle.
//
// Executions, in the spec's linearization points:
// - ready + js: an execution id is allocated and the budget (timeout_ms, default 30,000 ms) starts before the code is
//   sent; js and js_reset run one at a time, in arrival order.
// - running + emit_image: answered under that execution id; MCP control traffic (ping, cancellation) stays live.
// - running + submitted_code_complete: the submitted code's duration is recorded for the result's meta.
// - running + exec_result: the result is assembled once, the timer cleared.
// - running + cancellation: nothing is stopped; the eventual result still settles (the vendor's behaviour).
// - running + timeout: the kernel's generation ends first (its later messages are dropped), then it is killed; the
//   timeout sentence answers the call once and the next execution starts a fresh kernel, bindings gone.
// - js_reset: the kernel is stopped (bindings gone, a fresh banner next time); the task identity is the proxy's.
// - turn_ended: one acknowledgement per session and turn, repeated requests sharing it. M1 has no trusted services, so
//   there are no handlers to wait for.
// - the kernel ends while an execution waits on it: the exit diagnostic answers it; ended while idle, it is logged and
//   the next execution starts a fresh one. Nothing uncertain is ever replayed.
// - EOF on stdin: nothing new is admitted; what was admitted settles and is answered, then the kernel is stopped and the
//   host exits 0. A signal stops the kernel at once.
//
// Settings (environment, owned names; src/runtime/launch.mjs builds them): CUA_REPL_NODE_PATH (the Node the kernel
// runs on, absolute), CODEX_CLI_PATH (the sandbox launcher; without it no sandboxed execution runs at all), CODEX_HOME
// (the launcher's), and for the kernel CUA_REPL_JS_BANNER, CUA_REPL_UNTRUSTED_ENV_ALLOWLIST (and the names it lists),
// CUA_REPL_NODE_MODULE_DIRS, CUA_REPL_TRUSTED_RPC_ENABLED. The kernel's environment is only these and HOME, PATH,
// TMPDIR, TMP and LC_ALL, never the host's own.
import {randomUUID} from 'node:crypto';
import {delimiter, dirname, isAbsolute} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {REPL_HOST_META_KEY, REPL_HOST_VERSION} from './identity.mjs';
import {InvalidParams, initializeResult, jsArguments, resetArguments, toolsFor, turnEndedArguments} from './tools.mjs';
import {assembleResult, imageFromDataUrl, sentenceResult} from './results.mjs';
import {startKernelChild} from './kernel-child.mjs';
import {SANDBOX_META_KEY, SandboxStateError, sandboxArgs, sandboxPolicy} from '../runtime/sandbox.mjs';

export const KERNEL = fileURLToPath(new URL('./kernel.mjs', import.meta.url));
const KERNEL_ENV = ['HOME', 'PATH', 'TMPDIR', 'TMP', 'LC_ALL'];
const KERNEL_SETTINGS = ['CUA_REPL_JS_BANNER', 'CUA_REPL_UNTRUSTED_ENV_ALLOWLIST', 'CUA_REPL_NODE_MODULE_DIRS'];
const MAX_TIMER_MS = 2_147_483_647;
export const TIMEOUT_SENTENCE = 'js execution timed out; kernel reset, rerun your request';
export const RESET_SENTENCE = 'js kernel reset';
export const EMPTY_SOURCE_SENTENCE = 'js expects non-empty JavaScript source';
export const SHUTTING_DOWN_SENTENCE = 'js execution unavailable because the runtime manager is shutting down';
export const NO_SANDBOX_SENTENCE = 'js sandbox unavailable: no sandbox launcher is configured (CODEX_CLI_PATH), and JavaScript never runs unconfined in its place; nothing was run';
const NO_TRUSTED_SERVICES = 'No trusted RPC services are configured';
const EXEC_CONTEXT_NOT_FOUND = 'node_repl exec context not found';
const hostMarker = {host: 'cua', version: REPL_HOST_VERSION};

// serde_json's maps are sorted, so the request meta a cell sees has its keys in byte order, at every depth.
const sortedJson = value => (Array.isArray(value) ? value.map(sortedJson)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortedJson(value[key])])) : value);

// A timer for any non-negative duration (setTimeout alone fires at once past 2^31-1 ms) -> cancel.
function timer(ms, fn) {
  let handle;
  const arm = left => { handle = setTimeout(() => (left > MAX_TIMER_MS ? arm(left - MAX_TIMER_MS) : fn()), Math.min(left, MAX_TIMER_MS)); };
  arm(ms);
  return () => clearTimeout(handle);
}

// The host's settings from its environment.
export function hostSettings(env, {cwd}) {
  const node = env.CUA_REPL_NODE_PATH;
  if (typeof node !== 'string' || !isAbsolute(node)) throw new Error('CUA_REPL_NODE_PATH must be the absolute path of the kernel\'s Node');
  const codexCli = env.CODEX_CLI_PATH && isAbsolute(env.CODEX_CLI_PATH) ? env.CODEX_CLI_PATH : null;
  const moduleDirs = (env.CUA_REPL_NODE_MODULE_DIRS ?? '').split(delimiter).filter(dir => isAbsolute(dir));
  const kernelEnv = {};
  for (const key of KERNEL_ENV) if (typeof env[key] === 'string') kernelEnv[key] = env[key];
  for (const key of KERNEL_SETTINGS) if (typeof env[key] === 'string') kernelEnv[key] = env[key];
  if (env.CUA_REPL_TRUSTED_RPC_ENABLED === '1') kernelEnv.CUA_REPL_TRUSTED_RPC_ENABLED = '1';
  for (const name of (env.CUA_REPL_UNTRUSTED_ENV_ALLOWLIST ?? '').split(',').map(s => s.trim()).filter(Boolean))
    if (typeof env[name] === 'string') kernelEnv[name] = env[name];
  return {node, codexCli, codexHome: env.CODEX_HOME ?? null, workingDir: cwd, kernelEnv,
    readPaths: [dirname(node), dirname(KERNEL), ...moduleDirs], sessionId: randomUUID().replaceAll('-', '')};
}

// The kernel launch for `policy` (sandboxPolicy) -> {command, args, env, cwd, key}; `key` names the policy, so a call
// under another policy gets a fresh kernel.
export function kernelLaunch(settings, policy) {
  const command = [settings.node, '--experimental-vm-modules', KERNEL, '--session-id', settings.sessionId, '--working-dir', settings.workingDir];
  if (policy.disabled) return {command: command[0], args: command.slice(1), env: {...settings.kernelEnv}, cwd: settings.workingDir, key: 'disabled'};
  const args = sandboxArgs(policy, command);
  const cwd = policy.cwd ?? settings.workingDir;
  return {command: settings.codexCli, args, env: {...settings.kernelEnv, ...(settings.codexHome ? {CODEX_HOME: settings.codexHome} : {})}, cwd, key: JSON.stringify([cwd, args])};
}

// Serves MCP on `input`/`output` -> {closed: Promise<exit code>, shutdown()}. `startKernel` is the kernel-child seam
// (tests); `log` gets diagnostics (stderr).
export function createSupervisor({input, output, env, cwd = process.cwd(), startKernel = startKernelChild, log = line => process.stderr.write(`cua-repl-host: ${line}\n`)}) {
  const settings = hostSettings(env, {cwd});
  const sandboxed = settings.codexCli !== null;
  let initialized = false;
  let closing = false;
  let kernel = null;          // {child, key, generation}
  let generation = 0;
  let execCounter = 0;
  let execution = null;       // the execution waiting on the kernel
  let work = Promise.resolve();
  const turns = new Map();    // JSON [session, turn] -> the acknowledgement promise
  let resolveClosed;
  const closed = new Promise(resolve => { resolveClosed = resolve; });

  const write = message => { if (!output.destroyed && output.writable) output.write(`${JSON.stringify(message)}\n`); };
  const respond = (id, result) => write({jsonrpc: '2.0', id, result});
  const respondError = (id, code, message) => write({jsonrpc: '2.0', id, error: {code, message}});
  const toolResult = (id, result) => respond(id, {...result, _meta: {...(result._meta ?? {}), [REPL_HOST_META_KEY]: {...hostMarker}}});

  // ---- the kernel ----
  function launchKernel(launch) {
    const self = {key: launch.key, generation: ++generation};
    self.child = startKernel(launch, {
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

  // Ends the kernel's generation, then stops it: nothing it sends from here on reaches an execution.
  async function stopKernel() {
    const current = kernel;
    if (!current) return;
    kernel = null;
    generation++;
    await current.child.stop();
  }

  function fromKernel(self, message) {
    const reply = payload => self.child.send(payload);
    const current = execution?.kernel === self ? execution : null;
    switch (message.type) {
      case 'submitted_code_complete':
        if (current && message.exec_id === current.id) current.durationMs = typeof message.execution_duration_ms === 'number' ? message.execution_duration_ms : null;
        return;
      case 'exec_result':
        if (current && message.id === current.id) settle(current, assembleResult({
          ok: message.ok === true, error: typeof message.error === 'string' ? message.error : String(message.error),
          output: typeof message.output === 'string' ? message.output : '', namedOutputs: Array.isArray(message.named_outputs) ? message.named_outputs.map(String) : [],
          images: current.images, contentItems: Array.isArray(message.content_items) ? message.content_items : [], durationMs: current.durationMs,
        }));
        return;
      case 'emit_image': {
        if (!current || message.exec_id !== current.id) return reply({type: 'emit_image_result', id: message.id, ok: false, error: EXEC_CONTEXT_NOT_FOUND});
        const {image, error} = imageFromDataUrl(message.image_url);
        if (error) return reply({type: 'emit_image_result', id: message.id, ok: false, error});
        current.images.push(image);
        return reply({type: 'emit_image_result', id: message.id, ok: true});
      }
      // No trusted services in this host yet (M2 adds the trusted worker): requests fail as the vendor's do without
      // services, and the after-code hooks have nothing to run.
      case 'trusted_service_request':
        return reply({type: 'trusted_service_response', id: message.id, ok: false, error: NO_TRUSTED_SERVICES});
      case 'trusted_service_hooks':
        return reply({type: 'trusted_service_response', id: message.id, ok: true, value: null});
      default:
    }
  }

  function settle(current, result) {
    if (current.settled) return;
    current.settled = true;
    current.cancelTimer?.();
    if (execution === current) execution = null;
    current.resolve(result);
  }

  // ---- tool calls ----
  // Serialized js/js_reset work; returns once the call's result was written.
  function enqueue(task) {
    work = work.then(task).catch(error => log(`internal error: ${error.stack ?? error.message}`));
    return work;
  }

  async function runJs(id, {code, timeoutMs}, policy, requestMeta) {
    if (!policy.disabled && !sandboxed) return toolResult(id, sentenceResult(NO_SANDBOX_SENTENCE));
    const launch = kernelLaunch(settings, policy);
    if (kernel && kernel.key !== launch.key) await stopKernel();
    kernel ??= launchKernel(launch);
    const current = {id: `exec-${++execCounter}`, kernel, images: [], durationMs: null, settled: false};
    const result = new Promise(resolve => { current.resolve = resolve; });
    execution = current;
    current.cancelTimer = timer(timeoutMs, async () => {
      if (current.settled) return;
      if (kernel === current.kernel) await stopKernel();
      settle(current, sentenceResult(TIMEOUT_SENTENCE));
    });
    current.kernel.child.send({type: 'exec', id: current.id, code, ...(requestMeta ? {request_meta: requestMeta} : {})});
    toolResult(id, await result);
  }

  async function runReset(id) {
    await stopKernel();
    toolResult(id, sentenceResult(RESET_SENTENCE, {isError: false}));
  }

  function turnEnded(id, {sessionId, turnId}) {
    const key = JSON.stringify([sessionId, turnId]);
    if (!turns.has(key)) turns.set(key, Promise.resolve(sentenceResult('{}', {isError: false})));
    return turns.get(key).then(result => toolResult(id, result));
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
        let requestMeta = null;
        if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
          const {[SANDBOX_META_KEY]: _sandbox, ...rest} = meta;
          requestMeta = sortedJson(rest);
        }
        if (closing) return toolResult(msg.id, sentenceResult(SHUTTING_DOWN_SENTENCE));
        return enqueue(() => runJs(msg.id, parsed, policy, requestMeta));
      }
      if (name === 'js_reset') {
        resetArguments(args);
        return enqueue(() => runReset(msg.id));
      }
      if (name === 'turn_ended') return turnEnded(msg.id, turnEndedArguments(args));
      return toolResult(msg.id, sentenceResult(`unknown tool: ${name}`));
    } catch (error) {
      if (error instanceof InvalidParams) return respondError(msg.id, -32602, error.message);
      throw error;
    }
  }

  function onRequest(msg) {
    if (msg.method === 'initialize') {
      initialized = true;
      return respond(msg.id, initializeResult({protocolVersion: msg.params?.protocolVersion, sandboxed}));
    }
    if (!initialized) return respondError(msg.id, -32002, 'server not initialized');
    switch (msg.method) {
      case 'ping': return respond(msg.id, {});
      case 'tools/list': return respond(msg.id, {tools: toolsFor({sandboxed})});
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
    // Responses answer requests this host does not send yet (elicitation is M2's).
    if (msg.method !== undefined && msg.id !== undefined) onRequest(msg);
  });

  // EOF: what was admitted settles and is answered, then the kernel goes and the host exits.
  let finished = null;
  function shutdown({drain}) {
    closing = true;
    finished ??= (async () => {
      if (drain) await Promise.all([work, ...turns.values()]);
      await stopKernel();
      await new Promise(resolve => (output.writableEnded || output.destroyed ? resolve() : output.write('', resolve)));
      resolveClosed(0);
    })();
    return finished;
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
