#!/usr/bin/env node
// M4's gate runner (#171 M4, T18): the gate's steps (steps.mjs) listed, one printed, or one run, by name. It is a
// launcher above the harness, as the sittings' private-run.mjs scripts were, so it lives outside scripts/linux-engine-diff/:
// it starts Xvfb, Openbox, an xterm and node itself, which the harness's own source checks forbid any harness module.
//
//   node scripts/linux-engine-gate/gate.mjs --list [--pinned <home> | --candidate <file>] [--out <dir>] [--dev] [--pilot <n>]
//   node scripts/linux-engine-gate/gate.mjs print <step> (--pinned <home> | --candidate <file>) --out <dir> [--dev] [--pilot <n>]
//   node scripts/linux-engine-gate/gate.mjs run <step> (--pinned <home> | --candidate <file>) --out <dir> [--dev] [--pilot <n>]
//   node scripts/linux-engine-gate/gate.mjs check --pinned <home>
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
// M5 (#171 M5, T1): **acceptance on the pinned release**. `--pinned <home>` names a run home (its CUA_HOME) whose own
// `cua install --engine` placed the pinned engine, `<home>/engine/linux/cua-engine`; every step takes that engine by
// candidate.mjs's pinned rule (the pin's bytes for this architecture, attested, its --version the attested commit's, the
// checkout's native/linux-engine/ that commit's, no override in the environment), checked by the harness for its own
// steps and here for the facade and suite steps, and labelled "acceptance on the pinned release". The vendor builds
// follow the architecture, from that home's runtime. The facade suites run M5's runner (suites.sh), which passes no
// engine and checks each of its own homes by the same rule, on the device the environment names (`DEVICE`, else this
// architecture's VM). `check --pinned <home>` runs the rule alone and prints its record. `--pinned --dev` takes the
// home's engine unchecked, as a development run (a pilot).
//
// Labels (the design session's condition): every directory and file a step writes carries "release gate" or
// "development run, not a release gate": the step's directory is named `<step>.release-gate` or
// `<step>.development-run[.pilot]`, its README.md and step.json open with the label, its logs' first line is the label,
// the private display's session rows carry it, and the harness's own rows and summary carry it (experiments.mjs,
// report.mjs).

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT, candidateLine, gateLabel, prepareCandidate } from '../linux-engine-diff/candidate.mjs';
import { linuxEnginePath } from '../../src/runtime/linux-engine.mjs';
import { MAX_STEP_MINUTES, STEPS, runName, stepArgs, stepLabel, stepNamed, stepScript, suiteEnv, totals } from './steps.mjs';

const HOME = homedir();
/** The pinned vendor release, whose runtime holds the pinned vendor build and the vendor's client. */
const VENDOR_RELEASE = '26.928.40906';
/** #171's VMs as scripts/repl-parity/devices.mjs declares them, by architecture: the suites' device by default. */
export const DEVICES_BY_ARCH = { x64: 'cua-171', arm64: 'cua-171-arm64' };
/**
 * The paths of the sittings (task 73's env.sh, the spec's Concrete Steps) on a machine of `arch`: the pinned vendor build
 * and the vendor's client from the runtime of the cua home `cuaHome` (the pinned run home, else the default home, as M4
 * ran), the newest vendor build where the run extracted it, and the run's tools.
 */
export function defaultsFor(arch = process.arch, cuaHome = join(HOME, '.local/share/cua')) {
  const sky = join(cuaHome, 'runtimes', `${VENDOR_RELEASE}-linux-${arch}`, 'cua_node/lib/node_modules/@oai/sky');
  return {
    vendor: join(sky, 'bin/linux', `sky_linux_${arch}`),
    newest: join(HOME, '.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux', `sky_linux_${arch}`),
    vendorJs: sky,
    // task 59's Mozilla Firefox, first on PATH in every M4 sitting (its README says why)
    firefoxDir: join(HOME, '.local/share/cua-171/task59/bin'),
    locked: join(HOME, '.local/share/cua-171/locked.sh'),
    holder: 't18-gate',
    hold: join(HOME, '.local/share/cua-171/hold-sittings'),
  };
}
/** Task 50's guards for a `:0` step, as T19's sitting ran them (pointer-route/scripts). */
const GUARDS = 'docs/evidence/2026-10-28-own-linux-engine/m4/pointer-route/scripts';
/** The harness's X client, built in the checkout (xtools.mjs `XPROBE`). */
const XPROBE_BUILT = 'scripts/linux-engine-diff/xprobe/target/release/xprobe';

/** A step the runner will not start, with the reason. */
export class GateRefused extends Error {
  constructor(message) {
    super(message);
    this.name = 'GateRefused';
  }
}

