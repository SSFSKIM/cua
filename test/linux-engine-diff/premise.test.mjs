// The design session's ruling 823 in V5's judge: a plain-drag ok whose page shows Chrome never started a drag session is
// excluded, counted and refilled; anything else is judged as before. Every sample here is made through the real paths
// (premise-fixture.mjs): the case's own read of a page tree carrying the drag page's status lines as the page writes
// them, drag.mjs's parser, the case's own check and its evidence record.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { DEVICE_OPS, PREMISE_OPS, dndLateNotice, dndLateRefusal, dndMayHaveDroppedSentence, dndUnconfirmedNotice, judgeDevice } from '../../scripts/linux-engine-diff/device.mjs';
import { adjacency, bindAudit, classifyPremise, noDragSession, parsePageRead } from '../../scripts/linux-engine-diff/premise.mjs';
import { APP, CANCEL, UNMET, caseSamples, dndLine, engineBin, movesLine, removeScratch, scratch } from './premise-fixture.mjs';

after(removeScratch);

const dir = scratch('judge');
const bin = engineBin(dir);
let runs = 0;
/** A run of one case through the real paths: its rows, its audit, and the audit's entries bound to the evidence. */
async function made(op, blocks, audit = [], { answers = {} } = {}) {
  const run = `t-${++runs}`;
  const { rows, answered } = await caseSamples({ out: dir, run, op, bin, blocks, audit, answers });
  return { run, rows, answered, audit: { clean: true, kind: 'background', answered } };
}
const three = (spec) => [spec, spec, spec];
const planned = (spec = CANCEL) => [three(spec), three(spec), three(spec)];
const reasons = (v) => v.reasons.join('\n');

test('the cells where the unmet premise can occur are the cancel, late and late-take cells of the drag page, no others', () => {
  assert.deepEqual([...PREMISE_OPS].sort(), ['chrome_dnd_late_shared', 'chrome_dnd_late_take_shared', 'chrome_dnd_obscured_in_front_late_shared', 'chrome_dnd_obscured_in_front_shared', 'chrome_dnd_shared']);
  // a drop cell's plain ok with no drop is ruling 650's false ok, never an unmet premise
  for (const op of PREMISE_OPS) assert.ok(!DEVICE_OPS[op].confirm, op);
});

