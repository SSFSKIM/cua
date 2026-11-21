#!/usr/bin/env node
// Task 122, ruling 986: L4d's failing rows (Chrome false oks and stale-position drops) against #459's shape: a Chrome
// long-left drag, activated after its release, whose path after the take ran past the 350 ms floor. Each row: the take
// after the press, the path's time after the take, the gap from the last step to the release, the keepalives, Chrome's
// activation after the release, the answer, and which of the three conditions hold. Read-only.
//   node l4d-rows.mjs <results.jsonl[.gz]>
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const FLOOR = 350;
const f = process.argv[2];
const raw = readFileSync(f);
const rows = (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === 'drop-signal');
const falseOk = (r) => r.ok === true && !r.reply_notice && !r.notice && r.next?.ok !== false && r.outcome?.landed !== true;
// a stale-position drop: the page's drop counter rose although the path ended outside the zone (left, long-left)
const stale = (r) => ['left', 'long-left'].includes(r.cell) && r.outcome?.landed === true;
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
console.log('| family | cell | # | block | cold | what | take after the press (ms) | path after the take (ms) | last step to release (ms) | keepalives | activation after the release (ms) | answer | long-left | activated | past the floor | #459 shape |');
console.log('|---|---|---:|---:|---|---|---:|---:|---:|---:|---:|---|---|---|---|---|');
let outside = 0;
for (const r of rows.filter((x) => x.family === 'chrome' && (falseOk(x) || stale(x)))) {
  const afterTake = r.after_take?.release_after_take_ms ?? (r.hold?.path_ms != null && r.hold?.take_after_press_ms != null ? r.hold.path_ms - r.hold.take_after_press_ms : NaN);
  const gap = r.wall ? r.wall.release_ms - r.wall.press_ms - r.hold.path_ms : NaN;
  const act = r.signals?.activation_after_release_ms;
  const c = { longLeft: r.cell === 'long-left', activated: act != null, pastFloor: afterTake > FLOOR };
  const shape = c.longLeft && c.activated && c.pastFloor;
  if (!shape) outside += 1;
  const answer = r.notice ? 'ok, a notice on the read' : r.reply_notice ? 'ok, a notice on the reply' : 'ok, nothing pending';
  console.log(`| ${r.family} | ${r.cell} | ${r.i} | ${r.block} | ${r.cold ? 'cold' : 'warm'} | ${stale(r) ? 'stale drop' : 'false ok'} | ${f1(r.hold?.take_after_press_ms)} | ${f1(afterTake)} | ${f1(gap)} | ${r.hold?.keepalives ?? '–'} | ${f1(act ?? NaN)} | ${answer} | ${c.longLeft ? 'yes' : 'NO'} | ${c.activated ? 'yes' : 'NO'} | ${c.pastFloor ? 'yes' : 'NO'} | ${shape ? 'yes' : '**OUTSIDE**'} |`);
}
console.log(outside ? `\n${outside} failing row(s) outside #459's shape (ruling 986).` : "\nEvery failing row has #459's shape (ruling 986).");
const elec = rows.filter((x) => x.family === 'electron' && (falseOk(x) || stale(x)));
console.log(`Electron rows failing: ${elec.length}.`);
