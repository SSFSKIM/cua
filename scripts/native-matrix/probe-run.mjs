// The probe cells of a matrix run (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system
// part 5; the rules and cells in ./probe-plan.mjs): concurrent use on Finder and Chrome for Testing with TextEdit's
// document as the user window, its sheet variant on TextEdit with the Electron fixture's field as the user window,
// intervention fires and the pre-action refusal on TextEdit in front, and #212's save sheet there (a cell of its own,
// outside the full matrix). Each is one row per run (section `concurrent` or
// `intervention`, the run's number its sample), from up to PROBE_ATTEMPTS attempts: an attempt whose probe fell outside
// the window that makes it valid is retried, aimed from its own times, and only the last is kept (its predecessors'
// reasons in `outcome.retries`); the last one invalid leaves the row invalid.
//
// The user window's value is read back only through the focus probe (`read --focus`, its valueHash), never through
// either engine. Every key or typing act goes under the key guard (the user window's case, or the driven scene in
// front), and every typing act between two alert checks, as the method rows' do. The probe's keys are a user's to the
// engine: before the run drives a scene the probe typed into, it waits the debounce out and observes it (./steps.mjs
// quiet). Every attempt whose act was sent records its front/key readings (./front-key.mjs, `frontKey`): the activate step
// that put its window in front, the reading just before the act and one after its check; an attempt whose activation
// did not take front and key sends no act, its readings saying so. The background cells' oracle reads the window order
// around the act too (#485).
import {sha256Hex} from './matrix-text.mjs';
import {userWindowOf} from './oracle.mjs';
import {
  CLOSE_UNTITLED_CELL, CONCURRENT_TYPING, concurrentCheckCell, concurrentPrepareCell, EMPTY_HASH, emptyFieldCell, endsWithCell, intervalOf, LONG_TEXT, MAY_HAVE_TAKEN_EFFECT,
  NEW_DOCUMENT_CELL, nextPreMs, postValidity, PRE_ACTION_DELAY_MS, PRE_MS, PROBE_ATTEMPTS, PROBE_LEAD_MS, PROBE_TEXT, probeProblem, receiptValidity, refusedWith,
  SAVE_SHEET_AIM_MS, SAVE_SHEET_CANCEL_CELL, SAVE_SHEET_CHECK_CELL, SAVE_SHEET_DESTINATION_CELL, SAVE_SHEET_OPEN_CELL, SAVE_SHEET_PRE_MS, saveSheetActCell, saveSheetFindings, scheduledActCell, SHEET_FOLLOW_MS,
  SHEET_PRE_MS, SHEET_TYPE_CELL, sheetCheckCell, sheetFollowCell, sheetOpenCell, STILL_INTERACTING, STOPPED_PART_WAY, USER_CHANGED,
} from './probe-plan.mjs';
import {ABC} from './live-checks.mjs';
import {requeryCell} from './matrix-cells.mjs';
import {ownerInputCause, ownerInputNow, readOnlyMarks, venueInputCause, venueInputMarks} from './owner-input.mjs';
import {typeIntoList} from './plan.mjs';
import {SCENES} from '../repl-parity/scenes-mac.mjs';
import {activate, activated, activationOf, AlertHeld, alertCheck, device, errorNameOf, focusOf, js, keyReading, mark, notActivated, push, quiet, read, readKey, sendKeys,
  ownWindowClosed, ownWindowOpened, sceneWindowNumbers, skippedReadings, Stop, userFront, waitQuiet, frontSeen, userWindowSeen} from './steps.mjs';

const j = JSON.stringify;
const USER_HASH = sha256Hex(PROBE_TEXT);
// The ids, stable across runs and engines.
export const PROBE_ROWS = Object.freeze({
  concurrent: driven => ({section: 'concurrent', id: `${driven}/concurrent@textedit`, scene: driven, user: 'textedit', regime: 'background', method: 'typeText', case: 'concurrent'}),
  sheet: {section: 'concurrent', id: 'textedit/concurrent.sheet@electron', scene: 'textedit', user: 'electron', regime: 'background', method: 'pressKey', case: 'sheet'},
  fires: {section: 'intervention', id: 'textedit/intervention.fires', scene: 'textedit', regime: 'frontmost', method: 'typeText', case: 'fires'},
  preAction: {section: 'intervention', id: 'textedit/intervention.preAction', scene: 'textedit', regime: 'frontmost', method: 'typeText', case: 'preAction'},
  saveSheet: {section: 'intervention', id: 'textedit/intervention.saveSheet', scene: 'textedit', regime: 'frontmost', method: 'setValue', case: 'saveSheet'},
});
// Every row a plan's probe cells write. -> [{section, id}].
export const probeRowsOf = plan => [...(plan.concurrent ?? []).map(PROBE_ROWS.concurrent), ...(plan.sheet ? [PROBE_ROWS.sheet] : []),
  ...(plan.intervention ?? []).map(kind => PROBE_ROWS[kind])].map(({section, id}) => ({section, id}));

// The probe cells of `plan` (its concurrent, sheet and intervention entries), in that order.
export async function probeCells(ctx, plan) {
  for (const driven of plan.concurrent ?? []) await sampled(ctx, PROBE_ROWS.concurrent(driven), a => concurrentAttempt(ctx, driven, a));
  if (plan.sheet) await sampled(ctx, PROBE_ROWS.sheet, a => sheetAttempt(ctx, a));
  if (plan.intervention?.includes('fires')) await sampled(ctx, PROBE_ROWS.fires, a => firesAttempt(ctx, a));
  if (plan.intervention?.includes('preAction')) await sampled(ctx, PROBE_ROWS.preAction, a => preActionAttempt(ctx, a));
  if (plan.intervention?.includes('saveSheet')) await sampled(ctx, PROBE_ROWS.saveSheet, a => saveSheetAttempt(ctx, a));
  await resetHeldFixture(ctx);
}

