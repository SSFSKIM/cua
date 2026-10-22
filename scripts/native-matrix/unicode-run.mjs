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
import {sha256Hex} from './matrix-text.mjs';
import {userWindowOf} from './oracle.mjs';
import {emptyFieldCell, fieldCheckCell, intervalOf, nextPreMs, postValidity, PRE_MS, PROBE_ATTEMPTS, PROBE_LEAD_MS, probeProblem, EMPTY_HASH, scheduledActCell} from './probe-plan.mjs';
import {activate, alertCheck, caseRow, device, focusOf, js, mark, push, quiet, read, sendKeys} from './steps.mjs';
import {ABC, applyDeclarations, COMPOSITION, CONDITIONS, INPUT_SOURCE_CHANGED, KOREAN_2SET, readDeclarations, UNICODE_USERS, unicodeCase, unicodeRowsOf} from './unicode-plan.mjs';

const j = JSON.stringify;
// A reading that follows an action asynchronously (a web view's value after a key, an app's input source after its
// activation) is taken up to this many times, this far apart, before its condition is said not to have held.
export const SETTLE_READS = 4, SETTLE_READ_MS = 250;

// The section: every row of `plan` ({fields, conditions}), then the expected file's declarations applied to them.
export async function unicodeSection(ctx, plan) {
  const rows = unicodeRowsOf(plan);
  const first = ctx.rows.length;
  ctx.meta.unicode = {readings: []};
  for (const condition of CONDITIONS) {
    const mine = rows.filter(r => r.condition === condition);
    if (!mine.length) continue;
    const source = ['korean', 'composing'].includes(condition) ? KOREAN_2SET : ABC;
    const unset = condition !== 'perContext' && ctx.perContextOff !== true
      ? 'the per-context preference did not read off: a source selected now says nothing about the one each target reads' : null;
    for (const field of plan.fields) {
      const ofField = mine.filter(r => r.field === field);
      if (!ofField.length) continue;
      await ctx.checkpoint();
      if (unset) { for (const r of ofField) invalidRow(ctx, r, unset); continue; }
      if (condition === 'latin' || condition === 'korean') await frontmostRows(ctx, field, ofField, source);
      else if (condition === 'midSwitch') await midSwitchRow(ctx, ofField[0]);
      else if (condition === 'composing') await composingRows(ctx, field, ofField);
      else await perContextRows(ctx, field, ofField);
    }
  }
  const {unused} = applyDeclarations(ctx.rows.slice(first), readDeclarations());
  ctx.meta.unicode.unusedDeclarations = unused.map(({id, engine}) => ({id, engine}));
}

