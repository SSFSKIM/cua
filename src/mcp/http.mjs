// MCP Streamable HTTP (protocol revision 2025-03-26, accepting 2025-06-18 clients) at the path /mcp: one session per
// `initialize`, each session one connection (src/mcp/connection.mjs) fed through an in-memory stream pair.
//
// The handler works on an abstract request and response, so the agent's node:http listener (src/remote/agent.mjs) and
// the relay's channels (E3) drive the same code:
//   req: {method, url, headers (lower-cased names), body: AsyncIterable<Buffer>, signal: AbortSignal (the client went away)}
//   res: {writeHead(status, headers), write(chunk), end(chunk?)}
//
// Who may call: a bearer equal to the client credential (constant-time), checked before anything else is read, then an
// Origin, when one is sent, from the allowlist (`null` never is). Sessions:
// - `initialize` without a session header opens one: its InitializeResult is the JSON body, with Mcp-Session-Id (the
//   connection's own session id). An open that fails is 500 with `cua: <code>`; at the session cap the oldest Idle
//   session is evicted first, and with none Idle the answer is 503.
// - A POST of requests on a session answers on a text/event-stream that ends once each of its requests is answered; a
//   POST of only notifications and responses is 202. A GET opens the session's one standing stream (a second is 409).
//   DELETE ends the session and answers once its connection has released everything (the id is 404 from the start).
// Routing: a response goes on the POST stream that carried its request id. A message the connection starts (an
// elicitation, a progress or log notification) goes on the oldest open POST stream, else the GET stream, else into a
// per-session buffer drained into the next stream that opens; a session whose buffer would pass `bufferLimit` closes.
// Small resumability: every event of a POST stream has an id `<stream>-<n>`, the stream opens with a priming event
// (`retry: 15000`, `<stream>-0`, empty data) so that a client whose stream drops before the first response still holds
// an id to resume from (Claude Code's client resumes only streams that carried one, and only twice; the retry spaces
// those attempts across a relay restart), and the stream keeps its events while it lives; when the client drops it before all its requests are answered, the later responses are kept, and a GET whose
// Last-Event-ID names that stream replays every event after the named one and then carries the rest. A GET naming no
// such stream is an ordinary GET. Every open stream (POST or GET) that has been silent for `keepaliveMs` gets an SSE
// comment (`: keepalive`), so proxies and NATs do not cut a long js call; comments are never events.
// Idle: a session with no request for `idleMs`, nothing it was asked still unanswered (an open or dropped POST stream's
// requests) and no request of its own awaiting the client's answer (a pending elicitation, counted only while some
// stream of the session is open: a client that went away mid-approval holds none) closes; the quiet time is
// counted from the last request or from the moment the session stopped being busy, whichever is later. For eviction a
// session is Idle when it is not busy in that sense and has no task open (no js work since its last end_task), at any
// age.
//
// `open` is the connection opener, a seam for tests; `console` is the console state E2 wires into the js refusal.
import {randomUUID} from 'node:crypto';
import {PassThrough} from 'node:stream';
import {createInterface} from 'node:readline';
import {openConnection} from './connection.mjs';
import {credentialMatches} from '../remote/device.mjs';

