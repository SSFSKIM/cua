import assert from 'node:assert/strict';
import { test } from 'node:test';

import { auditNothingSent, parseXtrace } from '../../scripts/linux-engine-diff/audit.mjs';
import { DEVICE_OPS, DEVICE_SCENE_OPS, capabilitiesAnswer, deviceSentence, judgeDevice } from '../../scripts/linux-engine-diff/device.mjs';
import { OPS, SCENE_OPS } from '../../scripts/linux-engine-diff/ops.mjs';
import { DEVICE_REFUSAL, declaredRefusal } from '../../scripts/linux-engine-diff/deviations.mjs';
import { planOps, routeOf, runsOp } from '../../scripts/linux-engine-diff/run.mjs';
import { runOutcome, verdictLine } from '../../scripts/linux-engine-diff/stats.mjs';

const GET = '000:<:0010: 12: Request(20): GetProperty delete=false(0x00) window=0x012000f8 property=0x43("WM_CLASS") type=0x0';
const KEY = '000:<:02db: 44: Request(25): SendEvent propagate=false(0x00) destination=0x012000f8 event-mask=0 KeyPress(2) detail=0x35';
const FAKE = '000:<:02e0: 8: XTEST-Request(132,2): FakeInput type=2 detail=38';

test('a refused request is audited for nothing sent: a SendEvent of any kind, or XTEST input, fails it', () => {
  assert.equal(auditNothingSent(parseXtrace(GET)).clean, true);
  assert.deepEqual(auditNothingSent(parseXtrace([GET, KEY].join('\n'))).forbidden.map((f) => f.what), ['SendEvent']);
  const xtest = parseXtrace(FAKE);
  xtest.extensions.XTEST = 132;
  assert.deepEqual(auditNothingSent(xtest).forbidden.map((f) => f.what), ['XTEST FakeInput']);
  assert.equal(auditNothingSent(parseXtrace('')).clean, false, 'an empty trace proves nothing');
});

test("Acceptance 8's cases: each kind and condition, refused in shared mode, foreground in dedicated, the rest background", () => {
  const plan = planOps(['device-gtk4', 'device-firefox', 'device-xterm', 'device-qt', 'device-chrome', 'gnome-text-editor'], Object.values(DEVICE_SCENE_OPS).flat().filter((op) => op !== 'capabilities'));
  assert.equal(plan.length, 34);
  for (const { op, scene } of plan) {
    const def = OPS[op];
    assert.ok(SCENE_OPS[scene].includes(op));
    assert.equal(runsOp('pinned', op), false, `${op}: cua alone`);
    if (def.device === 'refusal') {
      assert.deepEqual(def.cuaArgs(scene), [], `${op}: shared mode`);
      assert.equal(routeOf(op, scene), null, 'judged strictly: no route');
    }
    if (def.device === 'foreground') {
      assert.deepEqual(def.cuaArgs(scene), ['--desktop', 'dedicated']);
      assert.equal(routeOf(op, scene), 'foreground');
    }
  }
  assert.equal(routeOf('firefox_click_visible_shared', 'device-firefox'), 'background');
  assert.equal(routeOf('chrome_drag_visible_path_shared', 'device-chrome'), 'background', 'a visible path in a partly covered window');
  assert.equal(routeOf('gtk4_element_click', 'device-gtk4'), null, 'an element action records no route');
  assert.ok(SCENE_OPS.desktop.includes('capabilities'));
});

const row = (fields) => ({ engine: 'cua', block: 0, i: 0, witness: true, ...fields });

