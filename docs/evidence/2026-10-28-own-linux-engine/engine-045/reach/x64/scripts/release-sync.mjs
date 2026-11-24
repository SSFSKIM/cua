#!/usr/bin/env node
// Task 162, L4d at H10 on 0.4.5 (#512, ruling 1142 (4); the brief's release_sync table): every Chrome row of a
// plan-of-parts run, read-only, per part and cell, from the row's own `release_sync` (the engine's `--stats` record,
// which H10's drop-signals.mjs copies onto each row, `releaseSyncOf`):
//  - the check before counting: rows with a release_sync record, and with all three of 0.4.5's fields (`overran`,
//    `last_step_after_take_ms`, `unconfirmed`) present as keys (null is a value: `unconfirmed` null is "answered as
//    confirmed or not by the gate"); every Chrome row without them is listed with its row number, take and whether its
//    aim was refused (an unexercised row has no engine record by design: drop-signals.mjs `refusedAimRow`);
//  - the rows whose path overran floor_until, with each one's `last_step_after_take_ms`, sorted, and the range of that
//    field on the rows that did not overrun;
//  - the tail's schedule as it ran (`schedule`: after_path or in_floor; "no tail" where the record has none), split by
//    overran, and the gate (`open`), with their cross-tab;
//  - visits_dropped, and `unconfirmed` by cause (visit_dropped, outlasted, or null);
//  - the tail's motions, added_ms and past_floor_ms (min / median / max).
// usage: node release-sync.mjs <results.jsonl[.gz]>
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const [f] = process.argv.slice(2);
const raw = readFileSync(f);
const rows = (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const r1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);
const q = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? `${r1(s[0])} / ${r1(s[Math.floor(s.length / 2)])} / ${r1(s.at(-1))} (n ${s.length})` : '–';
};
const tally = (list, key) => {
  const m = new Map();
  for (const r of list) { const k = String(key(r)); m.set(k, (m.get(k) ?? 0) + 1); }
  return JSON.stringify(Object.fromEntries([...m].sort()));
};
const NEW = ['overran', 'last_step_after_take_ms', 'unconfirmed'];
const full = (rs) => rs !== null && typeof rs === 'object' && NEW.every((k) => Object.hasOwn(rs, k));
const take = (r) => r.hold?.take_after_press_ms ?? r.signals?.take_after_press_ms ?? null;
const chromeRows = rows.filter((r) => r.kind === 'drop-signal' && r.family === 'chrome');
console.log(`== ${f}`);
console.log(`Chrome rows: ${chromeRows.length}; with release_sync ${chromeRows.filter((r) => r.release_sync).length}; with all three of 0.4.5's fields ${chromeRows.filter((r) => full(r.release_sync)).length}`);
const cells = [...new Set(chromeRows.map((r) => `${r.part}|${r.plan ?? ''}|${r.lane}|${r.cell}`))];
for (const c of cells) {
  const list = chromeRows.filter((r) => `${r.part}|${r.plan ?? ''}|${r.lane}|${r.cell}` === c);
  const [part, plan, lane, cell] = c.split('|');
  const rs = (r) => r.release_sync ?? {};
  const has = list.filter((r) => full(r.release_sync));
  const over = has.filter((r) => rs(r).overran === true);
  const notOver = has.filter((r) => rs(r).overran !== true);
  const sched = (r) => rs(r).schedule ?? 'no tail';
  console.log(`\n--- ${part === 'undefined' ? '' : `part ${Number(part) + 1} `}${plan} ${lane} ${cell}: ${list.length} rows`);
  console.log(`  release_sync: ${list.filter((r) => r.release_sync).length}; all three new fields: ${has.length}`);
  for (const r of list.filter((x) => !full(x.release_sync))) {
    console.log(`  WITHOUT the fields: row #${r.i}, release_sync ${r.release_sync === null || r.release_sync === undefined ? 'absent' : `keys ${Object.keys(r.release_sync).join(',')}`}, skipped ${JSON.stringify(r.skipped ?? null)}, take ${r1(take(r))} ms, ok ${r.ok}`);
  }
  console.log(`  overran floor_until: ${over.length}; their last_step_after_take_ms (sorted): ${JSON.stringify(over.map((r) => r1(rs(r).last_step_after_take_ms)).sort((a, b) => a - b))}`);
  console.log(`  not overran: ${notOver.length}; their last_step_after_take_ms ${q(notOver.map((r) => rs(r).last_step_after_take_ms))}; null on ${notOver.filter((r) => rs(r).last_step_after_take_ms === null).length}`);
  console.log(`  schedule: ${tally(has, sched)}; overran rows ${tally(over, sched)}; not overran ${tally(notOver, sched)}`);
  console.log(`  gate open / overran / schedule: ${tally(has, (r) => `${rs(r).open ? 'open' : 'shut'}/${rs(r).overran ? 'overran' : 'ended by floor_until'}/${sched(r)}`)}`);
  console.log(`  gate open: ${tally(has, (r) => rs(r).open)}; when ${tally(has, (r) => rs(r).when)}; form ${tally(has, (r) => rs(r).form)}`);
  console.log(`  visits_dropped: ${tally(has, (r) => rs(r).visits_dropped ?? 'no tail')}`);
  console.log(`  unconfirmed by cause: ${tally(has, (r) => rs(r).unconfirmed)}`);
  console.log(`  motions ${tally(has, (r) => rs(r).motions ?? 'no tail')}; added_ms ${q(has.map((r) => rs(r).added_ms))}; past_floor_ms ${q(has.map((r) => rs(r).past_floor_ms))}`);
}
