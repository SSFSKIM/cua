// Task 88's fix wave 2: the re-review's reproductions of ruling 730's new code, each kept as its regression test. No
// display; nothing is signalled; the processes are a /proc of the test's own.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { removalProof, startCheck, writeMarker } from '../../scripts/linux-engine-diff/leftovers.mjs';
import { processState } from '../../scripts/linux-engine-diff/pid-identity.mjs';
import { focusTimerVerdict } from '../../scripts/linux-engine-diff/focus-timer.mjs';
import { Desktop, desktopEnding } from '../../scripts/linux-engine-diff/scenes.mjs';
import { judgeSitting, liveReads, terminalKindOf } from '../../scripts/linux-engine-gate/sitting.mjs';
import { STEPS } from '../../scripts/linux-engine-gate/steps.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'cua171-wave2-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const fresh = (name) => {
  const dir = join(scratch, `${name}-${n++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};
/** A process in the test's /proc; any of its files may be left out (unreadable). */
function processIn(proc, pid, { exe, argv, env, start, uid } = {}) {
  const dir = join(proc, String(pid));
  mkdirSync(dir, { recursive: true });
  if (exe) symlinkSync(exe, join(dir, 'exe'));
  if (argv) writeFileSync(join(dir, 'cmdline'), `${argv.join('\0')}\0`);
  if (env) writeFileSync(join(dir, 'environ'), `${Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\0')}\0`);
  if (start) writeFileSync(join(dir, 'stat'), `${pid} (node) S ${Array.from({ length: 18 }, () => '0').join(' ')} ${start} 0 0\n`);
  if (uid !== undefined) writeFileSync(join(dir, 'status'), `Name:\tx\nUid:\t${uid}\t${uid}\t${uid}\t${uid}\n`);
}
function marked(root, tag, { pid = 4242, start = '777' } = {}) {
  const dir = join(root, `cua171-run-${tag}`);
  mkdirSync(dir, { recursive: true });
  writeMarker(dir, { run: tag, nonce: 'n0', pid, pid_start: start, created: '2026-11-15T10:00:00.000Z' });
  chmodSync(dir, 0o700);
  return dir;
}

// finding 1 (fix wave 3: the start check removes nothing; what wave 2 cleared, the removal proof now decides)
const creatorCheck = (proof) => proof.checks.find((c) => c.what === 'its creator is absent');
const observedCheck = (proof) => proof.checks.find((c) => c.what === 'every same-user process was fully observed');

test('a creator whose start matches but whose exe cannot be read is alive, not gone: its scratch stays', () => {
  const root = fresh('tmp');
  const proc = fresh('proc');
  const dir = marked(root, 'Live01', { pid: 4242, start: '777' });
  processIn(proc, 4242, { start: '777', argv: ['node'], env: {} });
  assert.deepEqual(processState(4242, { proc }), { state: 'live', start: '777' });
  const { refused } = startCheck({ roots: [root], proc });
  assert.match(refused[0].reason, /its creator pid 4242 is still running/);
  assert.deepEqual([creatorCheck(removalProof(dir, { proc })).holds, existsSync(dir)], [false, true]);
});

test("a creator that cannot be observed refuses removal; one absent, or its pid reused by another start, is gone", () => {
  const root = fresh('tmp');
  const proc = fresh('proc');
  const dir = marked(root, 'Unobs1', { pid: 5000 });
  mkdirSync(join(proc, '5000'));
  assert.equal(processState(5000, { proc }).state, 'unknown');
  assert.match(startCheck({ roots: [root], proc }).refused[0].reason, /its creator pid 5000 cannot be read/);
  assert.equal(creatorCheck(removalProof(dir, { proc })).holds, false);
  assert.equal(existsSync(dir), true);
  assert.equal(processState(5001, { proc }).state, 'absent');
  // the pid now another start's is gone
  const clean = fresh('proc');
  processIn(clean, 5002, { start: '999', argv: ['x'], env: {} });
  const reused = marked(fresh('tmp'), 'Reused', { pid: 5002, start: '777' });
  assert.match(creatorCheck(removalProof(reused, { proc: clean })).detail, /pid 5002 is another process now/);
  assert.equal(creatorCheck(removalProof(reused, { proc: clean })).holds, true);
});

test("a process of this user's whose argv or environment cannot be read refuses removal, however old; another user's cannot reach a 700 directory", () => {
  const root = fresh('tmp');
  const proc = fresh('proc');
  const dir = marked(root, 'Unread', { pid: 6000 });
  processIn(proc, 6001, { argv: ['gedit'], uid: process.getuid() });
  assert.match(observedCheck(removalProof(dir, { proc })).detail, /pid 6001's environ \(ENOENT\)/);
  assert.equal(existsSync(dir), true);
  // wave 2 exempted one that started before the directory was made; an old process can still chdir into it, open a
  // file there or be handed an fd, so it is unobserved like any other (the review of d76d1a7f)
  const early = fresh('proc');
  writeFileSync(join(early, 'stat'), 'cpu 0\nbtime 1700000000\n');
  processIn(early, 6003, { argv: ['(sd-pam)'], uid: process.getuid(), start: '100' });
  const old = removalProof(dir, { proc: early });
  assert.deepEqual([old.holds, observedCheck(old).holds], [false, false]);
  assert.match(observedCheck(old).detail, /pid 6003's environ/);
  assert.equal(existsSync(dir), true);
  // in detection an unread field is evidence of nothing: the start refuses the directory itself, not for (sd-pam)
  assert.doesNotMatch(startCheck({ roots: [root], proc: early }).refused[0].reason, /6003/);
  const other = fresh('proc');
  processIn(other, 6002, { argv: ['root-thing'], uid: 0 });
  assert.equal(observedCheck(removalProof(dir, { proc: other })).holds, true);
});

// finding 2
const record = (dir, rows) => {
  mkdirSync(join(dir, 'run'), { recursive: true });
  writeFileSync(join(dir, 'run', 'results.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  writeFileSync(join(dir, 'wrap-summary.json'), JSON.stringify({ flags: [], decoy_connections: [], leftovers: [] }));
  writeFileSync(join(dir, 'pointer.txt'), 'pointer restored to 1 2, reads 1 2 \n');
};
const quiet = { keysDown: () => [], buttonsDown: () => [], windowsLeft: () => 0 };

test("a change to a foreign window fails the all-clear whichever controlled client made it, an engine's included; an ordinary verdict failure does not", () => {
  const dir = fresh('V3');
  record(dir, [{ kind: 'end', failed: ['chrome-input move cua', 'a window the harness did not open was changed: cua on chrome-input activate_window: 0x00a00003 ConfigureWindow (raised)', "a window the harness did not open was changed: the run's watchdog: it stalled, so the display went unwatched"] }]);
  const v = judgeSitting(dir, quiet, 'end');
  assert.equal(v.clear, false);
  assert.deepEqual(v.person, ['a window the harness did not open was changed: cua on chrome-input activate_window: 0x00a00003 ConfigureWindow (raised)']);
});

// finding 3
test("a window search that reported an error is unread, never zero windows", () => {
  const fake = (status, stdout, stderr) => () => {
    const e = new Error('xdotool failed');
    Object.assign(e, { status, stdout, stderr });
    throw e;
  };
  assert.throws(() => liveReads({ run: fake(1, '', 'Error: cannot open display\n') }).windowsLeft(), /cannot open display/);
  assert.equal(liveReads({ run: fake(1, '', '') }).windowsLeft(), 0, 'no match, no error');
});

// finding 4
test('every printed :0 step has the terminal row its kind writes, and a clean sitting of each is all-clear (Z0, a drag experiment, included)', () => {
  const zero = STEPS.filter((s) => s.display === ':0');
  assert.deepEqual(zero.map((s) => [s.name, terminalKindOf(s)]), [['V1', 'end'], ['V2', 'end'], ['V3', 'end'], ['V4', 'end'], ['V5', 'end'], ['Z0', 'experiment-summary']]);
  for (const s of zero) {
    const dir = fresh(s.name);
    record(dir, [{ kind: 'meta' }, { kind: terminalKindOf(s), failed: [], desktop: {} }]);
    assert.deepEqual(judgeSitting(dir, quiet, terminalKindOf(s)), { clear: true, person: [], run: [] }, s.name);
  }
  const z0 = fresh('Z0');
  record(z0, [{ kind: 'experiment-summary', failed: ['a window the harness did not open was changed: the harness: 0x1 MapWindow'], desktop: { unclean: ['its Chrome left 1 process running'] } }]);
  const v = judgeSitting(z0, quiet, 'experiment-summary');
  assert.deepEqual([v.clear, v.person.length, v.run], [false, 1, ['its Chrome left 1 process running']]);
  assert.match(judgeSitting(fresh('none'), quiet, 'experiment-summary').person.join(), /terminal row \(experiment-summary\) is missing/);
});

// finding 5
test("a pilot's short focus-timer series never absorbs a false ok: an answered-ok run with the wrong text fails it", () => {
  const s = { family: 'chrome', lane: 'shipped', scenario: 'burst', runs: 2, misses: 1, streak: 1, need: 2, reached: false, miss_causes: { text: 1 }, first_miss: { ok: false, answered_ok: true } };
  const v = focusTimerVerdict({ series: [s], audits: [], stops: [], skipped: [] }, { families: ['chrome'], pilot: true });
  assert.match(v.failed.join('; '), /chrome burst: 1 of 2 runs answered ok with the wrong text \(a false ok\)/);
  assert.deepEqual(focusTimerVerdict({ series: [{ ...s, false_ok: 0, first_miss: { ok: false, answered_ok: false } }], audits: [], stops: [], skipped: [] }, { families: ['chrome'], pilot: true }).failed, [], 'a refused miss decides nothing');
});

// finding 6
test("a scene process that outlives its run is unclean, and the next start refuses what still names the deleted scratch", async () => {
  const proc = fresh('proc');
  const desktop = new Desktop({ cua: 'unused', run: 'survivor', reader: { async close() {} }, startActive: 0, nonce: 'n0' });
  desktop.leftoverOptions = { roots: [fresh('tmp')], proc };
  desktop.report = () => {};
  // a gedit the run spawned, its close's signal lost: still alive, its environment naming the run's scratch
  desktop.spawned.push({ pid: 7100, label: 'gedit-scene', start: '4321', exited: false });
  processIn(proc, 7100, { start: '4321', argv: ['gedit'], env: { HOME: `${desktop.dir}/home` }, uid: process.getuid() });
  desktop.close = async () => {};
  desktop.trace = {};
  desktop.finishTrace = async () => ({ start: null, end: null, holder: null, audit: { clean: true, traced: true, requests: 1, mutating: 0, foreign: [] }, record: { skipped: 'declined', clean: true, traced: false, requests: 0, mutating: 0, foreign: [] }, watchdog: { state: 'ended', clean: true }, skipped: [], chrome: null, session: null });
  await desktop.closeAll();
  assert.deepEqual(desktopEnding(desktop.ending).record.unclean, ['a process it spawned still runs: pid 7100 gedit-scene']);
  assert.equal(existsSync(desktop.dir), false);
  const next = startCheck({ roots: [fresh('tmp')], proc });
  assert.match(next.refused.map((r) => r.reason).join(), /its directory is gone and a process still references it: pid 7100/);
});
