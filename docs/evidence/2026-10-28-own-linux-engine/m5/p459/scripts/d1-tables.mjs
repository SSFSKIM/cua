#!/usr/bin/env node
// Task 126: what each cua lane's step cost on D1's dnd cell, from its engines' `--stats` lines (run/engine-stats/):
// per lane, the drags, how many ran the step and how many the gate skipped, the added time (p50 / p95 / max, mean),
// the ping form's expired bounds, and the drag's answer time. Read-only.
//   node d1-tables.mjs <run dir>...
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : NaN; };
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const lanes = new Map();
for (const run of process.argv.slice(2)) {
  const dir = join(run, 'engine-stats');
  for (const f of readdirSync(dir)) {
    const label = f.split('.').slice(1, -2).join('.');
    const lane = lanes.get(label) ?? { drags: 0, ran: 0, skipped: 0, added: [], expired: 0, elapsed: [], take: 0 };
    for (const line of readFileSync(join(dir, f), "utf8").split("\n").filter(Boolean).map((l) => { const o = JSON.parse(l); return o.stats ?? o; })) {
      if (line.command !== 'drag') continue;
      lane.drags += 1;
      lane.elapsed.push(line.elapsed_ms);
      if (line.hold?.taken) lane.take += 1;
      const s = line.release_sync;
      if (!s) continue;
      if (s.skipped_for) lane.skipped += 1;
      else if (Number.isFinite(s.added_ms)) { lane.ran += 1; lane.added.push(s.added_ms); if (s.expired) lane.expired += 1; }
    }
    lanes.set(label, lane);
  }
}
console.log('| lane | drags | taken | step ran | gate skipped | added ms p50 / p95 / max | added ms mean | bound expired | answer ms p50 |');
console.log('|---|---:|---:|---:|---:|---|---:|---:|---:|');
for (const [label, l] of [...lanes].sort()) {
  const mean = l.added.length ? l.added.reduce((a, b) => a + b, 0) / l.added.length : NaN;
  console.log(`| ${label} | ${l.drags} | ${l.take} | ${l.ran} | ${l.skipped} | ${f1(q(l.added, 0.5))} / ${f1(q(l.added, 0.95))} / ${f1(Math.max(...l.added))} | ${f1(mean)} | ${l.ran ? `${l.expired}/${l.ran}` : '–'} | ${f1(q(l.elapsed, 0.5))} |`);
}
