// task 128 (ruling 972): Electron take rates and the long path's motion after the take, by lane and cell.
//   node electron-takes.mjs <results.jsonl>...
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const q = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? `${Math.round(s[0])} / ${Math.round(s[Math.floor(s.length / 2)])} / ${Math.round(s.at(-1))}` : '–';
};
for (const f of process.argv.slice(2)) {
  const b = readFileSync(f);
  const rows = (f.endsWith('.gz') ? gunzipSync(b) : b).toString('utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.kind === 'drop-signal' && r.family === 'electron');
  const keys = [...new Set(rows.map((r) => `${r.lane} ${r.cell}`))];
  for (const k of keys) {
    const list = rows.filter((r) => `${r.lane} ${r.cell}` === k);
    const take = (r) => r.hold?.take_after_press_ms ?? r.signals?.take_after_press_ms ?? null;
    const took = list.filter((r) => typeof take(r) === 'number');
    const after = took.filter((r) => Number.isFinite(r.hold?.path_ms)).map((r) => r.hold.path_ms - take(r));
    console.log(`${f.split('/').slice(-5, -2).join('/')} | ${k} | ${list.length} | took ${took.length} | errors ${list.filter((r) => r.ok !== true).length} | take ms ${q(took.map(take))} | path ms ${q(list.map((r) => r.hold?.path_ms).filter(Number.isFinite))} | after the take ${q(after)}`);
  }
}
