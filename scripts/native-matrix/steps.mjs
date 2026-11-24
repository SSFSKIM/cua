// The native matrix's steps (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system parts 4
// to 6): what every section of a run (./run.mjs; the probe cells, ./probe-run.mjs; the Korean and Unicode matrix,
// ./unicode-run.mjs) does on the device and the lane, each keeping its device-clock window so the activation watcher's
// events are accounted for (./oracle.mjs accountActivations). `ctx` is the run's (./run.mjs runOnce): {ops, run, rows,
// problems, meta, samples, n, engine, records, lane, checkpoint, log, now, sleep, watcher, windows, judged, posted}.
import {frontmostFromProbe, sendIfFrontmost} from '../accept/key-guard.mjs';
import {guardOf, SCENES} from '../repl-parity/scenes-mac.mjs';
import {keyWindowCause, overlaps, recordKeyWindowReading} from '../hosted-sittings/alert-guard.mjs';
import {guardCause, PANEL_SERVICE, recordKeyUnread, sceneOfCell, sendsPointer} from './alert-guard.mjs';
import {caretOutcome, caretPrepared} from './caret.mjs';
import {CAPTURE_ALERT_PROCESS} from './live-checks.mjs';
import {COMPOSITION_QUIET_MS} from './live-device.mjs';
import {caseCells, requeryCell} from './matrix-cells.mjs';
import {userWindowOf} from './oracle.mjs';
import {ACCEPTANCE_3, caseId, focusVerdict, groundCase, isAcceptance3, isPanelTarget, methodTimingId, SCENE_OF, WINDOWLESS_BUNDLE_ID} from './plan.mjs';
import {keystrokeGate, probeProblem, WITNESS_FILES, WITNESS_LEAD_MS, WITNESS_PREPARE_CELL, witnessCheckCell} from './probe-plan.mjs';

// The acts that may paste (type_text's paste route included): each sent only between two alert checks.
export const PASTING = Object.freeze(['paste', 'typeText']);

// Stops the run (its put-back runs): something the run must not act past.
export class Stop extends Error {}
// The key guard's own stop (sendKeys): the keys unsent because the front is not the run's. A caller that must still
// record its step and undo what it opened (./panels.mjs closePanel) catches this one alone, then stops the run with it.
// `category`: what the guard saw, as a NO VERDICT cause: `unread` (the front not read) or `invalid` (a readable front that is
// not the run's, UserNotificationCenter with no capture alert held included).
export class KeyGuardStop extends Stop {
  constructor(message, category) { super(message); this.category = category; }
}

export const push = (ctx, row) => { ctx.rows.push(row); return row; };
// A step's device-clock window; a harness step names the apps it intends to activate (`apps`), the only activations
// it excuses (./oracle.mjs accountActivations).
export const mark = (ctx, kind, key, at, apps = []) => {
  if (Array.isArray(at) && at.length === 2 && at.every(Number.isFinite)) ctx.windows.push({kind, key, at, ...(kind === 'harness' ? {apps} : {})});
};
// A js cell, its device-clock window kept under `kind`.
// A harness cell's key is the one its key-window guard counts under (ctx.harnessKey; guardLane).
export async function js(ctx, kind, key, code, {timeoutMs, apps} = {}) {
  if (kind === 'harness') ctx.harnessKey = key;
  let r;
  try { r = await ctx.lane.js(code, timeoutMs); } finally { delete ctx.harnessKey; }
  mark(ctx, kind, key, r.at, apps);
  return r;
}
export const TEXTEDIT = [SCENES.textedit.bundleId];
// A scenes command through ./matrix-device.mjs step, its window the harness's: `activate` intends its scene's app,
// `down` (of a scene not in front) intends none. An activation's own check (the device's reading of front and key after
// it, ./matrix-device.mjs activationCheck) is the activate step in force (`ctx.activated`, activationOf) for the cells
// that follow, until the next. -> the command's answer.
export function step(ctx, args) {
  const {answer, at, frontKey} = ctx.ops.matrix(['step', ...args, '--run', ctx.run]) ?? {};
  mark(ctx, 'harness', args.join(':'), at, args[0] === 'activate' ? [SCENES[args[1]].bundleId] : []);
  if (args[0] === 'activate') {
    const app = SCENES[args[1]].bundleId, seen = keyReading({frontKey});
    ctx.activated = {app, front: seen.front === app, key: seen.key === app, seen};
    if (answer?.windowOrder) {
      (ctx.meta.activationGuards ??= []).push({scene: args[1], beforeRow: ctx.rows.length, at, ok: answer.ok,
        ...(answer.reason ? {reason: answer.reason} : {}), windowOrder: answer.windowOrder, ...(answer.framePin ? {framePin: answer.framePin} : {})});
    }
  }
  return answer;
}
export const activate = (ctx, scene) => step(ctx, ['activate', scene]);
// The engine under test's roots, for the device to tell its own windows (./matrix-device.mjs enginePids).
const engineRoots = ctx => [['--approved-runtime', ctx.approvedRuntime], ['--approved-engine', ctx.approvedEngine]].filter(([, root]) => root).flat();
// `electronMode`: the Electron fixture's accessibility mode as its record last showed it, read with the rest
// (./matrix-device.mjs read --electron-mode); `frontKey`: the front and key applications' bundle ids (./front-key.mjs);
// `windowOrder`: every on-screen window front to back (the window-order oracle, #485); `alertBounds`: the alert guard's
// reading of the alert windows and the run's own (./alert-guard.mjs); `keyWindow`: a scene, whose app's own key window
// is read (`ownKey`, ../hosted-sittings/key-window.mjs).
// Every engine window a read passed over (ruling 1219: the front-window read skips the engine under test's own windows,
// cua's cursor and the vendor's overlay alike) is counted in meta.frontWindowSkips, keyed by its bundle, number and layer.
export const read = (ctx, focus = null, {electronMode = false, frontKey = false, windowOrder = false, alertBounds = false, keyWindow = null} = {}) => {
  const also = [...(frontKey ? ['front-key'] : []), ...(windowOrder ? ['window-order'] : []), ...(alertBounds ? ['alert-bounds'] : [])];
  const own = keyWindow ? ownKeyWindowNumber(ctx, keyWindow) : null;
  const r = ctx.ops.matrix(['read', '--run', ctx.run, ...(ctx.watcher !== null ? ['--watcher', String(ctx.watcher)] : []),
    ...(focus ? ['--focus', focus] : []), ...engineRoots(ctx), ...(electronMode ? ['--electron-mode', 'latest'] : []), ...(also.length ? ['--with', also.join(',')] : []),
    ...(keyWindow ? ['--key-window', keyWindow] : []), ...(own !== null ? ['--key-window-number', String(own)] : [])]);
  for (const w of r?.frontWindow?.skipped ?? []) {
    const skips = ctx.meta.frontWindowSkips ??= {}, k = `${w.bundleId ?? 'unnamed'}#${w.number ?? '?'}@${w.layer ?? 0}`;
    skips[k] = (skips[k] ?? 0) + 1;
  }
  return r;
};
// What a read showed in front, against the pid expected (rulings 1219's h2 and h3): the front app (its bundle; its pid
// when the run's own), the top window the read named and the engine windows it passed over (./matrix-device.mjs
// frontWindow), after `reads` reads. Recorded on a row a user or scene window not in front left invalid, never judged.
export const frontSeen = (r, expectedPid, reads = 1) => ({expectedPid: expectedPid ?? null, reads,
  front: {bundleId: r?.frontKey?.front ?? r?.reading?.frontmost?.bundleId ?? null, pid: r?.reading?.frontmost?.pid ?? null},
  top: r?.frontWindow?.top ?? null, skipped: r?.frontWindow?.skipped ?? []});
