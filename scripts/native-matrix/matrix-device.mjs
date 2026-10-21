// The device side of the native matrix (scripts/native-matrix.mjs; docs/doperpowers/specs/2026-10-18-own-native-engine-
// design.md, Verification system parts 4 and 5): run from the harness checkout on the Mac that shows the scenes, over
// ssh, one JSON line on stdout per command (exit 1 with {error} when it fails). The rest of the run's device steps are
// the live hold's (./live-device.mjs begin, watch, recover) and the scenes' (scripts/repl-parity/scenes-mac.mjs).
// Every command that reads or changes the screen answers `at`, the device clock around it, so the run charges each
// activation the watcher sees to the step it fell in (./oracle.mjs accountActivations).
//
//   compile --run <dir>
//       the two window readers (scripts/accept/front-window.swift, ./system-windows.swift) compiled once into the run
//       directory and reused by every read after (an interpreted read costs seconds)
//   read --run <dir> --watcher <pid> [--focus <pid,x,y,w,h>]
//       the oracle's reading (./oracle.mjs ownedReading): the frontmost application and the top on-screen window, the
//       run's processes by pid and any other application by bundle id only; whether the activation watcher <pid> still
//       runs (`watch-activations` of the approved bundle), so a row's coverage is proven at both its ends; with --focus,
//       the approved bundle's `--probe focus` naming that window (one of the run's)
//   step <scenes-mac.mjs arguments>
//       one scenes command (activate, down) timed on the device clock -> {answer, at}
//   alerts baseline|check --run <dir>
//       the paste rows' system-alert watch (./live-checks.mjs alertWatch, the live paste check's): the screen's windows
//       at the baseline kept in the run directory (numbers and owners only), then each check against it -> {abort, export}
//       (sanitized: alert processes' bundle ids and layers, title keywords, counts); no alert's text is ever read
//   launched intent <scene> --run <dir>
//       journaled before a launch row's act is sent: the scene's bundle id, the device's time and the pids of that
//       bundle running at that moment -> {at, pids}. A controller that dies during or after the act leaves this, and
//       `launched quit` takes any process of the bundle started at or after that time and not in the snapshot as the
//       run's (the scenes' preflight refuses a foreign instance of the fixture, so such a process is the run's)
//   launched record <scene> --run <dir> --since <unix ms>
//       the app a launch row's engine brought up, identified at once (a process of the scene's bundle id the run's
//       scenes do not record, launched at or after --since; exactly one) and journaled with its start time in the run
//       directory (LAUNCHED_FILE), replacing the scene's intent -> {recorded, pid, candidates}
//   launched quit --run <dir>
//       every journaled launch that is still the same process (pid and start time), and every process an intent names
//       now, sent SIGTERM and awaited; the journal keeps what did not quit and every intent (its request may still be in
//       flight) -> {quit, remaining, gone, pending}. The run calls it after each launch row and before the put-back.
//   launched settle --run <dir>
//       once the live hold's recovery has stopped the serve and the engine (the work that could still launch): what the
//       journal names quit as it appears until none has appeared for 3 s, then the intents cleared; one still appearing
//       after 20 s keeps its intent -> {quit, remaining, pending, waitedMs}. The run and `native-matrix.mjs cleanup`
//       call it after the recovery, so a controller that died before the launched app appeared never strands it.
//   windowless up --run <dir>
//       the windowless app of the "app with no window" refusal: a stay-open AppleScript applet with no window and no
//       reopen handler (built once, ad hoc signed, its own bundle id), launched in the background and journaled as a
//       launch -> {pid, app}
//
// What leaves the device: the run's own pids, bounds and window numbers, other applications' bundle ids, booleans and
// counts. Never a title, a value, or another application's pid or window.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import {homedir} from 'node:os';
import {basename, isAbsolute, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchOf, quitOwned} from '../accept/fixture-app.mjs';
import {FRONT_WINDOW_SCRIPT} from '../accept/key-guard.mjs';
import {main as scenesMain, readState, SCENES} from '../repl-parity/scenes-mac.mjs';
import {alertWatch} from './live-checks.mjs';
import {defaultIo, processTable} from './live-device.mjs';
import {ownedReading} from './oracle.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const SYSTEM_WINDOWS_SCRIPT = fileURLToPath(new URL('./system-windows.swift', import.meta.url));
// The scenes the launch path covers (part 4: the engine can launch them into their fixed state).
// The scenes whose launch path the matrix runs: the Electron fixture alone. TextEdit's is not run on a shared Mac (the
// spec's Decision Log, M2b.2 review): its first observation would capture the owner's restored windows or its iCloud
// Open panel, and isolating it would mean changing the owner's TextEdit state.
export const LAUNCHABLE = Object.freeze(['electron']);
export const LAUNCHED_FILE = 'matrix-launched.json';
const ALERT_BASELINE_FILE = 'matrix-alert-baseline.json';
const LAUNCH_QUIT_MS = 5_000;
// The settle's quiet period, its bound and its poll: a launch the stopped engine had in flight appears within seconds.
const SETTLE_QUIET_MS = 3_000, SETTLE_MAX_MS = 20_000, SETTLE_POLL_MS = 250;
// The windowless app: a stay-open applet, its own bundle id, built under the harness's cache.
export const WINDOWLESS = Object.freeze({bundleId: 'io.github.ssfskim.cua.fixture.windowless', name: 'cua Windowless Fixture'});
const WINDOWLESS_SOURCE = ['on idle', 'return 3600', 'end idle'];
const WINDOWLESS_CACHE = join(homedir(), 'Library/Caches/cua-harness/windowless');

