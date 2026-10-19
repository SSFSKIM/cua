// The second input sitting's groups of measure.mjs (./groups.mjs; the own native engine spec, Decision Log 2026-10-19:
// the revision entry's delegated unknowns and the critique's rulings A1 and A4), cua lane only:
//   routes   (U12, U10) every scene, element click, coordinate click and key, each under the routes 2′ ("2'"), 3 and
//            forced 2 (⌘ on a click into an inactive app), with the paired user window in front; per sample the
//            device-side activation watcher, the front checks, an outcome read back from the scene and, on Electron,
//            the fixture's focus and activation counters.
//   effects  (U13) each scene window's activation point and the element under it (probe_spike activationPoint); the
//            selection of TextEdit's document and of the Chrome and Electron text fields across route 3's activation
//            alone and a route-3 key that neither edits nor moves the caret; Electron's counters around the activation
//            alone and around that key under each route.
//   coord    (U2) TextEdit's coordinate click from a screenshot-bearing observation, where it lands, and its refusals.
//   tap      (U5) probe_tap per mode, then probe (d)'s first checks for each mode whose tap was created.
// Row shapes are listed in measure.mjs's header. Nothing here reads a title or text of a window the run does not own:
// Finder's outcome is the run's own row numbers, and every other scene is a process the run launched.
import {join} from 'node:path';
import {quote} from '../../../browser-parity/topology.mjs';
import {textEditDocument} from '../scenes.mjs';
import {FIXTURE_CONTROLS, FIXTURE_COUNTERS_FILE} from '../fixtures/electron-fixture.mjs';
import {PAGE_CONTROLS} from '../fixtures/scene-page.mjs';
import * as spike from './cells.mjs';
import {SCENE_WINDOW, ACTION_TARGET, USER_WINDOW, TEXT_TARGET} from './targets.mjs';
import {TASK_CLOSE} from '../../../native-baseline/cells.mjs';

export class Stop extends Error {}

export const ROUTES = Object.freeze(["2'", '3', '2']);
export const FAMILIES = Object.freeze(['elementClick', 'coordinateClick', 'key']);
// The route matrix's key per scene: TextEdit extends the selection, Finder moves the selected row, and the web scenes
// type one character into their text field (focused first), so each key's outcome is a number read back.
export const ROUTE_KEY = Object.freeze({textedit: 'shift+Right', finder: 'Down', chrome: 'x', electron: 'x'});
// U13's key: F19 has no binding in an NSTextView, a Chromium text field or Finder, so it neither edits nor moves the
// caret; whatever the selection does across it is the route's doing (its fake activation), not the key's.
export const INERT_KEY = 'F19';
export const SELECTION_SEED = 'cua selection probe';
export const SELECTION = Object.freeze({location: 4, length: 9});
// Electron's app and window events arrive after the action returns; the counters are read this long after it.
export const COUNTER_SETTLE_MS = 500;
// TextEdit's scene document in Helvetica 14 pt: a line's height in its text view, an estimate used only when the text
// view's frame does not give one (U2 reports which it used).
export const TEXTEDIT_LINE_HEIGHT = 17;
const NAMES = Object.freeze({chrome: PAGE_CONTROLS.map(c => c.name), electron: FIXTURE_CONTROLS.map(c => c.name), finder: [], textedit: []});
const NO_SCREENSHOT = /noScreenshotForCoordinates|no screenshot of the app's window to place the coordinates/;

// ---- Pure ---------------------------------------------------------------------------------------------------------

// The part of `frame` inside `window` (both in screen points). -> rect | null.
export function intersect(frame, window) {
  if (!frame || !window) return null;
  const x0 = Math.max(frame.x, window.x), y0 = Math.max(frame.y, window.y);
  const x1 = Math.min(frame.x + frame.width, window.x + window.width), y1 = Math.min(frame.y + frame.height, window.y + window.height);
  return x1 > x0 && y1 > y0 ? {x: x0, y: y0, width: x1 - x0, height: y1 - y0} : null;
}