// A fixture an attempt made (its untitled document) whose cleanup the capture alert held (I3b, ruling 1141): nothing more
// is collected until it is reset. Before the next sample, and once the probe cells end, its scene is activated ("alert up,
// scene activated first") and the cleanup run again; one that still does not run stops the run, so no evidence is taken
// from a scene left dirty. Each such fixture is kept in `meta.fixturesHeld` ({row, sample, scene, reset}).
async function resetHeldFixture(ctx) {
  const held = ctx.heldFixture;
  if (!held) return;
  ctx.heldFixture = null;
  let failed;
  ctx.caseOwner = held.entry.row;
  try { activate(ctx, held.scene); failed = await cleanedUp({cleanup: held.cleanup}); } catch (error) { failed = error; } finally {
    ctx.caseOwner = null;
    ownWindowClosed(ctx);
  }
  held.entry.reset = !failed;
  if (held.row) sheetOnRow(ctx, held.row, held.key);
  // The guard's own cause when it refused the cleanup (./steps.mjs AlertGuarded: `alert` or `unread`), else the held key's.
  if (failed instanceof AlertHeld) held.entry.blockedBy = failed.guard?.category ?? 'alert';
  if (!failed) return;
  const reason = String(failed.message ?? failed).slice(0, 300);
  const message = `${stuckGoTo(held.row)}the ${held.scene} fixture ${held.entry.row} left (its cleanup ${heldByText(held.heldBy)}) could not be reset: ${reason}; the run stopped collecting evidence`;
  if (held.entry.blockedBy) throw new ResetBlocked(message, {category: held.entry.blockedBy, detail: `the ${held.scene} fixture ${held.entry.row}'s reset was held (${reason})`});
  throw new Stop(message);
}
// #212's Go To dialog that survived every step its destination cell took (ruling 1221): the one way a dialog left up can
// stop the run, named with each step and its result. It leads the stop's text (fix wave M7), which a CellResult bounds
// (cell-result.mjs). The Save sheet's cancel is not reachable while the dialog holds the focus (probe-plan.mjs, I7).
function stuckGoTo(row) {
  const g = row?.outcome?.goTo;
  if (!g || g.closed !== false) return '';
  return `the Go To dialog stayed up through each step its cell tried (Escape ${g.escapes}x, still up; CloseButton ${g.closeClicked ? 'clicked, still up' : 'not found'}; the Save sheet's cancel unreachable behind it): `;
}
// The guard that held a fixture's cleanup, from the held cause's category (ruling 1219, s2: C-5's key-window refusal was
// named the capture alert's).
const heldByText = category => (category === 'keyWindow' ? 'refused by the key-window guard'
  : category === 'unread' ? 'refused by the alert guard, its reading unread'
  : category && category !== 'alert' ? `refused by the alert guard (${category})` : 'held by the capture alert');
// A stop because a held fixture's reset was itself held by the alert or refused by the guard (`guard`: {category
// 'alert' | 'unread', detail}): ./run.mjs runOnce records every sample its plan still had to take NO VERDICT by that
// cause (recordUnrun), so none vanishes (T8e review, Minor 2).
export class ResetBlocked extends Stop {
  constructor(message, guard) { super(message); this.guard = guard; }
}

// One sample from up to PROBE_ATTEMPTS attempts. An attempt answers {row, retry?, lead?, oracle?, cleanup?, key}:
// `retry` when its probe fell outside its window, `lead` the next attempt's aim, `cleanup` what it left to undo. The
// kept row is recorded before its cleanup runs (#212: a cleanup can throw, and the row must outlast it), and a cleanup
// that throws keeps the attempt it followed, its failure on the row's `outcome.cleanupFailed` and then thrown, so the
// run stops with it among its problems. The kept row is judged by the oracle when it carries one, else charged its
// activations.
// The case in force (ctx.caseOwner) is the row's for its attempts and cleanups, so a window an attempt opened is the key
// window the guard reads for its cells alone (./steps.mjs ownKeyWindowNumber); once the case is over that window counts
// for nothing, unless its held fixture still waits for its reset, which runs as the case's.
async function sampled(ctx, base, attempt) {
  await resetHeldFixture(ctx);
  ctx.caseOwner = base.id;
  try { return await sampledRows(ctx, base, attempt); } finally {
    ctx.caseOwner = null;
    if (!ctx.heldFixture) ownWindowClosed(ctx);
  }
}
async function sampledRows(ctx, base, attempt) {
  const row = {...base, engine: ctx.engine, sample: ctx.n, ok: false};
  const venue = venueInputCause(ctx.venueMissing, [ABC]);
  if (venue) return push(ctx, {...row, ...venueInputMarks(venue)});
  // Off a hosted runner the owner's values are read again at each probe: they may have changed since the last reading.
  if (ctx.ownerInput) ownerInputNow(ctx, device(ctx, ['source', 'state']), `probe ${base.id}`);
  if (ctx.ownerInput && !ctx.latin) return push(ctx, {...row, ...readOnlyMarks(ctx, ownerInputCause(ctx.ownerInput, {source: ABC, perContext: false}, ctx.venueReadOnly))});
  if (!ctx.latin) return push(ctx, {...row, invalid: 'the Latin input source was not selected and read back with the per-context preference off'});
  const retries = [];
  let lead = null;
  for (let n = 1; n <= PROBE_ATTEMPTS; n++) {
    await ctx.checkpoint();
    const key = `row:${ctx.rows.length}:${n}`, span = spanOf(ctx, key);
    let out;
    try { out = await attempt({lead, n, id: base.id, key, span}); } catch (error) {
      if (!(error instanceof AlertHeld)) throw error;
      // What the attempt made before the hold is cleaned up as any attempt's is: its cleanup was registered with it.
      out = span.end({...error.row, frontKey: heldReadings(ctx, base, error, span)}, span.fixture ? {cleanup: span.fixture.cleanup} : {});
    }
    let cleanupFailed = null;
    if (out.retry && n < PROBE_ATTEMPTS) {
      cleanupFailed = await cleanedUp(out);
      // The attempt's own window is closed with its fixture: the next attempt reads for none until it opens its own.
      if (!cleanupFailed) { ownWindowClosed(ctx); retries.push(out.row.invalid); lead = out.lead; continue; }
    }
    const pushed = push(ctx, {...row, ...out.row, attempts: n, ...(retries.length ? {outcome: {...(out.row.outcome ?? {}), retries}} : {})});
    if (!pushed.invalid) ctx.judged.set(out.key, {row: pushed, oracle: out.oracle ?? null});
    cleanupFailed ??= await cleanedUp(out);
    sheetOnRow(ctx, pushed, key);
    // A cleanup whose keys the capture alert held leaves what it would have closed: kept as the run's held fixture, reset
    // before anything else is collected (resetHeldFixture).
    if (cleanupFailed instanceof AlertHeld) {
      pushed.outcome = {...(pushed.outcome ?? {}), cleanupHeld: cleanupFailed.message};
      const entry = {row: pushed.id, sample: pushed.sample, scene: span.fixture?.scene ?? base.scene, reset: null};
      (ctx.meta.fixturesHeld ??= []).push(entry);
      ctx.heldFixture = {scene: entry.scene, cleanup: out.cleanup, entry, row: pushed, key, heldBy: cleanupFailed.guard?.category ?? 'alert'};
      return pushed;
    }
    if (cleanupFailed) {
      pushed.outcome = {...(pushed.outcome ?? {}), cleanupFailed: String(cleanupFailed.message ?? cleanupFailed).slice(0, 500)};
      throw cleanupFailed;
    }
    return pushed;
  }
  return null;
}
// A sample whose guarded key the capture alert held (AlertHeld): the activate step in force for the row's own app, the
// reading the guard held it on, and one read now, inside the attempt's window. -> the row's frontKey.
function heldReadings(ctx, base, error, span) {
  const app = SCENES[base.regime === 'background' ? base.user : base.scene].bundleId;
  const apps = [...new Set([SCENES[base.scene].bundleId, ...(base.user ? [SCENES[base.user].bundleId] : [])])];
  return {apps, activate: activationOf(ctx, app), before: error.reading, after: keyReading(span.add(read(ctx, null, {frontKey: true})))};
}
// The sheet exemption a row's cells, cleanup or reset used (ruling 1214; ./steps.mjs keyWindowGuard), on the row:
// `keyWindowSheet` {count, focused}, the window Accessibility held focused with its role and parent's number.
function sheetOnRow(ctx, row, key) {
  const kept = ctx.meta.keyWindowSheets?.[key];
  if (kept) row.keyWindowSheet = {count: kept.count, focused: kept.focused};
}
// An attempt's cleanup run. -> null, or what it threw.
const cleanedUp = async out => { try { await out.cleanup?.(); return null; } catch (error) { return error; } };

