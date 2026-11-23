// #487's own case as a development cell (task 142, ruling 1102): an Electron drop whose drag names a zero-rest GTK 4
// window beside it, on the dedicated foreground route, so its press, and the drag loop its settle waits for, are
// Electron's. Measured, never gated: each drop counted as T17's judge counts it (false ok, stale drop, honest
// unconfirmed, landed), and only a drop whose own record proves the case (the named window's pacing GTK 4's with rest 0,
// the foreground route, the press Electron's and its source started, the settle run) counts as exercising it.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LANES, NAMED_PLACE, PLANS, namedPath, pathUnder, planSpecs } from '../../scripts/linux-engine-diff/drop-signals.mjs';
import { NAMED_LANE, judgedDropSignalsPlan, namedSourceTable, namedSourceUnproven } from '../../scripts/linux-engine-diff/drop-signals-judge.mjs';
import { dropRow } from './drop-rows.mjs';

const settle = (rest) => ({ before_rest: { answered: true }, second_rest: 'needless', after_motion: { answered: true }, settled: true, settle_failed_activation_confirmed: false, ...(rest === undefined ? {} : { rest_ms: rest }) });

/** A drop of the named lane that exercised the case: landed and ok by default. */
const named = ({ i = 0, rest, ...o } = {}) => ({
  ...dropRow({ family: 'electron', lane: NAMED_LANE, i, ...o }),
  route: 'foreground',
  drag_pacing: { family: 'GTK 4', rest_ms: 0, step_us: 0 },
  drop_cursor: { accepted: true, settle: settle(rest) },
});

test('the plan is a development plan of the named lane alone: no gate judge holds it', () => {
  assert.deepEqual(PLANS['t487-named'], [[NAMED_LANE, 'plain', 100]]);
  assert.deepEqual(planSpecs({ plan: 't487-named', trials: 3 }), [{ lane: NAMED_LANE, cell: 'plain', n: 3 }]);
  assert.deepEqual(LANES[NAMED_LANE], { args: ['--desktop', 'dedicated'], named: 'gtk4-button' });
  assert.equal(judgedDropSignalsPlan({ families: ['electron'], plan: 't487-named' }), false);
});

test("the path goes to the engine in the named window's coordinates, the same screen points", () => {
  const scene = { window: { x: 2, y: 30 } };
  const path = [{ x: 530, y: 128 }, { x: 570, y: 128 }];
  assert.deepEqual(namedPath(scene, { x: 962, y: 268 }, path), [{ x: -430, y: -110 }, { x: -390, y: -110 }]);
});

test("the named window's frame may cover no point of the path, its segments' too", () => {
  const path = [{ x: 530, y: 128 }, { x: 570, y: 128 }];
  assert.deepEqual(pathUnder({ x: 960, y: 240, w: 240, h: 200 }, path), []);
  // over the segment's middle, neither end
  const middle = pathUnder({ x: 545, y: 100, w: 10, h: 50 }, path);
  assert.deepEqual([middle.length, middle[0], middle.at(-1)], [10, { x: 545, y: 128 }, { x: 554, y: 128 }]);
  assert.deepEqual(pathUnder({ x: 560, y: 120, w: 20, h: 20 }, path)[0], { x: 560, y: 128 });
  // the place clears the Electron scene (at the screen's left, 900 wide with its frame) and the front xterm's corner
  const [x, y, w, h] = NAMED_PLACE;
  assert.ok(x > 920 && x + w < 1272 && y + h < 600, String(NAMED_PLACE));
});

test('a drop that proves the case is exercised; each missing proof is named', () => {
  assert.deepEqual(namedSourceUnproven(named()), []);
  const cases = [
    ['pacing', { drag_pacing: { family: 'xterm', rest_ms: 0 } }],
    ['pacing', { drag_pacing: { family: 'GTK 4', rest_ms: 30 } }],
    ['pacing', { drag_pacing: undefined }],
    ['route', { route: 'background' }],
    ['press', { drop_cursor: undefined }],
    ['start', { outcome: { started: false, landed: false, effect: null } }],
    ['settle', { drop_cursor: { accepted: true } }],
  ];
  for (const [why, edit] of cases) assert.ok(namedSourceUnproven({ ...named(), ...edit }).includes(why), `${why}: ${JSON.stringify(edit)}`);
});

test("each drop counted by T17's definitions, exercised and not apart: never a pass on a drop that did not prove the case", () => {
  const rows = [
    named({ i: 0 }),
    named({ i: 1 }),
    // honest unconfirmed, no drop
    named({ i: 2, landed: false, pending: 'unconfirmed' }),
    // a false ok: ok, nothing pending, no drop
    named({ i: 3, landed: false, effect: 0 }),
    // unexercised: the background route, landed
    { ...named({ i: 4 }), route: 'background' },
    // unexercised: no settle, a false ok
    { ...named({ i: 5, landed: false, effect: 0 }), drop_cursor: { accepted: false } },
    // another lane's row is not this table's
    dropRow({ family: 'electron', lane: 'cua', i: 0 }),
  ];
  const { counts, md } = namedSourceTable(rows);
  assert.deepEqual(counts, {
    drags: 6,
    exercised: { drags: 4, landed: 2, false_ok: 1, stale: 0, honest_unconfirmed: 1, ambiguous: 0, error: 0 },
    unexercised: { drags: 2, landed: 1, false_ok: 1, stale: 0, honest_unconfirmed: 0, ambiguous: 0, error: 0 },
    unproven: { pacing: 0, route: 1, press: 0, start: 0, settle: 1 },
    settle_rest_ms: { absent: 5 },
  });
  const text = md.join('\n');
  assert.match(text, /\| exercised \| 4 \| 2 \| 1 \| 0 \| 1 \| 0 \| 0 \|/);
  assert.match(text, /\| not exercised \| 2 \| 1 \| 1 \| 0 \| 0 \| 0 \| 0 \|/);
  assert.match(text, /route 1, .*settle 1/);
});

test("a stale drop is T17's: the zone counted a drop the path did not end in", () => {
  // the plain cell ends in the zone, so a landing there is landed; the `left` cell's would be stale
  const { counts } = namedSourceTable([{ ...named({ cell: 'left', landed: true }) }]);
  assert.equal(counts.exercised.stale, 1);
  assert.equal(counts.exercised.landed, 0);
});

test("the settles' rests are tallied, so 0.4.4's fix wave shows Electron's 30 ms", () => {
  const { counts, md } = namedSourceTable([named({ i: 0, rest: 30 }), named({ i: 1, rest: 30 }), named({ i: 2, rest: 0 })]);
  assert.deepEqual(counts.settle_rest_ms, { 0: 1, 30: 2 });
  assert.match(md.join('\n'), /rest_ms: 0 ms 1, 30 ms 2/);
});

test('a sitting with none of the lane prints nothing', () => {
  assert.deepEqual(namedSourceTable([dropRow({ family: 'electron' })]).md, []);
});
