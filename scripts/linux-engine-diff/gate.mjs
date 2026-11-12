#!/usr/bin/env node
// M4's gate runner (#171 M4, T18): the gate's steps (gate-steps.mjs) listed, one printed, or one run, by name.
//
//   node scripts/linux-engine-diff/gate.mjs --list [--candidate <file>] [--out <dir>] [--dev] [--pilot <n>]
//   node scripts/linux-engine-diff/gate.mjs print <step> --candidate <file> --out <dir> [--dev] [--pilot <n>]
//   node scripts/linux-engine-diff/gate.mjs run <step> --candidate <file> --out <dir> [--dev] [--pilot <n>]
//
// `--list` prints every step's estimated minutes, display, load and command, with the totals per display and per load.
// `print` prints one step's command and writes its directory's labelled README; `run` runs one step, and never a `:0`
// step: those run in the declared sitting through task 50's guards (run71.sh under wrap71.py), each launched by the T18
// executor with the command `print` gives. Every step is launched under the host lock (`locked.sh <holder> ...`),
// which the printed commands include.
//
// A gate (the default) runs from a clean checkout at the commit the candidate was built from: the checkout this runner
// lives in, which candidate.mjs's checks read (`git -C`). So the runner refuses a checkout that is not clean or whose
// commit cannot be read, and an out directory inside the checkout (the step's own output would make it unclean). A
// `node_modules` that is a symlink counts as a change; install it (`npm ci`) or run from a worktree that has its own.
// The candidate is the release workflow's attested artifact of that commit, checked by the step itself. `--dev` runs any
// build as a development run; `--pilot <n>` runs each step's smallest form (`--trials <n>` or its own), a development
// run only.
//
// Labels (the design session's condition): every directory and file a step writes carries "release gate" or
// "development run, not a release gate": the step's directory is named `<step>.release-gate` or
// `<step>.development-run[.pilot]`, its README.md and step.json open with the label, its logs' first line is the label,
// the private display's session rows carry it, and the harness's own rows and summary carry it (experiments.mjs,
// report.mjs).

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT, candidateLine, prepareCandidate } from './candidate.mjs';
import { MAX_STEP_MINUTES, STEPS, runName, stepArgs, stepLabel, stepNamed, stepScript, totals } from './gate-steps.mjs';

const HOME = homedir();
/** The paths of this VM's sittings (task 73's env.sh): the pinned and newest vendor builds and the vendor's client. */
export const DEFAULTS = {
  vendor: join(HOME, '.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64'),
  newest: join(HOME, '.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64'),
  vendorJs: join(HOME, '.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky'),
  // task 59's Mozilla Firefox, first on PATH in every M4 sitting (its README says why)
  firefoxDir: join(HOME, '.local/share/cua-171/task59/bin'),
  locked: join(HOME, '.local/share/cua-171/locked.sh'),
  holder: 't18-gate',
  hold: join(HOME, '.local/share/cua-171/hold-sittings'),
};
/** Task 50's guards for a `:0` step, as T19's sitting ran them (pointer-route/scripts). */
const GUARDS = 'docs/evidence/2026-10-28-own-linux-engine/m4/pointer-route/scripts';

/** A step the runner will not start, with the reason. */
export class GateRefused extends Error {
  constructor(message) {
    super(message);
    this.name = 'GateRefused';
  }
}

const USAGE = `usage:
  gate.mjs --list [--candidate <file>] [--out <dir>] [--dev] [--pilot <n>]
  gate.mjs print <step> --candidate <file> --out <dir> [--dev] [--pilot <n>]
  gate.mjs run <step> --candidate <file> --out <dir> [--dev] [--pilot <n>]
  options: [--vendor <bin>] [--newest <bin>] [--vendor-js <@oai/sky dir>] [--holder <name>]`;

