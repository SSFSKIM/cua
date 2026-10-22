// The frontmost guard for the harnesses' TextEdit keys (#162). Twice on the mini, after native runs whose helper sent
// super+w and super+q to TextEdit, the owner's Chrome window closed: the keys may reach whatever app is frontmost
// rather than the bound one. Until #162 is understood, a cell that sends a key (super+n, typing, super+w, super+q)
// runs only while the run's target app is the frontmost application. Otherwise the cell is not sent at all, the skip
// is recorded as `key_skipped_not_frontmost` with the frontmost app's bundle id, and the caller fails its run with no
// further input. A frontmost app that cannot be read counts as not the target.
// The check is made by the harness right before it sends the cell, outside the sandbox (cells cannot ask
// LaunchServices); the cell's own check that TextEdit's front window is the expected document stays. What remains is
// the time between this read and the key inside the cell (an AX read, well under a second): a cell that waits for a
// window before sending keys is split so the keys get their own check (native-baseline's TASK_NEW and TASK_TYPE), and a
// paused session waits before the check, never between it and the dispatch (sendToPausedSession).
// Callers: scripts/native-baseline/macos.mjs (the device over ssh) and scripts/accept/textedit.mjs (on the Mac itself).
// From M1b the target is a process, by pid (the own native engine spec, Verification system part 2): a harness that
// launched the scene's app knows its pid, and another process of the same bundle id (a second TextEdit, the owner's) is
// then not the target. A target that names a window too (Finder's, whose process is the system's and holds the owner's
// windows as well) needs that window on top of the frontmost process; the reading is FrontWindowProbe's
// (./front-window.swift), whose frontmost process is the same lsappinfo reading as FRONTMOST_PROCESS_SCRIPT. A bundle-id
// target is the pre-M1b form, kept for the callers that have no pid yet (native-baseline's macos.mjs, M1b.4;
// ./textedit.mjs, M3) and compared as before. From M2b a caller may name its own user window ({pid, bounds}) as the one
// other window a key may be sent under (sendIfFrontmost): the background-regime cells of the native matrix.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const KEY_SKIPPED = 'key_skipped_not_frontmost';
// The frontmost application's bundle id, as scripts/mini-rules.mjs reads it.
export const FRONTMOST_SCRIPT = 'lsappinfo info -only bundleid "$(lsappinfo front)"';

// lsappinfo prints `"CFBundleIdentifier"="<id>"` (macOS 26) or `bundleID="<id>"`; -> the id, or null.
export const parseFrontmost = text => /(?:bundleID|"CFBundleIdentifier")="([^"]+)"/.exec(text)?.[1] ?? null;

// The frontmost application's process, pid and bundle id (FrontWindowProbe's frontmost() reads the same way).
export const FRONTMOST_PROCESS_SCRIPT = 'lsappinfo info -only pid,bundleid "$(lsappinfo front)"';
// lsappinfo prints `"pid"=736` (macOS 26) or `pid = 736`; -> {pid, bundleId} (the id null when absent), or null without a pid.
export function parseFrontmostProcess(text) {
  const pid = Number(/"?pid"?\s*=\s*(\d+)/.exec(text)?.[1]);
  return Number.isSafeInteger(pid) && pid > 0 ? {pid, bundleId: parseFrontmost(text)} : null;
}
// FrontWindowProbe, the device-side oracle of what is in front (`swift <this file> front`, one JSON line).
export const FRONT_WINDOW_SCRIPT = fileURLToPath(new URL('./front-window.swift', import.meta.url));
// Its `front` reading as the guard's frontmost process: {pid, bundleId, topWindow} or null.
export const frontmostFromProbe = reading => (reading?.frontmost?.pid ? {...reading.frontmost, topWindow: reading.topWindow ?? null} : null);

// The frontmost application on this Mac, or null when it cannot be read.
export function localFrontmost() {
  try { return parseFrontmost(execFileSync('/bin/sh', ['-c', FRONTMOST_SCRIPT], {encoding: 'utf8', timeout: 5000})); } catch { return null; }
}

