#!/usr/bin/env node
// Task 129: a t14-late step's rows at H7, read-only, for the report the brief asks for (rulings 954-956):
//  - the judge's verdict row: pass, failed, findings, and each band's counts as it gave them;
//  - per band, from the rows: drags, identified, stop skipped (with why), stop not begun before the thaw, unexercised
//    (the judge's rule: unidentified, or no credited stop), the band's outcome over its exercised rows, late takes;
//  - per cell, the press mark's binding (h7/fix/scripts/binding.mjs's table): bound (press_time and sent_time both
//    numbers), the mark's arrival after the send, its value against the send's server time, the stop, the thaw, the
//    skipped stops, and the marks passed over with why;
//  - the rows that are unexercised or skipped, each with its reason.
// usage: node h7-bands.mjs <results.jsonl[.gz]>
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const f = process.argv[2];
const raw = readFileSync(f);
const rows = (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const drags = rows.filter((r) => r.kind === 'drop-signal');
const v = rows.find((r) => r.kind === 'chrome-drop-verdict');
const BANDS = [['inside', ['freeze-600']], ['edge', ['freeze-646', 'freeze-648', 'freeze-650', 'freeze-652']], ['past', ['freeze-700']]];
const thawOf = (cell) => Number(/^freeze-(\d+)$/.exec(cell)?.[1] ?? NaN);
const identified = (r) => r.hold?.adaptive?.source?.identified === true;
const skippedWhy = (r) => (typeof r.freeze?.skipped === 'string' ? r.freeze.skipped : null);
const credited = (r) => {
  const x = r.freeze;
  if (!x || typeof x.skipped === 'string') return false;
  return Number.isFinite(x.stopped_ms) && x.stopped_ms >= 0 && x.stopped_ms < thawOf(r.base ?? r.cell) && Number.isFinite(x.continued_ms) && x.continued_ms > x.stopped_ms;
};
const span = (xs) => (xs.length ? `${Math.min(...xs)}–${Math.max(...xs)}` : '–');
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

console.log(`== ${f}: ${drags.length} drags, load ${drags[0]?.load}, lanes ${[...new Set(drags.map((r) => r.lane))].join(', ')}`);
console.log(`verdict: pass ${v?.pass}; failed ${JSON.stringify(v?.failed)}`);
console.log(`findings: ${JSON.stringify(v?.findings)}`);
const c = v?.counts ?? {};
console.log(`counts: false_ok ${c.false_ok}, unjudged ${c.unjudged}, missing_landing ${c.missing_landing}, false_alarms ${c.false_alarms}, harness_escapes ${c.harness_escapes}, late ${c.late}, late_reported ${c.late_reported}, untaken ${c.untaken}, landed ${c.landed}, unconfirmed_landed ${c.unconfirmed_landed}`);
console.log(`judge's bands: ${JSON.stringify(c.bands)}`);

console.log('\n| band | drags | identified | stop skipped | stop not before the thaw | unexercised | judge\'s outcome (exercised) | late takes (exercised) | late takes (all) |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const [band, cells] of BANDS) {
  const list = drags.filter((r) => cells.includes(r.cell));
  const unex = list.filter((r) => !identified(r) || !credited(r));
  const ex = list.filter((r) => !unex.includes(r));
  console.log(`| ${band} | ${list.length} | ${list.filter(identified).length} | ${list.filter(skippedWhy).length} | ${list.filter((r) => !skippedWhy(r) && !credited(r)).length} | ${unex.length} | ${c.bands?.[band]?.expected ?? '–'} | ${ex.filter((r) => r.signals?.late_take === true).length} | ${list.filter((r) => r.signals?.late_take === true).length} |`);
}

console.log('\n| cell | n | identified | bound | press marked (ms after send) | median | value − send (server ms) | stop began | thawed | skipped | marks passed over |');
console.log('|---|---:|---:|---:|---|---:|---|---|---|---:|---|');
let allBound = 0, allN = 0;
const deltas = [];
for (const cell of [...new Set(drags.filter((r) => r.freeze).map((r) => r.cell))]) {
  const list = drags.filter((r) => r.cell === cell);
  const fz = list.map((r) => r.freeze);
  const bound = fz.filter((x) => typeof x.press_time === 'number' && typeof x.sent_time === 'number');
  allBound += bound.length; allN += fz.length;
  const d = bound.map((x) => x.press_time - x.sent_time);
  deltas.push(...d);
  const ignored = fz.flatMap((x) => x.press_ignored ?? []);
  const why = [...new Set(ignored.map((x) => x.why))].map((w) => `${ignored.filter((x) => x.why === w).length} ${w}`).join('; ') || 'none';
  const pm = fz.map((x) => x.press_ms).filter((x) => typeof x === 'number');
  console.log(`| ${cell} | ${fz.length} | ${list.filter(identified).length} | ${bound.length} | ${span(pm)} | ${median(pm)} | ${span(d)} | ${span(fz.map((x) => x.stopped_ms).filter((x) => typeof x === 'number'))} | ${span(fz.map((x) => x.continued_ms).filter((x) => typeof x === 'number'))} | ${fz.filter((x) => x.skipped).length} | ${why} |`);
}
console.log(`\nbinding: ${allBound} of ${allN} press marks bound; value − send over the bound: ${span(deltas)} server ms (median ${median(deltas)})`);
const noFreeze = drags.filter((r) => /^freeze-/.test(r.cell) && !r.freeze);
console.log(`freeze rows with no freeze record: ${noFreeze.length}`);
// a stop that began before mark + 55 (the start rule) on a bound row: should be none
const early = drags.filter((r) => r.freeze && typeof r.freeze.press_ms === 'number' && typeof r.freeze.stopped_ms === 'number' && r.freeze.stopped_ms < Math.max(60, r.freeze.press_ms + 55) - 1);
console.log(`stops begun more than 1 ms before max(60, mark + 55): ${early.length}${early.length ? ` (${early.map((r) => `${r.cell} #${r.i}: mark ${r.freeze.press_ms}, stop ${r.freeze.stopped_ms}`).join('; ')})` : ''}`);

const unexRows = drags.filter((r) => /^freeze-/.test(r.cell) && (!identified(r) || !credited(r)));
console.log(`\nunexercised rows: ${unexRows.length}`);
for (const r of unexRows) {
  const s = r.hold?.adaptive?.source;
  console.log(`  ${r.cell} #${r.i}: ${!identified(r) ? `unidentified (${String(s?.why ?? s?.by ?? r.hold?.adaptive?.why ?? 'no adaptive record').slice(0, 160)})` : ''}${skippedWhy(r) ? ` skipped: ${skippedWhy(r)}` : !credited(r) ? ` no credited stop: ${JSON.stringify(r.freeze)}` : ''}; ok ${r.ok}, landed ${r.outcome?.landed ?? null}`);
}
const ident = new Map();
for (const r of drags) {
  const s = r.hold?.adaptive?.source;
  const k = s ? (s.identified ? `identified by: ${String(s.by).slice(0, 110)}` : `unidentified: ${String(s.why ?? s.by).slice(0, 140)}`) : `no adaptive record (${r.hold ? `adaptive ${JSON.stringify(r.hold.adaptive)}` : 'no hold'})`;
  ident.set(k, (ident.get(k) ?? 0) + 1);
}
console.log('\nidentification over every drag:');
for (const [k, n] of ident) console.log(`  ${n} | ${k}`);
