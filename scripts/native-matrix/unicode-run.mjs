// The Korean and Unicode matrix of a matrix run (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// Verification system part 6; the plan in ./unicode-plan.mjs): the `unicode` section's rows, condition by condition.
// The input source is the run's to switch only inside ./run.mjs inputSections, which saved the owner's source and
// per-context preference before (the live harness's record) and restores both after, whatever happened; the put-back
// verifies them again.
//
// A source says something about a row only where the row's target reads it: with the per-context preference on, each
// app keeps its own, so every condition but the per-context one needs the preference read off (./run.mjs inputSections
// asks for it; rows are invalid when it did not hold), and each target's source is established with the target in
// front (read, selected there when it reads another, read back), never taken from a selection made elsewhere.
//
// Each row is a case on the field's scene (./steps.mjs caseRow, the method rows' runner: prepare, one facade call under
// the key guard between two alert checks, the read-back by hash), frontmost under the Latin and Korean sources, behind
// the user window under the composition and the per-context preference, where the oracle reads the user window around
// each act and the composition's row also requires the user's field to keep its value. The mid-switch row schedules the
// probe's switch inside its typeText, as the probe cells schedule their keystrokes (./probe-plan.mjs).
import {SCENES} from '../repl-parity/scenes-mac.mjs';
import {sha256Hex} from './matrix-text.mjs';
import {userWindowOf} from './oracle.mjs';
import {emptyFieldCell, fieldCheckCell, intervalOf, nextPreMs, postValidity, PRE_MS, PROBE_ATTEMPTS, PROBE_LEAD_MS, probeProblem, EMPTY_HASH, scheduledActCell} from './probe-plan.mjs';
import {exclusionOf} from './not-judged.mjs';
import {ownerInputCause, ownerInputNow, readOnlyMarks, venueInputCause, venueInputMarks} from './owner-input.mjs';
import {INPUT_WRITES_HOSTED_ONLY} from './hitoolbox.mjs';
import {activate, activationOf, AlertGuarded, AlertHeld, alertCheck, caseRow, device, errorNameOf, focusOf, js, keyReading, keyWindowScene, mark, notActivated, push, quiet, read, readKey, sendKeys, Stop, userWindowSeen} from './steps.mjs';
import {ABC, COMPOSITION, CONDITIONS, INPUT_SOURCE_CHANGED, KOREAN_2SET, UNICODE_USERS, unicodeCase, unicodeRowsOf} from './unicode-plan.mjs';

const j = JSON.stringify;
// A reading that follows an action asynchronously (a web view's value after a key, an app's input source after its
// activation) is taken up to this many times, this far apart, before its condition is said not to have held.
export const SETTLE_READS = 4, SETTLE_READ_MS = 250;

// The section: every row of `plan` ({fields, conditions}), as read; the judge applies any declared departure (./departures.mjs).
export async function unicodeSection(ctx, plan) {
  const rows = unicodeRowsOf(plan);
  const first = ctx.rows.length;
  ctx.meta.unicode = {readings: []};
  try {
    for (const condition of CONDITIONS) {
      const mine = rows.filter(r => r.condition === condition);
      if (!mine.length) continue;
      const source = ['korean', 'composing'].includes(condition) ? KOREAN_2SET : ABC;
      const venue = venueInputCause(ctx.venueMissing, SELECTS[condition]);
      for (const field of plan.fields) {
        const ofField = mine.filter(r => r.field === field);
        if (!ofField.length) continue;
        await ctx.checkpoint();
        if (venue) { for (const r of ofField) push(ctx, {...rowBase(ctx, r), ...venueInputMarks(venue)}); continue; }
        // Off a hosted runner the owner's values are read again at each field: they may have changed since the last.
        if (ctx.ownerInput) ownerInputNow(ctx, device(ctx, ['source', 'state']), `unicode ${condition}:${field}`);
        const owned = ctx.ownerInput ? ownerInputCause(ctx.ownerInput, OWNER_NEEDS[condition], ctx.venueReadOnly) : null;
        const unset = condition !== 'perContext' && ctx.perContextOff !== true
          ? 'the per-context preference did not read off: a source selected now says nothing about the one each target reads' : null;
        if (owned) { for (const r of ofField) push(ctx, {...rowBase(ctx, r), ...readOnlyMarks(ctx, owned)}); continue; }
        if (unset) { for (const r of ofField) invalidRow(ctx, r, unset); continue; }
        if (condition === 'latin' || condition === 'korean') await frontmostRows(ctx, field, ofField, source);
        else if (condition === 'midSwitch') await midSwitchRow(ctx, ofField[0]);
        else if (condition === 'composing') await composingRows(ctx, field, ofField);
        else await perContextRows(ctx, field, ofField);
      }
    }
  } finally {
    // A condition ruled out of the judged matrix still runs; its rows are reported with the cause (ruling 1119), also
    // when the section stopped part-way.
    for (const row of ctx.rows.slice(first)) { const cause = exclusionOf(row); if (cause) row.excluded = cause; }
  }
}