test("a plain-drag ok the page saw released with no drag is unmet; one Chrome took is not; the in-run verdict that excluded it is provisional", async () => {
  const r = await made('chrome_dnd_shared', [[UNMET, CANCEL, CANCEL], three(CANCEL), three(CANCEL)], [CANCEL, CANCEL]);
  const next = adjacency(r.rows);
  assert.equal(classifyPremise(r.rows[0], next(r.rows[0])), 'unmet');
  assert.equal(classifyPremise(r.rows[1], next(r.rows[1])), 'started', "the engine's take, and the page's");
  assert.equal(noDragSession(r.rows[0].premise_evidence), true);
  const v = judgeDevice('chrome_dnd_shared', r.rows, r.audit);
  assert.equal(v.pass, false);
  assert.equal(v.provisional, true, 'the run excluded a sample: its verdict waits for premise-refill.mjs');
  assert.match(reasons(v), /incomplete: Chrome never started a drag and drop on 1 of 9 samples .* so 2 cold were judged of the 3 planned, with 0 refilled of a bound of 9/);
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
    assert.equal(v.provisional, undefined, what);
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
  const v = judgeDevice('chrome_dnd_late_take_shared', [...failedRead.rows, ...fillOf(failedRead.rows.slice(1, 2))], { clean: true, kind: 'skipped' });
  assert.match(reasons(v), /a sample excluded for its unmet premise failed its own reads on 1 of \d+ samples \(0\/0: the read after the drag failed \(the bus did not answer\)\)/);
  // the next acting request refused for something other than a pending drag
  const failedNext = await made('chrome_dnd_late_take_shared', [[UNMET]], [], { answers: { move: { ok: false, error: 'Window 1 is minimized; activate it first' } } });
  assert.match(reasons(judgeDevice('chrome_dnd_late_take_shared', failedNext.rows, { clean: true, kind: 'skipped' })), /failed its own reads .*the next acting request failed \(Window 1 is minimized/);
  // the late case's window read refused
  const lateRead = await made('chrome_dnd_late_shared', [[UNMET]], [], { answers: { get_window_state: { ok: false, error: 'no such window' } } });
  assert.match(reasons(judgeDevice('chrome_dnd_late_shared', lateRead.rows, { clean: true, kind: 'skipped' })), /the window read after the drag failed/);
  // a clean read with no notice is no failure: the sample is excluded and nothing else is said of it
  const clean = await made('chrome_dnd_late_take_shared', [[UNMET]]);
  assert.equal(clean.rows[0].read_ok, true);
  assert.equal(clean.rows[0].read_notice, false);
  assert.ok(!reasons(judgeDevice('chrome_dnd_late_take_shared', clean.rows, { clean: true, kind: 'skipped' })).includes('failed its own reads'));
});

/** Rows as premise-refill.mjs combines a refill run's: marked `fill`, their block named by their run. */
const fillOf = (rows) => rows.map((r) => ({ ...r, fill: true, fill_block: r.block, block: `refill:${r.block}` }));

test('negative control (finding 3): warm refills never stand in for cold ones; each quota is judged on its own', async () => {
  // the probe's shape: every cold drag excluded, three planned and two refilled, and warm ones in plenty
  const main = await made('chrome_dnd_shared', [[UNMET, CANCEL, CANCEL], [UNMET, CANCEL, CANCEL], [UNMET, CANCEL, CANCEL]]);
  const refill = await made('chrome_dnd_shared', [[UNMET, CANCEL, CANCEL], [UNMET, CANCEL, CANCEL]]);
  const v = judgeDevice('chrome_dnd_shared', [...main.rows, ...fillOf(refill.rows)], { clean: true, kind: 'skipped' });
  assert.equal(v.pass, false);
  assert.match(reasons(v), /so 0 cold were judged of the 3 planned, with 6 refilled of a bound of 9/);
  assert.ok(!/warm were judged/.test(reasons(v)), 'the warm quota is met');
  assert.deepEqual(v.premise_unmet.timed.need, { cold: 3, warm: 0 });
  // and filled: three cold refills judged, the cell passes on its quotas
  const good = await made('chrome_dnd_shared', [three(CANCEL), three(CANCEL), three(CANCEL)]);
  const filled = judgeDevice('chrome_dnd_shared', [...main.rows, ...fillOf(good.rows)], { clean: true, kind: 'skipped' });
  assert.deepEqual(filled.reasons, []);
  assert.equal(filled.provisional, undefined, 'refilled: final');
});

test('negative control (finding 4): a reply that claims or implies a drop where the page proves no session fails; stored rows that cannot show it keep the old judgment', async () => {
  const landed = { reply: { ok: true }, page: 'took' };
  const notice = dndLateRefusal(APP, 'move');
  // the late-take case's audited drag answered ok with an unconfirmed-drop notice, and the page proves no session
  const r = await made('chrome_dnd_late_take_shared', [[landed]], [{ ...UNMET, reply: { ok: true, notice: dndUnconfirmedNotice(APP) } }]);
  const v = judgeDevice('chrome_dnd_late_take_shared', r.rows, r.audit);
  assert.match(reasons(v), /answered as if it dropped where the page shows Chrome never started a drag and drop \(ruling 823\) on 1 of 1 audited requests \(audit\/0\)/);
  // the same with the read after the drag carrying the late notice, timed
  const read = await made('chrome_dnd_late_take_shared', [[UNMET]], [], { answers: { list_windows: { notice: dndLateNotice(APP) }, move: { ok: false, error: notice } } });
  assert.match(reasons(judgeDevice('chrome_dnd_late_take_shared', read.rows, { clean: true, kind: 'skipped' })), /answered as if it dropped .* on 1 of 1 samples \(0\/0\)/);
  // the cancel case's may-have-dropped answer for a drag Chrome never started
  const may = await made('chrome_dnd_shared', [[{ ...UNMET, reply: { ok: false, error: dndMayHaveDroppedSentence(APP) } }]]);
  assert.match(reasons(judgeDevice('chrome_dnd_shared', may.rows, { clean: true, kind: 'skipped' })), /answered as if it dropped/);
  // the stored form (no evidence): the late-take audit's ok passes as before
  const stored = judgeDevice('chrome_dnd_late_take_shared', r.rows, { clean: true, kind: 'background', answered: r.answered }, { entries: bindAudit({ answered: r.answered }, null, { run: r.run }).entries, problems: [] });
  assert.ok(!reasons(stored).includes('answered as if it dropped'), reasons(stored));
});

test("negative control (finding 6): one adjacency rule, the next request on the same engine lifecycle, never across lifecycles", async () => {
  // a plain ok in one audit lifecycle, and another lifecycle's request refused with the late notice right after it
  const a = await made('chrome_dnd_shared', [], [UNMET]);
  const b = await made('chrome_dnd_shared', [], [{ reply: { ok: false, error: dndLateRefusal(APP, 'drag') }, page: 'took' }, CANCEL]);
  const entries = [...bindAudit(a.audit, lines(a.run), { run: a.run, scene: 'device-chrome-dnd', op: 'chrome_dnd_shared' }).entries, ...bindAudit(b.audit, lines(b.run), { run: b.run, scene: 'device-chrome-dnd', op: 'chrome_dnd_shared' }).entries.map((e) => ({ ...e, fill: true }))];
  const next = adjacency(entries);
  assert.equal(next(entries[0]), null, "the first lifecycle's last request has no next");
  assert.equal(next(entries[1]), entries[2], 'within a lifecycle, the next request');
  assert.equal(classifyPremise(entries[0], next(entries[0])), 'unmet');
  // in a stored audit of more than one lifecycle the boundary is unknown: no adjacency at all
  const legacy = bindAudit({ answered: a.answered.concat(a.answered), lifecycles: 2 }, null, { run: 'x' }).entries;
  assert.equal(adjacency(legacy)(legacy[0]), null);
});
const lines = (run) => readFileSync(join(dir, 'premise-evidence.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.run === run);

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

test('negative control: an excluded sample is never counted as a pass, and the bound spent leaves the cell incomplete', async () => {
  const all = await made('chrome_dnd_shared', planned(UNMET), [UNMET, UNMET]);
  const fills = await made('chrome_dnd_shared', planned(UNMET), [UNMET, UNMET]);
  const fillAudit = bindAudit(fills.audit, lines(fills.run), { run: fills.run, scene: 'device-chrome-dnd', op: 'chrome_dnd_shared' }).entries.map((e) => ({ ...e, fill: true }));
  const mainAudit = bindAudit(all.audit, lines(all.run), { run: all.run, scene: 'device-chrome-dnd', op: 'chrome_dnd_shared' }).entries;
  const v = judgeDevice('chrome_dnd_shared', [...all.rows, ...fillOf(fills.rows)], { clean: true, kind: 'background', answered: [...all.answered, ...fills.answered] }, { entries: [...mainAudit, ...fillAudit], problems: [] });
  assert.equal(v.pass, false);
  assert.match(reasons(v), /incomplete: .* on 18 of 18 samples .* so 0 cold were judged of the 3 planned, with 9 refilled of a bound of 9/);
  assert.match(reasons(v), /the background audit is incomplete: .* on 4 of 4 audited requests .* so 0 were judged of the 2 planned, with 2 refilled of a bound of 2/);
});

test('evidence that does not fit its samples is never excluded on, and fails the cell closed', async () => {
  const r = await made('chrome_dnd_shared', planned(), [UNMET, CANCEL]);
  const own = lines(r.run).filter((l) => l.block === 'audit');
  const bind = (ls) => judgeDevice('chrome_dnd_shared', r.rows, r.audit, bindAudit(r.audit, ls, { run: r.run, scene: 'device-chrome-dnd', op: 'chrome_dnd_shared', window: own[0].window }));
  assert.match(reasons(bind(own.slice(1))), /does not fit it .*no line for audit\/0/);
  assert.match(reasons(bind([...own, own[0]])), /2 lines for audit\/0/);
  assert.match(reasons(bind([...own, { ...own[0], run: 'another' }])), /a line of another run \(another\)/);
  assert.match(reasons(bind(own.map((l) => ({ ...l, window: 7 })))), /a line on another window/);
  // and a timed row whose evidence names another sample
  const moved = r.rows.map((x, i) => (i === 0 ? { ...x, premise_evidence: { ...x.premise_evidence, i: 5 } } : x));
  assert.match(reasons(judgeDevice('chrome_dnd_shared', moved, r.audit)), /the premise evidence of the timed samples does not fit them .*0\/0's evidence names another sample/);
});
