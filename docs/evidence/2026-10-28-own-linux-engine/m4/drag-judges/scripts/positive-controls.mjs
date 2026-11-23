#!/usr/bin/env node
// The judges' positive controls, offline on a drag run's own rows (T10): the same judges with another engine as the
// candidate, to show each can pass a good drag. The thumb judge with the newest build as candidate (its coarse steps
// land the full distance every run); the long paths' speed judge with the newest build as candidate against the pinned
// build alone (the newest is far faster there), and with cua as candidate against the pinned build alone.
// usage: node positive-controls.mjs <harness dir> <results.jsonl>
import { readFileSync } from 'node:fs';

const [harness, file] = process.argv.slice(2);
const { judgeRuns } = await import(`${harness}/scripts/linux-engine-diff/drag.mjs`);
const { thumbReach, dragSpeed } = await import(`${harness}/scripts/linux-engine-diff/drag-judge.mjs`);
const runs = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.kind === 'drag-run');
const cell = (family, drag) => judgeRuns(drag, runs.filter((r) => r.family === family && r.drag === drag)).runs;
for (const family of ['chrome', 'electron']) {
  const c = cell(family, 'scroller');
  if (!c.length) continue;
  const reach = thumbReach(c, ['newest', 'cua']);
  console.log(`${family} scroller, the thumb judge: pinned mean ${Math.round(reach.pinned_mean * 10) / 10} px; newest reached ${reach.lanes.newest.reached}/${reach.lanes.newest.n} (shortest ${reach.lanes.newest.shortest}); cua reached ${reach.lanes.cua.reached}/${reach.lanes.cua.n} (shortest ${reach.lanes.cua.shortest})`);
}
for (const [family, drag] of [['chrome', 'canvas'], ['chrome', 'dnd'], ['firefox', 'canvas']]) {
  const c = cell(family, drag);
  if (!c.length) continue;
  for (const candidate of ['newest', 'cua']) {
    const v = dragSpeed(c, { candidate, vendors: ['pinned'] });
    console.log(`${family} ${drag}, the speed judge, ${candidate} against the pinned build alone: ${v.verdict}${v.label ? ` (${v.label})` : ''} ${v.candidate} ms against ${v.against}'s ${v.bar} ms [${v.interval?.join(', ')}]${v.reasons.length ? `; ${v.reasons.join('; ')}` : ''}`);
  }
}
