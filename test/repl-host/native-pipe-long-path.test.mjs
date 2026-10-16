// Socket paths longer than sun_path (src/repl-host/native-pipe.mjs, ./native-pipe-directory.mjs). The vendor's node_repl
// 26.928.40906 checks the canonical path per platform: on macOS (start_macos_native_pipe_connect) one of 104 bytes or
// more is connected through its parent directory (open it, pthread_fchdir_np, connect the file name, refused when the
// name alone does not fit); on Linux (tokio UnixStream::connect) one of 108 bytes or more is refused by std's
// sockaddr_un. The own host reaches the macOS case through a connector process started in that directory, which owns
// the connection for its whole life, so the peer a server sees (LOCAL_PEERPID) is one live descendant throughout.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdirSync, mkdtempSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {nativePipeRelay} from '../../src/repl-host/native-pipe.mjs';
import {connectInDirectory} from '../../src/repl-host/native-pipe-directory.mjs';
import {authorizePeer, loadPeerAddon, peerAddonPath, rootOf, socketFd} from '../../src/chrome/peer.mjs';

const darwinOnly = {skip: process.platform !== 'darwin' && 'the vendor connects long paths only on macOS'};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const socketStat = {isSocket: () => true};
const systemError = (code, errno, syscall) => Object.assign(new Error(`${syscall} ${code}`), {code, errno: -errno, syscall});
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const until = async (predicate, ms = 3000) => { for (const end = Date.now() + ms; Date.now() < end && !predicate();) await delay(5); return predicate(); };
const tmpResidue = () => readdirSync('/tmp').filter(name => name.startsWith('cua-')).sort();
const identityOf = path => { const {dev, ino} = statSync(path, {bigint: true}); return {dev, ino}; };

class SocketDouble extends EventEmitter {
  destroyed = false;
  destroy() { if (!this.destroyed) { this.destroyed = true; queueMicrotask(() => this.emit('close')); } }
}

const scratch = (t, prefix = 'cua-pipe-long-') => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return dir;
};

// A directory under `root` whose socket path is exactly `bytes` long, and a listener there bound through a short alias
// (bind resolves the alias's directory). Each accepted connection records cua's own peer verdict at accept (MAWS's
// policy: the peer descends from this process) and LOCAL_PEERPID on accept, on every data and at its end; it answers
// `greeting` and ends, or echoes. -> {path, dir, peers, addon}
async function longListener(t, root, bytes, {greeting = 'pong', echo = false} = {}) {
  const name = 's.sock';
  const padding = bytes - Buffer.byteLength(join(root, name)) - 1;
  assert.ok(padding > 0 && padding < 256, 'the scratch root leaves room for the path');
  const dir = join(root, 'd'.repeat(padding));
  mkdirSync(dir);
  const path = join(dir, name);
  assert.equal(Buffer.byteLength(path), bytes);
  const alias = join(realpathSync(mkdtempSync(join(tmpdir(), 'b-'))), 'a');
  t.after(() => rmSync(join(alias, '..'), {recursive: true, force: true}));
  symlinkSync(dir, alias);
  const addon = loadPeerAddon(peerAddonPath());
  const peers = [];
  const server = createServer(c => {
    const fd = socketFd(c);
    const record = {pids: [], data: [], ended: false,
      verdict: addon && authorizePeer(fd, [rootOf(process.pid, addon)], {addon, now: Date.now(), uid: process.getuid()})};
    peers.push(record);
    const read = () => { if (addon && fd !== null) try { record.pids.push(addon.peer(fd).pid); } catch {} };
    read();
    c.on('error', () => {});
    c.on('data', d => { read(); record.data.push(Buffer.from(d)); if (echo) c.write(d); });
    c.on('end', () => { read(); record.ended = true; if (echo) c.end(); });
    if (!echo) c.end(greeting);
  }).listen(join(alias, name));
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  return {path, dir, peers, addon};
}

async function answered(sent, id) {
  await until(() => sent.some(m => m.type === 'native_pipe_response' && m.id === id));
  return sent.find(m => m.type === 'native_pipe_response' && m.id === id);
}