// A screen point in the pixels of the observation's screenshot: offset from the window's origin and multiplied by the
// observation's scale, the screenshot's size over the window's frame per axis (the engine divides by the same scale,
// Screenshot.swift ObservedScreenshot). -> {x, y, local, scale} | null when the point is outside the window.
export function screenshotPoint(point, {window, screenshot}) {
  const w = window?.frame;
  if (!point || !w || !(w.width > 0) || !(w.height > 0) || !(screenshot?.width > 0) || !(screenshot?.height > 0)) return null;
  if (point.x < w.x || point.y < w.y || point.x >= w.x + w.width || point.y >= w.y + w.height) return null;
  const scale = {x: screenshot.width / w.width, y: screenshot.height / w.height};
  const local = {x: point.x - w.x, y: point.y - w.y};
  return {x: Math.round(local.x * scale.x), y: Math.round(local.y * scale.y), local, scale};
}

// The centre of a target's visible part in screenshot pixels. -> as screenshotPoint, or null.
export function targetPixel(geometry) {
  const visible = intersect(geometry?.frame, geometry?.window?.frame);
  return visible ? screenshotPoint({x: visible.x + visible.width / 2, y: visible.y + visible.height / 2}, geometry) : null;
}

// TextEdit's coordinate targets: a point 24 points into the text view's visible part, at the middle of each of
// `lines` (0-based) of the scene document, which is scrolled to its top in the fixed state. The line height is the text
// view's frame height over the document's line count when the view is taller than its visible part (the frame then
// holds every line), else the estimate. -> {lineHeight, lineHeightFrom, points: [{line, screen, x, y, local, scale}]}.
export function textEditPoints(geometry, {lines = [0, 8], lineCount = textEditDocument().lines.length} = {}) {
  const frame = geometry.frame, visible = intersect(frame, geometry.window?.frame);
  if (!visible) return {lineHeight: null, lineHeightFrom: null, points: []};
  const fromFrame = frame.height > visible.height + 1 ? frame.height / lineCount : null;
  const lineHeight = fromFrame && fromFrame >= 10 && fromFrame <= 30 ? fromFrame : TEXTEDIT_LINE_HEIGHT;
  const points = lines.map(line => {
    const screen = {x: visible.x + 24, y: frame.y + (line + 0.5) * lineHeight};
    return {line, screen, ...(screenshotPoint(screen, geometry) ?? {x: null, y: null})};
  });
  return {lineHeight, lineHeightFrom: lineHeight === fromFrame ? 'frame' : 'estimate', points};
}

// The 0-based line of a caret location in a document of `lines` joined by newlines (a location past a line's end and
// its newline is on the next line). -> number | null.
export function lineOfLocation(location, lines) {
  if (!Number.isInteger(location) || location < 0) return null;
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (location <= start + lines[i].length) return i;
    start += lines[i].length + 1;
  }
  return null;
}

const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
// Whether a route sample's outcome holds, from the scene's state before and after (outcomeState; TextEdit's is the
// selection probe_spike reads). A click: TextEdit's caret moved off the baseline, Finder's selection is row 005 alone
// (a ⌘-click would add it to row 003's, the plain click's outcome replacing it), Chrome's option toggled, Electron's
// press count up by one. A key: TextEdit's selection one longer from the same start, Finder's selection one row down,
// the web scenes' text field one character longer. -> true | false | null when either state is unreadable.
export function outcomeHolds(scene, family, before, after) {
  const click = family !== 'key';
  switch (scene) {
    case 'textedit': {
      const b = before?.range, a = after?.range;
      if (!b || !a) return null;
      return click ? a.location !== b.location || a.length !== b.length : a.location === b.location && a.length === b.length + 1;
    }
    case 'finder': {
      if (!before?.observed || !after?.observed) return null;
      if (click) return sameList(after.selected, ['005']);
      if (before.selected.length !== 1) return null;
      return sameList(after.selected, [String(Number(before.selected[0]) + 1).padStart(3, '0')]);
    }
    case 'chrome': case 'electron': {
      if (!before?.observed || !after?.observed) return null;
      const field = click ? (scene === 'chrome' ? 'option' : 'presses') : 'textChars';
      if (before[field] === null || before[field] === undefined || after[field] === null || after[field] === undefined) return null;
      if (field === 'option') return after.option !== before.option;
      return after[field] === before[field] + 1;
    }
    default: throw new Error(`unknown scene ${scene}`);
  }
}

