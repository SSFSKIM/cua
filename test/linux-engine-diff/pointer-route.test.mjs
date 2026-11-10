import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { caretMoved } from '../../scripts/linux-engine-diff/kinds.mjs';
import { OCCLUSION_PARKS, OUT_POINT, ROUTE_FAMILIES, cellCounts, cellKey, parkHeld, parkPoint, placeOf, routeLanes, routeMarkdown, routePlan, selectTook } from '../../scripts/linux-engine-diff/pointer-route.mjs';

const window = { x: 0, y: 30, width: 1050, height: 760 };

test('the sitting crosses every pointer place each occlusion has with the four kinds, in every family', () => {
  assert.deepEqual(OCCLUSION_PARKS, { visible: ['in', 'out'], partial: ['in', 'under', 'out'], covered: ['under', 'out'] }, 'a fully covered window has no visible part to be in');
  const plan = routePlan();
  assert.equal(plan.length, 4 * 7 * 4, 'four families, seven places, four kinds');
  assert.deepEqual([...new Set(plan.map((c) => c.family))], ['firefox', 'chrome', 'electron', 'gedit'], 'the subject first, then the controls');
  for (const family of Object.keys(ROUTE_FAMILIES)) {
    for (const [occlusion, parks] of Object.entries(OCCLUSION_PARKS)) {
      for (const park of parks) {
        for (const kind of ['click', 'scroll', 'move', 'select']) assert.equal(plan.filter((c) => cellKey(c) === `${family} ${kind} ${occlusion} pointer-${park}`).length, 1);
      }
    }
  }
  assert.equal(plan.find((c) => c.kind === 'select').group, 'drag');
  assert.deepEqual(routePlan(['firefox'], ['move']).map(cellKey), ['firefox move visible pointer-in', 'firefox move visible pointer-out', 'firefox move partial pointer-in', 'firefox move partial pointer-under', 'firefox move partial pointer-out', 'firefox move covered pointer-under', 'firefox move covered pointer-out']);
  assert.throws(() => routePlan(['kate']), /no family kate/);
});

test("cua's lane runs with no cover rule in the way, and only the subject has the pinned build beside it", () => {
  const args = { cua: '/c', vendor: '/v' };
  assert.deepEqual(routeLanes('firefox', args), [{ label: 'cua', bin: '/c', args: ['--ignore-cover'] }, { label: 'pinned', bin: '/v', args: [] }]);
  for (const family of ['chrome', 'electron', 'gedit']) assert.deepEqual(routeLanes(family, args).map((l) => l.label), ['cua']);
});

test('the pointer parks in the visible top, under the bottom cover, or on the front window outside the scene', () => {
  const inPoint = parkPoint(window, 'in');
  assert.deepEqual(inPoint, { x: 735, y: 140 });
  assert.ok(inPoint.y < window.y + window.height / 2, 'above the partial cover, which is over the bottom half');
  const under = parkPoint(window, 'under');
  assert.ok(under.y > window.y + window.height / 2 && under.y < window.y + window.height, 'inside the geometry, under the cover');
  assert.deepEqual(parkPoint(window, 'out'), OUT_POINT);
  assert.ok(OUT_POINT.x > window.x + window.width, 'outside the widest scene');
  assert.throws(() => parkPoint(window, 'beside'), /no park/);
});

test("what lies under the pointer is the scene, the cover, another of the run's windows, the root or another's window", () => {
  const ids = { scene: { id: 5, window }, front: 9, ours: [5, 9, 11] };
  assert.equal(placeOf({ x: 10, y: 50 }, ids, { top: 100, holds: 5 }), 'scene');
  assert.equal(placeOf({ x: 10, y: 600 }, ids, { top: 101, holds: 9 }), 'cover', 'the front window inside the geometry');
  assert.equal(placeOf(OUT_POINT, ids, { top: 101, holds: 9 }), 'harness', 'the front window outside it');
  assert.equal(placeOf({ x: 10, y: 50 }, ids, { top: 102, holds: 11 }), 'harness');
  assert.equal(placeOf({ x: 10, y: 50 }, ids, { top: 0 }), 'root');
  assert.equal(placeOf({ x: 10, y: 50 }, ids, { top: 103, holds: null }), 'foreign');
});

