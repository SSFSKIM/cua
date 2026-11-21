#!/usr/bin/env node
// Task 129, L4d at H7.1 (rulings 957, 961, 962, 972, 986): a plan-of-parts run's rows, read-only, per part:
//  - the judge's own part verdict (the run's `drop-parts-verdict` row): pass, failed, and its counts;
//  - from the rows, with the judge's own helpers (drop-signals-judge.mjs at the checkout given): landed where the path
//    ended, drops at a stale position, ambiguous (the path ended within 3 px of the zone's border: "in the margin"),
//    unplaced, kept notices by kind (the honest unconfirmed among them), oks with nothing pending, and untaken;
//  - each part's timings, min / median / max: the take after the press (the engine's `hold.take_after_press_ms`), the
//    path after the take (`hold.path_ms` less the take), the last step to the release (the wall press-to-release less
//    `hold.path_ms`), and Chrome's activation after the release (`signals.activation_after_release_ms`);
//  - every row a fail could name (stale, ambiguous, unplaced, or ok with nothing pending though the drag started), each
//    with those four times.
// usage: node l4d-parts.mjs <checkout> <results.jsonl[.gz]>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const [root, f] = process.argv.slice(2);
const j = await import(pathToFileURL(join(root, 'scripts/linux-engine-diff/drop-signals-judge.mjs')).href);
const raw = readFileSync(f);
const rows = (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const v = rows.find((r) => r.kind === 'drop-parts-verdict');
console.log(`== ${f}`);
console.log(`verdict: pass ${v?.pass}; failed ${JSON.stringify(v?.failed)}`);
for (const x of v?.findings ?? []) console.log(`finding: ${x}`);
const r1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);
const q = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? `${r1(s[0])} / ${r1(s[Math.floor(s.length / 2)])} / ${r1(s.at(-1))} (n ${s.length})` : '–';
};
const take = (r) => r.hold?.take_after_press_ms ?? r.signals?.take_after_press_ms ?? null;
const afterTake = (r) => (Number.isFinite(r.hold?.path_ms) && Number.isFinite(take(r)) ? r.hold.path_ms - take(r) : null);
const gap = (r) => (r.wall && Number.isFinite(r.hold?.path_ms) ? r.wall.release_ms - r.wall.press_ms - r.hold.path_ms : null);
const act = (r) => r.signals?.activation_after_release_ms ?? null;
const times = (r) => `take ${r1(take(r))} ms, path after the take ${r1(afterTake(r))} ms, last step to release ${r1(gap(r))} ms, activation after release ${r1(act(r))} ms`;
for (const p of v?.counts?.parts ?? []) {
  const own = rows.filter((r) => r.kind === 'drop-signal' && r.part === p.part);
  console.log(`\n--- part ${p.part + 1}: ${p.family} ${p.plan} (${p.judge}): pass ${p.pass}`);
  console.log(`judge's counts: ${JSON.stringify(p.counts)}`);
  for (const cell of [...new Set(own.map((r) => `${r.lane}|${r.cell}`))]) {
    const list = own.filter((r) => `${r.lane}|${r.cell}` === cell);
    const land = list.map((r) => j.landingOf(r));
    const kinds = new Map();
    for (const r of list) {
      const pd = j.pendingOf(r);
      const k = pd.kind === null ? (pd.refused ? 'refused, no notice' : 'none') : `${pd.kind}${pd.kept ? '' : ' (not kept)'}`;
      kinds.set(k, (kinds.get(k) ?? 0) + 1);
    }
    const okNothing = list.filter((r) => r.ok === true && j.pendingOf(r).kind === null && r.outcome?.started === true && r.outcome?.landed !== true);
    const untaken = list.filter((r) => !Number.isFinite(take(r)));
    console.log(`${cell.replace('|', ' ')}: ${list.length} drags; landed ${land.filter((x) => x === 'landed').length}, stale ${land.filter((x) => x === 'stale').length}, ambiguous (in the margin) ${land.filter((x) => x === 'ambiguous').length}, unplaced ${land.filter((x) => x === 'unknown').length}; path end ${j.pathEndOf(list[0])}; notices ${JSON.stringify(Object.fromEntries(kinds))}; ok with nothing pending, started, no drop: ${okNothing.length}; untaken (no take) ${untaken.length}; errors ${list.filter((r) => r.ok !== true).length}`);
    console.log(`  take ${q(list.map(take))}; path after the take ${q(list.map(afterTake))}; last step to release ${q(list.map(gap))}; activation after release ${q(list.map(act))}`);
    const named = list.filter((r, k) => ['stale', 'ambiguous', 'unknown'].includes(land[k]) || okNothing.includes(r));
    for (const r of named) console.log(`  row #${r.i}: landing ${j.landingOf(r)}, ok ${r.ok}, notice ${j.pendingOf(r).kind}, next refused ${r.next?.ok === false}, ${times(r)}`);
  }
}
