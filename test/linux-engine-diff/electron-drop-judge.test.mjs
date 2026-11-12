// T17's Electron cells in the gate (M4's T18; the T18 executor's ruling, 2026-11-12): a false ok fails, and so does a
// missing landing where one is expected; unconfirmed drops that landed are findings with their counts, never fails,
// T14's 5% included. Display-free: drop-signals rows as drop-signals.mjs `oneDrag` writes them.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { electronDropVerdict, judgedElectronPlan, unconfirmedClass } from '../../scripts/linux-engine-diff/drop-signals-judge.mjs';

const UNCONFIRMED = 'the drag answered ok, but its drop is an unconfirmed drop: read the window';

/** One drag's row: a landed drop into the zone by default, answered ok with nothing pending. */
function drag({ lane = 'cua', cell = 'plain', i = 0, load = 'idle', ok = true, notice = null, landed = cell === 'plain', effect = landed ? 1 : 0, cold = false, verified } = {}) {
  return {
    kind: 'drop-signal',
    load,
    family: 'electron',
    lane,
    cell,
    base: cell,
    i,
    cold,
    ok,
    notice,
    outcome: { started: true, landed, effect: null },
    after: { last: { src: 'plain', effect } },
    ...(verified === undefined ? {} : { end_park: { over: 1, verified } }),
  };
}
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
  const rows = [drag({ lane: 'cua:desktop', cell: 'slow', i: 0, verified: true }), drag({ cell: 'left', i: 1 })];
  const v = electronDropVerdict(rows, { specs: specs(['cua:desktop', 'slow', 1], ['cua', 'left', 1]) });
  assert.equal(v.failed.length, 2);
  assert.match(v.failed[0], /cua:desktop slow: answered ok with no drop and nothing pending on 1 of 1/);
  assert.match(v.failed[1], /cua left: answered ok with no drop and nothing pending/);
  assert.equal(v.counts.false_ok, 2);
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
