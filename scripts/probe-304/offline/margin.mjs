// #304: hole 1's margin. For each clickable point whose hit has a strip ancestor over the whole tree, where in main's
// selection order (the replay, which reproduces main's own record) the hit was read, against the budget: a hit read
// late, after the walk took up what it had set aside, is one a slightly larger page would have left container-only.
//   node scripts/probe-304/offline/margin.mjs <artifact dir> <label>...
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {clickable} from '../guard.mjs';
import {tree, select, chainNodes} from './sim.mjs';

const [dir, ...labels] = process.argv.slice(2);
const load = f => JSON.parse(gunzipSync(readFileSync(f)));
for (const label of labels) {
  const lbl = label.replace(/[^a-z0-9+-]+/gi, '_');
  const points = load(join(dir, `grid-${lbl}.json.gz`)).points;
  const wide = load(join(dir, `obs-${lbl}-wide.json.gz`));
  const T = tree(wide.probeReads, wide.probeMenu);
  const w = select(T, {});
  const pos = new Map(w.order.map((i, k) => [i, k]));
  // The first read set aside and taken up later: where the walk's second pass began.
  const thin = i => { const f = T.rs[i].frame; return f && (f.w <= 1 || f.h <= 1); };
  const orders = [];
  let unread = 0;
  for (const p of points) {
    if (!clickable(p.chain)) continue;
    const path = chainNodes(T, p.chain);
    if (!path.slice(0, -1).some(thin)) continue;
    const hit = path[path.length - 1];
    if (pos.has(hit)) orders.push(pos.get(hit)); else unread += 1;
  }
  orders.sort((a, b) => a - b);
  console.log(`${label}: kept ${w.kept} (cut ${w.cut}); strip-exposed clickable points ${orders.length + unread}, read at selection order min ${orders[0] ?? '-'} median ${orders[orders.length >> 1] ?? '-'} max ${orders[orders.length - 1] ?? '-'}, unread ${unread}`);
}
