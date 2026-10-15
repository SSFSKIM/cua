// The supervisor's half of the trusted worker's `nodeRepl.nativePipe` (docs/doperpowers/specs/2026-10-14-own-repl-host-design.md,
// Design "Trusted services and privileged APIs"; the worker's half is NR:privileged-node-repl.js:200-371, ported in
// ./privileged-node-repl.mjs). The worker never opens a socket: it sends `native_pipe_request` (op connect, write or
// close) and the supervisor opens the Unix socket here, outside the children's sandbox, so scoped cells keep their
// network denial while the browser service still reaches its hosts, and a host that checks its peer's ancestry (MAWS)
// sees cua's own process tree. Bytes cross as base64 in the inner JSONL; this is not the services' own framing.
//
// Replies: `native_pipe_response {id, ok, result | error}` per request (connect's result is {connection_id}); then,
// unasked, `native_pipe_data {connection_id, data_base64}` for every chunk read and one `native_pipe_closed
// {connection_id, error}` when the socket is gone, whoever closed it (`error` null when the peer left, else the
// transport error's sentence). A connection is refused unless its path is absolute and names a socket, and its connect
// is bounded by the launch's CUA_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS (cua sets 1,000 ms). The sentences the vendor's supervisor uses (recovered,
// docs/doperpowers/research/2026-10-14-own-repl-host/node-repl-embedded-INDEX.md "Gaps" 4, and the connect failure
// observed on cua-linux, M4) are kept; the rest are cua's. An OS error reads as the vendor's Rust host displays it
// (osErrorSentence).
import {statSync} from 'node:fs';
import {createConnection} from 'node:net';
import {isAbsolute} from 'node:path';
import {getSystemErrorMap} from 'node:util';

export const DEFAULT_CONNECT_TIMEOUT_MS = 1000;
export const CONNECT_TIMEOUT_SENTENCE = 'native pipe initial connect timed out';
export const NOT_ABSOLUTE_SENTENCE = 'native pipe path must be absolute';
export const NOT_SOCKET_SENTENCE = 'native pipe path is not a socket';
export const WRITE_FAILED_PREFIX = 'native pipe write failed: ';
export const CONNECT_FAILED_PREFIX = 'failed to connect native pipe: ';
export const NOT_CONNECTED_SENTENCE = 'native pipe connection is closed';
// A write into a pipe the peer left is a close, not an error: the vendor host reports the connection closed by its
// reader, whose EOF wins the race with the write's failure (observed on the pinned node_repl on macOS, 2026-10-14, for
// an abort mid-write, an SO_LINGER=0 abort and SHUT_RD). What the reader itself sees is the vendor's verdict: on Linux
// a peer that closes with unread data resets the reader, and the vendor reports that close with the reset's sentence
// (cua-linux, 2026-10-15: `Connection reset by peer (os error 104)`), so a read error closes with its sentence.
const PEER_GONE = new Set(['EPIPE', 'ECONNRESET', 'ECONNABORTED']);
const peerGoneOnWrite = error => error.syscall !== 'read' && PEER_GONE.has(error.code);

// libuv's messages are strerror's for these errnos except in letter case; where the words differ too, strerror's.
const STRERROR = {EIO: 'Input/output error', ENAMETOOLONG: 'File name too long', ENOTCONN: process.platform === 'linux' ? 'Transport endpoint is not connected' : 'Socket is not connected'};
// A Node system error as Rust's std::io::Error displays the same OS error: `<strerror> (os error <errno>)`. Anything
// that is not a system error keeps its own message.
export function osErrorSentence(error) {
  if (!Number.isInteger(error?.errno) || error.errno >= 0 || typeof error.code !== 'string') return error?.message ?? String(error);
  let detail = STRERROR[error.code];
  if (!detail) {
    const known = [...getSystemErrorMap().values()].find(([name]) => name === error.code);
    if (!known) return error.message;
    detail = known[1].charAt(0).toUpperCase() + known[1].slice(1);
  }
  return `${detail} (os error ${-error.errno})`;
}

// One relay per trusted worker: `send(message)` writes to that worker. -> {handle(message), closeAll()}; closeAll ends
// every connection, connected or still connecting, without telling the worker (it is gone).
export function nativePipeRelay({send, connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS, connect = createConnection, stat = statSync}) {
  const connections = new Map();     // connection_id -> {socket, reportClosed}
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
      return fail(id, `${CONNECT_FAILED_PREFIX}${osErrorSentence(error)}`);
    }
    const connectionId = `native-pipe-connection-${counter++}`;
    const socket = connect({path});
    let connected = false;
    let settled = false;      // the connect request was answered: a later connect or error changes nothing
    let reported = false;     // native_pipe_closed was sent
    let lastError = null;
    // Once per connection: the connection leaves the relay and the worker hears it closed.
    const reportClosed = error => {
      if (reported) return;
      reported = true;
      connections.delete(connectionId);
      if (!closedAll) send({type: 'native_pipe_closed', connection_id: connectionId, error});
    };
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
      connections.set(connectionId, {socket, reportClosed});
      reply(id, {ok: true, result: {connection_id: connectionId}});
    });
    socket.on('data', chunk => { if (connected && !closedAll) send({type: 'native_pipe_data', connection_id: connectionId, data_base64: chunk.toString('base64')}); });
    socket.on('end', () => {
      if (!connected) return;
      reportClosed(null);
      socket.destroy();
    });
    socket.on('error', error => {
      lastError = error;
      if (connected) return reportClosed(peerGoneOnWrite(error) ? null : osErrorSentence(error));
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        connecting.delete(socket);
        fail(id, `${CONNECT_FAILED_PREFIX}${osErrorSentence(error)}`);
      }
    });
    socket.once('close', () => {
      clearTimeout(timeout);
      connecting.delete(socket);
      if (!connected) return;
      reportClosed(lastError && !peerGoneOnWrite(lastError) ? osErrorSentence(lastError) : null);
    });
  }

  function write(id, connectionId, data) {
    const connection = connections.get(connectionId);
    const socket = connection?.socket;
    if (!socket || socket.destroyed || !socket.writable) return fail(id, NOT_CONNECTED_SENTENCE);
    if (typeof data !== 'string') return fail(id, `${WRITE_FAILED_PREFIX}expected base64 data`);
    socket.write(Buffer.from(data, 'base64'), error => {
      if (!error) return reply(id, {ok: true, result: null});
      // A write into a pipe the peer left: the close goes first, so the worker's bridge sees close only.
      if (peerGoneOnWrite(error)) {
        connection.reportClosed(null);
        socket.destroy();
      }
      return fail(id, `${WRITE_FAILED_PREFIX}${osErrorSentence(error)}`);
    });
  }

  // The close is answered at once; the socket's own close then reports native_pipe_closed.
  function close(id, connectionId) {
    const socket = connections.get(connectionId)?.socket;
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
      for (const {socket} of connections.values()) socket.destroy();
      connections.clear();
    },
  };
}
