// Socket paths longer than sun_path (src/repl-host/native-pipe.mjs). The vendor's node_repl 26.928.40906 checks the
// canonical path per platform: on macOS (start_macos_native_pipe_connect) one of 104 bytes or more is reached through
// its parent directory (open, pthread_fchdir_np, connect to the file name, refused when the name alone does not fit);
// on Linux (tokio UnixStream::connect) one of 108 bytes or more is refused by std's sockaddr_un. The own host reaches a
// path too long to connect as given through a short-lived symbolic link to the canonical path.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdirSync, mkdtempSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {nativePipeRelay} from '../../src/repl-host/native-pipe.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const SUN_PATH = {darwin: 104, linux: 108};
const socketStat = {isSocket: () => true};
const systemError = (code, errno, syscall) => Object.assign(new Error(`${syscall} ${code}`), {code, errno: -errno, syscall});

class SocketDouble extends EventEmitter {
  destroyed = false;
  destroy() { if (!this.destroyed) { this.destroyed = true; queueMicrotask(() => this.emit('close')); } }
}

const scratch = (t, prefix = 'cua-pipe-long-') => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return dir;
};

// A directory whose socket path is exactly `bytes` long, and a listener there bound through a short alias (bind
// resolves the alias's directory), answering every connection with `greeting`. -> {path, server}
async function longListener(t, root, bytes, {greeting = 'pong', name = 's.sock'} = {}) {
  const padding = bytes - Buffer.byteLength(join(root, name)) - 1;
  assert.ok(padding > 0 && padding < 256, 'the scratch root leaves room for the path');
  const dir = join(root, 'd'.repeat(padding));
  mkdirSync(dir);
  const path = join(dir, name);
  assert.equal(Buffer.byteLength(path), bytes);
  const alias = join(realpathSync(mkdtempSync('/tmp/cua-bind-')), 'a');
  t.after(() => rmSync(join(alias, '..'), {recursive: true, force: true}));
  symlinkSync(dir, alias);
  const server = createServer(c => { c.on('error', () => {}); c.end(greeting); }).listen(join(alias, name));
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  return {path, server};
}

async function answered(sent, id) {
  for (let i = 0; i < 200 && !sent.some(m => m.type === 'native_pipe_response' && m.id === id); i++) await delay(5);
  return sent.find(m => m.type === 'native_pipe_response' && m.id === id);
}

test('over sun_path, the canonical path follows the vendor\'s rule for the platform before anything connects', () => {
  const long = (bytes, name = 's.sock') => Buffer.from(`/${'p'.repeat(bytes - name.length - 2)}/${name}`);
  const run = ({platform, canonical, openDirectory = () => {}}) => {
    const sent = [];
    const opened = [];
    const sockets = [];
    const relay = nativePipeRelay({send: m => sent.push(m), platform, realpath: () => canonical, stat: () => socketStat,
      openDirectory: path => { opened.push(Buffer.from(path).toString()); openDirectory(path); },
      connect: () => { const socket = new SocketDouble(); sockets.push(socket); return socket; }});
    relay.handle({id: 'c', op: 'connect', path: '/given.sock'});
    relay.closeAll();
    return {error: sent[0]?.error, opened, connected: sockets.length};
  };
  // Linux: std's sockaddr_un refuses 108 bytes or more; 107 fits.
  assert.deepEqual(run({platform: 'linux', canonical: long(108)}), {error: 'failed to connect native pipe: path must be shorter than SUN_LEN', opened: [], connected: 0});
  assert.deepEqual(run({platform: 'linux', canonical: long(107)}), {error: undefined, opened: [], connected: 1});
  // macOS: under 104 bytes nothing more is checked.
  assert.deepEqual(run({platform: 'darwin', canonical: long(103)}), {error: undefined, opened: [], connected: 1});
  // 104 bytes or more: the parent directory is opened first, then the file name must fit sun_path on its own.
  const parent = long(150).subarray(0, 150 - 's.sock'.length - 1).toString();
  assert.deepEqual(run({platform: 'darwin', canonical: long(150)}), {error: undefined, opened: [parent], connected: 1});
  assert.deepEqual(run({platform: 'darwin', canonical: long(150), openDirectory: () => { throw systemError('EACCES', 13, 'open'); }}),
    {error: 'failed to connect native pipe: Permission denied (os error 13)', opened: [parent], connected: 0});
  assert.deepEqual(run({platform: 'darwin', canonical: long(220, 'n'.repeat(103))}).error, undefined);
  assert.deepEqual(run({platform: 'darwin', canonical: long(220, 'n'.repeat(104))}).error, 'failed to connect native pipe: native pipe file name is too long');
  // The vendor opens the parent before it looks at the name.
  assert.equal(run({platform: 'darwin', canonical: long(220, 'n'.repeat(104)), openDirectory: () => { throw systemError('ENOENT', 2, 'open'); }}).error,
    'failed to connect native pipe: No such file or directory (os error 2)');
});

