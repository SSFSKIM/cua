// A hosted sitting's one job (#117 M5, T10b′): the plan's steps (./plan.mjs) run in order on the runner, each step's
// output kept in its own log, and each step read by its own check (./checks.mjs) once it ran:
//   PASS        what the step's check asks held
//   FAIL        a runtime error, a driver failure, a judge's FAIL, or a step that could not run here (`missing`)
//   NO VERDICT  a judge found proof missing, or an observation's samples all had no verdict
//   OWNER       a judge left the owner's calls
//   INFO        a pilot reading that did not answer: recorded, never a failure
//   SKIP        a step it needs did not pass (a cleanup: what it needs never ran)
//   PENDING     a step whose code is not built yet, never run
// In the pilot a judge's NO VERDICT on a step marked `pilotNoVerdict` (one run a lane, which no judge can pass) is
// recorded as expected and left out of the sitting's exit; every other verdict counts, as B's does.
// The sitting's exit, the first that applies: 1 a step failed, 4 NO VERDICT, 5 a full sitting holds a step not built
// yet (INCOMPLETE), 3 OWNER, 0 PASS (the matrix judge's codes, ../native-matrix.mjs, and 5 for what it has not).
import {spawn} from 'node:child_process';
import {copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync} from 'node:fs';
import {basename, dirname, join} from 'node:path';
import {CHECKS} from './checks.mjs';

const PASSED = new Set(['PASS']);
export const SITTING_EXITS = Object.freeze([['FAIL', 1], ['NO VERDICT', 4], ['INCOMPLETE', 5], ['OWNER', 3]]);
const STATUSES = ['PASS', 'FAIL', 'NO VERDICT', 'OWNER', 'INFO', 'SKIP', 'PENDING'];

// One step's command, its output teed to `logPath` and to this job's log (`echo`). It resolves only once the child has
// closed and the log is flushed to disk, so a check reading the log straight after sees all of it; a log that cannot be
// written is the step's runtime error. -> {exit, signal} | {exit: null, error}.
export async function execStep(step, {logPath, cwd = process.cwd(), env = process.env, echo = process.stderr, openLog = path => createWriteStream(path)} = {}) {
  let file;
  try {
    mkdirSync(dirname(logPath), {recursive: true});
    file = openLog(logPath);
    if (file.pending) await new Promise((opened, failed) => { file.once('open', opened); file.once('error', failed); });
  } catch (error) { return {exit: null, signal: null, error: `the step's log ${logPath} could not be written (${error.code ?? error.message})`}; }
  let logError = null;
  file.on('error', error => { logError ??= error; });
  const ended = await new Promise(resolve => {
    const child = spawn(step.argv[0], step.argv.slice(1), {cwd, env: {...env, ...step.env}, stdio: ['ignore', 'pipe', 'pipe']});
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { file.write(chunk); echo.write(chunk); });
    child.on('error', error => { file.write(`${error.message}\n`); resolve({exit: null, signal: null, error: error.message}); });
    child.on('close', (code, signal) => resolve({exit: code, signal}));
  });
  await new Promise(resolve => { if (file.destroyed) resolve(); else file.end(resolve); });
  return logError ? {exit: null, signal: null, error: `the step's log ${logPath} could not be written (${logError.code ?? logError.message})`} : ended;
}

const readJsonFile = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
const readTextFile = path => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };
const checkOf = step => step.check ?? (step.kind === 'expect' ? 'expect' : 'exit');

// `plan`: ./plan.mjs sittingPlan's. deps: {out, exec(step, {logPath}) -> {exit, signal?, error?}, keep(from, to),
// readJson(path), readText(path), exists(path), remove(path) (a step's `report`, removed before it runs so the one read
// is its own), now, log}. -> {sitting, form, title, proves, steps: [{id, label, kind, check, status, exit, ms, reason,
// log, expected?}], verdict, exit}.
export async function runSitting(plan, {out, exec = execStep, keep = (from, to) => { mkdirSync(dirname(to), {recursive: true}); copyFileSync(from, to); },
  readJson = readJsonFile, readText = readTextFile, exists = existsSync, remove = path => rmSync(path, {force: true}), now = Date.now,
  log = line => process.stderr.write(`${line}\n`)}) {
  const done = new Map();
  for (const step of plan.steps) {
    const entry = {id: step.id, label: step.label, kind: step.kind, check: checkOf(step), status: null, exit: null, ms: null, reason: null, log: null};
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
      if (step.report) remove(step.report);
      const started = now();
      let result;
      try { result = await exec(step, {logPath: entry.log}); } catch (error) { result = {exit: null, error: error.message}; }
      entry.ms = now() - started;
      entry.exit = result.exit ?? null;
      if (entry.exit === null) Object.assign(entry, {status: 'FAIL', reason: `runtime error: ${result.error ?? `ended by ${result.signal ?? 'an unknown cause'}`}`});
      else [entry.status, entry.reason] = CHECKS[entry.check](step, {exit: entry.exit, readJson, exists, logText: () => readText(entry.log)});
      if (step.kind === 'pilot' && entry.status !== 'PASS') Object.assign(entry, {status: 'INFO', reason: `${entry.reason ?? `exit ${entry.exit}`}: a pilot reading, recorded`});
      if (plan.form === 'pilot' && step.pilotNoVerdict && entry.status === 'NO VERDICT')
        Object.assign(entry, {expected: true, reason: 'expected in the pilot: one run a lane gives no verdict'});
      for (const file of step.keep ?? []) {
        try { keep(file, join(out, step.id, basename(file))); } catch (error) { entry.reason = [entry.reason, `${file} not kept (${error.code ?? error.message})`].filter(Boolean).join('; '); }
      }
    }
    log(`hosted-sittings: ${plan.sitting} ${step.id}: ${entry.status}${entry.reason ? ` (${entry.reason})` : ''}`);
  }
  const steps = [...done.values()];
  const counted = steps.filter(s => !s.expected);
  const holds = {FAIL: counted.some(s => s.status === 'FAIL'), 'NO VERDICT': counted.some(s => s.status === 'NO VERDICT'),
    INCOMPLETE: plan.form === 'full' && counted.some(s => s.status === 'PENDING'), OWNER: counted.some(s => s.status === 'OWNER')};
  const [verdict, exit] = SITTING_EXITS.find(([name]) => holds[name]) ?? ['PASS', 0];
  return {sitting: plan.sitting, form: plan.form, title: plan.title, proves: plan.proves, steps, verdict, exit};
}

const seconds = ms => (ms === null ? '-' : `${Math.round(ms / 1000)} s`);
// The report as the job summary's Markdown.
export function renderSitting(report) {
  const out = [`## Sitting ${report.sitting.toUpperCase()} (${report.form}): ${report.title}`, '', `Proves: ${report.proves}.`, '',
    '| step | kind | status | exit | time | note |', '|---|---|---|---|---|---|'];
  for (const s of report.steps) out.push(`| ${[s.id, s.kind, s.status, s.exit ?? '-', seconds(s.ms)].join(' | ')} |${s.reason ? ` ${String(s.reason).replaceAll('|', '\\|')} ` : ' '}|`);
  const count = status => report.steps.filter(s => s.status === status).length;
  out.push('', `**${report.verdict}** (exit ${report.exit}): ${STATUSES.map(s => `${count(s)} ${s}`).join(', ')}.`);
  return out.join('\n') + '\n';
}
