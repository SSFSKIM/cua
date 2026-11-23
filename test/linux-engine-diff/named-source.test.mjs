// #487's own case as a development cell (task 142, ruling 1102): an Electron drop whose drag names a zero-rest GTK 4
// window beside it, on the dedicated foreground route, so its press, and the drag loop its settle waits for, are
// Electron's. Measured, never gated: each drop counted as T17's judge counts it (false ok, stale drop, honest
// unconfirmed, landed), and only a drop whose own record proves the case (the named window's pacing GTK 4's with rest 0,
// the foreground route, the press Electron's and its source started, the settle run) counts as exercising it.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LANES, NAMED_PLACE, PLANS, frameAround, namedAim, namedPath, pathUnder, planSpecs, rootClientRect } from '../../scripts/linux-engine-diff/drop-signals.mjs';
import { ParkRefused } from '../../scripts/linux-engine-diff/park.mjs';
import { NAMED_LANE, judgedDropSignalsPlan, namedSourceTable, namedSourceUnproven } from '../../scripts/linux-engine-diff/drop-signals-judge.mjs';
import { dropRow } from './drop-rows.mjs';

const settle = (rest) => ({ before_rest: { answered: true }, second_rest: 'needless', after_motion: { answered: true }, settled: true, settle_failed_activation_confirmed: false, ...(rest === undefined ? {} : { rest_ms: rest }) });

/** The scene's Electron window (its `drop-signal-scene` row's `window`). */
const ELECTRON = 5;
/** The judge's view of a named drop, the scene's Electron window given. */
const unproven = (r) => namedSourceUnproven(r, { electronWindow: ELECTRON });
/** The named lane's table, the scene's Electron window given. */
const table = (rows) => namedSourceTable(rows, { electronWindow: ELECTRON });

/** A drop of the named lane that exercised the case: landed and ok by default. */
const named = ({ i = 0, rest, ...o } = {}) => ({
  ...dropRow({ family: 'electron', lane: NAMED_LANE, i, ...o }),
  route: 'foreground',
  drag_pacing: { family: 'GTK 4', rest_ms: 0, step_us: 0 },
  drop_cursor: { accepted: true, settle: settle(rest) },
  // the engine's count of the settles the drag's request entered (drop-signals.mjs `settleCount`)
  settle_count: { before: 0, after: 1, entered: 1, before_from: 'fresh', after_from: 1, requests: { first: 1, last: 1 } },
  // where the press went (drop-signals.mjs `namedAim`): inside the plain source, the pointer parked over the scene there
  named: { id: 7, x: 961, y: 262, aim: { root: { x: 530, y: 128 }, park: { ok: true, at: { x: 530, y: 128 }, chain: [4, ELECTRON] }, source: { x: 505, y: 110, w: 50, h: 36 }, inside: true } },
});

/** `xwininfo -id` for the named window under the harness's Openbox, its client's real origin (961, 262). */
const XWININFO = `
xwininfo: Window id: 0x1e00004 "cua171-diff-named"

  Absolute upper-left X:  961
  Absolute upper-left Y:  262
  Relative upper-left X:  1
  Relative upper-left Y:  22
  Width: 240
  Height: 180
  Depth: 24
`;
/** `xdotool getwindowgeometry --shell` for the same window: Openbox's decoration offset counted twice (962, 284). */
const XDOTOOL = { X: 962, Y: 284, WIDTH: 240, HEIGHT: 180 };

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