// What each condition needs of the owner's input source and per-context preference off a hosted runner, where
// nothing switches them (ruling 1188, ./owner-input.mjs): the Latin and Korean conditions run under the owner's source
// when it is theirs with the preference off; the others switch a source during the row, so they never run there.
export const OWNER_NEEDS = Object.freeze({
  latin: {source: ABC, perContext: false},
  korean: {source: KOREAN_2SET, perContext: false},
  midSwitch: {perContext: false, switch: `the input source switched to ${KOREAN_2SET} during its typing`},
  composing: {perContext: false, switch: `${ABC}, then ${KOREAN_2SET}, selected with the user window in front`},
  perContext: {perContext: true, switch: `${KOREAN_2SET} selected with the driven scene in front and ${ABC} with the user window in front`},
});

// The sources each condition selects: one the runner's setup could not enable leaves its rows NO VERDICT `venue`
// (ruling 1189), never run under the US layout.
export const SELECTS = Object.freeze({latin: [ABC], korean: [KOREAN_2SET], midSwitch: [ABC, KOREAN_2SET], composing: [ABC, KOREAN_2SET], perContext: [ABC, KOREAN_2SET]});

// A source selected through the probe and read back, with the keyboard layout read beside it; off a hosted runner, or
// one the venue could not enable, never selected (it does not hold). -> whether it holds.
function useSource(ctx, id, when) {
  if (ctx.venueMissing?.includes(id)) { ctx.meta.unicode.readings.push({when, select: id, held: false, refused: 'not enabled on this runner (ruling 1189)'}); return false; }
  if (ctx.ownerInput) { ctx.meta.unicode.readings.push({when, select: id, held: false, refused: ctx.venueReadOnly ?? 'not selected off a hosted runner (ruling 1188)'}); return false; }
  const out = device(ctx, ['source', 'select', '--source', id]);
  const held = out?.selected === true && out.current === id;
  ctx.meta.unicode.readings.push({when, select: id, held, layout: out?.layout ?? null});
  return held;
}
// The source the scene now in front reads, established there: read, selected when it reads another, read back.
// -> {held, read: the source read first}.
function establishSource(ctx, id, when) {
  const out = device(ctx, ['source', 'current']);
  const current = out?.current ?? null;
  if (current !== id) return {held: useSource(ctx, id, when), read: current};
  ctx.meta.unicode.readings.push({when, current, held: true, layout: out?.layout ?? null});
  return {held: true, read: current};
}
const sourceName = id => (id === ABC ? 'Latin' : 'Korean');
const notHeld = (id, scene) => `the ${sourceName(id)} source did not hold with ${scene} in front`;

// The layout 2-Set's input method translates keys with once it has engaged in the focused client.
export const HANGUL_LAYOUT = 'com.apple.keylayout.2SetHangul';
// The scene each Unicode target is refocused through: its user window's, another text scene the run brings up with it.
export const REFOCUS_THROUGH = UNICODE_USERS;
// The Korean source established in `target`, in front: selected (or read) there, then the target refocused (another of
// the run's scenes brought forward, then the target again) and only then read. A 2-Set selection made while a field
// already holds focus reads back as the current source while the keyboard layout stays the previous one, the focused
// client's input method never engaging and keys arriving raw (MAWS B2); a switch the client sees on its focus does
// engage. So Korean counts only when the reading after the refocus shows 2-Set as the source and its own layout. The
// reading before the refocus is kept beside it (`pre-refocus`), never judged. -> null when it holds, else {why,
// mismatch}: `mismatch` ({needed, read, text}) when a reading, before or after the refocus, was another source (off a
// hosted runner, where nothing is selected, the owner's switch), null when the cause was something else (an
// activation, the layout).
const mismatchOf = (needed, read, where) => ({needed, read, text: `the source read ${read ?? 'nothing'} ${where}`});
function koreanIn(ctx, target, when) {
  const pre = establishSource(ctx, KOREAN_2SET, `${when} pre-refocus`);
  if (!pre.held) return {why: notHeld(KOREAN_2SET, target), mismatch: mismatchOf(KOREAN_2SET, pre.read, `with ${target} in front`)};
  const other = [REFOCUS_THROUGH[target], ...Object.keys(ctx.records)].find(scene => scene && scene !== target && ctx.records[scene]);
  const away = other ? activate(ctx, other) : null;
  const back = away?.ok ? activate(ctx, target) : null;
  if (!back?.ok) return {why: `${target} could not be refocused after the Korean source was selected (${!other ? 'no other scene is up' : !away?.ok ? `${other} did not come to the front` : `${target} did not come back to the front`})`, mismatch: null};
  const out = device(ctx, ['source', 'current']);
  const current = out?.current ?? null, layout = out?.layout ?? null;
  const held = current === KOREAN_2SET && layout === HANGUL_LAYOUT;
  ctx.meta.unicode.readings.push({when: `${when} post-refocus`, current, layout, held});
  return held ? null : {why: `the Korean source did not engage in ${target} after its refocus: the source read ${current ?? 'nothing'}, the layout ${layout ?? 'nothing'}`,
    mismatch: current === KOREAN_2SET ? null : mismatchOf(KOREAN_2SET, current, `in ${target} after its refocus`)};
}
const rowBase = (ctx, r) => ({section: 'unicode', id: r.id, engine: ctx.engine, sample: ctx.n, ok: false, scene: r.field, target: r.field, regime: r.regime, method: r.method,
  case: r.string.id, expect: 'outcome', condition: r.condition, ...(r.user ? {user: r.user} : {})});
