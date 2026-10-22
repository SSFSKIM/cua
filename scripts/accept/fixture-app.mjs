// The fixture app a live run opens, and its cleanup (#157): the run quits only the app process it caused to start and
// then hands the front back to the application that was frontmost before it. Callers: scripts/accept/textedit.mjs
// (accept-native's TextEdit fixture) and scripts/accept/textedit-cleanup-witness.mjs (the same path, without cua).
//
// Ownership is causal, captured at launch: right after its own `open`, the run records the one pid of the app that was
// not running when it took its before-set and that started (ps's launch time) no earlier than the second the run began,
// as {pid, at}. None such means the document went to an app already running; more than one is ambiguous and records
// none. At cleanup only that recorded process is a candidate, and only while the pid still has the same launch time (a
// pid gone, reused or unreadable is not the run's); nothing is re-scanned then, so an app the owner starts mid-run, or
// relaunches after the run's own exits, is never selected. An app that was running before the run is never quit. Even
// the run's own launch is quit only when the caller confirms it holds no window but the fixture's (`alone`): a process
// the run started can still receive someone else's document mid-run, so unconfirmed it is left running, unsignalled. The
// process's environment is not the witness here: ps -E shows nothing of a platform app's environment (Finder, Terminal,
// TextEdit on macOS 26 and 27), so a marker passed through `open` could not be read back.
import {execFileSync} from 'node:child_process';
import {windowInventory} from './window-close.mjs';

// ps in the C locale and in UTC: `lstart` carries no UTC offset, so local time would be ambiguous in a fall-back hour.
const run = (cmd, args) => execFileSync(cmd, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: {...process.env, LC_ALL: 'C', TZ: 'UTC'}, timeout: 10_000});

// The running pids of an executable name (pgrep -x), or [] when none runs.
export function pidsOf(name, {exec = run} = {}) {
  try { return String(exec('/usr/bin/pgrep', ['-x', name])).split('\n').filter(Boolean).map(Number); } catch { return []; }
}

// `ps -o lstart=` text in the C locale and UTC ("Sun Oct 18 02:51:07 2026", as `run` invokes ps) -> epoch ms, or null.
export function parseLaunch(text) {
  const t = String(text).trim().replace(/\s+/g, ' ');
  const m = /^\w{3} (\w{3}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(t);
  if (!m) return null;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m[1]);
  if (month < 0) return null;
  return Date.UTC(Number(m[6]), month, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
}

// A pid's launch time (epoch ms, to the second), or null when it is gone or unreadable.
export function launchOf(pid, {exec = run} = {}) {
  try { return parseLaunch(exec('/bin/ps', ['-o', 'lstart=', '-p', String(pid)])); } catch { return null; }
}

// The run's own launch among `pids`, read right after its `open`: the pids absent from `before` that launched no earlier
// than the second `startedAt` falls in (ps reports whole seconds; a pid whose launch time cannot be read is not the
// run's). -> {launch: {pid, at} when exactly one, else null; candidates: [pid]} (more than one candidate: ambiguous).
export function captureLaunch({pids, before, startedAt, launchOf: launch = pid => launchOf(pid)}) {
  const floor = Math.floor(startedAt / 1000) * 1000;
  const found = pids.filter(pid => !before.includes(pid)).map(pid => ({pid, at: launch(pid)})).filter(({at}) => at !== null && at >= floor);
  return {launch: found.length === 1 ? found[0] : null, candidates: found.map(({pid}) => pid)};
}

// captureLaunch as a bounded poll right after the run's `open` returns (the new pid may not be listed yet). With an app
// already running before (`before` non-empty) `open` hands it the document and no pid is expected: one reading. Else
// it reads until a candidate appears or `boundMs` passes; a reading taken past the bound is a miss (`missed`), never accepted or guessed.
// -> {launch, candidates, waitedMs, missed}.
export async function awaitLaunch({pids, before, startedAt, launchOf: launch = pid => launchOf(pid), boundMs = 10_000, pollMs = 100,
  now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms))}) {
  const t0 = now();
  for (;;) {
    const r = captureLaunch({pids: pids(), before, startedAt, launchOf: launch});
    const waitedMs = now() - t0;
    if (before.length) return {...r, waitedMs, missed: false};
    if (waitedMs > boundMs) return {launch: null, candidates: r.candidates, waitedMs, missed: true};
    if (r.candidates.length) return {...r, waitedMs, missed: false};
    if (waitedMs >= boundMs) return {...r, waitedMs, missed: true};
    await sleep(pollMs);
  }
}

// Whether a recorded launch is still that process: its pid alive with the same launch time.
export const isSameLaunch = (recorded, {launchOf: launch = pid => launchOf(pid)} = {}) => Boolean(recorded) && launch(recorded.pid) === recorded.at;