// Electron's counters after minus before, per counter. -> {name: delta} | null when either reading is missing.
export function counterDeltas(before, after) {
  if (!before?.counts || !after?.counts) return null;
  const names = [...new Set([...Object.keys(before.counts), ...Object.keys(after.counts)])].sort();
  return Object.fromEntries(names.map(name => [name, (after.counts[name] ?? 0) - (before.counts[name] ?? 0)]));
}

// How many of `times` (unix ms) fall inside an action's interval. -> {count, inside} | null without an interval.
export function timesInside(times, interval) {
  const {startedAt, endedAt} = interval ?? {};
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return null;
  const list = Array.isArray(times) ? times : [];
  return {count: list.length, inside: list.filter(t => t >= startedAt && t <= endedAt).length};
}

// The fields a probe_tap or probe_spike refusal carries into its row: the engine's name and sentence, and the tap's
// mode and preflights, which engineOps puts in the error's `data` (device.mjs).
export function refusalFields(error) {
  const field = name => error?.data?.[name] ?? null;
  return {errorName: error?.errorName ?? null, sentence: String(error?.sentence ?? error?.message ?? error).slice(0, 300),
    mode: field('mode'), listenPreflight: field('listenPreflight'), postPreflight: field('postPreflight')};
}

// The sums of a probe_tap stop report's counts per origin (own, driven, other).
export const tapCounts = report => Object.fromEntries(['own', 'driven', 'other'].map(kind => [kind, Object.values(report?.counts ?? {}).reduce((t, per) => t + (per?.[kind] ?? 0), 0)]));

// ---- Device and engine readings -----------------------------------------------------------------------------------

// probe_spike through ops (device.mjs); a refusal or a missing method is the row's error, not a crash of the group.
export function spikeAnswer(ops, op, extra) {
  try {
    if (typeof ops.probeSpike !== 'function') return {error: 'this harness\'s device ops have no probeSpike (the engine side has not landed)', errorName: null};
    return {result: ops.probeSpike(op, extra)};
  } catch (error) { return {error: String(error.message).slice(0, 300), errorName: error.errorName ?? null}; }
}

// The Electron fixture's counters file, read over the device shell (the run's own user-data directory). -> {seq,
// counts} | null.
export function readCounters(shell, record) {
  if (!record?.userDataDir) return null;
  try { return JSON.parse(shell(`cat ${quote(join(record.userDataDir, FIXTURE_COUNTERS_FILE))} 2>/dev/null || true`).trim() || 'null'); }
  catch { return null; }
}

const userInFront = (seen, record) => seen?.frontmost?.pid === record.pid && seen?.topWindow?.ownerPid === record.pid;
const watchSummary = lines => ({activations: lines.filter(l => l.kind === 'activated').length, deactivations: lines.filter(l => l.kind === 'deactivated').length, watch: lines.slice(0, 10)});
// The device-side activation watcher around an action (probe (b)'s); a watcher that will not start sends nothing, and
// one that will not stop leaves its lines unread rather than failing the action's row.
const startWatch = ops => { try { ops.watch(); return {}; } catch (error) { return {error: `the activation watcher did not start: ${String(error.message).slice(0, 200)}`}; } };
const stopWatch = ops => { try { return ops.watchStop(); } catch { return [{kind: 'unread', note: 'the activation watcher did not stop cleanly'}]; } };
const cellError = r => r.cell?.error ?? r.failure ?? 'failed';
const sleepOf = ctx => ctx.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));

// The scene's readable state for an outcome: TextEdit's selection (probe_spike), else the Skyshot's (outcomeState).
async function readOutcome(ctx, scene) {
  const {js, ops, records} = ctx;
  if (scene === 'textedit') {
    const answer = spikeAnswer(ops, 'selection', {app: records.textedit.app});
    return answer.result ? {range: answer.result.range ?? null, role: answer.result.role ?? null, axError: answer.result.axError ?? null} : {error: answer.error};
  }
  const r = await js(spike.OUTCOME(scene, records[scene].app, NAMES[scene]));
  return r.cell?.ok ? r.cell.value : {observed: false, error: cellError(r)};
}

