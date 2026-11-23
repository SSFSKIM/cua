// #500: how often an observation's record holds a CFNull label slot (AXTitle, AXDescription, AXValue), from the engine's
// value-free count `timings.nullLabelSlots` (fix/500-cfnull-label). Reads #453's qual results (scripts/probe-453,
// results.json) and #442's lane rows (scripts/probe-433, rows.json) from downloaded artifacts:
//   node scripts/probe-500/nulls.mjs <dir-or-file>...
// One line per app and scene: rows, observations, observations carrying the count, the count's total, its maximum in one
// observation, and the observations with any. A head without the counter shows "no counter".
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, basename} from 'node:path';

const files = [];
const walk = p => statSync(p).isDirectory() ? readdirSync(p).forEach(f => walk(join(p, f))) : /^(results|rows)\.json$/.test(basename(p)) && files.push(p);
process.argv.slice(2).forEach(walk);

const groups = new Map();
const add = (key, rowKey, counts) => {
  const g = groups.get(key) ?? {rows: new Set(), obs: 0, counted: 0, total: 0, max: 0, any: 0};
  g.rows.add(rowKey);
  for (const n of counts) {
    g.obs++;
    if (typeof n !== 'number') continue;
    g.counted++; g.total += n; g.max = Math.max(g.max, n); if (n > 0) g.any++;
  }
  groups.set(key, g);
};

for (const f of files) {
  const data = JSON.parse(readFileSync(f, 'utf8'));
  if (Array.isArray(data?.results)) {
    const head = `${data.config?.label || 'head'} ${String(data.config?.engineRef ?? '').slice(0, 8)}`;
    const app = r => r.app === 'chrome' ? 'Google Chrome' : r.app;
    for (const r of data.results) add(`${head} | ${app(r)} | ${r.cell}`, `${f}:${r.label}`, (r.observations ?? []).map(o => o.timings?.nullLabelSlots));
  } else if (Array.isArray(data)) {
    for (const r of data) add(`${r.head} | ${r.lane} | ${r.cell}/${r.at}`, `${f}:${r.head}:${r.cell}:${r.at}:${r.rep}`, r.observations?.nullLabelSlots ?? []);
  }
}

const line = (k, g) => `| ${k} | ${g.rows.size} | ${g.obs} | ${g.counted ? `${g.total} | ${g.max} | ${g.any}` : 'no counter | - | -'} |`;
console.log('| head | app | scene | rows | observations | nullLabelSlots total | max in one observation | observations with any |');
console.log('|---|---|---|---|---|---|---|---|');
const keys = [...groups.keys()].sort();
for (const k of keys) console.log(line(k, groups.get(k)));
// Per head and app.
const per = new Map();
for (const k of keys) {
  const [head, app] = k.split(' | '), g = groups.get(k), key = `${head} | ${app} | (all scenes)`;
  const p = per.get(key) ?? {rows: new Set(), obs: 0, counted: 0, total: 0, max: 0, any: 0};
  g.rows.forEach(r => p.rows.add(r)); p.obs += g.obs; p.counted += g.counted; p.total += g.total; p.max = Math.max(p.max, g.max); p.any += g.any;
  per.set(key, p);
}
console.log('\n| head | app | scene | rows | observations | nullLabelSlots total | max in one observation | observations with any |');
console.log('|---|---|---|---|---|---|---|---|');
for (const [k, g] of per) console.log(line(k, g));