const receivedBy = sent => {
  const byConnection = new Map(sent.filter(m => m.type === 'native_pipe_response').map(m => [m.result?.connection_id, m.id]));
  return Object.fromEntries(sent.filter(m => m.type === 'native_pipe_data').map(m => [byConnection.get(m.connection_id), Buffer.from(m.data_base64, 'base64').toString()]));
};

test('over sun_path, the canonical path follows the vendor\'s rule for the platform before anything connects', () => {
  const long = (bytes, name = 's.sock') => Buffer.from(`/${'p'.repeat(bytes - name.length - 2)}/${name}`);
  const identity = {dev: 1n, ino: 2n};
  const run = ({platform, canonical, given = '/given.sock', openDirectory = () => identity}) => {
    const sent = [];
    const opened = [];
    const routes = [];
    const relay = nativePipeRelay({send: m => sent.push(m), platform, realpath: () => canonical, stat: () => socketStat,
      openDirectory: path => { opened.push(Buffer.from(path).toString()); return openDirectory(path); },
      connect: ({path}) => { routes.push({path}); return new SocketDouble(); },
      connectInDirectory: route => { routes.push(route); return new SocketDouble(); }});
    relay.handle({id: 'c', op: 'connect', path: given});
    relay.closeAll();
    return {error: sent[0]?.error, opened, routes};
  };
  // Linux: std's sockaddr_un refuses 108 bytes or more; 107 fits.
  assert.deepEqual(run({platform: 'linux', canonical: long(108)}), {error: 'failed to connect native pipe: path must be shorter than SUN_LEN', opened: [], routes: []});
  assert.deepEqual(run({platform: 'linux', canonical: long(107)}), {error: undefined, opened: [], routes: [{path: '/given.sock'}]});
  // macOS: under 104 bytes nothing more is checked.
  assert.deepEqual(run({platform: 'darwin', canonical: long(103)}), {error: undefined, opened: [], routes: [{path: '/given.sock'}]});
  // 104 bytes or more: the parent directory is opened first, then the file name must fit sun_path on its own.
  const parent = long(150).subarray(0, 150 - 's.sock'.length - 1).toString();
  assert.deepEqual(run({platform: 'darwin', canonical: long(150)}), {error: undefined, opened: [parent], routes: [{path: '/given.sock'}]});
  assert.deepEqual(run({platform: 'darwin', canonical: long(150), openDirectory: () => { throw systemError('EACCES', 13, 'open'); }}),
    {error: 'failed to connect native pipe: Permission denied (os error 13)', opened: [parent], routes: []});
  assert.equal(run({platform: 'darwin', canonical: long(220, 'n'.repeat(103))}).error, undefined);
  assert.equal(run({platform: 'darwin', canonical: long(220, 'n'.repeat(104))}).error, 'failed to connect native pipe: native pipe file name is too long');
  // The vendor opens the parent before it looks at the name.
  assert.equal(run({platform: 'darwin', canonical: long(220, 'n'.repeat(104)), openDirectory: () => { throw systemError('ENOENT', 2, 'open'); }}).error,
    'failed to connect native pipe: No such file or directory (os error 2)');
  // A given path that does not fit: a canonical path that fits is connected directly, a longer one (macOS) in its
  // directory, by the directory's identity as the vendor's open saw it.
  const padded = `/${'./'.repeat(80)}given.sock`;
  assert.deepEqual(run({platform: 'linux', canonical: long(60), given: padded}).routes, [{path: long(60).toString()}]);
  assert.deepEqual(run({platform: 'darwin', canonical: long(60), given: padded}).routes, [{path: long(60).toString()}]);
  assert.deepEqual(run({platform: 'darwin', canonical: long(150), given: padded}).routes, [{directory: parent, name: 's.sock', identity}]);
});

