// Whether the TextEdit fixture's super+w closed its document, judged from the window server rather than by observing
// TextEdit (#117 M3.4; scripts/accept/textedit.mjs). An observation of a running app with no window opens it first, on
// either engine (the own native engine spec, "Observation (skyshot)": the non-activating reopen the vendor's preparation
// also sends), and TextEdit answers a reopen with its Open panel, which can list the owner's documents; so once the
// fixture's only document may be closed, nothing asks TextEdit anything. FrontWindowProbe (./front-window.swift
// `windows <pid>`) lists a process's layer-0 windows by number, never by name, needing no permission.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {FRONT_WINDOW_SCRIPT} from './key-guard.mjs';

const run = promisify(execFile);
const windowBounds = w => Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, w.bounds?.[key] ?? null]));

// Shared by onboarding's one-visible-window admission and the TextEdit fixture's windowless cleanup (#196).
// Only explicitly off-screen windows are excluded. TextEdit's internal off-screen windows are evidence (bounds
// only), not documents to close; unknown visibility remains in the blocking set. No window title crosses here.
export function windowInventory(windows) {
  return {visible: windows.filter(w => w.onScreen !== false),
    offScreenCount: windows.filter(w => w.onScreen === false).length,
    offScreenBounds: windows.filter(w => w.onScreen === false).map(windowBounds)};
}

// Every layer-0 window of `pids` ([{ownerPid, number, onScreen}]), on screen or not, or null when a reading failed.
// closeVerdict keys windows by owner and number only; onScreen is for the bind check (scripts/probe/lib.mjs bindRefusal).
export async function readWindows(pids, {probe = async pid => JSON.parse((await run('/usr/bin/swift', [FRONT_WINDOW_SCRIPT, 'windows', String(pid)], {timeout: 120_000})).stdout)} = {}) {
  try {
    const readings = await Promise.all(pids.map(pid => probe(pid)));
    return readings.flatMap(reading => reading.windows.map(w => ({ownerPid: w.ownerPid, number: w.number, onScreen: w.onScreen === true, bounds: windowBounds(w)})));
  } catch { return null; }
}

const key = w => `${w.ownerPid}:${w.number}`;

// The close, from TextEdit's windows right before super+w (`before`, the fixture's document verified in front by the
// same cell that pressed it) and after (`after`; null: unreadable) -> {status, closed, alone, detail}. `closed`: the
// document's window is gone; `alone`: TextEdit then holds no window at all, so quitting a TextEdit this run started
// closes nothing of anyone else's. One window gone and none new is the document's (super+w closes the front window,
// which was the document's); a window that appeared (a sheet, a panel) is not judged.
export function closeVerdict({before, after}) {
  if (!after) return {status: 'BLOCKED', closed: false, alone: false, detail: 'TextEdit\'s windows could not be read after super+w (FrontWindowProbe); check TextEdit by hand'};
  if (!before) return after.length === 0
    ? {status: 'PASS', closed: true, alone: true, detail: 'super+w closed the verified fixture window; TextEdit then had no window at all (its windows before could not be read)'}
    : {status: 'BLOCKED', closed: false, alone: false, detail: `TextEdit's windows before super+w could not be read and ${after.length} remain, so the close cannot be confirmed; check TextEdit by hand`};
  const gone = before.filter(w => !after.some(a => key(a) === key(w)));
  const appeared = after.filter(w => !before.some(b => key(b) === key(w)));
  if (appeared.length) return {status: 'BLOCKED', closed: false, alone: false,
    detail: `${appeared.length} TextEdit window(s) appeared after super+w (a sheet or a panel?), so the close cannot be confirmed; nothing was touched, check TextEdit by hand`};
  if (!gone.length) return {status: 'FAIL', closed: false, alone: false, detail: 'no TextEdit window closed after super+w: the fixture document is still open; close it by hand without saving elsewhere'};
  if (gone.length > 1) return {status: 'BLOCKED', closed: false, alone: false, detail: `${gone.length} TextEdit windows closed after one super+w, so which was the fixture's cannot be told; check TextEdit by hand`};
  return after.length
    ? {status: 'PASS', closed: true, alone: false, detail: `super+w closed the verified fixture window; ${after.length} other TextEdit window(s) remain, left as they are`}
    : {status: 'PASS', closed: true, alone: true, detail: 'super+w closed the verified fixture window; TextEdit then had no window at all'};
}

// Reads TextEdit's windows after super+w until the close is confirmed, at most `attempts` times `intervalMs` apart (a
// closing window can linger a moment), and judges the last reading -> closeVerdict's.
export async function awaitClose({before, read, attempts = 6, intervalMs = 500, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))}) {
  let verdict;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt) await sleep(intervalMs);
    verdict = closeVerdict({before, after: await read()});
    if (verdict.status === 'PASS') return verdict;
  }
  return verdict;
}
