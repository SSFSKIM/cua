// P6's Fisher rule in the predicates judge (M5, T2; the design session, sminos 662 on ruling 650's principle, and 697).
// On an allowed drag-and-drop case an honest miss (cua answered an error and no drop landed) is a landing miss, judged
// by the one-sided Fisher test of cua's misses against the pinned build's at LOAD_P, the pinned build's reference a full
// side; an ok with no effect, and an error that took effect, fail hard. The fixture is the stored P6 record the ruling
// was made on, and the controls are the ones m4/gate/scripts/rejudge-dnd-controls.mjs held.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LOAD_P } from '../../scripts/linux-engine-diff/drag-judge.mjs';
import { finishOutcome, measuredOutcome } from '../../scripts/linux-engine-diff/experiments.mjs';
import { ALLOWED_RUNS, PREDICATE_CASES, caseKey, judgeCase, judgePredicates, predicatePlan, predicatesMarkdown, predicatesResult } from '../../scripts/linux-engine-diff/predicates.mjs';
import { CANDIDATES, gateRows } from './gate-rows.mjs';

const HELD = { pointer: { held: true } };
const LEFT = 'firefox may not have taken the drag: the desktop pointer left its window during the drag, and firefox takes background pointer input only while the pointer is in its window. Read the window to see what happened before trying again';
const took = (engine, n, extra = {}) => Array.from({ length: n }, (_, i) => ({ engine, i, ok: true, took: true, witness: true, ...HELD, ...extra }));
const honest = (engine, n) => Array.from({ length: n }, (_, i) => ({ engine, i: 100 + i, ok: false, error: LEFT, took: false, witness: true, ...HELD }));
const dnd = PREDICATE_CASES.find((c) => c.kind === 'dnd' && c.occlusion === 'visible' && c.park === 'in');
const move = PREDICATE_CASES.find((c) => c.kind === 'move' && c.occlusion === 'visible' && c.park === 'in');

