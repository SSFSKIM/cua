// Ported from readable chatgpt-26.928.40906 NR:trusted-worker.js:1-230 (the trusted service process: trusted-code
// containment by real path, the privileged `nodeRepl` and `tmpDir` globals installed before any service loads, lazily
// imported and cached `handleRpc` services, the service/hook result envelope and the turn lifecycle), for
// docs/doperpowers/specs/2026-10-14-own-repl-host-design.md (M2, interfaces TrustedServiceWire and PrivilegedRuntime;
// Design "Trusted services and privileged APIs"). cua's own supervisor (./supervisor.mjs) runs it as
// `<node> --experimental-vm-modules trusted-worker.mjs <cwd>` under the same sandbox as the kernel. Changes from the
// source: an ES module; owned setting names (CUA_REPL_TRUSTED_SERVICES, CUA_REPL_TRUSTED_CODE_PATHS) in place of the
// vendor's NODE_REPL_ ones, which configure nothing here; a service is named only by an absolute path or file: URL
// (the vendor's package-name resolution through NODE_REPL_NODE_MODULE_DIRS is not ported: cua's launch registers
// services by real path, and resolving names through the vendor module tree would reach the legacy services the own
// route excludes); no response-meta tracing (NR:tracing.js, vendor telemetry) and no audio. Every sentence trusted code
// or a cell can observe is the vendor's. #120's clean-room rewrite replaces this port before distribution.
// Trusted service host. JSONL on stdout is reserved for the supervisor.
import { Console } from "node:console";
import { realpathSync } from "node:fs";
import { registerHooks } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createPrivilegedWorkerRuntime } from "./privileged-node-repl.mjs";
import {
  createWorkerRuntime,
  drainExecBackgroundTasks,
} from "./worker-runtime.mjs";

process.chdir(process.argv[2]);

const stderrConsole = new Console(process.stderr);

const configuredServices = JSON.parse(process.env.CUA_REPL_TRUSTED_SERVICES);
const handlers = new Map();
const trustedCodeRoots = (process.env.CUA_REPL_TRUSTED_CODE_PATHS ?? "")
  .split(path.delimiter)
  .filter((entry) => path.isAbsolute(entry))
  .flatMap((root) => {
    try {
      // Native realpath accepts Windows verbatim paths and expands short aliases.
      return [realpathSync.native(root)];
    } catch {
      return [];
    }
  });
function isTrustedCodePath(filename) {
  return trustedCodeRoots.some((root) => {
    const relative = path.relative(root, filename);
    return (
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    );
  });
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    if (resolved.url.startsWith("file:")) {
      const filename = realpathSync.native(fileURLToPath(resolved.url));
      if (!isTrustedCodePath(filename)) {
        throw new Error(
          `Trusted RPC dependency must resolve within a configured trusted code path: ${specifier}`,
        );
      }
      return { ...resolved, url: pathToFileURL(filename).href };
    }
    return resolved;
  },
});

const env = Object.freeze(
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([, value]) => typeof value === "string",
    ),
  ),
);
const runtime = createWorkerRuntime({
  cwd: process.cwd(),
  env,
  homeDir: process.env.HOME ?? null,
  tmpDir: os.tmpdir(),
});
const { execContext, send } = runtime;
globalThis.console = runtime.createConsole(stderrConsole);
Object.freeze(runtime.nodeRepl);
const privilegedRuntime = createPrivilegedWorkerRuntime({
  env,
  runtime,
});
Object.defineProperty(globalThis, "nodeRepl", {
  configurable: false,
  enumerable: false,
  value: privilegedRuntime.nodeRepl,
  writable: false,
});
Object.defineProperty(globalThis, "tmpDir", {
  configurable: false,
  enumerable: false,
  value: os.tmpdir(),
  writable: false,
});

function resolveTrustedService(configured) {
  if (configured.startsWith("file:") || path.isAbsolute(configured)) {
    return configured.startsWith("file:")
      ? configured
      : pathToFileURL(configured).href;
  }

  throw new Error(
    `Trusted RPC package must resolve within a configured trusted module directory: ${configured}`,
  );
}

async function loadHandler(service) {
  let handler = handlers.get(service);
  if (handler === undefined) {
    const configured = configuredServices[service];
    if (typeof configured !== "string") {
      throw new Error(`Trusted RPC service is not configured: ${service}`);
    }
    handler = import(resolveTrustedService(configured)).then((module) => {
      if (typeof module.handleRpc !== "function") {
        throw new Error(
          `Trusted RPC service ${service} does not export handleRpc`,
        );
      }
      return module.handleRpc;
    });
    handlers.set(service, handler);
  }
  return await handler;
}

async function runInExecContext(message, operation) {
  const execState = runtime.createExecState(message);
  execContext.activate(execState.id);
  const response = {
    type: "trusted_service_response",
    id: message.id,
    output: execState.outputEvents,
    content_items: execState.contentItems,
  };
  const sendResponse = (result) => {
    send({ ...response, ...result });
  };
  try {
    const value = await execContext.run(execState, async () => {
      const result = await operation();
      if (message.type !== "run_hooks") {
        await drainExecBackgroundTasks(execState);
      }
      return result ?? null;
    });
    sendResponse({ ok: true, value });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleServiceRequest(message) {
  await runInExecContext(message, async () => {
    const handler = await loadHandler(message.service);
    return await handler(message.request);
  });
}

function handleNodeReplMessage(message) {
  if (message.type === "turn_ended") {
    const execState = runtime.createExecState(message);
    execContext.activate(execState.id);
    void execContext
      .run(execState, () =>
        privilegedRuntime.turnEndedHandlers.run(Object.freeze(message.event)),
      )
      .finally(() => {
        execContext.clear(execState.id);
        send({ type: "turn_ended_result", id: message.id });
      });
    return;
  }
  if (message.type === "run_hooks") {
    void runInExecContext(message, () =>
      privilegedRuntime.afterSubmittedCodeHooks.run(),
    ).finally(() => {
      execContext.clear(message.exec_id);
    });
    return;
  }
  if (!runtime.settle(message)) {
    privilegedRuntime.nativePipeBridge.handleMessage(message);
  }
}

runtime.listen((message) => {
  if (message.type === "service") {
    void handleServiceRequest(message);
    return;
  }
  handleNodeReplMessage(message);
});