// The activate step's own answer (../repl-parity/scenes-mac.mjs activateScene): ok, its reason, the frontmost process it
// last read and how many reads it took.
export const activationSeen = answer => ({ok: answer?.ok === true, reason: answer?.reason ?? null,
  frontmost: answer?.frontmost ? {bundleId: answer.frontmost.bundleId ?? null, pid: answer.frontmost.pid ?? null} : null, reads: Number.isSafeInteger(answer?.reads) ? answer.reads : null});
// A user window that did not come to the front (h2): what the activation and the read after it saw.
export const userWindowSeen = (ctx, user, front, r) => ({activate: activationSeen(front), ...(front?.ok ? frontSeen(r, ctx.records[user]?.pid) : {expectedPid: ctx.records[user]?.pid ?? null})});

// The run's own windows as the key window it expects (pilot C-3, ruling 1203): a document the run opened with ⌘N on a
// scene (the sheet variant's and #212's untitled document, the Save sheet target's) becomes that app's key window
// without being its frontmost window in the window list when the app is in the background, so the key-window guard,
// reading the frontmost one, refused the case's next key and its cleanup. Its number, read when it opens
// (ownWindowOpened), is the window the guard reads for, but only for the cells of the case that opened it (`owner`, the
// case in force: ctx.caseOwner) and that case's cleanup, its held fixture's reset included. Any other case's cell is
// read as before, so a window the run did not open for that case still refuses. Each opening is kept in
// meta.ownWindows (ownWindowOpened).
export const ownKeyWindowNumber = (ctx, scene) => (ctx.ownWindow && ctx.ownWindow.scene === scene && ctx.ownWindow.owner === ctx.caseOwner ? ctx.ownWindow.number : null);
const windowNumbersOf = (r, scene) => (Array.isArray(r?.alertBounds?.windows) ? new Set(r.alertBounds.windows.filter(w => w.scene === scene).map(w => w.number)) : null);
// The scene's windows on screen by number (the alert guard's reading), or null when the list was unread.
export const sceneWindowNumbers = (ctx, scene) => windowNumbersOf(read(ctx, null, {alertBounds: true}), scene);
// The window the run just opened on `scene` recorded as the case's own key window (pilot C-4, ruling 1213): the app's
// AXFocusedWindow just after the opening cell confirmed the new document in front of TextEdit, resolved to its number in
// the window list (../hosted-sittings/key-window.mjs `focused`: one window of the process at its frame), taken only when
// it is among the windows new since `known` (the scene's windows before the opening) and agrees with the window list's
// newcomer when there is exactly one. Unread focus, no focused window, or a focused window that was there before (the
// old focus) leave the one newcomer to stand. Evidence that conflicts (a focused window new but not the newcomer, one not
// joined to a single window, one neither new nor old) records the disagreement and takes no own window: the guard reads
// as before, and no sheet is exempt (review of b12c7121a..2a2dd8dd6, finding 2). Kept: {owner, scene, number, from:
// 'focused' | 'newcomer', focused, newcomer, focusedReason?, newcomerReason?}, or {owner, scene, focused, newcomer,
// reason, disagreement?} with none taken.
// `opensSheet`: the case opens a sheet on the window itself (the sheet variant, #212's, the Save sheet target's), which
// alone lets a sheet of it hold the focus for its cells (keyWindowGuard; ruling 1214). Kept on ctx.ownWindow, not meta.
export function ownWindowOpened(ctx, scene, known, {opensSheet = false} = {}) {
  const owner = ctx.caseOwner ?? null;
  ctx.ownWindow = null;
  const r = read(ctx, null, {alertBounds: true, keyWindow: scene});
  const now = windowNumbersOf(r, scene), fresh = now && known ? [...now].filter(n => !known.has(n)) : null;
  const newcomer = fresh?.length === 1 ? fresh[0] : null;
  const newcomerReason = newcomer !== null ? null : !fresh ? 'the window list was unread' : fresh.length ? `${fresh.length} new windows` : 'no new window';
  const f = r?.ownKey?.trusted === true ? r.ownKey.focused : undefined;
  const n = f && typeof f === 'object' ? f.number : null;
  let focused = null, focusedReason = null, disagreement = null;
  if (f === undefined || f === 'unread') focusedReason = 'Accessibility\'s focused window was unread';
  else if (f === null) focusedReason = 'Accessibility named no focused window';
  else if (Number.isSafeInteger(n) && known?.has(n)) focusedReason = `Accessibility's focused window, ${n}, is no new window`;
  else if (!Number.isSafeInteger(n)) disagreement = f.ambiguous ? `Accessibility's focused window is at the frame of ${f.ambiguous} windows` : 'Accessibility\'s focused window is not in the window list';
  else if (!fresh?.includes(n)) disagreement = `Accessibility's focused window, ${n}, is not among the windows new since the opening`;
  else if (newcomer !== null && newcomer !== n) disagreement = `Accessibility's focused window, ${n}, is not the window list's newcomer, ${newcomer}`;
  else focused = n;
  const number = disagreement ? null : focused ?? newcomer;
  const lone = newcomerReason === 'no new window' ? 'no new window in the window list' : newcomerReason;
  const entry = number === null ? {owner, scene, focused: Number.isSafeInteger(n) ? n : null, newcomer, ...(disagreement ? {disagreement} : {}),
    reason: disagreement ? `${disagreement}: no own window taken` : `${focusedReason}; ${lone}`}
    : {owner, scene, number, from: focused !== null ? 'focused' : 'newcomer', focused, newcomer, ...(focusedReason ? {focusedReason} : {}), ...(newcomerReason ? {newcomerReason} : {})};
  (ctx.meta.ownWindows ??= []).push(entry);
  ctx.ownWindow = number === null ? null : {...entry, opensSheet};
  return ctx.ownWindow;
}
// The case's own window closed (its cleanup ran) or the case over: the window counts for nothing more.
export const ownWindowClosed = ctx => { ctx.ownWindow = null; };
export const focusOf = w => `${w.pid},${w.bounds.x},${w.bounds.y},${w.bounds.width},${w.bounds.height}`;
export const sameWindow = (a, b) => Boolean(a && b) && a.pid === b.pid && ['x', 'y', 'width', 'height'].every(k => a.bounds[k] === b.bounds[k]);

