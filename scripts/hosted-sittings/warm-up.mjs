// The setup's warm-up captures (#117 M5, T10b′; ruling 1153): each copy, cua's engine and the vendor's helper, makes
// its first capture in setup, outside every judged cell, so replayd's capture alert for it is raised there and not in
// a run (pilot A, run 45220897246: vv's TextEdit could not take the front from the alert its own first capture raised,
// right after its bind). A copy alerts at its first capture only, and the alert never closes by itself (H0 (ii), run
// 45156038821: 604 s); an activation takes the front from an alert already up (H0 (ii), ruling 1141's run, vc and cc of
// pilot A). Symmetric: both copies are warmed the same way and recorded the same way, though cua's has already
// alerted at its approve's first pass (./approve.mjs), so its warm-up is expected to raise none.
//
// A warm-up is one session of `cua serve` on the copy, run as it always runs: the bind of TextEdit (the copy's launch
// of it) and one screenshot, TextEdit's approval accepted and nothing else, then the TextEdit it launched ended by pid
// (a run refuses to start while TextEdit runs). Then what it raised: replayd's SCAlert lines over the capture, the front
// app, UserNotificationCenter's windows as the window server lists them (never a title), and a bounded wait for the
// alert to leave the front. The wait only watches: nothing here clicks, keys, answers or dismisses the alert, or
// writes replayd's store (ruling 1141). An alert still in front at the bound is recorded and the sitting goes on: each
// run activates its scene first, and a run that finds the alert in front where it needs its app records that cause,
// which the hosted check reads as NO VERDICT (scripts/native-baseline/macos.mjs, ./checks.mjs `record`). Nothing here
// throws for a failed capture or reading; it is recorded.
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {watchCaptureAlerts} from '../../src/runtime/engine.mjs';
import {isTextEditApproval, TEXTEDIT_BUNDLE} from '../accept/lib.mjs';
import {FRONTMOST_PROCESS_SCRIPT, parseFrontmostProcess} from '../accept/key-guard.mjs';
import {openSession} from '../accept/mcp-session.mjs';
import {cell, parseCell} from '../native-baseline/cells.mjs';
import {CAPTURE_ALERT_PROCESS} from '../native-matrix/live-checks.mjs';
import {assertGithubHosted} from './runner.mjs';

export const ALERT_WAIT_MS = 60_000;
export const ALERT_POLL_MS = 1_000;
// replayd logs its SCAlert lines at the capture; the watch stays open this much longer (src/runtime/engine.mjs's grace).
const ALERT_GRACE_MS = 2_000;
const CAPTURE_MS = 120_000;
const TEXTEDIT_END_MS = 5_000;
const SYSTEM_WINDOWS_SCRIPT = fileURLToPath(new URL('../native-matrix/system-windows.swift', import.meta.url));
const CAPTURE = cell(`const app = await cua.getApp(${JSON.stringify(TEXTEDIT_BUNDLE)}); const shot = await app.getScreenshot({emit: false}); return {bytes: shot.length};`);

const sleepFor = ms => new Promise(resolve => setTimeout(resolve, ms));
const tryRead = read => { try { return read() ?? null; } catch { return null; } };

// Watches the front app until UserNotificationCenter is not it, up to `limitMs`, reading it every `pollMs`; an unreadable
// front is not a front free of the alert. -> {cleared, waitedMs, polls, seen (each distinct front, or 'unreadable'), front}.
export async function waitForAlertToLeave({frontmost, sleep = sleepFor, now = () => performance.now(), limitMs = ALERT_WAIT_MS, pollMs = ALERT_POLL_MS}) {
  const started = now(), seen = [];
  let front = null, polls = 0;
  for (;;) {
    front = tryRead(frontmost);
    polls++;
    const shown = front ?? 'unreadable';
    if (!seen.some(s => JSON.stringify(s) === JSON.stringify(shown))) seen.push(shown);
    if ((front && front.bundleId !== CAPTURE_ALERT_PROCESS) || now() - started >= limitMs) break;
    await sleep(pollMs);
  }
  return {cleared: Boolean(front) && front.bundleId !== CAPTURE_ALERT_PROCESS, waitedMs: Math.round(now() - started), polls, seen, front};
}

