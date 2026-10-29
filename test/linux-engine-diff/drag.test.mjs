import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CORNERS, DRAG_FAMILIES, dragEngines, judgeCell, judgeRuns, pagePath, parseDragStatus, runPath, selectOffsets } from '../../scripts/linux-engine-diff/drag.mjs';
import { FAMILIES } from '../../scripts/linux-engine-diff/families.mjs';

test("the drag page's status lines parse into each kind's value", () => {
  const s = parseDragStatus(['Range', 'select pha_bravo_charlie_de', 'range 75', 'scroller 117', 'dnd starts 2 drops 1', 'canvas strokes 3 moves 2 dev 140']);
  assert.deepEqual(s, { select: 'pha_bravo_charlie_de', range: 75, scroller: 117, dnd: { starts: 2, drops: 1 }, canvas: { strokes: 3, moves: 2, dev: 140 } });
  assert.equal(parseDragStatus([]).range, null, 'a missing line is unknown, never zero');
});

test('every family of the experiment is a family of the matrix; the lanes are the reference, cua as it ships and cua at 0 ms', () => {
  for (const family of Object.keys(DRAG_FAMILIES)) assert.ok(FAMILIES[family], family);
  const lanes = dragEngines({ vendor: 'v', newest: 'n', cua: 'c', variants: [{ label: 'cua:dwell', args: ['--drag-step-ms', '0', '--drag-press-dwell-ms', '30'] }] });
  assert.deepEqual(lanes.map((l) => l.label), ['pinned', 'newest', 'cua', 'cua:0ms', 'cua:dwell']);
  assert.deepEqual(lanes[2].args, [], 'as it ships: paced by family');
  assert.deepEqual(lanes[3].args, ['--drag-step-ms', '0', '--drag-press-dwell-ms', '0', '--drag-release-dwell-ms', '0']);
  assert.equal(lanes[4].bin, 'c');
});

test('paths: the page kinds alternate where a drag leaves its target, the canvas follows its corners', () => {
  assert.deepEqual(pagePath('range', 0)[0], pagePath('range', 1)[1].map((v, k) => (k === 0 ? 28 : v)), 'odd runs end where the even ones start, near 0');
  assert.deepEqual(pagePath('range', 0).at(-1), pagePath('range', 1)[0]);
  assert.deepEqual(pagePath('canvas', 3), CORNERS.map(([x, y]) => [x + 20, y + 350]));
  assert.deepEqual(pagePath('scroller', 1), pagePath('scroller', 0), 'the page puts its scroller back at the top: every drag is down');
  const at = { page: { x: 0, y: 87 } };
  assert.deepEqual(runPath(at, 'select', 0), [{ x: 50, y: 119 }, { x: 266, y: 119 }]);
  assert.deepEqual(selectOffsets(1), [24, 40], "disjoint from the even runs: a press inside a selection drags the text");
  const bar = { scrollbar: { id: 's', extents: { x: 880, y: 100, w: 14, h: 500 } } };
  assert.deepEqual(runPath(bar, 'scrollbar', 0), [{ x: 887, y: 130 }, { x: 887, y: 280 }]);
  assert.deepEqual(runPath(bar, 'scrollbar', 1), [{ x: 887, y: 280 }, { x: 887, y: 130 }]);
});

const run = (engine, i, before, after, ok = true) => ({ engine, i, before, after, ok, witness: true });

test("a value kind's run took effect when it ends where the pinned build's runs of its parity mostly end", () => {
  const runs = [
    run('pinned', 0, 25, 75), run('pinned', 1, 75, 25), run('pinned', 2, 25, 75), run('pinned', 3, 75, 25),
    run('cua:0ms', 0, 25, 76), run('cua:0ms', 1, 76, 25), run('cua:0ms', 2, 25, 25), run('cua:0ms', 3, 25, 25),
  ];
  const judged = judgeRuns('range', runs);
  assert.deepEqual(judged.expected, { 0: 75, 1: 25 });
  assert.deepEqual(judged.runs.filter((r) => r.engine === 'cua:0ms').map((r) => r.took), [true, true, false, true], 'within 1, and a stale value of the other parity is a miss');
  const cell = judgeCell(judged.runs, ['cua:0ms']);
  assert.equal(cell.pinned_took, 4);
  assert.deepEqual(cell.lanes['cua:0ms'].misses, [2]);
  assert.equal(cell.lanes['cua:0ms'].pass, false);
});