// The paste rows' system-alert watch (./matrix-device.mjs alerts check, the live paste check's): a possible alert stops
// the run untouched; only its sanitized export is kept. The engine under test's own windows (its roots) are not alerts.
// On a hosted run replayd's capture alert is held, not a stop (./live-checks.mjs alertWatch `hosted`; rulings 1136, 1141):
// a sample with it front or key is NO VERDICT by its front/key readings (./front-key.mjs). Each distinct held reading is
// kept in the run's meta (`alertsHeld`: {when, count, windows, checks}), for the pilot to identify the alert by.
// -> the check.
export function alertCheck(ctx, when) {
  const check = ctx.ops.matrix(['alerts', 'check', '--run', ctx.run, ...engineRoots(ctx), ...(ctx.meta.hosted === true ? ['--hosted', 'yes'] : [])]);
  if (check?.abort !== false) {
    ctx.meta.alert = {when, ...(check?.export ?? {})};
    throw new Stop(`a possible system alert appeared ${when}; the run stopped without touching it`);
  }
  const held = check.export?.held;
  if (held?.count > 0) {
    const windows = JSON.stringify(held.windows);
    const seen = (ctx.meta.alertsHeld ??= []).find(h => JSON.stringify(h.windows) === windows);
    if (seen) seen.checks += 1; else ctx.meta.alertsHeld.push({when, count: held.count, windows: held.windows, checks: 1});
  }
  return check;
}

// A guarded key held back on a hosted run because replayd's capture alert is in front (rulings 1136, 1141): the key is
// never sent, and the sample it was for is recorded NO VERDICT by its readings (./front-key.mjs `alert`), the run going
// on "alert up, scene activated first". `reading` is the guard's own observation: the front it saw (the alert), with the
// key read just after. `row` is what every row it was for carries: `alertHeld`, which makes the sample NO VERDICT
// `alert` whatever its readings say (./front-key.mjs sampleCause), and an invalid reason as a backstop. Thrown by
// sendKeys, caught where the sample's row is made (caseRow, ./probe-run.mjs sampled, ./unicode-run.mjs, ./run.mjs openPanel).
export const HELD_INVALID = 'the key guard held the action\'s keys: replayd\'s capture alert in front';
export class AlertHeld extends Error {
  constructor(keys, reading) {
    super(`${keys.join(', ')} not sent: replayd's capture alert is in front (held, ruling 1141)`);
    this.reading = reading;
    this.row = {alertHeld: {keys, front: reading.front}, invalid: HELD_INVALID};
  }
}

