#!/usr/bin/env node
// M4's gate runner (#171 M4, T18): the gate's steps (steps.mjs) listed, one printed, or one run, by name. It is a
// launcher above the harness, as the sittings' private-run.mjs scripts were, so it lives outside scripts/linux-engine-diff/:
// it starts Xvfb, Openbox, an xterm and node itself, which the harness's own source checks forbid any harness module.
//
//   node scripts/linux-engine-gate/gate.mjs --list [--pinned <home> | --candidate <file>] [--out <dir>] [--dev] [--pilot <n>]
//   node scripts/linux-engine-gate/gate.mjs print <step> (--pinned <home> | --candidate <file>) --out <dir> [--dev] [--pilot <n>] [--engine-stats]
//   node scripts/linux-engine-gate/gate.mjs run <step> (--pinned <home> | --candidate <file>) --out <dir> [--dev] [--pilot <n>] [--engine-stats]
//   node scripts/linux-engine-gate/gate.mjs check --pinned <home>
//   node scripts/linux-engine-gate/gate.mjs leftovers [--remove <dir> [--confirm]]
//
// After every step, whatever ended its process, the runner makes the end check (leftovers.mjs; rulings 721, 724): the
// `cua171-run-*` scratch the step left and every other run's, with their session buses, named in the step's record and
// left alone. `leftovers` makes it alone. Before every step the start check refuses to start on anything earlier runs
// left, naming it and its evidence, and removes nothing (leftovers.mjs, ruling 730, fix wave 3); `leftovers --remove
// <dir>` prints the proof that one may go and, given `--confirm`, removes it only when the proof holds. A step's unclean
// end (its run's own side) is in its record, and
// `summary --out <dir>` lists every step's. A :0 step is printed under the sitting launcher (sitting.mjs), which makes
// the end check and the sitting's all-clear however the sitting ends, and writes hold-sittings when the person's side
// is not clear.
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
// steps and here for the facade and suite steps, and labelled "acceptance on the pinned release". What runs is that
// installed file itself, never the check's copy, and every child gets CUA_HOME the run home (a `cua serve` the harness
// starts, a HOME of the run's too: pinned-home.mjs; the design session's ruling 708). The vendor builds follow the
// architecture, from that home's runtime. The facade suites run the one runner (suites.sh) with ENGINE=installed: it
// passes no engine and checks each of its own homes by the same rule, on the device the environment names (`DEVICE`,
// else this architecture's VM); on a `--candidate`, ENGINE=candidate names it, as M4's facade.sh did. `check --pinned <home>` runs the rule alone and prints its record. `--pinned --dev` takes the
// home's engine unchecked, as a development run; `--pinned <home> --pilot <n>` (no `--dev`) is a development run on the
// pinned release (M5's T4 round 2, task 87's finding 1): the pinned rule run inside the step, every record labelled
// "development run on the pinned release, not acceptance, never counted". A pilot takes no top-up (ruling 722), and its
// record lists what it left unjudged.
//
// Labels (the design session's condition): every directory and file a step writes carries "release gate" or
// "development run, not a release gate": the step's directory is named `<step>.release-gate` or
// `<step>.development-run[.pilot]`, its README.md and step.json open with the label, its logs' first line is the label,
// the private display's session rows carry it, and the harness's own rows and summary carry it (experiments.mjs,
// report.mjs).

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PINNED_DEVELOPMENT, REPO_ROOT, candidateLine, gateLabel, isCounted, isPinnedRule, prepareCandidate } from '../linux-engine-diff/candidate.mjs';
import { defaultScope, leftoverCheck, leftoverLines, removeLeftover, scratchDirs, startCheck, startRefusalText } from '../linux-engine-diff/leftovers.mjs';
// a test process reaches no real display (hermetic.mjs); the leftover checks' scope is never switched by it
import '../linux-engine-diff/hermetic.mjs';
import { pinnedEngine } from '../linux-engine-diff/pinned-home.mjs';
import { scratchRoot } from '../linux-engine-diff/scratch-root.mjs';
import { linuxEnginePath } from '../../src/runtime/linux-engine.mjs';
import { MAX_STEP_MINUTES, STEPS, runName, startsEnginesThroughHarness, stepArgs, stepLabel, stepNamed, stepScript, suiteEnv, totals } from './steps.mjs';

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
    // the current stable Chrome, extracted from Google's signed index into `<version>/root` with a `google-chrome`
    // wrapper in `<version>/bin`, `current` naming the version (the arm64 VM's T7 copy; task 117's on x64): the hold
    // canary's second Chrome (steps.mjs `canary`)
    chromeStable: join(HOME, '.local/share/cua-171/chrome-stable'),
    // the host lock's holder a step's command and record name, unless `--holder` names the executor's own
    holder: 'm5-gate',
    hold: join(HOME, '.local/share/cua-171/hold-sittings'),
  };
}
/**
 * The current stable Chrome's wrapper directory under `root` (`defaultsFor`'s `chromeStable`): `<root>/<current>/bin`,
 * holding an executable `google-chrome`. A canary on it refuses to start without one, never running on another Chrome.
 */
