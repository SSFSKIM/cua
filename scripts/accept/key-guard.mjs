// The frontmost guard for the harnesses' TextEdit keys (#162). Twice on the mini, after native runs whose helper sent
// super+w and super+q to TextEdit, the owner's Chrome window closed: the keys may reach whatever app is frontmost
// rather than the bound one. Until #162 is understood, a cell that sends a key (super+n, typing, super+w, super+q)
// runs only while the run's target app is the frontmost application. Otherwise the cell is not sent at all, the skip
// is recorded as `key_skipped_not_frontmost` with the frontmost app's bundle id, and the caller fails its run with no
// further input. A frontmost app that cannot be read counts as not the target.
// The check is made by the harness right before it sends the cell, outside the sandbox (cells cannot ask
// LaunchServices); the cell's own check that TextEdit's front window is the expected document stays. What remains is
// the time between this read and the key inside the cell (an AX read, well under a second).
// Callers: scripts/native-baseline/macos.mjs (the device over ssh) and scripts/accept/textedit.mjs (on the Mac itself).
import {execFileSync} from 'node:child_process';

export const KEY_SKIPPED = 'key_skipped_not_frontmost';
// The frontmost application's bundle id, as scripts/mini-rules.mjs reads it.
export const FRONTMOST_SCRIPT = 'lsappinfo info -only bundleid "$(lsappinfo front)"';

// lsappinfo prints `"CFBundleIdentifier"="<id>"` (macOS 26) or `bundleID="<id>"`; -> the id, or null.
export const parseFrontmost = text => /(?:bundleID|"CFBundleIdentifier")="([^"]+)"/.exec(text)?.[1] ?? null;

// The frontmost application on this Mac, or null when it cannot be read.
export function localFrontmost() {
  try { return parseFrontmost(execFileSync('/bin/sh', ['-c', FRONTMOST_SCRIPT], {encoding: 'utf8', timeout: 5000})); } catch { return null; }
}

// Sends (`send()`) only while `target` is frontmost (`frontmost()`, sync or async; a throw counts as unreadable).
// -> {sent: true, result} or {sent: false, skipped: {event, keys, target, frontmost}}.
export async function sendIfFrontmost({target, keys, frontmost, send}) {
  let front;
  try { front = await frontmost(); } catch { front = null; }
  if (front !== target) return {sent: false, skipped: {event: KEY_SKIPPED, keys, target, frontmost: front ?? 'unreadable'}};
  return {sent: true, result: await send()};
}
