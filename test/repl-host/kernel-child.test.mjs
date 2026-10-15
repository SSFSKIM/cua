// The kernel child's plumbing: real pipes for its stdio (the Linux sandbox blocks Unix socket pairs), the stderr tail
// and exit status as the vendor's diagnostic words them (observed on the pinned node_repl, 2026-10-14).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exitDiagnostic, exitStatus, kernelPipes, killProcessTree, ownedGroupReaper, startKernelChild, stderrTail} from '../../src/repl-host/kernel-child.mjs';

test('the stderr tail keeps the last 20 non-empty lines, each cut to 512 characters, a trailing CR dropped', () => {
  const tail = stderrTail();
  for (let i = 0; i < 60; i++) tail.write(`line-${i}\n`);
  tail.write('\n\n  \n');
  tail.write(`${'z'.repeat(600)}\r\n  padded\tline  \r\npart`);
  const lines = tail.text().split(' | ');
  assert.equal(lines.length, 20);
  assert.deepEqual(lines.slice(-4), ['  ', 'z'.repeat(512), '  padded\tline  ', 'part']);
  assert.equal(lines[0], 'line-44');
  assert.equal(stderrTail().text(), '');
});

test('exit status and diagnostic in the vendor\'s words and key order', () => {
  assert.equal(exitStatus({code: 137, signal: null}), 'exited(code=137)');
  assert.equal(exitStatus({code: null, signal: 'SIGKILL'}), 'exited(signal=9)');
  assert.equal(exitStatus({code: null, signal: 'SIGTERM'}), 'exited(signal=15)');
  assert.equal(exitDiagnostic({pid: 5841, status: 'exited(code=73)', tail: 'fixture sandbox launcher refused'}),
    'node_repl kernel exited unexpectedly\n\nnode_repl diagnostics: {"kernel_pid":5841,"kernel_status":"exited(code=73)","kernel_stderr_tail":"fixture sandbox launcher refused","reason":"stdout_eof","stream_error":null}');
});

// The child's view of its stdio and one JSON line each way, with `options` for startKernelChild.
async function stdioSeen(options = {}) {
  const messages = [];
  let ended;
  const done = new Promise(resolve => { ended = resolve; });
  const script = 'const fs=require("fs");const kinds=[0,1,2].map(fd=>fs.fstatSync(fd).isFIFO()?"fifo":fs.fstatSync(fd).isSocket()?"socket":"other");'
    + 'process.stdin.once("data",d=>{process.stdout.write(JSON.stringify({kinds,echo:JSON.parse(String(d))})+"\\n");process.stderr.write("bye\\n");process.exit(3);});';
  const child = startKernelChild({command: process.execPath, args: ['-e', script], env: {PATH: '/usr/bin:/bin'}, cwd: process.cwd()},
    {onMessage: m => messages.push(m), onEnd: ended, ...options});
  assert.equal(child.send({ping: 1}), true);
  return {messages, ...await done};
}

test('real pipes (FIFOs) carry the kernel\'s JSON lines and stderr both ways', async () => {
  const {messages, expected, diagnostic} = await stdioSeen({pipes: kernelPipes});
  assert.deepEqual(messages, [{kinds: ['fifo', 'fifo', 'fifo'], echo: {ping: 1}}]);
  assert.equal(expected, false);
  assert.match(diagnostic, /"kernel_status":"exited\(code=3\)","kernel_stderr_tail":"bye"/);
});

test('the kernel gets real pipes on Linux, whose sandbox blocks socket pairs, and Node\'s own pipes on macOS', async () => {
  const {messages} = await stdioSeen();
  const kind = process.platform === 'linux' ? 'fifo' : 'socket';
  assert.deepEqual(messages[0].kinds, [kind, kind, kind]);
});

