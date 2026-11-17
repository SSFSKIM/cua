import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { ACK_STEPS, KINDS, LANES, chosenKinds, chosenLanes, effectLanded, judged, kindRequests, laneEngine, qtActivationVerdict, runPasses } from '../../scripts/linux-engine-diff/qt-activation.mjs';
import { spanActivations, spanClean } from '../../scripts/linux-engine-diff/witness.mjs';

// M4 task 61: a background press to a Qt window activates it when Qt handles the press before the window system event
// its synthetic FocusIn queued (QXcbWindow::handleButtonPressEvent asks for activation while QGuiApplication's focus
// window is not the window). The experiment measures it per engine, kind and family, each run in a witness span.

const report = ({ changes = [], notifies = {}, focus = [] } = {}) => ({ changes, notifies, focus, samples: 40, max_gap_ms: 6 });

test("the lanes: the pinned vendor build, the released 0.3.0, the engine as it ships, the focus wait's steps, and the control with no wait", () => {
  assert.deepEqual(Object.keys(LANES), ['pinned', 'released', 'shipped', ...ACK_STEPS.map((ms) => `ack-${ms}`), 'control']);
  const args = { vendor: '/v/sky', released: '/r/cua-engine-0.3.0', cua: '/c/cua-engine' };
  assert.deepEqual(laneEngine('pinned', args), { bin: '/v/sky', args: [], cua: false });
  assert.deepEqual(laneEngine('released', args), { bin: '/r/cua-engine-0.3.0', args: [], cua: true });
  assert.deepEqual(laneEngine('shipped', args), { bin: '/c/cua-engine', args: [], cua: true });
  assert.deepEqual(laneEngine('ack-50', args), { bin: '/c/cua-engine', args: ['--focus-ack-ms', '50'], cua: true });
  assert.deepEqual(laneEngine('control', args), { bin: '/c/cua-engine', args: ['--focus-ack-ms', '0'], cua: true });
  assert.throws(() => laneEngine('pinned', { cua: '/c' }), /--vendor/);
  assert.throws(() => laneEngine('released', { cua: '/c' }), /--released/);
  assert.equal(judged('shipped'), true);
  assert.equal(judged('ack-25'), true);
  for (const lane of ['pinned', 'released', 'control']) assert.equal(judged(lane), false, lane);
});

test('--lanes and --kinds choose among the known ones, in the experiment\'s order; the default is the comparison at a click', () => {
  assert.deepEqual(chosenLanes({}), ['pinned', 'released', 'shipped', 'control']);
  assert.deepEqual(chosenLanes({ lanes: ['control', 'ack-25'] }), ['ack-25', 'control']);
  assert.throws(() => chosenLanes({ lanes: ['ack-7'] }), /unknown qt-activation lane ack-7/);
  assert.deepEqual(chosenKinds({}), ['click']);
  assert.deepEqual(chosenKinds({ kinds: ['drag', 'click', 'scroll'] }), KINDS.filter((k) => ['click', 'drag', 'scroll'].includes(k)));
  assert.throws(() => chosenKinds({ kinds: ['wheel'] }), /unknown qt-activation kind wheel/);
  const a = parseArgs(['--experiment', 'qt-activation', '--cua', '/c', '--vendor', '/v', '--released', '/r', '--kinds', 'click,drag', '--out', '/o']);
  assert.equal(a.released, '/r');
  assert.deepEqual(a.kinds, ['click', 'drag']);
});

test("each kind's requests: a click at the first character, a key then that click pipelined, a key, a drag along the first characters, a scroll", () => {
  const w = 7;
  const points = { first: { x: 10, y: 20 }, later: { x: 60, y: 20 } };
  assert.deepEqual(kindRequests('click', w, points), [{ command: 'click', input: { window: { id: w }, x: 10, y: 20 } }]);
  assert.deepEqual(kindRequests('key-click', w, points).map((r) => r.command), ['press_key', 'click']);
  assert.deepEqual(kindRequests('press_key', w, points), [{ command: 'press_key', input: { window: { id: w }, key: 'Left' } }]);
  assert.deepEqual(kindRequests('drag', w, points), [{ command: 'drag', input: { window: { id: w }, path: [{ x: 10, y: 20 }, { x: 60, y: 20 }] } }]);
  assert.deepEqual(kindRequests('scroll', w, points), [{ command: 'scroll', input: { window: { id: w }, x: 10, y: 20, direction: 'down', pixels: 300 } }]);
});

test("an effect landed: a click put the caret in the field's first line, a key moved it left by one, a drag selected in that line", () => {
  // the caret at the text's end (the empty line after the last newline), the first line 22 characters long
  const before = { caret: 46, selection: null };
  const line = { lineEnd: 22 };
  assert.equal(effectLanded('click', before, { caret: 6, selection: null }, line), true);
  assert.equal(effectLanded('click', before, { caret: 0, selection: null }, line), true);
  assert.equal(effectLanded('click', before, { caret: 46, selection: null }, line), false, 'the caret did not move');
  assert.equal(effectLanded('click', before, { caret: 30, selection: null }, line), false, 'another line');
  assert.equal(effectLanded('key-click', before, { caret: 6, selection: null }, line), true);
  assert.equal(effectLanded('press_key', before, { caret: 45, selection: null }, line), true);
  assert.equal(effectLanded('press_key', before, { caret: 46, selection: null }, line), false);
  assert.equal(effectLanded('drag', before, { caret: 11, selection: [6, 11] }, line), true);
  assert.equal(effectLanded('drag', before, { caret: 46, selection: null }, line), false);
  assert.equal(effectLanded('drag', before, { caret: 46, selection: [40, 46] }, line), false, 'not in the first line');
  // a scroll has no effect the harness reads on Qt (it ignores synthetic wheel events, families.rs): not judged by it
  assert.equal(effectLanded('scroll', before, before, line), null);
});