const run = (cmd, args, options = {}) => execFileSync(cmd, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, ...options});
const timed = async fn => { const from = Date.now(); const answer = await fn(); return {answer, at: [from, Date.now()]}; };

// ---- the journal of launches -------------------------------------------------------------------------------------------

export const readLaunched = dir => { try { return JSON.parse(fs.readFileSync(join(dir, LAUNCHED_FILE), 'utf8')); } catch { return []; } };
const writeLaunched = (dir, list) => fs.writeFileSync(join(dir, LAUNCHED_FILE), `${JSON.stringify(list)}\n`, {mode: 0o600});

// The run's processes: its scenes' and its journaled launches'. -> [pid].
export const ownedPids = (state, launches = []) => [...Object.values(state?.scenes ?? {}).map(record => record?.pid), ...launches.map(l => l.pid)].filter(Number.isInteger);

// ---- reads ---------------------------------------------------------------------------------------------------------------

// The focus probe's report as it may leave the device. -> {appOwned, appPid, named}.
export function ownedFocus(report, owned) {
  const pid = report?.focusedApp?.pid ?? null;
  const mine = Number.isInteger(pid) && owned.includes(pid);
  return {appOwned: mine, appPid: mine ? pid : null, named: report?.named === true};
}

// The oracle's reading. io: {frontWindow(), probe(args), state(), launched(), watcherRuns(pid)}.
export function read({focus = null, watcher = null}, io) {
  const from = Date.now();
  const owned = ownedPids(io.state(), io.launched());
  const out = {reading: ownedReading(io.frontWindow(), owned), watcher: Number.isSafeInteger(watcher) && io.watcherRuns(watcher)};
  if (focus !== null) {
    if (!/^\d+,-?\d+(\.\d+)?,-?\d+(\.\d+)?,\d+(\.\d+)?,\d+(\.\d+)?$/.test(focus)) throw new Error('--focus needs pid,x,y,w,h');
    if (!owned.includes(Number(focus.split(',')[0]))) throw new Error('--focus names a window of a process the run does not own');
    out.focus = ownedFocus(io.probe(['focus', '--window', focus]), owned);
  }
  return {...out, at: [from, Date.now()]};
}

// Whether `pid` is still the activation watcher (the approved bundle's `--probe watch-activations`).
export const isWatcher = (table, pid) => table.some(p => p.pid === pid && /\/cua-engine --probe watch-activations\b/.test(p.command));

// ---- the alert watch -----------------------------------------------------------------------------------------------------