test('a process tree is frozen before it is killed, so a child started meanwhile is killed too', () => {
  const tree = {10: [11], 11: [12]};
  const signals = [];
  let listings = 0;
  const list = root => {
    listings++;
    const out = [];
    const walk = pid => { for (const c of tree[pid] ?? []) { out.push(c); walk(c); } };
    walk(root);
    if (listings === 1) tree[12] = [13];   // a fork lands after the first listing
    return out;
  };
  const killed = killProcessTree(10, {list, signal: (pid, name) => { signals.push([pid, name]); return true; }});
  assert.deepEqual(killed.sort(), [10, 11, 12, 13]);
  assert.deepEqual(signals.slice(0, 1), [[10, 'SIGSTOP']], 'the root is frozen before anything is listed');
  const kills = signals.filter(([, name]) => name === 'SIGKILL').map(([pid]) => pid);
  assert.deepEqual(kills.sort(), [10, 11, 12, 13]);
  assert.ok(signals.findIndex(([, n]) => n === 'SIGKILL') > signals.findLastIndex(([, n]) => n === 'SIGSTOP'), 'nothing is killed until the whole tree is frozen');
});

test('a launcher that cannot start is reported as the vendor reports a Node runtime that cannot start', async () => {
  let ended;
  const done = new Promise(resolve => { ended = resolve; });
  startKernelChild({command: '/nonexistent/launcher', args: [], env: {}, cwd: process.cwd()}, {onMessage: () => {}, onEnd: ended});
  assert.match((await done).diagnostic, /^failed to start Node runtime: spawn \/nonexistent\/launcher ENOENT/);
});

test('the owned-group reaper works only in a group an ancestor leads, takes every stray there and spares the host, the anchor, its own listing and every protected subtree', () => {
  // [pid, ppid, pgid, comm]: 100 anchor (leader), 200 supervisor, 210 its `ps` listing, 300 a stopped kernel launcher,
  // 400 a stray a dead kernel left (reparented to 1), 500 its child, 600 another group's process, 700 a worker the host
  // owns, 710 a helper it started, 720 that helper's child.
  const rows = [[100, 1, 100, 'node'], [200, 100, 100, 'node'], [210, 200, 100, '/bin/ps'], [300, 200, 100, 'codex'], [400, 1, 100, 'sh'], [500, 400, 100, 'sleep'],
    [600, 1, 600, 'other'], [700, 200, 100, 'node'], [710, 700, 100, 'sky_linux'], [720, 710, 100, 'helper']];
  const table = () => rows;
  assert.equal(ownedGroupReaper({self: 200, table: () => [[100, 1, 100, 'node'], [200, 100, 200, 'node']]}), null, 'leading its own group: never reaps');
  assert.equal(ownedGroupReaper({self: 200, table: () => [[50, 1, 50, 'other'], [100, 1, 100, 'node'], [200, 100, 50, 'node']]}), null, 'a group no ancestor leads: never reaps');
  assert.equal(ownedGroupReaper({self: 200, table: () => [[200, 100, 50, 'node']]}), null);
  const signals = [];
  const {reap, own} = ownedGroupReaper({self: 200, table, signal: (pid, name) => { signals.push([pid, name]); return true; }});
  const release = own(700);
  assert.deepEqual(reap().sort(), [300, 400, 500], 'the worker, its helper and the helper\'s child are spared');
  assert.deepEqual(signals.map(([, n]) => n), ['SIGSTOP', 'SIGSTOP', 'SIGSTOP', 'SIGKILL', 'SIGKILL', 'SIGKILL'], 'frozen before killed');
  release();
  assert.deepEqual(reap().sort(), [300, 400, 500, 700, 710, 720], 'released, the subtree is a stray like any other');
});

test('the owned-group reaper spares every ancestor between the anchor and the host, so a wrapper in that chain is never a stray', () => {
  // [pid, ppid, pgid, comm]: 100 anchor (leader), 150 a wrapper it started (a tap), 160 a second wrapper, 200 the
  // supervisor, 300 a stray a dead kernel left (reparented to 1), 400 the wrapper's unrelated child.
  const rows = [[100, 1, 100, 'node'], [150, 100, 100, 'node'], [160, 150, 100, 'sh'], [200, 160, 100, 'node'], [300, 1, 100, 'sleep'], [400, 150, 100, 'sleep']];
  const signals = [];
  const reaper = ownedGroupReaper({self: 200, table: () => rows, signal: (pid, name) => { signals.push([pid, name]); return true; }});
  assert.notEqual(reaper, null, 'a group led by a grandparent (through wrappers) is owned');
  assert.deepEqual(reaper.reap().sort(), [300, 400], 'the anchor and both wrappers are spared; strays elsewhere in the group are not');
  assert.ok(!signals.some(([pid]) => [100, 150, 160, 200].includes(pid)), 'no ancestor is ever signalled');
});