const USAGE = `usage:
  gate.mjs --list [--pinned <home> | --candidate <file>] [--out <dir>] [--dev] [--pilot <n>]
  gate.mjs print <step> (--pinned <home> | --candidate <file>) --out <dir> [--dev] [--pilot <n>]
  gate.mjs run <step> (--pinned <home> | --candidate <file>) --out <dir> [--dev] [--pilot <n>]
  gate.mjs check --pinned <home>
  options: [--vendor <bin>] [--newest <bin>] [--vendor-js <@oai/sky dir>] [--holder <name>]
  --pinned <home>: the CUA_HOME of a run home whose cua install --engine placed the pinned engine (acceptance on the pinned release)`;

/**
 * The runner's arguments. `arch` and `env` are the machine's: the vendor paths follow `arch` (from the pinned home's
 * runtime when `--pinned` names one), and the suites' device is `env.DEVICE`, else `arch`'s VM. A flag still wins.
 */
export function parseGateArgs(argv, { arch = process.arch, env = process.env } = {}) {
  const a = { mode: null, step: null, gate: true, pilot: null, candidate: null, pinned: null, out: null };
  const given = {};
  const flags = { '--candidate': 'candidate', '--pinned': 'pinned', '--out': 'out', '--vendor': 'vendor', '--newest': 'newest', '--vendor-js': 'vendorJs', '--holder': 'holder' };
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
    } else if (flag in flags) {
      const key = flags[flag];
      const v = value();
      given[key] = key === 'holder' ? v : resolve(v);
    } else if (!a.mode && ['print', 'run'].includes(flag)) {
      a.mode = flag;
      a.step = value();
    } else if (!a.mode && flag === 'check') a.mode = 'check';
    else throw new GateRefused(`unknown argument ${flag}\n${USAGE}`);
  }
  if (!a.mode) throw new GateRefused(USAGE);
  if (given.pinned && given.candidate) throw new GateRefused('give --pinned or --candidate, not both: acceptance takes the engine a run home\'s cua install placed');
  Object.assign(a, defaultsFor(arch, given.pinned), { device: env.DEVICE || DEVICES_BY_ARCH[arch] || null }, given);
  if (a.pinned) {
    a.candidate = linuxEnginePath(a.pinned);
    if (a.gate) a.gate = 'pinned';
  }
  if (a.mode === 'check') {
    if (!a.pinned) throw new GateRefused(`check needs --pinned <home>\n${USAGE}`);
    if (!a.gate) throw new GateRefused('check is the pinned rule itself: no --dev');
    return a;
  }
  if (a.gate && a.pilot) throw new GateRefused('a pilot is never a release gate, nor acceptance: give --dev with --pilot');
  if (a.mode !== 'list') {
    if (!STEPS.some((s) => s.name === a.step)) throw new GateRefused(`no gate step ${a.step}; the steps: ${STEPS.map((s) => s.name).join(', ')}`);
    if (!a.candidate) throw new GateRefused(`${a.mode} needs --pinned <home> or --candidate <file>\n${USAGE}`);
    if (!a.out) throw new GateRefused(`${a.mode} needs --out\n${USAGE}`);
  }
  return a;
}

/**
 * A gate's checkout: clean, its commit read (candidate.mjs reads the same with `git -C`, and the candidate must be built
 * from it, or on the pinned release hold its engine sources unchanged), and the out directory outside it. Answers the
 * commit; refuses otherwise. A development run's checkout is read and recorded, never refused.
 */
export function checkCheckout({ root = REPO_ROOT, out, gate, git = (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }) {
  let commit = null;
  let changes = null;
  try {
    commit = git(['rev-parse', 'HEAD']).trim();
    changes = git(['status', '--porcelain']).split('\n').filter(Boolean);
  } catch (error) {
    if (gate) throw new GateRefused(`${runsFrom(gate)}, and ${root} could not be read: ${String(error.message).split('\n')[0]}`);
  }
  if (!gate) return { commit, clean: changes ? changes.length === 0 : null };
  if (changes.length) throw new GateRefused(`${runsFrom(gate)}, and ${root} has ${changes.length} changes (${changes.slice(0, 5).map((l) => l.slice(3)).join(', ')}): commit or remove them (a symlinked node_modules counts; install it)`);
  const rel = relative(root, out);
  if (!rel.startsWith('..') && !rel.startsWith('/')) throw new GateRefused(`the out directory ${out} is inside the checkout ${root}: its files would make the checkout unclean mid-gate; write outside it and copy the evidence in after`);
  return { commit, clean: true };
}

const runsFrom = (gate) => (gate === 'pinned' ? 'acceptance on the pinned release runs from a clean git checkout' : "a gate runs from a clean git checkout at the candidate's commit");

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
  const engine = a.pinned ? ['--pinned', a.pinned] : ['--candidate', a.candidate ?? '<candidate>'];
  return line([...lock, process.execPath, fileURLToPath(import.meta.url), 'run', step.name, ...engine, '--out', a.out ?? '<out>', ...(a.gate ? [] : ['--dev']), ...(a.pilot ? ['--pilot', String(a.pilot)] : [])]);
}