test("wave 3, P1 1: the named path is given from the client's real root origin (xwininfo's), so the press lands where it is meant", () => {
  const real = rootClientRect(XWININFO);
  assert.deepEqual(real, { x: 961, y: 262, width: 240, height: 180 });
  assert.equal(rootClientRect('xwininfo: error: no such window'), null);
  // the engine adds the named window's real origin to the path it is given (x11.rs `desktop_position`)
  const scene = { window: { x: 0, y: 0 } };
  const meant = [{ x: 530, y: 128 }, { x: 570, y: 128 }];
  const lands = (origin) => namedPath(scene, origin, meant).map((p) => ({ x: real.x + p.x, y: real.y + p.y }));
  assert.deepEqual(lands(real), meant);
  // from xdotool's origin the press went to (529, 106), above the plain source, which starts at y 110
  assert.deepEqual(lands({ x: XDOTOOL.X, y: XDOTOOL.Y })[0], { x: 529, y: 106 });
  // the frame around the real client, by the window manager's extents (left, right, top, bottom)
  assert.deepEqual(frameAround(real, [1, 1, 22, 5]), { x: 960, y: 240, w: 242, h: 207 });
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
  assert.deepEqual(unproven(named()), []);
  const cases = [
    ['pacing', { drag_pacing: { family: 'xterm', rest_ms: 0 } }],
    ['pacing', { drag_pacing: { family: 'GTK 4', rest_ms: 30 } }],
    ['pacing', { drag_pacing: undefined }],
    ['route', { route: 'background' }],
    ['press', { drop_cursor: undefined }],
    ['start', { outcome: { started: false, landed: false, effect: null } }],
    ['settle', { drop_cursor: { accepted: true } }],
    // the review of 86d6b945: the Electron scene's row, and a real settle record on the drag's own watch
    ['electron', { family: 'chrome' }],
    ['electron', { family: undefined }],
    ['press', { drop_cursor: true }],
    ['press', { drop_cursor: [] }],
    ['press', { drop_cursor: { accepted: null, error: 'connection refused', settle: settle() } }],
    ...[false, true, 0, 'settled', [], null].map((v) => ['settle', { drop_cursor: { accepted: true, settle: v } }]),
    ['settle', { drop_cursor: { accepted: true }, handle: { drop_cursor: { settle: settle() } } }],
    // the re-review of 1be3760e: the engine's own count is the evidence a settle ran, and copies must agree
    ['settle', { settle_count: { before: 0, after: 0, entered: 0 } }],
    ['settle', { settle_count: { before: 0, after: 2, entered: 2 } }],
    ['settle', { settle_count: undefined }],
    ['settle', { handle: { drop_cursor: { settle: false } } }],
    // a watch that failed to start is no press on Electron; a release read's own error is a watch that ran
    ['press', { drop_cursor: { accepted: null, error: 'connection refused', settle: settle() } }],
    // wave 3: the press shown on the source (ruling 1143 (c)), and a count whole and its own
    ['aim', { named: undefined }],
    ['aim', { named: { aim: { inside: false, park: { ok: true } } } }],
    ['aim', { named: { aim: { inside: true, park: { ok: false, why: 'over another window' } } } }],
    ['aim', { named: { aim: { inside: null, park: { ok: true } } } }],
    ['settle', { settle_count: { before: 0, after: 1, entered: 0 } }],
    ['settle', { settle_count: { before: 4, after: 4, entered: 1 } }],
  ];
  const readError = { ...named(), drop_cursor: { steps: [], accepted: null, error: 'the read timed out', settle: settle() } };
  assert.equal(unproven(readError).includes('press'), false);
  for (const [why, edit] of cases) assert.ok(unproven({ ...named(), ...edit }).includes(why), `${why}: ${JSON.stringify(edit)}`);
});

test("the review's probe: a Chrome-labelled row whose settle is `false` is not exercised, and its landing is never counted as the case's", () => {
  const probe = { ...named({ i: 0 }), family: 'chrome', drop_cursor: { settle: false } };
  assert.deepEqual(unproven(probe), ['electron', 'settle']);
  const { counts } = table([probe]);
  assert.equal(counts.exercised.drags, 0);
  assert.equal(counts.exercised.landed, 0);
  assert.equal(counts.unexercised.landed, 1);
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
  const { counts, md } = namedSourceTable(rows, { electronWindow: ELECTRON });
  assert.deepEqual(counts, {
    drags: 6,
    exercised: { drags: 4, skipped: 0, landed: 2, false_ok: 1, stale: 0, honest_unconfirmed: 1, ambiguous: 0, error: 0 },
    unexercised: { drags: 2, skipped: 0, landed: 1, false_ok: 1, stale: 0, honest_unconfirmed: 0, ambiguous: 0, error: 0 },
    unproven: { electron: 0, pacing: 0, route: 1, aim: 0, press: 0, start: 0, settle: 1 },
    settle_rest_ms: { absent: 5 },
  });
  const text = md.join('\n');
  assert.match(text, /\| exercised \| 4 \| 0 \| 2 \| 1 \| 0 \| 1 \| 0 \| 0 \|/);
  assert.match(text, /\| not exercised \| 2 \| 0 \| 1 \| 1 \| 0 \| 0 \| 0 \| 0 \|/);
  assert.match(text, /electron 0, pacing 0, route 1, aim 0, .*settle 1/);
});

test("a stale drop is T17's: the zone counted a drop the path did not end in", () => {
  // the plain cell ends in the zone, so a landing there is landed; the `left` cell's would be stale
  const { counts } = table([{ ...named({ cell: 'left', landed: true }) }]);
  assert.equal(counts.exercised.stale, 1);
  assert.equal(counts.exercised.landed, 0);
});

