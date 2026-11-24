// TextEdit's panels in a matrix run (./run.mjs; rulings 1169, 1195 and 1196): the Open panel (⌘O from the scene's
// document) and the Save sheet of an untitled document (⌘N once, then ⌘S), both drawn by the panel service out of
// process, each opened for one case at a time and closed after it, alike on both lanes.
//
// Placement (ruling 1195). The system centres the Open panel (520,162 880x448 on the runner), over replayd's centred
// capture alerts, so the alert guard refused every pointer cell on it in pilot C-2. On a GitHub-hosted runner each
// opening's window, told from TextEdit's windows read just before the opening key (macOS 27 lists the panel under
// TextEdit's pid) or as the panel service's own, is moved into the strip left of the alerts (stripCause) by the
// harness's device side (./matrix-device.mjs place, ./panel-ax.swift: AXSize then AXPosition, never the engine under
// test), to the venue's panel frame, and read back from the window list. A panel already in the strip is not moved.
// Each opening is kept in meta.placement.panel ({beforeRow, target, number, from, to?, resized?: {from, to} (ruling 1199:
// the frame asked is another size, so the panel was resized as well as moved), readBack?, matched?, ax?, moved, inStrip,
// reason?}, or {beforeRow, target, unread | found: false}); a read-back that misses the strip makes the case
// on that opening NO VERDICT `venue`, naming where it stood. Off a hosted runner nothing is moved: the device refuses it.
//
// The close (ruling 1195), one rule on both lanes: Escape under the key guard; when that did not close it, its Cancel
// clicked under the alert guard; when neither did (the key ineffective, the click refused or ineffective), the rows of
// that opening say nothing (`panelClose` {cause, detail}: NO VERDICT by the refusal's cause, else `invalid`), the device
// cancels the known panel by Accessibility (./matrix-device.mjs panel cancel: no pointer event, nothing the guard
// refuses), and the run goes on. Only a panel still up after that stops the run (PanelStuck). Every step and its
// outcome is kept in meta.panelCloses ({beforeRow, target, steps: [{step: escape|cancel|device, ...}], rowsMarked?,
// closed}). In pilot C-2 cua's Escape ran unrefused and did not close the Open panel; the next run's record says
// whether it does.
import {SCENES} from '../repl-parity/scenes-mac.mjs';
import {ALERT_MARGIN, MENU_BAR, overlaps} from './alert-guard.mjs';
import {closePanelClickCell, closePanelKeyCell, OPEN_PANEL, panelGoneCell} from './matrix-cells.mjs';
import {CLOSE_UNTITLED_CELL, NEW_DOCUMENT_CELL, SAVE_SHEET_OPEN_CELL} from './probe-plan.mjs';
import {activate, activationOf, AlertGuarded, AlertHeld, device, js, notActivated, read, readKey, sendKeys, Stop, TEXTEDIT} from './steps.mjs';

// What opens each panel: the cell (a key cell, sent under the key guard with TextEdit's process in front) and its keys.
const OPENERS = Object.freeze({openPanel: {code: OPEN_PANEL, keys: ['super+o']}, savePanel: {code: SAVE_SHEET_OPEN_CELL, keys: ['super+s']}});
export const PANEL_NAMES = Object.freeze({openPanel: 'Open panel', savePanel: 'Save sheet'});

const isRect = r => Boolean(r) && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(r[k]));
const rectText = r => `${r.x},${r.y} ${r.width}x${r.height}`;
const sameRect = (a, b) => ['x', 'y', 'width', 'height'].every(k => a[k] === b[k]);
const frameArg = f => [f.x, f.y, f.width, f.height].join(',');

