// The service's settle constants from the fix wave's search sittings (#171 M4, T8, task 62's fix wave): each sitting's
// `settle-series` rows give each cell's held step (action-settle-cells.mjs `heldStep`), and `methodConstants` takes, per
// settle, the largest held step across the cells and sittings, a cell held at no step keeping the vendor's 100. A cell
// measured again at the same load in a later file supersedes the earlier one. Prints a Markdown table per settle, then
// each cell's held step per load, then the held step of each settle per family (`--families`).
// usage: node constants.mjs <harness dir> <results.jsonl[.gz]>...
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const [harness, ...files] = process.argv.slice(2);
const { FAMILY_SCENES, heldStep, lostInput, methodConstants, stepsOf } = await import(join(harness, 'scripts/linux-engine-diff/action-settle-cells.mjs'));
const familyOf = Object.fromEntries(Object.entries(FAMILY_SCENES).flatMap(([f, scenes]) => scenes.map((s) => [s, f])));
const latest = new Map();
const cells = new Map();
for (const file of files) {
  const text = file.endsWith('.gz') ? gunzipSync(readFileSync(file)).toString('utf8') : readFileSync(file, 'utf8');
  const series = text.trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.kind === 'settle-series');
  for (const [cell, mine] of Map.groupBy(series, (s) => s.cell)) {
    const { settle, load, scene } = mine[0];
    const held = heldStep(mine);
    latest.set(`${cell}@${load}`, { cell, scene, settle, load, held, lost: lostInput(mine, stepsOf(settle)) });
    if (!cells.has(cell)) cells.set(cell, { settle });
    const lanes = mine.map((s) => `${s.lane.replace('settle-', '')}:${s.reached ? 'held' : `${s.misses} misses (${s.late} late, ${s.never} never${s.refused ? `, ${s.refused} refused` : ''}${s.invalid ? `, ${s.invalid} invalid` : ''}) in ${s.runs}`}`);
    cells.get(cell)[load ? `${load}x` : 'idle'] = { held, lanes: `${lanes.join(', ')} (${file.split('/').at(-2)})` };
  }
}
const constants = methodConstants([...latest.values()]);
console.log('| settle | constant (ms) | set by | cells that held at no step | cells set aside |');
console.log('|---|---:|---|---|---|');
for (const [settle, c] of Object.entries(constants)) console.log(`| ${settle} | ${c.ms}${c.unmeasured ? ' (unmeasured)' : ''} | ${c.by.join('; ') || '–'} | ${c.unheld.join('; ') || '–'} | ${c.lost?.join('; ') || '–'} |`);
console.log('');
const loads = [...new Set([...cells.values()].flatMap((c) => Object.keys(c).filter((k) => k !== 'settle')))];
console.log(`| cell | settle | ${loads.map((l) => `held (${l})`).join(' | ')} | ${loads.map((l) => `series (${l})`).join(' | ')} |`);
console.log(`|---|---|${loads.map(() => '---:').join('|')}|${loads.map(() => '---').join('|')}|`);
for (const [cell, by] of cells) console.log(`| ${cell} | ${by.settle} | ${loads.map((l) => by[l]?.held ?? (by[l] ? '**none**' : '–')).join(' | ')} | ${loads.map((l) => by[l]?.lanes ?? '–').join(' | ')} |`);
console.log('');
// per settle and family: the largest held step of the family's cells, idle / twice the load
const families = Object.keys(FAMILY_SCENES);
const settles = [...new Set([...latest.values()].map((r) => r.settle))];
const step = (settle, family, load) => {
  const mine = [...latest.values()].filter((r) => r.settle === settle && familyOf[r.scene] === family && r.load === load);
  if (!mine.length) return '·';
  if (mine.some((r) => r.held === null)) return '**none**';
  return String(Math.max(...mine.map((r) => r.held)));
};
console.log(`| settle | ${families.join(' | ')} |`);
console.log(`|---|${families.map(() => '---').join('|')}|`);
for (const settle of settles) console.log(`| ${settle} | ${families.map((f) => `${step(settle, f, 0)} / ${step(settle, f, 2)}`).join(' | ')} |`);
