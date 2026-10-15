// The supervisor's half of the trusted worker's `nodeRepl.nativePipe` (docs/doperpowers/specs/2026-10-14-own-repl-host-design.md,
// Design "Trusted services and privileged APIs"; the worker's half is NR:privileged-node-repl.js:200-371, ported in
// ./privileged-node-repl.mjs). The worker never opens a socket: it sends `native_pipe_request` (op connect, write or
// close) and the supervisor opens the Unix socket here, outside the children's sandbox, so scoped cells keep their
// network denial while the browser service still reaches its hosts, and a host that checks its peer's ancestry (MAWS)
// sees cua's own process tree. Bytes cross as base64 in the inner JSONL; this is not the services' own framing.
//
// Replies: `native_pipe_response {id, ok, result | error}` per request (connect's result is {connection_id}); then,
// unasked, `native_pipe_data {connection_id, data_base64}` for every chunk read and one `native_pipe_closed
// {connection_id, error}` when the socket is gone, whoever closed it (`error` its last error's sentence, or null). A
// connection is refused unless its path is absolute and names a socket, and its connect is bounded by the launch's
// CUA_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS (cua sets 1,000 ms). The sentences the vendor's supervisor uses (recovered,
// docs/doperpowers/research/2026-10-14-own-repl-host/node-repl-embedded-INDEX.md "Gaps" 4) are kept; the rest are cua's.
import {statSync} from 'node:fs';
import {createConnection} from 'node:net';
import {isAbsolute} from 'node:path';

export const DEFAULT_CONNECT_TIMEOUT_MS = 1000;
export const CONNECT_TIMEOUT_SENTENCE = 'native pipe initial connect timed out';
export const NOT_ABSOLUTE_SENTENCE = 'native pipe path must be absolute';
export const NOT_SOCKET_SENTENCE = 'native pipe path is not a socket';
export const WRITE_FAILED_PREFIX = 'native pipe write failed: ';
export const CONNECT_FAILED_PREFIX = 'native pipe connect failed: ';
export const NOT_CONNECTED_SENTENCE = 'native pipe connection is closed';

// One relay per trusted worker: `send(message)` writes to that worker. -> {handle(message), closeAll()}; closeAll ends
// every connection, connected or still connecting, without telling the worker (it is gone).
export function nativePipeRelay({send, connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS, connect = createConnection, stat = statSync}) {
  const connections = new Map();     // connection_id -> socket
  const connecting = new Map();      // socket -> its connect timer, until the connect is answered
  let counter = 0;
  let closedAll = false;
  const reply = (id, outcome) => { if (!closedAll) send({type: 'native_pipe_response', id, ...outcome}); };
  const fail = (id, error) => reply(id, {ok: false, error});

  function open(id, path) {
    if (typeof path !== 'string' || !isAbsolute(path)) return fail(id, NOT_ABSOLUTE_SENTENCE);
    try {
      if (!stat(path).isSocket()) return fail(id, NOT_SOCKET_SENTENCE);
    } catch (error) {
      return fail(id, `${CONNECT_FAILED_PREFIX}${error.message}`);
    }
    const connectionId = `native-pipe-connection-${counter++}`;
    const socket = connect({path});
    let connected = false;
    let settled = false;      // the connect request was answered: a later connect or error changes nothing
    let lastError = null;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      connecting.delete(socket);
      socket.destroy();
      fail(id, CONNECT_TIMEOUT_SENTENCE);
    }, connectTimeoutMs);
    connecting.set(socket, timeout);
    socket.once('connect', () => {
      clearTimeout(timeout);
      connecting.delete(socket);
      if (settled || closedAll) return socket.destroy();
      settled = true;
      connected = true;
      connections.set(connectionId, socket);
      reply(id, {ok: true, result: {connection_id: connectionId}});
    });
    socket.on('data', chunk => { if (connected && !closedAll) send({type: 'native_pipe_data', connection_id: connectionId, data_base64: chunk.toString('base64')}); });
    socket.on('error', error => {
      lastError = error;
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        connecting.delete(socket);
        fail(id, `${CONNECT_FAILED_PREFIX}${error.message}`);
      }
    });
    socket.once('close', () => {
      clearTimeout(timeout);
      connecting.delete(socket);
      if (!connected) return;
      connections.delete(connectionId);
      if (!closedAll) send({type: 'native_pipe_closed', connection_id: connectionId, error: lastError ? lastError.message : null});
    });
  }

  function write(id, connectionId, data) {
    const socket = connections.get(connectionId);
    if (!socket || socket.destroyed || !socket.writable) return fail(id, NOT_CONNECTED_SENTENCE);
    if (typeof data !== 'string') return fail(id, `${WRITE_FAILED_PREFIX}expected base64 data`);
    socket.write(Buffer.from(data, 'base64'), error => (error ? fail(id, `${WRITE_FAILED_PREFIX}${error.message}`) : reply(id, {ok: true, result: null})));
  }

  // The close is answered at once; the socket's own close then reports native_pipe_closed.
  function close(id, connectionId) {
    const socket = connections.get(connectionId);
    if (socket && !socket.destroyed) socket.end(() => socket.destroy());
    reply(id, {ok: true, result: null});
  }

  return {
    handle(message) {
      switch (message.op) {
        case 'connect': return open(message.id, message.path);
        case 'write': return write(message.id, message.connection_id, message.data_base64);
        case 'close': return close(message.id, message.connection_id);
        default: return fail(message.id, `unsupported native pipe operation: ${String(message.op)}`);
      }
    },
    get size() { return connections.size; },
    // Live and still-connecting sockets alike are destroyed at once, their connect timers cleared.
    closeAll() {
      closedAll = true;
      for (const [socket, timeout] of connecting) { clearTimeout(timeout); socket.destroy(); }
      connecting.clear();
      for (const socket of connections.values()) socket.destroy();
      connections.clear();
    },
  };
}
