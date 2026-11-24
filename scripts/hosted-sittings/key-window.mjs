// The key-window reading (the design session's addition to ruling 1169; the rule is ./alert-guard.mjs keyWindowCause):
// whether a scene's app holds the window a cell acts in as its own key window, read on the device that shows the scenes,
// outside either engine, by ../cursor-sitting/ax-state.swift `window <pid> <x,y,w,h>`: the app's AXFocusedWindow and
// AXMainWindow, each that window ('run'), another of its windows ('other') or none, and its AXFrontmost. The attributes
// are the app's own (AXUIElementCreateApplication), so an app that is not frontmost answers them too, which the
// system-wide focus the engine's focus probe reads cannot give for a background cell.
//
// The window a cell acts in is its process's frontmost window (a document ⌘N opened, say), or for a scene shown by a
// process the run did not launch (Finder) the run's recorded window. A sheet is a window of its own in the window list
// but a part of its parent in Accessibility: when Accessibility lists no window at the frontmost one's bounds and a
// window of the process behind it holds those bounds, that window is read, and only when Accessibility shows an AXSheet
// child of it at the front window's bounds (ax-state's `sheet`) is it the one the reading stands for, its sheet kept
// (`sheet`). A window merely lying inside another proves nothing: without the AXSheet the reading is not taken. While a
// sheet is up the app's AXFocusedWindow is the sheet itself (pilots C-3 and C-4: every TextEdit cell after super+w or
// super+s refused as "another of its windows"): ax-state names it `sheet` when it is an AXSheet whose parent is the
// window read, and the reading carries the focused window whatever it is (`focused`: its role, subrole, frame and its
// number in the window list), which a refusal names.
//
// The reader needs the Accessibility grant of the process that runs it: the owner's terminal on the mini; on a
// GitHub-hosted runner the image grants it to /bin/bash, whose children inherit it (#282's evidence), which setup
// checks over the loopback ssh the runs use (./guard-device.mjs trust). A reading not taken refuses nothing: the cell
// is counted unchecked with its `reason` (recordKeyWindowReading). Used by ./guard-device.mjs (sittings A, B, D) and
// ../native-matrix/matrix-device.mjs (C). Value-free: booleans, window numbers and run/other/none.
import {fileURLToPath} from 'node:url';

export const AX_STATE_SCRIPT = fileURLToPath(new URL('../cursor-sitting/ax-state.swift', import.meta.url));
// ax-state.swift `window`'s arguments: the pid and the window's bounds, and the sheet's bounds when the reading asks
// whether the front window is that window's sheet. Every device adapter builds its argv here (axStateReader), so the
// sheet question reaches the reader live. execTool(args) -> the compiled reader's stdout.
export const axStateWindowArgs = (pid, bounds, sheet = null) => ['window', String(pid), bounds, ...(sheet ? [sheet] : [])];
export const axStateReader = execTool => (pid, bounds, sheet = null) => JSON.parse(execTool(axStateWindowArgs(pid, bounds, sheet)));

const rectArg = b => [b.x, b.y, b.width, b.height].join(',');
// ax-state's sides: the window read ('run'), a sheet of it ('sheet', the focused window only: pilot C-4), another
// ('other') or none.
const sideOf = v => (['run', 'sheet', 'other', 'none'].includes(v) ? v : null);
const within = (inner, outer) => inner.x >= outer.x - 2 && inner.y >= outer.y - 2 && inner.x + inner.width <= outer.x + outer.width + 2 && inner.y + inner.height <= outer.y + outer.height + 2;
const isRect = b => b !== null && typeof b === 'object' && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(b[k]));
const near = (a, b) => ['x', 'y', 'width', 'height'].every(k => Math.abs(a[k] - b[k]) <= 2);

// The process's on-screen windows, front to back (the list's own order).
const windowsOf = (windows, pid) => (windows ?? []).filter(w => w.ownerPid === pid && (w.layer ?? 0) === 0 && w.bounds);
// The window a cell acts in, in one window list: the recorded window (`number`) when the target names one, else the
// target process's frontmost on-screen window. -> {pid, number, bounds} | null.
export function sceneWindowOf(windows, {pid, number = null}) {
  const mine = windowsOf(windows, pid);
  const w = number === null ? mine[0] : mine.find(x => x.number === number);
  return w ? {pid, number: w.number ?? null, bounds: w.bounds} : null;
}

