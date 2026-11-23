// The alert guard and placement every sitting calls (rulings 1154, 1160, 1164; #117 M5): sittings A (the native
// baseline, scripts/native-baseline/macos.mjs), B (native-mac parity, scripts/repl-parity/native-mac.mjs), C (the
// matrix, scripts/native-matrix/alert-guard.mjs and its callers) and D (accept-native's TextEdit fixture and the scratch
// document, scripts/accept/textedit.mjs, ../hosted-sittings.mjs textedit) decide by these functions alone, so the four
// cannot drift apart. The device's reading comes from ./guard-device.mjs (C's from scripts/native-matrix/matrix-device.mjs),
// read fresh before each event, the same on both sides; nothing it refuses is sent, and nothing is retried.
//
// On a hosted runner replayd's capture alerts (UserNotificationCenter's windows, layer 8) stay on screen above the
// scenes for the whole run (H0 (ii); pilot A, run 45220897246): an activation covers them, nothing closes them. A pointer
// event that landed on one would answer it. So:
//   - a pointer event (a click by element or by point, a drag's ends, a scroll; an element click the engine may
//     synthesize) is refused when an alert window overlaps a window of its target (every window the target's process
//     shows, or a shared process's one recorded window, and the Open panel's), when the alert holds the front or the
//     key, or when the screen was not read (guardCause): NO VERDICT `alert` or `unread`;
//   - a key is refused when the alert holds the key (keyCause);
//   - a screen or region capture meeting an alert is NO VERDICT `alert`; a window capture of a window clear of every
//     alert is exempt, and one of a window under an alert is NO VERDICT `alert` too, since the vendor may fall back to a
//     display crop of the window's frame (F-helper-logic.md §15 item 3) (captureCause);
//   - each runner places its Finder windows clear of the alerts from a fresh reading after setup's mode switch, by the
//     smallest move on the display (clearFrame, placeWindows), and records from, to and the read-back, alike on both
//     sides; every other window stands where its launch put it (ruling 1169's venue, ./venue.mjs) and is recorded
//     where it was read. Nothing is re-placed mid-run: a window that lands under an alert later is the guard's to refuse.
// Every refusal is kept per side (each run is one side) and per cell (countGuards), and reaches the sitting's hosted
// check as NO VERDICT (./checks.mjs, `alertGuardStop`).
import {CAPTURE_ALERT_PROCESS} from '../native-matrix/live-checks.mjs';

export const CAPTURE_ALERT = CAPTURE_ALERT_PROCESS;
// The service that serves TextEdit's Open panel out of process: its window is the panel's.
export const PANEL_SERVICE = 'com.apple.appkit.xpc.openAndSavePanelService';
// The panel's windows, by the service's bundle id or, when NSRunningApplication answers none for the XPC service, by its
// process name.
export const isPanelWindow = w => w?.ownerBundleId === PANEL_SERVICE || /^(com\.apple\.appkit\.xpc\.)?open ?and ?save ?panel ?service$/i.test(w?.ownerName ?? '');
// The window list's alert windows: UserNotificationCenter's (by bundle id, or by its process name when the bundle id was
// not read), the process replayd's capture alert is shown by.
export const isAlertWindow = w => w?.ownerBundleId === CAPTURE_ALERT || w?.ownerName === 'UserNotificationCenter';

const isRect = r => Boolean(r) && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(r[k]));
// Two rectangles sharing area (edges that only touch do not).
export const overlaps = (a, b) => isRect(a) && isRect(b) && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
// A point [x, y] inside a rectangle, its edges included.
export const contains = (r, [x, y]) => isRect(r) && x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
const rectText = r => `${r.x},${r.y} ${r.width}x${r.height}`;
// A document-size window (a panel's, not one of its helper slivers).
const documentSize = w => isRect(w?.bounds) && w.bounds.width >= 100 && w.bounds.height >= 100;

