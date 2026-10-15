// Ported from readable chatgpt-26.928.40906 NR:privileged-node-repl.js:1-673 (the trusted worker's privileged `nodeRepl`:
// lifecycle hooks, elicitation, timeout suspension, response meta, LaunchServices, the native pipe proxy and content
// items), for docs/doperpowers/specs/2026-10-14-own-repl-host-design.md (M2, interface PrivilegedRuntime; Design
// "Trusted services and privileged APIs"). Changes from the source: an ES module; the privileged API is the one the
// spec retains, so `config` (NR:privileged-node-repl-config.js, M4 audits its callers), `fetch` (authenticated fetch),
// `otel`, `telemetry` and `gaasBrowserConfig` are not ported: they reach the vendor's app-server, account and
// telemetry bridges, which the own route excludes; and the hooks' deadlines are reported to the supervisor
// (`hook_deadlines`, cua's) whenever a hook is added or removed. Every sentence trusted code can observe is the vendor's. #120's
// clean-room rewrite replaces this port before distribution.

import { Buffer } from "node:buffer";
import {
  isPlainObject,
  makeRejectedThenable,
  toByteArray,
  trackExecBackgroundOperation,
} from "./worker-runtime.mjs";

function createLifecycleHandlers(name, concurrent = false, onChange = () => {}) {
  const hooks = new Set();
  return {
    // cua: the longest these hooks can take, their deadlines run concurrently (the longest) or in sequence (the sum).
    deadlineMs() {
      const deadlines = [...hooks].map((hook) => hook.timeoutMs);
      return concurrent
        ? Math.max(0, ...deadlines)
        : deadlines.reduce((total, ms) => total + ms, 0);
    },
    add(options) {
      if (
        !isPlainObject(options) ||
        typeof options.run !== "function" ||
        !Number.isSafeInteger(options.timeoutMs) ||
        options.timeoutMs <= 0
      ) {
        throw new Error(
          `nodeRepl.${name} expected { run: function, timeoutMs: positive integer }`,
        );
      }
      const hook = { run: options.run, timeoutMs: options.timeoutMs };
      hooks.add(hook);
      onChange();
      return () => {
        const removed = hooks.delete(hook);
        if (removed) onChange();
        return removed;
      };
    },
    async run(event) {
      const runHandler = async ({ run, timeoutMs }) => {
        let timer;
        try {
          await Promise.race([
            Promise.resolve().then(() => run(event)),
            new Promise((resolve) => {
              timer = setTimeout(resolve, timeoutMs);
            }),
          ]);
        } catch {
          // Hooks are best-effort side effects.
        } finally {
          clearTimeout(timer);
        }
      };
      if (concurrent) {
        await Promise.all([...hooks].map(runHandler));
      } else {
        for (const hook of [...hooks]) await runHandler(hook);
      }
    },
  };
}

function createPrivilegedHostOperations({
  execContext,
  pendingRequests,
  send,
}) {
  let elicitationCounter = 0;

  function createElicitation(request) {
    let execState;
    try {
      execState = execContext.getCurrent();
      if (!execState.formElicitationSupported) {
        throw new Error(
          "nodeRepl.createElicitation is unavailable because the MCP client does not support form elicitation",
        );
      }
    } catch (error) {
      return makeRejectedThenable(error);
    }
    const operation = (async () => {
      const value = await request;
      if (!isPlainObject(value)) {
        throw new Error("nodeRepl.createElicitation expected a request object");
      }
      if (
        Object.keys(value).some(
          (key) =>
            key !== "message" && key !== "meta" && key !== "requestedSchema",
        )
      ) {
        throw new Error(
          "nodeRepl.createElicitation received an unsupported value",
        );
      }
      if (
        typeof value.message !== "string" ||
        value.message.trim().length === 0
      ) {
        throw new Error(
          "nodeRepl.createElicitation expected a non-empty message",
        );
      }
      if (value.meta != null && !isPlainObject(value.meta)) {
        throw new Error("nodeRepl.createElicitation meta must be an object");
      }
      const id = `${execState.id}-elicitation-${elicitationCounter++}`;
      send({
        type: "elicit",
        id,
        exec_id: execState.id,
        message: value.message,
        requested_schema:
          value.requestedSchema == null
            ? { type: "object", properties: {} }
            : structuredClone(value.requestedSchema),
        meta: value.meta == null ? null : structuredClone(value.meta),
      });
      return new Promise((resolve, reject) => {
        pendingRequests.set(id, (response) => {
          if (!response.ok) {
            reject(new Error(response.error || "createElicitation failed"));
            return;
          }
          resolve({
            action: response.action,
            content: response.content ?? null,
            _meta: response._meta ?? null,
          });
        });
      });
    })();
    return trackExecBackgroundOperation(execState, operation);
  }

  return { createElicitation };
}

