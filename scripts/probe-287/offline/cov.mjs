// #287 offline: #304's coverage per page and position, Chrome for Testing beside stable Chrome (and Firefox alone), per
// repetition: the guard's checked / container-only / unrecorded share (%, the kit's guard.mjs), nodes, walk ms (mean of
// the two observations), cut flags.
//   node scripts/probe-287/offline/cov.mjs <run dir>
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const dir = process.argv[2];
const rows = new Map();
for (const a of readdirSync(dir).filter(n => n.startsWith('probe-287-') && n.includes('cov')).sort()) {
  const rep = a.match(/rep(\d)/)[1];
  for (const browser of readdirSync(join(dir, a))) {
    const f = join(dir, a, browser, '304', 'results.json');
    if (!existsSync(f)) continue;
    for (const r of JSON.parse(readFileSync(f, 'utf8')).results) {
      if (r.skipped || r.exception) continue;
      const s = (r.slots ?? []).filter(x => x.obs);
      if (!s.length) continue;
      const g = s[0].obs.guard;
      const key = `${r.label.replace(/^[^/]+\//, '')} rep${rep}`;
      if (!rows.has(key)) rows.set(key, {});
      rows.get(key)[browser] = {checked: g.checked, co: g.containerOnly, un: g.unrecorded, n: g.n, nodes: s.map(x => x.obs.nodes).join('/'),
        walk: Math.round(s.reduce((t, x) => t + x.obs.walkMs, 0) / s.length), cut: s[0].obs.stops.join(',') || '-', same: s.every(x => x.obs.guard.checked === g.checked)};
    }
  }
}
const cell = v => v ? `${v.checked}/${v.co}/${v.un} n${v.n} ${v.nodes}n ${v.walk}ms ${v.cut}${v.same ? '' : ' (slots differ)'}` : '-';
let diffs = 0;
for (const [k, v] of [...rows].sort()) {
  const d = v.cft && v.stable ? Math.round((v.stable.checked - v.cft.checked) * 10) / 10 : null;
  if (d !== null && Math.abs(d) >= 5) diffs++;
  console.log(`${k.padEnd(30)} cft ${cell(v.cft).padEnd(44)} stable ${cell(v.stable).padEnd(44)} ${v.firefox ? 'firefox ' + cell(v.firefox) : ''} ${d !== null ? 'Δchecked ' + d : ''}`);
}
console.log(`rows with |Δchecked| >= 5 points: ${diffs}`);
