// The device side of M2b.1b's residue cells (./residue-checks.mjs names them; ./live.mjs runs them; ./live-device.mjs
// dispatches its commands here): route4, minimized-select, enablement and the cua lane and position reads of hscroll.
// The menu cell's cua lane is ./live-device.mjs menuCheck. Same discipline as the rest of the hold harness: cua's lane
// talks to the approved engine's socket, one connection per command unless a cell is about connections; every
// screenshot removed once its answer is in; nothing but booleans, ranges, scroll values, routes, error names and
// bounded sentences returned.
import * as fs from 'node:fs';
import {join} from 'node:path';
import {FIXTURE_ACCESSIBILITY_FILE} from './fixtures/electron-fixture.mjs';
import {TEXTEDIT_BUNDLE_ID} from '../repl-parity/scenes-mac.mjs';
import {ownershipProblems} from './goldens-device.mjs';
import {activationsOf, attempt, getState, until} from './live-device.mjs';
import {enablementOf, minimizeButton, textArea} from './live-checks.mjs';
import {SELECT_BEFORE, SELECT_MINIMIZED, minimizedSelectRanges, modeAt, parseAccessibilityRecord, preparedEngineSettings} from './residue-checks.mjs';

// ---- `--probe text-view` -----------------------------------------------------------------------------------------

// The run's text view as the probe reads it (TextViewProbe.swift): of the process's windows, the one with a text area
// (the scene's only window), its minimized flag, selected range and scroll-bar values, and whether the app's focused
// element is that text area. -> {minimized, range, horizontal, vertical, focusedRole, focusedIsTextArea} or {error}.
export function textViewOf(answer) {
  if (!answer || answer.error) return {error: String(answer?.error ?? 'no answer').slice(0, 300)};
  const windows = Array.isArray(answer.windows) ? answer.windows : [];
  const index = windows.findIndex(w => w?.textArea);
  if (index < 0) return {error: 'no window of the process shows a text area'};
  const w = windows[index], bars = w.textArea.scrollBars ?? {};
  const number = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {minimized: w.minimized === true, range: w.textArea.selectedRange ?? null, horizontal: number(bars.horizontal), vertical: number(bars.vertical),
    focusedRole: answer.focused?.role ?? null, focusedIsTextArea: answer.focused?.textAreaOfWindow === index};
}
const readTextView = (io, pid) => { try { return textViewOf(io.probe(['text-view', '--pid', String(pid)])); } catch (error) { return {error: String(error.message).slice(0, 300)}; } };

// ---- route4 ------------------------------------------------------------------------------------------------------

// Route 4 live without the owner's ~/.config/cua/engine.json: the engine reads its settings from $HOME/.config/cua/
// engine.json (Config.swift, HOME before NSHomeDirectory), and LaunchServices passes `open --env HOME=<dir>` to the app
// it launches, so the approved bundle is launched here under a prepared home (inside the run directory) whose
// engine.json gives the scene's TextEdit route 4, the owner's own peerPolicy and routes copied in (read, never
// written). `status.routes` must name it before anything is sent. The run's TextEdit is behind the run's Finder window:
// a selection is set by Accessibility, then a synthesized click on the text area (no AXPress: route 3's place, route 4
// by the override) must collapse it, by route 4, with Finder frontmost again, its window on top and the engine's read
// of Finder's key window the same as before (keyWindowRestored). The activation watcher records what route 4
// activated. The engine launched under the prepared home is shut down before the cell returns, whatever happened, so
// no later client meets it; the put-back's engine stop covers a cell that died.
export const ROUTE4_HOME = 'route4-home';
export async function route4Check({record, user, io, run, screenshots}) {
  const userInFront = () => io.frontmost()?.pid === user.pid;
  if (!userInFront()) return {problem: 'the user window (the run\'s Finder) is not in front; nothing was sent'};
  const home = join(run, ROUTE4_HOME), steps = {};
  fs.rmSync(home, {recursive: true, force: true});
  fs.mkdirSync(join(home, '.config/cua'), {recursive: true, mode: 0o700});
  fs.writeFileSync(join(home, '.config/cua/engine.json'), `${JSON.stringify(preparedEngineSettings(io.ownerEngineSettings(), record.bundleId ?? TEXTEDIT_BUNDLE_ID))}\n`, {mode: 0o600});
  let problem = null, client = null, watch = null;
  try {
    steps.engineStopBefore = await io.stop();
    client = io.clientUnderHome(home);
    const status = await client.status();
    steps.override = {read: status?.routes?.[record.bundleId ?? TEXTEDIT_BUNDLE_ID] === 4, routes: Object.keys(status?.routes ?? {}).length};
    if (!steps.override.read) return {problem: 'the engine launched under the prepared home did not read its route-4 override; nothing was sent', steps};
    watch = io.watch.start();
    const app = record.app, observe = () => getState(client, app, screenshots);
    let shot = await observe();
    const owned = ownershipProblems('textedit', shot, record);
    if (owned.length) return {problem: `the observation is not the run's TextEdit window (${owned.map(p => p.code).join(', ')}); nothing was sent`, steps};
    const selected = await attempt(() => client.execute('select_text', {app, element: textArea(shot).token, text: SELECT_MINIMIZED}, {lineage: shot.lineage}));
    shot = await observe();
    steps.prepared = selected.ok && shot.selectedText === SELECT_MINIMIZED;
    steps.userInFrontBefore = userInFront();
    const topBefore = io.frontWindow()?.topWindow ?? null;
    steps.topBeforeIsUser = topBefore?.ownerPid === user.pid && topBefore?.number === user.window.number;
    if (!steps.prepared || !steps.userInFrontBefore) return {steps};
    steps.click = await attempt(() => client.execute('click', {app, element: textArea(shot).token}, {lineage: shot.lineage}));
    const top = io.frontWindow()?.topWindow ?? null;
    steps.after = {frontRestored: userInFront(), topWindowRestored: top?.ownerPid === user.pid && top?.number === user.window.number};
    shot = await observe();
    steps.landed = !shot.selectedText;
  } catch (error) {
    problem = `the route4 check stopped: ${String(error.message).slice(0, 300)}`;
  } finally {
    if (watch) steps.activations = activationsOf(await io.watch.stop(watch), watch);
    client?.close();
    try { steps.engineStopAfter = await io.stop(); } catch (error) { steps.engineStopAfter = {error: String(error.message).slice(0, 300)}; problem ??= 'the engine launched under the prepared home could not be stopped'; }
    fs.rmSync(home, {recursive: true, force: true});
  }
  return {...(problem ? {problem} : {}), steps};
}

