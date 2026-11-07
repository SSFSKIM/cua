// #304: the compact per-page table of analyze.mjs's JSON (one row per browser, page and position, the repetitions side
// by side), and with `--variant`, main against the live fix build (run.mjs `--variant`) from results.json.
//   node scripts/probe-304/offline/report.mjs <analysis.json>... [--variant <artifact dir>...]
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const args = process.argv.slice(2);
const vi = args.indexOf('--variant');
const files = vi >= 0 ? args.slice(0, vi) : args, variantDirs = vi >= 0 ? args.slice(vi + 1) : [];
const rows = files.flatMap(f => JSON.parse(readFileSync(f, 'utf8'))).filter(r => !r.problem);
const key = r => `${r.group.startsWith('safari') ? 'Safari' : 'Chrome'}|${r.target}|${r.pos}`;
const groups = new Map();
for (const r of rows) { if (!groups.has(key(r))) groups.set(key(r), []); groups.get(key(r)).push(r); }
const join2 = xs => [...new Set(xs)].join('; ');
const order = ['top', 'f25', 'f50', 'f90'];
const keys = [...groups.keys()].sort((a, b) => { const [ba, pa, qa] = a.split('|'), [bb, pb, qb] = b.split('|'); return ba.localeCompare(bb) || pa.localeCompare(pb) || order.indexOf(qa) - order.indexOf(qb); });
console.log('| browser | page | pos | cut | checked / container-only / unrecorded % | container-only pts hole 1 / hole 2 / other | strip-exposed pts | walk ms |');
console.log('|---|---|---|---|---|---|---|---|');
for (const k of keys) {
  const rs = groups.get(k).sort((a, b) => a.rep - b.rep);
  const [browser, page, pos] = k.split('|');
  const h = r => r.holes ?? {};
  const h1 = r => (h(r).hole1e ?? 0) + (h(r).hole1v ?? 0) + (h(r).hole1b ?? 0);
  const h2 = r => h(r).hole2 ?? 0;
  const other = r => (h(r).budget ?? 0) + (h(r).width ?? 0) + (h(r).other ?? 0);
  const otherWhy = r => Object.entries({budget: h(r).budget, width: h(r).width, other: h(r).other}).filter(([, v]) => v).map(([k2]) => k2).join('+');
  console.log(`| ${browser} | ${page} | ${pos} | ${join2(rs.map(r => r.stops.map(s => s.replace('Hit', '')).join('+') || '-'))} | ${join2(rs.map(r => `${r.guard.checked}/${r.guard.containerOnly}/${r.guard.unrecorded}`))} | ` +
    `${join2(rs.map(r => `${h1(r)} / ${h2(r)} / ${other(r)}${otherWhy(r) ? ` (${otherWhy(r)})` : ''}`))} | ${join2(rs.map(r => r.sim?.stripExposure ?? '-'))} | ${rs.map(r => Math.round(r.walkMs)).join(' / ')} |`);
}
if (variantDirs.length) {
  console.log('\nLive: main against the fix build, the guard over each engine\'s own record at the same grid (clickable points).');
  console.log('| page | pos | rep | main checked/co/unrec | fix checked/co/unrec | main walk ms | fix walk ms | main / fix reads | main / fix stops |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const d of variantDirs) {
    if (!existsSync(join(d, 'results.json'))) continue;
    const {config, results} = JSON.parse(readFileSync(join(d, 'results.json'), 'utf8'));
    for (const r of results) {
      if (!r.main || !r.variant) { console.log(`| ${r.target} | ${r.pos} | ${config.rep} | problem ${JSON.stringify(r.mainError ?? r.variantError ?? r.exception ?? '').slice(0, 80)} |`); continue; }
      const g = o => `${o.guard.checked}/${o.guard.containerOnly}/${o.guard.unrecorded}`;
      console.log(`| ${r.target} | ${r.pos} | ${config.rep} | ${g(r.main)} | ${g(r.variant)} | ${Math.round(r.main.walkMs)} | ${Math.round(r.variant.walkMs)} | ${r.main.reads} / ${r.variant.reads} | ${r.main.stops.join('+') || '-'} / ${r.variant.stops.join('+') || '-'} |`);
    }
  }
}
