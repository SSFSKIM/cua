// The engine-stop experiment's judges (engine-stop.mjs, M4's T7b), display-free: a run's pass, the verdict over the
// lanes, and finding a session's engine by its executable among the session's descendants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CASES, PATHS, engineStopVerdict, enginesUnder, runPasses } from '../../scripts/linux-engine-diff/engine-stop.mjs';

const hold = (over = {}) => ({ case: 'hold', held_before: true, keys_after: [], ...over });
const burst = (over = {}) => ({ case: 'burst', in_order: true, ...over });

test('a hold passes only when the key was down before the stop and nothing is down after it; a burst only when every key landed in order', () => {
  assert.equal(runPasses(hold()), true);
  assert.equal(runPasses(hold({ keys_after: [50] })), false, 'the key left down');
  assert.equal(runPasses(hold({ held_before: false })), false, 'no hold to release: the case proved nothing');
  assert.equal(runPasses(hold({ keys_after: null })), false, 'an unread keymap is no release');
  assert.equal(runPasses(burst()), true);
  assert.equal(runPasses(burst({ in_order: false })), false);
  assert.equal(runPasses(burst({ error: 'end_task failed' })), false, 'a run that failed on its way fails');
});

const rows = ({ drain = () => ({}), kill = () => ({}) } = {}) =>
  ['drain', 'kill'].flatMap((lane) =>
    PATHS.flatMap((path) =>
      CASES.flatMap((kind) =>
        [0, 1].map((trial) => {
          const base = { lane, path, case: kind, trial, engine_after_stop_ms: 400, engine_after_answer_ms: 420 };
          const pass = kind === 'hold' ? hold(base) : burst(base);
          const control = kind === 'hold' ? { ...pass, keys_after: [50] } : pass;
          return lane === 'drain' ? { ...pass, ...drain(path, kind, trial) } : { ...control, ...kill(path, kind, trial) };
        }),
      ),
    ),
  );

test('the verdict passes when every drain run passes and the control leaves the key down on every path', () => {
  const { md, failed } = engineStopVerdict(rows());
  assert.deepEqual(failed, []);
  assert.equal(md.filter((l) => l.startsWith('| drain')).length, PATHS.length * CASES.length);
  assert.match(md.find((l) => l.startsWith('| drain | idle | hold')), /\| 2 \| 2 \| 400 \| 420 \|$/);
});

test('one failed drain run fails the verdict, naming its path and case', () => {
  const { failed } = engineStopVerdict(rows({ drain: (path, kind, trial) => (path === 'signal' && kind === 'burst' && trial === 1 ? { in_order: false } : {}) }));
  assert.deepEqual(failed, ['drain signal burst: 1 of 2 failed']);
});

test('a control whose hold was released fails the verdict: then the check could not see a missing release', () => {
  const { failed } = engineStopVerdict(rows({ kill: (path, kind) => (path === 'remote' && kind === 'hold' ? { keys_after: [] } : {}) }));
  assert.equal(failed.length, 1);
  assert.match(failed[0], /^the control's hold released the key on remote/);
});

test('a lane, path or case with no run fails the verdict', () => {
  const { failed } = engineStopVerdict(rows().filter((r) => !(r.lane === 'drain' && r.path === 'eof')));
  assert.deepEqual(failed, ['drain eof hold: no run', 'drain eof burst: no run']);
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
