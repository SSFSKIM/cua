// The own native engine spike's client (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Design "The
// service", Client; Interfaces, EngineProtocol and EngineClient; the seed of M1a's src/services/engine/client.mjs).
// It reaches the engine only through the trusted worker's `nodeRepl.nativePipe.createConnection(path)` (the own host's
// relay opens the socket outside the sandbox), at `engine.sock` beside the bundle CUA_ENGINE_APP names.
//
// Connect, as the vendor's native pipe does (R/A-contract.md §2.1): a 250 ms connect-and-ping loop, then a launch of the
// bundle through `nodeRepl.launchServices.openApplication({applicationPath})`, then reconnects for up to 5 s, retrying
// every 100 ms. The ping speaks `cua-engine-1` and the answer's engineVersion and build must equal the bundle's
// (its Info.plist, as assemble.mjs writes it); a mismatch fails at once with a diagnostic naming `cua install --engine`
// and is never retried, launched over or shut down: a service never replaces an engine it did not launch.
//
// Requests are chained, one in flight at a time, each with a deadline (120 s by default) sent as
// deadlineUnixMilliseconds, computed when its frame is written (not when it is queued behind another request), and kept
// by a timer here. A request past its deadline, an oversized or malformed frame, or a
// closed socket fails what is in flight and drops the connection; the next request reconnects. Frames are a 4-byte
// little-endian length then UTF-8 JSON, 8 MiB at most each way.
//
// Errors are the vendor's classes (S/targets/mac/errors.js), so src/services/sky.mjs classifies them unchanged: an engine
// error is SkyComputerUseError with the vendor's errorName for its code (else `jsonRPCError`), the engine's own name
// as `engineErrorName`, its input meta as `meta`, and the vendor helper's message envelope (`Computer Use server error
// <code>: <message>`, R/A-contract.md §1.5); everything else is SkyComputerUseTransportError with a bounded sentence.
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';

export const CLIENT_API_VERSION = 'cua-engine-1';
export const MAX_FRAME = 8 * 1024 * 1024;
export const DEFAULT_DEADLINE_MS = 120_000;
const FIRST_CONNECT_MS = 250;
const LAUNCH_WAIT_MS = 5_000;
const RETRY_MS = 100;
const PING_MS = 1_000;

// ServerErrorCode of the pinned vendor client (S/targets/mac/errors.js).
const VENDOR_CODES = {
  senderProcessNotAuthenticated: -10000, couldNotGetRequestData: -10001, couldNotGetRequestTypeName: -10002,
  couldNotResolveRequestType: -10003, unhandledEvent: -10004, unknownError: -10005, appNotAllowed: -10006,
  runningApplicationNotFound: -10007, accessibilityError: -10008, permissionsNotGranted: -10009, invalidApp: -10010,
  noActiveSession: -10011, userStoppedSession: -10012, incompatibleClientVersion: -10013, permissionsPending: -10014,
  blockedURL: -10015, userIntervened: -10016, couldNotGetSenderPID: -10017, ambiguousApp: -10018,
  couldNotGetBootstrapPort: -10019, screenLocked: -10020,
};
const NAME_BY_CODE = new Map(Object.entries(VENDOR_CODES).map(([name, code]) => [code, name]));

export class SkyComputerUseError extends Error {
  constructor({code, message, engineErrorName = null, meta = null}) {
    super(message);
    this.name = 'SkyComputerUseError';
    this.code = code;
    this.errorName = NAME_BY_CODE.get(code) ?? 'jsonRPCError';
    this.engineErrorName = engineErrorName;
    this.meta = meta;
    this.request = null;
    this.requestType = 'jsonRPC';
  }
}

export class SkyComputerUseTransportError extends Error {
  constructor(message, {cause} = {}) {
    super(message);
    this.name = 'SkyComputerUseTransportError';
    this.cause = cause;
  }
}

// A connect attempt that found no engine within its window (internal: the caller launches, or gives up).
class NotYet extends Error {
  constructor(cause) { super('no engine answered'); this.cause = cause; }
}
// A ping answer that must not be retried: another API, version or build.
class Mismatch extends SkyComputerUseTransportError {}

export function encodeFrame(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  if (body.length > MAX_FRAME) throw new SkyComputerUseTransportError(`cua engine frame is too large: ${body.length}`);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

export class FrameDecoder {
  buffer = Buffer.alloc(0);

  // The complete messages `chunk` finishes; throws on a declared length above the bound or a body that is not JSON.
  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : Buffer.from(chunk);
    const messages = [];
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length > MAX_FRAME) throw new SkyComputerUseTransportError(`cua engine frame is too large: ${length}`);
      if (this.buffer.length < 4 + length) break;
      const text = this.buffer.subarray(4, 4 + length).toString('utf8');
      this.buffer = this.buffer.subarray(4 + length);
      try { messages.push(JSON.parse(text)); } catch { throw new SkyComputerUseTransportError('cua engine returned an invalid JSON-RPC response'); }
    }
    return messages;
  }
}

