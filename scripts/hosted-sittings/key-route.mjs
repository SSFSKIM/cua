// Sitting C's key-route diagnostic (ruling 1198; #117 M5, refs #506): where `pressKey("Escape")` lands while TextEdit's
// Open panel (drawn by com.apple.appkit.xpc.openAndSavePanelService) is focused, on each engine, for the P1 engine ticket
// that rests on it. Pilot C-2 saw the vendor's Escape close the panel and cua's not; the static reading of the pinned
// vendor binary says the vendor posts to the pid an AXParent walk finds through the private _AXUIElementGetActualPid,
// where cua's engine posts to the focused element's AXUIElementGetPid (native/engine/Sources/Engine/Input.swift:1014).
//
// One sitting step, after C's counted lanes and their judges, never interleaved with a judged cell. In order:
//   1. it refuses off a GitHub-hosted macOS runner, before it reads, builds, writes or opens anything
//   2. the two engines' TCC rows read, every column of them (../hosted-sittings/tcc.mjs engineRows)
//   3. the tap app built and ad-hoc signed (../native-matrix/key-route-device.mjs buildTapApp), and Input Monitoring
//      granted to it alone through the hosted kit's one TCC writer under O0 (tcc.mjs grantDiagnosticListen); neither
//      engine gets a grant. A tap not built or granted is recorded and the lanes still run (the AX half stands alone)
//   4. per engine, vendor then cua, a matrix lane of its own (`native-matrix.mjs cell key-route`, ../native-matrix/
//      key-route-run.mjs): TextEdit up, its Open panel opened by ⌘O under the key guard, the AX half read, the taps
//      started on TextEdit and the panel service, one pressKey("Escape"), the taps stopped, the panel read and, unless
//      that reading says it is gone, cancelled by Accessibility; the lane's put-back quits TextEdit. Each lane opens its
//      own TextEdit, so the panel is opened afresh between the engines and the AX half is read on each. Each lane is
//      bounded (LANE_TIMEOUT_MS, then SIGTERM, its put-back's grace, then SIGKILL), and so is the whole diagnostic
//      (KEY_ROUTE_BUDGET_MS, a reserve kept for steps 5 and 6): a lane with too little time left is skipped, recorded
//   5. the engines' rows read again and compared; then what it opened that is still there: the tap app (stopped, its
//      own process, then read again), TextEdit, a panel window
//   6. key-route.json (the artifact) and key-route.md (the sitting's section) written whatever happened
// Exit 0 recorded, its cleanup confirmed (the sitting's check: INFO, never its verdict); 1 a cleanup failure, each named
// (FAIL): the engines' rows changed in a grant column, gained or lost, or unread (tccd's bookkeeping columns moving
// alone, tcc.mjs TCC_BOOKKEEPING_COLUMNS, is recorded and no failure); a lane that wrote no result, ran past its bound, did not put back, did not
// clean its approved home, or left its panel up or its tap running; anything left after.
import {execFileSync, spawn} from 'node:child_process';
import * as fs from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compiled} from '../native-matrix/matrix-device.mjs';
import {buildTapApp, TAP_EXECUTABLE} from '../native-matrix/key-route-device.mjs';
import {PANEL_SERVICE} from './alert-guard.mjs';
import {KEY_ROUTE_ENGINES, renderKeyRoute} from './key-route-report.mjs';
import {DEVICE} from './plan.mjs';
import {assertGithubHosted} from './runner.mjs';
import {engineRows, grantDiagnosticListen, rowsChanged} from './tcc.mjs';

export {keyRouteSummary, renderKeyRoute} from './key-route-report.mjs';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SYSTEM_WINDOWS_SCRIPT = fileURLToPath(new URL('../native-matrix/system-windows.swift', import.meta.url));
const message = error => String(error?.message ?? error).split('\n')[0].slice(0, 300);

// The bounds: the whole diagnostic; the reserve held back for the rows' compare, the leftovers and the report; one lane;
// the grace a lane's SIGTERM gives its put-back before SIGKILL; the least a lane is started with.
const MINUTE = 60_000;
export const KEY_ROUTE_BUDGET_MS = 45 * MINUTE, KEY_ROUTE_RESERVE_MS = 5 * MINUTE;
export const LANE_TIMEOUT_MS = 20 * MINUTE, LANE_GRACE_MS = 3 * MINUTE, LANE_MIN_MS = 5 * MINUTE;

