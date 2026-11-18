// The design session's ruling 823 in V5's judge: a plain-drag ok whose page shows Chrome never started a drag session is
// excluded and counted within its run; anything else is judged as before. Every sample here is made through the real paths
// (premise-fixture.mjs): the case's own read of a page tree carrying the drag page's status lines as the page writes
// them, drag.mjs's parser, the case's own check and its evidence record.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { DEVICE_OPS, PREMISE_OPS, dndLateNotice, dndLateRefusal, dndMayHaveDroppedSentence, dndUnconfirmedNotice, judgeDevice } from '../../scripts/linux-engine-diff/device.mjs';
import { adjacency, bindAudit, classifyPremise, noDragSession, parsePageRead } from '../../scripts/linux-engine-diff/premise.mjs';
import { APP, CANCEL, cancelled, HELD_CANCEL, HELD_UNMET, UNMET, WINDOW, caseSamples, dndLine, engineBin, movesLine, removeScratch, scratch } from './premise-fixture.mjs';

after(removeScratch);

const dir = scratch('judge');
const bin = engineBin(dir);
let runs = 0;
/**
 * A run of one case through the real paths, in an out directory of its own whose results begin with the run's meta row
 * (its recorded plan: `blocks`, as run.mjs writes it, `metaBlocks` to record another): its rows, its audit, and the
 * audit's entries bound to the evidence.
 */
async function made(op, blocks, audit = [], { answers = {}, metaBlocks = blocks.length } = {}) {
  const run = `t-${++runs}`;
  const out = join(dir, run);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'results.jsonl'), `${JSON.stringify({ run, kind: 'meta', blocks: metaBlocks })}\n`);
  const { rows, answered, label } = await caseSamples({ out, run, op, bin, blocks, audit, answers });
  return { run, rows, answered, label, audit: { clean: true, kind: 'background', answered } };
}
/** A made run's audit bound to its own evidence lines, its window and its fixture. */
const bound = (r, op = 'chrome_dnd_shared', ls = lines(r.run)) => bindAudit(r.audit, ls, { run: r.run, scene: 'device-chrome-dnd', op, expect: DEVICE_OPS[op].device, window: WINDOW, label: r.label });
/** A made run judged from a sidecar: its timed lines as recorded, its audit lines `auditLines` (as recorded by default). */
const judgeWith = (r, op, auditLines = lines(r.run).filter((l) => l.block === 'audit')) =>
  judgeDevice(op, r.rows, r.audit, { lines: [...lines(r.run).filter((l) => l.block !== 'audit'), ...auditLines], window: WINDOW });
