// Task 118 (the controller's requests on wave 4's and wave 5's canary rules, harness commits d16614ed and 951408a2):
// every stored gate-form canary run (<dir>/canary/<run>/K*.development-run) judged offline by the hold canary of each
// named checkout's device.mjs, over the cua lane's samples of each canary cell, from the engine's own per-press hold
// records (`engine_stats.hold`, its ping round trips, and the sample's page counts). Only the canary is judged here,
// not the cells' other rules. One row per run and cell, then the pass rate per step under each rule. Counts only.
//   node canary_rejudge.mjs <runs dir> <label>=<device.mjs> ...
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [T, ...named] = process.argv.slice(2);
const rules = {};
for (const arg of named) {
  const [label, path] = arg.split('=');
  rules[label] = (await import(pathToFileURL(path).href)).holdCanary;
}
const labels = Object.keys(rules);
const OPS = ['chrome_dnd_short_in_front_shared', 'chrome_select_nudged_shared'];
const runs = [];
for (const part of readdirSync(join(T, 'canary')).sort()) {
  const step = readdirSync(join(T, 'canary', part)).find((d) => /^K\d\.development-run$/.test(d));
  const file = step && join(T, 'canary', part, step, 'run', 'results.jsonl');
  if (!file || !existsSync(file)) continue;
  const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const stored = Object.fromEntries(rows.filter((r) => r.kind === 'verdict' && r.candidate === 'cua').map((r) => [r.op, r]));
  if (!OPS.every((op) => stored[op])) continue;
  const run = { part, step: step.slice(0, 2), cells: {} };
  for (const op of OPS) {
    const samples = rows.filter((r) => r.kind === 'sample' && r.op === op && r.engine === 'cua');
    const held = samples.filter((r) => r.engine_stats?.hold?.held === true);
    // every held press's largest ping wait (a round trip, or an unanswered ping's age), the canary's own reading
    const waits = held.map((r) => Math.max(...(r.engine_stats.hold.pings?.round_trips ?? []).map((t) => t.rtt_ms ?? t.unanswered_ms ?? 0), 0));
    run.cells[op] = { stored: stored[op].verdict, samples: samples.length, waits: waits.map((w) => Math.round(w * 10) / 10) };
    for (const [name, rule] of Object.entries(rules)) {
      const c = rule(op, samples);
      run.cells[op][name] = c ? { pass: c.reasons.length === 0, reasons: c.reasons, ...c.record } : null;
    }
  }
  runs.push(run);
}

const cell = (c, name) => {
  const x = c[name];
  if (!x) return '–';
  const started = x.slow_started !== undefined ? `, slow and started ${x.slow_started}` : '';
  return `${x.pass ? 'pass' : '**FAIL**'}${x.kind === 'draggable' ? ` (busy ${x.busy}, slow ${x.slow}${started} / held ${x.held})` : ` (slow ${x.slow} / held ${x.held})`}`;
};
const short = { [OPS[0]]: 'in front', [OPS[1]]: 'select' };
console.log(`| run | step | in front: held presses' largest ping wait (ms) | ${OPS.flatMap((op) => labels.map((l) => `${short[op]}, ${l}'s rule`)).join(' | ')} |`);
console.log(`|---|---|---|${OPS.flatMap(() => labels.map(() => '---')).join('|')}|`);
for (const r of runs) {
  console.log(`| ${r.part} | ${r.step} | ${r.cells[OPS[0]].waits.join(', ')} | ${OPS.flatMap((op) => labels.map((l) => cell(r.cells[op], l))).join(' | ')} |`);
}
console.log(`\n| step | runs | ${labels.map((l) => `canary passes (both cells), ${l}'s rule`).join(' | ')} | in-front runs with no press at 20 ms or more | fewest presses at 20 ms or more in a run |`);
console.log(`|---|---:|${labels.map(() => '---:').join('|')}|---:|---|`);
for (const step of [...new Set(runs.map((r) => r.step))].sort()) {
  const g = runs.filter((r) => r.step === step);
  const both = (name) => g.filter((r) => OPS.every((op) => r.cells[op][name]?.pass !== false)).length;
  const slows = g.map((r) => r.cells[OPS[0]][labels[0]]?.slow ?? 0);
  console.log(`| ${step} | ${g.length} | ${labels.map(both).join(' | ')} | ${slows.filter((n) => n === 0).length} | ${Math.min(...slows)} |`);
}
const failed = runs.flatMap((r) => OPS.flatMap((op) => Object.keys(rules).filter((n) => r.cells[op][n]?.pass === false).map((n) => `- ${r.part} ${op} under ${n}'s rule: ${r.cells[op][n].reasons.join('; ')}`)));
console.log(failed.length ? `\nEvery canary failure:\n${failed.join('\n')}` : '\nNo canary failure under any rule.');
