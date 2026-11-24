// Sitting C's key-route diagnostic (ruling 1198; #117 M5, refs #506): where `pressKey("Escape")` lands while TextEdit's
// Open panel (drawn by com.apple.appkit.xpc.openAndSavePanelService) is focused, on each engine, for the P1 engine ticket
// that rests on it. Pilot C-2 saw the vendor's Escape close the panel and cua's not; the static reading of the pinned
// vendor binary says the vendor posts to the pid an AXParent walk finds through the private _AXUIElementGetActualPid,
// where cua's engine posts to the focused element's AXUIElementGetPid (native/engine/Sources/Engine/Input.swift:1014).
//
// One sitting step, after C's counted lanes and their judges, never interleaved with a judged cell. In order:
//   1. it refuses off a GitHub-hosted macOS runner, before it reads, builds, writes or opens anything
//   2. the two engines' TCC rows read (../hosted-sittings/tcc.mjs engineRows)
//   3. the tap app built and ad-hoc signed (../native-matrix/key-route-device.mjs buildTapApp), and Input Monitoring
//      granted to it alone through the hosted kit's one TCC writer under O0 (tcc.mjs grantDiagnosticListen); neither
//      engine gets a grant. A tap not built or granted is recorded and the lanes still run (the AX half stands alone)
//   4. per engine, vendor then cua, a matrix lane of its own (`native-matrix.mjs cell key-route`, ../native-matrix/
//      key-route-run.mjs): TextEdit up, its Open panel opened by ⌘O under the key guard, the AX half read, the taps
//      started on TextEdit and the panel service, one pressKey("Escape"), the taps stopped, the panel read and, when
//      the Escape did not close it, cancelled by Accessibility; the lane's put-back quits TextEdit. Each lane opens its
//      own TextEdit, so the panel is opened afresh between the engines and the AX half is read on each
//   5. the engines' rows read again and compared; then what it opened that is still there: the tap app (stopped, its
//      own process, then read again), TextEdit, a panel window
//   6. key-route.json (the artifact) and key-route.md (the sitting's section) written whatever happened
// Exit 0 recorded, its cleanup confirmed (the sitting's check: INFO, never its verdict); 1 a cleanup failure, each named
// (FAIL): the engines' rows changed or unread, a lane's panel left up or tap left running, anything left after.
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

// options: {approvedRuntime, approvedEngine, sitting, out}. io: keyRouteIo's. -> exit code (see the header).
export async function runKeyRoute({approvedRuntime, approvedEngine, sitting, out}, io) {
  assertGithubHosted(io.env, io.platform, 'the key-route diagnostic');
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
      const dir = join(out, engine);
      let exit = null, error = null;
      try { exit = await io.runEngine(engine, dir); } catch (e) { error = message(e); }
      const result = io.readJson(join(dir, 'run-1', 'result.json'));
      const keyRoute = result?.meta?.keyRoute ?? null;
      report.engines[engine] = {exit, ...(error ? {error} : {}), complete: result?.complete ?? null, problems: result?.problems ?? [], keyRoute};
      for (const item of keyRoute?.cleanup ?? []) failures.push(`${engine}'s lane: ${item}`);
    }
  } finally {
    if (before) {
      try {
        const changed = rowsChanged(before, io.engineRows());
        report.tcc.engines = changed ? {unchanged: false, ...changed} : {unchanged: true, rows: before.length};
        if (changed) failures.push(`the engines' TCC rows changed during the diagnostic: ${[changed.added.length && `added ${changed.added.join(', ')}`, changed.removed.length && `removed ${changed.removed.join(', ')}`].filter(Boolean).join('; ')}`);
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

// The default io: this runner's TCC store, the tap built here, each lane a native-matrix cell against the loopback
// device, the leftovers read from the process table and the window list.
export function keyRouteIo({approvedRuntime, approvedEngine, sitting, log = line => process.stderr.write(`${line}\n`)}) {
  const pgrep = (...args) => { try { return execFileSync('/usr/bin/pgrep', args, {encoding: 'utf8'}).split('\n').filter(Boolean).map(Number); } catch { return []; } };
  return {
    env: process.env, platform: process.platform, log,
    engineRows: () => engineRows(),
    buildTap: () => buildTapApp(),
    grantTap: app => grantDiagnosticListen({bundle: app}),
    runEngine: (engine, dir) => new Promise((done, failed) => {
      const child = spawn('node', ['scripts/native-matrix.mjs', 'cell', 'key-route', '--device', DEVICE, '--host', engine, '--engine', engine, '--approved-runtime', approvedRuntime,
        '--approved-engine', approvedEngine, '--sitting', sitting, '--out', dir, '--runs', '1'], {cwd: REPO, stdio: ['ignore', 'inherit', 'inherit']});
      child.on('error', failed);
      child.on('close', code => done(code));
    }),
    readJson: path => { try { return JSON.parse(fs.readFileSync(path, 'utf8')); } catch { return null; } },
    leftovers: () => {
      const cache = join(homedir(), 'Library', 'Caches', 'cua-harness', 'key-route');
      fs.mkdirSync(cache, {recursive: true, mode: 0o700});
      const windows = JSON.parse(execFileSync(compiled(SYSTEM_WINDOWS_SCRIPT, cache), [], {encoding: 'utf8', timeout: 60_000})).windows;
      if (!Array.isArray(windows)) throw new Error('the window list was unread');
      return {tap: pgrep('-f', TAP_EXECUTABLE), textedit: pgrep('-x', 'TextEdit'), panels: windows.filter(w => w.ownerBundleId === PANEL_SERVICE).length};
    },
    stopTap: pids => { for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} } execFileSync('/bin/sleep', ['2']); },
    write: (path, text) => { fs.mkdirSync(dirname(path), {recursive: true}); fs.writeFileSync(path, text); },
  };
}