// A cell the alert guard refused (ruling 1154, ./alert-guard.mjs): nothing of it was sent, and it is never retried. Thrown
// in the cell's place, it is an AlertHeld, so every place that makes a row of a held key makes one of it alike (the
// readings around it the row's), its `row` mark (`alertGuard` {cause, detail}) making the sample NO VERDICT `alert` or
// `unread` (./front-key.mjs sampleCause), with an invalid reason as a backstop. `reading`: the front and key the guard read;
// `guard`: the guard's cause ({category, detail}).
export const GUARD_INVALID = 'the alert guard refused the cell: nothing of it was sent';
// A key-window refusal keeps the window Accessibility held focused (`focused`, ../hosted-sittings/alert-guard.mjs
// keyWindowCause) on the row and in meta.alertGuards.
const focusedOf = cause => (cause.focused !== undefined ? {focused: cause.focused} : {});
export const guardRow = cause => ({alertGuard: {cause: cause.category, detail: cause.detail, ...focusedOf(cause)}, invalid: GUARD_INVALID});
export class AlertGuarded extends AlertHeld {
  constructor(cause, reading) {
    super([], reading);
    this.message = `nothing sent: ${cause.detail} (the alert guard, ruling 1154)`;
    this.guard = cause;
    this.row = guardRow(cause);
  }
}
// A refusal kept in the run's meta (`alertGuards`: {beforeRow, cause, detail}).
export const noteGuard = (ctx, cause) => (ctx.meta.alertGuards ??= []).push({beforeRow: ctx.rows.length, cause: cause.category, detail: cause.detail, ...focusedOf(cause)});
// The guard before a cell: refused when `cause` (./alert-guard.mjs guardCause) names one.
function refuse(ctx, cause, reading) {
  noteGuard(ctx, cause);
  throw new AlertGuarded(cause, reading);
}
// The key-window requirement (ruling 1169's addition; ../hosted-sittings/alert-guard.mjs keyWindowCause) before a click
// or key cell bound to a scene the run put up: its app holds the scene window as its own key window, read in the same
// read as the cell's other guards. Not while TextEdit's Open panel is up (ctx.panelOpen, ./run.mjs openPanel and
// closePanel): the panel is then TextEdit's focused window, as it must be for the panel's cells. -> the scene to read
// for, or null.
export const keyWindowScene = (ctx, scene) => (scene && !ctx.panelOpen && ctx.records?.[scene] ? scene : null);
// Refused (AlertGuarded, NO VERDICT keyWindow) when the reading shows another key window; otherwise counted under
// `key`, read (meta.keyWindowRead) or not taken (meta.keyWindowUnread, the cell then sent unchecked). A sheet of the
// window read holding the focus is exempt only under ruling 1214's three conditions: that case opens a sheet on its own
// window itself (ownWindowOpened's `opensSheet`), the reading was for that window (so the case in force, its cleanup or
// its reset, is the one that opened it, ownKeyWindowNumber), and the sheet's proved parent is that window
// (keyWindowCause's `sheetParent`); anywhere else it is refused. -> the exemption taken ({key, focused}) or null: the
// caller counts it once the cell is dispatched (sheetSent), never for a cell a later gate kept back.
function keyWindowGuard(ctx, r, key) {
  const sheetParent = r?.ownKey?.own === true && ctx.ownWindow?.opensSheet === true ? ctx.ownWindow.number : null;
  const cause = keyWindowCause(r?.ownKey, {sheetParent});
  if (cause) refuse(ctx, cause, keyReading(r));
  recordKeyWindowReading(ctx.meta, key, r?.ownKey ?? null);
  return !cause && sheetParent !== null && r.ownKey.trusted === true && r.ownKey.ok === true && r.ownKey.focusedWindow === 'sheet' ? {key, focused: r.ownKey.focused ?? null} : null;
}
// A cell sent under the sheet exemption, kept under its key with the focused window (meta.keyWindowSheets: {count,
// focused}, the first reading's), which the row it is for carries too (`keyWindowSheet`, ./probe-run.mjs).
function sheetSent(ctx, exempt) {
  if (!exempt) return;
  const kept = (ctx.meta.keyWindowSheets ??= {})[exempt.key] ??= {count: 0, focused: exempt.focused};
  kept.count += 1;
}
// The lane every cell of the run goes through (./run.mjs): a cell that sends a pointer event (./alert-guard.mjs
// sendsPointer), on either engine alike, is sent only after a fresh read of the screen shows no alert over its target's
// windows (the scene its prelude binds, sceneOfCell; every window of the run when it binds none) and the alert holding
// neither front nor key, and its scene's app holding the scene window as its key window (keyWindowGuard, counted under
// the harness cell's key or else the row the cell is for); else AlertGuarded, the cell unsent.
export function guardLane(ctx, lane) {
  return {...lane, js: async (code, timeoutMs) => {
    if (sendsPointer(code) && ctx.elementGuard) {
      // A key case's pointer cell under ruling 1203's fallback (the search typing's click on its field).
      const r = read(ctx, null, {frontKey: true, alertBounds: true});
      const cause = elementGuardCause(ctx, 'search', r);
      if (cause) refuse(ctx, cause, keyReading(r));
    } else if (sendsPointer(code)) {
      const scene = sceneOfCell(code), owned = keyWindowScene(ctx, scene);
      const r = read(ctx, null, {frontKey: true, alertBounds: true, keyWindow: owned});
      const reading = keyReading(r), cause = guardCause(r?.alertBounds ?? null, reading, {scenes: scene ? [scene] : null});
      if (cause) refuse(ctx, cause, reading);
      if (owned) sheetSent(ctx, keyWindowGuard(ctx, r, ctx.harnessKey ?? `row:${ctx.rows.length}`));
    }
    return lane.js(code, timeoutMs);
  }};
}

// A key cell sent only under the key guard: the driven scene's process in front, or (given `userWindow`) the run's
// user window. A skip with one of the run's windows in front leaves the row invalid; any other front (the owner at the
// Mac, an alert) stops the run, except on a hosted run with UserNotificationCenter in front while the alert watch holds
// replayd's capture alert and nothing else: then AlertHeld, the key never sent, the device-clock window from the run's
// last marked step through a read of front and key marked as the sample's (`kind` 'row'; else 'setup'), so the alert's
// own activation is accounted to it. Before all that, a key the alert holds is refused (the alert guard, ruling 1154:
// AlertGuarded), the keys unsent: an alert with the key and some other app in front would take them; and so is one whose
// scene's app does not hold the scene window as its key window (keyWindowGuard).
// -> the cell's answer, or null when it was not sent.
export async function sendKeys(ctx, code, keys, {scene, front, userWindow, kind = 'harness', key = `keys:${keys.join('+')}`}) {
  const owned = keyWindowScene(ctx, scene);
  // Under ruling 1203's fallback (a key case's cells, the close's Escape) every check reads afresh, the front included.
  const elementGuard = ctx.elementGuard ?? null;
  const r = !elementGuard && front?.frontKey && (!owned || front.ownKey) ? front : read(ctx, null, {frontKey: true, keyWindow: owned, alertBounds: Boolean(elementGuard)});
  const seenKey = keyReading(r);
  if (seenKey.key === CAPTURE_ALERT_PROCESS && seenKey.front !== CAPTURE_ALERT_PROCESS) refuse(ctx, guardCause(null, {key: seenKey.key}), seenKey);
  if (elementGuard) { const cause = elementGuardCause(ctx, 'focused', r); if (cause) refuse(ctx, cause, seenKey); }
  const exempt = owned ? keyWindowGuard(ctx, r, key) : null;
  // The key not read: the cell goes unguarded against the alert holding the key (the key-cell premise), counted under its
  // span's key (meta.keyUnread; a row's `row:<index>`, which the hosted counts map to the row's cell).
  if (seenKey.key === null) recordKeyUnread(ctx.meta, key);
  const target = guardOf(scene, ctx.records[scene]);
  const out = await sendIfFrontmost({target, keys, frontmost: () => frontmostFromProbe((elementGuard ? r : front ?? read(ctx)).reading),
    send: () => js(ctx, kind, key, code, {apps: [SCENES[scene].bundleId]}),
    ...(userWindow ? {userWindow} : {})});
  if (out.sent) { sheetSent(ctx, exempt); return out.result; }
  const seen = out.skipped.frontmost;
  const skip = {keys, scene, front: seen === 'unreadable' ? 'unreadable' : {bundleId: seen.bundleId ?? null, owned: seen.owned === true}};
  ctx.meta.keySkipped.push(skip);
  if (ctx.meta.hosted === true && seen !== 'unreadable' && seen.owned !== true && seen.bundleId === CAPTURE_ALERT_PROCESS) {
    const check = alertCheck(ctx, `at the key guard for ${keys.join(', ')}`);
    if (!(check.export?.held?.count > 0)) throw new KeyGuardStop(`${keys.join(', ')} not sent: UserNotificationCenter is in front and the alert watch holds no capture alert; the run stopped`, 'invalid');
    skip.held = true;
    const r = read(ctx, null, {frontKey: true});
    const ends = ctx.windows.map(w => w.at[1]);
    if (Array.isArray(r?.at)) mark(ctx, kind === 'row' ? 'row' : 'setup', key, [ends.length ? Math.max(...ends) : r.at[0], r.at[1]]);
    throw new AlertHeld(keys, {front: seen.bundleId, key: keyReading(r).key});
  }
  if (seen === 'unreadable' || seen.owned !== true) throw new KeyGuardStop(`${keys.join(', ')} not sent: the front is not one of the run\'s windows${seen === 'unreadable' ? ': it was unread' : ''} (#162); the run stopped`, seen === 'unreadable' ? 'unread' : 'invalid');
  return null;
}

