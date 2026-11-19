// Ruling 680 in the live judge (M5, ruling 867): in the late-take cell, a drop the witness did not record passes only
// as the witness span's limit. The span closes 20 ms after the engine's answer (witness.mjs `startWitness`), and a late
// take's drop goes on after it, so a dragend at or past the answer plus the tail lands after the span closed. The
// fixtures follow V5's records at H'''' (task 105, `chrome_dnd_late_take_shared` block 2: 2/0 the span's limit, its
// dragend 221 ms after its dragstart with the answer at 164.02 ms; 2/1 and 2/2 drops the witness recorded), and the negative
// controls are the seven m5/x64/scripts/rejudge-680/rejudge-late-take-controls.mjs held, through the judge a run uses
// (device.mjs `judgeDevice`) and the run's outcome (stats.mjs `runOutcome`). Ruling 870 tightened it: the limit needs
// this press's own dragend observed (its `dur` that end's, never the page's previous value) and the drop counter read
// rising, never inferred; and the case's recorded drop needs the counter read rising too. Fix wave 2 bound the dragend to
// this press (a baseline with no drag outstanding, and the dragend on this press's own log) and the witness to what it
// saw: a recorded drop is an observed change, never a witness that could not be read, and the limit needs a clean span.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dndLateRefusal, judgeDevice } from '../../scripts/linux-engine-diff/device.mjs';
import { runOutcome } from '../../scripts/linux-engine-diff/stats.mjs';
import { WITNESS_TAIL_MS } from '../../scripts/linux-engine-diff/witness.mjs';

const OP = 'chrome_dnd_late_take_shared';
const SCENE = 'device-chrome-dnd';
const app = 'Google-chrome';
const notice = dndLateRefusal(app, 'move');

/** A late-take sample as run.mjs records it, its fields as the judge reads them. */
const sample = (i, { ms, dur, witness, dropped = true, downs = 103 + i, starts = 97 + i, ...rest }) => ({
  run: 'pinned-V5',
  kind: 'sample',
  engine: 'cua',
  scene: SCENE,
  op: OP,
  block: 0,
  i,
  series: i === 0 ? 'cold' : 'warm',
  ms,
  ok: true,
  expected_notice: notice,
  read_ok: true,
  read_notice: true,
  next_ok: false,
  next_error: notice,
  late_dnd: { after_release_ms: 0, app, escape_after_release_ms: 1.88, escaped: true },
  dropped,
  witness,
  // what the witness saw where it changed (run.mjs): the drop's activation and restack
  ...(witness === false ? { witness_fields: ['stacking', 'active', 'focus'], witness_changes: [{ field: 'active' }] } : {}),
  // the page's counts (pages/drag.html): this press, its drag start and its dragend, whose `dur` is ms from that start,
  // the baseline with no drag outstanding; and this press's pointer log, its dragstart and dragend logged (ms after it)
  drop_status: {
    before: { downs: downs - 1, starts: starts - 1, ends: starts - 1, drops: 65, dur: 747 },
    after: { downs, starts, ends: starts, log: { seq: downs, start: { t: 0, h: 5 }, up: null, cancel: { t: 10, h: 5.3 }, end: { t: dur, h: dur - 3 } }, dur, drops: dropped ? 66 : 65 },
  },
  ...rest,
});
// V5 at H'''': 2/0 dropped with the witness unchanged, its dragend past the span; 2/1 and 2/2 recorded drops
const limited = sample(0, { ms: 164.02, dur: 221, witness: true });
const recorded = [sample(1, { ms: 200.18, dur: 199, witness: false }), sample(2, { ms: 160.88, dur: 163, witness: false })];
const cell = [limited, ...recorded];
const audit = { clean: true, kind: 'background', answered: [{ ok: true }, { ok: true }] };
const judged = (samples, premise) => judgeDevice(OP, samples, audit, premise);
const edit = (fn) => [fn(structuredClone(limited)), ...recorded];

test("a late take's drop the witness did not record passes as the witness span's limit, and the case still needs a recorded drop", () => {
  const r = judged(cell);
  assert.equal(r.pass, true, r.reasons.join('; '));
  assert.deepEqual(r.reasons, []);
  assert.deepEqual(r.span_limited, [{ sample: '0/0', dragend_ms: 221, answer_ms: 164.02 }], 'the sample judged by the limit, named on the verdict');
  // the limit's edge: the dragend exactly at the answer plus the tail closes the span, a millisecond before does not
  assert.equal(judged(edit((s) => ((s.drop_status.after.dur = 164.02 + WITNESS_TAIL_MS), s))).pass, true, 'at the span close');
  assert.equal(judged(edit((s) => ((s.drop_status.after.dur = 183), s))).pass, false, 'inside the span');
  // a cell with no limited sample reads as before: no field
  assert.deepEqual(judged(recorded), { pass: true, reasons: [] });
});