// `focus`, given when the focus probe's reading was the precondition that failed, is recorded and never judged.
const invalidRow = (ctx, r, reason, focus, seen) => push(ctx, {...rowBase(ctx, r), invalid: reason, ...(focus === undefined ? {} : {focus}), ...(seen ? {userWindowSeen: seen} : {})});
const options = r => ({section: 'unicode', id: r.id, extra: {condition: r.condition}});

// The Latin or Korean source: the field's scene in front reading it, each row a frontmost case.
async function frontmostRows(ctx, field, rows, source) {
  await quiet(ctx, field);
  const front = activate(ctx, field);
  const skipped = notActivated(ctx, field);
  if (skipped) { for (const r of rows) push(ctx, {...rowBase(ctx, r), frontKey: skipped}); return; }
  if (!front?.ok) { for (const r of rows) invalidRow(ctx, r, `${field} did not come to the front (${front?.reason ?? 'no answer'})`); return; }
  const when = `${rows[0].condition}:${field}`;
  let failed = null;
  if (source === KOREAN_2SET) failed = koreanIn(ctx, field, when);
  else { const latin = establishSource(ctx, source, when); if (!latin.held) failed = {why: notHeld(source, field), mismatch: mismatchOf(source, latin.read, `with ${field} in front`)}; }
  // Off a hosted runner nothing was selected: another source read, before or after a refocus, is the owner's switch.
  if (failed?.mismatch && ctx.ownerInput) {
    const cause = `${ctx.venueReadOnly ?? INPUT_WRITES_HOSTED_ONLY}; the row needs the input source ${source}, and ${failed.mismatch.text}`;
    for (const r of rows) push(ctx, {...rowBase(ctx, r), ...readOnlyMarks(ctx, cause)});
    return;
  }
  if (failed) { for (const r of rows) invalidRow(ctx, r, failed.why); return; }
  for (const r of rows) await caseRow(ctx, field, 'frontmost', unicodeCase(r), options(r));
}

// The user window in front with its field emptied and focused, read back empty by the focus probe; the driven field
// focused first while its scene was in front of its own app. Before the user's field is emptied, the Latin source is
// selected with it in front, which ends a composition its input method may still hold from an earlier row (the Korean
// condition's `r k` leaves 가 composing, the keys going through the input method in every scene (ruling 1119); an earlier group's
// composition stays in its user window): emptying the field does not end it, and the probe's r would then compose onto
// it (각, ㄲ) rather than start ㄱ. Then the Korean source is established in the user window (koreanIn, whose refocus
// also ends a composition that selection did not reach, the switch being made with the field focused as in MAWS B2),
// and only then is its field emptied, so nothing an earlier row left composes onto the probe's key. A composition still
// open after all that shows as a field not reading exactly the jamo: the rows are invalid, never counted.
// The user window's emptying is instrumented into `at` (ruling 1229, emptyFieldAt).
// -> {userWindow}, {skipped: readings} (the user window's activation did not take front and key), {held: the alert
// guard's row mark} or {invalid}.
async function behindUser(ctx, field, user, at) {
  await quiet(ctx, field);
  await quiet(ctx, user);
  try { return await behindUserPrepared(ctx, field, user, at); } catch (error) {
    // A field's focus click the alert guard refused (./steps.mjs AlertGuarded): no row of the group was sent.
    if (!(error instanceof AlertGuarded)) throw error;
    return {held: error.row};
  }
}
async function behindUserPrepared(ctx, field, user, at) {
  const driven = await js(ctx, 'harness', `unicode:prepare:${field}`, emptyFieldCell(field));
  if (!driven.ok || !driven.value?.ready) return {invalid: `the field was not prepared (${driven.error ?? driven.value?.reason ?? 'no reason'})`};
  const front = activate(ctx, user);
  const skipped = notActivated(ctx, user, [SCENES[field].bundleId, SCENES[user].bundleId]);
  if (skipped) return {skipped};
  if (!front?.ok) return {invalid: `the user window (${user}) did not come to the front`, userWindowSeen: userWindowSeen(ctx, user, front, null)};
  if (!useSource(ctx, ABC, `composing@${user}:end`)) return {invalid: `${notHeld(ABC, user)}: a composition left in the user window could not be ended`};
  const korean = koreanIn(ctx, user, `composing@${user}`);
  if (korean) return {invalid: `no composition in progress: ${korean.why}`};
  const prepared = await emptyFieldAt(ctx, user, at);
  if (!prepared.ok || !prepared.value?.ready) return {invalid: `the user window's field was not prepared (${prepared.error ?? prepared.value?.reason ?? 'no reason'})`};
  const r0 = read(ctx, null, {frontKey: true});
  const userWindow = userWindowOf(r0.reading, ctx.records[user].pid);
  if (!userWindow) return {invalid: `the user window (${user}) was not in front`, userWindowSeen: userWindowSeen(ctx, user, front, r0)};
  const f0 = read(ctx, focusOf(userWindow));
  if (f0.focus?.named !== true || f0.focus.valueHash !== EMPTY_HASH) return {invalid: 'the focus probe did not read the user window\'s field focused and empty', focus: f0.focus ?? null};
  return {userWindow};
}

