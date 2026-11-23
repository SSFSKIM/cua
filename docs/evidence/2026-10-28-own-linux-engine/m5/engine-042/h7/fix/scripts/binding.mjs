// Task 128 (the review of cf1ef10f, findings 1 and 2): each t14-late cell's press marks as the bound rule took them,
// from a run's rows: the mark's arrival after the send, its value (the press's X server time) against the send's
// server time, the stop, the thaw, and the marks passed over with why.  node binding.mjs <results.jsonl>
import { readFileSync } from 'node:fs';

const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.kind === 'drop-signal' && r.freeze);
const span = (xs) => (xs.length ? `${Math.min(...xs)}–${Math.max(...xs)}` : '–');
console.log('| cell | n | bound | press marked (ms after send) | value − send (server ms) | stop began | thawed | skipped | marks passed over |');
console.log('|---|---:|---:|---|---|---|---|---:|---|');
for (const cell of [...new Set(rows.map((r) => r.cell))]) {
  const f = rows.filter((r) => r.cell === cell).map((r) => r.freeze);
  const bound = f.filter((x) => typeof x.press_time === 'number' && typeof x.sent_time === 'number');
  const ignored = f.flatMap((x) => x.press_ignored ?? []);
  const why = [...new Set(ignored.map((x) => x.why))].map((w) => `${ignored.filter((x) => x.why === w).length} ${w}`).join('; ') || 'none';
  console.log(`| ${cell} | ${f.length} | ${bound.length} | ${span(f.map((x) => x.press_ms).filter((x) => typeof x === 'number'))} | ${span(bound.map((x) => ((x.press_time - x.sent_time) | 0)))} | ${span(f.map((x) => x.stopped_ms).filter((x) => typeof x === 'number'))} | ${span(f.map((x) => x.continued_ms).filter((x) => typeof x === 'number'))} | ${f.filter((x) => x.skipped).length} | ${why} |`);
}
