// The kernel child's plumbing: real pipes for its stdio (the Linux sandbox blocks Unix socket pairs), the stderr tail
// and exit status as the vendor's diagnostic words them (observed on the pinned node_repl, 2026-10-14).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ENGINE_EXIT_WAIT_MS, exitDiagnostic, exitStatus, kernelPipes, killProcessTree, ownedGroupReaper, processExited, runsExecutable, startKernelChild, stderrTail, stopProcessTree} from '../../src/repl-host/kernel-child.mjs';

// python3's real path, or null where there is none.
function pythonPath() {
  try { return realpathSync(execFileSync('sh', ['-c', 'command -v python3'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim()); } catch { return null; }
}

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

// A tree for stopProcessTree: 10 the sandbox launcher, 11 the trusted worker, 12 cua-engine, 13 a process the worker named
// cua-engine (another executable), 14 a program the engine started.
function engineTree() {
  const tree = {10: [11], 11: [12, 13], 12: [14]};
  const signals = [];
  let listings = 0;
  let exitPolls = 0;
  const list = root => {
    listings++;
    signals.push([root, 'list']);
    const out = [];
    const walk = pid => { for (const c of tree[pid] ?? []) { out.push(c); walk(c); } };
    walk(root);
    return out;
  };
  const signal = (pid, name) => { signals.push([pid, name]); return true; };
  return {signals, list, signal, isEngine: (pid, path) => pid === 12 && path === '/opt/cua/engine/linux/cua-engine', get listings() { return listings; }, get exitPolls() { return exitPolls; },
    exitedAfter: polls => pid => { assert.equal(pid, 12, 'only the engine is waited for'); return ++exitPolls > polls; }};
}

test('a stop lets the engine alone drain: the tree frozen, then SIGTERM and SIGCONT to the engine only, then SIGKILL to every process frozen at the start once it exited', async () => {
  const t = engineTree();
  const killed = await stopProcessTree(10, {engine: '/opt/cua/engine/linux/cua-engine', list: t.list, signal: t.signal, isEngine: t.isEngine, exited: t.exitedAfter(3), wait: async () => {}});
  assert.deepEqual(killed.sort(), [10, 11, 12, 13, 14]);
  const named = name => t.signals.filter(([, n]) => n === name).map(([pid]) => pid);
  assert.deepEqual(named('SIGTERM'), [12], 'the engine, found by its executable, never the process merely named for it');
  assert.deepEqual(named('SIGCONT'), [12], 'nothing else is thawed');
  const at = (pid, name) => t.signals.findIndex(([p, n]) => p === pid && n === name);
  assert.ok(at(12, 'SIGTERM') > t.signals.findLastIndex(([, n]) => n === 'SIGSTOP'), 'the engine is told only once the whole tree is frozen');
  assert.ok(at(12, 'SIGTERM') < at(12, 'SIGCONT'), 'SIGTERM first, so it is pending when the engine runs again');
  assert.ok(t.signals.findLastIndex(([, n]) => n === 'list') < at(12, 'SIGTERM'), 'nothing is listed after the freeze');
  assert.equal(t.exitPolls, 4, 'the kill waited for the engine\'s exit');
  assert.deepEqual(named('SIGKILL')[0], 12, 'the engine first, while its frozen parent still holds its pid');
  assert.deepEqual(named('SIGKILL').sort(), [10, 11, 12, 13, 14], 'what the engine started is killed too, though it was reparented when the engine exited');
});

test('an engine that does not exit within the wait is killed with the rest', async () => {
  const t = engineTree();
  const started = Date.now();
  const killed = await stopProcessTree(10, {engine: '/opt/cua/engine/linux/cua-engine', list: t.list, signal: t.signal, isEngine: t.isEngine, exited: () => false, waitMs: 60});
  assert.ok(Date.now() - started >= 60);
  assert.deepEqual(killed.sort(), [10, 11, 12, 13, 14]);
  assert.deepEqual(t.signals.filter(([, n]) => n === 'SIGKILL').map(([pid]) => pid).sort(), [10, 11, 12, 13, 14]);
});

test('a tree with no engine in it is killed at once, with nothing thawed', async () => {
  const t = engineTree();
  const started = Date.now();
  await stopProcessTree(10, {engine: '/opt/cua/engine/linux/cua-engine', list: t.list, signal: t.signal, isEngine: () => false, exited: () => assert.fail('nothing to wait for'), waitMs: 5000});
  assert.ok(Date.now() - started < 1000);
  assert.deepEqual(t.signals.filter(([, n]) => n === 'SIGTERM' || n === 'SIGCONT'), []);
  assert.deepEqual(t.signals.filter(([, n]) => n === 'SIGKILL').map(([pid]) => pid).sort(), [10, 11, 12, 13, 14]);
});

const linuxOnly = {skip: process.platform !== 'linux' && 'reads /proc'};

test('the engine is the process running its executable, not one that only carries its name', linuxOnly, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'cua-engine-exe-'));
  const sleep = realpathSync(execFileSync('sh', ['-c', 'command -v sleep'], {encoding: 'utf8'}).trim());
  const decoyPath = join(dir, 'cua-engine');
  copyFileSync(sleep, decoyPath);
  chmodSync(decoyPath, 0o755);
  const linked = join(dir, 'linked');
  symlinkSync(sleep, linked);
  const real = spawn(linked, ['30'], {stdio: 'ignore'});
  const decoy = spawn(decoyPath, ['30'], {stdio: 'ignore'});
  t.after(() => { real.kill('SIGKILL'); decoy.kill('SIGKILL'); rmSync(dir, {recursive: true, force: true}); });
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(readFileSync(`/proc/${decoy.pid}/comm`, 'utf8').trim(), 'cua-engine');
  assert.equal(runsExecutable(real.pid, sleep), true, 'started through a link, it runs the file itself');
  assert.equal(runsExecutable(decoy.pid, sleep), false, 'a copy is another executable');
  assert.equal(runsExecutable(decoy.pid, decoyPath), true);
  assert.equal(runsExecutable(real.pid, decoyPath), false);
  assert.equal(processExited(real.pid), false);
  real.kill('SIGKILL');
  await new Promise(resolve => real.once('exit', resolve));
  assert.equal(processExited(real.pid), true, 'reaped');
});

