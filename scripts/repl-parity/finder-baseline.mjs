// The sitting's Finder baseline (ruling 1181): Finder's windows as they stood when the sitting began, so the scenes'
// Finder checks (./scenes-mac.mjs preflight and down finder) count only windows that are new since, and the owner's own
// Finder windows on a Mac they keep open on (the MacBook) are never the run's to refuse, close or move.
//
// One snapshot serves the whole sitting: repl-parity's prepare takes it before the first lane (prepare-device.mjs
// manageApprovedPreparation), every lane's preflight and every down finder read it, and cleanup-prepared removes it. So
// a window the first lane leaves is new to the second lane's preflight too. Without a snapshot (a driver with no
// sitting-level prepare: the goldens recorder, the matrix) every Finder window on screen is new, as before the ruling.
//
// A window is the baseline's by its window number. The harness reads no window title (front-window.swift reads none:
// a CG title needs the Screen Recording grant, and a Finder title is the owner's folder name), so a window the owner
// closed and reopened during the sitting, which comes back with a new number, is matched by its frame instead: exactly
// the frame of a baseline window whose number is gone, each such window matched once. Finder brings a folder's window
// back at the frame it saved, so the owner's reopened window matches; the run's own windows open at the venue's or
// FINDER_FRAME, and Finder's reopen window (the one pilot B left) is opened only when no window is on screen, so a
// leftover matching a gone owner window's exact frame would need both at once. A miss refuses loudly, naming the window.
import * as fs from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';

export const FINDER_BASELINE = join(homedir(), 'Library/Caches/cua-harness/finder-baseline.json');

// -> {takenAt, windows: [{number, bounds, onScreen}]}, or null when no sitting took one.
export function readFinderBaseline(file = FINDER_BASELINE) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
// Finder's document windows now (`windows`: {number, bounds, onScreen}) written as the sitting's baseline, replacing
// any earlier sitting's. -> the baseline.
export function writeFinderBaseline(windows, {file = FINDER_BASELINE, at = new Date().toISOString()} = {}) {
  const baseline = {takenAt: at, windows: windows.map(({number, bounds, onScreen}) => ({number, bounds, onScreen: onScreen === true}))};
  fs.mkdirSync(dirname(file), {recursive: true, mode: 0o700});
  const temporary = `${file}.${process.pid}`;
  fs.writeFileSync(temporary, JSON.stringify(baseline, null, 2) + '\n', {mode: 0o600});
  fs.renameSync(temporary, file);
  return baseline;
}
// -> {cleared: whether a baseline was there}.
export function clearFinderBaseline(file = FINDER_BASELINE) {
  const there = fs.existsSync(file);
  fs.rmSync(file, {force: true});
  return {cleared: there};
}

const sameFrame = (a, b) => Boolean(a && b) && ['x', 'y', 'width', 'height'].every(k => a[k] === b[k]);
// The windows of `windows` that are new since `baseline` (see the header). -> the new windows, in order.
export function newFinderWindows(windows, baseline) {
  const known = baseline?.windows ?? [];
  const numbers = new Set(known.map(w => w.number)), present = new Set(windows.map(w => w.number));
  const gone = known.filter(w => !present.has(w.number));
  return windows.filter(w => {
    if (numbers.has(w.number)) return false;
    const reopened = gone.findIndex(k => sameFrame(k.bounds, w.bounds));
    if (reopened < 0) return true;
    gone.splice(reopened, 1);
    return false;
  });
}
// A window as a refusal names it: its number and frame, never a title.
export const windowText = w => `${w.number}${w.bounds ? ` at ${w.bounds.x},${w.bounds.y} ${w.bounds.width}x${w.bounds.height}` : ''}`;
