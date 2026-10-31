// The speed verdicts of a recorded differential run judged again under Acceptance 3's interval guard (Decision Log,
// M3.1: every series judged only on 20 samples a side and only through its interval, whichever way the medians point),
// offline, from the run's own sample rows: which verdicts change, and which series under 20 samples a side the rule the
// run was judged by decided on its medians. The other parts of each verdict (answers, witness, audit, effect) are taken
// as the run recorded them. A run made through the vendor's JavaScript client (`via: vendor-js`) times each request
// with the client's deferred settle, which the live harness records and never judges: its speed is not judged here
// either.
//
//   node scripts/linux-engine-diff/rejudge.mjs <results.jsonl> <run>
//   node scripts/linux-engine-diff/rejudge.mjs <results.jsonl> <run> --events   (an events experiment's desktop groups)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { declaredParity } from './deviations.mjs';
import { FIRST_ROUNDS, TOP_UP_TO, blockAnswerMismatches, eventSpeeds, eventStage, medianDifferenceInterval } from './events.mjs';
import { OPS } from './ops.mjs';
import { MIN_NOISE_SAMPLES, judgeOperation, median, timedMs } from './stats.mjs';

const VENDORS = ['pinned', 'newest'];
/** A verdict reason about speed: the candidate's cold or warm series. */
const SPEED_REASON = /^\S+: (cold|warm)[ :]/;

/**
 * The run's verdicts judged again: `{changed, under, intervals}`.
 * - `changed`: every verdict whose outcome moves, with its speed reasons before and after.
 * - `under`: every series with fewer than 20 samples a side (the candidate's or its bar build's) that the run's rule
 *   judged on its medians, with the medians and what that rule made of them.
 * - `intervals`: every series judged on 20 a side, with its interval and bound, for any reading of the guard.
 * `via` is the transport the run recorded (`meta.via`; a run before the field was the wire's): through the vendor
 * client nothing is judged on speed, so nothing changes for speed and no series is listed.
 */
export function rejudge(rows, run) {
  const mine = rows.filter((r) => r.run === run);
  const via = mine.find((r) => r.kind === 'meta')?.via ?? 'wire';
  const judgeSpeed = via === 'wire';
  const samples = mine.filter((r) => r.kind === 'sample');
  const verdicts = mine.filter((r) => r.kind === 'verdict' && !r.device && !VENDORS.includes(r.candidate));
  const changed = [];
  const under = [];
  const intervals = [];
  for (const v of verdicts) {
    const { scene, op, candidate } = v;
    if (!OPS[op] || OPS[op].cuaOnly) continue;
    const opRows = samples.filter((r) => r.scene === scene && r.op === op && [...VENDORS, candidate].includes(r.engine));
    const text = OPS[op].kind === 'text';
    const parity = ['cold', 'warm'].map((series) => declaredParity({ op, scene, series })).filter(Boolean);
    const now = judgeOperation(opRows, { vendors: VENDORS, candidate, text, noise: medianDifferenceInterval, parity, judgeSpeed });
    const before = { verdict: v.verdict ?? (v.pass ? 'pass' : 'fail'), speed: (v.reasons ?? []).filter((x) => SPEED_REASON.test(x)) };
    const others = (v.reasons ?? []).filter((x) => !SPEED_REASON.test(x));
    const speed = judgeSpeed ? now.reasons.filter((x) => SPEED_REASON.test(x)) : [];
    let verdict;
    // a declared refusal excuses its answer and effect, never its speed (run.mjs declaredRefusalVerdict); a run before
    // that rule recorded no other reasons for it
    if (before.verdict === 'declared refusal') verdict = speed.length ? 'fail' : before.verdict;
    else if (others.length || speed.length) verdict = 'fail';
    else verdict = now.parity.length ? 'parity' : 'pass';
    if (verdict !== before.verdict) changed.push({ scene, op, candidate, before: before.verdict, after: verdict, speed_before: before.speed, speed_after: speed });
    if (!judgeSpeed) continue;
    // every judged series' interval (the bootstrap is seeded, so it is the run's own)
    for (const i of now.intervals) intervals.push({ scene, op, candidate, ...i });
    // the series the run's rule judged on medians with fewer than 20 a side (the desktop route's groups were never)
    if (scene === 'desktop') continue;
    for (const series of ['cold', 'warm']) {
      const times = (engine) => timedMs(opRows.filter((r) => r.engine === engine && r.series === series && (!text || engine === candidate || r.ok)));
      const bars = VENDORS.map((e) => ({ e, m: median(times(e)) })).filter((x) => x.m !== null);
      if (!bars.length || median(times(candidate)) === null) continue;
      const bar = bars.reduce((a, b) => (b.m < a.m ? b : a));
      const n = Math.min(times(candidate).length, times(bar.e).length);
      if (n >= MIN_NOISE_SAMPLES) continue;
      const cua = median(times(candidate));
      under.push({ scene, op, candidate, series, samples: { [candidate]: times(candidate).length, [bar.e]: times(bar.e).length }, median: cua, bar: bar.m, against: bar.e, old: cua <= bar.m ? 'pass (at or below the bar)' : 'loss (above the bar)' });
    }
  }
  return { via, changed, under, intervals };
}

