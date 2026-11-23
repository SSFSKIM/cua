#!/usr/bin/env node
// The M6a venue pilot (#171 M6a, T6's wave-0 part; the M6a pre-flight §5.2, "The venue pilot"): on the code of main,
// before any M6a code exists, inside the environment linux-runtime-env.sh makes, it runs doctor's four environment rows,
// today's `cua install`, `sandbox.launcher`, the item 1 smoke (linux-native.mjs --selection default) with the shared
// confinement step, and the same smoke under `strace -f`. It answers four questions for the venue it runs on:
//   userns       does bubblewrap get its user namespace?        doctor's sandbox.userns, and the kernel under bwrap
//   a11y         is gedit's tree served on the private bus?     the smoke's marker read back from an at_spi tree
//   confinement  do the controls connect while the kernel is refused?   the smoke's confinement step
//   strace       does `strace -f` follow the helper's children? the traced smoke's kernel, under the helper, calling
// Each answer is yes, no (its evidence was taken and failed), or unanswered (a step before it failed; the reason given).
//
//   node scripts/accept/linux-runtime-pilot.mjs --out <dir> [--leg <label>]   writes ARTIFACT_FILES into <dir>; exit 0
//                                                                            only when every mandatory step passed and
//                                                                            all four answers are yes (pilotVerdict)
// <dir> holds only the projected reports (labels, outcomes, counts and scratch paths). Every raw stream, doctor's and
// the install's output, the smokes' own reports and the strace file, stays in <dir>/../scratch. It refuses to start with
// CUA_SHIM_SANDBOX set, with no DISPLAY, or on display :0.
import {spawn} from 'node:child_process';
import {mkdirSync, readFileSync, realpathSync, writeFileSync, existsSync, openSync, closeSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {helperFor} from '../../src/sandbox/linux.mjs';
import {summarizeTraceFile, TRACE_ARGS, traceVerdict} from './linux-trace.mjs';

export const ENVIRONMENT_ROWS = ['display', 'accessibility.bus', 'accessibility.enabled', 'sandbox.userns'];
const TYPE_STEP = 'type the marker and read it back from the accessibility tree';

/** One doctor row's verdict: `{pass, status, detail}`; a missing row is status `missing`. */
export function rowVerdict(report, name) {
  const row = (report?.checks ?? []).find(c => c.name === name);
  return row ? {pass: row.status === 'pass', status: row.status, detail: row.detail ?? null} : {pass: false, status: 'missing', detail: null};
}

/** Doctor's four environment rows: each must be `pass`; a warn stops the run as a fail does. */
export function environmentVerdict(report) {
  const rows = {};
  const problems = [];
  for (const name of ENVIRONMENT_ROWS) {
    const row = rowVerdict(report, name);
    rows[name] = row.status;
    if (!row.pass) problems.push(`${name} is ${row.status}${row.detail ? `: ${row.detail}` : ''}`);
  }
  return {pass: problems.length === 0, problems, rows};
}

const yes = evidence => ({answer: 'yes', evidence});
const no = (evidence, why) => ({answer: 'no', evidence, why});
const unanswered = why => ({answer: 'unanswered', why});

/** The four answers from what the pilot observed (`smoke` and `trace` null when their step never ran). */
export function pilotAnswers({environment, launcher, smoke, trace}) {
  const userns = environment?.rows?.['sandbox.userns'];
  const confinement = smoke?.confinement ?? null;
  const ancestors = confinement?.ancestry?.ancestors ?? null;
  const typed = smoke?.steps?.find(s => s.name === TYPE_STEP) ?? null;
  const notRun = what => `${what} did not run${environment && !environment.pass ? ` (the environment failed: ${environment.problems.join('; ')})` : launcher && !launcher.pass ? ` (sandbox.launcher is ${launcher.status})` : ''}`;
  const answers = {};

  if (userns && userns !== 'pass') answers.userns = no({'sandbox.userns': userns}, 'bubblewrap could not create its user namespace (doctor\'s sandbox.userns)');
  else if (!ancestors) answers.userns = unanswered(notRun('the smoke\'s confinement step'));
  else if (!confinement.ancestry.kernel || confinement.ancestry.underServe !== true) {
    answers.userns = unanswered(`the kernel that answered was not bound under this serve (${confinement.ancestry.reason ?? 'not its descendant'}), so no bwrap above it can be read`);
  } else {
    // bwrap certified by the executable read from /proc, above the kernel that answered, in this session.
    const underBwrap = ancestors.some(a => typeof a.exe === 'string' && /(^|\/)bwrap$/.test(a.exe));
    const evidence = {'sandbox.userns': userns, kernelUnderBwrap: underBwrap};
    answers.userns = underBwrap ? yes(evidence) : no(evidence, 'the kernel that answered did not run under bubblewrap');
  }

  if (!typed) answers.a11y = unanswered(notRun('the smoke\'s typing step'));
  else {
    const evidence = {source: typed.detail?.source ?? null, readBack: typed.detail?.readBack ?? null, step: typed.status};
    answers.a11y = typed.status !== 'PASS' ? no(evidence, `the typing step did not pass (${typed.status})`)
      : evidence.source === 'at_spi' && evidence.readBack === true ? yes(evidence)
        : no(evidence, evidence.source !== 'at_spi' ? `gedit's tree came from ${evidence.source ?? 'nowhere'}, not AT-SPI on the run's bus` : 'the marker was not read back once from the tree');
  }

  if (!confinement?.verdict) answers.confinement = unanswered(notRun('the smoke\'s confinement step'));
  else {
    const evidence = {controls: confinement.controls, kernel: confinement.kernel, accepted: confinement.accepted};
    answers.confinement = confinement.verdict.pass ? yes(evidence) : no(evidence, confinement.verdict.problems.join('; '));
  }

  if (!trace) answers.strace = unanswered(notRun('the traced smoke'));
  else answers.strace = trace.pass ? yes({problems: []}) : no({problems: trace.problems}, trace.problems.join('; '));
  return answers;
}

// The steps the pilot must pass, every one, in its order; the four answers are diagnostic beside them.
export const MANDATORY_STEPS = [
  'preconditions',
  'doctor\'s four environment rows pass',
  'today\'s cua install',
  'sandbox.launcher passes',
  'the item 1 smoke, with the shared confinement step',
  'the item 1 smoke under strace -f',
  'strace -f followed the helper\'s children into the kernel',
];

/** The pilot's own judge: every mandatory step ran and passed, and all four answers are yes. `{pass, problems}`. */
export function pilotVerdict({steps = [], answers = {}}) {
  const problems = [];
  for (const name of MANDATORY_STEPS) {
    const step = steps.find(s => s.name === name);
    if (!step) problems.push(`${name} did not run`);
    else if (step.status !== 'PASS') problems.push(`${name} is ${step.status}`);
  }
  for (const question of ['userns', 'a11y', 'confinement', 'strace']) {
    const answer = answers[question]?.answer ?? 'missing';
    if (answer !== 'yes') problems.push(`${question} is ${answer}`);
  }
  return {pass: problems.length === 0, problems};
}

// The artifact: these projected reports and nothing else; the raw streams stay in the run's scratch.
export const ARTIFACT_FILES = ['pilot.json', 'smoke.json', 'smoke-traced.json'];

/** A smoke's report projected for the artifact: its status and each step's name and status. */
export const projectSmoke = report => (report ? {status: report.status, steps: (report.steps ?? []).map(s => ({name: s.name, status: s.status}))} : null);

// --- the run ---------------------------------------------------------------------------------------------------------

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(REPO, 'bin', 'cua.mjs');
const SMOKE = join(REPO, 'scripts', 'accept', 'linux-native.mjs');

// `command args` with its raw output to two files in `scratch`: {code, signal, seconds}. Killed at `minutes`.
function run(scratch, label, command, args, minutes) {
  const started = Date.now();
  const stdout = openSync(join(scratch, `${label}.out`), 'w');
  const stderr = openSync(join(scratch, `${label}.err`), 'w');
  return new Promise(done => {
    const child = spawn(command, args, {cwd: REPO, stdio: ['ignore', stdout, stderr]});
    const timer = setTimeout(() => child.kill('SIGTERM'), minutes * 60_000);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      closeSync(stdout);
      closeSync(stderr);
      done({code, signal, seconds: Math.round((Date.now() - started) / 100) / 10});
    });
  });
}
const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
const statuses = report => Object.fromEntries((report?.checks ?? []).map(c => [c.name, c.status]));

