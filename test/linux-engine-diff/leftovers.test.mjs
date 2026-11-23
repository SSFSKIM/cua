// The end check sees what earlier runs left (#171 M5, T4's second round; rulings 721 and 724). Task 87 found five
// `/tmp/cua171-run-*` scratch directories of earlier runs, four still with their session buses, which no end check had
// named: the check lived in the cleanup those runs never reached, and looked only at its own run. It now runs where it
// always runs, at every run's end (`closeEverything`, whatever ended the run) and after every gate step (gate.mjs, whatever
// ended the step's process), and it lists every `cua171-run-*` directory but the run's own, and every session-bus process
// whose config or socket lies in one, as a finding. It names them and leaves them alone: another run may own them.
// Display-free; the processes are a /proc of the test's own.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
// its runs' start and end checks read a fixture, never the real roots or /proc (fixture-scope.mjs)
import './fixture-scope.mjs';

import { leftoverCheck, leftoverLines } from '../../scripts/linux-engine-diff/leftovers.mjs';
import { Desktop, desktopEnding } from '../../scripts/linux-engine-diff/scenes.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'cua171-leftovers-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const fresh = (name) => {
  const dir = join(scratch, `${name}-${n++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

/** A process in the test's /proc: its executable, its argv and its environment. */
function processIn(proc, pid, { exe, argv, env = {} }) {
  const dir = join(proc, String(pid));
  mkdirSync(dir, { recursive: true });
  symlinkSync(exe, join(dir, 'exe'));
  writeFileSync(join(dir, 'cmdline'), `${argv.join('\0')}\0`);
  writeFileSync(join(dir, 'environ'), `${Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\0')}\0`);
  writeFileSync(join(dir, 'comm'), `${exe.split('/').at(-1).slice(0, 15)}\n`);
}

/** Task 87's layout: an earlier run's scratch with its session bus, its accessibility launcher and that bus's daemon. */
function earlierRun(root, proc, tag, pid) {
  const dir = join(root, `cua171-run-${tag}`);
  mkdirSync(join(dir, 'session', 'bus'), { recursive: true });
  writeFileSync(join(dir, 'session', 'session.conf'), `<listen>unix:dir=${dir}/session/bus</listen>\n`);
  const address = `unix:path=${dir}/session/bus/dbus-AbCdEf,guid=0123`;
  processIn(proc, pid, { exe: '/usr/bin/dbus-daemon', argv: ['dbus-daemon', `--config-file=${dir}/session/session.conf`, '--nofork', '--nopidfile', '--print-address=3'] });
  processIn(proc, pid + 4, { exe: '/usr/libexec/at-spi-bus-launcher', argv: ['/usr/libexec/at-spi-bus-launcher'], env: { DBUS_SESSION_BUS_ADDRESS: address } });
  processIn(proc, pid + 9, { exe: '/usr/bin/dbus-daemon', argv: ['/usr/bin/dbus-daemon', '--config-file=/usr/share/defaults/at-spi2/accessibility.conf', '--nofork', '--print-address', '10'], env: { DBUS_SESSION_BUS_ADDRESS: address } });
  return dir;
}

test("the check lists every other run's scratch and the session-bus processes whose config or socket lies in it, and touches nothing", () => {
  const root = fresh('tmp');
  const proc = fresh('proc');
  const old = earlierRun(root, proc, '7nTGZK', 199857);
  const own = join(root, 'cua171-run-OwnRun');
  mkdirSync(own);
  // neither a bus nor one of a scratch: a shell naming the directory, and the person's own session bus
  processIn(proc, 300, { exe: '/usr/bin/bash', argv: ['bash', '-c', `ls ${old}`] });
  processIn(proc, 301, { exe: '/usr/bin/dbus-daemon', argv: ['dbus-daemon', '--session', '--address=systemd:'], env: { DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/501/bus' } });
  mkdirSync(join(root, 'cua171-gl-x'));
  const check = leftoverCheck({ own: [own], roots: [root], proc });
  assert.deepEqual(check.dirs.map((d) => d.dir), [old], "the run's own is not a leftover; another prefix is not the harness's scratch");
  assert.deepEqual(check.buses.map((b) => [b.pid, b.program, b.dir, b.by]), [
    [199857, 'dbus-daemon', old, 'config'],
    [199861, 'at-spi-bus-launcher', old, 'socket'],
    [199866, 'dbus-daemon', old, 'socket'],
  ]);
  assert.equal(check.clear, false);
  assert.equal(existsSync(old), true, 'left alone: another run may own it');
  const lines = leftoverLines(check);
  assert.match(lines[0], new RegExp(`^a cua171-run-\\* directory not this run's, left alone: ${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(modified \\d{4}-\\d\\d-\\d\\dT`));
  assert.match(lines[1], /^a session-bus process of it, left alone: pid 199857 dbus-daemon \(its config/);
  assert.equal(lines.length, 4);
});

test('with nothing left the check is clear; a root that does not exist is no leftover', () => {
  const check = leftoverCheck({ own: [], roots: [fresh('empty'), join(scratch, 'nowhere')], proc: fresh('proc') });
  assert.deepEqual(check, { roots: check.roots, dirs: [], buses: [], clear: true });
  assert.deepEqual(leftoverLines(check), []);
});

test("the run's end record carries the check, made after its own scratch is gone, as a finding that fails nothing", async () => {
  const root = fresh('tmp');
  const proc = fresh('proc');
  const old = earlierRun(root, proc, 'q8ExPO', 2369948);
  const desktop = new Desktop({ cua: 'unused', run: 'leftovers', reader: { async close() {} }, startActive: 0, nonce: 'n0' });
  desktop.leftoverOptions = { roots: [root], proc };
  const reported = [];
  desktop.report = (line) => reported.push(line);
  desktop.trace = {};
  desktop.finishTrace = async () => ({ start: null, end: null, holder: null, audit: { clean: true, traced: true, requests: 1, mutating: 0, foreign: [] }, record: { skipped: 'declined', clean: true, traced: false, requests: 0, mutating: 0, foreign: [] }, watchdog: { state: 'ended', clean: true }, skipped: [], chrome: null, session: null });
  await desktop.closeAll();
  const { record, foreign } = desktopEnding(desktop.ending);
  assert.deepEqual(record.leftovers.dirs.map((d) => d.dir), [old]);
  assert.equal(record.leftovers.buses.length, 3);
  assert.deepEqual(foreign, [], 'a finding, never a failure of this run');
  assert.equal(reported.length, 1);
  assert.match(reported[0], /^the end check \(findings, left alone\): a cua171-run-\* directory not this run's/);
  assert.equal(existsSync(old), true);
});

// review finding 2: a bus outlives its scratch (the cleanup removes the scratch even when stopping the bus failed), so a
// bus is found by the scratch path in its config, argv or environment, whether or not the directory still exists
test("a session bus whose scratch is gone is still a finding, named by the path it names; the run's own bus is not", () => {
  const root = fresh('tmp');
  const proc = fresh('proc');
  const gone = join(root, 'cua171-run-Gone12');
  const own = join(root, 'cua171-run-OwnRun');
  processIn(proc, 700, { exe: '/usr/bin/dbus-daemon', argv: ['dbus-daemon', `--config-file=${gone}/session/session.conf`, '--nofork'] });
  processIn(proc, 701, { exe: '/usr/libexec/at-spi-bus-launcher', argv: ['/usr/libexec/at-spi-bus-launcher'], env: { DBUS_SESSION_BUS_ADDRESS: `unix:path=${gone}/session/bus/dbus-x,guid=1` } });
  processIn(proc, 702, { exe: '/usr/bin/dbus-daemon', argv: ['dbus-daemon', `--config-file=${own}/session/session.conf`] });
  const check = leftoverCheck({ own: [own], roots: [root], proc });
  assert.deepEqual(check.dirs, []);
  assert.deepEqual(check.buses.map((b) => [b.pid, b.program, b.dir, b.by, b.dir_exists]), [[700, 'dbus-daemon', gone, 'config', false], [701, 'at-spi-bus-launcher', gone, 'socket', false]]);
  assert.equal(check.clear, false, 'an orphaned bus is never all-clear');
  assert.deepEqual(leftoverLines(check), [
    `a session-bus process of a cua171-run-* directory that is gone, left alone: pid 700 dbus-daemon (its config in ${gone})`,
    `a session-bus process of a cua171-run-* directory that is gone, left alone: pid 701 at-spi-bus-launcher (its socket in ${gone})`,
  ]);
});