export function parseGateArgs(argv) {
  const a = { mode: null, step: null, gate: true, pilot: null, ...DEFAULTS, candidate: null, out: null };
  const flags = { '--candidate': 'candidate', '--out': 'out', '--vendor': 'vendor', '--newest': 'newest', '--vendor-js': 'vendorJs', '--holder': 'holder' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      if (argv[i + 1] === undefined) throw new GateRefused(`${flag} needs a value\n${USAGE}`);
      return argv[++i];
    };
    if (flag === '--list') a.mode = 'list';
    else if (flag === '--dev') a.gate = false;
    else if (flag === '--pilot') {
      a.pilot = Number(value());
      if (!Number.isInteger(a.pilot) || a.pilot < 1) throw new GateRefused('--pilot needs a positive whole number of trials');
    } else if (flag in flags) a[flags[flag]] = resolve(value());
    else if (!a.mode && ['print', 'run'].includes(flag)) {
      a.mode = flag;
      a.step = value();
    } else throw new GateRefused(`unknown argument ${flag}\n${USAGE}`);
  }
  if (!a.mode) throw new GateRefused(USAGE);
  if (a.gate && a.pilot) throw new GateRefused('a pilot is never a release gate: give --dev with --pilot');
  if (a.mode !== 'list') {
    if (!STEPS.some((s) => s.name === a.step)) throw new GateRefused(`no gate step ${a.step}; the steps: ${STEPS.map((s) => s.name).join(', ')}`);
    if (!a.candidate || !a.out) throw new GateRefused(`${a.mode} needs --candidate and --out\n${USAGE}`);
  }
  return a;
}

/**
 * A gate's checkout: clean, its commit read (candidate.mjs reads the same with `git -C`, and the candidate must be built
 * from it), and the out directory outside it. Answers the commit; refuses otherwise. A development run's checkout is
 * read and recorded, never refused.
 */
