// The host's client mode, for MAWS's in-app browser (docs/doperpowers/specs/2026-10-08-maws-in-app-browser-design.md,
// "cua: the host's client mode, discovery, profiles_list"). MAWS serves the extension's primitives on one Unix socket per
// app session and passes its path to that session's engine as CUA_BROWSER_BACKENDS; the path is the session's
// authorization. A process that reads the variable (`cua serve`, and `cua profiles list` for its listing) connects to
// each path and runs the ordinary host (src/chrome/host.mjs runHost) over that connection, in this process:
//
//   vendor service ──socket──▶ host (this process) ──socket (u32-framed JSON-RPC)──▶ MAWS's primitive server
//
// Each host listens at $CUA_HOME/chrome/m/<socketNameFor(<configured path>)>-<pid>.sock, a name known before any
// hello and unique per process, so a relaunched `cua serve`, a fork subagent's own shim and an inventory launch run
// their own hosts for one MAWS session side by side (no already_served) and one exiting never touches another's.
// Nothing scans chrome/m: a process lists exactly the hosts it opened (discovery.mjs), which keeps one session's
// backend out of every other process's vendor service. The host's socket exists only while connected; a refused or
// lost connection (MAWS quitting and relaunching while the engine lives, D-16; a hello refused for its protocol) is
// retried every CLIENT_RETRY_MS for the life of the process.
import {connect} from 'node:net';
import {isAbsolute, join} from 'node:path';
import {fail} from '../runtime/errors.mjs';
import {runHost} from './host.mjs';
import {clientModeDir, isMawsInstance, socketNameFor} from './extension.mjs';

export const BACKENDS_ENV = 'CUA_BROWSER_BACKENDS';
export const CLIENT_RETRY_MS = 5000;
// How long a launch waits for each configured backend's hello, so the first listBrowsers already finds it.
export const HELLO_WAIT_MS = 5000;
export {isMawsInstance};
// profiles_list's key for the n-th configured backend (one is the normal case).
export const mawsKey = index => (index === 0 ? 'maws' : `maws-${index + 1}`);
export const clientSocketName = (path, pid) => `${socketNameFor(path)}-${pid}`;

// -> the configured socket paths (absolute, in order, without repeats); [] when unset or empty.
export function configuredBackends(env = process.env) {
  const value = env[BACKENDS_ENV];
  if (!value) return [];
  const paths = value.split(':').filter(Boolean);
  const relative = paths.find(path => !isAbsolute(path));
  if (relative !== undefined) fail('invalid_setting', `${BACKENDS_ENV} must list absolute socket paths separated by ":"; got ${JSON.stringify(relative)}`);
  return [...new Set(paths)];
}

const dial = path => new Promise(resolve => {
  const socket = connect(path);
  const failed = error => resolve({error});
  socket.once('error', failed);
  socket.once('connect', () => { socket.off('error', failed); resolve({socket}); });
});

function connector({home, path, index, pid, retryMs, log}) {
  const socketName = clientSocketName(path, pid);
  const socketPath = join(clientModeDir(home), `${socketName}.sock`);
  let closed = false, listening = false, instanceId = null, socket = null, wake = null, lastState = null;
  let settle;
  // Settles at the first hello, or at the first attempt that ends without one (nothing listens, the hello is refused).
  const firstOutcome = new Promise(resolve => { settle = resolve; });
  const report = (state, line) => { if (state !== lastState) { lastState = state; log(line); } };

  async function run() {
    while (!closed) {
      const {socket: connected, error} = await dial(path);
      if (connected && !closed) {
        socket = connected;
        const result = await runHost({stdin: connected, stdout: connected, home, pid, socketName, onListening: ({hello}) => {
          instanceId = hello.extensionInstanceId;
          listening = true;
          report('connected', `MAWS backend ${path}: connected (${instanceId}), host at ${socketPath}`);
          settle();
        }});
        listening = false;
        socket = null;
        connected.destroy();
        if (!closed) report(`lost:${result.reason}`, `MAWS backend ${path}: connection ended (${result.reason}); retrying every ${retryMs / 1000} s`);
      } else {
        connected?.destroy();
        if (!closed) report(`unreachable:${error?.code}`, `MAWS backend ${path}: unreachable (${error?.code ?? 'closed'}); retrying every ${retryMs / 1000} s`);
      }
      settle();
      if (closed) break;
      await new Promise(resolve => { const timer = setTimeout(resolve, retryMs); wake = () => { clearTimeout(timer); resolve(); }; });
      wake = null;
    }
  }
  const done = run();

  return {
    key: mawsKey(index), path, socketPath, firstOutcome,
    get instanceId() { return instanceId; },
    get ready() { return listening; },
    entry: () => (listening ? {key: mawsKey(index), ready: true, extensionInstanceId: instanceId} : {key: mawsKey(index), ready: false, reason: 'maws_unreachable'}),
    async close() {
      closed = true;
      socket?.destroy();   // the host sees its port close and removes its socket and status file
      wake?.();
      await done;
    },
  };
}

// Starts one connector per configured path. -> {waitForHellos(ms), hostPaths(), entries(), defaultInstance(), close()}.
export function startClientBackends({home, paths, pid = process.pid, retryMs = CLIENT_RETRY_MS, log = () => {}}) {
  const backends = paths.map((path, index) => connector({home, path, index, pid, retryMs, log}));
  return {
    backends,
    // Resolves once every backend said hello or failed its first attempt, or after `ms`.
    async waitForHellos(ms = HELLO_WAIT_MS) {
      let timer;
      await Promise.race([Promise.all(backends.map(b => b.firstOutcome)), new Promise(resolve => { timer = setTimeout(resolve, ms); })]);
      clearTimeout(timer);
    },
    // Every host socket this process opens, listening or not yet: the vendor retries a listed path on each listBrowsers.
    hostPaths: () => backends.map(b => b.socketPath),
    entries: () => backends.map(b => b.entry()),
    // The first configured backend's instance id, once it has said hello (kept while it is away), else null.
    defaultInstance: () => backends[0]?.instanceId ?? null,
    close: () => Promise.all(backends.map(b => b.close())).then(() => {}),
  };
}
