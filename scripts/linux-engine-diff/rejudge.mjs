// The speed verdicts of a recorded differential run judged again under Acceptance 3's interval guard (Decision Log,
// M3.1: every series judged only on 20 samples a side and only through its interval, whichever way the medians point),
// offline, from the run's own sample rows: which verdicts change, and which series under 20 samples a side the rule the
// run was judged by decided on its medians. The other parts of each verdict (answers, witness, audit, effect) are taken
// as the run recorded them.
//
//   node scripts/linux-engine-diff/rejudge.mjs <results.jsonl> <run>

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { declaredParity } from './deviations.mjs';
import { medianDifferenceInterval } from './events.mjs';
import { OPS } from './ops.mjs';
import { MIN_NOISE_SAMPLES, judgeOperation, median, timedMs } from './stats.mjs';

const VENDORS = ['pinned', 'newest'];
/** A verdict reason about speed: the candidate's cold or warm series. */
const SPEED_REASON = /^\S+: (cold|warm)[ :]/;

/**
 * The run's verdicts judged again: `{changed, under}`. `changed`: every verdict whose outcome moves, with its speed
 * reasons before and after. `under`: every series with fewer than 20 samples a side (the candidate's or its bar
 * build's) that the run's rule judged on its medians, with the medians and what that rule made of them.
 */
export function rejudge(rows, run) {
  const mine = rows.filter((r) => r.run === run);
  const samples = mine.filter((r) => r.kind === 'sample');
  const verdicts = mine.filter((r) => r.kind === 'verdict' && !r.device && !VENDORS.includes(r.candidate));
  const changed = [];
  const under = [];
  for (const v of verdicts) {
    const { scene, op, candidate } = v;
    if (!OPS[op] || OPS[op].cuaOnly) continue;
    const opRows = samples.filter((r) => r.scene === scene && r.op === op && [...VENDORS, candidate].includes(r.engine));
    const text = OPS[op].kind === 'text';
    const parity = ['cold', 'warm'].map((series) => declaredParity({ op, scene, series })).filter(Boolean);
    const now = judgeOperation(opRows, { vendors: VENDORS, candidate, text, noise: medianDifferenceInterval, parity });
    const before = { verdict: v.verdict ?? (v.pass ? 'pass' : 'fail'), speed: (v.reasons ?? []).filter((x) => SPEED_REASON.test(x)) };
    const others = (v.reasons ?? []).filter((x) => !SPEED_REASON.test(x));
    const speed = now.reasons.filter((x) => SPEED_REASON.test(x));
    let verdict;
    if (before.verdict === 'declared refusal') verdict = before.verdict;
    else if (others.length || speed.length) verdict = 'fail';
    else verdict = now.parity.length ? 'parity' : 'pass';
    if (verdict !== before.verdict) changed.push({ scene, op, candidate, before: before.verdict, after: verdict, speed_before: before.speed, speed_after: speed });
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
  return { changed, under };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, run] = process.argv.slice(2);
  const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  console.log(JSON.stringify(rejudge(rows, run), null, 1));
}
