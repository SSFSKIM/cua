// Item 1's screen recording (docs/doperpowers/specs/2026-10-30-macos-agent-cursor-design.md, Acceptance 1; its
// Decision Log, 2026-10-31): while `drive 1` runs, `screencapture -v -R` records the rectangle the harness's TextEdit and
// Chrome for Testing windows fill, so the order of each control's change against the cursor's arrival can be read from
// the frames afterwards (./clip.mjs). The region must hold only those windows: it is refused when part of it holds
// neither (beyond a sliver) or when a window of the frontmost app lies over it. The clip is kept outside the repository,
// since the owner's screen around and over the region is theirs; only frames cropped to a scene window are committed.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {extname, isAbsolute, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

// The widest strip of the region that may hold neither window: a tiling margin, the gap a hand placement leaves.
export const UNCOVERED_TOLERANCE_PT = 16;
// The recorder's own stop, so a kit that died never leaves it recording: well past an item-1 run (about 30 s).
export const RECORDING_CAP_S = 300;
// How long a just-started recorder must keep running to count as recording.
export const START_CHECK_MS = 1500;
// How long a stop may take: the recorder writes its movie after the interrupt.
export const STOP_MS = 60_000;

const right = r => r.x + r.width, bottom = r => r.y + r.height;
const area = r => `${r.width} × ${r.height} pt at (${r.x}, ${r.y})`;
const intersects = (a, b) => a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);

// The region the two windows' bounds (points, top-left origin) fill: their bounding rectangle, every part of it that
// neither covers (cells of the grid their edges make), and the problem when one is wider than the tolerance in both
// directions. -> {region, uncovered: [rect], problem}.
export function recordingRegion(windows, {tolerance = UNCOVERED_TOLERANCE_PT} = {}) {
  if (windows.length !== 2) return {region: null, uncovered: [], problem: 'the region is made from two windows'};
  const x = Math.floor(Math.min(...windows.map(w => w.x))), y = Math.floor(Math.min(...windows.map(w => w.y)));
  const region = {x, y, width: Math.ceil(Math.max(...windows.map(right))) - x, height: Math.ceil(Math.max(...windows.map(bottom))) - y};
  const edges = pick => [...new Set(windows.flatMap(pick))].sort((a, b) => a - b);
  const xs = edges(w => [w.x, right(w)]), ys = edges(w => [w.y, bottom(w)]);
  const uncovered = [];
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
    const cell = {x: xs[i], y: ys[j], width: xs[i + 1] - xs[i], height: ys[j + 1] - ys[j]};
    if (!windows.some(w => cell.x >= w.x && right(cell) <= right(w) && cell.y >= w.y && bottom(cell) <= bottom(w))) uncovered.push(cell);
  }
  const wide = uncovered.filter(c => Math.min(c.width, c.height) > tolerance);
  const problem = wide.length
    ? `the recording region ${area(region)} must hold only the two harness windows, but ${wide.map(area).join(' and ')} holds neither window: put them side by side, touching, with their top and bottom edges level (within ${tolerance} pt)`
    : null;
  return {region, uncovered, problem};
}

// Why the frontmost app's windows (front-window.swift's `windows`) put something over the region, or null.
export function overlapProblem(region, windows) {
  const over = (windows ?? []).filter(w => w.onScreen !== false && intersects(w.bounds, region));
  return over.length ? `the frontmost app's window ${over.map(w => `${w.number} (${area(w.bounds)})`).join(', ')} overlaps the recording region ${area(region)}: move it off the harness windows` : null;
}

// Whether item 1 may record, from the readings: each scene's run window's bounds now (null: not on screen), its pid, the
// frontmost process and its windows. Refused when a run window is gone, when the region holds more than the two windows,
// when a scene is frontmost (both must be in the background), or when the frontmost app's window lies over the region.
// -> {ok, region, windows, uncovered, frontmost, problem?}.
export function recordingPlan({windows, pids, frontmost = null, frontWindows = []}) {
  const gone = Object.keys(windows).find(id => !windows[id]);
  if (gone) return {ok: false, windows, problem: `the ${gone} scene's run window is not on screen`};
  const {region, uncovered, problem} = recordingRegion(Object.values(windows));
  const front = frontmost ? {pid: frontmost.pid, bundleId: frontmost.bundleId ?? null} : null;
  const base = {region, windows, uncovered, frontmost: front};
  if (problem) return {ok: false, ...base, problem};
  const frontScene = front && Object.keys(pids).find(id => pids[id] === front.pid);
  if (frontScene) return {ok: false, ...base, problem: `the ${frontScene} scene is frontmost: both must be in the background, so click the operator's terminal`};
  const over = front ? overlapProblem(region, frontWindows) : null;
  return over ? {ok: false, ...base, problem: over} : {ok: true, ...base};
}

