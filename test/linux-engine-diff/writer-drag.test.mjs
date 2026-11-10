import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PLANS, PRIMARY_MARKER, aimAt, caseRow, firstVerdict, observed, observedOnParity, parkPoint, writerPlan } from '../../scripts/linux-engine-diff/writer-drag.mjs';
import { clippedCentre, onElement } from '../../scripts/linux-engine-diff/vcl-probe.mjs';

const lanes = [{ label: 'pinned' }, { label: 'cua' }];
const run = (over) => ({ ok: true, selection: [], primary: PRIMARY_MARKER, caret_moved: true, witness: true, ...over });

test("a run is seen selected only by the text its path spans, through AT-SPI or PRIMARY, and never by the harness's marker", () => {
  // the even path spans characters 2 to 20 of the first line
  assert.deepEqual(observed(run({ selection: [{ paragraph: 0, start: 2, end: 20, text: 'pha bravo charlie ' }] })), { atspi: true, primary: false, any: true });
  assert.deepEqual(observed(run({ primary: 'pha bravo charlie ' })), { atspi: false, primary: true, any: true });
  assert.deepEqual(observed(run({})), { atspi: false, primary: false, any: false }, 'the marker still owning PRIMARY is nothing selected');
  assert.equal(observed(run({ selection: [{ paragraph: 0, start: 2, end: 4, text: 'ph' }] })).any, false, 'a short selection is not the path');
  assert.equal(observed(run({ primary: null })).any, false, 'an unreadable PRIMARY is nothing');
});

test("a shared window's odd runs are seen by the odd path's text", () => {
  const odd = run({ parity: 1, selection: [{ paragraph: 0, start: 24, end: 40, text: 'a echo foxtrot g' }] });
  assert.equal(observedOnParity(odd).atspi, true);
  assert.equal(observedOnParity({ ...odd, selection: [{ text: 'pha bravo charlie ' }] }).atspi, false, "the even path's text on an odd run is a miss");
});

test("a case's row counts each observer apart, any selection at all, and the witness", () => {
  const k = PLANS.observe[0];
  const runs = [run({ primary: 'pha bravo charlie ' }), run({ selection: [{ text: 'x' }], witness: false }), run({ caret_moved: false })].map((r) => ({ ...r, observed: observed(r) }));
  const row = caseRow(k, runs);
  assert.equal(row.n, 3);
  assert.equal(row.primary, 1);
  assert.equal(row.atspi, 0);
  assert.equal(row.selected, 1);
  assert.equal(row.nonempty, 2, 'a selection off the path still counts as something selected');
  assert.equal(row.caret_moved, 2);
  assert.equal(row.witness, false);
});

test('the pointer parks on the text, in the window off it, beside it, or stays', () => {
  const window = { x: 0, y: 30, width: 1100, height: 760 };
  const path = [{ x: 300, y: 200 }, { x: 440, y: 200 }];
  assert.deepEqual(parkPoint('text', window, path), { x: 300, y: 230 });
  assert.deepEqual(parkPoint('blank', window, path), { x: 550, y: 670 });
  const out = parkPoint('out', window, path);
  assert.ok(out.x >= window.x + window.width, 'outside the window');
  assert.equal(parkPoint('none', window, path), null);
  assert.throws(() => parkPoint('under', window, path), /unknown pointer park/);
});

test('a plan names only lanes the run has, and an unknown plan is refused', () => {
  assert.equal(writerPlan({}, lanes), PLANS.observe);
  assert.throws(() => writerPlan({ plan: 'nope' }, lanes), /writer-drag plans/);
  const saved = PLANS.mechanism;
  try {
    PLANS.mechanism = [...saved, { name: 'slow', lane: 'cua:slow' }];
    assert.throws(() => writerPlan({ plan: 'mechanism' }, lanes), /needs lane cua:slow/);
    assert.equal(writerPlan({ plan: 'mechanism' }, [...lanes, { label: 'cua:slow' }]).length, saved.length + 1);
  } finally {
    PLANS.mechanism = saved;
  }
});

test("a case aims as the drag cell does, or from the X11 window's origin (the pre-T16 aim), or from the AT-SPI frame's", () => {
  const charExtents = (offset) => ({ x: 282 + 8 * offset, y: 220, w: 8, h: 15 });
  const window = { x: 0, y: 21 };
  assert.equal(aimAt('locate', { charExtents, frame: { x: 0, y: 0 }, window }), null);
  assert.deepEqual(aimAt('raw', { charExtents, frame: { x: 0, y: 0 }, window })(2), [302, 207]);
  assert.deepEqual(aimAt('frame', { charExtents, frame: { x: 0, y: 0 }, window })(2), [302, 228]);
  assert.throws(() => aimAt('atspi', { charExtents, frame: {}, window }), /unknown aim/);
});

test("the proof passes only on 30 or more of cua's first drags, every aimed case selecting with a clean witness, a clean audit, and a control that misses", () => {
  const row = (over) => ({ case: 'x', aim: 'locate', n: 10, selected: 10, witness: true, audit: null, ...over });
  const good = [row({ case: 'cua-first', n: 30, selected: 30 }), row({ case: 'pinned-first' }), row({ case: 'cua-first-audit', n: 3, selected: 3, audit: { clean: true } }), row({ case: 'cua-first-raw', aim: 'raw', n: 5, selected: 0 })];
  assert.deepEqual(firstVerdict(good), { pass: true, failed: [] });
  assert.match(firstVerdict([...good.slice(0, 3), row({ case: 'cua-first-raw', aim: 'raw', n: 5, selected: 1 })]).failed.join(), /CONTROL NON-DISCRIMINATING/);
  assert.match(firstVerdict([row({ case: 'cua-first', n: 30, selected: 29 }), ...good.slice(1)]).failed.join(), /selected 29 of 30/);
  assert.match(firstVerdict([row({ case: 'cua-first', n: 20, selected: 20 }), ...good.slice(1)]).failed.join(), /fewer than 30/);
  assert.match(firstVerdict([good[0], good[1], row({ case: 'cua-first-audit', n: 3, selected: 3, audit: { clean: false } }), good[3]]).failed.join(), /audit is not clean/);
  assert.match(firstVerdict([row({ case: 'cua-first', n: 30, selected: 30, witness: false }), ...good.slice(1)]).failed.join(), /witness changed/);
});

test("the element probe's truth is the corrected centre clipped to the window, and a press within 2 px of it is on the element", () => {
  const win = { x: 0, y: 21, width: 1280, height: 779 };
  assert.deepEqual(clippedCentre({ x: 207, y: 247, w: 793, h: 15 }, win), { x: 603, y: 254 });
  assert.deepEqual(clippedCentre({ x: -50, y: 10, w: 100, h: 30 }, win), { x: 25, y: 30 }, 'clipped by the window');
  assert.equal(onElement({ x: 603, y: 254 }, { x: 603, y: 254 }), true);
  assert.equal(onElement({ x: 603, y: 227 }, { x: 603, y: 254 }), false, "27 px above: the header margin");
  assert.equal(onElement(null, { x: 1, y: 1 }), false);
});