// What a lane's result leaves unconfirmed. -> [string].
function laneFailures(engine, {exit, timedOut}, result) {
  const failures = [];
  if (timedOut) failures.push(`${engine}'s lane ran past its bound (${LANE_TIMEOUT_MS / MINUTE} min) and was stopped`);
  if (!result) return [...failures, `${engine}'s lane wrote no result (exit ${exit}): its put-back and cleanup are unconfirmed`];
  // A lane refused before anything on the device changed has nothing to put back.
  if (result.verdict === 'refused') return failures;
  if (result.putBack?.ok !== true) failures.push(`${engine}'s lane: its put-back did not hold (${result.putBack?.manual ?? result.putBack?.error ?? 'none recorded'})`);
  if (result.meta?.preparationCleanup?.removed !== true) failures.push(`${engine}'s lane: its approved home's cleanup was not confirmed`);
  for (const item of result.meta?.keyRoute?.cleanup ?? []) failures.push(`${engine}'s lane: ${item}`);
  return failures;
}

// options: {approvedRuntime, approvedEngine, sitting, out}. io: keyRouteIo's. -> exit code (see the header).
export async function runKeyRoute({approvedRuntime, approvedEngine, sitting, out}, io) {
  assertGithubHosted(io.env, io.platform, 'the key-route diagnostic');
  const deadline = io.now() + KEY_ROUTE_BUDGET_MS;
  const report = {ruling: 1198, approvedRuntime, approvedEngine, sitting, started: new Date().toISOString(), tap: null, tcc: {engines: null}, engines: {}, leftovers: null, cleanup: null};
  const failures = [];
  let before = null;
  try {
    try { before = io.engineRows(); } catch (error) { failures.push(`the engines' TCC rows could not be read before the diagnostic (${message(error)}): unchanged is unproven`); }
    try {
      report.tap = io.buildTap();
      report.tap.grant = io.grantTap(report.tap.app);
    } catch (error) { report.tap = {...(report.tap ?? {}), error: message(error)}; }
    for (const engine of KEY_ROUTE_ENGINES) {
      const timeoutMs = Math.min(LANE_TIMEOUT_MS, deadline - KEY_ROUTE_RESERVE_MS - LANE_GRACE_MS - io.now());
      if (timeoutMs < LANE_MIN_MS) {
        report.engines[engine] = {skipped: `the diagnostic's time ran out (${Math.max(0, Math.floor(timeoutMs / 1000))} s left for a lane, ${LANE_MIN_MS / 1000} s needed)`};
        continue;
      }
      const dir = join(out, engine);
      let lane = {exit: null, signal: null, timedOut: false}, error = null;
      try { lane = await io.runEngine(engine, dir, {timeoutMs}); } catch (e) { error = message(e); }
      const result = io.readJson(join(dir, 'run-1', 'result.json'));
      report.engines[engine] = {exit: lane.exit, ...(lane.signal ? {signal: lane.signal} : {}), ...(lane.timedOut ? {timedOut: true} : {}), ...(error ? {error} : {}),
        complete: result?.complete ?? null, verdict: result?.verdict ?? null, problems: result?.problems ?? [], putBack: result?.putBack ?? null, keyRoute: result?.meta?.keyRoute ?? null};
      failures.push(...laneFailures(engine, lane, result));
    }
  } finally {
    if (before) {
      try {
        const changed = rowsChanged(before, io.engineRows()), grant = changed?.grant;
        report.tcc.engines = {unchanged: !grant, rows: before.rows.length, bookkeepingColumns: before.bookkeeping, ...(grant ?? {}),
          ...(changed?.bookkeeping ? {bookkeeping: changed.bookkeeping} : {})};
        if (grant) {
          failures.push(`the engines' TCC rows changed during the diagnostic: ${[grant.added.length && `added ${grant.added.join(', ')}`, grant.removed.length && `removed ${grant.removed.join(', ')}`,
            grant.columns && `the access table's columns ${grant.columns.before.join(', ')} became ${grant.columns.after.join(', ')}`].filter(Boolean).join('; ')}`);
        }
      } catch (error) { failures.push(`the engines' TCC rows could not be read after the diagnostic (${message(error)}): unchanged is unproven`); }
    }
    try {
      let left = io.leftovers();
      if (left.tap.length) { io.stopTap(left.tap); left = io.leftovers(); }
      report.leftovers = left;
      if (left.tap.length) failures.push(`the tap app still running after it was stopped (pid ${left.tap.join(', ')})`);
      if (left.textedit.length) failures.push(`TextEdit still running (pid ${left.textedit.join(', ')})`);
      if (left.panels > 0) failures.push(`an Open panel window still on screen (${left.panels})`);
    } catch (error) { failures.push(`what the diagnostic opened could not be read after it (${message(error)})`); }
    report.cleanup = {ok: failures.length === 0, failures};
    report.finished = new Date().toISOString();
    io.write(join(out, 'key-route.json'), `${JSON.stringify(report, null, 2)}\n`);
    io.write(join(out, 'key-route.md'), renderKeyRoute(report));
  }
  return failures.length ? 1 : 0;
}

// pgrep's pids: its exit 1 is no process matched; any other failure (a bad pattern, its timeout) is a reading that
// failed, thrown, never taken for an empty list. -> [pid].
export function pgrepPids(args, exec = a => execFileSync('/usr/bin/pgrep', a, {encoding: 'utf8', timeout: 10_000})) {
  try { return String(exec(args)).split('\n').filter(Boolean).map(Number); } catch (error) {
    if (error.status === 1) return [];
    throw error;
  }
}

// A lane: `native-matrix.mjs cell key-route` against the loopback device, bounded by `timeoutMs`: past it SIGTERM (the
// matrix's own interrupt, which ends at its next step and puts everything back), and SIGKILL when the grace runs out.
// -> {exit, signal, timedOut}.
function runLane(argv, {timeoutMs}) {
  return new Promise((done, failed) => {
    const child = spawn('node', argv, {cwd: REPO, stdio: ['ignore', 'inherit', 'inherit']});
    let timedOut = false, kill = null;
    const bound = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      kill = setTimeout(() => child.kill('SIGKILL'), LANE_GRACE_MS);
    }, timeoutMs);
    const settle = () => { clearTimeout(bound); clearTimeout(kill); };
    child.on('error', error => { settle(); failed(error); });
    child.on('close', (exit, signal) => { settle(); done({exit, signal, timedOut}); });
  });
}

