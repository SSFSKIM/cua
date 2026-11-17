// A declared drag speed gap (M4's T18, the T18 executor's ruling on the pre-flight's "declared, not chased"): Chrome's
// long drag and drop in front (#358) reads "declared speed gap", listed apart and never a pass, while its interval stays
// within the declared bound; an undeclared loss, a declared cell over its bound and a declared cell that misses its
// effect still fail. Display-free: cells as runDrag builds them.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DRAG_SPEED_GAPS, closesText, declaredDragGap } from '../../scripts/linux-engine-diff/deviations.mjs';
import { cellVerdict, dragVerdict, judgeNotes, laneFailures } from '../../scripts/linux-engine-diff/drag-judge.mjs';

/** Chrome's long drag and drop in front, slower than the newest build by the interval given. */
const dnd = ({ interval = [25.5, 30], family = 'chrome', drag = 'dnd', route = 'in-front', lane = { took: 30, n: 30, misses: [], witness: false, pass: true } } = {}) => ({
  family,
  drag,
  route,
  reference: true,
  pinned_took: 30,
  pinned_witness: false,
  lanes: { cua: lane },
  speed: { cua: { verdict: 'fail', interval, candidate: 366.1, against: 'newest', bar: 338.2, reasons: [`cua 366.1 ms against newest's 338.2 ms, the interval [${interval.join(', ')}] above 0`] } },
});

test("the declaration: Chrome's long drag and drop in front, #358, its reason, its bound, and who closes it", () => {
  const gap = declaredDragGap({ family: 'chrome', drag: 'dnd', route: 'in-front' });
  assert.equal(gap.issue, '#358');
  assert.equal(gap.reason, 'declared gap, no closing route (the floor and hold keep drops honest; no never-take signal); owner informed 2026-11-10; tracked by #358');
  assert.doesNotMatch(gap.reason, /held by the owner/);
  assert.match(gap.section, /T14 \(#263, #264, #269\): Chromium drops, built/);
  assert.match(gap.section, /T18: a declared speed gap with no closing route \(2026-11-12\)/);
  assert.ok(gap.bound_ms > 32.2 && gap.bound_ms <= 45, 'above the measured upper ends (T11 32.2, T14 about 30, the pilot 30), not far above');
  assert.deepEqual(gap.closes, { ticket: '#358', route: 'none' });
  assert.equal(declaredDragGap({ family: 'chrome', drag: 'dnd', route: 'background' }), null, 'in front only');
  assert.equal(declaredDragGap({ family: 'chrome', drag: 'canvas', route: 'background' }), null);
  assert.equal(declaredDragGap({ family: 'electron', drag: 'dnd', route: 'in-front' }), null);
  assert.equal(DRAG_SPEED_GAPS.length, 1);
});

test('closes names the milestone that closes a gap, or, with no closing route, its ticket (Acceptance 3 amended)', () => {
  assert.equal(closesText({ ticket: '#358', route: 'none' }), 'no closing route; tracked by #358');
  assert.equal(closesText('M5'), 'closed by M5');
  assert.throws(() => closesText(null), /closes/);
  assert.throws(() => closesText({ ticket: '#358' }), /closes/);
  assert.throws(() => closesText({ ticket: '358', route: 'none' }), /closes/);
});

test('a declared cell reads "declared speed gap": no failure, listed apart, never a pass', () => {
  const cell = dnd();
  assert.deepEqual(laneFailures(cell, 'cua'), []);
  assert.equal(cellVerdict(cell, 'cua'), 'declared speed gap (#358)');
  const v = dragVerdict([cell]);
  assert.deepEqual(v.failed, []);
  assert.equal(v.pass, true, 'no failure, so the run passes');
  assert.deepEqual(v.declared, ["chrome dnd: cua declared speed gap (#358): cua 366.1 ms against newest's 338.2 ms, the interval [25.5, 30] within the declared 40 ms"]);
  assert.match(judgeNotes(cell, ['cua']), /cua \*\*declared speed gap \(#358\)\*\* \[25\.5, 30\]/);
});

test('an undeclared loss still fails: the same loss on a cell no declaration names', () => {
  for (const cell of [dnd({ route: 'background' }), dnd({ drag: 'canvas', route: 'background' }), dnd({ family: 'firefox', drag: 'canvas', route: 'background' })]) {
    assert.match(laneFailures(cell, 'cua').join(), /cua speed: cua 366\.1 ms/);
    assert.equal(cellVerdict(cell, 'cua'), '**FAIL**');
    assert.equal(dragVerdict([cell]).pass, false);
  }
});

test('a declared cell fails when its interval passes the declared bound, or when it misses its effect', () => {
  const over = dnd({ interval: [38, 52] });
  assert.match(laneFailures(over, 'cua').join(), /chrome dnd: cua speed beyond its declared gap \(#358, 40 ms\): the interval \[38, 52\]/);
  assert.equal(cellVerdict(over, 'cua'), '**FAIL**');
  const missed = dnd({ lane: { took: 29, n: 30, misses: [7], witness: false, pass: false } });
  assert.match(laneFailures(missed, 'cua').join(), /chrome dnd: cua missed runs 7/);
  assert.equal(dragVerdict([missed]).pass, false);
  assert.equal(cellVerdict(missed, 'cua'), '**FAIL**');
  const undetermined = { ...dnd(), speed: { cua: { verdict: 'undetermined', reasons: [] } } };
  assert.match(laneFailures(undetermined, 'cua').join(), /undetermined/, 'a gap excuses a measured loss, not a series that never decided');
});

test('a passing cell reads PASS, and a measurement lane is never judged against the gap', () => {
  const fast = { ...dnd(), speed: { cua: { verdict: 'pass', label: 'faster', interval: [-5, -1], candidate: 330, against: 'newest', bar: 338 } } };
  assert.equal(cellVerdict(fast, 'cua'), 'PASS');
  assert.deepEqual(dragVerdict([fast]).declared, []);
});
