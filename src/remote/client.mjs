// An MCP Streamable HTTP client for one device session: the stdio server's way to a device's endpoint
// (`<relay>/d/<deviceId>/mcp`, or an agent's own `/mcp`), under the rules of the server on the other side
// (src/mcp/http.mjs). Built on Node's own fetch, so the plugin's copy runs without node_modules.
//
// - Open: `initialize` with the local client's own params (the device's runtime sees the real client and its
//   elicitation capability), then `notifications/initialized`; later requests carry Mcp-Session-Id and the negotiated
//   MCP-Protocol-Version, every request the bearer. Once open the session holds the standing GET, as Claude Code's
//   client does (a session holding a stream never reads Idle for eviction mid-task), reopened while the session lives.
// - Requests carry this client's own ids. An answer is a JSON body or an SSE stream; the response settles its request,
//   and a message the device starts (on any stream) goes to `onMessage`.
// - Resumption: a POST stream that ends or drops before its response is resumed by a GET with Last-Event-ID (the last
//   event id seen on it), retried after `firstMs` doubling to `maxMs` within `budgetMs` (the device keeps a dropped
//   stream's answers that long after it is done), across a proxy's 502 and the relay's 503 while it or the agent
//   reconnects. The budget restarts once a resumed stream shows it is the real one (an event with an id) or has held
//   for a whole budget: a GET naming a stream the device has forgotten becomes its ordinary standing stream, which
//   neither replays nor answers, and must not be retried forever. A POST that fails before any event id is never
//   resent (the device may have received it; a js cell must not run twice).
// - Close: DELETE, bounded at 2 s; a failure is logged, never thrown (the device's idle rule frees the session).
// Nothing logged or returned carries the credential or any request header value.

const CLOSE_MS = 2000;

export class DeviceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DeviceError';
    this.code = code;
  }
}

const offline = why => new DeviceError('device_offline', `the device is offline or unreachable (${why})`);
const ended = () => new DeviceError('device_session_ended', 'the device session has ended');
const protocol = why => new DeviceError('device_protocol', `the device answered in a way this client cannot read (${why})`);
const why = error => error?.cause?.code ?? error?.code ?? error?.name ?? 'error';
const mediaType = response => (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
const isResponse = msg => msg !== null && typeof msg === 'object' && msg.method === undefined && msg.id !== undefined;
const replyOf = msg => (msg.error !== undefined ? {error: msg.error} : {result: msg.result});

// The JSON-RPC error message in a refusal's body, when there is one (the device's and the relay's are `cua: …` and
// `cua-relay: …`; neither ever carries a credential), shortened.
async function refusalMessage(response) {
  const text = await response.text().catch(() => '');
  try {
    const message = JSON.parse(text)?.error?.message;
    return typeof message === 'string' ? message.slice(0, 200) : '';
  } catch { return ''; }
}

// A non-2xx answer as a DeviceError. `onSession`: the request named a session, so 404 means it is gone.
async function refusal(response, {onSession}) {
  const {status} = response;
  const message = await refusalMessage(response);
  const said = `HTTP ${status}${message ? `: ${message}` : ''}`;
  if (status === 401) return new DeviceError('device_unauthorized', `the device or its relay refused the credential (${said})`);
  if (status === 404 && onSession) return new DeviceError('device_session_ended', `the device session has ended (${said})`);
  if (status === 503 && /session limit/.test(message)) return new DeviceError('session_limit', `the device is serving as many sessions as it allows (${said})`);
  if (status === 502 || status === 503 || status === 504) return offline(said);
  if (status === 500) return new DeviceError('device_failed', `the device failed the request (${said})`);
  return protocol(said);
}

// The events of an SSE body: {id?, event?, data}; comments skipped. Every event block is yielded, also one without
// data (the id it carries still counts as seen).
async function* sseEvents(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  let event = {data: []};
  const lines = function* (flush) {
    const parts = buffer.split(/\r\n|\r(?!$)|\n/);
    buffer = flush ? '' : parts.pop();
    yield* parts;
  };
  const take = function* (line) {
    if (line === '') {
      if (event.id !== undefined || event.data.length) yield {id: event.id, event: event.event, data: event.data.join('\n')};
      event = {data: []};
      return;
    }
    if (line.startsWith(':')) return;
    const at = line.indexOf(':');
    const field = at === -1 ? line : line.slice(0, at);
    const value = at === -1 ? '' : line.slice(at + 1).replace(/^ /, '');
    if (field === 'data') event.data.push(value);
    else if (field === 'id' && !value.includes('\0')) event.id = value;
    else if (field === 'event') event.event = value;
  };
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, {stream: true});
    for (const line of lines(false)) yield* take(line);
  }
  buffer += decoder.decode();
  for (const line of lines(true)) yield* take(line);
}

