// The timing judgement of the agent cursor's attended sitting (docs/doperpowers/specs/2026-10-30-macos-agent-cursor-
// design.md, Acceptance 12 and 13): cursor-on samples against cursor-off samples, judged by the noise rule #171's
// Acceptance 3 uses, built on its harness rather than restated (scripts/linux-engine-diff/stats.mjs noiseBound and
// MIN_NOISE_SAMPLES; scripts/linux-engine-diff/events.mjs medianDifferenceInterval, the seeded bootstrap 95 % interval of
// median(on) − median(off)). The rule as Acceptance 12 states it, with no shortcut on the medians: a series passes when
// the interval's upper end is at most max(5 % of the off median, 1 ms) and the interval includes 0 or lies wholly below
// it (the cursor-on side faster); an interval wholly above 0 is slower; one that includes 0 but reaches past the bound is
// undetermined (take more samples). (#171's own judgement passes a candidate at or below its bar before it looks at the
// interval; that shortcut lets a bimodal on-side pass with a wide interval, so it is not used here.)
import {medianDifferenceInterval} from '../linux-engine-diff/events.mjs';
import {MIN_NOISE_SAMPLES, median, noiseBound} from '../linux-engine-diff/stats.mjs';

export const MIN_SAMPLES = MIN_NOISE_SAMPLES;

// One series: `on` and `off` are its times in ms. -> {n, medians, interval, bound, verdict, pass}.
export function judgeSeries({on, off}) {
  const n = {on: on.length, off: off.length};
  const medians = {on: median(on), off: median(off)};
  if (n.on < MIN_SAMPLES || n.off < MIN_SAMPLES) return {n, medians, interval: null, bound: null, verdict: 'too few samples', pass: false};
  const bound = noiseBound(medians.off);
  const interval = medianDifferenceInterval(on, off);
  const [low, high] = interval;
  const verdict = low > 0 ? 'slower' : high > bound ? 'undetermined (take more samples)' : high < 0 ? 'faster' : 'same within noise';
  return {n, medians, interval, bound, verdict, pass: verdict === 'same within noise' || verdict === 'faster'};
}

// Rows {series, side: 'on'|'off', i, ms} (a row with no finite ms is an error, counted and left out), judged per series
// in `series`' order. -> {pass, errors, series: [{series, ...judgeSeries}]}.
export function judgeTiming(rows, {series}) {
  const timed = rows.filter(r => Number.isFinite(r.ms));
  const of = (name, side) => timed.filter(r => r.series === name && r.side === side).map(r => r.ms);
  const judged = series.map(name => ({series: name, ...judgeSeries({on: of(name, 'on'), off: of(name, 'off')})}));
  return {pass: judged.every(s => s.pass), errors: rows.length - timed.length, series: judged};
}

// The order of each pair of samples: alternating which side leads, so a drift over the sitting lands on both.
export const sampleOrder = samples => Array.from({length: samples}, (_, i) => (i % 2 === 0 ? ['on', 'off'] : ['off', 'on']));
