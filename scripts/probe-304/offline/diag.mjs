// diag.mjs <run-dir>: the diagnostic groups' probeWideLists (B's per-read timings of each judged wide list), per page:
// the list, the reads by place (the first 32, the last 32, the middle samples, and the reads of the run's search),
// each place's read count, median and max µs and total ms, and the roles of the last children and of the slow reads.
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
const dir = process.argv[2];
const med = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : null; };
const agg = new Map();
for (const d of readdirSync(dir).sort()) {
  if (!d.includes('-diag-')) continue;
  for (const f of readdirSync(join(dir, d)).filter(f => f.startsWith('obs-') && f.endsWith('-b.json.gz'))) {
    const o = JSON.parse(gunzipSync(readFileSync(join(dir, d, f))));
    const page = f.replace(/^obs-(chrome|safari)-diag_/, '').replace(/_(top|f25|f50|f90)-.*$/, '');
    for (const l of o.probeWideLists ?? []) {
      const key = `${d.includes('safari') ? 'safari' : 'chrome'}/${page} ${l.role}(${l.count})`;
      if (!agg.has(key)) agg.set(key, {lists: 0, ms: [], places: {}, roles: {}});
      const a = agg.get(key);
      a.lists += 1; a.ms.push(l.ms);
      for (const [pos, us] of l.reads) {
        const place = pos < 32 ? 'first 32' : pos >= l.count - 32 ? 'last 32' : 'between';
        (a.places[place] ??= []).push(us);
      }
      for (const [pos, role] of Object.entries(l.roles ?? {})) { const k = `${Number(pos) >= l.count - 8 ? 'last8' : 'slow'}:${pos}:${role}`; a.roles[k] = (a.roles[k] ?? 0) + 1; }
    }
  }
}
for (const [k, a] of agg) {
  console.log(`== ${k}: ${a.lists} judgings, ms per judging median ${med(a.ms)?.toFixed(1)}`);
  for (const [place, us] of Object.entries(a.places)) console.log(`   ${place}: ${us.length} reads, median ${med(us)} µs, max ${Math.max(...us)} µs, total ${(us.reduce((x, y) => x + y, 0) / 1000 / a.lists).toFixed(1)} ms per judging, >500 µs ${us.filter(u => u > 500).length}`);
  const roles = Object.entries(a.roles).sort();
  console.log(`   roles: ${roles.slice(0, 20).map(([r, n]) => `${r}×${n}`).join(', ')}${roles.length > 20 ? ` … (${roles.length})` : ''}`);
}