test("the span is clean only when the witness saw no change and no activation request, a request the window manager ignored included", () => {
  assert.equal(spanClean(report()), true);
  assert.equal(spanClean(report({ changes: [{ field: 'active', t_ms: 40 }] })), false);
  assert.equal(spanClean(report({ notifies: { active: 2 } })), false, 'a notify, even with the value restored');
  const asked = report({ focus: [{ kind: 'activate', t_ms: 31.2, window: 9, source: 1 }] });
  assert.equal(spanClean(asked), false);
  assert.deepEqual(spanActivations(asked), [{ window: 9, source: 1, t_ms: 31.2 }]);
  assert.equal(spanClean(null), false, 'no report');
  assert.equal(spanClean({ error: 'lost' }), false);
});

test("a run passes on a clean desktop, its answers and its effect; a scroll on a cua lane must be refused, which Qt's entry says", () => {
  const ok = { ok: true };
  const clean = { clean: true, frontActive: true };
  assert.equal(runPasses({ kind: 'click', cua: true, answers: [ok], desktop: clean, landed: true }), true);
  assert.equal(runPasses({ kind: 'click', cua: true, answers: [ok], desktop: { clean: false, frontActive: false }, landed: true }), false, 'activated');
  assert.equal(runPasses({ kind: 'click', cua: true, answers: [ok], desktop: { clean: true, frontActive: false }, landed: true }), false, 'the front lost after the span');
  assert.equal(runPasses({ kind: 'click', cua: true, answers: [{ ok: false, error: 'x did not take the background focus in time' }], desktop: clean, landed: false }), false, 'a refusal is a miss');
  assert.equal(runPasses({ kind: 'click', cua: true, answers: [ok], desktop: clean, landed: false }), false, 'the click did not land');
  const refused = { ok: false, error: 'org.kde.kate does not accept background input; use a dedicated desktop or activate the window first' };
  assert.equal(runPasses({ kind: 'scroll', cua: true, answers: [refused], desktop: clean, landed: null }), true);
  assert.equal(runPasses({ kind: 'scroll', cua: true, answers: [ok], desktop: clean, landed: null }), false, 'a cua lane sent a scroll Qt ignores');
  assert.equal(runPasses({ kind: 'scroll', cua: false, answers: [ok], desktop: clean, landed: null }), true, "the vendor's scroll, sent and ignored");
});

test("the verdict: each judged lane reaches 30 consecutive; at load the control must still activate; the comparison lanes are counted", () => {
  // a series row's input kind is `input`: its own `kind` is the row's (`qt-activation-series`)
  const series = (lane, family, { reached = true, runs = 30, activated = 0, input = 'click' } = {}) => ({ kind: 'qt-activation-series', lane, family, input, need: 30, reached, runs, misses: reached ? 0 : 3, streak: reached ? 30 : 4, activated, refused: 0, landed: runs });
  const good = [series('pinned', 'kate', { activated: 21 }), series('control', 'kate', { activated: 18 }), series('ack-50', 'kate')];
  assert.deepEqual(qtActivationVerdict(good, { families: ['kate'], load: true }).failed, []);
  const short = qtActivationVerdict([...good.slice(0, 2), series('ack-50', 'kate', { reached: false, runs: 60 })], { families: ['kate'], load: true });
  assert.match(short.failed.join('\n'), /kate click \(ack-50\): no 30 consecutive passing runs in 60/);
  const blind = qtActivationVerdict([series('control', 'kate'), series('ack-50', 'kate')], { families: ['kate'], load: true });
  assert.match(blind.failed.join('\n'), /kate click: the control lane activated nothing in 30 runs at load, so the test cannot see an activation/);
  // idle the control is the idle control: it must not be required to activate
  assert.deepEqual(qtActivationVerdict([series('control', 'kate'), series('ack-50', 'kate')], { families: ['kate'], load: false }).failed, []);
  const missing = qtActivationVerdict(good, { families: ['kate', 'qtcreator'], load: true });
  assert.match(missing.failed.join('\n'), /qtcreator was not measured/);
  assert.match(qtActivationVerdict(good, { families: ['kate'], load: true }).md.join('\n'), /\| kate \| click \| pinned \| 30 \| 21 \|/);
  // the waits a cua lane's series made: the focus reported taken, and an earlier focus let go first
  const waited = { ...series('ack-50', 'kate'), ack_waited_median: 12.5, ack_waited_max: 31, ack_released_median: 0, ack_released_max: 96.2 };
  assert.match(qtActivationVerdict([waited], { families: ['kate'], load: false }).md.join('\n'), /\| 12\.5 \/ 31 \| 0 \/ 96\.2 \|/);
});
