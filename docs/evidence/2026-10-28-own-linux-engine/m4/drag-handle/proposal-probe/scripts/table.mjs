#!/usr/bin/env node
// Task 73's probe tables: per sitting, kind and lane, the runs, the answers ok, the runs that took (a selection or a
// range only when its value changed to the pinned build's, a drop when the page counted one more), and for the drop
// page whether the page saw the press (`downs` one more) and any buttonless move in the press's pointer log.
// usage: node table.mjs <run dir>...
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
for (const dir of process.argv.slice(2)) {
  const rows = readFileSync(join(dir, 'run/results.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === 'drag-run');
  const disturbance = dir.match(/probe-([a-z]+)-/)?.[1];
  console.log(`\n${dir.split('/').pop()} (disturbed lanes: newest, cua:d)\n`);
  console.log('| kind | lane | runs | answered ok | took | press seen (dnd) | buttonless moves (dnd) |');
  console.log('|---|---|---:|---:|---:|---:|---:|');
  const kinds = [...new Set(rows.map((r) => r.drag))];
  for (const kind of kinds) {
    for (const lane of ['pinned', 'newest', 'cua', 'cua:d', 'control']) {
      const rs = rows.filter((r) => r.drag === kind && r.engine === lane);
      if (!rs.length) continue;
      const took = rs.filter((r) => r.took && (kind === 'handle-dnd' || !same(r.after, r.before))).length;
      const dnd = kind === 'handle-dnd';
      const seen = dnd ? rs.filter((r) => r.after && r.before && r.after.downs === r.before.downs + 1).length : '–';
      const buttonless = dnd ? rs.filter((r) => r.after && r.before && r.after.downs === r.before.downs + 1 && (r.after.log?.moves ?? []).some((m) => m.buttons === 0)).length : '–';
      console.log(`| ${kind} | ${lane}${['newest', 'cua:d'].includes(lane) ? ` (${disturbance})` : ''} | ${rs.length} | ${rs.filter((r) => r.ok).length} | ${took} | ${seen} | ${buttonless} |`);
    }
  }
}