// The default io: this runner's TCC store, the tap built here, each lane a native-matrix cell against the loopback
// device, the leftovers read from the process table and the window list.
export function keyRouteIo({approvedRuntime, approvedEngine, sitting, log = line => process.stderr.write(`${line}\n`)}) {
  return {
    env: process.env, platform: process.platform, log, now: Date.now,
    engineRows: () => engineRows(),
    buildTap: () => buildTapApp(),
    grantTap: app => grantDiagnosticListen({bundle: app}),
    runEngine: (engine, dir, bound) => runLane(['scripts/native-matrix.mjs', 'cell', 'key-route', '--device', DEVICE, '--host', engine, '--engine', engine,
      '--approved-runtime', approvedRuntime, '--approved-engine', approvedEngine, '--sitting', sitting, '--out', dir, '--runs', '1'], bound),
    readJson: path => { try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch { return null; } },
    leftovers: () => {
      const cache = join(homedir(), 'Library', 'Caches', 'cua-harness', 'key-route');
      fs.mkdirSync(cache, {recursive: true, mode: 0o700});
      const windows = JSON.parse(execFileSync(compiled(SYSTEM_WINDOWS_SCRIPT, cache), [], {encoding: 'utf8', timeout: 60_000})).windows;
      if (!Array.isArray(windows)) throw new Error('the window list was unread');
      return {tap: pgrepPids(['-f', TAP_EXECUTABLE]), textedit: pgrepPids(['-x', 'TextEdit']), panels: windows.filter(w => w.ownerBundleId === PANEL_SERVICE).length};
    },
    stopTap: pids => { for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} } execFileSync('/bin/sleep', ['2']); },
    write: (path, text) => { fs.mkdirSync(dirname(path), {recursive: true}); fs.writeFileSync(path, text); },
  };
}