// io: {windows(), state(), launched(), dir}.
export function alerts(action, io) {
  const file = join(io.dir, ALERT_BASELINE_FILE);
  if (action === 'baseline') {
    const kept = io.windows().map(w => ({number: w.number}));
    fs.writeFileSync(file, `${JSON.stringify(kept)}\n`, {mode: 0o600});
    return {baseline: kept.length};
  }
  if (action !== 'check') throw new Error('alerts baseline|check');
  if (!fs.existsSync(file)) throw new Error('no alert baseline in the run directory: run alerts baseline first');
  const watch = alertWatch(JSON.parse(fs.readFileSync(file, 'utf8')), io.windows(), {runPids: ownedPids(io.state(), io.launched())});
  return {abort: watch.abort, export: watch.export};
}

// ---- launches ------------------------------------------------------------------------------------------------------------

const launchable = scene => { if (!LAUNCHABLE.includes(scene)) throw new Error(`launched covers ${LAUNCHABLE.join(' and ')}, not ${scene}`); return SCENES[scene].bundleId; };
// lsappinfo's launch time is to the second: a process started in the same second as `at` counts as after it.
const floorSecond = at => Math.floor(at / 1000) * 1000;

// io: {state(), launched(), writeLaunched(list), runningApps(bundleId), now()}. -> {at, pids}.
export function launchIntent({scene}, io) {
  const bundleId = launchable(scene);
  const at = io.now(), pids = io.runningApps(bundleId).map(p => p.pid);
  io.writeLaunched([...io.launched().filter(l => !(l.intent && l.scene === scene)), {intent: true, scene, bundleId, at, pids}]);
  return {at, pids};
}

// io: {state(), launched(), writeLaunched(list), runningApps(bundleId), launchOf(pid)}.
export function recordLaunch({scene, since}, io) {
  const bundleId = launchable(scene);
  if (!Number.isSafeInteger(since)) throw new Error('--since needs a unix time in ms');
  const journal = io.launched(), recorded = new Set(ownedPids(io.state(), journal));
  const found = io.runningApps(bundleId).map(p => ({pid: p.pid, at: io.launchOf(p.pid)})).filter(p => !recorded.has(p.pid) && p.at !== null && p.at >= floorSecond(since));
  if (found.length !== 1) return {recorded: false, pid: null, candidates: found.length};
  io.writeLaunched([...journal.filter(l => !(l.intent && l.scene === scene)), {scene, bundleId, pid: found[0].pid, at: found[0].at}]);
  return {recorded: true, pid: found[0].pid, candidates: 1};
}

// The journal's launches still the same process, and the processes its intents left name: of the intent's bundle,
// started at or after the intent, not in its snapshot, not one of the run's recorded processes. Each process with the
// start time it had when found, so the quit signals only that process.
function journaledProcesses(journal, io) {
  const records = journal.filter(l => !l.intent), intents = journal.filter(l => l.intent);
  const same = records.filter(l => io.launchOf(l.pid) === l.at);
  const known = new Set([...ownedPids(io.state(), records), ...intents.flatMap(i => i.pids)]);
  const fromIntents = intents.flatMap(i => io.runningApps(i.bundleId).map(p => ({scene: i.scene, bundleId: i.bundleId, pid: p.pid, at: io.launchOf(p.pid)}))
    .filter(p => !known.has(p.pid) && p.at !== null && p.at >= floorSecond(i.at)));
  return {processes: [...same, ...fromIntents], gone: records.length - same.length};
}

// Quits every process the journal names now. An intent is kept whatever it found: the request it covers may still be in
// flight (a controller that died before the app appeared), so only settleLaunches clears it, once the work that could
// launch is stopped. -> {quit, remaining, gone, pending (the intents kept)}.
export async function quitLaunched(io) {
  const journal = io.launched(), intents = journal.filter(l => l.intent);
  const {processes, gone} = journaledProcesses(journal, io);
  if (!processes.length) { io.writeLaunched(intents); return {quit: 0, remaining: 0, gone, pending: intents.length}; }
  const {quit, remaining} = await io.quit(processes.map(l => l.pid));
  io.writeLaunched([...intents, ...processes.filter(l => remaining.includes(l.pid)).map(({scene, bundleId, pid, at}) => ({scene, bundleId, pid, at}))]);
  return {quit: quit.length, remaining: remaining.length, gone, pending: intents.length};
}

