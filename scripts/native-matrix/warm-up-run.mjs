// The warm-up of a matrix run (ruling 1278 (b); #117 M5): sitting C's Korean pressKey rows failed on whichever lane ran
// first, and its two slow typeText samples fell on the lane that ran first, so each lane now meets apps and an engine
// that have typed once already. Symmetric and recorded: the same steps on both lanes, each through the lane's own engine,
// discarded before any judged row, and kept on the run (meta.warmUp) as measured, so the first-lane effect stays on the
// record. A warm-up never stops the run and never makes a row invalid: a cell that failed or a field that did not read
// back as it was is recorded; only what stops any run (the key guard's stop, a possible system alert) stops it here.
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
// was typed before its text is removed after, read back by its digest: `field-caret`, `field-strip`). Those writes run only
// on a GitHub-hosted runner, so off one nothing is typed, the field could not be put back: each step is recorded skipped.
//
// The record holds kinds, times, booleans, counts and AXErrors: never a keycode, the text or a digest.
import {SCENES} from '../repl-parity/scenes-mac.mjs';
import {cell} from '../native-baseline/cells.mjs';
import {prelude} from './matrix-cells.mjs';
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

// One step on the run's record, its device-clock window the span of every step the run marked for it.
export const recordWarmUp = (ctx, step) => { (ctx.meta.warmUp ??= {steps: []}).steps.push(step); return step; };
const spanOf = windows => (windows.length ? [Math.min(...windows.map(w => w.at[0])), Math.max(...windows.map(w => w.at[1]))] : null);
export async function warmUpStep(ctx, base, body) {
  const first = ctx.windows.length;
  const out = await body();
  return recordWarmUp(ctx, {...base, at: spanOf(ctx.windows.slice(first)), ...out});
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

// The harness's write, a command that threw recorded and never the run's stop. -> its answer | {[key]: false, reason}.
export function neutral(ctx, args, key) {
  try { return device(ctx, args) ?? {[key]: false, reason: 'no answer'}; } catch (error) {
    if (error instanceof Stop) throw error;
    return {[key]: false, reason: String(error?.message ?? error).slice(0, 160)};
  }
}

// The venue's field prepared, then the act cell (`act`, its keys `keys`) sent under the key guard, between two alert
// checks when it types (`pasting`). An act the alert guard refused or held is unsent, recorded. `between` runs after the
// prepare and before the act (TextEdit's caret). -> {ok, errorName, actMs?, unsent?, ...between's}.
export async function warmUpAct(ctx, venue, {act, keys, pasting = false, between = null}) {
  const app = SCENES[venue].bundleId;
  try {
    const prepared = await js(ctx, 'harness', `warmup:prepare:${venue}`, warmUpPrepareCell(venue), {apps: [app]});
    if (!prepared.ok || prepared.value?.ready !== true) return {ok: false, errorName: null, unsent: `not prepared: ${prepared.ok ? prepared.value?.reason ?? 'no reason' : 'the prepare cell failed'}`};
    const before = between ? between() : null;
    if (before?.unsent) return {ok: false, errorName: null, ...before};
    if (pasting) alertCheck(ctx, `before the warm-up's ${keys.join(' ')} in ${venue}`);
    const front = read(ctx, null, {frontKey: true, keyWindow: keyWindowScene(ctx, venue)});
    const done = await sendKeys(ctx, act, keys, {scene: venue, front, key: `warmup:${venue}`});
    if (pasting) alertCheck(ctx, `after the warm-up's ${keys.join(' ')} in ${venue}`);
    if (done === null) return {ok: false, errorName: null, unsent: 'the key guard did not send the keys', ...(before ?? {})};
    return {ok: done.ok === true && done.value?.threw === false, errorName: errorNameOf(done) ?? null, ...(done.ok && Number.isFinite(done.value?.actMs) ? {actMs: Math.round(done.value.actMs)} : {}),
      ...(before ?? {})};
  } catch (error) {
    if (!(error instanceof AlertHeld)) throw error;
    return {ok: false, errorName: null, unsent: error instanceof AlertGuarded ? `the alert guard refused it (${error.guard.detail})` : 'the key guard held it: replayd\'s capture alert in front'};
  }
}

// The typing warm-up (./run.mjs, after the binds, before the frontmost regime): each text venue of `scenes` in front, its
// field focused, the typing, the field put back.
export async function typingWarmUp(ctx, scenes) {
  for (const venue of TYPING_VENUES.filter(v => scenes.includes(v))) {
    await ctx.checkpoint();
    const base = {venue, kind: 'typeText'};
    if (ctx.meta.hosted !== true) { recordWarmUp(ctx, {...base, skipped: OFF_HOSTED}); continue; }
    await warmUpStep(ctx, base, () => typeInto(ctx, venue));
  }
}
async function typeInto(ctx, venue) {
  const front = activate(ctx, venue);
  if (notActivated(ctx, venue) || !front?.ok) return {ok: false, errorName: null, unsent: `${venue} did not come to the front (${front?.reason ?? 'its activation did not take front and key'})`};
  // TextEdit's document: the caret at its start, its length and digest kept here for the strip, never on the record.
  let kept = null;
  const caret = venue !== 'textedit' ? null : () => {
    kept = neutral(ctx, ['field-caret', '--scene', venue], 'placed');
    const {digest: _digest, ...shown} = kept;
    return kept.placed === true ? {caret: shown} : {unsent: `the caret was not put at the document's start (${kept.reason ?? kept.refused ?? 'no reason'})`, caret: shown};
  };
  const out = await warmUpAct(ctx, venue, {act: warmUpTypeCell(venue), keys: ['typeText'], pasting: true, between: caret});
  if (venue !== 'textedit') return {...out, neutral: neutral(ctx, ['field-empty', '--scene', venue], 'emptied')};
  // Nothing to take back when the caret was not placed: nothing was typed.
  if (kept?.placed !== true) return out;
  return {...out, neutral: neutral(ctx, ['field-strip', '--scene', venue, '--length', String(kept.length), '--digest', kept.digest], 'restored')};
}
