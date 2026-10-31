// The bar rule (task 18, the design session's ruling): a vendor build sets a series' bar only with at least 20 usable
// samples once the top-ups have sampled it to their end (40); a build still below that has failed the operation and sets
// none. cua still needs 20 usable samples a side.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { medianDifferenceInterval } from '../../scripts/linux-engine-diff/events.mjs';
import { judgeOperation } from '../../scripts/linux-engine-diff/stats.mjs';

const opts = { vendors: ['pinned', 'newest'], candidate: 'cua', noise: medianDifferenceInterval, text: true };
const flat = (n, v) => Array.from({ length: n }, (_, i) => v + (i % 3) * 0.01);

/** One engine's samples of a series: `ok` of them succeed at `ms`, the rest fail as a vendor's Copy does. */
function samples(engine, series, n, ok, ms) {
  return flat(n, ms).map((t, i) => ({
    engine,
    series,
    ms: t,
    i,
    block: 0,
    ok: i < ok,
    ...(i < ok ? { witness: true, effect: true } : { error: 'editable element has no selected text to Copy' }),
  }));
}

test('both vendor builds with 20 usable samples: the faster sets the bar', () => {
  const rows = [...samples('pinned', 'cold', 24, 24, 600), ...samples('newest', 'cold', 24, 24, 650), ...samples('cua', 'cold', 24, 24, 50)];
  const v = judgeOperation(rows, opts);
  assert.equal(v.pass, true, v.reasons.join('; '));
  assert.equal(v.intervals[0].against, 'pinned');
  assert.deepEqual(v.failed_bar, []);
});

test('a vendor build that succeeded 1 of 117 times sets no bar: it falls to the other (t18-verdict-fix, clipboard_read)', () => {
  const rows = [...samples('pinned', 'cold', 117, 1, 600), ...samples('newest', 'cold', 117, 117, 650), ...samples('cua', 'cold', 117, 117, 50)];
  const v = judgeOperation(rows, opts);
  assert.equal(v.pass, true, v.reasons.join('; '));
  assert.equal(v.intervals[0].against, 'newest');
  assert.equal(v.bar.cold, 650);
  assert.deepEqual(v.failed_bar, [{ engine: 'pinned', series: 'cold', usable: 1, sampled: 117 }]);
});

test('a vendor build short of 20 usable samples before the top-ups end still holds the series open', () => {
  // 30 sampled, 1 usable: the top-ups have not reached 40, so it is not yet a failure and the series is undetermined
  const rows = [...samples('pinned', 'cold', 30, 1, 600), ...samples('newest', 'cold', 30, 30, 650), ...samples('cua', 'cold', 30, 30, 50)];
  const v = judgeOperation(rows, opts);
  assert.equal(v.pass, false);
  assert.equal(v.undetermined[0].against, 'pinned');
  assert.deepEqual(v.failed_bar, []);
});

test('both vendor builds below 20 usable samples at the end: no bar, so no speed judgement (the no-bar rule)', () => {
  const rows = [...samples('pinned', 'cold', 40, 1, 600), ...samples('newest', 'cold', 40, 3, 650), ...samples('cua', 'cold', 40, 40, 50)];
  const v = judgeOperation(rows, opts);
  assert.equal(v.bar.cold, null);
  assert.deepEqual(v.intervals, []);
  assert.deepEqual(v.undetermined, []);
  assert.deepEqual(v.failed_bar.map((f) => f.engine), ['pinned', 'newest']);
});

test('the rule binds the vendor builds only: cua below 20 usable samples stays undetermined and fails', () => {
  const rows = [...samples('pinned', 'cold', 40, 1, 600), ...samples('newest', 'cold', 40, 40, 650), ...samples('cua', 'cold', 40, 12, 50)];
  const v = judgeOperation(rows, opts);
  assert.equal(v.pass, false);
  assert.ok(v.reasons.some((r) => /cua: a request failed/.test(r)), v.reasons.join('; '));
  assert.ok(v.reasons.some((r) => /undetermined: 12 samples a side/.test(r)), v.reasons.join('; '));
});