// One element click by the default route (a sample's preparation, not measured), then Finder's rename backstop.
async function clickTarget(ctx, scene, target) {
  const {js, finderRenameGuard} = ctx;
  const located = await js(spike.LOCATE(scene, SCENE_WINDOW[scene], target));
  if (!located.cell?.ok) return {error: `locate: ${cellError(located)}`};
  const clicked = await js(spike.ACT_CLICK(scene));
  if (!clicked.cell?.ok) return {error: `click: ${cellError(clicked)}`};
  const renamed = scene === 'finder' ? await finderRenameGuard() : {};
  return renamed.invalid ? {error: renamed.invalid} : {};
}

// A sample's starting state: TextEdit's caret at the document's start; Finder's row 003 selected (so a click on row
// 005 shows whether it replaced or added to the selection, and Down has a known row to move from); a web scene's text
// field focused before its key.
async function prepareSample(ctx, scene, family) {
  if (scene === 'textedit') {
    const set = spikeAnswer(ctx.ops, 'selection', {app: ctx.records.textedit.app, set: {location: 0, length: 0}});
    return set.result && !set.result.setError ? {} : {error: `the selection could not be set: ${set.error ?? set.result.setError}`};
  }
  if (scene === 'finder') return clickTarget(ctx, 'finder', {rowCellOf: 'scene-file-003'});
  if (family === 'key') return clickTarget(ctx, scene, TEXT_TARGET[scene]);
  return {};
}

// ---- routes (U12, U10) --------------------------------------------------------------------------------------------

export async function routesGroup(ctx, {samples = 3} = {}) {
  const {active, records, emit} = ctx;
  for (const scene of active()) {
    const user = USER_WINDOW[scene];
    if (!records[user]) { for (const family of FAMILIES) emit({op: `routes.${family}`, scene, user, family, sample: 1, ok: false, notRun: `the user window's scene (${user}) is not up`}); continue; }
    for (const family of FAMILIES)
      for (const route of ROUTES)
        for (let sample = 1; sample <= samples; sample++) await routeSample(ctx, {scene, user, family, route, sample});
  }
}

async function routeSample(ctx, {scene, user, family, route, sample}) {
  const {js, emit, records, front, activate, ops, shell, finderRenameGuard} = ctx;
  const app = records[scene].app;
  const base = {op: `routes.${family}`, scene, user, family, forcedRoute: route, sample};
  const prepared = await prepareSample(ctx, scene, family);
  if (prepared.error) return emit({...base, ok: false, sent: false, error: `the sample's starting state: ${prepared.error}`});
  await activate(user);
  const before = await readOutcome(ctx, scene);
  // The target last, so its index and the screenshot its pixels are in are the newest observation's.
  let act, point = null;
  if (family === 'key') act = spike.SPIKE_INPUT(app, 'press_key', {key: ROUTE_KEY[scene], spikeRoute: route});
  else if (family === 'elementClick') {
    const located = await js(spike.LOCATE(scene, SCENE_WINDOW[scene], ACTION_TARGET[scene]));
    if (!located.cell?.ok) return emit({...base, ok: false, sent: false, error: `locate: ${cellError(located)}`, before});
    act = spike.SPIKE_CLICK(app, route);
  } else {
    const geometry = await js(spike.GEOMETRY(scene, app, SCENE_WINDOW[scene], ACTION_TARGET[scene]));
    point = geometry.cell?.ok ? targetPixel(geometry.cell.value) : null;
    if (!point) return emit({...base, ok: false, sent: false, error: geometry.cell?.ok ? 'the target has no visible part in the window' : `geometry: ${cellError(geometry)}`, before});
    act = spike.SPIKE_INPUT(app, 'click', {x: point.x, y: point.y, spikeRoute: route});
  }
  const seen = front();
  if (!userInFront(seen, records[user])) return emit({...base, ok: false, sent: false, error: 'the user window was not in front; nothing was sent', before});
  const countersBefore = scene === 'electron' ? readCounters(shell, records.electron) : null;
  const watching = startWatch(ops);
  if (watching.error) return emit({...base, ok: false, sent: false, error: watching.error, before});
  let acted, lines = [];
  try { acted = await js(act); } finally { lines = stopWatch(ops); }
  const afterFront = front();
  const renamed = scene === 'finder' && family !== 'key' ? await finderRenameGuard() : {};
  let counters;
  if (scene === 'electron') { await sleepOf(ctx)(COUNTER_SETTLE_MS); counters = counterDeltas(countersBefore, readCounters(shell, records.electron)); }
  const after = await readOutcome(ctx, scene);
  const held = outcomeHolds(scene, family, before, after);
  const failed = acted.cell?.ok ? acted.cell.value?.failed ?? null : cellError(acted);
  emit({...base, ok: !failed && held === true, sent: true, route: acted.meta?.['cua/inputRoute'] ?? null, activationGuardMs: acted.meta?.['cua/activationGuardMs'] ?? null,
    inCellMs: acted.cell?.value?.inCellMs ?? null, failed, ...(point ? {point: {x: point.x, y: point.y, scale: point.scale}} : {}),
    frontmostUnchanged: afterFront.frontmost?.pid === seen.frontmost?.pid, topWindowUnchanged: afterFront.topWindow?.number === seen.topWindow?.number,
    ...watchSummary(lines), before, after, outcomeHeld: held, ...(scene === 'electron' ? {counters} : {}), ...renamed});
}

