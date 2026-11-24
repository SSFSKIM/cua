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
// on that opening NO VERDICT `venue`, naming where it stood; so does, on a hosted runner, a placement it could not prove
// (the list unread or no window found, after a few reads), the case unsent. A Save sheet the helper finds as an AXSheet
// child of its document is placed by moving the document (`via: 'parent'`), never resized. Each entry and each row of
// the opening carries its id (`opening`: the case's row id, or `<target>/background@<user>`), by which the lanes'
// placements are paired. Off a hosted runner nothing is moved: the device refuses it.
//
// The close (ruling 1195), one rule on both lanes: Escape under the key guard; when that did not close it, its Cancel
// clicked under the alert guard; when neither did (the key ineffective, the click refused or ineffective), the rows of
// that opening say nothing (`panelClose` {cause, detail}: NO VERDICT by the refusal's cause, else `invalid`), the device
// cancels the known panel by Accessibility (./matrix-device.mjs panel cancel: no pointer event, nothing the guard
// refuses), and the run goes on. Each step's outcome is the device's reading of the window (closed, open or unread),
// not a lane's. Only a panel still up, or unread, after that stops the run (PanelStuck). Every step and its
// outcome is kept in meta.panelCloses ({beforeRow, target, steps: [{step: escape|cancel|device, ...}], rowsMarked?,
// closed}). In pilot C-2 cua's Escape ran unrefused and did not close the Open panel; the next run's record says
// whether it does.
import {SCENES} from '../repl-parity/scenes-mac.mjs';
import {ALERT_MARGIN, MENU_BAR, overlaps} from './alert-guard.mjs';
import {closePanelClickCell, closePanelKeyCell, OPEN_PANEL, panelGoneCell} from './matrix-cells.mjs';
import {CLOSE_UNTITLED_CELL, NEW_DOCUMENT_CELL, SAVE_SHEET_OPEN_CELL} from './probe-plan.mjs';
import {activate, activationOf, AlertGuarded, AlertHeld, device, js, KeyGuardStop, notActivated, ownWindowClosed, ownWindowOpened, read, readKey, sceneWindowNumbers, sendKeys, Stop, TEXTEDIT} from './steps.mjs';

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
export async function openPanelOf(ctx, target, apps, opening) {
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
  const venue = await placePanel(ctx, target, known, opening);
  return venue ? {venue} : null;
}