// screencapture's arguments: a video (-v) of the region (-R, points), no sounds (-x), capped (-V). The real pointer is
// left out (no -C), so only the agent's cursor shows.
export const screencaptureArgs = ({region, file, capSeconds = RECORDING_CAP_S}) =>
  ['-v', '-x', '-V', String(capSeconds), '-R', [region.x, region.y, region.width, region.height].join(','), file];

// Whether `path` lies inside the repository `repo` (or is it).
export function insideRepository(path, repo) {
  const inside = relative(resolve(repo), resolve(path));
  return !inside.startsWith('..') && !isAbsolute(inside);
}

// Why `file` cannot be the clip, or null: an absolute path to a new .mov outside the repository `repo`.
export function clipPathProblem(file, repo) {
  if (!file || !isAbsolute(file)) return 'the clip is given by absolute path (--clip)';
  if (extname(file) !== '.mov') return 'the clip is a .mov';
  if (insideRepository(file, repo)) return `the clip is kept outside the repository (${repo}): the screen around the scenes is the owner's`;
  if (existsSync(file)) return `${file} exists: give the clip a new name`;
  return null;
}

// Starts the recorder and checks it is still running after `startCheckMs` (one that cannot record, for a missing
// permission or a bad region, exits at once). -> {ok, handle, spawnAt, readyAt (its first output's time, or null)} or
// {ok: false, problem}.
export async function startRecording({command = '/usr/sbin/screencapture', args, env = process.env, now = Date.now, startCheckMs = START_CHECK_MS}) {
  const spawnAt = now();
  const child = spawn(command, args, {stdio: ['pipe', 'pipe', 'pipe'], env});
  let readyAt = null, said = '';
  child.stdout.on('data', chunk => { readyAt ??= now(); said += chunk; });
  child.stderr.on('data', chunk => { said += chunk; });
  const exited = new Promise(done => {
    child.once('exit', (code, signal) => done({code, signal, at: now()}));
    child.once('error', error => done({code: null, signal: null, at: now(), error: error.message}));
  });
  const early = await Promise.race([exited, new Promise(done => setTimeout(() => done(null), startCheckMs))]);
  if (early) return {ok: false, problem: `the recorder exited at once (${early.error ?? `code ${early.code}`}): ${said.trim().split('\n').at(-1) || 'it said nothing'}`};
  return {ok: true, spawnAt, readyAt, handle: {child, exited, spawnAt, said: () => said}};
}

// Stops the recorder as ctrl-c does (SIGINT), waits for it to write `file`, and hashes it. A recorder that does not
// exit within `stopMs` is killed, and the stop fails. -> {ok, file, stopAt, exitedAt, code, signal, bytes, sha256} or
// with {problem}.
export async function stopRecording(handle, {file, now = Date.now, stopMs = STOP_MS}) {
  const stopAt = now();
  handle.child.kill('SIGINT');
  let exit = await Promise.race([handle.exited, new Promise(done => setTimeout(() => done(null), stopMs))]);
  if (!exit) {
    handle.child.kill('SIGKILL');
    exit = await handle.exited;
    return {ok: false, file, stopAt, exitedAt: exit.at, problem: `the recorder did not stop within ${stopMs} ms and was killed`};
  }
  const result = {file, stopAt, exitedAt: exit.at, code: exit.code, signal: exit.signal};
  if (!existsSync(file) || statSync(file).size === 0) return {ok: false, ...result, problem: `the recorder left no clip at ${file}: ${handle.said().trim().split('\n').at(-1) || 'it said nothing'}`};
  return {ok: true, ...result, bytes: statSync(file).size, sha256: createHash('sha256').update(readFileSync(file)).digest('hex')};
}
