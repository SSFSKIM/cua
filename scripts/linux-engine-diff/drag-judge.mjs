// The drag experiment's verdicts (#171 M4, T10; Acceptance 3; the Decision Log's M4 pre-flight, "Speed judging" and
// "Drags"), over the run rows drag.mjs measures and judgeRuns marks: the thumb judge against the pinned build's mean
// distance of the same sitting, a long path's warm speed under the interval rule with its top-ups, the load lane's
// landed counts, the held-move cells' no-press control, and the run's verdict for the shipped lane with each cell's
// judges in one summary cell.

import { declaredDragGap } from './deviations.mjs';
import { medianDifferenceInterval } from './events.mjs';
import { TOP_UP_SAMPLES, judgeSeriesSpeed } from './stats.mjs';

/** The drags a side under load (the load lane, #265; Decision Log, M4 pre-flight). */
export const LOAD_RUNS = 40;

/** How far a run moved its value: a thumb's scroll, a slider's; null for an effect that is not a number. */
const distance = (r) => (r.ok && typeof r.before === 'number' && typeof r.after === 'number' ? Math.abs(r.after - r.before) : null);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** A lane's distances in a summary: the runs that moved a number, their shortest and their mean. */
function distances(runs) {
  const ds = runs.map(distance).filter((d) => d !== null);
  return { shortest: ds.length ? Math.min(...ds) : null, mean: mean(ds) };
}

/**
 * The thumb judge (Acceptance 3; Decision Log, M4 pre-flight): a Chromium thumb run passes when it moved the content at
 * least the pinned build's mean distance, the mean of the pinned build's runs that took in the same sitting (never a
 * stored constant). The scroller's path is the same every run, so one mean serves both parities. Each run gets `reach`
 * (null where there is no pinned mean); each lane `{reached, n, shortest, mean}`.
 */
export function thumbReach(runs, lanes) {
  const pinnedMean = mean(runs.filter((r) => r.engine === 'pinned' && r.took).map(distance).filter((d) => d !== null));
  const judged = runs.map((r) => ({ ...r, reach: pinnedMean === null ? null : distance(r) !== null && distance(r) >= pinnedMean }));
  const out = {};
  for (const lane of lanes) {
    const mine = judged.filter((r) => r.engine === lane);
    out[lane] = { reached: mine.filter((r) => r.reach === true).length, n: mine.length, ...distances(mine) };
  }
  return { pinned_mean: pinnedMean, runs: judged, lanes: out };
}

/**
 * A long path's speed for one lane (Acceptance 3; Decision Log, M4 pre-flight, "Speed judging"): warm runs only, an
 * engine's first request being cold (the verdict run's scene drag judges cold), and of those the runs that took are the
 * usable samples. `sampled` counts every drag the engine made, the cap of the top-ups. Judged by `judgeSeriesSpeed`
 * against the vendor builds present; returns its verdict with `samples`.
 */
export function dragSpeed(runs, { candidate, vendors, interval = medianDifferenceInterval }) {
  const samples = {};
  for (const engine of [...vendors, candidate]) {
    const mine = runs.filter((r) => r.engine === engine);
    if (!mine.length) continue;
    samples[engine] = { usable: mine.filter((r) => !r.first_request && r.ok && r.took && Number.isFinite(r.ms)).map((r) => r.ms), sampled: mine.length };
  }
  return { ...judgeSeriesSpeed(samples, { vendors, candidate, interval }), samples };
}

/** How many more drags a lane makes for a long path still undetermined: rounds of 10, to 40 a side. */
export function topUpRuns(speed, sampled) {
  if (speed?.verdict !== 'undetermined') return 0;
  return Math.max(0, Math.min(10, TOP_UP_SAMPLES - sampled));
}

/** The load lane's tolerance: a lane landing fewer than the pinned build passes while chance explains it at this level. */
export const LOAD_P = 0.05;

/** ln C(n, k). */
const logChoose = (n, k) => {
  let s = 0;
  for (let j = 1; j <= k; j++) s += Math.log(n - k + j) - Math.log(j);
  return s;
};