// The opening's window placed in the strip (see the header). `known`: TextEdit's windows before the opening key;
// `opening`: the case or pairing it was opened for, the key its placement is compared by across the lanes
// (../hosted-sittings/venue.mjs sceneFrames). On a GitHub-hosted runner the window is looked for up to PLACE_READS
// times, PLACE_READ_MS apart; a placement still unproven (the list unread, no window of the panel found) is the venue's:
// the case is not sent (review of 55b7f56d9..fa91a1630, finding 2). Off a hosted runner there is no alert to keep it
// from, so an unproven placement is recorded and the case runs. -> the `venue` cause when the placement is unproven on a
// hosted runner or a read-back missed the strip, else null.
const PLACE_READS = 4, PLACE_READ_MS = 250;
async function placePanel(ctx, target, known, opening) {
  const kept = ((ctx.meta.placement ??= {}).panel ??= []), beforeRow = ctx.rows.length;
  const hosted = ctx.meta.hosted === true;
  ctx.panelWindows = [];
  let bounds = null, windows = null, reads = 0;
  for (; reads < (hosted ? PLACE_READS : 1) && !windows?.length; reads++) {
    if (reads) await ctx.sleep(PLACE_READ_MS);
    bounds = read(ctx, null, {alertBounds: true})?.alertBounds ?? null;
    windows = !Array.isArray(bounds?.alerts) || !Array.isArray(bounds?.windows) || known === null ? null
      : bounds.windows.filter(w => isRect(w.bounds) && w.bounds.width >= 100 && w.bounds.height >= 100
        && (w.scene === 'openPanel' || (w.scene === 'textedit' && !w.recorded && !known.has(w.number))));
    if (known === null) { reads++; break; }
  }
  if (!windows?.length) {
    kept.push({beforeRow, target, opening, reads, ...(windows === null ? {unread: true} : {found: false})});
    if (!hosted) return null;
    return `the ${PANEL_NAMES[target]}'s placement is unproven: ${known === null ? 'TextEdit\'s windows before its key were unread' : windows === null ? 'the window list was unread' : 'no window of it was found'} after ${reads} ${reads === 1 ? 'read' : 'reads'}, so its case was not sent (ruling 1195)`;
  }
  // More than one window qualifies: which is the panel is not known, so none is moved or compared (the close still
  // covers each); on a hosted runner the case is not sent.
  if (windows.length > 1) {
    ctx.panelWindows = windows.map(w => w.number);
    kept.push({beforeRow, target, opening, reads, ambiguous: true, candidates: windows.map(w => ({number: w.number, bounds: w.bounds}))});
    if (!hosted) return null;
    return `the ${PANEL_NAMES[target]}'s placement is ambiguous: ${windows.length} windows qualify (${windows.map(w => w.number).join(', ')}), so its case was not sent (ruling 1195)`;
  }
  const alerts = bounds.alerts.map(a => a.bounds);
  let venue = null;
  for (const w of windows) {
    ctx.panelWindows.push(w.number);
    const entry = {beforeRow, target, opening, number: w.number, from: w.bounds};
    let at = w.bounds;
    if (stripCause(at, alerts)) {
      const to = panelFrame(ctx, w.bounds, alerts);
      let answer;
      try { answer = device(ctx, ['place', '--scene', target, '--window', String(w.number), '--frame', frameArg(to)]); } catch (error) { answer = {error: String(error.message).slice(0, 200)}; }
      if (isRect(answer?.readBack)) at = answer.readBack;
      // Ruling 1199: a move that also asks another size (the system's 880-wide panel never fits the strip) says so. A
      // Save sheet the helper found as an AXSheet child takes no size of its own: its parent was moved to place it
      // (`via: 'parent'`), the sheet's frame read back, and nothing was resized.
      const sheet = answer?.ax?.kind === 'sheet';
      const resized = !sheet && (to.width !== w.bounds.width || to.height !== w.bounds.height) ? {resized: {from: w.bounds, to}} : {};
      Object.assign(entry, {to, ...resized, ...(sheet ? {via: 'parent'} : {}), readBack: answer?.readBack ?? null, matched: answer?.matched === true, ...(answer?.ax ? {ax: answer.ax} : {}), ...(Number.isSafeInteger(answer?.pid) ? {pid: answer.pid} : {}),
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

// The rows an opening's case or pairing wrote, from `from`, tagged with its id (`opening`), as its placement entries
// are: a frame verdict on one opening (../hosted-sittings/venue.mjs panelFrameSplits, ./summary.mjs) reaches its rows
// alone, never the run's.
export function tagOpening(ctx, from, opening) {
  for (const row of ctx.rows.slice(from)) row.opening ??= opening;
}

// A stop because a panel stayed open whatever closed it: ./run.mjs records every sample its plan still had to take with
// this cause (recordUnrun), alike on both lanes.
export class PanelStuck extends Stop {}
// The key guard stopped a panel's close (KeyGuardStop): its message and cause kept (`guard`: {category, detail}, as
// ./run.mjs recordUnrun marks the samples after it), and what the device's cancel then left (`device`: closed, open or
// unread).
export class PanelCloseStopped extends PanelStuck {
  constructor(stop, device) {
    const after = device === 'closed' ? 'the device\'s cancel then closed the panel' : device === 'unread' ? 'the device\'s cancel then left the panel unread' : 'the device\'s cancel then left the panel open';
    super(`${stop.message}; ${after}`);
    this.guard = {category: stop.category ?? 'invalid', detail: `${stop.message}; ${after}`};
    this.device = device;
  }
}

// The panel closed after its case (see the header). `from`: the first row of this opening, so a close that did not take
// marks that opening's rows. After the background pairing the user window (Finder's) is in front, where the key guard
// would skip Escape: `activateFirst` brings TextEdit to the front first, its cases done by then (T8e review, Minor 1).
// Whether the panel closed is the device's reading of the known window (`panel state`, ./matrix-device.mjs: closed,
// still open, or unread), not a lane's observation; only with no window of the panel known is the lane's word taken. The
// key guard stopping Escape (KeyGuardStop: the front is not the run's) is recorded, the click skipped (the front is not
// TextEdit's), the device's cancel tried, and then the run stops with it. Any other stop, and every lane integrity
// failure, passes through at once.
export async function closePanel(ctx, target, {from = ctx.rows.length, activateFirst = false} = {}) {
  const record = {beforeRow: ctx.rows.length, target, steps: [], closed: false};
  (ctx.meta.panelCloses ??= []).push(record);
  const done = () => { record.closed = true; ctx.panelOpen = false; };
  const known = ctx.panelWindows ?? [];
  // -> 'closed', 'open' or 'unread' as the device read the known windows, null when none is known.
  const deviceState = () => {
    if (!known.length) return null;
    const states = known.map(number => {
      try { return device(ctx, ['panel', 'state', '--window', String(number)])?.state ?? 'unread'; } catch (error) {
        if (error instanceof Stop) throw error;
        return 'unread';
      }
    });
    return states.includes('open') ? 'open' : states.every(s => s === 'closed') ? 'closed' : 'unread';
  };
  // A step closed the panel: the device read it gone (its state kept on the step), or, with no window known, the lane said so.
  const closedBy = step => {
    const state = deviceState();
    if (state !== null) step.device = state;
    return state === null ? step.closed === true : state === 'closed';
  };
  if (activateFirst) activate(ctx, 'textedit');
  const escape = {step: 'escape'};
  let guardStop = null;
  try {
    const keyed = await sendKeys(ctx, closePanelKeyCell(target), ['Escape'], {scene: 'textedit', front: read(ctx, null, {frontKey: true}), key: 'close-panel:escape'});
    if (keyed === null) escape.sent = false;
    else Object.assign(escape, {ok: keyed.ok === true, closed: keyed.value?.closed === true, ...(keyed.ok ? {} : {error: String(keyed.error ?? '').slice(0, 200)})});
  } catch (error) {
    if (error instanceof KeyGuardStop) { guardStop = error; Object.assign(escape, {sent: false, guardStop: error.message.slice(0, 200)}); }
    else if (error instanceof AlertHeld) Object.assign(escape, error.guard ? {refused: {cause: error.guard.category, detail: error.guard.detail}} : {held: true});
    else throw error;
  }
  record.steps.push(escape);
  if (!guardStop && closedBy(escape)) return done();
  let click = null;
  if (!guardStop) {
    click = {step: 'cancel'};
    try {
      const clicked = await js(ctx, 'harness', 'close-panel', closePanelClickCell(target), {apps: TEXTEDIT});
      Object.assign(click, {ok: clicked.ok === true, closed: clicked.value?.closed === true, ...(clicked.ok ? {} : {error: String(clicked.error ?? '').slice(0, 200)})});
    } catch (error) {
      if (!(error instanceof AlertGuarded)) throw error;
      click.refused = {cause: error.guard.category, detail: error.guard.detail};
    }
    record.steps.push(click);
    if (closedBy(click)) return done();
  }
  // The opening's rows say nothing, by the most specific cause: the key guard's stop (an unread front `unread`, a readable
  // other front `invalid`), a refusal's own category, the capture alert holding Escape (`alert`, the click after it merely
  // ineffective), else `invalid`.
  const refused = click?.refused ?? escape.refused ?? null;
  const name = PANEL_NAMES[target];
  const mark = guardStop ? {cause: guardStop.category ?? 'invalid', detail: `the ${name}'s Escape was not sent: ${guardStop.message}`}
    : refused ? {cause: refused.cause, detail: `the ${name}'s close was refused (${refused.detail}): Escape did not close it`}
      : escape.held ? {cause: 'alert', detail: `the capture alert held the ${name}'s Escape, and its Cancel click did not close it`}
        : {cause: 'invalid', detail: `neither Escape nor the ${name}'s Cancel click closed it`};
  record.rowsMarked = markOpening(ctx, from, mark);
  const ax = {step: 'device', windows: []};
  record.steps.push(ax);
  for (const number of known) {
    let answer;
    try { answer = device(ctx, ['panel', 'cancel', '--window', String(number)]); } catch (error) {
      if (error instanceof Stop) throw error;
      answer = {error: String(error.message).slice(0, 200)};
    }
    ax.windows.push({number, ...answer});
  }
  // The device's own confirmation decides; with no window known, the lane's observation is all there is.
  let state = deviceState();
  if (state === null) {
    const gone = await js(ctx, 'harness', 'panel-gone', panelGoneCell(target), {apps: TEXTEDIT});
    state = gone.ok === true && gone.value?.closed === true ? 'closed' : 'open';
    ax.lane = state;
  } else ax.device = state;
  ax.closed = state === 'closed';
  if (ax.closed) done();
  // The key guard's stop is kept, and with it what the device's cancel then left: the run records every sample after it
  // by the guard's cause (./run.mjs recordUnrun).
  if (guardStop) throw new PanelCloseStopped(guardStop, state);
  if (ax.closed) return;
  throw new PanelStuck(state === 'unread'
    ? `TextEdit's ${name} could not be read after its close: the device's window list was unread, so whether it stayed open is unknown`
    : `TextEdit's ${name} stayed open after its case: Escape, its Cancel click and the device's Accessibility cancel all left it up`);
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
  const known = sceneWindowNumbers(ctx, 'textedit');
  try { made = await sendKeys(ctx, NEW_DOCUMENT_CELL, ['super+n'], {scene: 'textedit', front: read(ctx)}); } catch (error) {
    if (!(error instanceof AlertHeld)) throw error;
    return {skipped: {apps, activate: activationOf(ctx, SCENES.textedit.bundleId), before: error.reading, after: readKey(ctx)}, held: error.row};
  }
  if (made?.ok && made.value?.opened === true) { ownWindowOpened(ctx, 'textedit', known); return null; }
  await closeUntitledDocument(ctx);
  return {problem: `the untitled document did not open (${made?.error ?? made?.value?.reason ?? 'not sent'})`};
}
// The untitled document closed after the Save sheet's cases (super+w; it was never typed into, so no sheet asks), the
// scene's document in front again, or the run stops.
export async function closeUntitledDocument(ctx) {
  activate(ctx, 'textedit');
  const closed = await sendKeys(ctx, CLOSE_UNTITLED_CELL, ['super+w'], {scene: 'textedit', front: read(ctx), key: 'save-panel:untitled'});
  if (closed?.ok && closed.value?.sceneInFront === true) return ownWindowClosed(ctx);
  throw new Stop(`the Save sheet's untitled document could not be closed: TextEdit's scene document is not in front (${!closed ? 'not sent' : !closed.ok ? `the cell failed: ${String(closed.error ?? '').slice(0, 160)}` : `front: ${closed.value?.front ?? 'unknown'}`})`);
}