// The intents' end, called once the work that could still launch (the serve, the engine) is stopped: the journal's
// processes quit as they appear, until none has appeared for `quietMs`; then the intents are cleared. A launch still
// appearing at `maxMs` keeps its intent for the next cleanup. io: quitLaunched's, now(), sleep(ms).
// -> {quit, remaining, pending, waitedMs}.
export async function settleLaunches({quietMs = SETTLE_QUIET_MS, maxMs = SETTLE_MAX_MS} = {}, io) {
  const t0 = io.now();
  let quit = 0, remaining = 0, lastSeen = t0;
  if (!io.launched().some(l => l.intent)) {
    const out = await quitLaunched(io);
    return {quit: out.quit, remaining: out.remaining, pending: 0, waitedMs: 0};
  }
  for (;;) {
    const out = await quitLaunched(io);
    quit += out.quit; remaining = out.remaining;
    if (out.quit || out.remaining) lastSeen = io.now();
    if (!out.remaining && io.now() - lastSeen >= quietMs) {
      io.writeLaunched(io.launched().filter(l => !l.intent));
      return {quit, remaining, pending: 0, waitedMs: io.now() - t0};
    }
    if (io.now() - t0 >= maxMs) return {quit, remaining, pending: io.launched().filter(l => l.intent).length, waitedMs: io.now() - t0};
    await io.sleep(SETTLE_POLL_MS);
  }
}

// The windowless applet, built once per source (its bundle id rewritten, then signed ad hoc). -> its path.
export function windowlessApp({cache = WINDOWLESS_CACHE, exec = run} = {}) {
  const hash = createHash('sha256').update(JSON.stringify({WINDOWLESS, WINDOWLESS_SOURCE})).digest('hex').slice(0, 12);
  const app = join(cache, hash, `${WINDOWLESS.name}.app`);
  if (fs.existsSync(join(app, 'Contents', 'Info.plist'))) return app;
  fs.mkdirSync(cache, {recursive: true, mode: 0o700});
  const staging = fs.mkdtempSync(join(cache, '.staging-'));
  try {
    const built = join(staging, `${WINDOWLESS.name}.app`);
    exec('/usr/bin/osacompile', ['-s', '-o', built, ...WINDOWLESS_SOURCE.flatMap(line => ['-e', line])]);
    exec('/usr/bin/plutil', ['-replace', 'CFBundleIdentifier', '-string', WINDOWLESS.bundleId, join(built, 'Contents', 'Info.plist')]);
    exec('/usr/bin/codesign', ['--force', '--sign', '-', '--timestamp=none', built]);
    fs.mkdirSync(join(cache, hash), {recursive: true, mode: 0o700});
    fs.renameSync(built, app);
    return app;
  } finally { fs.rmSync(staging, {recursive: true, force: true}); }
}

// Launches the windowless app in the background and journals it. io: {app(), open(app), runningApps, launchOf, launched,
// writeLaunched, sleep, now}.
export async function windowlessUp(io) {
  const app = io.app();
  const before = io.runningApps(WINDOWLESS.bundleId).map(p => p.pid);
  if (before.length) throw new Error('a windowless fixture already runs: quit it (native-matrix.mjs cleanup) and re-run');
  const since = io.now();
  io.open(app);
  for (const end = io.now() + 10_000; io.now() < end; await io.sleep(100)) {
    const found = io.runningApps(WINDOWLESS.bundleId).map(p => ({pid: p.pid, at: io.launchOf(p.pid)})).filter(p => p.at !== null && p.at >= Math.floor(since / 1000) * 1000);
    if (found.length === 1) {
      io.writeLaunched([...io.launched(), {scene: 'windowless', bundleId: WINDOWLESS.bundleId, pid: found[0].pid, at: found[0].at}]);
      return {pid: found[0].pid, app};
    }
  }
  throw new Error('the windowless fixture did not come up within 10 s');
}

