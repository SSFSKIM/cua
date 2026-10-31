// The timing judgement of the agent cursor's attended sitting (docs/doperpowers/specs/2026-10-30-macos-agent-cursor-
// design.md, Acceptance 12 and 13): #171's noise rule over cursor-on against cursor-off samples, and the interleaved
// schedule the samples are taken in.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {judgeSeries, judgeTiming, sampleOrder, MIN_SAMPLES} from '../../scripts/cursor-sitting/stats.mjs';

const around = (centre, n, spread = 2) => Array.from({length: n}, (_, i) => centre + ((i * 7) % (2 * spread + 1)) - spread);
// Seeded noise: `n` samples spread uniformly over centre ± spread.
const noisy = (centre, n, spread, seed) => {
  let x = seed;
  return Array.from({length: n}, () => { x = (x * 1103515245 + 12345) % 2147483648; return centre + (x / 2147483648 * 2 - 1) * spread; });
};

test('the rule needs 20 samples a side before it judges', () => {
  assert.equal(MIN_SAMPLES, 20);
  const few = judgeSeries({on: around(100, 19), off: around(100, 20)});
  assert.equal(few.verdict, 'too few samples');
  assert.equal(few.pass, false);
});

test('a cursor-on median at or below the off median passes without the interval (as #171 judges at or below its bar)', () => {
  const r = judgeSeries({on: around(98, 20), off: around(100, 20)});
  assert.equal(r.verdict, 'not slower');
  assert.equal(r.pass, true);
  assert.equal(r.medians.on, 98);
  assert.equal(r.medians.off, 100);
});

test('above the off median: same within noise when the interval includes 0 and its upper end is within max(5 % of off, 1 ms)', () => {
  // on a hair slower, both noisy: the interval spans 0, its upper end well under 5 ms (5 % of 100)
  const r = judgeSeries({on: noisy(101, 20, 3, 3), off: noisy(100, 20, 3, 13)});
  assert.ok(r.medians.on > r.medians.off, `medians ${JSON.stringify(r.medians)}`);
  assert.ok(r.interval[0] <= 0 && r.interval[1] >= 0, `interval ${r.interval}`);
  assert.equal(r.bound, 0.05 * r.medians.off);
  assert.equal(r.verdict, 'same within noise');
  assert.equal(r.pass, true);
});

test('the 1 ms floor binds for short calls', () => {
  const r = judgeSeries({on: around(4.2, 20, 1), off: around(4, 20, 1)});
  assert.equal(r.bound, 1);
});

test('an interval wholly above 0 is a loss; one that includes 0 but reaches past the bound is undetermined', () => {
  const loss = judgeSeries({on: around(130, 20), off: around(100, 20)});
  assert.equal(loss.verdict, 'slower');
  assert.equal(loss.pass, false);
  // bimodal on-samples: the median sits above off's, the resampled medians straddle 0 and reach far past 5 ms
  const on = [...Array(10).fill(99), ...Array(10).fill(140)];
  const wide = judgeSeries({on, off: around(100, 20, 1)});
  assert.ok(wide.interval[0] <= 0, `interval ${wide.interval}`);
  assert.ok(wide.interval[1] > wide.bound);
  assert.equal(wide.verdict, 'undetermined (take more samples)');
  assert.equal(wide.pass, false);
});

test('the interval is the seeded bootstrap of #171, so a judgement can be recomputed from its rows', () => {
  const a = judgeSeries({on: noisy(101, 20, 3, 3), off: noisy(100, 20, 3, 13)});
  const b = judgeSeries({on: noisy(101, 20, 3, 3), off: noisy(100, 20, 3, 13)});
  assert.deepEqual(a.interval, b.interval);
});

test('judgeTiming groups rows by series and side, and fails the whole when any series fails or is missing', () => {
  const rows = [];
  for (let i = 0; i < 20; i++) {
    rows.push({series: 'type_text', side: 'on', i, ms: 200 + (i % 3)}, {series: 'type_text', side: 'off', i, ms: 200 + (i % 3)});
    rows.push({series: 'press_key x30', side: 'on', i, ms: 90 + (i % 2)}, {series: 'press_key x30', side: 'off', i, ms: 91 + (i % 2)});
  }
  rows.push({series: 'type_text', side: 'on', i: 20, ms: null, error: 'refused'});
  const out = judgeTiming(rows, {series: ['type_text', 'press_key x30']});
  assert.equal(out.pass, true);
  assert.deepEqual(out.series.map(s => s.series), ['type_text', 'press_key x30']);
  assert.equal(out.series[0].n.on, 20, 'a sample with no time is not counted');
  assert.equal(out.errors, 1);
  const missing = judgeTiming(rows, {series: ['type_text', 'press_key x30', 'drag']});
  assert.equal(missing.pass, false);
  assert.equal(missing.series[2].verdict, 'too few samples');
});

test('the interleaved order alternates which side leads, so drift over the sitting falls on both sides alike', () => {
  const order = sampleOrder(4);
  assert.deepEqual(order, [['on', 'off'], ['off', 'on'], ['on', 'off'], ['off', 'on']]);
  const counts = {on: 0, off: 0};
  sampleOrder(20).forEach(([first]) => counts[first]++);
  assert.deepEqual(counts, {on: 10, off: 10});
});