/**
 * Fisher's exact test, one-sided: given both sides' margins, how likely side A misses `missA` of its `nA` runs or more,
 * against side B's `missB` of `nB` (the hypergeometric tail). 1 when A missed no more often than B.
 */
export function fisherMissesAtLeast(missA, nA, missB, nB) {
  const misses = missA + missB;
  if (missA * nB <= missB * nA) return 1;
  const all = logChoose(nA + nB, misses);
  let p = 0;
  for (let k = missA; k <= Math.min(misses, nA); k++) p += Math.exp(logChoose(nA, k) + logChoose(nB, misses - k) - all);
  return Math.min(1, p);
}

/**
 * The load lane's judge (#265; Decision Log, M4 pre-flight, "Drags"; the design session's ruling on ffdnd-fix,
 * 2026-11-13), 40 a side, never judged on fewer, each side's distances reported. A lane fails on any false success: a
 * run answered ok whose effect did not happen (`no_effect`) or landed on another target than the one asked for
 * (`wrong_target`; judgeRuns marks both, drag.mjs `falseSuccess`). Otherwise its landings decide: at least the pinned
 * build's, or fewer by chance, the one-sided Fisher test of its misses against the pinned build's at `LOAD_P` or above.
 * A landing miss is an honest answer (not ok) or the right target's effect at the wrong magnitude (a thumb short or
 * over, a stroke cut short), which load makes in every engine: exact equality failed T19's Firefox drop at twice the
 * load on 38 of 40 honest answers, against a pinned 40 (ffdnd-fix's sittings). The pinned build's own runs are its
 * record, never judged.
 */
export function loadCounts(runs, lanes) {
  const side = (engine) => {
    const mine = runs.filter((r) => r.engine === engine);
    return { took: mine.filter((r) => r.took).length, n: mine.length, ...distances(mine) };
  };
  const pinned = side('pinned');
  const out = {};
  for (const lane of lanes) {
    const mine = side(lane);
    const own = runs.filter((r) => r.engine === lane && r.ok === true);
    const noEffect = own.filter((r) => r.no_effect).map((r) => r.i);
    const elsewhere = own.filter((r) => !r.no_effect && r.wrong_target).map((r) => r.i);
    if (mine.n < LOAD_RUNS || pinned.n < LOAD_RUNS) {
      out[lane] = { ...mine, pass: false, judged: false, no_effect_runs: noEffect, wrong_target_runs: elsewhere, reason: `fewer than ${LOAD_RUNS} a side (${mine.n} and the pinned build's ${pinned.n})` };
      continue;
    }
    const p = fisherMissesAtLeast(mine.n - mine.took, mine.n, pinned.n - pinned.took, pinned.n);
    const landed = mine.took >= pinned.took || p >= LOAD_P;
    const runsText = (is) => `(run${is.length > 1 ? 's' : ''} ${is.join(' ')})`;
    const failures = [
      ...(noEffect.length ? [`${noEffect.length} answered ok with no effect ${runsText(noEffect)}`] : []),
      ...(elsewhere.length ? [`${elsewhere.length} answered ok with the effect on another target ${runsText(elsewhere)}`] : []),
      ...(landed ? [] : [`landed ${mine.took} of ${mine.n} against the pinned build's ${pinned.took} of ${pinned.n} (one-sided Fisher p = ${p.toFixed(4)})`]),
    ];
    out[lane] = { ...mine, p, pass: failures.length === 0, judged: true, no_effect_runs: noEffect, wrong_target_runs: elsewhere, ...(failures.length ? { reason: failures.join('; ') } : {}) };
  }
  return { pinned, lanes: out };
}

/** The no-press control: it must miss every run, or the effect check cannot tell a held move from none. */
export function controlVerdict(runs) {
  const took = runs.filter((r) => r.took).length;
  return { pass: took === 0, took, n: runs.length };
}

const pxShown = (v) => (v === null || v === undefined ? '–' : Math.round(v * 10) / 10);

/**
 * The declared gap a lane's failed speed falls within (deviations.mjs DRAG_SPEED_GAPS): the cell's family, kind and
 * route declared, and the upper end of its interval (cua − bar) at most the declared bound. Answers `{gap, within}`, or
 * null when the speed did not fail or nothing declares the cell.
 */
