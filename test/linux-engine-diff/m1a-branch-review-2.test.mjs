// Regression tests for the M1a branch review's second round: the events experiment's speed gate (judged only on
// enough samples, desktop first requests from interleaved fresh-engine blocks, a bootstrap interval for the first
// series, declared speed gaps), and the Writer drag cell's priming drag.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { declaredSpeedGap } from '../../scripts/linux-engine-diff/deviations.mjs';
import { DRAG_FAMILIES, DRAG_PRIMING, primingPath, runPath } from '../../scripts/linux-engine-diff/drag.mjs';
import { MIN_JUDGED, blockSequences, eventSpeeds, eventsPass, medianDifferenceInterval, scenarios } from '../../scripts/linux-engine-diff/events.mjs';

/** Steps of one command, `n` per engine, each engine's times drawn around its own centre. */
function group({ route = 'desktop', command = 'click', series = 'first', n = 25, centres, jitter = 0.2 }) {
  const records = {};
  for (const [label, centre] of Object.entries(centres)) {
    records[label] = Array.from({ length: n }, (_, i) => ({ command, ms: centre + jitter * Math.sin(i * 1.7 + centre), first: series === 'first', block: route === 'desktop' }));
  }
  return { route, records };
}

test('a speed group with fewer than 20 samples an engine is recorded, never judged, and never fails the run', () => {
  assert.equal(MIN_JUDGED, 20);
  const speeds = eventSpeeds([group({ n: 19, centres: { pinned: 33, newest: 1, cua: 5 } })]);
  assert.equal(speeds[0].verdict, 'too few samples, not judged');
  assert.equal(eventsPass({ answers: true, speeds, via: 'wire' }), true);
});

test('a judged group with a real loss fails the run; its interval excludes 0', () => {
  const speeds = eventSpeeds([group({ centres: { pinned: 6, newest: 5, cua: 9 } })]);
  assert.equal(speeds[0].verdict, 'fail');
  assert.ok(speeds[0].interval[0] > 0, `the interval ${speeds[0].interval} excludes 0`);
  assert.equal(eventsPass({ answers: true, speeds, via: 'wire' }), false);
  // a later group is judged the same way on enough samples
  const later = eventSpeeds([group({ series: 'later', centres: { pinned: 6, newest: 5, cua: 9 } })]);
  assert.equal(later[0].verdict, 'fail');
});

test("a first request above the bar whose interval includes 0 is 'same (within noise)': listed, not a pass, not a failure", () => {
  const speeds = eventSpeeds([group({ centres: { pinned: 74.6, newest: 74.5, cua: 74.55 }, jitter: 1 })]);
  assert.ok(speeds[0].medians.cua > speeds[0].bar, 'cua is above the bar');
  assert.equal(speeds[0].verdict, 'same (within noise)');
  assert.ok(speeds[0].interval[0] <= 0 && speeds[0].interval[1] >= 0);
  assert.equal(eventsPass({ answers: true, speeds, via: 'wire' }), true);
});

test('the bootstrap interval of the median difference is deterministic and brackets the difference', () => {
  const a = Array.from({ length: 31 }, (_, i) => 10 + (i % 5) * 0.1);
  const b = Array.from({ length: 31 }, (_, i) => 9 + (i % 5) * 0.1);
  const [lo, hi] = medianDifferenceInterval(a, b);
  assert.deepEqual(medianDifferenceInterval(a, b), [lo, hi]);
  assert.ok(lo <= 1 && hi >= 1 && lo > 0.5 && hi < 1.5, `[${lo}, ${hi}]`);
});

test('a declared speed gap turns its own failing verdict into a declared gap, never a pass; an undeclared loss still fails', () => {
  const gaps = [{ op: 'move', route: 'desktop', series: 'first', reason: 'r', section: 'M4' }];
  assert.equal(declaredSpeedGap({ op: 'move', route: 'desktop', series: 'first' }, gaps)?.section, 'M4');
  assert.equal(declaredSpeedGap({ op: 'move', route: 'desktop', series: 'later' }, gaps), null);
  const speeds = eventSpeeds([group({ command: 'move', centres: { pinned: 6, newest: 5, cua: 9 } }), group({ command: 'click', centres: { pinned: 6, newest: 5, cua: 9 } })], { gaps });
  const move = speeds.find((s) => s.command === 'move');
  assert.equal(move.verdict, 'declared gap');
  assert.equal(move.gap.section, 'M4');
  assert.equal(speeds.find((s) => s.command === 'click').verdict, 'fail', 'an undeclared loss beside it still fails');
  assert.equal(eventsPass({ answers: true, speeds, via: 'wire' }), false);
  assert.equal(eventsPass({ answers: true, speeds: speeds.filter((s) => s.command === 'move'), via: 'wire' }), true);
});

test("desktop request times are judged from the fresh-engine blocks only; the scenarios' own are recorded beside them", () => {
  const scenarioRow = { route: 'desktop', records: Object.fromEntries(['pinned', 'newest', 'cua'].map((l) => [l, [{ command: 'move', ms: l === 'cua' ? 99 : 1, first: true }]])) };
  const blocks = group({ command: 'move', centres: { pinned: 5, newest: 5, cua: 5 } });
  const speeds = eventSpeeds([scenarioRow], { blocks: [blocks] });
  assert.equal(speeds.find((s) => s.series === 'first').verdict, 'pass');
  assert.equal(speeds.find((s) => s.series === 'first in a scenario').verdict, 'too few samples, not judged');
});

test('the blocks run every desktop scenario without its window-bound steps, each closed by its first request again', () => {
  const sequences = blockSequences(scenarios());
  const names = sequences.map((s) => s.scenario);
  assert.ok(names.includes('desktop move') && names.includes('drag_handle') && names.includes('desktop drag'));
  for (const s of sequences) {
    assert.ok(s.steps.every((st) => !st.input?.window && !st.interrupted), s.scenario);
    assert.deepEqual(s.steps.at(-1), s.steps[0], `${s.scenario}: a later sample of its first command`);
  }
  const hold = sequences.find((s) => s.scenario === 'desktop hold and a window hold are apart');
  assert.deepEqual(hold.steps.map((st) => st.command), ['key_down', 'key_up', 'key_down']);
  // every desktop input command of Acceptance 3 gets first and later samples
  for (const command of ['press_key', 'key_down', 'key_up', 'click', 'move', 'move_relative', 'scroll', 'drag', 'drag_handle']) {
    assert.ok(sequences.some((s) => s.steps.slice(1).some((st) => st.command === command)), `${command} later`);
  }
});

test("Writer's drag cell primes each fresh window with one drag the runs never start inside", () => {
  assert.ok(DRAG_FAMILIES.writer.includes('select'));
  assert.match(DRAG_PRIMING.writer.reason, /first drag/);
  assert.match(DRAG_PRIMING.writer.hides, /M4/);
  const at = { text: { cell: (offset) => [10 * offset, 20] } };
  assert.notDeepEqual(primingPath(at, 'select'), runPath(at, 'select', 0), 'the priming drag selects other text than the first run');
});
