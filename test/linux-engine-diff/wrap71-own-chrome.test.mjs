// #171 M5, T4's arm64 round, item (e): M5's `:0` guard (wrap71.py) counts a run process's not-yet-accepted connection to
// an autobind abstract address whose listener, in the same snapshot, is held by the run's own chrome or chrome_crashpad
// (own_chrome_listener.py), the way ruling 773 counts the run's own audit proxy. The arm64 pilot's V5 was stopped by
// exactly that row: `outside-peer-connection` to @011e2, `peer_pids: []`, from the run's Chrome 26 ms after it started.
//
// Display-free and socket-free, as wrap71-own-proxy.test.mjs: the guard runs in private mode around a driver that stands
// for the run, and reads its socket table from a stand-in `ss` first on its PATH, which prints what the driver writes:
// the driver's own connection, at its other end the autobind address with no pid, and the listeners at that address
// with the owners the case names. The holders are real stand-in processes whose kernel names are the file's (chrome,
// chrome_crashpad), in the run's tree or outside it.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const WRAP71 = new URL('../../docs/evidence/2026-10-28-own-linux-engine/m5/guards/wrap71.py', import.meta.url).pathname;
const RULE = new URL('../../docs/evidence/2026-10-28-own-linux-engine/m5/guards/own_chrome_listener.py', import.meta.url).pathname;
const ADDRESS = '@011e2';
const linux = process.platform === 'linux';
const PYTHON = linux ? spawnSync('python3', ['-I', '-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' }).stdout.trim() : null;

// a holder stand-in: runs until it is ended; Python, so its kernel name stays the file's
const HOLDER = (python) => `#!${python} -I
import time
time.sleep(60)
`;
const FAKE_SS = `#!/bin/sh
cat "$FAKE_SS_TABLE" 2>/dev/null || echo 'Netid State Recv-Q Send-Q Local Address:Port Peer Address:Port Process'
echo read >> "$FAKE_SS_TABLE.reads"
`;
// the run: starts the holders the case names, lets the guard's samples see them, then holds its connection in the table
// for a few socket samples; on its end or the guard's stop it ends what it started
const DRIVER = `
import { spawn } from 'node:child_process';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
const spec = JSON.parse(process.argv[2]);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const state = (pid) => { try { const s = readFileSync('/proc/' + pid + '/stat', 'utf8'); return s[s.lastIndexOf(')') + 2]; } catch { return null; } };
const started = [];
const finish = async (code) => {
  for (const pid of started) try { process.kill(pid, 'SIGKILL'); } catch {}
  for (let i = 0; i < 100 && started.some((pid) => state(pid) !== null); i++) await sleep(20);
  process.exit(code);
};
process.on('SIGTERM', () => finish(143));
const owner = { driver: process.pid, outside: spec.outsidePid };
// a Chrome process of the run's as the guard expects one: its HOME under the run's TMPDIR, and a --type (no browser profile to check)
for (const [name, file] of Object.entries(spec.holders)) { const p = spawn(file, ['--type=zygote'], { stdio: 'ignore', env: { ...process.env, HOME: spec.dir + '/tmp/home' } }).pid; started.push(p); owner[name] = p; }
await sleep(800);
const table = spec.dir + '/ss.txt';
const users = (names) => names.length ? ' users:(' + names.map((n) => '("x",pid=' + owner[n] + ',fd=3)').join(',') + ')' : '';
writeFileSync(table + '.new', [
  'Netid State Recv-Q Send-Q Local Address:Port Peer Address:Port Process',
  'u_str ESTAB 0 0 * 7500001 * 7500002 users:(("chrome",pid=' + process.pid + ',fd=40))',
  'u_str ESTAB 0 0 ' + spec.peer + ' 7500002 * 7500001',
  ...spec.listen.map((names, i) => 'u_str LISTEN 0 4 ' + spec.peer + ' ' + (7500100 + i) + ' * 0' + users(names)),
].join('\\n') + '\\n');
renameSync(table + '.new', table);
await sleep(2500);
rmSync(table, { force: true });
const reads = () => { try { return readFileSync(table + '.reads', 'utf8').split('\\n').length - 1; } catch { return 0; } };
const seen = reads();
while (reads() < seen + 2) await sleep(20);
await finish(0);
`;

/**
 * wrap71.py in private mode around the driver: `holders` the run starts (name -> its kernel name), an `outside` holder
 * the test starts beside the guard, `listen` the owners of each listener at `peer`. Its exit, summary and counted rows.
 */
async function guard({ holders = { crashpad: 'chrome_crashpad' }, outside = false, listen = [['crashpad']], peer = ADDRESS } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-chrome-guard-'));
  let stranger = null;
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    mkdirSync(join(dir, 'tmp'));
    writeFileSync(join(bin, 'ss'), FAKE_SS);
    chmodSync(join(bin, 'ss'), 0o755);
    const files = {};
    for (const [name, comm] of Object.entries(holders)) {
      mkdirSync(join(dir, name));
      files[name] = join(dir, name, comm);
      writeFileSync(files[name], HOLDER(PYTHON));
      chmodSync(files[name], 0o755);
    }
    if (outside) {
      mkdirSync(join(dir, 'outside'));
      writeFileSync(join(dir, 'outside', 'chrome_crashpad'), HOLDER(PYTHON));
      chmodSync(join(dir, 'outside', 'chrome_crashpad'), 0o755);
      stranger = spawn(join(dir, 'outside', 'chrome_crashpad'), [], { stdio: 'ignore' });
    }
    writeFileSync(join(dir, 'driver.mjs'), DRIVER);
    const spec = { dir, peer, listen, holders: files, outsidePid: stranger?.pid };
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
    return { code, said, summary: JSON.parse(read('wrap-summary.json')), counted };
  } finally {
    stranger?.kill('SIGKILL');
    rmSync(dir, { recursive: true, force: true });
  }
}

