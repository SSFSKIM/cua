// Task 127 (read-only): which stored H6 drags were released after a take, and which outlasted the 350 ms floor with no
// keepalive (#459's shape), per architecture, step and cell, from the engine's own records in each row.
// Run from the checkout's root (the arm64 rows are task 122's `m5/arm64/h6/`):
//   node docs/evidence/2026-10-28-own-linux-engine/m5/engine-043/reach/scan-h6.mjs docs/evidence/2026-10-28-own-linux-engine/m5 > scan-h6.txt
//   node docs/evidence/2026-10-28-own-linux-engine/m5/engine-043/reach/scan-a953.mjs <a953 t14-long and t14-floor results.jsonl.gz> >> scan-h6.txt
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const root = process.argv[2];
const STEPS = ['V5', 'D1', 'D2', 'K1', 'K2', 'K3', 'C1', 'H1', 'H2', 'S1', 'L1', 'L2a', 'L2b', 'L3a', 'L3b', 'L4a', 'L4b', 'L4c'];
const FLOOR = 350;

function rows(file) {
  const buf = readFileSync(file);
  const text = file.endsWith('.gz') ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  return text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// a drag's engine records, wherever the row keeps them (drop-signals rows at top level; device rows under engine_stats)
function recs(r) {
  const s = r.engine_stats ?? r.stats ?? r;
  return { hold: r.hold ?? s.hold, after_take: r.after_take ?? s.after_take, after_release: r.after_release ?? s.after_release };
}

for (const arch of ['x64', 'arm64']) {
  for (const step of STEPS) {
    const dirs = ['out', 'zero'].map((d) => join(root, arch, 'h6', d, `${step}.pinned-release`, 'run'));
    const file = dirs.flatMap((dir) => ['results.jsonl', 'results.jsonl.gz'].map((f) => join(dir, f))).find(existsSync);
    if (!file) { console.log(`${arch} ${step}: no results`); continue; }
    const all = rows(file);
    const cells = new Map();
    let any = 0;
    for (const r of all) {
      const { hold, after_take, after_release } = recs(r);
      if (!hold && !after_take && !after_release) continue;
      any++;
      const key = `${r.lane ?? r.engine ?? '?'} ${r.cell ?? r.op ?? r.kind ?? '?'}`;
      const c = cells.get(key) ?? { n: 0, taken: 0, released_with_take: 0, shape: 0, keep0: 0, rel: [], steps: [], confirmed: {} };
      c.n++;
      if (hold?.taken) c.taken++;
      if (after_release?.released_with_take) c.released_with_take++;
      if (after_take) {
        c.rel.push(after_take.release_after_take_ms);
        c.steps.push(after_take.steps_after_take);
        if (hold?.keepalives === 0) c.keep0++;
        if (hold?.keepalives === 0 && after_take.release_after_take_ms >= FLOOR) c.shape++;
      }
      const by = after_release?.confirmed_by?.replace(/\(.*\)/, '');
      if (by) c.confirmed[by] = (c.confirmed[by] ?? 0) + 1;
      cells.set(key, c);
    }
    if (!any) { console.log(`${arch} ${step}: ${all.length} rows, none with engine drag records`); continue; }
    for (const [key, c] of cells) {
      if (!c.taken && !c.released_with_take && !c.rel.length) continue;
      const med = (xs) => { const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
      console.log(`${arch} ${step} | ${key} | records ${c.n} | taken ${c.taken} | released_with_take ${c.released_with_take} | floor-outlasted (0 keepalives, release >= ${FLOOR} ms after take) ${c.shape} | 0 keepalives ${c.keep0} | release_after_take median ${med(c.rel)?.toFixed?.(1)} | steps_after_take median ${med(c.steps)} | confirmed_by ${JSON.stringify(c.confirmed)}`);
    }
  }
}