test('a path too long to connect as given is reached through a link to its canonical path that lives only for the connect call', t => {
  const root = scratch(t);
  const shortcuts = scratch(t, 'cua-np-root-');
  const sock = join(root, 's.sock');
  writeFileSync(sock, '');
  const canonical = Buffer.from(join(root, 'c.sock'));
  const given = `${root}${'/.'.repeat(60)}/s.sock`;
  const seen = [];
  const sent = [];
  const relay = nativePipeRelay({send: m => sent.push(m), shortcutRoot: shortcuts, realpath: () => canonical, stat: () => socketStat,
    connect: ({path}) => { seen.push({path, target: path === sock ? null : readlinkSync(path, {encoding: 'buffer'}), dir: readdirSync(shortcuts)}); return new SocketDouble(); }});
  t.after(() => relay.closeAll());
  relay.handle({id: 'long', op: 'connect', path: given});
  relay.handle({id: 'short', op: 'connect', path: sock});
  assert.equal(seen.length, 2);
  assert.equal(seen[0].path.startsWith(`${shortcuts}/`), true);
  assert.ok(Buffer.byteLength(seen[0].path) < SUN_PATH.darwin);
  assert.deepEqual(seen[0].target, canonical, 'the link names the canonical path\'s bytes');
  assert.equal(seen[0].dir.length, 1);
  assert.equal(seen[1].path, sock, 'a path that fits is connected as given');
  assert.deepEqual(readdirSync(shortcuts), [], 'the link is gone once the connect call returns');
});

test('the shortcut never reuses a name it did not create, and is removed whatever the connect does', async t => {
  const root = scratch(t);
  const shortcuts = scratch(t, 'cua-np-root-');
  const given = `${root}${'/.'.repeat(60)}/s.sock`;
  const decoy = join(root, 'decoy.sock');
  symlinkSync(decoy, join(shortcuts, 'taken'));
  const names = ['taken', 'n1', 'n2', 'n3'];
  const targets = [];
  const sent = [];
  let behaviour = 'pending';
  const relay = nativePipeRelay({send: m => sent.push(m), connectTimeoutMs: 30, shortcutRoot: shortcuts, shortcutName: () => names.shift(),
    realpath: () => Buffer.from(join(root, 'real.sock')), stat: () => socketStat,
    connect: ({path}) => {
      targets.push([path, readlinkSync(path)]);
      if (behaviour === 'throws') throw new Error('connect threw');
      const socket = new SocketDouble();
      if (behaviour === 'refused') queueMicrotask(() => socket.emit('error', systemError('ECONNREFUSED', process.platform === 'linux' ? 111 : 61, 'connect')));
      return socket;
    }});
  t.after(() => relay.closeAll());
  relay.handle({id: 'timeout', op: 'connect', path: given});
  behaviour = 'refused';
  relay.handle({id: 'refused', op: 'connect', path: given});
  behaviour = 'throws';
  assert.throws(() => relay.handle({id: 'throws', op: 'connect', path: given}), /connect threw/);
  assert.deepEqual(targets, [[join(shortcuts, 'n1'), join(root, 'real.sock')], [join(shortcuts, 'n2'), join(root, 'real.sock')], [join(shortcuts, 'n3'), join(root, 'real.sock')]],
    'a name already present is skipped, never followed');
  assert.deepEqual(readdirSync(shortcuts), ['taken'], 'only what the relay did not create remains');
  assert.equal(readlinkSync(join(shortcuts, 'taken')), decoy);
  assert.match((await answered(sent, 'refused')).error, /^failed to connect native pipe: Connection refused/);
  assert.equal((await answered(sent, 'timeout')).error, 'native pipe initial connect timed out');
  assert.deepEqual(readdirSync(shortcuts), ['taken']);
});

test('a link that cannot be made fails the connect with its OS error, and nothing connects', t => {
  const root = scratch(t);
  const sent = [];
  const relay = nativePipeRelay({send: m => sent.push(m), shortcutRoot: join(root, 'absent'), realpath: () => Buffer.from(join(root, 'real.sock')),
    stat: () => socketStat, connect: () => assert.fail('nothing connects')});
  relay.handle({id: 'x', op: 'connect', path: `${root}${'/.'.repeat(60)}/s.sock`});
  assert.deepEqual(sent, [{type: 'native_pipe_response', id: 'x', ok: false, error: 'failed to connect native pipe: No such file or directory (os error 2)'}]);
});