test('the limited sample stays in the plan: the cell is bound and checked whole, never short by it', () => {
  // the run's recorded plan, one block of three and the audit's two requests: the limited sample fills its slot
  const r = judged(cell, { lines: null, window: null, plan: { blocks: 1, audit: true } });
  assert.equal(r.pass, true, r.reasons.join('; '));
  assert.equal(r.plan_unverified, undefined);
});

test("ruling 680's controls on the case: each still fails", () => {
  const controls = [
    ['the notice missing on the span-limited sample', edit((s) => ((s.read_notice = false), s)), /the read did not carry the notice on 1 of 3 samples \(0\/0\)/, /the read did not run with the notice/],
    ['its next acting request not refused', edit((s) => ((s.next_ok = true), (s.next_error = null), s)), /the next acting request did not carry the late drag and drop on 1 of 3 samples \(0\/0\)/, /the next acting request was not refused with the notice/],
    ['its drop early: a clean witness on a drop that ended inside the span', edit((s) => ((s.drop_status.after.dur = Math.floor(s.ms)), s)), /a drop the witness did not record on 1 of 3 samples \(0\/0\)/, /the dragend \(164 ms after its dragstart\) came before the span closed \(answer 164\.02 \+ 20 ms\)/],
    // every drop of the case unrecorded and late, so each would count as the span's limit: none is left that the witness recorded
    ['no drop in the case the witness recorded', cell.map((s) => ({ ...structuredClone(s), witness: true, drop_status: { ...s.drop_status, after: { ...s.drop_status.after, dur: Math.ceil(s.ms + WITNESS_TAIL_MS) } } })), /no drop landed: the case showed no change for the notice to report/, null],
    // the rule's other conditions (the script's 1 to 3)
    ['the drag not answered as a plain drag', edit((s) => ((s.ok = false), (s.error = 'x'), s)), /the drag did not answer as a plain drag on 1 of 3 samples \(0\/0\)/, /the drag did not answer as a plain drag/],
    ['the read refused', edit((s) => ((s.read_ok = false), s)), /the read after the drag did not run on 1 of 3 samples \(0\/0\)/, /the read did not run with the notice/],
    ["the after-release watch's Escape not sent", edit((s) => ((s.late_dnd.escaped = false), s)), /a drop the witness did not record on 1 of 3 samples \(0\/0\)/, /the after-release watch did not escape the take/],
    ["the page's pointer log another press's", edit((s) => ((s.drop_status.after.log.seq = s.drop_status.after.downs - 1), s)), /the page's pointer log was not the sample's own press on 1 of 3 samples \(0\/0\)/, /the page's pointer log is not the sample's own press/],
    ['the dragend unread', edit((s) => ((s.drop_status.after.dur = undefined), s)), /a drop the witness did not record on 1 of 3 samples \(0\/0\)/, /the page recorded no time for the dragend/],
    // ruling 870 (a): the reviewer's probe, the previous drag's dragend timing (747 ms) left on 2/0, its own end never counted
    ['stale end timing: no dragend counted for this press, the previous drag\'s 747 ms', edit((s) => ((s.drop_status.after.ends = s.drop_status.before.ends), (s.drop_status.after.dur = s.drop_status.before.dur), s)), /a drop the witness did not record on 1 of 3 samples \(0\/0\)/, /the page did not count this press's own drag start and dragend/],
    ['its dragend counted, its drag start not (the timing from an earlier start)', edit((s) => ((s.drop_status.after.starts = s.drop_status.before.starts), s)), /a drop the witness did not record on 1 of 3 samples \(0\/0\)/, /the page did not count this press's own drag start and dragend/],
    ['two dragends counted for one press', edit((s) => ((s.drop_status.after.ends = s.drop_status.before.ends + 2), s)), /a drop the witness did not record on 1 of 3 samples \(0\/0\)/, /the page did not count this press's own drag start and dragend/],
    // ruling 870 (b): the runner sets `dropped` on an unread counter (device.mjs's check); the limit never infers a drop
    ['an unread drop counter after', edit((s) => ((s.drop_status.after.drops = undefined), s)), /a drop the witness did not record on 1 of 3 samples \(0\/0\)/, /the page's drop counter was not read rising/],
    ['an unread drop counter before', edit((s) => ((s.drop_status.before.drops = null), s)), /a drop the witness did not record on 1 of 3 samples \(0\/0\)/, /the page's drop counter was not read rising/],
    ['a drop counter read unchanged', edit((s) => ((s.drop_status.after.drops = s.drop_status.before.drops), s)), /a drop the witness did not record on 1 of 3 samples \(0\/0\)/, /the page's drop counter was not read rising/],
    // fix wave 2: the re-review's probe, counters crossed by a drag outstanding at the baseline (96/95 -> 97/96), no end
    // on this press's log and the previous drag's 747 ms
    ['crossed counters: a drag outstanding at the baseline supplies the end', edit((s) => ((s.drop_status.before.starts = 96), (s.drop_status.before.ends = 95), (s.drop_status.after.starts = 97), (s.drop_status.after.ends = 96), (s.drop_status.after.log.end = null), (s.drop_status.after.dur = 747), s)), /a drop the witness did not record on 1 of 3 samples \(0\/0\)/, /a drag was outstanding before the press, or this press's log has no dragstart and dragend of its own/],
    ['a baseline with a drag outstanding, the log whole', edit((s) => ((s.drop_status.before.ends = s.drop_status.before.starts - 1), (s.drop_status.after.ends = s.drop_status.before.ends + 1), s)), /a drop the witness did not record on 1 of 3 samples \(0\/0\)/, /a drag was outstanding before the press/],
    ["no dragend on this press's log", edit((s) => ((s.drop_status.after.log.end = null), s)), /a drop the witness did not record on 1 of 3 samples \(0\/0\)/, /this press's log has no dragstart and dragend of its own/],
    ["no dragstart on this press's log", edit((s) => ((s.drop_status.after.log.start = null), s)), /a drop the witness did not record on 1 of 3 samples \(0\/0\)/, /this press's log has no dragstart and dragend of its own/],
    // fix wave 2: a witness that could not be read (witness.mjs `judgeSpan`'s `protocol`) is no clean span to waive on
    ['the span-limited sample with an unread witness', edit((s) => ((s.witness = false), (s.witness_fields = ['protocol']), s)), /a drop the witness did not record on 1 of 3 samples \(0\/0\)/, /the witness did not watch the span cleanly/],
    ['the span-limited sample with no witness at all', edit((s) => ((s.witness = undefined), s)), /a drop the witness did not record on 1 of 3 samples \(0\/0\)/, /the witness did not watch the span cleanly/],
    // and the case's own recorded drop (ruling 870.1): a drop the witness recorded, its counter unread, is no drop seen
    // fix wave 2: the re-review's probe, every witnessed drop's witness a protocol failure with no change: none observed
    ['the recorded drops on unread witnesses', [limited, ...recorded.map((s) => ({ ...structuredClone(s), witness_fields: ['protocol'], witness_changes: undefined }))], /no drop landed: the case showed no change for the notice to report/, null],
    ['the recorded drops on unread counters', [limited, ...recorded.map((s) => ({ ...structuredClone(s), drop_status: { ...s.drop_status, after: { ...s.drop_status.after, drops: undefined } } }))], /no drop landed: the case showed no change for the notice to report/, null],
  ];
  for (const [what, samples, reason, why] of controls) {
    const r = judged(samples);
    assert.equal(r.pass, false, what);
    assert.match(r.reasons.join('\n'), reason, what);
    // a drop the rule does not cover says why it is not the span's limit
    if (why) assert.match(r.reasons.join('\n'), new RegExp(`the witness span's limit \\(ruling 680\\) does not cover 1 of 3 samples \\(0/0: .*${why.source}`), what);
  }
});

test("ruling 680's run-wide controls: the case passing by the limit, the run's own failures still fail it", () => {
  // the verdict row as run.mjs writes it from the judge
  const verdict = (samples) => {
    const j = judged(samples);
    return { kind: 'verdict', scene: SCENE, op: OP, candidate: 'cua', device: 'late-take', ...j, verdict: j.pass ? 'pass' : 'fail' };
  };
  const passing = verdict(cell);
  const other = { kind: 'verdict', scene: 'identity-kate', op: 'identity_kate', candidate: 'cua', device: 'identity', pass: true, reasons: [], verdict: 'pass' };
  const planned = [`${SCENE} ${OP} cua`, 'identity-kate identity_kate cua'];
  assert.deepEqual(runOutcome([passing, other], { valid: true, planned }).failed, [], 'the positive control: the run passes');
  assert.deepEqual(runOutcome([verdict(edit((s) => ((s.read_notice = false), s))), other], { valid: true, planned }).failed, [`${SCENE} ${OP} cua`], 'the case failing fails the run');

  const foreign = runOutcome([passing, other], { valid: true, planned, foreign: ['the harness: 0x00a00003 ConfigureWindow (raised)'] });
  assert.deepEqual(foreign.failed, ['a window the harness did not open was changed: the harness: 0x00a00003 ConfigureWindow (raised)'], "a change to a window the harness did not open, at the run's cleanup");
  const OVER = "device-chrome-dnd chrome_dnd_shared: 5 of 18 samples resampled or invalid (5 resampled, 0 invalid), more than the case's cap of 2";
  const over = runOutcome([passing, other], { valid: true, planned, faults: { pass: false, reasons: [OVER] } });
  assert.deepEqual(over.failed, [`harness preparation failures over the cap (${OVER})`], 'preparation failures over the cap');
  const unjudged = runOutcome([passing], { valid: true, planned });
  assert.deepEqual(unjudged.failed, ['identity-kate identity_kate cua: no verdict'], 'a planned operation with no verdict');
  for (const o of [foreign, over, unjudged]) assert.equal(o.code, 1);
});