async function main() {
  const option = name => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
  const out = option('--out');
  if (!out) throw new Error('usage: linux-runtime-pilot.mjs --out <dir> [--leg <label>]');
  mkdirSync(out, {recursive: true});
  const scratch = join(dirname(resolve(out)), 'scratch');
  mkdirSync(scratch, {recursive: true});
  const home = defaultHome();
  const report = {pilot: 'm6a-venue', leg: option('--leg') ?? null, arch: process.arch, node: process.version, home, out: resolve(out), scratch,
    startedAt: new Date().toISOString(), steps: []};
  const record = (name, ok, detail) => { report.steps.push({name, status: ok ? 'PASS' : 'FAIL', ...detail}); process.stderr.write(`pilot: ${ok ? 'PASS' : 'FAIL'} ${name}\n`); return ok; };
  const before = join(dirname(resolve(out)), 'userns-before.json');
  if (existsSync(before)) report.usernsBeforeRemedy = readJson(before);
  let environment = null, launcher = null, smoke = null, trace = null;
  try {
    const display = process.env.DISPLAY ?? '';
    if (!record('preconditions', process.platform === 'linux' && process.env.CUA_SHIM_SANDBOX === undefined && /^:\d+/.test(display) && !/^:0(\.\d+)?$/.test(display),
      {display, sandbox: process.env.CUA_SHIM_SANDBOX ?? '(unset: scoped)'})) return;

    const doctor1 = await run(scratch, 'doctor-environment', process.execPath, [CLI, 'doctor', '--json'], 3);
    environment = environmentVerdict(readJson(join(scratch, 'doctor-environment.out')));
    report.environment = environment;
    if (!record('doctor\'s four environment rows pass', environment.pass, {exit: doctor1.code, problems: environment.problems})) return;

    const install = await run(scratch, 'install', process.execPath, [CLI, 'install'], 20);
    if (!record('today\'s cua install', install.code === 0, install)) return;

    const doctor2 = await run(scratch, 'doctor-installed', process.execPath, [CLI, 'doctor', '--json'], 3);
    const installed = readJson(join(scratch, 'doctor-installed.out'));
    launcher = rowVerdict(installed, 'sandbox.launcher');
    report.doctorRows = statuses(installed);
    if (!record('sandbox.launcher passes', launcher.pass, {exit: doctor2.code, launcher})) return;

    const plain = await run(scratch, 'smoke', process.execPath, [SMOKE, '--selection', 'default'], 10);
    smoke = readJson(join(scratch, 'smoke.out'));
    report.smoke = projectSmoke(smoke);
    report.confinement = smoke?.confinement ?? null;
    writeFileSync(join(out, 'smoke.json'), `${JSON.stringify(report.smoke, null, 1)}\n`);
    record('the item 1 smoke, with the shared confinement step', plain.code === 0 && smoke?.status === 'PASS', {exit: plain.code, signal: plain.signal, seconds: plain.seconds});

    const traceFile = join(scratch, 'smoke.strace');
    const traced = await run(scratch, 'smoke-traced', 'strace', [...TRACE_ARGS, '-o', traceFile, '--', process.execPath, SMOKE, '--selection', 'default'], 25);
    report.tracedSmoke = projectSmoke(readJson(join(scratch, 'smoke-traced.out')));
    writeFileSync(join(out, 'smoke-traced.json'), `${JSON.stringify(report.tracedSmoke, null, 1)}\n`);
    record('the item 1 smoke under strace -f', traced.code === 0 && report.tracedSmoke?.status === 'PASS', {exit: traced.code, signal: traced.signal, seconds: traced.seconds, trace: traceFile});
    if (existsSync(traceFile)) {
      // The fixture runs from the checkout (run's cwd), the first process of the trace; both spellings of the home count.
      const summary = await summarizeTraceFile(traceFile, {helper: realpathSync(helperFor({home, arch: process.arch}).path), home: [...new Set([home, realpathSync(home)])], cwd: REPO});
      trace = traceVerdict(summary);
      report.trace = {summary, verdict: trace};
      record('strace -f followed the helper\'s children into the kernel', trace.pass, {problems: trace.problems});
    }
  } finally {
    report.answers = pilotAnswers({environment, launcher, smoke, trace});
    report.verdict = pilotVerdict(report);
    report.finishedAt = new Date().toISOString();
    writeFileSync(join(out, 'pilot.json'), `${JSON.stringify(report, null, 1)}\n`);
    for (const [q, a] of Object.entries(report.answers)) process.stderr.write(`pilot: ${q}: ${a.answer}${a.why ? ` (${a.why})` : ''}\n`);
    for (const problem of report.verdict.problems) process.stderr.write(`pilot: FAIL ${problem}\n`);
    process.exitCode = report.verdict.pass ? 0 : 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`pilot: ${error.stack ?? error}\n`); process.exitCode = 2; });
}
