// T17's Electron cells in the gate (M4's T18; the T18 executor's ruling, 2026-11-12): a false ok fails, and so does a
// missing landing where one is expected; unconfirmed drops that landed are findings with their counts, never fails,
// T14's 5% included. Display-free: drop-signals rows as drop-signals.mjs `oneDrag` writes them.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SLOW_CELL_MODE, electronDropVerdict, judgedElectronPlan, unconfirmedClass } from '../../scripts/linux-engine-diff/drop-signals-judge.mjs';
import { dropRow } from './drop-rows.mjs';

const UNCONFIRMED = 'unconfirmed';

/** One Electron drag's row (drop-rows.mjs): a landed drop into the zone by default, answered ok with nothing pending. */
const drag = ({ notice = null, ...o } = {}) => dropRow({ family: 'electron', pending: notice, ...o });
const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const specs = (...cells) => cells.map(([lane, cell, n]) => ({ lane, cell, n }));

test('the gate judges T17\'s Electron plans, not the moved release (a live build\'s hook) nor Chrome\'s', () => {
  assert.equal(judgedElectronPlan({ families: ['electron'], plan: 't17-fix3' }), true);
  assert.equal(judgedElectronPlan({ families: ['electron'], plan: 't17-moved' }), false);
  assert.equal(judgedElectronPlan({ families: ['chrome'], plan: 't17-fix3' }), false);
  assert.equal(judgedElectronPlan({ families: ['electron'], plan: 'main' }), false);
});

test('clean cells pass: landed drops ok, the off-window releases unconfirmed, every cell of the plan run', () => {
  const rows = [
    ...many(5, (i) => drag({ i })),
    ...many(3, (i) => drag({ lane: 'cua:handle', i })),
    ...many(3, (i) => drag({ lane: 'cua:desktop', cell: 'root', i, notice: UNCONFIRMED, verified: true })),
    ...many(3, (i) => drag({ cell: 'left', i, notice: UNCONFIRMED })),
  ];
  const v = electronDropVerdict(rows, { specs: specs(['cua', 'plain', 5], ['cua:handle', 'plain', 3], ['cua:desktop', 'root', 3], ['cua', 'left', 3]) });
  assert.deepEqual(v.failed, []);
  assert.equal(v.counts.landed, 8);
  assert.equal(v.counts.false_ok, 0);
  assert.match(v.md.join('\n'), /every cell of the plan ran/);
});

test('a false ok fails the gate: ok with nothing pending on a drag that dropped nowhere, off the window or in it', () => {
  const rows = [drag({ lane: 'cua:desktop', cell: 'root', i: 0, verified: true }), drag({ cell: 'left', i: 1 })];
  const v = electronDropVerdict(rows, { specs: specs(['cua:desktop', 'root', 1], ['cua', 'left', 1]) });
  assert.equal(v.failed.length, 2);
  assert.match(v.failed[0], /cua:desktop root: answered ok with no drop and nothing pending on 1 of 1/);
  assert.match(v.failed[1], /cua left: answered ok with no drop and nothing pending/);
  assert.equal(v.counts.false_ok, 2);
});

/** The hung sink's cells at the gate's window load: a cold handle and a plain drag answered ok, one handle honest; an xterm release answered ok. */
const sinkRows = () => [
  drag({ lane: 'cua:handle', cell: 'slow', i: 0, landed: false, effect: 1, cold: true, load: 'gate-windows', verified: true }),
  drag({ lane: 'cua:desktop', cell: 'slow', i: 0, landed: false, load: 'gate-windows', verified: true }),
  drag({ lane: 'cua:handle', cell: 'slow', i: 1, landed: false, notice: UNCONFIRMED, load: 'gate-windows', verified: true }),
  drag({ lane: 'cua:handle', cell: 'xterm', i: 0, landed: false, load: 'gate-windows', verified: true }),
];
const sinkSpecs = () => specs(['cua:handle', 'slow', 2], ['cua:desktop', 'slow', 1], ['cua:handle', 'xterm', 1]);