// The device-clock window of an attempt's cells, marked as one row window when it ends (made by sampled, one an attempt).
// `made(scene, cleanup)`: the attempt made a fixture on `scene` that `cleanup` undoes, registered the moment it exists, so
// an attempt that ends by a throw (AlertHeld) still has it undone (`fixture`).
function spanOf(ctx, key) {
  let from = null, to = null;
  const span = {
    fixture: null,
    made: (scene, cleanup) => { span.fixture = {scene, cleanup}; },
    add: r => { if (r?.at) { from ??= r.at[0]; to = r.at[1]; } return r; },
    end: (row, extra = {}) => { if (from !== null) mark(ctx, 'row', key, [from, to]); return {row, key, ...extra}; },
  };
  return span;
}
// A precondition that did not hold, as the row: with the focus probe's reading when that was what failed (why it did not
// name the window, ./matrix-device.mjs ownedFocus), and what stood in front when a window was not there (`notInFront`,
// `userWindowSeen`: ./steps.mjs frontSeen, userWindowSeen), recorded and never judged.
const precondition = ({invalid, focus, notInFront, userWindowSeen}) => ({invalid, ...(focus === undefined ? {} : {focus}),
  ...(notInFront ? {notInFront} : {}), ...(userWindowSeen ? {userWindowSeen} : {})});
const failed = (r, what) => (!r?.ok ? `${what} failed${r?.error ? `: ${String(r.error).slice(0, 200)}` : ''}` : null);
const detectionOff = act => (act?.engine?.intervention === 'off' ? 'intervention detection is off on the engine (no Input Monitoring grant): the cell cannot be judged' : null);

// The user window in front with its typing field emptied and focused, read back by the focus probe. -> {userWindow,
// reading}, {skipped} (its activation did not take front and key) or {invalid}.
async function userField(ctx, span, user) {
  const front = activate(ctx, user);
  const skipped = notActivated(ctx, user);
  if (skipped) return {skipped: {frontKey: skipped}};
  if (!front?.ok) return {invalid: `the user window (${user}) did not come to the front`, userWindowSeen: userWindowSeen(ctx, user, front, null)};
  const prepared = span.add(await ctx.lane.js(emptyFieldCell(user)));
  const problem = failed(prepared, 'the user window\'s preparation') ?? (prepared.value?.ready ? null : `the user window's field was not prepared: ${prepared.value?.reason ?? 'no reason'}`);
  if (problem) return {invalid: problem};
  const r0 = read(ctx, null, {frontKey: true});
  const userWindow = userWindowOf(r0.reading, ctx.records[user].pid);
  if (!userWindow) return {invalid: `the user window (${user}) was not in front`, userWindowSeen: userWindowSeen(ctx, user, front, r0)};
  const f0 = read(ctx, focusOf(userWindow));
  if (f0.watcher !== true) return {invalid: 'the activation watcher was not running before the action'};
  if (f0.focus?.named !== true || f0.focus.valueHash !== EMPTY_HASH) return {invalid: 'the focus probe did not read the user window\'s field focused and empty', focus: f0.focus ?? null};
  return {userWindow, reading: f0.reading};
}

// A keystroke probe scheduled on `window` and awaited after `during` ran, whatever it threw; the scene it typed into is
// recorded for the debounce. -> {scheduled, answer, result: during's}.
async function withKeystroke(ctx, {window, scene, lead = PROBE_LEAD_MS}, during) {
  const started = device(ctx, ['probe', 'keystroke', '--window', focusOf(window), '--text', PROBE_TEXT, '--lead', String(lead)]);
  let result = null, finished = null;
  try { result = await during(started.scheduled); } finally {
    finished = device(ctx, ['probe', 'finish']);
    ctx.posted[scene] = ctx.now();
  }
  return {scheduled: started.scheduled, answer: finished?.answer ?? null, result};
}

// ---- concurrent use -------------------------------------------------------------------------------------------------

async function concurrentAttempt(ctx, driven, {lead, id, key, span}) {
  const user = 'textedit', preMs = lead ?? PRE_MS[driven];
  await quiet(ctx, driven);
  await quiet(ctx, user);
  const prepared = span.add(await ctx.lane.js(concurrentPrepareCell(driven)));
  const unprepared = failed(prepared, 'the driven scene\'s preparation') ?? (prepared.value?.ready ? null : `the driven scene was not prepared: ${prepared.value?.reason ?? 'no reason'}`);
  if (unprepared) return span.end({invalid: unprepared});
  const userApp = SCENES[user].bundleId, apps = [SCENES[driven].bundleId, userApp];
  const field = await userField(ctx, span, user);
  if (field.skipped) return span.end({frontKey: {...field.skipped.frontKey, apps}});
  if (field.invalid) return span.end(precondition(field));
  const {userWindow} = field;
  alertCheck(ctx, `before ${id}`);
  let before = null;
  const probe = await withKeystroke(ctx, {window: userWindow, scene: user}, async scheduled => {
    before = await userFront(ctx, user, userWindow, {keysTo: driven});
    if (!before.inFront || !activated(ctx, userApp)) return null;
    // Finder type-selects in its list, which cua's read-back answers typeUnconfirmed (./plan.mjs typeIntoList, #354).
    const typing = driven === 'finder' ? typeIntoList(CONCURRENT_TYPING[driven]) : `await __app.typeText(${j(CONCURRENT_TYPING[driven])});`;
    const act = scheduledActCell(driven, {at: scheduled - preMs, act: typing, tag: 'concurrent.act'});
    return span.add(await sendKeys(ctx, act, ['typeText'], {scene: driven, front: before, userWindow, kind: 'row', key}));
  });
  const act = probe.result;
  if (!activated(ctx, userApp)) return span.end({frontKey: {...skippedReadings(ctx, apps, userApp), before: keyReading(before)}});
  if (!before.inFront) return span.end({invalid: 'the user window was not in front before the action'});
  if (!act) return span.end({invalid: 'the key guard did not send the action'});
  alertCheck(ctx, `after ${id}`);
  if (!act.ok) return span.end({invalid: 'the act cell failed', error: act.error});
  const after = read(ctx, focusOf(userWindow), {windowOrder: true});
  const check = span.add(await ctx.lane.js(concurrentCheckCell(driven)));
  const frontKey = {apps, activate: activationOf(ctx, userApp), before: keyReading(before), after: readKey(ctx)};
  const interval = intervalOf(ctx.engine, act);
  const postedAt = probe.answer?.postedAt;
  const userLanded = after.focus?.named === true && after.focus.valueHash === USER_HASH;
  const drivenLanded = check.ok && check.value?.ok === true;
  const row = {ok: drivenLanded && userLanded && !act.value.threw, inCellMs: act.value.actMs, wallMs: act.wallMs, inputRoute: act.route, frontKey,
    outcome: {drivenLanded, userLanded, threw: act.value.threw, errorName: errorNameOf(act), ...timing(interval, postedAt, act), ...(check.value?.outcome ?? {})},
    ...(check.ok ? {} : {error: check.error})};
  const why = probeProblem(probe.answer) ?? postValidity(postedAt, interval);
  if (why) return span.end({...row, ok: false, invalid: why}, {retry: true, lead: nextPreMs({callAt: act.value.callAt, interval, postedAt, scheduled: probe.scheduled, preMs})});
  if (after.watcher !== true) return span.end({...row, ok: false, invalid: 'the activation watcher was not running after the action'});
  return span.end(row, {oracle: {before: before.reading, after: after.reading, named: {before: before.frontWindow?.top ?? null, after: after.frontWindow?.top ?? null}, focus: after.focus ?? null, inputRoute: act.route, scene: driven, userPid: userWindow.pid,
    ...windowOrderOf(before, after, [SCENES[driven].bundleId], userWindow)}});
}
// The window-order oracle's data for a background attempt (./oracle.mjs judgeInterference, #485): the order read before
// and after its act, the driven app's windows the targets, the user window by its number before the act.
const windowOrderOf = (before, after, targets, userWindow) => ({order: {before: before.windowOrder ?? null, after: after.windowOrder ?? null}, targets,
  userWindow: {pid: userWindow.pid, number: before.reading?.topWindow?.number ?? null}});
