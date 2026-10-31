import assert from 'node:assert/strict';
import { test } from 'node:test';

import { eventSpeeds, medianDifferenceInterval } from '../../scripts/linux-engine-diff/events.mjs';
import { judgeOperation } from '../../scripts/linux-engine-diff/stats.mjs';

const VENDORS = ['pinned', 'newest'];
const opts = { vendors: VENDORS, candidate: 'cua', noise: medianDifferenceInterval };

/** Each engine's samples of one series: `{engine: [ms...]}`, every request answered with its effect. */
function rowsOf(series, byEngine) {
  return Object.entries(byEngine).flatMap(([engine, times]) => times.map((ms, i) => ({ engine, series, ms, ok: true, witness: true, i, block: 0 })));
}
const spread = (n, lo, hi) => Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
const flat = (n, v) => Array.from({ length: n }, (_, i) => v + (i % 3) * 0.01);

test('a faster median with a wide interval is undetermined, not a pass (Acceptance 3: the interval guard alone)', () => {
  // cua's median 35 ms under the bar's 40, its samples spread from 0 to 70: the interval reaches far past 2 ms
  const rows = rowsOf('warm', { pinned: flat(24, 40), newest: flat(24, 45), cua: spread(24, 0, 70) });
  const v = judgeOperation(rows, opts);
  assert.equal(v.pass, false);
  assert.equal(v.undetermined.length, 1);
  assert.equal(v.undetermined[0].series, 'warm');
  assert.match(v.reasons[0], /warm .*undetermined/);
});

test('a faster median with a tight interval passes', () => {
  const rows = rowsOf('warm', { pinned: flat(24, 40), newest: flat(24, 45), cua: flat(24, 30) });
  const v = judgeOperation(rows, opts);
  assert.equal(v.pass, true, v.reasons.join('; '));
  assert.deepEqual(v.undetermined, []);
  assert.deepEqual(v.labels.map((l) => [l.series, l.label]), [['warm', 'faster']]);
});

test('a passing series is labelled by its interval: faster, same (within noise), or within the bound', async () => {
  const { speedLabel } = await import('../../scripts/linux-engine-diff/stats.mjs');
  assert.equal(speedLabel([-3, -1]), 'faster');
  assert.equal(speedLabel([-1, 0.5]), 'same (within noise)');
  assert.equal(speedLabel([0.2, 0.6]), 'within the bound');
  // a small measured loss inside the bound passes, labelled as such and never as noise
  const v = judgeOperation(rowsOf('warm', { pinned: flat(24, 40), newest: flat(24, 45), cua: flat(24, 40.5) }), opts);
  assert.equal(v.pass, true, v.reasons.join('; '));
  assert.deepEqual(v.labels.map((l) => [l.series, l.label]), [['warm', 'within the bound']]);
  assert.deepEqual(v.noise, []);
  assert.equal(v.intervals[0].label, 'within the bound');
});

test('under 20 samples a side a series is undetermined whichever way its median points, never judged on medians', () => {
  for (const cua of [flat(12, 10), flat(12, 90)]) {
    const v = judgeOperation(rowsOf('cold', { pinned: flat(12, 40), newest: flat(12, 45), cua }), opts);
    assert.equal(v.pass, false);
    assert.deepEqual(v.undetermined.map((u) => [u.series, u.samples]), [['cold', 12]]);
  }
  // 20 a side for cua and the faster build is enough, whatever the slower build has
  const v = judgeOperation(rowsOf('cold', { pinned: flat(20, 40), newest: flat(3, 45), cua: flat(20, 30) }), opts);
  assert.equal(v.pass, true, v.reasons.join('; '));
});

test('a loss whose interval lies above 0 fails as a loss, not as undetermined', () => {
  const v = judgeOperation(rowsOf('warm', { pinned: flat(24, 40), newest: flat(24, 45), cua: flat(24, 60) }), opts);
  assert.equal(v.pass, false);
  assert.deepEqual(v.undetermined, []);
  assert.match(v.reasons[0], /warm 60\.0\d* ms > bar 40\.0\d* ms/);
});

test("a text command's bar build is found among its successes, so its series is judged", () => {
  const rows = [
    ...rowsOf('warm', { pinned: flat(22, 40), cua: flat(22, 30) }),
    // the newer build fails twice, fast: its successes alone set its median
    ...rowsOf('warm', { newest: flat(22, 50) }),
    { engine: 'newest', series: 'warm', ms: 1, ok: false, i: 99, block: 0 },
  ];
  const v = judgeOperation(rows, { ...opts, text: true });
  assert.equal(v.pass, true, v.reasons.join('; '));
});

test("the events experiment's groups go through the same guard: a faster median with a wide interval is not a pass", () => {
  const records = (label, times) => times.map((ms) => ({ command: 'click', ms, first: false, scenario: 's', step: 0 }));
  const row = { route: 'window', records: { pinned: records('pinned', flat(24, 40)), newest: records('newest', flat(24, 45)), cua: records('cua', spread(24, 0, 70)) } };
  const [wide] = eventSpeeds([row], { minSamples: 20 });
  assert.notEqual(wide.verdict, 'pass');
  const tight = { route: 'window', records: { ...row.records, cua: records('cua', flat(24, 30)) } };
  assert.equal(eventSpeeds([tight], { minSamples: 20 })[0].verdict, 'faster');
});

test('an undetermined series is topped up to 20 samples a side, then 40', async () => {
  const { SAMPLE_LEVELS, topUpRounds } = await import('../../scripts/linux-engine-diff/run.mjs');
  assert.deepEqual(SAMPLE_LEVELS, [20, 40]);
  // three blocks of one cold and four warm samples: 17 fresh engines, their cold sample alone (the warm needs 2 rounds)
  assert.deepEqual(topUpRounds({ cold: 3, warm: 12 }, { min: 20, warmPerRound: 4 }), { rounds: 17, warm: true });
  // only the warm series open: two rounds of a fresh engine and its warm samples
  assert.deepEqual(topUpRounds({ cold: 20, warm: 12 }, { min: 20, warmPerRound: 4 }), { rounds: 2, warm: true });
  assert.deepEqual(topUpRounds({ cold: 20, warm: 20 }, { min: 40, warmPerRound: 4 }), { rounds: 20, warm: true });
});

test('the offline re-judge lists the verdicts that change and the under-20 series the old rule judged on medians', async () => {
  const { rejudge } = await import('../../scripts/linux-engine-diff/rejudge.mjs');
  const sample = (engine, series, ms) => ({ run: 'r', kind: 'sample', scene: 'gedit', op: 'click', engine, series, ms, ok: true });
  const rows = [
    ...['pinned', 'newest', 'cua'].flatMap((e) => [sample(e, 'cold', e === 'cua' ? 100 : 200), ...Array.from({ length: 4 }, () => sample(e, 'warm', e === 'cua' ? 90 : 190))]),
    { run: 'r', kind: 'verdict', scene: 'gedit', op: 'click', candidate: 'cua', pass: true, verdict: 'pass', reasons: [] },
  ];
  const { changed, under } = rejudge(rows, 'r');
  assert.deepEqual(changed.map((c) => [c.op, c.before, c.after]), [['click', 'pass', 'fail']]);
  assert.deepEqual(under.map((u) => [u.series, u.samples.cua, u.old]), [['cold', 1, 'pass (at or below the bar)'], ['warm', 4, 'pass (at or below the bar)']]);
});
