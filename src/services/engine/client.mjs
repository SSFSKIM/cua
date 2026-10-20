// EngineClient (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Design "The service", Client;
// Interfaces, EngineClient): the service's one connection to cua's engine, reached only through the trusted worker's
// `nodeRepl.nativePipe.createConnection(path)` (the host's relay opens the socket outside the sandbox), at `engine.sock`
// beside the bundle CUA_ENGINE_APP names.
//
// Connect, as the vendor's native pipe does (R/A-contract.md §2.1): a 250 ms connect-and-ping loop, then a launch of the
// bundle through `nodeRepl.launchServices.openApplication({applicationPath})` (the own host runs `open -n -g -a`), then
// reconnects for up to 5 s, retrying every 100 ms. The ping speaks `cua-engine-1`, and the answer's engineVersion and
// build must equal the bundle's (its Info.plist): a mismatch fails at once with a diagnostic naming
// `cua install --engine`, never retried, launched over or shut down, since a service never replaces an engine it did not
// launch (another checkout's session may be using it). An engine that never answers fails with a diagnostic pointing at
// the unified log, where the engine records why it stopped (an invalid peerPolicy setting stops it before it listens).
//
// Requests are chained, one in flight at a time, each with its deadline (120 s by default) sent as
// deadlineUnixMilliseconds, computed when its frame is written, not when it is queued. The engine enforces the deadline
// itself (it cancels a settle or a launch wait at it, answering timeoutReached), so the client waits a grace beyond it
// before giving up on the connection: an answer the engine sends at the deadline arrives, and the connection with its
// lineages survives. A request with no answer past that, an oversized or malformed frame, or a closed socket fails what
// is in flight and drops the connection; the next request reconnects (and the engine's lineages of this connection end).
//
// The cell's budget: the connect (with any launch wait) and every request but the ones the caller marks `suspend: false`
// run under `nodeRepl.withSuspendedTimeout`, so an engine launch, an action, a settle or an app's launch wait never spends
// the cell's own time; suspensions nest. Errors are ./protocol.mjs's, the vendor's classes.
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {
  CLIENT_API_VERSION, FrameDecoder, SkyComputerUseError, SkyComputerUseTransportError, encodeFrame, serverError, validResponse,
} from './protocol.mjs';

export {SkyComputerUseError, SkyComputerUseTransportError};

export const DEFAULT_DEADLINE_MS = 120_000;
const DEADLINE_GRACE_MS = 2_000;
const FIRST_CONNECT_MS = 250;
const LAUNCH_WAIT_MS = 5_000;
const RETRY_MS = 100;
const PING_MS = 1_000;
const UNIFIED_LOG = 'log show --last 10m --info --predicate \'subsystem == "io.github.ssfskim.cua.engine"\'';

export const socketPathFor = appPath => join(dirname(appPath), 'engine.sock');

