#!/usr/bin/env node
// Judge the median of each task's summed tool-call durations, not controller wall
// time. T0/T9 timing is diagnostic only. Outcome parity compares scored ok counts:
// cua must have at least as many successes over three runs as vendor. Answers and
// rewards are displayed, never compared. Incomplete groups get no verdict.
import {readFileSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const json = path => JSON.parse(readFileSync(path,'utf8'));
const timingJudged = task => task !== 'T0' && task !== 'T9';
const validDuration = ms => Number.isFinite(ms) && ms >= 0;
function spread(times) {
  if (times.some(ms => ms === null)) return null;
  const sorted = [...times].sort((a,b) => a-b);
  return {median:sorted[1],min:sorted[0],max:sorted[2]};
}
const stats = rows => ({toolMs:spread(rows.map(r => r.toolMs)),wallMs:spread(rows.map(r => r.wallMs)),
  outcomes:rows.map(r => r.outcome.ok),details:rows.map(r => r.outcome)});
function readService(dir, service) {
  if (!existsSync(join(dir,service))) return null;
  const runs = [];
  for (let n=1;n<=3;n++) {
    const root = join(dir,service,`run-${n}`);
    if (!existsSync(root)) continue;
    const meta = json(join(root,'meta.json'));
    for (const k of ['service','commit','profile','model','runtime','started','finished']) if (!meta[k]) throw new Error(`${root}: missing meta.${k}`);
    if (meta.service !== service) throw new Error(`${root}: service attestation mismatch`);
    const calls = readFileSync(join(root,'calls.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    const outcomes = json(join(root,'outcomes.json')), tasks = new Map();
    for (const task of new Set([...calls.map(r => r.task),...Object.keys(outcomes)])) {
      const rows = calls.filter(r => r.task === task), callRows = rows.filter(r => r.t && r.scored !== true), done = rows.filter(r => r.done), scores = rows.filter(r => r.scored === true);
      const outcome = outcomes[task];
      if (!callRows.length || done.length !== 1 || typeof outcome?.ok !== 'boolean' || (done[0].ok !== null && typeof done[0].ok !== 'boolean') || (done[0].ok !== null && outcome.ok !== done[0].ok)) throw new Error(`${root}: task ${task} missing/inconsistent calls, done mark or outcome`);
      if (scores.some(r => typeof r.ok !== 'boolean' || !Number.isFinite(Date.parse(r.t))) ||
          (done[0].ok === null && !scores.length) || (scores.length && scores.at(-1).ok !== outcome.ok)) {
        throw new Error(`${root}: task ${task} missing/inconsistent score audit and outcome`);
      }
      const wallMs = Date.parse(done[0].done)-Date.parse(callRows[0].t);
      if (!validDuration(wallMs)) throw new Error(`${root}: task ${task} invalid wall duration`);
      const measured = callRows.every(r => validDuration(r.ms));
      if (timingJudged(task) && !measured) throw new Error(`${root}: task ${task} invalid or unmeasured tool-call duration (ms)`);
      const toolMs = measured ? callRows.reduce((sum,r) => sum+r.ms,0) : null;
      tasks.set(task,{task,timingJudged:timingJudged(task),toolMs,wallMs,outcome});
    }
    if (!tasks.size) throw new Error(`${root}: no tasks`);
    runs.push({service,run:n,meta,tasks});
  }
  return runs;
}
export function summarize(dir) {
  const vendor = readService(dir,'vendor'), cua = readService(dir,'cua');
  if (!vendor) throw new Error('vendor: three runs required');
  const all = [...vendor,...(cua ?? [])], ids = [...(all[0]?.tasks.keys() ?? [])];
  for (const r of all) {
    if (r.tasks.size !== ids.length || ids.some(id => !r.tasks.has(id))) throw new Error('run task sets differ');
    for (const key of ['profile','model','runtime']) if (r.meta[key] !== all[0].meta[key]) throw new Error(`incomparable ${key} across runs`);
  }
  const incomplete = [['vendor',vendor],['cua',cua]].filter(([,runs]) => runs && runs.length !== 3)
    .map(([service,runs]) => ({service,runs:runs.length}));
  if (incomplete.length) return {tasks:[],verdict:null,incomplete,
    runs:all.map(r => ({service:r.service,run:r.run,tasks:[...r.tasks.values()]}))};
  const tasks = ids.map(task => {
    const v = stats(vendor.map(r => r.tasks.get(task)));
    const c = cua && stats(cua.map(r => r.tasks.get(task)));
    const timingOK = !timingJudged(task) || (c && c.toolMs.median <= v.toolMs.median + Math.max(v.toolMs.median*0.1,500));
    return {task,timingJudged:timingJudged(task),vendor:v,cua:c,
      ok:c ? timingOK && c.outcomes.filter(Boolean).length >= v.outcomes.filter(Boolean).length : null};
  });
  return {tasks,verdict:!cua ? 'cua runs: none' : tasks.every(r => r.ok) ? 'no regression' : 'regression'};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv[2]) throw new Error('Usage: node scripts/bench-summary.mjs <evidence-dir>');
    const report = summarize(process.argv[2]);
    console.log('timing criterion: median of per-task sum of call ms, within max(10%, 500 ms) of vendor or lower; wall time is reported, not judged; T0/T9 timing excluded');
    console.log("outcome criterion: per-task cua success count over three runs must be at least vendor's; answers and rewards are displayed, not compared");
    if (report.incomplete) {
      for (const run of report.runs) for (const row of run.tasks) console.log(`${run.service}/run-${run.run} ${row.task}: ${JSON.stringify(row)}`);
      for (const {service,runs} of report.incomplete) console.log(`incomplete: ${service} has ${runs} of 3 runs`);
      process.exitCode = 1;
    } else {
      for (const row of report.tasks) console.log(`${row.task}: ${JSON.stringify(row)}`);
      console.log(`verdict: ${report.verdict}`);
      process.exitCode = report.verdict === 'regression' ? 1 : 0;
    }
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
