// The supervisor's native pipe relay (src/repl-host/native-pipe.mjs) against socket doubles and a real Unix socket:
// the connect budget's expiry (unreachable live on macOS, where a saturated listener refuses at once), terminal events,
// write failures and correlation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CONNECT_TIMEOUT_SENTENCE, NOT_ABSOLUTE_SENTENCE, NOT_CONNECTED_SENTENCE, NOT_SOCKET_SENTENCE, nativePipeRelay} from '../../src/repl-host/native-pipe.mjs';

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

function relayWith({connectTimeoutMs = 1000, stat = () => socketStat} = {}) {
  const sent = [];
  const sockets = [];
  const relay = nativePipeRelay({send: message => sent.push(message), connectTimeoutMs, stat,
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

test('paths are checked before anything connects', () => {
  const {relay, sent, sockets} = relayWith({stat: path => (path === '/tmp/file' ? {isSocket: () => false} : (() => { throw Object.assign(new Error(`ENOENT: no such file or directory, stat '${path}'`), {code: 'ENOENT', errno: -2, syscall: 'stat'}); })())});
  relay.handle({id: '1', op: 'connect', path: 'relative.sock'});
  relay.handle({id: '2', op: 'connect', path: 42});
  relay.handle({id: '3', op: 'connect', path: '/tmp/file'});
  relay.handle({id: '4', op: 'connect', path: '/tmp/absent'});
  relay.handle({id: '5', op: 'listen', path: '/tmp/x'});
  assert.deepEqual(sent, [
    {type: 'native_pipe_response', id: '1', ok: false, error: NOT_ABSOLUTE_SENTENCE},
    {type: 'native_pipe_response', id: '2', ok: false, error: NOT_ABSOLUTE_SENTENCE},
    {type: 'native_pipe_response', id: '3', ok: false, error: NOT_SOCKET_SENTENCE},
    {type: 'native_pipe_response', id: '4', ok: false, error: 'failed to connect native pipe: No such file or directory (os error 2)'},
    {type: 'native_pipe_response', id: '5', ok: false, error: 'unsupported native pipe operation: listen'},
  ]);
  assert.equal(sockets.length, 0);
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
