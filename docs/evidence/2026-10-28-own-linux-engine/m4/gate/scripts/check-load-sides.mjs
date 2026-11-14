#!/usr/bin/env node
// M4's gate (T18, the design session's ruling 699): every stored verdict of drag-judge.mjs's load judge (`loadCounts`),
// read row by row from the gate's records, to show that the two sides it compared had equal counts. The judge passes a
// lane when `mine.took >= pinned.took || p >= LOAD_P`; the raw-count half is sound only while both sides ran as many
// runs, which ruling 697 found false in P6's re-judge. Each `drag-cell` row with a `load` record gives, per lane, the
// lane's and the pinned build's run counts; they are recounted from the record's own `drag-run` rows. A row whose sides
// differ is judged again by Fisher alone (p >= LOAD_P, its false successes still failing it), beside the stored verdict.
// Read-only. usage: node check-load-sides.mjs <harness checkout (for LOAD_P and Fisher)> <gate evidence directory>
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const [harness, gate] = process.argv.slice(2);
if (!harness || !gate) {
  console.error('usage: node check-load-sides.mjs <harness checkout> <gate evidence directory>');
  process.exit(2);
}
const { LOAD_P, fisherMissesAtLeast } = await import(join(harness, 'scripts/linux-engine-diff/drag-judge.mjs'));
const DIRS = ['out', 'out-rerun1', 'c2-f9692898/out', 'c3-c55c8e08/out'];
const read = (f) => (f.endsWith('.gz') ? gunzipSync(readFileSync(f)) : readFileSync(f)).toString('utf8');

const table = [];
let records = 0;
for (const base of DIRS) {
  for (const step of readdirSync(join(gate, base)).filter((d) => d.endsWith('.release-gate')).sort()) {
    const file = ['results.jsonl', 'results.jsonl.gz'].map((x) => join(gate, base, step, 'run', x)).find(existsSync);
    if (!file) continue;
    records += 1;
    const rows = read(file).trim().split('\n').map((l) => JSON.parse(l));
    const runs = rows.filter((r) => r.kind === 'drag-run');
    for (const cell of rows.filter((r) => r.kind === 'drag-cell' && r.load)) {
      const mine = (engine) => runs.filter((r) => r.family === cell.family && r.drag === cell.drag && r.engine === engine);
      const pinned = cell.load.pinned;
      const recountPinned = mine('pinned');
      for (const [lane, c] of Object.entries(cell.load.lanes)) {
        const recount = mine(lane);
        const equal = c.n === pinned.n;
        const recounted = recount.length === c.n && recount.filter((r) => r.took).length === c.took && recountPinned.length === pinned.n && recountPinned.filter((r) => r.took).length === pinned.took;
        let fisherOnly = null;
        if (!equal && c.judged) {
          const p = fisherMissesAtLeast(c.n - c.took, c.n, pinned.n - pinned.took, pinned.n);
          fisherOnly = !c.no_effect_runs?.length && !c.wrong_target_runs?.length && p >= LOAD_P ? 'pass' : 'fail';
        }
        table.push({ at: `${base}/${step.replace('.release-gate', '')}`, cell: `${cell.family} ${cell.drag}`, lane, n: c.n, took: c.took, pn: pinned.n, ptook: pinned.took, judged: c.judged, stored: c.pass ? 'pass' : 'fail', equal, recounted, fisherOnly });
      }
    }
  }
}

console.log(`# drag-judge.mjs's load judge, its stored verdicts read row by row (ruling 699): ${gate}`);
console.log(`records read: ${records} (${DIRS.join(', ')}); LOAD_P ${LOAD_P}`);
console.log('\n| step | cell | lane | lane runs (took) | pinned runs (took) | judged | stored verdict | sides equal | recounted from drag-run rows | by Fisher alone |');
console.log('|---|---|---|---:|---:|---|---|---|---|---|');
for (const t of table) console.log(`| ${t.at} | ${t.cell} | ${t.lane} | ${t.n} (${t.took}) | ${t.pn} (${t.ptook}) | ${t.judged} | ${t.stored} | ${t.equal ? 'yes' : '**no**'} | ${t.recounted ? 'yes' : '**no**'} | ${t.fisherOnly ?? '–'} |`);
const unequal = table.filter((t) => !t.equal);
const unrecounted = table.filter((t) => !t.recounted);
const moved = unequal.filter((t) => t.fisherOnly !== null && t.fisherOnly !== t.stored);
console.log(`\nrows: ${table.length} in ${new Set(table.map((t) => t.at)).size} steps; sides equal on ${table.length - unequal.length}; unequal ${unequal.length}; counts not matching the drag-run rows ${unrecounted.length}; verdicts that Fisher alone moves ${moved.length}`);
const ok = unequal.length === 0 && unrecounted.length === 0;
console.log(`RESULT: ${ok ? 'every row compared equal counts on both sides' : 'NOT every row: see the rows marked'}`);
process.exit(ok ? 0 : 1);