// Ruling 1203's fallback (./panels.mjs placePanel: the Open panel's negative x clamped, the panel short of the strip):
// a key case's cells are checked where their input lands, not on the whole panel. `element` 'focused' (where a key
// lands: the panel's focused element) or 'search' (the search field its typing's prepare clicks), its frame read on the
// device (./matrix-device.mjs panel element) beside the alert windows' bounds in `r` (the guard's read). Refused when the
// capture alert holds the front or the key, when an alert overlaps that frame (`alert`), or when either was not read
// (`unread`). Each check is kept in meta.elementGuards ({beforeRow, element, frame, cause?}). -> {category, detail} | null.
const ELEMENT_NAMES = Object.freeze({focused: 'focused element', search: 'search field'});
const isRect = r => Boolean(r) && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(r[k]));
const rectText = r => `${r.x},${r.y} ${r.width}x${r.height}`;
export function elementGuardCause(ctx, element, r) {
  const name = `the Open panel's ${ELEMENT_NAMES[element]}`;
  const check = {beforeRow: ctx.rows.length, element, frame: null};
  (ctx.meta.elementGuards ??= []).push(check);
  const held = guardCause({alerts: [], windows: []}, keyReading(r));
  const alerts = r?.alertBounds?.alerts;
  let cause = held;
  if (!cause && (!Array.isArray(alerts) || alerts.some(a => !isRect(a?.bounds)))) cause = {category: 'unread', detail: `the alert windows' bounds were not read, so ${name} could not be checked against them`};
  if (!cause) {
    let answer = null;
    try { answer = device(ctx, ['panel', 'element', '--window', String(ctx.elementGuard.window), '--element', element]); } catch (error) {
      if (error instanceof Stop) throw error;
    }
    check.frame = isRect(answer?.frame) ? answer.frame : null;
    const hit = check.frame && alerts.find(a => overlaps(a.bounds, check.frame));
    cause = !check.frame ? {category: 'unread', detail: `${name} was not read${answer?.inWindow === false ? ': the focused element is not in the panel' : answer?.refused ? `: ${answer.refused}` : ''}`}
      : hit ? {category: 'alert', detail: `alert window ${hit.number ?? '?'} (${rectText(hit.bounds)}) overlaps ${name} (${rectText(check.frame)})`} : null;
  }
  if (cause) check.cause = cause.category;
  return cause;
}

// The user window in front, and its app key, again before an act: read (front, key and the window order with it), and
// once re-activated when it is not. `rekey` false: a key held elsewhere is read and left (the composing rows', whose user
// window holds a composition an activation could end), so the row's readings say so. -> the reading, `inFront` whether
// the user window was then the front one. `keysTo`: the scene a key cell sent next goes to, whose key window is read in
// the same read (keyWindowScene), so sendKeys takes no device read of its own inside a timed probe's lead.
export async function userFront(ctx, user, userWindow, {rekey = true, keysTo = null} = {}) {
  const app = SCENES[user].bundleId, keyWindow = keyWindowScene(ctx, keysTo);
  const inFront = r => sameWindow(userWindowOf(r?.reading, userWindow.pid), userWindow);
  let r = read(ctx, null, {frontKey: true, windowOrder: true, keyWindow});
  if (inFront(r) && (!rekey || r?.frontKey?.key === app)) return {...r, inFront: true};
  activate(ctx, user);
  r = read(ctx, null, {frontKey: true, windowOrder: true, keyWindow});
  return {...r, inFront: inFront(r)};
}

// ---- the readings around a judged act (./front-key.mjs) -------------------------------------------------------------