const sleep = (ms, signal) => new Promise(resolve => {
  if (signal.aborted) return resolve();
  const timer = setTimeout(done, ms);
  function done() { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); }
  signal.addEventListener('abort', done, {once: true});
});

export async function openDeviceSession({endpoint, credential, initializeParams, fetch = globalThis.fetch,
  onMessage = () => {}, diagnostics = () => {}, backoff = {firstMs: 1000, maxMs: 15_000, budgetMs: 90_000}}) {
  const {firstMs, maxMs, budgetMs} = backoff;
  const lifetime = new AbortController();   // every fetch of the session; aborted when it ends
  const pending = new Map();               // request id -> its entry
  let nextId = 0;
  let sessionId = null;
  let protocolVersion = null;
  let end = null;                          // {code} once the session has ended
  let closing = null;
  let resolveClosed;
  const closed = new Promise(resolve => { resolveClosed = resolve; });

  const headers = (accept, extra = {}) => ({
    authorization: `Bearer ${credential}`, accept,
    ...(sessionId ? {'mcp-session-id': sessionId} : {}),
    ...(protocolVersion ? {'mcp-protocol-version': protocolVersion} : {}),
    ...extra,
  });
  const post = (message, signal = lifetime.signal) => fetch(endpoint, {method: 'POST', signal, body: JSON.stringify(message),
    headers: headers('application/json, text/event-stream', {'content-type': 'application/json'})});

  function finish(code) {
    if (end) return;
    end = {code};
    lifetime.abort();
    for (const entry of pending.values()) entry.reject(ended());
    if (code !== 'closed') {
      diagnostics(`the device ended the session (${code})`);
      resolveClosed(end);
    }
  }

  // A message read from the device: a response settles its request; anything else is the device's own.
  function dispatch(msg) {
    if (isResponse(msg)) {
      const entry = pending.get(msg.id);
      if (entry) entry.resolve(msg);
      else diagnostics(`a response to request ${JSON.stringify(msg.id)} found no request waiting; dropped`);
      return;
    }
    try { onMessage(msg); } catch (error) { diagnostics(`a device message could not be handled: ${error.message}`); }
  }

  const dispatchText = text => {
    let parsed;
    try { parsed = JSON.parse(text); } catch { return diagnostics('the device sent a message that is not JSON; dropped'); }
    for (const msg of Array.isArray(parsed) ? parsed : [parsed]) dispatch(msg);
  };

  // Reads an SSE body to its end, dispatching its messages; `track` records the last event id and how many ids came.
  // A drop ends the read like an end does: the caller decides from what it has.
  async function readStream(body, track = {lastId: null, ids: 0}) {
    try {
      for await (const event of sseEvents(body)) {
        if (event.id !== undefined) {
          track.lastId = event.id;
          track.ids++;
        }
        if (event.data && (event.event === undefined || event.event === 'message')) dispatchText(event.data);
      }
    } catch { /* the stream dropped */ }
    return track;
  }

  // An answer to a POST: JSON or SSE, its messages dispatched. → the SSE track, or null for a JSON body.
  async function readAnswer(response) {
    const type = mediaType(response);
    if (type === 'text/event-stream') return readStream(response.body);
    if (type === 'application/json') {
      dispatchText(await response.text().catch(() => ''));
      return null;
    }
    await response.body?.cancel().catch(() => {});
    throw protocol(`HTTP ${response.status} with ${type || 'no'} content type`);
  }

  // Posts a notification or a response, which the device acknowledges with 202.
  async function deliver(message) {
    if (end) throw ended();
    let response;
    try { response = await post(message); } catch (error) {
      throw end ? ended() : offline(why(error));
    }
    if (response.ok) {
      if (response.status === 202) return void await response.body?.cancel().catch(() => {});
      await readAnswer(response);
      return;
    }
    const error = await refusal(response, {onSession: true});
    if (error.code === 'device_session_ended') finish(error.code);
    throw error;
  }

  // ---- open ----

  const initId = ++nextId;
  let response;
  try { response = await post({jsonrpc: '2.0', id: initId, method: 'initialize', params: initializeParams}); } catch (error) {
    throw offline(why(error));
  }
  if (!response.ok) throw await refusal(response, {onSession: false});
  sessionId = response.headers.get('mcp-session-id');
  let initialize = null;
  try {
    pending.set(initId, {resolve: msg => { initialize = msg; }, reject: () => {}});
    try { await readAnswer(response); } finally { pending.delete(initId); }
    if (!initialize) throw protocol('no answer to initialize');
    if (initialize.error !== undefined)
      throw new DeviceError('device_failed', `the device refused initialize (${String(initialize.error?.message ?? '').slice(0, 200)})`);
    if (!sessionId) throw protocol('no Mcp-Session-Id');
    if (typeof initialize.result?.protocolVersion !== 'string') throw protocol('no protocol version in the initialize result');
    protocolVersion = initialize.result.protocolVersion;
    await deliver({jsonrpc: '2.0', method: 'notifications/initialized'});
  } catch (error) {
    if (sessionId) await remove();
    finish('closed');
    throw error;
  }

  // ---- the standing GET ----

  const get = (signal, lastEventId) => fetch(endpoint, {method: 'GET', signal,
    headers: headers('text/event-stream', lastEventId ? {'last-event-id': lastEventId} : {})});

  (async () => {
    let delay = firstMs;
    let said = null;
    const retry = async status => {
      if (status !== said) diagnostics(`the standing stream could not be opened (${status}); retrying`);
      said = status;
      await sleep(delay, lifetime.signal);
      delay = Math.min(delay * 2, maxMs);
    };
    while (!end) {
      let answer;
      try { answer = await get(lifetime.signal); } catch (error) {
        if (!end) await retry(why(error));
        continue;
      }
      if (answer.status === 404) return finish('device_session_ended');
      if (answer.status === 405) return diagnostics('the device offers no standing stream (405)');
      if (!answer.ok || mediaType(answer) !== 'text/event-stream') {
        await answer.body?.cancel().catch(() => {});
        await retry(`HTTP ${answer.status}`);
        continue;
      }
      said = null;
      delay = firstMs;
      await readStream(answer.body);
      await sleep(firstMs, lifetime.signal);
    }
  })().catch(error => diagnostics(`the standing stream stopped: ${error.message}`));

  // ---- requests ----

  // Resumes a request whose POST stream ended before its answer, from the last event id seen on it.
  async function resume(entry, track) {
    let deadline = Date.now() + budgetMs;
    let delay = firstMs;
    const attempt = new AbortController();
    entry.stopResuming = () => attempt.abort();
    lifetime.signal.addEventListener('abort', entry.stopResuming, {once: true});
    try {
      while (!entry.settled) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw offline(`no answer within the ${Math.round(budgetMs / 1000)} s resume budget`);
        // Only the wait for the head is bounded by the budget; an attached stream reads as long as it lives.
        const head = new AbortController();
        const timer = setTimeout(() => head.abort(), remaining);
        const forward = () => head.abort();
        attempt.signal.addEventListener('abort', forward, {once: true});
        let answer = null;
        let failure;
        try { answer = await get(head.signal, track.lastId); } catch (error) { failure = why(error); }
        clearTimeout(timer);
        if (answer?.ok && mediaType(answer) === 'text/event-stream') {
          const attachedAt = Date.now();
          const before = track.ids;
          await readStream(answer.body, track);
          attempt.signal.removeEventListener('abort', forward);
          if (entry.settled) return;
          if (track.ids > before || Date.now() - attachedAt >= budgetMs) {
            deadline = Date.now() + budgetMs;
            delay = firstMs;
            continue;
          }
          failure = 'the resumed stream ended without the answer';
        } else {
          attempt.signal.removeEventListener('abort', forward);
          if (entry.settled || end) return;
          if (answer) {
            const error = await refusal(answer, {onSession: true});
            if (error.code === 'device_session_ended') { finish(error.code); throw error; }
            if (error.code !== 'device_offline') throw error;
            failure = `HTTP ${answer.status}`;
          }
        }
        diagnostics(`request ${entry.id}: resuming its stream failed (${failure}); retrying`);
        await sleep(Math.min(delay, Math.max(0, deadline - Date.now())), attempt.signal);
        delay = Math.min(delay * 2, maxMs);
      }
    } finally {
      lifetime.signal.removeEventListener('abort', entry.stopResuming);
    }
  }

  async function exchange(entry, message) {
    let answer;
    try { answer = await post(message); } catch (error) {
      throw end ? ended() : offline(`the request could not be sent (${why(error)}); it is not resent`);
    }
    if (!answer.ok) {
      const error = await refusal(answer, {onSession: true});
      if (error.code === 'device_session_ended') finish(error.code);
      throw error;
    }
    const track = await readAnswer(answer);
    if (entry.settled) return;
    if (end) throw ended();
    if (entry.cancelled) throw new DeviceError('cancelled', 'the request was cancelled and the device will not answer it');
    if (track === null) throw protocol('the JSON answer did not answer the request');
    if (track.lastId === null) throw offline('the stream ended before the device acknowledged the request; it is not resent');
    entry.resuming = true;
    await resume(entry, track);
  }

  function cancel(entry, reason) {
    if (entry.settled || entry.cancelled) return;
    entry.cancelled = true;
    deliver({jsonrpc: '2.0', method: 'notifications/cancelled', params: {requestId: entry.id, ...(typeof reason === 'string' ? {reason} : {})}})
      .catch(error => diagnostics(`request ${entry.id}: its cancellation could not be delivered (${error.code})`));
    // A request whose stream is already lost will not be answered on it: stop resuming.
    if (entry.resuming) {
      entry.reject(new DeviceError('cancelled', 'the request was cancelled before its answer arrived'));
      entry.stopResuming?.();
    }
  }

  async function request(method, params, {signal} = {}) {
    if (end) throw ended();
    const id = ++nextId;
    const entry = {id, settled: false, cancelled: false, resuming: false};
    const answer = new Promise((resolve, reject) => {
      entry.resolve = msg => { if (!entry.settled) { entry.settled = true; resolve(replyOf(msg)); } };
      entry.reject = error => { if (!entry.settled) { entry.settled = true; reject(error); } };
    });
    pending.set(id, entry);
    const onAbort = () => cancel(entry, signal.reason);
    signal?.addEventListener('abort', onAbort, {once: true});
    exchange(entry, {jsonrpc: '2.0', id, method, params}).catch(error => entry.reject(error));
    try { return await answer; } finally {
      pending.delete(id);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  // ---- close ----

  async function remove() {
    try {
      const answer = await fetch(endpoint, {method: 'DELETE', headers: headers('application/json'), signal: AbortSignal.timeout(CLOSE_MS)});
      await answer.body?.cancel().catch(() => {});
      if (!answer.ok && answer.status !== 404) diagnostics(`DELETE of the device session answered ${answer.status}; the device's idle rule will free it`);
    } catch (error) {
      diagnostics(`DELETE of the device session failed (${why(error)}); the device's idle rule will free it`);
    }
  }

  function close() {
    if (closing) return closing;
    if (end) return (closing = Promise.resolve());
    finish('closed');
    closing = remove().then(() => resolveClosed(end));
    return closing;
  }

  return {
    sessionId,
    initializeResult: initialize.result,
    request,
    respond: (deviceRequestId, reply) => deliver({jsonrpc: '2.0', id: deviceRequestId, ...(reply.error !== undefined ? {error: reply.error} : {result: reply.result})}),
    notify: (method, params) => deliver({jsonrpc: '2.0', method, ...(params !== undefined ? {params} : {})}),
    close,
    closed,
  };
}

// Whether a device answers, without opening a session (an initialize would spawn its runtime and, at its cap, could
// evict another client's idle session): one session-less POST of ping. The device answers 400 (no session), with
// `Cua-Console: locked` while its console refuses js; the relay answers 503 for a device with no link and 401 for a
// credential it does not know.
export async function probeDevice({endpoint, credential, fetch = globalThis.fetch, timeoutMs = 3000}) {
  let response;
  try {
    response = await fetch(endpoint, {method: 'POST', signal: AbortSignal.timeout(timeoutMs),
      headers: {authorization: `Bearer ${credential}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'ping'})});
  } catch (error) {
    return {status: 'offline', code: error?.name === 'TimeoutError' ? 'timeout' : 'relay_unreachable'};
  }
  await response.body?.cancel().catch(() => {});
  const {status} = response;
  if (status === 400) return {status: response.headers.get('cua-console') === 'locked' ? 'locked' : 'online'};
  if (status === 401) return {status: 'unauthorized'};
  if (status === 503) return {status: 'offline'};
  if (status === 502 || status === 504) return {status: 'offline', code: 'relay_unreachable'};
  return {status: 'offline', code: 'device_protocol'};
}