// The worker double: starts the engine double (python3, which takes SIGTERM and drains for 300 ms before it exits),
// never reads its output, and notes if it ever sees the engine's exit; beside it, a process named cua-engine.
const WORKER = `import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
const [dir, python, decoy] = process.argv.slice(2);
const engine = spawn(python, [join(dir, 'engine.py'), dir], {stdio: ['pipe', 'pipe', 'ignore']});
engine.on('exit', () => writeFileSync(join(dir, 'worker-saw-exit'), ''));
const named = spawn(decoy, ['30'], {stdio: 'ignore'});
writeFileSync(join(dir, 'pids.json'), JSON.stringify({engine: engine.pid, decoy: named.pid}));
setInterval(() => {}, 1000);
`;
const ENGINE = `import os, signal, subprocess, sys, time
d = sys.argv[1]
child = subprocess.Popen(['sleep', '30'])
def stop(sig, frame):
    time.sleep(0.3)
    open(os.path.join(d, 'drained'), 'w').write('')
    os._exit(143)
signal.signal(signal.SIGTERM, stop)
open(os.path.join(d, 'engine.json'), 'w').write(str(child.pid))
while True:
    signal.pause()
`;

test('a stop of a real tree lets its engine drain while the worker stays frozen, then kills everything it froze', {skip: linuxOnly.skip || (!pythonPath() && 'needs python3')}, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'cua-engine-stop-'));
  writeFileSync(join(dir, 'worker.mjs'), WORKER);
  writeFileSync(join(dir, 'engine.py'), ENGINE);
  const decoy = join(dir, 'cua-engine');
  copyFileSync(realpathSync(execFileSync('sh', ['-c', 'command -v sleep'], {encoding: 'utf8'}).trim()), decoy);
  chmodSync(decoy, 0o755);
  const python = pythonPath();
  let ended = null;
  const child = startKernelChild({command: process.execPath, args: [join(dir, 'worker.mjs'), dir, python, decoy], env: {PATH: process.env.PATH}, cwd: dir},
    {onMessage: () => {}, onEnd: e => { ended = e; }, lifelines: null, engine: python});
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  for (let i = 0; i < 200 && !(existsSync(join(dir, 'pids.json')) && existsSync(join(dir, 'engine.json'))); i++) await new Promise(resolve => setTimeout(resolve, 25));
  const {engine, decoy: named} = JSON.parse(readFileSync(join(dir, 'pids.json'), 'utf8'));
  const engineChild = Number(readFileSync(join(dir, 'engine.json'), 'utf8'));
  const started = Date.now();
  await child.stop();
  const took = Date.now() - started;
  assert.ok(existsSync(join(dir, 'drained')), 'the engine ran its orderly exit');
  assert.ok(took >= 300, `the stop waited for it: ${took} ms`);
  assert.ok(took < ENGINE_EXIT_WAIT_MS, `and no longer than it took: ${took} ms`);
  assert.ok(!existsSync(join(dir, 'worker-saw-exit')), 'the worker never ran again: frozen through the drain, then killed');
  assert.equal(ended?.expected, true);
  for (let i = 0; i < 100 && ![child.pid, engine, named, engineChild].every(processExited); i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual([child.pid, engine, named, engineChild].map(processExited), [true, true, true, true], 'the worker, the engine, the process named for it and what the engine started');
});