// ---- compiled readers ----------------------------------------------------------------------------------------------------

// A Swift script compiled once into the run directory (by its source's hash) and reused. -> the binary's path.
export function compiled(script, dir, {exec = run} = {}) {
  const hash = createHash('sha256').update(fs.readFileSync(script)).digest('hex').slice(0, 12);
  const bin = join(dir, 'bin', `${basename(script, '.swift')}-${hash}`);
  if (fs.existsSync(bin)) return bin;
  fs.mkdirSync(join(dir, 'bin'), {recursive: true, mode: 0o700});
  const staging = `${bin}.${process.pid}`;
  exec('/usr/bin/swiftc', ['-O', script, '-o', staging], {timeout: 300_000});
  fs.renameSync(staging, bin);
  return bin;
}

// ---- the CLI -------------------------------------------------------------------------------------------------------------

function parse(argv) {
  const [command, ...rest] = argv, flags = {}, positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) { flags[rest[i].slice(2)] = rest[i + 1]; i++; } else positional.push(rest[i]);
  }
  return {command, positional, flags};
}
const USAGE = 'usage: matrix-device.mjs compile|read|alerts|launched|windowless --run <dir> … | step <scenes-mac.mjs arguments>';
const sleep = ms => new Promise(done => setTimeout(done, ms));

export async function main(argv, {io: given = {}} = {}) {
  const {command, positional, flags} = parse(argv);
  if (!flags.run || !isAbsolute(flags.run)) throw new Error('--run <absolute directory> is required');
  fs.mkdirSync(flags.run, {recursive: true, mode: 0o700});
  const dir = fs.realpathSync(flags.run);
  const live = defaultIo(dir);
  const io = {
    dir, state: () => readState(dir), launched: () => readLaunched(dir), writeLaunched: list => writeLaunched(dir, list),
    frontWindow: () => JSON.parse(run(compiled(FRONT_WINDOW_SCRIPT, dir), ['front'])),
    windows: () => JSON.parse(run(compiled(SYSTEM_WINDOWS_SCRIPT, dir), [])).windows,
    watcherRuns: pid => isWatcher(processTable(), pid),
    probe: live.probe, runningApps: live.runningApps, launchOf: pid => launchOf(pid), quit: pids => quitOwned(pids, {waitMs: LAUNCH_QUIT_MS}),
    app: () => windowlessApp(), open: app => run('/usr/bin/open', ['-n', '-g', '-a', app]), sleep, now: Date.now,
    ...given,
  };
  switch (command) {
    case 'compile': return {front: basename(compiled(FRONT_WINDOW_SCRIPT, dir)), windows: basename(compiled(SYSTEM_WINDOWS_SCRIPT, dir))};
    case 'read': return read({focus: flags.focus ?? null, watcher: flags.watcher === undefined ? null : Number(flags.watcher)}, io);
    case 'step': return timed(() => (io.scenes ?? scenesMain)(argv.slice(1)));
    case 'alerts': return {...alerts(positional[0], io), at: [Date.now(), Date.now()]};
    case 'launched':
      if (positional[0] === 'intent') return launchIntent({scene: positional[1]}, io);
      if (positional[0] === 'record') return recordLaunch({scene: positional[1], since: Number(flags.since)}, io);
      if (positional[0] === 'quit') return quitLaunched(io);
      if (positional[0] === 'settle') return settleLaunches({}, io);
      throw new Error(USAGE);
    case 'windowless':
      if (positional[0] === 'up') return timed(() => windowlessUp(io));
      throw new Error(USAGE);
    default: throw new Error(USAGE);
  }
}

if (process.argv[1] && SCRIPT === fs.realpathSync(process.argv[1])) {
  main(process.argv.slice(2)).then(
    out => { process.stdout.write(JSON.stringify(out) + '\n'); },
    error => { process.stdout.write(JSON.stringify({error: error.message}) + '\n'); process.exitCode = 1; });
}
