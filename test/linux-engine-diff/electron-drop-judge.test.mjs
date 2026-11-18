// T17's Electron cells in the gate (M4's T18; the T18 executor's ruling, 2026-11-12): a false ok fails, and so does a
// missing landing where one is expected; unconfirmed drops that landed are findings with their counts, never fails,
// T14's 5% included. Display-free: drop-signals rows as drop-signals.mjs `oneDrag` writes them.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SLOW_CELL_MODE, dropSignalsVerdict, electronDropVerdict, honestNonLanding, judgedElectronPlan, unconfirmedClass, zoneMismatch } from '../../scripts/linux-engine-diff/drop-signals-judge.mjs';
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

test("an application that did not answer the settle's syncs in time is the same honest kind (M5's ruling 827): never a false ok", () => {
  const rows = [drag({ cell: 'left', i: 0, notice: 'unanswered' }), drag({ lane: 'cua:handle', cell: 'left', i: 0, notice: 'unanswered' })];
  const v = electronDropVerdict(rows, { specs: specs(['cua', 'left', 1], ['cua:handle', 'left', 1]) });
  assert.deepEqual(v.failed, []);
  assert.equal(v.counts.false_ok, 0);
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

// L4a's residue (ruling 827, 3b; 2026-11-18): in the plain cell at twice the load, an honest unconfirmed non-landing (the
// unconfirmed notice, kept by its refusal, and no drop on the page) is allowed up to floor(2 × n / 100) times in a cell
// of n plain drops; one more fails. A false ok is never part of it, and the rule covers no other load, cell or plan.

/** L4a's judge: the plan the residue is for (`t17-fix3`), as the dispatcher passes it. */
const fix3 = (rows, opts) => electronDropVerdict(rows, { ...opts, plan: 't17-fix3' });

/** A cell at twice the load: `n` drops, the first `honest` of them honest unconfirmed non-landings, the rest landed and ok. */
const residueCell = (n, honest, { lane = 'cua:handle', load = 'load2', cell = 'plain' } = {}) =>
  many(n, (i) => (i < honest ? drag({ lane, cell, load, i, landed: false, notice: UNCONFIRMED }) : drag({ lane, cell, load, i, landed: true })));

test("L4a's residue: 3 honest unconfirmed non-landings in 100 plain drops at twice the load fail, the count and the bound named", () => {
  const v = fix3(residueCell(100, 3), { specs: specs(['cua:handle', 'plain', 100]) });
  assert.deepEqual(v.failed, ["cua:handle plain: 3 honest unconfirmed non-landings of 100, over L4a's residue of 2 (ruling 827 3b: floor(2 × 100 / 100), never rounded up) (#0, #1, #2)"]);
  assert.deepEqual(v.counts.residue, [{ lane: 'cua:handle', cell: 'plain', drags: 100, count: 3, bound: 2, over: true }]);
  assert.equal(v.counts.missing_landing, 0, 'the residue is counted apart from the hard misses');
});

test("L4a's residue: 2 in 100 pass, with the count and the bound reported apart from the passes", () => {
  const v = fix3(residueCell(100, 2), { specs: specs(['cua:handle', 'plain', 100]) });
  assert.deepEqual(v.failed, []);
  assert.deepEqual(v.counts.residue, [{ lane: 'cua:handle', cell: 'plain', drags: 100, count: 2, bound: 2, over: false }]);
  assert.ok(v.findings.includes("L4a's residue (ruling 827 3b), load load2: cua:handle plain 2 of 100 honest unconfirmed non-landings, bound 2 (floor(2 × n / 100), never rounded up), not a fail"), v.findings.join('\n'));
  const md = v.md.join('\n');
  assert.match(md, /no missing landing beyond L4a's residue/);
  assert.match(md, /Findings \(counted, not fails\): .*cua:handle plain 2 of 100 honest unconfirmed non-landings, bound 2/);
});

test("L4a's residue is per plain cell and printed for each, 0 included: each lane's 100 drops carry their own bound", () => {
  const v = fix3([...residueCell(100, 2), ...residueCell(100, 0, { lane: 'cua' })], { specs: specs(['cua:handle', 'plain', 100], ['cua', 'plain', 100]) });
  assert.deepEqual(v.failed, []);
  assert.ok(v.findings.includes("L4a's residue (ruling 827 3b), load load2: cua:handle plain 2 of 100 honest unconfirmed non-landings, bound 2; cua plain 0 of 100, bound 2 (floor(2 × n / 100), never rounded up), not a fail"), v.findings.join('\n'));
  // 3 in one lane's cell fail though the two cells' 200 drops would allow 4
  const over = fix3([...residueCell(100, 3), ...residueCell(100, 0, { lane: 'cua' })], { specs: specs(['cua:handle', 'plain', 100], ['cua', 'plain', 100]) });
  assert.equal(over.failed.length, 1);
  assert.match(over.failed[0], /^cua:handle plain: 3 honest unconfirmed non-landings of 100, over L4a's residue of 2/);
});

test('a false ok in the same series fails, whatever the residue', () => {
  const rows = residueCell(100, 1);
  // an ok with nothing pending on a drag that dropped nowhere
  rows[99] = drag({ lane: 'cua:handle', load: 'load2', i: 99, landed: false });
  const v = fix3(rows, { specs: specs(['cua:handle', 'plain', 100]) });
  assert.ok(v.failed.includes('cua:handle plain: answered ok with no drop and nothing pending on 1 of 100 (#99)'), v.failed.join('\n'));
  assert.ok(v.failed.includes('cua:handle plain: the drop did not land on 1 of 100, in a cell that expects it (#99)'), v.failed.join('\n'));
  assert.equal(v.counts.false_ok, 1);
  assert.deepEqual(v.counts.residue, [{ lane: 'cua:handle', cell: 'plain', drags: 100, count: 1, bound: 2, over: false }], 'the false ok is no part of the residue');
});

test("a non-landing answered ok is a false ok and fails, never residue: no drop at all, or a drop on another of the page's elements", () => {
  const nowhere = residueCell(100, 0);
  nowhere[5] = drag({ lane: 'cua:handle', load: 'load2', i: 5, landed: false });
  const a = fix3(nowhere, { specs: specs(['cua:handle', 'plain', 100]) });
  assert.ok(a.failed.includes('cua:handle plain: answered ok with no drop and nothing pending on 1 of 100 (#5)'), a.failed.join('\n'));
  assert.equal(a.counts.residue[0].count, 0);
  // the page's own dragend says it dropped, outside the zone: its effect landed on another target (ruling 650)
  const elsewhere = residueCell(100, 0);
  elsewhere[5] = drag({ lane: 'cua:handle', load: 'load2', i: 5, landed: false, effect: 1 });
  const b = fix3(elsewhere, { specs: specs(['cua:handle', 'plain', 100]) });
  assert.deepEqual(b.failed, ['cua:handle plain: the drop did not land on 1 of 100, in a cell that expects it (#5)']);
  assert.equal(b.counts.residue[0].count, 0);
});

test('only an honest non-landing is residue: a notice its refusal did not keep, another cause, an error, or a drop elsewhere answered unconfirmed all fail', () => {
  const run = { ok: true, error: null, late_dnd: null };
  const shapes = [
    ['unkept', drag({ lane: 'cua:handle', load: 'load2', i: 0, landed: false, notice: UNCONFIRMED, next: run })],
    ['failed watch', drag({ lane: 'cua:handle', load: 'load2', i: 0, landed: false, notice: 'failed' })],
    ['error', drag({ lane: 'cua:handle', load: 'load2', i: 0, landed: false, ok: false })],
    ['dropped elsewhere', drag({ lane: 'cua:handle', load: 'load2', i: 0, landed: false, effect: 1, notice: UNCONFIRMED })],
  ];
  for (const [name, row] of shapes) {
    const rows = residueCell(100, 0);
    rows[0] = row;
    const v = fix3(rows, { specs: specs(['cua:handle', 'plain', 100]) });
    assert.ok(v.failed.includes('cua:handle plain: the drop did not land on 1 of 100, in a cell that expects it (#0)'), `${name}: ${v.failed.join('\n')}`);
    assert.equal(v.counts.residue[0].count, 0, name);
  }
});

test("the same rows at idle, or at the gate's window load, are not covered: every non-landing there fails as before", () => {
  for (const load of ['idle', 'gate-windows']) {
    const v = fix3(residueCell(100, 2, { load }), { specs: specs(['cua:handle', 'plain', 100]) });
    assert.deepEqual(v.failed, ['cua:handle plain: the drop did not land on 2 of 100, in a cell that expects it (#0, #1)'], load);
    assert.deepEqual(v.counts.residue, [], load);
    assert.ok(!v.findings.some((f) => /residue/.test(f)), load);
  }
});

test('the residue covers the plain cell alone: another landing cell at twice the load fails on any non-landing', () => {
  const v = fix3(residueCell(30, 1, { lane: 'cua', cell: 'move' }), { specs: specs(['cua', 'move', 30]) });
  assert.deepEqual(v.failed, ['cua move: the drop did not land on 1 of 30, in a cell that expects it (#0)']);
  assert.deepEqual(v.counts.residue, []);
});

test("a short series' bound rounds down, never up: floor(2 × n / 100)", () => {
  // 99 drops: 1.98 allows 1, so 2 fail
  const a = fix3(residueCell(99, 2), { specs: specs(['cua:handle', 'plain', 99]) });
  assert.deepEqual(a.failed, ["cua:handle plain: 2 honest unconfirmed non-landings of 99, over L4a's residue of 1 (ruling 827 3b: floor(2 × 99 / 100), never rounded up) (#0, #1)"]);
  // 50 drops allow 1
  assert.deepEqual(fix3(residueCell(50, 1), { specs: specs(['cua:handle', 'plain', 50]) }).failed, []);
  // 49 drops, and a pilot's 2, allow none
  for (const n of [49, 2]) {
    const v = fix3(residueCell(n, 1), { specs: specs(['cua:handle', 'plain', n]) });
    assert.deepEqual(v.failed, [`cua:handle plain: 1 honest unconfirmed non-landings of ${n}, over L4a's residue of 0 (ruling 827 3b: floor(2 × ${n} / 100), never rounded up) (#0)`], String(n));
  }
  // 150 drops allow 3
  assert.deepEqual(fix3(residueCell(150, 3), { specs: specs(['cua:handle', 'plain', 150]) }).counts.residue[0], { lane: 'cua:handle', cell: 'plain', drags: 150, count: 3, bound: 3, over: false });
});

// fix wave 1 (task 102's review): missing evidence is never residue, and the allowance is L4a's plan's alone

/** One honest non-landing at twice the load, edited by `edit`, in a plain cell of 100 drops otherwise landed. */
const editedResidue = (edit) => {
  const rows = residueCell(100, 1);
  edit(rows[0]);
  return rows;
};

test('the residue admits a non-landing only on its whole evidence: the dispatch ok with the kept notice, the zone read unchanged, its own completed dragend no drop', () => {
  assert.equal(honestNonLanding(residueCell(1, 1)[0]), true, 'the honest shape itself');
  const controls = [
    ['the page kept no dragend record', (r) => { r.after.last = null; }],
    ["a stale dragend: an earlier press's record", (r) => { r.after.last.seq = 9; }],
    ["a foreign dragend: another source's record", (r) => { r.after.last.src = 'inzone'; }],
    ['a dragend not come by the read', (r) => { r.after.last.dur = -1; }],
    ['a dragend with no effect read', (r) => { delete r.after.last.effect; }],
    ['no drag and drop of this trial started', (r) => { r.after.dnd.plain.starts = r.before.dnd.plain.starts; }],
    ["the zone's counters not read after the drag", (r) => { r.after.dnd = {}; }],
    ["the zone's counters not read before the drag", (r) => { delete r.before.dnd; }],
    ["the zone's drop counter moved", (r) => { r.after.dnd.plain.drops += 1; }],
    ['an error that carries the kept notice (a failed handle step, its end sent after)', (r) => { r.ok = false; r.error = 'drag_handle move_to failed'; r.handle = { end: { ok: true } }; }],
    ['a handle step that failed, recorded beside an ok', (r) => { r.handle = { end: { ok: true } }; }],
    ["a drag and drop the harness had to end with its own Escape", (r) => { r.escaped = true; }],
  ];
  for (const [name, edit] of controls) {
    const rows = editedResidue(edit);
    assert.equal(honestNonLanding(rows[0]), false, name);
    const v = fix3(rows, { specs: specs(['cua:handle', 'plain', 100]) });
    assert.ok(v.failed.includes('cua:handle plain: the drop did not land on 1 of 100, in a cell that expects it (#0)'), `${name}: ${v.failed.join('\n')}`);
    assert.equal(v.counts.residue[0].count, 0, name);
  }
});

test("the residue is L4a's plan's alone: the dispatcher opts t17-fix3 in, and another judged plan at twice the load gets no allowance", () => {
  const verdictOf = (plan, rows) => dropSignalsVerdict({ families: ['electron'], plan }, [{ kind: 'drop-signal-scene', specs: [{ lane: 'cua:handle', cell: 'plain', n: rows.length }] }, ...rows]);
  const fix3Run = verdictOf('t17-fix3', residueCell(100, 2));
  assert.deepEqual(fix3Run.failed, []);
  assert.equal(fix3Run.counts.residue[0].count, 2);
  for (const plan of ['t17-floor', 't17-handle', 't17-fix2']) {
    const v = verdictOf(plan, residueCell(300, 2));
    assert.deepEqual(v.failed, ['cua:handle plain: the drop did not land on 2 of 300, in a cell that expects it (#0, #1)'], plan);
    assert.deepEqual(v.counts.residue, [], plan);
  }
  // the judge called with no plan grants none either
  assert.deepEqual(electronDropVerdict(residueCell(100, 1), { specs: specs(['cua:handle', 'plain', 100]) }).counts.residue, []);
});

// ruling 830 (2026-11-18): a zone-truth mismatch, an ok answer whose own dragend reported copy while the zone's drop
// counter did not move, is a declared app-level limit: the dragend rule stands (never a fail, never a false ok), and
// every run of the judge lists it apart, per lane and cell, at every load and in every plan

/** The plain-left control's drags: `copies` of them answered ok on a dragend that reported copy outside the zone, the rest honest. */
const leftCell = (n, copies, { lane = 'cua', load = 'load2' } = {}) =>
  many(n, (i) => (i < copies ? drag({ lane, cell: 'left', load, i, landed: false, effect: 1 }) : drag({ lane, cell: 'left', load, i, landed: false, notice: UNCONFIRMED })));

test('a zone-truth mismatch is reported apart, per lane and cell, and fails nothing: at every load, with no plan named', () => {
  for (const load of ['idle', 'gate-windows', 'load2']) {
    const rows = [...leftCell(30, 2, { load }), ...leftCell(30, 1, { lane: 'cua:handle', load }), ...many(5, (i) => drag({ load, i }))];
    const v = electronDropVerdict(rows, { specs: specs(['cua', 'left', 30], ['cua:handle', 'left', 30], ['cua', 'plain', 5]) });
    assert.deepEqual(v.failed, [], load);
    assert.equal(v.counts.false_ok, 0, load);
    assert.deepEqual(v.counts.zone_mismatch, [
      { lane: 'cua', cell: 'left', drags: 30, count: 2 },
      { lane: 'cua:handle', cell: 'left', drags: 30, count: 1 },
      { lane: 'cua', cell: 'plain', drags: 5, count: 0 },
    ], load);
    assert.ok(v.findings.includes(`zone-truth mismatches (ruling 830, a declared app-level limit: an ok answer whose own dragend reported copy while the zone's drop counter did not move), load ${load}: cua left 2 of 30; cua:handle left 1 of 30; not a fail and no false ok`), v.findings.join('\n'));
    assert.match(v.md.join('\n'), /Findings \(counted, not fails\): .*zone-truth mismatches/);
  }
  // L4a's plan and another judged plan, through the dispatcher, report it the same
  for (const plan of ['t17-fix3', 't17-floor']) {
    const v = dropSignalsVerdict({ families: ['electron'], plan }, [{ kind: 'drop-signal-scene', specs: [{ lane: 'cua', cell: 'left', n: 30 }] }, ...leftCell(30, 2)]);
    assert.deepEqual(v.failed, [], plan);
    assert.equal(v.counts.zone_mismatch[0].count, 2, plan);
  }
});

test('with none, the verdict still says the check ran', () => {
  const v = electronDropVerdict(leftCell(30, 0), { specs: specs(['cua', 'left', 30]) });
  assert.ok(v.findings.includes("zone-truth mismatches (ruling 830, a declared app-level limit: an ok answer whose own dragend reported copy while the zone's drop counter did not move), load load2: none in 30 drags of the window's cells"), v.findings.join('\n'));
});

test('an ok on a dragend that reported none, with no landing, is still a false ok and fails; it is no mismatch', () => {
  const rows = leftCell(30, 0);
  rows[0] = drag({ cell: 'left', load: 'load2', i: 0, landed: false, effect: 0 });
  const v = electronDropVerdict(rows, { specs: specs(['cua', 'left', 30]) });
  assert.deepEqual(v.failed, ['cua left: answered ok with no drop and nothing pending on 1 of 30 (#0)']);
  assert.equal(v.counts.zone_mismatch[0].count, 0);
});

test("an ok whose zone counter moved is no mismatch, nor is a copy dragend without the drag's own evidence or answered unconfirmed", () => {
  // the zone counted the drop: the app's own truth agrees
  const landed = electronDropVerdict(many(3, (i) => drag({ load: 'load2', i, effect: 1 })), { specs: specs(['cua', 'plain', 3]) });
  assert.equal(landed.counts.zone_mismatch[0].count, 0);
  const shapes = [
    ['answered unconfirmed, its notice kept', drag({ cell: 'left', load: 'load2', landed: false, effect: 1, notice: UNCONFIRMED })],
    ["an earlier press's dragend (stale)", (() => { const r = drag({ cell: 'left', load: 'load2', landed: false, effect: 1 }); r.after.last.seq = 9; return r; })()],
    ["the zone's counters unread", (() => { const r = drag({ cell: 'left', load: 'load2', landed: false, effect: 1 }); r.after.dnd = {}; return r; })()],
  ];
  for (const [name, row] of shapes) {
    const v = electronDropVerdict([row], { specs: specs(['cua', 'left', 1]) });
    assert.equal(v.counts.zone_mismatch[0].count, 0, name);
  }
});

test('off the window the dragend rule excuses nothing: an ok on a copy dragend there is a false ok, never a mismatch', () => {
  const v = electronDropVerdict([drag({ lane: 'cua:handle', cell: 'xterm', load: 'load2', landed: false, effect: 1, verified: true })], { specs: specs(['cua:handle', 'xterm', 1]) });
  assert.deepEqual(v.failed, ['cua:handle xterm: answered ok with no drop and nothing pending on 1 of 1 (#0)']);
  assert.deepEqual(v.counts.zone_mismatch, []);
});

test('in the plain cell a mismatch never fails by itself: the same row is listed and fails as a missing landing', () => {
  const rows = many(5, (i) => drag({ load: 'load2', i }));
  rows[0] = drag({ load: 'load2', i: 0, landed: false, effect: 1 });
  assert.equal(zoneMismatch(rows[0]), true);
  const v = electronDropVerdict(rows, { specs: specs(['cua', 'plain', 5]) });
  assert.deepEqual(v.failed, ['cua plain: the drop did not land on 1 of 5, in a cell that expects it (#0)']);
  assert.equal(v.counts.false_ok, 0);
  assert.deepEqual(v.counts.zone_mismatch, [{ lane: 'cua', cell: 'plain', drags: 5, count: 1 }]);
  assert.ok(v.findings.some((f) => /^zone-truth mismatches .*: cua plain 1 of 5; not a fail and no false ok$/.test(f)), v.findings.join('\n'));
});

// fix wave 2 (task 102's re-review): the residue and the mismatch take only stamped evidence, the before-press and
// after-press stamps both read and the dragend stamped with this trial's press; the legacy dragend verdict is unchanged

test('the residue and the mismatch refuse a dragend whose press stamps are missing, each stamp apart; the legacy verdict still reads it', () => {
  const stamps = [
    ['the before-press stamp', (r) => { delete r.before.press.seq; }],
    ['the before-press record', (r) => { delete r.before.press; }],
    ['the after-press stamp', (r) => { delete r.after.press.seq; }],
    ["the dragend's own stamp", (r) => { delete r.after.last.seq; }],
  ];
  for (const [name, strip] of stamps) {
    const residueRow = drag({ lane: 'cua:handle', load: 'load2', landed: false, notice: UNCONFIRMED });
    const copyRow = drag({ cell: 'left', load: 'load2', landed: false, effect: 1 });
    assert.equal(honestNonLanding(residueRow), true, `${name}: the stamped residue row`);
    assert.equal(zoneMismatch(copyRow), true, `${name}: the stamped copy row`);
    strip(residueRow);
    strip(copyRow);
    assert.equal(honestNonLanding(residueRow), false, `residue, ${name} missing`);
    assert.equal(zoneMismatch(copyRow), false, `mismatch, ${name} missing`);
    const rows = residueCell(100, 0);
    rows[0] = residueRow;
    const v = fix3(rows, { specs: specs(['cua:handle', 'plain', 100]) });
    assert.ok(v.failed.includes('cua:handle plain: the drop did not land on 1 of 100, in a cell that expects it (#0)'), `${name}: ${v.failed.join('\n')}`);
    assert.equal(v.counts.residue[0].count, 0, name);
    assert.equal(electronDropVerdict([copyRow], { specs: specs(['cua', 'left', 1]) }).counts.zone_mismatch[0].count, 0, name);
  }
  // the legacy dragend verdict reads the stored sittings' unstamped records as before (the harness-fix wave)
  const legacy = drag({ cell: 'left', landed: false, effect: 1, stamp: false, lat: 0 });
  assert.deepEqual(electronDropVerdict([legacy], { specs: specs(['cua', 'left', 1]) }).failed, []);
  assert.equal(zoneMismatch(legacy), false, 'an unstamped copy dragend is no mismatch');
});

// ruling 838 (2026-11-18): H2's root cells, whose releases land on the gate's Chrome ballast (an Electron source, a
// Chrome destination), count their unverified ends by answer: the oks listed apart per lane, each with its settle
// outcome where the stats carry it, a finding for the design session and never a fail; the cell stays unmeasured

/** A root cell's drags at the gate's window load, every end on a ballast window: the first `oks` answered ok, the rest unconfirmed. */
const coveredRoot = (lane, n, oks, extra = () => ({})) =>
  many(n, (i) => drag({ lane, cell: 'root', load: 'gate-windows', i, landed: false, verified: false, ...(i < oks ? extra(i) : { notice: UNCONFIRMED }) }));

test("H2's root: every unverified end answered unconfirmed is counted as before, with no ok, and the cell stays unmeasured", () => {
  const rows = [...coveredRoot('cua:desktop', 30, 0), ...coveredRoot('cua:handle', 30, 0)];
  const v = electronDropVerdict(rows, { specs: specs(['cua:desktop', 'root', 30], ['cua:handle', 'root', 30]) });
  assert.deepEqual(v.failed, []);
  assert.equal(v.counts.unverified, 60);
  assert.deepEqual(v.counts.root_unverified, [
    { lane: 'cua:desktop', cell: 'root', unverified: 30, ok: 0, unconfirmed: 30, oks: [] },
    { lane: 'cua:handle', cell: 'root', unverified: 30, ok: 0, unconfirmed: 30, oks: [] },
  ]);
  assert.ok(v.findings.includes('cua:desktop root unmeasured: every end (30) was not verified where the drag left the pointer'));
  assert.ok(v.findings.includes("the root cells' unverified ends by answer (ruling 838: released over another window, at the gate's window load the Chrome ballast; their position unmeasured), load gate-windows: cua:desktop root 0 ok and 30 unconfirmed of 30; cua:handle root 0 ok and 30 unconfirmed of 30"), v.findings.join('\n'));
  assert.doesNotMatch(v.md.join('\n'), /for the design session/);
});

test("H2's root: an ok on an unverified end is listed per lane with its settle outcome, never fails, and the verdict line says so", () => {
  const settle = (i) => (i === 0 ? { drop_cursor: { settle: { settled: false, settle_failed_activation_confirmed: true } } } : {});
  const rows = [...coveredRoot('cua:desktop', 30, 0), ...coveredRoot('cua:handle', 30, 2, (i) => settle(i))];
  for (const r of rows.filter((x) => x.lane === 'cua:handle' && x.i === 0)) Object.assign(r, settle(0));
  const v = electronDropVerdict(rows, { specs: specs(['cua:desktop', 'root', 30], ['cua:handle', 'root', 30]) });
  assert.deepEqual(v.failed, [], 'never a fail');
  assert.equal(v.counts.false_ok, 0);
  assert.deepEqual(v.counts.root_unverified[1], { lane: 'cua:handle', cell: 'root', unverified: 30, ok: 2, unconfirmed: 28, oks: [{ i: 0, settle_failed_activation_confirmed: true }, { i: 1, settle_failed_activation_confirmed: 'unknown' }] });
  assert.ok(v.findings.includes("the root cells' unverified ends by answer (ruling 838: released over another window, at the gate's window load the Chrome ballast; their position unmeasured), load gate-windows: cua:desktop root 0 ok and 30 unconfirmed of 30; cua:handle root 2 ok (#0 settle failed, activation confirmed: true; #1 settle failed, activation confirmed: unknown) and 28 unconfirmed of 30"), v.findings.join('\n'));
  const md = v.md.join('\n');
  assert.match(md, /No false ok, .*every cell of the plan ran\. 2 ok answers on the root cells' unverified ends \(cua:handle root 2\): a finding for the design session \(ruling 838\), not a fail\./);
  assert.ok(v.findings.includes('cua:handle root unmeasured: every end (30) was not verified where the drag left the pointer'), 'position stays unmeasured');
});

test("ruling 838 leaves the other cells as they were: an unverified end elsewhere is not counted, and a verified root's false ok still fails", () => {
  // an unverified xterm end answered ok: left out of its cell as before, and not counted by answer
  const xterm = electronDropVerdict([drag({ lane: 'cua:handle', cell: 'xterm', load: 'gate-windows', landed: false, verified: false })], { specs: specs(['cua:handle', 'xterm', 1]) });
  assert.deepEqual(xterm.failed, []);
  assert.deepEqual(xterm.counts.root_unverified, []);
  assert.ok(!xterm.findings.some((f) => /ruling 838/.test(f)));
  // a verified root end answered ok with no drop is a false ok, as before
  const root = electronDropVerdict([drag({ lane: 'cua:desktop', cell: 'root', load: 'idle', landed: false, verified: true })], { specs: specs(['cua:desktop', 'root', 1]) });
  assert.deepEqual(root.failed, ['cua:desktop root: answered ok with no drop and nothing pending on 1 of 1 (#0)']);
  assert.deepEqual(root.counts.root_unverified, []);
  // a plain cell is untouched
  assert.deepEqual(electronDropVerdict(many(3, (i) => drag({ i })), { specs: specs(['cua', 'plain', 3]) }).counts.root_unverified, []);
});
