import assert from 'node:assert/strict';
import { test } from 'node:test';

import { OCCLUSION_PARKS } from '../../scripts/linux-engine-diff/pointer-route.mjs';
import { ALLOWED_RUNS, PREDICATE_CASES, REFUSED_RUNS, caseKey, caseLanes, judgeCase, judgePredicates, predicatePlan, predicatesMarkdown } from '../../scripts/linux-engine-diff/predicates.mjs';

const SENTENCE = 'firefox does not accept background input; use a dedicated desktop or activate the window first';
const took = (engine, n, extra = {}) => Array.from({ length: n }, (_, i) => ({ engine, i, ok: true, took: true, witness: true, ...extra }));
const refusedRuns = (engine, n, extra = {}) => Array.from({ length: n }, (_, i) => ({ engine, i, ok: false, error: SENTENCE, took: false, witness: true, ...extra }));
const allowedCase = PREDICATE_CASES.find((c) => c.kind === 'move' && c.occlusion === 'partial' && c.park === 'in');
const refusedCase = PREDICATE_CASES.find((c) => c.kind === 'select' && c.occlusion === 'visible' && c.park === 'out');

test('an allowed case passes only on 30 of 30 runs that took effect, each with the witness unchanged', () => {
  assert.equal(judgeCase(allowedCase, [...took('cua', 30), ...took('pinned', 30)]).pass, true);
  const short = judgeCase(allowedCase, took('cua', 29));
  assert.equal(short.pass, false);
  assert.deepEqual(short.failed, ['cua ran 29 of 30']);
  const missed = [...took('cua', 29), { engine: 'cua', i: 29, ok: true, took: false, witness: true }];
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
  assert.deepEqual(row.counts.cua, { took: 0, n: 10, refused: 10 });
  assert.deepEqual(row.counts.pinned, { took: 0, n: 10, refused: 0 }, "the vendor's ok with no effect, beside it");
  assert.deepEqual(judgeCase(refusedCase, [...refusedRuns('cua', 9), ...took('cua', 1)]).failed, ['1 were not refused', '1 took effect']);
  const other = [...refusedRuns('cua', 9), { engine: 'cua', i: 9, ok: false, error: 'window 5 is unavailable.', took: false, witness: true }];
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
  assert.match(predicatesMarkdown(all.rows).at(-1), /^\| visible \| out \| select \| refused \| refused 10\/10 \|/);
});

test("the manifest: Gecko's four pointer kinds at every pointer place, allowed only with the pointer in the window", () => {
  const keys = PREDICATE_CASES.map(caseKey);
  assert.equal(new Set(keys).size, keys.length, 'each case once');
  const places = Object.values(OCCLUSION_PARKS).flat().length;
  assert.equal(PREDICATE_CASES.length, places * 4);
  for (const c of PREDICATE_CASES) {
    assert.equal(c.family, 'firefox');
    assert.equal(c.expect, c.park === 'in' ? 'allowed' : 'refused', caseKey(c));
    assert.ok(c.why);
  }
  // the newly allowed case the window rule refused: a half-covered window with the pointer in its visible part
  for (const kind of ['click', 'scroll', 'move', 'select']) {
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
});