// The guard's reading from one window list (./guard-device.mjs; scripts/native-matrix/system-windows.swift `windows`
// and `displays`): the alert windows' bounds, and the bounds of the target windows a pointer can be sent to. `targets`:
// [{scene, pid, number?, only?}]: every on-screen window of `pid` (the run launched the process: a document or sheet a
// cell opened among them), or with `only`, the one numbered `number` (a shared process, Finder's, that also shows the
// owner's windows); `number` marks the recorded window, kept with null bounds when it is not on screen. The Open panel's
// document-size windows are added as `openPanel`. A list the window server did not answer is unread (null), never an
// empty screen. Only the target windows' and the alerts' numbers and bounds leave, never a title.
// -> {alerts: [{number, layer, bounds}], windows: [{scene, number, recorded, bounds}], displays?} | null.
export function guardReading(windows, targets = [], displays) {
  if (!Array.isArray(windows)) return null;
  const alerts = windows.filter(isAlertWindow).map(w => ({number: w.number ?? null, layer: w.layer ?? 0, bounds: w.bounds ?? null}));
  const mine = (targets ?? []).filter(t => Number.isInteger(t?.pid)).flatMap(({scene, pid, number = null, only = false}) => {
    const shown = windows.filter(w => w.ownerPid === pid && (!only || w.number === number))
      .map(w => ({scene, number: w.number ?? null, recorded: number !== null && w.number === number, bounds: w.bounds ?? null}));
    return number !== null && !shown.some(w => w.recorded) ? [{scene, number, recorded: true, bounds: null}, ...shown] : shown;
  });
  const panels = windows.filter(w => isPanelWindow(w) && documentSize(w)).map(w => ({scene: 'openPanel', number: w.number ?? null, recorded: false, bounds: w.bounds}));
  return {alerts, windows: [...mine, ...panels], ...(Array.isArray(displays) ? {displays} : {})};
}

// Why a pointer event must not be sent, from the fresh reading: `bounds` (guardReading's, null when unread), the front
// and key applications (bundle ids), and the event's target `scenes` (null: every window read). Each of the target's
// windows, and the Open panel's, is checked against each alert. -> {category: 'alert' | 'unread', detail} | null (send).
export function guardCause(bounds, {front = null, key = null} = {}, {scenes = null} = {}) {
  if (front === CAPTURE_ALERT || key === CAPTURE_ALERT) {
    return {category: 'alert', detail: `${CAPTURE_ALERT} holds the ${[front === CAPTURE_ALERT && 'front', key === CAPTURE_ALERT && 'key'].filter(Boolean).join(' and ')}`};
  }
  return overlapCause(bounds, scenes);
}
function overlapCause(bounds, scenes) {
  if (!Array.isArray(bounds?.alerts) || !Array.isArray(bounds?.windows)) return {category: 'unread', detail: 'the on-screen windows were not read: the alert windows\' bounds are unknown'};
  const unbounded = bounds.alerts.find(a => !isRect(a.bounds));
  if (unbounded) return {category: 'unread', detail: `alert window ${unbounded.number ?? '?'} has no readable bounds`};
  const targets = bounds.windows.filter(w => scenes === null || scenes.includes(w.scene) || w.scene === 'openPanel');
  for (const alert of bounds.alerts) {
    const hit = targets.find(w => overlaps(alert.bounds, w.bounds));
    if (hit) return {category: 'alert', detail: `alert window ${alert.number ?? '?'} (${rectText(alert.bounds)}) overlaps the ${hit.scene} window ${hit.number ?? '?'} (${rectText(hit.bounds)})`};
  }
  return null;
}

