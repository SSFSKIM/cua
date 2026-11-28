// The warm-up of a matrix run (ruling 1278 (b); #117 M5): sitting C's Korean pressKey rows failed on whichever lane ran
// first, and its two slow typeText samples fell on the lane that ran first, so each lane now meets apps and an engine
// that have typed once already. Symmetric and recorded: the same steps on both lanes, each through the lane's own engine,
// discarded before any judged row, and kept on the run (meta.warmUp) as measured, so the first-lane effect stays on the
// record. A warm-up's own failure (a cell that failed, keys left unsent) never stops the run and never makes a row
// invalid; what stops any run (the key guard's stop, a possible system alert) stops it here too. One more thing stops
// it: a fixture the typing changed and the harness could not put back (FixtureChanged), since judging rows on a changed
// fixture would not be honest, and a stopped run is NO VERDICT. One row-level exception: Korean that does not engage
// again after the composition leaves that field's Korean rows invalid by their own precondition (./unicode-run.mjs).
//
// Two steps, each as a harness cell, never a row:
//   typeText     one typeText of WARM_UP_TEXT into each text venue the plan brings up (typingWarmUp, ./run.mjs, after the
//                binds and before the frontmost regime), under the Latin source the run has then
//   composition  one Korean composition, the pressKey row's r k under 2-Set, in each web field once the Korean condition
//                holds there and before its first Korean row (./unicode-run.mjs, inside the input sections: the only place
//                a source is switched)
// Each field is put back on the neutral path, the harness's own Accessibility write (./matrix-device.mjs, ./panel-ax.swift;
// as ruling 1229(b)), never the engine under test: the web fields emptied (`field-empty`: they start empty), TextEdit's
// document kept (its text is the frontmost cases' fixture, so the caret is put at its start before the typing and what
// was typed before its text is removed after, read back by its digest, which stays on the device: `field-caret`,
// `field-strip`). Those writes run only on a GitHub-hosted runner, so off one nothing is typed, as no field could be put
// back: each step is recorded skipped.
//
// The record holds kinds, times, booleans, counts, AXErrors and fixed codes (FIELD_WHY): never a keycode, a key list,
// the text, a digest or an error's own words.
import {SCENES} from '../repl-parity/scenes-mac.mjs';
import {cell} from '../native-baseline/cells.mjs';
import {prelude} from './matrix-cells.mjs';
import {FIELD_WHY} from './matrix-device.mjs';
import {FOCUS_REASONS, TEXT_FIELDS} from './plan.mjs';
import {scheduledActCell} from './probe-plan.mjs';
import {activate, AlertGuarded, AlertHeld, alertCheck, device, errorNameOf, js, keyWindowScene, notActivated, read, sendKeys, Stop} from './steps.mjs';

const j = JSON.stringify;
// A short sentence of dictionary words, capitalised, so no autocorrection or capitalisation in TextEdit rewrites it.
export const WARM_UP_TEXT = 'Warm up';
// The text venues, in the order the run brings them up; the web fields are where the Korean step composes.
export const TYPING_VENUES = Object.freeze(['textedit', 'chrome', 'electron']);
export const COMPOSITION_VENUES = Object.freeze(['chrome', 'electron']);
export const OFF_HOSTED = 'off a GitHub-hosted runner the harness\'s own Accessibility writes refuse (rulings 1188, 1229(b)), so nothing could put the field back: not typed';

// A fixture the warm-up's typing changed and the harness could not put back: the run stops before any judged row meets
// it (./run.mjs records every planned sample NO VERDICT by this cause). `venue`, `why`: the field and its FIELD_WHY code.
export class FixtureChanged extends Stop {
  constructor(venue, why) {
    super(`the warm-up's typing left ${venue}'s ${venue === 'textedit' ? 'document' : 'field'} changed and the harness could not put it back (${why}): no row is judged on a changed fixture (ruling 1278 (b))`);
    this.venue = venue;
    this.why = why;
  }
}

