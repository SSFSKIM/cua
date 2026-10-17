#!/usr/bin/env node
// The time-zone probe (#115 acceptance 13, #138): how often a sandboxed Node's first host-local-time use hangs, under a
// given sandbox launcher and role. It replaces the history-hang probe
// (docs/evidence/2026-10-14-own-repl-host-parity/m2/history-hang/sandbox-tz-probe.sh), which hard-coded the installed
// Codex CLI.
//
//   node scripts/sandbox-probe/tz-probe.mjs --launcher codex|cua --role kernel|worker [--runs 80] [--bound-ms 15000]
//     [--notification-center deny|allow] [--codex <path>] [--node <path>] [--out <result.json>]
//   node scripts/sandbox-probe/tz-probe.mjs verdict <control.json> <grant.json>     (exits 0 only for keep)
//
// Each run is one fresh child: a plain Node script (childScript), not cua's runtime, which settles the zone as it loads
// (src/repl-host/worker-runtime.mjs). It reproduces the demonstrated trigger (history-hang README, "Sandboxed
// reproduction"): 200 vm.createContext calls, then its first host-local-time use, a Date built from local components and
// converted to ISO, about 2.5 s into the process, with no TZ in its environment. The child is started under the launcher
// in its own process group, from a fresh scratch directory that is its working directory, and bounded (15 s by
// default). A run is `completed` (the child reported its local-time use and exited 0 within the bound), `hung` (the bound
// was reached; the whole process group and anything still carrying the run's tag are killed) or `launcher-failure`
// (anything else: the launcher refused, or the child exited without its report). Runs are sequential.
//
// Launchers:
//   codex  the signed Codex CLI's `codex sandbox`, with the policy cua's own host passes it today (src/runtime/sandbox.mjs
//          sandboxPolicy/sandboxArgs, scoped: root read, the working directory and TMPDIR writable, no network, the
//          child's Node directory read). That CLI renders one profile for both roles. --codex names it; by default it is
//          the installed runtime's (CUA_HOME or the default home). It cannot carry the notification_center grant.
//   cua    cua's own launcher, src/sandbox (M1): the role's profile, and with --notification-center allow the one
//          `(allow mach-lookup (global-name "com.apple.system.notification_center"))` line M4 measures. M1 wires the slot
//          (cuaLaunch); until then it is refused.
//
// `verdict` applies acceptance 13 to one role's pair of results: the grant is kept only if the denying control hung at
// least once and the grant's runs neither hung nor failed to launch; a control that did not hang is inconclusive.
import {spawn, execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {arch, homedir, platform, tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {sandboxArgs, sandboxPolicy, sandboxState} from '../../src/runtime/sandbox.mjs';

export const MARKER = 'CUA_TZ_PROBE ';
export const LAUNCHERS = ['codex', 'cua'];
export const ROLES = ['kernel', 'worker'];
export const NOTIFICATION_CENTER = ['deny', 'allow'];
const CONTEXTS = 200, TARGET_MS = 2500, OUTPUT_CAP = 64 * 1024;

// The child's source. `targetMs` (when its local-time use happens, in ms since the process started) exists for the
// probe's own tests; the probe runs at TARGET_MS.
export function childScript({contexts = CONTEXTS, targetMs = TARGET_MS} = {}) {
  return `import vm from 'node:vm';
for (let i = 0; i < ${contexts}; i++) vm.createContext({});
setTimeout(() => {
  const localTimeAtMs = performance.now();
  new Date(2026, 9, 17, 12).toISOString();
  process.stdout.write(${JSON.stringify(MARKER)} + JSON.stringify({contexts: ${contexts}, localTimeAtMs}) + '\\n');
}, Math.max(0, ${targetMs} - performance.now()));
`;
}

// The signed CLI's invocation of `node script tag`, as cua's own host makes it today, in the probe's scratch `cwd`.
// The environment is the minimum it needs (no TZ): a fixed PATH, TMPDIR and CODEX_HOME inside the scratch directory.
export function codexLaunch({codex, node, script, tag, cwd, home, notificationCenter}) {
  if (notificationCenter !== 'deny') throw new Error('the Codex CLI\'s profile cannot carry the notification_center grant; --notification-center allow needs --launcher cua');
  const policy = sandboxPolicy(sandboxState('scoped', cwd), {readPaths: [dirname(node)]});
  return {command: codex, args: sandboxArgs(policy, [node, script, tag]), cwd,
    env: {HOME: home, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', TMPDIR: join(cwd, 'tmp'), CODEX_HOME: join(cwd, 'codex-home')},
    profile: 'the Codex CLI\'s scoped profile (one profile for both roles)'};
}

// cua's own launcher: the slot M1 wires to src/sandbox (sandboxedLaunch with the role, and the notification_center
// line for --notification-center allow from M4). Same parameters as codexLaunch, less `codex`; -> {command, args, env,
// cwd, profile}.
export function cuaLaunch() {
  throw new Error('--launcher cua is cua\'s own launcher in src/sandbox, which M1 adds; until then the probe runs only --launcher codex');
}

// -> {outcome, localTimeAtMs?} for one finished or bounded run.
export function classify({code, signal, stdout = '', timedOut, error}) {
  if (timedOut) return {outcome: 'hung'};
  const line = String(stdout).split('\n').find(l => l.startsWith(MARKER));
  if (error || code !== 0 || signal || !line) return {outcome: 'launcher-failure'};
  return {outcome: 'completed', localTimeAtMs: JSON.parse(line.slice(MARKER.length)).localTimeAtMs};
}

// Processes still carrying `tag` in their command line (the child's argument), after killing them when `kill`.
function sweep(tag, {kill}) {
  if (kill) { try { execFileSync('pkill', ['-9', '-f', tag], {stdio: 'ignore'}); } catch {} }
  try { return execFileSync('pgrep', ['-f', tag], {encoding: 'utf8'}).trim().split('\n').filter(Boolean).length; } catch { return 0; }
}

function runOnce(launch, {boundMs, tag}) {
  return new Promise(done => {
    const started = performance.now();
    let stdout = '', stderr = '', timedOut = false, settled = false;
    const child = spawn(launch.command, launch.args, {cwd: launch.cwd, env: launch.env, stdio: ['ignore', 'pipe', 'pipe'], detached: true});
    const finish = facts => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      const leftover = sweep(tag, {kill: true});
      done({...classify({stdout, timedOut, ...facts}), ms: Math.round(performance.now() - started), code: facts.code ?? null, signal: facts.signal ?? null,
        ...(stderr.trim() ? {stderr: stderr.trim().slice(-300)} : {}), ...(facts.error ? {error: facts.error} : {}), leftover});
    };
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
      finish({});
    }, boundMs);
    child.stdout.on('data', chunk => { if (stdout.length < OUTPUT_CAP) stdout += chunk; });
    child.stderr.on('data', chunk => { if (stderr.length < OUTPUT_CAP) stderr += chunk; });
    child.once('error', error => finish({error: error.message}));
    child.once('close', (code, signal) => finish({code, signal}));
  });
}

