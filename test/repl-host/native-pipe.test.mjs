// The supervisor's native pipe relay (src/repl-host/native-pipe.mjs) against socket doubles and a real Unix socket:
// the vendor's path checks, the connect budget's expiry (unreachable live on macOS, where a saturated listener refuses
// at once), terminal events, write failures and correlation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CONNECT_TIMEOUT_SENTENCE, NOT_ABSOLUTE_SENTENCE, NOT_CONNECTED_SENTENCE, NOT_SOCKET_SENTENCE, nativePipeRelay, osErrorSentence} from '../../src/repl-host/native-pipe.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// A system error as Node raises it: libuv's message, the code, the negative errno and the failing syscall.
const ERRNO = {EAGAIN: 11, ECONNRESET: 104, ECONNREFUSED: 111, ENOENT: 2, EPIPE: 32, EIO: 5, ECANCELED: 125};
const systemError = (syscall, code, detail = '') => Object.assign(new Error(`${syscall} ${code}${detail}`), {code, errno: -ERRNO[code], syscall});
const socketStat = {isSocket: () => true};

// A socket whose connect completes only when the test says so.
class SocketDouble extends EventEmitter {
  destroyed = false;
  writable = true;
  written = [];
  writeError = null;
  destroy() { if (this.destroyed) return; this.destroyed = true; this.writable = false; queueMicrotask(() => this.emit('close')); }
  write(data, callback) { this.written.push(Buffer.from(data)); queueMicrotask(() => callback(this.writeError)); return true; }
  end(callback) { this.writable = false; queueMicrotask(callback); }
}

function relayWith({connectTimeoutMs = 1000, realpath = path => path, stat = () => socketStat} = {}) {
  const sent = [];
  const sockets = [];
  const relay = nativePipeRelay({send: message => sent.push(message), connectTimeoutMs, realpath, stat,
    connect: ({path}) => { const socket = new SocketDouble(); socket.path = path; sockets.push(socket); return socket; }});
  return {relay, sent, sockets};
}

test('a connect that never completes expires after the connect budget with the vendor sentence; the pending socket is destroyed and a late connect is never delivered', async () => {
  const {relay, sent, sockets} = relayWith({connectTimeoutMs: 1000});
  const started = performance.now();
  relay.handle({type: 'native_pipe_request', id: 'native-pipe-0', op: 'connect', path: '/tmp/never.sock'});
  await delay(900);
  assert.deepEqual(sent, [], 'nothing before the budget');
  await delay(200);
  assert.ok(performance.now() - started >= 1000);
  assert.deepEqual(sent, [{type: 'native_pipe_response', id: 'native-pipe-0', ok: false, error: CONNECT_TIMEOUT_SENTENCE}]);
  assert.equal(sockets[0].destroyed, true);
  sockets[0].emit('connect');
  sockets[0].emit('data', Buffer.from('late'));
  sockets[0].emit('error', new Error('late error'));
  await delay(10);
  assert.equal(sent.length, 1, 'no late connect, data, error or close reaches the worker');
  assert.equal(relay.size, 0);
});

test('the budget is the launch\'s setting', async () => {
  const {relay, sent} = relayWith({connectTimeoutMs: 50});
  relay.handle({id: 'a', op: 'connect', path: '/tmp/x.sock'});
  await delay(120);
  assert.deepEqual(sent, [{type: 'native_pipe_response', id: 'a', ok: false, error: CONNECT_TIMEOUT_SENTENCE}]);
});

