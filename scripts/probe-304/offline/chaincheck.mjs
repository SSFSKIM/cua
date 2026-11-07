// #304: how far each clickable grid point's hit chain maps onto the wide tree (sim.mjs `chainNodes`), and where it
// stops: the seeding fixes' simulation is only as good as this mapping.
//   node scripts/probe-304/offline/chaincheck.mjs <artifact dir> <label> [x y]
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {clickable} from '../guard.mjs';
import {tree, chainNodes} from './sim.mjs';

const [dir, label, px, py] = process.argv.slice(2);
const lbl = label.replace(/[^a-z0-9+-]+/gi, '_');
const load = f => JSON.parse(gunzipSync(readFileSync(f)));
const points = load(join(dir, `grid-${lbl}.json.gz`)).points;
const wide = load(join(dir, `obs-${lbl}-wide.json.gz`));
const T = tree(wide.probeReads, wide.probeMenu);
let full = 0, partial = 0, none = 0;
for (const p of points) {
  if (!clickable(p.chain)) continue;
  const found = chainNodes(T, p.chain);
  if (found.length === p.chain.length) full += 1; else if (found.length > 1) partial += 1; else none += 1;
  if (px != null && p.x === Number(px) && p.y === Number(py)) {
    console.log('chain (window first):');
    [...p.chain].reverse().forEach((c, k) => {
      const i = found[k];
      console.log(`  ${k} ${c[0]} ${c.slice(1).join(',')}  ->  ${i == null ? 'LOST' : `${T.rs[i].role} ${JSON.stringify(T.rs[i].frame)} kids ${T.kids[i].length}`}`);
    });
    const last = found[found.length - 1];
    if (last != null && found.length < p.chain.length) console.log('  children of the last found:', T.kids[last].slice(0, 12).map(c => `${T.rs[c].role} ${JSON.stringify(T.rs[c].frame)}`));
  }
}
console.log({full, partial, none});
