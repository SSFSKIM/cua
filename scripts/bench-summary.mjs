#!/usr/bin/env node
// Outcome parity compares each task's scored ok count over three runs: cua must have
// at least as many successes as vendor. Answers may be paraphrased and discounted
// rewards vary with time, so outcome details are displayed, never compared.
import {readFileSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const json = path => JSON.parse(readFileSync(path,'utf8'));
const stats = rows => { const times = rows.map(r => r.ms).sort((a,b) => a-b); return {median:times[1],min:times[0],max:times[2],outcomes:rows.map(r => r.ok), details:rows.map(r => r.outcome)}; };
function readService(dir, service) {
  if (!existsSync(join(dir,service))) return null;
  const runs = [];
  for (let n=1;n<=3;n++) {
    const root = join(dir,service,`run-${n}`);
    if (!existsSync(root)) throw new Error(`${service}: three runs required (missing run-${n})`);
    const meta = json(join(root,'meta.json'));
    for (const k of ['service','commit','profile','model','runtime','started','finished']) if (!meta[k]) throw new Error(`${root}: missing meta.${k}`);
    if (meta.service !== service) throw new Error(`${root}: service attestation mismatch`);
    const calls = readFileSync(join(root,'calls.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    const outcomes = json(join(root,'outcomes.json')), tasks = new Map();
    for (const task of new Set([...calls.map(r => r.task),...Object.keys(outcomes)])) {
      const rows = calls.filter(r => r.task === task), first = rows.find(r => r.t), done = rows.filter(r => r.done);
      const outcome = outcomes[task];
      if (!first || done.length !== 1 || typeof outcome?.ok !== 'boolean' || typeof done[0].ok !== 'boolean' || outcome.ok !== done[0].ok) throw new Error(`${root}: task ${task} missing/inconsistent calls, done mark or outcome`);
      const ms = Date.parse(done[0].done)-Date.parse(first.t);
      if (!Number.isFinite(ms) || ms < 0) throw new Error(`${root}: task ${task} invalid duration`);
      tasks.set(task,{ms,ok:outcome.ok,outcome});
    }
    if (!tasks.size) throw new Error(`${root}: no tasks`);
    runs.push({meta,tasks});
  }
  return runs;
}
export function summarize(dir) {
  const vendor = readService(dir,'vendor'), cua = readService(dir,'cua');
  if (!vendor) throw new Error('vendor: three runs required');
  const all = [...vendor,...(cua ?? [])], ids = [...vendor[0].tasks.keys()];
  for (const r of all) {
    if (r.tasks.size !== ids.length || ids.some(id => !r.tasks.has(id))) throw new Error('run task sets differ');
    for (const key of ['profile','model','runtime']) if (r.meta[key] !== vendor[0].meta[key]) throw new Error(`incomparable ${key} across runs`);
  }
  const tasks = ids.map(task => {
    const v = stats(vendor.map(r => r.tasks.get(task)));
    const c = cua && stats(cua.map(r => r.tasks.get(task)));
    return {task,vendor:v,cua:c,ok:c ? c.median <= v.median + Math.max(v.median*0.1,500) && c.outcomes.filter(Boolean).length >= v.outcomes.filter(Boolean).length : null};
  });
  return {tasks,verdict:!cua ? 'cua runs: none' : tasks.every(r => r.ok) ? 'no regression' : 'regression'};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv[2]) throw new Error('Usage: node scripts/bench-summary.mjs <evidence-dir>');
    const report = summarize(process.argv[2]);
    console.log("outcome criterion: per-task cua success count over three runs must be at least vendor's; answers and rewards are displayed, not compared");
    for (const row of report.tasks) console.log(`${row.task}: ${JSON.stringify(row)}`);
    console.log(`verdict: ${report.verdict}`);
    process.exitCode = report.verdict === 'regression' ? 1 : 0;
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
