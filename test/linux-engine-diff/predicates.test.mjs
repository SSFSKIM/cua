import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseDragStatus } from '../../scripts/linux-engine-diff/drag.mjs';
import { OCCLUSION_PARKS, dndTook } from '../../scripts/linux-engine-diff/pointer-route.mjs';
import { ALLOWED_RUNS, LEAVE_RUNS, PREDICATE_CASES, REFUSED_RUNS, caseKey, caseLanes, judgeCase, judgePredicates, predicatePlan, predicatesMarkdown } from '../../scripts/linux-engine-diff/predicates.mjs';

const SENTENCE = 'firefox does not accept background input; use a dedicated desktop or activate the window first';
const HELD = { pointer: { held: true } };
const took = (engine, n, extra = {}) => Array.from({ length: n }, (_, i) => ({ engine, i, ok: true, took: true, witness: true, ...HELD, ...extra }));
const refusedRuns = (engine, n, extra = {}) => Array.from({ length: n }, (_, i) => ({ engine, i, ok: false, error: SENTENCE, took: false, witness: true, ...HELD, ...extra }));
const LEFT = 'firefox may not have taken the click: the desktop pointer left its window during the click, and firefox takes background pointer input only while the pointer is in its window. Read the window to see what happened before trying again';
const leftRuns = (engine, n, extra = {}) => Array.from({ length: n }, (_, i) => ({ engine, i, ok: false, error: LEFT, took: false, witness: true, ...HELD, ...extra }));
const counted = (over = {}) => ({ n: 0, took: 0, ok_took: 0, ok_no_effect: 0, refused: 0, refused_took: 0, left: 0, left_took: 0, park_missed: 0, unread: 0, ...over });
const allowedCase = PREDICATE_CASES.find((c) => c.kind === 'move' && c.occlusion === 'partial' && c.park === 'in');
const refusedCase = PREDICATE_CASES.find((c) => c.kind === 'select' && c.occlusion === 'visible' && c.park === 'out');

test('an allowed case passes only on 30 of 30 runs that took effect, each with the witness unchanged', () => {
  assert.equal(judgeCase(allowedCase, [...took('cua', 30), ...took('pinned', 30)]).pass, true);
  const short = judgeCase(allowedCase, took('cua', 29));
  assert.equal(short.pass, false);
  assert.deepEqual(short.failed, ['cua ran 29 of 30']);
  const missed = [...took('cua', 29), { engine: 'cua', i: 29, ok: true, took: false, witness: true, ...HELD }];
  assert.deepEqual(judgeCase(allowedCase, missed).failed, ['1 did not take effect'], 'one answer of ok with no effect fails the case');
  const refusedOnce = [...took('cua', 29), ...refusedRuns('cua', 1)];
  assert.deepEqual(judgeCase(allowedCase, refusedOnce).failed, ['1 did not take effect'], 'a refusal is not an effect');
  const seen = [...took('cua', 29), ...took('cua', 1, { witness: false })];
  assert.deepEqual(judgeCase(allowedCase, seen).failed, ['the witness changed on 1']);
});

test('a counterexample passes only while every run answers the Device mode sentence, unseen and with no effect', () => {
  const runs = [...refusedRuns('cua', 10), ...took('pinned', 10, { took: false }), ...took('cua:any-pointer', 10, { took: false })];
  const row = judgeCase(refusedCase, runs);
  assert.equal(row.pass, true);
  assert.deepEqual(row.counts.cua, counted({ n: 10, refused: 10 }));
  assert.deepEqual(row.counts.pinned, counted({ n: 10, ok_no_effect: 10 }), "the vendor's ok with no effect, beside it");
  assert.deepEqual(judgeCase(refusedCase, [...refusedRuns('cua', 9), ...took('cua', 1)]).failed, ['1 were not refused', '1 took effect']);
  const other = [...refusedRuns('cua', 9), { engine: 'cua', i: 9, ok: false, error: 'window 5 is unavailable.', took: false, witness: true, ...HELD }];
  assert.deepEqual(judgeCase(refusedCase, other).failed, ['1 were not refused'], 'another error is not the refusal');
  assert.deepEqual(judgeCase(refusedCase, refusedRuns('cua', 9)).failed, [`cua ran 9 of ${REFUSED_RUNS}`]);
  assert.deepEqual(judgeCase(refusedCase, refusedRuns('cua', 10, { witness: false })).failed, ['the witness changed on 10']);
});

