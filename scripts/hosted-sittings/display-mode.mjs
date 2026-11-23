// Setup's display mode (ruling 1164; #117 M5): both hosted images run their one virtual display at 1024x768 (mode 3),
// where no scene window can be placed clear of replayd's alerts, and offer 1920x1080 as their widest mode (run
// 45233464944). So after the warm-ups, which raise the alerts at 1024x768 as before (one per copy, ./warm-up.mjs), setup
// switches the display to 1920x1080, chosen by size (1x, usable for the desktop), for the session
// (CGCompleteDisplayConfiguration .forSession, which outlives this process; app-only would revert when it exits), through
// ./display-modes.swift `set`. Around the switch:
//   - before: the display's mode and the alert windows (UserNotificationCenter's: number, layer, bounds) and the front;
//   - the switch, its mode and the display read back (CGDisplayBounds and the current mode): anything but 1920x1080
//     fails the setup;
//   - for MODE_WATCH_MS after it, the window list and the front watched: a UserNotificationCenter or System Settings
//     window that was not there before, or System Settings in front, is a prompt. It is recorded and fails the setup;
//     nothing here answers, clicks or closes it;
//   - after: the alert windows read fresh. Alerts that moved with the display (re-centred) are recorded; the placement
//     that follows uses only these fresh bounds, and a scene it cannot clear (Chrome's 1000x760 under a re-centred
//     alert) stays the guard's to refuse, NO VERDICT alert.
// The record (setup.json `modeSwitch`): {before: {mode, alerts, front}, set, readBack: {bounds, mode}, after: {alerts,
// front}, promptSeen: [...], recentred: [{number, from, to}], watchedMs}. Refuses off a GitHub-hosted runner before
// reading anything. At a sitting's end the alert windows and the mode are read again (screenAtEnd), so the alerts'
// survival and the mode's hold are shown.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {FRONTMOST_PROCESS_SCRIPT, parseFrontmostProcess} from '../accept/key-guard.mjs';
import {isAlertWindow} from './alert-guard.mjs';
import {assertGithubHosted} from './runner.mjs';

export const TARGET_MODE = Object.freeze({width: 1920, height: 1080});
export const MODE_WATCH_MS = 3_000;
export const MODE_POLL_MS = 500;
// The prompts a display change could raise: a UserNotificationCenter alert, or System Settings (its Displays pane).
export const SETTINGS_BUNDLE = 'com.apple.systempreferences';
const isSettingsWindow = w => w?.ownerBundleId === SETTINGS_BUNDLE || w?.ownerName === 'System Settings';
const isPromptWindow = w => isAlertWindow(w) || isSettingsWindow(w);

const DISPLAY_MODES_SCRIPT = fileURLToPath(new URL('./display-modes.swift', import.meta.url));
const SYSTEM_WINDOWS_SCRIPT = fileURLToPath(new URL('../native-matrix/system-windows.swift', import.meta.url));
const tryRead = read => { try { return read() ?? null; } catch { return null; } };
const sleepFor = ms => new Promise(resolve => setTimeout(resolve, ms));

// A display mode as the record keeps it.
const modeFacts = m => (m && Number.isFinite(m.width) ? {width: m.width, height: m.height, modeId: m.modeId ?? null, pixelWidth: m.pixelWidth ?? null, pixelHeight: m.pixelHeight ?? null} : null);
const mainDisplay = listing => (listing?.displays ?? []).find(d => d.main) ?? listing?.displays?.[0] ?? null;
const sizeText = m => (m ? `${m.width}x${m.height}` : 'unread');
// The main display's offered mode of `size`: 1x (its pixels its points) and usable for the desktop, by size, never by id.
// `listing`: ./display-modes.swift's. -> the mode, or null.
export const modeOf = (listing, {width, height}) => (mainDisplay(listing)?.modes ?? [])
  .find(m => m.width === width && m.height === height && m.pixelWidth === width && m.pixelHeight === height && m.usableForDesktopGUI !== false) ?? null;
// The alert windows of a list (number, layer, bounds; never a title), or null for an unread list.
const alertsOf = list => (Array.isArray(list) ? list.filter(isAlertWindow).map(w => ({number: w.number ?? null, layer: w.layer ?? 0, bounds: w.bounds ?? null})) : null);
const sameRect = (a, b) => ['x', 'y', 'width', 'height'].every(k => a?.[k] === b?.[k]);