// One step on the run's record, its device-clock window the span of every step the run marked for it.
export const recordWarmUp = (ctx, step) => { (ctx.meta.warmUp ??= {steps: []}).steps.push(step); return step; };
const spanOf = windows => (windows.length ? [Math.min(...windows.map(w => w.at[0])), Math.max(...windows.map(w => w.at[1]))] : null);
// The step's record made once `body` is done, also when it throws (a FixtureChanged stop keeps what it saw).
export async function warmUpStep(ctx, base, body) {
  const first = ctx.windows.length, seen = {};
  try { Object.assign(seen, await body(seen)); } finally { recordWarmUp(ctx, {...base, at: spanOf(ctx.windows.slice(first)), ...seen}); }
}

// The field focused for the warm-up's keys, through the lane's engine: clicked when it is not focused, never written.
// -> {ready} | {ready: false, reason}.
export const warmUpPrepareCell = venue => cell(`${prelude(venue)}
// cua-matrix-cell: warmup.prepare
let ax = await observe();
if (!inFront(ax)) return {ready: false, reason: "the scene window is not the app's front window"};
const __find = ax => ${TEXT_FIELDS[venue]};
let __index = __find(ax);
if (__index === null) return {ready: false, reason: "the field is not in the text"};
if (focusedIndexOf(ax) !== __index) { await __app.click(__index); ax = await observe(); __index = __find(ax); }
const __focus = __index === null ? "unfocused" : focusReading(ax, __index);
return __focus === "focused" ? {ready: true} : {ready: false, reason: __focus === "masked" ? ${j(FOCUS_REASONS.masked)} : ${j(FOCUS_REASONS.unfocused)}};`);
export const warmUpTypeCell = venue => scheduledActCell(venue, {act: `await __app.typeText(${j(WARM_UP_TEXT)});`, tag: 'warmup.typeText'});
export const warmUpComposeCell = (venue, keys) => scheduledActCell(venue, {act: `await __app.pressKey(${j(keys)});`, tag: 'warmup.composition'});

// What a harness field command's answer keeps on the record: its numbers and booleans and its fixed code, never its
// sentence. -> the answer, allowlisted.
const KEPT = Object.freeze(['emptied', 'restored', 'placed', 'count', 'settable', 'write', 'select', 'selected', 'removed', 'readBack', 'reads', 'caret', 'length', 'windowMatches', 'exitCode']);
const WHY = Object.freeze([...FIELD_WHY, 'command-failed', 'no-answer']);
export const publicAnswer = a => ({...Object.fromEntries(Object.entries(a ?? {}).filter(([k, v]) => KEPT.includes(k) && (v === null || ['number', 'boolean'].includes(typeof v)
  || (k === 'caret' && Number.isSafeInteger(v?.location) && Number.isSafeInteger(v?.length))))), ...(a?.why ? {why: WHY.includes(a.why) ? a.why : 'other'} : {})});
// The harness's write, a command that threw recorded by its exit code alone (never its words) and never the run's stop.
// -> its answer, allowlisted (publicAnswer) | {[key]: false, why: 'command-failed' | 'no-answer', exitCode?}.
export function neutral(ctx, args, key) {
  let answer;
  try { answer = device(ctx, args); } catch (error) {
    if (error instanceof Stop) throw error;
    return {[key]: false, why: 'command-failed', ...(Number.isSafeInteger(error?.status) ? {exitCode: error.status} : {})};
  }
  return answer ? publicAnswer(answer) : {[key]: false, why: 'no-answer'};
}

