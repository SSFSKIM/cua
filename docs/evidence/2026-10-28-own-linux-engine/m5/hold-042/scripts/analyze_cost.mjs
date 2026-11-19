#!/usr/bin/env node
// Task 113: the final hold's cost on D1's and D2's drag cells: each cua lane of each run judged as the run judges its
// shipped lane (drag-judge.mjs dragVerdict and cellVerdict), with every cell's warm medians beside the vendor builds'.
// usage: node analyze_cost.mjs <checkout> <results.jsonl>...
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [root, ...files] = process.argv.slice(2);
const { dragVerdict, cellVerdict } = await import(pathToFileURL(join(root, 'scripts/linux-engine-diff/drag-judge.mjs')).href);
const r1 = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : '–');
for (const file of files) {
  const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const cells = rows.filter((r) => r.kind === 'drag-cell');
  const lanes = [...new Set(cells.flatMap((c) => Object.keys(c.lanes)))];
  console.log(`\n## ${file}\n`);
  console.log(`| family | kind | pinned ms | newest ms | ${lanes.map((l) => `${l} ms | ${l} took | ${l}`).join(' | ')} |`);
  console.log(`|---|---|---:|---:|${lanes.map(() => '---:|---:|---').join('|')}|`);
  for (const c of cells) {
    const per = lanes.map((l) => {
      const lane = c.lanes[l];
      if (!lane) return '– | – | –';
      const speed = c.speed?.[l];
      const verdict = cellVerdict(c, l);
      return `${r1(c.ms[l])} | ${lane.took}/${lane.n} | ${verdict}${speed && speed.verdict !== 'pass' ? ` (speed ${speed.verdict}${speed.interval ? ` [${speed.interval.join(', ')}] vs ${speed.against} ${speed.bar}` : ''})` : ''}`;
    });
    console.log(`| ${c.family} | ${c.drag} | ${r1(c.ms.pinned)} | ${r1(c.ms.newest)} | ${per.join(' | ')} |`);
  }
  for (const l of lanes) {
    const v = dragVerdict(cells, { lane: l });
    console.log(`- ${l}: ${v.pass ? 'PASS' : `FAIL: ${v.failed.join('; ')}`}${v.declared.length ? `; declared: ${v.declared.join('; ')}` : ''}`);
  }
}
