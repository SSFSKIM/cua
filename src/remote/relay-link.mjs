// The agent's side of the relay (relay/server.mjs): one outbound WebSocket to the enrolled relay URL, over which every
// HTTP request a cloud client sends to /d/<device>/mcp arrives as a channel and is answered by the agent's own MCP
// handler (src/mcp/http.mjs) — the same code that serves the LAN listener, which re-checks the client's bearer.
//
// Frames (JSON text): relay → agent {ch, t: "open", method, path, headers}, {ch, t: "body", data}, {ch, t: "end"};
// agent → relay {ch, t: "head", status, headers}, {ch, t: "data", data}, {ch, t: "end"}; either way {ch, t: "abort"};
// data is base64. The first frame after the WebSocket opens is the agent's {t: "hello", deviceId}; the device
// credential travels in the connect request's Authorization header. A request reaches the handler once its body is
// whole (MCP POST bodies are small; one over `bodyLimit`, 4 MB, is answered 413 here); the answer streams back a frame
// per write.
//
// Liveness and loss: the relay pings every 25 s; a link that hears no ping for `watchdogMs` (60 s) is closed here.
// A lost link aborts every channel open on it (each handler's signal fires; the sessions themselves live on in the
// handler) and is dialled again after 1 s, doubling to 30 s, starting over once a connection opens. Close codes 4001
// (another connection for this device replaced this one) and 4003 (the relay refused the hello) are deliberate: the
// link stops for good and `stopped` resolves, so two agents for one device never take turns replacing each other.
//
// What to dial is `target()`, {url, deviceCredential, deviceId} as device.json reads now (null: no relay enrolled),
// called at each dial, so a rotated credential is presented at the next connection. `refresh()` (the agent calls it at
// each request, and the link at each ping) redials at once when the URL changed; a new credential alone does not
// redial, since the relay accepts it only once restarted with the new devices.json line, and that restart reconnects.
//
// The `ws` package is loaded here, on first use, and nowhere else: `cua serve`, `agent run --http` and the plugin copy
// (which has no node_modules) never need it.
import {fail} from '../runtime/errors.mjs';
import {checkRelayUrl} from './device.mjs';

const STOP_CODES = new Map([[4001, 'another connection for this device replaced this one'], [4003, 'the relay refused this device\'s hello']]);

let loading = null;

// The WebSocket class, loaded once; a checkout without the ws package refuses with relay_unavailable.
export function loadWebSocket() {
  loading ??= import('ws').then(module => module.WebSocket, error => {
    loading = null;
    if (error.code === 'ERR_MODULE_NOT_FOUND')
      fail('relay_unavailable', 'the relay connection needs the ws package, which is not installed in this cua checkout', {hint: 'run npm ci in the cua checkout, then start the agent again'});
    fail('relay_unavailable', `the ws package could not be loaded (${error.message})`, {cause: error});
  });
  return loading;
}

const seconds = ms => `${ms / 1000} s`;