test("an allowed drag and drop's honest misses are landing misses, judged by one-sided Fisher against the pinned build", () => {
  assert.equal(LOAD_P, 0.05);
  const row = judgeCase(dnd, [...took('cua', 29), ...honest('cua', 1), ...took('pinned', 30)]);
  assert.equal(row.pass, true, row.failed.join());
  assert.equal(row.landing.p, 0.5);
  assert.equal(row.landing.honest, 1);
  // the ruling's bounds: against the pinned 30 of 30, 4 honest misses in 30 pass and 5 fail
  assert.equal(judgeCase(dnd, [...took('cua', 26), ...honest('cua', 4), ...took('pinned', 30)]).pass, true);
  const five = judgeCase(dnd, [...took('cua', 25), ...honest('cua', 5), ...took('pinned', 30)]);
  assert.equal(five.pass, false);
  assert.match(five.failed.join(), /landed 25 of 30 against the pinned build's 30 of 30 \(one-sided Fisher p = 0\.0261\)/);
  // the other kinds keep 30 of 30
  assert.deepEqual(judgeCase(move, [...took('cua', 29), ...honest('cua', 1), ...took('pinned', 30)]).failed, ['1 did not take effect']);
});

test('ok with no effect and an error that took effect fail hard; the reference must be a full side; the rest is the manifest\'s', () => {
  const noEffect = judgeCase(dnd, [...took('cua', 29), ...took('cua', 1, { took: false }), ...took('pinned', 30)]);
  assert.deepEqual(noEffect.failed, ['1 answered ok with no effect']);
  const errorTook = judgeCase(dnd, [...took('cua', 29), ...took('cua', 1, { ok: false, error: 'some error' }), ...took('pinned', 30)]);
  assert.deepEqual(errorTook.failed, ['1 answered an error and took effect']);
  // the review's case (ruling 697): a raw-count shortcut passed 22 of 30 against 20 of 20, where Fisher's p is 0.0109
  const shortcut = judgeCase(dnd, [...took('cua', 22), ...honest('cua', 8), ...took('pinned', 20), ...took('pinned', 10, { pointer: { held: false } })]);
  assert.equal(shortcut.pass, false);
  assert.match(shortcut.failed.join(), /p = 0\.0109/);
  // a short reference of lucky runs excuses nothing
  const short = judgeCase(dnd, [...took('cua', 29), ...honest('cua', 1), ...took('pinned', 20)]);
  assert.deepEqual(short.failed, [`the pinned build's reference is 20 valid runs, under the ${ALLOWED_RUNS} a side the landing is judged on`]);
  assert.match(judgeCase(dnd, [...took('cua', 30)]).failed.join(), /the pinned build's reference is 0 valid runs/, 'no reference at all');
  assert.deepEqual(judgeCase(dnd, [...took('cua', 29), ...took('pinned', 30)]).failed, [`cua ran 29 of ${ALLOWED_RUNS}`]);
  assert.deepEqual(judgeCase(dnd, [...took('cua', 29), ...honest('cua', 1).map((r) => ({ ...r, witness: false })), ...took('pinned', 30)]).failed, ['the witness changed on 1']);
  assert.match(predicatesMarkdown([judgeCase(dnd, [...took('cua', 29), ...honest('cua', 1), ...took('pinned', 30)])]).at(-1), /took 29\/30, 1 honest miss, one-sided Fisher p = 0\.5000 against the pinned build/);
});

// ---------------------------------------------------------------------------------------------------------------
// the stored record

const CASE = 'firefox dnd visible pointer-in';
const runsOf = (rows) => rows.filter((r) => r.kind === 'pointer-route-run');
const judgeRecord = (rows) => judgePredicates(predicatePlan({ ops: ['dnd'] }), runsOf(rows));
const cuaRuns = (rows) => runsOf(rows).filter((x) => x.case === CASE && x.engine === 'cua');
const pinnedRuns = (rows) => runsOf(rows).filter((x) => x.case === CASE && x.engine === 'pinned');
const missRun = (run) => Object.assign(run, { ok: false, error: LEFT, took: false });
const parkMissed = (run) => Object.assign(run, { pointer: { ...run.pointer, held: false } });

test("candidate 1's P6: the predicates judge with Fisher passes it; the judge before the rule failed it", () => {
  const rows = gateRows(CANDIDATES[1], 'P6');
  assert.deepEqual(rows.find((r) => r.kind === 'experiment-summary').failed, [`${CASE}: 1 did not take effect`], "the gate's judge as it ran");
  const v = judgeRecord(rows);
  assert.deepEqual(v.failed, []);
  const row = v.rows.find((r) => caseKey(r) === CASE);
  assert.deepEqual({ took: row.counts.cua.took, n: row.counts.cua.n, p: row.landing.p, pinned: row.counts.pinned.took }, { took: 29, n: 30, p: 0.5, pinned: 30 });
});

test("candidate 1's P6 at the experiment's finalization: the ruling's pass stands, and a foreign change at the cleanup or an unmeasured case fails it", () => {
  // the run as experiments.mjs ends it: the predicates' result, the measured outcome, then the harness's own trace
  const finish = (rows, foreign = []) => finishOutcome(measuredOutcome(predicatesResult(predicatePlan({ ops: ['dnd'] }), runsOf(rows), [])), foreign);
  assert.deepEqual(finish(gateRows(CANDIDATES[1], 'P6')), { complete: true, failed: [] });
  const FOREIGN = 'the harness: 0x00a00003 ConfigureWindow (raised)';
  assert.deepEqual(finish(gateRows(CANDIDATES[1], 'P6'), [FOREIGN]), { complete: false, failed: [`a window the harness did not open was changed: ${FOREIGN}`] });
  const gone = gateRows(CANDIDATES[1], 'P6').filter((r) => r.case !== 'firefox dnd covered pointer-out');
  assert.deepEqual(finish(gone), { complete: false, failed: ['firefox dnd covered pointer-out: not measured'] });
  // a measurement error the experiment met fails it too
  const errored = finishOutcome(measuredOutcome(predicatesResult(predicatePlan({ ops: ['dnd'] }), runsOf(gateRows(CANDIDATES[1], 'P6')), ['firefox dnd visible pointer-in: the park did not start'])), []);
  assert.equal(errored.complete, false);
});

test("candidate 1's P6: every control the re-judge held fails the predicates judge", () => {
  const controls = {
    'the honest miss answered ok instead (ok with no effect)': (r) => { const m = cuaRuns(r).find((x) => !x.took); Object.assign(m, { ok: true }); delete m.error; },
    'a clear loss: 7 more honest misses (22 of 30 against 30 of 30)': (r) => cuaRuns(r).filter((x) => x.took).slice(0, 7).forEach(missRun),
    'an error that took effect': (r) => Object.assign(cuaRuns(r).find((x) => x.took), { ok: false, error: 'some error' }),
    'a refused case that took effect': (r) => { runsOf(r).find((y) => y.case === 'firefox dnd visible pointer-out' && y.engine === 'cua').took = true; },
    'the witness changed': (r) => { cuaRuns(r)[0].witness = false; },
    "unequal valid runs, the review's case: cua 22 of 30 against the pinned build's 20 of 20 (p = 0.0109)": (r) => { cuaRuns(r).filter((x) => x.took).slice(0, 7).forEach(missRun); pinnedRuns(r).slice(0, 10).forEach(parkMissed); },
    "unequal valid runs, the reference full: cua 31 of 40 against the pinned build's 30 of 30 (p = 0.0042)": (r) => {
      const taken = cuaRuns(r).filter((x) => x.took);
      r.push(...taken.slice(0, 10).map((x, i) => ({ ...structuredClone(x), i: 100 + i })));
      taken.slice(0, 8).forEach(missRun);
    },
    "the pinned build's reference short: cua 29 of 30 against 20 of 20 (p = 0.6)": (r) => pinnedRuns(r).slice(0, 10).forEach(parkMissed),
    'a case of the step the run never measured (its runs gone)': (r) => { for (let i = r.length - 1; i >= 0; i--) if (r[i].case === 'firefox dnd covered pointer-out') r.splice(i, 1); },
  };
  for (const [name, edit] of Object.entries(controls)) {
    const rows = gateRows(CANDIDATES[1], 'P6');
    edit(rows);
    assert.notDeepEqual(judgeRecord(rows).failed, [], name);
  }
});