// Whether `front` is `target`: a process target ({pid, window?}) against a frontmost process ({pid, topWindow?}); a
// bundle-id target against a bundle id. A frontmost reading of the other kind does not match.
function isTarget(target, front) {
  if (typeof target === 'string') return front === target;
  if (!Number.isSafeInteger(target?.pid) || target.pid <= 0) return false;
  if (!front || typeof front !== 'object' || front.pid !== target.pid) return false;
  return target.window === undefined || (front.topWindow?.ownerPid === target.pid && front.topWindow?.number === target.window);
}
// What the skip records as the frontmost: the reading, or 'unreadable' when there is none of the target's kind.
function frontRecord(target, front) {
  if (typeof target === 'string') return front ?? 'unreadable';
  if (!front || typeof front !== 'object' || !Number.isSafeInteger(front.pid)) return 'unreadable';
  return target.window === undefined ? front : {...front, topWindow: front.topWindow ?? null};
}

// The one allowed case beside the target (M2b; the own native engine spec, Verification system part 5): the frontmost
// process is the harness's own user window's and its top window is that window, by owner pid and bounds (a window's
// number can be reused, its frame and owner together name the run's window). The background-regime cells drive a scene
// while that window is in front; any other window in front refuses as before.
const BOUNDS = ['x', 'y', 'width', 'height'];
function assertUserWindow(userWindow, target) {
  if (typeof target === 'string') throw new Error('a user window is allowed only beside a process target ({pid}), never a bundle id');
  if (!Number.isSafeInteger(userWindow?.pid) || userWindow.pid <= 0 || !BOUNDS.every(k => Number.isFinite(userWindow.bounds?.[k])))
    throw new Error('the user window must name its owner pid and its bounds {x, y, width, height}');
}
const isUserWindow = (userWindow, front) => front !== null && typeof front === 'object' && front.pid === userWindow.pid
  && front.topWindow?.ownerPid === userWindow.pid && BOUNDS.every(k => front.topWindow?.bounds?.[k] === userWindow.bounds[k]);

// Sends (`send()`) only while `target` is frontmost (`frontmost()`, sync or async; a throw counts as unreadable), or,
// given `userWindow` ({pid, bounds}: the harness's own user window of this run), while that window is the frontmost
// process's top window. `target` is a process, {pid, bundleId?, window?}, with `frontmost()` answering {pid, bundleId,
// topWindow?}, or a bundle id with `frontmost()` answering one (no user window then). -> {sent: true, result, via?:
// 'user-window'} or {sent: false, skipped: {event, keys, target, frontmost, userWindow?}}.
export async function sendIfFrontmost({target, keys, frontmost, send, userWindow}) {
  if (userWindow !== undefined) assertUserWindow(userWindow, target);
  let front;
  try { front = await frontmost(); } catch { front = null; }
  if (isTarget(target, front)) return {sent: true, result: await send()};
  if (userWindow !== undefined && isUserWindow(userWindow, front)) return {sent: true, result: await send(), via: 'user-window'};
  const record = userWindow === undefined ? frontRecord(target, front)
    : (front && typeof front === 'object' && Number.isSafeInteger(front.pid) ? {...front, topWindow: front.topWindow ?? null} : 'unreadable');
  return {sent: false, skipped: {event: KEY_SKIPPED, keys, target, frontmost: record, ...(userWindow === undefined ? {} : {userWindow})}};
}

// For a session wrapped by scripts/mini-pause.mjs pausing(): the pause wait first, then the frontmost check, then the
// cell through `dispatch`, which does not wait again, so no pause can fall between the check and the key. `args` are
// the js call's (code, timeout). A session that is not paused (no pauseWait) is checked and sent as it is.
export async function sendToPausedSession({session, target, keys, frontmost, args}) {
  await session.pauseWait?.();
  return sendIfFrontmost({target, keys, frontmost, send: () => (session.dispatch ?? session.js.bind(session))(...args)});
}