/** `--list`: every step's minutes, display, load and what it covers, its command, and the totals. */
export function listText(a, root = REPO_ROOT) {
  const out = [`The gate: ${STEPS.length} steps, each ${MAX_STEP_MINUTES} min or less (estimated), ${gateLabel(a.gate)}${a.pilot ? `, pilot (${a.pilot})` : ''}${a.pinned ? `, the engine of ${a.pinned}` : ''}`, ''];
  for (const s of STEPS) {
    out.push(`${s.name.padEnd(4)} ${String(s.minutes).padStart(3)} min  ${s.display.padEnd(7)} ${s.load.padEnd(12)} ${s.what}`);
    out.push(`     ${launchCommand(s, a, root)}`);
  }
  const t = totals();
  const fmt = (o) => Object.entries(o).map(([k, v]) => `${k} ${v} min`).join(', ');
  out.push('', `total ${t.all} min (${(t.all / 60).toFixed(1)} h); per display: ${fmt(t.display)}; per load: ${fmt(t.load)}`);
  out.push(`A gate step runs from a clean git checkout (${root})${a.gate === true ? " at the candidate's commit" : ''}; its out directory lies outside it. The :0 steps are launched in the declared sitting, never by this runner.`);
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
    `- run: ${r.run_name ? `\`${r.run_name}\`` : 'a facade instrument or suite (no run name)'}; the harness's output in \`run/\``,
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
  return { label, step: step.name, pilot, what: step.what, display: step.display, load: step.load, minutes: step.minutes, run_name: ['facade', 'suite'].includes(step.kind) ? null : runName(step, a), checkout: { root, ...checkout }, candidate: { path: a.candidate, sha256: digest }, pinned_home: a.pinned ?? null, command };
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
export async function runStep(a, { root = REPO_ROOT, git, held = () => existsSync(a.hold), loadRunning = () => pgrep('stress-ng'), xprobe = join(root, XPROBE_BUILT) } = {}) {
  const step = stepNamed(a.step);
  if (step.display === ':0') throw new GateRefused(`${step.name} runs on :0, in the declared sitting under task 50's guards: launch it with \`gate.mjs print ${step.name} ...\`'s command; this runner never runs on the person's display`);
  if (held()) throw new GateRefused(`${a.hold} exists: the host is held for sittings, and nothing starts`);
  if (loadRunning()) throw new GateRefused('stress-ng is running: a step starts only on a host with no load running');
  if (!existsSync(a.candidate)) throw new GateRefused(a.pinned ? noEngine(a) : `no candidate at ${a.candidate}`);
  // the harness's own X client (the display's watchdog, the witness): a fresh checkout has none until it is built
  if (!existsSync(xprobe)) throw new GateRefused(`the harness's X client is not built: cargo build --release --manifest-path ${join(root, 'scripts/linux-engine-diff/xprobe/Cargo.toml')}`);
  const checkout = checkCheckout({ root, out: a.out, gate: a.gate, git });
  const dir = stepDir(step, a);
  if (existsSync(dir)) throw new GateRefused(`${dir} exists: each execution of a step writes a directory of its own`);
  mkdirSync(dir, { recursive: true });
  const { label } = stepLabel(a);
  const record = stepRecord(step, a, { root, checkout, command: launchCommand(step, a, root) });
  // the harness's out directory, before any script writes in it (services.mjs's Desktop logs there at its start)
  mkdirSync(join(dir, 'run'), { recursive: true });
  const env = { ...process.env, PATH: existsSync(a.firefoxDir) ? `${a.firefoxDir}:${process.env.PATH}` : process.env.PATH };
  // the facade step's script has no candidate checks of its own: a gate's runs here, its copy removed at the end
  let store = null;
  let candidatePath = a.candidate;
  if (['facade', 'suite'].includes(step.kind) && a.gate) {
    store = mkdtempSync(join(tmpdir(), 'cua171-candidate-'));
    try {
      const prepared = await prepareCandidate({ source: a.candidate, gate: a.gate, dir: store, root });
      candidatePath = prepared.path;
      record.candidate.record = prepared.record;
    } catch (error) {
      rmSync(store, { recursive: true, force: true });
      throw error;
    }
  }
  // a suite's out is facade.sh's environment (`suiteEnv`), every other script's its --out; a suite's logs are written to
  // a short scratch directory (its session bus's socket lies there) and copied into the step's `logs/` at its end
  const args = [...stepArgs(step, { paths: { ...a, candidate: candidatePath }, gate: a.gate, pilot: a.pilot }), ...(step.kind === 'suite' ? [] : ['--out', join(dir, 'run')])];
  const script = stepScript(step, { pinned: Boolean(a.pinned) });
  record.argv = [script, ...args];
  // under /tmp itself, whatever TMPDIR names (a macOS TMPDIR alone is about 50 bytes): the socket's 108 bytes
  const suiteLogs = step.kind === 'suite' ? mkdtempSync('/tmp/cua171-gl-') : null;
  const suiteVars = suiteLogs ? suiteEnv({ candidate: candidatePath, dir, gate: a.gate, logs: suiteLogs, pinned: Boolean(a.pinned), device: a.device }) : null;
  if (suiteVars) record.env = suiteVars;
  record.started = new Date().toISOString();
  writeRecord(dir, record);
  const out = labelledLog(join(dir, 'stdout.log'), label);
  const err = labelledLog(join(dir, 'stderr.log'), label);
  let result;
  try {
    if (step.display === 'own') {
      const { DISPLAY, XAUTHORITY, ...own } = env;
      // a suite is facade.sh's part, its out and logs in the step's directory, each with the label beside it
      const suite = step.kind === 'suite';
      if (suite) {
        for (const sub of ['run', 'logs']) {
          mkdirSync(join(dir, sub), { recursive: true });
          writeFileSync(join(dir, sub, 'LABEL'), `${label}\n`);
        }
      }
      const [command, argv] = suite ? ['bash', [join(root, script), ...args]] : [process.execPath, [join(root, script), ...args]];
      const childEnv = suite ? { ...own, ...suiteVars } : own;
      const child = spawn(command, argv, { cwd: root, env: childEnv, stdio: ['ignore', out, err] });
      const forward = (signal) => child.kill(signal);
      process.on('SIGTERM', forward);
      process.on('SIGINT', forward);
      result = await new Promise((done) => child.once('exit', (code, signal) => done({ code, signal, clean: true })));
      process.off('SIGTERM', forward);
      process.off('SIGINT', forward);
    } else {
      const { runOnPrivateDisplay } = await import('./display.mjs');
      result = await runOnPrivateDisplay({ dir, label, script: join(root, script), args, cwd: root, env, out, err });
    }
  } finally {
    if (store) rmSync(store, { recursive: true, force: true });
    if (suiteLogs) {
      // the logs kept with the step, the sockets left behind (a bus's socket is no log)
      cpSync(suiteLogs, join(dir, 'logs'), { recursive: true, filter: (src) => !lstatSync(src).isSocket() });
      rmSync(suiteLogs, { recursive: true, force: true });
    }
  }
  const exit = result.code === 0 && result.clean ? 0 : result.code === 2 ? 2 : 1;
  Object.assign(record, { finished: new Date().toISOString(), exit, child_exit: result.code ?? result.signal, ...(step.display === 'private' ? { display_watchdog: result.clean ? 'clean' : result.reason } : {}) });
  writeRecord(dir, record);
  appendFileSync(join(dir, 'stdout.log'), `${label}: ${step.name} exit ${exit}\n`);
  return exit;
}