// Both platforms: a given path over sun_path whose canonical path fits, as the vendor connects the canonical path.
test('real listeners: concurrent connects through padded paths each reach their own socket at its canonical path', async t => {
  const root = scratch(t);
  const count = 6;
  const paths = [];
  for (let i = 0; i < count; i++) {
    const server = createServer(c => c.end(`peer-${i}`)).listen(join(root, `s${i}.sock`));
    t.after(() => server.close());
    await new Promise(resolve => server.once('listening', resolve));
    paths.push(`${root}${'/.'.repeat(60)}/s${i}.sock`);
  }
  const sent = [];
  const relay = nativePipeRelay({send: m => sent.push(m)});
  t.after(() => relay.closeAll());
  paths.forEach((path, i) => relay.handle({id: `c${i}`, op: 'connect', path}));
  await until(() => sent.filter(m => m.type === 'native_pipe_closed').length === count);
  assert.deepEqual(receivedBy(sent), Object.fromEntries(paths.map((_, i) => [`c${i}`, `peer-${i}`])));
});

test('macOS: a 192-byte socket path connects, bytes both ways, and the server sees one live descendant peer throughout', darwinOnly, async t => {
  const root = scratch(t);
  const listener = await longListener(t, root, 192, {echo: true});
  const before = tmpResidue();
  const sent = [];
  const relay = nativePipeRelay({send: m => sent.push(m)});
  t.after(() => relay.closeAll());
  relay.handle({id: 'c', op: 'connect', path: listener.path});
  const response = await answered(sent, 'c');
  assert.equal(response.ok, true, response.error);
  const connection = response.result.connection_id;
  const bytes = Buffer.from([0, 255, 128, 10, 13, 65]);
  relay.handle({id: 'w', op: 'write', connection_id: connection, data_base64: bytes.toString('base64')});
  assert.equal((await answered(sent, 'w')).ok, true);
  await until(() => sent.some(m => m.type === 'native_pipe_data'));
  assert.deepEqual(Buffer.concat(sent.filter(m => m.type === 'native_pipe_data').map(m => Buffer.from(m.data_base64, 'base64'))), bytes);
  assert.equal(listener.peers[0].verdict, null, 'the server\'s ancestry check at accept passes');
  const [peer] = listener.peers[0].pids;
  assert.notEqual(peer, process.pid);
  assert.equal(listener.addon.process(peer)?.ppid, process.pid, 'the peer is a live child of the relay\'s process');
  relay.handle({id: 'x', op: 'close', connection_id: connection});
  await until(() => sent.some(m => m.type === 'native_pipe_closed'));
  assert.deepEqual(sent.find(m => m.type === 'native_pipe_closed'), {type: 'native_pipe_closed', connection_id: connection, error: null});
  await until(() => listener.peers[0]?.ended);
  assert.deepEqual(Buffer.concat(listener.peers[0].data), bytes);
  const {pids} = listener.peers[0];
  assert.ok(pids.length >= 3, 'accept, data and end were each read');
  assert.deepEqual([...new Set(pids)], [peer], 'one process operates the connection from accept to end');
  assert.equal(await until(() => !alive(peer)), true, 'the connector exits once the connection is closed');
  assert.deepEqual(tmpResidue(), before, 'nothing is left in /tmp');
});

test('macOS: a directory swapped after the vendor\'s check fails closed, and the socket now at that path is never reached', darwinOnly, async t => {
  const real = await longListener(t, scratch(t), 160, {greeting: 'real'});
  // A same-length directory elsewhere with its own listening socket of the same name.
  const decoy = await longListener(t, join(real.dir, '..', '..'), 160 + 20, {greeting: 'decoy'});
  const sent = [];
  const relay = nativePipeRelay({send: m => sent.push(m), openDirectory: path => {
    const identity = identityOf(path);
    // Between the check and the connect, the checked directory is moved away and the decoy put in its place.
    renameSync(real.dir, `${real.dir}-moved`);
    renameSync(decoy.dir, real.dir);
    return identity;
  }});
  t.after(() => relay.closeAll());
  relay.handle({id: 'c', op: 'connect', path: real.path});
  assert.deepEqual(await answered(sent, 'c'),
    {type: 'native_pipe_response', id: 'c', ok: false, error: 'failed to connect native pipe: native pipe directory changed while connecting'});
  await delay(50);
  assert.equal(decoy.peers.length, 0, 'the decoy is never reached');
  assert.equal(real.peers.length, 0);
});