// The vendor's validate_native_pipe_path (node_repl 26.928.40906, darwin-arm64 and linux-arm64 alike): is_absolute,
// then canonicalize (realpath(3)), whose failure is `native pipe path unavailable: <io::Error>`, then metadata of the
// canonical path, whose failure is `native pipe stat failed: <io::Error>`, then the S_IFSOCK check.
test('paths are checked before anything connects', () => {
  const missing = path => { throw Object.assign(new Error(`ENOENT: no such file or directory, realpath '${path}'`), {code: 'ENOENT', errno: -2, syscall: 'realpath'}); };
  const canonical = {'/tmp/file': '/private/tmp/file', '/tmp/link.sock': '/private/tmp/real.sock', '/tmp/racing.sock': '/private/tmp/racing.sock'};
  const statted = [];
  const {relay, sent, sockets} = relayWith({
    realpath: path => canonical[path] ?? missing(path),
    stat: path => {
      statted.push(path);
      if (path === '/private/tmp/racing.sock') throw Object.assign(new Error(`EACCES: permission denied, stat '${path}'`), {code: 'EACCES', errno: -13, syscall: 'stat'});
      return path === '/private/tmp/file' ? {isSocket: () => false} : socketStat;
    },
  });
  relay.handle({id: '1', op: 'connect', path: 'relative.sock'});
  relay.handle({id: '2', op: 'connect', path: 42});
  relay.handle({id: '3', op: 'connect', path: '/tmp/file'});
  relay.handle({id: '4', op: 'connect', path: '/tmp/absent'});
  relay.handle({id: '5', op: 'listen', path: '/tmp/x'});
  relay.handle({id: '6', op: 'connect', path: '/tmp/racing.sock'});
  relay.handle({id: '7', op: 'connect', path: '/tmp/nul\0.sock'});
  assert.deepEqual(sent, [
    {type: 'native_pipe_response', id: '1', ok: false, error: NOT_ABSOLUTE_SENTENCE},
    {type: 'native_pipe_response', id: '2', ok: false, error: NOT_ABSOLUTE_SENTENCE},
    {type: 'native_pipe_response', id: '3', ok: false, error: NOT_SOCKET_SENTENCE},
    {type: 'native_pipe_response', id: '4', ok: false, error: 'native pipe path unavailable: No such file or directory (os error 2)'},
    {type: 'native_pipe_response', id: '5', ok: false, error: 'unsupported native pipe operation: listen'},
    {type: 'native_pipe_response', id: '6', ok: false, error: 'native pipe stat failed: Permission denied (os error 13)'},
    // Rust's path-to-C-string conversion refuses an interior NUL before any syscall, with std's own message.
    {type: 'native_pipe_response', id: '7', ok: false, error: 'native pipe path unavailable: file name contained an unexpected NUL byte'},
  ]);
  assert.deepEqual(statted, ['/private/tmp/file', '/private/tmp/racing.sock'], 'only a canonical path is statted');
  assert.equal(sockets.length, 0);
  relay.handle({id: '8', op: 'connect', path: '/tmp/link.sock'});
  assert.deepEqual(sockets.map(socket => socket.path), ['/tmp/link.sock'], 'the connect goes to the path as given');
});

// On the real filesystem, every way realpath(3) can fail names the path unavailable with the platform's own errno.
test('a path that does not resolve is unavailable, with the platform\'s sentence, before anything connects', t => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cua-pipe-')));
  t.after(() => { chmodSync(join(dir, 'locked'), 0o700); rmSync(dir, {recursive: true, force: true}); });
  writeFileSync(join(dir, 'file'), '');
  mkdirSync(join(dir, 'locked'));
  chmodSync(join(dir, 'locked'), 0);
  symlinkSync(join(dir, 'b.sock'), join(dir, 'a.sock'));
  symlinkSync(join(dir, 'a.sock'), join(dir, 'b.sock'));
  symlinkSync(join(dir, 'gone.sock'), join(dir, 'dangling.sock'));
  const linux = process.platform === 'linux';
  const cases = [
    ['absent.sock', 'No such file or directory (os error 2)'],
    ['dangling.sock', 'No such file or directory (os error 2)'],
    ['file/child.sock', 'Not a directory (os error 20)'],
    ['a.sock', `Too many levels of symbolic links (os error ${linux ? 40 : 62})`],
  ];
  // Root searches any directory, so the permission case holds only for an unprivileged user.
  if (process.getuid?.() !== 0) cases.push(['locked/s.sock', 'Permission denied (os error 13)']);
  const sent = [];
  const relay = nativePipeRelay({send: message => sent.push(message), connect: () => assert.fail('nothing connects')});
  for (const [name] of cases) relay.handle({id: name, op: 'connect', path: join(dir, name)});
  assert.deepEqual(sent, cases.map(([name, detail]) => ({type: 'native_pipe_response', id: name, ok: false, error: `native pipe path unavailable: ${detail}`})));
});