// ---- minimized-select --------------------------------------------------------------------------------------------

// select_text into a minimized window, the write told from the read (the M2a.5 hold's item 2): a known selection set
// first (SELECT_BEFORE), the window minimized by its own button, select_text of SELECT_MINIMIZED, then the probe's
// AXSelectedTextRange on the text area itself and the engine's observation, each with the window read minimized
// before and after; then the window restored (AppKit's reopen, as the minimized check does) and both read again.
export async function minimizedSelectCheck({record, client, io, screenshots}) {
  const steps = {}, app = record.app, observe = () => getState(client, app, screenshots);
  const minimizedNow = () => io.windowOnScreen(record.pid, record.window.number) === false;
  let touched = false;
  try {
    let shot = await observe();
    const owned = ownershipProblems('textedit', shot, record);
    if (owned.length) return {problem: `the observation is not the run's TextEdit window (${owned.map(p => p.code).join(', ')}); nothing was sent`, steps};
    steps.expected = minimizedSelectRanges(textArea(shot)?.value);
    if (!steps.expected.before || !steps.expected.minimized) return {problem: 'the run\'s document does not hold the cell\'s two lines once each; nothing was sent', steps};
    const prior = await attempt(() => client.execute('select_text', {app, element: textArea(shot).token, text: SELECT_BEFORE}, {lineage: shot.lineage}));
    steps.prior = {...prior, range: readTextView(io, record.pid).range ?? null};
    shot = await observe();
    const button = minimizeButton(shot);
    if (!button) return {problem: 'the run\'s TextEdit window shows no minimize button; nothing more was sent', steps};
    touched = true;
    steps.minimize = await attempt(() => client.execute('click', {app, element: button.token}, {lineage: shot.lineage}));
    steps.minimize.minimized = steps.minimize.ok && await until(() => minimizedNow(), io);
    if (!steps.minimize.minimized) return {problem: 'the window did not minimize; no further input was sent', steps};
    const measure = async (name, fn) => {
      const minimizedBefore = minimizedNow();
      steps[name] = {...(minimizedBefore ? await fn() : {}), minimizedBefore, minimizedAfter: minimizedNow()};
      return steps[name].minimizedBefore && steps[name].minimizedAfter;
    };
    if (!await measure('select', () => attempt(() => client.execute('select_text', {app, element: textArea(shot).token, text: SELECT_MINIMIZED}, {lineage: shot.lineage})))) return {steps};
    if (!await measure('probeMinimized', async () => { const read = readTextView(io, record.pid); return {range: read.range ?? null, probeMinimized: read.minimized ?? null, focusedIsTextArea: read.focusedIsTextArea ?? null, ...(read.error ? {error: read.error} : {})}; })) return {steps};
    await measure('engineMinimized', async () => {
      shot = await observe();
      return {selectedText: shot.selectedText ?? null, engineSaysMinimized: shot.timings?.minimized === true, focusRead: shot.timings?.focusRead ?? null};
    });
    return {steps};
  } catch (error) {
    return {problem: `the minimized-select check stopped: ${String(error.message).slice(0, 300)}`, steps};
  } finally {
    if (touched) {
      const front = await io.activate('textedit');
      const onScreen = await until(() => io.windowOnScreen(record.pid, record.window.number) === true, io);
      steps.restore = {ok: front?.ok === true && onScreen, onScreen};
      if (onScreen) {
        const read = readTextView(io, record.pid);
        let selectedText = null;
        try { selectedText = (await observe()).selectedText ?? null; } catch {}
        steps.restored = {range: read.range ?? null, selectedText};
      }
    }
  }
}
// The selected text the restored read reports is the run's own document's, compared on the controller with the line the
// cell selected; it leaves only through the verdict (minimizedSelectVerdict), which keeps a Boolean.
export const stripRestoredText = check => {
  if (check?.steps?.restored) check.steps.restored = {range: check.steps.restored.range, selectedText: check.steps.restored.selectedText === SELECT_MINIMIZED ? SELECT_MINIMIZED : check.steps.restored.selectedText ? '(other)' : null};
  if (check?.steps?.engineMinimized && 'selectedText' in check.steps.engineMinimized) {
    const t = check.steps.engineMinimized.selectedText;
    check.steps.engineMinimized.selectedText = t === SELECT_MINIMIZED ? SELECT_MINIMIZED : t ? '(other)' : null;
  }
  return check;
};