test('a case of the manifest the run did not measure fails it, as a missing operation does', () => {
  const cases = [allowedCase, refusedCase];
  const runs = took('cua', ALLOWED_RUNS).map((r) => ({ ...r, case: caseKey(allowedCase) }));
  const verdict = judgePredicates(cases, runs);
  assert.equal(verdict.pass, false);
  assert.deepEqual(verdict.failed, ['firefox select visible pointer-out: not measured']);
  const all = judgePredicates(cases, [...runs, ...refusedRuns('cua', REFUSED_RUNS).map((r) => ({ ...r, case: caseKey(refusedCase) }))]);
  assert.equal(all.pass, true);
  assert.match(predicatesMarkdown(all.rows).at(-1), /^\| visible \| out \| select \| refused \| refused 10\/10, 0 took \|/);
});

test('a trial whose park missed is no proof: it is left out, and a case short of its valid trials fails', () => {
  const leave = PREDICATE_CASES.find((c) => c.expect === 'honest' && c.kind === 'click');
  const missed = { pointer: { held: false } };
  // the first proof's leave cells: the park missed on every run, each refused honestly
  const row = judgeCase(leave, refusedRuns('cua', LEAVE_RUNS, missed));
  assert.equal(row.pass, false);
  assert.deepEqual(row.failed, [`cua ran 0 valid of ${LEAVE_RUNS}: the park missed on ${LEAVE_RUNS}`]);
  assert.deepEqual(row.counts.cua, counted({ park_missed: LEAVE_RUNS }));
  const one = judgeCase(refusedCase, [...refusedRuns('cua', 9), ...refusedRuns('cua', 1, { pointer: null })]);
  assert.deepEqual(one.failed, [`cua ran 9 valid of ${REFUSED_RUNS}: the park missed on 1`], 'a run with no pointer record is a missed park');
  assert.equal(judgeCase(refusedCase, [...refusedRuns('cua', 10), ...refusedRuns('cua', 1, missed)]).pass, true, 'enough valid runs beside the missed one');
  const allowed = judgeCase(allowedCase, [...took('cua', 30), ...took('pinned', 2, missed)]);
  assert.deepEqual(allowed.counts.pinned, counted({ park_missed: 2 }), 'the lanes beside it count valid runs alone');
});

test("a run's effect is read whatever it answered: one unread is no proof, a refusal that took fails, a leave answer's is counted", () => {
  const unread = judgeCase(refusedCase, [...refusedRuns('cua', 9), ...refusedRuns('cua', 1, { took: null })]);
  assert.deepEqual(unread.failed, [`cua ran 9 valid of ${REFUSED_RUNS}: the effect not read on 1`]);
  assert.deepEqual(judgeCase(refusedCase, [...refusedRuns('cua', 9), ...refusedRuns('cua', 1, { took: true })]).failed, ['1 took effect'], 'refused, and input reached it');
  const leave = PREDICATE_CASES.find((c) => c.expect === 'honest' && c.kind === 'scroll');
  const row = judgeCase(leave, [...leftRuns('cua', 15), ...leftRuns('cua', 3, { took: true }), ...refusedRuns('cua', 2)]);
  assert.equal(row.pass, true, 'a "may not have taken" that took is still honest');
  assert.deepEqual(row.counts.cua, counted({ n: 20, took: 3, left: 18, left_took: 3, refused: 2 }));
  assert.match(predicatesMarkdown([row])[2], /\| ok and took 0, left 18 \(3 took\), refused 2 \(0 took\), ok with no effect 0 \(of 20\) \|/);
  const refusedTook = judgeCase(leave, [...leftRuns('cua', 19), ...refusedRuns('cua', 1, { took: true })]);
  assert.deepEqual(refusedTook.failed, ['1 were refused and took effect']);
  assert.deepEqual(judgeCase(leave, [...leftRuns('cua', 19), ...leftRuns('cua', 1, { took: null })]).failed, [`cua ran 19 valid of ${LEAVE_RUNS}: the effect not read on 1`]);
});

test('a refused drag and drop whose drop count was not read is no proof that nothing dropped', () => {
  // the reviewer's reproduction: a P6 refused case, 10 refusals answered, 10 drop counts not read after them
  const refusedDnd = PREDICATE_CASES.find((c) => c.kind === 'dnd' && c.expect === 'refused');
  const unread = { ...parseDragStatus([]).dnd, log: null };
  const runs = refusedRuns('cua', 10).map((r) => ({ ...r, before: { drops: 3 }, after: unread })).map((r) => ({ ...r, took: dndTook(r) }));
  const row = judgeCase(refusedDnd, runs);
  assert.equal(row.pass, false);
  assert.equal(row.counts.cua.unread, 10);
  assert.equal(row.counts.cua.n, 0);
  assert.deepEqual(row.failed, [`cua ran 0 valid of ${REFUSED_RUNS}: the effect not read on 10`]);
});

