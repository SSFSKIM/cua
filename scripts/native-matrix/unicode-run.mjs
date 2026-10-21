// The Korean and Unicode matrix of a matrix run (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// Verification system part 6; the plan in ./unicode-plan.mjs): the `unicode` section's rows, condition by condition.
// The input source is the run's to switch only inside ./run.mjs inputSections, which saved the owner's source and
// per-context preference before (the live harness's record) and restores both after, whatever happened; the put-back
// verifies them again.
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
import {ABC, applyDeclarations, COMPOSITION, CONDITIONS, KOREAN_2SET, readDeclarations, unicodeCase, unicodeRowsOf} from './unicode-plan.mjs';

const j = JSON.stringify;

// The section: every row of `plan` ({fields, conditions}), then the expected file's declarations applied to them.
export async function unicodeSection(ctx, plan) {
  const rows = unicodeRowsOf(plan);
  const first = ctx.rows.length;
  ctx.meta.unicode = {readings: []};
  for (const condition of CONDITIONS) {
    const mine = rows.filter(r => r.condition === condition);
    if (!mine.length) continue;
    const source = ['korean', 'composing'].includes(condition) ? KOREAN_2SET : ABC;
    const selected = condition === 'perContext' || useSource(ctx, source, condition);
    for (const field of plan.fields) {
      const ofField = mine.filter(r => r.field === field);
      if (!ofField.length) continue;
      await ctx.checkpoint();
      if (!selected) { for (const r of ofField) invalidRow(ctx, r, `the ${source === ABC ? 'Latin' : 'Korean'} source was not selected and read back`); continue; }
      if (condition === 'latin' || condition === 'korean') await frontmostRows(ctx, field, ofField);
      else if (condition === 'midSwitch') await midSwitchRow(ctx, ofField[0]);
      else if (condition === 'composing') await composingRows(ctx, field, ofField);
      else await perContextRows(ctx, field, ofField);
    }
  }
  const {unused} = applyDeclarations(ctx.rows.slice(first), readDeclarations());
  ctx.meta.unicode.unusedDeclarations = unused.map(({id, engine}) => ({id, engine}));
}

// A source selected through the probe and read back. -> whether it holds.
function useSource(ctx, id, when) {
  const out = device(ctx, ['source', 'select', '--source', id]);
  const held = out?.selected === true && out.current === id;
  ctx.meta.unicode.readings.push({when, select: id, held});
  return held;
}
const rowBase = (ctx, r) => ({section: 'unicode', id: r.id, engine: ctx.engine, sample: ctx.n, ok: false, scene: r.field, target: r.field, regime: r.regime, method: r.method,
  case: r.string.id, expect: 'outcome', condition: r.condition, ...(r.user ? {user: r.user} : {})});
const invalidRow = (ctx, r, reason) => push(ctx, {...rowBase(ctx, r), invalid: reason});
const options = r => ({section: 'unicode', id: r.id, extra: {condition: r.condition}});

// The Latin or Korean source: the field's scene in front, each row a frontmost case.
async function frontmostRows(ctx, field, rows) {
  await quiet(ctx, field);
  const front = activate(ctx, field);
  if (!front?.ok) { for (const r of rows) invalidRow(ctx, r, `${field} did not come to the front (${front?.reason ?? 'no answer'})`); return; }
  for (const r of rows) await caseRow(ctx, field, 'frontmost', unicodeCase(r), options(r));
}

// The user window in front with its field emptied and focused, read back empty by the focus probe; the driven field
// focused first while its scene was in front of its own app. -> {userWindow} or {invalid}.
async function behindUser(ctx, field, user) {
  await quiet(ctx, field);
  await quiet(ctx, user);
  const driven = await js(ctx, 'harness', `unicode:prepare:${field}`, emptyFieldCell(field));
  if (!driven.ok || !driven.value?.ready) return {invalid: `the field was not prepared (${driven.error ?? driven.value?.reason ?? 'no reason'})`};
  const front = activate(ctx, user);
  if (!front?.ok) return {invalid: `the user window (${user}) did not come to the front`};
  const prepared = await js(ctx, 'harness', `unicode:prepare:${user}`, emptyFieldCell(user));
  if (!prepared.ok || !prepared.value?.ready) return {invalid: `the user window's field was not prepared (${prepared.error ?? prepared.value?.reason ?? 'no reason'})`};
  const userWindow = userWindowOf(read(ctx).reading, ctx.records[user].pid);
  if (!userWindow) return {invalid: `the user window (${user}) was not in front`};
  const f0 = read(ctx, focusOf(userWindow));
  if (f0.focus?.named !== true || f0.focus.valueHash !== EMPTY_HASH) return {invalid: 'the focus probe did not read the user window\'s field focused and empty'};
  return {userWindow};
}

