// The key-window reading (the design session's addition to ruling 1169; the rule is ./alert-guard.mjs keyWindowCause):
// whether a scene's app holds the scene window as its own key window, read on the device that shows the scenes, outside
// either engine, by ../cursor-sitting/ax-state.swift `window <pid> <x,y,w,h>`: the app's AXFocusedWindow and
// AXMainWindow, each the scene window ('run'), another of its windows ('other') or none, and its AXFrontmost. The
// attributes are the app's own (AXUIElementCreateApplication), so an app that is not frontmost answers them too, which
// the system-wide focus the engine's focus probe reads cannot give for a background cell. The reader needs the
// Accessibility grant of the process that runs it: the owner's terminal on the mini; on a GitHub-hosted runner the image
// grants it to /bin/bash, whose children inherit it (#282's evidence). Without it the reading is not taken (trusted
// false), and the cell is counted unchecked, never refused (recordKeyWindowUnread). Used by ./guard-device.mjs (sittings
// A, B, D) and ../native-matrix/matrix-device.mjs (C). Value-free: booleans and run/other/none.
import {fileURLToPath} from 'node:url';

export const AX_STATE_SCRIPT = fileURLToPath(new URL('../cursor-sitting/ax-state.swift', import.meta.url));

const rectArg = b => [b.x, b.y, b.width, b.height].join(',');
const sideOf = v => (['run', 'other', 'none'].includes(v) ? v : null);

// The scene window a target names in one window list: the recorded window (`number`) when the target has one, else the
// target process's frontmost on-screen window (the list runs front to back). -> {pid, number, bounds} | null.
export function sceneWindowOf(windows, {pid, number = null}) {
  const mine = (windows ?? []).filter(w => w.ownerPid === pid && (w.layer ?? 0) === 0 && w.bounds);
  const w = number === null ? mine[0] : mine.find(x => x.number === number);
  return w ? {pid, number: w.number ?? null, bounds: w.bounds} : null;
}

// The reading for one target: `axState(pid, 'x,y,w,h')` the compiled ax-state.swift's answer. -> {scene, number,
// trusted, ok, frontmost, focusedWindow, mainWindow}, or {scene, number: null, trusted: null, ok: false, reason} when
// the scene window is not on screen.
export function ownKeyWindow(windows, target, axState) {
  const at = sceneWindowOf(windows, target);
  if (!at) return {scene: target.scene, number: null, trusted: null, ok: false, reason: 'the scene window is not on screen'};
  let answer = null;
  try { answer = axState(at.pid, rectArg(at.bounds)); } catch { answer = null; }
  return {scene: target.scene, number: at.number, trusted: answer?.trusted === true, ok: answer?.trusted === true && answer.ok === true,
    frontmost: typeof answer?.frontmost === 'boolean' ? answer.frontmost : null, focusedWindow: sideOf(answer?.focusedWindow), mainWindow: sideOf(answer?.mainWindow)};
}