// ---- effects (U13) ------------------------------------------------------------------------------------------------

export async function effectsGroup(ctx) {
  const {active, emit, ops, records} = ctx;
  for (const scene of active()) {
    const answer = spikeAnswer(ops, 'activationPoint', {app: records[scene].app});
    // The answer's own op and app (its resolved identity) give way to the row's op and scene.
    const {op: _, ...result} = answer.result ?? {};
    emit({op: 'effects.activationPoint', scene, sample: 1, ok: Boolean(answer.result), ...(answer.result ? result : {error: answer.error, errorName: answer.errorName})});
  }
  for (const scene of ['textedit', 'chrome', 'electron'].filter(s => active().includes(s))) await selectionEffect(ctx, scene);
  if (active().includes('electron')) await electronCounterEffects(ctx);
}

// The selection across route 3's activation alone and a route-3 inert key, with the user window in front.
async function selectionEffect(ctx, scene) {
  const {js, emit, records, front, activate, ops, shell} = ctx;
  const app = records[scene].app, user = USER_WINDOW[scene];
  const base = {op: 'effects.selection', scene, user, sample: 1, set: SELECTION, key: INERT_KEY};
  if (!records[user]) return emit({...base, ok: false, notRun: `the user window's scene (${user}) is not up`});
  if (scene !== 'textedit') {
    // The web scenes' text fields start empty: focused (by the default route) and given text a selection can span.
    const focused = await clickTarget(ctx, scene, TEXT_TARGET[scene]);
    const typed = focused.error ? null : await js(spike.ACT_TYPE(scene, SELECTION_SEED));
    if (focused.error || !typed.cell?.ok) return emit({...base, ok: false, error: `the text field could not be given text: ${focused.error ?? cellError(typed)}`});
  }
  await activate(user);
  const read = () => { const a = spikeAnswer(ops, 'selection', {app}); return a.result ? {role: a.result.role ?? null, range: a.result.range ?? null, axError: a.result.axError ?? null} : {error: a.error}; };
  const set = spikeAnswer(ops, 'selection', {app, set: SELECTION});
  const before = read();
  const seen = front();
  if (!userInFront(seen, records[user])) return emit({...base, ok: false, sent: false, error: 'the user window was not in front; nothing was sent', before});
  const counters = scene === 'electron' ? [readCounters(shell, records.electron)] : null;
  const watching = startWatch(ops);
  if (watching.error) return emit({...base, ok: false, sent: false, error: watching.error, before});
  let activated, afterActivate, keyed, afterKey, lines = [];
  try {
    activated = spikeAnswer(ops, 'activate', {app});
    afterActivate = read();
    if (counters) { await sleepOf(ctx)(COUNTER_SETTLE_MS); counters.push(readCounters(shell, records.electron)); }
    keyed = await js(spike.SPIKE_INPUT(app, 'press_key', {key: INERT_KEY, spikeRoute: '3'}));
    afterKey = read();
    if (counters) { await sleepOf(ctx)(COUNTER_SETTLE_MS); counters.push(readCounters(shell, records.electron)); }
  } finally { lines = stopWatch(ops); }
  const afterFront = front();
  const same = (a, b) => Boolean(a?.range && b?.range) && a.range.location === b.range.location && a.range.length === b.range.length;
  emit({...base, ok: same(before, afterActivate) && same(before, afterKey), role: before.role ?? null,
    setError: set.result?.setError ?? set.error ?? null, before, afterActivate, afterKey,
    preservedByActivate: same(before, afterActivate), preservedByKey: same(before, afterKey),
    activate: activated.result ?? {error: activated.error, errorName: activated.errorName},
    keyRoute: keyed.meta?.['cua/inputRoute'] ?? null, keyFailed: keyed.cell?.ok ? keyed.cell.value?.failed ?? null : cellError(keyed),
    frontmostUnchanged: afterFront.frontmost?.pid === seen.frontmost?.pid, topWindowUnchanged: afterFront.topWindow?.number === seen.topWindow?.number,
    ...watchSummary(lines), ...(counters ? {counters: {activate: counterDeltas(counters[0], counters[1]), key: counterDeltas(counters[1], counters[2])}} : {})});
}