// Rust's PathBuf keeps a canonical path's bytes; a UTF-8 string would turn a non-UTF-8 name into replacement characters.
test('the canonical path reaches stat as realpath\'s bytes, unchanged', () => {
  const canonical = Buffer.from([0x2f, 0x74, 0x2f, 0xff, 0x2f, 0x73]); // /t/\xff/s
  const calls = [];
  const {relay, sockets} = relayWith({
    realpath: (path, options) => { calls.push(['realpath', path, options]); return canonical; },
    stat: path => { calls.push(['stat', path]); return socketStat; },
  });
  relay.handle({id: 'b', op: 'connect', path: '/alias/s'});
  assert.deepEqual(calls, [['realpath', '/alias/s', {encoding: 'buffer'}], ['stat', canonical]]);
  assert.equal(calls[1][1], canonical, 'the same Buffer, not a decoded copy');
  assert.deepEqual(sockets.map(socket => socket.path), ['/alias/s']);
});

// Linux names are bytes; APFS refuses a non-UTF-8 name (EILSEQ), so the case exists only on Linux.
test('a socket under a non-UTF-8 directory, reached through an ASCII alias, connects', {skip: process.platform !== 'linux' && 'non-UTF-8 file names exist only on Linux (APFS refuses them with EILSEQ)'}, async t => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cua-pipe-')));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const raw = Buffer.concat([Buffer.from(`${dir}/`), Buffer.from([0x6e, 0xff, 0x6e])]);
  mkdirSync(raw);
  symlinkSync(raw, join(dir, 'alias'));
  const path = join(dir, 'alias', 's.sock');
  const server = createServer(c => c.end()).listen(path);
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const sent = [];
  const relay = nativePipeRelay({send: message => sent.push(message)});
  t.after(() => relay.closeAll());
  relay.handle({id: 'n', op: 'connect', path});
  for (let i = 0; i < 100 && !sent.some(m => m.type === 'native_pipe_response'); i++) await delay(10);
  assert.deepEqual(sent.find(m => m.type === 'native_pipe_response'), {type: 'native_pipe_response', id: 'n', ok: true, result: {connection_id: 'native-pipe-connection-0'}});
});

test('a connected socket relays data and a write; a transport error that is not the peer leaving closes with its sentence; writes after close are refused', async () => {
  const {relay, sent, sockets} = relayWith();
  relay.handle({id: 'c', op: 'connect', path: '/tmp/s.sock'});
  sockets[0].emit('connect');
  const id = sent[0].result.connection_id;
  assert.deepEqual(sent[0], {type: 'native_pipe_response', id: 'c', ok: true, result: {connection_id: id}});
  sockets[0].emit('data', Buffer.from('hello'));
  relay.handle({id: 'w1', op: 'write', connection_id: id, data_base64: Buffer.from('ping').toString('base64')});
  await delay(5);
  assert.equal(sockets[0].written[0].toString(), 'ping');
  sockets[0].emit('error', systemError('read', 'EIO'));
  sockets[0].destroy();
  await delay(5);
  relay.handle({id: 'w2', op: 'write', connection_id: id, data_base64: 'AA=='});
  assert.deepEqual(sent.slice(1), [
    {type: 'native_pipe_data', connection_id: id, data_base64: Buffer.from('hello').toString('base64')},
    {type: 'native_pipe_response', id: 'w1', ok: true, result: null},
    {type: 'native_pipe_closed', connection_id: id, error: 'Input/output error (os error 5)'},
    {type: 'native_pipe_response', id: 'w2', ok: false, error: NOT_CONNECTED_SENTENCE},
  ]);
});

