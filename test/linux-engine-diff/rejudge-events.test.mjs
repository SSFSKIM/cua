// #171 M5, T4's arm64 round, item (f): the re-judge of the events experiment's stored rows (rejudge-events.mjs), the
// pre-flight's §8.1 point 4 for a fix to a judge alone. It re-judges each stored scenario through events.mjs's
// `judgeScenario`, says which verdicts moved, and with a former judge (`old`) whether that judge reproduces every stored
// verdict.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { firstDifference, interruptedStep, normalizeAnswer, scenarios } from '../../scripts/linux-engine-diff/events.mjs';
import { rejudgeEvents } from '../../scripts/linux-engine-diff/rejudge-events.mjs';

const DRAG = 'an interrupted drag under a held key, then a move';
const ev = (type, window, root_x, root_y, extra = {}) => ({ type, send: true, detail: 0, state: 4, window, x: root_x - 500, y: root_y - 400, root_x, root_y, ...extra });
const PRESSED = [ev('EnterNotify', 'child', 550, 450, { detail: 3, mode: 0 }), ev('MotionNotify', 'child', 550, 450), ev('ButtonPress', 'child', 550, 450, { detail: 1 })];
const motion = (x) => ev('MotionNotify', 'child', x, x - 100, { state: 260 });
const WHOLE = [motion(550), motion(555), motion(560), ev('ButtonRelease', 'child', 560, 460, { detail: 1, state: 260 })];
const ok = { ok: true, output: null };
const bad = { ok: false, error: 'X11 error X11Error { error_kind: Window, error_code: 3, sequence: 9, bad_value: 25165924, request_name: Some("SendEvent") }' };
const step = (answer) => ({ command: 'key_down', answer, events: [] });
const lane = (response, events) => [step(ok), { command: 'drag', interrupted: true, ...interruptedStep(response, events), raw: normalizeAnswer(response) }, step(ok), step(ok), { command: 'exit', answer: { ok: true }, events: [] }];

/** One stored `events` row of the drag scenario, its differences as the run's judge (`first`) recorded them. */
function row(cua, first) {
  const records = { pinned: lane(bad, [...PRESSED, motion(550)]), newest: lane(bad, [...PRESSED, motion(550)]), cua };
  const steps = scenarios().find((s) => s.name === DRAG).steps;
  const differences = Object.fromEntries(['newest', 'cua'].map((l) => [l, first(records.pinned, records[l], steps)]));
  return { run: 'r', kind: 'events', scenario: DRAG, route: 'window', via: 'wire', records, differences, declared: {} };
}
// the judge before ruling 818: the drag's ok is an answer unlike the reference's
const before = (a, b) => firstDifference(a.map((s) => ({ ...s, command: undefined })), b.map((s) => ({ ...s, command: undefined })));

test("an ok whole drag stored as a failure moves to a pass; the former judge reproduces the stored verdict", () => {
  const [run] = rejudgeEvents([row(lane(ok, [...PRESSED, ...WHOLE]), before)], { old: before });
  assert.deepEqual(run.moved, [`${DRAG}: cua fail -> pass`]);
  assert.deepEqual(run.failing, []);
  assert.deepEqual(run.unreproduced, []);
});

test('an interruption stored as a pass stays one; a partial ok drag stays a failure', () => {
  const [kept] = rejudgeEvents([row(lane(bad, [...PRESSED, motion(550)]), firstDifference)]);
  assert.deepEqual([kept.moved, kept.failing], [[], []]);
  const [partial] = rejudgeEvents([row(lane(ok, [...PRESSED, ...WHOLE.slice(0, 2)]), before)]);
  assert.deepEqual([partial.moved, partial.failing], [[], [DRAG]]);
});

test('a former judge that does not reproduce the stored verdict is reported', () => {
  const [run] = rejudgeEvents([row(lane(ok, [...PRESSED, ...WHOLE]), before)], { old: firstDifference });
  assert.deepEqual(run.unreproduced, [DRAG]);
});

test('a stored scenario this checkout does not know is refused, not skipped', () => {
  assert.throws(() => rejudgeEvents([{ ...row(lane(bad, PRESSED), firstDifference), scenario: 'gone' }]), /no scenario named "gone"/);
});
