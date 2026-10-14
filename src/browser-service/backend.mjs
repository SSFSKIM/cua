// Ported from readable chatgpt-26.928.40906 BS:67812-68146 (class uh, the backend session transport); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: Oi, the JSON-RPC peer (BS:10347-10485); wi, ih and N_, the u32 frames over nodeRepl.nativePipe
// (BS:66590-66850); ah and sh, the connection (BS:66864-66896); discovery: Cte and Ste (BS:67722-67747), cL, wte, vte
// and $_ (BS:67496-67641), Gg and Yr (BS:18301-18370); dh (BS:68147-68152); ph, the turn-ended tracker
// (BS:68154-68213); We and ht, the turn metadata (BS:35772-35803).
//
// The service's end of the backend protocol (the host's: src/chrome/host.mjs). A Backend is one socket to one backend,
// opened through the trusted worker's nativePipe (the supervisor owns the OS socket), carrying u32-framed JSON-RPC: the
// service's requests out, the backend's notifications (onCDPEvent, onCDPDetach, onDownloadChange, onPageEvent) in.
// A BackendApi is the vendor's uh over it: the backend's methods by name, each session request carrying the current
// turn's session_id, turn_id and session_context. Dropped from uh: the identity gate (agentRequestHeaderEnabled; a
// backend announcing it is refused instead), cached CDP expressions, browser-auth target protection, tab reads, the
// foreground follow of orbit sessions, allowDownload (never asked of an extension backend) and the WebMCP notice; from
// discovery: Chrome profile names read from disk (cua's hosts name their profile), the full-CDP, WebMCP and
// accessibility capability rewrites (the manifest's), and telemetry.
import {readdir} from 'node:fs/promises';
import {endianness} from 'node:os';
import {isAbsolute, resolve} from 'node:path';
import {BrowserServiceError, DEADLINE_EXCEEDED, serviceError} from './errors.mjs';
import {Deadline} from './budgets.mjs';

const HEADER_BYTES = 4;
const LE = endianness() === 'LE';
const MAX_FRAME_BYTES = 0xffffffff;
// The host's own bound on a CDP command without a timeoutMs (src/chrome/host.mjs DEFAULT_CDP_TIMEOUT_MS), and how long
// past a command's bound the service still waits for the host's answer when the command has no deadline: the host
// answers a timed-out command only after detaching the tab, and a detach can stall.
export const HOST_CDP_TIMEOUT_MS = 10000;
export const CDP_ANSWER_GRACE_MS = 1000;
const exceeded = () => new BrowserServiceError('timeout', DEADLINE_EXCEEDED);
// How long discovery waits for a backend's getInfo ($_).
export const BACKEND_INFO_TIMEOUT_MS = 5000;
// The vendor's own socket directory on macOS and Linux (Va), listed when BROWSER_USE_BACKEND_PATHS is unset.
export const VENDOR_SOCKET_DIR = '/tmp/codex-browser-use';
// BROWSER_USE_AVAILABLE_BACKENDS names backends by these (Yr); the service drives `extension` backends.
const BACKEND_KIND = {cdp: 'cdp', extension: 'chrome', iab: 'iab', mcpapps: 'mcpapps'};

const asError = value => (value instanceof Error ? value : new Error(String(value)));

function encodeFrame(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  if (body.length > MAX_FRAME_BYTES) throw new Error('native pipe message exceeds frame limit');
  const frame = Buffer.alloc(HEADER_BYTES + body.length);
  if (LE) frame.writeUInt32LE(body.length, 0); else frame.writeUInt32BE(body.length, 0);
  body.copy(frame, HEADER_BYTES);
  return frame;
}

// -> push(chunk) => the complete frames' JSON texts so far.
function frameDecoder() {
  let pending = Buffer.alloc(0);
  return chunk => {
    pending = pending.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk);
    const out = [];
    while (pending.length >= HEADER_BYTES) {
      const length = LE ? pending.readUInt32LE(0) : pending.readUInt32BE(0);
      if (pending.length < HEADER_BYTES + length) break;
      out.push(pending.subarray(HEADER_BYTES, HEADER_BYTES + length).toString('utf8'));
      pending = pending.subarray(HEADER_BYTES + length);
    }
    return out;
  };
}

// The requests a backend may send the service (dh): only ping.
const CLIENT_HANDLERS = {ping: () => 'pong'};

export class Backend {
  #stream;
  #decode = frameDecoder();
  #nextId = 1;
  #pending = new Map();
  #handlers = new Map();
  #closeListeners = new Set();
  #terminal = null;