export const socketPathFor = appPath => join(dirname(appPath), 'engine.sock');

// The bundle's {engineVersion, build}, from the Info.plist assemble.mjs writes (CFBundleShortVersionString,
// CUAEngineBuild).
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

// The vendor's response shape check (S/targets/mac/native-pipe.js): a numeric id, jsonrpc 2.0, exactly one of result
// and error, an error with a numeric code and a string message.
function validResponse(message) {
  if (!message || typeof message !== 'object' || typeof message.id !== 'number' || message.jsonrpc !== '2.0') return false;
  const hasResult = Object.hasOwn(message, 'result');
  if (hasResult === Object.hasOwn(message, 'error')) return false;
  return hasResult || (message.error && typeof message.error === 'object' && typeof message.error.code === 'number' && typeof message.error.message === 'string');
}

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

  call(method, params, timeoutMs) {
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
      }, timeoutMs);
      this.pending.set(id, {resolve, reject, timer});
      this.pipe.write(bytes);
    });
  }

  settle(message) {
    const waiter = this.pending.get(message.id);
    if (!waiter) return;
    this.pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (Object.hasOwn(message, 'result')) return waiter.resolve(message.result);
    const {code, message: text, errorName = null, meta = null} = message.error;
    waiter.reject(new SkyComputerUseError({code, message: `Computer Use server error ${code}: ${text}`, engineErrorName: errorName, meta}));
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

// `nodeRepl` is the trusted worker's (nativePipe, launchServices); `expected` the bundle's {engineVersion, build} or a
// function reading them (bundleIdentity by default, read at each connect, so a replaced bundle is seen).
export function createEngineClient({nodeRepl, appPath, socketPath = socketPathFor(appPath), expected = () => bundleIdentity(appPath),
  firstConnectMs = FIRST_CONNECT_MS, launchWaitMs = LAUNCH_WAIT_MS}) {
  let connection = null;
  let identity = null;
  let connecting = null;
  let tail = Promise.resolve();

  function check(answer, want) {
    if (answer?.serverApiVersion !== CLIENT_API_VERSION)
      throw new Mismatch(`cua engine API version mismatch: client=${CLIENT_API_VERSION} server=${String(answer?.serverApiVersion)}`);
    if (answer.engineVersion !== want.engineVersion || answer.build !== want.build)
      throw new Mismatch(`cua engine mismatch: the engine answering ${socketPath} is version ${answer.engineVersion} build ${answer.build}, but ${appPath} is version ${want.engineVersion} build ${want.build}; that engine was started from another build and is left running. Stop it (the spike: node scripts/spike/engine/measure.mjs stop) and retry, or install this build with cua install --engine`);
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
    let want;
    try { want = typeof expected === 'function' ? expected() : expected; } catch (error) { throw new SkyComputerUseTransportError(error.message, {cause: error}); }
    try { return await attempt(firstConnectMs, want); } catch (error) { if (!(error instanceof NotYet)) throw error; }
    try { await nodeRepl.launchServices.openApplication({applicationPath: appPath}); } catch (cause) {
      throw new SkyComputerUseTransportError('cua engine launch request failed', {cause});
    }
    try { return await attempt(launchWaitMs, want); } catch (error) {
      if (!(error instanceof NotYet)) throw error;
      throw new SkyComputerUseTransportError(`cua engine did not start: nothing answered at ${socketPath} within ${launchWaitMs} ms of launching ${appPath}`, {cause: error.cause});
    }
  }

  // Resolves the engine's identity ({serverApiVersion, engineVersion, build}) once a checked connection is live.
  function connect() {
    if (connection && !connection.closed) return Promise.resolve(identity);
    connecting ??= establish().finally(() => { connecting = null; });
    return connecting;
  }

  // One request at a time, in call order: -> {result, engineMs}, engineMs the round trip on the socket. `params` may be
  // a function, called just before the frame is written (execute's deadline is computed then).
  function call(method, params, timeoutMs = DEFAULT_DEADLINE_MS) {
    const run = async () => {
      await connect();
      const body = typeof params === 'function' ? params() : params;
      const started = performance.now();
      const result = await connection.call(method, body, timeoutMs);
      return {result, engineMs: performance.now() - started};
    };
    const result = tail.then(run, run);
    tail = result.then(() => {}, () => {});
    return result;
  }

  return {
    get connected() { return Boolean(connection && !connection.closed); },
    get identity() { return identity; },
    connect,
    call,
    execute(method, args, {deadlineMs = DEFAULT_DEADLINE_MS, lineage} = {}) {
      return call('execute', () => ({method, args, deadlineUnixMilliseconds: Date.now() + deadlineMs, ...(lineage ? {lineage} : {})}), deadlineMs);
    },
    close() { connection?.close(); },
  };
}