// Electron's counters around route 3's activation alone and around the inert key under each route.
async function electronCounterEffects(ctx) {
  const {js, emit, records, front, activate, ops, shell} = ctx;
  const app = records.electron.app, user = USER_WINDOW.electron;
  if (!records[user]) return emit({op: 'effects.counters', scene: 'electron', user, sample: 1, ok: false, notRun: `the user window's scene (${user}) is not up`});
  for (const [action, route] of [['activate', null], ...ROUTES.map(r => ['key', r])]) {
    const base = {op: 'effects.counters', scene: 'electron', user, action, forcedRoute: route, sample: 1};
    await activate(user);
    const seen = front();
    if (!userInFront(seen, records[user])) { emit({...base, ok: false, sent: false, error: 'the user window was not in front; nothing was sent'}); continue; }
    const before = readCounters(shell, records.electron);
    let outcome;
    if (action === 'activate') { const a = spikeAnswer(ops, 'activate', {app}); outcome = a.result ? {activate: a.result} : {failed: a.error, errorName: a.errorName}; }
    else {
      const keyed = await js(spike.SPIKE_INPUT(app, 'press_key', {key: INERT_KEY, spikeRoute: route}));
      outcome = {route: keyed.meta?.['cua/inputRoute'] ?? null, failed: keyed.cell?.ok ? keyed.cell.value?.failed ?? null : cellError(keyed)};
    }
    await sleepOf(ctx)(COUNTER_SETTLE_MS);
    const deltas = counterDeltas(before, readCounters(shell, records.electron));
    const afterFront = front();
    emit({...base, ok: !outcome.failed && deltas !== null, sent: true, ...outcome, counters: deltas,
      frontmostUnchanged: afterFront.frontmost?.pid === seen.frontmost?.pid, topWindowUnchanged: afterFront.topWindow?.number === seen.topWindow?.number});
  }
}

// ---- coord (U2) ---------------------------------------------------------------------------------------------------