// Why a frame stands outside the strip clear of the alerts (ruling 1169's x 0-822 on the runner): on the display's left,
// below the menu bar, its right edge at least ALERT_MARGIN left of every alert, overlapping none. With no alert on
// screen (off a hosted runner) every frame is in it. -> null, or why not.
export function stripCause(frame, alerts) {
  const rects = (alerts ?? []).filter(isRect);
  if (!rects.length) return null;
  const edge = Math.min(...rects.map(r => r.x)) - ALERT_MARGIN;
  if (frame.x >= 0 && frame.y >= MENU_BAR && frame.x + frame.width <= edge && !rects.some(r => overlaps(r, frame))) return null;
  return `it stood at ${rectText(frame)}, outside the strip clear of the alerts (x 0-${edge}, below the menu bar)`;
}

// Where a panel outside the strip is moved: the venue's panel frame (ruling 1169: 80,80 720x440 on the runner, the
// strip's), or, with no venue record, the panel's own size at the hosted scenes' origin (Finder's, 22,80), narrowed to
// end at the strip's edge.
export const STRIP_ORIGIN = Object.freeze({x: 22, y: 80});
function panelFrame(ctx, from, alerts) {
  const venue = ctx.meta.venue?.frames?.openPanel;
  if (isRect(venue)) return {x: venue.x, y: venue.y, width: venue.width, height: venue.height};
  const edge = Math.min(...alerts.filter(isRect).map(r => r.x)) - ALERT_MARGIN;
  return {...STRIP_ORIGIN, width: Math.min(from.width, edge - STRIP_ORIGIN.x), height: from.height};
}

// The TextEdit windows on screen before an opening key, by number (the guard's reading), or null when unread.
function windowsBefore(ctx) {
  const bounds = read(ctx, null, {alertBounds: true})?.alertBounds ?? null;
  return Array.isArray(bounds?.windows) ? new Set(bounds.windows.filter(w => w.scene === 'textedit').map(w => w.number)) : null;
}

// One opening of `target`'s panel with TextEdit in front (for the Save sheet, its untitled document in front: the
// untitled document is made first, untitledDocument). -> null (open and placed in the strip), {venue} (open, outside the
// strip), {skipped, held?} when TextEdit's activation did not take front and key or the capture alert held the key
// (ruling 1141), or {problem}.
export async function openPanelOf(ctx, target, apps) {
  const front = activate(ctx, 'textedit');
  const skipped = notActivated(ctx, 'textedit', apps);
  if (skipped) return {skipped};
  if (!front?.ok) return {problem: `TextEdit did not come to the front (${front?.reason ?? 'no answer'})`};
  const known = windowsBefore(ctx);
  const {code, keys} = OPENERS[target];
  let opened;
  try { opened = await sendKeys(ctx, code, keys, {scene: 'textedit', front: read(ctx)}); } catch (error) {
    if (!(error instanceof AlertHeld)) throw error;
    return {skipped: {apps, activate: activationOf(ctx, SCENES.textedit.bundleId), before: error.reading, after: readKey(ctx)}, held: error.row};
  }
  if (opened === null) return {problem: `the key guard did not send ${keys.join('+')}`};
  if (!opened.ok || !opened.value?.opened) return {problem: `the ${PANEL_NAMES[target]} did not open (${opened.error ?? opened.value?.reason ?? 'not seen'})`};
  // TextEdit's focused window is the panel until closePanel: no key-window check meanwhile (./steps.mjs keyWindowScene).
  ctx.panelOpen = target;
  const venue = await placePanel(ctx, target, known);
  return venue ? {venue} : null;
}