test('a second stop while the engine drains waits for the first, and the tree is stopped once', linuxOnly, async () => {
  let calls = 0;
  let release;
  const stopTree = root => { calls++; return new Promise(resolve => { release = () => resolve(killProcessTree(root)); }); };
  const child = startKernelChild({command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], env: {}, cwd: process.cwd()},
    {onMessage: () => {}, onEnd: () => {}, lifelines: null, engine: '/opt/cua/engine/linux/cua-engine', stopTree});
  await new Promise(resolve => setTimeout(resolve, 100));
  const first = child.stop();
  const second = child.stop();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(calls, 1);
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(child.ended, true);
});

test('without an engine (a kernel, and every child on macOS) a stop kills the tree at once, as before', async () => {
  const child = startKernelChild({command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], env: {}, cwd: process.cwd()},
    {onMessage: () => {}, onEnd: () => {}, lifelines: null, stopTree: () => assert.fail('no engine: nothing waits for a drain')});
  await new Promise(resolve => setTimeout(resolve, 100));
  const started = Date.now();
  await child.stop();
  assert.ok(Date.now() - started < 1000, `${Date.now() - started} ms`);
  assert.equal(child.ended, true);
  assert.equal(processExited(child.pid), true);
});

test('a launcher that cannot start is reported as the vendor reports a Node runtime that cannot start', async () => {
  let ended;
  const done = new Promise(resolve => { ended = resolve; });
  startKernelChild({command: '/nonexistent/launcher', args: [], env: {}, cwd: process.cwd()}, {onMessage: () => {}, onEnd: ended});
  assert.match((await done).diagnostic, /^failed to start Node runtime: spawn \/nonexistent\/launcher ENOENT/);
});

test('the owned-group reaper works only in a group an ancestor leads, takes every stray there and spares the host, the anchor, its own listing and every protected subtree', async () => {
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
  assert.deepEqual((await reap()).sort(), [300, 400, 500], 'the worker, its helper and the helper\'s child are spared');
  assert.deepEqual(signals.map(([, n]) => n), ['SIGSTOP', 'SIGSTOP', 'SIGSTOP', 'SIGKILL', 'SIGKILL', 'SIGKILL'], 'frozen before killed');
  release();
  assert.deepEqual((await reap()).sort(), [300, 400, 500, 700, 710, 720], 'released, the subtree is a stray like any other');
});

test('a reap after the trusted worker\'s own end lets the engine it left drain first, as a stop does, and thaws nothing else', async () => {
  // [pid, ppid, pgid, comm]: 100 anchor, 200 supervisor, 400 the engine a worker that exited left (reparented to 1, with
  // the sandbox disabled it stays in the owned group), 410 a program the engine started, 500 another stray
  const rows = [[100, 1, 100, 'node'], [200, 100, 100, 'node'], [400, 1, 100, 'cua-engine'], [410, 400, 100, 'yad'], [500, 1, 100, 'sleep']];
  const signals = [];
  let polls = 0;
  const reaper = ownedGroupReaper({self: 200, table: () => rows, signal: (pid, name) => { signals.push([pid, name]); return true; },
    isEngine: (pid, path) => pid === 400 && path === '/opt/cua/engine/linux/cua-engine', exited: pid => { assert.equal(pid, 400); return ++polls > 2; }, wait: async () => {}});
  assert.deepEqual((await reaper.reap({engine: '/opt/cua/engine/linux/cua-engine'})).sort(), [400, 410, 500]);
  const named = name => signals.filter(([, n]) => n === name).map(([pid]) => pid);
  assert.deepEqual(named('SIGTERM'), [400], 'only the engine, found by its executable, is told to stop');
  assert.deepEqual(named('SIGCONT'), [400], 'and only it is thawed');
  assert.ok(signals.findIndex(([, n]) => n === 'SIGTERM') > signals.findLastIndex(([, n]) => n === 'SIGSTOP'), 'once every stray is frozen');
  assert.equal(polls, 3, 'the kill waited for its exit');
  assert.deepEqual(named('SIGKILL').sort(), [400, 410, 500], 'then every stray it froze, what the engine started included');
  signals.length = 0;
  assert.deepEqual((await reaper.reap()).sort(), [400, 410, 500]);
  assert.deepEqual(named('SIGTERM'), [], 'a kernel\'s reap names no engine: nothing waits');
});

