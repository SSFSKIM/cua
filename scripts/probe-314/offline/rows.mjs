// #314's A/B offline check of the printed run on /fixedtail: per observation file, the web area's printed children in
// order, each named by its paragraph (the first "Paragraph N" or "link N" in its subtree, a label that is not empty),
// against the positions its `shown` ranges list: whether child k of the printed run is the paragraph at position k
// (paragraph N sits at position N-1), whether the paragraphs increase, and whether the fixed tail is the last printed.
//   node scripts/probe-314/offline/rows.mjs <artifact dir>...
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';

const label = n => [n.title, n.description, n.value].find(v => v != null && String(v) !== '') ?? '';
const tally = {};
for (const dir of process.argv.slice(2)) {
  for (const f of readdirSync(dir).filter(f => f.includes('fixed-tail') && f.endsWith('.json.gz'))) {
    const head = f.match(/-([ab])\.json\.gz$/)[1];
    const o = JSON.parse(gunzipSync(readFileSync(join(dir, f))));
    const w = o.nodes.findIndex(n => n.role === 'AXWebArea');
    if (w < 0) continue;
    const wa = o.nodes[w], d = wa.depth;
    const kids = [];
    for (let j = w + 1; j < o.nodes.length && o.nodes[j].depth > d; j++) {
      if (o.nodes[j].depth !== d + 1) continue;
      let name = null;
      for (let k = j; k < o.nodes.length && (k === j || o.nodes[k].depth > d + 1); k++) {
        const m = String(label(o.nodes[k])).match(/^(?:Paragraph|link) (\d+)\b/);
        if (m) { name = Number(m[1]); break; }
      }
      kids.push({role: o.nodes[j].role, para: name});
    }
    const positions = (wa.shown?.ranges ?? []).flatMap(([lo, hi]) => Array.from({length: hi - lo}, (_, k) => lo + k));
    const paras = kids.filter(k => k.para != null).map(k => k.para);
    const matches = kids.every((k, i) => k.para == null ? positions[i] === 2500 && k.role === 'AXToolbar' : positions[i] === k.para - 1);
    const increasing = paras.every((p, i) => i === 0 || p > paras[i - 1]);
    const tailLast = kids.length ? kids.at(-1).role === 'AXToolbar' : null;
    const key = `${dir.split('/').find(s => s.startsWith('probe-314-ab-')) ?? dir} ${head}`;
    const t = (tally[key] ??= {observations: 0, printedRun: 0, matches: 0, increasing: 0, tailLast: 0, sizes: new Set()});
    t.observations += 1;
    if (kids.length) { t.printedRun += 1; t.sizes.add(kids.length); }
    if (kids.length && matches) t.matches += 1;
    if (kids.length && increasing) t.increasing += 1;
    if (tailLast) t.tailLast += 1;
  }
}
for (const [k, t] of Object.entries(tally)) console.log(k, JSON.stringify({...t, sizes: [...t.sizes].sort((a, b) => a - b)}));