test("the manifest: Gecko's five pointer kinds at every pointer place, allowed only with the pointer in the window", () => {
  const keys = PREDICATE_CASES.map(caseKey);
  assert.equal(new Set(keys).size, keys.length, 'each case once');
  const places = Object.values(OCCLUSION_PARKS).flat().length;
  assert.equal(PREDICATE_CASES.length, places * 5 + 5, 'every place, and the five leave cases');
  for (const c of PREDICATE_CASES) {
    assert.equal(c.family, 'firefox');
    assert.equal(c.expect, c.park === 'in' ? 'allowed' : c.park === 'leave' ? 'honest' : 'refused', caseKey(c));
    assert.ok(c.why);
  }
  assert.deepEqual(PREDICATE_CASES.filter((c) => c.expect === 'honest').map(caseKey), ['firefox click visible pointer-leave', 'firefox scroll visible pointer-leave', 'firefox move visible pointer-leave', 'firefox select visible pointer-leave', 'firefox dnd visible pointer-leave']);
  // Firefox's HTML5 drag and drop on the drag page (ffdnd-fix): its own drag-and-drop grab is no leave
  const dnd = PREDICATE_CASES.filter((c) => c.kind === 'dnd');
  assert.ok(dnd.every((c) => c.group === 'drag'), 'on the drag page');
  assert.deepEqual(dnd.filter((c) => c.expect === 'allowed').map(caseKey), ['firefox dnd visible pointer-in', 'firefox dnd partial pointer-in']);
  // the newly allowed case the window rule refused: a half-covered window with the pointer in its visible part
  for (const kind of ['click', 'scroll', 'move', 'select', 'dnd']) {
    assert.ok(keys.includes(`firefox ${kind} partial pointer-in`), `${kind}: newly allowed`);
    assert.equal(PREDICATE_CASES.find((c) => caseKey(c) === `firefox ${kind} visible pointer-out`).expect, 'refused', `${kind}: the false success, now refused`);
  }
  assert.ok(PREDICATE_CASES.filter((c) => c.occlusion === 'covered').every((c) => c.expect === 'refused'), 'a fully covered window refuses every kind');
});

test('the lanes: cua as it ships and the pinned build; the pointer-unjudged lane only on a refused case', () => {
  const args = { vendor: 'v', cua: 'c' };
  assert.deepEqual(caseLanes(allowedCase, args).map((l) => l.label), ['cua', 'pinned']);
  const lanes = caseLanes(refusedCase, args);
  assert.deepEqual(lanes.map((l) => l.label), ['cua', 'pinned', 'cua:any-pointer']);
  assert.deepEqual(lanes[0].args, [], 'cua as it ships');
  assert.deepEqual(lanes[2].args, ['--ignore-pointer']);
  assert.equal(predicatePlan({}).length, PREDICATE_CASES.length, 'the gate runs every case');
  assert.ok(predicatePlan({ ops: ['move'] }).every((c) => c.kind === 'move'));
  assert.throws(() => predicatePlan({ plan: 'pointer' }), /pointer-route/);
  assert.deepEqual(predicatePlan({ plan: 'leave', ops: ['click', 'scroll'] }).map(caseKey), ['firefox click visible pointer-leave', 'firefox scroll visible pointer-leave'], 'the leave cases alone');
  assert.deepEqual(predicatePlan({ ops: ['dnd'] }).filter((c) => c.expect !== 'refused').map(caseKey), ['firefox dnd visible pointer-in', 'firefox dnd partial pointer-in', 'firefox dnd visible pointer-leave'], "the drag and drop's cases by --ops");
});

test('a leave case passes while no run answers ok with no effect: each took, was refused, or says the pointer left', () => {
  const leave = PREDICATE_CASES.find((c) => c.expect === 'honest' && c.kind === 'click');
  const mixed = [...took('cua', 10), ...refusedRuns('cua', 5), ...leftRuns('cua', 5)];
  const row = judgeCase(leave, mixed);
  assert.equal(row.pass, true, row.failed.join());
  assert.deepEqual(row.counts.cua, counted({ n: 20, took: 10, ok_took: 10, refused: 5, left: 5 }));
  assert.deepEqual(judgeCase(leave, [...took('cua', 19), ...took('cua', 1, { took: false })]).failed, ['1 answered ok with no effect'], 'the false success T19 is for');
  assert.deepEqual(judgeCase(leave, [...took('cua', 19), ...refusedRuns('cua', 1, { error: 'boom' })]).failed, ['1 answered another error']);
  assert.deepEqual(judgeCase(leave, took('cua', LEAVE_RUNS - 1)).failed, [`cua ran ${LEAVE_RUNS - 1} of ${LEAVE_RUNS}`]);
  assert.deepEqual(caseLanes(leave, { vendor: 'v', cua: 'c' }).map((l) => l.label), ['cua', 'pinned'], "the vendor's answer beside it");
});
