// Task 98 (the controller's point 3): what the settle costs a drag. Per run, lane and cell: the two syncs' waits
// added together (the time the settle adds to the request, its 30 ms rest being the rest the release had already),
// as a median and a p95, the share of drags in which a sync hit the 150 ms bound, and the whole request's time.
// With --split, each cell is also split by whether Electron's drag loop ran behind the pointer (first status over
// 15 ms after the take), which is where the settle waits.
// usage: node cost.mjs [--split] <label>=<results.jsonl[.gz]>...
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const split = args.includes('--split');
const q = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 10) / 10; };
const stat = (xs) => (xs.length ? `med ${q(xs, 0.5)} p95 ${q(xs, 0.95)} max ${Math.round(Math.max(...xs) * 10) / 10}` : '-');
const read = (file) => {
  const raw = readFileSync(file);
  return (file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
};
const cursorOf = (r) => r.drop_cursor ?? r.handle?.drop_cursor ?? null;
const lagged = (r) => {
  const lines = r.watch ?? [];
  const take = lines.find((l) => l.kind === 'take' && l.owner !== 0);
  if (!take) return null;
  const c = lines.filter((l) => l.kind === 'cursor' && !l.named && l.server_time - take.server_time > 1)[0];
  return c ? c.server_time - take.server_time > 15 : null;
};
for (const input of args.filter((a) => a.includes('='))) {
  const [label, file] = input.split('=');
  const rows = read(file).filter((r) => r.kind === 'drop-signal');
  console.log(`\n# ${label} (load ${rows[0]?.load}; ${rows.length} drags)`);
  console.log('| lane cell | drags | settled | sync waits added, ms | a sync hit the bound | request, ms |');
  console.log('|---|---:|---:|---|---:|---|');
  const groups = new Map();
  for (const r of rows) {
    const keys = [`${r.lane} ${r.cell}`];
    if (split && lagged(r) != null) keys.push(`${r.lane} ${r.cell} (${lagged(r) ? 'loop behind' : 'loop in step'})`);
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
  }
  for (const [key, list] of [...groups].sort()) {
    const asked = list.filter((r) => cursorOf(r)?.settle?.asked);
    const waits = asked.map((r) => (cursorOf(r).settle.before_rest?.ms ?? 150) + (cursorOf(r).settle.after_motion?.ms ?? 150));
    const hit = asked.filter((r) => cursorOf(r).settle.before_rest?.answered === false || cursorOf(r).settle.after_motion?.answered === false).length;
    console.log(`| ${key} | ${list.length} | ${asked.length ? `${asked.filter((r) => cursorOf(r).settle.settled).length}/${asked.length}` : '-'} | ${stat(waits)} | ${asked.length ? `${hit}/${asked.length}` : '-'} | ${stat(list.map((r) => r.ms))} |`);
  }
}
