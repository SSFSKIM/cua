// The alert guard (ruling 1154; #117 M5): no cell of the matrix sends a pointer event where replayd's capture alert
// could take it. On a hosted runner the alert stays on screen above the scenes (H0 (ii)), and a click, a drag's ends or a
// scroll that landed on it would answer it. So before any cell that sends a pointer event, on either engine alike, the
// device reads the on-screen windows afresh (./matrix-device.mjs read --with alert-bounds), and the cell is refused,
// never sent and never retried, when:
//   - an alert window (UserNotificationCenter's) overlaps a window of the run (a scene's, the Open panel's): every
//     pointer event a cell sends lands inside the window of the element or point it names, so a window clear of every
//     alert keeps each of its points clear. A point inside an alert is always inside an overlap; the guard refuses on the
//     window, the conservative superset, since an element's point is the engine's to compute;
//   - the alert holds the front or the key;
//   - the window list was not read: no bounds, no proof the points are clear.
// The refused sample is NO VERDICT, `alert` or `unread` (./front-key.mjs sampleCause). A keyboard cell is refused when the
// alert holds the key (./steps.mjs sendKeys). Screenshots: both engines capture the target's window alone (cua's engine
// by SCContentFilter(desktopIndependentWindow:), the vendor's by its window filter), which an alert above it cannot enter,
// so a capture is exempt; no matrix cell compares a display region.
//
// Avoidance keeps the guard from refusing whole scenes: a scene window that would overlap an alert is moved clear of it,
// the same size, by the smallest move that stays on its display (clearFrame); the run places its windows so on both
// sides alike (./run.mjs placeScenes), and the hosted setup records where each planned window would go
// (scripts/hosted-sittings/setup.mjs).
import {CAPTURE_ALERT_PROCESS} from './live-checks.mjs';

// The service that serves TextEdit's Open panel out of process: its window is the panel's.
export const PANEL_SERVICE = 'com.apple.appkit.xpc.openAndSavePanelService';
// The cells that send pointer events: a click (by element or by point), a drag, a scroll at an element. An element
// click may go by an accessibility action instead; the guard does not know beforehand, so it treats it as a pointer.
const POINTER_CALL = /\.(?:click|drag|scroll)\(/;
export const sendsPointer = code => POINTER_CALL.test(String(code ?? ''));

// The window list's alert windows: UserNotificationCenter's (by bundle id, or by its process name when the bundle id was
// not read), the process replayd's capture alert is shown by.
export const isAlertWindow = w => w?.ownerBundleId === CAPTURE_ALERT_PROCESS || w?.ownerName === 'UserNotificationCenter';

const isRect = r => Boolean(r) && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(r[k]));
// Two rectangles sharing area (edges that only touch do not).
export const overlaps = (a, b) => isRect(a) && isRect(b) && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
// A point [x, y] inside a rectangle, its edges included.
export const contains = (r, [x, y]) => isRect(r) && x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
const rectText = r => `${r.x},${r.y} ${r.width}x${r.height}`;
// A document-size window (a panel's, not one of its helper slivers).
const documentSize = w => isRect(w?.bounds) && w.bounds.width >= 100 && w.bounds.height >= 100;

// The device's reading (./system-windows.swift `windows` and `displays`, the run's scene records): the alert windows'
// bounds, and the bounds of the run's windows a pointer can be sent to, each scene's by its recorded pid and window number
// (null when it is not on screen) and the Open panel's. A list the window server did not answer is unread (null), never
// an empty screen. Only the run's own windows and the alerts' bounds leave the device, never a title.
// -> {alerts: [{number, layer, bounds}], windows: [{scene, bounds}], displays?} | null.
export function alertBoundsOf(windows, scenes = {}, displays) {
  if (!Array.isArray(windows)) return null;
  const alerts = windows.filter(isAlertWindow).map(w => ({number: w.number ?? null, layer: w.layer ?? 0, bounds: w.bounds ?? null}));
  const own = Object.entries(scenes ?? {}).filter(([, r]) => Number.isInteger(r?.pid) && Number.isInteger(r?.window?.number))
    .map(([scene, r]) => ({scene, bounds: windows.find(w => w.ownerPid === r.pid && w.number === r.window.number)?.bounds ?? null}));
  const panels = windows.filter(w => w.ownerBundleId === PANEL_SERVICE && documentSize(w)).map(w => ({scene: 'openPanel', bounds: w.bounds}));
  return {alerts, windows: [...own, ...panels], ...(Array.isArray(displays) ? {displays} : {})};
}

// Why a pointer cell must not be sent, from the device's fresh reading: `bounds` (alertBoundsOf's, null when unread) and
// the front and key applications (bundle ids). -> {category: 'alert' | 'unread', detail} | null (send it).
export function guardCause(bounds, {front = null, key = null} = {}) {
  if (front === CAPTURE_ALERT_PROCESS || key === CAPTURE_ALERT_PROCESS) {
    return {category: 'alert', detail: `${CAPTURE_ALERT_PROCESS} holds the ${[front === CAPTURE_ALERT_PROCESS && 'front', key === CAPTURE_ALERT_PROCESS && 'key'].filter(Boolean).join(' and ')}`};
  }
  if (!Array.isArray(bounds?.alerts) || !Array.isArray(bounds?.windows)) return {category: 'unread', detail: 'the on-screen windows were not read: the alert windows\' bounds are unknown'};
  const unbounded = bounds.alerts.find(a => !isRect(a.bounds));
  if (unbounded) return {category: 'unread', detail: `alert window ${unbounded.number ?? '?'} has no readable bounds`};
  for (const alert of bounds.alerts) {
    const hit = bounds.windows.find(w => overlaps(alert.bounds, w.bounds));
    if (hit) return {category: 'alert', detail: `alert window ${alert.number ?? '?'} (${rectText(alert.bounds)}) overlaps the ${hit.scene} window (${rectText(hit.bounds)})`};
  }
  return null;
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
