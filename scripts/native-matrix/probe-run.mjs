// The probe cells of a matrix run (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system
// part 5; the rules and cells in ./probe-plan.mjs): concurrent use on Finder and Chrome for Testing with TextEdit's
// document as the user window, its sheet variant on TextEdit with the Electron fixture's field as the user window,
// intervention fires and the pre-action refusal on TextEdit in front. Each is one row per run (section `concurrent` or
// `intervention`, the run's number its sample), from up to PROBE_ATTEMPTS attempts: an attempt whose probe fell outside
// the window that makes it valid is retried, aimed from its own times, and only the last is kept (its predecessors'
// reasons in `outcome.retries`); the last one invalid leaves the row invalid.
//
// The user window's value is read back only through the focus probe (`read --focus`, its valueHash), never through
// either engine. Every key or typing act goes under the key guard (the user window's case, or the driven scene in
// front), and every typing act between two alert checks, as the method rows' do. The probe's keys are a user's to the
// engine: before the run drives a scene the probe typed into, it waits the debounce out and observes it (./steps.mjs
// quiet).
import {sha256Hex} from './matrix-text.mjs';
import {userWindowOf} from './oracle.mjs';
import {
  CLOSE_UNTITLED_CELL, CONCURRENT_TYPING, concurrentCheckCell, concurrentPrepareCell, EMPTY_HASH, emptyFieldCell, endsWithCell, intervalOf, LONG_TEXT, NEW_DOCUMENT_CELL,
  nextPreMs, postValidity, PRE_ACTION_DELAY_MS, PRE_MS, PROBE_ATTEMPTS, PROBE_LEAD_MS, PROBE_TEXT, probeProblem, receiptValidity, scheduledActCell, SHEET_FOLLOW_MS,
  SHEET_PRE_MS, SHEET_TYPE_CELL, sheetCheckCell, sheetFollowCell, sheetOpenCell, STILL_INTERACTING, USER_CHANGED,
} from './probe-plan.mjs';
import {requeryCell} from './matrix-cells.mjs';
import {activate, alertCheck, device, focusOf, js, mark, push, quiet, read, sendKeys, Stop, userFront, waitQuiet} from './steps.mjs';

