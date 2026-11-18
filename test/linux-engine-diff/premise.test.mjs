// The design session's ruling 823: in a V5 Chrome drag-and-drop cell, a sample whose premise was unmet (cua answered a
// plain drag, and the run's own records show Chrome never started a drag session) is excluded, counted, reported as a
// rate, and refilled within its pass up to a bound; anything else is judged as before. Its negative controls first.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEVICE_OPS, PREMISE_OPS, dndCancelledSentence, dndLateNotice, dndLateRefusal, dndMayHaveDroppedSentence, dndUnconfirmedNotice, judgeDevice } from '../../scripts/linux-engine-diff/device.mjs';
import { classifyPremise, fillNeed, noDragSession, premiseFields, premiseMarkdown, refill, splitPremise } from '../../scripts/linux-engine-diff/premise.mjs';

const app = 'Google-chrome';
const cancelled = dndCancelledSentence(app);

// the drag page's counts (pages/drag.html) and its pointer log of the last press, as drag.mjs parses them
const log = (seq, { start = null, up = null, cancel = null, end = null } = {}) => ({ seq, n: 2, start, up, cancel, end, moves: [], past: 1 });
const at = (t) => ({ t, h: t + 0.5 });
const BEFORE = { starts: 3, ends: 3, drops: 0, downs: 3, ups: 1, log: log(3, { start: at(0), cancel: at(90), end: at(160) }) };
// the sample's own press, ended by a pointerup with no drag start, no pointercancel and no dragend: no drag session
const PLAIN = { starts: 3, ends: 3, drops: 0, downs: 4, ups: 2, log: log(4, { up: at(158) }) };
// the sample's own press taken by a drag and drop: dragstart, Chrome's pointercancel, the dragend (V5 x64 0/0's shape)
const TOOK = { starts: 4, ends: 4, drops: 0, downs: 4, ups: 1, log: log(4, { start: at(0), cancel: at(95), end: at(165) }) };

const row = (fields) => ({ engine: 'cua', block: 0, i: 0, witness: true, ...fields });
const noTake = { outcome: 'no_start', started: false, in_front: false, held_at_start: false };
// a plain-drag ok whose records show Chrome never started a drag session: the premise unmet
const unmet = (fields = {}) => row({ ok: true, reply_notice: null, expected_error: cancelled, dropped: false, dnd: noTake, press: { taken: false }, drop_status: { before: BEFORE, after: PLAIN }, ...fields });
const inTime = (fields = {}) => row({ ok: false, error: cancelled, expected_error: cancelled, dropped: false, reply_notice: null, dnd: { outcome: 'in_time', started: true, in_front: false, held_at_start: false }, drop_status: { before: BEFORE, after: TOOK }, ...fields });
const block = (b, samples, extra = {}) => samples.map((s, i) => ({ ...s, block: b, i, series: i === 0 ? 'cold' : 'warm', ...extra }));
const audit = (answered) => ({ clean: true, kind: 'background', answered });
const cancelledEntry = { ok: false, error: cancelled, expected_error: cancelled, late_error: null, reply_notice: null, drop_status: { before: BEFORE, after: TOOK } };
const unmetEntry = { ok: true, error: null, expected_error: cancelled, late_error: null, reply_notice: null, drop_status: { before: BEFORE, after: PLAIN } };
const CLEAN = audit([cancelledEntry, cancelledEntry]);

// three blocks of three, every sample cancelled in time: the cell as V5 plans it
const planned = () => [0, 1, 2].flatMap((b) => block(b, [inTime(), inTime(), inTime()]));

test('the cells where the unmet premise can occur are the cancel, late and late-take cells of the drag page, no others', () => {
  assert.deepEqual([...PREMISE_OPS].sort(), ['chrome_dnd_late_shared', 'chrome_dnd_late_take_shared', 'chrome_dnd_obscured_in_front_late_shared', 'chrome_dnd_obscured_in_front_shared', 'chrome_dnd_shared']);
  // a drop cell's plain ok with no drop is ruling 650's false ok, never an unmet premise
  for (const op of PREMISE_OPS) assert.ok(!DEVICE_OPS[op].confirm, op);
});

