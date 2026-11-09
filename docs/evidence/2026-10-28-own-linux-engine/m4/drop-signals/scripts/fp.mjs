#!/usr/bin/env node
// Task 68: the passive accept rule's false accepts (a leave read as accepted), with their watch lines around the take.
// usage: fp.mjs <harness dir> <run dir>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [harness, dir] = process.argv.slice(2);
const judge = await import(join(harness, 'scripts/linux-engine-diff/drop-signals-judge.mjs'));
let window = null;
for (const line of readFileSync(join(dir, 'run/results.jsonl'), 'utf8').trim().split('\n')) {
  const r = JSON.parse(line);
  if (r.kind === 'drop-signal-scene') window = r.window;
  if (r.kind !== 'drop-signal' || !r.wall || !r.watch) continue;
  const s = judge.signalsOf(r.watch, { target: window, pressMs: r.wall.press_ms, releaseMs: r.wall.release_ms, engineTook: typeof r.hold?.taken === 'boolean' ? r.hold.taken : null });
  if (!s.accept_shown || r.outcome?.landed || s.late_take) continue;
  const take = r.watch.find((l) => l.kind === 'take' && l.owner && l.wall_ms >= r.wall.press_ms - 5);
  console.log(r.lane, r.cell, r.i, 'take', take?.server_time, r.watch.filter((l) => ['take', 'cursor'].includes(l.kind)).map((l) => `${l.kind === 'take' ? 'T' + l.owner : l.serial}${l.named ? 'n' : ''}:${l.server_time - take.server_time}@${(l.wall_ms - r.wall.release_ms).toFixed(1)}`).join(' '));
}