export function currentStableChrome(root) {
  const current = (() => {
    try {
      return readFileSync(join(root, 'current'), 'utf8').trim();
    } catch {
      return null;
    }
  })();
  const dir = current ? join(root, current, 'bin') : null;
  if (!dir || !existsSync(join(dir, 'google-chrome'))) throw new GateRefused(`no current stable Chrome at ${root} (its \`current\` and \`<version>/bin/google-chrome\`): the canary on it does not start`);
  return dir;
}

/** Task 50's guards for a `:0` step, as T19's sitting ran them (pointer-route/scripts): run71.sh and its guards. */
const GUARDS = 'docs/evidence/2026-10-28-own-linux-engine/m4/pointer-route/scripts';
/** The outer guard run71.sh runs under: M5's copy of wrap71.py (task 91, ruling 773), M4's left as the record of H. */
const WRAP71 = 'docs/evidence/2026-10-28-own-linux-engine/m5/guards/wrap71.py';
/** The TMPDIR run71.sh gives a `:0` step's run, as its `mktemp -d` template makes it: every one is this long. */
export const RUN71_TMPDIR = '/tmp/c71-XXXXXX';
/**
 * The decoy buses wrap71.py binds for a `:0` step, `<step dir>/decoy/<name>.sock`, and the longest path each may be: a
 * Unix socket's path is at most sun_path's 108 bytes, and a client that adds its terminating NUL (libdbus) needs one
 * of them, so a longer decoy either fails to bind or binds where a run process's client could not connect to it.
 */
export const DECOYS = ['session', 'a11y'];
export const UNIX_PATH_MAX = 107;

/**
 * What would make wrap71 stop a `:0` step mid-step, or run it unguarded, that the step's own command decides (M5's T4,
 * arm64 round, items (b) and (d)), as reasons; none when there is nothing. `run`: the step's run name; `dir`: its
 * directory.
 * - the run's scratch (scenes.mjs `scratchRoot`) must stay under run71.sh's TMPDIR: the run's Chrome lives in it, and
 *   wrap71 stops a run Chrome whose home is outside that TMPDIR (the arm64 pilot's V1, 2026-11-18 04:35Z);
 * - every decoy bus's path must fit (`UNIX_PATH_MAX`): the arm64 pilot's decoys failed to bind and the guard ran on.
 */
export function zeroStepProblems({ run, dir }) {
  const problems = [];
  if (scratchRoot(run, RUN71_TMPDIR) !== RUN71_TMPDIR) problems.push(`run ${run}: the run's scratch would leave the TMPDIR run71.sh gives it (${RUN71_TMPDIR}), since a gedit title would not stay whole under it; the guard would stop the run's Chrome there. Give it a shorter run name`);
  for (const name of DECOYS) {
    const path = join(dir, 'decoy', `${name}.sock`);
    const bytes = Buffer.byteLength(path);
    if (bytes > UNIX_PATH_MAX) problems.push(`the ${name} decoy bus ${path} is ${bytes} bytes, past the ${UNIX_PATH_MAX} a Unix socket's path can take: give the step a shorter --out`);
  }
  return problems;
}

/**
 * A step directory as run71.sh takes it (`realpath -m`): its deepest existing ancestor resolved through its symlinks,
 * the rest of the path as given. The decoys lie under this path, so print measures them there (fix wave 1).
 */
export function resolvedAsRun71(dir) {
  const parts = [];
  let at = resolve(dir);
  while (!existsSync(at) && dirname(at) !== at) {
    parts.unshift(basename(at));
    at = dirname(at);
  }
  return join(realpathSync(at), ...parts);
}

