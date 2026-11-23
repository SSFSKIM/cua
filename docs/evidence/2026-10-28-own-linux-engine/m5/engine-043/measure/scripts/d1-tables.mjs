#!/usr/bin/env node
// Task 132 (from task 126's d1-tables.mjs): what each cua lane's step did on D1's dnd cell, from its engines' `--stats`
// lines (run/engine-stats/): per lane, the drags, the takes, the gate open and shut, the schedule (after the path, inside
// the floor), the visits dropped (one; both, `skipped`), the step's added time and the drag's answer time. Read-only.
//   node d1-tables.mjs <run dir>...
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const q = (xs, p) => { const s = [...xs].filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : NaN; };
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const tri = (xs) => (xs.length ? `${f1(q(xs, 0.5))} / ${f1(q(xs, 0.95))} / ${f1(Math.max(...xs))}` : '–');
const lanes = new Map();
for (const run of process.argv.slice(2)) {
  const dir = join(run, 'engine-stats');
  for (const f of readdirSync(dir)) {
    const label = f.split('.').slice(1, -2).join('.');
    const lane = lanes.get(label) ?? { drags: 0, take: 0, rec: 0, open: 0, shut: 0, after: 0, inFloor: 0, d1: 0, d2: 0, motions: [], added: [], past: [], elapsed: [] };
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => { const o = JSON.parse(l); return o.stats ?? o; })) {
      if (line.command !== 'drag') continue;
      lane.drags += 1;
      lane.elapsed.push(line.elapsed_ms);
      if (line.hold?.taken) lane.take += 1;
      const s = line.release_sync;
      if (!s) continue;
      lane.rec += 1;
      if (s.open) lane.open += 1; else lane.shut += 1;
      if (s.schedule === 'after_path') lane.after += 1;
      if (s.schedule === 'in_floor') lane.inFloor += 1;
      if (s.visits_dropped === 1) lane.d1 += 1;
      if (s.visits_dropped === 2) lane.d2 += 1;
      if (Number.isFinite(s.motions)) lane.motions.push(s.motions);
      if (Number.isFinite(s.added_ms)) lane.added.push(s.added_ms);
      if (Number.isFinite(s.past_floor_ms)) lane.past.push(s.past_floor_ms);
    }
    lanes.set(label, lane);
  }
}
console.log('| lane | drags | taken | with a step record | gate open / shut | schedule after_path / in_floor | visits dropped 1 / 2 (skipped) | motions p50 | step added ms p50 / p95 / max | released past the floor ms p50 / max | answer ms p50 |');
console.log('|---|---:|---:|---:|---|---|---|---:|---|---|---:|');
for (const [label, l] of [...lanes].sort()) {
  console.log(`| ${label} | ${l.drags} | ${l.take} | ${l.rec} | ${l.rec ? `${l.open} / ${l.shut}` : '–'} | ${l.rec ? `${l.after} / ${l.inFloor}` : '–'} | ${l.rec ? `${l.d1} / ${l.d2}` : '–'} | ${f1(q(l.motions, 0.5))} | ${tri(l.added)} | ${l.past.length ? `${f1(q(l.past, 0.5))} / ${f1(Math.max(...l.past))}` : '–'} | ${f1(q(l.elapsed, 0.5))} |`);
}