// Where the post fell in the interval, for the evidence. -> {intervalSource, intervalMs, postOffsetMs, late}.
const timing = (interval, postedAt, act) => ({intervalSource: interval?.source ?? null, intervalMs: interval ? interval.to - interval.from : null,
  postOffsetMs: interval && Number.isFinite(postedAt) ? postedAt - interval.from : null, late: act?.value?.late ?? null});

// ---- the sheet variant ----------------------------------------------------------------------------------------------

// The opening action (super+w) is the driven action the post must fall inside, by its own call's interval as concurrent
// use's typing is; the follow-up's receipt must come after the post and within the debounce, so that a follow-up the
// intervention rule refused would show it. The row is judged by the oracle as concurrent use's is: the user window's
// readings before the opening and after the follow-up, the watcher's liveness, every activation in the attempt and the
// routes of all its driven actions (super+n, the typing, the opening and the follow-up).
async function sheetAttempt(ctx, {lead, id, key, span}) {
  const driven = 'textedit', user = 'electron';
  await quiet(ctx, driven);
  await quiet(ctx, user);
  const userApp = SCENES[user].bundleId, apps = [SCENES[driven].bundleId, userApp];
  const field = await userField(ctx, span, user);
  if (field.skipped) return span.end({frontKey: {...field.skipped.frontKey, apps}});
  if (field.invalid) return span.end(precondition(field));
  const {userWindow} = field;
  const keys = async (code, names) => {
    const front = await userFront(ctx, user, userWindow, {keysTo: driven});
    return front.inFront ? span.add(await sendKeys(ctx, code, names, {scene: driven, front, userWindow, kind: 'row', key})) : null;
  };
  const known = sceneWindowNumbers(ctx, driven);
  const opened = await keys(NEW_DOCUMENT_CELL, ['super+n']);
  span.made(driven, () => closeUntitled(ctx, keys));
  if (opened?.ok && opened.value?.opened === true) ownWindowOpened(ctx, driven, known, {opensSheet: true});
  if (!opened?.ok || opened.value?.opened !== true) {
    await closeUntitled(ctx, keys);
    return span.end({invalid: `the untitled document did not open (${opened?.error ?? opened?.value?.reason ?? 'not sent'})`});
  }
  alertCheck(ctx, `before ${id} typing`);
  const typed = await keys(SHEET_TYPE_CELL, ['typeText']);
  alertCheck(ctx, `after ${id} typing`);
  if (!typed?.ok || typed.value?.typed !== true) {
    const untyped = untypedRow(ctx, typed);
    await closeUntitled(ctx, keys);
    return span.end(untyped);
  }
  const preMs = lead ?? SHEET_PRE_MS;
  let before = null, opening = null;
  const probe = await withKeystroke(ctx, {window: userWindow, scene: user}, async scheduled => {
    before = await userFront(ctx, user, userWindow, {keysTo: driven});
    if (!before.inFront || !activated(ctx, userApp)) { before = before.inFront ? before : null; return null; }
    opening = span.add(await sendKeys(ctx, sheetOpenCell({at: scheduled - preMs}), ['super+w'], {scene: driven, front: before, userWindow, kind: 'row', key}));
    // A click, not a key: sent without the key guard, whose reading would sit between the two actions.
    return opening?.ok ? span.add(await ctx.lane.js(sheetFollowCell({followAt: scheduled + SHEET_FOLLOW_MS}))) : null;
  });
  const follow = probe.result;
  if (before && !activated(ctx, userApp)) {
    await closeUntitled(ctx, keys);
    return span.end({frontKey: {...skippedReadings(ctx, apps, userApp), before: keyReading(before)}});
  }
  if (!opening?.ok || !follow?.ok) {
    await closeUntitled(ctx, keys);
    const what = !before ? 'the user window was not in front before super+w' : !opening ? 'the key guard did not send super+w' : !opening.ok ? 'the opening cell failed' : 'the follow-up cell failed';
    return span.end({invalid: what, ...((opening?.error ?? follow?.error) ? {error: opening?.error ?? follow?.error} : {})});
  }
  const after = read(ctx, focusOf(userWindow), {windowOrder: true});
  const check = span.add(await ctx.lane.js(sheetCheckCell()));
  const frontKey = {apps, activate: activationOf(ctx, userApp), before: keyReading(before), after: readKey(ctx)};
  if (!check.ok || check.value?.closed !== true || check.value?.sceneInFront !== true) {
    // A refused follow-up leaves the sheet up, a refused opening the dirty untitled document: once the debounce it may
    // have started is out, the untitled document's own cleanup closes either (its sheet's Delete, or super+w and then
    // the sheet's Delete), the scene's document back in front.
    await closeUntitled(ctx, keys);
  }
  const postedAt = probe.answer?.postedAt, interval = intervalOf(ctx.engine, opening), {value} = follow;
  const receivedAt = ctx.engine === 'cua' ? follow.engine?.receivedAt : value.clickAt;
  const userLanded = after.focus?.named === true && after.focus.valueHash === USER_HASH;
  const ok = !opening.value.threw && value.opened === true && value.clicked === true && !value.threw && check.value?.closed === true && check.value?.sceneInFront === true && userLanded;
  const row = {ok, inputRoute: opening.route, inputRoutes: {opening: opening.route, followUp: follow.route}, inCellMs: opening.value.actMs, wallMs: opening.wallMs, frontKey,
    outcome: {sheetOpened: value.opened === true, openingThrew: opening.value.threw, followUpRefused: refusedWith(value, STILL_INTERACTING) || refusedWith(value, USER_CHANGED),
      followUpThrew: value.threw, errorName: errorNameOf(follow), sheetClosed: check.value?.closed === true, userLanded, ...timing(interval, postedAt, opening),
      receiptAfterPostMs: Number.isFinite(postedAt) && Number.isFinite(receivedAt) ? receivedAt - postedAt : null}};
  // No sheet came up, so nothing was followed up: the opening's own outcome is the sample's, its receipt unneeded.
  const why = probeProblem(probe.answer) ?? detectionOff(opening) ?? detectionOff(follow) ?? postValidity(postedAt, interval)
    ?? (value.clicked === true ? receiptValidity({engine: ctx.engine, postedAt, receivedAt: follow.engine?.receivedAt, callAt: value.clickAt}) : null);
  if (why) return span.end({...row, ok: false, invalid: why}, {retry: true, lead: nextPreMs({callAt: opening.value.callAt, interval, postedAt, scheduled: probe.scheduled, preMs})});
  if (after.watcher !== true) return span.end({...row, ok: false, invalid: 'the activation watcher was not running after the action'});
  const routes = [opened.route, typed.route, opening.route, follow.route];
  return span.end(row, {oracle: {before: before.reading, after: after.reading, named: {before: before.frontWindow?.top ?? null, after: after.frontWindow?.top ?? null}, focus: after.focus ?? null, inputRoute: routes, scene: driven, userPid: userWindow.pid,
    ...windowOrderOf(before, after, [SCENES[driven].bundleId], userWindow)}});
}
// The untitled document closed after a variant that stopped part-way. Once the debounce a probe of this attempt may have
// started is out (its keys can be the user's to TextEdit too), the cleanup goes behind the user window; when that does
// not bring the scene's document back (its keys skipped because the untitled document came up above the user window,
// or TextEdit in the background naming another front window), TextEdit is brought to the front and the cleanup sent
// again under its own guard. A scene document still not in front stops the run, with what each cleanup saw.
async function closeUntitled(ctx, keys) {
  const driven = 'textedit', user = 'electron';
  if (ctx.posted[user] !== undefined) { ctx.posted[driven] ??= ctx.posted[user]; await quiet(ctx, driven); }
  const behind = await keys(CLOSE_UNTITLED_CELL, ['super+w']);
  if (behind?.ok && behind.value?.sceneInFront === true) return;
  const front = activate(ctx, driven);
  const there = front?.ok ? await sendKeys(ctx, CLOSE_UNTITLED_CELL, ['super+w'], {scene: driven, kind: 'harness', key: 'sheet:cleanup'}) : null;
  if (there?.ok && there.value?.sceneInFront === true) return;
  throw new Stop(`the sheet variant's untitled document could not be closed: TextEdit's scene document is not in front (behind the user window: ${cleanupSeen(behind)}; `
    + `with TextEdit in front: ${front?.ok ? cleanupSeen(there) : `not activated, ${front?.reason ?? 'no answer'}`})`);
}
// The untitled document's typing that did not read back (pilot C-2: both lanes, both cells): the cell's reason, what it
// read (./probe-plan.mjs SHEET_TYPE_CELL: lengths, hash, case-folded equality, the front it saw) and the device's own
// reading of the front then (its front and key apps, the front window's owner: bundle ids, the run's own by pid), taken
// before any cleanup, as the row's `outcome.typing`. A typing the key guard never sent says so.
function untypedRow(ctx, typed) {
  const r = read(ctx, null, {frontKey: true, windowOrder: true});
  const top = oracleTop(r);
  const value = typed?.value ?? null;
  return {invalid: `the untitled document's text was not typed (${typed ? typed.error ?? value?.reason ?? 'the cell gave no reason' : 'the key guard did not send it'})`,
    outcome: {typing: {...(value && 'readBack' in value ? {readBack: value.readBack} : {}), ...(value?.front ? {front: value.front} : {}),
      device: {front: r?.frontKey?.front ?? null, key: r?.frontKey?.key ?? null, topWindow: top ? {owned: top.owned === true, ...(top.owned ? {pid: top.pid} : {}), bundleId: top.bundleId ?? null, layer: top.layer ?? null} : null}}}};
}
const cleanupSeen = r => (!r ? 'not sent' : !r.ok ? `the cell failed: ${String(r.error ?? '').slice(0, 160)}` : `front: ${r.value?.front ?? 'unknown'}, sheet ${r.value?.closed === false ? 'open' : 'closed'}`);