function createNativePipeBridge({ execContext, send }) {
  const pendingRequests = new Map();
  const connections = new Map();
  // A peer may close before its connect response resumes in JavaScript.
  const pendingClosures = new Map();
  let requestCounter = 0;

  function request(op, payload = {}) {
    const id = `native-pipe-${requestCounter++}`;
    send({
      type: "native_pipe_request",
      id,
      op,
      ...payload,
    });
    return new Promise((resolve, reject) => {
      pendingRequests.set(id, (message) => {
        if (!message.ok) {
          reject(new Error(message.error || "native pipe request failed"));
          return;
        }
        resolve(message.result);
      });
    });
  }

  function queueListener(listener, ...args) {
    void Promise.resolve()
      .then(() => listener(...args))
      .catch(() => {});
  }

  function closeConnection(connection, error) {
    if (connection.closed) {
      return;
    }
    connection.closed = true;
    connection.error = error;
    execContext.run(connection.execState, () => {
      if (error) {
        for (const listener of connection.listeners.error) {
          queueListener(listener, error);
        }
      }
      for (const listener of connection.listeners.close) {
        queueListener(listener);
      }
    });
  }

  const nativePipe = Object.freeze({
    async createConnection(pipePath) {
      if (typeof pipePath !== "string" || pipePath.length === 0) {
        throw new Error("native pipe path must be a non-empty string");
      }
      const result = await request("connect", { path: pipePath });
      const connectionId =
        result &&
        typeof result === "object" &&
        typeof result.connection_id === "string"
          ? result.connection_id
          : null;
      if (!connectionId) {
        throw new Error(
          "native pipe connect returned an invalid connection id",
        );
      }
      const connection = {
        execState: execContext.getAsync(),
        listeners: { data: new Set(), close: new Set(), error: new Set() },
        closed: pendingClosures.has(connectionId),
        error: pendingClosures.get(connectionId) ?? null,
      };
      pendingClosures.delete(connectionId);
      if (!connection.closed) {
        connections.set(connectionId, connection);
      }
      return Object.freeze({
        write(data) {
          if (connection.closed) {
            return;
          }
          const current = execContext.getOptional();
          if (current != null) {
            connection.execState = current;
          }
          const bytes = toByteArray(data);
          if (!bytes) {
            throw new Error("native pipe write expected bytes");
          }
          void request("write", {
            connection_id: connectionId,
            data_base64: Buffer.from(bytes).toString("base64"),
          }).catch((error) => {
            // Either a rejected write or a close event is terminal.
            closeConnection(
              connection,
              error instanceof Error ? error : new Error(String(error)),
            );
          });
        },
        on(event, listener) {
          if (event !== "data" && event !== "close" && event !== "error") {
            throw new Error(`unsupported native pipe event: ${String(event)}`);
          }
          if (typeof listener !== "function") {
            throw new Error("native pipe event listener must be a function");
          }
          if (connection.listeners[event].has(listener)) {
            return;
          }
          connection.listeners[event].add(listener);
          // Terminal events remain observable to listeners attached late.
          if (event === "error" && connection.error) {
            queueListener(listener, connection.error);
          }
          if (event === "close" && connection.closed) {
            queueListener(listener);
          }
        },
        off(event, listener) {
          if (event !== "data" && event !== "close" && event !== "error") {
            throw new Error(`unsupported native pipe event: ${String(event)}`);
          }
          connection.listeners[event].delete(listener);
        },
        end() {
          void request("close", { connection_id: connectionId }).catch(
            () => {},
          );
        },
      });
    },
  });

  function handleMessage(message) {
    if (message.type === "native_pipe_response") {
      const resolver = pendingRequests.get(message.id);
      if (resolver) {
        pendingRequests.delete(message.id);
        resolver(message);
      }
      return true;
    }
    if (message.type === "native_pipe_data") {
      const connection = connections.get(message.connection_id);
      if (connection) {
        const data = Buffer.from(message.data_base64, "base64");
        execContext.run(connection.execState, () => {
          for (const listener of connection.listeners.data) {
            listener(data);
          }
        });
      }
      return true;
    }
    if (message.type === "native_pipe_closed") {
      const connection = connections.get(message.connection_id);
      const error = message.error ? new Error(message.error) : null;
      if (!connection) {
        pendingClosures.set(message.connection_id, error);
      } else {
        connections.delete(message.connection_id);
        closeConnection(connection, error);
      }
      return true;
    }
    return false;
  }

  return { handleMessage, nativePipe };
}