export async function connectRelay({target, handle, diagnostics = () => {},
  minBackoffMs = 1000, maxBackoffMs = 30_000, watchdogMs = 60_000, bodyLimit = 4 * 1024 * 1024}) {
  const WebSocket = await loadWebSocket();
  let delay = minBackoffMs;
  let connections = 0;
  let socket = null;
  let dialled = null;   // the URL of the latest dial (null: none was enrolled)
  let retry = null;
  let stopping = false;
  let resolveStopped;
  const stopped = new Promise(resolve => { resolveStopped = resolve; });

  function later(why) {
    diagnostics(`relay: ${why}; retrying in ${seconds(delay)}`);
    retry = setTimeout(dial, delay);
    delay = Math.min(delay * 2, maxBackoffMs);
  }

  function dial() {
    retry = null;
    const to = target();
    dialled = to?.url ?? null;
    if (!to) return later('no relay URL is enrolled in device.json');
    try { checkRelayUrl(to.url); } catch (error) { return later(error.message); }
    const {url, deviceId} = to;
    const ws = new WebSocket(url, {headers: {authorization: `Bearer ${to.deviceCredential}`}, perMessageDeflate: false, handshakeTimeout: 15_000});
    socket = ws;
    const channels = new Map();
    let opened = false;
    let failure = null;
    let watchdog = null;
    const arm = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        diagnostics(`relay: no ping for ${seconds(watchdogMs)}; dropping the connection`);
        ws.terminate();
      }, watchdogMs);
      watchdog.unref?.();
    };
    const send = frame => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame)); };

    ws.on('open', () => {
      opened = true;
      delay = minBackoffMs;
      connections++;
      send({t: 'hello', deviceId});
      diagnostics(`relay: ${connections === 1 ? 'connected' : 'reconnected'} to ${url} as device ${deviceId}`);
      arm();
    });
    ws.on('ping', () => {
      arm();
      refresh();
    });
    ws.on('error', error => { failure = error.code ?? error.message; });
    ws.on('message', (data, isBinary) => onFrame(data, isBinary));
    ws.on('close', (code, reasonBytes) => {
      clearTimeout(watchdog);
      for (const channel of channels.values()) abort(channel);
      channels.clear();
      if (socket === ws) socket = null;
      if (stopping) return;
      if (ws.redial) return dial();
      const reason = reasonBytes.toString('utf8');
      if (STOP_CODES.has(code)) {
        diagnostics(`relay: closed with ${code} (${reason || STOP_CODES.get(code)}): ${STOP_CODES.get(code)}; not reconnecting`);
        stopping = true;
        return resolveStopped({code, reason});
      }
      const refused = !opened && /\b401\b/.test(failure ?? '') ? '; the relay does not know this device\'s credential: add the line cua remote show prints to its devices.json' : '';
      const why = opened
        ? `connection lost (code ${code}${reason ? `, ${reason}` : ''}${failure ? `, ${failure}` : ''})`
        : `could not connect (${failure ?? `code ${code}`}${refused})`;
      later(why);
    });

    function abort(channel) {
      channel.done = true;
      channel.controller.abort();
    }

    function onFrame(data, isBinary) {
      let frame;
      try { frame = isBinary ? null : JSON.parse(data.toString('utf8')); } catch {}
      if (frame === null || typeof frame !== 'object' || typeof frame.t !== 'string') return diagnostics('relay: dropped a message that is not a frame');
      if (frame.t === 'open') {
        if (channels.has(frame.ch)) return diagnostics(`relay: dropped an open for channel ${JSON.stringify(frame.ch)}, already open`);
        channels.set(frame.ch, {ch: frame.ch, method: frame.method, path: frame.path, headers: frame.headers, chunks: [], size: 0,
          controller: new AbortController(), done: false, started: false});
        return;
      }
      const channel = channels.get(frame.ch);
      if (!channel) return diagnostics(`relay: dropped a ${frame.t} frame for unknown channel ${JSON.stringify(frame.ch)}`);
      if (frame.t === 'body') {
        if (channel.started) return;
        const chunk = Buffer.from(String(frame.data ?? ''), 'base64');
        channel.size += chunk.length;
        if (channel.size > bodyLimit) return refuseTooLarge(channel);
        channel.chunks.push(chunk);
      } else if (frame.t === 'end') {
        if (!channel.started) serve(channel);
      } else if (frame.t === 'abort') {
        channels.delete(frame.ch);
        abort(channel);
      } else diagnostics(`relay: dropped a frame of unknown type ${JSON.stringify(frame.t)}`);
    }

    // A body past the limit is answered here (413) and never buffered further; the rest of it is ignored.
    function refuseTooLarge(channel) {
      channel.started = true;
      channel.chunks = null;
      channel.done = true;
      channels.delete(channel.ch);
      const body = JSON.stringify({jsonrpc: '2.0', id: null, error: {code: -32000, message: `cua: the request body is larger than ${bodyLimit} bytes`}});
      send({ch: channel.ch, t: 'head', status: 413, headers: {'Content-Type': 'application/json'}});
      send({ch: channel.ch, t: 'data', data: Buffer.from(body).toString('base64')});
      send({ch: channel.ch, t: 'end'});
    }

    // The handler's response for one channel: frames while the channel lives, nothing once it is aborted or ended.
    function serve(channel) {
      channel.started = true;
      const {ch} = channel;
      const headers = {};
      for (const [name, value] of Object.entries(channel.headers ?? {})) if (typeof value === 'string') headers[name.toLowerCase()] = value;
      const chunks = channel.chunks;
      channel.chunks = null;
      const req = {method: channel.method, url: String(channel.path ?? ''), headers, signal: channel.controller.signal,
        body: (async function* () { yield* chunks; })()};
      const finish = () => {
        channel.done = true;
        if (channels.get(ch) === channel) channels.delete(ch);
      };
      const res = {
        writeHead: (status, head = {}) => { if (!channel.done) send({ch, t: 'head', status, headers: head}); },
        write: chunk => { if (!channel.done) send({ch, t: 'data', data: Buffer.from(chunk).toString('base64')}); },
        end: chunk => {
          if (channel.done) return;
          if (chunk !== undefined && chunk !== null && chunk.length) res.write(chunk);
          send({ch, t: 'end'});
          finish();
        },
      };
      Promise.resolve().then(() => handle(req, res)).catch(error => {
        diagnostics(`relay: channel ${ch} failed: ${error.stack ?? error}`);
        if (channel.done) return;
        send({ch, t: 'abort'});
        finish();
      });
    }
  }

  // Redials at once when the enrolled URL is no longer the one dialled: the open link (its channels aborted, the sessions
  // kept) or a pending retry gives way.
  function refresh() {
    if (stopping) return;
    const url = target()?.url ?? null;
    if (url === dialled) return;
    diagnostics(`relay: the enrolled relay URL changed to ${url ?? 'none'}; dialling again`);
    delay = minBackoffMs;
    if (socket) {
      socket.redial = true;
      socket.terminate();
    } else {
      clearTimeout(retry);
      dial();
    }
  }

  const first = target();
  diagnostics(`relay: dialling ${first?.url} as device ${first?.deviceId}`);
  dial();

  return {
    stopped,
    refresh,
    // Closes the link in order and stops dialling; resolves once the socket is gone.
    async close() {
      if (!stopping) {
        stopping = true;
        resolveStopped({code: 1000, reason: 'closed by the agent'});
      }
      clearTimeout(retry);
      const ws = socket;
      if (!ws || ws.readyState === WebSocket.CLOSED) return;
      const gone = new Promise(resolve => ws.once('close', resolve));
      if (ws.readyState === WebSocket.CONNECTING) ws.terminate();
      else ws.close(1000, 'agent stopping');
      const timer = setTimeout(() => ws.terminate(), 2000);
      await gone;
      clearTimeout(timer);
    },
  };
}