// ---- intervention fires ---------------------------------------------------------------------------------------------

// TextEdit in front, its document emptied and focused, the window the probe is gated on; the front and key read with the
// focus just before the act (the probe's scheduling between them changes neither). -> {window, readings}, {skipped} (its
// activation did not take front and key) or {invalid}.
async function drivenInFront(ctx, span, scene) {
  const front = activate(ctx, scene);
  const app = SCENES[scene].bundleId, skipped = notActivated(ctx, scene);
  if (skipped) return {skipped: {frontKey: skipped}};
  if (!front?.ok) return {invalid: `${scene} did not come to the front`};
  const prepared = span.add(await ctx.lane.js(emptyFieldCell(scene)));
  const problem = failed(prepared, 'the preparation') ?? (prepared.value?.ready ? null : `not prepared: ${prepared.value?.reason ?? 'no reason'}`);
  if (problem) return {invalid: problem};
  const {window, reads, last} = await sceneWindowInFront(ctx, scene);
  if (!window) return {invalid: `${scene}'s window was not in front after ${reads} reads: ${frontText(last)}`, notInFront: frontSeen(last, ctx.records[scene].pid, reads)};
  const f0 = read(ctx, focusOf(window), {frontKey: true});
  if (f0.focus?.named !== true || f0.focus.valueHash !== EMPTY_HASH) return {invalid: 'the focus probe did not read the document focused and empty', focus: f0.focus ?? null};
  return {window, readings: {apps: [app], activate: activationOf(ctx, app), before: keyReading(f0)}};
}
// The scene's window as the top one, read until it is, FRONT_READS reads FRONT_READ_MS apart: a window that covers it
// for a moment (an input method's indicator by the caret, a completion bubble; pilot C-2's vendor rows read no TextEdit
// window on top after the sheet variant) passes, one that stays is named. -> {window, reads, last: the last reading,
// with its window order}.
export const FRONT_READS = 4, FRONT_READ_MS = 250;
async function sceneWindowInFront(ctx, scene) {
  let last = null, window = null, reads = 0;
  for (; reads < FRONT_READS && !window; reads++) {
    if (reads) await ctx.sleep(FRONT_READ_MS);
    last = read(ctx, null, {frontKey: true, windowOrder: true});
    window = userWindowOf(last?.reading, ctx.records[scene].pid);
  }
  return {window, reads, last};
}
// The top window as the front-window oracle selects it (scripts/accept/front-window.swift: the frontmost visible window
// at layer 0, the reading's topWindow): the probe's own naming of it (`frontWindow.top`, ruling 1219: its bundle and
// number), else its owner's bundle id taken from the window order's matching entry: the run's own window by its number,
// another app's as the first layer-0 window no run process owns. An overlay above layer 0 (a menu-bar extra, a status
// panel) is never it. -> {owned, pid?, bundleId, layer, number?} | null when unread.
function oracleTop(r) {
  const top = r?.reading?.topWindow ?? null;
  if (!top) return null;
  const named = r?.frontWindow?.top;
  if (named) return {owned: named.owned === true, ...(named.owned ? {pid: named.ownerPid} : {}), bundleId: named.bundleId ?? null, layer: named.layer ?? 0, number: named.number ?? null};
  const order = Array.isArray(r?.windowOrder) ? r.windowOrder : [];
  if (top.owned) return {owned: true, pid: top.ownerPid, bundleId: order.find(w => w.owned && w.number === top.number)?.bundleId ?? null, layer: 0};
  return {owned: false, bundleId: order.find(w => !w.owned && w.layer === 0)?.bundleId ?? null, layer: 0};
}
// What stood in front, from a reading with its window order: the front app and the top window's owner, bundle ids
// (the run's own windows as such).
function frontText(r) {
  const top = oracleTop(r);
  const which = Number.isSafeInteger(top?.number) ? `, window ${top.number}` : '';
  const owner = !top ? 'unread' : top.owned ? `the run's own (pid ${top.pid}${which})` : `${top.bundleId ?? 'an unnamed app'}'s (layer ${top.layer ?? '?'}${which})`;
  return `the front app ${r?.frontKey?.front ?? 'unread'}, the top window ${owner}`;
}