function createPrivilegedNodeReplBridge({
  addAfterSubmittedCodeHook,
  addTurnEndedHandler,
  createElicitation,
  env,
  getCurrentExecState,
  nativePipe,
  nodeRepl,
  pendingRequests,
  send,
}) {
  let privilegedNodeReplRequestCounter = 0;

  function sendPrivileged(execState, message) {
    send({
      ...message,
      exec_id: execState.id,
    });
  }

  function handlePrivilegedNodeReplOperation(operationName, buildPayload) {
    let execState;
    try {
      execState = getCurrentExecState();
    } catch (error) {
      return makeRejectedThenable(error);
    }

    const operation = (async () => {
      const payload = await buildPayload();
      const id = `${execState.id}-privileged-node-repl-${privilegedNodeReplRequestCounter++}`;
      sendPrivileged(execState, {
        ...payload,
        id,
      });
      return new Promise((resolve, reject) => {
        pendingRequests.set(id, (res) => {
          if (!res.ok) {
            reject(new Error(res.error || `${operationName} failed`));
            return;
          }
          resolve(Object.hasOwn(res, "value") ? res.value : {});
        });
      });
    })();

    return trackExecBackgroundOperation(execState, operation);
  }

  function withSuspendedTimeout(fn) {
    let execState;
    try {
      execState = getCurrentExecState();
      if (typeof fn !== "function") {
        throw new Error("nodeRepl.withSuspendedTimeout expected a function");
      }
    } catch (error) {
      return makeRejectedThenable(error);
    }

    const operation = (async () => {
      sendPrivileged(execState, {
        type: "suspend_timeout",
      });
      try {
        return await fn();
      } finally {
        sendPrivileged(execState, {
          type: "resume_timeout",
        });
      }
    })();

    return trackExecBackgroundOperation(execState, operation);
  }

  const launchServices = Object.freeze({
    openApplication(target) {
      return handlePrivilegedNodeReplOperation(
        "nodeRepl.launchServices.openApplication",
        async () => {
          const normalized = normalizeLaunchServicesTarget(
            await target,
            isPlainObject,
          );
          return {
            type: "launch_services_action",
            action: "open_application",
            application_path: normalized.applicationPath,
            bundle_identifier: normalized.bundleIdentifier,
          };
        },
      );
    },
  });

  const privilegedNodeReplProperties = {
    addTurnEndedHandler: {
      configurable: false,
      enumerable: true,
      value: addTurnEndedHandler,
      writable: false,
    },
    addAfterSubmittedCodeHook: {
      configurable: false,
      enumerable: true,
      value: addAfterSubmittedCodeHook,
      writable: false,
    },
    launchServices: {
      configurable: false,
      enumerable: true,
      value: launchServices,
      writable: false,
    },
    env: {
      configurable: false,
      enumerable: true,
      value: env,
      writable: false,
    },
    createElicitation: {
      configurable: false,
      enumerable: true,
      value(request) {
        return createElicitation(request);
      },
      writable: false,
    },
    setResponseMeta: {
      configurable: false,
      enumerable: true,
      value(meta) {
        const execState = getCurrentExecState();
        if (!isPlainObject(meta)) {
          throw new Error("nodeRepl.setResponseMeta expected a plain object");
        }
        const previous = execState.responseMeta;
        const responseMeta = previous
          ? { ...previous, ...structuredClone(meta) }
          : structuredClone(meta);
        execState.responseMeta = responseMeta;
        send({
          type: "response_meta",
          id: execState.id,
          response_meta: responseMeta,
        });
      },
      writable: false,
    },
    nativePipe: {
      configurable: false,
      enumerable: true,
      value: nativePipe,
      writable: false,
    },
    emitContentItem: {
      configurable: false,
      enumerable: true,
      value(text) {
        if (typeof text !== "string") {
          throw new Error("nodeRepl.emitContentItem expected a string");
        }
        getCurrentExecState().contentItems.push(text);
      },
      writable: false,
    },
    withSuspendedTimeout: {
      configurable: false,
      enumerable: true,
      value: withSuspendedTimeout,
      writable: false,
    },
  };
  return Object.freeze(Object.create(nodeRepl, privilegedNodeReplProperties));
}