test('the peer leaving by EOF, or a write into the pipe it left, is close-only as the vendor host reports it, and the write\'s failure surfaces after the close', async () => {
  for (const leave of ['eof', 'write']) {
    const {relay, sent, sockets} = relayWith();
    relay.handle({id: 'c', op: 'connect', path: '/tmp/s.sock'});
    sockets[0].emit('connect');
    const id = sent[0].result.connection_id;
    if (leave === 'eof') sockets[0].emit('end');
    sockets[0].writeError = systemError('write', 'EPIPE');
    relay.handle({id: 'w', op: 'write', connection_id: id, data_base64: 'AA=='});
    await delay(5);
    sockets[0].emit('error', systemError('write', 'EPIPE'));
    sockets[0].destroy();
    await delay(5);
    const after = sent.slice(1);
    assert.deepEqual(after.filter(m => m.type === 'native_pipe_closed'), [{type: 'native_pipe_closed', connection_id: id, error: null}], `${leave}: one close, no error`);
    const closedAt = after.findIndex(m => m.type === 'native_pipe_closed');
    const writeAt = after.findIndex(m => m.id === 'w');
    assert.ok(closedAt < writeAt, `${leave}: the close reaches the worker before the write's failure, which the bridge then ignores`);
    assert.equal(after[writeAt].ok, false);
  }
});

test('a reset the reader sees (Linux: the peer closed with unread data) closes with its OS error first, as the vendor\'s reader reports it; the cancelled write fails after', async () => {
  const {relay, sent, sockets} = relayWith();
  relay.handle({id: 'c', op: 'connect', path: '/tmp/s.sock'});
  sockets[0].emit('connect');
  const id = sent[0].result.connection_id;
  sockets[0].writeError = systemError('write', 'ECANCELED');
  relay.handle({id: 'w', op: 'write', connection_id: id, data_base64: 'AA=='});
  sockets[0].emit('error', systemError('read', 'ECONNRESET'));
  sockets[0].destroy();
  await delay(5);
  assert.deepEqual(sent.slice(1), [
    {type: 'native_pipe_closed', connection_id: id, error: 'Connection reset by peer (os error 104)'},
    {type: 'native_pipe_response', id: 'w', ok: false, error: 'native pipe write failed: Operation canceled (os error 125)'},
  ]);
});

test('a refused connect is answered with the error, and closeAll ends live sockets without telling a gone worker', async () => {
  const {relay, sent, sockets} = relayWith();
  relay.handle({id: 'r', op: 'connect', path: '/tmp/refused.sock'});
  sockets[0].emit('error', systemError('connect', 'ECONNREFUSED', ' /tmp/refused.sock'));
  sockets[0].destroy();
  relay.handle({id: 'again', op: 'connect', path: '/tmp/saturated.sock'});
  sockets[1].emit('error', systemError('connect', 'EAGAIN', ' /tmp/saturated.sock'));
  sockets[1].destroy();
  relay.handle({id: 'ok', op: 'connect', path: '/tmp/live.sock'});
  sockets[2].emit('connect');
  await delay(5);
  relay.closeAll();
  await delay(5);
  // The vendor's sentence, observed on cua-linux for a saturated listener (Rust's io::Error display of the OS error).
  assert.deepEqual(sent.map(m => [m.id, m.ok, m.error]), [['r', false, 'failed to connect native pipe: Connection refused (os error 111)'],
    ['again', false, 'failed to connect native pipe: Resource temporarily unavailable (os error 11)'], ['ok', true, undefined]]);
  assert.equal(sockets[2].destroyed, true);
});