const PROTOCOL_VERSIONS = new Set(['2025-03-26', '2025-06-18']);
const SSE_HEADERS = {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache'};
const RETRY_MS = 15_000;
const idKey = id => JSON.stringify(id);
const isMessage = m => m !== null && typeof m === 'object' && !Array.isArray(m) && (typeof m.method === 'string' || m.id !== undefined);
const isRequest = m => m.method !== undefined && m.id !== undefined;
const pathOf = url => url.split('?')[0];

function rpcError(res, status, code, message, id = null) {
  res.writeHead(status, {'Content-Type': 'application/json'});
  res.end(JSON.stringify({jsonrpc: '2.0', id, error: {code, message}}));
}

// The response as the handler uses it: written once, ended once, whatever path reaches it.
function guard(res) {
  let started = false;
  let ended = false;
  return {
    get started() { return started; },
    writeHead(status, headers) { started = true; res.writeHead(status, headers); },
    write(chunk) { if (!ended) res.write(chunk); },
    end(chunk) { if (ended) return; ended = true; res.end(chunk); },
  };
}

async function readBody(body) {
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

// An open SSE response: a `: keepalive` comment goes out whenever a whole interval passed without a write.
function sse(res, keepaliveMs) {
  let wrote = false;
  const timer = setInterval(() => {
    if (!wrote) res.write(': keepalive\n\n');
    wrote = false;
  }, keepaliveMs);
  timer.unref?.();
  return {
    write(chunk) { wrote = true; res.write(chunk); },
    end() { clearInterval(timer); res.end(); },
  };
}

const onAbort = (signal, fn) => {
  if (signal.aborted) fn();
  else signal.addEventListener('abort', fn, {once: true});
};

export function createMcpHttp({home, env = process.env, clientCredential, allowedOrigins = [], maxSessions = 1, idleMs = 15 * 60_000,
  bufferLimit = 16 * 1024 * 1024, keepaliveMs = 20_000, console: consoleState = () => ({onConsole: true, locked: false}),
  diagnostics = line => process.stderr.write(`cua agent: ${line}\n`), open = openConnection}) {
  const sessions = new Map();
  const ending = new Set();        // close promises of sessions on their way out
  const opening = new Set();       // opens in progress, each holding a place under the cap
  let shutdown = null;             // the reason, once close() was called

  // ---- one session ----

  const streamOpen = session => session.get !== null || [...session.streams.values()].some(s => s.res);
  const busy = session => session.routes.size > 0 || (session.serverPending.size > 0 && streamOpen(session));
  const evictable = session => !busy(session) && session.connection.state === 'idle';

  function touch(session) {
    clearTimeout(session.timer);
    session.timer = null;
    if (session.gone || busy(session)) return;
    session.timer = setTimeout(() => {
      diagnostics(`session ${session.id}: idle for ${Math.round(idleMs / 1000)} s; closing it`);
      endSession(session, 'eof');
    }, idleMs);
    session.timer.unref?.();
  }

  function endSession(session, reason) {
    if (!session.gone) {
      session.gone = true;
      sessions.delete(session.id);
      clearTimeout(session.timer);
    }
    if (!session.closing) {
      session.connection.close(reason);
      session.closing = session.closed;
      ending.add(session.closing);
      session.closing.then(() => ending.delete(session.closing));
    }
    return session.closing;
  }

  const sseEvent = (stream, msg) => {
    const n = ++stream.n;
    const event = `id: ${stream.id}-${n}\ndata: ${JSON.stringify(msg)}\n\n`;
    stream.events.push({n, event});
    stream.res?.write(event);
  };
  const toGet = (session, msg) => session.get.res.write(`data: ${JSON.stringify(msg)}\n\n`);

  function drain(session, write) {
    for (const msg of session.buffer.splice(0)) write(msg);
    session.bufferBytes = 0;
  }

  // All requests of a POST stream answered: an attached stream ends and is forgotten; a dropped one keeps its events
  // for a Last-Event-ID replay.
  function settle(session, stream) {
    if (stream.pending.size || !stream.res) return;
    stream.res.end();
    stream.res = null;
    session.streams.delete(stream.id);
  }

  function deliverResponse(session, msg) {
    const key = idKey(msg.id);
    const stream = session.routes.get(key);
    if (!stream) return diagnostics(`session ${session.id}: a response to request ${key} found no request waiting; dropped`);
    session.routes.delete(key);
    stream.pending.delete(key);
    if (stream.json) {
      if (stream.res) {
        stream.res.writeHead(200, {'Content-Type': 'application/json', 'Mcp-Session-Id': session.id});
        stream.res.end(JSON.stringify(msg));
      }
      stream.answered();
    } else {
      sseEvent(stream, msg);
      settle(session, stream);
    }
  }

  function deliverServerMessage(session, msg) {
    if (msg.id !== undefined) session.serverPending.add(idKey(msg.id));
    if (session.gone) return;
    const stream = [...session.streams.values()].find(s => s.res);
    if (stream) return sseEvent(stream, msg);
    if (session.get) return toGet(session, msg);
    const size = Buffer.byteLength(JSON.stringify(msg));
    if (session.bufferBytes + size > bufferLimit) {
      diagnostics(`session ${session.id}: its undelivered server messages would pass the ${bufferLimit}-byte buffer with no stream open to take them; closing it`);
      endSession(session, 'eof');
      return;
    }
    session.buffer.push(msg);
    session.bufferBytes += size;
  }

  function createSession(id, connection, input, output) {
    const session = {id, connection, input, streams: new Map(), nextStream: 1, routes: new Map(), get: null,
      buffer: [], bufferBytes: 0, serverPending: new Set(), timer: null, gone: false, closing: null, closed: null};
    input.on('error', () => {});
    // The connection writes one JSON-RPC message per line, and every line is read before its `closed` settles.
    createInterface({input: output}).on('line', line => {
      if (!line.trim()) return;
      const msg = JSON.parse(line);
      if (msg.method === undefined) deliverResponse(session, msg);
      else deliverServerMessage(session, msg);
      touch(session);
    });
    // `closed` should never reject; if a connection's does, that is logged here rather than ending the agent.
    session.closed = connection.closed.catch(error => {
      diagnostics(`session ${id}: its close failed: ${error.message}${error.code ? ` [${error.code}]` : ''}`);
      return {reason: 'close_failed', code: 1, listingLeftover: false};
    });
    session.closed.then(result => {
      if (!session.gone) {
        session.gone = true;
        sessions.delete(id);
        clearTimeout(session.timer);
      }
      for (const stream of session.streams.values()) stream.res?.end();
      for (const stream of new Set(session.routes.values())) {
        if (!stream.json) continue;
        if (stream.res) rpcError(stream.res, 500, -32000, 'cua: the connection closed before answering', JSON.parse([...stream.pending][0]));
        stream.answered();
      }
      session.get?.res.end();
      diagnostics(`session ${id}: closed (${result.reason}, code ${result.code}${result.listingLeftover ? '; a readiness listing\'s runtime could not be confirmed stopped' : ''})`);
    });
    return session;
  }

  const send = (session, messages) => session.input.write(messages.map(m => `${JSON.stringify(m)}\n`).join(''));

  // ---- requests ----

  async function initialize(message, req, res) {
    await Promise.allSettled([...ending]);
    if (shutdown) return rpcError(res, 503, -32000, 'cua: the agent is shutting down', message.id);
    let evict = null;
    if (sessions.size + opening.size >= maxSessions) {
      evict = [...sessions.values()].find(evictable);
      if (!evict) return rpcError(res, 503, -32000, `cua: session limit reached (${maxSessions})`, message.id);
    }
    const sessionId = randomUUID();
    let session;
    const input = new PassThrough();
    const output = new PassThrough();
    const opened = (async () => {
      if (evict) {
        diagnostics(`session ${evict.id}: evicted, being Idle, for a new session at the cap of ${maxSessions}`);
        await endSession(evict, 'eof');
      }
      return open({home, env, sessionId, input, output, diagnostics: line => diagnostics(`session ${sessionId}: ${line}`),
        onWithdrawn: requestId => { if (session) withdraw(session, requestId); }});
    })();
    opening.add(opened);
    let connection;
    try { connection = await opened; } catch (error) {
      diagnostics(`session ${sessionId}: could not open: ${error.message}${error.code ? ` [${error.code}]` : ''}`);
      return rpcError(res, 500, -32000, `cua: ${error.code ?? 'open_failed'}`, message.id);
    } finally { opening.delete(opened); }
    session = createSession(sessionId, connection, input, output);
    if (shutdown) {
      endSession(session, shutdown);
      return rpcError(res, 503, -32000, 'cua: the agent is shutting down', message.id);
    }
    sessions.set(sessionId, session);
    // The handler settles once the InitializeResult is answered (or can no longer be).
    let answered;
    const stream = {json: true, res, pending: new Set([idKey(message.id)]), answered: () => answered()};
    const done = new Promise(resolve => { answered = resolve; });
    session.routes.set(idKey(message.id), stream);
    onAbort(req.signal, () => { stream.res = null; answered(); });
    send(session, [message]);
    await done;
  }

  // A request the connection withdrew before dispatch (a cancellation) is never answered, so its stream stops waiting
  // for it. A cancelled request that had reached the runtime keeps its route: the runtime's late answer ends the stream.
  function withdraw(session, requestId) {
    const key = idKey(requestId);
    const stream = session.routes.get(key);
    if (!stream) return;
    session.routes.delete(key);
    stream.pending.delete(key);
    if (!stream.json) settle(session, stream);
  }

  function attach(session, stream, res, signal) {
    const out = sse(res, keepaliveMs);
    stream.res = out;
    onAbort(signal, () => {
      if (stream.res !== out) return;
      stream.res = null;
      out.end();
      touch(session);
    });
    return out;
  }

  async function post(req, res, sessionId) {
    let text;
    try { text = await readBody(req.body); } catch {
      return rpcError(res, 400, -32700, 'cua: the request body could not be read');   // the client went away mid-body
    }
    let parsed;
    try { parsed = JSON.parse(text); } catch { return rpcError(res, 400, -32700, 'Parse error'); }
    const messages = Array.isArray(parsed) ? parsed : [parsed];
    if (!messages.length || !messages.every(isMessage)) return rpcError(res, 400, -32600, 'Invalid Request');
    if (messages.some(m => m.method === 'initialize')) {
      if (sessionId !== undefined) return rpcError(res, 400, -32600, 'cua: initialize opens a session; it is never sent on one');
      if (Array.isArray(parsed) || !isRequest(messages[0])) return rpcError(res, 400, -32600, 'cua: initialize is sent alone, as a request');
      return initialize(messages[0], req, res);
    }
    if (sessionId === undefined) return rpcError(res, 400, -32000, 'cua: the Mcp-Session-Id header is required (initialize opens a session)');
    const session = sessions.get(sessionId);
    if (!session) return rpcError(res, 404, -32001, 'cua: no such session; initialize a new one');
    const requests = messages.filter(isRequest);
    const keys = requests.map(m => idKey(m.id));
    if (new Set(keys).size !== keys.length || keys.some(k => session.routes.has(k)))
      return rpcError(res, 400, -32600, 'cua: a request id is already in use on this session');
    for (const m of messages) if (m.method === undefined) session.serverPending.delete(idKey(m.id));
    if (!requests.length) {
      send(session, messages);
      res.writeHead(202, {});
      res.end();
      return touch(session);
    }
    const stream = {id: session.nextStream++, n: 0, events: [], res: null, pending: new Set(keys)};
    session.streams.set(stream.id, stream);
    for (const key of keys) session.routes.set(key, stream);
    res.writeHead(200, SSE_HEADERS);
    // The priming event: never kept, replayed, buffered or routed.
    attach(session, stream, res, req.signal).write(`retry: ${RETRY_MS}\nid: ${stream.id}-0\ndata: \n\n`);
    drain(session, msg => sseEvent(stream, msg));
    touch(session);
    send(session, messages);
  }

  function get(req, res, session) {
    touch(session);
    const named = /^(\d+)-(\d+)$/.exec(req.headers['last-event-id'] ?? '');
    const stream = named && session.streams.get(Number(named[1]));
    if (stream) {
      if (stream.res) {
        const old = stream.res;
        stream.res = null;
        old.end();
      }
      res.writeHead(200, SSE_HEADERS);
      const out = attach(session, stream, res, req.signal);
      for (const {n, event} of stream.events) if (n > Number(named[2])) out.write(event);
      drain(session, msg => sseEvent(stream, msg));
      settle(session, stream);
      return touch(session);
    }
    if (session.get) return rpcError(res, 409, -32000, 'cua: this session already has its GET stream open');
    res.writeHead(200, SSE_HEADERS);
    const standing = {res: sse(res, keepaliveMs)};
    session.get = standing;
    onAbort(req.signal, () => {
      if (session.get !== standing) return;
      session.get = null;
      standing.res.end();
      touch(session);
    });
    drain(session, msg => toGet(session, msg));
    touch(session);   // with a stream open again, a pending elicitation keeps the session
  }

  async function remove(res, session) {
    await endSession(session, 'eof');
    res.writeHead(200, {});
    res.end();
  }

  async function route(req, res) {
    const bearer = /^Bearer +(\S+) *$/i.exec(req.headers.authorization ?? '')?.[1];
    if (!credentialMatches(clientCredential, bearer)) return rpcError(res, 401, -32000, 'cua: unauthorized');
    const origin = req.headers.origin;
    if (origin !== undefined && (origin === 'null' || !allowedOrigins.includes(origin))) return rpcError(res, 403, -32000, 'cua: this Origin is not allowed');
    if (pathOf(req.url) !== '/mcp') return rpcError(res, 404, -32000, 'cua: the MCP endpoint is /mcp');
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
      res.writeHead(405, {Allow: 'GET, POST, DELETE'});
      return res.end();
    }
    const version = req.headers['mcp-protocol-version'];
    if (version !== undefined && !PROTOCOL_VERSIONS.has(version)) return rpcError(res, 400, -32000, `cua: unsupported MCP-Protocol-Version (supported: ${[...PROTOCOL_VERSIONS].join(', ')})`);
    const sessionId = req.headers['mcp-session-id'];
    if (req.method === 'POST') return post(req, res, sessionId);
    if (sessionId === undefined) return rpcError(res, 400, -32000, 'cua: the Mcp-Session-Id header is required');
    const session = sessions.get(sessionId);
    if (!session) return rpcError(res, 404, -32001, 'cua: no such session; initialize a new one');
    return req.method === 'GET' ? get(req, res, session) : remove(res, session);
  }

  async function handle(req, res) {
    const out = guard(res);
    try {
      await route(req, out);
    } catch (error) {
      diagnostics(`a request failed: ${error.stack ?? error}`);
      if (!out.started) rpcError(out, 500, -32603, 'cua: internal error');
      else out.end();
    }
  }

  // Closes every session (and any still opening) with `reason`; resolves once all have released everything.
  async function close(reason = 'signal') {
    shutdown ??= reason;
    const live = [...sessions.values()].map(session => endSession(session, reason));
    await Promise.allSettled([...live, ...opening]);
    await Promise.allSettled([...ending]);
  }

  return {handle, sessions, close};
}