test("the hung sink is #365's declared race by default (the design session, 2026-11-12): its false oks are a finding with counts, and fail nothing", () => {
  assert.equal(SLOW_CELL_MODE, 'declared-race');
  const v = electronDropVerdict(sinkRows(), { specs: sinkSpecs() });
  assert.deepEqual(v.failed, ['cua:handle xterm: answered ok with no drop and nothing pending on 1 of 1 (#0)'], 'a false ok in any other cell stays hard');
  assert.ok(v.findings.includes("#365's declared race, load gate-windows: the hung sink answered ok with no drop and nothing pending on 2 of 3 drags (cua:handle 1 of 2, cua:desktop 1 of 1), a finding, not a fail"));
  assert.equal(v.counts.false_ok, 1, 'the hard false oks alone');
  assert.equal(v.counts.race_false_ok, 2);
  assert.equal(v.counts.race_drags, 3);
});

test("with the switch set hard, the hung sink's false ok fails the gate as any other cell's does", () => {
  const v = electronDropVerdict(sinkRows(), { specs: sinkSpecs(), slowMode: 'hard' });
  assert.deepEqual(v.failed, [
    'cua:handle slow: answered ok with no drop and nothing pending on 1 of 2 (#0)',
    'cua:desktop slow: answered ok with no drop and nothing pending on 1 of 1 (#0)',
    'cua:handle xterm: answered ok with no drop and nothing pending on 1 of 1 (#0)',
  ]);
  assert.equal(v.counts.race_false_ok, 0);
  assert.ok(!v.findings.some((f) => /#365/.test(f)));
  assert.throws(() => electronDropVerdict(sinkRows(), { specs: sinkSpecs(), slowMode: 'soft' }), /the slow cell's mode is hard or declared-race/);
});

test('an off-window release the page reports as dropped is still no drop: Chromium ends it with its last operation', () => {
  const v = electronDropVerdict([drag({ lane: 'cua:handle', cell: 'xterm', landed: false, effect: 1, verified: true })], { specs: specs(['cua:handle', 'xterm', 1]) });
  assert.match(v.failed.join(), /answered ok with no drop/);
});

test('a missing landing fails a cell that expects one, whatever its answer: an unconfirmed answer excuses no effect', () => {
  const rows = [drag({ i: 0 }), drag({ i: 1, landed: false, effect: 0, notice: UNCONFIRMED })];
  const v = electronDropVerdict(rows, { specs: specs(['cua', 'plain', 2]) });
  assert.deepEqual(v.failed, ['cua plain: the drop did not land on 1 of 2, in a cell that expects it (#1)']);
});

test('an error answered for a drop that landed fails: no false error undisturbed (T17)', () => {
  const v = electronDropVerdict([drag({ lane: 'cua:handle', ok: false })], { specs: specs(['cua:handle', 'plain', 1]) });
  assert.match(v.failed.join(), /answered an error for a drop that landed on 1 of 1/);
});

test('a missing case fails: a cell with fewer drags than its plan, or drags the plan does not name', () => {
  const v = electronDropVerdict([drag({ i: 0 }), drag({ cell: 'nozone', landed: false, notice: UNCONFIRMED })], { specs: specs(['cua', 'plain', 2], ['cua', 'left', 1]) });
  assert.ok(v.failed.includes("cua plain: 1 of the plan's 2 drags ran (a missing case)"));
  assert.ok(v.failed.includes("cua left: 0 of the plan's 1 drags ran (a missing case)"));
  assert.ok(v.failed.some((f) => /cua nozone: 1 drags the plan does not name/.test(f)));
});

test('landed drops answered unconfirmed are findings with counts, never fails: moves under breeze_cursors, cold handles at load', () => {
  const rows = [
    ...many(18, (i) => drag({ lane: 'cua:handle', load: 'load2', i, cold: i % 10 === 0 })),
    // 2 cold handle drops at load that landed unconfirmed (#364)
    drag({ lane: 'cua:handle', load: 'load2', i: 20, cold: true, notice: UNCONFIRMED }),
    drag({ lane: 'cua:handle', load: 'load2', i: 30, cold: true, notice: UNCONFIRMED }),
    // 2 move drops, never confirmed under breeze_cursors
    ...many(2, (i) => drag({ cell: 'move', load: 'load2', i, effect: 2, notice: UNCONFIRMED, landed: true })),
  ];
  const v = electronDropVerdict(rows, { specs: specs(['cua:handle', 'plain', 20], ['cua', 'move', 2]) });
  assert.deepEqual(v.failed, [], 'over T14\'s 5% (4 of 22), and still no fail');
  assert.equal(v.counts.unconfirmed_landed, 4);
  assert.deepEqual(v.counts.by_class, { 'move-link': 2, 'cold-load': 2, other: 0 });
  assert.equal(v.counts.over_share, true);
  const findings = v.findings.join('\n');
  assert.match(findings, /2 landed move or link drops answered unconfirmed: under breeze_cursors/);
  assert.match(findings, /2 cold handle drops at load landed/);
  assert.match(findings, /T14's share, reported and not a fail for these cells: 4 of 22 landed drops answered unconfirmed, over 5%/);
});

test('the unconfirmed classes: a move or link drop, a cold handle at load, anything else', () => {
  assert.equal(unconfirmedClass(drag({ effect: 3 })), 'move-link');
  assert.equal(unconfirmedClass(drag({ lane: 'cua:handle', cold: true, load: 'gate-windows' })), 'cold-load');
  assert.equal(unconfirmedClass(drag({ lane: 'cua:handle', cold: true, load: 'idle' })), 'other');
  assert.equal(unconfirmedClass(drag({ lane: 'cua', cold: true, load: 'load2' })), 'other');
});

test('an off-window cell whose every end was not verified is unmeasured, a finding; its unverified drags count apart', () => {
  const rows = many(3, (i) => drag({ lane: 'cua:desktop', cell: 'root', i, notice: UNCONFIRMED, verified: false }));
  const v = electronDropVerdict(rows, { specs: specs(['cua:desktop', 'root', 3]) });
  assert.deepEqual(v.failed, []);
  assert.equal(v.counts.unverified, 3);
  assert.match(v.findings.join(), /cua:desktop root unmeasured: every end \(3\) was not verified/);
});

test('a cell several specs name is judged on their sum: the cold count, 60 specs of one cold drag each', () => {
  assert.equal(judgedElectronPlan({ families: ['electron'], plan: 't17-slow-cold' }), true);
  const rows = Array.from({ length: 3 }, (_, k) => drag({ lane: 'cua:handle', cell: 'slow', i: 0, landed: false, cold: true, load: 'gate-windows', verified: true, ...(k ? { notice: UNCONFIRMED } : {}) }));
  const v = electronDropVerdict(rows, { specs: specs(['cua:handle', 'slow', 1], ['cua:handle', 'slow', 1], ['cua:handle', 'slow', 1], ['cua:handle', 'slow', 1]) });
  assert.deepEqual(v.failed, ["cua:handle slow: 3 of the plan's 4 drags ran (a missing case)"]);
  assert.equal(v.counts.race_false_ok, 1);
  assert.equal(v.counts.race_drags, 3);
});

// the harness-fix wave (the whole-branch review's harness slices, 2026-11-12): the drop evidence bound to the trial,
// and the notice held to its refusal

test("a control's drag that started nothing has not dropped, whatever the page's last record still says from an earlier trial", () => {
  // a good plain drop, then a candidate that does nothing on the controls and answers ok: the page keeps the plain
  // drop's dragend (effect 1) until a new dragstart
  const rows = [
    drag({ i: 0 }),
    drag({ cell: 'left', i: 0, started: false, landed: false }),
    drag({ cell: 'inzone-out', i: 0, started: false, landed: false }),
  ];
  const v = electronDropVerdict(rows, { specs: specs(['cua', 'plain', 1], ['cua', 'left', 1], ['cua', 'inzone-out', 1]) });
  assert.deepEqual(v.failed, [
    'cua left: answered ok with no drop and nothing pending on 1 of 1 (#0)',
    'cua inzone-out: answered ok with no drop and nothing pending on 1 of 1 (#0)',
  ]);
  assert.equal(v.counts.false_ok, 2);
});

test("a control's own drop counts: its dragstart in this trial, stamped with this trial's press, its dragend come", () => {
  // Electron drops a control's drag on another of the page's elements (effect 1), and the drag answered ok
  const own = drag({ cell: 'left', landed: false, effect: 1 });
  assert.deepEqual(electronDropVerdict([own], { specs: specs(['cua', 'left', 1]) }).failed, []);
  // the record is another press's: a dragstart stamped before this trial's press is not this trial's
  const other = drag({ cell: 'left', landed: false, effect: 1 });
  other.after.last.seq = 9;
  assert.match(electronDropVerdict([other], { specs: specs(['cua', 'left', 1]) }).failed.join(), /answered ok with no drop/);
  // its dragend not come: no drop yet
  const open = drag({ cell: 'left', landed: false, effect: -1 });
  open.after.last.dur = -1;
  assert.match(electronDropVerdict([open], { specs: specs(['cua', 'left', 1]) }).failed.join(), /answered ok with no drop/);
});

test("the stored sittings' records, before the press stamp, are bound by the start count: a record no start of this trial's made is no drop", () => {
  // Chromium's dragstart carries its press's time, so the record's latency (0 on every stored drag) binds nothing
  assert.deepEqual(electronDropVerdict([drag({ cell: 'left', landed: false, effect: 1, stamp: false, lat: 0 })], { specs: specs(['cua', 'left', 1]) }).failed, []);
  const inherited = electronDropVerdict([drag({ cell: 'left', landed: false, started: false, stamp: false })], { specs: specs(['cua', 'left', 1]) });
  assert.match(inherited.failed.join(), /answered ok with no drop/);
});

test('a notice excuses nothing without the next acting request refused with it: an ok on a drop that did not land is then a false ok', () => {
  const run = { ok: true, error: null, late_dnd: null };
  const rows = [drag({ lane: 'cua:desktop', cell: 'root', notice: UNCONFIRMED, verified: true, landed: false, next: run })];
  const v = electronDropVerdict(rows, { specs: specs(['cua:desktop', 'root', 1]) });
  assert.deepEqual(v.failed, [
    'cua:desktop root: answered ok with no drop and nothing pending on 1 of 1 (#0)',
    'cua:desktop root: the read carried a notice, and the next acting request was not refused with it, on 1 of 1 (#0)',
  ]);
  assert.equal(v.counts.pending_broken, 1);
});

test('the refusal must name what the notice named, and a refusal with no notice on the read breaks the contract too', () => {
  const otherCause = { ok: false, error: 'Pending from your last drag, a failed watch: x; this preflight request was not run, so read the window before sending it again', late_dnd: null };
  const mismatched = drag({ lane: 'cua:desktop', cell: 'root', notice: UNCONFIRMED, verified: true, landed: false, next: otherCause });
  const unannounced = drag({ i: 1, next: { ok: false, error: otherCause.error, late_dnd: null } });
  const v = electronDropVerdict([mismatched, unannounced], { specs: specs(['cua:desktop', 'root', 1], ['cua', 'plain', 1]) });
  assert.ok(v.failed.includes('cua:desktop root: the read carried a notice, and the next acting request was not refused with it, on 1 of 1 (#0)'), v.failed.join('\n'));
  assert.ok(v.failed.includes('cua plain: the next acting request was refused for something pending, and the read carried no notice, on 1 of 1 (#1)'), v.failed.join('\n'));
});

test("a landed move is classed by this trial's own dragend, never by an earlier one's", () => {
  assert.equal(unconfirmedClass(drag({ cell: 'move', landed: true, effect: 2, notice: UNCONFIRMED })), 'move-link');
  // the move's dragend not come by the read, an earlier move's record before it
  const open = drag({ cell: 'move', landed: true, effect: -1, notice: UNCONFIRMED, inherited: { src: 'move', effect: 2 } });
  open.after.last.dur = -1;
  assert.equal(unconfirmedClass(open), 'other');
});