test('a refusal passes only with the exact sentence, nothing changed, the witness unchanged and nothing sent', () => {
  const sentence = deviceSentence('org.gnome.TextEditor');
  assert.equal(sentence, 'org.gnome.TextEditor does not accept background input; use a dedicated desktop or activate the window first');
  const good = row({ ok: false, error: sentence, expected_error: sentence, unchanged: true });
  const clean = { clean: true, kind: 'nothing-sent' };
  assert.deepEqual(judgeDevice('gte_type_text_shared', [good], clean), { pass: true, reasons: [] });
  assert.equal(judgeDevice('gte_type_text_shared', [{ ...good, ok: true, error: undefined }], clean).pass, false, 'answered success');
  assert.equal(judgeDevice('gte_type_text_shared', [{ ...good, error: 'another error' }], clean).pass, false);
  assert.equal(judgeDevice('gte_type_text_shared', [{ ...good, unchanged: false }], clean).pass, false, 'something arrived');
  assert.equal(judgeDevice('gte_type_text_shared', [{ ...good, witness: false }], clean).pass, false);
  assert.match(judgeDevice('gte_type_text_shared', [good], { clean: false, kind: 'nothing-sent', forbidden: ['SendEvent'] }).reasons[0], /nothing-sent audit found SendEvent/);
  assert.equal(judgeDevice('gte_type_text_shared', [good], undefined).pass, false, 'no audit: not proven');
  assert.equal(judgeDevice('gte_type_text_shared', [], clean).pass, false);
});

test('a foreground case passes only with its effect, the foreground route recorded and its window left active', () => {
  const good = row({ ok: true, effect: true, route: 'foreground', activated: true });
  const audit = { clean: true, kind: 'foreground' };
  assert.equal(judgeDevice('gtk4_click_dedicated', [good], audit).pass, true);
  for (const [field, value] of [['effect', false], ['route', 'background'], ['activated', false], ['witness', false], ['ok', false]]) {
    assert.equal(judgeDevice('gtk4_click_dedicated', [good, { ...good, [field]: value }], audit).pass, false, field);
  }
  const background = row({ ok: true, effect: true, route: 'background' });
  assert.equal(judgeDevice('xterm_click_shared', [background], { clean: true, kind: 'background' }).pass, true);
  assert.equal(judgeDevice('xterm_click_shared', [{ ...background, effect: false }], { clean: true }).pass, false);
});

test("capabilities answers the X11 backend's report for the engine's own version and build", () => {
  const output = { backend: 'x11', tree: 'at_spi', input: { background: true, desktop: true }, capture: { window: 'retained', desktop: true }, text: { paste: 'verified', literal: true }, desktop: 'shared', version: '0.3.0', build: 'abc' };
  assert.equal(capabilitiesAnswer(output, 'cua-engine 0.3.0 (abc)'), true);
  assert.equal(capabilitiesAnswer({ ...output, desktop: 'dedicated' }, 'cua-engine 0.3.0 (abc)'), false);
  assert.equal(capabilitiesAnswer(output, 'cua-engine 0.3.1 (abc)'), false);
  assert.equal(judgeDevice('capabilities', [row({ ok: true, answer_ok: true })], null).pass, true, 'no audit for an answer');
  assert.ok(DEVICE_OPS.capabilities.cuaOnly);
});

test("a declared refusal is a recorded loss: listed apart, never a pass, not a failure; only the Device mode sentence matches", () => {
  assert.ok(declaredRefusal({ op: 'drag', scene: 'chrome-input' }));
  assert.equal(declaredRefusal({ op: 'drag', scene: 'gedit' }), null, 'only where declared');
  assert.ok(DEVICE_REFUSAL.test(deviceSentence('Google-chrome')));
  assert.ok(!DEVICE_REFUSAL.test('drag path must contain at least two points'));
  const verdict = (pass, extra = {}) => ({ kind: 'verdict', candidate: 'cua', scene: 'chrome-input', op: 'drag', pass, reasons: [], ...extra });
  const outcome = runOutcome([verdict(true, { op: 'move' }), verdict(false, { verdict: 'declared refusal' })], { valid: true });
  assert.deepEqual(outcome, { valid: true, pass: true, failed: [], parity: [], refused: ['chrome-input drag cua'], code: 0 });
  assert.match(verdictLine(outcome), /^no verdict FAIL; declared refusal \(a loss, not a pass\): chrome-input drag cua$/);
});