/** The verdict's line when its only failures are shortages (route D, ruling 841). */
const ONLY = /^incomplete only by (\d+) proven premise-unmet samples? \(a whole V5 rerun under §8\.2, the controller's call\)$/;
const three = (spec) => [spec, spec, spec];
const planned = (spec = CANCEL) => [three(spec), three(spec), three(spec)];
const reasons = (v) => v.reasons.join('\n');

test('the cells where the unmet premise can occur are the cancel, late and late-take cells of the drag page, no others', () => {
  assert.deepEqual([...PREMISE_OPS].sort(), ['chrome_dnd_late_shared', 'chrome_dnd_late_take_shared', 'chrome_dnd_obscured_in_front_late_shared', 'chrome_dnd_obscured_in_front_shared', 'chrome_dnd_shared']);
  // a drop cell's plain ok with no drop is ruling 650's false ok, never an unmet premise
  for (const op of PREMISE_OPS) assert.ok(!DEVICE_OPS[op].confirm, op);
});

test("a plain-drag ok the page saw released with no drag is unmet; one Chrome took is not; a run short only by it reads incomplete, its cause named, the rate cold and warm apart", async () => {
  const r = await made('chrome_dnd_shared', [[UNMET, CANCEL, CANCEL], three(CANCEL), three(CANCEL)], [CANCEL, CANCEL]);
  const next = adjacency(r.rows);
  assert.equal(classifyPremise(r.rows[0], next(r.rows[0])), 'unmet');
  assert.equal(classifyPremise(r.rows[1], next(r.rows[1])), 'started', "the engine's take, and the page's");
  assert.equal(noDragSession(r.rows[0].premise_evidence), true);
  const v = judgeDevice('chrome_dnd_shared', r.rows, r.audit);
  assert.equal(v.pass, false);
  assert.match(v.reasons[0], ONLY, 'the cause first, in the verdict itself');
  assert.equal(v.reasons[0].match(ONLY)[1], '1');
  assert.ok(v.reasons.slice(1).every((r) => /^incomplete:/.test(r)), reasons(v));
  assert.deepEqual(v.premise_unmet.timed.quotas, { cold: { samples: 3, unmet: 1, rate: 0.333 }, warm: { samples: 6, unmet: 0, rate: 0 } });
  assert.match(reasons(v), /incomplete: Chrome never started a drag and drop on 1 of 9 samples .* so 2 cold were judged of the 3 planned$/m);
  assert.deepEqual(v.premise_unmet.timed.unmet_samples, ['0/0']);
  // nothing excluded: final as it stands, and a pass
  const clean = await made('chrome_dnd_shared', planned(), [CANCEL, CANCEL]);
  assert.deepEqual(judgeDevice('chrome_dnd_shared', clean.rows, clean.audit), { pass: true, reasons: [] });
});

test('negative control (finding 1): only explicit, whole status lines of this page and this attempt prove it; anything else is judged as now', async () => {
  const cut = (b, t) => [dndLine({ ...b, downs: b.downs + 1, ups: b.ups + 1, at: t }), movesLine(b.downs + 1, { up: 158 }).replace(/ cancel .*$/, '')];
  const noCancel = (b, t) => [dndLine({ ...b, downs: b.downs + 1, ups: b.ups + 1, at: t }), movesLine(b.downs + 1, { up: 158 }).replace(' cancel -1', '')];
  const shortMoves = (b, t) => [dndLine({ ...b, downs: b.downs + 1, ups: b.ups + 1, at: t }), movesLine(b.downs + 1, { up: 158 }).replace(/ m .*$/, ' m 0.0/0.4/0/0/1/1')];
  const twoLines = (b, t) => [dndLine({ ...b, downs: b.downs + 1, ups: b.ups + 1, at: t }), dndLine({ ...b, downs: b.downs + 2, ups: b.ups + 1, at: t }), movesLine(b.downs + 1, { up: 158 })];
  const stale = (b) => [dndLine({ ...b, downs: b.downs + 1, ups: b.ups + 1, at: (Date.now() - 60000) % 1e9 }), movesLine(b.downs + 1, { up: 158 })];
  const otherPress = (b, t) => [dndLine({ ...b, downs: b.downs + 1, ups: b.ups + 1, at: t }), movesLine(b.downs, { up: 158 })];
  const variants = [
    ['a log truncated after its pointerup', { lines: cut }],
    ['a log missing its pointercancel token', { lines: noCancel }],
    ['fewer moves than the log says', { lines: shortMoves }],
    ['two different status lines of one kind', { lines: twoLines }],
    ["a press outside the sample's attempt", { lines: stale }],
    ["the log of another press", { lines: otherPress }],
    ["a tree that does not carry the scene's page title", { titled: false }],
  ];
  for (const [what, spec] of variants) {
    const r = await made('chrome_dnd_shared', [[{ ...UNMET, ...spec }, CANCEL, CANCEL], three(CANCEL), three(CANCEL)], [CANCEL, CANCEL]);
    assert.equal(classifyPremise(r.rows[0]), 'unshown', what);
    const v = judgeDevice('chrome_dnd_shared', r.rows, r.audit);
    assert.match(reasons(v), /not cancelled with the drag-and-drop sentence on 1 of 9 samples \(0\/0\)/, what);
    assert.equal(v.premise_unmet, undefined, what);
    assert.ok(!v.reasons.some((r) => ONLY.test(r)), what);
  }
  // the parser itself: a whole line in the page's form, every token explicit
  const whole = { dnd: [dndLine({ starts: 1, drops: 0, downs: 2, ends: 1, ups: 1, at: 5 })], moves: [movesLine(2, { up: 158 })], titled: true };
  assert.equal(parsePageRead(whole).log.up, '158.0/158.4');
  assert.equal(parsePageRead({ ...whole, moves: [movesLine(2, { up: 158 }).replace(' end -1', '')] }), null, 'a token missing');
  assert.equal(parsePageRead({ ...whole, titled: false }), null, 'another page');
  // an explicit null page record, and evidence of none: unshown, never a throw
  const [row] = (await caseSamples({ out: dir, run: 't-nulls', op: 'chrome_dnd_shared', bin, blocks: [[UNMET]] })).rows;
  for (const nulls of [{ drop_status: null }, { premise_evidence: null }, { drop_status: null, premise_evidence: null }]) assert.equal(classifyPremise({ ...row, ...nulls }), 'unshown');
});

test('negative control (finding 2): an excluded sample whose own reads failed still fails its cell; a clean read with no notice does not', async () => {
  const notice = dndLateRefusal(APP, 'move');
  const landed = { reply: { ok: true }, page: 'took' };
  // the late-take case's plain drag Chrome never started, its read refused
  const failedRead = await made('chrome_dnd_late_take_shared', [[UNMET, landed, landed]], [], { answers: { list_windows: { ok: false, error: 'the bus did not answer' } } });
  const v = judgeDevice('chrome_dnd_late_take_shared', failedRead.rows, { clean: true, kind: 'skipped' });
  assert.match(reasons(v), /a sample excluded for its unmet premise failed its own reads on 1 of \d+ samples \(0\/0: the read after the drag failed \(the bus did not answer\)\)/);
  // the next acting request refused for something other than a pending drag
  const failedNext = await made('chrome_dnd_late_take_shared', [three(UNMET)], [], { answers: { move: { ok: false, error: 'Window 1 is minimized; activate it first' } } });
  assert.match(reasons(judgeDevice('chrome_dnd_late_take_shared', failedNext.rows, { clean: true, kind: 'skipped' })), /failed its own reads .*the next acting request failed \(Window 1 is minimized/);
  // the late case's window read refused
  const lateRead = await made('chrome_dnd_late_shared', [three(UNMET)], [], { answers: { get_window_state: { ok: false, error: 'no such window' } } });
  assert.match(reasons(judgeDevice('chrome_dnd_late_shared', lateRead.rows, { clean: true, kind: 'skipped' })), /the window read after the drag failed/);
  // a clean read with no notice is no failure: the sample is excluded and nothing else is said of it
  const clean = await made('chrome_dnd_late_take_shared', [three(UNMET)]);
  assert.equal(clean.rows[0].read_ok, true);
  assert.equal(clean.rows[0].read_notice, false);
  assert.ok(!reasons(judgeDevice('chrome_dnd_late_take_shared', clean.rows, { clean: true, kind: 'skipped' })).includes('failed its own reads'));
});

test('negative control (finding 3): warm samples never stand in for cold ones; each quota is judged on its own', async () => {
  // every cold drag excluded, and warm ones in plenty: short of its cold quota alone
  const main = await made('chrome_dnd_shared', [[UNMET, CANCEL, CANCEL], [UNMET, CANCEL, CANCEL], [UNMET, CANCEL, CANCEL]]);
  const v = judgeDevice('chrome_dnd_shared', main.rows, { clean: true, kind: 'skipped' });
  assert.equal(v.pass, false);
  assert.match(reasons(v), /so 0 cold were judged of the 3 planned$/m);
  assert.ok(!/warm were judged/.test(reasons(v)), 'the warm quota is met');
  assert.deepEqual(v.premise_unmet.timed.need, { cold: 3, warm: 0 });
  // a run whose cold drags are all judged passes on its quotas, final
  const good = await made('chrome_dnd_shared', [three(CANCEL), three(CANCEL), three(CANCEL)]);
  assert.deepEqual(judgeDevice('chrome_dnd_shared', good.rows, { clean: true, kind: 'skipped' }), { pass: true, reasons: [] });
});

test("negative control (review 3, finding 2): an existence condition with every sample excluded reads untested, never a failure of its own", async () => {
  // nine proven no-takes in the late-take cell, its audit clean: short, and nothing else
  const landed = { reply: { ok: true }, page: 'landed', row: { witness: false } };
  const take = await made('chrome_dnd_late_take_shared', planned(UNMET), [landed, landed]);
  const v = judgeDevice('chrome_dnd_late_take_shared', take.rows, take.audit);
  assert.equal(v.pass, false);
  assert.ok(!/no drop landed/.test(reasons(v)), reasons(v));
  assert.match(reasons(v), /^untested: every sample was excluded for its unmet premise, so whether a drop landed is untested$/m);
  assert.match(v.reasons[0], ONLY);
  assert.ok(v.reasons.slice(1).every((r) => /^(incomplete|untested):/.test(r)), reasons(v));
  // the late cell likewise
  const late = await made('chrome_dnd_late_shared', planned(UNMET));
  const l = judgeDevice('chrome_dnd_late_shared', late.rows, { clean: true, kind: 'skipped' });
  assert.ok(!/no answer said the drop may have happened/.test(reasons(l)), reasons(l));
  assert.match(reasons(l), /whether an answer said the drop may have happened is untested/);
  // with judged samples left, the condition is judged as usual: one judged plain drag and no drop is a failure
  const one = await made('chrome_dnd_late_take_shared', [[UNMET, UNMET, UNMET], [UNMET, UNMET, UNMET], [UNMET, UNMET, { reply: { ok: true }, page: 'took' }]], [landed, landed]);
  assert.match(reasons(judgeDevice('chrome_dnd_late_take_shared', one.rows, one.audit)), /^no drop landed/m);
});

test("negative control (review 3, finding 3): an audit line's follow-ups come only from its case's allowlist, each of its shape, and never replace a bound field", async () => {
  const OP = 'chrome_dnd_late_take_shared';
  const claim = { ...UNMET, reply: { ok: true, notice: dndUnconfirmedNotice(APP) } };
  const r = await made(OP, [three({ reply: { ok: true }, page: 'took' })], [claim, { reply: { ok: true }, page: 'took' }]);
  assert.equal(classifyPremise(bound(r, OP).entries[0]), 'false-claim', 'bound as recorded: a false claim');
  // the probe: a follow-up field that would replace the bound reply's notice
  const own = lines(r.run).filter((l) => l.block === 'audit');
  const forged = own.map((l) => ({ ...l, reads: { ...l.reads, reply_notice: null } }));
  const f = bound(r, OP, forged);
  assert.match(f.problems.join('\n'), /a follow-up field the late-take case does not record \(reply_notice\)/);
  assert.notEqual(classifyPremise(f.entries[0]), 'unmet', 'never excluded on it');
  // a required follow-up missing, or one not of its shape, binds nothing either
  const missing = own.map((l) => { const { next_ok, ...rest } = l.reads; return { ...l, reads: rest }; });
  assert.match(bound(r, OP, missing).problems.join('\n'), /its follow-up next_ok is missing/);
  assert.match(bound(r, OP, own.map((l) => ({ ...l, reads: { ...l.reads, read_ok: 'yes' } }))).problems.join('\n'), /its follow-up read_ok is not of its shape/);
  // and a cancel case's line carries none at all
  const c = await made('chrome_dnd_shared', planned(), [CANCEL, CANCEL]);
  const cl = lines(c.run).filter((l) => l.block === 'audit').map((l) => ({ ...l, reads: { state_ok: true } }));
  assert.match(bound(c, 'chrome_dnd_shared', cl).problems.join('\n'), /a follow-up field the cancel case does not record \(state_ok\)/);
  // the binding's problem fails the cell, and the independent audit check still judges the bare entries
  assert.match(reasons(judgeWith(r, OP, forged)), /does not fit it .*reply_notice/);
});

test('negative control (finding 4): a reply that claims or implies a drop where the page proves no session fails; stored rows that cannot show it keep the old judgment', async () => {
  const landed = { reply: { ok: true }, page: 'took' };
  const notice = dndLateRefusal(APP, 'move');
  // the late-take case's audited drag answered ok with an unconfirmed-drop notice, and the page proves no session
  const r = await made('chrome_dnd_late_take_shared', [three(landed)], [{ ...UNMET, reply: { ok: true, notice: dndUnconfirmedNotice(APP) } }, landed]);
  const v = judgeDevice('chrome_dnd_late_take_shared', r.rows, r.audit);
  assert.match(reasons(v), /answered as if it dropped where the page shows Chrome never started a drag and drop \(ruling 823\) on 1 of 2 audited requests \(audit\/0\)/);
  // the same with the read after the drag carrying the late notice, timed
  const read = await made('chrome_dnd_late_take_shared', [three(UNMET)], [], { answers: { list_windows: { notice: dndLateNotice(APP) }, move: { ok: false, error: notice } } });
  assert.match(reasons(judgeDevice('chrome_dnd_late_take_shared', read.rows, { clean: true, kind: 'skipped' })), /answered as if it dropped .* on 3 of 3 samples \(0\/0, 0\/1, 0\/2\)/);
  // the cancel case's may-have-dropped answer for a drag Chrome never started
  const may = await made('chrome_dnd_shared', [three({ ...UNMET, reply: { ok: false, error: dndMayHaveDroppedSentence(APP) } })]);
  assert.match(reasons(judgeDevice('chrome_dnd_shared', may.rows, { clean: true, kind: 'skipped' })), /answered as if it dropped/);
  // the stored form (no evidence): the late-take audit's ok passes as before
  const stored = judgeDevice('chrome_dnd_late_take_shared', r.rows, { clean: true, kind: 'background', answered: r.answered }, { lines: null, window: WINDOW });
  assert.ok(!reasons(stored).includes('answered as if it dropped'), reasons(stored));
});

test("negative control (finding 6): one adjacency rule, the next request on the same engine lifecycle, never across lifecycles", async () => {
  // a plain ok in one audit lifecycle, and another lifecycle's request refused with the late notice right after it
  const a = await made('chrome_dnd_shared', [], [UNMET, CANCEL]);
  const b = await made('chrome_dnd_shared', [], [{ reply: { ok: false, error: dndLateRefusal(APP, 'drag') }, page: 'took' }, CANCEL]);
  const entries = [...bound(a).entries, ...bound(b).entries];
  const next = adjacency(entries);
  assert.equal(next(entries[1]), null, "the first lifecycle's last request has no next, never the refusal in another");
  assert.equal(next(entries[0]), entries[1], 'within a lifecycle, the next request');
  assert.equal(next(entries[2]), entries[3]);
  assert.equal(classifyPremise(entries[0], next(entries[0])), 'unmet');
  // in a stored audit of more than one lifecycle the boundary is unknown: no adjacency at all
  const legacy = bindAudit({ answered: a.answered.concat(a.answered), lifecycles: 2 }, null, { run: 'x' }).entries;
  assert.equal(adjacency(legacy)(legacy[0]), null);
});
const lines = (run) => readFileSync(join(dir, run, 'premise-evidence.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.run === run);

test("ruling 762's late take in an audit pass still fails, and 756's late take stays judged by its own rules", async () => {
  const refused = { reply: { ok: false, error: dndLateRefusal(APP, 'drag') }, page: (b, t) => ({ counts: { ...b, at: t }, moves: movesLine(b.downs, { start: 0, cancel: 90, end: 160 }) }) };
  const late = { reply: { ok: true }, page: 'took', row: { dnd: { outcome: 'no_start', started: false, in_front: false, held_at_start: false }, press: { taken: false } } };
  const r = await made('chrome_dnd_shared', planned(), [late, refused]);
  const v = judgeDevice('chrome_dnd_shared', r.rows, r.audit);
  assert.match(reasons(v), /the background audit's requests did not answer as the case expects \(success; Pending from your last drag/);
  assert.equal(v.premise_unmet, undefined);
});

test('a drop cell keeps ruling 650: a plain ok with no drop where Chrome never started is a false ok, never excluded', async () => {
  // the drop cells' own checks need a display (in front, or dedicated): the sample is a premise case's, its evidence on it
  const [row] = (await made('chrome_dnd_shared', [[UNMET]])).rows;
  const v = judgeDevice('chrome_dnd_in_front_shared', [{ ...row, effect: false, route: 'background', dnd: { in_front: true }, desktop_same: true, state_notice: null }], { clean: true, kind: 'background', answered: [{ ok: true }] });
  assert.match(reasons(v), /a drag answered ok with no drop and nothing pending on 1 of 1 samples/);
  assert.equal(v.premise_unmet, undefined);
  // outside the premise cells a check keeps no evidence (a refusal case's, display-free)
  const desktop = { run: 't-none', logs: join(dir, 'apps'), oracle: { text: () => 'cua171' } };
  const out = await DEVICE_OPS.gte_type_text_shared.check({ desktop, scene: { id: 1, app: 'org.gnome.TextEditor', field: 'f', lastRequest: {} }, before: 'cua171' }, { id: 1, ok: false, error: 'x' });
  assert.equal('premise_evidence' in out || 'reply_notice' in out, false);
});

test('negative control: an excluded sample is never counted as a pass: a run of nothing but unmet samples is incomplete', async () => {
  const all = await made('chrome_dnd_shared', planned(UNMET), [UNMET, UNMET]);
  const v = judgeWith(all, 'chrome_dnd_shared');
  assert.equal(v.pass, false);
  assert.match(reasons(v), /incomplete: .* on 9 of 9 samples .* so 0 cold were judged of the 3 planned$/m);
  assert.match(reasons(v), /the background audit is incomplete: .* on 2 of 2 audited requests .* so 0 were judged of the 2 planned$/m);
});

test('evidence that does not fit its samples is never excluded on, and fails the cell closed', async () => {
  const r = await made('chrome_dnd_shared', planned(), [UNMET, CANCEL]);
  const own = lines(r.run).filter((l) => l.block === 'audit');
  const bind = (ls) => judgeWith(r, 'chrome_dnd_shared', ls);
  assert.match(reasons(bind(own.slice(1))), /does not fit it .*no line for audit\/0/);
  assert.match(reasons(bind([...own, own[0]])), /2 lines for audit\/0/);
  assert.match(reasons(bind([...own, { ...own[0], run: 'another' }])), /a line of another run \(another\)/);
  assert.match(reasons(bind(own.map((l) => ({ ...l, window: 7 })))), /a line on another window/);
  // and a timed row whose evidence names another sample
  const moved = r.rows.map((x, i) => (i === 0 ? { ...x, premise_evidence: { ...x.premise_evidence, i: 5 } } : x));
  assert.match(reasons(judgeDevice('chrome_dnd_shared', moved, r.audit)), /the premise evidence of the timed samples does not fit them .*0\/0's evidence names another sample/);
});

test("negative control (review 2, finding 3): an audit line of a foreign fixture, or with no notice field, is never excluded on and fails the cell", async () => {
  const r = await made('chrome_dnd_shared', planned(), [UNMET, CANCEL]);
  assert.equal(classifyPremise(bound(r).entries[0]), 'unmet', 'bound to its own fixture, the unmet premise reads');
  const own = lines(r.run).filter((l) => l.block === 'audit');
  // a prior run of the same name, on the same XID, its own nonce
  const foreign = own.map((l) => (l.i === 0 ? { ...l, fixture: { label: l.fixture.label.replace(/-[0-9a-f]{8}-/, '-0badc0de-') } } : l));
  const f = bound(r, 'chrome_dnd_shared', foreign);
  assert.match(f.problems.join('\n'), /audit\/0's line is of another fixture/);
  assert.ok(f.entries.every((e) => !e.premise_evidence), 'no entry keeps evidence: judged as before');
  assert.match(reasons(judgeWith(r, 'chrome_dnd_shared', foreign)), /does not fit it .*another fixture/);
  // the reply's notice field absent: never read as none
  const noNotice = own.map((l) => (l.i === 0 ? { ...l, reply: { ok: l.reply.ok, error: l.reply.error } } : l));
  assert.match(bound(r, 'chrome_dnd_shared', noNotice).problems.join('\n'), /audit\/0's line does not record the reply's ok, error and notice/);
  // no fixture or window to bind to: nothing binds
  assert.match(bindAudit(r.audit, own, { run: r.run, scene: 'device-chrome-dnd', op: 'chrome_dnd_shared', window: WINDOW }).problems.join('\n'), /no fixture label of run/);
  assert.match(bindAudit(r.audit, own, { run: r.run, scene: 'device-chrome-dnd', op: 'chrome_dnd_shared', label: r.label }).problems.join('\n'), /no audited window/);
  // and a timed row whose evidence names another run's fixture, or lacks the notice field
  const moved = r.rows.map((x, i) => (i === 0 ? { ...x, premise_evidence: { ...x.premise_evidence, fixture: { label: 'cua171-diff-other-0badc0de-device_cua' } } } : x));
  assert.match(reasons(judgeDevice('chrome_dnd_shared', moved, r.audit)), /0\/0's evidence names a fixture not of run/);
});

test("negative control (review 2, finding 5): an obscured case's no-session sample whose engine guard was not held still fails on that guard", async () => {
  const OBS = 'chrome_dnd_obscured_in_front_shared';
  const unheld = { ...HELD_UNMET, row: { ...HELD_UNMET.row, dnd: { ...HELD_UNMET.row.dnd, in_front: true, held_at_start: false } } };
  const main = await made(OBS, [[unheld, HELD_CANCEL, HELD_CANCEL], [HELD_CANCEL, HELD_CANCEL, HELD_CANCEL], [HELD_CANCEL, HELD_CANCEL, HELD_CANCEL]]);
  const next = adjacency(main.rows);
  assert.equal(classifyPremise(main.rows[0], next(main.rows[0])), 'unmet', 'the drag is unmet');
  // the shortage is counted, and the guard's failure stands beside it, a failure of its own
  const v = judgeDevice(OBS, main.rows, { clean: true, kind: 'skipped' });
  assert.equal(v.pass, false);
  assert.match(reasons(v), /the engine did not watch the drag with the signature already held on 1 of 9 samples \(0\/0\)/);
  assert.match(reasons(v), /^incomplete:/m);
  // with the guard held, the same cell is short and nothing else
  const held = await made(OBS, [[HELD_UNMET, HELD_CANCEL, HELD_CANCEL], [HELD_CANCEL, HELD_CANCEL, HELD_CANCEL], [HELD_CANCEL, HELD_CANCEL, HELD_CANCEL]]);
  const short = judgeDevice(OBS, held.rows, { clean: true, kind: 'skipped' });
  assert.match(short.reasons[0], ONLY);
  assert.ok(short.reasons.slice(1).every((r) => /^incomplete:/.test(r)));
});

test("negative control (review 4, finding 1): a timed row's ok, error and notice must be its evidence's reply, or nothing is excluded", async () => {
  const OP = 'chrome_dnd_shared';
  // the probe: the evidence says the reply carried an unconfirmed-drop notice, the row says none
  const r = await made(OP, [[{ ...UNMET, reply: { ok: true, notice: dndUnconfirmedNotice(APP) } }, CANCEL, CANCEL], three(CANCEL), three(CANCEL)], [CANCEL, CANCEL]);
  const forged = r.rows.map((x, i) => (i === 0 ? { ...x, reply_notice: null } : x));
  const v = judgeDevice(OP, forged, r.audit);
  assert.equal(v.premise_unmet, undefined, 'never excluded');
  assert.match(reasons(v), /0\/0's row does not answer as its evidence's reply \(notice\)/);
  assert.match(reasons(v), /not cancelled with the drag-and-drop sentence on 1 of 9 samples \(0\/0\)/, 'judged as now');
  // the row's ok or error against its evidence's
  const plain = await made(OP, [[UNMET, CANCEL, CANCEL], three(CANCEL), three(CANCEL)], [CANCEL, CANCEL]);
  for (const [what, edit] of [['ok', { ok: false, error: cancelled }], ['error', { error: 'something else' }]]) {
    const w = judgeDevice(OP, plain.rows.map((x, i) => (i === 0 ? { ...x, ...edit } : x)), plain.audit);
    assert.equal(w.premise_unmet, undefined, what);
    assert.match(reasons(w), new RegExp(`0/0's row does not answer as its evidence's reply \\(${what}`), what);
  }
});

test('negative control (review 4, finding 4): a slot not of the plan, a skipped audit with lines, or no sidecar excludes nothing', async () => {
  const OP = 'chrome_dnd_shared';
  const r = await made(OP, [[UNMET, CANCEL, CANCEL], three(CANCEL), three(CANCEL)], [CANCEL, CANCEL]);
  // a cold slot whose row says warm (the probe's 0/0), a doubled slot, a missing one
  for (const [what, rows, expected] of [
    ['warm at 0/0', r.rows.map((x, i) => (i === 0 ? { ...x, series: 'warm' } : x)), /0\/0 is the cold slot of its series, its row says warm/],
    ['a doubled slot', [...r.rows, r.rows[4]], /2 rows for 1\/1/],
    ['a missing slot', r.rows.filter((x) => !(x.block === 1 && x.i === 2)), /no row for 1\/2/],
  ]) {
    const v = judgeDevice(OP, rows, r.audit);
    assert.equal(v.premise_unmet, undefined, what);
    assert.match(reasons(v), expected, what);
  }
  // the runner's skipped-audit sentinel with audit lines recorded, one of them with an invalid follow-up: fails
  const badLines = lines(r.run).map((l) => (l.block === 'audit' && l.i === 0 ? { ...l, reads: { state_ok: 'x' } } : l));
  const skipped = judgeDevice(OP, r.rows, { clean: true, kind: 'skipped' }, { lines: badLines, window: WINDOW });
  assert.match(reasons(skipped), /2 audit evidence lines for an audit the run skipped/);
  // an explicit --no-audit run: its sentinel and no audit lines, judged rightly, its timed exclusion counted
  const noAudit = await made(OP, [[UNMET, CANCEL, CANCEL], three(CANCEL), three(CANCEL)]);
  const n = judgeDevice(OP, noAudit.rows, { clean: true, kind: 'skipped' });
  assert.match(n.reasons[0], ONLY);
  assert.ok(n.reasons.slice(1).every((x) => /^incomplete:/.test(x)), reasons(n));
  // no sidecar at all: nothing is excluded, the sample judged as now
  const none = judgeDevice(OP, r.rows, r.audit, { lines: null, window: WINDOW });
  assert.equal(none.premise_unmet, undefined);
  assert.match(reasons(none), /not cancelled with the drag-and-drop sentence on 1 of 9 samples \(0\/0\)/);
  // a planned audit excludes only when both its requests bind: an audit that recorded one
  const one = await made(OP, planned(), [UNMET]);
  const o = judgeWith(one, OP);
  assert.equal(o.premise_unmet, undefined);
  assert.match(reasons(o), /the audit recorded 1 request, its plan 2/);
});

test('a run failing otherwise as well as short names both: the cause of the shortage and the other failure', async () => {
  const OP = 'chrome_dnd_shared';
  const dropped = { ...CANCEL, page: 'landed' };
  const r = await made(OP, [[UNMET, CANCEL, CANCEL], [CANCEL, dropped, CANCEL], three(CANCEL)], [CANCEL, CANCEL]);
  const v = judgeDevice(OP, r.rows, r.audit);
  assert.equal(v.pass, false);
  assert.match(v.reasons[0], /^incomplete by 1 proven premise-unmet sample, and failing for more than that \(below\)$/);
  assert.match(reasons(v), /^incomplete: Chrome never started/m);
  assert.match(reasons(v), /^it dropped on 1 of 8 samples \(1\/1\)$/m);
});

test("negative control (review 5, finding 1): an audit answer's own fields never bind: only a successful binding attaches evidence or a notice", async () => {
  const OP = 'chrome_dnd_shared';
  const r = await made(OP, planned(), [UNMET, CANCEL]);
  const evidence = lines(r.run).find((l) => l.block === 'audit' && l.i === 0);
  // the probe: the answer carrying the evidence and a null notice itself, with no sidecar
  const forged = { ...r.audit, answered: r.audit.answered.map((a, i) => (i === 0 ? { ...a, premise_evidence: evidence, reply_notice: null, lifecycle: evidence.lifecycle } : a)) };
  const none = judgeDevice(OP, r.rows, forged, { lines: null, window: WINDOW, plan: { blocks: 3, audit: true } });
  assert.equal(none.premise_unmet, undefined, 'no sidecar: nothing excluded');
  assert.ok(!none.reasons.some((x) => ONLY.test(x)), reasons(none));
  // and with the sidecar present but the request's own line missing
  const missing = judgeDevice(OP, r.rows, forged, { lines: lines(r.run).filter((l) => !(l.block === 'audit' && l.i === 0)), window: WINDOW, plan: { blocks: 3, audit: true } });
  assert.equal(missing.premise_unmet, undefined);
  assert.match(reasons(missing), /no line for audit\/0/);
  // the bare entries carry the runner's four reply fields and nothing else of the answer's
  const bare = bindAudit(forged, null, { run: r.run }).entries[0];
  assert.deepEqual(Object.keys(bare).filter((k) => !['i', 'run', 'block', 'lifecycle'].includes(k)).sort(), ['error', 'expected_error', 'late_error', 'ok']);
});

test('negative control (review 5, finding 2): timed binding is one-to-one both ways: a line its row does not carry is a binding error', async () => {
  const OP = 'chrome_dnd_shared';
  const r = await made(OP, [[UNMET, CANCEL, CANCEL], [UNMET, CANCEL, CANCEL], three(CANCEL)], [CANCEL, CANCEL]);
  // the probe: one row's embedded evidence removed, its sidecar line given a foreign fixture
  const rows = r.rows.map((x, i) => (i === 0 ? (({ premise_evidence, ...rest }) => rest)(x) : x));
  const side = lines(r.run).map((l) => (l.block === 0 && l.i === 0 ? { ...l, fixture: { label: 'cua171-diff-t-x-0badc0de-device_cua' } } : l));
  const v = judgeDevice(OP, rows, r.audit, { lines: side, window: WINDOW, plan: { blocks: 3, audit: true } });
  assert.equal(v.premise_unmet, undefined, 'the other no-take is not counted either');
  assert.match(reasons(v), /a sidecar line for 0\/0, whose row carries no evidence/);
});

test('negative control (review 5, finding 3): the rows and the audit are checked against the recorded plan, whether or not evidence exists', async () => {
  const OP = 'chrome_dnd_shared';
  // the probe: the meta records 3 blocks, both records hold block 0 only, the audit complete
  const r = await made(OP, [three(CANCEL)], [CANCEL, CANCEL], { metaBlocks: 3 });
  const v = judgeDevice(OP, r.rows, r.audit);
  assert.equal(v.pass, false);
  assert.match(reasons(v), /no row for 1\/0/);
  assert.match(reasons(v), /no row for 2\/2/);
  // a one-response background audit, with no sidecar
  const one = await made(OP, planned(), [CANCEL]);
  const o = judgeDevice(OP, one.rows, one.audit, { lines: null, window: WINDOW, plan: { blocks: 3, audit: true } });
  assert.match(reasons(o), /the audit recorded 1 request, its plan 2/);
  // an audit the plan has none for (`--no-audit`) with an audit's answers, and the other way
  assert.match(reasons(judgeDevice(OP, r.rows, r.audit, { lines: null, window: WINDOW, plan: { blocks: 1, audit: false } })), /an audit its plan has none for/);
  assert.match(reasons(judgeDevice(OP, r.rows, { clean: true, kind: 'skipped' }, { lines: null, window: WINDOW, plan: { blocks: 1, audit: true } })), /no audit, where its plan has one/);
  // a plan not recorded (rows from before the meta carried it): judged as before, marked, nothing excluded
  const u = await made(OP, [[UNMET, CANCEL, CANCEL], three(CANCEL), three(CANCEL)], [CANCEL, CANCEL]);
  const unverified = judgeDevice(OP, u.rows, u.audit, { lines: lines(u.run), window: WINDOW, plan: null });
  assert.equal(unverified.plan_unverified, true);
  assert.equal(unverified.premise_unmet, undefined);
  assert.match(reasons(unverified), /not cancelled with the drag-and-drop sentence on 1 of 9 samples \(0\/0\)/);
});

test('negative control (review 5, finding 4): a binding error in either pass excludes nothing in the cell, and both passes are judged from their own rows', async () => {
  const OP = 'chrome_dnd_shared';
  // a timed binding error (a row's notice not its evidence's) beside an unmet audited request
  const r = await made(OP, planned(), [UNMET, CANCEL]);
  const rows = r.rows.map((x, i) => (i === 4 ? { ...x, reply_notice: 'a notice' } : x));
  const t = judgeDevice(OP, rows, r.audit);
  assert.equal(t.premise_unmet, undefined, 'the audit excludes nothing');
  assert.match(reasons(t), /1\/1's row does not answer as its evidence's reply \(notice\)/);
  assert.match(reasons(t), /the background audit's requests did not answer as the case expects \(success;/, 'the audit judged from its own answers');
  // an audit binding error beside an unmet timed sample
  const a = await made(OP, [[UNMET, CANCEL, CANCEL], three(CANCEL), three(CANCEL)], [CANCEL, CANCEL]);
  const b = judgeWith(a, OP, lines(a.run).filter((l) => !(l.block === 'audit' && l.i === 1)));
  assert.equal(b.premise_unmet, undefined, 'the timed pass excludes nothing');
  assert.match(reasons(b), /no line for audit\/1/);
  assert.match(reasons(b), /not cancelled with the drag-and-drop sentence on 1 of 9 samples \(0\/0\)/);
});
