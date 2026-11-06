// #299: the tables from a run's downloaded artifacts (each a directory holding results.json).
//   node scripts/probe-299/report.mjs <run-dir>
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

const dir = process.argv[2];
const rows = [];
for (const d of readdirSync(dir)) {
  const f = join(dir, d, 'results.json');
  if (!existsSync(f)) continue;
  const {config, results} = JSON.parse(readFileSync(f, 'utf8'));
  if (config.exception) console.log(`${d}: EXCEPTION ${config.exception.split('\n')[0]}`);
  for (const r of results) rows.push({...r, group: config.group, rep: config.rep});
}
const app = g => g.startsWith('chrome') ? 'chrome' : g;
const key = r => `${app(r.group)}/${r.target}`;
const fmt = v => v == null ? '-' : String(v);
const pct = v => v == null ? '-' : `${v}`;
const reasons = o => Object.entries(o ?? {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ') || '-';
for (const k of [...new Set(rows.map(key))]) {
  console.log(`\n### ${k}\n`);
  console.log('| pos | rep | engine | fired | nodes | depth | bytes | walk ms | clickable pts | checked % | container-only % | unrecorded % | container-only reasons (clickable pts) | missed | vis-walk nodes/ms | full tree | descend p50/p95 ms |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows.filter(r => key(r) === k).sort((a, b) => a.pos - b.pos || a.rep - b.rep)) {
    if (r.exception || r.mainError) { console.log(`| ${r.pos} | ${r.rep} | - | PROBLEM ${(r.mainError?.name ?? r.exception ?? '').split('\n')[0].slice(0, 80)} |`); continue; }
    for (const e of ['main', 'wide']) {
      const o = r.obs?.[e];
      if (!o) continue;
      if (o.error) { console.log(`| ${r.pos} | ${r.rep} | ${e} | ERROR ${o.error.name} |`); continue; }
      const g = o.guard.clickable;
      const extra = e === 'main'
        ? `${fmt(r.vwalk?.nodes)}/${fmt(r.vwalk?.ms && Math.round(r.vwalk.ms))} | ${r.fullWalk ? `${r.fullWalk.nodes}${r.fullWalk.stopped ? '+' : ''}/${Math.round(r.fullWalk.ms)}ms` : '-'} | ${fmt(r.descend?.p50)}/${fmt(r.descend?.p95)}`
        : ' | | ';
      console.log(`| ${r.pos} | ${r.rep} | ${e} | ${o.fired.join(', ') || 'none'} | ${o.nodes} | ${o.maxDepth} | ${o.estimatedBytes} | ${Math.round(o.walkMs ?? 0)} | ${g.n} | ${pct(g.checked)} | ${pct(g.containerOnly)} | ${pct(g.unrecorded)} | ${reasons(o.guard.containerOnlyReasons)} | ${o.guard.missedClickable} | ${extra} |`);
    }
  }
}
// The whole-window (unweighted) shares, for reference.
console.log('\n### all points (unweighted), main engine\n');
console.log('| target | pos | rep | n | checked % | container-only % | unrecorded % | page |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const a = r.obs?.main?.guard?.all;
  if (!a) continue;
  console.log(`| ${key(r)} | ${r.pos} | ${r.rep} | ${a.n} | ${a.checked} | ${a.containerOnly} | ${a.unrecorded} | ${JSON.stringify(r.pageInfo?.scrollY != null ? {y: r.pageInfo.scrollY, h: r.pageInfo.scrollHeight} : r.pageInfo?.scroll?.length ?? '')} |`);
}
