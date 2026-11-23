// The sitting's Finder baseline (ruling 1181): Finder's windows as they stood when the sitting began, so the scenes'
// preflight counts only windows that are new since, and the owner's own Finder windows on a Mac they keep open on (the
// MacBook) are never the run's to refuse, close or move.
//
// One snapshot serves the whole sitting: repl-parity's approved prepare takes it before the first lane, bound to the
// sitting (the journal's `preparedAt`, which is every lane's hold id) and to the boot it was taken in, since window
// numbers recur across boots (prepare-device.mjs manageApprovedPreparation); cleanup-prepared removes it. It is read
// only when a lane names its sitting (`--finder-baseline <preparedAt>`, native-mac's lanes) and only while both still
// match (sittingBaseline): a stale file, a driver with no sitting-level prepare (the goldens recorder, the matrix), or
// another boot reads no snapshot, and every Finder window on screen counts, as before the ruling. So a window the first
// lane leaves is new to the second lane's preflight too.
//
// A window is the snapshot's by its window number. The harness reads no window title (front-window.swift reads none:
// a CG title needs the Screen Recording grant, and a Finder title is the owner's folder name), so a window the owner
// closed and reopened during the sitting, which comes back with a new number, is matched by its frame instead: exactly
// the frame of a snapshot window that Finder no longer has at all (on screen or not: a minimized or hidden window, or
// one on another Space, keeps its number and lends no frame), each such window matched once. Finder brings a folder's
// window back at the frame it saved. This applies to the preflight only: `down finder` judges by number alone against
// the windows Finder had at the scene's up (./scenes-mac.mjs), where no owner activity needs excusing.
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';

export const FINDER_BASELINE = join(homedir(), 'Library/Caches/cua-harness/finder-baseline.json');

// This boot's start (`sysctl -n kern.boottime`), or null when unread. -> ISO time.
export function bootedAt({exec = (cmd, args) => execFileSync(cmd, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000})} = {}) {
  try {
    const sec = /sec = (\d+)/.exec(exec('/usr/sbin/sysctl', ['-n', 'kern.boottime']))?.[1];
    return sec ? new Date(Number(sec) * 1000).toISOString() : null;
  } catch { return null; }
}

// -> {preparedAt, bootedAt, takenAt, windows: [{number, bounds, onScreen}]}, or null when no sitting took one.
export function readFinderBaseline(file = FINDER_BASELINE) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
// The snapshot `baseline` serves the sitting `preparedAt` in the boot `boot` only. -> the baseline, or null with why
// ({baseline: null, ignored}).
export function sittingBaseline(baseline, {preparedAt, boot}) {
  if (!preparedAt) return {baseline: null};
  if (!baseline) return {baseline: null, ignored: 'no snapshot was taken for this sitting'};
  if (baseline.preparedAt !== preparedAt) return {baseline: null, ignored: `the snapshot is of the sitting prepared at ${baseline.preparedAt ?? 'an unknown time'}, not ${preparedAt}`};
  if (!boot || baseline.bootedAt !== boot) return {baseline: null, ignored: `the snapshot was taken in the boot of ${baseline.bootedAt ?? 'an unknown time'}, not this one (${boot ?? 'unread'})`};
  return {baseline};
}
// Finder's document windows now (`windows`: {number, bounds, onScreen}) written as the sitting's snapshot, replacing any
// earlier sitting's. -> the snapshot.
export function writeFinderBaseline(windows, {file = FINDER_BASELINE, at = new Date().toISOString(), preparedAt, boot}) {
  if (!preparedAt) throw new Error('a Finder snapshot is taken for a prepared sitting: --prepared-at <the journal\'s preparedAt>');
  const baseline = {preparedAt, bootedAt: boot ?? null, takenAt: at, windows: windows.map(({number, bounds, onScreen}) => ({number, bounds, onScreen: onScreen === true}))};
  fs.mkdirSync(dirname(file), {recursive: true, mode: 0o700});
  const temporary = `${file}.${process.pid}`;
  fs.writeFileSync(temporary, JSON.stringify(baseline, null, 2) + '\n', {mode: 0o600});
  fs.renameSync(temporary, file);
  return baseline;
}
// -> {cleared: whether a snapshot was there}.
export function clearFinderBaseline(file = FINDER_BASELINE) {
  const there = fs.existsSync(file);
  fs.rmSync(file, {force: true});
  return {cleared: there};
}

const sameFrame = (a, b) => Boolean(a && b) && ['x', 'y', 'width', 'height'].every(k => a[k] === b[k]);
// The windows of `windows` (on screen) that are new since `baseline` (see the header); `present`: the numbers of every
// window Finder has now, on screen or not, so only a snapshot window Finder no longer has lends its frame. -> the new
// windows, in order.
export function newFinderWindows(windows, baseline, present = windows.map(w => w.number)) {
  const known = baseline?.windows ?? [];
  const numbers = new Set(known.map(w => w.number)), has = new Set(present);
  const gone = known.filter(w => !has.has(w.number));
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
