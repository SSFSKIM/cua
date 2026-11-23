// A hosted sitting's one job (#117 M5, T10b′): the plan's steps (./plan.mjs) run in order on the runner, each step's
// output kept in its own log, and each step's status read from its kind and exit:
//   PASS     it ran and its exit is the one its kind asks (0; an expect step's `expect`)
//   FAIL     it ran and exited otherwise, its exit came with no `report` from its judge, or it could not run here (`missing`)
//   INFO     a verdict or a pilot reading that exited nonzero in the pilot: recorded, never a failure
//   SKIP     a step it needs did not pass (a cleanup: what it needs never ran)
//   PENDING  a step whose code is not built yet, never run
// The sitting's exit: 1 when any step failed, 3 when a full sitting holds a pending step (it is not the sitting yet),
// else 0. Nothing here judges a measurement: the harnesses' own judges are the verdict steps.
import {spawn} from 'node:child_process';
import {copyFileSync, createWriteStream, existsSync, mkdirSync} from 'node:fs';
import {basename, dirname, join} from 'node:path';

const PASSED = new Set(['PASS']);

// One step's command, its output teed to `logPath` and to this job's log. -> {exit, signal}.
export function execStep(step, {logPath, cwd = process.cwd(), env = process.env} = {}) {
  mkdirSync(dirname(logPath), {recursive: true});
  const file = createWriteStream(logPath);
  return new Promise(resolve => {
    const child = spawn(step.argv[0], step.argv.slice(1), {cwd, env: {...env, ...step.env}, stdio: ['ignore', 'pipe', 'pipe']});
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { file.write(chunk); process.stderr.write(chunk); });
    child.on('error', error => { file.end(`${error.message}\n`); resolve({exit: null, signal: null, error: error.message}); });
    child.on('close', (code, signal) => { file.end(); resolve({exit: code, signal}); });
  });
}

function statusOf(step, form, exit) {
  if (step.kind === 'expect') return exit === step.expect ? ['PASS', null] : ['FAIL', `exit ${exit}, expected ${step.expect}`];
  if (exit === 0) return ['PASS', null];
  if (form === 'pilot' && (step.kind === 'verdict' || step.kind === 'pilot')) return ['INFO', `exit ${exit}: recorded, the pilot judges nothing`];
  return ['FAIL', null];
}

// `plan`: ./plan.mjs sittingPlan's. deps: {out, exec(step, {logPath}) -> {exit, signal?, error?}, keep(from, to),
// exists(path) (a step's `report`: its exit counts only once its judge wrote it), now, log}. -> {sitting, form, title,
// proves, steps: [{id, label, kind, status, exit, ms, reason, log}], verdict, exit}.
export async function runSitting(plan, {out, exec = execStep, keep = (from, to) => { mkdirSync(dirname(to), {recursive: true}); copyFileSync(from, to); }, exists = existsSync, now = Date.now,
  log = line => process.stderr.write(`${line}\n`)}) {
  const done = new Map();
  for (const step of plan.steps) {
    const entry = {id: step.id, label: step.label, kind: step.kind, status: null, exit: null, ms: null, reason: null, log: null};
    done.set(step.id, entry);
    const needs = (step.needs ?? []).map(id => done.get(id));
    if (step.kind === 'pending') Object.assign(entry, {status: 'PENDING', reason: step.pending});
    else if (step.kind === 'pilot' && plan.form !== 'pilot') Object.assign(entry, {status: 'SKIP', reason: 'a pilot reading'});
    else if (step.kind === 'cleanup' && needs.some(n => n.exit === null)) Object.assign(entry, {status: 'SKIP', reason: `needs ${needs.filter(n => n.exit === null).map(n => n.id).join(', ')}, which never ran`});
    else if (step.kind !== 'cleanup' && needs.some(n => !PASSED.has(n.status))) Object.assign(entry, {status: 'SKIP', reason: `needs ${needs.filter(n => !PASSED.has(n.status)).map(n => n.id).join(', ')}, which did not pass`});
    else if (step.missing) Object.assign(entry, {status: 'FAIL', reason: step.missing});
    else {
      entry.log = join(out, 'logs', `${step.id}.log`);
      log(`hosted-sittings: ${plan.sitting} ${step.id}: ${step.label}`);
      const started = now();
      let result;
      try { result = await exec(step, {logPath: entry.log}); } catch (error) { result = {exit: null, error: error.message}; }
      entry.ms = now() - started;
      entry.exit = result.exit ?? null;
      if (entry.exit === null) Object.assign(entry, {status: 'FAIL', reason: result.error ?? `ended by ${result.signal ?? 'an unknown cause'}`});
      else [entry.status, entry.reason] = statusOf(step, plan.form, entry.exit);
      if (entry.status === 'PASS' && step.report && !exists(step.report)) Object.assign(entry, {status: 'FAIL', reason: `no report at ${step.report}: the exit is not its judge's`});
      for (const file of step.keep ?? []) {
        try { keep(file, join(out, step.id, basename(file))); } catch (error) { entry.reason = [entry.reason, `${file} not kept (${error.code ?? error.message})`].filter(Boolean).join('; '); }
      }
    }
    log(`hosted-sittings: ${plan.sitting} ${step.id}: ${entry.status}${entry.reason ? ` (${entry.reason})` : ''}`);
  }
  const steps = [...done.values()];
  const failed = steps.some(s => s.status === 'FAIL');
  const incomplete = plan.form === 'full' && steps.some(s => s.status === 'PENDING');
  const [verdict, exit] = failed ? ['FAIL', 1] : incomplete ? ['INCOMPLETE', 3] : ['PASS', 0];
  return {sitting: plan.sitting, form: plan.form, title: plan.title, proves: plan.proves, steps, verdict, exit};
}

const seconds = ms => (ms === null ? '-' : `${Math.round(ms / 1000)} s`);
// The report as the job summary's Markdown.
export function renderSitting(report) {
  const out = [`## Sitting ${report.sitting.toUpperCase()} (${report.form}): ${report.title}`, '', `Proves: ${report.proves}.`, '',
    '| step | kind | status | exit | time | note |', '|---|---|---|---|---|---|'];
  for (const s of report.steps) out.push(`| ${[s.id, s.kind, s.status, s.exit ?? '-', seconds(s.ms)].join(' | ')} |${s.reason ? ` ${String(s.reason).replaceAll('|', '\\|')} ` : ' '}|`);
  const count = status => report.steps.filter(s => s.status === status).length;
  out.push('', `**${report.verdict}** (exit ${report.exit}): ${['PASS', 'FAIL', 'INFO', 'SKIP', 'PENDING'].map(s => `${count(s)} ${s}`).join(', ')}.`);
  return out.join('\n') + '\n';
}