/** The :0 sitting's outer launcher, relative to the checkout. */
const SITTING = 'scripts/linux-engine-gate/sitting.mjs';
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
  gate.mjs print <step> (--pinned <home> | --candidate <file>) --out <dir> [--dev] [--pilot <n>] [--engine-stats]
  gate.mjs run <step> (--pinned <home> | --candidate <file>) --out <dir> [--dev] [--pilot <n>] [--engine-stats]
  gate.mjs check --pinned <home>
  gate.mjs leftovers [--remove <dir> [--confirm]]
  gate.mjs summary --out <dir>
  options: [--vendor <bin>] [--newest <bin>] [--vendor-js <@oai/sky dir>] [--holder <name>]
  --pinned <home>: the CUA_HOME of a run home whose cua install --engine placed the pinned engine (acceptance on the pinned release)`;

/**
 * The runner's arguments. `arch` and `env` are the machine's: the vendor paths follow `arch` (from the pinned home's
 * runtime when `--pinned` names one), and the suites' device is `env.DEVICE`, else `arch`'s VM. A flag still wins.
 */
export function parseGateArgs(argv, { arch = process.arch, env = process.env } = {}) {
  const a = { mode: null, step: null, gate: true, pilot: null, candidate: null, pinned: null, out: null, remove: null, confirm: false };
  const given = {};
  const flags = { '--candidate': 'candidate', '--pinned': 'pinned', '--out': 'out', '--vendor': 'vendor', '--newest': 'newest', '--vendor-js': 'vendorJs', '--holder': 'holder' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      if (argv[i + 1] === undefined) throw new GateRefused(`${flag} needs a value\n${USAGE}`);
      return argv[++i];
    };
    if (flag === '--list') a.mode = 'list';
    else if (flag === '--remove') a.remove = resolve(value());
    else if (flag === '--confirm') a.confirm = true;
    else if (flag === '--dev') a.gate = false;
    // every cua lane's engine with --stats, its settle counter recorded (ruling 834): refused below on a counted run
    else if (flag === '--engine-stats') a.engineStats = true;
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
    else if (!a.mode && flag === 'leftovers') a.mode = 'leftovers';
    else if (!a.mode && flag === 'summary') a.mode = 'summary';
    else throw new GateRefused(`unknown argument ${flag}\n${USAGE}`);
  }
  if (!a.mode) throw new GateRefused(USAGE);
  if (a.confirm && !a.remove) throw new GateRefused(`--confirm needs --remove <dir>\n${USAGE}`);
  if (a.remove && a.mode !== 'leftovers') throw new GateRefused(`--remove belongs to leftovers\n${USAGE}`);
  if (a.mode === 'leftovers') return a;
  if (a.mode === 'summary') {
    if (!given.out) throw new GateRefused(`summary needs --out <dir>\n${USAGE}`);
    return { ...a, out: given.out };
  }
  if (given.pinned && given.candidate) throw new GateRefused('give --pinned or --candidate, not both: acceptance takes the engine a run home\'s cua install placed');
  Object.assign(a, defaultsFor(arch, given.pinned), { device: env.DEVICE || DEVICES_BY_ARCH[arch] || null }, given);
  if (a.pinned) {
    a.candidate = linuxEnginePath(a.pinned);
    // a pilot on the pinned rule is a development run on the pinned release, never counted (task 87's finding 1)
    if (a.gate) a.gate = a.pilot ? PINNED_DEVELOPMENT : 'pinned';
  }
  if (a.mode === 'check') {
    if (!a.pinned) throw new GateRefused(`check needs --pinned <home>\n${USAGE}`);
    if (!a.gate) throw new GateRefused('check is the pinned rule itself: no --dev');
    return a;
  }
  if (a.engineStats && isCounted(a.gate)) throw new GateRefused(`--engine-stats is a development run's or a pilot's: --stats adds reads to a paste and a line after every request, so a counted run (${gateLabel(a.gate)}) never takes it; give --dev, or --pilot with --pinned`);
  if (a.engineStats && !['print', 'run'].includes(a.mode)) throw new GateRefused('--engine-stats belongs to print and run');
  if (a.gate && a.pilot && a.gate !== PINNED_DEVELOPMENT) throw new GateRefused('a pilot is never a release gate, nor acceptance: give --dev with --pilot, or --pinned <home> for a development run on the pinned release');
  if (a.mode !== 'list') {
    if (!STEPS.some((s) => s.name === a.step)) throw new GateRefused(`no gate step ${a.step}; the steps: ${STEPS.map((s) => s.name).join(', ')}`);
    if (a.engineStats && !startsEnginesThroughHarness(stepNamed(a.step))) throw new GateRefused(`--engine-stats: ${a.step} does not start its engines through engine.mjs (cua's service or cua serve starts them), so the opt-in cannot reach them`);
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

const runsFrom = (gate) => (gate === 'pinned' ? 'acceptance on the pinned release runs from a clean git checkout' : gate === PINNED_DEVELOPMENT ? 'a development run on the pinned release runs from a clean git checkout (the pinned rule)' : "a gate runs from a clean git checkout at the candidate's commit");

const quote = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${String(s).replace(/'/g, "'\\''")}'`);
const line = (argv) => argv.map(quote).join(' ');

/** A step's directory: the out root's `<step>.<label slug>`. */
export const stepDir = (step, a) => join(a.out, `${step.name}.${stepLabel(a).slug}`);

/** The command that launches a step, under the host lock: run71.sh's guarded sitting for `:0`, else this runner. */
export function launchCommand(step, a, root = REPO_ROOT) {
  const lock = [a.locked, a.holder];
  if (step.display === ':0') {
    const args = stepArgs(step, { paths: { ...a, candidate: a.candidate ?? '<candidate>' }, gate: a.gate, pilot: a.pilot, engineStats: a.engineStats });
    const dir = a.out ? stepDir(step, a) : '<out>/<step>';
    // under the sitting launcher (sitting.mjs): its refusal while hold-sittings exists, the start check, and the end check
    // and the all-clear however the sitting ends (review finding 3, ruling 730)
    return line([...lock, process.execPath, join(root, SITTING), '--dir', dir, '--hold', a.hold, '--terminal', step.kind === 'verdict' ? 'end' : 'experiment-summary', '--', 'env', `WRAP=${join(root, WRAP71)}`, join(root, GUARDS, 'run71.sh'), dir, root, ...args]);
  }
  const engine = a.pinned ? ['--pinned', a.pinned] : ['--candidate', a.candidate ?? '<candidate>'];
  return line([...lock, process.execPath, fileURLToPath(import.meta.url), 'run', step.name, ...engine, '--out', a.out ?? '<out>', ...(a.gate ? [] : ['--dev']), ...(a.pilot ? ['--pilot', String(a.pilot)] : []), ...(a.engineStats ? ['--engine-stats'] : [])]);
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
    ...(r.unproved ? [`- unproved (declared gaps, not passes): ${r.unproved.length || 'none'}`, ...r.unproved.map((l) => `  - ${l}`)] : []),
    ...(r.unjudged ? [`- unjudged (a pilot takes no top-up; not passes): ${r.unjudged.length || 'none'}`, ...r.unjudged.map((l) => `  - ${l}`)] : []),
    ...(r.end_check ? endCheckText(r.end_check) : []),
    ...(r.unclean ? (r.unclean.length ? [`- unclean end (the run's own side, not a verdict failure): ${r.unclean.length}`, ...r.unclean.map((l) => `  - ${l}`)] : ["- end: clean (nothing left on the run's own side)"]) : []),
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
  // a :0 step the guard would stop mid-step, or run unguarded, for its command alone: refused before launch
  if (step.display === ':0') {
    const problems = zeroStepProblems({ run: runName(step, a), dir: resolvedAsRun71(dir) });
    if (problems.length) throw new GateRefused(`${step.name} on :0 would not run whole under its guard: ${problems.join('; ')}`);
  }
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
export async function runStep(a, { root = REPO_ROOT, git, held = () => existsSync(a.hold), loadRunning = () => pgrep('stress-ng'), xprobe = join(root, XPROBE_BUILT), prepare = prepareCandidate, pinned = pinnedEngine, spawnChild = spawn, privateDisplay = null, leftovers = defaultScope(), start: check = startCheck } = {}) {
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
  // what earlier runs left on their own side (ruling 730): the step refuses to start on any of it, naming it and its
  // evidence; nothing is removed (`leftovers --remove` is the explicit command)
  const start = check({ ...leftovers });
  if (start.refused.length) throw new GateRefused(startRefusalText(start.refused));
  mkdirSync(dir, { recursive: true });
  const { label } = stepLabel(a);
  const record = stepRecord(step, a, { root, checkout, command: launchCommand(step, a, root) });
  // the harness's out directory, before any script writes in it (services.mjs's Desktop logs there at its start)
  mkdirSync(join(dir, 'run'), { recursive: true });
  // on the pinned release CUA_HOME is the run home, so nothing a step starts resolves the person's default cua home; a
  // service the harness starts runs in a HOME of the run's too (pinned-home.mjs)
  const firefoxPath = existsSync(a.firefoxDir) ? `${a.firefoxDir}:${process.env.PATH}` : process.env.PATH;
  // a canary on the current stable Chrome: its wrapper's directory first on PATH, or the step refuses (steps.mjs `canary`)
  const chromeDir = step.chrome === 'current-stable' ? currentStableChrome(a.chromeStable) : null;
  const env = { ...process.env, PATH: chromeDir ? `${chromeDir}:${firefoxPath}` : firefoxPath, ...(a.pinned ? { CUA_HOME: a.pinned } : {}) };
  if (step.kind === 'canary') {
    record.chrome = (() => {
      try {
        return execFileSync('google-chrome', ['--version'], { env, encoding: 'utf8', timeout: 20000 }).trim();
      } catch (error) {
        return `unread: ${error.message.split('\n')[0]}`;
      }
    })();
    writeRecord(dir, record);
  }
  // the facade step's script has no candidate checks of its own: a gate's runs here, its copy removed at the end; on
  // the pinned release the copy is the check's alone, and the step runs the installed engine cua's selection picks
  let store = null;
  let candidatePath = a.candidate;
  if (['facade', 'suite'].includes(step.kind) && a.gate) {
    store = mkdtempSync(join(tmpdir(), 'cua171-candidate-'));
    try {
      const prepared = await prepare({ source: a.candidate, gate: a.gate, dir: store, root });
      candidatePath = isPinnedRule(a.gate) ? pinned(a.candidate, prepared.record).cua : prepared.path;
      record.candidate.record = prepared.record;
    } catch (error) {
      rmSync(store, { recursive: true, force: true });
      throw error;
    }
  }
  // a suite's out is suites.sh's environment (`suiteEnv`), every other script's its --out; a suite's logs are written to
  // a short scratch directory (its session bus's socket lies there) and copied into the step's `logs/` at its end
  const args = [...stepArgs(step, { paths: { ...a, candidate: candidatePath }, gate: a.gate, pilot: a.pilot, engineStats: a.engineStats }), ...(step.kind === 'suite' ? [] : ['--out', join(dir, 'run')])];
  const script = stepScript(step);
  record.argv = [script, ...args];
  // under /tmp itself, whatever TMPDIR names (a macOS TMPDIR alone is about 50 bytes): the socket's 108 bytes
  const suiteLogs = step.kind === 'suite' ? mkdtempSync('/tmp/cua171-gl-') : null;
  const suiteVars = suiteLogs ? suiteEnv({ candidate: candidatePath, dir, gate: a.gate, logs: suiteLogs, pinned: Boolean(a.pinned), device: a.device }) : null;
  if (suiteVars) record.env = suiteVars;
  // the scratch there before the step: every other run's, whatever the step leaves (the end check, below)
  const before = new Set(scratchDirs(leftovers.roots).map((d) => d.dir));
  record.started = new Date().toISOString();
  writeRecord(dir, record);
  const out = labelledLog(join(dir, 'stdout.log'), label);
  const err = labelledLog(join(dir, 'stderr.log'), label);
  let result;
  try {
    if (step.display === 'own') {
      const { DISPLAY, XAUTHORITY, ...own } = env;
      // a suite is suites.sh's part, its out and logs in the step's directory, each with the label beside it
      const suite = step.kind === 'suite';
      if (suite) {
        for (const sub of ['run', 'logs']) {
          mkdirSync(join(dir, sub), { recursive: true });
          writeFileSync(join(dir, sub, 'LABEL'), `${label}\n`);
        }
      }
      const [command, argv] = suite ? ['bash', [join(root, script), ...args]] : [process.execPath, [join(root, script), ...args]];
      const childEnv = suite ? { ...own, ...suiteVars } : own;
      const child = spawnChild(command, argv, { cwd: root, env: childEnv, stdio: ['ignore', out, err] });
      const forward = (signal) => child.kill(signal);
      process.on('SIGTERM', forward);
      process.on('SIGINT', forward);
      result = await new Promise((done) => child.once('exit', (code, signal) => done({ code, signal, clean: true })));
      process.off('SIGTERM', forward);
      process.off('SIGINT', forward);
    } else {
      const runOnPrivateDisplay = privateDisplay ?? (await import('./display.mjs')).runOnPrivateDisplay;
      result = await runOnPrivateDisplay({ dir, label, script: join(root, script), args, cwd: root, env, out, err });
    }
  } finally {
    // the end check (rulings 721, 724), made here, after the step's process ended however it ended: a harness killed
    // past its own cleanup still gets one. Its findings are named, never removed or signalled
    record.end_check = stepEndCheck(before, leftovers);
    writeRecord(dir, record);
    if (store) rmSync(store, { recursive: true, force: true });
    if (suiteLogs) {
      // the logs kept with the step, the sockets left behind (a bus's socket is no log)
      cpSync(suiteLogs, join(dir, 'logs'), { recursive: true, filter: (src) => !lstatSync(src).isSocket() });
      rmSync(suiteLogs, { recursive: true, force: true });
    }
  }
  const exit = result.code === 0 && result.clean ? 0 : result.code === 2 ? 2 : 1;
  Object.assign(record, { finished: new Date().toISOString(), exit, child_exit: result.code ?? result.signal, ...(step.display === 'private' ? { display_watchdog: result.clean ? 'clean' : result.reason } : {}) });
  // a series the comparison reports unproved under a declared gap (R2, F8a) is the step's record, never inferred from
  // its exit status: the suites runner writes them, and the step's README and step.json list them
  const unproved = join(dir, 'run', 'baseline', 'unproved.txt');
  if (existsSync(unproved)) record.unproved = readFileSync(unproved, 'utf8').split('\n').filter(Boolean);
  // what a pilot left unjudged (ruling 722), never a pass: the harness's end or summary row, or R2's list
  if (a.pilot) record.unjudged = pilotUnjudged(dir);
  // the step's unclean end (ruling 730, part (a)): what its run recorded on its own side, and what the step left
  record.unclean = stepUnclean(dir, record.end_check);
  writeRecord(dir, record);
  appendFileSync(join(dir, 'stdout.log'), `${label}: ${step.name} exit ${exit}\n`);
  return exit;
}

/** A step's harness rows (`run/results.jsonl`), each that reads. */
function harnessRows(dir) {
  const results = join(dir, 'run', 'results.jsonl');
  if (!existsSync(results)) return [];
  return readFileSync(results, 'utf8').split('\n').filter(Boolean).flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
}

/**
 * A step's unclean end (ruling 730, part (a)), never a verdict failure: what its run's end recorded on its own side
 * (the end or summary row's `desktop.unclean`), each scratch directory the step left (the end check's `left_by_step`) and
 * each session-bus process of one.
 */
export function stepUnclean(dir, endCheck) {
  const own = harnessRows(dir).filter((r) => ['end', 'experiment-summary'].includes(r.kind)).flatMap((r) => r.desktop?.unclean ?? []);
  return [...own, ...endCheckUnclean(endCheck)];
}

/** What a step's end check shows it left on its own side: each scratch directory it left, and their session buses. */
export function endCheckUnclean(endCheck) {
  const left = endCheck?.left_by_step ?? [];
  const buses = (endCheck?.buses ?? []).filter((b) => left.some((d) => d.dir === b.dir));
  return [...left.map((d) => `its scratch left behind: ${d.dir}`), ...buses.map((b) => `a session bus of it still runs: pid ${b.pid} ${b.program}`)];
}

/**
 * The gate's summary of an out root (`gate.mjs summary --out <dir>`): every step's label, exit, unclean end and, for a
 * :0 step, its sitting's all-clear (sitting.mjs), so T5's and T7's READMEs list every unclean end. Markdown.
 */
export function gateSummary(out) {
  const order = (name) => {
    const i = STEPS.findIndex((s) => s.name === name);
    return i < 0 ? STEPS.length : i;
  };
  const dirs = readdirSync(out).filter((d) => existsSync(join(out, d, 'step.json'))).sort((x, y) => order(x.split('.')[0]) - order(y.split('.')[0]) || x.localeCompare(y));
  const lines = ['| step | label | exit | unclean end | :0 all-clear |', '|---|---|---:|---|---|'];
  let unclean = 0;
  for (const d of dirs) {
    const r = JSON.parse(readFileSync(join(out, d, 'step.json'), 'utf8'));
    const clear = existsSync(join(out, d, 'all-clear.json')) ? JSON.parse(readFileSync(join(out, d, 'all-clear.json'), 'utf8')) : null;
    const left = [...(r.unclean ?? []), ...(clear?.run ?? [])];
    if (left.length) unclean += 1;
    const exit = r.exit ?? clear?.exit ?? '–';
    const zero = clear ? (clear.clear ? 'clear' : `**not clear**: ${clear.person.join('; ')}`) : '–';
    lines.push(`| ${r.step} | ${r.label}${r.pilot ? ' (pilot)' : ''} | ${exit} | ${left.length ? `**${left.length}**: ${left.join('; ')}` : 'clean'} | ${zero} |`);
  }
  lines.push('', `Unclean ends: ${unclean} of ${dirs.length} steps (the run's own side, never a verdict failure; the next run's start check refuses to start on what each left; \`gate.mjs leftovers --remove <dir> --confirm\` removes it once its proof holds).`);
  return lines.join('\n');
}

/**
 * What a pilot step left unjudged, as its run wrote it: the harness's last `end` (a verdict run) or `experiment-summary`
 * row's `unjudged` in `run/results.jsonl`, or the suites runner's `run/baseline/unjudged.txt` (R2).
 */
function pilotUnjudged(dir) {
  const listed = join(dir, 'run', 'baseline', 'unjudged.txt');
  if (existsSync(listed)) return readFileSync(listed, 'utf8').split('\n').filter(Boolean);
  const results = join(dir, 'run', 'results.jsonl');
  if (!existsSync(results)) return [];
  const rows = readFileSync(results, 'utf8').split('\n').filter(Boolean).flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
  return rows.filter((r) => ['end', 'experiment-summary'].includes(r.kind)).flatMap((r) => r.unjudged ?? []);
}

/**
 * A step's end check (leftovers.mjs): every `cua171-run-*` directory once the step's process has ended, split into those
 * the step left (`left_by_step`, not there before it: its own cleanup did not finish) and those that were (`foreign`,
 * another run's), with the session-bus processes of each. `{left_by_step, foreign, buses, clear}`; a finding, never a
 * failure, and nothing is touched.
 */
export function stepEndCheck(before, options = {}) {
  const check = leftoverCheck(options);
  return { left_by_step: check.dirs.filter((d) => !before.has(d.dir)), foreign: check.dirs.filter((d) => before.has(d.dir)), buses: check.buses, clear: check.clear };
}

/** The end check in the step's README: the all-clear, or each finding. */
function endCheckText(e) {
  if (e.clear) return ['- end check: clear (no cua171-run-* directory or session bus of one)'];
  const of = (dirs) => ({ dirs, buses: e.buses.filter((b) => dirs.some((d) => d.dir === b.dir)) });
  const left = leftoverLines(of(e.left_by_step)).map((l) => l.replace(/^a cua171-run-\* directory not this run's, left alone: /, 'left by this step: '));
  // the buses whose directory neither list holds (gone, or outside the roots): named too
  const orphans = e.buses.filter((b) => ![...e.left_by_step, ...e.foreign].some((d) => d.dir === b.dir));
  const lines = [...left, ...leftoverLines(of(e.foreign)), ...leftoverLines({ dirs: [], buses: orphans })];
  return [`- end check (findings, left alone): ${e.left_by_step.length + e.foreign.length + e.buses.length}`, ...lines.map((l) => `  - ${l}`)];
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
    else if (a.mode === 'summary') process.stdout.write(`${gateSummary(a.out)}\n`);
    else if (a.mode === 'leftovers' && a.remove) {
      // the explicit removal: the proof first; exit 0 when removed or when it holds without --confirm, 2 when refused
      const result = removeLeftover(a.remove, { confirm: a.confirm });
      process.stdout.write(`${result.text}\n`);
      process.exit(result.proof.holds ? 0 : 2);
    }
    else if (a.mode === 'leftovers') {
      // the end check alone (a :0 sitting's all-clear): exit 0 when clear, 1 with findings
      const check = leftoverCheck();
      const lines = leftoverLines(check);
      process.stdout.write(`end check: ${check.clear ? 'clear' : `${lines.length} finding${lines.length === 1 ? '' : 's'}, left alone`}\n${lines.map((l) => `${l}\n`).join('')}`);
      process.exit(check.clear ? 0 : 1);
    }
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
