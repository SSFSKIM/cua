// #304: one observation's container-only and under-strip clickable points in detail: the chosen node, the strip (its
// frame, children, whether the walk entered or set it aside, its place in the selection's order) and the hit.
//   node scripts/probe-304/offline/inspect.mjs <artifact dir> <label, e.g. chrome-b/wiki-article/f50>
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {rows, buildRecord, verdictAt, clickable, underStrip} from '../guard.mjs';

const [dir, label] = process.argv.slice(2);
const lbl = label.replace(/[^a-z0-9+-]+/gi, '_');
const load = f => JSON.parse(gunzipSync(readFileSync(f)));
const points = load(join(dir, `grid-${lbl}.json.gz`)).points;
const main = load(join(dir, `obs-${lbl}-main.json.gz`));
const reads = rows(main.probeReads);
const rec = buildRecord(reads);
const f = r => r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}` : '-';
const seen = new Set();
console.log('window', JSON.stringify(main.window), 'timings', JSON.stringify({walkMs: main.timings.walkMs, nodeCapHit: main.timings.nodeCapHit}));
for (const p of points) {
  if (!clickable(p.chain)) continue;
  const v = verdictAt(rec, p);
  const s = underStrip(rec, p.chain);
  if (v.v !== 'unrecordedDescendant' && !s) continue;
  const strip = v.gap ?? s;
  const k = `${v.v}:${v.via}:${v.node?.number}:${strip?.number}`;
  if (seen.has(k)) continue;
  seen.add(k);
  const sr = strip?.read;
  console.log(`(${p.x},${p.y}) ${v.v}${v.via ? ':' + v.via : ''} node=${v.node?.role}#${v.node?.number} [${f(v.node?.frame)}] complete=${v.node?.complete}` +
    (strip ? ` strip=${strip.role}#${strip.number} [${f(strip.frame)}] kids ${sr.childCount}/${sr.chosen} enters=${sr.enters} expanded=${sr.expanded} order=${sr.order} depth=${sr.depth}` : '') +
    ` hit=${JSON.stringify(p.chain.slice(0, 4).map(c => `${c[0]} ${c.slice(1).map(Math.round).join(',')}`))} title=${JSON.stringify(p.title)}`);
}
const charged = reads.filter(r => r.order >= 0).length;
const strips = reads.filter(r => r.frame && (r.frame.w <= 1 || r.frame.h <= 1) && r.chosen > 0);
console.log(`charged ${charged}; strips with children ${strips.length}, set aside ${strips.filter(r => !r.expanded).length}`);
