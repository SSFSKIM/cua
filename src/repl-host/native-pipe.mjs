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
//
// The path check follows the vendor's validate_native_pipe_path (node_repl 26.928.40906, disassembled on darwin-arm64
// and linux-arm64): is_absolute; then canonicalize, i.e. realpath(3), whose every failure (ENOENT, ENOTDIR, EACCES,
// ELOOP, ENAMETOOLONG, EIO, an interior NUL) is `native pipe path unavailable: `; then metadata of the canonical path,
// whose failure is `native pipe stat failed: `; then the socket type.
//
// The connect then follows the vendor's per-platform rule for a canonical path that does not fit sun_path (its own
// connect, same build): on Linux, tokio's UnixStream::connect, where std's sockaddr_un refuses 108 bytes or more
// (`failed to connect native pipe: path must be shorter than SUN_LEN`); on macOS, start_macos_native_pipe_connect,
// which connects 104 bytes or more through the parent directory (open it, pthread_fchdir_np, connect the file name),
// so it fails only when the parent cannot be opened or the file name alone does not fit (`native pipe file name is
// too long`). Its other two sentences, a path with no parent or no file name, cannot be reached from a canonical path
// that names a socket. A path that fits is connected as given; one that does not is connected at its canonical path
// when that fits, and otherwise (macOS) in its directory by a connector process (./native-pipe-directory.mjs). No
// name is ever made in the filesystem for a connect.
import {closeSync, fstatSync, openSync, realpathSync, statSync} from 'node:fs';
import {createConnection} from 'node:net';
import {isAbsolute} from 'node:path';
import {connectInDirectory as connectInDirectoryDefault} from './native-pipe-directory.mjs';

export const DEFAULT_CONNECT_TIMEOUT_MS = 1000;
export const CONNECT_TIMEOUT_SENTENCE = 'native pipe initial connect timed out';
export const NOT_ABSOLUTE_SENTENCE = 'native pipe path must be absolute';
export const NOT_SOCKET_SENTENCE = 'native pipe path is not a socket';
export const WRITE_FAILED_PREFIX = 'native pipe write failed: ';
export const CONNECT_FAILED_PREFIX = 'failed to connect native pipe: ';
export const PATH_UNAVAILABLE_PREFIX = 'native pipe path unavailable: ';
export const STAT_FAILED_PREFIX = 'native pipe stat failed: ';
// Rust std's refusal of a path holding a NUL byte, raised before any syscall (std::sys small_c_string NUL_ERR).
const NUL_IN_PATH_SENTENCE = 'file name contained an unexpected NUL byte';
// Rust std's sockaddr_un refusal (Linux), and the vendor's own refusal of a name longer than sun_path (macOS).
const SUN_LEN_SENTENCE = 'path must be shorter than SUN_LEN';
const FILE_NAME_TOO_LONG_SENTENCE = 'native pipe file name is too long';
// sizeof(sockaddr_un.sun_path): a path connects directly only when it is shorter, leaving room for its NUL.
const SUN_PATH_BYTES = {darwin: 104, linux: 108};
// The vendor's read-only open of a long path's parent; -> the directory's identity, which its connect must still see.
function openDirectoryDefault(path) {
  const fd = openSync(path, 'r');
  try {
    const {dev, ino} = fstatSync(fd, {bigint: true});
    return {dev, ino};
  } finally {
    closeSync(fd);
  }
}
// `bytes` as a string naming the same bytes, or null when they are not UTF-8 (a Node path string cannot name them).
const asPathString = bytes => {
  const text = bytes.toString();
  return Buffer.from(text).equals(bytes) ? text : null;
};
export const NOT_CONNECTED_SENTENCE = 'native pipe connection is closed';
// A write into a pipe the peer left is a close, not an error: the vendor host reports the connection closed by its
// reader, whose EOF wins the race with the write's failure (observed on the pinned node_repl on macOS, 2026-10-14, for
// an abort mid-write, an SO_LINGER=0 abort and SHUT_RD). What the reader itself sees is the vendor's verdict: on Linux
// a peer that closes with unread data resets the reader, and the vendor reports that close with the reset's sentence
// (cua-linux, 2026-10-15: `Connection reset by peer (os error 104)`), so a read error closes with its sentence.
const PEER_GONE = new Set(['EPIPE', 'ECONNRESET', 'ECONNABORTED']);
const peerGoneOnWrite = error => error.syscall !== 'read' && PEER_GONE.has(error.code);