// The opening's window placed in the strip (see the header). `known`: TextEdit's windows before the opening key.
// -> the `venue` cause when a read-back missed the strip, else null.
async function placePanel(ctx, target, known) {
  const kept = ((ctx.meta.placement ??= {}).panel ??= []), beforeRow = ctx.rows.length;
  ctx.panelWindows = [];
  const bounds = read(ctx, null, {alertBounds: true})?.alertBounds ?? null;
  if (!Array.isArray(bounds?.alerts) || !Array.isArray(bounds?.windows) || known === null) { kept.push({beforeRow, target, unread: true}); return null; }
  const alerts = bounds.alerts.map(a => a.bounds);
  const windows = bounds.windows.filter(w => isRect(w.bounds) && w.bounds.width >= 100 && w.bounds.height >= 100
    && (w.scene === 'openPanel' || (w.scene === 'textedit' && !w.recorded && !known.has(w.number))));
  if (!windows.length) { kept.push({beforeRow, target, found: false}); return null; }
  let venue = null;
  for (const w of windows) {
    ctx.panelWindows.push(w.number);
    const entry = {beforeRow, target, number: w.number, from: w.bounds};
    let at = w.bounds;
    if (stripCause(at, alerts)) {
      const to = panelFrame(ctx, w.bounds, alerts);
      let answer;
      try { answer = device(ctx, ['place', '--scene', target, '--window', String(w.number), '--frame', frameArg(to)]); } catch (error) { answer = {error: String(error.message).slice(0, 200)}; }
      if (isRect(answer?.readBack)) at = answer.readBack;
      // Ruling 1199: a move that also asks another size (the system's 880-wide panel never fits the strip) says so.
      const resized = to.width !== w.bounds.width || to.height !== w.bounds.height ? {resized: {from: w.bounds, to}} : {};
      Object.assign(entry, {to, ...resized, readBack: answer?.readBack ?? null, matched: answer?.matched === true, ...(answer?.ax ? {ax: answer.ax} : {}), ...(Number.isSafeInteger(answer?.pid) ? {pid: answer.pid} : {}),
        ...(answer?.refused ? {reason: `the move was refused: ${answer.refused}`} : answer?.error ? {reason: `the move failed: ${answer.error}`} : {})});
    }
    const missed = stripCause(at, alerts);
    Object.assign(entry, {moved: !sameRect(at, w.bounds), inStrip: missed === null});
    if (missed) {
      entry.reason ??= missed;
      venue ??= `the ${PANEL_NAMES[target]}'s window ${w.number} was not placed in the strip left of the capture alerts: ${missed}${entry.reason !== missed ? `; ${entry.reason}` : ''} (ruling 1195)`;
    }
    kept.push(entry);
  }
  return venue;
}

// A stop because a panel stayed open whatever closed it: ./run.mjs records every sample its plan still had to take with
// this cause (recordUnrun), alike on both lanes.
export class PanelStuck extends Stop {}