const j = JSON.stringify;
const USER_HASH = sha256Hex(PROBE_TEXT);
// The ids, stable across runs and engines.
export const PROBE_ROWS = Object.freeze({
  concurrent: driven => ({section: 'concurrent', id: `${driven}/concurrent@textedit`, scene: driven, user: 'textedit', regime: 'background', method: 'typeText', case: 'concurrent'}),
  sheet: {section: 'concurrent', id: 'textedit/concurrent.sheet@electron', scene: 'textedit', user: 'electron', regime: 'background', method: 'pressKey', case: 'sheet'},
  fires: {section: 'intervention', id: 'textedit/intervention.fires', scene: 'textedit', regime: 'frontmost', method: 'typeText', case: 'fires'},
  preAction: {section: 'intervention', id: 'textedit/intervention.preAction', scene: 'textedit', regime: 'frontmost', method: 'typeText', case: 'preAction'},
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
}

// One sample from up to PROBE_ATTEMPTS attempts. An attempt answers {row, retry?, lead?, oracle?, key}: `retry` when its
// probe fell outside its window, `lead` the next attempt's aim. The kept row is judged by the oracle when it carries
// one, else charged its activations.
async function sampled(ctx, base, attempt) {
  const row = {...base, engine: ctx.engine, sample: ctx.n, ok: false};
  if (!ctx.latin) return push(ctx, {...row, invalid: 'the Latin input source was not selected and read back with the per-context preference off'});
  const retries = [];
  let lead = null;
  for (let n = 1; n <= PROBE_ATTEMPTS; n++) {
    await ctx.checkpoint();
    const out = await attempt({lead, n, id: base.id, key: `row:${ctx.rows.length}:${n}`});
    if (out.retry && n < PROBE_ATTEMPTS) { retries.push(out.row.invalid); lead = out.lead; continue; }
    const pushed = push(ctx, {...row, ...out.row, attempts: n, ...(retries.length ? {outcome: {...(out.row.outcome ?? {}), retries}} : {})});
    if (!pushed.invalid) ctx.judged.set(out.key, {row: pushed, oracle: out.oracle ?? null});
    return pushed;
  }
  return null;
}

// The device-clock window of an attempt's cells, marked as one row window when it ends.
function spanOf(ctx, key) {
  let from = null, to = null;
  return {
    add: r => { if (r?.at) { from ??= r.at[0]; to = r.at[1]; } return r; },
    end: (row, extra = {}) => { if (from !== null) mark(ctx, 'row', key, [from, to]); return {row, key, ...extra}; },
  };
}
// A precondition that did not hold, as the row: with the focus probe's reading when that was what failed (why it did not
// name the window, ./matrix-device.mjs ownedFocus), recorded and never judged.
const precondition = ({invalid, focus}) => (focus === undefined ? {invalid} : {invalid, focus});
const failed = (r, what) => (!r?.ok ? `${what} failed${r?.error ? `: ${String(r.error).slice(0, 200)}` : ''}` : null);
// The engine's userIntervened refusal with one of its two sentences.
const refusedWith = (value, sentence) => value?.threw === true && value.errorName === 'userIntervened' && typeof value.message === 'string' && value.message.includes(sentence);
const detectionOff = act => (act?.engine?.intervention === 'off' ? 'intervention detection is off on the engine (no Input Monitoring grant): the cell cannot be judged' : null);

// The user window in front with its typing field emptied and focused, read back by the focus probe. -> {userWindow,
// reading} or {invalid}.
async function userField(ctx, span, user) {
  const front = activate(ctx, user);
  if (!front?.ok) return {invalid: `the user window (${user}) did not come to the front`};
  const prepared = span.add(await ctx.lane.js(emptyFieldCell(user)));
  const problem = failed(prepared, 'the user window\'s preparation') ?? (prepared.value?.ready ? null : `the user window's field was not prepared: ${prepared.value?.reason ?? 'no reason'}`);
  if (problem) return {invalid: problem};
  const r0 = read(ctx);
  const userWindow = userWindowOf(r0.reading, ctx.records[user].pid);
  if (!userWindow) return {invalid: `the user window (${user}) was not in front`};
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

async function concurrentAttempt(ctx, driven, {lead, id, key}) {
  const user = 'textedit', preMs = lead ?? PRE_MS[driven];
  const span = spanOf(ctx, key);
  await quiet(ctx, driven);
  await quiet(ctx, user);
  const prepared = span.add(await ctx.lane.js(concurrentPrepareCell(driven)));
  const unprepared = failed(prepared, 'the driven scene\'s preparation') ?? (prepared.value?.ready ? null : `the driven scene was not prepared: ${prepared.value?.reason ?? 'no reason'}`);
  if (unprepared) return span.end({invalid: unprepared});
  const field = await userField(ctx, span, user);
  if (field.invalid) return span.end(precondition(field));
  const {userWindow} = field;
  alertCheck(ctx, `before ${id}`);
  let before = null;
  const probe = await withKeystroke(ctx, {window: userWindow, scene: user}, async scheduled => {
    before = await userFront(ctx, user, userWindow);
    if (!before) return null;
    const act = scheduledActCell(driven, {at: scheduled - preMs, act: `await __app.typeText(${j(CONCURRENT_TYPING[driven])});`, tag: 'concurrent.act'});
    return span.add(await sendKeys(ctx, act, ['typeText'], {scene: driven, front: before, userWindow, kind: 'row', key}));
  });
  const act = probe.result;
  if (!before) return span.end({invalid: 'the user window was not in front before the action'});
  if (!act) return span.end({invalid: 'the key guard did not send the action'});
  alertCheck(ctx, `after ${id}`);
  if (!act.ok) return span.end({invalid: 'the act cell failed', error: act.error});
  const after = read(ctx, focusOf(userWindow));
  const check = span.add(await ctx.lane.js(concurrentCheckCell(driven)));
  const interval = intervalOf(ctx.engine, act);
  const postedAt = probe.answer?.postedAt;
  const userLanded = after.focus?.named === true && after.focus.valueHash === USER_HASH;
  const drivenLanded = check.ok && check.value?.ok === true;
  const row = {ok: drivenLanded && userLanded && !act.value.threw, inCellMs: act.value.actMs, wallMs: act.wallMs, inputRoute: act.route,
    outcome: {drivenLanded, userLanded, threw: act.value.threw, errorName: act.value.errorName, ...timing(interval, postedAt, act), ...(check.value?.outcome ?? {})},
    ...(check.ok ? {} : {error: check.error})};
  const why = probeProblem(probe.answer) ?? postValidity(postedAt, interval);
  if (why) return span.end({...row, ok: false, invalid: why}, {retry: true, lead: nextPreMs({callAt: act.value.callAt, interval, postedAt, scheduled: probe.scheduled, preMs})});
  if (after.watcher !== true) return span.end({...row, ok: false, invalid: 'the activation watcher was not running after the action'});
  return span.end(row, {oracle: {before: before.reading, after: after.reading, focus: after.focus ?? null, inputRoute: act.route, scene: driven, userPid: userWindow.pid}});
}
// Where the post fell in the interval, for the evidence. -> {intervalSource, intervalMs, postOffsetMs, late}.
const timing = (interval, postedAt, act) => ({intervalSource: interval?.source ?? null, intervalMs: interval ? interval.to - interval.from : null,
  postOffsetMs: interval && Number.isFinite(postedAt) ? postedAt - interval.from : null, late: act?.value?.late ?? null});

// ---- the sheet variant ----------------------------------------------------------------------------------------------

// The opening action (super+w) is the driven action the post must fall inside, by its own call's interval as concurrent
// use's typing is; the follow-up's receipt must come after the post and within the debounce, so that a follow-up the
// intervention rule refused would show it. The row is judged by the oracle as concurrent use's is: the user window's
// readings before the opening and after the follow-up, the watcher's liveness, every activation in the attempt and the
// routes of all its driven actions (super+n, the typing, the opening and the follow-up).
async function sheetAttempt(ctx, {lead, id, key}) {
  const driven = 'textedit', user = 'electron';
  const span = spanOf(ctx, key);
  await quiet(ctx, driven);
  await quiet(ctx, user);
  const field = await userField(ctx, span, user);
  if (field.invalid) return span.end(precondition(field));
  const {userWindow} = field;
  const keys = async (code, names) => {
    const front = await userFront(ctx, user, userWindow);
    return front ? span.add(await sendKeys(ctx, code, names, {scene: driven, front, userWindow, kind: 'row', key})) : null;
  };
  const opened = await keys(NEW_DOCUMENT_CELL, ['super+n']);
  if (!opened?.ok || opened.value?.opened !== true) {
    await closeUntitled(ctx, keys);
    return span.end({invalid: `the untitled document did not open (${opened?.error ?? opened?.value?.reason ?? 'not sent'})`});
  }
  alertCheck(ctx, `before ${id} typing`);
  const typed = await keys(SHEET_TYPE_CELL, ['typeText']);
  alertCheck(ctx, `after ${id} typing`);
  if (!typed?.ok || typed.value?.typed !== true) {
    await closeUntitled(ctx, keys);
    return span.end({invalid: `the untitled document's text was not typed (${typed?.error ?? typed?.value?.reason ?? 'not sent'})`});
  }
  const preMs = lead ?? SHEET_PRE_MS;
  let before = null, opening = null;
  const probe = await withKeystroke(ctx, {window: userWindow, scene: user}, async scheduled => {
    before = await userFront(ctx, user, userWindow);
    if (!before) return null;
    opening = span.add(await sendKeys(ctx, sheetOpenCell({at: scheduled - preMs}), ['super+w'], {scene: driven, front: before, userWindow, kind: 'row', key}));
    // A click, not a key: sent without the key guard, whose reading would sit between the two actions.
    return opening?.ok ? span.add(await ctx.lane.js(sheetFollowCell({followAt: scheduled + SHEET_FOLLOW_MS}))) : null;
  });
  const follow = probe.result;
  if (!opening?.ok || !follow?.ok) {
    await closeUntitled(ctx, keys);
    const what = !before ? 'the user window was not in front before super+w' : !opening ? 'the key guard did not send super+w' : !opening.ok ? 'the opening cell failed' : 'the follow-up cell failed';
    return span.end({invalid: what, ...((opening?.error ?? follow?.error) ? {error: opening?.error ?? follow?.error} : {})});
  }
  const after = read(ctx, focusOf(userWindow));
  const check = span.add(await ctx.lane.js(sheetCheckCell()));
  if (!check.ok || check.value?.closed !== true || check.value?.sceneInFront !== true) {
    // A refused follow-up leaves the sheet up, a refused opening the dirty untitled document: once the debounce it may
    // have started is out, the untitled document's own cleanup closes either (its sheet's Delete, or super+w and then
    // the sheet's Delete), the scene's document back in front.
    ctx.posted[driven] = ctx.posted[user];
    await quiet(ctx, driven);
    await closeUntitled(ctx, keys);
  }
  const postedAt = probe.answer?.postedAt, interval = intervalOf(ctx.engine, opening), {value} = follow;
  const receivedAt = ctx.engine === 'cua' ? follow.engine?.receivedAt : value.clickAt;
  const userLanded = after.focus?.named === true && after.focus.valueHash === USER_HASH;
  const ok = !opening.value.threw && value.opened === true && value.clicked === true && !value.threw && check.value?.closed === true && check.value?.sceneInFront === true && userLanded;
  const row = {ok, inputRoute: opening.route, inputRoutes: {opening: opening.route, followUp: follow.route}, inCellMs: opening.value.actMs, wallMs: opening.wallMs,
    outcome: {sheetOpened: value.opened === true, openingThrew: opening.value.threw, followUpRefused: refusedWith(value, STILL_INTERACTING) || refusedWith(value, USER_CHANGED),
      followUpThrew: value.threw, errorName: value.errorName, sheetClosed: check.value?.closed === true, userLanded, ...timing(interval, postedAt, opening),
      receiptAfterPostMs: Number.isFinite(postedAt) && Number.isFinite(receivedAt) ? receivedAt - postedAt : null}};
  // No sheet came up, so nothing was followed up: the opening's own outcome is the sample's, its receipt unneeded.
  const why = probeProblem(probe.answer) ?? detectionOff(opening) ?? detectionOff(follow) ?? postValidity(postedAt, interval)
    ?? (value.clicked === true ? receiptValidity({engine: ctx.engine, postedAt, receivedAt: follow.engine?.receivedAt, callAt: value.clickAt}) : null);
  if (why) return span.end({...row, ok: false, invalid: why}, {retry: true, lead: nextPreMs({callAt: opening.value.callAt, interval, postedAt, scheduled: probe.scheduled, preMs})});
  if (after.watcher !== true) return span.end({...row, ok: false, invalid: 'the activation watcher was not running after the action'});
  const routes = [opened.route, typed.route, opening.route, follow.route];
  return span.end(row, {oracle: {before: before.reading, after: after.reading, focus: after.focus ?? null, inputRoute: routes, scene: driven, userPid: userWindow.pid}});
}
// The untitled document closed after a variant that stopped part-way; a scene document not back in front stops the run.
async function closeUntitled(ctx, keys) {
  const closed = await keys(CLOSE_UNTITLED_CELL, ['super+w']);
  if (!closed?.ok || closed.value?.sceneInFront !== true) throw new Stop('the sheet variant\'s untitled document could not be closed: TextEdit\'s scene document is not in front');
}

// ---- intervention fires ---------------------------------------------------------------------------------------------

// TextEdit in front, its document emptied and focused, the window the probe is gated on. -> {window} or {invalid}.
async function drivenInFront(ctx, span, scene) {
  const front = activate(ctx, scene);
  if (!front?.ok) return {invalid: `${scene} did not come to the front`};
  const prepared = span.add(await ctx.lane.js(emptyFieldCell(scene)));
  const problem = failed(prepared, 'the preparation') ?? (prepared.value?.ready ? null : `not prepared: ${prepared.value?.reason ?? 'no reason'}`);
  if (problem) return {invalid: problem};
  const window = userWindowOf(read(ctx).reading, ctx.records[scene].pid);
  if (!window) return {invalid: `${scene}'s window was not in front`};
  const f0 = read(ctx, focusOf(window));
  if (f0.focus?.named !== true || f0.focus.valueHash !== EMPTY_HASH) return {invalid: 'the focus probe did not read the document focused and empty', focus: f0.focus ?? null};
  return {window};
}
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
async function firesAttempt(ctx, {lead, id, key}) {
  const scene = 'textedit', preMs = lead ?? PRE_MS.textedit;
  const span = spanOf(ctx, key);
  await quiet(ctx, scene);
  const driven = await drivenInFront(ctx, span, scene);
  if (driven.invalid) return span.end(precondition(driven));
  const {window} = driven;
  const probe = await withKeystroke(ctx, {window, scene},
    scheduled => typing(ctx, span, scene, scheduledActCell(scene, {at: scheduled - preMs, act: `await __app.typeText(${j(LONG_TEXT)});`, tag: 'intervention.act'}), {key, when: id}));
  const act = probe.result;
  if (!act?.ok) return span.end({invalid: act ? 'the act cell failed' : 'the key guard did not send the action', ...(act?.error ? {error: act.error} : {})});
  const interval = intervalOf(ctx.engine, act), postedAt = probe.answer?.postedAt;
  const fired = refusedWith(act.value, USER_CHANGED);
  const base = {inCellMs: act.value.actMs, wallMs: act.wallMs, inputRoute: act.route,
    outcome: {fired, errorName: act.value.errorName, entered: act.engine?.entered ?? null, ...timing(interval, postedAt, act)}};
  const why = probeProblem(probe.answer) ?? detectionOff(act) ?? postValidity(postedAt, interval);
  if (why) return span.end({...base, ok: false, invalid: why}, {retry: true, lead: nextPreMs({callAt: act.value.callAt, interval, postedAt, scheduled: probe.scheduled, preMs})});
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
  const outcome = {...base.outcome, refusedNext: next?.ok === true && refusedWith(next.value, USER_CHANGED), nextErrorName: next?.value?.errorName ?? null,
    nothingPosted: h1 !== null && h1 === h2, requeried: requeried.ok === true, againLanded: again?.ok === true && !again.value.threw && landed.value?.landed === true};
  return span.end({...base, ok: fired && outcome.refusedNext && outcome.nothingPosted && outcome.requeried && outcome.againLanded, outcome});
}

// ---- the pre-action refusal -----------------------------------------------------------------------------------------

// The probe types into TextEdit's document and the harness's typeText follows at once: refused with the still-
// interacting sentence and nothing posted (the document's hash the probe's text alone).
async function preActionAttempt(ctx, {lead, id, key}) {
  const scene = 'textedit', delay = lead ?? PRE_ACTION_DELAY_MS;
  const span = spanOf(ctx, key);
  await quiet(ctx, scene);
  const driven = await drivenInFront(ctx, span, scene);
  if (driven.invalid) return span.end(precondition(driven));
  const {window} = driven;
  const probe = await withKeystroke(ctx, {window, scene},
    scheduled => typing(ctx, span, scene, scheduledActCell(scene, {at: scheduled + delay, act: 'await __app.typeText("x");', tag: 'preaction.act'}), {key, when: id}));
  const act = probe.result;
  if (!act?.ok) return span.end({invalid: act ? 'the act cell failed' : 'the key guard did not send the action', ...(act?.error ? {error: act.error} : {})});
  const after = read(ctx, focusOf(window));
  const postedAt = probe.answer?.postedAt, receivedAt = ctx.engine === 'cua' ? act.engine?.receivedAt : act.value.callAt;
  const refused = refusedWith(act.value, STILL_INTERACTING), nothingPosted = after.focus?.named === true && after.focus.valueHash === USER_HASH;
  const row = {ok: refused && nothingPosted, inCellMs: act.value.actMs, wallMs: act.wallMs, inputRoute: act.route,
    outcome: {refused, errorName: act.value.errorName, nothingPosted, hidIdleMs: act.engine?.hidIdleMs ?? null,
      receiptAfterPostMs: Number.isFinite(postedAt) && Number.isFinite(receivedAt) ? receivedAt - postedAt : null}};
  const why = probeProblem(probe.answer) ?? detectionOff(act) ?? receiptValidity({engine: ctx.engine, postedAt, receivedAt: act.engine?.receivedAt, callAt: act.value.callAt});
  // A receipt before the post is answered by a later call; one past the debounce by an earlier one.
  const nextDelay = Number.isFinite(postedAt) && Number.isFinite(receivedAt) ? Math.max(0, delay + (receivedAt <= postedAt ? postedAt - receivedAt + PRE_ACTION_DELAY_MS : -(receivedAt - postedAt - PRE_ACTION_DELAY_MS))) : delay;
  if (why) return span.end({...row, ok: false, invalid: why}, {retry: true, lead: nextDelay});
  return span.end(row);
}
