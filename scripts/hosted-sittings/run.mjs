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
import {LIVE_SITTING_ENV} from '../../test/native-goldens/live-guard.mjs';
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
    const child = spawn(step.argv[0], step.argv.slice(1), {cwd, env: {...env, ...step.env, [LIVE_SITTING_ENV]: '1'}, stdio: ['ignore', 'pipe', 'pipe']});
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
  log = line => process.stderr.write(`${line}\n`), jobStartedMs = null, onStep = () => {}}) {
  const done = new Map(), sittingStarted = now();
  // The wall time so far, after each step: the sitting's own and the job's (from `jobStartedMs`, the workflow's first
  // step, so setup counts), so a slowing runner shows in the log and the partial report before the job's limit ends it.
  const wall = () => ({sittingMs: now() - sittingStarted, jobMs: jobStartedMs === null ? null : now() - jobStartedMs});
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
    entry.wall = wall();
    log(`hosted-sittings: ${plan.sitting} ${step.id}: ${entry.status}${entry.reason ? ` (${entry.reason})` : ''}; ${wallText(entry.wall)}`);
    onStep(entry);
  }
  const steps = [...done.values()];
  const counted = steps.filter(s => !s.expected);
  const holds = {FAIL: counted.some(s => s.status === 'FAIL'), 'NO VERDICT': counted.some(s => s.status === 'NO VERDICT'),
    INCOMPLETE: plan.form === 'full' && counted.some(s => s.status === 'PENDING'), OWNER: counted.some(s => s.status === 'OWNER')};
  const [verdict, exit] = SITTING_EXITS.find(([name]) => holds[name]) ?? ['PASS', 0];
  return {sitting: plan.sitting, form: plan.form, title: plan.title, proves: plan.proves, steps, verdict, exit, wall: wall()};
}

// The job's start as the workflow's first step records it (M5_JOB_STARTED, epoch seconds), or null when unset or
// unreadable. -> ms | null.
export const jobStartedOf = env => (/^\d+$/.test(env.M5_JOB_STARTED ?? '') ? Number(env.M5_JOB_STARTED) * 1000 : null);
// The sitting job's limit (.github/workflows/m5-sittings.yml `timeout-minutes` of the sitting job, held to it by a test).
export const JOB_LIMIT_MINUTES = 360;
const minutes = ms => `${Math.round(ms / 60000)} min`;
const wallText = w => `the sitting ${minutes(w.sittingMs)} so far${w.jobMs === null ? '' : `, the job ${minutes(w.jobMs)} of its ${JOB_LIMIT_MINUTES}`}`;

const seconds = ms => (ms === null ? '-' : `${Math.round(ms / 1000)} s`);
const counted = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// The report as the job summary's Markdown. A pilot that passed while a judge gave only its expected NO VERDICT, or with
// steps still pending (F before its code is built), proved none of its acceptance: it says so in place of "Proves" and
// PASS. Its exit stays the sitting's (0).
export function renderSitting(report) {
  const expected = report.steps.filter(s => s.expected).length, pending = report.steps.filter(s => s.status === 'PENDING').length;
  const unproved = report.form === 'pilot' && report.verdict === 'PASS' && (expected > 0 || pending > 0);
  const why = [expected && `${counted(expected, 'judge')} gave the expected NO VERDICT`, pending && `${counted(pending, 'step')} pending`].filter(Boolean).join(', ');
  const out = [`## Sitting ${report.sitting.toUpperCase()} (${report.form}): ${report.title}`, '',
    unproved ? `Would prove: ${report.proves}. This pilot proves none of it: ${why}.` : `Proves: ${report.proves}.`, '',
    '| step | kind | status | exit | time | sitting so far | note |', '|---|---|---|---|---|---|---|'];
  for (const s of report.steps) out.push(`| ${[s.id, s.kind, s.status, s.exit ?? '-', seconds(s.ms), s.wall ? minutes(s.wall.sittingMs) : '-'].join(' | ')} |${s.reason ? ` ${String(s.reason).replaceAll('|', '\\|')} ` : ' '}|`);
  const count = status => report.steps.filter(s => s.status === status).length;
  out.push('', `**${unproved ? 'PILOT COMPLETED WITHOUT ACCEPTANCE PROOF' : report.verdict}** (exit ${report.exit}): ${STATUSES.map(s => `${count(s)} ${s}`).join(', ')}.`);
  if (report.wall) out.push('', `Wall time: ${wallText(report.wall)}${report.wall.jobMs === null ? ` (the job's start unread; its limit is ${JOB_LIMIT_MINUTES} min)` : ''}.`);
  return out.join('\n') + '\n';
}