// What the user window's field read after the composition's key, told by its hash (pilot C-2's composing@textedit rows
// said only that the jamo was not read).
const COMPOSED_READ = Object.freeze({jamo: 'it read the composed jamo', 'raw key': 'it read the probe\'s raw key, uncomposed',
  empty: 'it read empty', unread: 'the focus probe read no value', other: 'it read other text'});
function composedRead(hash) {
  if (hash === null) return 'unread';
  return {[sha256Hex(COMPOSITION.composed)]: 'jamo', [sha256Hex(COMPOSITION.key)]: 'raw key', [EMPTY_HASH]: 'empty'}[hash] ?? 'other';
}

// A Hangul composition in progress in the user window (the probe's ANSI r under the Korean source, established with the
// user window in front), read back by the
// focus probe as the composed jamo; then the rows behind it, each also requiring the user's field to keep that value.
// After a row disturbed it, the rest say nothing about the composition: invalid.
//
// Ruling 1229: a composition check that reads anything but the jamo (the probe having posted) redoes the group's setup
// and re-posts, up to COMPOSING_ATTEMPTS attempts in all. Each attempt is its own record on the readings (composingAttempt),
// naming the lane's engine and the path that emptied the field (the harness's or, failing that, the engine's; ruling
// 1229(b), emptyFieldAt); a group composed on a later attempt runs and
// counts normally, its rows carrying the attempt's number (`composingAttempt`); one still not composed after the last
// stays invalid, every attempt on each of its rows (`composing`), as is any row a setup failure left invalid.
export const COMPOSING_ATTEMPTS = 3;
async function composingRows(ctx, field, rows) {
  const {user} = rows[0];
  const records = [];
  const invalid = (r, reason, extra = {}) => push(ctx, {...rowBase(ctx, r), invalid: reason, ...extra, composing: records});
  for (let n = 1; ; n++) {
    if (n > 1) await ctx.checkpoint();
    const out = await composingAttempt(ctx, field, user, n);
    records.push(out.record);
    ctx.meta.unicode.readings.push(out.record);
    const earlier = n > 1 ? {composing: records} : {};
    if (out.skipped) { for (const r of rows) push(ctx, {...rowBase(ctx, r), frontKey: out.skipped, ...earlier}); return; }
    if (out.held) { for (const r of rows) push(ctx, {...rowBase(ctx, r), ...out.held, ...earlier}); return; }
    if (out.invalid) { for (const r of rows) invalid(r, out.invalid, {...(out.focus === undefined ? {} : {focus: out.focus}), ...(out.userWindowSeen ? {userWindowSeen: out.userWindowSeen} : {})}); return; }
    if (out.retry && n < COMPOSING_ATTEMPTS) continue;
    if (out.problem) { for (const r of rows) invalid(r, `no composition in progress: ${out.problem}${n > 1 ? `; ${n} attempts` : ''}`); return; }
    let disturbed = false;
    for (const r of rows) {
      if (disturbed) { invalidRow(ctx, r, 'an earlier row disturbed the user window\'s composition').composingAttempt = n; continue; }
      const row = await caseRow(ctx, field, 'background', unicodeCase(r), {...options(r), extra: {condition: r.condition, composingAttempt: n}, user, userWindow: out.userWindow, userValue: out.composed});
      if (!row.invalid && row.outcome?.userKept === false) disturbed = true;
    }
    return;
  }
}
// One attempt: the group's setup (behindUser) and the probe's key, read back. Its record (ruling 1229, G1), with no
// characters in it: emptyField's `prepared` (which of its setValue("") and click it made: emptied, clicked, both or
// neither), the path that emptied the field (`emptiedBy`, with the harness's write as `harnessEmpty`; ruling 1229(b),
// emptyFieldAt), whether marked text was open in the user window's field just before and just after it (markedAtEmpty),
// the probe's post (`probe`: its time, units, layout and mode), and after the key the source as read and the focused
// element (`afterKey`: its role, character count, selected and marked ranges, and whether it is the field emptyField
// prepared). -> {record, ...behindUser's answer} | {record, problem, retry?, composed, userWindow}.
async function composingAttempt(ctx, field, user, attempt) {
  const at = {};
  const setup = await behindUser(ctx, field, user, at);
  const record = {when: `composing@${user}`, group: `${field}@${user}`, attempt, engine: ctx.engine, prepared: at.prepared ?? null, markedAtEmpty: at.markedAtEmpty ?? null,
    ...(at.harnessEmpty ? {emptiedBy: at.emptiedBy ?? null, fallback: at.fallback ?? null, harnessEmpty: at.harnessEmpty} : {})};
  if (setup.skipped || setup.held || setup.invalid) return {...setup, record: {...record, setup: setup.invalid ?? (setup.held ? 'the alert guard held the setup' : 'the user window did not take front and key')}};
  const {userWindow} = setup;
  const started = device(ctx, ['probe', 'keystroke', '--window', focusOf(userWindow), '--text', COMPOSITION.key, '--mode', 'ansiKeys', '--lead', '1500']);
  const finished = device(ctx, ['probe', 'finish']);
  ctx.posted[user] = ctx.now();
  // Read until the field shows the jamo, a few times: a web view's accessibility value follows its DOM asynchronously.
  const jamo = sha256Hex(COMPOSITION.composed);
  let composed = null, reads = 0;
  for (; reads < SETTLE_READS && composed !== jamo; reads++) {
    if (reads) await ctx.sleep(SETTLE_READ_MS);
    composed = read(ctx, focusOf(userWindow)).focus?.valueHash ?? null;
  }
  const got = composedRead(composed);
  const source = device(ctx, ['source', 'current']);
  const afterKey = {source: {current: source?.current ?? null, layout: source?.layout ?? null}, focused: focusedRecord(focusedTextOf(ctx, user), at.field)};
  const postProblem = probeProblem(finished?.answer);
  const missed = composed === jamo ? null : `the user window's field did not read the composed jamo after the probe's key (${COMPOSED_READ[got]})`;
  const problem = postProblem ?? missed;
  Object.assign(record, {scheduled: started?.scheduled ?? null, posted: !postProblem, probe: probeRecord(finished?.answer), composed: composed === jamo, read: got, reads, afterKey,
    ...(problem ? {failed: problem} : {})});
  return {record, problem, retry: !postProblem && missed !== null, composed, userWindow};
}