const nodeVersion = node => { try { return execFileSync(node, ['--version'], {encoding: 'utf8', env: {PATH: '/usr/bin:/bin'}}).trim(); } catch { return null; } };
async function installedCodex() {
  const {defaultHome} = await import('../../src/runtime/layout.mjs');
  const {resolveRuntime} = await import('../../src/runtime/manifest.mjs');
  return resolveRuntime({home: defaultHome()}).paths.codexCli;
}

// Runs `runs` children under the launcher and role. -> the result: what ran, every run's outcome and the counts.
export async function probe({launcher, role, runs = 80, boundMs = 15_000, notificationCenter = 'deny', codex, node = process.execPath, out, targetMs = TARGET_MS, log = () => {}}) {
  if (!LAUNCHERS.includes(launcher)) throw new Error('--launcher must be codex or cua');
  if (!ROLES.includes(role)) throw new Error('--role must be kernel or worker');
  if (!NOTIFICATION_CENTER.includes(notificationCenter)) throw new Error('--notification-center must be deny or allow');
  for (const [name, value] of [['runs', runs], ['bound-ms', boundMs]]) if (!Number.isSafeInteger(value) || value < 1) throw new Error(`--${name} must be a positive integer`);
  if (launcher === 'codex' && notificationCenter !== 'deny') codexLaunch({notificationCenter});
  const launchOf = launcher === 'codex' ? codexLaunch : cuaLaunch;
  const codexPath = launcher === 'codex' ? resolve(codex ?? await installedCodex()) : null;
  const id = randomBytes(4).toString('hex'), tagOf = n => `cua-tz-probe-${id}-${n}`;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cua-tz-probe-')));
  const result = {probe: 'tz', schema: 1, launcher, role, notificationCenter, runs, boundMs, contexts: CONTEXTS, targetMs,
    platform: platform(), arch: arch(), node: {path: node, version: nodeVersion(node)}, ...(codexPath ? {codex: codexPath} : {}),
    tag: `cua-tz-probe-${id}`, scratch: dir, started: new Date().toISOString(), results: []};
  let finished = false;
  try {
    const script = join(dir, 'tz-child.mjs');
    writeFileSync(script, childScript({targetMs}));
    for (const sub of ['tmp', 'codex-home']) mkdirSync(join(dir, sub));
    for (let n = 1; n <= runs; n++) {
      const tag = tagOf(n);
      const launch = launchOf({codex: codexPath, node, script, tag, cwd: dir, home: homedir(), role, notificationCenter});
      result.profile ??= launch.profile;
      const outcome = await runOnce(launch, {boundMs, tag});
      result.results.push({run: n, ...outcome});
      log(`run ${n}/${runs}: ${outcome.outcome} (${outcome.ms} ms)`);
    }
    finished = true;
  } finally {
    result.leftovers = sweep(result.tag, {kill: true});
    rmSync(dir, {recursive: true, force: true});
    result.finished = new Date().toISOString();
    const count = outcome => result.results.filter(r => r.outcome === outcome).length;
    result.counts = {completed: count('completed'), hung: count('hung'), launcherFailure: count('launcher-failure')};
    // A probe stopped part way (a refused launcher, an interrupted run) leaves no result file to be read as a measurement.
    if (out && finished) writeFileSync(resolve(out), JSON.stringify(result, null, 2) + '\n');
  }
  return result;
}