const noEngine = (a) => `no engine at ${a.candidate}: install it in the run home first, CUA_HOME=${a.pinned} node bin/cua.mjs install --engine`;

/**
 * `check --pinned <home>`: the pinned rule alone on the home's engine (candidate.mjs), its copy removed after. Answers the
 * record; a refusal is thrown as the rule's `CandidateRefused`. The facade suites' runner checks each of its homes so.
 */
export async function checkPinned(a, { root = REPO_ROOT, prepare = prepareCandidate } = {}) {
  if (!existsSync(a.candidate)) throw new GateRefused(noEngine(a));
  const store = mkdtempSync(join(tmpdir(), 'cua171-candidate-'));
  try {
    return (await prepare({ source: a.candidate, gate: 'pinned', dir: store, root })).record;
  } finally {
    rmSync(store, { recursive: true, force: true });
  }
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
    else if (a.mode === 'check') {
      const record = await checkPinned(a);
      process.stdout.write(`${gateLabel(record.gate)}: ${a.candidate}\n${candidateLine(record)}\n${JSON.stringify(record)}\n`);
    }
    else process.exit(await runStep(a));
  } catch (error) {
    if (error instanceof GateRefused || error.name === 'CandidateRefused') {
      process.stderr.write(`gate step refused: ${error.message}\n`);
      process.exit(2);
    }
    throw error;
  }
}