export function speedGap(cell, lane) {
  const speed = cell.speed?.[lane];
  if (speed?.verdict !== 'fail') return null;
  const gap = declaredDragGap(cell);
  if (!gap) return null;
  const upper = speed.interval?.[1];
  return { gap, within: typeof upper === 'number' && upper <= gap.bound_ms };
}

/** Why a cell fails one lane: its effect, or under load its counts; the thumb judge; the long path's speed. */
export function laneFailures(cell, lane) {
  const l = cell.lanes?.[lane];
  if (!l) return [];
  const at = `${cell.family} ${cell.drag}: ${lane}`;
  const failed = [];
  const witnessed = l.witness === true || !cell.pinned_witness;
  if (cell.load) {
    const c = cell.load.lanes?.[lane];
    if (c && !c.pass) {
      const runsText = (is) => `run${is.length > 1 ? 's' : ''} ${is.join(' ')}`;
      if (c.judged === false) failed.push(`${at} not judged under load: ${c.reason}`);
      if (c.no_effect_runs?.length) failed.push(`${at} answered ok with no effect under load: ${runsText(c.no_effect_runs)}`);
      if (c.wrong_target_runs?.length) failed.push(`${at} answered ok with the effect on another target under load: ${runsText(c.wrong_target_runs)}`);
      if (c.judged !== false && c.took < cell.load.pinned.took && !(c.p >= LOAD_P)) failed.push(`${at} landed ${c.took} of ${c.n} against the pinned build's ${cell.load.pinned.took} of ${cell.load.pinned.n} (one-sided Fisher p = ${typeof c.p === 'number' ? c.p.toFixed(4) : '–'})`);
    }
    if (!witnessed) failed.push(`${at}'s witness changed`);
    return failed;
  }
  if (l.pass === false) {
    if (l.misses?.length) failed.push(`${at} missed runs ${l.misses.join(' ')}`);
    if (!witnessed) failed.push(`${at}'s witness changed`);
  }
  const reach = cell.reach?.lanes?.[lane];
  if (reach && cell.reach.pinned_mean !== null && reach.reached < reach.n) {
    failed.push(`${at} short of the pinned build's mean distance (${pxShown(cell.reach.pinned_mean)} px) on ${reach.n - reach.reached} of ${reach.n} runs (shortest ${pxShown(reach.shortest)} px, mean ${pxShown(reach.mean)} px)`);
  }
  const speed = cell.speed?.[lane];
  const declared = speedGap(cell, lane);
  // a declared gap excuses its own measured loss within its bound, never a missed effect or an undecided series
  if (declared && !declared.within) failed.push(`${at} speed beyond its declared gap (${declared.gap.issue}, ${declared.gap.bound_ms} ms): the interval [${speed.interval?.join(', ') ?? 'none'}]; ${speed.reasons.join('; ')}`);
  else if (!declared && speed?.verdict === 'fail') failed.push(`${at} speed: ${speed.reasons.join('; ')}`);
  if (speed?.verdict === 'undetermined') failed.push(`${at} speed undetermined after the top-ups${speed.reasons.length ? `: ${speed.reasons.join('; ')}` : ''}`);
  return failed;
}

/**
 * The run's drag verdict, for the shipped lane (`cua`): every judged cell's failures (`laneFailures`), and every held-move
 * cell whose no-press control took a run (CONTROL NON-DISCRIMINATING, as the readiness check labels a control that
 * cannot fail). A measurement lane (`cua:0ms`, a variant) is an outcome, never a failure; a cell without a usable
 * reference is recorded, not judged; a long path with no vendor bar is recorded.
 */