// A source selected through the probe and read back, with the keyboard layout read beside it. -> whether it holds.
function useSource(ctx, id, when) {
  const out = device(ctx, ['source', 'select', '--source', id]);
  const held = out?.selected === true && out.current === id;
  ctx.meta.unicode.readings.push({when, select: id, held, layout: out?.layout ?? null});
  return held;
}
// The source the scene now in front reads, established there: read, selected when it reads another, read back.
// -> whether it holds.
function establishSource(ctx, id, when) {
  const out = device(ctx, ['source', 'current']);
  const current = out?.current ?? null;
  if (current !== id) return useSource(ctx, id, when);
  ctx.meta.unicode.readings.push({when, current, held: true, layout: out?.layout ?? null});
  return true;
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
// reading before the refocus is kept beside it (`pre-refocus`), never judged. -> null when it holds, else why not.
function koreanIn(ctx, target, when) {
  if (!establishSource(ctx, KOREAN_2SET, `${when} pre-refocus`)) return notHeld(KOREAN_2SET, target);
  const other = [REFOCUS_THROUGH[target], ...Object.keys(ctx.records)].find(scene => scene && scene !== target && ctx.records[scene]);
  const away = other ? activate(ctx, other) : null;
  const back = away?.ok ? activate(ctx, target) : null;
  if (!back?.ok) return `${target} could not be refocused after the Korean source was selected (${!other ? 'no other scene is up' : !away?.ok ? `${other} did not come to the front` : `${target} did not come back to the front`})`;
  const out = device(ctx, ['source', 'current']);
  const current = out?.current ?? null, layout = out?.layout ?? null;
  const held = current === KOREAN_2SET && layout === HANGUL_LAYOUT;
  ctx.meta.unicode.readings.push({when: `${when} post-refocus`, current, layout, held});
  return held ? null : `the Korean source did not engage in ${target} after its refocus: the source read ${current ?? 'nothing'}, the layout ${layout ?? 'nothing'}`;
}
const rowBase = (ctx, r) => ({section: 'unicode', id: r.id, engine: ctx.engine, sample: ctx.n, ok: false, scene: r.field, target: r.field, regime: r.regime, method: r.method,
  case: r.string.id, expect: 'outcome', condition: r.condition, ...(r.user ? {user: r.user} : {})});
// `focus`, given when the focus probe's reading was the precondition that failed, is recorded and never judged.
const invalidRow = (ctx, r, reason, focus) => push(ctx, {...rowBase(ctx, r), invalid: reason, ...(focus === undefined ? {} : {focus})});
const options = r => ({section: 'unicode', id: r.id, extra: {condition: r.condition}});

// The Latin or Korean source: the field's scene in front reading it, each row a frontmost case.
async function frontmostRows(ctx, field, rows, source) {
  await quiet(ctx, field);
  const front = activate(ctx, field);
  if (!front?.ok) { for (const r of rows) invalidRow(ctx, r, `${field} did not come to the front (${front?.reason ?? 'no answer'})`); return; }
  const when = `${rows[0].condition}:${field}`;
  const why = source === KOREAN_2SET ? koreanIn(ctx, field, when) : establishSource(ctx, source, when) ? null : notHeld(source, field);
  if (why) { for (const r of rows) invalidRow(ctx, r, why); return; }
  for (const r of rows) await caseRow(ctx, field, 'frontmost', unicodeCase(r), options(r));
}

// The user window in front with its field emptied and focused, read back empty by the focus probe; the driven field
// focused first while its scene was in front of its own app. Before the user's field is emptied, the Latin source is
// selected with it in front, which ends a composition its input method may still hold from an earlier row (the Korean
// condition's `r k` leaves 가 composing where the keys go through the input method, as in Chromium; an earlier group's
// composition stays in its user window): emptying the field does not end it, and the probe's r would then compose onto
// it (각, ㄲ) rather than start ㄱ. Then the Korean source is established in the user window (koreanIn, whose refocus
// also ends a composition that selection did not reach, the switch being made with the field focused as in MAWS B2),
// and only then is its field emptied, so nothing an earlier row left composes onto the probe's key. A composition still
// open after all that shows as a field not reading exactly the jamo: the rows are invalid, never counted.
// -> {userWindow} or {invalid}.
async function behindUser(ctx, field, user) {
  await quiet(ctx, field);
  await quiet(ctx, user);
  const driven = await js(ctx, 'harness', `unicode:prepare:${field}`, emptyFieldCell(field));
  if (!driven.ok || !driven.value?.ready) return {invalid: `the field was not prepared (${driven.error ?? driven.value?.reason ?? 'no reason'})`};
  const front = activate(ctx, user);
  if (!front?.ok) return {invalid: `the user window (${user}) did not come to the front`};
  if (!useSource(ctx, ABC, `composing@${user}:end`)) return {invalid: `${notHeld(ABC, user)}: a composition left in the user window could not be ended`};
  const korean = koreanIn(ctx, user, `composing@${user}`);
  if (korean) return {invalid: `no composition in progress: ${korean}`};
  const prepared = await js(ctx, 'harness', `unicode:prepare:${user}`, emptyFieldCell(user));
  if (!prepared.ok || !prepared.value?.ready) return {invalid: `the user window's field was not prepared (${prepared.error ?? prepared.value?.reason ?? 'no reason'})`};
  const userWindow = userWindowOf(read(ctx).reading, ctx.records[user].pid);
  if (!userWindow) return {invalid: `the user window (${user}) was not in front`};
  const f0 = read(ctx, focusOf(userWindow));
  if (f0.focus?.named !== true || f0.focus.valueHash !== EMPTY_HASH) return {invalid: 'the focus probe did not read the user window\'s field focused and empty', focus: f0.focus ?? null};
  return {userWindow};
}

// A Hangul composition in progress in the user window (the probe's ANSI r under the Korean source, established with the
// user window in front), read back by the
// focus probe as the composed jamo; then the rows behind it, each also requiring the user's field to keep that value.
// After a row disturbed it, the rest say nothing about the composition: invalid.
async function composingRows(ctx, field, rows) {
  const {user} = rows[0];
  const setup = await behindUser(ctx, field, user);
  if (setup.invalid) { for (const r of rows) invalidRow(ctx, r, setup.invalid, setup.focus); return; }
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
  ctx.meta.unicode.readings.push({when: `composing@${user}`, scheduled: started?.scheduled ?? null, posted: !probeProblem(finished?.answer), composed: composed === jamo, reads});
  const problem = probeProblem(finished?.answer) ?? (composed === sha256Hex(COMPOSITION.composed) ? null : 'the user window\'s field did not read the composed jamo after the probe\'s key');
  if (problem) { for (const r of rows) invalidRow(ctx, r, `no composition in progress: ${problem}`); return; }
  let disturbed = false;
  for (const r of rows) {
    if (disturbed) { invalidRow(ctx, r, 'an earlier row disturbed the user window\'s composition'); continue; }
    const row = await caseRow(ctx, field, 'background', unicodeCase(r), {...options(r), user, userWindow, userValue: composed});
    if (!row.invalid && row.outcome?.userKept === false) disturbed = true;
  }
}

// The per-context preference on, the driven scene's context holding the Korean source (selected while it was in front),
// the user window in front under the Latin source; the rows behind it; then the driven scene brought back to the front,
// where its context must still read Korean. Without those readings the rows say nothing: invalid.
async function perContextRows(ctx, field, rows) {
  const {user} = rows[0];
  await quiet(ctx, field);
  await quiet(ctx, user);
  const on = device(ctx, ['source', 'per-context', '--value', 'on'])?.perContext === true;
  const front = activate(ctx, field);
  const driven = front?.ok ? await js(ctx, 'harness', `unicode:prepare:${field}`, emptyFieldCell(field)) : null;
  const engaged = driven?.ok === true && driven.value?.ready === true ? koreanIn(ctx, field, `perContext:${field}`) : 'the driven field was not prepared';
  const korean = engaged === null;
  const userFront = activate(ctx, user);
  const latin = userFront?.ok === true && useSource(ctx, ABC, `perContext@${user}`);
  const userWindow = latin ? userWindowOf(read(ctx).reading, ctx.records[user].pid) : null;
  const before = !on ? 'the per-context preference did not read on' : !korean ? `the driven scene's Korean source was not established while it was in front: ${engaged}`
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
  if (!held) for (const row of done) if (!row.invalid) Object.assign(row, {ok: false, invalid: `the driven scene's context did not read Korean afterwards (${readBack}): the condition is not shown to have held`});
}

// The mid-switch row: the Latin source, the field's scene in front, a long keyed typeText, and the probe's switch to
// Korean scheduled inside it. It must stop with inputSourceChanged (its sentence in the message), entering exactly what the field then holds (its
// hash against the text's first `cua/entered` units). The Latin source is selected again after it.
async function midSwitchRow(ctx, r) {
  const field = r.field;
  await quiet(ctx, field);
  const front = activate(ctx, field);
  if (!front?.ok) return invalidRow(ctx, r, `${field} did not come to the front`);
  if (!establishSource(ctx, ABC, `midSwitch:${field}`)) return invalidRow(ctx, r, notHeld(ABC, field));
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
async function midSwitchAttempt(ctx, r, {preMs, key}) {
  const field = r.field;
  let from = null, to = null;
  const span = x => { if (x?.at) { from ??= x.at[0]; to = x.at[1]; } return x; };
  const end = (row, extra = {}) => { if (from !== null) mark(ctx, 'row', key, [from, to]); return {row, ...extra}; };
  const prepared = span(await ctx.lane.js(emptyFieldCell(field)));
  if (!prepared.ok || !prepared.value?.ready) return end({invalid: `not prepared: ${prepared.error ?? prepared.value?.reason ?? 'no reason'}`});
  alertCheck(ctx, `before ${r.id}`);
  const started = device(ctx, ['probe', 'input-source', '--source', KOREAN_2SET, '--lead', String(PROBE_LEAD_MS)]);
  let act = null, finished = null;
  try {
    act = span(await sendKeys(ctx, scheduledActCell(field, {at: started.scheduled - preMs, act: `await __app.typeText(${j(r.string.text)});`, tag: 'unicode.midSwitch'}),
      ['typeText'], {scene: field, front: read(ctx), kind: 'row', key}));
  } finally { finished = device(ctx, ['probe', 'finish']); }
  if (!act) return end({invalid: 'the key guard did not send the action'});
  alertCheck(ctx, `after ${r.id}`);
  if (!act.ok) return end({invalid: 'the act cell failed', error: act.error});
  const check = span(await ctx.lane.js(fieldCheckCell(field, null, 'unicode.midSwitch.check')));
  const entered = act.engine?.entered ?? null, switchedAt = finished?.answer?.selectedAt;
  const interval = intervalOf(ctx.engine, act);
  const stopped = act.value.threw === true && INPUT_SOURCE_CHANGED.test(act.value.message ?? '');
  const exact = Number.isInteger(entered) && check.value?.length === entered && check.value?.hash === sha256Hex(r.string.text.slice(0, entered));
  const row = {ok: stopped && exact, inCellMs: act.value.actMs, wallMs: act.wallMs, inputRoute: act.route,
    outcome: {stopped, errorName: act.value.errorName, message: act.value.message ?? null, entered, length: check.value?.length ?? null, exact, intervalSource: interval?.source ?? null,
      switchOffsetMs: interval && Number.isFinite(switchedAt) ? switchedAt - interval.from : null}};
  const why = probeProblem(finished?.answer) ?? postValidity(switchedAt, interval)?.replace('the probe posted', 'the probe switched');
  if (why) return end({...row, ok: false, invalid: why}, {retry: true, preMs: nextPreMs({callAt: act.value.callAt, interval, postedAt: switchedAt, scheduled: started.scheduled, preMs})});
  return end(row);
}