// The coordinate click on TextEdit's scene document, TextEdit in front (an active app takes route 2's plain click, so
// the landing is the mapping's alone), then the ruled refusals and the moved window (Decision Log, "Coordinate clicks").
export async function coordGroup(ctx) {
  const {js, emit, records, activate, ops, active, shell, front, log = () => {}} = ctx;
  if (!active().includes('textedit')) return emit({op: 'coord.click', scene: 'textedit', sample: 1, ok: false, notRun: 'the TextEdit scene is not up'});
  const app = records.textedit.app, lines = textEditDocument().lines;
  const selection = () => { const a = spikeAnswer(ops, 'selection', {app}); return a.result?.range ?? null; };
  const landing = (point, range) => {
    const landedLine = range ? lineOfLocation(range.location, lines) : null;
    return {range, landedLine, lineError: landedLine === null ? null : landedLine - point.line};
  };
  await activate('textedit');
  const geometry = await js(spike.GEOMETRY('textedit', app, SCENE_WINDOW.textedit, ACTION_TARGET.textedit));
  if (!geometry.cell?.ok) return emit({op: 'coord.click', scene: 'textedit', sample: 1, ok: false, error: `geometry: ${cellError(geometry)}`});
  const g = geometry.cell.value, plan = textEditPoints(g);
  const facts = {lineHeight: plan.lineHeight, lineHeightFrom: plan.lineHeightFrom, window: g.window.frame, textView: g.frame, screenshot: g.screenshot, screenshotBytes: g.screenshotBytes};
  let sample = 0;
  for (const point of plan.points) {
    sample++;
    if (point.x === null) { emit({op: 'coord.click', scene: 'textedit', sample, line: point.line, ok: false, error: 'the point is outside the window', ...facts}); continue; }
    const clicked = await js(spike.CLICK_AT('textedit', point.x, point.y));
    const landed = landing(point, selection());
    const failed = clicked.cell?.ok ? clicked.cell.value.failed ?? null : cellError(clicked);
    emit({op: 'coord.click', scene: 'textedit', sample, line: point.line, pixel: {x: point.x, y: point.y}, local: point.local, scale: point.scale,
      route: clicked.meta?.['cua/inputRoute'] ?? null, failed, ...landed, ok: !failed && landed.lineError !== null && Math.abs(landed.lineError) <= 1, exact: landed.lineError === 0, ...facts});
  }
  const top = plan.points[0];
  if (!top || top.x === null) return;

  // (1) No screenshot-bearing observation on the connection: the spike service captures on every observation, so the
  // facade cannot reach this refusal; a fresh engine connection (./fresh-click.mjs on the device) holds none.
  const fresh = freshClick(ctx, app, top);
  const freshName = fresh?.error?.errorName ?? null;
  emit({op: 'coord.refusal.noScreenshot', scene: 'textedit', sample: 1, expected: 'noScreenshotForCoordinates', ok: freshName === 'noScreenshotForCoordinates',
    refused: fresh?.ok === false, errorName: freshName, sentence: fresh?.error?.message ?? null, ...(fresh?.ok ? {clicked: true, landed: landing(top, selection())} : {}), ...(fresh?.unreachable ? {unreachable: fresh.unreachable} : {})});

  // (2) The window moved after the observation: the ruled rule places the click in the current window (no refusal),
  // so it lands on the same line. The move is the harness's own (move-window.swift on the run's TextEdit window).
  const seen = front();
  const bounds = seen.frontmost?.pid === records.textedit.pid && seen.topWindow?.ownerPid === records.textedit.pid ? seen.topWindow.bounds : null;
  if (!bounds) emit({op: 'coord.moved', scene: 'textedit', sample: 1, ok: false, notRun: 'the scene document was not the front window to move'});
  else {
    const moved = moveWindow(shell, records.textedit.pid, bounds, 60, 40);
    if (!moved?.moved) emit({op: 'coord.moved', scene: 'textedit', sample: 1, ok: false, notRun: `the harness could not move its window: ${moved?.error ?? 'no answer'}`, trusted: moved?.trusted ?? null});
    else {
      try {
        const clicked = await js(spike.CLICK_AT('textedit', top.x, top.y));
        const failed = clicked.cell?.ok ? clicked.cell.value.failed ?? null : cellError(clicked);
        const landed = landing(top, selection());
        emit({op: 'coord.moved', scene: 'textedit', sample: 1, by: {x: 60, y: 40}, expected: 'lands in the current window', refused: Boolean(failed && NO_SCREENSHOT.test(failed)), failed,
          route: clicked.meta?.['cua/inputRoute'] ?? null, ...landed, ok: !failed && landed.lineError === 0});
      } finally {
        const back = moveWindow(shell, records.textedit.pid, moved.to, -60, -40);
        if (!back?.moved) { log(`coord: the TextEdit scene window could not be moved back (${back?.error ?? 'no answer'})`); ctx.meta?.problems.push('coord: the TextEdit scene window was not moved back'); }
      }
    }
  }

  // (3) The window replaced: a new document becomes TextEdit's primary window and the click comes without a fresh
  // observation, so the stored screenshot shows another window: refused before anything is posted.
  await activate('textedit');
  const before = front();
  const opened = await js(spike.PRESS('textedit', 'super+n'));
  let replaced = null;
  for (let i = 0; i < 20 && !replaced; i++) {
    const now = front();
    if (now.topWindow?.ownerPid === records.textedit.pid && now.topWindow.number !== before.topWindow?.number) replaced = now.topWindow.number;
    else await sleepOf(ctx)(250);
  }
  const clicked = replaced === null ? null : await js(spike.CLICK_AT('textedit', top.x, top.y));
  const failed = clicked === null ? null : clicked.cell?.ok ? clicked.cell.value.failed ?? null : cellError(clicked);
  // The new document closes as the baseline's task does (its keep-or-delete sheet answered Delete); one that does not
  // close stops all input, since every later cell expects the scene document in front.
  const adopted = opened.cell?.ok ? await js(spike.ADOPT_FRONT_DOCUMENT(SCENE_WINDOW.textedit)) : null;
  const closed = adopted?.cell?.ok ? await js(TASK_CLOSE) : null;
  emit({op: 'coord.refusal.replaced', scene: 'textedit', sample: 1, expected: 'noScreenshotForCoordinates', newWindow: replaced !== null,
    refused: Boolean(failed && NO_SCREENSHOT.test(failed)), failed, ok: Boolean(failed && NO_SCREENSHOT.test(failed)), closed: closed?.cell?.ok === true,
    ...(replaced === null ? {error: opened.cell?.ok ? 'no new TextEdit window came to the front' : `super+n: ${cellError(opened)}`} : {})});
  if (adopted && closed?.cell?.ok !== true) throw new Stop(`the coordinate refusal's new TextEdit document did not close (${closed ? cellError(closed) : cellError(adopted)}); no further input was sent`);
}