// The user window's field emptied on a neutral path (ruling 1229(b)): the harness's own Accessibility write
// (./matrix-device.mjs field-empty, ./panel-ax.swift empty: the field's AXValue written "" and read back), the same on
// both lanes and never the engine under test, whose setValue("") the failed vendor attempts of 46052931439 had followed.
// Then the engine's emptyField with its steps, the one cell it was: it finds the field empty and only gives it the
// focus; where the harness's write did not read back empty (a web view refusing it, or off a hosted runner), it empties
// the field itself, as before 1229(b), for that attempt. Each attempt records only what it established: the harness's
// answer (`harnessEmpty`) the moment it comes, so a guard that then holds the engine's cell leaves it on the attempt;
// whether the engine's own emptying was tried (`fallback`: its cell's setValue made, false when its cell made none, null
// when the cell gave no account of its steps); and the path that confirmed the field empty, the last write before the
// probe's key (`emptiedBy`): the engine when its setValue was made and its cell answered the field ready, the harness when
// its write read back empty and the engine wrote nothing after it, else null (neither confirmed it, the field perhaps
// empty already). The harness's own no-text reader reads just before the write
// and just after the cell, so the read after is the emptying's alone unless `prepared` names the cell's click too.
// The prepared field is the element read after a cell that answered ready (emptyField found its field focused): each
// side's `samePrepared` is its element's identity against it (sameAs), null when the cell was not ready or a frame was
// not read. -> the cell's answer; `at` holds {harnessEmpty, emptiedBy, fallback, prepared, markedAtEmpty: {before, after},
// field: the prepared field's read or null}.
async function emptyFieldAt(ctx, user, at) {
  const before = focusedTextOf(ctx, user);
  const harnessEmpty = harnessEmptyOf(ctx, user);
  const byHarness = harnessEmpty.emptied === true;
  Object.assign(at, {harnessEmpty, emptiedBy: byHarness ? 'harness' : null, fallback: null});
  const out = await js(ctx, 'harness', `unicode:prepare:${user}`, emptyFieldCell(user, {steps: true}));
  const after = focusedTextOf(ctx, user);
  const did = out.ok ? out.value?.did ?? null : null;
  const ready = out.ok && out.value?.ready === true;
  const fallback = did ? did.setValue === true : null;
  const field = ready && after.frame ? after : null;
  Object.assign(at, {prepared: !did ? null : did.setValue && did.click ? 'both' : did.setValue ? 'emptied' : did.click ? 'clicked' : 'neither',
    emptiedBy: fallback ? (ready ? 'engine' : null) : byHarness ? 'harness' : null, fallback,
    markedAtEmpty: {before: markedSide(before, field), after: markedSide(after, field)}, field});
  return out;
}
// The harness's write, a command that threw recorded and never the run's stop. -> its answer | {emptied: false, reason}.
function harnessEmptyOf(ctx, scene) {
  try { return device(ctx, ['field-empty', '--scene', scene]) ?? {emptied: false, reason: 'no answer'}; } catch (error) {
    if (error instanceof Stop) throw error;
    return {emptied: false, reason: String(error?.message ?? error).slice(0, 160)};
  }
}
// One read around emptyField: its marked range and its element's identity against the prepared field, a failed read's
// reason (a read that failed whole) or the reads it names failed with their AXErrors kept.
function markedSide(now, field) {
  if (now.role === undefined) return {ok: false, reason: now.reason ?? 'no answer', samePrepared: null};
  return {ok: now.ok === true, marked: now.marked ?? null, samePrepared: sameAs(now, field), ...failures(now)};
}
const failures = now => (now.failed?.length ? {failed: now.failed, errors: now.errors ?? {}} : {});
// The harness's own read of `scene`'s focused text element (./matrix-device.mjs focusedText; the reads #590's read-back
// uses), a read that threw recorded and never the run's stop. -> its answer | {ok: false, reason}.
function focusedTextOf(ctx, scene) {
  try { return device(ctx, ['focused-text', '--scene', scene]) ?? {ok: false, reason: 'no answer'}; } catch (error) {
    if (error instanceof Stop) throw error;
    return {ok: false, reason: String(error?.message ?? error).slice(0, 160)};
  }
}
// Whether a read's element is the prepared field: its role and frame those read after emptyField; null when either
// frame was not read.
const sameFrame = (a, b) => ['x', 'y', 'width', 'height'].every(k => a[k] === b[k]);
const sameAs = (now, field) => (now.frame && field?.frame ? now.role === field.role && sameFrame(now.frame, field.frame) : null);
// The focused element after the key: role, counts and ranges, whether it is the prepared field, and the reads that
// failed.
function focusedRecord(now, field) {
  if (now.role === undefined) return {ok: false, reason: now.reason ?? 'no answer'};
  return {ok: now.ok === true, role: now.role ?? null, characters: now.characters ?? null, selected: now.selected ?? null, marked: now.marked ?? null, samePrepared: sameAs(now, field), ...failures(now)};
}
// The keystroke probe's answer without its keys' characters (its presses' and key specs'): when it posted, how many
// units, under which layout and mode, and whether it stopped part-way.
const probeRecord = a => (a && typeof a === 'object'
  ? {postedAt: a.postedAt ?? null, units: a.units ?? null, layout: a.layout ?? null, mode: a.mode ?? null, ...(a.aborted ? {aborted: true} : {})} : null);