test('a thumb drag is judged by how far it moved the content, within a quarter of the pinned build\'s median, stopping at 0', () => {
  const runs = [
    run('pinned', 0, 0, 139), run('pinned', 1, 139, 14), run('pinned', 2, 14, 141), run('pinned', 3, 141, 9), run('pinned', 4, 9, 133), run('pinned', 5, 133, 0),
    run('cua:0ms', 0, 0, 56), run('cua:0ms', 1, 56, 0), run('cua:0ms', 2, 0, 150), run('cua:0ms', 3, 150, 30), run('cua:0ms', 4, 30, 160), run('cua:0ms', 5, 160, 70),
  ];
  const judged = judgeRuns('scroller', runs);
  assert.deepEqual(judged.expected, { 0: { moved: 127 }, 1: { moved: -132 } });
  assert.deepEqual(judged.runs.filter((r) => r.engine === 'pinned').map((r) => r.took), [true, true, true, true, true, true]);
  // 56 is short; back to 0 from 56 is the stop at 0; +150, -120 and +130 are within 33; -90 is short
  assert.deepEqual(judged.runs.filter((r) => r.engine === 'cua:0ms').map((r) => r.took), [false, true, true, true, true, false]);
});

test('a selection compares its text; a drop needs one more drop; a canvas stroke must pass near every corner', () => {
  const select = judgeRuns('select', [run('pinned', 0, '', 'pha_bravo'), run('pinned', 1, 'pha_bravo', 'avo_charlie'), run('cua:0ms', 0, 'avo_charlie', 'pha_bravo'), run('cua:0ms', 1, 'pha_bravo', 'pha_bravo')]);
  assert.deepEqual(select.runs.map((r) => r.took), [true, true, true, false]);
  const dnd = judgeRuns('dnd', [run('pinned', 0, { drops: 0 }, { drops: 1 }), run('cua:0ms', 0, { drops: 4 }, { drops: 4 })]);
  assert.deepEqual(dnd.runs.map((r) => r.took), [true, false]);
  const stroke = (strokes, dev) => ({ strokes, moves: 9, dev });
  const canvas = judgeRuns('canvas', [run('pinned', 0, stroke(0, -1), stroke(1, 6)), run('cua:0ms', 0, stroke(0, -1), stroke(1, 140)), run('cua:0ms', 1, stroke(1, 140), stroke(1, 140))]);
  assert.deepEqual(canvas.runs.map((r) => r.took), [true, false, false]);
});

test('a cell the pinned build never takes is recorded, not judged; a changed witness fails a lane', () => {
  const none = judgeRuns('select', [run('pinned', 0, '', ''), run('cua:0ms', 0, '', '')]);
  assert.equal(judgeCell(none.runs, ['cua:0ms']).lanes['cua:0ms'].pass, null);
  const taken = judgeRuns('select', [run('pinned', 0, '', 'x'), { ...run('cua:0ms', 0, '', 'x'), witness: false }]);
  assert.equal(judgeCell(taken.runs, ['cua:0ms']).lanes['cua:0ms'].pass, false);
  // where the pinned build's own runs changed it (the application's drag and drop), the witness is not required
  const dropped = judgeRuns('dnd', [{ ...run('pinned', 0, { drops: 0 }, { drops: 1 }), witness: false }, { ...run('cua:0ms', 0, { drops: 0 }, { drops: 1 }), witness: false }]);
  assert.equal(judgeCell(dropped.runs, ['cua:0ms']).lanes['cua:0ms'].pass, true);
  // the newest build is a reference lane, never judged
  assert.deepEqual(Object.keys(judgeCell(dropped.runs, ['cua:0ms']).lanes), ['cua:0ms']);
});

test('a drag run is complete only when every requested family and kind finished; a structural error makes it incomplete', async () => {
  const { dragPlan, dragCompleteness } = await import('../../scripts/linux-engine-diff/drag.mjs');
  const plan = dragPlan(['chrome', 'gedit', 'nosuch'], ['select', 'scroller', 'scrollbar']);
  assert.deepEqual(plan, [
    { family: 'chrome', kind: 'select' }, { family: 'chrome', kind: 'scroller' },
    { family: 'gedit', kind: 'select' }, { family: 'gedit', kind: 'scrollbar' },
  ]);
  assert.equal(dragPlan(['gedit'], null).length, 2, 'without --ops, every kind of the family');
  const cell = (family, drag, pass = true) => ({ family, drag, lanes: { cua: { pass } } });
  const all = [cell('chrome', 'select'), cell('chrome', 'scroller', false), cell('gedit', 'select'), cell('gedit', 'scrollbar')];
  assert.deepEqual(dragCompleteness(plan, all, []), { complete: true, failed: [] }, 'a lane that misses is an outcome, not an incompleteness');
  // a later kind throws after an earlier kind of the same family completed
  const partial = dragCompleteness(plan, [cell('chrome', 'select'), cell('gedit', 'select'), cell('gedit', 'scrollbar')], [{ family: 'chrome', kind: 'scroller', error: 'Error: no thumb' }]);
  assert.equal(partial.complete, false);
  assert.deepEqual(partial.failed, ['chrome scroller: Error: no thumb']);
  assert.deepEqual(dragCompleteness(plan, all.slice(0, 3), []), { complete: false, failed: ['gedit scrollbar: not measured'] });
  assert.equal(dragCompleteness(plan, all, [{ family: 'gedit', kind: null, error: 'Error: closing' }]).complete, false, 'an error after every cell still makes the run incomplete');
});