test('macOS: concurrent long-path connects each reach their own socket through their own connector', darwinOnly, async t => {
  const root = scratch(t);
  const listeners = [];
  for (let i = 0; i < 5; i++) {
    const base = join(root, `r${i}`);
    mkdirSync(base);
    listeners.push(await longListener(t, base, 180 + i, {greeting: `peer-${i}`}));
  }
  const sent = [];
  const relay = nativePipeRelay({send: m => sent.push(m)});
  t.after(() => relay.closeAll());
  listeners.forEach(({path}, i) => relay.handle({id: `c${i}`, op: 'connect', path}));
  await until(() => sent.filter(m => m.type === 'native_pipe_closed').length === listeners.length, 10000);
  assert.deepEqual(receivedBy(sent), Object.fromEntries(listeners.map((_, i) => [`c${i}`, `peer-${i}`])));
  const connectors = listeners.map(l => l.peers[0].pids[0]);
  assert.equal(new Set(connectors).size, listeners.length, 'one connector per connection');
  assert.equal(await until(() => connectors.every(pid => !alive(pid))), true);
});

test('macOS: the connect budget bounds the connector, which is reaped on expiry', darwinOnly, async t => {
  const listener = await longListener(t, scratch(t), 170);
  const sent = [];
  const children = [];
  const relay = nativePipeRelay({send: m => sent.push(m), connectTimeoutMs: 1,
    connectInDirectory: route => { const socket = connectInDirectory(route); children.push(socket.pid); return socket; }});
  t.after(() => relay.closeAll());
  relay.handle({id: 'c', op: 'connect', path: listener.path});
  assert.deepEqual(await answered(sent, 'c'), {type: 'native_pipe_response', id: 'c', ok: false, error: 'native pipe initial connect timed out'});
  assert.equal(children.length, 1);
  assert.equal(await until(() => children.every(pid => !alive(pid))), true, 'the connector is gone');
  await delay(50);
  assert.equal(sent.length, 1, 'nothing more reaches the worker');
  assert.equal(listener.peers.length, 0);
});

test('macOS: a connector that dies closes its connection with a sentence, and one that dies before connecting fails it', darwinOnly, async t => {
  const listener = await longListener(t, scratch(t), 170, {echo: true});
  let killAtStart = false;
  const sent = [];
  const relay = nativePipeRelay({send: m => sent.push(m), connectInDirectory: route => {
    const socket = connectInDirectory(route);
    if (killAtStart) process.kill(socket.pid, 'SIGKILL');
    return socket;
  }});
  t.after(() => relay.closeAll());
  relay.handle({id: 'c', op: 'connect', path: listener.path});
  const response = await answered(sent, 'c');
  assert.equal(response.ok, true, response.error);
  await until(() => listener.peers[0]?.pids.length);
  process.kill(listener.peers[0].pids[0], 'SIGKILL');
  await until(() => sent.some(m => m.type === 'native_pipe_closed'));
  assert.deepEqual(sent.find(m => m.type === 'native_pipe_closed'), {type: 'native_pipe_closed', connection_id: response.result.connection_id, error: 'native pipe connector exited'});
  killAtStart = true;
  relay.handle({id: 'd', op: 'connect', path: listener.path});
  assert.deepEqual(await answered(sent, 'd'), {type: 'native_pipe_response', id: 'd', ok: false, error: 'failed to connect native pipe: native pipe connector exited'});
});

test('macOS: when the relay\'s process is killed, its connector exits and the server sees the connection end', darwinOnly, async t => {
  const listener = await longListener(t, scratch(t), 175, {echo: true});
  const relayModule = fileURLToPath(new URL('../../src/repl-host/native-pipe.mjs', import.meta.url));
  const host = spawn(process.execPath, ['--input-type=module', '-e',
    `const {nativePipeRelay} = await import(${JSON.stringify(relayModule)});
     const relay = nativePipeRelay({send: m => { if (m.type === 'native_pipe_response') process.stdout.write(JSON.stringify(m) + '\\n'); }});
     relay.handle({id: 'c', op: 'connect', path: ${JSON.stringify(listener.path)}});
     setInterval(() => {}, 1000);`], {stdio: ['ignore', 'pipe', 'inherit']});
  t.after(() => host.kill('SIGKILL'));
  let out = '';
  host.stdout.on('data', d => { out += d; });
  assert.equal(await until(() => out.includes('"ok":true'), 5000), true, out);
  await until(() => listener.peers[0]?.pids.length);
  const connector = listener.peers[0].pids[0];
  assert.equal(alive(connector), true);
  host.kill('SIGKILL');
  assert.equal(await until(() => !alive(connector), 5000), true, 'the connector does not outlive the relay');
  assert.equal(await until(() => listener.peers[0].ended, 5000), true, 'the server sees the connection end');
});