export function checkCheckout({ root = REPO_ROOT, out, gate, git = (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }) {
  let commit = null;
  let changes = null;
  try {
    commit = git(['rev-parse', 'HEAD']).trim();
    changes = git(['status', '--porcelain']).split('\n').filter(Boolean);
  } catch (error) {
    if (gate) throw new GateRefused(`a gate runs from a clean git checkout at the candidate's commit, and ${root} could not be read: ${String(error.message).split('\n')[0]}`);
  }
  if (!gate) return { commit, clean: changes ? changes.length === 0 : null };
  if (changes.length) throw new GateRefused(`a gate runs from a clean git checkout at the candidate's commit, and ${root} has ${changes.length} changes (${changes.slice(0, 5).map((l) => l.slice(3)).join(', ')}): commit or remove them (a symlinked node_modules counts; install it)`);
  const rel = relative(root, out);
  if (!rel.startsWith('..') && !rel.startsWith('/')) throw new GateRefused(`the out directory ${out} is inside the checkout ${root}: its files would make the checkout unclean mid-gate; write outside it and copy the evidence in after`);
  return { commit, clean: true };
}

const quote = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${String(s).replace(/'/g, "'\\''")}'`);
const line = (argv) => argv.map(quote).join(' ');

/** A step's directory: the out root's `<step>.<label slug>`. */
export const stepDir = (step, a) => join(a.out, `${step.name}.${stepLabel(a).slug}`);

/** The command that launches a step, under the host lock: run71.sh's guarded sitting for `:0`, else this runner. */
export function launchCommand(step, a, root = REPO_ROOT) {
  const lock = [a.locked, a.holder];
  if (step.display === ':0') {
    const args = stepArgs(step, { paths: { ...a, candidate: a.candidate ?? '<candidate>' }, gate: a.gate, pilot: a.pilot });
    return line([...lock, 'env', `WRAP=${join(root, GUARDS, 'wrap71.py')}`, join(root, GUARDS, 'run71.sh'), a.out ? stepDir(step, a) : '<out>/<step>', root, ...args]);
  }
  return line([...lock, process.execPath, fileURLToPath(import.meta.url), 'run', step.name, '--candidate', a.candidate ?? '<candidate>', '--out', a.out ?? '<out>', ...(a.gate ? [] : ['--dev']), ...(a.pilot ? ['--pilot', String(a.pilot)] : [])]);
}

/** `--list`: every step's minutes, display, load and what it covers, its command, and the totals. */
export function listText(a, root = REPO_ROOT) {
  const out = [`M4's gate: ${STEPS.length} steps, each ${MAX_STEP_MINUTES} min or less (estimated), ${a.gate ? 'release gate' : `development run, not a release gate${a.pilot ? `, pilot (${a.pilot})` : ''}`}`, ''];
  for (const s of STEPS) {
    out.push(`${s.name.padEnd(4)} ${String(s.minutes).padStart(3)} min  ${s.display.padEnd(7)} ${s.load.padEnd(12)} ${s.what}`);
    out.push(`     ${launchCommand(s, a, root)}`);
  }
  const t = totals();
  const fmt = (o) => Object.entries(o).map(([k, v]) => `${k} ${v} min`).join(', ');
  out.push('', `total ${t.all} min (${(t.all / 60).toFixed(1)} h); per display: ${fmt(t.display)}; per load: ${fmt(t.load)}`);
  out.push(`A gate step runs from a clean git checkout at the candidate's commit (${root}); its out directory lies outside it. The :0 steps are launched in the declared sitting, never by this runner.`);
  return out.join('\n');
}

/** The step's README and step.json, labelled; rewritten with the outcome at its end. */
function writeRecord(dir, record) {
  writeFileSync(join(dir, 'step.json'), `${JSON.stringify(record, null, 2)}\n`);
  const r = record;
  const md = [
    `# ${r.step} (${r.label}${r.pilot ? ', pilot' : ''})`,
    '',
    `**${r.label}.**${r.pilot ? ' A pilot: the step\'s smallest form, to show it starts; no verdict of it is the gate\'s.' : ''}`,
    '',
    `- what: ${r.what}`,
    `- display: ${r.display}; load: ${r.load}; estimated ${r.minutes} min`,
    `- run: ${r.run_name ? `\`${r.run_name}\`` : 'the facade instrument (no run name)'}; the harness's output in \`run/\``,
    `- checkout: ${r.checkout.root} at ${r.checkout.commit ?? 'an unread commit'}${r.checkout.clean ? ', clean' : r.checkout.clean === false ? ', **not clean**' : ''}`,
    `- candidate: ${r.candidate.path} (sha256 ${r.candidate.sha256} as given)${r.candidate.record ? `; ${candidateLine(r.candidate.record)}` : ''}`,
    `- command: \`${r.command}\``,
    ...(r.started ? [`- started ${r.started}`] : []),
    ...(r.finished ? [`- finished ${r.finished}; exit ${r.exit}${r.display_watchdog ? `; private display's watchdog: ${r.display_watchdog}` : ''}`] : []),
    '',
  ];
  writeFileSync(join(dir, 'README.md'), md.join('\n'));
}

/** A step's record before it runs. */
function stepRecord(step, a, { root, checkout, command }) {
  const { label, pilot } = stepLabel(a);
  let digest = null;
  try {
    digest = createHash('sha256').update(readFileSync(a.candidate)).digest('hex');
  } catch {
    // a missing candidate: the record says so, and `run` refuses it
  }
  return { label, step: step.name, pilot, what: step.what, display: step.display, load: step.load, minutes: step.minutes, run_name: step.kind === 'facade' ? null : runName(step, a), checkout: { root, ...checkout }, candidate: { path: a.candidate, sha256: digest }, command };
}

/** `print`: the step's labelled directory and README, and its command. */
export function printStep(a, { root = REPO_ROOT, git } = {}) {
  const step = stepNamed(a.step);
  const checkout = checkCheckout({ root, out: a.out, gate: a.gate, git });
  const dir = stepDir(step, a);
  mkdirSync(dir, { recursive: true });
  const command = launchCommand(step, a, root);
  writeRecord(dir, stepRecord(step, a, { root, checkout, command }));
  return command;
}

/** A log file of the step's, its first line the label; answers its descriptor for appending. */
function labelledLog(path, label) {
  writeFileSync(path, `${label}\n`);
  return openSync(path, 'a');
}

/**
 * `run`: one step that is not `:0`'s, refused while the host is held for sittings, under a load already running, into a
 * step directory that exists, or (a gate) from an unclean checkout. Answers the step's exit code: the harness's, or 1
 * when its private display's watchdog was not clean.
 */
export async function runStep(a, { root = REPO_ROOT, git, held = () => existsSync(a.hold), loadRunning = () => pgrep('stress-ng') } = {}) {
  const step = stepNamed(a.step);
  if (step.display === ':0') throw new GateRefused(`${step.name} runs on :0, in the declared sitting under task 50's guards: launch it with \`gate.mjs print ${step.name} ...\`'s command; this runner never runs on the person's display`);
  if (held()) throw new GateRefused(`${a.hold} exists: the host is held for sittings, and nothing starts`);
  if (loadRunning()) throw new GateRefused('stress-ng is running: a step starts only on a host with no load running');
  if (!existsSync(a.candidate)) throw new GateRefused(`no candidate at ${a.candidate}`);
  const checkout = checkCheckout({ root, out: a.out, gate: a.gate, git });
  const dir = stepDir(step, a);
  if (existsSync(dir)) throw new GateRefused(`${dir} exists: each execution of a step writes a directory of its own`);
  mkdirSync(dir, { recursive: true });
  const { label } = stepLabel(a);
  const record = stepRecord(step, a, { root, checkout, command: launchCommand(step, a, root) });
  const env = { ...process.env, PATH: existsSync(a.firefoxDir) ? `${a.firefoxDir}:${process.env.PATH}` : process.env.PATH };
  // the facade step's script has no candidate checks of its own: a gate's runs here, its copy removed at the end
  let store = null;
  let candidatePath = a.candidate;
  if (step.kind === 'facade' && a.gate) {
    store = mkdtempSync(join(tmpdir(), 'cua171-candidate-'));
    try {
      const prepared = await prepareCandidate({ source: a.candidate, gate: true, dir: store, root });
      candidatePath = prepared.path;
      record.candidate.record = prepared.record;
    } catch (error) {
      rmSync(store, { recursive: true, force: true });
      throw error;
    }
  }
  const args = [...stepArgs(step, { paths: { ...a, candidate: candidatePath }, gate: a.gate, pilot: a.pilot }), '--out', join(dir, 'run')];
  record.argv = [stepScript(step), ...args];
  record.started = new Date().toISOString();
  writeRecord(dir, record);
  const out = labelledLog(join(dir, 'stdout.log'), label);
  const err = labelledLog(join(dir, 'stderr.log'), label);
  let result;
  try {
    if (step.display === 'own') {
      const { DISPLAY, XAUTHORITY, ...own } = env;
      const child = spawn(process.execPath, [join(root, stepScript(step)), ...args], { cwd: root, env: own, stdio: ['ignore', out, err] });
      const forward = (signal) => child.kill(signal);
      process.on('SIGTERM', forward);
      process.on('SIGINT', forward);
      result = await new Promise((done) => child.once('exit', (code, signal) => done({ code, signal, clean: true })));
      process.off('SIGTERM', forward);
      process.off('SIGINT', forward);
    } else {
      const { runOnPrivateDisplay } = await import('./gate-display.mjs');
      result = await runOnPrivateDisplay({ dir, label, script: join(root, stepScript(step)), args, cwd: root, env, out, err });
    }
  } finally {
    if (store) rmSync(store, { recursive: true, force: true });
  }
  const exit = result.code === 0 && result.clean ? 0 : result.code === 2 ? 2 : 1;
  Object.assign(record, { finished: new Date().toISOString(), exit, child_exit: result.code ?? result.signal, ...(step.display === 'private' ? { display_watchdog: result.clean ? 'clean' : result.reason } : {}) });
  writeRecord(dir, record);
  appendFileSync(join(dir, 'stdout.log'), `${label}: ${step.name} exit ${exit}\n`);
  return exit;
}

function pgrep(name) {
  try {
    execFileSync('pgrep', ['-x', name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const a = parseGateArgs(process.argv.slice(2));
    if (a.mode === 'list') process.stdout.write(`${listText(a)}\n`);
    else if (a.mode === 'print') process.stdout.write(`${printStep(a)}\n`);
    else process.exit(await runStep(a));
  } catch (error) {
    if (error instanceof GateRefused || error.name === 'CandidateRefused') {
      process.stderr.write(`gate step refused: ${error.message}\n`);
      process.exit(2);
    }
    throw error;
  }
}