// deps: {env, platform, display: {read() -> ./display-modes.swift's listing, set({width, height}) -> {set, readBack:
// {bounds, current}} | {error}}, windows() -> the window list (../native-matrix/system-windows.swift `windows`),
// frontmost() -> {bundleId}, sleep, now, watchMs, pollMs}. -> {ok, detail, record}.
export async function switchDisplayMode({env = process.env, platform = process.platform, display = displayIo(), windows = windowList,
  frontmost = frontApp, sleep = sleepFor, now = () => performance.now(), watchMs = MODE_WATCH_MS, pollMs = MODE_POLL_MS} = {}) {
  assertGithubHosted(env, platform, 'the display mode switch');
  const beforeList = tryRead(windows), beforeDisplay = tryRead(display.read);
  const record = {before: {mode: modeFacts(mainDisplay(beforeDisplay)?.current), alerts: alertsOf(beforeList), front: tryRead(frontmost)?.bundleId ?? null},
    set: null, readBack: null, after: {alerts: null, front: null}, promptSeen: [], recentred: [], watchedMs: 0};
  const fail = detail => ({ok: false, detail, record});
  if (!Array.isArray(beforeList)) return fail('the window list was not read before the switch: a prompt across it could not be seen; nothing was set');
  const target = modeOf(beforeDisplay, TARGET_MODE);
  if (!target) return fail(`no ${sizeText(TARGET_MODE)} mode offered at 1x on the main display (${beforeDisplay ? 'listed' : 'the display was not read'}); nothing was set`);
  let answer;
  try { answer = display.set(TARGET_MODE); } catch (error) { answer = {error: error.message}; }
  record.set = modeFacts(answer?.set ?? null);
  record.readBack = answer?.readBack ? {bounds: answer.readBack.bounds ?? null, mode: modeFacts(answer.readBack.current)} : null;

  // The watch: every new prompt window and the fronts seen, until the bound.
  const known = new Set(beforeList.filter(isPromptWindow).map(w => w.number));
  const started = now();
  let last = null, front = null;
  for (;;) {
    last = tryRead(windows);
    front = tryRead(frontmost)?.bundleId ?? null;
    for (const w of Array.isArray(last) ? last.filter(isPromptWindow) : []) {
      if (known.has(w.number)) continue;
      known.add(w.number);
      record.promptSeen.push({number: w.number ?? null, owner: isAlertWindow(w) ? 'UserNotificationCenter' : 'System Settings', layer: w.layer ?? 0, bounds: w.bounds ?? null});
    }
    if (front === SETTINGS_BUNDLE && !record.promptSeen.some(p => p.front)) record.promptSeen.push({front});
    if (now() - started >= watchMs) break;
    await sleep(pollMs);
  }
  record.watchedMs = Math.round(now() - started);
  record.after = {alerts: alertsOf(last), front};
  const before = new Map(record.before.alerts.map(a => [a.number, a.bounds]));
  record.recentred = (record.after.alerts ?? []).filter(a => before.has(a.number) && !sameRect(before.get(a.number), a.bounds)).map(a => ({number: a.number, from: before.get(a.number), to: a.bounds}));

  if (answer?.error) return fail(`the switch to ${sizeText(TARGET_MODE)} failed: ${answer.error}`);
  const read = record.readBack;
  if (!read?.mode || read.mode.width !== TARGET_MODE.width || read.mode.height !== TARGET_MODE.height || read.bounds?.width !== TARGET_MODE.width || read.bounds?.height !== TARGET_MODE.height) {
    return fail(`the display read back ${sizeText(read?.mode)} (bounds ${sizeText(read?.bounds)}), not ${sizeText(TARGET_MODE)}`);
  }
  if (record.promptSeen.length) {
    return fail(`a prompt appeared across the switch (${record.promptSeen.map(p => (p.front ? `${p.front} in front` : `${p.owner} window ${p.number}`)).join(', ')}): recorded, never answered`);
  }
  if (!Array.isArray(last)) return fail('the window list was not read after the switch: a prompt across it could not be seen');
  const n = record.after.alerts.length;
  return {ok: true, record, detail: `${sizeText(record.before.mode)} (mode ${record.before.mode?.modeId ?? '?'}) -> ${sizeText(record.set)} (mode ${record.set?.modeId ?? '?'}), read back ${sizeText(read.mode)}; `
    + `${n} alert window${n === 1 ? '' : 's'}, ${record.recentred.length ? `${record.recentred.length} re-centred` : 'none moved'}; no prompt`};
}

// The screen at a sitting's end: the alert windows (number, layer, bounds) and the main display's mode and bounds, and
// whether the mode is still TARGET_MODE (null when the display was not read). deps: {display (a listing), windows (a list)}.
export function screenAtEnd({display, windows}) {
  const main = mainDisplay(display), mode = modeFacts(main?.current);
  return {alerts: alertsOf(windows), mode, bounds: main?.bounds ?? null, modeHeld: mode ? mode.width === TARGET_MODE.width && mode.height === TARGET_MODE.height : null};
}

// The real readings: ./display-modes.swift (the listing, and `set`), the window list and the front application.
const swiftJson = args => JSON.parse(spawnSync('swift', args, {encoding: 'utf8', timeout: 120_000}).stdout);
export const displayIo = () => ({read: () => swiftJson([DISPLAY_MODES_SCRIPT]), set: ({width, height}) => swiftJson([DISPLAY_MODES_SCRIPT, 'set', String(width), String(height)])});
export const windowList = () => swiftJson([SYSTEM_WINDOWS_SCRIPT]).windows;
export const frontApp = () => parseFrontmostProcess(spawnSync('/bin/sh', ['-c', FRONTMOST_PROCESS_SCRIPT], {encoding: 'utf8', timeout: 10_000}).stdout ?? '');
// The screen at the end, read for real (see screenAtEnd). Reads only.
export const readScreenAtEnd = () => screenAtEnd({display: tryRead(displayIo().read), windows: tryRead(windowList)});
