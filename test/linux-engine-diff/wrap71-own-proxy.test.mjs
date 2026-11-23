// #171 M5, task 91, the design session's ruling 773: the `:0` guard (M5's wrap71.py) counts a run process's
// connection to the socket of the run's own audit proxy that ss shows no server pid for, as task 71 counts the step's
// own session bus, and only when the proxy is recorded and alive: an xtrace in the run's tree whose `-D :<N>` names
// `/tmp/.X11-unix/X<N>`, alive at that check. V5's first attempt and F3's V3 were stopped by exactly that row
// (`outside-peer-connection` to /tmp/.X11-unix/X40, `peer_pids: []`, while the run's xtrace -D :40 was alive).
//
// Fix wave 1: the proxy must own the socket. In the same ss snapshot every listener at exactly that path is the recorded
// proxy's pid, so a foreign listener at the path, an ownerless one or a listener left from an earlier proxy on the
// display flags; and the process is read stat, cmdline, stat, so a pid reused between the reads never lends its argv.
//
// Display-free and socket-free: the guard runs in private mode around a driver that stands for the run, and reads its
// socket table from a stand-in `ss` first on its PATH, which prints the table the driver writes: the driver's own
// connection; at its other end a socket named for the proxy's path with no pid, the stopped runs' row; and the listening
// sockets at that path, each with the owners the spec names. The proxy is a real stand-in process named xtrace (its
// kernel name, as the real one's), in the run's tree or outside it. Nothing listens on /tmp/.X11-unix and no display is
// reached.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

const WRAP71 = new URL('../../docs/evidence/2026-10-28-own-linux-engine/m5/guards/wrap71.py', import.meta.url).pathname;
const SOCKET = '/tmp/.X11-unix/X740';
const linux = process.platform === 'linux';
// the interpreter the guard runs on, for the proxy stand-in's first line
const PYTHON = linux ? spawnSync('python3', ['-I', '-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' }).stdout.trim() : null;

