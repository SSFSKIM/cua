#!/usr/bin/env node
// Task 68's tables over every sitting: the experiment's own tables (drop-signals-judge.mjs) on all rows at once (each
// table groups by load), and the extra counts the report needs. usage: combine.mjs <harness dir> <run dir>...
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [harness, ...runs] = process.argv.slice(2);
const judge = await import(join(harness, 'scripts/linux-engine-diff/drop-signals-judge.mjs'));
const rows = [];
const meta = [];
for (const dir of runs) {
  let window = null;
  for (const line of readFileSync(join(dir, 'run/results.jsonl'), 'utf8').trim().split('\n')) {
    const r = JSON.parse(line);
    if (r.kind === 'drop-signal-scene') window = r.window;
    // each drag's signals judged again from its own watch lines by the harness given (the judge of the commit that
    // reports them), where the engine stamped the drag's press and release
    if (r.kind === 'drop-signal' && r.wall && r.watch) r.signals = judge.signalsOf(r.watch, { target: window, pressMs: r.wall.press_ms, releaseMs: r.wall.release_ms, engineTook: typeof r.hold?.taken === 'boolean' ? r.hold.taken : null });
    if (r.kind === 'drop-signal') rows.push({ ...r, sitting: dir.split('/').at(-1) });
    else if (['meta', 'load', 'drop-signal-scene'].includes(r.kind)) meta.push({ sitting: dir.split('/').at(-1), ...r });
  }
}
const pct = judge.percentiles;
const fmt = (p) => (p ? `${p.p50} / ${p.p95} / ${p.max}` : '–');
const out = [];
const group = (xs, key) => {
  const m = new Map();
  for (const x of xs) {
    const k = key(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
};
const fam = (r) => (r.family === 'chrome' ? '' : ` (${r.family})`);
out.push(`${rows.length} drags over ${runs.length} runs.`, '');
for (const t of [judge.neverTakeTable(rows), judge.afterReleaseTable(rows), judge.acceptTable(rows), judge.lateTakeTable(rows), judge.coverTable(rows)]) out.push(...t.md, '');

// the start point's role per cell, and how often each cell took and took after its path's end
out.push('Start-point roles per cell (all loads): the role probe\'s deepest accessible, whether the point was in a selection, and the takes.', '', '| cell | drags | deepest role | in a selection | took | took after the path | probe ms p50 / p95 / max |', '|---|---:|---|---:|---:|---:|---|');
for (const [cell, rs] of group(rows.filter((r) => !r.cover && r.family === 'chrome'), (r) => r.cell)) {
  const roles = [...group(rs, (r) => r.probe?.deepest?.role ?? 'none')].map(([k, v]) => `${k} ${v.length}`).join(', ');
  const took = rs.filter((r) => r.signals?.take_after_press_ms != null || r.hold?.taken === true);
  const after = took.filter((r) => (r.hold?.take_after_press_ms ?? r.signals?.take_after_press_ms) > (r.hold?.path_ms ?? Infinity));
  out.push(`| ${cell} | ${rs.length} | ${roles} | ${rs.filter((r) => r.probe?.in_selection === true).length} | ${took.length} | ${after.length} | ${fmt(pct(rs.map((r) => r.probe?.ms)))} |`);
}
out.push('');

// the takes' latency on the short drop, per load and lane: how many came after the path, and in the gate's 53-93 ms band
out.push('Take latency on the short drop (ms after the press, from the engine\'s hold record), per load and lane.', '', '| load | lane | drags | took | p50 / p95 / max | after the path | 53 ms or later |', '|---|---|---:|---:|---|---:|---:|');
for (const [k, rs] of group(rows.filter((r) => r.cell === 'plain'), (r) => `${r.load}${fam(r)}\u0000${r.lane}`)) {
  const [load, lane] = k.split('\u0000');
  const t = rs.map((r) => r.hold?.take_after_press_ms).filter((v) => typeof v === 'number');
  out.push(`| ${load} | ${lane} | ${rs.length} | ${t.length} | ${fmt(pct(t.map((v) => Math.round(v * 10) / 10)))} | ${rs.filter((r) => r.hold?.held && r.hold?.taken).length} | ${t.filter((v) => v >= 53).length} |`);
}
out.push('');

// answer times and landings of the short drop, per load and lane
out.push('The short drop per load and lane: answers, landings, and the answer time.', '', '| load | lane | drags | answered ok | landed | answer ms p50 / p95 / max |', '|---|---|---:|---:|---:|---|');
for (const [k, rs] of group(rows.filter((r) => r.cell === 'plain'), (r) => `${r.load}${fam(r)}\u0000${r.lane}`)) {
  const [load, lane] = k.split('\u0000');
  out.push(`| ${load} | ${lane} | ${rs.length} | ${rs.filter((r) => r.ok).length} | ${rs.filter((r) => r.outcome?.landed).length} | ${fmt(pct(rs.map((r) => r.ms)))} |`);
}
out.push('');

// the freeze sweep: where the thaw falls against the release
out.push('The freeze cells: the run\'s browser stopped from 60 ms after the request to the cell\'s number, the press-150 source (dragstart about 150 ms after the press).', '', '| load | cell | drags | took by the release (held) | late takes (after the release) | refused (dragstart, no take) | landed | late take after the release p50 / max (ms) |', '|---|---|---:|---:|---:|---:|---:|---|');
for (const [k, rs] of group(rows.filter((r) => /^freeze-/.test(r.cell)), (r) => `${r.load}\u0000${r.cell}`)) {
  const [load, cell] = k.split('\u0000');
  const late = rs.filter((r) => r.signals?.late_take);
  const held = rs.filter((r) => r.hold?.taken);
  const refused = rs.filter((r) => r.outcome?.started && !r.hold?.taken && !r.signals?.late_take);
  const lp = pct(late.map((r) => r.signals.take_after_release_ms));
  out.push(`| ${load} | ${cell} | ${rs.length} | ${held.length} | ${late.length} | ${refused.length} | ${rs.filter((r) => r.outcome?.landed).length} | ${lp ? `${lp.p50} / ${lp.max}` : '–'} |`);
}
out.push('');

// escapes, errors, drags with no wall clock (their signals timed by the harness)
out.push('Harness notes: drags whose drag and drop the harness ended with an Escape, answers that were errors, and drags with no wall clock from the engine.', '', '| load | lane | cell | escaped | errors | no wall clock |', '|---|---|---|---:|---:|---:|');
for (const [k, rs] of group(rows, (r) => `${r.load}${fam(r)}\u0000${r.lane}\u0000${r.cell}`)) {
  const esc = rs.filter((r) => r.escaped).length;
  const err = rs.filter((r) => !r.ok).length;
  const nw = rs.filter((r) => !r.wall).length;
  if (esc || err || nw) out.push(`| ${k.split('\u0000').join(' | ')} | ${esc} | ${err} | ${nw} |`);
}
out.push('');
out.push('Sittings:', '');
for (const m of meta.filter((x) => x.kind === 'meta' || x.kind === 'load')) out.push(`- ${m.sitting}: ${JSON.stringify(m).slice(0, 300)}`);
process.stdout.write(`${out.join('\n')}\n`);
