#!/usr/bin/env node
// Task 68: the after-release table's leaves by lane and cell, and the drops' activation latency range, per run.
// usage: leaves.mjs <harness dir> <run dir>...
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [harness, ...runs] = process.argv.slice(2);
const judge = await import(join(harness, 'scripts/linux-engine-diff/drop-signals-judge.mjs'));
for (const dir of runs) {
  let window = null;
  const t = {};
  const lat = [];
  for (const line of readFileSync(join(dir, 'run/results.jsonl'), 'utf8').trim().split('\n')) {
    const r = JSON.parse(line);
    if (r.kind === 'drop-signal-scene') window = r.window;
    if (r.kind !== 'drop-signal' || !r.wall || !r.watch || r.cover) continue;
    const s = judge.signalsOf(r.watch, { target: window, pressMs: r.wall.press_ms, releaseMs: r.wall.release_ms, engineTook: typeof r.hold?.taken === 'boolean' ? r.hold.taken : null });
    if (s.take_after_press_ms == null || s.late_take || !judge.CELL_SOURCE[r.cell]) continue;
    const k = `${r.lane} ${r.cell} ${r.outcome.landed ? 'drop' : 'leave'}`;
    t[k] = (t[k] ?? 0) + 1;
    if (r.outcome.landed && s.activation_after_release_ms != null) lat.push(s.activation_after_release_ms);
  }
  lat.sort((a, b) => a - b);
  console.log(dir.split('/').at(-1), 'activation latency min', lat[0], 'max', lat.at(-1), 'negative', lat.filter((v) => v < 0).length, 'of', lat.length);
  console.log(' leaves:', Object.entries(t).filter(([k]) => k.endsWith('leave')).map(([k, v]) => `${k.replace(/ leave$/, '')} ${v}`).join(', '));
}
