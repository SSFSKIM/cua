// Task 129: a run's row kinds, its verdict rows and one drop-signal row's timing fields (read-only, for reading the
// L4d row shape).  node peek.mjs <results.jsonl[.gz]> [cell]
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const f = process.argv[2];
const b = readFileSync(f);
const rows = (f.endsWith('.gz') ? gunzipSync(b) : b).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const k = {};
for (const r of rows) { const key = `${r.kind}${r.part !== undefined ? ` part${r.part}` : ''}`; k[key] = (k[key] ?? 0) + 1; }
console.log(k);
for (const r of rows.filter((x) => /verdict/.test(x.kind))) console.log(JSON.stringify(r).slice(0, 2500));
const d = rows.find((r) => r.kind === 'drop-signal' && r.cell === (process.argv[3] ?? 'long-left'));
if (d) console.log(JSON.stringify({ keys: Object.keys(d), signals: d.signals, wall: d.wall, hold: d.hold, after_release: d.after_release, outcome: d.outcome, end: d.end, ok: d.ok, notice: d.notice, reply_notice: d.reply_notice }).slice(0, 4000));
