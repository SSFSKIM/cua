// One unclean-end rule, drawn by who can see it (#171 M5, T4's second round; the design session's ruling 730, part (a)).
// What a run leaves only on its own side (its scratch directory, its own session bus, processes it spawned, a cleanup
// step that threw) marks its end record unclean: never a verdict failure, named in the all-clear and the step's README,
// and listed by the gate's summary. The next run's start check refuses to start on it, naming it and its evidence, and
// removes nothing (fix wave 3): removal is `gate.mjs leftovers --remove <dir> --confirm`'s (wave3-references.test.mjs).
// Display-free: the processes are a /proc and a process table of the test's own.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
// its runs' start and end checks read a fixture, never the real roots or /proc (fixture-scope.mjs)
import './fixture-scope.mjs';

import { MARKER, readMarker, startCheck, writeMarker } from '../../scripts/linux-engine-diff/leftovers.mjs';
import { Desktop, desktopEnding } from '../../scripts/linux-engine-diff/scenes.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'cua171-unclean-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const fresh = (name) => {
  const dir = join(scratch, `${name}-${n++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

function processIn(proc, pid, { exe, argv, env = {} }) {
  const dir = join(proc, String(pid));
  mkdirSync(dir, { recursive: true });
  symlinkSync(exe, join(dir, 'exe'));
  writeFileSync(join(dir, 'cmdline'), `${argv.join('\0')}\0`);
  writeFileSync(join(dir, 'environ'), `${Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\0')}\0`);
}

/** A run's scratch as the Desktop leaves it: mode 700, its marker naming the run's process (`pid`, `start`). */
function scratchOf(root, tag, { pid = 4242, start = '777', mode = 0o700, marker = true } = {}) {
  const dir = join(root, `cua171-run-${tag}`);
  mkdirSync(join(dir, 'session', 'bus'), { recursive: true });
  if (marker) writeMarker(dir, { run: `t-${tag}`, nonce: 'n0', pid, pid_start: start, created: '2026-11-15T10:00:00.000Z' });
  chmodSync(dir, mode);
  return dir;
}
const dead = () => null;

test("the start check refuses even a scratch that is the harness's own and done (its marker, its run gone, nothing naming it), and keeps it", () => {
  const root = fresh('tmp');
  const dir = scratchOf(root, 'Dead01');
  const result = startCheck({ roots: [root], proc: fresh('proc'), creator: () => ({ state: "absent" }) });
  assert.deepEqual(result.refused.map((r) => r.dir), [dir]);
  assert.match(result.refused[0].reason, /its creator pid 4242 is absent; no observed process references it; the start check removes nothing/);
  assert.equal(existsSync(dir), true);
});

test('the start check refuses, with the reason, whatever it cannot prove is the harness\'s and gone, and touches it not', () => {
  const root = fresh('tmp');
  const proc = fresh('proc');
  const unmarked = scratchOf(root, 'NoMark', { marker: false });
  const live = scratchOf(root, 'Alive1', { pid: 99, start: '555' });
  const open = scratchOf(root, 'Open01', { mode: 0o755 });
  const named = scratchOf(root, 'Named1');
  processIn(proc, 300, { exe: '/usr/bin/dbus-daemon', argv: ['dbus-daemon', `--config-file=${named}/session/session.conf`] });
  // a bus whose scratch is gone: nothing to remove, and the process is not the check's to end
  const gone = join(root, 'cua171-run-Gone99');
  processIn(proc, 301, { exe: '/usr/libexec/at-spi-bus-launcher', argv: ['at-spi-bus-launcher'], env: { DBUS_SESSION_BUS_ADDRESS: `unix:path=${gone}/session/bus/x` } });
  const creator = (pid) => (pid === 99 ? { state: 'live', start: '555' } : { state: 'absent' });
  const { refused } = startCheck({ roots: [root], proc, creator });
  const why = Object.fromEntries(refused.map((r) => [r.dir, r.reason]));
  assert.match(why[unmarked], /no marker of the harness's/);
  assert.match(why[live], /its creator pid 99 is still running/);
  assert.match(why[open], /mode 755, not 700/);
  assert.match(why[named], /referenced by pid 300 dbus-daemon \(its argv\)/);
  assert.match(why[gone], /its directory is gone and a process still references it: pid 301 at-spi-bus-launcher \(its environ\)/);
  for (const dir of [unmarked, live, open, named]) assert.equal(existsSync(dir), true, `${dir} untouched`);
  // a marker whose run's start time is unknown proves nothing gone
  const unknown = scratchOf(fresh('tmp'), 'Unkn01', { start: 'unknown' });
  assert.match(startCheck({ roots: [join(unknown, '..')], proc: fresh('proc'), creator: () => ({ state: "absent" }) }).refused[0].reason, /the start time of pid 4242 is unknown \(unknown\)/);
  assert.equal(existsSync(unknown), true);
  // the run's own is never the check's
  assert.deepEqual(startCheck({ own: [named, unmarked, live, open], roots: [root], proc: fresh('proc'), creator }).refused, []);
});

test("a Desktop marks its scratch at once, and its start refuses what the check refuses, before anything of the run's starts", async () => {
  const desktop = new Desktop({ cua: 'unused', run: 'marked', reader: { async close() {} }, startActive: 0, nonce: 'n0' });
  try {
    const marker = readMarker(desktop.dir);
    assert.equal(marker.pid, process.pid);
    // the start time is /proc's: on another system unknown, which the start check never takes for gone
    assert.match(marker.pid_start, process.platform === 'linux' ? /^\d+$/ : /^unknown$/);
    assert.equal(marker.run, 'marked');
    assert.ok(existsSync(join(desktop.dir, MARKER)));
    const root = fresh('tmp');
    scratchOf(root, 'NoMrk2', { marker: false });
    desktop.leftoverOptions = { roots: [root], proc: fresh('proc') };
    let watchdog = false;
    await assert.rejects(desktop.begin({ startWatchdog: async () => { watchdog = true; return { stop: async () => ({ clean: true }) }; } }), /the start check refuses to run: .*cua171-run-NoMrk2: .*no marker of the harness's/);
    assert.equal(watchdog, false, 'refused before the watchdog');
  } finally {
    desktop.unhookStop();
    rmSync(desktop.dir, { recursive: true, force: true });
  }
});

const traceEnding = async () => ({ start: null, end: null, holder: null, audit: { clean: true, traced: true, requests: 1, mutating: 0, foreign: [] }, record: { skipped: 'declined', clean: true, traced: false, requests: 0, mutating: 0, foreign: [] }, watchdog: { state: 'ended', clean: true }, skipped: [], chrome: null, session: null });

test("what a run leaves on its own side marks its end unclean, never a failure: a step that threw, its own bus, its Chrome's processes", async () => {
  const desktop = new Desktop({ cua: 'unused', run: 'unclean', reader: { async close() {} }, startActive: 0, nonce: 'n0' });
  const proc = fresh('proc');
  desktop.leftoverOptions = { roots: [fresh('tmp')], proc };
  desktop.report = () => {};
  // its bus stopped as far as it knows, yet a process of it still names the run's scratch
  processIn(proc, 500, { exe: '/usr/bin/dbus-daemon', argv: ['dbus-daemon', `--config-file=${desktop.dir}/session/session.conf`] });
  desktop.session = { address: `unix:path=${desktop.dir}/session/bus/x`, stop: async () => ({ terminated: true }) };
  desktop.close = async () => {
    throw new Error('BadWindow');
  };
  desktop.chrome = { stop: async () => ({ spawned: [1, 2], terminated: [1], killed: [], left: [2] }) };
  desktop.trace = {};
  desktop.finishTrace = traceEnding;
  await desktop.closeAll();
  const { record, foreign } = desktopEnding(desktop.ending);
  assert.deepEqual(foreign, [], 'no verdict failure');
  assert.deepEqual(record.unclean, [
    "a cleanup step threw: closing the run's windows: BadWindow",
    "its Chrome left 1 process running",
    `its session bus still runs: pid 500 dbus-daemon (its config in ${desktop.dir})`,
  ]);
  // a clean end has none
  const clean = new Desktop({ cua: 'unused', run: 'clean', reader: { async close() {} }, startActive: 0, nonce: 'n0' });
  clean.leftoverOptions = { roots: [fresh('tmp')], proc: fresh('proc') };
  clean.close = async () => {};
  clean.trace = {};
  clean.finishTrace = traceEnding;
  await clean.closeAll();
  assert.equal(desktopEnding(clean.ending).record.unclean, undefined);
});

test("the run's summary names an unclean end beside its desktop line", async () => {
  const { desktopLine } = await import('../../scripts/linux-engine-diff/report.mjs');
  const record = { active_start: null, active_end: null, holder: null, trace: { requests: 1, mutating: 0, foreign: [], clean: true }, unclean: ['its Chrome left 1 process running'] };
  assert.match(desktopLine(record), /\*\*its end unclean\*\* \(its own side, not a verdict failure\): its Chrome left 1 process running$/);
  assert.doesNotMatch(desktopLine({ ...record, unclean: undefined }), /unclean/);
});
