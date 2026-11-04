// The engine-stop experiment's judges (engine-stop.mjs, M4's T7b), display-free: a run's pass, the verdict over the
// lanes, and finding a session's engine by its executable among the session's descendants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CASES, PATHS, casesOf, controlLabel, engineStopVerdict, enginesUnder, runPasses } from '../../scripts/linux-engine-diff/engine-stop.mjs';

const hold = (over = {}) => ({ case: 'hold', engines: 1, held_before: true, keys_after: [], ...over });
const burst = (over = {}) => ({ case: 'burst', engines: 1, in_order: true, ...over });

test('a hold passes only when the key was down before the stop and nothing is down after it; a burst only when every key landed in order', () => {
  assert.equal(runPasses(hold()), true);
  assert.equal(runPasses(hold({ keys_after: [50] })), false, 'the key left down');
  assert.equal(runPasses(hold({ held_before: false })), false, 'no hold to release: the case proved nothing');
  assert.equal(runPasses(hold({ keys_after: null })), false, 'an unread keymap is no release');
  assert.equal(runPasses(burst()), true);
  assert.equal(runPasses(burst({ in_order: false })), false);
  assert.equal(runPasses(burst({ error: 'end_task failed' })), false, 'a run that failed on its way fails');
  assert.equal(runPasses(hold({ engines: 0 })), false, 'no engine found before the stop: nothing was stopped, and its gone-ness proves nothing');
  assert.equal(runPasses(burst({ engines: 2 })), false, 'not the one engine of the session');
});

const rows = ({ drain = () => ({}), kill = () => ({}), paths = PATHS, cut = false } = {}) =>
  ['drain', 'kill'].flatMap((lane) =>
    paths.flatMap((path) =>
      casesOf(path, CASES).flatMap((kind) =>
        [0, 1].map((trial) => {
          const base = { lane, path, case: kind, trial, engine_after_stop_ms: 400, engine_after_answer_ms: 420 };
          const pass = kind === 'hold' ? hold(base) : burst(base);
          const control = kind === 'hold' ? { ...pass, keys_after: [50] } : { ...pass, in_order: !(cut && trial === 0) };
          return lane === 'drain' ? { ...pass, ...drain(path, kind, trial) } : { ...control, ...kill(path, kind, trial) };
        }),
      ),
    ),
  );

test('the verdict passes when every drain run passes and the control leaves the key down on every path', () => {
  const { md, failed } = engineStopVerdict(rows());
  assert.deepEqual(failed, []);
  assert.equal(md.filter((l) => l.startsWith('| drain')).length, PATHS.flatMap((path) => casesOf(path, CASES)).length);
  assert.match(md.find((l) => l.startsWith('| drain | idle | hold')), /\| 2 \| 2 \| 400 \| 420 \|$/);
});

test('one failed drain run fails the verdict, naming its path and case', () => {
  const { failed } = engineStopVerdict(rows({ drain: (path, kind, trial) => (path === 'signal' && kind === 'burst' && trial === 1 ? { in_order: false } : {}) }));
  assert.deepEqual(failed, ['drain signal burst: 1 of 2 failed']);
});

test('a control whose hold was released fails the verdict: then the check could not see a missing release', () => {
  const { failed } = engineStopVerdict(rows({ kill: (path, kind) => (path === 'remote' && kind === 'hold' ? { keys_after: [] } : {}) }));
  assert.deepEqual(failed, ["kill remote hold: 2 of 2 did not leave the key down (the control's failure)"]);
});

test('a lane, path or case with no run fails the verdict', () => {
  const { failed } = engineStopVerdict(rows().filter((r) => !(r.lane === 'drain' && r.path === 'eof')));
  assert.deepEqual(failed, ['drain eof hold: no run', 'drain eof burst: no run']);
});