// The bundle's {engineVersion, build}, from its Info.plist (CFBundleShortVersionString, CUAEngineBuild), as the
// assembling script writes them.
export function bundleIdentity(appPath) {
  const path = join(appPath, 'Contents', 'Info.plist');
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (error) { throw new Error(`cua engine: cannot read the bundle's Info.plist at ${path} (${error.code ?? error.message})`); }
  const value = key => {
    const match = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(text);
    return match ? match[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : null;
  };
  const engineVersion = value('CFBundleShortVersionString');
  const build = value('CUAEngineBuild');
  if (!engineVersion || !build) throw new Error(`cua engine: the bundle's Info.plist at ${path} names no CFBundleShortVersionString or CUAEngineBuild`);
  return {engineVersion, build};
}

// A connect attempt that found no engine within its window (internal: the caller launches, or gives up).
class NotYet extends Error {
  constructor(cause) { super('no engine answered'); this.cause = cause; }
}
// A ping answer that must not be retried: another API, version or build.
class Mismatch extends SkyComputerUseTransportError {}

// One socket connection: frames in and out, the requests waiting for their answers.
class Connection {
  constructor(pipe) {
    this.pipe = pipe;
    this.pending = new Map();
    this.nextId = 1;
    this.closed = false;
    this.decoder = new FrameDecoder();
    pipe.on('data', chunk => {
      try {
        for (const message of this.decoder.push(chunk)) {
          if (!validResponse(message)) throw new SkyComputerUseTransportError('cua engine returned an invalid JSON-RPC response');
          this.settle(message);
        }
      } catch (error) {
        this.close(error);
      }
    });
    pipe.on('error', error => this.close(new SkyComputerUseTransportError(`cua engine connection failed: ${error?.message ?? error}`, {cause: error})));
    pipe.on('close', () => this.close(new SkyComputerUseTransportError('cua engine connection closed before response')));
  }

  // Writes one request; its answer, or a transport error when none comes within `waitMs`.
  call(method, params, waitMs) {
    if (this.closed) return Promise.reject(new SkyComputerUseTransportError('cua engine connection is closed'));
    const id = this.nextId++;
    let bytes;
    try { bytes = encodeFrame({jsonrpc: '2.0', id, method, params}); } catch (error) { return Promise.reject(error); }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new SkyComputerUseTransportError(`cua engine ${method} timed out`));
        // The engine may still be working on it; a fresh connection is the only state the next request can trust.
        this.close(new SkyComputerUseTransportError('cua engine connection closed after a timed-out request'));
      }, waitMs);
      this.pending.set(id, {resolve, reject, timer});
      this.pipe.write(bytes);
    });
  }

  settle(message) {
    const waiter = this.pending.get(message.id);
    if (!waiter) return;
    this.pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (Object.hasOwn(message, 'result')) waiter.resolve(message.result);
    else waiter.reject(serverError(message.error));
  }

  close(error = new SkyComputerUseTransportError('cua engine connection is closed')) {
    if (this.closed) return;
    this.closed = true;
    for (const {reject, timer} of this.pending.values()) { clearTimeout(timer); reject(error); }
    this.pending.clear();
    try { this.pipe.end(); } catch { /* already gone */ }
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function within(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new SkyComputerUseTransportError(message)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// `nodeRepl` is the trusted worker's (nativePipe, launchServices, withSuspendedTimeout); `expected` the bundle's
// {engineVersion, build} or a function reading them (bundleIdentity by default, read at each connect, so a replaced
// bundle is seen).
export function createEngineClient({nodeRepl, appPath, socketPath = socketPathFor(appPath), expected = () => bundleIdentity(appPath),
  firstConnectMs = FIRST_CONNECT_MS, launchWaitMs = LAUNCH_WAIT_MS, deadlineGraceMs = DEADLINE_GRACE_MS}) {
  let connection = null;
  let identity = null;
  let connecting = null;
  let tail = Promise.resolve();

  function suspended(fn) {
    if (typeof nodeRepl?.withSuspendedTimeout !== 'function') throw new Error('Computer Use requires nodeRepl.withSuspendedTimeout');
    return nodeRepl.withSuspendedTimeout(fn);
  }

  function check(answer, want) {
    if (answer?.serverApiVersion !== CLIENT_API_VERSION) {
      throw new Mismatch(`cua engine API version mismatch: client=${CLIENT_API_VERSION} server=${String(answer?.serverApiVersion)}; the engine answering ${socketPath} is from another release and is left running. Install this release's engine with cua install --engine`);
    }
    if (answer.engineVersion !== want.engineVersion || answer.build !== want.build) {
      throw new Mismatch(`cua engine mismatch: the engine answering ${socketPath} is version ${answer.engineVersion} build ${answer.build}, but ${appPath} is version ${want.engineVersion} build ${want.build}; that engine was started from another build and is left running. Install this build with cua install --engine, which stops the old engine once nothing uses it`);
    }
    return {serverApiVersion: answer.serverApiVersion, engineVersion: answer.engineVersion, build: answer.build};
  }

  async function attempt(budgetMs, want) {
    const deadline = Date.now() + budgetMs;
    let last;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new NotYet(last);
      const opening = nodeRepl.nativePipe.createConnection(socketPath);
      let pipe = null;
      try { pipe = await within(opening, remaining, 'cua engine connection timed out'); } catch (error) {
        opening.then(late => late.end(), () => {});
        last = error;
      }
      if (pipe) {
        const candidate = new Connection(pipe);
        try {
          const answer = await candidate.call('ping', {clientApiVersion: CLIENT_API_VERSION}, Math.min(PING_MS, Math.max(1, deadline - Date.now())));
          const checked = check(answer, want);
          connection = candidate;
          identity = checked;
          return checked;
        } catch (error) {
          candidate.close();
          if (error instanceof Mismatch || (error instanceof SkyComputerUseError && error.errorName === 'incompatibleClientVersion')) throw error;
          last = error;
        }
      }
      if (Date.now() >= deadline) throw new NotYet(last);
      await sleep(RETRY_MS);
    }
  }

  async function establish() {
    if (typeof nodeRepl?.nativePipe?.createConnection !== 'function') {
      throw new SkyComputerUseTransportError('cua engine native pipe is unavailable: the trusted nodeRepl has no nativePipe');
    }
    let want;
    try { want = typeof expected === 'function' ? expected() : expected; } catch (error) { throw new SkyComputerUseTransportError(error.message, {cause: error}); }
    try { return await attempt(firstConnectMs, want); } catch (error) { if (!(error instanceof NotYet)) throw error; }
    try { await nodeRepl.launchServices.openApplication({applicationPath: appPath}); } catch (cause) {
      throw new SkyComputerUseTransportError(`cua engine launch request failed for ${appPath}: ${String(cause?.message ?? cause).slice(0, 300)}`, {cause});
    }
    try { return await attempt(launchWaitMs, want); } catch (error) {
      if (!(error instanceof NotYet)) throw error;
      throw new SkyComputerUseTransportError(`cua engine did not start: nothing answered at ${socketPath} within ${launchWaitMs} ms of launching ${appPath}. The engine logs why it stopped (a peerPolicy in ~/.config/cua/engine.json it does not have, a lock or socket another engine holds) to the unified log: ${UNIFIED_LOG}`, {cause: error.cause});
    }
  }

  // Resolves the engine's identity ({serverApiVersion, engineVersion, build}) once a checked connection is live; the
  // connect, and any launch wait, runs under the suspended budget.
  function connect() {
    if (connection && !connection.closed) return Promise.resolve(identity);
    connecting ??= suspended(establish).finally(() => { connecting = null; });
    return connecting;
  }

  // One request at a time, in call order: -> {result, engineMs}, engineMs the round trip on the socket. `params` may be
  // a function, called just before the frame is written (execute's deadline is computed then).
  function call(method, params, {waitMs = DEFAULT_DEADLINE_MS + deadlineGraceMs, suspend = true} = {}) {
    const run = async () => {
      await connect();
      const body = typeof params === 'function' ? params() : params;
      const started = performance.now();
      const result = await connection.call(method, body, waitMs);
      return {result, engineMs: performance.now() - started};
    };
    const queued = () => (suspend ? suspended(run) : run());
    const result = tail.then(queued, queued);
    tail = result.then(() => {}, () => {});
    return result;
  }

  return {
    get connected() { return Boolean(connection && !connection.closed); },
    get identity() { return identity; },
    connect,
    // `execute {method, args, deadlineUnixMilliseconds, lineage?}` -> {result, engineMs}.
    execute(method, args, {deadlineMs = DEFAULT_DEADLINE_MS, lineage, suspend = true} = {}) {
      const params = () => ({method, args, deadlineUnixMilliseconds: Date.now() + deadlineMs, ...(lineage ? {lineage} : {})});
      return call('execute', params, {waitMs: deadlineMs + deadlineGraceMs, suspend});
    },
    // The engine's `status` answer (its identity, grants and other connections).
    async status() {
      return (await call('status', {}, {suspend: false})).result;
    },
    close() { connection?.close(); },
  };
}