// The venue's field prepared, then the act cell (`act`, its keys `keys`, named in the record and every message by
// `keysAs`) sent under the key guard, between two alert checks when it types (`pasting`). An act the alert guard
// refused or held is unsent, recorded. `between` runs after the prepare and before the act (TextEdit's caret, the
// composition's field cleared). -> {sent, ok, errorName, actMs?, unsent?, ...between's}: `sent` whether the keys' cell
// was dispatched.
export async function warmUpAct(ctx, venue, {act, keys, keysAs, pasting = false, between = null}) {
  const app = SCENES[venue].bundleId;
  try {
    const prepared = await js(ctx, 'harness', `warmup:prepare:${venue}`, warmUpPrepareCell(venue), {apps: [app]});
    if (!prepared.ok || prepared.value?.ready !== true) return {sent: false, ok: false, errorName: null, unsent: `not prepared: ${prepared.ok ? prepared.value?.reason ?? 'no reason' : 'the prepare cell failed'}`};
    const before = between ? between() : null;
    if (before?.unsent) return {sent: false, ok: false, errorName: null, ...before};
    if (pasting) alertCheck(ctx, `before the warm-up's ${keysAs} in ${venue}`);
    const front = read(ctx, null, {frontKey: true, keyWindow: keyWindowScene(ctx, venue)});
    const done = await sendKeys(ctx, act, keys, {scene: venue, front, key: `warmup:${venue}`, keysAs});
    if (pasting) alertCheck(ctx, `after the warm-up's ${keysAs} in ${venue}`);
    if (done === null) return {sent: false, ok: false, errorName: null, unsent: 'the key guard did not send the keys', ...(before ?? {})};
    return {sent: true, ok: done.ok === true && done.value?.threw === false, errorName: errorNameOf(done) ?? null, ...(done.ok && Number.isFinite(done.value?.actMs) ? {actMs: Math.round(done.value.actMs)} : {}),
      ...(before ?? {})};
  } catch (error) {
    if (!(error instanceof AlertHeld)) throw error;
    return {sent: false, ok: false, errorName: null, unsent: error instanceof AlertGuarded ? 'the alert guard refused it' : 'the key guard held it: replayd\'s capture alert in front'};
  }
}

// The typing warm-up (./run.mjs, after the binds, before the frontmost regime): each text venue of `scenes` in front, its
// field focused, the typing, the field put back.
export async function typingWarmUp(ctx, scenes) {
  for (const venue of TYPING_VENUES.filter(v => scenes.includes(v))) {
    await ctx.checkpoint();
    const base = {venue, kind: 'typeText'};
    if (ctx.meta.hosted !== true) { recordWarmUp(ctx, {...base, skipped: OFF_HOSTED}); continue; }
    await warmUpStep(ctx, base, seen => typeInto(ctx, venue, seen));
  }
}
// Not every judged row on Chrome and the Electron fixture establishes its field's value: the speed and finding cells
// read the scene as it stands, with no prepare of their own, and the cases' prepares set only the fields they act on.
// So a web field the typing reached is a fixture like TextEdit's document: put back, tried once more when it did not
// read back so, and the run stopped when it still does not (FixtureChanged). Keys that were never sent changed nothing,
// so a field that then does not read back is recorded alone. The second try is the only neutral recovery there is:
// TextEdit's document is the RTF file the scene opened at its `up` (../repl-parity/scenes-mac.mjs textEditDocument),
// whose bold line no Accessibility write of the whole text (AXValue, a plain string) restores, and opening it again
// would be a new TextEdit process for the run's binds; matrix-device `document` only reads.
async function typeInto(ctx, venue, seen) {
  const front = activate(ctx, venue);
  if (notActivated(ctx, venue) || !front?.ok) return {sent: false, ok: false, errorName: null, unsent: `${venue} did not come to the front`};
  // TextEdit's document: the caret at its start, its length and digest kept on the device for the strip.
  const textedit = venue === 'textedit';
  let placed = false;
  const caret = !textedit ? null : () => {
    const kept = neutral(ctx, ['field-caret', '--scene', venue], 'placed');
    placed = kept.placed === true;
    return placed ? {caret: kept} : {unsent: 'the caret was not put at the document\'s start', caret: kept};
  };
  Object.assign(seen, await warmUpAct(ctx, venue, {act: warmUpTypeCell(venue), keys: ['typeText'], keysAs: 'typing', pasting: true, between: caret}));
  // Nothing typed and nothing to take back when the caret was not placed.
  if (textedit && !placed) return seen;
  const putBack = () => neutral(ctx, textedit ? ['field-strip', '--scene', venue] : ['field-empty', '--scene', venue], textedit ? 'restored' : 'emptied');
  const done = answer => answer[textedit ? 'restored' : 'emptied'] === true;
  seen.neutral = putBack();
  if (done(seen.neutral) || !seen.sent) return seen;
  // Once more: a strip that reads the document as its own text again removes nothing and confirms it by its digest.
  seen.secondTry = putBack();
  if (!done(seen.secondTry)) throw new FixtureChanged(venue, seen.secondTry.why ?? 'other');
  return seen;
}