// Why a key must not be sent: the alert holds the key, where the keys would go. The front is the key guard's own
// (scripts/accept/key-guard.mjs sendIfFrontmost). -> {category: 'alert', detail} | null.
// The key-cell premise every sitting shares (A, C and D): a key cell sends no pointer event of the harness's, and the
// activation click cua's route 3 may synthesize around a keyed typeText, a paste or an element action is posted to the
// target's pid and window only (native/engine/Sources/Engine/Activation.swift: "Only the target's pid and window are
// posted to"; activate()), never to whatever is under the point. So a key cell is checked for the alert holding the key
// (here) or the front (the key guard), not for an alert overlapping the target's windows. A key reading that could not
// be taken refuses nothing here, and the cell, if the front check then sends it, goes unguarded against the alert
// holding the key: the key guard's front check cannot see UserNotificationCenter holding the key while the target is in
// front. Every such guard is counted (recordKeyUnread), so a sitting shows how many key cells went unchecked.
export const keyCause = ({key = null} = {}) => (key === CAPTURE_ALERT ? {category: 'alert', detail: `${CAPTURE_ALERT} holds the key`} : null);
// A key cell guarded with its key reading not taken (see keyCause), counted per cell in the record its side keeps, beside
// the refusals: `keyUnread: {cell: n}`. It is counted at the guard, before the front check, so it counts the key cells
// guarded unread, whether or not the front check then sent them.
export function recordKeyUnread(record, cell) {
  const counts = record.keyUnread ??= {};
  counts[cell] = (counts[cell] ?? 0) + 1;
}

// The key-window requirement (the design session's addition to ruling 1169, after pilot B's diagnostic run 45254955711
// read the Electron fixture frontmost with no key window, where TextEdit, Finder and Chrome each held their own): before
// a click or key cell the scene's app holds the scene window as its own key window. Not the front: a background cell
// still runs in the background. The reading (`ownKey`, ./key-window.mjs, taken on the device outside either engine) is
// the app's own AXFocusedWindow and AXMainWindow against the scene window ('run', 'other' or 'none') and its
// AXFrontmost. The scene window must be the app's focused window; an app that is not frontmost may hold no focused
// window while keeping its main one, which is then the window it makes key when it is activated, so there the scene
// window as its main window, with no other focused, holds too. A reading not taken (an untrusted reader, a failed read,
// the scene window not on screen) refuses nothing: the cell goes unchecked and is counted (recordKeyWindowReading), as a
// key cell's unread key is. -> {category: 'keyWindow', detail} | null.
const ownWindowText = w => (w === 'run' ? 'the scene window' : w === 'other' ? 'another of its windows' : 'none');
export function keyWindowCause(ownKey) {
  if (ownKey?.trusted !== true || ownKey.ok !== true) return null;
  const {scene, number, frontmost, focusedWindow, mainWindow} = ownKey;
  if (focusedWindow === 'run' || (frontmost === false && focusedWindow === 'none' && mainWindow === 'run')) return null;
  const which = `the scene window ${number ?? '?'}`;
  if (focusedWindow === 'other') return {category: 'keyWindow', detail: `the ${scene} app's key window is another of its windows, not ${which}`};
  return {category: 'keyWindow', detail: `the ${scene} app holds no key window (its focused window ${ownWindowText(focusedWindow)}, its main window ${mainWindow === 'run' ? which : ownWindowText(mainWindow)}) while ${frontmost === false ? 'in the background' : 'frontmost'}`};
}
// The key-window reading of a click or key cell that is sent (`ownKey`, ./key-window.mjs; null when the guard's reading
// itself was not taken), counted per cell in the record its side keeps: taken (`keyWindowRead: {cell: n}`), or not
// taken, with why (`keyWindowUnread: {cell: n}`, `keyWindowUnreadReasons: {cell: {reason: n}}`). A cell refused for its
// key window is counted as a refusal instead (recordRefusal). The sitting's own readings judge whether the requirement
// was observed (./counts.mjs renderKeyWindowObserved).
export function recordKeyWindowReading(record, cell, ownKey) {
  if (ownKey?.trusted === true && ownKey.ok === true) {
    const read = record.keyWindowRead ??= {};
    read[cell] = (read[cell] ?? 0) + 1;
    return;
  }
  const counts = record.keyWindowUnread ??= {};
  counts[cell] = (counts[cell] ?? 0) + 1;
  const reason = ownKey?.reason ?? (ownKey ? 'unread' : 'the guard reading was not taken');
  const why = (record.keyWindowUnreadReasons ??= {})[cell] ??= {};
  why[reason] = (why[reason] ?? 0) + 1;
}