  // `stream` is a nativePipe connection: write(bytes), on/off('data' | 'close' | 'error'), end().
  constructor(stream) {
    this.#stream = stream;
    stream.on('data', chunk => { if (this.#stream === stream) this.#receive(chunk); });
    stream.on('error', error => { if (this.#stream === stream) this.close(asError(error)); });
    stream.on('close', () => { if (this.#stream === stream) this.#markClosed(new Error('native pipe closed before response')); });
  }

  get closed() { return this.#terminal !== null; }

  // Sends `method` and resolves with the backend's result or rejects with its error ({message, code}). With a
  // `sessionId` the session fields ride along. A `deadline` (budgets.mjs) bounds the wait: a spent one sends nothing,
  // and when it runs out after sending, the request is abandoned (rejected with `expired()`, by default the deadline
  // error; its late answer is dropped) and never sent again.
  request(method, params = {}, {sessionId, turnId, sessionContext = 'live', deadline, expired = exceeded} = {}) {
    try { deadline?.check(); } catch (error) { return Promise.reject(error); }
    const message = {...params, ...(sessionId !== undefined ? {session_id: sessionId, turn_id: turnId, session_context: sessionContext} : {})};
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      let timer;
      const settle = (fn, value) => { clearTimeout(timer); fn(value); };
      this.#pending.set(id, {resolve: value => settle(resolve, value), reject: error => settle(reject, error)});
      try {
        this.#send({jsonrpc: '2.0', method, params: message, id});
      } catch (error) {
        this.#pending.delete(id);
        settle(reject, error);
        return;
      }
      if (deadline) timer = setTimeout(() => { if (this.#pending.delete(id)) reject(expired()); }, deadline.remaining());
    });
  }

  // Requests sent and not yet answered (or abandoned).
  get pendingCount() { return this.#pending.size; }

  notify(method, params = {}) { this.#send({jsonrpc: '2.0', method, params}); }

  // -> unsubscribe.
  on(notification, handler) {
    const handlers = this.#handlers.get(notification) ?? new Set();
    this.#handlers.set(notification, handlers);
    handlers.add(handler);
    return () => { handlers.delete(handler); };
  }

  // `listener(error)` once the connection is gone, at once if it is already; -> unsubscribe.
  onClose(listener) {
    this.#closeListeners.add(listener);
    if (this.#terminal) Promise.resolve().then(() => listener(this.#terminal.error)).catch(() => {});
    return () => { this.#closeListeners.delete(listener); };
  }

  async close(error) {
    const stream = this.#stream;
    await this.#markClosed(error);
    try { stream?.end(); } catch {}
  }

  #send(message) {
    if (!this.#stream) throw new Error('native pipe is closed');
    this.#stream.write(encodeFrame(message));
  }

  #receive(chunk) {
    try {
      for (const text of this.#decode(chunk)) {
        const message = JSON.parse(text);
        if (message == null || typeof message !== 'object' || Array.isArray(message)) throw new Error('invalid native pipe transport message');
        this.#dispatch(message);
      }
    } catch (error) {
      this.close(asError(error));
    }
  }

  #dispatch(message) {
    if ('method' in message) {
      if (message.id === undefined) {
        // A listener's failure is its own: the connection and the other listeners carry on.
        for (const handler of [...(this.#handlers.get(message.method ?? '') ?? [])]) {
          try { handler(message.params); } catch {}
        }
        return;
      }
      const handler = Object.hasOwn(CLIENT_HANDLERS, message.method) ? CLIENT_HANDLERS[message.method] : null;
      this.#send(handler
        ? {jsonrpc: '2.0', id: message.id, result: handler(message.params)}
        : {jsonrpc: '2.0', id: message.id, error: {code: -1, message: `No handler registered for method: ${message.method}`}});
      return;
    }
    const entry = this.#pending.get(message.id);
    if (!entry) return;
    this.#pending.delete(message.id);
    if ('error' in message) {
      entry.reject(Object.assign(new Error(message.error?.message || 'Something went wrong'),
        typeof message.error?.code === 'number' ? {code: message.error.code} : {}));
      return;
    }
    entry.resolve(message.result);
  }

  async #markClosed(error) {
    if (this.#terminal) return;
    this.#terminal = {error};
    this.#stream = null;
    const reason = error?.message ?? 'transport closed before response';
    for (const entry of this.#pending.values()) entry.reject(new Error(reason));
    this.#pending.clear();
    await Promise.allSettled([...this.#closeListeners].map(async listener => listener(error)));
  }
}

// Opens a Backend on the socket at `path` through the trusted worker's nativePipe bridge.
export async function connect(path, {nativePipe = globalThis.nodeRepl?.nativePipe} = {}) {
  if (typeof nativePipe?.createConnection !== 'function') throw new Error('privileged native pipe bridge is not available; browser-client is not trusted');
  return new Backend(await nativePipe.createConnection(path));
}

// --- the turn ------------------------------------------------------------------------------------------------------

// The current turn's metadata from the runtime's request meta (We), or undefined.
export function turnMetadata(runtime) {
  let meta = runtime?.requestMeta?.['x-codex-turn-metadata'];
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch { return undefined; }
  }
  return meta != null && typeof meta === 'object' && !Array.isArray(meta) ? meta : undefined;
}

// The browser session a turn belongs to: a subagent's own thread, else the session (ht).
export function sessionIdOf(meta) {
  if (meta?.thread_source === 'subagent' && typeof meta.thread_id === 'string') return meta.thread_id;
  return typeof meta?.session_id === 'string' ? meta.session_id : undefined;
}

// --- the session API (uh) ------------------------------------------------------------------------------------------

export class BackendApi {
  // `getTurnMetadata()` is the current turn's metadata; `turnEndedTracker` ({track(turn, handler)}, a TurnEndedTracker)
  // hears of every turn a session request is made in, so the turn's end reaches the backend.
  constructor(backend, {getTurnMetadata = () => turnMetadata(globalThis.nodeRepl), turnEndedTracker = null} = {}) {
    this.backend = backend;
    this.getTurnMetadata = getTurnMetadata;
    this.turnEndedTracker = turnEndedTracker;
    this.addEventListener('onPageEvent', event => { this.pendingPageEvents.push(event); });
  }

  backend;
  getTurnMetadata;
  turnEndedTracker;
  // Set by the browser's owner: detaches the turn's tabs before the backend is told the turn ended. Called with
  // `stillCurrent()`, false once another turn has begun.
  detachTurn;
  lastSessionParams = null;
  clientInfo;
  committedTabUrlSupported = true;
  pendingPageEvents = [];
  endingTurnId;

  // -> unsubscribe.
  addEventListener(notification, handler) { return this.backend.on(notification, handler); }

  ping() { return this.sendRequest('ping'); }

  // {target: {tabId, sessionId? | targetId?}, method, commandParams, timeoutMs?, preserveDebuggerOnTimeout?}. The
  // answer is awaited until the command's `deadline`, or without one until its timeoutMs (the host's 10 s default)
  // plus a grace; past that the command is abandoned with the host's own timeout sentence, never re-sent.
  executeCdp(params, {deadline} = {}) {
    const limit = typeof params.timeoutMs === 'number' && params.timeoutMs > 0 ? params.timeoutMs : HOST_CDP_TIMEOUT_MS;
    const expired = () => new BrowserServiceError('timeout', `Timed out after ${limit}ms waiting for CDP command ${params.method}.`);
    return this.sendSessionRequest('executeCdp', params, {deadline: deadline ?? new Deadline(limit + CDP_ANSWER_GRACE_MS), expired});
  }

  matchesCurrentSessionId(sessionId) {
    const current = sessionIdOf(this.getTurnMetadata());
    return typeof current === 'string' ? current === sessionId : this.lastSessionParams?.session_id === sessionId;
  }

  getCurrentSessionId() { return this.getSessionParams().session_id; }

  getCurrentTurnId() {
    const meta = this.getTurnMetadata();
    if (typeof sessionIdOf(meta) === 'string' && typeof meta?.turn_id === 'string') return meta.turn_id;
  }

  takePageEvents() { return this.pendingPageEvents.splice(0); }

  attach(tabId) { return this.sendSessionRequest('attach', {tabId}); }
  attachTarget(tabId, targetId) { return this.sendSessionRequest('attachTarget', {tabId, targetId}); }
  detach(tabId) { return this.sendSessionRequest('detach', {tabId}); }
  detachTarget(tabId, targetId) { return this.sendSessionRequest('detachTarget', {tabId, targetId}); }
  getTabs() { return this.sendSessionRequest('getTabs', {}); }

  async getCommittedTabUrl(tabId) {
    if (this.committedTabUrlSupported) {
      try {
        return await this.sendSessionRequest('getCommittedTabUrl', {tabId});
      } catch (error) {
        if (error?.message !== 'No handler registered for method: getCommittedTabUrl') throw error;
        this.committedTabUrlSupported = false;
      }
    }
    // An extension backend without the method: the tab list's URL (the vendor's other backend types are not served).
    const tab = (await this.getTabs()).find(t => t.id === tabId);
    if (tab == null) throw new Error(`Tab not found: ${tabId}`);
    return tab.url;
  }

  getUserTabs() { return this.sendSessionRequest('getUserTabs', {}); }
  claimUserTab(tabId) { return this.sendSessionRequest('claimUserTab', {tabId}); }
  executeTabRead(request) { return this.sendSessionRequest('executeTabRead', request); }
  getUserHistory(query) { return this.sendSessionRequest('getUserHistory', query); }
  createTab(preferredWindowId) { return this.sendSessionRequest('createTab', preferredWindowId == null ? {} : {preferredWindowId}); }
  markTab(tabId, status) { return this.sendSessionRequest('markTab', {tabId, status}); }
  nameSession(name) { return this.sendSessionRequest('nameSession', {name}); }
  executeUnhandledCommand(command) { return this.sendSessionRequest('executeUnhandledCommand', command); }
  moveMouse(params, {deadline} = {}) { return this.sendSessionRequest('moveMouse', params, {deadline}); }
  // A notification: a WebMCP tool is being invoked in a tab ({parentCallId, tabId, toolName}).
  sendWebMcpToolInvoked(params) { this.backend.notify('webMcpToolInvoked', {...params, ...this.getSessionParams()}); }

  // The backend's info, cached as clientInfo. A backend announcing the ChatGPT extension's agent request headers is
  // refused: its identity gate is OpenAI's, and the service serves cua's host and MAWS only. The host needs no session
  // for getInfo, so with no turn known it goes without one (the vendor would fail it).
  async getInfo() {
    const info = this.#sessionParamsOrNull()
      ? await this.sendSessionRequest('getInfo', {})
      : await this.backend.request('getInfo', {});
    if (info?.agentRequestHeaderEnabled !== undefined) throw serviceError('unsupported_backend');
    this.clientInfo = info;
    return info;
  }

  turnEnded = async turn => {
    try {
      if (this.detachTurn != null && this.matchesCurrentTurn(turn)) {
        this.endingTurnId = turn.turn_id;
        try {
          await this.detachTurn(() => this.matchesCurrentTurn(turn));
        } finally {
          this.endingTurnId = undefined;
        }
      }
    } finally {
      await this.sendRequest('turnEnded', {session_id: turn.session_id, turn_id: turn.turn_id});
    }
  };

  // -> unsubscribe.
  addCloseListener(listener) { return this.backend.onClose(listener); }

  async close() { await this.backend.close(); }

  // A request carrying the current turn's session (`deadline` bounds the wait).
  sendSessionRequest(method, params, {deadline, expired} = {}) {
    let session;
    try { session = this.getSessionParams(); } catch (error) { return Promise.reject(error); }
    if (method !== 'getInfo' && method !== 'getUserTabs') this.lastSessionParams = {session_id: session.session_id, turn_id: session.turn_id};
    if (this.clientInfo != null && this.turnEndedTracker != null && this.endingTurnId !== session.turn_id)
      this.turnEndedTracker.track({session_id: session.session_id, turn_id: session.turn_id}, this.turnEnded);
    return this.#send(method, params, session, deadline, expired);
  }

  sendRequest(method, params = {}) { return this.backend.request(method, params); }

  matchesCurrentTurn(turn) {
    if (this.getTurnMetadata() == null && this.lastSessionParams == null) return false;
    const session = this.getSessionParams();
    return session.session_id === turn.session_id && session.turn_id === turn.turn_id;
  }

  // {session_id, turn_id, session_context}: the live turn's, else the last one used ("cached").
  getSessionParams() {
    const meta = this.getTurnMetadata();
    if (meta == null && this.lastSessionParams != null) return {...this.lastSessionParams, session_context: 'cached'};
    const sessionId = sessionIdOf(meta);
    if (typeof sessionId !== 'string') throw new Error('Missing required browser session_id');
    const turnId = meta?.turn_id;
    if (typeof turnId !== 'string') throw new Error('Missing required browser turn_id');
    return {session_id: sessionId, turn_id: turnId, session_context: 'live'};
  }

  #sessionParamsOrNull() {
    try { return this.getSessionParams(); } catch { return null; }
  }

  #send(method, params, session, deadline, expired) {
    return this.backend.request(method, params, {sessionId: session.session_id, turnId: session.turn_id, sessionContext: session.session_context,
      deadline, ...(expired ? {expired} : {})});
  }
}

// --- the turn-ended tracker (ph) -----------------------------------------------------------------------------------

// One node_repl turn-ended hook for the runtime: each backend's turnEnded runs once for every turn it was used in.
export class TurnEndedTracker {
  sessions = new Map();          // session_id -> Map(handler -> turn_id)
  disposed = false;

  constructor(runtime) {
    if (typeof runtime?.addTurnEndedHandler !== 'function') throw new Error('Browser Use requires Node REPL turn-ended hooks');
    this.removeTurnEndedHandler = runtime.addTurnEndedHandler({
      timeoutMs: 4000,
      run: ({session_id: sessionId, turn_id: turnId}) => this.finishTurn({session_id: sessionId, turn_id: turnId}),
    });
  }

  track({session_id: sessionId, turn_id: turnId}, handler) {
    if (this.disposed) return;
    let handlers = this.sessions.get(sessionId);
    if (handlers == null) {
      handlers = new Map();
      this.sessions.set(sessionId, handlers);
    }
    handlers.set(handler, turnId);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.removeTurnEndedHandler();
    this.sessions.clear();
  }

  async finishTurn(turn) {
    const handlers = this.sessions.get(turn.session_id);
    if (handlers == null) return;
    const due = [];
    for (const [handler, turnId] of handlers) {
      if (turnId !== turn.turn_id) continue;
      handlers.delete(handler);
      due.push(handler);
    }
    if (handlers.size === 0) this.sessions.delete(turn.session_id);
    await Promise.all(due.map(async handler => { try { await handler(turn); } catch {} }));
  }
}

// --- discovery -----------------------------------------------------------------------------------------------------

// The backend socket paths: BROWSER_USE_BACKEND_PATHS verbatim when set (absolute, deduplicated; an empty list means
// none), else every entry of the vendor's socket directory (Cte, Ste).
export async function backendPaths(env, {socketDir = VENDOR_SOCKET_DIR} = {}) {
  const listed = env?.BROWSER_USE_BACKEND_PATHS;
  if (listed != null) {
    const paths = [];
    for (const path of listed.split(':')) {
      if (path === '') continue;
      if (!isAbsolute(path)) throw new Error('BROWSER_USE_BACKEND_PATHS entries must be absolute');
      paths.push(path);
    }
    return [...new Set(paths)];
  }
  try {
    return (await readdir(socketDir)).map(name => resolve(socketDir, name));
  } catch {
    return [];
  }
}

// BROWSER_USE_AVAILABLE_BACKENDS (a comma list of cdp, chrome, iab, mcpapps), when set, admits only those kinds (Gg).
function admitted(env, info) {
  const raw = env?.BROWSER_USE_AVAILABLE_BACKENDS;
  if (typeof raw !== 'string') return true;
  const kinds = raw.split(',').map(s => s.trim()).filter(s => Object.values(BACKEND_KIND).includes(s));
  return kinds.includes(BACKEND_KIND[info?.type]);
}

function bounded(promise, ms) {
  let timer;
  const bound = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms waiting for browser backend info.`)), ms); });
  return Promise.race([promise, bound]).finally(() => clearTimeout(timer));
}

let nextBrowserId = 1;

// The browsers the backend sockets serve now: [{id, path, info, api}], `api` a BackendApi (its `backend` the
// connection). A path already in `previous` keeps its browser; a previous browser whose path is no longer listed is
// closed. A path that cannot be connected, does not answer getInfo within `infoTimeoutMs`, is refused, or is a kind
// BROWSER_USE_AVAILABLE_BACKENDS excludes is left out (its connection closed). `createApi(backend)` builds each API
// (the owner passes its turn metadata and turn-ended tracker); a failed listing is no browsers (cL).
export async function discoverBackends(env, {nativePipe, previous = [], createApi = backend => new BackendApi(backend),
  infoTimeoutMs = BACKEND_INFO_TIMEOUT_MS, socketDir} = {}) {
  let paths;
  try { paths = await backendPaths(env, {socketDir}); } catch { paths = []; }
  const kept = new Map(previous.filter(b => !b.api.backend.closed).map(b => [b.path, b]));
  const listed = new Set(paths);
  await Promise.all(previous.filter(b => !listed.has(b.path) || b.api.backend.closed).map(b => b.api.close().catch(() => {})));
  const found = await Promise.all(paths.map(async path => {
    if (kept.has(path)) return kept.get(path);
    let api = null;
    try {
      api = createApi(await connect(path, {nativePipe}));
      const info = await bounded(api.getInfo(), infoTimeoutMs);
      return {id: String(nextBrowserId++), path, info, api};
    } catch {
      await api?.close().catch(() => {});
      return null;
    }
  }));
  const browsers = [];
  for (const browser of found) {
    if (browser == null) continue;
    if (admitted(env, browser.info)) browsers.push(browser);
    else await browser.api.close().catch(() => {});
  }
  return browsers;
}