test('holding a launcher stops it alone, so a signal to it waits there, while what it runs goes on', linuxOnly, async t => {
  // the launcher double does what codex-linux-sandbox does with SIGTERM: it ends what it runs at once (bwrap's
  // --die-with-parent ends the PID namespace) and exits by the signal; its child stands for the worker's engine
  const launcher = `const {spawn} = require('node:child_process');
const engine = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {stdio: 'ignore'});
require('node:fs').writeFileSync(process.argv[1], String(engine.pid));
process.on('SIGTERM', () => { engine.kill('SIGKILL'); process.kill(process.pid, 'SIGKILL'); });
setInterval(() => {}, 1000);`;
  const dir = mkdtempSync(join(tmpdir(), 'cua-hold-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const run = async hold => {
    const pidFile = join(dir, `engine-${hold}`);
    const child = startKernelChild({command: process.execPath, args: ['-e', launcher, pidFile], env: {PATH: process.env.PATH}, cwd: dir},
      {onMessage: () => {}, onEnd: () => {}, lifelines: null});
    t.after(() => child.stop());
    for (let i = 0; i < 200 && !existsSync(pidFile); i++) await new Promise(resolve => setTimeout(resolve, 25));
    const engine = Number(readFileSync(pidFile, 'utf8'));
    if (hold) child.holdLauncher();
    await new Promise(resolve => setTimeout(resolve, 50));
    process.kill(child.pid, 'SIGTERM');   // the owned group's SIGTERM at upstream's by(0.4)
    await new Promise(resolve => setTimeout(resolve, 200));
    const state = () => { try { return readFileSync(`/proc/${child.pid}/stat`, 'utf8').replace(/^.*\) /, '')[0]; } catch { return 'gone'; } };
    const outcome = {launcher: ['Z', 'gone'].includes(state()) ? 'exited' : state(), engineAlive: !processExited(engine)};
    await child.stop();
    assert.equal(processExited(engine), true);
    return outcome;
  };
  assert.deepEqual(await run(false), {launcher: 'exited', engineAlive: false}, 'the control: unheld, the launcher takes the engine down at once');
  assert.deepEqual(await run(true), {launcher: 'T', engineAlive: true}, 'held, the signal waits and the engine runs on for the stop');
});

test('the owned-group reaper spares every ancestor between the anchor and the host, so a wrapper in that chain is never a stray', async () => {
  // [pid, ppid, pgid, comm]: 100 anchor (leader), 150 a wrapper it started (a tap), 160 a second wrapper, 200 the
  // supervisor, 300 a stray a dead kernel left (reparented to 1), 400 the wrapper's unrelated child.
  const rows = [[100, 1, 100, 'node'], [150, 100, 100, 'node'], [160, 150, 100, 'sh'], [200, 160, 100, 'node'], [300, 1, 100, 'sleep'], [400, 150, 100, 'sleep']];
  const signals = [];
  const reaper = ownedGroupReaper({self: 200, table: () => rows, signal: (pid, name) => { signals.push([pid, name]); return true; }});
  assert.notEqual(reaper, null, 'a group led by a grandparent (through wrappers) is owned');
  assert.deepEqual((await reaper.reap()).sort(), [300, 400], 'the anchor and both wrappers are spared; strays elsewhere in the group are not');
  assert.ok(!signals.some(([pid]) => [100, 150, 160, 200].includes(pid)), 'no ancestor is ever signalled');
});