function normalizeLaunchServicesTarget(target, isPlainObject) {
  if (!isPlainObject(target)) {
    throw new Error(
      "nodeRepl.launchServices.openApplication expected a target object",
    );
  }
  const unexpectedKeys = Object.keys(target).filter(
    (key) => key !== "applicationPath" && key !== "bundleIdentifier",
  );
  if (unexpectedKeys.length > 0) {
    throw new Error(
      "nodeRepl.launchServices.openApplication received an unsupported target",
    );
  }
  const applicationPath = nonEmptyString(target.applicationPath);
  const bundleIdentifier = nonEmptyString(target.bundleIdentifier);
  if ((applicationPath == null) === (bundleIdentifier == null)) {
    throw new Error(
      "nodeRepl.launchServices.openApplication expected exactly one of applicationPath or bundleIdentifier",
    );
  }
  return { applicationPath, bundleIdentifier };
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function createPrivilegedWorkerRuntime({ env, runtime }) {
  const { execContext, pendingRequests, send } = runtime;
  // cua: the supervisor bounds what it waits for from this process by these deadlines (src/repl-host/supervisor.mjs),
  // so it hears them whenever a hook is added or removed.
  const reportDeadlines = () =>
    send({
      type: "hook_deadlines",
      after_code_ms: afterSubmittedCodeHooks.deadlineMs(),
      turn_ended_ms: turnEndedHandlers.deadlineMs(),
    });
  const afterSubmittedCodeHooks = createLifecycleHandlers(
    "addAfterSubmittedCodeHook",
    false,
    reportDeadlines,
  );
  const turnEndedHandlers = createLifecycleHandlers(
    "addTurnEndedHandler",
    true,
    reportDeadlines,
  );
  const nativePipeBridge = createNativePipeBridge({
    execContext,
    send,
  });
  const { createElicitation } = createPrivilegedHostOperations({
    execContext,
    pendingRequests,
    send,
  });

  return {
    afterSubmittedCodeHooks,
    turnEndedHandlers,
    nativePipeBridge,
    nodeRepl: createPrivilegedNodeReplBridge({
      addAfterSubmittedCodeHook: afterSubmittedCodeHooks.add,
      addTurnEndedHandler: turnEndedHandlers.add,
      createElicitation,
      env,
      getCurrentExecState: execContext.getCurrent,
      nativePipe: nativePipeBridge.nativePipe,
      nodeRepl: runtime.nodeRepl,
      pendingRequests,
      send,
    }),
  };
}
