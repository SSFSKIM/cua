// The peer identity addon and its policy (docs/doperpowers/specs/2026-10-09-maws-socket-peer-auth-design.md, M1;
// Acceptance 1 and 2). The addon cases drive the committed prebuild against real processes and a real socket and run on
// Apple silicon macOS only; the policy cases drive doubles of the addon and run everywhere.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {
  ANCESTRY_LIMIT, PEER_AUTH_VERSION, authorizePeer, descends, loadPeerAddon, peerAddonPath, rootOf, socketFd,
} from '../src/chrome/peer.mjs';
import {REPO, shortScratch} from './fixtures/runtime-fixture.mjs';

// The SHA-256 of native/peer-auth/peer-auth.c, pinned identically in MAWS's src/main/browser/cua/peer.test.ts: a change
// to the source in one repository fails here until both copies match again (native/peer-auth/README.md).
const PEER_AUTH_SOURCE_SHA256 = '5c94d2b4606c66a09b5011f29ce0d6915101fdc0533d01163957304af3c16483';

const uid = process.getuid();
const onAppleSilicon = process.platform === 'darwin' && process.arch === 'arm64';
const addonOnly = {skip: !onAppleSilicon && 'the peer identity addon is built for Apple silicon macOS only'};

function addon() {
  const loaded = loadPeerAddon(peerAddonPath());
  assert.ok(loaded, 'the committed prebuild loads');
  return loaded;
}

// A listening socket in a short scratch directory and a connector script that holds its connection until the server
// closes it (so an orphaned connector never outlives the test).
async function listening(t) {
  const s = shortScratch('cua-peer-');
  const path = join(s.dir, 's.sock');
  const connector = join(s.dir, 'connector.cjs');
  writeFileSync(connector, "const s = require('node:net').connect(process.argv[2]); s.on('close', () => process.exit(0)); s.on('error', () => process.exit(1)); setTimeout(() => process.exit(2), 20000);\n");
  const waiting = [];
  const sockets = [];
  const server = createServer({pauseOnConnect: true}, socket => { sockets.push(socket); waiting.shift()?.(socket); });
  await new Promise(resolve => server.listen(path, resolve));
  t.after(() => { for (const socket of sockets) socket.destroy(); server.close(); s.cleanup(); });
  return {path, connector, accepted: () => new Promise(resolve => waiting.push(resolve))};
}

function child(t, command, args) {
  const spawned = spawn(command, args, {stdio: 'ignore'});
  t.after(() => spawned.kill());
  return spawned;
}

test('the addon reports a connecting child: its pid and our uid, its parent and a stable start; it descends from the test process', addonOnly, async t => {
  const peerAuth = addon();
  const {path, connector, accepted} = await listening(t);
  const connecting = child(t, process.execPath, [connector, path]);
  const socket = await accepted();
  const fd = socketFd(socket);
  assert.equal(typeof fd, 'number');
  assert.deepEqual(peerAuth.peer(fd), {pid: connecting.pid, uid});
  const first = peerAuth.process(connecting.pid);
  assert.equal(first.ppid, process.pid);
  assert.equal(peerAuth.process(connecting.pid).start, first.start);
  const root = rootOf(process.pid, peerAuth);
  assert.equal(root.pid, process.pid);
  assert.equal(descends(connecting.pid, [root], peerAuth.process), true);
  assert.equal(authorizePeer(fd, [root], {addon: peerAuth, now: Date.now(), uid}), null);
});

test('the addon reports a connector reparented to launchd, which does not descend from the test process', addonOnly, async t => {
  const peerAuth = addon();
  const {path, connector, accepted} = await listening(t);
  const orphaning = child(t, '/bin/sh', ['-c', `("${process.execPath}" "${connector}" "${path}" &)`]);
  const socket = await accepted();
  const {pid} = peerAuth.peer(socketFd(socket));
  assert.notEqual(pid, orphaning.pid);
  assert.equal(peerAuth.process(pid).ppid, 1);
  const root = rootOf(process.pid, peerAuth);
  assert.equal(descends(pid, [root], peerAuth.process), false);
  assert.deepEqual(authorizePeer(socketFd(socket), [root], {addon: peerAuth, now: Date.now(), uid}), {reason: 'not_descendant', pid});
});