// the proxy stand-in: runs until it is ended, its argv the real proxy's shape (audit.mjs: xtrace … -D :<N> …). Python,
// since its kernel name stays the file's (xtrace), as the real proxy's does; Node renames its thread MainThread
const FAKE_XTRACE = (python) => `#!${python} -I
import time
time.sleep(60)
`;
// the socket table: what the driver wrote, or the header alone; each read is counted once it is done
const FAKE_SS = `#!/bin/sh
cat "$FAKE_SS_TABLE" 2>/dev/null || echo 'Netid State Recv-Q Send-Q Local Address:Port Peer Address:Port Process'
echo read >> "$FAKE_SS_TABLE.reads"
`;
// the run: starts the proxy as the spec says, lets the guard's samples record it, ends it (reaped, or left a zombie
// under a parent that never waits) when asked, then holds its connection in the table for a few socket samples. On
// its end it takes the connection out of the table and ends the proxy only after two more reads, so no check that read
// the table is still judging the proxy; on its end or the guard's stop it ends what it started and waits until each is
// gone (the guard reaps the orphans)
const DRIVER = `
import { spawn } from 'node:child_process';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
const spec = JSON.parse(process.argv[2]);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const state = (pid) => { try { const s = readFileSync('/proc/' + pid + '/stat', 'utf8'); return s[s.lastIndexOf(')') + 2]; } catch { return null; } };
const comm = (pid) => { try { return readFileSync('/proc/' + pid + '/comm', 'utf8').trim(); } catch { return null; } };
const started = [];
const finish = async (code) => {
  for (const pid of started) try { process.kill(pid, 'SIGKILL'); } catch {}
  for (let i = 0; i < 100 && started.some((pid) => state(pid) !== null); i++) await sleep(20);
  process.exit(code);
};
process.on('SIGTERM', () => finish(143));
let proxy = null;
let earlier = null;
if (spec.proxy && spec.end === 'zombie') {
  // a parent that never waits: the proxy, once killed, stays a zombie in the run's tree
  const parent = spawn('sh', ['-c', '"$@" & echo $! > "$PIDFILE"; exec sleep 30', 'sh', ...spec.proxy], { stdio: 'ignore', env: { ...process.env, PIDFILE: spec.dir + '/proxy.pid' } });
  started.push(parent.pid);
  while (!proxy) { await sleep(20); try { proxy = Number(readFileSync(spec.dir + '/proxy.pid', 'utf8')) || null; } catch {} }
} else if (spec.proxy && spec.late) {
  // the proxy's process recorded before its exec: a shell first for longer than a sample takes (its argv names no
  // display), then the stand-in
  proxy = spawn('sh', ['-c', 'sleep 1.5; exec "$0" -D "$SHOWN"', spec.proxy[0]], { stdio: 'ignore', env: { ...process.env, SHOWN: spec.proxy.at(-1) } }).pid;
  writeFileSync(spec.dir + '/proxy.pid', String(proxy));
} else if (spec.proxy) {
  if (spec.reuse) {
    // an earlier proxy on the same display, recorded and then ended, before the one alive now
    earlier = spawn(spec.proxy[0], spec.proxy.slice(1), { stdio: 'ignore' });
    await sleep(800);
    earlier.kill('SIGKILL');
    while (state(earlier.pid) !== null) await sleep(20);
  }
  proxy = spawn(spec.proxy[0], spec.proxy.slice(1), { stdio: 'ignore' }).pid;
  writeFileSync(spec.dir + '/proxy.pid', String(proxy));
}
if (proxy) started.push(proxy);
await sleep(800);
// a proxy that execs late is shown only once it has
while (spec.late && comm(proxy) !== 'xtrace') await sleep(20);
if (spec.end) {
  process.kill(proxy, 'SIGKILL');
  const gone = spec.end === 'zombie' ? (s) => s === 'Z' : (s) => s === null;
  while (!gone(state(proxy))) await sleep(20);
}
const table = spec.dir + '/ss.txt';
// each listener row's owners, by name: the proxy (or the one outside the run), the driver, the earlier proxy
const owner = { proxy: spec.outsidePid ?? proxy, driver: process.pid, earlier: earlier?.pid };
const users = (names) => names.length ? ' users:(' + names.map((n) => '("x",pid=' + owner[n] + ',fd=3)').join(',') + ')' : '';
writeFileSync(table + '.new', [
  'Netid State Recv-Q Send-Q Local Address:Port Peer Address:Port Process',
  'u_str ESTAB 0 0 * 7400001 * 7400002 users:(("node",pid=' + process.pid + ',fd=40))',
  'u_str ESTAB 0 0 ' + spec.peer + ' 7400002 * 7400001',
  ...spec.listen.map((names, i) => 'u_str LISTEN 0 4 ' + spec.peer + ' ' + (7400100 + i) + ' * 0' + users(names)),
].join('\\n') + '\\n');
renameSync(table + '.new', table);
await sleep(2500);
rmSync(table, { force: true });
// checks run one at a time: once a read has finished after the one under way, every check of the table is done
const reads = () => { try { return readFileSync(table + '.reads', 'utf8').split('\\n').length - 1; } catch { return 0; } };
const seen = reads();
while (reads() < seen + 2) await sleep(20);
await finish(0);
`;
/**
 * wrap71.py in private mode around the driver, in a fresh directory: the run's proxy started from `proxy` (an argv
 * tail for the stand-in), or an `outside` one the test starts beside the guard, `end` the proxy's end before the
 * connection shows (`reaped`, `zombie`), `peer` the path the table names. Its exit, summary, counted rows and proxy pid.
 */