// ---- enablement --------------------------------------------------------------------------------------------------

// How long the fixture's record is given to show the mode change after an observation, or after a connection closed
// (the engine releases on the close; Electron answers the attribute's write at once, and the fixture's poll is 100 ms).
export const MODE_WAIT_MS = 5_000;
// Enablement released, judged by Chromium's own mode as the run's Electron fixture records it (its
// app.isAccessibilitySupportEnabled and accessibility-support-changed, written to its user-data directory; the fixture
// enables nothing itself). Two connections one after the other, each observing the fixture and then closing; after each
// observation the record must show the mode on, after each close off again. The engine's own enablement diagnostics
// (the attribute's prior readback) are kept beside, never judged.
export async function enablementCheck({record, io, screenshots}) {
  const file = join(record.userDataDir, FIXTURE_ACCESSIBILITY_FILE);
  const log = () => parseAccessibilityRecord(io.readFile(file));
  const steps = {cycles: []};
  const waitFor = async (enabled, since) => {
    let at = null;
    await until(() => { const hit = log().find(r => r.at >= since && r.enabled === enabled); at = hit?.at ?? null; return at !== null; }, io, MODE_WAIT_MS);
    return at;
  };
  try {
    steps.initial = modeAt(log(), io.now());
    if (steps.initial !== false) return {steps};
    for (let i = 0; i < 2; i++) {
      const cycle = {};
      const client = io.client();
      try {
        const observedFrom = io.now();
        const shot = await getState(client, record.app, screenshots);
        if (shot?.app?.pid !== record.pid) throw new Error('the observation is not of the run\'s Electron fixture');
        cycle.engine = enablementOf(shot.timings);
        cycle.enabledAt = await waitFor(true, observedFrom - 50);
      } finally {
        cycle.closedAt = io.now();
        await client.close();
      }
      cycle.releasedAt = await waitFor(false, cycle.closedAt);
      steps.cycles.push(cycle);
      if (cycle.enabledAt === null || cycle.releasedAt === null) break;
    }
  } catch (error) {
    steps.problem = `the enablement check stopped: ${String(error.message).slice(0, 300)}`;
  }
  return {steps};
}

// ---- hscroll -----------------------------------------------------------------------------------------------------

// The scene's horizontal and vertical scroll-bar values (after `settleMs`, so a scroll's animation has ended), by the
// probe: what both lanes are judged by.
export async function hscrollRead({record, io, settleMs = 0}) {
  if (settleMs > 0) await io.sleep(settleMs);
  const read = readTextView(io, record.pid);
  return read.error ? {error: read.error} : {horizontal: read.horizontal, vertical: read.vertical};
}
export const HSCROLL_SETTLE_MS = 1_000;

// cua's lane of the horizontal scroll: the run's wide-page TextEdit behind the run's Finder window, its text area
// scrolled right by one page through the engine, read back by position before and after.
export async function hscrollCheck({record, user, client, io, screenshots}) {
  const userInFront = () => io.frontmost()?.pid === user.pid;
  if (!userInFront()) return {problem: 'the user window (the run\'s Finder) is not in front; nothing was sent'};
  const app = record.app;
  const shot = await getState(client, app, screenshots);
  const owned = ownershipProblems('textedit', shot, record);
  if (owned.length) return {problem: `the observation is not the run's TextEdit window (${owned.map(p => p.code).join(', ')}); nothing was sent`};
  const before = await hscrollRead({record, io});
  if (before.error || typeof before.horizontal !== 'number') return {problem: `no horizontal scroll bar to read before the scroll (${before.error ?? 'none shown'}); nothing was sent`, before};
  const scroll = await attempt(() => client.execute('scroll', {app, element: textArea(shot).token, direction: 'right', pages: 1}, {lineage: shot.lineage}));
  const after = await hscrollRead({record, io, settleMs: HSCROLL_SETTLE_MS});
  return {before, scroll, after, userInFront: userInFront()};
}
