// #299: one row per target and position, the two repetitions side by side (rep1 / rep2) or merged where equal.
//   node scripts/probe-299/compact.mjs <run-dir>
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const dir = process.argv[2];
const rows = [];
for (const d of readdirSync(dir)) {
  const f = join(dir, d, 'results.json');
  if (!existsSync(f)) continue;
  const {config, results} = JSON.parse(readFileSync(f, 'utf8'));
  for (const r of results) rows.push({...r, app: config.group.startsWith('chrome') ? 'Chrome' : config.group === 'safari' ? 'Safari' : 'native', rep: config.rep});
}
const both = (a, b) => a === b || b === undefined ? `${a}` : `${a} / ${b}`;
const groups = new Map();
for (const r of rows) {
  const k = `${r.app}|${r.target}|${r.pos}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const pick = (rs, f) => { const v = rs.sort((a, b) => a.rep - b.rep).map(f); return both(v[0], v[1]); };
console.log('| app | target | pos | limits fired (main) | nodes | depth | bytes (MB) | walk ms | checked % | container-only % | unrecorded % | wide (40k nodes, 64 MiB, 60 s): nodes, MB, walk ms, checked % | page y / height |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const order = [...groups.keys()].sort((a, b) => {
  const [ra, rb] = [groups.get(a)[0], groups.get(b)[0]];
  return ra.app.localeCompare(rb.app) || ra.target.localeCompare(rb.target) || (ra.posIndex ?? 0) - (rb.posIndex ?? 0);
});
for (const k of order) {
  const rs = groups.get(k);
  const r0 = rs[0];
  const m = r => r.obs?.main, w = r => r.obs?.wide;
  const g = (r, e) => r.obs?.[e]?.guard?.clickable;
  const page = r0.pageInfo?.scrollY != null ? `${r0.pageInfo.scrollY} / ${r0.pageInfo.scrollHeight}` : `top ${m(r0)?.host?.contentTop ?? '-'}`;
  console.log(`| ${r0.app} | ${r0.target} | ${r0.pos} | ${pick(rs, r => m(r)?.fired?.join(', ') || 'none')} | ${pick(rs, r => m(r)?.nodes)} | ${pick(rs, r => m(r)?.maxDepth)} | ${pick(rs, r => ((m(r)?.estimatedBytes ?? 0) / 1e6).toFixed(1))} | ${pick(rs, r => Math.round(m(r)?.walkMs ?? 0))} | ` +
    `${pick(rs, r => g(r, 'main')?.checked)} | ${pick(rs, r => g(r, 'main')?.containerOnly)} | ${pick(rs, r => g(r, 'main')?.unrecorded)} | ` +
    `${pick(rs, r => `${w(r)?.nodes}${w(r)?.fired?.includes('nodeCap') ? '(cut)' : ''}, ${((w(r)?.estimatedBytes ?? 0) / 1e6).toFixed(0)}, ${Math.round(w(r)?.walkMs ?? 0)}, ${g(r, 'wide')?.checked}`)} | ${page} |`);
}
// The prices measured beside the walks.
const vw = rows.filter(r => r.vwalk?.nodes && r.app === 'Chrome');
const perNode = vw.map(r => r.vwalk.ms / r.vwalk.nodes).sort((a, b) => a - b);
const desc = rows.flatMap(r => (r.descend?.rows ?? []).map(x => x[0])).sort((a, b) => a - b);
const q = (xs, p) => xs.length ? +xs[Math.min(xs.length - 1, Math.round((xs.length - 1) * p))].toFixed(2) : null;
const walkPer = rows.filter(r => r.obs?.wide?.nodes > 5000).map(r => r.obs.wide.walkMs / r.obs.wide.nodes).sort((a, b) => a - b);
const bytesPer = rows.filter(r => r.obs?.wide?.nodes > 5000).map(r => r.obs.wide.estimatedBytes / r.obs.wide.nodes).sort((a, b) => a - b);
console.log(`\nengine walk per node (wide, trees > 5k nodes): p50 ${q(walkPer, 0.5)} ms, p95 ${q(walkPer, 0.95)} ms; bytes per node p50 ${Math.round(q(bytesPer, 0.5))}`);
console.log(`geometry-only walk per node (tool, Chrome): p50 ${q(perNode, 0.5)} ms, p95 ${q(perNode, 0.95)} ms`);
console.log(`point-directed descent from the window, per click point (all apps, n=${desc.length}): p50 ${q(desc, 0.5)} ms, p95 ${q(desc, 0.95)} ms, max ${q(desc, 1)} ms`);
const pruned = rows.filter(r => r.vwalk?.nodes && r.fullWalk?.nodes).map(r => `${r.app}/${r.target}: ${r.vwalk.nodes} of ${r.fullWalk.nodes}`);
console.log(`window-pruned geometry walk vs whole tree (top): ${[...new Set(pruned)].join('; ')}`);
