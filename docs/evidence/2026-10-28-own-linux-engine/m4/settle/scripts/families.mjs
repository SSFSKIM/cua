// The search sittings' held steps per method and family, idle and at twice the load (the latest sitting of each cell
// and load, as constants.mjs takes them): the largest held step of the family's cells for the method, `none` when one
// held at no step, `lost` when its input never came at any step. usage: node families.mjs <harness dir> <results>...
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const [harness, ...files] = process.argv.slice(2);
const { FAMILY_SCENES, KIND_METHOD, heldStep, lostInput } = await import(join(harness, 'scripts/linux-engine-diff/action-settle-cells.mjs'));
const familyOf = Object.fromEntries(Object.entries(FAMILY_SCENES).flatMap(([f, scenes]) => scenes.map((s) => [s, f])));
const latest = new Map();
for (const file of files) {
  const text = file.endsWith('.gz') ? gunzipSync(readFileSync(file)).toString('utf8') : readFileSync(file, 'utf8');
  const series = text.trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.kind === 'settle-series');
  for (const [cell, mine] of Map.groupBy(series, (s) => s.cell)) latest.set(`${cell}@${mine[0].load}`, { scene: mine[0].scene, method: KIND_METHOD[mine[0].input], load: mine[0].load, held: heldStep(mine), lost: lostInput(mine) });
}
const families = Object.keys(FAMILY_SCENES);
const methods = [...new Set([...latest.values()].map((r) => r.method))];
const cell = (method, family, load) => {
  const mine = [...latest.values()].filter((r) => r.method === method && familyOf[r.scene] === family && r.load === load);
  if (!mine.length) return '·';
  if (mine.some((r) => r.held === null && !r.lost)) return '**none**';
  const held = mine.filter((r) => r.held !== null).map((r) => r.held);
  const lost = mine.some((r) => r.lost) ? ' (lost)' : '';
  return held.length ? `${Math.max(...held)}${lost}` : 'lost';
};
console.log(`| method | ${families.join(' | ')} |`);
console.log(`|---|${families.map(() => '---').join('|')}|`);
for (const method of methods) console.log(`| ${method} | ${families.map((f) => `${cell(method, f, 0)} / ${cell(method, f, 2)}`).join(' | ')} |`);