// strerror for every errno the relay's syscalls (realpath, stat, connect, read, write, close of a Unix socket) can reach, as the
// vendor's Rust host displays an OS error: glibc's text on Linux (glibc's errlist), Darwin libc's on macOS (checked
// against os.strerror on macOS 15). libuv's own messages are not strerror (ELOOP, ENFILE, ENOMEM, ETIMEDOUT, ... differ).
const COMMON = {
  EPERM: 'Operation not permitted', ENOENT: 'No such file or directory', EINTR: 'Interrupted system call', EIO: 'Input/output error',
  EBADF: 'Bad file descriptor', EAGAIN: 'Resource temporarily unavailable', ENOMEM: 'Cannot allocate memory', EACCES: 'Permission denied',
  ENOTDIR: 'Not a directory', EISDIR: 'Is a directory', EINVAL: 'Invalid argument', ENFILE: 'Too many open files in system',
  EMFILE: 'Too many open files', EROFS: 'Read-only file system', EPIPE: 'Broken pipe', ENAMETOOLONG: 'File name too long',
  ELOOP: 'Too many levels of symbolic links', ENOTSOCK: 'Socket operation on non-socket', EMSGSIZE: 'Message too long',
  EPROTOTYPE: 'Protocol wrong type for socket', ENETDOWN: 'Network is down', ECONNABORTED: 'Software caused connection abort',
  ECONNRESET: 'Connection reset by peer', ENOBUFS: 'No buffer space available', ECONNREFUSED: 'Connection refused',
  EALREADY: 'Operation already in progress', EINPROGRESS: 'Operation now in progress', ECANCELED: 'Operation canceled',
};
const STRERROR = {
  linux: {...COMMON, EOVERFLOW: 'Value too large for defined data type', EOPNOTSUPP: 'Operation not supported', ENOTSUP: 'Operation not supported', EADDRNOTAVAIL: 'Cannot assign requested address',
    ENOTCONN: 'Transport endpoint is not connected', ESHUTDOWN: 'Cannot send after transport endpoint shutdown', ETIMEDOUT: 'Connection timed out'},
  darwin: {...COMMON, EOVERFLOW: 'Value too large to be stored in data type', EOPNOTSUPP: 'Operation not supported on socket', ENOTSUP: 'Operation not supported', EADDRNOTAVAIL: "Can't assign requested address",
    ENOTCONN: 'Socket is not connected', ESHUTDOWN: "Can't send after socket shutdown", ETIMEDOUT: 'Operation timed out'},
};
// A Node system error as Rust's std::io::Error displays the same OS error: `<strerror> (os error <errno>)`, the errno
// being the platform's (Node reports it negated). Anything else, or an errno no relay syscall reaches, keeps its own
// message rather than a guessed sentence.
export function osErrorSentence(error, platform = process.platform) {
  const detail = STRERROR[platform]?.[error?.code];
  if (!detail || !Number.isInteger(error.errno) || error.errno >= 0) return error?.message ?? String(error);
  return `${detail} (os error ${-error.errno})`;
}

