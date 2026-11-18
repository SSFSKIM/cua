// Task 98: the sitting's drags in order, each marked by whether Electron's drag loop ran behind the pointer (its first
// status over 15 ms after the take: `L`), or not (`.`), or took nothing (`-`), with the cell's initial under it.
// usage: node lagseq.mjs <results.jsonl[.gz]>
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const file = process.argv[2];
const raw = readFileSync(file);
const rows = (file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }).filter((r) => r.kind === 'drop-signal');
const first = (r) => {
  const lines = r.watch ?? [];
  const take = lines.find((l) => l.kind === 'take' && l.owner !== 0);
  if (!take) return null;
  const c = lines.filter((l) => l.kind === 'cursor' && !l.named && l.server_time - take.server_time > 1)[0];
  return c ? c.server_time - take.server_time : null;
};
let marks = '';
let cells = '';
let lanes = '';
for (const r of rows) {
  const f = first(r);
  marks += f == null ? '-' : f > 15 ? 'L' : '.';
  cells += r.cell[0];
  lanes += r.lane === 'cua' ? 'd' : r.lane.includes('unsettled') ? 'u' : r.lane.includes('handle') ? 'h' : 'k';
}
for (let k = 0; k < marks.length; k += 100) console.log(`${String(k).padStart(4)} ${marks.slice(k, k + 100)}\n     ${cells.slice(k, k + 100)}\n     ${lanes.slice(k, k + 100)}`);
