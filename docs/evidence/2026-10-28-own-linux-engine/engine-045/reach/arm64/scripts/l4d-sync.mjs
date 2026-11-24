#!/usr/bin/env node
// Task 163: L4d's Chrome rows at H10 (0.4.5), read-only. First the fields check: every Chrome row must carry a top-level
// `release_sync` (drop-signals.mjs `releaseSyncOf`) holding 0.4.5's `overran`, `last_step_after_take_ms` and
// `unconfirmed`; a row without them is a fault, not a pass. Then per Chrome part and cell: rows, overran (with their
// last_step_after_take_ms against floor_until), the tail's schedule, visits_dropped, and `unconfirmed` by cause, with
// the outcome beside each cause.
//   node l4d-sync.mjs <results.jsonl[.gz]>
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const f = process.argv[2];
const raw = readFileSync(f);
const rows = (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === 'drop-signal' && r.family === 'chrome');
const q = (xs, p) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : NaN; };
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const NEW = ['overran', 'last_step_after_take_ms', 'unconfirmed'];
const bad = rows.filter((r) => !r.release_sync || NEW.some((k) => !(k in r.release_sync)));
console.log(`Fields check: ${rows.length} Chrome rows; ${rows.length - bad.length} carry release_sync with ${NEW.join(', ')}; ${bad.length} do not${bad.length ? `: ${bad.map((r) => `part ${(r.part ?? 0) + 1} ${r.cell} #${r.i}`).join(', ')}` : ''}.\n`);
const landed = (r) => r.outcome?.landed === true;
const noticed = (r) => Boolean(r.notice || r.reply_notice);
console.log('| part | cell | rows | overran | overran: last_step_after_take_ms min / p50 / max (floor_until) | schedule after_path / in_floor | of after_path, gate open / overran with the gate shut | visits_dropped 0 / 1 / 2 | unconfirmed by cause (outcome) |');
console.log('|---:|---|---:|---:|---|---|---|---|---|');
for (const k of [...new Set(rows.map((r) => `${r.part ?? 0}|${r.cell}`))]) {
  const [part, cell] = k.split('|');
  const l = rows.filter((r) => `${r.part ?? 0}|${r.cell}` === k);
  const s = (r) => r.release_sync ?? {};
  const ov = l.filter((r) => s(r).overran === true);
  const lst = ov.map((r) => s(r).last_step_after_take_ms);
  const ap = l.filter((r) => s(r).schedule === 'after_path');
  const cause = {};
  for (const r of l) { const c = `${s(r).unconfirmed ?? 'null'} (${landed(r) ? 'landed' : noticed(r) ? 'honest' : r.ok === true ? 'ok, no notice' : 'refused'})`; cause[c] = (cause[c] ?? 0) + 1; }
  console.log(`| ${Number(part) + 1} | ${cell} | ${l.length} | ${ov.length} | ${ov.length ? `${f1(Math.min(...lst))} / ${f1(q(lst, 0.5))} / ${f1(Math.max(...lst))} (${[...new Set(ov.map((r) => r.hold?.floor_until_ms))].join(', ')})` : '–'} | ${ap.length} / ${l.filter((r) => s(r).schedule === 'in_floor').length}${l.some((r) => !['after_path', 'in_floor'].includes(s(r).schedule)) ? ` (other or none: ${l.filter((r) => !['after_path', 'in_floor'].includes(s(r).schedule)).length})` : ''} | ${ap.filter((r) => s(r).open === true).length} / ${ap.filter((r) => s(r).open !== true && s(r).overran === true).length} | ${[0, 1, 2].map((v) => l.filter((r) => s(r).visits_dropped === v).length).join(' / ')} | ${Object.entries(cause).map(([c, n]) => `${c}: ${n}`).join('; ')} |`);
}
const inFloorOver = rows.filter((r) => r.release_sync?.schedule === 'in_floor' && r.release_sync?.overran === true);
console.log(`\nIn-floor rows that overran (item 1 would have moved them): ${inFloorOver.length}.`);