// Both platforms: a given path over sun_path whose canonical path fits, as the vendor connects the canonical path.
test('real listeners: concurrent connects through padded paths each reach their own socket and leave no link behind', async t => {
  const root = scratch(t);
  const shortcuts = scratch(t, 'cua-np-root-');
  const count = 6;
  const paths = [];
  for (let i = 0; i < count; i++) {
    const path = join(root, `s${i}.sock`);
    const server = createServer(c => c.end(`peer-${i}`)).listen(path);
    t.after(() => server.close());
    await new Promise(resolve => server.once('listening', resolve));
    paths.push(`${root}${'/.'.repeat(60)}/s${i}.sock`);
  }
  const sent = [];
  const relay = nativePipeRelay({send: m => sent.push(m), shortcutRoot: shortcuts});
  t.after(() => relay.closeAll());
  paths.forEach((path, i) => relay.handle({id: `c${i}`, op: 'connect', path}));
  assert.deepEqual(readdirSync(shortcuts), []);
  for (let i = 0; i < 200 && sent.filter(m => m.type === 'native_pipe_closed').length < count; i++) await delay(5);
  const byConnection = new Map(sent.filter(m => m.type === 'native_pipe_response').map(m => [m.result?.connection_id, m.id]));
  const received = Object.fromEntries(sent.filter(m => m.type === 'native_pipe_data').map(m => [byConnection.get(m.connection_id), Buffer.from(m.data_base64, 'base64').toString()]));
  assert.deepEqual(received, Object.fromEntries(paths.map((_, i) => [`c${i}`, `peer-${i}`])));
  assert.equal(sent.filter(m => m.type === 'native_pipe_closed').length, count);
});

test('macOS: a 192-byte socket path connects through the default shortcut root, bytes both ways, and /tmp keeps no link', {skip: process.platform !== 'darwin' && 'the vendor connects long paths only on macOS'}, async t => {
  const root = scratch(t);
  const {path} = await longListener(t, root, 192, {greeting: 'long-pong'});
  const before = readdirSync('/tmp').filter(name => name.startsWith('cua-np-'));
  const sent = [];
  const relay = nativePipeRelay({send: m => sent.push(m)});
  t.after(() => relay.closeAll());
  relay.handle({id: 'c', op: 'connect', path});
  assert.deepEqual(readdirSync('/tmp').filter(name => name.startsWith('cua-np-')), before, 'no link outlives the connect call');
  const response = await answered(sent, 'c');
  assert.equal(response.ok, true, response.error);
  for (let i = 0; i < 200 && !sent.some(m => m.type === 'native_pipe_closed'); i++) await delay(5);
  assert.deepEqual(sent.filter(m => m.type !== 'native_pipe_response'), [
    {type: 'native_pipe_data', connection_id: response.result.connection_id, data_base64: Buffer.from('long-pong').toString('base64')},
    {type: 'native_pipe_closed', connection_id: response.result.connection_id, error: null},
  ]);
});

test('macOS: a socket whose own name is longer than sun_path is refused with the vendor\'s sentence', {skip: process.platform !== 'darwin' && 'the file-name rule is the macOS parent-directory connect'}, async t => {
  const root = scratch(t);
  const {path: bound} = await longListener(t, root, 150);
  const name = 'n'.repeat(110);
  const path = join(bound, '..', name);
  renameSync(bound, path);
  const sent = [];
  const relay = nativePipeRelay({send: m => sent.push(m), connect: () => assert.fail('nothing connects')});
  relay.handle({id: 'c', op: 'connect', path});
  assert.deepEqual(sent, [{type: 'native_pipe_response', id: 'c', ok: false, error: 'failed to connect native pipe: native pipe file name is too long'}]);
});

test('Linux: a 192-byte canonical socket path is refused as the vendor\'s std refuses it, and nothing connects', {skip: process.platform !== 'linux' && 'std\'s SUN_LEN refusal is the Linux vendor\'s connect'}, async t => {
  const root = scratch(t);
  const {path} = await longListener(t, root, 192);
  const sent = [];
  const relay = nativePipeRelay({send: m => sent.push(m), connect: () => assert.fail('nothing connects')});
  relay.handle({id: 'c', op: 'connect', path});
  assert.deepEqual(sent, [{type: 'native_pipe_response', id: 'c', ok: false, error: 'failed to connect native pipe: path must be shorter than SUN_LEN'}]);
});
