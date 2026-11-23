#!/usr/bin/env node
// Task 136: L4d's rows at H8 (0.4.3) per part and cell: landed, stale-position drops, false oks, honest (a notice),
// untaken; and the release-sync gate's reading DERIVED offline by c-cost.mjs's rule, since a counted row carries no
// `release_sync` record: open = a take, no keepalive, and the release more than 2 ms past take + 350 (schedule
// after_path); shut with a floor otherwise (schedule in_floor). `motions` and `visits_dropped` can't be read from the
// rows. Then every failing Chrome row with its take time, path time after the take, the derived gate, the last-step-to-
// release gap, the activation time and the cursor before the end. Read-only.
//   node l4d-parts.mjs <results.jsonl[.gz]>
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const f = process.argv[2];
const raw = readFileSync(f);
const rows = (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === 'drop-signal');
const took = (r) => r.hold?.taken === true || r.signals?.take_after_press_ms != null || r.press?.taken === true;
const stale = (r) => ['left', 'long-left'].includes(r.cell) && r.outcome?.landed === true;
const falseOk = (r) => r.ok === true && !r.reply_notice && !r.notice && r.next?.ok !== false && r.outcome?.landed !== true;
const afterTake = (r) => r.after_take?.release_after_take_ms ?? NaN;
const gateOpen = (r) => took(r) && (r.hold?.keepalives ?? 0) === 0 && afterTake(r) > 352;
// ruling 993's rule (x64's task 135): open = the path after the take outlasts 350 ms with no keepalive, the path's own end
// (hold.path_ms less the take) rather than the release, which a late in-floor release can push past 352 under load
const pathAfterTake = (r) => (r.hold?.path_ms != null && r.hold?.take_after_press_ms != null ? r.hold.path_ms - r.hold.take_after_press_ms : NaN);
const gateOpen993 = (r) => took(r) && (r.hold?.keepalives ?? 0) === 0 && pathAfterTake(r) > 350;
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
console.log("| part | family | cell | drags | landed | stale-position drops | false ok | honest (a notice) | untaken | derived gate open / shut, 993's rule (the path after the take) | the same by c-cost.mjs's 0.4.2 rule (the release after the take) |");
console.log('|---:|---|---|---:|---:|---:|---:|---:|---:|---|---|');
const parts = [...new Set(rows.map((r) => `${r.part ?? 0}|${r.family}|${r.cell}`))];
for (const k of parts) {
  const [part, family, cell] = k.split('|');
  const l = rows.filter((r) => `${r.part ?? 0}|${r.family}|${r.cell}` === k);
  const n = (p) => l.filter(p).length;
  console.log(`| ${Number(part) + 1} | ${family} | ${cell} | ${l.length} | ${n((r) => r.outcome?.landed === true)} | ${n(stale)} | ${n(falseOk)} | ${n((r) => r.outcome?.landed !== true && (r.notice || r.reply_notice))} | ${n((r) => !took(r))} | ${family === 'chrome' ? `${n(gateOpen993)} / ${n((r) => took(r) && !gateOpen993(r))}` : '–'} | ${family === 'chrome' ? `${n(gateOpen)} / ${n((r) => took(r) && !gateOpen(r))}` : '–'} |`);
}
const bad = rows.filter((r) => r.family === 'chrome' && (stale(r) || falseOk(r)));
console.log(`\nfailing Chrome rows: ${bad.length}`);
if (bad.length) {
  console.log('| part | cell | # | what | take after the press (ms) | path after the take (ms) | derived gate | last step to release (ms) | keepalives | activation after the release (ms) | cursor before the end |');
  console.log('|---:|---|---:|---|---:|---:|---|---:|---:|---:|---|');
  for (const r of bad) {
    const gap = r.wall ? r.wall.release_ms - r.wall.press_ms - r.hold.path_ms : NaN;
    const curs = (r.signals?.cursors ?? []).filter((c) => !r.wall || c.t_ms <= r.wall.release_ms - r.wall.press_ms).at(-1);
    console.log(`| ${(r.part ?? 0) + 1} | ${r.cell} | ${r.i} | ${stale(r) ? 'stale drop' : 'false ok'} | ${f1(r.hold?.take_after_press_ms)} | ${f1(afterTake(r))} | ${gateOpen993(r) ? 'open (after_path)' : 'shut (in_floor)'} (993's rule) | ${f1(gap)} | ${r.hold?.keepalives ?? '–'} | ${f1(r.signals?.activation_after_release_ms ?? NaN)} | ${curs ? `${curs.image}${curs.named ? ' (named)' : ''} at ${curs.t_ms} ms` : '–'} |`);
  }
}