// Why a capture is NO VERDICT, from the fresh reading: `kind` 'window' (the target `scenes`' windows: one under an alert
// may come back as the vendor's display crop showing it; one clear of every alert is exempt), 'screen' (any alert at all)
// or 'region' (an alert meeting `region`). Front and key do not matter: only what the capture shows. -> cause | null.
export function captureCause(bounds, {kind = 'window', scenes = null, region = null} = {}) {
  if (kind === 'window') return overlapCause(bounds, scenes);
  if (!Array.isArray(bounds?.alerts)) return {category: 'unread', detail: 'the on-screen windows were not read: the alert windows\' bounds are unknown'};
  const unbounded = bounds.alerts.find(a => !isRect(a.bounds));
  if (unbounded) return {category: 'unread', detail: `alert window ${unbounded.number ?? '?'} has no readable bounds`};
  const hit = bounds.alerts.find(a => kind === 'screen' || overlaps(a.bounds, region));
  return hit ? {category: 'alert', detail: `alert window ${hit.number ?? '?'} (${rectText(hit.bounds)}) is in the ${kind === 'screen' ? 'screen' : `region ${rectText(region)}`} captured`} : null;
}

// The menu bar's height a placed window stays below, and the margin it keeps from an alert.
export const MENU_BAR = 25;
export const ALERT_MARGIN = 8;
// A window frame clear of every alert: `frame` itself when it overlaps none; otherwise, of the frames of the same size
// beside an alert (left, right, above or below it, or at the display's edges) that lie on the frame's display below the
// menu bar and overlap no alert, the one the smallest move away (by |dx| + |dy|, the first in that order on a tie).
// `alerts`: rectangles or {bounds}; `displays`: the screens' rectangles in the window list's coordinates.
// -> {frame, moved: boolean} | {frame: null, moved: false, reason}.
export function clearFrame(frame, alerts, displays) {
  const rects = (alerts ?? []).map(a => a?.bounds ?? a).filter(isRect);
  if (!rects.some(r => overlaps(r, frame))) return {frame, moved: false};
  const area = (displays ?? []).find(d => overlaps(d, frame)) ?? (displays ?? []).find(isRect);
  if (!isRect(area)) return {frame: null, moved: false, reason: 'no display was read to place the window on'};
  const {width, height} = frame, top = area.y + MENU_BAR;
  const xs = [frame.x, area.x, area.x + area.width - width, ...rects.flatMap(r => [r.x - width - ALERT_MARGIN, r.x + r.width + ALERT_MARGIN])];
  const ys = [frame.y, top, area.y + area.height - height, ...rects.flatMap(r => [r.y - height - ALERT_MARGIN, r.y + r.height + ALERT_MARGIN])];
  let best = null;
  for (const x of xs.map(Math.round)) for (const y of ys.map(Math.round)) {
    const at = {x, y, width, height};
    if (x < area.x || x + width > area.x + area.width || y < top || y + height > area.y + area.height) continue;
    if (rects.some(r => overlaps(r, at))) continue;
    const move = Math.abs(x - frame.x) + Math.abs(y - frame.y);
    if (!best || move < best.move) best = {frame: at, move};
  }
  return best ? {frame: best.frame, moved: true} : {frame: null, moved: false, reason: `no ${width}x${height} frame on the display clears the alert windows`};
}

