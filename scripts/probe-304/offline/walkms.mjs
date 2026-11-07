// #304: main's walk ms against the fix build's (run.mjs `--variant`), per page, from results.json: medians and the
// paired difference. The fix build observes after main and the wide build, so a page where both read the same nodes
// (the 6,000-row table, cut inside its rows before any column) measures the run order's own effect.
//   node scripts/probe-304/offline/walkms.mjs <artifact dir>...
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const by = new Map();
for (const d of process.argv.slice(2)) {
  for (const r of JSON.parse(readFileSync(join(d, 'results.json'), 'utf8')).results) {
    if (!r.main || !r.variant) continue;
    if (!by.has(r.target)) by.set(r.target, []);
    by.get(r.target).push([r.main.walkMs, r.variant.walkMs]);
  }
}
const med = xs => { const s = [...xs].sort((a, b) => a - b); return Math.round(s[s.length >> 1]); };
const all = [];
for (const [t, xs] of by) {
  all.push(...xs);
  console.log(`${t}: n ${xs.length}, main median ${med(xs.map(x => x[0]))} ms, fix median ${med(xs.map(x => x[1]))} ms, paired difference median ${med(xs.map(x => x[1] - x[0]))} ms`);
}
console.log(`all: n ${all.length}, main median ${med(all.map(x => x[0]))}, fix median ${med(all.map(x => x[1]))}, paired difference median ${med(all.map(x => x[1] - x[0]))}`);
