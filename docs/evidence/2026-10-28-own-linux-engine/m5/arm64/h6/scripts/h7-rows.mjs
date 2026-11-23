#!/usr/bin/env node
// Task 122 at H7 (rulings 954-956, 963, 969, 982): a C1 or L4c run's t14-late rows, per cell: identified, the press
// mark bound (its value, the press's server time, against the send's), the stop after the mark's arrival (ruling 982:
// a stop that began before its mark was bound is a fail-open), skipped stops with their reasons, and each band's
// outcome as the row shows it. Read-only.
//   node h7-rows.mjs <results.jsonl[.gz]>
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const f = process.argv[2];
const raw = readFileSync(f);
const rows = (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === 'drop-signal');
const span = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? `${s[0].toFixed(1)}–${s.at(-1).toFixed(1)}` : '–'; };
const HOLD_NOTICE = 'the page may have started a drag that did not complete';
console.log('| cell | n | identified | mark bound | mark after the send (ms) | value − send (server ms) | stop after the mark (ms) | stops before the mark | skipped (why) | landed after an in-hold take | late takes | hold notice, no drop | plain ok, no drop |');
console.log('|---|---:|---:|---:|---|---|---|---:|---|---:|---:|---:|---:|');
const failOpen = [];
for (const cell of [...new Set(rows.map((r) => r.cell))]) {
  const l = rows.filter((r) => r.cell === cell);
  const fz = l.map((r) => r.freeze ?? {});
  const bound = fz.filter((x) => typeof x.press_time === 'number' && typeof x.sent_time === 'number');
  const stopAfter = fz.filter((x) => Number.isFinite(x.stopped_ms) && Number.isFinite(x.press_ms)).map((x) => x.stopped_ms - x.press_ms);
  const before = l.filter((r) => Number.isFinite(r.freeze?.stopped_ms) && (!Number.isFinite(r.freeze?.press_ms) || r.freeze.stopped_ms < r.freeze.press_ms));
  failOpen.push(...before);
  const skipped = fz.filter((x) => x.skipped);
  const why = [...skipped.reduce((m, x) => m.set(String(x.skipped_why ?? x.why ?? x.skipped), (m.get(String(x.skipped_why ?? x.why ?? x.skipped)) ?? 0) + 1), new Map())].map(([k, n]) => `${k} ×${n}`).join('; ');
  const n = (p) => l.filter(p).length;
  console.log(`| ${cell} | ${l.length} | ${n((r) => r.hold?.adaptive?.source?.identified === true)} | ${bound.length} | ${span(fz.map((x) => x.press_ms))} | ${span(bound.map((x) => x.press_time - x.sent_time))} | ${span(stopAfter)} | ${before.length} | ${skipped.length}${why ? ` (${why})` : ''} | ${n((r) => r.hold?.taken === true && r.outcome?.landed === true && !r.signals?.late_take)} | ${n((r) => r.signals?.late_take === true)} | ${n((r) => r.reply_notice === HOLD_NOTICE && r.outcome?.landed !== true && !r.signals?.late_take)} | ${n((r) => r.ok === true && !r.reply_notice && !r.notice && r.next?.ok !== false && r.outcome?.landed !== true)} |`);
}
console.log(failOpen.length ? `\nFAIL-OPEN (ruling 982): ${failOpen.map((r) => `${r.cell} #${r.i}`).join(', ')}` : '\nRuling 982: every stop began after its press mark was bound (no fail-open).');