test('a control that never reached its failure fails the verdict: a run that errored is not the held-input failure it stands for', () => {
  // a display-free probe: every control errored before any input was sent, and no engine was found
  const probe = { error: 'initialize failed; no input was sent', engines: 0, held_before: undefined, keys_after: null, in_order: undefined };
  const { failed } = engineStopVerdict(rows({ kill: () => probe }));
  assert.ok(failed.includes("kill idle hold: 2 of 2 did not leave the key down (the control's failure): 2 errored"), failed.join('\n'));
  assert.ok(failed.includes('kill idle burst: 2 of 2 errored'), failed.join('\n'));
  const { failed: one } = engineStopVerdict(rows({ kill: (path, kind, trial) => (path === 'eof' && kind === 'hold' && trial === 1 ? { keys_after: [] } : {}) }));
  assert.deepEqual(one, ["kill eof hold: 1 of 2 did not leave the key down (the control's failure)"]);
});

test('a drain run that found no engine fails, however clean its effect', () => {
  const { failed } = engineStopVerdict(rows({ drain: (path, kind) => (path === 'idle' && kind === 'hold' ? { engines: 0 } : {}) }));
  assert.deepEqual(failed, ['drain idle hold: 2 of 2 failed']);
});

test('where the burst must show the cut, a control that lost no key fails the verdict, and one that cut passes it', () => {
  const { failed, md } = engineStopVerdict(rows(), { burstControl: 'cut' });
  assert.deepEqual(failed, PATHS.filter((path) => casesOf(path, CASES).includes('burst')).map((path) => `kill ${path} burst: the control cut no burst (0 of 2): no pending burst was shown`));
  assert.deepEqual(engineStopVerdict(rows({ cut: true }), { burstControl: 'cut' }).failed, []);
  assert.match(md.join('\n'), /\| kill \| idle \| burst \| 2 \| 2 \|/);
});

test('held back past upstream escalation: hold only; the control fails sandboxed, and with the sandbox disabled it is reported, not required', () => {
  assert.deepEqual(casesOf('held-back', CASES), ['hold']);
  assert.deepEqual(casesOf('eof', CASES), CASES);
  const paths = ['held-back'];
  assert.deepEqual(engineStopVerdict(rows({ paths }), { paths }).failed, []);
  const released = rows({ paths, kill: () => ({ keys_after: [] }) });
  assert.deepEqual(engineStopVerdict(released, { paths }).failed, ["kill held-back hold: 2 of 2 did not leave the key down (the control's failure)"]);
  assert.deepEqual(engineStopVerdict(released, { paths, sandbox: 'disabled' }).failed, [], 'there the group SIGTERM reaches the engine first in either lane');
});

test('the control is recorded by a label, never by its path under a home', () => {
  assert.equal(controlLabel('/Users/someone/.local/share/cua-171/task57/control-f59575fb'), 'control-f59575fb');
  assert.equal(controlLabel(undefined), null);
});

test("a session's engine is the descendant running the engine's executable, never one elsewhere or one only named for it", (t) => {
  const proc = mkdtempSync(join(tmpdir(), 'cua171-proc-'));
  t.after(() => rmSync(proc, { recursive: true, force: true }));
  const bin = join(proc, 'cua-engine');
  writeFileSync(bin, '');
  const other = join(proc, 'sleep');
  writeFileSync(other, '');
  // pid, ppid, exe: 100 the session, 110 the supervisor, 120 the worker, 130 its engine, 140 a process of the worker's
  // named cua-engine, 200 another session's engine (the harness's own reader)
  const procs = [[100, 1, other], [110, 100, other], [120, 110, other], [130, 120, bin], [140, 120, other], [200, 1, bin]];
  for (const [pid, ppid, exe] of procs) {
    mkdirSync(join(proc, String(pid)));
    writeFileSync(join(proc, String(pid), 'stat'), `${pid} (${pid === 140 ? 'cua-engine' : 'x'}) S ${ppid} 0 0`);
    symlinkSync(exe, join(proc, String(pid), 'exe'));
  }
  assert.deepEqual(enginesUnder(100, bin, { proc }), [130]);
  assert.deepEqual(enginesUnder(120, bin, { proc }), [130]);
  assert.deepEqual(enginesUnder(130, bin, { proc }), []);
});
