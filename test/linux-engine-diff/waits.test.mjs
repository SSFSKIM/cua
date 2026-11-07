// M4's T9, the remaining fixed waits: the harness's side (display-free).
import assert from 'node:assert/strict';
import test from 'node:test';

import { cellsFor } from '../../scripts/linux-engine-diff/action-settle-cells.mjs';
import { firstCaptureVerdict, judgeControls } from '../../scripts/linux-engine-diff/readiness-check.mjs';
import { SPEED_GAPS, declaredSpeedGap } from '../../scripts/linux-engine-diff/deviations.mjs';
import { eventSpeeds, fakeMotions, judgeMotionListener, judgeMotionStep } from '../../scripts/linux-engine-diff/events.mjs';

test("desktop move's later requests are no declared gap any more: a loss there fails", () => {
  assert.equal(declaredSpeedGap({ op: 'move', route: 'desktop', series: 'later' }), null);
  assert.deepEqual(SPEED_GAPS, []);
  const rows = (centre) => Array.from({ length: 20 }, (_, i) => ({ command: 'move', ms: centre + (i % 5) * 0.01, first: false, scenario: 's', step: 1 }));
  const [move] = eventSpeeds([], { blocks: [{ route: 'desktop', records: { pinned: rows(8.6), newest: rows(6), cua: rows(8.5) } }] });
  assert.equal(move.verdict, 'fail');
});

test('the desktop route carries pointer input into every family of the matrix in the settle experiment', () => {
  const pointer = ['click', 'move', 'scroll', 'drag', 'drag_handle'];
  for (const family of ['chrome', 'electron', 'gedit', 'kate', 'qtcreator', 'writer', 'gnome-terminal', 'xterm', 'gtk3', 'qt5', 'qt6']) {
    assert.ok(cellsFor({ families: [family], routes: ['desktop'] }).some((c) => pointer.includes(c.kind)), family);
  }
  // GTK 4 and Gecko take it in front, through the foreground route's XTEST
  for (const family of ['gtk4', 'firefox']) assert.ok(cellsFor({ families: [family], routes: ['dedicated'] }).some((c) => pointer.includes(c.kind)), family);
});

// imgdiff's answers: the same image, and one a sixth of whose pixels are off
const same = { a: [900, 700], b: [900, 700], compared: 630000, over: 0, mad: 0 };
const off = { a: [900, 700], b: [900, 700], compared: 630000, over: 105000, mad: 40 };

test('a first capture the server kept offscreen must also equal the window unobscured, since it may never repaint', () => {
  assert.deepEqual(firstCaptureVerdict(same), { ok: true, reason: null });
  assert.equal(firstCaptureVerdict(off).ok, false);
  // right against its own later capture, which shows the same pixels when nothing repaints, yet not the window
  assert.equal(firstCaptureVerdict(same, { offscreen: true, unobscured: off }).ok, false);
  assert.match(firstCaptureVerdict(same, { offscreen: true, unobscured: off }).reason, /unobscured/);
  assert.equal(firstCaptureVerdict(same, { offscreen: true, unobscured: same }).ok, true);
  assert.equal(firstCaptureVerdict(same, { offscreen: true, unobscured: null }).ok, null, 'no unobscured truth: unjudged');
  assert.equal(firstCaptureVerdict(same, { offscreen: false, unobscured: off }).ok, true, 'a capture the rule waited for is judged as before');
});

test('a control lane counts only when it missed: one that captured every first frame right proves nothing', () => {
  const trial = (lane, ok) => ({ lane, ok, family: 'gedit', condition: 'covered' });
  const trials = [trial('cua', true), trial('cua:control', true), trial('cua:control', false), trial('cua:other', true)];
  assert.deepEqual(judgeControls(trials), [
    { lane: 'cua:control', trials: 2, wrong: 1, missed: true },
    { lane: 'cua:other', trials: 1, wrong: 0, missed: false },
  ]);
  assert.deepEqual(judgeControls([trial('cua', false)]), [], 'the shipped lane is no control');
});

// an xtrace line of an absolute XTEST motion to (x, y), as xtrace 1.4 prints FakeInput (its body unparsed)
const fakeInput = (x, y, type = 6) => {
  const bytes = [type, 0, 0, 0, 0, 0, 0, 0, 0xff, 0x01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, x & 0xff, (x >> 8) & 0xff, y & 0xff, (y >> 8) & 0xff, 0, 0, 0, 0, 0, 0, 0, 0];
  return { major: 132, minor: 2, text: `000:<:0005: 36: XTEST-Request(132,2): UNKNOWN opcode=0x84 opcode2=0x02 unparsed-data=${bytes.map((b) => `0x${b.toString(16).padStart(2, '0')}`).join(',')};` };
};

test("the trace's XTEST motions are read with their positions, and nothing else is", () => {
  const requests = [fakeInput(640, 400), fakeInput(301, 300), fakeInput(0, 0, 4), { major: 98, minor: null, text: 'QueryExtension' }, fakeInput(-3 & 0xffff, 70)];
  assert.deepEqual(fakeMotions(requests, { XTEST: 132 }), [[640, 400], [301, 300], [-3, 70]]);
  assert.deepEqual(fakeMotions(requests, {}), [], 'no XTEST, no motions');
});

test("a step's motions are matched in order, and the ones at the pointer's own position counted", () => {
  // the pinned build's 1 px move: its leading motion at the pointer, then the point; both received
  assert.deepEqual(judgeMotionStep([300, 300], [[300, 300], [301, 300]], [[300, 300], [301, 300]]), { sent: 2, delivered: 2, own: 1, own_delivered: 1, undelivered: [], to: [301, 300] });
  // a server that drops a motion to where the pointer is: the leading one undelivered
  assert.deepEqual(judgeMotionStep([300, 300], [[300, 300], [301, 300]], [[301, 300]]), { sent: 2, delivered: 1, own: 1, own_delivered: 0, undelivered: [[300, 300]], to: [301, 300] });
  assert.deepEqual(judgeMotionStep([5, 5], [], []).to, [5, 5], 'nothing sent leaves the pointer where it was');
});

test("the listener proves nothing unless every control's 1 px move was received", () => {
  const row = (engine, delivered, extra = {}) => ({ engine, delivered_points: delivered, own: 1, own_delivered: 1, ...extra });
  const control = { control: [301, 300] };
  assert.deepEqual(judgeMotionListener([row('pinned', [[300, 300], [301, 300]], control), row('cua', [[300, 300], [301, 300]], control)]), { listening: true, own: 2, own_delivered: 2 });
  assert.equal(judgeMotionListener([row('pinned', [[300, 300], [301, 300]], control), row('cua', [[300, 300]], control)]).listening, false);
  assert.equal(judgeMotionListener([row('cua', [[300, 300]])]).listening, false, 'no control step at all');
});
