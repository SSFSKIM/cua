// Item 1's screen recording (docs/doperpowers/specs/2026-10-30-macos-agent-cursor-design.md, Acceptance 1; its
// Decision Log, 2026-10-31): while `drive 1` runs, `screencapture -v -R`, on a terminal of its own, records the rectangle the harness's TextEdit and
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
// The recorder's own stop, typed by its terminal (./recorder-pty.py), so a kit that hangs never leaves it recording:
// well past an item-1 run (about 30 s).
export const RECORDING_CAP_S = 300;
// How long a just-started recorder has to say it is recording: screencapture's prompt came 0.1–0.24 s after its launch
// on the MacBook, but python and the recorder start slower on a loaded host, and a refusal costs the sitting a retry;
// a recorder that cannot record still exits, or stays silent, well inside it.
export const START_CHECK_MS = 5000;
// How long a stop may take: the recorder writes its movie after the stop (about 0.1 s for a 2 s clip).
export const STOP_MS = 60_000;
// How long the recorder has to write its movie and exit once the stop is typed, before its terminal ends it (SIGTERM,
// then SIGKILL): well past a movie's writing (about 0.1 s for 2 s), well short of the kit's own STOP_MS.
export const RECORDER_GRACE_S = 20;
// The pty the recorder runs on, and the interpreter that runs it.
export const RECORDER_PTY = fileURLToPath(new URL('./recorder-pty.py', import.meta.url));
const PYTHON = '/usr/bin/python3';

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

// The recorder: a video (-v) of the region (-R, points), no sounds (-x). The real pointer is left out (no -C), so only
// the agent's cursor shows. No -V: a time-limited recording takes no stop, so the cap is its terminal's.
export const screencaptureCommand = ({region, file}) =>
  ['/usr/sbin/screencapture', '-v', '-x', '-R', [region.x, region.y, region.width, region.height].join(','), file];

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

// `promise`'s value, or null once `ms` have passed first. The timer is cleared either way, so a recorder that answers
// in time leaves nothing scheduled to keep the process alive.
function within(promise, ms) {
  let timer;
  const timeout = new Promise(done => { timer = setTimeout(() => done(null), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Starts `recorder` ([command, ...arguments]) on a terminal of its own (./recorder-pty.py, which types the stop at
// `capSeconds`, and ends a recorder still running `graceSeconds` after any stop), and checks within `startCheckMs` that it said it is recording and is still running: one that cannot
// record (a missing permission, a bad region) exits at once, and one that says nothing would take no stop.
// -> {ok, handle, spawnAt, readyAt (its first output's time)} or {ok: false, problem}.
export async function startRecording({recorder, capSeconds = RECORDING_CAP_S, graceSeconds = RECORDER_GRACE_S, env = process.env, now = Date.now, startCheckMs = START_CHECK_MS}) {
  const spawnAt = now();
  const child = spawn(PYTHON, ['-I', RECORDER_PTY, String(capSeconds), String(graceSeconds), ...recorder], {stdio: ['pipe', 'pipe', 'pipe'], env});
  let readyAt = null, said = '';
  let ready;
  const saidSomething = new Promise(done => { ready = done; });
  child.stdout.on('data', chunk => { readyAt ??= now(); said += chunk; ready(true); });
  child.stderr.on('data', chunk => { said += chunk; });
  const exited = new Promise(done => {
    child.once('exit', (code, signal) => done({code, signal, at: now()}));
    child.once('error', error => done({code: null, signal: null, at: now(), error: error.message}));
  });
  const last = () => said.trim().split('\n').at(-1) || 'it said nothing';
  const first = await within(Promise.race([exited.then(exit => ({exit})), saidSomething.then(() => ({ready: true}))]), startCheckMs);
  // A recorder that spoke and then failed at once (a refused region, a missing grant) is caught by a short second look.
  const early = first?.exit ?? (first?.ready ? await within(exited, 300) : null);
  if (early) return {ok: false, problem: `the recorder exited at once (${early.error ?? `code ${early.code}`}): ${last()}`};
  if (!first) {
    child.kill('SIGKILL');
    await exited;
    return {ok: false, problem: `the recorder did not say it is recording within ${startCheckMs} ms, so it would take no stop; it was killed`};
  }
  return {ok: true, spawnAt, readyAt, handle: {child, exited, spawnAt, said: () => said}};
}

// Stops the recorder by asking its terminal to type the character its prompt asks for (on a terminal, a stop that writes the movie),
// waits for it to write `file`, and hashes it. A recorder that does not exit within `stopMs` is killed (its terminal
// hangs it up), and the stop fails. -> {ok, file, stopAt, exitedAt, code, signal, bytes, sha256} or with {problem}.
export async function stopRecording(handle, {file, now = Date.now, stopMs = STOP_MS}) {
  const stopAt = now();
  if (handle.child.exitCode === null && handle.child.signalCode === null) handle.child.stdin.end('stop\n');
  let exit = await within(handle.exited, stopMs);
  if (!exit) {
    handle.child.kill('SIGKILL');
    exit = await handle.exited;
    return {ok: false, file, stopAt, exitedAt: exit.at, problem: `the recorder did not stop within ${stopMs} ms and was killed`};
  }
  const result = {file, stopAt, exitedAt: exit.at, code: exit.code, signal: exit.signal};
  if (!existsSync(file) || statSync(file).size === 0) return {ok: false, ...result, problem: `the recorder left no clip at ${file}: ${handle.said().trim().split('\n').at(-1) || 'it said nothing'}`};
  return {ok: true, ...result, bytes: statSync(file).size, sha256: createHash('sha256').update(readFileSync(file)).digest('hex')};
}