test('macOS: the connector runs as the supervisor does, is owned from its spawn and released only once it has exited', darwinOnly, async t => {
  const listener = await longListener(t, scratch(t), 170, {echo: true});
  const owned = [];
  const sent = [];
  const relay = nativePipeRelay({send: m => sent.push(m), own: pid => {
    const entry = {pid, released: null};
    owned.push(entry);
    return () => { entry.released = {aliveThen: alive(pid)}; };
  }});
  t.after(() => relay.closeAll());
  relay.handle({id: 'c', op: 'connect', path: listener.path});
  const response = await answered(sent, 'c');
  assert.equal(response.ok, true, response.error);
  await until(() => listener.peers[0]?.pids.length);
  const connector = listener.peers[0].pids[0];
  assert.deepEqual(owned, [{pid: connector, released: null}], 'owned from its spawn, not released while it lives');
  const {execFileSync} = process.getBuiltinModule('node:child_process');
  assert.match(execFileSync('/bin/ps', ['-o', 'command=', '-p', String(connector)]).toString(), / --disable-sigusr1 .*native-pipe-connector\.mjs /);
  relay.handle({id: 'x', op: 'close', connection_id: response.result.connection_id});
  assert.equal(await until(() => owned[0].released !== null), true);
  assert.deepEqual(owned[0].released, {aliveThen: false}, 'released after the connector has exited');
});

test('the connect budget includes the connector\'s synchronous start', async () => {
  const sent = [];
  const relay = nativePipeRelay({send: m => sent.push(m), connectTimeoutMs: 300, platform: 'darwin',
    realpath: () => Buffer.from(`/${'p'.repeat(140)}/s.sock`), stat: () => socketStat, openDirectory: () => ({dev: 1n, ino: 2n}),
    connectInDirectory: () => { const end = Date.now() + 400; while (Date.now() < end); return new SocketDouble(); }});
  relay.handle({id: 'c', op: 'connect', path: `/${'./'.repeat(80)}s.sock`});
  const returned = performance.now();
  await until(() => sent.length);
  assert.deepEqual(sent, [{type: 'native_pipe_response', id: 'c', ok: false, error: 'native pipe initial connect timed out'}]);
  assert.ok(performance.now() - returned < 150, 'the budget had already run out when the start returned');
  relay.closeAll();
});

test('macOS: a socket whose own name is longer than sun_path is refused with the vendor\'s sentence', darwinOnly, async t => {
  const {path: bound} = await longListener(t, scratch(t), 150);
  const path = join(bound, '..', 'n'.repeat(110));
  renameSync(bound, path);
  const sent = [];
  const relay = nativePipeRelay({send: m => sent.push(m), connectInDirectory: () => assert.fail('nothing connects')});
  relay.handle({id: 'c', op: 'connect', path});
  assert.deepEqual(sent, [{type: 'native_pipe_response', id: 'c', ok: false, error: 'failed to connect native pipe: native pipe file name is too long'}]);
});

test('Linux: a 192-byte canonical socket path is refused as the vendor\'s std refuses it, and nothing connects', {skip: process.platform !== 'linux' && 'std\'s SUN_LEN refusal is the Linux vendor\'s connect'}, async t => {
  const {path} = await longListener(t, scratch(t), 192);
  const sent = [];
  const relay = nativePipeRelay({send: m => sent.push(m), connect: () => assert.fail('nothing connects')});
  relay.handle({id: 'c', op: 'connect', path});
  assert.deepEqual(sent, [{type: 'native_pipe_response', id: 'c', ok: false, error: 'failed to connect native pipe: path must be shorter than SUN_LEN'}]);
});
