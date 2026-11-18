// Task 98: what makes a handle's drag loop run behind the pointer: each handle drag's first status after the take (the
// loop's first answer to a motion), grouped by the drag before it in the sitting (its cell, and whether the engine was
// fresh). usage: node prevcell.mjs <results.jsonl[.gz]>
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const file = process.argv[2];
const raw = readFileSync(file);
const rows = (file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }).filter((r) => r.kind === 'drop-signal');
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const first = (r) => {
  const lines = r.watch ?? [];
  const take = lines.find((l) => l.kind === 'take' && l.owner !== 0);
  if (!take) return null;
  const c = lines.filter((l) => l.kind === 'cursor' && !l.named && l.server_time - take.server_time > 1)[0];
  return c ? c.server_time - take.server_time : null;
};
const groups = new Map();
rows.forEach((r, k) => {
  if (!r.lane.startsWith('cua:handle') || k === 0) return;
  const prev = rows[k - 1];
  const key = `${r.cell.padEnd(10)} ${r.cold ? 'fresh engine' : 'same engine '} after ${prev.cell === r.cell ? 'the same cell ' : 'another cell  '}`;
  const f = first(r);
  if (f == null) return;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(f);
});
for (const [key, xs] of [...groups].sort()) console.log(`${key} n=${String(xs.length).padStart(3)} first status after the take, ms: min ${q(xs, 0)} med ${q(xs, 0.5)} p90 ${q(xs, 0.9)} max ${Math.max(...xs)}; over 15 ms: ${xs.filter((x) => x > 15).length}`);