export {PANEL_SERVICE};
// A target's app (a scene, the Open panel's TextEdit, the windowless app), by bundle id.
export const bundleOf = target => (target === 'windowless' ? WINDOWLESS_BUNDLE_ID : SCENES[SCENE_OF[target] ?? target].bundleId);
// The target's own windows' apps, for the window-order oracle (#485): its app's and, for the Open panel, its service's.
export const targetsOf = target => [bundleOf(target), ...(isPanelTarget(target) ? [PANEL_SERVICE] : [])];
// The apps a cell itself puts on screen (./front-key.mjs `apps`): its target's and, behind a user window, the user's.
export const appsOf = (target, user = null) => [...new Set([...targetsOf(target), ...(user ? [SCENES[user].bundleId] : [])])];
// A reading's front and key applications, bundle ids (null when unread).
export const keyReading = r => ({front: r?.frontKey?.front ?? null, key: r?.frontKey?.key ?? null});
export const readKey = ctx => keyReading(read(ctx, null, {frontKey: true}));
// The same with the read's device-clock window (`at`, null when the device gave none), for a step whose window must
// cover the reads beside its call. -> {reading: {front, key}, at}.
export const readKeyAt = ctx => { const r = read(ctx, null, {frontKey: true}); return {reading: keyReading(r), at: r?.at ?? null}; };
// The activate step in force for a cell whose activated app is `app`: the last activation's own check when it was that
// app's, else a check that did not take (nothing activated it since). -> {app, front, key}.
export const activationOf = (ctx, app) => (ctx.activated?.app === app ? {app, front: ctx.activated.front, key: ctx.activated.key} : {app, front: false, key: false});
export const activated = (ctx, app) => { const a = activationOf(ctx, app); return a.front && a.key; };
// The readings of a cell whose act was skipped because its activation did not take: what the check read after the
// activate step, nothing after (./front-key.mjs: `after` null, the cause stays `activation`).
export const skippedReadings = (ctx, apps, app) => ({apps, activate: activationOf(ctx, app), before: ctx.activated?.app === app ? ctx.activated.seen : {front: null, key: null}, after: null});
// An activate step of `scene` whose check did not show its app front and key (whatever the scenes command answered:
// its process never came to the front within its bound, or an alert kept the key): the readings the cells it was for
// carry instead of an act (ruling 1141: NO VERDICT, never invalid). A command that answered not ok while the check shows
// the app front and key (Finder in front with another of its windows above the run's, say) is the setup's own failure:
// null, the caller's invalid. -> the skipped readings for `apps`, or null.
export const notActivated = (ctx, scene, apps = [SCENES[scene].bundleId]) => {
  const app = SCENES[scene].bundleId;
  return activated(ctx, app) ? null : skippedReadings(ctx, apps, app);
};
// The engine's own name for the error an act threw (its result meta's `cua/errorName`, ./lane.mjs engineMetaOf), else
// the name the cell caught (the REPL's plain Error on either engine, or none).
export const errorNameOf = (act, caught = act?.value?.errorName ?? null) => act?.engine?.errorName ?? caught;

// The driven scene front and key before a frontmost act, activated again when it is not: the regime's own activate step
// (rulings 1136 and 1141: "alert up, scene activated first"). Never TextEdit under its Open panel, which an activation
// could bring up over the panel; the panel's own key reads as its service's. `keys`: a key cell comes next, whose key
// window is read in the same read (keyWindowScene). -> the reading.
export function drivenFront(ctx, target, {keys = false} = {}) {
  const scene = SCENE_OF[target] ?? target, app = SCENES[scene].bundleId, keyWindow = keys ? keyWindowScene(ctx, scene) : null;
  const r = read(ctx, null, {frontKey: true, keyWindow});
  if (isPanelTarget(target) || (r?.frontKey?.front === app && r?.frontKey?.key === app)) return r;
  activate(ctx, scene);
  return read(ctx, null, {frontKey: true, keyWindow});
}


// A matrix-device command that changes nothing on screen (the scheduled probes, the input source), its window the
// harness's, intending no activation. -> the command's answer.
export function device(ctx, args) {
  const {answer, at} = ctx.ops.matrix([...args, '--run', ctx.run]) ?? {};
  mark(ctx, 'harness', args.slice(0, 2).join(':'), at, []);
  return answer;
}

// The engine's intervention debounce after a probe's keys into a scene (the keys are a user's to the engine; ./live-
// device.mjs COMPOSITION_QUIET_MS): the run records when the probe was known done (`ctx.posted[scene]`, the controller's
// clock), and before it drives that scene again it waits the debounce out (waitQuiet) and observes the scene once, which
// clears the re-query flag (quiet). Without it the run's own next step would be refused as the user's intervention.
export async function waitQuiet(ctx, scene) {
  const at = ctx.posted[scene];
  if (at === undefined) return;
  const wait = at + COMPOSITION_QUIET_MS - ctx.now();
  if (wait > 0) await ctx.sleep(wait);
}
export async function quiet(ctx, scene) {
  if (ctx.posted[scene] === undefined) return;
  await waitQuiet(ctx, scene);
  const observed = await js(ctx, 'harness', `requery:${scene}`, requeryCell(scene));
  if (!observed.ok) throw new Stop(`${scene} could not be observed after the probe's keys (${observed.error}): its re-query flag stays set`);
  delete ctx.posted[scene];
}

// ---- a case's row ----------------------------------------------------------------------------------------------------

// The caret after-read's settle (#258, #259): reads at most, and the time between them.
export const CARET_SETTLE = 3, CARET_SETTLE_MS = 150;

// The scenes whose rows keep the engine's per-call meta of their prepare, act and check (./lane.mjs engineMetaOf, its
// nulls dropped): the web-shaped ones, whose observations depend on enablement, the web area and the settle.
const DIAGNOSED = Object.freeze(['chrome', 'electron']);
const presentMeta = meta => {
  const kept = Object.entries(meta ?? {}).filter(([, value]) => value !== null);
  return kept.length ? Object.fromEntries(kept) : null;
};