// One coordinate click on a fresh engine connection (./fresh-click.mjs through the device shell). -> its envelope.
export function freshClick({shell, d, engine}, app, {x, y}) {
  try {
    const out = shell(`${d?.node ?? 'node'} scripts/spike/engine/measure/fresh-click.mjs ${quote(app)} ${Number(x)} ${Number(y)}${engine ? ` --engine ${quote(engine)}` : ''}`);
    return JSON.parse(String(out).trim().split('\n').at(-1));
  } catch (error) { return {ok: false, error: {errorName: 'device', message: String(error.stdout || error.message).trim().split('\n').at(-1).slice(0, 200)}}; }
}

// The harness's own window move (./move-window.swift through the device shell). -> its JSON | {error}.
export function moveWindow(shell, pid, bounds, dx, dy) {
  try {
    const out = shell(`swift scripts/spike/engine/move-window.swift ${Number(pid)} ${[bounds.x, bounds.y, bounds.width, bounds.height].map(Number).join(',')} ${Number(dx)} ${Number(dy)}`);
    return JSON.parse(String(out).trim().split('\n').at(-1));
  } catch (error) { return {moved: false, error: String(error.stdout || error.message).trim().split('\n').at(-1).slice(0, 200)}; }
}

// ---- tap (U5) -----------------------------------------------------------------------------------------------------

// probe_tap start and stop per mode, in the order given (U5's: the listen-only tap, then the active default-option tap,
// both under Accessibility alone; the runbook runs the group again after the owner adds Input Monitoring). -> the modes
// whose tap was created.
export async function tapGroup(ctx, modes) {
  const {emit, ops, records} = ctx;
  if (!records.textedit) { emit({op: 'tap.create', scene: 'textedit', sample: 1, ok: false, notRun: 'the TextEdit scene is not up'}); return []; }
  const created = [];
  for (const mode of modes) {
    const base = {op: 'tap.create', scene: 'textedit', sample: 1, mode};
    let started;
    try { started = ops.probeTap('start', {app: records.textedit.app, seconds: 10, mode}); }
    catch (error) {
      if (error instanceof Stop) throw error;
      const refused = refusalFields(error);
      emit({...base, ok: false, created: false, ...refused, mode: refused.mode ?? mode});
      continue;
    }
    let report = null, stopError = null;
    try { report = ops.probeTap('stop'); } catch (error) { stopError = refusalFields(error); }
    const wasCreated = started?.created !== false;
    if (wasCreated) created.push(mode);
    emit({...base, ok: wasCreated && !stopError, created: wasCreated, mode: started?.mode ?? mode,
      listenPreflight: started?.listenPreflight ?? report?.listenPreflight ?? null, postPreflight: started?.postPreflight ?? report?.postPreflight ?? null,
      start: started, ...(report ? {stop: {...tapCounts(report), hidIdleMs: report.hidIdleMs ?? null, reenables: report.reenables ?? null, disabledBy: report.disabledBy ?? null,
        listenPreflight: report.listenPreflight ?? null, postPreflight: report.postPreflight ?? null}} : {}),
      ...(stopError ? {stopError} : {})});
  }
  return created;
}
