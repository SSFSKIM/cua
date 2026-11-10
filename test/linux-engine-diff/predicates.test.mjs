import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DRAG_FAMILIES } from '../../scripts/linux-engine-diff/drag.mjs';
import { ALLOWED_RUNS, DRAG_KINDS, OCCLUSIONS, PREDICATE_CASES, REFUSED_RUNS, caseKey, caseLanes, judgeCase, judgePredicates, predicatePlan, predicatesMarkdown } from '../../scripts/linux-engine-diff/predicates.mjs';

const SENTENCE = 'firefox does not accept background input; use a dedicated desktop or activate the window first';
const took = (engine, n, extra = {}) => Array.from({ length: n }, (_, i) => ({ engine, i, ok: true, took: true, witness: true, ...extra }));
const refusedRuns = (engine, n, extra = {}) => Array.from({ length: n }, (_, i) => ({ engine, i, ok: false, error: SENTENCE, took: false, witness: true, ...extra }));
const allowedCase = { family: 'firefox', kind: 'move', occlusion: 'partial', expect: 'allowed', why: 'w' };
const refusedCase = { family: 'firefox', kind: 'canvas', occlusion: 'partial', expect: 'refused', why: 'w' };

test('an allowed case passes only on 30 of 30 runs that took effect, each with the witness unchanged', () => {
  assert.equal(judgeCase(allowedCase, [...took('cua', 30), ...took('pinned', 30)]).pass, true);
  const short = judgeCase(allowedCase, took('cua', 29));
  assert.equal(short.pass, false);
  assert.deepEqual(short.failed, ['cua ran 29 of 30']);
  const missed = [...took('cua', 29), { engine: 'cua', i: 29, ok: true, took: false, witness: true }];
  assert.deepEqual(judgeCase(allowedCase, missed).failed, ['1 did not take effect'], 'one miss fails the case');
  const refusedOnce = [...took('cua', 29), ...refusedRuns('cua', 1)];
  assert.deepEqual(judgeCase(allowedCase, refusedOnce).failed, ['1 did not take effect'], 'a refusal is not an effect');
  const seen = [...took('cua', 29), ...took('cua', 1, { witness: false })];
  assert.deepEqual(judgeCase(allowedCase, seen).failed, ['the witness changed on 1']);
  assert.equal(judgeCase(allowedCase, [...took('cua', 30), ...took('pinned', 0)]).pass, true, "the pinned build's counts are beside it, never judged");
});

test('a counterexample passes only while every run answers the Device mode sentence, unseen and with no effect', () => {
  const runs = [...refusedRuns('cua', 10), ...took('pinned', 3), ...took('cua:any-cover', 0), ...refusedRuns('cua:any-cover', 10, { ok: true, error: undefined })];
  const row = judgeCase(refusedCase, runs);
  assert.equal(row.pass, true);
  assert.deepEqual(row.counts.cua, { took: 0, n: 10, refused: 10 });
  assert.deepEqual(row.counts.pinned, { took: 3, n: 3, refused: 0 });
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
  assert.deepEqual(verdict.failed, ['firefox canvas partial: not measured']);
  const all = judgePredicates(cases, [...runs, ...refusedRuns('cua', REFUSED_RUNS).map((r) => ({ ...r, case: caseKey(refusedCase) }))]);
  assert.equal(all.pass, true);
  assert.match(predicatesMarkdown(all.rows).at(-1), /\| partial \| canvas \| refused \| refused 10\/10 \|/);
});

test("the manifest: Gecko's move and every drag kind, each occlusion's newly allowed cases and its counterexamples", () => {
  const keys = PREDICATE_CASES.map(caseKey);
  assert.equal(new Set(keys).size, keys.length, 'each case once');
  for (const c of PREDICATE_CASES) {
    assert.ok(OCCLUSIONS[c.occlusion], c.occlusion);
    assert.ok(['allowed', 'refused'].includes(c.expect));
    assert.ok(c.why);
  }
  assert.deepEqual(DRAG_KINDS, DRAG_FAMILIES.firefox, "the drag experiment's Firefox kinds");
  const allowedAt = (occlusion) => PREDICATE_CASES.filter((c) => c.occlusion === occlusion && c.expect === 'allowed').map((c) => c.kind);
  // every occlusion that newly allows something also shows the window's rule still refusing a click and a scroll
  for (const occlusion of Object.keys(OCCLUSIONS).filter((o) => allowedAt(o).length)) {
    for (const kind of ['click', 'scroll']) assert.ok(keys.includes(`firefox ${kind} ${occlusion}`), `${kind} ${occlusion}`);
  }
  assert.ok(!PREDICATE_CASES.some((c) => ['click', 'scroll'].includes(c.kind) && c.expect === 'allowed'), "scroll and click keep the window's rule");
  assert.deepEqual(allowedAt('covered'), [], 'a fully covered window refuses every kind');
  // each move and drag kind is allowed somewhere and refused somewhere: a newly allowed case and its counterexample
  for (const kind of ['move', ...DRAG_KINDS]) {
    assert.ok(PREDICATE_CASES.some((c) => c.kind === kind && c.expect === 'allowed'), `${kind} allowed`);
    assert.ok(PREDICATE_CASES.some((c) => c.kind === kind && c.expect === 'refused'), `${kind} refused`);
  }
});

test('the lanes: the pinned reference and cua; the any-cover lane only on a refused move or drag', () => {
  const args = { vendor: 'v', cua: 'c' };
  assert.deepEqual(caseLanes(allowedCase, args).map((l) => l.label), ['pinned', 'cua']);
  const lanes = caseLanes(refusedCase, args);
  assert.deepEqual(lanes.map((l) => l.label), ['pinned', 'cua', 'cua:any-cover']);
  assert.deepEqual(lanes[2].args, ['--drag-ignore-cover']);
  assert.deepEqual(caseLanes({ ...refusedCase, kind: 'click' }, args).map((l) => l.label), ['pinned', 'cua'], "the cover flag does not touch the window's rule");
  assert.equal(predicatePlan({}).length, PREDICATE_CASES.length, 'the gate runs every case');
  assert.ok(predicatePlan({ ops: ['move'] }).every((c) => c.kind === 'move'));
});
