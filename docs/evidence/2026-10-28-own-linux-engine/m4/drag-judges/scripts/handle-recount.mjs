#!/usr/bin/env node
// Firefox's held-move cells recounted (T10's fix wave): per cell and lane, what Firefox received per drag, as coalesced
// pointermove samples and as dispatched pointermove events (the batch count the first sitting read as 2 against 16),
// and the pointerrawupdate samples, each as median [min–max], beside the runs that took.
// usage: node handle-recount.mjs <results.jsonl>
import { readFileSync } from 'node:fs';

const rows = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.kind === 'drag-run' && r.drag.startsWith('handle-'));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
const spread = (xs) => (xs.length ? `${median(xs)} [${Math.min(...xs)}–${Math.max(...xs)}]` : '–');
for (const drag of [...new Set(rows.map((r) => r.drag))]) {
  console.log(`\nFirefox ${drag}: what Firefox received per drag`);
  console.log('| lane | took | records | pointermove samples | pointermove events | pointerrawupdate samples |');
  console.log('|---|---:|---:|---|---|---|');
  for (const lane of [...new Set(rows.filter((r) => r.drag === drag).map((r) => r.engine))]) {
    const mine = rows.filter((r) => r.drag === drag && r.engine === lane);
    const rec = mine.map((r) => r.received).filter(Boolean);
    console.log(`| ${lane} | ${mine.filter((r) => r.took).length}/${mine.length} | ${rec.length} | ${spread(rec.map((x) => x.moves))} | ${spread(rec.map((x) => x.move_events))} | ${spread(rec.map((x) => x.raw))} |`);
  }
}