const peerFlags = (summary, peer = ADDRESS) => summary.flags.filter((f) => f.kind === 'outside-peer-connection' && f.peer_path === peer && f.peer_pids.length === 0);
const chromeRows = (counted) => counted.filter((r) => r.kind === 'own-chrome-not-accepted');

describe("wrap71's rule for the run's own Chrome's autobind sockets (M5's T4, arm64 round, item (e))", { concurrency: true, skip: !linux && 'Linux only (/proc, the subreaper)' }, () => {
  for (const [what, setup] of [
    ['its crashpad handler', {}],
    ['Chrome itself', { holders: { browser: 'chrome' }, listen: [['browser']] }],
    ['both, sharing the listener', { holders: { browser: 'chrome', crashpad: 'chrome_crashpad' }, listen: [['browser', 'crashpad']] }],
  ]) {
    it(`counts a not-yet-accepted connection to an autobind address held by ${what}, and flags nothing`, async () => {
      const r = await guard(setup);
      assert.deepEqual(r.summary.flags, [], r.said);
      assert.equal(r.code, 0, r.said);
      const rows = chromeRows(r.counted);
      assert.ok(rows.length >= 1, `no counted sighting: ${JSON.stringify(r.counted)}`);
      for (const row of rows) {
        assert.equal(row.peer_path, ADDRESS);
        assert.ok(row.holders.every((h) => ['chrome', 'chrome_crashpad'].includes(h.comm)), JSON.stringify(row.holders));
      }
      const key = Object.keys(r.summary.outside_peers_allowed).find((k) => k.includes(`-> ${ADDRESS} (the run's own Chrome, not yet accepted)`));
      assert.ok(key, JSON.stringify(r.summary.outside_peers_allowed));
    });
  }

  // the negative controls: each is V5's stopped row, and each must still stop the run
  const controls = [
    ['when the listener is held by a process outside the run', { holders: {}, outside: true, listen: [['outside']] }],
    ['when the listener shows no holder', { listen: [[]] }],
    ['when no listener at that address is in the snapshot', { listen: [] }],
    ["when the run's holder is not chrome or chrome_crashpad", { holders: { other: 'xserve' }, listen: [['other']] }],
    ['when another process of the run shares the listener', { listen: [['crashpad', 'driver']] }],
    ['when a second listener at that address is foreign', { holders: { crashpad: 'chrome_crashpad' }, outside: true, listen: [['crashpad'], ['outside']] }],
    ['for an abstract address that is not an autobind one', { peer: '@/tmp/.X11-unix/X0' }],
    ['for an autobind-like address one digit long', { peer: '@011e2a' }],
  ];
  for (const [what, setup] of controls) {
    it(`still flags it ${what}`, async () => {
      const r = await guard(setup);
      const peer = setup.peer ?? ADDRESS;
      assert.equal(peerFlags(r.summary, peer).length, 1, `${r.said}\n${JSON.stringify(r.summary.flags)}`);
      assert.deepEqual(chromeRows(r.counted), []);
      assert.notEqual(r.code, 0, 'the flag stops the run');
    });
  }
});

// The holder at the check, read stat, cmdline, stat, and started before the snapshot: a pid reused between the reads,
// or one a process took after the snapshot, lends nothing. Scripted reads, as a pid's reuse can't be staged for real.
const stat = (comm, state, start) => `4242 (${comm}) ${state} 1 4242 4242 0 -1 4194304 0 0 0 0 0 0 0 0 20 0 1 0 ${start} 1000 10`;
/** process_before(4242, the snapshot at tick 1000) over reads that answer, in order, `reads` (null: the read fails). */
function before(reads) {
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
print(json.dumps(rule.process_before(4242, 1000, read)))
`;
  const run = spawnSync('python3', ['-I', '-c', program, RULE, JSON.stringify(reads)], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

describe('the holder at the check: stat, cmdline, stat, started before the snapshot', { skip: !linux && 'Linux only' }, () => {
  it('is the live chrome_crashpad that started before the snapshot', () => {
    assert.deepEqual(before([stat('chrome_crashpad', 'S', 777), 'chrome_crashpad\0', stat('chrome_crashpad', 'S', 777)]), { comm: 'chrome_crashpad', start: 777 });
  });
  for (const [what, reads] of [
    ['the pid reused between the reads, its start moved', [stat('chrome_crashpad', 'S', 777), 'x\0', stat('chrome_crashpad', 'S', 912)]],
    ['the pid reused between the reads by another program', [stat('chrome_crashpad', 'S', 777), 'x\0', stat('xserve', 'S', 777)]],
    ['a process that started after the snapshot, under the pid ss showed', [stat('chrome_crashpad', 'S', 1000), 'x\0', stat('chrome_crashpad', 'S', 1000)]],
    ['a zombie', [stat('chrome_crashpad', 'Z', 777), '', stat('chrome_crashpad', 'Z', 777)]],
    ['a process gone before its second stat', [stat('chrome_crashpad', 'S', 777), 'x\0', null]],
  ]) {
    it(`is nothing for ${what}`, () => assert.equal(before(reads), null));
  }
});