// One relay per trusted worker: `send(message)` writes to that worker. -> {handle(message), closeAll()}; closeAll ends
// every connection, connected or still connecting, without telling the worker (it is gone).
// `platform` picks the vendor's rule for a long canonical path; `openDirectory(path)` is the vendor's open of a long
// path's parent (-> {dev, ino}); `connectInDirectory({directory, name, identity}, {own})` connects a file name in it,
// `own(pid)` (the owned-group reaper's, -> release) protecting the connector process while it lives.
export function nativePipeRelay({send, connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS, connect = createConnection, realpath = realpathSync.native,
  stat = statSync, platform = process.platform, openDirectory = openDirectoryDefault, connectInDirectory = connectInDirectoryDefault,
  own = () => () => {}}) {
  const sunPath = SUN_PATH_BYTES[platform] ?? SUN_PATH_BYTES.linux;
  const connections = new Map();     // connection_id -> {socket, reportClosed}
  const connecting = new Map();      // socket -> its connect timer, until the connect is answered
  let counter = 0;
  let closedAll = false;
  const reply = (id, outcome) => { if (!closedAll) send({type: 'native_pipe_response', id, ...outcome}); };
  const fail = (id, error) => reply(id, {ok: false, error});

  function open(id, path) {
    if (typeof path !== 'string' || !isAbsolute(path)) return fail(id, NOT_ABSOLUTE_SENTENCE);
    if (path.includes('\0')) return fail(id, `${PATH_UNAVAILABLE_PREFIX}${NUL_IN_PATH_SENTENCE}`);
    let canonical, metadata;
    try {
      // Bytes, as the vendor's PathBuf holds them: decoding a Linux name that is not UTF-8 would stat another path.
      canonical = realpath(path, {encoding: 'buffer'});
    } catch (error) {
      return fail(id, `${PATH_UNAVAILABLE_PREFIX}${osErrorSentence(error)}`);
    }
    try {
      metadata = stat(canonical);
    } catch (error) {
      return fail(id, `${STAT_FAILED_PREFIX}${osErrorSentence(error)}`);
    }
    if (!metadata.isSocket()) return fail(id, NOT_SOCKET_SENTENCE);
    const route = routeFor(path, canonical);
    if (route.refusal) return fail(id, `${CONNECT_FAILED_PREFIX}${route.refusal}`);
    const connectionId = `native-pipe-connection-${counter++}`;
    // The budget runs from here: a connector's synchronous spawn counts against it.
    const deadline = performance.now() + connectTimeoutMs;
    const socket = route.directory ? connectInDirectory(route, {own}) : connect({path: route.path});
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
    const expire = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      connecting.delete(socket);
      socket.destroy();
      fail(id, CONNECT_TIMEOUT_SENTENCE);
    };
    const timeout = setTimeout(expire, Math.max(0, deadline - performance.now()));
    connecting.set(socket, timeout);
    socket.once('connect', () => {
      clearTimeout(timeout);
      connecting.delete(socket);
      if (performance.now() >= deadline) expire();   // delivered after the deadline, ahead of the timer
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
    // A start that used the whole budget is a timeout now, before any connect it queued can be seen.
    if (performance.now() >= deadline) expire();
  }

  // How `path` is connected (see the header): {path} or {directory, name, identity}, or {refusal} for the vendor's.
  function routeFor(path, canonical) {
    const fits = bytes => bytes < sunPath;
    let inDirectory = null;
    if (!fits(canonical.length)) {
      if (platform !== 'darwin') return {refusal: SUN_LEN_SENTENCE};
      const slash = canonical.lastIndexOf(0x2f);
      const directory = slash === 0 ? Buffer.from('/') : canonical.subarray(0, slash);
      const name = canonical.subarray(slash + 1);
      let identity;
      try {
        identity = openDirectory(directory);
      } catch (error) {
        return {refusal: osErrorSentence(error)};
      }
      if (!fits(name.length)) return {refusal: FILE_NAME_TOO_LONG_SENTENCE};
      inDirectory = {directory: asPathString(directory), name: asPathString(name), identity};
    }
    if (fits(Buffer.byteLength(path))) return {path};
    if (!inDirectory) return {path: asPathString(canonical) ?? path};
    if (inDirectory.directory !== null && inDirectory.name !== null) return inDirectory;
    return {path};   // bytes no Node path string can name: Node refuses the path as given
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
