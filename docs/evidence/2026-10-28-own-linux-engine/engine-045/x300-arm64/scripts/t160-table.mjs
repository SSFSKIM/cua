#!/usr/bin/env node
// Task 160: 0.4.5's t14-floor `left` x300 read, read-only. First the fields check: every drop-signals row must carry a
// top-level `release_sync` (drop-signals.mjs `releaseSyncOf`, item 4) holding 0.4.5's `overran`,
// `last_step_after_take_ms` and `unconfirmed`; a row without them is a fault, not a pass. Then each row classed exactly
// as task 147 classed its x100 (drop-signals-judge.mjs `chromeDropVerdict` on the row alone, plan t14-floor; untaken when
// the source never took), with: the honest rows by notice; the overran rows and their last step against floor_until;
// schedule x visits_dropped; `unconfirmed` by cause; and the answer time (the drag's reply, `ms`) and the release after
// the press, p50 / p95, overall and by overran, against task 147's 0.4.4 rows (overran there derived as the path's last
// step after the take past floor_until). Every false ok printed whole.
//   node t160-table.mjs <harness repo> <0.4.5 set dir> <0.4.4 set dir>
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const [repo, dir45, dir44] = process.argv.slice(2);
const { chromeDropVerdict } = await import(pathToFileURL(join(repo, 'scripts/linux-engine-diff/drop-signals-judge.mjs')).href);
const read = (f) => { const raw = readFileSync(f); return (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); };
const rowsOf = (dir) => {
  const out = [];
  for (const lane of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort())
    for (const round of readdirSync(join(dir, lane)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))) {
      const file = ['results.jsonl', 'results.jsonl.gz'].map((n) => join(dir, lane, round, 'run', n)).find(existsSync);
      if (file) for (const r of read(file).filter((x) => x.kind === 'drop-signal' && (x.base ?? x.cell) === 'left')) out.push({ round, r });
    }
  return out;
};
const q = (xs, p) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] : NaN; };
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const outcomeOf = (r) => {
  const t = chromeDropVerdict([r], { plan: 't14-floor' }).counts;
  return r.hold?.taken !== true ? 'untaken' : t.stale_drops ? 'stale' : t.false_ok ? 'false ok' : t.ambiguous ? 'ambiguous' : t.landed ? 'landed' : r.ok === true ? 'honest' : 'refused';
};
const noticeOf = (r) => { const n = r.reply_notice ?? r.notice ?? null; return n == null ? null : /went on past the engine's settle time/.test(n) ? 'outlasted (c)' : /unconfirmed drop/.test(n) ? 'unconfirmed drop' : 'other'; };
const p50p95 = (xs) => `${f1(q(xs, 0.5))} / ${f1(q(xs, 0.95))}`;

const A = rowsOf(dir45);
const NEW = ['overran', 'last_step_after_take_ms', 'unconfirmed'];
const missing = A.filter(({ r }) => !r.release_sync || NEW.some((k) => !(k in r.release_sync)));
console.log(`# 0.4.5 t14-floor left: ${dir45}\n`);
console.log(`**Fields check:** ${A.length} rows; ${A.length - missing.length} carry a top-level release_sync with ${NEW.join(', ')}; ${missing.length} do not${missing.length ? `: ${missing.map(({ round, r }) => `${round} #${r.i}`).join(', ')}` : ''}.\n`);
const rows = A.map(({ round, r }) => {
  const s = r.release_sync ?? {};
  const take = r.hold?.take_after_press_ms;
  return { round, i: r.i, cold: r.cold, outcome: outcomeOf(r), notice: noticeOf(r), take, floor_until: r.hold?.floor_until_ms, last: s.last_step_after_take_ms, path_after_take: r.hold?.path_ms - take,
    overran: s.overran, schedule: s.schedule, visits_dropped: s.visits_dropped, unconfirmed: s.unconfirmed ?? null, motions: s.motions, ms: r.ms, release: r.wall ? r.wall.release_ms - r.wall.press_ms : NaN, r };
});
const n = (p) => rows.filter(p).length;
const outcomes = ['landed', 'stale', 'false ok', 'honest', 'untaken', 'ambiguous', 'refused'];
console.log(`**Outcomes (out of ${rows.length}):** ${outcomes.map((o) => `${o} ${n((x) => x.outcome === o)}`).join(', ')}.`);
const hon = rows.filter((x) => x.outcome === 'honest');
const notices = {};
for (const x of hon) notices[x.notice ?? 'none'] = (notices[x.notice ?? 'none'] ?? 0) + 1;
console.log(`**Honest, by notice:** ${Object.entries(notices).map(([k, v]) => `${k} ${v}`).join(', ')}.\n`);
const unc = {};
for (const x of rows) unc[x.unconfirmed ?? 'null'] = (unc[x.unconfirmed ?? 'null'] ?? 0) + 1;
console.log(`**release_sync.unconfirmed, by cause:** ${Object.entries(unc).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
const uncOut = {};
for (const x of rows) { const k = `${x.unconfirmed ?? 'null'} → ${x.outcome}${x.notice ? ` (${x.notice})` : ''}`; uncOut[k] = (uncOut[k] ?? 0) + 1; }
console.log(`**unconfirmed against the outcome:** ${Object.entries(uncOut).map(([k, v]) => `${k}: ${v}`).join('; ')}.\n`);
const ov = rows.filter((x) => x.overran === true);
const over = ov.map((x) => x.last - x.floor_until);
console.log(`**Overran:** ${ov.length} of ${rows.length}. Their last step after the take less floor_until (ms): min ${f1(Math.min(...over))}, p50 ${f1(q(over, 0.5))}, p95 ${f1(q(over, 0.95))}, max ${f1(Math.max(...over))}; last_step_after_take_ms p50 / p95 / max ${f1(q(ov.map((x) => x.last), 0.5))} / ${f1(q(ov.map((x) => x.last), 0.95))} / ${f1(Math.max(...ov.map((x) => x.last)))} against floor_until ${[...new Set(ov.map((x) => x.floor_until))].join(', ')}.`);
const bands = [[0, 1], [1, 5], [5, 10], [10, 25], [25, 50], [50, Infinity]];
console.log(`Overrun bands (ms past floor_until): ${bands.map(([a, b]) => `${a}–${b === Infinity ? '' : b}: ${over.filter((d) => d > a && d <= b || (a === 0 && d === 0)).length}`).join(', ')}.`);
const notOv = rows.filter((x) => x.overran === false && x.schedule === 'in_floor');
console.log(`Consistency: in-floor rows not overran: ${notOv.length}, of them with last step past floor_until ${notOv.filter((x) => x.last > x.floor_until).length}; overran rows on in_floor ${ov.filter((x) => x.schedule === 'in_floor').length}; rows where last_step_after_take_ms and the row's own path end differ by over 2 ms ${rows.filter((x) => Math.abs(x.last - x.path_after_take) > 2).length}.\n`);
const derived = (x) => x.path_after_take - x.floor_until > 1;
console.log(`The engine's overran against the row's own path end more than 1 ms past floor_until: agree on ${n((x) => x.overran === derived(x))}; overran with the path end within 1 ms ${n((x) => x.overran === true && !derived(x))}; not overran with the path end more than 1 ms past ${n((x) => x.overran === false && derived(x))}.\n`);
console.log('| schedule \\ visits_dropped | 0 | 1 | 2 | all |');
console.log('|---|---:|---:|---:|---:|');
for (const sch of [...new Set(rows.map((x) => x.schedule))]) { const rs = rows.filter((x) => x.schedule === sch); console.log(`| ${sch} | ${[0, 1, 2].map((v) => rs.filter((x) => x.visits_dropped === v).length).join(' | ')} | ${rs.length} |`); }
console.log(`| of them overran (after_path) | ${[0, 1, 2].map((v) => ov.filter((x) => x.visits_dropped === v).length).join(' | ')} | ${ov.length} |`);
console.log('\n| outcome \\ schedule | after_path, not overran | after_path, overran | in_floor |');
console.log('|---|---:|---:|---:|');
for (const o of outcomes) { const rs = rows.filter((x) => x.outcome === o); if (!rs.length) continue; console.log(`| ${o} | ${rs.filter((x) => x.schedule === 'after_path' && !x.overran).length} | ${rs.filter((x) => x.schedule === 'after_path' && x.overran).length} | ${rs.filter((x) => x.schedule === 'in_floor').length} |`); }

const B = rowsOf(dir44).map(({ round, r }) => { const take = r.hold?.take_after_press_ms; const pat = r.hold?.path_ms - take; return { round, i: r.i, ms: r.ms, release: r.wall ? r.wall.release_ms - r.wall.press_ms : NaN, overran: Number.isFinite(r.hold?.floor_until_ms) && pat - r.hold.floor_until_ms > 1, sched: null }; });
console.log(`\n**Latency against task 147's 0.4.4 x100** (${dir44}; its overran derived from the row: the path's last step after the take more than 1 ms past floor_until, since an in-floor path's keepalive ends 0.0–0.5 ms past it). The answer is the drag's reply time (\`ms\`); the release is after the press. p50 / p95 ms:\n`);
console.log('| rows | 0.4.5 n | 0.4.5 answer | 0.4.5 release | 0.4.4 n | 0.4.4 answer | 0.4.4 release |');
console.log('|---|---:|---|---|---:|---|---|');
for (const [name, p] of [['all', () => true], ['overran', (x) => x.overran === true], ['not overran', (x) => x.overran === false]]) {
  const a = rows.filter(p), b = B.filter(p);
  console.log(`| ${name} | ${a.length} | ${p50p95(a.map((x) => x.ms))} | ${p50p95(a.map((x) => x.release))} | ${b.length} | ${p50p95(b.map((x) => x.ms))} | ${p50p95(b.map((x) => x.release))} |`);
}
const ins = rows.filter((x) => x.schedule === 'in_floor' && !x.overran);
console.log(`| 0.4.5 in_floor, not overran | ${ins.length} | ${p50p95(ins.map((x) => x.ms))} | ${p50p95(ins.map((x) => x.release))} | | | |`);

const fo = rows.filter((x) => x.outcome === 'false ok' || x.outcome === 'stale');
console.log(`\n**False oks and stale drops: ${fo.length}.**`);
for (const x of fo) { console.log(`\n${x.round} #${x.i}:\n\n\`\`\`json\n${JSON.stringify(x.r)}\n\`\`\``); }