// A Hangul composition in progress in the user window (the probe's ANSI r under the Korean source), read back by the
// focus probe as the composed jamo; then the rows behind it, each also requiring the user's field to keep that value.
// After a row disturbed it, the rest say nothing about the composition: invalid.
async function composingRows(ctx, field, rows) {
  const {user} = rows[0];
  const setup = await behindUser(ctx, field, user);
  if (setup.invalid) { for (const r of rows) invalidRow(ctx, r, setup.invalid); return; }
  const {userWindow} = setup;
  const started = device(ctx, ['probe', 'keystroke', '--window', focusOf(userWindow), '--text', COMPOSITION.key, '--mode', 'ansiKeys', '--lead', '1500']);
  const finished = device(ctx, ['probe', 'finish']);
  ctx.posted[user] = ctx.now();
  const composed = read(ctx, focusOf(userWindow)).focus?.valueHash ?? null;
  ctx.meta.unicode.readings.push({when: `composing@${user}`, scheduled: started?.scheduled ?? null, posted: !probeProblem(finished?.answer), composed: composed === sha256Hex(COMPOSITION.composed)});
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
  const korean = driven?.ok === true && driven.value?.ready === true && useSource(ctx, KOREAN_2SET, `perContext:${field}`);
  const userFront = activate(ctx, user);
  const latin = userFront?.ok === true && useSource(ctx, ABC, `perContext@${user}`);
  const userWindow = latin ? userWindowOf(read(ctx).reading, ctx.records[user].pid) : null;
  const before = !on ? 'the per-context preference did not read on' : !korean ? 'the driven scene\'s Korean source was not selected while it was in front'
    : !latin ? 'the Latin source was not selected with the user window in front' : !userWindow ? `the user window (${user}) was not in front` : null;
  if (before) { for (const r of rows) invalidRow(ctx, r, before); return; }
  const done = [];
  for (const r of rows) done.push(await caseRow(ctx, field, 'background', unicodeCase(r), {...options(r), user, userWindow}));
  const back = activate(ctx, field);
  const held = back?.ok === true && device(ctx, ['source', 'current'])?.current === KOREAN_2SET;
  ctx.meta.unicode.readings.push({when: `perContext:${field}@${user}`, perContext: on, drivenKorean: korean, userLatin: latin, heldAfter: held});
  if (!held) for (const row of done) if (!row.invalid) Object.assign(row, {ok: false, invalid: 'the driven scene\'s context did not read Korean afterwards: the condition is not shown to have held'});
}

// The mid-switch row: the Latin source, the field's scene in front, a long keyed typeText, and the probe's switch to
// Korean scheduled inside it. It must stop with inputSourceChanged, entering exactly what the field then holds (its
// hash against the text's first `cua/entered` units). The Latin source is selected again after it.
async function midSwitchRow(ctx, r) {
  const field = r.field;
  await quiet(ctx, field);
  const front = activate(ctx, field);
  if (!front?.ok) return invalidRow(ctx, r, `${field} did not come to the front`);
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
  const stopped = act.value.threw && act.value.errorName === 'inputSourceChanged';
  const exact = Number.isInteger(entered) && check.value?.length === entered && check.value?.hash === sha256Hex(r.string.text.slice(0, entered));
  const row = {ok: stopped && exact, inCellMs: act.value.actMs, wallMs: act.wallMs, inputRoute: act.route,
    outcome: {stopped, errorName: act.value.errorName, entered, length: check.value?.length ?? null, exact, intervalSource: interval?.source ?? null,
      switchOffsetMs: interval && Number.isFinite(switchedAt) ? switchedAt - interval.from : null}};
  const why = probeProblem(finished?.answer) ?? postValidity(switchedAt, interval)?.replace('the probe posted', 'the probe switched');
  if (why) return end({...row, ok: false, invalid: why}, {retry: true, preMs: nextPreMs({callAt: act.value.callAt, interval, postedAt: switchedAt, scheduled: started.scheduled, preMs})});
  return end(row);
}