export function dragVerdict(cells, { lane = 'cua' } = {}) {
  const failed = [];
  // the cells whose speed is a declared gap: listed apart, never a pass (Acceptance 3)
  const declared = [];
  for (const cell of cells) {
    const own = laneFailures(cell, lane);
    failed.push(...own);
    const gap = speedGap(cell, lane);
    if (gap?.within && !own.length) {
      const s = cell.speed[lane];
      declared.push(`${cell.family} ${cell.drag}: ${lane} declared speed gap (${gap.gap.issue}): ${lane} ${s.candidate} ms against ${s.against}'s ${s.bar} ms, the interval [${s.interval.join(', ')}] within the declared ${gap.gap.bound_ms} ms`);
    }
    if (cell.control && !cell.control.pass) failed.push(`${cell.family} ${cell.drag}: CONTROL NON-DISCRIMINATING: the no-press control took ${cell.control.took} of ${cell.control.n}`);
    const ref = cell.select_reference;
    if (ref && (ref.n === 0 || ref.covers < ref.n)) failed.push(`${cell.family} ${cell.drag}: REFERENCE MISMATCH: the unprimed judge took ${ref.covers} of the select cell's ${ref.n} even runs that took`);
  }
  return { pass: failed.length === 0, failed, declared };
}

/** A cell's verdict for one lane, as the summary shows it: PASS, a declared speed gap (never a pass), or **FAIL**. */
export function cellVerdict(cell, lane) {
  if (laneFailures(cell, lane).length) return '**FAIL**';
  const gap = speedGap(cell, lane);
  return gap?.within ? `declared speed gap (${gap.gap.issue})` : 'PASS';
}

const r1 = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : '–');

/** A cell's judges in one summary cell: the thumb reach, the long path's speed, the load counts, the control, the motions received. */
export function judgeNotes(row, cuaLanes) {
  const notes = [];
  if (row.reach) notes.push(`reach (pinned mean ${r1(row.reach.pinned_mean)} px): ${cuaLanes.map((l) => `${l} ${row.reach.lanes[l].reached}/${row.reach.lanes[l].n} (shortest ${r1(row.reach.lanes[l].shortest)}, mean ${r1(row.reach.lanes[l].mean)})`).join(', ')}`);
  if (row.speed) {
    const one = (l) => {
      const s = row.speed[l];
      const iv = s.interval ? ` [${s.interval.join(', ')}]` : '';
      if (s.verdict === 'pass') return `${l} ${s.label}${iv}, ${s.candidate} ms against ${s.against}'s ${s.bar} ms`;
      if (s.verdict === 'no bar') return `${l} no vendor bar (${s.reasons.join('; ')})`;
      const gap = speedGap(row, l);
      if (gap?.within) return `${l} **declared speed gap (${gap.gap.issue})**${iv}: ${s.reasons.join('; ')}`;
      return `${l} **${s.verdict}**${iv}: ${s.reasons.join('; ')}`;
    };
    notes.push(`speed (warm): ${cuaLanes.map(one).join('; ')}${row.speed[cuaLanes[0]]?.failed_bar?.length ? `; gave the bar up: ${row.speed[cuaLanes[0]].failed_bar.map((f) => `${f.engine} ${f.usable} usable of ${f.sampled}`).join(', ')}` : ''}`);
  }
  if (row.load) notes.push(`load: pinned ${row.load.pinned.took}/${row.load.pinned.n} (mean ${r1(row.load.pinned.mean)}), ${cuaLanes.map((l) => `${l} ${row.load.lanes[l].took}/${row.load.lanes[l].n} (mean ${r1(row.load.lanes[l].mean)}, shortest ${r1(row.load.lanes[l].shortest)}${typeof row.load.lanes[l].p === 'number' && row.load.lanes[l].took < row.load.pinned.took ? `, Fisher p ${row.load.lanes[l].p.toFixed(3)}` : ''})`).join(', ')}`);
  if (row.control) notes.push(`control (no press) took ${row.control.took}/${row.control.n}`);
  if (row.select_reference) notes.push(`the judge took ${row.select_reference.covers}/${row.select_reference.n} of the select cell's even runs`);
  if (row.received) notes.push(`received, coalesced samples (events), raw/moves, median: ${Object.entries(row.received).map(([l, v]) => `${l} ${r1(v.raw)} (${r1(v.raw_events)})/${r1(v.moves)} (${r1(v.move_events)})`).join(', ')}`);
  return notes.join('; ') || '–';
}
