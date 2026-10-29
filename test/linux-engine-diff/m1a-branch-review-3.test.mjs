// Regression tests for the M1a branch re-review's three false passes in the desktop speed gate (7f1dc04d..38e3c130),
// built like the reviewer's reproductions: cua's timed responses replaced by failures, a run of one round, and a later
// group whose interval spans 0.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MANDATORY_SPEED_GROUPS, blockAnswerMismatches, eventSpeeds, eventsPass, missingSpeedGroups } from '../../scripts/linux-engine-diff/events.mjs';

const ok = { ok: true };
/** One block record: a sequence's step in a round, its answer and its time. */
const rec = (round, scenario, step, command, ms, answer = ok) => ({ round, scenario, step, command, ms, first: step === 0, answer });

test("a timed response that does not answer as the pinned build's fails the run, and its time does not count", () => {
  const pinned = [rec(0, 'desktop move', 0, 'move', 80), rec(0, 'desktop drag short path', 0, 'drag', 1, { ok: false, error: 'drag path must contain at least two points' })];
  // the reviewer's reproduction: cua's timed responses replaced with failures answered in 0.01 ms
  const broken = pinned.map((r) => ({ ...r, ms: 0.01, answer: { ok: false, error: 'boom' } }));
  const mismatches = blockAnswerMismatches({ pinned, newest: pinned, cua: broken }, ['cua']);
  assert.deepEqual(mismatches.map((m) => `${m.engine} ${m.scenario} ${m.step}`), ['cua desktop move 0', 'cua desktop drag short path 0']);
  // the deliberately invalid request keeps its expected refusal: cua refusing as the pinned build does is no mismatch
  const right = [rec(0, 'desktop move', 0, 'move', 79), rec(0, 'desktop drag short path', 0, 'drag', 1, { ok: false, error: 'drag path must contain at least two points' })];
  assert.deepEqual(blockAnswerMismatches({ pinned, newest: pinned, cua: right }, ['cua']), []);
  // a step cua never answered is a mismatch too
  assert.equal(blockAnswerMismatches({ pinned, newest: pinned, cua: right.slice(0, 1) }, ['cua']).length, 1);
  // the mismatched samples' times are left out of the speed groups
  const many = (records) => ({ route: 'desktop', records });
  const n = 25;
  const rows = (ms, answer) => Array.from({ length: n }, (_, round) => rec(round, 'desktop move', 0, 'move', ms + round * 0.001, answer));
  const blocks = [many({ pinned: rows(80, ok), newest: rows(80, ok), cua: rows(0.01, { ok: false, error: 'boom' }) })];
  const speeds = eventSpeeds([], { blocks, mismatches: blockAnswerMismatches(blocks[0].records, ['cua']) });
  assert.notEqual(speeds.find((s) => s.command === 'move' && s.series === 'first').verdict, 'pass', 'failed answers prove no speed');
  assert.equal(eventsPass({ answers: false, speeds, via: 'wire' }), false);
});

test('a run whose mandatory desktop groups are undersampled is incomplete: one round fails', () => {
  assert.ok(!MANDATORY_SPEED_GROUPS.some((g) => g.command === 'key_up' && g.series === 'first'), 'key_up first is excepted: a fresh engine holds nothing');
  assert.equal(MANDATORY_SPEED_GROUPS.length, 17);
  // the reviewer's reproduction: --first-rounds 1
  const one = MANDATORY_SPEED_GROUPS.map((g) => ({ route: 'desktop', command: g.command, series: g.series, verdict: 'too few samples, not judged' }));
  assert.equal(missingSpeedGroups(one).length, 17);
  assert.equal(eventsPass({ answers: true, speeds: one, via: 'wire', required: MANDATORY_SPEED_GROUPS }), false);
  // every mandatory group judged: complete; recorded-only groups (the scenarios' own) may stay unjudged
  const judged = [...MANDATORY_SPEED_GROUPS.map((g) => ({ route: 'desktop', command: g.command, series: g.series, verdict: 'pass' })), { route: 'desktop', command: 'move', series: 'first in a scenario', verdict: 'too few samples, not judged' }];
  assert.deepEqual(missingSpeedGroups(judged), []);
  assert.equal(eventsPass({ answers: true, speeds: judged, via: 'wire', required: MANDATORY_SPEED_GROUPS }), true);
  // a group missing altogether is as incomplete as an undersampled one
  assert.deepEqual(missingSpeedGroups(judged.slice(1)).map((g) => `${g.command} ${g.series}`), [`${MANDATORY_SPEED_GROUPS[0].command} ${MANDATORY_SPEED_GROUPS[0].series}`]);
});

test("a later group above the bar whose interval spans 0 is 'same (within noise)', before a gap or a failure", () => {
  const records = Object.fromEntries(
    Object.entries({ pinned: 8.6, newest: 8.5, cua: 8.55 }).map(([label, centre]) => [label, Array.from({ length: 30 }, (_, i) => rec(i, 'desktop click', 1, 'click', centre + Math.sin(i * 1.7 + centre)))]),
  );
  const speeds = eventSpeeds([], { blocks: [{ route: 'desktop', records }], gaps: [] });
  const later = speeds.find((s) => s.series === 'later');
  assert.ok(later.medians.cua > later.bar, 'cua is above the bar');
  assert.ok(later.interval[0] <= 0 && later.interval[1] >= 0, `the interval ${later.interval} spans 0`);
  assert.equal(later.verdict, 'same (within noise)');
});