test('the addon reads an exited process as null', addonOnly, () => {
  const exited = spawnSync('/usr/bin/true');
  assert.equal(exited.status, 0);
  assert.equal(addon().process(exited.pid), null);
  assert.equal(rootOf(exited.pid, addon()), null);
});

test('the addon throws a plain Error carrying the system error when the descriptor is not a socket', addonOnly, () => {
  assert.throws(() => addon().peer(0x7fff), /getsockopt\(LOCAL_PEERPID\): Bad file descriptor/);
  assert.throws(() => addon().peer('3'), TypeError);
});

test('the committed prebuild is the version the loader pins', addonOnly, () => {
  assert.equal(addon().version, PEER_AUTH_VERSION);
});

test('the addon\'s source is the one both repositories carry', () => {
  const source = readFileSync(join(REPO, 'native', 'peer-auth', 'peer-auth.c'));
  assert.equal(createHash('sha256').update(source).digest('hex'), PEER_AUTH_SOURCE_SHA256);
});

test('the loader finds the prebuild under the package root, and reports unavailable for a missing file or off Apple silicon macOS without trying', () => {
  const real = peerAddonPath();
  assert.equal(real, join(REPO, 'native', 'peer-auth', 'prebuilds', 'darwin-arm64', 'peer-auth.node'));
  assert.equal(loadPeerAddon(join(REPO, 'native', 'peer-auth', 'missing.node'), {platform: 'darwin', arch: 'arm64'}), null);
  assert.equal(loadPeerAddon(real, {platform: 'linux', arch: 'arm64'}), null);
  assert.equal(loadPeerAddon(real, {platform: 'darwin', arch: 'x64'}), null);
});

// A process table of doubles: pid → {ppid, start}; `peerPids` answers successive peer() reads.
function fakeAddon(table, peerPids, peerUid = uid) {
  const fake = {
    reads: 0,
    version: PEER_AUTH_VERSION,
    peer(fd) {
      if (fd !== 7) throw new Error('getsockopt(LOCAL_PEERPID): Bad file descriptor');
      const pid = peerPids[Math.min(fake.reads, peerPids.length - 1)];
      fake.reads += 1;
      return {pid, uid: peerUid};
    },
    process: pid => table[pid] ?? null,
  };
  return fake;
}

// A chain of `length` processes from the peer (pid 1000) up to the root (pid 1000 + length - 1), under launchd.
function chain(length) {
  const table = {};
  for (let i = 0; i < length; i += 1) table[1000 + i] = {ppid: i === length - 1 ? 1 : 1001 + i, start: 1000 - i};
  return table;
}

const ACCEPT = 6; // ms since the epoch; every start in the tables is earlier (in µs)
const table = {100: {ppid: 50, start: 400}, 50: {ppid: 10, start: 300}, 10: {ppid: 1, start: 200}, 60: {ppid: 1, start: 250}};
const root = {pid: 10, start: 200};

test('the policy accepts a descendant of a live root, the root process itself, and a descendant of any root of the list', () => {
  assert.equal(authorizePeer(7, [root], {addon: fakeAddon(table, [100]), now: ACCEPT, uid}), null);
  assert.equal(authorizePeer(7, [root], {addon: fakeAddon(table, [10]), now: ACCEPT, uid}), null);
  assert.equal(authorizePeer(7, [{pid: 60, start: 250}, root], {addon: fakeAddon(table, [100]), now: ACCEPT, uid}), null);
});

