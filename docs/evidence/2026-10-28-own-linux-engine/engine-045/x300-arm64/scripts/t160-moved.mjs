#!/usr/bin/env node
// Task 160: the rows item 1 moved (overran with the gate shut, so after_path where 0.4.4 took in_floor), their overrun
// and their latency against task 147's 0.4.4 shut rows that overran (path end more than 1 ms past floor_until and the
// gate shut by 993's rule: no keepalive and the path after the take at most 350 ms); and every row where the engine's
// overran or last_step_after_take_ms and the row's own path end disagree. Read-only.
//   node t160-moved.mjs <0.4.5 set dir> <0.4.4 set dir>
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const read = (f) => { const raw = readFileSync(f); return (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); };
const rowsOf = (dir) => {
  const lane = readdirSync(dir, { withFileTypes: true }).find((d) => d.isDirectory()).name;
  return readdirSync(join(dir, lane)).flatMap((round) => {
    const f = ['results.jsonl', 'results.jsonl.gz'].map((n) => join(dir, lane, round, 'run', n)).find(existsSync);
    return f ? read(f).filter((x) => x.kind === 'drop-signal').map((r) => ({ round, r })) : [];
  });
};
const q = (xs, p) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : NaN; };
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const pq = (xs) => `${f1(q(xs, 0.5))} / ${f1(q(xs, 0.95))}`;
const [d45, d44] = process.argv.slice(2);
const A = rowsOf(d45).map(({ round, r }) => ({ round, r, s: r.release_sync, pat: r.hold.path_ms - r.hold.take_after_press_ms, rel: r.wall.release_ms - r.wall.press_ms }));
const open = A.filter((x) => x.s.open === true);
const moved = A.filter((x) => x.s.overran === true && x.s.open !== true);
console.log(`0.4.5: gate open ${open.length} (every one overran: ${open.every((x) => x.s.overran)}); overran with the gate shut (item 1's rows, after_path) ${moved.length}; in_floor ${A.filter((x) => x.s.schedule === 'in_floor').length}.`);
const over = moved.map((x) => x.s.last_step_after_take_ms - x.r.hold.floor_until_ms);
console.log(`Item 1's rows: last step past floor_until (ms) min ${f1(Math.min(...over))}, p50 ${f1(q(over, 0.5))}, p95 ${f1(q(over, 0.95))}, max ${f1(Math.max(...over))}; motions ${[...new Set(moved.map((x) => x.s.motions))].join(', ')}; added_ms p50 / p95 ${pq(moved.map((x) => x.s.added_ms))}; answer p50 / p95 ${pq(moved.map((x) => x.r.ms))}; release after the take p50 / p95 ${pq(moved.map((x) => x.rel - x.r.hold.take_after_press_ms))}.`);
const B = rowsOf(d44).map(({ round, r }) => ({ round, r, pat: r.hold.path_ms - r.hold.take_after_press_ms, rel: r.wall.release_ms - r.wall.press_ms }));
const b = B.filter((x) => x.pat - x.r.hold.floor_until_ms > 1 && (x.r.hold.keepalives ?? 0) === 0 && x.pat <= 350);
console.log(`0.4.4 (task 147) shut rows whose path ended more than 1 ms past floor_until: ${b.length}; answer p50 / p95 ${pq(b.map((x) => x.r.ms))}; release after the take p50 / p95 ${pq(b.map((x) => x.rel - x.r.hold.take_after_press_ms))}.`);
console.log('\nRows where the engine and the row disagree (overran against the path end more than 1 ms past floor_until, or last_step_after_take_ms more than 2 ms from the path end):');
for (const x of A) {
  const d = x.pat - x.r.hold.floor_until_ms;
  if (x.s.overran !== d > 1 || Math.abs(x.s.last_step_after_take_ms - x.pat) > 2)
    console.log(`- ${x.round} #${x.r.i}: overran ${x.s.overran}, open ${x.s.open}, schedule ${x.s.schedule}, last_step_after_take_ms ${f1(x.s.last_step_after_take_ms)}, path end after the take ${f1(x.pat)} (floor_until ${x.r.hold.floor_until_ms}), ok ${x.r.ok}, notice ${(x.r.reply_notice ?? x.r.notice) ? 'yes' : 'none'}`);
}