// Capture immediately after the run opens its own empty document in a newly launched app. Never establish a
// baseline from an app that was already running, a foreign PID, or a launch that changed while the probe ran.
// Only these off-screen IDs may later be classified as launch-internal; later minimized documents cannot join it.
export async function captureLaunchWindows({launch: recorded, before, readWindows, launchOf: launch = pid => launchOf(pid)}) {
  if (before.length || !isSameLaunch(recorded, {launchOf: launch})) return null;
  let windows;
  try { windows = await readWindows([recorded.pid]); } catch { return null; }
  if (!windows || windows.some(w => w.ownerPid !== recorded.pid) || !isSameLaunch(recorded, {launchOf: launch})) return null;
  return {...recorded, windows: windowInventory(windows).offScreen};
}

// SIGTERM to each owned pid, then up to `waitMs` for it to exit. -> {quit: [pid], remaining: [pid]}.
export async function quitOwned(pids, {kill = (pid, signal) => process.kill(pid, signal), alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } },
  sleep = ms => new Promise(r => setTimeout(r, ms)), waitMs = 5000, pollMs = 100} = {}) {
  for (const pid of pids) { try { kill(pid, 'SIGTERM'); } catch {} }
  for (let waited = 0; pids.some(alive) && waited < waitMs; waited += pollMs) await sleep(pollMs);
  return {quit: pids.filter(pid => !alive(pid)), remaining: pids.filter(alive)};
}

// Hands the front back to `previous` (a bundle id read before the run) when something else is frontmost now. An unknown
// previous front, or one that is the fixture app itself, is left alone. -> {previous, before, after, restored}.
export async function restoreFront(previous, {frontmost, activate = id => run('/usr/bin/open', ['-b', id]), app, sleep = ms => new Promise(r => setTimeout(r, ms)), waitMs = 3000, pollMs = 200}) {
  const read = async () => { try { return (await frontmost()) ?? null; } catch { return null; } };
  const before = await read();
  if (!previous || previous === app || before === previous) return {previous, before, after: before, restored: before === previous};
  try { activate(previous); } catch {}
  let after = await read();
  for (let waited = 0; after !== previous && waited < waitMs; waited += pollMs) { await sleep(pollMs); after = await read(); }
  return {previous, before, after, restored: after === previous};
}

// The whole cleanup: the run's recorded launch quit (when it is still that process), then the front handed back. `run`
// is what the run recorded: {before (pids), front (bundle id or null), launch ({pid, at} from captureLaunch, or null),
// launchWindows (captureLaunchWindows's empty-launch inventory, or null)}.
// `alone` must be exactly true, the caller's positive confirmation that the app holds no window but the fixture's; without
// it nothing is signalled and a live recorded launch is returned as `leftRunning`. `pids` is read only to report which
// processes running before are still there; it never selects anything to quit. When `readWindows` is supplied, the
// caller has confirmed the fixture document closed, and a fresh list must contain no on-screen window or foreign PID
// before quitting; the process identity is rechecked after that read. Current off-screen IDs must be a subset of
// this launch's internal inventory (#196); new/unclassified off-screen windows block too. Evidence is IDs/bounds only.
// -> {launch, live, alone, quit, remaining, leftRunning, keptBefore, front, windowCheck?}.
export async function cleanUpFixtureApp({name, bundle, run: started, alone = false, readWindows, pids = () => pidsOf(name), launchOf: launch = pid => launchOf(pid), quit = quitOwned, frontmost, activate, sleep}) {
  let live = isSameLaunch(started.launch, {launchOf: launch});
  let confirmed = alone === true;
  let windowCheck = null;
  if (live && confirmed && readWindows) {
    let windows;
    try { windows = await readWindows(); } catch { windows = null; }
    const inventory = windows && windowInventory(windows);
    const foreign = windows?.some(w => w.ownerPid !== started.launch.pid);
    const baseline = started.launchWindows;
    const knownIds = new Set(baseline?.pid === started.launch.pid && baseline?.at === started.launch.at ? baseline.windows.map(w => w.number) : []);
    const unclassified = inventory?.offScreen.filter(w => !knownIds.has(w.number)) ?? [];
    confirmed = Boolean(inventory && inventory.visible.length === 0 && !foreign && unclassified.length === 0);
    windowCheck = {status: confirmed ? 'PASS' : 'BLOCKED',
      detail: !inventory ? 'window list unreadable' : foreign ? 'window belongs to another PID' : inventory.visible.length ? 'on-screen window remains'
        : unclassified.length ? 'unclassified off-screen window remains; it was not in this empty launch’s internal set'
          : 'no on-screen window remains; every off-screen ID belongs to this empty launch’s internal set',
      offScreenCount: inventory?.offScreenCount ?? null, offScreenBounds: inventory?.offScreenBounds ?? null,
      unclassifiedOffScreen: unclassified};
    live = isSameLaunch(started.launch, {launchOf: launch});  // the window probe may have taken time
  }
  const {quit: quitPids, remaining} = live && confirmed ? await quit([started.launch.pid]) : {quit: [], remaining: []};
  const running = pids();
  const front = await restoreFront(started.front, {frontmost, app: bundle, ...(activate ? {activate} : {}), ...(sleep ? {sleep} : {})});
  return {launch: started.launch ?? null, live, alone: confirmed, quit: quitPids, remaining, leftRunning: live && !confirmed ? started.launch.pid : null, keptBefore: started.before.filter(pid => running.includes(pid)), front, ...(windowCheck ? {windowCheck} : {})};
}