// The per-context preference's write failing on the device: the one setup failure the condition recovers from.
export class PerContextWriteFailed extends Error {}
// The preference written on through the device command, its failure marked as PerContextWriteFailed; a Stop passes
// through unmarked. -> whether the preference then read on.
function writePerContextOn(ctx) {
  try { return device(ctx, ['source', 'per-context', '--value', 'on'])?.perContext === true; } catch (error) {
    if (error instanceof Stop) throw error;
    throw new PerContextWriteFailed(String(error?.message ?? error).slice(0, 200));
  }
}

// The per-context preference on, the driven scene's context holding the Korean source (selected while it was in front),
// the user window in front under the Latin source; the rows behind it; then the driven scene brought back to the front,
// where its context must still read Korean. Without those readings the rows say nothing: invalid. Held or not, the rows
// are out of every verdict (ruling 1119, #185; unicodeSection marks them `excluded`): they run and report what they read.
// One setup failure is this condition's alone: the preference's write refused or failing on the device
// (PerContextWriteFailed). Its rows are invalid with the error and the run goes on, since the input sections' restore
// puts the preference back and verifies it, and an unconfirmed restore still leaves the run incomplete. Every other
// throw propagates: a run-wide stop (Stop), and the lane's integrity failures (an answer attested by another engine, a
// cell without its device-clock window, ./lane.mjs), after which no request may be issued.
async function perContextRows(ctx, field, rows) {
  const {user} = rows[0];
  await quiet(ctx, field);
  await quiet(ctx, user);
  let on;
  try { on = writePerContextOn(ctx); } catch (error) {
    if (!(error instanceof PerContextWriteFailed)) throw error;
    ctx.meta.unicode.readings.push({when: `perContext:${field}@${user}`, setupError: error.message});
    for (const r of rows) invalidRow(ctx, r, `the per-context setup failed: ${error.message}`);
    return;
  }
  const front = activate(ctx, field);
  let driven;
  try { driven = front?.ok ? await js(ctx, 'harness', `unicode:prepare:${field}`, emptyFieldCell(field)) : null; } catch (error) {
    if (!(error instanceof AlertGuarded)) throw error;
    for (const r of rows) push(ctx, {...rowBase(ctx, r), ...error.row});
    return;
  }
  const engaged = driven?.ok === true && driven.value?.ready === true ? koreanIn(ctx, field, `perContext:${field}`) : {why: 'the driven field was not prepared'};
  const korean = engaged === null;
  const userFront = activate(ctx, user);
  const latin = userFront?.ok === true && useSource(ctx, ABC, `perContext@${user}`);
  const userWindow = latin ? userWindowOf(read(ctx).reading, ctx.records[user].pid) : null;
  const before = !on ? 'the per-context preference did not read on' : !korean ? `the driven scene's Korean source was not established while it was in front: ${engaged.why}`
    : !latin ? 'the Latin source was not selected with the user window in front' : !userWindow ? `the user window (${user}) was not in front` : null;
  if (before) { for (const r of rows) invalidRow(ctx, r, before); return; }
  const done = [];
  for (const r of rows) done.push(await caseRow(ctx, field, 'background', unicodeCase(r), {...options(r), user, userWindow}));
  // The context's source follows the activation: read a few times before it says the condition did not hold.
  const back = activate(ctx, field);
  let held = false, reads = 0, after = null;
  for (; back?.ok === true && reads < SETTLE_READS && !held; reads++) {
    if (reads) await ctx.sleep(SETTLE_READ_MS);
    after = device(ctx, ['source', 'current']);
    held = after?.current === KOREAN_2SET && after?.layout === HANGUL_LAYOUT;
  }
  ctx.meta.unicode.readings.push({when: `perContext:${field}@${user}`, perContext: on, drivenKorean: korean, userLatin: latin, heldAfter: held, reads,
    current: after?.current ?? null, layout: after?.layout ?? null});
  const readBack = `the source read ${after?.current ?? 'nothing'}, the layout ${after?.layout ?? 'nothing'}`;
  // Pilot C-2 and the mini alike read the preference on and the context ABC after its reactivation: a context that does
  // not hold is the venue's, never a sample against an engine (NO VERDICT `venue`). A scene that did not come back to the
  // front read nothing: invalid.
  const marks = back?.ok === true
    ? venueInputMarks(`the per-context preference read on, but the driven scene's context did not read Korean after its reactivation (${readBack}, ${reads} reads): the condition did not hold on this venue (#577: the scene apps launch before the per-context preference is written)`)
    : {ok: false, invalid: 'the driven scene was not brought back to the front to read its context: the condition is not shown to have held'};
  if (!held) for (const row of done) if (!row.invalid) Object.assign(row, marks);
}

