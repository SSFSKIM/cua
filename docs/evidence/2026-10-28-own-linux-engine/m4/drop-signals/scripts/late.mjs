#!/usr/bin/env node
// Task 68: every late take (the source's take after the release) over the runs given: its answer, its drop, and whether
// Chrome's activation or the accept rule's cursor showed. usage: late.mjs <harness dir> <run dir>...
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [harness, ...runs] = process.argv.slice(2);
const judge = await import(join(harness, 'scripts/linux-engine-diff/drop-signals-judge.mjs'));
const t = { late: 0, activation: 0, answered_ok: 0, landed: 0, accept_shown: 0, escaped: 0, cells: {} };
for (const dir of runs) {
  let window = null;
  for (const line of readFileSync(join(dir, 'run/results.jsonl'), 'utf8').trim().split('\n')) {
    const r = JSON.parse(line);
    if (r.kind === 'drop-signal-scene') window = r.window;
    if (r.kind !== 'drop-signal' || !r.wall || !r.watch) continue;
    const s = judge.signalsOf(r.watch, { target: window, pressMs: r.wall.press_ms, releaseMs: r.wall.release_ms, engineTook: typeof r.hold?.taken === 'boolean' ? r.hold.taken : null });
    if (!s.late_take) continue;
    t.late += 1;
    t.activation += s.activation_after_release_ms != null ? 1 : 0;
    t.answered_ok += r.ok ? 1 : 0;
    t.landed += r.outcome?.landed ? 1 : 0;
    t.accept_shown += s.accept_shown ? 1 : 0;
    t.escaped += r.escaped ? 1 : 0;
    const k = `${r.load} ${r.cell}`;
    t.cells[k] = (t.cells[k] ?? 0) + 1;
  }
}
console.log(JSON.stringify(t));