// An attempt's front/key readings, the one after its act read now.
const readingsAfter = (ctx, readings) => ({...readings, after: readKey(ctx)});
// A typing act on the scene in front, between two alert checks. -> the act's result, or null when the guard skipped.
async function typing(ctx, span, scene, code, {key, when}) {
  alertCheck(ctx, `before ${when}`);
  const act = span.add(await sendKeys(ctx, code, ['typeText'], {scene, front: read(ctx), kind: 'row', key}));
  if (act) alertCheck(ctx, `after ${when}`);
  return act;
}

// The probe types into TextEdit's document during a long typeText; the action must stop as userIntervened (the
// user-changed sentence, `cua/entered` reported), the next action must be refused, with nothing posted, until a
// get_app_state, and the same action must then land.
async function firesAttempt(ctx, {lead, id, key, span}) {
  const scene = 'textedit', preMs = lead ?? PRE_MS.textedit;
  await quiet(ctx, scene);
  const driven = await drivenInFront(ctx, span, scene);
  if (driven.skipped) return span.end(driven.skipped);
  if (driven.invalid) return span.end(precondition(driven));
  const {window} = driven;
  const probe = await withKeystroke(ctx, {window, scene},
    scheduled => typing(ctx, span, scene, scheduledActCell(scene, {at: scheduled - preMs, act: `await __app.typeText(${j(LONG_TEXT)});`, tag: 'intervention.act'}), {key, when: id}));
  const act = probe.result;
  if (!act?.ok) return span.end({invalid: act ? 'the act cell failed' : 'the key guard did not send the action', ...(act?.error ? {error: act.error} : {})});
  const interval = intervalOf(ctx.engine, act), postedAt = probe.answer?.postedAt;
  const fired = refusedWith(act.value, USER_CHANGED);
  const base = {inCellMs: act.value.actMs, wallMs: act.wallMs, inputRoute: act.route,
    outcome: {fired, errorName: errorNameOf(act), message: act.value.message ?? null, entered: act.engine?.entered ?? null, ...timing(interval, postedAt, act)}};
  const why = probeProblem(probe.answer) ?? detectionOff(act) ?? postValidity(postedAt, interval);
  if (why) return span.end({...base, ok: false, invalid: why, frontKey: readingsAfter(ctx, driven.readings)},
    {retry: true, lead: nextPreMs({callAt: act.value.callAt, interval, postedAt, scheduled: probe.scheduled, preMs})});
  // The debounce out (no observation of TextEdit meanwhile, which would clear the flag): the next action refused with
  // nothing posted (the document's hash, read by the focus probe, unchanged), then a get_app_state, then the same action.
  await waitQuiet(ctx, scene);
  const h1 = read(ctx, focusOf(window)).focus?.valueHash ?? null;
  const next = await typing(ctx, span, scene, scheduledActCell(scene, {act: 'await __app.typeText("x");', tag: 'intervention.next'}), {key, when: `${id} next`});
  const h2 = read(ctx, focusOf(window)).focus?.valueHash ?? null;
  const requeried = span.add(await js(ctx, 'row', key, requeryCell(scene)));
  delete ctx.posted[scene];
  const again = await typing(ctx, span, scene, scheduledActCell(scene, {act: 'await __app.typeText("x");', tag: 'intervention.again'}), {key, when: `${id} again`});
  const landed = span.add(await ctx.lane.js(endsWithCell(scene, 'x')));
  const outcome = {...base.outcome, refusedNext: next?.ok === true && refusedWith(next.value, USER_CHANGED), nextErrorName: errorNameOf(next), nextMessage: next?.value?.message ?? null,
    nothingPosted: h1 !== null && h1 === h2, requeried: requeried.ok === true, againLanded: again?.ok === true && !again.value.threw && landed.value?.landed === true};
  return span.end({...base, ok: fired && outcome.refusedNext && outcome.nothingPosted && outcome.requeried && outcome.againLanded, outcome, frontKey: readingsAfter(ctx, driven.readings)});
}

// ---- the pre-action refusal -----------------------------------------------------------------------------------------

// The probe types into TextEdit's document and the harness's typeText follows at once: refused with the still-
// interacting sentence and nothing posted (the document's hash the probe's text alone).
async function preActionAttempt(ctx, {lead, id, key, span}) {
  const scene = 'textedit', delay = lead ?? PRE_ACTION_DELAY_MS;
  await quiet(ctx, scene);
  const driven = await drivenInFront(ctx, span, scene);
  if (driven.skipped) return span.end(driven.skipped);
  if (driven.invalid) return span.end(precondition(driven));
  const {window} = driven;
  const probe = await withKeystroke(ctx, {window, scene},
    scheduled => typing(ctx, span, scene, scheduledActCell(scene, {at: scheduled + delay, act: 'await __app.typeText("x");', tag: 'preaction.act'}), {key, when: id}));
  const act = probe.result;
  if (!act?.ok) return span.end({invalid: act ? 'the act cell failed' : 'the key guard did not send the action', ...(act?.error ? {error: act.error} : {})});
  const after = read(ctx, focusOf(window), {frontKey: true});
  const postedAt = probe.answer?.postedAt, receivedAt = ctx.engine === 'cua' ? act.engine?.receivedAt : act.value.callAt;
  const refused = refusedWith(act.value, STILL_INTERACTING), nothingPosted = after.focus?.named === true && after.focus.valueHash === USER_HASH;
  const row = {ok: refused && nothingPosted, inCellMs: act.value.actMs, wallMs: act.wallMs, inputRoute: act.route, frontKey: {...driven.readings, after: keyReading(after)},
    outcome: {refused, errorName: errorNameOf(act), message: act.value.message ?? null, nothingPosted, hidIdleMs: act.engine?.hidIdleMs ?? null,
      receiptAfterPostMs: Number.isFinite(postedAt) && Number.isFinite(receivedAt) ? receivedAt - postedAt : null}};
  const why = probeProblem(probe.answer) ?? detectionOff(act) ?? receiptValidity({engine: ctx.engine, postedAt, receivedAt: act.engine?.receivedAt, callAt: act.value.callAt});
  // A receipt before the post is answered by a later call; one past the debounce by an earlier one.
  const nextDelay = Number.isFinite(postedAt) && Number.isFinite(receivedAt) ? Math.max(0, delay + (receivedAt <= postedAt ? postedAt - receivedAt + PRE_ACTION_DELAY_MS : -(receivedAt - postedAt - PRE_ACTION_DELAY_MS))) : delay;
  if (why) return span.end({...row, ok: false, invalid: why}, {retry: true, lead: nextDelay});
  return span.end(row);
}

