import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CORNERS, DRAG_FAMILIES, POINTER_INSIDE, dragEngines, dragPlan, judgeCell, judgeRuns, pagePath, parkInside, parseDragStatus, runPath, selectOffsets } from '../../scripts/linux-engine-diff/drag.mjs';
import { FAMILIES } from '../../scripts/linux-engine-diff/families.mjs';
import { ParkRefused } from '../../scripts/linux-engine-diff/park.mjs';

test("the drag page's status lines parse into each kind's value", () => {
  const s = parseDragStatus(['Range', 'select pha_bravo_charlie_de', 'range 75', 'scroller 117', 'dnd starts 2 drops 1 downs 3 detail 2 gap 412 selects 1 ends 2 effect 0 lat 31 dur 12 ups 1 at 123456789', 'canvas strokes 3 moves 2 dev 140']);
  assert.deepEqual(s, { select: 'pha_bravo_charlie_de', range: 75, scroller: 117, dnd: { starts: 2, drops: 1, downs: 3, detail: 2, gap: 412, selects: 1, ends: 2, effect: 0, lat: 31, dur: 12, ups: 1, at: 123456789 }, canvas: { strokes: 3, moves: 2, dev: 140 }, moves: null, received: null });
  assert.equal(parseDragStatus(['dnd starts 0 drops 0 downs 1 detail 1 gap -1 selects 0']).dnd.gap, -1, 'no press before it');
  assert.equal(parseDragStatus([]).range, null, 'a missing line is unknown, never zero');
});