// The mid-switch row: the Latin source, the field's scene in front, a long keyed typeText, and the probe's switch to
// Korean scheduled inside it. It must stop with inputSourceChanged (its sentence in the message), entering exactly what the field then holds (its
// hash against the text's first `cua/entered` units), the sentence's own count the same (`judgeMidSwitch`). The Latin
// source is selected again after it. Its front/key readings (./front-key.mjs) are the field scene's activation, the
// reading the key guard takes before the act and one after its check; an activation that did not take front and key
// sends nothing.
async function midSwitchRow(ctx, r) {
  const field = r.field;
  await quiet(ctx, field);
  const front = activate(ctx, field);
  const skipped = notActivated(ctx, field);
  if (skipped) return push(ctx, {...rowBase(ctx, r), frontKey: skipped});
  if (!front?.ok) return invalidRow(ctx, r, `${field} did not come to the front`);
  if (!establishSource(ctx, ABC, `midSwitch:${field}`).held) return invalidRow(ctx, r, notHeld(ABC, field));
  const retries = [];
  let preMs = PRE_MS.textedit;
  for (let n = 1; n <= PROBE_ATTEMPTS; n++) {
    await ctx.checkpoint();
    const out = await midSwitchAttempt(ctx, r, {preMs, key: `row:${ctx.rows.length}:${n}`});
    const latin = useSource(ctx, ABC, `after ${r.id}`);
    if (out.retry && n < PROBE_ATTEMPTS && latin) { retries.push(out.row.invalid); preMs = out.preMs; continue; }
    return push(ctx, {...rowBase(ctx, r), ...out.row, attempts: n, ...(retries.length ? {outcome: {...(out.row.outcome ?? {}), retries}} : {}),
      ...(latin ? {} : {error: 'the Latin source was not selected again after the switch'})});
  }
  return null;
}
// The mid-switch row's judgement (#186): stopped by the engine's inputSourceChanged sentence, and the field's committed
// prefix (`field`: its length and hash, read back in the cell) equal to the text's first `entered` units (the meta's
// count, `exact`) and to the count the sentence itself names, "after N of M" with M the request's own length
// (`sentenceAgrees`): the number a model resumes from is the one it reads.
// -> {stopped, exact, sentenceEntered, sentenceAgrees, ok}.
export function judgeMidSwitch({threw, message, entered, field, text}) {
  const said = threw === true ? INPUT_SOURCE_CHANGED.exec(message ?? '') : null;
  const sentenceEntered = said ? Number(said[1]) : null;
  const prefixOf = n => Number.isInteger(n) && field?.length === n && field?.hash === sha256Hex(text.slice(0, n));
  const exact = prefixOf(entered);
  const sentenceAgrees = said !== null && Number(said[2]) === text.length && prefixOf(sentenceEntered);
  return {stopped: said !== null, exact, sentenceEntered, sentenceAgrees, ok: said !== null && exact && sentenceAgrees};
}
async function midSwitchAttempt(ctx, r, {preMs, key}) {
  const field = r.field;
  let from = null, to = null;
  const span = x => { if (x?.at) { from ??= x.at[0]; to = x.at[1]; } return x; };
  const end = (row, extra = {}) => { if (from !== null) mark(ctx, 'row', key, [from, to]); return {row, ...extra}; };
  let prepared;
  try { prepared = span(await ctx.lane.js(emptyFieldCell(field))); } catch (error) {
    if (!(error instanceof AlertGuarded)) throw error;
    return end({...error.row});
  }
  if (!prepared.ok || !prepared.value?.ready) return end({invalid: `not prepared: ${prepared.error ?? prepared.value?.reason ?? 'no reason'}`});
  alertCheck(ctx, `before ${r.id}`);
  const started = device(ctx, ['probe', 'input-source', '--source', KOREAN_2SET, '--lead', String(PROBE_LEAD_MS)]);
  let act = null, finished = null, before = null, held = null;
  try {
    before = read(ctx, null, {frontKey: true, keyWindow: keyWindowScene(ctx, field)});
    act = span(await sendKeys(ctx, scheduledActCell(field, {at: started.scheduled - preMs, act: `await __app.typeText(${j(r.string.text)});`, tag: 'unicode.midSwitch'}),
      ['typeText'], {scene: field, front: before, kind: 'row', key}));
  } catch (error) {
    if (!(error instanceof AlertHeld)) throw error;
    held = error;
  } finally { finished = device(ctx, ['probe', 'finish']); }
  if (held) {
    // The capture alert in front at the guard (ruling 1141): the typing unsent, the readings the row's (NO VERDICT).
    const app = SCENES[field].bundleId;
    return end({...held.row, frontKey: {apps: [app], activate: activationOf(ctx, app), before: held.reading, after: keyReading(span(read(ctx, null, {frontKey: true})))}});
  }
  if (!act) return end({invalid: 'the key guard did not send the action'});
  alertCheck(ctx, `after ${r.id}`);
  if (!act.ok) return end({invalid: 'the act cell failed', error: act.error});
  const check = span(await ctx.lane.js(fieldCheckCell(field, null, 'unicode.midSwitch.check')));
  const app = SCENES[field].bundleId, frontKey = {apps: [app], activate: activationOf(ctx, app), before: keyReading(before), after: readKey(ctx)};
  const entered = act.engine?.entered ?? null, switchedAt = finished?.answer?.selectedAt;
  const interval = intervalOf(ctx.engine, act);
  const {ok, stopped, exact, sentenceEntered, sentenceAgrees} = judgeMidSwitch({threw: act.value.threw, message: act.value.message, entered, field: check.value, text: r.string.text});
  const row = {ok, inCellMs: act.value.actMs, wallMs: act.wallMs, inputRoute: act.route, frontKey,
    outcome: {stopped, errorName: errorNameOf(act), message: act.value.message ?? null, entered, sentenceEntered, sentenceAgrees, length: check.value?.length ?? null, hash: check.value?.hash ?? null, exact,
      intervalSource: interval?.source ?? null, switchOffsetMs: interval && Number.isFinite(switchedAt) ? switchedAt - interval.from : null}};
  const why = probeProblem(finished?.answer) ?? postValidity(switchedAt, interval)?.replace('the probe posted', 'the probe switched');
  if (why) return end({...row, ok: false, invalid: why}, {retry: true, preMs: nextPreMs({callAt: act.value.callAt, interval, postedAt: switchedAt, scheduled: started.scheduled, preMs})});
  return end(row);
}