test('the policy refuses for the first of the five reasons, in order', () => {
  const stranger = fakeAddon(table, [60], uid + 1);
  assert.deepEqual(authorizePeer(undefined, [], {addon: null, now: ACCEPT, uid}), {reason: 'module_unavailable', pid: null});
  assert.deepEqual(authorizePeer(undefined, [], {addon: stranger, now: ACCEPT, uid}), {reason: 'peer_unavailable', pid: null});
  assert.deepEqual(authorizePeer(8, [], {addon: stranger, now: ACCEPT, uid}), {reason: 'peer_unavailable', pid: null});
  assert.deepEqual(authorizePeer(7, [], {addon: stranger, now: ACCEPT, uid}), {reason: 'uid_mismatch', pid: 60});
  assert.deepEqual(authorizePeer(7, [], {addon: fakeAddon(table, [60]), now: ACCEPT, uid}), {reason: 'no_root', pid: 60});
  assert.deepEqual(authorizePeer(7, [root], {addon: fakeAddon(table, [60]), now: ACCEPT, uid}), {reason: 'not_descendant', pid: 60});
});

test('the policy matches nothing to a dead root (its pid now names a process with another start)', () => {
  const dead = {pid: 10, start: 199};
  assert.equal(descends(100, [dead], pid => table[pid] ?? null), false);
  assert.deepEqual(authorizePeer(7, [dead], {addon: fakeAddon(table, [100]), now: ACCEPT, uid}), {reason: 'no_root', pid: 100});
  assert.deepEqual(authorizePeer(7, [dead, {pid: 60, start: 250}], {addon: fakeAddon(table, [100]), now: ACCEPT, uid}), {reason: 'not_descendant', pid: 100});
});

test('the policy refuses when the peer pid read again after the walk has changed (the descriptor moved)', () => {
  const moved = fakeAddon(table, [100, 60]);
  assert.deepEqual(authorizePeer(7, [root], {addon: moved, now: ACCEPT, uid}), {reason: 'not_descendant', pid: 100});
  assert.equal(moved.reads, 2);
});

test('the policy refuses a peer whose process started after the accept (the connector is gone and its pid reused)', () => {
  const reused = {...table, 100: {ppid: 50, start: ACCEPT * 1000 + 1}};
  assert.deepEqual(authorizePeer(7, [root], {addon: fakeAddon(reused, [100]), now: ACCEPT, uid}), {reason: 'not_descendant', pid: 100});
  const atAccept = {...table, 100: {ppid: 50, start: ACCEPT * 1000}};
  assert.equal(authorizePeer(7, [root], {addon: fakeAddon(atAccept, [100]), now: ACCEPT, uid}), null);
});

test('the policy refuses a peer that exits during the walk', () => {
  const {100: gone, ...rest} = table;
  assert.ok(gone);
  assert.deepEqual(authorizePeer(7, [root], {addon: fakeAddon(rest, [100]), now: ACCEPT, uid}), {reason: 'not_descendant', pid: 100});
});

test(`the policy walks at most ${ANCESTRY_LIMIT} steps: a root 64 parents up is met, 65 is not`, () => {
  assert.equal(ANCESTRY_LIMIT, 64);
  const near = chain(65); // the peer and 64 ancestors: the root is 64 steps up
  assert.equal(descends(1000, [{pid: 1064, start: near[1064].start}], pid => near[pid] ?? null), true);
  const far = chain(66); // the root is 65 steps up
  assert.equal(descends(1000, [{pid: 1065, start: far[1065].start}], pid => far[pid] ?? null), false);
  assert.deepEqual(authorizePeer(7, [{pid: 1065, start: far[1065].start}], {addon: fakeAddon(far, [1000]), now: ACCEPT, uid}), {reason: 'not_descendant', pid: 1000});
});

test('the policy stops at launchd and the kernel, never matching them as roots', () => {
  const lookup = pid => ({0: {ppid: 0, start: 1}, 1: {ppid: 0, start: 2}, 5: {ppid: 1, start: 3}})[pid] ?? null;
  assert.equal(descends(5, [{pid: 1, start: 2}], lookup), false);
  assert.equal(descends(5, [{pid: 0, start: 1}], lookup), false);
});