// Why a reading was not taken, from ax-state's answer (null when it was).
function unreadReason(answer, error) {
  if (error) return `the reader failed (${error})`;
  if (answer?.trusted !== true) return 'the reader is not trusted for Accessibility';
  if (answer.found === false) return 'Accessibility lists no window at the scene window\'s bounds';
  if (answer.ok !== true) return `a read failed: ${(answer.failed ?? []).join(', ') || 'unnamed'}`;
  return null;
}
const ask = (axState, at, sheet = null) => {
  try { return {answer: sheet ? axState(at.pid, rectArg(at.bounds), rectArg(sheet)) : axState(at.pid, rectArg(at.bounds)), error: null}; }
  catch (error) { return {answer: null, error: String(error?.message ?? error).split('\n')[0].slice(0, 200)}; }
};
export const NOT_A_SHEET = 'Accessibility lists no window at the scene window\'s bounds, and shows it as no sheet of the window behind it';
// The app's focused window as ax-state described it (`focusedWindowElement`: its role, subrole and frame), its number
// the process's on-screen window at that frame (within 2 pt) or null: what a refusal names, and what the run takes a
// window it opened from (../native-matrix/steps.mjs ownWindowOpened). undefined when the reader said nothing of it, null
// when the app has no focused window. -> {number, frame, role, subrole} | null | undefined.
function focusedOf(answer, windows, pid) {
  if (!answer || !('focusedWindowElement' in answer)) return undefined;
  const el = answer.focusedWindowElement;
  if (!el || typeof el !== 'object') return null;
  const frame = isRect(el.frame) ? el.frame : null;
  const listed = frame ? windowsOf(windows, pid).find(w => near(w.bounds, frame)) : null;
  return {number: listed?.number ?? null, frame, role: typeof el.role === 'string' ? el.role : null, subrole: typeof el.subrole === 'string' ? el.subrole : null};
}

// The reading for one target ({scene, pid, number?}); `axState(pid, 'x,y,w,h'[, 'sheet x,y,w,h'])` the compiled
// ax-state.swift's answer.
// -> {scene, number, trusted (null when the reader failed), ok, found, failed, frontmost, focusedWindow, mainWindow,
// sheet?, focused?, reason?}, or {scene, number: null, trusted: null, ok: false, reason} when no window is on screen.
export function ownKeyWindow(windows, target, axState) {
  let at = sceneWindowOf(windows, target);
  if (!at) return {scene: target.scene, number: null, trusted: null, ok: false, reason: 'the scene window is not on screen'};
  let {answer, error} = ask(axState, at), sheet = null, notSheet = false;
  if (!error && answer?.trusted === true && answer.found === false) {
    const parent = windowsOf(windows, at.pid).find(w => w.number !== at.number && within(at.bounds, w.bounds));
    if (parent) {
      const behind = {pid: at.pid, number: parent.number ?? null, bounds: parent.bounds};
      const asked = ask(axState, behind, at.bounds);
      // Its parent only when Accessibility shows the front window as an AXSheet of it; else the reading is not taken.
      if (!asked.error && asked.answer?.trusted === true && asked.answer.sheet === true) { sheet = at.number; at = behind; ({answer, error} = asked); }
      else if (asked.error || asked.answer?.trusted !== true) ({answer, error} = asked);
      else notSheet = true;
    }
  }
  const reason = notSheet ? NOT_A_SHEET : unreadReason(answer, error);
  const focused = error ? undefined : focusedOf(answer, windows, at.pid);
  return {scene: target.scene, number: at.number, trusted: error ? null : answer?.trusted === true, ok: reason === null,
    found: typeof answer?.found === 'boolean' ? answer.found : null, failed: Array.isArray(answer?.failed) ? answer.failed : [],
    frontmost: typeof answer?.frontmost === 'boolean' ? answer.frontmost : null, focusedWindow: sideOf(answer?.focusedWindow), mainWindow: sideOf(answer?.mainWindow),
    ...(sheet !== null ? {sheet} : {}), ...(focused !== undefined ? {focused} : {}), ...(reason ? {reason} : {})};
}
