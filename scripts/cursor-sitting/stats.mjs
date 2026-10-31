// The timing judgement of the agent cursor's attended sitting (docs/doperpowers/specs/2026-10-30-macos-agent-cursor-
// design.md, Acceptance 12 and 13): cursor-on samples against cursor-off samples, judged by the noise rule #171's
// Acceptance 3 uses, reused from its harness rather than restated (scripts/linux-engine-diff/stats.mjs noiseBound,
// noiseVerdict and MIN_NOISE_SAMPLES; scripts/linux-engine-diff/events.mjs medianDifferenceInterval, the seeded
// bootstrap 95 % interval of median(on) − median(off)). As #171 judges a candidate against its bar, a cursor-on median at
// or below the off median passes outright; above it, the series is the same within noise when the interval includes 0
// and its upper end is at most max(5 % of the off median, 1 ms), undetermined when it includes 0 but reaches past that
// (take more samples), and slower when it lies above 0.
import {medianDifferenceInterval} from '../linux-engine-diff/events.mjs';
import {MIN_NOISE_SAMPLES, median, noiseBound, noiseVerdict} from '../linux-engine-diff/stats.mjs';

export const MIN_SAMPLES = MIN_NOISE_SAMPLES;

const VERDICT = {same: 'same within noise', wide: 'undetermined (take more samples)', loss: 'slower'};

// One series: `on` and `off` are its times in ms. -> {n, medians, interval, bound, verdict, pass}.
export function judgeSeries({on, off}) {
  const n = {on: on.length, off: off.length};
  const medians = {on: median(on), off: median(off)};
  if (n.on < MIN_SAMPLES || n.off < MIN_SAMPLES) return {n, medians, interval: null, bound: null, verdict: 'too few samples', pass: false};
  const bound = noiseBound(medians.off);
  const interval = medianDifferenceInterval(on, off);
  if (medians.on <= medians.off) return {n, medians, interval, bound, verdict: 'not slower', pass: true};
  const noise = noiseVerdict(interval, medians.off);
  return {n, medians, interval, bound, verdict: VERDICT[noise], pass: noise === 'same'};
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