test('a park holds only when the request finds the pointer where the place says', () => {
  assert.equal(parkHeld('in', 'scene', { x: 10, y: 50 }, window), true);
  assert.equal(parkHeld('in', 'cover', { x: 10, y: 600 }, window), false);
  assert.equal(parkHeld('under', 'cover', { x: 10, y: 600 }, window), true);
  assert.equal(parkHeld('under', 'cover', OUT_POINT, window), false, 'the cover outside the geometry is out, not under');
  assert.equal(parkHeld('out', 'harness', OUT_POINT, window), true);
  assert.equal(parkHeld('out', 'root', { x: 1270, y: 10 }, window), true);
  assert.equal(parkHeld('out', 'scene', { x: 10, y: 50 }, window), false);
  assert.equal(parkHeld('out', 'foreign', OUT_POINT, window), false);
});

test("a selection took only when it is the stretch its path spans, and on a page only when the press reached it", () => {
  // the even runs span characters 2 to 20, the odd ones 24 to 40 (drag.mjs selectOffsets)
  const even = 'pha bravo charlie d';
  assert.equal(selectTook({ ok: true, i: 0, after: even }, false), true);
  assert.equal(selectTook({ ok: true, i: 1, after: even }, false), false, 'the other stretch is an old selection');
  assert.equal(selectTook({ ok: true, i: 0, after: '' }, false), false);
  assert.equal(selectTook({ ok: false, i: 0, after: even }, false), true, 'the effect, whatever the engine answered');
  const page = { ok: true, i: 0, after: even.replaceAll(' ', '_') };
  assert.equal(selectTook({ ...page, received: { seq: 3 } }, true), true);
  assert.equal(selectTook({ ...page, received: null }, true), false, 'no press of its own reached the page');
  assert.equal(selectTook({ ok: true, i: 0, after: 'none', received: { seq: 3 } }, true), false);
});

test("a cell's counts say per lane how many took, answered ok, answered ok with no effect, changed the witness and found the park held", () => {
  const run = (engine, took, extra = {}) => ({ engine, took, ok: true, witness: true, pointer: { held: true }, ...extra });
  const counts = cellCounts([run('cua', true), run('cua', false, { pointer: { held: false } }), run('pinned', false, { ok: false, witness: false })]);
  assert.deepEqual(counts.cua, { n: 2, took: 1, ok: 2, ok_no_effect: 1, witness_changed: 0, park_held: 1 });
  assert.deepEqual(counts.pinned, { n: 1, took: 0, ok: 0, ok_no_effect: 0, witness_changed: 1, park_held: 1 });
  const md = routeMarkdown([{ family: 'firefox', kind: 'move', occlusion: 'partial', park: 'under', lanes: counts }, { family: 'chrome', kind: 'click', occlusion: 'visible', park: 'in', lanes: { cua: { n: 10, took: 10, ok: 10, ok_no_effect: 0, witness_changed: 0, park_held: 10 } } }]);
  assert.equal(md[2], '| Firefox | move | partial | under | 1/2 (1 ok with no effect, park missed 1) | 0/1 (1 not ok, witness 1) |');
  assert.equal(md[3], '| Chrome | click | visible | in | 10/10 | – |');
});

test("an editor's click took when its caret moved", () => {
  assert.equal(caretMoved(12, 40), true);
  assert.equal(caretMoved(12, 12), false);
  assert.equal(caretMoved(null, 12), null);
});

test('the command line runs the sitting as an experiment beside the pinned build', () => {
  const a = parseArgs(['--experiment', 'pointer-route', '--cua', '/c', '--vendor', '/v', '--out', '/o', '--family', 'firefox,gedit', '--trials', '3']);
  assert.equal(a.experiment, 'pointer-route');
  assert.deepEqual(a.families, ['firefox', 'gedit']);
  assert.equal(a.samplesTrials, 3);
  assert.throws(() => parseArgs(['--experiment', 'pointer-route', '--cua', '/c', '--out', '/o']), /vendor/);
});
