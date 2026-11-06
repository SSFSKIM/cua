// The service's settle constants from the search sittings (#171 M4, T8): each sitting's `settle-series` rows give each
// cell's held step (action-settle-cells.mjs `heldStep`), and `methodConstants` takes, per method, the largest held step
// across the cells and sittings. A cell measured again at the same load in a later sitting (a later file) is judged by
// that sitting alone, which supersedes the earlier one (a rerun after a harness fix). Prints a Markdown table per
// method, then each cell's held step per load.
// usage: node constants.mjs <harness dir> <results.jsonl[.gz]>...
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const [harness, ...files] = process.argv.slice(2);
const { heldStep, lostInput, methodConstants, KIND_METHOD } = await import(join(harness, 'scripts/linux-engine-diff/action-settle-cells.mjs'));
const latest = new Map();
const cells = new Map();
for (const file of files) {
  const series = (file.endsWith('.gz') ? gunzipSync(readFileSync(file)).toString('utf8') : readFileSync(file, 'utf8')).trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.kind === 'settle-series');
  const byCell = Map.groupBy(series, (s) => s.cell);
  for (const [cell, mine] of byCell) {
    const held = heldStep(mine);
    const load = mine[0].load;
    latest.set(`${cell}@${load}`, { cell, method: KIND_METHOD[mine[0].input], load, held, lost: lostInput(mine) });
    if (!cells.has(cell)) cells.set(cell, {});
    cells.get(cell)[load ? `${load}x` : 'idle'] = { held, lanes: `${mine.map((s) => `${s.lane.replace('settle-', '')}:${s.reached ? 'held' : `${s.misses} misses (${s.late} late, ${s.never} never) in ${s.runs}`}`).join(', ')} (${file.split('/').at(-2)})` };
  }
}
const constants = methodConstants([...latest.values()]);
console.log('| method | constant (ms) | set by | cells that held at no step | cells whose input never came at any step (set aside) |');
console.log('|---|---:|---|---|---|');
for (const [method, c] of Object.entries(constants)) console.log(`| ${method} | ${c.ms}${c.unmeasured ? ' (unmeasured)' : ''} | ${c.by.join('; ') || '–'} | ${c.unheld.join('; ') || '–'} | ${c.lost?.join('; ') || '–'} |`);
console.log('');
const loads = [...new Set([...cells.values()].flatMap((c) => Object.keys(c)))];
console.log(`| cell | ${loads.map((l) => `held (${l})`).join(' | ')} | ${loads.map((l) => `series (${l})`).join(' | ')} |`);
console.log(`|---|${loads.map(() => '---:').join('|')}|${loads.map(() => '---').join('|')}|`);
for (const [cell, by] of cells) console.log(`| ${cell} | ${loads.map((l) => by[l]?.held ?? (by[l] ? '**none**' : '–')).join(' | ')} | ${loads.map((l) => by[l]?.lanes ?? '–').join(' | ')} |`);