// ---- #212's save sheet -----------------------------------------------------------------------------------------------

// TextEdit in front: its untitled document opened (super+n) and typed into, its Save sheet opened (super+s) and its
// destination moved to a folder the run made, each under the key guard; then set_value on the sheet's name field at the
// cell's time, the probe's keystroke aimed into TextEdit's front window just after the engine receives it. cua's answer
// must be a stop part-way, said alike by its sentence (the user-changed sentence and "stopped part-way") and its
// structured account (`cua/interruption`, phase inFlight), that says what may have taken effect; the sheet must still
// be open after the settle and the run's folder empty: nothing committed it. A sentence and an account that disagree
// fail the row. On cua's lane the sample is valid only when the probe posted after the engine received the request and
// before the cell had its response (the times kept on the row; a stop before the write reports no action interval and
// needs none). A post outside that window, a refusal before the action or a set_value that returned first says nothing
// about a stop part-way: invalid, retried aimed from the receipt it measured. A sheet gone or a file in the run's
// folder is a failure whatever the timing, never retried. The vendor's lane never stops an action in flight: its row
// records its answer and the sheet, valid when the post fell inside the call. Whatever happened, once the row is
// recorded, the debounce is waited out, the sheet cancelled (Escape) and the untitled document closed (`cleanup`).
async function saveSheetAttempt(ctx, {lead, id, key, span}) {
  const scene = 'textedit', preMs = lead ?? SAVE_SHEET_PRE_MS;
  await quiet(ctx, scene);
  const front = activate(ctx, scene);
  const app = SCENES[scene].bundleId, skipped = notActivated(ctx, scene);
  if (skipped) return span.end({frontKey: skipped});
  if (!front?.ok) return span.end({invalid: `${scene} did not come to the front`});
  const keys = async (code, names) => span.add(await sendKeys(ctx, code, names, {scene, front: read(ctx), kind: 'row', key}));
  const cleanup = () => closeSaveSheet(ctx, keys);
  const unprepared = invalid => span.end({invalid}, {cleanup});
  const known = sceneWindowNumbers(ctx, scene);
  const opened = await keys(NEW_DOCUMENT_CELL, ['super+n']);
  span.made(scene, cleanup);
  if (opened?.ok && opened.value?.opened === true) ownWindowOpened(ctx, scene, known, {opensSheet: true});
  if (!opened?.ok || opened.value?.opened !== true) return unprepared(`the untitled document did not open (${opened?.error ?? opened?.value?.reason ?? 'not sent'})`);
  alertCheck(ctx, `before ${id} typing`);
  const typed = await keys(SHEET_TYPE_CELL, ['typeText']);
  alertCheck(ctx, `after ${id} typing`);
  if (!typed?.ok || typed.value?.typed !== true) return span.end(untypedRow(ctx, typed), {cleanup});
  const sheet = await keys(SAVE_SHEET_OPEN_CELL, ['super+s']);
  if (!sheet?.ok || sheet.value?.opened !== true) return unprepared(`the Save sheet did not open (${sheet?.error ?? sheet?.value?.reason ?? 'not sent'})`);
  const destination = await keys(SAVE_SHEET_DESTINATION_CELL, ['super+shift+g', 'typeText', 'Return']);
  // What the destination cell kept, on every exit (C-6): whether the Go To dialog closed in the cell (ruling 1219, s1),
  // the panel's structure on the observation it was judged on, which part of the Go To reading failed, a throw, and the
  // observation-only form's two structures.
  const {observed, goTo, threw, identification, lastObservation} = destination?.value ?? {};
  const kept = Object.fromEntries(Object.entries({observed, goTo, threw, identification, lastObservation}).filter(([, v]) => v !== undefined && v !== null));
  // From here every exit cancels the sheet and reads the unsaved proof before its row is recorded (C-6), so a row that
  // never reached the act's check still says what the run's folder held and whether anything was saved.
  const proved = async row => span.end({...row, outcome: {...row.outcome, ...unsavedOutcome(await unsavedProof(ctx, keys))}}, {cleanup});
  if (!destination?.ok || destination.value?.ready !== true) {
    // A failure on the destination path decides the row alone (ruling 1220's fourth condition).
    const left = goTo?.closed === false ? '; the Go To dialog would not close' : '';
    return proved({invalid: `the Save sheet's destination was not set to the run's folder (${destination?.error ?? destination?.value?.reason ?? 'not sent'}${left})`, outcome: kept});
  }
  const initialWhere = typeof destination.value.initialWhere === 'string' ? destination.value.initialWhere.slice(0, 80) : null;
  const ready = read(ctx, null, {frontKey: true});
  const window = userWindowOf(ready.reading, ctx.records[scene].pid);
  if (!window) return proved({invalid: `${scene}'s window was not in front`, outcome: kept});
  const readings = {apps: [app], activate: activationOf(ctx, app), before: keyReading(ready)};
  alertCheck(ctx, `before ${id}`);
  // A set_value posts no key, so it goes without the key guard, as the sheet variant's follow-up click does.
  const probe = await withKeystroke(ctx, {window, scene}, async scheduled => span.add(await ctx.lane.js(saveSheetActCell({at: scheduled - preMs}))));
  const act = probe.result;
  alertCheck(ctx, `after ${id}`);
  const check = act?.ok ? span.add(await ctx.lane.js(SAVE_SHEET_CHECK_CELL)) : null;
  if (!act?.ok) return proved({invalid: 'the act cell failed', ...(act?.error ? {error: act.error} : {}), outcome: kept});
  if (!check?.ok) return proved({invalid: 'the sheet could not be read after the act', ...(check?.error ? {error: check.error} : {}), outcome: kept});
  const frontKey = readingsAfter(ctx, readings);
  const unsaved = await unsavedProof(ctx, keys);
  const cua = ctx.engine === 'cua';
  const {value} = act, postedAt = probe.answer?.postedAt;
  const receivedAt = cua ? act.engine?.receivedAt : value.callAt;
  // The sentence and the structured account, each saying whether the action was stopped part-way; on cua's lane both.
  const said = refusedWith(value, USER_CHANGED) && value.message.includes(STOPPED_PART_WAY);
  const inFlight = act.engine?.interruption?.phase === 'inFlight';
  const agree = cua ? said === inFlight : null;
  const stopped = said && (!cua || inFlight);
  const effectsNamed = stopped && value.message.includes(MAY_HAVE_TAKEN_EFFECT);
  const sheetOpen = check.value?.sheetOpen === true;
  const files = Array.isArray(check.value?.destinationFiles) ? check.value.destinationFiles : null;
  const postAfterReceiptMs = Number.isFinite(postedAt) && Number.isFinite(receivedAt) ? postedAt - receivedAt : null;
  const savedSeen = unsaved.document === true || unsaved.cancel?.destinationFiles?.length > 0;
  const outcome = {stopped, agree, effectsNamed, interruption: act.engine?.interruption ?? null, sheetOpen, nameWritten: check.value?.nameWritten === true, destinationFiles: files,
      initialWhere, ...kept, ...unsavedOutcome(unsaved),
      threw: value.threw, errorName: errorNameOf(act), message: value.message ?? null, leadMs: preMs,
      postedAt: Number.isFinite(postedAt) ? postedAt : null, receivedAt: Number.isFinite(receivedAt) ? receivedAt : null, callAt: value.callAt ?? null, endAt: value.endAt ?? null,
      postAfterReceiptMs, postBeforeResponseMs: Number.isFinite(postedAt) && Number.isFinite(value.endAt) ? value.endAt - postedAt : null, late: value.late ?? null};
  // The row's verdict is its findings' (probe-plan.mjs saveSheetFindings), kept on it so a reader names them as judged.
  const findings = saveSheetFindings(outcome, ctx.engine);
  const row = {ok: findings.length === 0, inCellMs: value.actMs, wallMs: act.wallMs, inputRoute: act.route, frontKey, outcome: {...outcome, findings}};
  const why = probeProblem(probe.answer) ?? detectionOff(act) ?? (cua ? responseWindowValidity(postedAt, receivedAt, value.endAt) : postValidity(postedAt, intervalOf(ctx.engine, act)));
  // Committed: a finding whatever the timing, recorded with why the timing alone would not have judged it; never retried.
  if (!sheetOpen || files?.length || savedSeen) return span.end({...row, ok: false, outcome: {...row.outcome, validity: why ?? (cua ? stopValidity(value, stopped) : null)}}, {cleanup});
  if (files === null) return span.end({...row, ok: false, invalid: 'the run\'s save folder could not be read after the act'}, {cleanup});
  // The next call moved by the miss: the post aimed SAVE_SHEET_AIM_MS after the receipt.
  const next = postAfterReceiptMs === null ? preMs : Math.min(PROBE_LEAD_MS - 1_000, Math.max(-1_000, preMs - (postAfterReceiptMs - SAVE_SHEET_AIM_MS)));
  if (why) return span.end({...row, ok: false, invalid: why}, {retry: true, lead: next, cleanup});
  if (cua && !agree) return span.end(row, {cleanup});
  const stop = cua ? stopValidity(value, stopped) : null;
  if (stop) return span.end({...row, ok: false, invalid: stop}, {retry: true, lead: next, cleanup});
  if (unsaved.unread) return span.end({...row, ok: false, invalid: `nothing saved was not proved: ${unsaved.unread}`}, {cleanup});
  return span.end(row, {cleanup});
}
// Nothing saved, proved on TextEdit's own window once the sheet is cancelled (ruling 1221, F2; ruling 1220's third
// condition; ruling 1223, R1): the debounce out, the sheet cancelled as the cleanup cancels it (which then finds none),
// the run's folder as the cancel found it, and the untitled window the run opened read by Accessibility
// (./matrix-device.mjs documentState): no document on disk behind it. Its AXEdited is kept as a diagnostic only. No
// folder but the run's own is read, so a hosted run asks for no protected folder. The initial "Where" is a display name
// and stays recorded only. A cancel the guard held or refused, or a reading not taken, leaves
// the proof unread (`unread`, why): a refusal that persists is the cleanup's to raise, once the row is recorded. The
// cancel's own answer is kept (`cancel`: {cancelled, destinationRemoved, destinationFiles}, the run's folder as the
// cancel found it), null when it gave none. -> {document, edited, reading, cancel, unread?}.
async function unsavedProof(ctx, keys) {
  let cancel = null;
  const none = unread => ({document: null, edited: null, reading: null, cancel, unread});
  try {
    await quiet(ctx, 'textedit');
    const cancelled = await keys(SAVE_SHEET_CANCEL_CELL, ['Escape']);
    if (cancelled?.ok && cancelled.value) {
      const {cancelled: done = null, destinationRemoved = null, destinationFiles = null} = cancelled.value;
      cancel = {cancelled: done, destinationRemoved, destinationFiles};
    }
    if (!cancelled?.ok || cancelled.value?.cancelled !== true) return none(`the Save sheet was not cancelled first (${!cancelled ? 'not sent' : !cancelled.ok ? `the cell failed: ${String(cancelled.error ?? '').slice(0, 160)}` : 'the sheet still up'})`);
  } catch (error) {
    return none(`the Save sheet's cancel was ${error instanceof AlertHeld ? 'held' : 'refused'} (${String(error.message).slice(0, 160)})`);
  }
  const number = ctx.ownWindow?.scene === 'textedit' ? ctx.ownWindow.number : null;
  if (number === null) return none('TextEdit\'s own window is not known');
  let read = null;
  try { read = device(ctx, ['document', '--scene', 'textedit', '--window', String(number)]); } catch (error) { if (error instanceof Stop) throw error; read = {ok: false, reason: String(error.message).slice(0, 160)}; }
  if (read?.ok !== true) return none(`TextEdit's own window could not be read (${read?.reason ?? 'no answer'})`);
  return {document: read.document, edited: read.edited, cancel, reading: {document: read.document, edited: read.edited, editedFrom: read.editedFrom ?? null}};
}
// The proof as a row keeps it: the reading, else why it is unread, and the cancel's answer.
const unsavedOutcome = unsaved => ({unsaved: unsaved.reading ?? {unread: unsaved.unread}, cancel: unsaved.cancel});
// cua's lane: the probe's post after the engine received the request and before the cell had its response. -> null,
// or why the sample says nothing.
function responseWindowValidity(postedAt, receivedAt, endAt) {
  if (!Number.isFinite(postedAt)) return 'the probe printed no post time';
  if (!Number.isFinite(receivedAt)) return 'the answer carried no cua/receivedAt';
  if (!Number.isFinite(endAt)) return 'the cell recorded no response time';
  if (postedAt < receivedAt) return `the probe posted ${receivedAt - postedAt} ms before the request was received`;
  if (postedAt > endAt) return `the probe posted ${postedAt - endAt} ms after the response`;
  return null;
}
// Whether cua's answer, its sentence and account agreeing, says the probe's event came during the action. -> null, or
// why the sample says nothing.
function stopValidity(value, stopped) {
  if (stopped) return null;
  if (refusedWith(value, STILL_INTERACTING) || refusedWith(value, USER_CHANGED)) return 'the probe posted before the request was received: refused before the action, not stopped part-way';
  if (!value.threw) return 'set_value returned before the probe\'s event was seen';
  return null;
}
// The Save sheet cancelled and the untitled document closed, once the probe's debounce is out, under TextEdit's own key
// guard; the scene's document not in front again (a save that renamed it, say) stops the run with what the cleanup saw.
async function closeSaveSheet(ctx, keys) {
  await quiet(ctx, 'textedit');
  await keys(SAVE_SHEET_CANCEL_CELL, ['Escape']);
  const closed = await keys(CLOSE_UNTITLED_CELL, ['super+w']);
  if (closed?.ok && closed.value?.sceneInFront === true) return;
  throw new Stop(`#212's save sheet's untitled document could not be closed: TextEdit's scene document is not in front (${cleanupSeen(closed)})`);
}
