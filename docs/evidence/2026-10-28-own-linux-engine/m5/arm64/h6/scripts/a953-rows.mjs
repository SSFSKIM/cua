#!/usr/bin/env node
// Task 122, ruling 953: every row of a drop-signals run's cell, one line each: the sample, cold or warm, what it was
// (landed; a false ok: answered ok with no drop and nothing pending; or honest: a notice), the take after the press, the
// path's time, the gap from the last step to the release, the keepalives, Chrome's activation after the release, the
// confirmation the engine took, and the answer. Then the split by whether Chrome's activation came. Read-only.
//   node a953-rows.mjs <results.jsonl[.gz]> <cell>
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const [file, cell] = process.argv.slice(2);
const raw = readFileSync(file);
const rows = (file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean)
  .map((l) => JSON.parse(l)).filter((r) => r.kind === 'drop-signal' && r.cell === cell);
const cls = (r) => (r.outcome?.landed ? 'landed' : r.ok && !r.reply_notice && !r.notice && r.next?.ok !== false ? 'FALSE OK' : 'honest');
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const answer = (r) => (r.reply_notice ? 'ok, the hold notice' : r.notice ? (/unconfirmed drop/.test(r.notice) ? 'ok; the read: unconfirmed drop' : 'ok; the read: a notice') : 'ok, nothing pending');
console.log(`# ${cell}: ${rows.length} rows`);
console.log('| # | block | cold | outcome | take after the press (ms) | path (ms) | last step to release (ms) | keepalives | activation after the release (ms) | confirmed_by | released_with_take | page started | answer | next request |');
console.log('|---:|---:|---|---|---:|---:|---:|---:|---:|---|---|---|---|---|');
for (const r of rows) {
  const gap = r.wall.release_ms - r.wall.press_ms - r.hold.path_ms;
  console.log(`| ${r.i} | ${r.block} | ${r.cold ? 'cold' : 'warm'} | ${cls(r)} | ${f1(r.hold.take_after_press_ms)} | ${f1(r.hold.path_ms)} | ${f1(gap)} | ${r.hold.keepalives} | ${f1(r.signals.activation_after_release_ms ?? NaN)} | ${(r.after_release.confirmed_by ?? 'none').replace(/\(\d+\)/, '')} | ${r.after_release.released_with_take} | ${r.outcome.started} | ${answer(r)} | ${r.next?.ok ? 'ran' : 'refused'} |`);
}
const act = rows.filter((r) => r.signals.activation_after_release_ms != null);
const none = rows.filter((r) => r.signals.activation_after_release_ms == null);
const n = (l, c) => l.filter((r) => cls(r) === c).length;
console.log(`\nChrome activated after the release on ${act.length} (${act.filter((r) => !r.cold).length} warm): landed ${n(act, 'landed')}, false ok ${n(act, 'FALSE OK')}, honest ${n(act, 'honest')}. No activation on ${none.length} (${none.filter((r) => r.cold).length} cold): landed ${n(none, 'landed')}, false ok ${n(none, 'FALSE OK')}, honest ${n(none, 'honest')}.`);