// The panel closed after its case (see the header). `from`: the first row of this opening, so a close that did not take
// marks that opening's rows. After the background pairing the user window (Finder's) is in front, where the key guard
// would skip Escape: `activateFirst` brings TextEdit to the front first, its cases done by then (T8e review, Minor 1).
export async function closePanel(ctx, target, {from = ctx.rows.length, activateFirst = false} = {}) {
  const record = {beforeRow: ctx.rows.length, target, steps: [], closed: false};
  (ctx.meta.panelCloses ??= []).push(record);
  const done = () => { record.closed = true; ctx.panelOpen = false; };
  if (activateFirst) activate(ctx, 'textedit');
  const escape = {step: 'escape'};
  try {
    const keyed = await sendKeys(ctx, closePanelKeyCell(target), ['Escape'], {scene: 'textedit', front: read(ctx, null, {frontKey: true}), key: 'close-panel:escape'});
    if (keyed === null) escape.sent = false;
    else Object.assign(escape, {ok: keyed.ok === true, closed: keyed.value?.closed === true, ...(keyed.ok ? {} : {error: String(keyed.error ?? '').slice(0, 200)})});
  } catch (error) {
    if (!(error instanceof AlertHeld)) throw error;
    Object.assign(escape, error.guard ? {refused: {cause: error.guard.category, detail: error.guard.detail}} : {held: true});
  }
  record.steps.push(escape);
  if (escape.closed) return done();
  const click = {step: 'cancel'};
  try {
    const clicked = await js(ctx, 'harness', 'close-panel', closePanelClickCell(target), {apps: TEXTEDIT});
    Object.assign(click, {ok: clicked.ok === true, closed: clicked.value?.closed === true, ...(clicked.ok ? {} : {error: String(clicked.error ?? '').slice(0, 200)})});
  } catch (error) {
    if (!(error instanceof AlertGuarded)) throw error;
    click.refused = {cause: error.guard.category, detail: error.guard.detail};
  }
  record.steps.push(click);
  if (click.closed) return done();
  const refused = click.refused ?? escape.refused ?? null;
  const mark = refused ? {cause: refused.cause, detail: `the ${PANEL_NAMES[target]}'s close was refused (${refused.detail}): Escape did not close it`}
    : {cause: 'invalid', detail: `neither Escape nor the ${PANEL_NAMES[target]}'s Cancel click closed it`};
  record.rowsMarked = markOpening(ctx, from, mark);
  const ax = {step: 'device', windows: []};
  record.steps.push(ax);
  for (const number of ctx.panelWindows ?? []) {
    let answer;
    try { answer = device(ctx, ['panel', 'cancel', '--window', String(number)]); } catch (error) { answer = {error: String(error.message).slice(0, 200)}; }
    ax.windows.push({number, ...answer});
  }
  const gone = await js(ctx, 'harness', 'panel-gone', panelGoneCell(target), {apps: TEXTEDIT});
  ax.closed = gone.ok === true && gone.value?.closed === true;
  if (ax.closed) return done();
  throw new PanelStuck(`TextEdit's ${PANEL_NAMES[target]} stayed open after its case: Escape, its Cancel click and the device's Accessibility cancel all left it up`);
}
// The NO VERDICT mark of a close that did not take, on every row of the opening that had a verdict to lose (one with an
// invalid reason already has none). -> how many rows it marked.
const PANEL_CLOSE_INVALID = 'the panel\'s close after its case did not take: the opening says nothing';
function markOpening(ctx, from, mark) {
  let n = 0;
  for (const row of ctx.rows.slice(from)) {
    if (row.invalid) continue;
    Object.assign(row, {ok: false, panelClose: mark, invalid: PANEL_CLOSE_INVALID});
    n++;
  }
  return n;
}

// The Save sheet's untitled document (⌘N under the key guard, NEW_DOCUMENT_CELL), made once before the sheet's cases.
// -> null, {skipped, held?} or {problem} (any untitled document it left closed first).
export async function untitledDocument(ctx, apps) {
  const front = activate(ctx, 'textedit');
  const skipped = notActivated(ctx, 'textedit', apps);
  if (skipped) return {skipped};
  if (!front?.ok) return {problem: `TextEdit did not come to the front (${front?.reason ?? 'no answer'})`};
  let made;
  try { made = await sendKeys(ctx, NEW_DOCUMENT_CELL, ['super+n'], {scene: 'textedit', front: read(ctx)}); } catch (error) {
    if (!(error instanceof AlertHeld)) throw error;
    return {skipped: {apps, activate: activationOf(ctx, SCENES.textedit.bundleId), before: error.reading, after: readKey(ctx)}, held: error.row};
  }
  if (made?.ok && made.value?.opened === true) return null;
  await closeUntitledDocument(ctx);
  return {problem: `the untitled document did not open (${made?.error ?? made?.value?.reason ?? 'not sent'})`};
}
// The untitled document closed after the Save sheet's cases (super+w; it was never typed into, so no sheet asks), the
// scene's document in front again, or the run stops.
export async function closeUntitledDocument(ctx) {
  activate(ctx, 'textedit');
  const closed = await sendKeys(ctx, CLOSE_UNTITLED_CELL, ['super+w'], {scene: 'textedit', front: read(ctx), key: 'save-panel:untitled'});
  if (closed?.ok && closed.value?.sceneInFront === true) return;
  throw new Stop(`the Save sheet's untitled document could not be closed: TextEdit's scene document is not in front (${!closed ? 'not sent' : !closed.ok ? `the cell failed: ${String(closed.error ?? '').slice(0, 160)}` : `front: ${closed.value?.front ?? 'unknown'}`})`);
}