// One case: prepare, act (one facade call), check; the steps its prepare states (`prepared`) and, for a field it needs
// focused, how the focus was read (`focusReadBy`: the observation's meta or the trailer, ./plan.mjs focusVerdict); in the
// background regime the oracle's readings around the act, each with the watcher alive, the window order among them
// (#485). A method row by default; the Unicode matrix's rows name their own section and id (`extra` kept on the row). The
// row's window runs from its prepare's start to its check's end; the activations in it are the row's (the frontmost
// regime records their count, the background regime's oracle judges them). A Chrome or Electron row keeps its three
// calls' engine meta (`engineMeta`); an Electron row records the fixture's accessibility mode (`electronMode` {enabled,
// at}, from the background's after-read, or in the frontmost from a read after the check so the act-to-check timing stays
// the earlier holds') beside the act's device-clock window (`actAt`).
// Every row whose act was sent records its front/key readings (`frontKey`, ./front-key.mjs): the activate step in force
// (the target's in the frontmost regime, activated again when the reading before the act shows it not front and key;
// the user window's in the background regime, likewise), the reading just before the act, and one after its check (and
// after Acceptance 3's keystroke witness, which TextEdit's background click carries). An activation that did not take
// front and key skips the act, its readings saying so. An act that threw records the engine's own error name where its
// meta carries it (errorNameOf). A caret case (#258, #259) reads the field's range on the device before the act and
// after it (`caret` {before, after} on the row), and its reading joins the outcome and the row's `ok` (./caret.mjs).
// A prepare or act the alert guard refused (./alert-guard.mjs, guardLane and sendKeys) is the row's NO VERDICT, unsent.
export async function caseRow(ctx, target, regime, c, {user = null, userWindow = null, speed = false, section = 'method', id = null, userValue = null, extra = {}} = {}) {
  await ctx.checkpoint();
  const scene = SCENE_OF[target];
  if (scene) await quiet(ctx, scene);
  const key = `row:${ctx.rows.length}`;
  const row = {section, id: id ?? caseId(target, regime, c, user), engine: ctx.engine, sample: ctx.n, ok: false, scene, target, regime, method: c.method, case: c.case, expect: c.expect,
    ...(user ? {user} : {}), ...extra};
  // Grounded on the frame the run launched its scene at: on a hosted runner the venue's (ruling 1169), else the mini's.
  const cells = caseCells(target, groundCase(target, c, ctx.meta.venue?.frames ?? null));
  const apps = appsOf(target, user), app = SCENES[regime === 'background' ? user : scene].bundleId;
  let from = null, to = null;
  const span = r => { from ??= r?.at?.[0] ?? null; to = r?.at?.[1] ?? to; return r; };
  const done = extra => { if (from !== null) mark(ctx, 'row', key, [from, to]); return push(ctx, {...row, ...extra}); };
  const keep = (phase, r) => {
    const meta = DIAGNOSED.includes(scene) ? presentMeta(r?.engine) : null;
    if (meta) (row.engineMeta ??= {})[phase] = meta;
  };
  const electron = scene === 'electron';
  let prepared;
  try { prepared = span(await ctx.lane.js(cells.prepare)); } catch (error) {
    if (!(error instanceof AlertGuarded)) throw error;
    // The alert guard refused the prepare (a pointer it would send): nothing of the case sent, its timing with it.
    const refused = done({...error.row});
    if (speed) push(ctx, {section: 'speed', id: methodTimingId(target, c), engine: ctx.engine, sample: ctx.n, ok: false, ...error.row});
    return refused;
  }
  keep('prepare', prepared);
  if (!prepared.ok) return done({invalid: 'the prepare cell failed', error: prepared.error});
  if (Array.isArray(prepared.value?.prepared)) row.prepared = prepared.value.prepared;
  if (!prepared.value?.ready) return done({invalid: `not prepared: ${prepared.value?.reason ?? 'no reason'}`, ...(prepared.value?.seen ? {prepareSeen: prepared.value.seen} : {})});
  // A prepare that needs its field focused: judged by the observation's own focus where the engine reports it (#188).
  if (prepared.value.focus) {
    const verdict = focusVerdict(prepared.value.focus, prepared.engine?.observation ?? null);
    row.focusReadBy = verdict.by;
    // Rejected though the prepare was ready: its readings kept as a refused prepare's are (the review of
    // b12c7121a..2a2dd8dd6, minor 6): the field, the trailer's reading and the engine's own focused index.
    if (verdict.problem) return done({invalid: `not prepared: ${verdict.problem}`,
      prepareSeen: {field: prepared.value.focus.index ?? null, trailer: prepared.value.focus.trailer ?? null, engineIndex: prepared.engine?.observation?.focusedIndex ?? null}});
  }
  // A caret case (#258, #259, ./caret.mjs): the field's range read on the device, outside either engine, before the act
  // (it must be the one the prepare made, or nothing is sent) and after it, inside the row's window.
  const rangeRead = () => span(ctx.ops.matrix(['text-range', '--scene', scene, '--run', ctx.run]))?.answer ?? null;
  const caretBefore = c.caret ? rangeRead() : null;
  // After the click the caret is read until two reads agree (a web field's selection follows its DOM a moment later),
  // CARET_SETTLE reads at most, CARET_SETTLE_MS apart. -> {reading, settled}.
  const settledRange = async () => {
    let last = rangeRead();
    for (let n = 1; n < CARET_SETTLE; n++) {
      await ctx.sleep(CARET_SETTLE_MS);
      const next = rangeRead();
      if (JSON.stringify(next) === JSON.stringify(last)) return {reading: next, settled: true};
      last = next;
    }
    return {reading: last, settled: false};
  };
  const unprepared = c.caret ? caretPrepared(c.caret, caretBefore) : null;
  if (unprepared) return done({invalid: `not prepared: ${unprepared}`, caret: {before: caretBefore}});
  // The row's window runs through the final before-read, so what it saw (an alert that prompted a re-activation) is
  // the row's even when the act is then skipped; a harness step's own app keeps its precedence (./oracle.mjs).
  const before = span(regime === 'background' ? await userFront(ctx, user, userWindow, {rekey: userValue === null, keysTo: c.keys ? scene : null}) : drivenFront(ctx, target, {keys: Boolean(c.keys)}));
  if (!activated(ctx, app)) {
    // The skipped act's timing is skipped with it, the case's readings its own, so no planned sample goes missing.
    const skipped = done({frontKey: {...skippedReadings(ctx, apps, app), before: keyReading(before)}});
    if (speed) push(ctx, {section: 'speed', id: methodTimingId(target, c), engine: ctx.engine, sample: ctx.n, ok: false, frontKey: skipped.frontKey});
    return skipped;
  }
  if (regime === 'background') {
    if (!before.inFront) return done({invalid: 'the user window was not in front before the action'});
    if (before.watcher !== true) return done({invalid: 'the activation watcher was not running before the action'});
  }
  const readings = {apps, activate: activationOf(ctx, app), before: keyReading(before)};
  // The reading after the act's check (and the witness), taken once: every row from here on carries it, and the row's
  // window runs to its end, so an activation it saw is the row's (the reads before the act are inside the window too).
  let late = null;
  const after = options => (late ??= span(read(ctx, null, {frontKey: true, ...options})));
  const finish = extra => done({frontKey: {...readings, after: keyReading(after())}, ...extra});
  if (PASTING.includes(c.method)) alertCheck(ctx, `before ${row.id}`);
  let act;
  try { act = span(c.keys ? await sendKeys(ctx, cells.act, c.keys, {scene, front: before, userWindow, kind: 'row', key}) : await ctx.lane.js(cells.act)); } catch (error) {
    if (!(error instanceof AlertHeld)) throw error;
    // The capture alert took the front after the activation: the key unsent, the readings the row's (NO VERDICT).
    const held = done({frontKey: {...readings, before: error.reading, after: keyReading(after())}, ...error.row});
    if (speed) push(ctx, {section: 'speed', id: methodTimingId(target, c), engine: ctx.engine, sample: ctx.n, ok: false, frontKey: held.frontKey, ...error.row});
    return held;
  }
  if (act === null) return finish({invalid: 'the key guard did not send the action\'s keys'});
  keep('act', act);
  if (PASTING.includes(c.method)) alertCheck(ctx, `after ${row.id}`);
  if (!act.ok) return finish({invalid: 'the act cell failed', error: act.error});
  Object.assign(row, {inCellMs: act.value.actMs, wallMs: act.wallMs, inputRoute: act.route, ...(electron ? {actAt: act.value.at ?? act.at} : {})});
  const caretAfter = c.caret ? await settledRange() : null;
  if (c.caret) row.caret = {before: caretBefore, after: caretAfter.reading};
  const oracleAfter = regime === 'background' ? read(ctx, focusOf(userWindow), {electronMode: electron, windowOrder: true}) : null;
  const check = span(await ctx.lane.js(cells.check));
  keep('check', check);
  if (electron) row.electronMode = (oracleAfter ?? after({electronMode: true}))?.electronMode ?? null;
  if (!check.ok) return finish({invalid: 'the check cell failed', error: check.error});
  if (check.value?.invalid) return finish({invalid: check.value.invalid});
  // A caret that never settled proves nothing: no verdict, never a difference.
  if (caretAfter && !caretAfter.settled) return finish({invalid: `the caret did not settle after the click: ${CARET_SETTLE} reads ${CARET_SETTLE_MS} ms apart never agreed`});
  const caret = c.caret ? caretOutcome(c.caret, row.caret.after) : null;
  if (caret?.invalid) return finish({invalid: caret.invalid});
  if (oracleAfter && oracleAfter.watcher !== true) return finish({invalid: 'the activation watcher was not running after the action'});
  const witness = isAcceptance3(target, regime, c, user) ? await keystrokeWitness(ctx, span, userWindow) : null;
  if (witness?.invalid) return finish({invalid: witness.invalid});
  // With `userValue`, the user window's field must also have kept that value (the focus probe's hash after the act).
  const kept = userValue === null ? null : oracleAfter?.focus?.named === true && oracleAfter.focus.valueHash === userValue;
  const outcome = {...(check.value?.outcome ?? {}), ...(caret?.outcome ?? {}), ...(kept === null ? {} : {userKept: kept}), ...(witness ? {keystroke: witness.keystroke} : {})};
  if (Object.hasOwn(outcome, 'errorName')) outcome.errorName = errorNameOf(act, outcome.errorName);
  const witnessed = !witness || (witness.keystroke.posted && witness.keystroke.finderSelected && witness.keystroke.documentUnchanged);
  const pushed = finish({ok: check.value?.ok === true && kept !== false && witnessed && caret?.ok !== false, outcome});
  ctx.judged.set(key, {row: pushed, oracle: regime === 'background'
    ? {before: before.reading, after: oracleAfter.reading, focus: oracleAfter.focus ?? null, inputRoute: act.route, scene, userPid: userWindow.pid,
      order: {before: before.windowOrder ?? null, after: oracleAfter.windowOrder ?? null}, targets: targetsOf(target),
      userWindow: {pid: userWindow.pid, number: before.reading?.topWindow?.number ?? null}} : null});
  if (speed) push(ctx, {section: 'speed', id: methodTimingId(target, c), engine: ctx.engine, sample: ctx.n, ok: true, inCellMs: act.value.actMs, wallMs: act.wallMs, frontKey: pushed.frontKey});
  return pushed;
}