test("the settles' rests are tallied, so 0.4.4's fix wave shows Electron's 30 ms", () => {
  const { counts, md } = table([named({ i: 0, rest: 30 }), named({ i: 1, rest: 30 }), named({ i: 2, rest: 0 })]);
  assert.deepEqual(counts.settle_rest_ms, { 0: 1, 30: 2 });
  assert.match(md.join('\n'), /rest_ms: 0 ms 1, 30 ms 2/);
});

test('a sitting with none of the lane prints nothing', () => {
  assert.deepEqual(table([dropRow({ family: 'electron' })]).md, []);
});

// ---------------------------------------------------------------------------------------------------------------
// fix wave 4 (the whole-branch re-review of 1317cc35)

test("wave 4, P2 3: the aim proves only with its content: the root inside the source, the parked point the root, the scene's Electron window under it", () => {
  const withAim = (aim) => ({ ...named(), named: { id: 7, x: 961, y: 262, aim } });
  // the reviewer's case: the flags alone
  assert.ok(unproven(withAim({ inside: true, park: { ok: true } })).includes('aim'));
  const full = named().named.aim;
  assert.deepEqual(unproven(withAim(full)), []);
  const cases = [
    ['the root outside the source', { ...full, root: { x: 600, y: 128 }, park: { ...full.park, at: { x: 600, y: 128 } } }],
    ['the parked point not the root', { ...full, park: { ...full.park, at: { x: 531, y: 128 } } }],
    ["the chain without the scene's window", { ...full, park: { ...full.park, chain: [4, 99] } }],
    ['no chain', { ...full, park: { ok: true, at: full.park.at } }],
    ['no source', { ...full, source: null }],
    ['no root', { ...full, root: undefined }],
    ['a refused park', { ...full, park: { ...full.park, ok: false } }],
    ['a refused aim with no park', { root: full.root, refused: 'the press point is under another window', top: 9, holds: 0 }],
  ];
  for (const [why, aim] of cases) assert.ok(unproven(withAim(aim)).includes('aim'), why);
  // with no Electron window known, no aim proves
  assert.ok(namedSourceUnproven(named()).includes('aim'));
});

test("wave 4, P2 4: a press point not over the scene's Electron window is refused before the warp, and nothing is pressed", async () => {
  const path = [{ x: 530, y: 128 }, { x: 570, y: 128 }];
  const calls = [];
  const ctx = (holds) => ({
    scene: { id: ELECTRON, window: { x: 0, y: 0 } },
    named: { x: 961, y: 262 },
    oracle: { extents: () => ({ x: 505, y: 110, w: 50, h: 36 }) },
    desktop: { topAt: (p, ids) => (calls.push(['topAt', p, ids]), { top: 11, holds }), state: async () => ({ ax_tree: { id: 'a', name: 'Plain source', children: [] } }) },
  });
  const park = (p) => (calls.push(['park', p]), { x: p.x, y: p.y, chain: [4, ELECTRON] });
  const refused = await namedAim(ctx(0), path, { park });
  assert.equal(calls.some(([k]) => k === 'park'), false, 'no warp');
  assert.match(refused.refused, /not over the scene's Electron window/);
  assert.deepEqual(refused.root, { x: 530, y: 128 });
  calls.length = 0;
  const aimed = await namedAim(ctx(ELECTRON), path, { park });
  assert.deepEqual(calls.map(([k]) => k), ['topAt', 'park']);
  assert.equal(aimed.refused, undefined);
  assert.deepEqual(aimed.park, { ok: true, at: { x: 530, y: 128 }, chain: [4, ELECTRON] });
  assert.equal(aimed.inside, true);
  // a park the pointer reading refuses after the warp (the window changed between): refused too, so nothing is pressed
  const late = await namedAim(ctx(ELECTRON), path, { park: () => { throw new ParkRefused('the pointer is over another window'); } });
  assert.match(late.refused, /the pointer is over another window/);
});

test('wave 4, P2 4: a refused trial is counted unexercised with its reason, never as an error, a false ok or a landing', () => {
  const skipped = { ...dropRow({ family: 'electron', lane: NAMED_LANE, i: 3, landed: false, started: false }), ok: undefined, skipped: 'the press point (530, 128) is not over the scene\'s Electron window', named: { aim: { root: { x: 530, y: 128 }, refused: 'x' } } };
  const { counts } = namedSourceTable([named({ i: 0 }), skipped], { electronWindow: ELECTRON });
  assert.equal(counts.exercised.drags, 1);
  assert.deepEqual(counts.unexercised, { drags: 1, skipped: 1, landed: 0, false_ok: 0, stale: 0, honest_unconfirmed: 0, ambiguous: 0, error: 0 });
});