// The scenes whose windows the runner's frame probe can move: the approved engine's `--probe window-frame` moves Finder
// windows only and refuses every other process (native/engine/Sources/Engine/WindowFrameProbe.swift, exit 2), so no
// other window is offered to it (ruling 1169 places those at launch or by their own preferences instead).
export const FRAME_PROBE_SCENES = Object.freeze(['finder']);
const sameRect = (a, b) => ['x', 'y', 'width', 'height'].every(k => a[k] === b[k]);
// Why a move the probe was asked for did not place the window, from its answer ({readBack, matched, exitStatus} or
// {error}).
const unplaced = answer => {
  if (answer?.refused) return `the move was refused: ${answer.refused}`;
  if (answer?.error) return `the move failed: ${answer.error}`;
  const readBack = isRect(answer?.readBack) ? `: it read back at ${rectText(answer.readBack)}` : ': no read-back';
  return `the frame probe did not place it (exit ${answer?.exitStatus ?? 'unknown'})${readBack}`;
};
// The windows of one fresh reading (guardReading's) placed clear of its alerts: each window `select` keeps (every bounded
// window by default) that overlaps an alert is moved by `move({scene, number, frame})` -> {readBack, matched, exitStatus}
// | {error} (the runner's frame probe), when the probe can move it (FRAME_PROBE_SCENES), and recorded alike on both
// sides. A window is `moved` only when it read back somewhere other than where it was read (`from`); one the probe was
// not asked to move, or did not place, says why (`reason`), and stands where it was last read, for the guard to refuse
// what an alert overlaps. -> {alerts, displays, windows: [{scene, number, from, moved, to?, readBack?, matched?,
// reason?}]}, or {unread: true} when the screen was not read (nothing placed: the guard then refuses what would overlap).
export async function placeWindows(bounds, {move, select = () => true}) {
  if (!Array.isArray(bounds?.alerts) || !Array.isArray(bounds?.windows)) return {unread: true};
  const alerts = bounds.alerts.map(a => a.bounds), placed = [];
  for (const w of bounds.windows.filter(w => isRect(w.bounds) && select(w))) {
    const {frame, moved, reason} = clearFrame(w.bounds, alerts, bounds.displays);
    const entry = {scene: w.scene, number: w.number, from: w.bounds};
    if (!moved) { placed.push({...entry, moved: false, ...(reason ? {reason} : {})}); continue; }
    if (!FRAME_PROBE_SCENES.includes(w.scene)) {
      placed.push({...entry, moved: false, reason: `the frame probe moves Finder windows only: the ${w.scene} window stays where it was read, under an alert`});
      continue;
    }
    const answer = await move({scene: w.scene, number: w.number, frame});
    const readBack = isRect(answer?.readBack) ? answer.readBack : null, matched = answer?.matched === true;
    placed.push({...entry, to: frame, moved: readBack !== null && !sameRect(readBack, w.bounds), readBack, matched, ...(matched ? {} : {reason: unplaced(answer)})});
  }
  return {alerts, displays: bounds.displays ?? null, windows: placed};
}

// What a refused event's row carries: its cause, which makes the sample NO VERDICT (scripts/native-matrix/front-key.mjs
// sampleCause), and an invalid reason as a backstop, so no statistic or verdict reads it.
export const GUARD_INVALID = 'the alert guard refused the cell: nothing of it was sent';
export const guardMark = cause => ({alertGuard: {cause: cause.category, detail: cause.detail}, invalid: GUARD_INVALID});
// The refusals of one side, per cell and cause: [{cell, cause}] -> {cell: {alert, unread, keyWindow?}} (keyWindow
// counted where the key-window requirement refused one).
export function countGuards(entries) {
  const counts = {};
  for (const {cell, cause} of entries ?? []) {
    const n = counts[cell] ??= {alert: 0, unread: 0};
    if (cause === 'keyWindow') n.keyWindow = (n.keyWindow ?? 0) + 1;
    else if (cause in n) n[cause]++;
  }
  return counts;
}
// A refusal as every sitting records it, in the record it keeps (A's and B's meta, D's observations): the per-cell entry
// (`extra`: the sample, say), the counts, the first refusal as the stop the hosted checks read. -> the row's mark.
export function recordRefusal(record, cell, cause, extra = {}) {
  (record.alertGuards ??= []).push({cell, ...extra, cause: cause.category, detail: cause.detail});
  record.alertGuardCounts = countGuards(record.alertGuards);
  record.alertGuardStop ??= {cause: cause.category, detail: cause.detail, at: cell};
  return guardMark(cause);
}