test("the drag page's pointer log: every move between the source's press and its release, and the first past Blink's drag threshold", () => {
  // a drag that started: three moves, the third 4 px out (Blink's threshold off the Mac: |dx| or |dy| at least 4), then dragstart
  const started = parseDragStatus(['moves seq 7 n 3 start 6.2/6.9 up -1 cancel 6.2/7.0 end 381.0/382.4 m 1.0/1.3/1/0/1/1 2.1/2.4/2/0/1/1 4.4/6.8/4/0/1/2']);
  assert.deepEqual(started.moves, {
    seq: 7,
    n: 3,
    start: { t: 6.2, h: 6.9 },
    up: null,
    cancel: { t: 6.2, h: 7 },
    end: { t: 381, h: 382.4 },
    moves: [
      { t: 1, h: 1.3, dx: 1, dy: 0, buttons: 1, coalesced: 1 },
      { t: 2.1, h: 2.4, dx: 2, dy: 0, buttons: 1, coalesced: 1 },
      { t: 4.4, h: 6.8, dx: 4, dy: 0, buttons: 1, coalesced: 2 },
    ],
    past: 2,
  });
  // the miss's shape: the press and the release, no move past the threshold with the button held, no dragstart
  const missed = parseDragStatus(['moves seq 8 n 2 start -1 up 120.5/131.0 cancel -1 end -1 m 0.6/90.1/1/0/1/1 1.2/90.2/-5/0/0/1']);
  assert.equal(missed.moves.start, null);
  assert.deepEqual(missed.moves.up, { t: 120.5, h: 131 });
  assert.equal(missed.moves.past, null, 'a move past the threshold without the left button held cannot start a drag');
  assert.equal(parseDragStatus(['moves seq 9 n 0 start -1 up 3.0/3.1 cancel -1 end -1 m']).moves.moves.length, 0);
  assert.equal(parseDragStatus([]).moves, null, 'no log line: unknown');
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

// ---------------------------------------------------------------------------------------------------------------
// T10, the drag judges (M4; Acceptance 3; Decision Log, M4 pre-flight: speed judging, drags)

// the scene's and the run's parts from drag.mjs, the verdicts from drag-judge.mjs
const T10 = { ...(await import('../../scripts/linux-engine-diff/drag.mjs')), ...(await import('../../scripts/linux-engine-diff/drag-judge.mjs')) };
const { TOP_UP_SAMPLES, judgeSeriesSpeed } = await import('../../scripts/linux-engine-diff/stats.mjs');
const { medianDifferenceInterval } = await import('../../scripts/linux-engine-diff/events.mjs');

/** `n` samples around `ms`, spread by `jitter` on a fixed pattern. */
const around = (ms, n, jitter = 4) => Array.from({ length: n }, (_, k) => ms + (((k * 7) % 9) - 4) * (jitter / 4));
const sample = (usable, sampled = usable.length) => ({ usable, sampled });
const speedOpts = { vendors: ['pinned', 'newest'], candidate: 'cua', interval: medianDifferenceInterval };

test('a long path speed series with 19 usable samples a side is never judged, whichever way its medians point', () => {
  const v = judgeSeriesSpeed({ pinned: sample(around(1100, 19)), newest: sample(around(520, 19)), cua: sample(around(300, 19)) }, speedOpts);
  assert.equal(v.verdict, 'undetermined', 'far faster on its median, still not judged on 19');
  assert.equal(v.interval, null);
  // at 20 a side it is judged, and the verdict names the build that set the bar
  const judged = judgeSeriesSpeed({ pinned: sample(around(1100, 20)), newest: sample(around(520, 20)), cua: sample(around(300, 20)) }, speedOpts);
  assert.equal(judged.verdict, 'pass');
  assert.equal(judged.label, 'faster');
  assert.equal(judged.against, 'newest');
  assert.ok(judged.interval[1] < 0);
});

test("a vendor build under 20 usable samples at the top-ups' end gives the bar up; before the end it holds the series open", () => {
  // the newest build's canvas misses a third of its strokes: 18 usable of 40 sampled at the cap
  const capped = { pinned: sample(around(1100, 40)), newest: sample(around(300, 18), TOP_UP_SAMPLES), cua: sample(around(520, 39)) };
  const v = judgeSeriesSpeed(capped, speedOpts);
  assert.equal(v.against, 'pinned', 'the bar falls to the build with 20 usable');
  assert.deepEqual(v.failed_bar.map((f) => f.engine), ['newest']);
  assert.equal(v.verdict, 'pass');
  // the same 18 usable of 30 sampled: the newest might still set a lower bar, so the series is topped up, not judged
  assert.equal(judgeSeriesSpeed({ ...capped, newest: sample(around(300, 18), 30) }, speedOpts).verdict, 'undetermined');
  // both builds under 20 at the cap: no bar, recorded, never a pass on speed
  const nb = judgeSeriesSpeed({ pinned: sample(around(1100, 12), 40), newest: sample(around(300, 18), 40), cua: sample(around(520, 39)) }, speedOpts);
  assert.equal(nb.verdict, 'no bar');
  assert.equal(nb.against, null);
});

test('a slow long path fails; a wide interval is topped up to 40 and then fails; cua under 20 usable at the cap fails', () => {
  // M1a.4's Chrome canvas: cua 646 ms against the newest build's 517
  const slow = judgeSeriesSpeed({ pinned: sample(around(1196, 29)), newest: sample(around(517, 29)), cua: sample(around(646, 29)) }, speedOpts);
  assert.equal(slow.verdict, 'fail');
  assert.equal(slow.against, 'newest');
  assert.match(slow.reasons.join(' '), /above 0/);
  // a wide interval: cua's samples spread across the bar
  const spread = (n) => Array.from({ length: n }, (_, k) => (k % 2 ? 380 : 700));
  const wide = judgeSeriesSpeed({ pinned: sample(around(1196, 29)), newest: sample(around(520, 29)), cua: sample(spread(29)) }, speedOpts);
  assert.equal(wide.verdict, 'undetermined');
  assert.ok(wide.interval[0] <= 0 && wide.interval[1] > wide.bound);
  const wideAtCap = judgeSeriesSpeed({ pinned: sample(around(1196, 40)), newest: sample(around(520, 40)), cua: sample(spread(40)) }, speedOpts);
  assert.equal(wideAtCap.verdict, 'fail');
  const short = judgeSeriesSpeed({ pinned: sample(around(1196, 40)), newest: sample(around(520, 40)), cua: sample(around(400, 19), 40) }, speedOpts);
  assert.equal(short.verdict, 'fail');
  assert.match(short.reasons.join(' '), /19 usable/);
});

/** A long path's run: `ms`, whether it took, and whether it was its engine's first request. */
const timedRun = (engine, i, ms, { took = true, first = false, ok = true } = {}) => ({ engine, i, ms, took, ok, first_request: first });

test("a long path's speed counts warm runs that took: a cold first request and a vendor build's missed run are not usable", () => {
  const runs = [];
  for (const [engine, ms] of [['pinned', 1100], ['newest', 517], ['cua', 400]]) {
    for (let i = 0; i < 21; i++) runs.push(timedRun(engine, i, ms + (i % 3), { first: i === 0 }));
  }
  // the newest build missed two strokes: 18 warm usable of 21 drags, so the series stays open below the cap of 40 drags
  for (const r of runs.filter((r) => r.engine === 'newest' && [3, 4].includes(r.i))) r.took = false;
  const v = T10.dragSpeed(runs, { candidate: 'cua', vendors: ['pinned', 'newest'] });
  assert.equal(v.samples.newest.usable.length, 18);
  assert.equal(v.samples.newest.sampled, 21, 'every drag counts toward the 40 a side, the cold one included');
  assert.equal(v.samples.cua.usable.length, 20, 'the first request is cold, judged by the verdict run, not here');
  assert.equal(v.verdict, 'undetermined');
  // a cold first request's time never reaches the series: a 5 s cold start leaves the median alone
  const cold = runs.map((r) => (r.engine === 'cua' && r.first_request ? { ...r, ms: 5000 } : r));
  assert.ok(!T10.dragSpeed(cold, { candidate: 'cua', vendors: ['pinned', 'newest'] }).samples.cua.usable.includes(5000));
});

test('top-ups: a long path still undetermined is sampled on in rounds to 40 a side, never past it', () => {
  assert.equal(T10.topUpRuns({ verdict: 'undetermined' }, 30), 10);
  assert.equal(T10.topUpRuns({ verdict: 'undetermined' }, 20), 10);
  assert.equal(T10.topUpRuns({ verdict: 'undetermined' }, 35), 5);
  assert.equal(T10.topUpRuns({ verdict: 'undetermined' }, 40), 0);
  assert.equal(T10.topUpRuns({ verdict: 'pass' }, 30), 0);
  assert.equal(T10.topUpRuns({ verdict: 'fail' }, 30), 0);
  assert.equal(T10.topUpRuns(null, 30), 0, 'a cell with no speed judge is never topped up');
});

test("the thumb judge: a Chromium thumb run passes at or past the pinned build's mean distance in the same sitting", () => {
  const scroller = (engine, i, after) => ({ engine, i, before: 0, after, ok: true, witness: true });
  // the pinned build's runs as M1a.4 saw them: 119 to 147, mean 133
  const pinned = [119, 147, 133, 125, 141, 133].map((d, i) => scroller('pinned', i, d));
  const cua = [133, 147, 130, 146, 140, 139].map((d, i) => scroller('cua', i, d));
  const judged = judgeRuns('scroller', [...pinned, ...cua]);
  const reach = T10.thumbReach(judged.runs, ['cua']);
  assert.equal(reach.pinned_mean, 133, 'one mean: the scroller drags the same path down every run');
  assert.deepEqual(reach.runs.filter((r) => r.engine === 'cua').map((r) => r.reach), [true, true, false, true, true, true], 'at the mean passes; 130 is short');
  assert.deepEqual(reach.lanes.cua, { reached: 5, n: 6, shortest: 130, mean: (133 + 147 + 130 + 146 + 140 + 139) / 6 });
  // the tolerance judge alone would take the short run: the reach judge is what fails it
  assert.equal(judged.runs.find((r) => r.engine === 'cua' && r.after === 130).took, true);
  // the mean is the sitting's, never a constant: a pinned build that lands further raises it
  const further = judgeRuns('scroller', [...[150, 152, 148, 150, 151, 149].map((d, i) => scroller('pinned', i, d)), ...cua]);
  assert.equal(T10.thumbReach(further.runs, ['cua']).lanes.cua.reached, 0);
  // a pinned run that missed the tolerance judge does not pull the mean down
  const withMiss = judgeRuns('scroller', [...pinned, scroller('pinned', 6, 0), ...cua]);
  assert.equal(T10.thumbReach(withMiss.runs, ['cua']).pinned_mean, 133);
  // no pinned run took: nothing to reach, so no run is judged short
  const unreferenced = T10.thumbReach(judgeRuns('scroller', [scroller('pinned', 0, 0), scroller('cua', 0, 140)]).runs, ['cua']);
  assert.equal(unreferenced.pinned_mean, null);
  assert.equal(unreferenced.runs.find((r) => r.engine === 'cua').reach, null);
  // only Chrome's and Electron's scroller thumbs are held to it
  assert.equal(T10.reachJudged('chrome', 'scroller'), true);
  assert.equal(T10.reachJudged('electron', 'scroller'), true);
  assert.equal(T10.reachJudged('firefox', 'scroller'), false);
  assert.equal(T10.reachJudged('gedit', 'scrollbar'), false);
});

/** A cell as runDrag builds it, for the verdicts: the lanes' effect results, and any reach, speed, load or control. */
const cellOf = (over = {}) => ({
  family: 'chrome',
  drag: 'scroller',
  reference: true,
  pinned_took: 30,
  pinned_witness: true,
  lanes: { cua: { took: 30, n: 30, misses: [], witness: true, pass: true }, 'cua:0ms': { took: 3, n: 30, misses: [1], witness: true, pass: false } },
  ...over,
});

test("a run's drag verdict: the shipped lane's misses, short thumbs and slow long paths fail it; a measurement lane's never do", () => {
  assert.deepEqual(T10.dragVerdict([cellOf()]), { pass: true, failed: [], declared: [] }, 'cua:0ms misses: a measured outcome');
  const short = cellOf({ reach: { pinned_mean: 133.4, lanes: { cua: { reached: 27, n: 30, shortest: 108, mean: 131.2 } } } });
  assert.match(T10.dragVerdict([short]).failed.join(), /chrome scroller: cua short of the pinned build's mean distance \(133\.4 px\) on 3 of 30 runs/);
  const slow = cellOf({ drag: 'canvas', speed: { cua: { verdict: 'fail', reasons: ['cua: 646 ms > bar 517 ms'] } } });
  assert.match(T10.dragVerdict([slow]).failed.join(), /chrome canvas: cua speed: cua: 646 ms > bar 517 ms/);
  const open = cellOf({ drag: 'canvas', speed: { cua: { verdict: 'undetermined', reasons: [] } } });
  assert.match(T10.dragVerdict([open]).failed.join(), /undetermined/, 'still undetermined after the top-ups fails');
  const noBar = cellOf({ drag: 'canvas', speed: { cua: { verdict: 'no bar', reasons: [] } } });
  assert.equal(T10.dragVerdict([noBar]).pass, true, 'no vendor bar: recorded, not a failure');
  const missed = cellOf({ lanes: { cua: { took: 29, n: 30, misses: [4], witness: true, pass: false } } });
  assert.match(T10.dragVerdict([missed]).failed.join(), /chrome scroller: cua missed runs 4/);
  const unjudged = cellOf({ reference: false, pinned_took: 0, lanes: { cua: { took: 0, n: 30, misses: [], witness: true, pass: null } } });
  assert.equal(T10.dragVerdict([unjudged]).pass, true, 'a cell without a usable reference is recorded, not judged');
  assert.equal(T10.dragVerdict([cellOf({ lanes: { 'cua:0ms': { pass: false, misses: [1] } } })]).pass, true, 'no shipped lane: nothing to judge');
});

test("under load cua lands at least the pinned build's count, or fewer by chance (one-sided Fisher, p >= 0.05), 40 a side", () => {
  const runsOf = (engine, took, n = 40) => Array.from({ length: n }, (_, i) => ({ engine, i, took: i < took, ok: true, witness: true, before: 0, after: i < took ? 140 : 90 }));
  const pass = T10.loadCounts([...runsOf('pinned', 38), ...runsOf('cua', 38)], ['cua']);
  assert.equal(pass.lanes.cua.pass, true);
  const fewer = T10.loadCounts([...runsOf('pinned', 40), ...runsOf('cua', 39)], ['cua']);
  assert.equal(fewer.lanes.cua.pass, true, 'one short thumb fewer than the pinned build: within chance (p = 0.5)');
  assert.equal(fewer.lanes.cua.p.toFixed(4), '0.5000');
  const loss = T10.loadCounts([...runsOf('pinned', 40), ...runsOf('cua', 33)], ['cua']);
  assert.equal(loss.lanes.cua.pass, false, 'seven short of 40 is no chance');
  const short = T10.loadCounts([...runsOf('pinned', 20, 20), ...runsOf('cua', 20, 20)], ['cua']);
  assert.equal(short.lanes.cua.pass, false);
  assert.match(short.lanes.cua.reason, /fewer than 40/);
  // the distances are reported beside the counts
  assert.equal(pass.lanes.cua.mean, (38 * 140 + 2 * 90) / 40);
  assert.equal(pass.pinned.mean, (38 * 140 + 2 * 90) / 40);
  // a cell under load is judged by its counts, not by every run taking
  const cell = cellOf({ load: pass, lanes: { cua: { took: 38, n: 40, misses: [38, 39], witness: true, pass: false } } });
  assert.equal(T10.dragVerdict([cell]).pass, true);
  assert.match(T10.dragVerdict([cellOf({ load: loss })]).failed.join(), /landed 33 of 40 against the pinned build's 40 of 40 \(one-sided Fisher p = 0\.0059\)/);
});

test('under load an ok run with no effect, or with its effect on another target, fails the cell whatever the counts (ffdnd-fix)', () => {
  // judgeRuns marks each run: `took` (it landed as the pinned build's do), `no_effect`, `wrong_target`
  const run = (engine, i, over = {}) => ({ engine, i, ok: true, took: true, no_effect: false, wrong_target: false, witness: true, ...over });
  const side = (engine, n, misses = {}) => Array.from({ length: n }, (_, i) => run(engine, i, misses[i]));
  const pinned = side('pinned', 40);
  const judge = (misses) => T10.loadCounts([...pinned, ...side('cua', 40, misses)], ['cua']).lanes.cua;
  const honest = { ok: false, took: false };
  // Firefox's drop at twice the load: 38 of 40, each miss answered not ok, against the pinned 40 of 40
  const thirtyEight = judge({ 3: honest, 9: honest });
  assert.equal(thirtyEight.pass, true, '38 of 40, honest');
  assert.equal(thirtyEight.p.toFixed(4), '0.2468');
  // a clear loss: 30 of 40
  const thirty = judge(Object.fromEntries(Array.from({ length: 10 }, (_, k) => [k, honest])));
  assert.equal(thirty.pass, false);
  assert.match(thirty.reason, /landed 30 of 40 against the pinned build's 40 of 40 \(one-sided Fisher p = 0\.0005\)/);
  // the right target with the wrong magnitude (a thumb that overshoots, a stroke cut short): a landing miss, to the tolerance
  assert.equal(judge({ 24: { took: false } }).pass, true);
  // an ok with no effect: a false success, a hard failure
  const none = judge({ 5: { took: false, no_effect: true } });
  assert.equal(none.pass, false);
  assert.match(none.reason, /1 answered ok with no effect \(run 5\)/);
  // an ok whose effect landed on another target: a false success, a hard failure
  const elsewhere = judge({ 7: { took: false, wrong_target: true } });
  assert.equal(elsewhere.pass, false);
  assert.match(elsewhere.reason, /1 answered ok with the effect on another target \(run 7\)/);
  assert.match(T10.dragVerdict([cellOf({ load: T10.loadCounts([...pinned, ...side('cua', 40, { 5: { took: false, no_effect: true } })], ['cua']) })]).failed.join(), /cua answered ok with no effect under load/);
  assert.equal(judge({}).pass, true, '40 of 40');
  // the pinned build's own false successes are its record, never judged
  assert.equal(T10.loadCounts([...side('pinned', 40, { 1: { took: false, no_effect: true } }), ...side('cua', 40)], ['cua']).lanes.cua.pass, true);
});

test('judgeRuns marks an ok run that changed nothing, or changed another target, per kind', () => {
  const mark = (kind, before, after, i = 0, extra = {}) => {
    const r = T10.judgeRuns(kind, [{ engine: 'cua', i, ok: true, before, after, ...extra }]).runs[0];
    return r.no_effect ? 'none' : r.wrong_target ? 'elsewhere' : 'effect';
  };
  // the drop: no drop; the page has one drop target, so no other target to land on
  assert.equal(mark('dnd', { drops: 3 }, { drops: 3 }), 'none');
  assert.equal(mark('dnd', { drops: 3 }, { drops: 4 }), 'effect');
  assert.equal(mark('handle-dnd', { drops: 3 }, { drops: 3 }), 'none');
  assert.equal(mark('dnd', { drops: 3 }, null), 'none', 'an effect not read shows none');
  // the stroke: no new stroke; a stroke off its corners is the right canvas, the wrong magnitude
  assert.equal(mark('canvas', { strokes: 2, dev: 0 }, { strokes: 2, dev: 0 }), 'none');
  assert.equal(mark('canvas', { strokes: 2 }, { strokes: 3, dev: 40 }), 'effect');
  assert.equal(mark('handle-canvas', { strokes: 2 }, { strokes: 2 }), 'none');
  // the thumbs and the values: no scroll, no change; an overshoot or a short value is the wrong magnitude
  assert.equal(mark('scroller', 0, 0), 'none');
  assert.equal(mark('scroller', 0, 169), 'effect');
  assert.equal(mark('scrollbar', 120, 121), 'none', 'within a pixel is no scroll');
  assert.equal(mark('range', 50, 50), 'none');
  assert.equal(mark('range', 50, 63), 'effect');
  assert.equal(mark('scale4', 25, 75), 'effect');
  // the selection: unchanged is none; one that holds none of the requested stretch is another target
  assert.equal(mark('select', 'none', 'none'), 'none');
  assert.equal(mark('select', 'none', 'pha_bravo_charlie_'), 'effect', 'run 0 asks for characters 2 to 20');
  assert.equal(mark('select', 'none', 'pha_br'), 'effect', 'short of the stretch, inside it: the wrong magnitude');
  assert.equal(mark('select', 'none', 'a_echo_foxtrot_g'), 'elsewhere', "run 1's stretch, for run 0: another target");
  assert.equal(mark('select', 'pha_bravo_charlie_', 'a_echo_foxtrot_g', 1), 'effect');
  assert.equal(mark('select', 'none', 'line 7 of the cua171 drag scene'), 'elsewhere', 'another line');
  assert.equal(mark('select', '', 'charlie delta echo foxtrot golf\nline 2 of the cua171 drag scene'), 'effect', 'over the stretch and on: the wrong magnitude');
  assert.equal(mark('select-short', 'none', 'golf', 0), 'elsewhere', 'select-short asks for characters 2 to 6');
  assert.equal(mark('select-short', 'none', 'pha_', 0), 'effect');
  assert.equal(mark('select-unprimed', '', 'a_echo_foxtrot_g', 1), 'elsewhere', 'the unprimed drag always asks for the even stretch');
  // Writer through gen: its pixels unchanged is none; which text its pixels show is not read
  assert.equal(mark('select', 'x', { capture: 'a' }, 0, { pixels_changed: false }), 'none');
  assert.equal(mark('select', 'x', { capture: 'a' }, 0, { pixels_changed: true }), 'effect');
  // a run that did not answer ok is never a false success, whatever it did
  const notOk = T10.judgeRuns('dnd', [{ engine: 'cua', i: 0, ok: false, before: { drops: 3 }, after: { drops: 3 } }]).runs[0];
  assert.equal(notOk.no_effect || notOk.wrong_target, false);
});

test('an ok run whose effect could not be read, before or after it, shows none: a false success, never a magnitude miss', () => {
  const mark = (kind, before, after) => (T10.judgeRuns(kind, [{ engine: 'cua', i: 0, ok: true, before, after }]).runs[0].no_effect ? 'none' : 'effect');
  // a status line missing parses to null counters, not to a null effect
  const unread = parseDragStatus([]);
  assert.equal(mark('dnd', { drops: 3 }, { ...unread.dnd, log: null }), 'none', 'the drop count not read after it');
  assert.equal(mark('dnd', { ...unread.dnd, log: null }, { drops: 4 }), 'none', 'the drop count not read before it');
  assert.equal(mark('handle-dnd', { drops: 3 }, { ...unread.dnd, log: null }), 'none');
  assert.equal(mark('canvas', { strokes: 2, dev: 0 }, unread.canvas), 'none', 'the stroke count not read after it');
  assert.equal(mark('canvas', unread.canvas, { strokes: 3, dev: 0 }), 'none', 'the stroke count not read before it');
  assert.equal(mark('handle-canvas', { strokes: 2 }, unread.canvas), 'none');
  // the values and the selections: one side not read
  assert.equal(mark('scroller', unread.scroller, 169), 'none');
  assert.equal(mark('range', unread.range, 63), 'none');
  assert.equal(mark('scrollbar', 120, Number.NaN), 'none');
  assert.equal(mark('scale4', null, 75), 'none');
  assert.equal(mark('select', unread.select, 'pha_bravo_charlie_'), 'none');

  // the reviewer's reproduction: 40 pinned drops and strokes, 39 of cua's and one ok with nothing read
  for (const [kind, count, extra] of [['dnd', 'drops', { log: null }], ['canvas', 'strokes', { dev: 0 }]]) {
    const run = (engine, i, after) => ({ engine, i, ok: true, witness: true, before: { [count]: i, ...extra }, after: after ?? { [count]: i + 1, ...extra } });
    const missing = kind === 'dnd' ? { ...unread.dnd, log: null } : unread.canvas;
    const runs = [...Array.from({ length: 40 }, (_, i) => run('pinned', i)), ...Array.from({ length: 39 }, (_, i) => run('cua', i)), run('cua', 39, missing)];
    const lane = T10.loadCounts(T10.judgeRuns(kind, runs).runs, ['cua']).lanes.cua;
    assert.equal(lane.pass, false, kind);
    assert.deepEqual(lane.no_effect_runs, [39], kind);
    assert.match(lane.reason, /1 answered ok with no effect \(run 39\)/, kind);
  }
});

test("Fisher's exact test, one-sided: how likely a side misses at least as often as it did, given both sides' margins", () => {
  // 38 of 40 against 40 of 40: 2 misses of 2, both on cua's side
  assert.equal(Math.round(T10.fisherMissesAtLeast(2, 40, 0, 40) * 1e4) / 1e4, 0.2468);
  assert.equal(T10.fisherMissesAtLeast(0, 40, 0, 40), 1, 'no miss on either side');
  assert.equal(T10.fisherMissesAtLeast(0, 40, 3, 40), 1, 'fewer misses than the other side');
  // 30 of 40 against 40 of 40: a clear loss
  assert.ok(T10.fisherMissesAtLeast(10, 40, 0, 40) < 0.001);
  // ffdnd-fix's first comparison: 4 misses in 80 against none in 40
  assert.equal(Math.round(T10.fisherMissesAtLeast(4, 80, 0, 40) * 1e4) / 1e4, 0.1925);
});

test("the drag page's received line: the motions Chrome dispatched between a press and its release", () => {
  const s = parseDragStatus(['received seq 4 target scroller raw 55 moves 0 raw_events 50 move_events 0']);
  assert.deepEqual(s.received, { seq: 4, target: 'scroller', raw: 55, moves: 0, raw_events: 50, move_events: 0 });
  assert.equal(parseDragStatus([]).received, null);
});

test("the unprimed Writer lane: a fresh window's first drag took when it selected the text its path spans", () => {
  // the even path, characters 2 to 20 of the first line: the ends may round one character either way
  assert.equal(T10.selectionCovers('pha bravo charlie d', 0), true);
  assert.equal(T10.selectionCovers('ha bravo charlie ', 0), true);
  assert.equal(T10.selectionCovers('', 0), false, 'nothing selected: the first drag ignored');
  assert.equal(T10.selectionCovers('pha', 0), false, 'a click-sized selection is not the drag');
  assert.equal(T10.selectionCovers('line 2 of the cua171', 0), false, 'text the path does not span');
  assert.equal(T10.selectionCovers(null, 0), false);
  // the unprimed kind is the run's only when named, and judged absolutely: the pinned build misses it too
  assert.ok(!dragPlan(['writer'], null).some((p) => p.kind === 'select-unprimed'));
  assert.deepEqual(dragPlan(['writer'], ['select-unprimed']), [{ family: 'writer', kind: 'select-unprimed' }]);
  const runs = [{ engine: 'pinned', i: 0, ok: true, witness: true, before: '', after: '', took: false }, { engine: 'cua', i: 0, ok: true, witness: true, before: '', after: '', took: false }];
  const cell = judgeCell(runs, ['cua'], {}, { absolute: true });
  assert.equal(cell.reference, true);
  assert.equal(cell.lanes.cua.pass, false, 'every engine missing it is still a miss');
  assert.deepEqual(judgeRuns('select-unprimed', [{ engine: 'cua', i: 0, ok: true, before: '', after: 'pha bravo charlie d' }]).runs.map((r) => r.took), [true]);
  // its positive reference: the select cell's even runs that took, which the unprimed judge must take too, or it could
  // never see a first drag that selects
  const select = [{ i: 0, took: true, after: 'pha bravo charlie d' }, { i: 1, took: true, after: 'avo charlie delta e' }, { i: 2, took: false, after: '' }, { i: 4, took: true, after: 'pha bravo charlie d' }];
  assert.deepEqual(T10.selectReference(select), { covers: 2, n: 2 });
  const mismatch = T10.selectReference([{ i: 0, took: true, after: 'pha_bravo_charlie_d' }]);
  assert.deepEqual(mismatch, { covers: 0, n: 1 });
  assert.match(T10.dragVerdict([cellOf({ family: 'writer', drag: 'select-unprimed', select_reference: mismatch })]).failed.join(), /REFERENCE MISMATCH/);
  assert.match(T10.dragVerdict([cellOf({ family: 'writer', drag: 'select-unprimed', select_reference: { covers: 0, n: 0 } })]).failed.join(), /REFERENCE MISMATCH/, 'no select run to check the judge against');
  assert.equal(T10.dragVerdict([cellOf({ family: 'writer', drag: 'select-unprimed', select_reference: { covers: 3, n: 3 } })]).pass, true);
});

test("Firefox's held-move cells: drag_handle's start, a held move to each point, its end, in root coordinates, with a no-press control", () => {
  const at = { page: { x: 0, y: 87 } };
  const window = { x: 10, y: 20 };
  const corners = CORNERS.map(([x, y]) => [x + 20 + 10, y + 350 + 87 + 20]);
  assert.deepEqual(T10.handleSteps(at, 'handle-canvas', window), [
    { action: 'start', x: corners[0][0], y: corners[0][1] },
    ...corners.slice(1).map(([x, y]) => ({ action: 'move_to', x, y })),
    { action: 'end' },
  ]);
  // the control moves along the same points with no press and no end: nothing can be drawn or dropped
  assert.deepEqual(T10.handleSteps(at, 'handle-canvas', window, { control: true }), corners.map(([x, y]) => ({ action: 'move_to', x, y })));
  assert.equal(T10.handleSteps(at, 'handle-dnd', window)[0].action, 'start');
  assert.ok(!dragPlan(['firefox'], null).some((p) => p.kind.startsWith('handle')), 'named only: not in the default cells');
  assert.deepEqual(dragPlan(['firefox'], ['handle-canvas', 'handle-dnd']).map((p) => p.kind), ['handle-canvas', 'handle-dnd']);
  // T11: Chromium's held moves are rerun as controls of Gecko's, in the same cells, named only too
  for (const family of ['chrome', 'electron']) {
    assert.ok(!dragPlan([family], null).some((p) => p.kind.startsWith('handle')), `${family}: named only`);
    assert.deepEqual(dragPlan([family], ['handle-canvas', 'handle-dnd']).map((p) => p.kind), ['handle-canvas', 'handle-dnd']);
  }
  // each is judged as the effect it draws: a stroke near every corner, one more drop
  const stroke = (strokes, dev) => ({ strokes, moves: 9, dev });
  assert.deepEqual(judgeRuns('handle-canvas', [run('pinned', 0, stroke(0, -1), stroke(1, 6)), run('cua', 0, stroke(1, 6), stroke(1, 6))]).runs.map((r) => r.took), [true, false]);
  assert.deepEqual(judgeRuns('handle-dnd', [run('pinned', 0, { drops: 0 }, { drops: 1 })]).runs.map((r) => r.took), [true]);
  // the control must miss every run, or the effect check cannot tell a held move from none
  assert.deepEqual(T10.controlVerdict([{ took: false }, { took: false }]), { pass: true, took: 0, n: 2 });
  assert.equal(T10.controlVerdict([{ took: false }, { took: true }]).pass, false);
  const blind = cellOf({ family: 'firefox', drag: 'handle-canvas', control: { pass: false, took: 1, n: 30 } });
  assert.match(T10.dragVerdict([blind]).failed.join(), /CONTROL NON-DISCRIMINATING/);
});

test("a held-move drag: its requests spaced as cua's service spaces drag_handle's, timed as their sum, and a pressed handle that fails is ended", async () => {
  const { SETTLE_MS } = await import('../../src/services/engine/linux/settle.mjs');
  assert.equal(T10.HANDLE_GAP_MS, SETTLE_MS.drag_handle, "the service's own settle, never a copy of it");
  const fake = (fail = null) => {
    const sent = [];
    return {
      sent,
      async request(command, input) {
        sent.push({ command, input, at: performance.now() });
        return { response: fail === input.action ? { ok: false, error: 'no' } : { ok: true }, ms: 2 };
      },
    };
  };
  const at = { page: { x: 0, y: 87 } };
  const steps = T10.handleSteps(at, 'handle-dnd', { x: 0, y: 0 });
  const e = fake();
  const done = await T10.handleDrag(e, steps, { gapMs: 15 });
  assert.deepEqual(done, { response: { ok: true }, ms: 2 * steps.length }, 'the requests timed, not the spacing');
  assert.deepEqual(e.sent.map((s) => s.input.action), ['start', 'move_to', 'move_to', 'end']);
  for (let k = 1; k < e.sent.length; k++) assert.ok(e.sent[k].at - e.sent[k - 1].at >= 14, `request ${k} spaced`);
  // a move that fails after the press: the handle is ended, so no button stays down
  const failing = fake('move_to');
  const answer = await T10.handleDrag(failing, steps, { gapMs: 0 });
  assert.equal(answer.response.ok, false);
  assert.deepEqual(failing.sent.map((s) => s.input.action), ['start', 'move_to', 'end']);
  // the control never pressed: nothing to end
  const control = fake('move_to');
  await T10.handleDrag(control, T10.handleSteps(at, 'handle-dnd', { x: 0, y: 0 }, { control: true }), { gapMs: 0 });
  assert.deepEqual(control.sent.map((s) => s.input.action), ['move_to']);
});

test("the long paths, and the cells every lane runs in front: Chrome's and Firefox's canvas and Chrome's drag and drop", () => {
  assert.equal(T10.isLongPath('chrome', 'canvas'), true);
  assert.equal(T10.isLongPath('chrome', 'dnd'), true);
  assert.equal(T10.isLongPath('firefox', 'canvas'), true);
  assert.equal(T10.isLongPath('electron', 'canvas'), false);
  assert.equal(T10.isLongPath('firefox', 'dnd'), false);
  assert.equal(T10.inFront('chrome', 'dnd'), true);
  assert.equal(T10.inFront('electron', 'dnd'), false);
});

test('under load the drag experiment runs 40 a side unless told otherwise, and refuses fewer', async () => {
  assert.equal(T10.dragTrials({}), 30);
  assert.equal(T10.dragTrials({ load: true }), 40);
  assert.equal(T10.dragTrials({ load: true, samplesTrials: 50 }), 50);
  assert.throws(() => T10.dragTrials({ load: true, samplesTrials: 20 }), /40 drags a side/);
  // and the command line refuses it before anything starts
  const { parseArgs } = await import('../../scripts/linux-engine-diff/cli.mjs');
  const base = ['--experiment', 'drag', '--cua', 'c', '--vendor', 'v', '--out', 'o'];
  assert.throws(() => parseArgs([...base, '--load-factor', '2', '--trials', '30']), /40 drags a side/);
  assert.equal(parseArgs([...base, '--load-factor', '2']).samplesTrials, undefined, 'the default under load is 40 (dragTrials)');
  assert.equal(parseArgs([...base, '--trials', '20']).samplesTrials, 20, 'idle, any number');
});

// ---------------------------------------------------------------------------------------------------------------
// T10's fix wave (the task review of 843d3179..f27b9b5b)

const cellRuns = (engine, n, { took, ms, after = (k) => ({ strokes: k + 1, moves: 9, dev: took(k) ? 4 : 140 }) }) =>
  Array.from({ length: n }, (_, i) => ({ engine, i, ok: true, witness: true, ms: ms + (i % 5), first_request: i % 10 === 0, before: { strokes: i, moves: 9, dev: 4 }, after: after(i) }));

test("a long path's effect is judged on every candidate run, whatever the pinned build took (the review's probe)", () => {
  // 40 pinned misses, 40 newest successes, the candidate faster but missing one stroke of 40
  const runs = [
    ...cellRuns('pinned', 40, { took: () => false, ms: 1100 }),
    ...cellRuns('newest', 40, { took: () => true, ms: 517 }),
    ...cellRuns('cua', 40, { took: (i) => i !== 17, ms: 400 }),
  ];
  const { row } = T10.judgeDragCell('chrome', 'canvas', runs, { cuaLanes: ['cua'], vendors: ['pinned', 'newest'] });
  assert.equal(row.reference, true);
  assert.equal(row.lanes.cua.pass, false);
  assert.equal(row.speed.cua.verdict, 'pass', 'the newest build sets a valid bar');
  const verdict = T10.dragVerdict([row]);
  assert.equal(verdict.pass, false);
  assert.match(verdict.failed.join(), /chrome canvas: cua missed runs 17/);
  // nor does a missing bar waive it: no vendor build took anything
  const none = [...cellRuns('pinned', 40, { took: () => false, ms: 1100 }), ...cellRuns('newest', 40, { took: () => false, ms: 517 }), ...cellRuns('cua', 40, { took: (i) => i !== 3, ms: 400 })];
  assert.match(T10.dragVerdict([T10.judgeDragCell('chrome', 'canvas', none, { cuaLanes: ['cua'], vendors: ['pinned', 'newest'] }).row]).failed.join(), /missed runs 3/);
  // a drop or a stroke elsewhere has its reader proven by either vendor build's take
  const dnd = (engine, n, took) => Array.from({ length: n }, (_, i) => ({ engine, i, ok: true, witness: true, ms: 300, before: { drops: i }, after: { drops: i + (took(i) ? 1 : 0) } }));
  const { row: electron } = T10.judgeDragCell('electron', 'dnd', [...dnd('pinned', 30, () => false), ...dnd('newest', 30, () => true), ...dnd('cua', 30, (i) => i !== 5)], { cuaLanes: ['cua'], vendors: ['pinned', 'newest'] });
  assert.equal(electron.reference, true);
  assert.match(T10.dragVerdict([electron]).failed.join(), /electron dnd: cua missed runs 5/);
  // a value kind still needs the pinned build's values: nothing to compare against, recorded, not judged
  const sel = (engine) => Array.from({ length: 4 }, (_, i) => ({ engine, i, ok: true, witness: true, ms: 100, before: '', after: '' }));
  assert.equal(T10.judgeDragCell('gnome-text-editor', 'select', [...sel('pinned'), ...sel('newest'), ...sel('cua')], { cuaLanes: ['cua'], vendors: ['pinned', 'newest'] }).row.lanes.cua.pass, null);
});

/** drag.html's own script, run on a stand-in for the document: its listeners, and the elements' text. */
async function dragPage() {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const html = readFileSync(new URL('../../scripts/linux-engine-diff/pages/drag.html', import.meta.url), 'utf8');
  const script = html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
  const listeners = [];
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        localName: 'div',
        textContent: '',
        value: '0',
        scrollTop: 0,
        setAttribute() {},
        addEventListener: (type, fn) => listeners.push({ type, fn, on: id }),
        getContext: () => new Proxy({}, { get: () => () => {} }),
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
      });
    }
    return elements.get(id);
  };
  const document = {
    title: '',
    getElementById: element,
    querySelectorAll: () => [],
    addEventListener: (type, fn) => listeners.push({ type, fn, on: 'document' }),
  };
  vm.runInNewContext(script, { document, location: { hash: '' }, window: { getSelection: () => '' }, performance: { now: () => 0, timeOrigin: 0 }, setTimeout, clearTimeout, decodeURIComponent, Math, String });
  const fire = (type, event) => {
    for (const l of listeners.filter((x) => x.type === type)) l.fn({ button: 0, buttons: 1, timeStamp: 0, clientX: 0, clientY: 0, ...event, target: element(event.target ?? 'scroller') });
  };
  return { fire, text: (id) => element(id).textContent };
}

test("the page's motion count counts the coalesced samples each event carries, not the events", async () => {
  const page = await dragPage();
  page.fire('pointerdown', { target: 'scroller' });
  // one dispatched pointerrawupdate carrying three coalesced samples, then one with a single sample
  page.fire('pointerrawupdate', { getCoalescedEvents: () => [{}, {}, {}] });
  page.fire('pointerrawupdate', { getCoalescedEvents: () => [{}] });
  // a pointermove of two, and one whose list is empty (the event itself is its one sample)
  page.fire('pointermove', { getCoalescedEvents: () => [{}, {}] });
  page.fire('pointermove', { getCoalescedEvents: () => [] });
  page.fire('pointerup', {});
  const received = parseDragStatus([page.text('s-received')]).received;
  assert.equal(received.target, 'scroller');
  assert.equal(received.raw, 4, 'samples, not the 2 events');
  assert.equal(received.moves, 3);
  assert.equal(received.raw_events, 2, 'the dispatched events kept beside them');
  assert.equal(received.move_events, 2);
  // a browser without coalesced events: each event is one sample
  const plain = await dragPage();
  plain.fire('pointerdown', { target: 'canvas' });
  plain.fire('pointermove', {});
  plain.fire('pointerup', {});
  assert.deepEqual(parseDragStatus([plain.text('s-received')]).received, { seq: 1, target: 'canvas', raw: 0, moves: 1, raw_events: 0, move_events: 1 });
});

test("a motion record is the drag's only when its press is new: the previous drag's is never taken for it", () => {
  const prev = { seq: 30, target: 'canvas', raw: 700, moves: 33, raw_events: 600, move_events: 30 };
  const next = { ...prev, seq: 31 };
  assert.deepEqual(T10.freshReceived(prev, next), next);
  assert.equal(T10.freshReceived(prev, prev), null, 'the no-press control publishes nothing new: no record, not the last one');
  assert.equal(T10.freshReceived(prev, null), null);
  assert.deepEqual(T10.freshReceived(null, next), next, 'a page with no record before');
  assert.equal(T10.freshReceived(next, prev), null);
});

test("a cell's drags run in rotating blocks of fresh engines, the top-ups continuing the rotation", () => {
  const lanes = [{ label: 'pinned' }, { label: 'newest' }, { label: 'cua' }];
  const plan = T10.blockPlan(lanes, 30, 0);
  assert.equal(plan.length, 9, 'three blocks of 10 per lane');
  assert.deepEqual(plan.slice(0, 3).map((b) => [b.spec.label, b.start, b.count]), [['pinned', 0, 10], ['newest', 0, 10], ['cua', 0, 10]]);
  assert.deepEqual(plan.slice(3, 6).map((b) => b.spec.label), ['newest', 'cua', 'pinned'], 'the order rotates block by block');
  assert.deepEqual(plan.slice(6, 9).map((b) => [b.spec.label, b.start]), [['cua', 20], ['pinned', 20], ['newest', 20]]);
  // a top-up of 10 from 30 is the fourth block, rotated on from the third
  assert.deepEqual(T10.blockPlan(lanes, 10, 30).map((b) => [b.spec.label, b.start, b.count]), [['pinned', 30, 10], ['newest', 30, 10], ['cua', 30, 10]]);
  // a cell's offset (its kind's index) shifts the first block, and a short tail is its own block
  assert.deepEqual(T10.blockPlan(lanes, 5, 0, { offset: 1 }).map((b) => [b.spec.label, b.count]), [['newest', 5], ['cua', 5], ['pinned', 5]]);
  assert.deepEqual(T10.blockPlan(lanes, 15, 0).map((b) => b.count), [10, 10, 10, 5, 5, 5]);
});

test("a Gecko drag cell parks the real pointer in its window, away from every path, only onto the run's own windows, and verified where it landed", () => {
  const moves = [];
  // the display's pointer after the move, over the frame then the scene's client (park.mjs `parkPointer`)
  let chain = [0x100, 0x2a00007];
  const read = () => {
    const [, x, y] = moves.at(-1);
    return { x, y, same_screen: true, chain };
  };
  const options = { move: (p) => moves.push(['mousemove', p.x, p.y]), read, pause: () => {} };
  const scene = { id: 0x2a00007, window: { x: 2, y: 30, width: 1050, height: 760 } };
  const front = { id: 0x3000001 };
  const safe = { pointerSafeAt: () => true, front };
  parkInside(safe, scene, 'firefox', options);
  assert.deepEqual(moves, [['mousemove', 972, 140]]);
  // the page sits about 85 px below the window's top (drag.mjs `locate`)
  const at = { x: POINTER_INSIDE.firefox.x, y: POINTER_INSIDE.firefox.y - 85 };
  for (const kind of ['select', 'range', 'scroller', 'dnd', 'canvas']) {
    for (const i of [0, 1]) for (const [x, y] of pagePath(kind, i)) assert.ok(Math.hypot(x - at.x, y - at.y) > 200, `${kind} ${i}: far from the park point`);
  }
  parkInside(safe, scene, 'chrome', options);
  assert.equal(moves.length, 1, 'Chromium parks nothing here');
  assert.throws(() => parkInside({ pointerSafeAt: () => false, front }, scene, 'firefox', options), /under a window the run did not open/);
  assert.equal(moves.length, 1, 'a refused park moves nothing');
  // a pointer that landed over another window than the scene's is refused, so its run never counts
  chain = [0x3000001];
  assert.throws(() => parkInside(safe, scene, 'firefox', options), (e) => e instanceof ParkRefused && /not over window 0x02a00007/.test(e.message));
  // where the cell's cover lies over the point, the pointer is meant to be over the run's front window (outside, to Gecko)
  for (const occlusion of ['covered', 'partial-top']) parkInside(safe, scene, 'firefox', { ...options, occlusion });
  assert.throws(() => parkInside(safe, scene, 'firefox', { ...options, occlusion: 'partial' }), ParkRefused, "the bottom half's cover leaves the point in the window");
});

test("the pointer log covers every drag-and-drop source, the in-zone source's press included (V5's in-zone sample read a stale log)", async () => {
  for (const source of ['source', 'near', 'inzone']) {
    const page = await dragPage();
    page.fire('pointerdown', { target: source });
    page.fire('pointermove', { clientX: 6 });
    page.fire('pointerup', { target: source });
    const log = parseDragStatus([page.text('s-moves')]).moves;
    assert.equal(log?.n, 1, `${source}: its press logged`);
    assert.equal(log.moves[0].dx, 6);
  }
  const words = await dragPage();
  words.fire('pointerdown', { target: 'words' });
  words.fire('pointerup', { target: 'words' });
  assert.equal(parseDragStatus([words.text('s-moves')]).moves, null, 'a press off every source writes no log');
});

test("a drag and drop's read keeps the page's count of the motions the browser received beside its counts and pointer log", async () => {
  const { readEffect } = await import('../../scripts/linux-engine-diff/drag.mjs');
  const lines = [
    'dnd starts 48 drops 32 downs 52 detail 1 gap 6453 selects 3 ends 48 effect 1 lat 0 dur 374 ups 16 at 607147489',
    'moves seq 52 n 1 start -1 up 250.0/234.1 cancel -1 end -1 m 0.0/86.9/0/0/1/1',
    'received seq 60 target near raw 1 moves 1 raw_events 1 move_events 1',
  ];
  const desktop = { state: async () => ({ ax_tree: { name: 'page', children: lines.map((name) => ({ name })) } }) };
  const read = await readEffect({ desktop, oracle: null }, { id: 1 }, { page: true }, 'dnd');
  assert.equal(read.downs, 52);
  assert.equal(read.log.seq, 52);
  assert.deepEqual(read.received, { seq: 60, target: 'near', raw: 1, moves: 1, raw_events: 1, move_events: 1 });
});
