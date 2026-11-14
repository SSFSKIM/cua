#!/usr/bin/env node
// Task 73: the cursor a drop showed at its release, per lane, against whether it landed (the question of an Electron
// drop's signal: the drag loop's final cursor status). For each handle-dnd run of a cua lane, the last displayed-cursor
// change (`xgrab cursors`, cursors.jsonl) at or before the release's wall time (the engine's `--stats` handle record,
// `release_wall_ms`), named by its image: each image is labelled by how often it was the cursor at a landed and at a
// missed drop. A cursor that told the two apart would show images only at landed drops and others only at misses.
// usage: node cursors.mjs <run dir>...
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const lines = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

for (const dir of process.argv.slice(2)) {
  const rows = lines(join(dir, 'run/results.jsonl')).filter((r) => r.kind === 'drag-run' && r.drag === 'handle-dnd');
  const steps = lines(join(dir, 'handles.jsonl'));
  const cursors = lines(join(dir, 'cursors.jsonl')).sort((a, b) => a.wall_ms - b.wall_ms);
  console.log(`\n${dir.split('/').pop()}: ${cursors.length} cursor changes\n`);
  console.log('| lane | cursor image at the release | landed | missed | the misses\' answers |');
  console.log('|---|---|---:|---:|---|');
  const table = new Map();
  for (const r of rows) {
    const end = steps.find((s) => s.phase === 'answer' && s.step === 'end' && s.lane === r.engine && s.kind === 'handle-dnd' && s.i === r.i);
    const release = end?.handle?.release_wall_ms;
    if (typeof release !== 'number') continue;
    const before = cursors.filter((c) => c.wall_ms <= release).at(-1);
    const image = before ? `${before.image}${before.name ? ` (${before.name})` : ''}` : 'none';
    const k = `${r.engine}|${image}`;
    const cell = table.get(k) ?? { lane: r.engine, image, landed: 0, missed: 0, answers: [] };
    if (r.took) cell.landed++;
    else {
      cell.missed++;
      const after = steps.find((s) => s.phase === 'after' && s.lane === r.engine && s.kind === 'handle-dnd' && s.i === r.i);
      cell.answers.push(end.ok ? (after?.notice ? `ok, then ${/late/.test(after.notice) ? 'late' : /unconfirmed/.test(after.notice) ? 'unconfirmed' : 'pending'} notice` : 'ok, nothing pending') : String(end.error).slice(0, 60));
    }
    table.set(k, cell);
  }
  for (const c of table.values()) console.log(`| ${c.lane} | ${c.image} | ${c.landed} | ${c.missed} | ${c.answers.join('; ') || '–'} |`);
}