test("the page's own record of the sample's press shows no drag session only when it is that press's, read on both sides, ended by a pointerup with nothing of a drag", () => {
  assert.equal(noDragSession({ before: BEFORE, after: PLAIN }), true);
  assert.equal(noDragSession({ before: BEFORE, after: TOOK }), false, 'a dragstart');
  const variants = [
    ['no page read', undefined],
    ['the after read missing', { before: BEFORE, after: null }],
    ['the before read missing', { before: null, after: PLAIN }],
    ['no press reached a source', { before: BEFORE, after: { ...PLAIN, downs: 3 } }],
    ['two presses', { before: BEFORE, after: { ...PLAIN, downs: 5, log: log(5, { up: at(158) }) } }],
    ["the log another press's", { before: BEFORE, after: { ...PLAIN, log: log(3, { up: at(158) }) } }],
    ['the log unread', { before: BEFORE, after: { ...PLAIN, log: null } }],
    ['no pointerup', { before: BEFORE, after: { ...PLAIN, log: log(4) } }],
    ['a dragstart in the log', { before: BEFORE, after: { ...PLAIN, log: log(4, { up: at(158), start: at(0) }) } }],
    ["Chrome's pointercancel", { before: BEFORE, after: { ...PLAIN, log: log(4, { up: at(158), cancel: at(90) }) } }],
    ['a dragend in the log', { before: BEFORE, after: { ...PLAIN, log: log(4, { up: at(158), end: at(160) }) } }],
    ['a log field unrecorded', { before: BEFORE, after: { ...PLAIN, log: { seq: 4, up: at(158) } } }],
    ['a drag start counted', { before: BEFORE, after: { ...PLAIN, starts: 4 } }],
    ['a dragend counted', { before: BEFORE, after: { ...PLAIN, ends: 4 } }],
    ['a drop counted', { before: BEFORE, after: { ...PLAIN, drops: 1 } }],
    ['a count unread', { before: { ...BEFORE, starts: undefined }, after: PLAIN }],
  ];
  for (const [what, status] of variants) assert.equal(noDragSession(status), false, what);
});

test('a sample reads premise unmet only on a plain-drag ok with no notice whose every record agrees Chrome never started a drag session', () => {
  assert.equal(classifyPremise(unmet()), 'unmet');
  assert.equal(classifyPremise(inTime()), 'not-plain-ok');
  // what cua's reply claimed: a refusal, a may-have-dropped answer, or an ok carrying a notice is not a plain-drag ok
  assert.equal(classifyPremise(unmet({ ok: false, error: dndMayHaveDroppedSentence(app) })), 'not-plain-ok');
  assert.equal(classifyPremise(unmet({ reply_notice: dndUnconfirmedNotice(app) })), 'claims');
  // the records that show Chrome started one
  const started = [
    ['the page', { drop_status: { before: BEFORE, after: TOOK } }],
    ['the engine took by the release', { dnd: { ...noTake, started: true } }],
    ["the engine's outcome", { dnd: { ...noTake, outcome: 'in_time' } }],
    ["the engine's press record", { press: { taken: true } }],
    ["the engine's stats", { engine_stats: { dnd: { ...noTake, started: true } } }],
    ["the late case's read carried a notice", { state_notice: dndLateNotice(app), next_ok: false, next_error: dndLateRefusal(app, 'preflight') }],
    ["the late case's next acting request refused for it", { state_notice: null, next_ok: false, next_error: dndLateRefusal(app, 'preflight') }],
    ["the late-take case's read carried the notice", { read_notice: true }],
    ["the late-take case's next acting request refused for it", { read_notice: false, next_ok: false, next_error: dndLateRefusal(app, 'move') }],
  ];
  for (const [what, fields] of started) assert.equal(classifyPremise(unmet(fields)), 'started', what);
  // the next request on the same engine refused for something this drag left pending, or the late take recorded on it
  assert.equal(classifyPremise(unmet(), row({ i: 1, ok: false, error: dndLateRefusal(app, 'drag') })), 'started');
  assert.equal(classifyPremise(unmet(), row({ i: 1, ok: false, error: cancelled, engine_stats: { late_dnd: { after_release_ms: 2.3, app, escaped: true } } })), 'started');
  // a drop or a changed desktop is never an unmet premise
  assert.equal(classifyPremise(unmet({ dropped: true })), 'changed');
  assert.equal(classifyPremise(unmet({ witness: false })), 'changed');
  // records that cannot show it either way: judged as before
  assert.equal(classifyPremise(unmet({ drop_status: undefined })), 'unshown', 'no page read (the audit rows before 823)');
  assert.equal(classifyPremise(unmet({ drop_status: { before: BEFORE, after: null } })), 'unshown');
  assert.equal(classifyPremise(unmet({ drop_status: { before: BEFORE, after: { ...PLAIN, log: log(3, { up: at(158) }) } } })), 'unshown', "the log another press's");
  const { reply_notice, ...noReplyRecord } = unmet();
  assert.equal(classifyPremise(noReplyRecord), 'unshown', "the reply's notice unrecorded (the stored rows before 823)");
});