async function guard({ proxy = null, outside = null, end = null, late = false, reuse = false, listen = [['proxy']], peer = SOCKET, named = 'xtrace' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-guard-'));
  let stranger = null;
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    mkdirSync(join(dir, 'tmp'));
    writeFileSync(join(bin, 'ss'), FAKE_SS);
    writeFileSync(join(bin, named), FAKE_XTRACE(PYTHON));
    writeFileSync(join(dir, 'driver.mjs'), DRIVER);
    chmodSync(join(bin, 'ss'), 0o755);
    chmodSync(join(bin, named), 0o755);
    if (outside) stranger = spawn(join(bin, named), outside, { stdio: 'ignore' });
    const spec = { dir, peer, end, late, reuse, listen, outsidePid: stranger?.pid, proxy: proxy && [join(bin, named), ...proxy] };
    const run = spawn('python3', ['-I', WRAP71, join(dir, 'out'), join(dir, 'tmp'), 'private', process.execPath, join(dir, 'driver.mjs'), JSON.stringify(spec)], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_SS_TABLE: join(dir, 'ss.txt') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let said = '';
    run.stdout.on('data', (d) => { said += d; });
    run.stderr.on('data', (d) => { said += d; });
    const code = await new Promise((done) => run.once('exit', done));
    const read = (name) => readFileSync(join(dir, 'out', name), 'utf8');
    assert.ok(existsSync(join(dir, 'out', 'wrap-summary.json')), `no summary: ${said}`);
    const counted = existsSync(join(dir, 'out', 'counted.jsonl')) ? read('counted.jsonl').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    const pidFile = join(dir, 'proxy.pid');
    return { code, said, summary: JSON.parse(read('wrap-summary.json')), counted, proxyPid: existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8')) : stranger?.pid };
  } finally {
    stranger?.kill('SIGKILL');
    rmSync(dir, { recursive: true, force: true });
  }
}

const peerFlags = (summary, peer = SOCKET) => summary.flags.filter((f) => f.kind === 'outside-peer-connection' && f.peer_path === peer && f.peer_pids.length === 0);
const ownProxyRows = (counted) => counted.filter((r) => r.kind === 'own-audit-proxy-not-accepted');

describe("wrap71's rule for the run's own audit proxy (ruling 773)", { concurrency: true, skip: !linux && 'Linux only (/proc, the subreaper)' }, () => {
  it("counts a not-yet-accepted connection to the live recorded proxy's socket, and flags nothing", async () => {
    const r = await guard({ proxy: ['-k', '-m', '256', '-d', ':739', '-D', ':740', '-c', '-o', '/dev/null'] });
    assert.deepEqual(r.summary.flags, [], r.said);
    assert.equal(r.code, 0, r.said);
    const rows = ownProxyRows(r.counted);
    assert.ok(rows.length >= 1, `no counted sighting: ${JSON.stringify(r.counted)}`);
    for (const row of rows) {
      assert.equal(row.peer_path, SOCKET);
      assert.equal(row.proxy_pid, r.proxyPid);
      assert.equal(row.proxy_display, ':740');
      assert.equal(row.peer_inode, '7400002');
    }
    const key = Object.keys(r.summary.outside_peers_allowed).find((k) => k.includes(`-> ${SOCKET} (the run's own audit proxy, not yet accepted)`));
    assert.ok(key, JSON.stringify(r.summary.outside_peers_allowed));
    assert.equal(r.summary.outside_peers_allowed[key], rows.length);
    // the rule is loaded from beside the guard with no bytecode written, so a step's checkout stays clean
    assert.equal(existsSync(join(dirname(WRAP71), '__pycache__')), false);
  });

  // a sample can read a child between its fork and its exec, and the record keeps that first argv: the proxy is judged
  // as it is at the check, as its liveness is
  it('counts it when the proxy was recorded before its exec, by its argv at the check', async () => {
    const r = await guard({ proxy: ['-D', ':740'], late: true });
    assert.deepEqual(r.summary.flags, [], r.said);
    const recorded = r.summary.processes.find((p) => p.pid === r.proxyPid);
    assert.doesNotMatch(recorded.argv, /-D :740/, 'the record holds the argv from before the exec');
    assert.ok(ownProxyRows(r.counted).length >= 1, JSON.stringify(r.counted));
  });

  // the negative controls: each is the stopped runs' row, and each must still stop the run
  const controls = [
    ['with no recorded proxy at all', {}],
    ['when the process in the run serving that argv is not an xtrace', { proxy: ['-D', ':740'], named: 'xserve' }],
    ['when the recorded proxy is on another display', { proxy: ['-D', ':741'] }],
    ['after the proxy has exited and been reaped', { proxy: ['-D', ':740'], end: 'reaped' }],
    ['after the proxy has exited, a zombie its parent has not reaped', { proxy: ['-D', ':740'], end: 'zombie' }],
    ["when the proxy is not in the run's tree", { outside: ['-D', ':740'] }],
    ["for the proxy's display reached by its abstract name, which is not the proxy's socket", { proxy: ['-D', ':740'], peer: '@/tmp/.X11-unix/X740' }],
    // fix wave 1: the socket must be the proxy's own, in the same snapshot
    ['when another process of the run listens at that path', { proxy: ['-D', ':740'], listen: [['driver']] }],
    ['when the listener at that path shows no owner', { proxy: ['-D', ':740'], listen: [[]] }],
    ['when no listener at that path is in the snapshot', { proxy: ['-D', ':740'], listen: [] }],
    ['when a second listener at that path is not the proxy\'s', { proxy: ['-D', ':740'], listen: [['proxy'], ['driver']] }],
    ['when the listener is shared with another process', { proxy: ['-D', ':740'], listen: [['proxy', 'driver']] }],
    ['when the listener is an earlier proxy\'s on that display, with a new proxy alive', { proxy: ['-D', ':740'], reuse: true, listen: [['earlier']] }],
  ];
  for (const [what, setup] of controls) {
    it(`still flags it ${what}`, async () => {
      const r = await guard(setup);
      const peer = setup.peer ?? SOCKET;
      assert.equal(peerFlags(r.summary, peer).length, 1, `${r.said}\n${JSON.stringify(r.summary.flags)}`);
      assert.deepEqual(ownProxyRows(r.counted), []);
      assert.notEqual(r.code, 0, 'the flag stops the run');
    });
  }
});

// Fix wave 1, finding 2: the guard reads a process at the check as stat, cmdline, stat, and takes it only when both
// stats are the same live process: a pid reused between the reads must never lend the new process's argv to the old
// one's name and start. The reads are scripted here, since a pid's reuse between two reads can't be staged for real.
const RULE = new URL('../../docs/evidence/2026-10-28-own-linux-engine/m5/guards/own_audit_proxy.py', import.meta.url).pathname;
const stat = (comm, state, start) => `4242 (${comm}) ${state} 1 4242 4242 0 -1 4194304 0 0 0 0 0 0 0 0 20 0 1 0 ${start} 1000 10`;
/** process_at_check(4242, recorded start 777) over reads that answer, in order, `reads` (null: the read fails). */
function atCheck(reads) {
  const program = `
import importlib.util, json, sys
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('rule', sys.argv[1]); rule = importlib.util.module_from_spec(spec); spec.loader.exec_module(rule)
answers = json.loads(sys.argv[2])
def read(path):
    a = answers.pop(0)
    if a is None:
        raise OSError('gone')
    return a.encode()
print(json.dumps(rule.process_at_check(4242, 777, read)))
`;
  const run = spawnSync('python3', ['-I', '-c', program, RULE, JSON.stringify(reads)], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}
const XTRACE_ARGV = 'xtrace\0-d\0:739\0-D\0:740\0';

describe('the process at the check: stat, cmdline, stat (fix wave 1)', { skip: !linux && 'Linux only' }, () => {
  it('is the recorded xtrace, with its argv, when both stats are that live process', () => {
    assert.deepEqual(atCheck([stat('xtrace', 'S', 777), XTRACE_ARGV, stat('xtrace', 'S', 777)]), { comm: 'xtrace', argv: 'xtrace -d :739 -D :740' });
  });
  const none = [
    ['the pid reused between the reads by a not-xtrace -D :740', [stat('xtrace', 'S', 777), 'not-xtrace\0-D\0:740\0', stat('not-xtrace', 'S', 912)]],
    ['the pid reused by another xtrace, its start moved', [stat('xtrace', 'S', 777), XTRACE_ARGV, stat('xtrace', 'S', 912)]],
    ['the process renamed between the reads', [stat('xtrace', 'S', 777), XTRACE_ARGV, stat('xtrace2', 'S', 777)]],
    ['a zombie on the second read', [stat('xtrace', 'S', 777), '', stat('xtrace', 'Z', 777)]],
    ['a start other than the recorded one', [stat('xtrace', 'S', 912), XTRACE_ARGV, stat('xtrace', 'S', 912)]],
    ['a process gone before its cmdline is read', [stat('xtrace', 'S', 777), null]],
    ['a process gone before the second stat', [stat('xtrace', 'S', 777), XTRACE_ARGV, null]],
  ];
  for (const [what, reads] of none) {
    it(`is nothing for ${what}`, () => assert.equal(atCheck(reads), null));
  }
});