// Acceptance 3's keystroke witness (S L238; ./probe-plan.mjs WITNESS_PREPARE_CELL), after TextEdit's background click
// and its check, with the user window (the run's Finder window) in front: a keystroke probe gated on that window types a
// run-owned file's name, which Finder's list must select, while TextEdit's document keeps its value. A probe whose gate
// held its keys because Finder's window was no longer in front, at its first gate or between its keys
// (./probe-plan.mjs keystrokeGate), is the witness failing, the front taken: `posted` false and the gate's reason
// recorded, the read-back still taken, and the row judged (its interference too). Only a fault of the probe itself
// (no answer, a key event it could not make) says nothing: invalid. The probe's keys are a user's to Finder: the run
// waits the debounce out before it drives Finder again (quiet).
// -> {keystroke: {posted, gate?: {at, reason}, finderSelected, documentUnchanged}} | {invalid}.
async function keystrokeWitness(ctx, span, userWindow) {
  const chosen = span(await ctx.lane.js(WITNESS_PREPARE_CELL));
  const file = chosen.ok ? chosen.value?.target : null;
  if (!WITNESS_FILES.includes(file)) return {invalid: `the keystroke witness could not choose its file${chosen.ok ? '' : ` (${String(chosen.error ?? '').slice(0, 160)})`}`};
  device(ctx, ['probe', 'keystroke', '--window', focusOf(userWindow), '--text', file, '--lead', String(WITNESS_LEAD_MS)]);
  const finished = device(ctx, ['probe', 'finish']);
  ctx.posted[ACCEPTANCE_3.user] = ctx.now();
  const gate = keystrokeGate(finished?.answer);
  const problem = gate ? null : probeProblem(finished?.answer);
  if (problem) return {invalid: `the keystroke witness's probe failed: ${problem}`};
  const checked = span(await ctx.lane.js(witnessCheckCell(file)));
  if (!checked.ok) {
    const error = String(checked.error ?? '').slice(0, 160);
    // A proven gate already failed the witness (the front was taken): the read-back is missing, not the verdict, so the
    // row stays judged, its interference too. Without a gate, a missing read-back says nothing.
    if (gate) return {keystroke: {posted: false, gate, finderSelected: null, documentUnchanged: null, readBack: {unavailable: true, error}}};
    return {invalid: `the keystroke witness's read-back failed (${error})`};
  }
  return {keystroke: {posted: gate === null, ...(gate ? {gate} : {}), finderSelected: checked.value?.finderSelected === true, documentUnchanged: checked.value?.documentUnchanged === true}};
}