/**
 * An events experiment's desktop groups judged again under Acceptance 3's schedule (M3.1's fix round: 20 rounds, then
 * 40 for a group undetermined at 20, its outcome there final), from the run's own block rows (`events-blocks`, each
 * request with its round): the verdict at 20 rounds, and for a group undetermined there, the verdict at 40 rounds where
 * the run recorded them, else `short` (the run stopped before 40). Beside each, the verdict the run recorded
 * (`events-speed`). Returns `{rounds, groups: [{command, series, n20, at20, n40, at40, recorded}]}`.
 */
export function rejudgeEvents(rows, run) {
  const mine = rows.filter((r) => r.run === run);
  // a row recorded before requests carried their round: its round is its occurrence of the same request, as blockKeys
  // counts it
  const withRounds = (list, first) => {
    const seen = new Map();
    return list.map((x) => {
      const at = `${x.scenario}#${x.step}`;
      const k = seen.get(at) ?? 0;
      seen.set(at, k + 1);
      return { ...x, round: x.round ?? first + k };
    });
  };
  const recordedBlocks = mine.filter((r) => r.kind === 'events-blocks');
  // a run recorded before requests carried their step has no request key to count rounds by
  if (recordedBlocks.some((b) => Object.values(b.records).flat().some((x) => x.round === undefined && x.step === undefined))) {
    return { rounds: null, groups: [], refused: 'its block rows carry neither round nor step, so their rounds cannot be recovered' };
  }
  const blockRows = recordedBlocks
    .map((b) => ({ ...b, records: Object.fromEntries(Object.entries(b.records).map(([label, list]) => [label, withRounds(list, b.first_round ?? 0)])) }));
  const upTo = (limit) =>
    blockRows.map((b) => {
      const records = Object.fromEntries(Object.entries(b.records).map(([label, list]) => [label, list.filter((x) => x.round < limit)]));
      return { route: 'desktop', records, mismatches: blockAnswerMismatches(records, Object.keys(records).filter((l) => l.startsWith('cua'))) };
    });
  const rounds = Math.max(0, ...blockRows.flatMap((b) => Object.values(b.records).flat().map((x) => x.round + 1)));
  const judgeAt = (limit) => {
    const blocks = upTo(limit);
    const sofar = { blocks, mismatches: blocks.flatMap((b) => b.mismatches) };
    return [eventSpeeds([], { ...sofar, final: false }), eventSpeeds([], { ...sofar, final: true })];
  };
  const [open20, closed20] = judgeAt(FIRST_ROUNDS);
  const first = eventStage(open20, closed20);
  const at40 = rounds >= TOP_UP_TO ? judgeAt(TOP_UP_TO)[1] : null;
  const recorded = mine.filter((r) => r.kind === 'events-speed' && r.route === 'desktop');
  const groups = open20.map((s) => {
    const key = `${s.route}|${s.command}|${s.series}`;
    const decided = first.frozen.get(key);
    const later = at40?.find((x) => x.command === s.command && x.series === s.series);
    const old = recorded.find((x) => x.command === s.command && x.series === s.series);
    return {
      command: s.command,
      series: s.series,
      n20: s.n,
      at20: s.verdict,
      interval20: s.interval,
      ...(decided ? {} : { n40: later?.n ?? null, at40: later ? later.verdict : 'short', interval40: later?.interval ?? null }),
      recorded: old ? { n: old.n, verdict: old.verdict, interval: old.interval } : null,
    };
  });
  return { rounds, groups };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, run, mode] = process.argv.slice(2);
  const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  console.log(JSON.stringify(mode === '--events' ? rejudgeEvents(rows, run) : rejudge(rows, run), null, 1));
}