// The window server's on-screen list (../native-matrix/system-windows.swift) -> UserNotificationCenter's windows,
// {pid, number, layer, titled (whether a title was readable and non-empty, null when unreadable; never the title), bounds},
// or null for an unread list, which is not an empty screen.
export function alertWindows(list) {
  if (!Array.isArray(list)) return null;
  return list.filter(w => w.ownerBundleId === CAPTURE_ALERT_PROCESS || w.ownerName === 'UserNotificationCenter')
    .map(w => ({pid: w.ownerPid, number: w.number, layer: w.layer, titled: typeof w.name === 'string' ? w.name.length > 0 : null, bounds: w.bounds ?? null}));
}

// One capture by `copy` ('cua' or 'vendor'): see the header. -> {ok, engine (the one the result attested), bytes | error,
// textEdit: {pids, ended}}, or {ok: false, error} without a session while TextEdit already runs.
export async function captureOnce(copy, {env, checkout, open = openSession, sleep = sleepFor,
  textEditPids = () => String(spawnSync('/usr/bin/pgrep', ['-x', 'TextEdit'], {encoding: 'utf8'}).stdout ?? '').split('\n').filter(Boolean).map(Number),
  signal = pid => process.kill(pid, 'SIGTERM')}) {
  const before = textEditPids();
  if (before.length) return {ok: false, error: `TextEdit is already running (pid ${before.join(', ')}): the warm-up ends only the TextEdit it launches`};
  const session = open({args: [join(checkout, 'bin', 'cua.mjs'), 'serve'], env: {...env, CUA_NATIVE_ENGINE: copy}, clientName: 'cua-hosted-warm-up',
    onServerRequest: msg => (isTextEditApproval(msg) ? {action: 'accept', content: {}} : {action: 'decline'})});
  let out;
  try {
    await session.initialize();
    const reply = await session.js(CAPTURE, CAPTURE_MS);
    const result = parseCell((reply.result?.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n'));
    const engine = reply.result?._meta?.['cua/nativeEngine']?.engine ?? null;
    out = result?.ok ? {ok: true, engine, bytes: result.value?.bytes ?? null}
      : {ok: false, engine, error: result?.error ?? (reply.timedOut ? 'the capture cell got no answer' : reply.error?.message ?? 'the capture cell printed no result')};
  } catch (error) {
    out = {ok: false, error: error.message};
  } finally {
    await session.close();
  }
  const pids = textEditPids();
  for (const pid of pids) { try { signal(pid); } catch { /* gone already */ } }
  let left = pids;
  for (let waited = 0; left.length && waited < TEXTEDIT_END_MS; waited += 250) { await sleep(250); left = textEditPids(); }
  return {...out, textEdit: {pids, ended: left.length === 0}};
}

// One copy's warm-up and what it raised: see the header. Refuses off a GitHub-hosted runner before anything.
// -> {copy, capture, captureAlerts: {watched, count}, frontAfter, windowsAfter, wait, windowsAtEnd}.
export async function warmUp(copy, {env = process.env, platform = process.platform, checkout = process.cwd(),
  capture = c => captureOnce(c, {env, checkout}), watchAlerts = watchCaptureAlerts,
  frontmost = () => parseFrontmostProcess(spawnSync('/bin/sh', ['-c', FRONTMOST_PROCESS_SCRIPT], {encoding: 'utf8'}).stdout ?? ''),
  windows = () => JSON.parse(spawnSync('swift', [SYSTEM_WINDOWS_SCRIPT], {encoding: 'utf8'}).stdout).windows,
  sleep = sleepFor, now, limitMs = ALERT_WAIT_MS, pollMs = ALERT_POLL_MS} = {}) {
  assertGithubHosted(env, platform, 'the warm-up capture');
  const watch = watchAlerts();
  const watched = await watch.ready;
  let made;
  try { made = await capture(copy); } catch (error) { made = {ok: false, error: error.message}; }
  if (watched) await sleep(ALERT_GRACE_MS);
  const {alerts, intact} = await watch.stop();
  const frontAfter = tryRead(frontmost);
  const windowsAfter = alertWindows(tryRead(windows));
  const wait = await waitForAlertToLeave({frontmost, sleep, ...(now ? {now} : {}), limitMs, pollMs});
  return {copy, capture: made, captureAlerts: {watched: watched && intact, count: alerts}, frontAfter, windowsAfter, wait, windowsAtEnd: alertWindows(tryRead(windows))};
}