// Acceptance 13's verdict on one role's denying control and its grant (results of the same launcher, role, runs and
// bound). -> {verdict: 'keep' | 'remove' | 'inconclusive', reason}.
export function tzVerdict(control, grant) {
  if (control?.notificationCenter !== 'deny' || grant?.notificationCenter !== 'allow') throw new Error('the control must be --notification-center deny and the grant --notification-center allow');
  for (const key of ['launcher', 'role', 'runs', 'boundMs']) if (control[key] !== grant[key]) throw new Error('the control and the grant must be runs of the same launcher, role, runs and bound');
  const c = control.counts, g = grant.counts;
  if (!(c.hung >= 1)) return {verdict: 'inconclusive', reason: `the denying control did not reproduce the hang (0 of ${control.runs}); the line is left out`};
  if (g.hung === 0 && g.launcherFailure === 0) return {verdict: 'keep', reason: `the control hung ${c.hung} of ${control.runs}; with the line, 0 hung and 0 launcher failures of ${grant.runs}`};
  return {verdict: 'remove', reason: `the control hung ${c.hung} of ${control.runs}; with the line, ${g.hung} hung and ${g.launcherFailure} launcher failures of ${grant.runs}`};
}

const integer = (value, name) => { const n = Number(value); if (!Number.isSafeInteger(n) || n < 1) throw new Error(`--${name} must be a positive integer`); return n; };
export async function main(argv = process.argv.slice(2)) {
  const {values, positionals} = parseArgs({args: argv, allowPositionals: true, options: {
    launcher: {type: 'string'}, role: {type: 'string'}, runs: {type: 'string', default: '80'}, 'bound-ms': {type: 'string', default: '15000'},
    'notification-center': {type: 'string', default: 'deny'}, codex: {type: 'string'}, node: {type: 'string'}, out: {type: 'string'}}});
  if (positionals[0] === 'verdict') {
    const [control, grant] = positionals.slice(1).map(file => JSON.parse(readFileSync(resolve(file), 'utf8')));
    if (!grant) throw new Error('verdict requires <control.json> <grant.json>');
    const verdict = tzVerdict(control, grant);
    console.log(JSON.stringify(verdict));
    return verdict.verdict === 'keep' ? 0 : 1;
  }
  if (positionals.length) throw new Error('Usage: tz-probe.mjs --launcher codex|cua --role kernel|worker [--runs N] [--bound-ms MS] [--notification-center deny|allow] [--codex PATH] [--node PATH] [--out FILE] | verdict <control.json> <grant.json>');
  const result = await probe({launcher: values.launcher, role: values.role, runs: integer(values.runs, 'runs'), boundMs: integer(values['bound-ms'], 'bound-ms'),
    notificationCenter: values['notification-center'], codex: values.codex, node: values.node ? resolve(values.node) : process.execPath, out: values.out,
    log: line => console.error(line)});
  console.log(JSON.stringify({launcher: result.launcher, role: result.role, notificationCenter: result.notificationCenter, runs: result.runs, counts: result.counts, leftovers: result.leftovers}));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }, error => { console.error(error.message); process.exitCode = 1; });
}