test('a real Unix socket: bytes both ways, close on request, and the peer\'s close reported once', async t => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cua-pipe-')));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const path = join(dir, 's.sock');
  const received = [];
  const server = createServer(c => c.on('data', d => { received.push(String(d)); c.write('pong'); })).listen(path);
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const sent = [];
  const relay = nativePipeRelay({send: message => sent.push(message)});
  relay.handle({id: 'c', op: 'connect', path});
  for (let i = 0; i < 100 && !sent.length; i++) await delay(10);
  const id = sent[0].result.connection_id;
  relay.handle({id: 'w', op: 'write', connection_id: id, data_base64: Buffer.from('ping').toString('base64')});
  for (let i = 0; i < 100 && !sent.some(m => m.type === 'native_pipe_data'); i++) await delay(10);
  relay.handle({id: 'x', op: 'close', connection_id: id});
  for (let i = 0; i < 100 && !sent.some(m => m.type === 'native_pipe_closed'); i++) await delay(10);
  assert.deepEqual(received, ['ping']);
  assert.deepEqual(sent.filter(m => m.type !== 'native_pipe_response'), [
    {type: 'native_pipe_data', connection_id: id, data_base64: Buffer.from('pong').toString('base64')},
    {type: 'native_pipe_closed', connection_id: id, error: null},
  ]);
  assert.deepEqual(sent.filter(m => m.type === 'native_pipe_response').map(m => [m.id, m.ok]), [['c', true], ['w', true], ['x', true]]);
  const file = join(dir, 'file');
  writeFileSync(file, '');
  relay.handle({id: 'f', op: 'connect', path: file});
  assert.deepEqual(sent.at(-1), {type: 'native_pipe_response', id: 'f', ok: false, error: NOT_SOCKET_SENTENCE});
});

test('closeAll also ends a connect still pending: its socket is destroyed at once, its timer cleared, and nothing reaches the gone worker', async () => {
  const {relay, sent, sockets} = relayWith({connectTimeoutMs: 1000});
  relay.handle({id: 'pending', op: 'connect', path: '/tmp/never.sock'});
  relay.closeAll();
  assert.equal(sockets[0].destroyed, true, 'destroyed at once, not at the 1 s timeout');
  sockets[0].emit('connect');
  await delay(1100);
  assert.deepEqual(sent, [], 'no timeout answer and no late connect');
});

// strerror as the vendor's Rust host displays it: glibc's on Linux, Darwin libc's on macOS (Darwin's checked against
// os.strerror on macOS 15). libuv's own messages differ for many of these, so a mutation to libuv's text fails here.
test('an OS error reads as the platform C library\'s strerror, with the platform\'s errno', () => {
  const linux = {ELOOP: [40, 'Too many levels of symbolic links'], ENFILE: [23, 'Too many open files in system'], ENOMEM: [12, 'Cannot allocate memory'],
    ETIMEDOUT: [110, 'Connection timed out'], ENOTCONN: [107, 'Transport endpoint is not connected'], EADDRNOTAVAIL: [99, 'Cannot assign requested address'],
    EAGAIN: [11, 'Resource temporarily unavailable'], ECONNRESET: [104, 'Connection reset by peer'], ENOENT: [2, 'No such file or directory'], EPROTOTYPE: [91, 'Protocol wrong type for socket'],
    ENOTSUP: [95, 'Operation not supported'], EOPNOTSUPP: [95, 'Operation not supported']};
  const darwin = {ELOOP: [62, 'Too many levels of symbolic links'], ENFILE: [23, 'Too many open files in system'], ENOMEM: [12, 'Cannot allocate memory'],
    ETIMEDOUT: [60, 'Operation timed out'], ENOTCONN: [57, 'Socket is not connected'], EADDRNOTAVAIL: [49, "Can't assign requested address"],
    EAGAIN: [35, 'Resource temporarily unavailable'], ECONNRESET: [54, 'Connection reset by peer'], ENOENT: [2, 'No such file or directory'], EPROTOTYPE: [41, 'Protocol wrong type for socket'],
    // Node's ENOTSUP is Darwin's 45, distinct from EOPNOTSUPP's 102.
    ENOTSUP: [45, 'Operation not supported'], EOPNOTSUPP: [102, 'Operation not supported on socket']};
  for (const [platform, table] of Object.entries({linux, darwin}))
    for (const [code, [errno, text]] of Object.entries(table))
      assert.equal(osErrorSentence(Object.assign(new Error(`connect ${code}`), {code, errno: -errno, syscall: 'connect'}), platform), `${text} (os error ${errno})`, `${platform} ${code}`);
  // Not a system error, or one no relay syscall reaches: its own message, never a guessed sentence.
  assert.equal(osErrorSentence(new Error('plain')), 'plain');
  assert.equal(osErrorSentence(Object.assign(new Error('spawn E2BIG'), {code: 'E2BIG', errno: -7, syscall: 'spawn'}), 'linux'), 'spawn E2BIG');
});