test('negative control: a plain-drag ok where Chrome did start a drag session fails as now', () => {
  const tookRows = planned();
  tookRows[0] = { ...unmet({ drop_status: { before: BEFORE, after: TOOK } }), block: 0, i: 0 };
  const r = judgeDevice('chrome_dnd_shared', tookRows, CLEAN);
  assert.equal(r.pass, false);
  assert.match(r.reasons.join('\n'), /not cancelled with the drag-and-drop sentence on 1 of 9 samples \(0\/0\)/);
  assert.equal(r.premise_unmet, undefined, 'nothing excluded');
  // and in the audit pass
  const a = judgeDevice('chrome_dnd_shared', planned(), audit([{ ...unmetEntry, drop_status: { before: BEFORE, after: TOOK } }, cancelledEntry]));
  assert.equal(a.pass, false);
  assert.match(a.reasons.join('\n'), /the background audit's requests did not answer as the case expects/);
});

test('negative control: a reply that claims or implies a drop, with no drag session, fails', () => {
  for (const [what, sample] of [
    ['a may-have-dropped answer', unmet({ ok: false, error: dndMayHaveDroppedSentence(app) })],
    ['an ok carrying a notice', unmet({ reply_notice: dndUnconfirmedNotice(app) })],
  ]) {
    const rows = planned();
    rows[0] = { ...sample, block: 0, i: 0 };
    const r = judgeDevice('chrome_dnd_shared', rows, CLEAN);
    assert.equal(r.pass, false, what);
    assert.match(r.reasons.join('\n'), /not cancelled with the drag-and-drop sentence on 1 of 9 samples \(0\/0\)/, what);
  }
  // the late-take case's reply implies a drop with its notice: judged by its own rules, never excluded
  const lt = judgeDevice('chrome_dnd_late_take_shared', [unmet({ read_ok: true, read_notice: true, next_ok: false, next_error: dndLateRefusal(app, 'move'), expected_notice: dndLateRefusal(app, 'move') })], audit([{ ...unmetEntry, drop_status: { before: BEFORE, after: TOOK } }]));
  assert.equal(lt.pass, false);
  assert.equal(lt.premise_unmet, undefined);
});

test("negative control: a sample whose records can't show Chrome never started is judged as now", () => {
  const { reply_notice, ...noReplyRecord } = unmet();
  for (const [what, sample] of [
    ['no page read', unmet({ drop_status: undefined })],
    ['the page unread after', unmet({ drop_status: { before: BEFORE, after: null } })],
    ["the log another press's", unmet({ drop_status: { before: BEFORE, after: { ...PLAIN, log: log(3, { up: at(158) }) } } })],
    ["the reply's notice unrecorded", noReplyRecord],
  ]) {
    const rows = planned();
    rows[0] = { ...sample, block: 0, i: 0 };
    const r = judgeDevice('chrome_dnd_shared', rows, CLEAN);
    assert.equal(r.pass, false, what);
    assert.match(r.reasons.join('\n'), /not cancelled with the drag-and-drop sentence on 1 of 9 samples \(0\/0\)/, what);
    assert.equal(r.premise_unmet, undefined, what);
  }
  // the arm64 pilot's audit pass as stored: a plain-drag ok whose entry keeps no page record
  const stored = judgeDevice('chrome_dnd_shared', planned(), audit([{ ok: true, error: null, expected_error: cancelled, late_error: null }, { ok: false, error: cancelled, expected_error: cancelled, late_error: null }]));
  assert.equal(stored.pass, false);
  assert.match(stored.reasons.join('\n'), /the background audit's requests did not answer as the case expects \(success; /);
});

test('an unmet premise is excluded and refilled within its pass: the cell judged on its planned count, the rate reported', () => {
  const rows = planned();
  rows[4] = { ...unmet(), block: 1, i: 1 };
  const filled = [...rows, ...block(3, [inTime(), inTime(), inTime()], { fill: true })];
  const r = judgeDevice('chrome_dnd_shared', filled, CLEAN);
  assert.deepEqual(r.reasons, []);
  assert.equal(r.pass, true);
  assert.deepEqual(r.premise_unmet, { timed: { samples: 12, unmet: 1, rate: 0.083, planned: 9, refilled: 3, judged: 11, unmet_samples: ['1/1'] } });
  // in the audit pass: the unmet request refilled by one more audited request
  const a = judgeDevice('chrome_dnd_shared', planned(), audit([unmetEntry, cancelledEntry, { ...cancelledEntry, fill: true }]));
  assert.deepEqual(a.reasons, []);
  assert.deepEqual(a.premise_unmet, { audit: { samples: 3, unmet: 1, rate: 0.333, planned: 2, refilled: 1, judged: 2, unmet_samples: ['audit/0'] } });
  // the same in every premise cell: the late case's plain drag Chrome never started is excluded, not unexercised
  const late = dndMayHaveDroppedSentence(app);
  const quiet = { state_notice: null, next_ok: true, next_error: null };
  const mayHave = row({ ok: false, error: late, expected_error: cancelled, late_error: late, reply_notice: null, dropped: true, witness: false, dnd: { in_front: false, outcome: 'late' }, drop_status: { before: BEFORE, after: TOOK }, ...quiet });
  const lateAudit = audit([{ ...cancelledEntry, error: late, late_error: late }]);
  const lateCell = judgeDevice('chrome_dnd_late_shared', [mayHave, { ...unmet(quiet), i: 1, late_error: late }, { ...mayHave, block: 1, fill: true }], lateAudit);
  assert.deepEqual(lateCell.reasons, []);
  assert.equal(lateCell.premise_unmet.timed.unmet, 1);
});

test('negative control: the bound hit fails the cell closed as incomplete, its rate reported', () => {
  const rows = planned();
  rows[0] = { ...unmet(), block: 0, i: 0 };
  // every refill unmet too, as many as the pass planned
  const exhausted = [...rows, ...[3, 4, 5].flatMap((b) => block(b, [unmet(), unmet(), unmet()], { fill: true }))];
  const r = judgeDevice('chrome_dnd_shared', exhausted, CLEAN);
  assert.equal(r.pass, false);
  assert.ok(r.reasons.some((x) => x === 'incomplete: Chrome never started a drag and drop on 10 of 18 samples (the premise unmet, ruling 823), so 8 were judged of the 9 planned, with 9 refilled of a bound of 9'), r.reasons.join('\n'));
  assert.equal(r.premise_unmet.timed.rate, 0.556);
  // stored rows that were never refilled are incomplete too
  const unfilled = judgeDevice('chrome_dnd_shared', rows, CLEAN);
  assert.equal(unfilled.pass, false);
  assert.ok(unfilled.reasons.some((x) => /^incomplete: .* on 1 of 9 samples .* so 8 were judged of the 9 planned, with 0 refilled of a bound of 9$/.test(x)), unfilled.reasons.join('\n'));
  // and the audit pass
  const a = judgeDevice('chrome_dnd_shared', planned(), audit([unmetEntry, cancelledEntry, { ...unmetEntry, fill: true }, { ...unmetEntry, fill: true }]));
  assert.equal(a.pass, false);
  assert.ok(a.reasons.includes('the background audit is incomplete: Chrome never started a drag and drop on 3 of 4 audited requests (the premise unmet, ruling 823), so 1 was judged of the 2 planned, with 2 refilled of a bound of 2'), a.reasons.join('\n'));
  // a refill past the bound is the runner's fault, and fails
  const over = judgeDevice('chrome_dnd_shared', [...planned(), ...[3, 4, 5, 6].flatMap((b) => block(b, [inTime(), inTime(), inTime()], { fill: true }))], CLEAN);
  assert.ok(over.reasons.includes('12 samples refilled past the bound of 9'), over.reasons.join('\n'));
});

test('negative control: an excluded sample is never counted as a pass', () => {
  // every sample unmet, the bound spent: nothing judged, never a vacuous pass
  const all = [...[0, 1, 2].flatMap((b) => block(b, [unmet(), unmet(), unmet()])), ...[3, 4, 5].flatMap((b) => block(b, [unmet(), unmet(), unmet()], { fill: true }))];
  const r = judgeDevice('chrome_dnd_shared', all, audit([unmetEntry, unmetEntry, { ...unmetEntry, fill: true }, { ...unmetEntry, fill: true }]));
  assert.equal(r.pass, false);
  assert.ok(r.reasons.some((x) => /^incomplete: .* on 18 of 18 samples/.test(x)), r.reasons.join('\n'));
  assert.ok(r.reasons.some((x) => /^the background audit is incomplete: .* on 4 of 4 audited requests/.test(x)), r.reasons.join('\n'));
  // an unmet sample does not stand in for the late-take case's landed drop, nor the late case's late answer
  const notice = dndLateRefusal(app, 'move');
  const noDrop = row({ ok: true, reply_notice: null, read_ok: true, read_notice: true, next_ok: false, next_error: notice, expected_notice: notice, dropped: false, witness: true, drop_status: { before: BEFORE, after: TOOK } });
  const lt = judgeDevice('chrome_dnd_late_take_shared', [noDrop, { ...unmet({ read_ok: true, read_notice: false, next_ok: true, next_error: null, expected_notice: notice }), i: 1 }, { ...noDrop, block: 1, fill: true }], audit([unmetEntry, { ...unmetEntry, ok: true, drop_status: { before: BEFORE, after: TOOK } }, { ...unmetEntry, fill: true, drop_status: { before: BEFORE, after: TOOK } }]));
  assert.equal(lt.pass, false);
  assert.ok(lt.reasons.includes('no drop landed: the case showed no change for the notice to report'), lt.reasons.join('\n'));
  const quiet = { state_notice: null, next_ok: true, next_error: null };
  const late = dndMayHaveDroppedSentence(app);
  const nothing = row({ ok: false, error: cancelled, expected_error: cancelled, late_error: late, reply_notice: null, dropped: false, witness: true, dnd: { in_front: false, outcome: 'in_time' }, drop_status: { before: BEFORE, after: TOOK }, ...quiet });
  const lateCell = judgeDevice('chrome_dnd_late_shared', [nothing, { ...unmet(quiet), i: 1, late_error: late }, { ...nothing, block: 1, fill: true }], audit([{ ...cancelledEntry, late_error: late }]));
  assert.ok(lateCell.reasons.includes('no answer said the drop may have happened: no cancel came too late'), lateCell.reasons.join('\n'));
});

test("negative control: ruling 762's late take during an audit pass still fails", () => {
  // the first audited drag answered ok, Chrome's take after its release, the second refused with the late notice
  const lateTook = { ...unmetEntry, drop_status: { before: BEFORE, after: TOOK } };
  const refused = { ok: false, error: dndLateRefusal(app, 'drag'), expected_error: cancelled, late_error: null, reply_notice: null, drop_status: { before: TOOK, after: TOOK } };
  const r = judgeDevice('chrome_dnd_shared', planned(), audit([lateTook, refused]));
  assert.equal(r.pass, false);
  assert.match(r.reasons.join('\n'), /the background audit's requests did not answer as the case expects \(success; Pending from your last drag/);
  // and where the page could not show the take, the late refusal after it still shows Chrome took
  const r2 = judgeDevice('chrome_dnd_shared', planned(), audit([unmetEntry, refused]));
  assert.equal(r2.pass, false);
  assert.match(r2.reasons.join('\n'), /did not answer as the case expects \(success; /);
  assert.equal(r2.premise_unmet, undefined);
});

test('the late takes of ruling 756 stay judged by their own rules beside an excluded sample', () => {
  const late = { after_release_ms: 2.353375, app, escape_after_release_ms: 4.46738, escaped: true };
  const page = { ...TOOK };
  const plain = unmet({ drop_status: { before: BEFORE, after: TOOK } });
  const refusedRow = row({ ok: false, error: dndLateRefusal(app, 'drag'), expected_error: cancelled, dropped: false, drop_status: { before: page, after: page }, engine_stats: { command: 'drag', late_dnd: late } });
  const rows = [plain, { ...refusedRow, i: 1 }, { ...inTime(), i: 2 }, ...block(1, [unmet(), inTime(), inTime()]), ...block(2, [inTime(), inTime(), inTime()]), ...block(3, [inTime(), inTime(), inTime()], { fill: true })];
  const r = judgeDevice('chrome_dnd_shared', rows, CLEAN);
  assert.deepEqual(r.reasons, []);
  assert.equal(r.premise_unmet.timed.unmet, 1, "756's late take is not an unmet premise");
  assert.deepEqual(r.premise_unmet.timed.unmet_samples, ['1/0']);
});

test('a drop cell keeps ruling 650: a plain ok with no drop and no session is a false ok, never excluded', () => {
  const op = 'chrome_dnd_in_front_shared';
  const r = judgeDevice(op, [row({ ok: true, effect: false, route: 'background', dnd: { in_front: true }, desktop_same: true, state_notice: null, reply_notice: null, drop_status: { before: BEFORE, after: PLAIN } })], audit([{ ok: true }]));
  assert.equal(r.pass, false);
  assert.match(r.reasons.join('\n'), /a drag answered ok with no drop and nothing pending on 1 of 1 samples/);
  assert.equal(r.premise_unmet, undefined);
});

test("the fill: how many more samples a pass needs, never past as many as it planned", () => {
  const nextInBlock = (rows) => (r) => rows.find((x) => x.block === r.block && x.i === r.i + 1);
  const rows = planned();
  assert.deepEqual(fillNeed(splitPremise(rows, nextInBlock(rows))), { need: 0, room: 9 });
  rows[0] = { ...unmet(), block: 0, i: 0 };
  rows[5] = { ...unmet(), block: 1, i: 2 };
  assert.deepEqual(fillNeed(splitPremise(rows, nextInBlock(rows))), { need: 2, room: 9 });
  const enough = [...rows, ...block(3, [unmet(), inTime(), inTime()], { fill: true })];
  assert.deepEqual(fillNeed(splitPremise(enough, nextInBlock(enough))), { need: 0, room: 6 }, 'nine judged again');
  const short = [...rows, ...block(3, [unmet(), unmet(), inTime()], { fill: true })];
  assert.deepEqual(fillNeed(splitPremise(short, nextInBlock(short))), { need: 1, room: 6 });
  const spent = [...rows, ...[3, 4, 5].flatMap((b) => block(b, [unmet(), unmet(), unmet()], { fill: true }))];
  assert.deepEqual(fillNeed(splitPremise(spent, nextInBlock(spent))), { need: 0, room: 0 }, 'the bound hit: no more');
});

test('refill runs more samples until the planned count is judged or the bound is spent, and stops when a round adds none', async () => {
  const seq = (entries) => (e, i) => entries[i + 1];
  // one unmet audited request, refilled by one good one
  const entries = [unmetEntry, cancelledEntry];
  const asked = [];
  await refill(entries, seq(entries), async ({ need, room }) => {
    asked.push({ need, room });
    entries.push({ ...cancelledEntry, fill: true });
  });
  assert.deepEqual(asked, [{ need: 1, room: 2 }]);
  assert.equal(entries.length, 3);
  // every refill unmet: two rounds, then the bound
  const bad = [unmetEntry, cancelledEntry];
  const rounds = [];
  await refill(bad, seq(bad), async ({ need, room }) => {
    rounds.push({ need, room });
    bad.push({ ...unmetEntry, fill: true });
  });
  assert.deepEqual(rounds, [{ need: 1, room: 2 }, { need: 1, room: 1 }]);
  // a round that adds nothing (its samples not taken) spends the bound it asked for, and never loops
  const stuck = [unmetEntry, cancelledEntry];
  let calls = 0;
  await refill(stuck, seq(stuck), async () => {
    calls++;
  });
  assert.equal(calls, 2);
  // nothing unmet: nothing run
  const fine = [cancelledEntry, cancelledEntry];
  await refill(fine, seq(fine), async () => assert.fail('nothing to refill'));
});

test("an audited request keeps what the ruling reads of its sample, so the audit pass's premise can be shown", () => {
  const sample = unmet({ state_notice: null, next_ok: true, next_error: null, witness: null, route: 'background' });
  assert.deepEqual(premiseFields(sample), { reply_notice: null, drop_status: { before: BEFORE, after: PLAIN }, dropped: false, state_notice: null, next_ok: true, next_error: null });
  // the kept entry, beside the audit's own fields, reads as its sample does
  const entry = { ok: true, error: null, expected_error: cancelled, late_error: null, ...premiseFields(sample) };
  assert.equal(classifyPremise(entry), 'unmet');
  assert.deepEqual(premiseFields({ ok: true }), {}, 'a row with none of them keeps nothing');
});

test("a run's summary reports each cell's unmet premise as a rate, the timed pass and the audit apart", () => {
  assert.deepEqual(premiseMarkdown([{ kind: 'verdict', scene: 'device-chrome-dnd', op: 'chrome_dnd_shared', pass: true }]), [], 'nothing excluded or refilled: no table');
  const timed = { samples: 12, unmet: 1, rate: 0.083, planned: 9, refilled: 3, judged: 11, unmet_samples: ['1/1'] };
  const audited = { samples: 4, unmet: 3, rate: 0.75, planned: 2, refilled: 2, judged: 1, unmet_samples: ['audit/0', 'audit/2', 'audit/3'] };
  const lines = premiseMarkdown([
    { kind: 'verdict', scene: 'device-chrome-dnd', op: 'chrome_dnd_shared', pass: true, premise_unmet: { timed } },
    { kind: 'verdict', scene: 'device-chrome-dnd', op: 'chrome_dnd_late_take_shared', pass: false, premise_unmet: { audit: audited } },
  ]);
  assert.match(lines.join('\n'), /ruling 823/);
  assert.ok(lines.includes('| device-chrome-dnd | chrome_dnd_shared | timed | 1 of 12 (8.3%) | 3 of 9 | 11 of 9 | 1/1 |'), lines.join('\n'));
  assert.ok(lines.includes('| device-chrome-dnd | chrome_dnd_late_take_shared | audit | 3 of 4 (75%) | 2 of 2 | **1 of 2** | audit/0, audit/2, audit/3 |'), lines.join('\n'));
});
