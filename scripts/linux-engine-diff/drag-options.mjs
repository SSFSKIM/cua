// A drag experiment's lanes as options (M3.1, the Chrome drop misses): per family, kind and lane, the runs taken against
// the pinned build's, and the drag time against the pinned build's under Acceptance 3's rule (20 a side, the interval
// guard, the label), as a Markdown table.
//
//   node scripts/linux-engine-diff/drag-options.mjs <results.jsonl> <run>

import { readFileSync } from 'node:fs';

import { medianDifferenceInterval } from './events.mjs';
import { median, noiseBound, speedLabel } from './stats.mjs';

const [file, run] = process.argv.slice(2);
const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.run === run && r.kind === 'drag-run');
const cells = [...new Set(rows.map((r) => `${r.family}|${r.drag}`))];
const lanes = [...new Set(rows.map((r) => r.engine))].filter((l) => l !== 'pinned');
const r2 = (v) => (v === null ? '–' : Math.round(v * 10) / 10);
console.log('| family | kind | lane | taken | pinned taken | drag ms (median) | pinned ms | cua − pinned, 95% interval | speed |');
console.log('|---|---|---|---:|---:|---:|---:|---|---|');
for (const cell of cells) {
  const [family, drag] = cell.split('|');
  const of = (lane) => rows.filter((r) => r.family === family && r.drag === drag && r.engine === lane);
  const pinned = of('pinned');
  const pTook = pinned.filter((r) => r.took).length;
  const pMs = pinned.map((r) => r.ms).filter(Number.isFinite);
  for (const lane of lanes) {
    const mine = of(lane);
    if (!mine.length) continue;
    const ms = mine.map((r) => r.ms).filter(Number.isFinite);
    let speed = '–';
    let interval = null;
    if (lane !== 'xtest' && ms.length >= 20 && pMs.length >= 20) {
      interval = medianDifferenceInterval(ms, pMs);
      const bound = noiseBound(median(pMs));
      speed = interval[1] <= bound ? speedLabel(interval) : interval[0] > 0 ? '**loss**' : '**undetermined**';
    } else if (lane !== 'xtest') speed = `too few (${ms.length}/${pMs.length})`;
    const took = mine.filter((r) => r.took).length;
    console.log(`| ${family} | ${drag} | ${lane} | ${took}/${mine.length}${took < pTook ? ' **below pinned**' : ''} | ${pTook}/${pinned.length} | ${r2(median(ms))} | ${r2(median(pMs))} | ${interval ? `[${interval.join(', ')}]` : '–'} | ${speed} |`);
  }
}
