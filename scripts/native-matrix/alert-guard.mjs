// The alert guard (ruling 1154; #117 M5): no cell of the matrix sends a pointer event where replayd's capture alert
// could take it. On a hosted runner the alert stays on screen above the scenes (H0 (ii)), and a click, a drag's ends or a
// scroll that landed on it would answer it. So before any cell that sends a pointer event, on either engine alike, the
// device reads the on-screen windows afresh (./matrix-device.mjs read --with alert-bounds), and the cell is refused,
// never sent and never retried, when:
//   - an alert window (UserNotificationCenter's) overlaps a window of the cell's target: every window the scene's own
//     process shows (a document it opened, a sheet; Finder's, which also shows the owner's, only the run's recorded
//     one), and the Open panel's. A click, a drag's ends or an element scroll lands inside the window of the element or
//     point it names, so a window clear of every alert keeps those points clear. A point inside an alert is always
//     inside an overlap; the guard refuses on the window, the conservative superset, since an element's point is the
//     engine's to compute. The target is the scene the cell's prelude binds (./matrix-cells.mjs); a cell bound to none
//     is checked against every window of the run;
//   - the alert holds the front or the key;
//   - the window list was not read: no bounds, no proof the points are clear.
// Not every event an engine posts lands in the window: cua's route 3 (Activation.swift) may post an inert click outside
// the window's frame, stamped with its window number, around a paste, a keyed typeText or an element action, and an
// element action's held activation (a secondary action's Scroll Down among them) may do the same. The window test does
// not place those; avoidance below keeps the run's windows, and so their surroundings, clear of the alerts it saw.
// The refused sample is NO VERDICT, `alert` or `unread` (./front-key.mjs sampleCause); one the key-window requirement refused
// (./steps.mjs keyWindowGuard), `keyWindow`. A keyboard cell is refused when the
// alert holds the key (./steps.mjs sendKeys). Screenshots: cua's engine captures the target's window alone
// (SCContentFilter(desktopIndependentWindow:)); the vendor captures by window too, but falls back to a display capture
// cropped to the window's frame when the window is absent from shareable content (F-helper-logic.md §15 item 3), which
// would show an alert above it. The harness cannot tell which it took, so a screenshot sample whose target window
// overlaps an alert at its fresh read is NO VERDICT `alert` (./run.mjs speedCells); one of a window clear of every alert
// is exempt.
//
// Avoidance keeps the guard from refusing whole scenes: a scene window that would overlap an alert is moved clear of it,
// the same size, by the smallest move that stays on its display (clearFrame); the run places its windows so on both
// sides alike (./run.mjs placeScenes), and the hosted setup records where each planned window would go
// (scripts/hosted-sittings/setup.mjs).
//
// The rules themselves (guardCause, clearFrame, placeWindows, the alert and panel windows) are the one module every
// sitting calls, scripts/hosted-sittings/alert-guard.mjs (rulings 1160, 1164); what stays here is the matrix's own: which
// of its cells send a pointer, the scene a cell binds, and its reading from the scenes' records.
import {SCENES} from '../repl-parity/scenes-mac.mjs';
import {guardReading} from '../hosted-sittings/alert-guard.mjs';

export {ALERT_MARGIN, clearFrame, contains, guardCause, isAlertWindow, isPanelWindow, MENU_BAR, overlaps, PANEL_SERVICE, recordKeyUnread} from '../hosted-sittings/alert-guard.mjs';

// The scene a cell's code is bound to: the one its prelude takes `__app` from (./matrix-cells.mjs sceneHead), or null.
export const sceneOfCell = code => /const __app = globalThis\.__apps\?\.\["([a-z]+)"\];/.exec(String(code ?? ''))?.[1] ?? null;
// The cells that send pointer events: a click (by element or by point), a drag, a scroll at an element. An element
// click may go by an accessibility action instead; the guard does not know beforehand, so it treats it as a pointer.
const POINTER_CALL = /\.(?:click|drag|scroll)\(/;
export const sendsPointer = code => POINTER_CALL.test(String(code ?? ''));

// The device's reading (./system-windows.swift `windows` and `displays`, the run's scene records) as the shared reading
// (guardReading) of the run's windows: for a scene whose process the run launched, every on-screen window of that
// process (a document or sheet a cell opened among them); for Finder, the system's process that also shows the owner's
// windows, only the run's recorded one; and the Open panel's. A scene's recorded window not on screen is kept with null
// bounds. A list the window server did not answer is unread (null), never an empty screen. Only the run's own windows
// and the alerts' bounds leave the device, never a title.
// -> {alerts: [{number, layer, bounds}], windows: [{scene, number, recorded, bounds}], displays?} | null.
export function alertBoundsOf(windows, scenes = {}, displays) {
  const targets = Object.entries(scenes ?? {}).filter(([, r]) => Number.isInteger(r?.pid) && Number.isInteger(r?.window?.number))
    .map(([scene, r]) => ({scene, pid: r.pid, number: r.window.number, only: SCENES[scene]?.process !== 'run'}));
  return guardReading(windows, targets, displays);
}
