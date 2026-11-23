#!/usr/bin/env node
// Task 135, L4d at H8 on 0.4.3 (rulings 957, 961, 962, 972, 993): a plan-of-parts run's rows, read-only, per part and
// cell, from task 129's l4d-parts.mjs with the gate split added:
//  - the judge's own part verdict (the run's `drop-parts-verdict` row): pass, failed, and its counts;
//  - from the rows, with the judge's own helpers (drop-signals-judge.mjs at the checkout given): landed where the path
//    ended, drops at a stale position, ambiguous (within 3 px of the zone's border: "in the margin"), unplaced, kept
//    notices by kind (the honest unconfirmed among them), oks with nothing pending and no drop, and untaken;
//  - the gate's reading, DERIVED (counted rows carry no `release_sync`: drop-signals.mjs copies none of it from
//    `--stats`, and a counted run takes no --engine-stats), by ruling 993's rule as release_sync.rs states it: on a
//    Chrome source only, open when the drop was let drop with its take seen (`after_release.released_with_take`), the
//    floor sent no keepalive (`hold.keepalives` 0) and the path's last step came past the 350 ms floor after the take
//    (`hold.path_ms` less the take > 350: the floor spaces nothing past its end). Task 126's c-cost.mjs rule (the release
//    more than 2 ms past 350 ms after the take) is 0.4.2's: on 0.4.3 the tail inside the floor releases at the floor's end,
//    which under load comes a few ms late, so it is not used. The check on the derivation: the open rows' last step to
//    release is the tail's span (3 x 8 ms) and the shut rows' release comes at the floor's end (`release after the take`,
//    below). The tail's schedule, also derived: `after_path` where the gate is open, `in_floor` where a take was seen and
//    the gate is shut, none without a take; Electron's sources get no tail (`n/a`). The tail's motions and
//    visits_dropped are not in the rows and are not derived. Every count is given split by the derived gate, open / shut;
//  - each cell's timings (min / median / max): take after the press, path after the take, last step to release (the
//    wall press-to-release less `hold.path_ms`: with the tail, its span), Chrome's activation after the release;
//  - every row a fail could name (stale, ambiguous, unplaced, or ok with nothing pending, no drop, the drag started),
//    each with those times, the derived gate and schedule, and the cursor before the end (the last cursor change before
//    the release, ms after the press).
// usage: node l4d-h8.mjs <checkout> <results.jsonl[.gz]>
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
const pressToRelease = (r) => (r.wall ? r.wall.release_ms - r.wall.press_ms : null);
const gap = (r) => (r.wall && Number.isFinite(r.hold?.path_ms) ? pressToRelease(r) - r.hold.path_ms : null);
const act = (r) => r.signals?.activation_after_release_ms ?? null;
const chrome = (r) => r.family === 'chrome';
const open = (r) => chrome(r) && r.after_release?.released_with_take === true && (r.hold?.keepalives ?? 0) === 0 && afterTake(r) > 350;
const schedule = (r) => (!chrome(r) ? 'n/a' : open(r) ? 'after_path' : Number.isFinite(take(r)) && r.after_release?.released_with_take === true ? 'in_floor' : 'none');
const cursorBefore = (r) => {
  const rel = pressToRelease(r);
  const cs = (r.signals?.cursors ?? []).filter((c) => Number.isFinite(rel) && c.t_ms <= rel);
  const c = cs.at(-1);
  return c ? `${c.image}${c.named ? ' (named)' : ''} at ${r1(c.t_ms)} ms` : 'none';
};
const times = (r) => `take ${r1(take(r))} ms, path after the take ${r1(afterTake(r))} ms, gate (derived) ${open(r) ? 'open' : 'shut'}, schedule (derived) ${schedule(r)}, release ${r1(r.after_take?.release_after_take_ms)} ms after the take, keepalives ${r.hold?.keepalives}, last step to release ${r1(gap(r))} ms, activation after release ${r1(act(r))} ms, cursor before the end ${cursorBefore(r)}`;
const split = (list, pred) => `${list.filter(pred).length} (${list.filter((r) => open(r) && pred(r)).length} / ${list.filter((r) => !open(r) && pred(r)).length})`;
console.log('\ncounts are "all (gate open / gate shut)", the gate derived');
for (const p of v?.counts?.parts ?? []) {
  const own = rows.filter((r) => r.kind === 'drop-signal' && r.part === p.part);
  console.log(`\n--- part ${p.part + 1}: ${p.family} ${p.plan} (${p.judge}): pass ${p.pass}`);
  console.log(`judge's counts: ${JSON.stringify(p.counts)}`);
  for (const cell of [...new Set(own.map((r) => `${r.lane}|${r.cell}`))]) {
    const list = own.filter((r) => `${r.lane}|${r.cell}` === cell);
    const landing = new Map(list.map((r) => [r, j.landingOf(r)]));
    const honestKind = (r) => { const pd = j.pendingOf(r); return pd.kept ? pd.kind : null; };
    const okNothing = (r) => r.ok === true && j.pendingOf(r).kind === null && r.outcome?.started === true && r.outcome?.landed !== true;
    const kinds = new Map();
    for (const r of list) {
      const pd = j.pendingOf(r);
      const k = pd.kind === null ? (pd.refused ? 'refused, no notice' : 'none') : `${pd.kind}${pd.kept ? '' : ' (not kept)'}`;
      kinds.set(k, (kinds.get(k) ?? 0) + 1);
    }
    console.log(`${cell.replace('|', ' ')}: ${list.length} drags, gate open ${list.filter(open).length} / shut ${list.filter((r) => !open(r)).length}; schedule (derived) ${JSON.stringify(Object.fromEntries([...new Set(list.map(schedule))].map((s) => [s, list.filter((r) => schedule(r) === s).length])))}; path end ${j.pathEndOf(list[0])}`);
    console.log(`  landed ${split(list, (r) => landing.get(r) === 'landed')}, stale ${split(list, (r) => landing.get(r) === 'stale')}, in the margin ${split(list, (r) => landing.get(r) === 'ambiguous')}, unplaced ${split(list, (r) => landing.get(r) === 'unknown')}, ok with nothing pending and no drop ${split(list, okNothing)}, honest unconfirmed ${split(list, (r) => honestKind(r) === 'unconfirmed')}, other honest ${split(list, (r) => honestKind(r) !== null && honestKind(r) !== 'unconfirmed')}, untaken ${split(list, (r) => !Number.isFinite(take(r)))}, errors ${split(list, (r) => r.ok !== true)}, activations ${split(list, (r) => Number.isFinite(act(r)))}`);
    console.log(`  notices ${JSON.stringify(Object.fromEntries(kinds))}`);
    console.log(`  take ${q(list.map(take))}; path after the take ${q(list.map(afterTake))}; last step to release ${q(list.map(gap))}; activation after release ${q(list.map(act))}`);
    console.log(`  the derivation's check: open rows' last step to release ${q(list.filter(open).map(gap))}; shut rows' release after the take ${q(list.filter((r) => !open(r)).map((r) => r.after_take?.release_after_take_ms))}`);
    for (const r of list.filter((x) => ['stale', 'ambiguous', 'unknown'].includes(landing.get(x)) || okNothing(x))) console.log(`  row #${r.i}: landing ${landing.get(r)}, ok ${r.ok}, notice ${j.pendingOf(r).kind}, next refused ${r.next?.ok === false}, ${times(r)}`);
  }
}
