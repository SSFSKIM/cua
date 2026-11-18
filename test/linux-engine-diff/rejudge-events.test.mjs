// #171 M5, T4's arm64 round, item (f): the re-judge of the events experiment's stored rows (rejudge-events.mjs), the
// pre-flight's §8.1 point 4 for a fix to a judge alone. It re-judges each stored scenario through events.mjs's
// `judgeScenario`, says which verdicts moved, and with a former judge (`old`) whether that judge reproduces every stored
// verdict. Fix wave 1: an interruption stored before the child's XID and the error's window were recorded cannot show
// that its error names the destroyed child, so it moves to a failure (unproved), never stands.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseXtrace } from '../../scripts/linux-engine-diff/audit.mjs';
import { firstDifference, interruptedStep, normalizeAnswer, scenarios, sentDrag } from '../../scripts/linux-engine-diff/events.mjs';
import { rejudgeEvents } from '../../scripts/linux-engine-diff/rejudge-events.mjs';

const DRAG = 'an interrupted drag under a held key, then a move';
const CHILD = 0x01800064;
const ev = (type, window, root_x, root_y, extra = {}) => ({ type, send: true, detail: 0, state: 4, window, x: root_x - 500, y: root_y - 400, root_x, root_y, ...extra });
const PRESSED = [ev('EnterNotify', 'child', 550, 450, { detail: 3, mode: 0 }), ev('MotionNotify', 'child', 550, 450), ev('ButtonPress', 'child', 550, 450, { detail: 1 })];
const POINTS = [550, 555, 560];
const motion = (x) => ev('MotionNotify', 'child', x, x - 100, { state: 260 });
const WHOLE = [...POINTS.map(motion), ev('ButtonRelease', 'child', 560, 460, { detail: 1, state: 260 })];
let seq = 0x10;
const sendTo = (event, x, y) => `001:<:${(seq++).toString(16).padStart(4, '0')}: 44: Request(25): SendEvent propagate=false(0x00) destination=0x01800064 event-mask=0 ${event} time=0x00000000 root=0x000003c5 event=0x01800064 child=None(0x00000000) root-x=${x} root-y=${y} event-x=0 event-y=0 state=Button1 same-screen=true(0x01)`;
const SENT = sentDrag(parseXtrace([sendTo('ButtonPress(4) button=left button(0x01)', 550, 450), ...POINTS.map((x) => sendTo('MotionNotify(6) detail=Normal(0x00)', x, x - 100)), sendTo('ButtonRelease(5) button=left button(0x01)', 560, 460)].join('\n')), CHILD);
const ok = { ok: true, output: null };
const bad = { ok: false, error: `X11 error X11Error { error_kind: Window, error_code: 3, sequence: 9, bad_value: ${CHILD}, request_name: Some("SendEvent") }` };
const step = (answer) => ({ command: 'key_down', answer, events: [] });
/** One lane; `form` 'now' records the child, the error's window and the trace, 'stored' is a row from before fix wave 1. */
const lane = (response, events, form = 'now') => {
  const drag = { command: 'drag', interrupted: true, ...interruptedStep(response, events, form === 'now' ? { child: CHILD } : {}), raw: normalizeAnswer(response), ...(form === 'now' && response.ok ? { sent: SENT } : {}) };
  if (form !== 'now') delete drag.bad_value;
  return [step(ok), drag, step(ok), step(ok), { command: 'exit', answer: { ok: true }, events: [] }];
};

/** One stored `events` row of the drag scenario, its differences as the run's judge (`first`) recorded them. */
function row(cua, first, form = 'now') {
  const records = { pinned: lane(bad, [...PRESSED, motion(550)], form), newest: lane(bad, [...PRESSED, motion(550)], form), cua };
  const differences = Object.fromEntries(['newest', 'cua'].map((l) => [l, first(records.pinned, records[l])]));
  return { run: 'r', kind: 'events', scenario: DRAG, route: 'window', via: 'wire', records, differences, declared: {} };
}
// the judge before ruling 818: the drag's ok is an answer unlike the reference's
const before = (a, b) => firstDifference(a.map((s) => ({ ...s, command: undefined })), b.map((s) => ({ ...s, command: undefined })));

test('an ok whole drag stored as a failure moves to a pass; the former judge reproduces the stored verdict', () => {
  const [run] = rejudgeEvents([row(lane(ok, [...PRESSED, ...WHOLE]), before)], { old: before });
  assert.deepEqual(run.moved, [`${DRAG}: cua fail -> pass`]);
  assert.deepEqual(run.failing, []);
  assert.deepEqual(run.unreproduced, []);
});

test("an interruption naming the child stays a pass; one stored before the child was recorded moves to a failure, unproved", () => {
  const [kept] = rejudgeEvents([row(lane(bad, [...PRESSED, motion(550)]), firstDifference)]);
  assert.deepEqual([kept.moved, kept.failing], [[], []]);
  const [stored] = rejudgeEvents([row(lane(bad, [...PRESSED, motion(550)], 'stored'), before, 'stored')]);
  assert.deepEqual(stored.moved, [`${DRAG}: cua pass -> fail`]);
  assert.deepEqual(stored.failing, [DRAG]);
  const [partial] = rejudgeEvents([row(lane(ok, [...PRESSED, ...WHOLE.slice(1)]), before)]);
  assert.deepEqual([partial.moved, partial.failing], [[], [DRAG]]);
});

test('a former judge that does not reproduce the stored verdict is reported', () => {
  const [run] = rejudgeEvents([row(lane(ok, [...PRESSED, ...WHOLE]), before)], { old: firstDifference });
  assert.deepEqual(run.unreproduced, [DRAG]);
});

// fix wave 2 (review 2's minor): a former judge is handed the scenario's steps, as the run's own judge is, so one that
// reads the requested path (570ff0bd's) replays as it judged
test("a former judge is given the scenario's steps", () => {
  const seen = [];
  const old = (a, b, steps) => {
    seen.push(steps);
    return firstDifference(a, b, steps);
  };
  const { steps } = scenarios().find((x) => x.name === DRAG);
  const [run] = rejudgeEvents([row(lane(ok, [...PRESSED, ...WHOLE]), (a, b) => firstDifference(a, b, steps))], { old });
  assert.deepEqual(seen, [steps, steps], 'newest and cua, each judged with the steps');
  assert.deepEqual(run.unreproduced, []);
});

test('a stored scenario this checkout does not know is refused, not skipped', () => {
  assert.throws(() => rejudgeEvents([{ ...row(lane(bad, PRESSED), firstDifference), scenario: 'gone' }]), /no scenario named "gone"/);
});

test('the drag scenario is the one the judge reads', () => {
  assert.ok(scenarios().some((s) => s.name === DRAG && s.fragile));
});
