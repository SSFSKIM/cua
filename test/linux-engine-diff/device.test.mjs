import assert from 'node:assert/strict';
import { test } from 'node:test';

import { auditNothingSent, parseXtrace } from '../../scripts/linux-engine-diff/audit.mjs';
import { DEVICE_OPS, DEVICE_SCENE_OPS, capabilitiesAnswer, scalePath, deviceSentence, dndCancelledSentence, dndLateNotice, dndLateRefusal, dndMayHaveDroppedSentence, dndUnconfirmedNotice, dndUnconfirmedRefusal, judgeDevice, strayNotice } from '../../scripts/linux-engine-diff/device.mjs';
import { allowPointer } from '../../scripts/linux-engine-diff/safety.mjs';
import { OPS, SCENE_OPS } from '../../scripts/linux-engine-diff/ops.mjs';
import { DEVIATIONS, DEVICE_REFUSAL, DND_REFUSAL, GECKO_POINTER_LEFT, GECKO_POINTER_REFUSALS, declaredRefusal } from '../../scripts/linux-engine-diff/deviations.mjs';
import { pagePath } from '../../scripts/linux-engine-diff/drag.mjs';
import { planOps, routeOf, runsOp } from '../../scripts/linux-engine-diff/run.mjs';
import { dropCounts, runOutcome, verdictLine } from '../../scripts/linux-engine-diff/stats.mjs';

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
  const plan = planOps(['device-gtk4', 'device-firefox', 'device-xterm', 'device-qt', 'device-chrome', 'device-chrome-dnd', 'gnome-text-editor'], Object.entries(DEVICE_SCENE_OPS).filter(([scene]) => !scene.startsWith('minimized') && !scene.startsWith('identity')).flatMap(([, ops]) => ops).filter((op) => op !== 'capabilities'));
  assert.equal(plan.length, 52);
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
  // Gecko by the real pointer (T19): every Firefox case parks it, in the window's visible part for the background
  // route, under the cover or outside for a refusal, and the background route is taken half covered too
  for (const op of SCENE_OPS['device-firefox']) assert.ok(OPS[op].park, `${op} parks the real pointer`);
  for (const op of ['firefox_click_overlap_pointer_in_shared', 'firefox_move_overlap_pointer_in_shared', 'firefox_drag_overlap_pointer_in_shared', 'firefox_scroll_overlap_pointer_in_shared']) {
    assert.equal(OPS[op].device, 'background', op);
    assert.equal(routeOf(op, 'device-firefox'), 'background', op);
  }
  for (const op of ['firefox_click_pointer_out_shared', 'firefox_click_pointer_under_shared', 'firefox_move_pointer_out_shared', 'firefox_drag_pointer_out_shared', 'firefox_scroll_pointer_out_shared']) assert.equal(OPS[op].device, 'refusal', op);
  // each Firefox refusal is declared against the vendor, which answers ok there for input Gecko ignores
  const refusals = SCENE_OPS['device-firefox'].filter((op) => OPS[op].device === 'refusal');
  assert.deepEqual([...refusals].sort(), [...GECKO_POINTER_REFUSALS].sort());
  for (const op of refusals) assert.ok(DEVIATIONS.some((d) => d.op === op && d.scene === 'device-firefox' && d.answer({ ok: false, error: 'firefox does not accept background input; use a dedicated desktop or activate the window first' })), op);
  for (const what of ['click', 'scroll', 'move', 'drag']) assert.ok(GECKO_POINTER_LEFT.test(`firefox may not have taken the ${what}: the desktop pointer left its window during the ${what}, and firefox takes background pointer input only while the pointer is in its window. Read the window to see what happened before trying again`), what);
  assert.equal(routeOf('chrome_drag_visible_path_shared', 'device-chrome'), 'background', 'a visible path in a partly covered window');
  assert.equal(routeOf('gtk4_element_click', 'device-gtk4'), null, 'an element action records no route');
  assert.equal(routeOf('chrome_dnd_in_front_shared', 'device-chrome-dnd'), 'background', 'Chrome already in front');
  assert.equal(routeOf('chrome_dnd_short_in_front_shared', 'device-chrome-dnd'), 'background', 'the short drop, in front');
  assert.deepEqual(pagePath('dnd-short', 0), [[530, 185], [570, 185]], 'the short drop: 40 px, from the near source into the zone');
  assert.deepEqual(OPS.chrome_dnd_late_shared.cuaArgs('device-chrome-dnd'), ['--dnd-cancel-after-release'], 'the forced-late cancel');
  // the signature already held, a corner covered: the in-time cancel and the forced-late one (the design session's ruling)
  assert.equal(OPS.chrome_dnd_obscured_in_front_shared.device, 'cancel');
  assert.deepEqual(OPS.chrome_dnd_obscured_in_front_late_shared.cuaArgs('device-chrome-dnd'), ['--dnd-cancel-after-release']);
  assert.equal(routeOf('chrome_dnd_obscured_in_front_shared', 'device-chrome-dnd'), null, 'watched, not in front: judged strictly');
  assert.ok(SCENE_OPS.desktop.includes('capabilities'));
});

const row = (fields) => ({ engine: 'cua', block: 0, i: 0, witness: true, ...fields });

test('a refusal passes only with the exact sentence, nothing changed, the witness unchanged and nothing sent', () => {
  const sentence = deviceSentence('org.gnome.TextEditor');
  assert.equal(sentence, 'org.gnome.TextEditor does not accept background input; use a dedicated desktop or activate the window first');
  const good = row({ ok: false, error: sentence, expected_error: sentence, unchanged: true });
  const clean = { clean: true, kind: 'nothing-sent', answered: [{ ok: false, error: sentence, expected_error: sentence }] };
  assert.deepEqual(judgeDevice('gte_type_text_shared', [good], clean), { pass: true, reasons: [] });
  // the audit counts only over requests refused as the case expects
  assert.match(judgeDevice('gte_type_text_shared', [good], { ...clean, answered: [] }).reasons[0], /audited no request/);
  assert.equal(judgeDevice('gte_type_text_shared', [good], { ...clean, answered: [{ ok: true }] }).pass, false, 'the audited request was not refused');
  assert.equal(judgeDevice('gte_type_text_shared', [good], { ...clean, answered: [{ ok: false, error: 'window 9 is unavailable', expected_error: sentence }] }).pass, false, 'refused for another reason');
  assert.equal(judgeDevice('gte_type_text_shared', [good], { clean: true, kind: 'nothing-sent' }).pass, false, 'an audit with no answers recorded');
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
  const audit = { clean: true, kind: 'foreground', answered: [{ ok: true }, { ok: true }] };
  assert.equal(judgeDevice('gtk4_click_dedicated', [good], audit).pass, true);
  assert.equal(judgeDevice('gtk4_click_dedicated', [good], { ...audit, answered: [{ ok: true }, { ok: false, error: 'nosuchkey' }] }).pass, false, 'an audited request failed');
  for (const [field, value] of [['effect', false], ['route', 'background'], ['activated', false], ['witness', false], ['ok', false]]) {
    assert.equal(judgeDevice('gtk4_click_dedicated', [good, { ...good, [field]: value }], audit).pass, false, field);
  }
  const background = row({ ok: true, effect: true, route: 'background' });
  assert.equal(judgeDevice('xterm_click_shared', [background], { clean: true, kind: 'background', answered: [{ ok: true }] }).pass, true);
  assert.equal(judgeDevice('xterm_click_shared', [{ ...background, effect: false }], { clean: true }).pass, false);
});

test("capabilities answers the X11 backend's report for the engine's own version and build", () => {
  const output = { backend: 'x11', tree: 'at_spi', input: { background: true, desktop: true }, capture: { window: 'retained', desktop: true }, text: { paste: 'verified', literal: true }, desktop: 'shared', version: '0.3.0', build: 'abc' };
  assert.equal(capabilitiesAnswer(output, 'cua-engine 0.3.0 (abc)'), true);
  // as the engine writes it: its keys in its own order
  const sorted = Object.fromEntries(Object.keys(output).sort().map((k) => [k, output[k]]));
  assert.equal(capabilitiesAnswer({ ...sorted, text: { literal: true, paste: 'verified' } }, 'cua-engine 0.3.0 (abc)'), true);
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

test("Chrome's drag-and-drop answers mirror the engine's (dnd.rs), and the cancel's is the declared refusal's", () => {
  assert.equal(
    dndCancelledSentence('Google-chrome'),
    'Google-chrome began a drag and drop, which changes the desktop; it was cancelled before the drop, so nothing was dropped. Use a dedicated desktop, or activate the window first',
  );
  assert.equal(
    dndMayHaveDroppedSentence('Google-chrome'),
    'Google-chrome began a drag and drop, which changes the desktop, and it could not be cancelled in time: the drop may have happened and the desktop changed. Use a dedicated desktop, or activate the window first',
  );
  assert.ok(DND_REFUSAL.test(dndCancelledSentence('Google-chrome')));
  assert.ok(!DND_REFUSAL.test(dndMayHaveDroppedSentence('Google-chrome')), 'a late cancel is no refusal');
  assert.ok(declaredRefusal({ op: 'drag', scene: 'dnd:chrome' }).answer === DND_REFUSAL);
});

test('a cancelled drag and drop passes only with the cancel sentence, nothing dropped, the witness unchanged and no XTEST', () => {
  const sentence = dndCancelledSentence('Google-chrome');
  const good = row({ ok: false, error: sentence, expected_error: sentence, dropped: false });
  const background = { clean: true, kind: 'background', answered: [{ ok: false, error: sentence, expected_error: sentence }] };
  assert.deepEqual(judgeDevice('chrome_dnd_shared', [good], background), { pass: true, reasons: [] });
  assert.equal(judgeDevice('chrome_dnd_shared', [good], { ...background, answered: [{ ok: true }] }).pass, false, 'the audited drag was not cancelled');
  assert.equal(judgeDevice('chrome_dnd_shared', [{ ...good, dropped: true }], background).pass, false, 'it dropped');
  assert.equal(judgeDevice('chrome_dnd_shared', [{ ...good, error: deviceSentence('Google-chrome') }], background).pass, false);
  assert.equal(judgeDevice('chrome_dnd_shared', [{ ...good, ok: true, error: undefined }], background).pass, false);
  assert.equal(judgeDevice('chrome_dnd_shared', [{ ...good, witness: false }], background).pass, false);
  assert.equal(judgeDevice('chrome_dnd_shared', [good], { clean: false, kind: 'background', forbidden: ['XTEST FakeInput'] }).pass, false);
});

test('a cancel forced too late passes only if every answer is honest and the drop was seen at least once', () => {
  const cancelled = dndCancelledSentence('Google-chrome');
  const late = dndMayHaveDroppedSentence('Google-chrome');
  const fields = { expected_error: cancelled, late_error: late };
  const mayHave = row({ ok: false, error: late, dropped: true, witness: false, ...fields });
  const nothing = row({ ok: false, error: cancelled, dropped: false, witness: true, ...fields });
  const background = { clean: true, kind: 'background', answered: [{ ok: false, error: late, ...fields }] };
  assert.equal(judgeDevice('chrome_dnd_late_shared', [mayHave], { ...background, answered: [{ ok: true }] }).pass, false, 'the audited drag answered success');
  assert.deepEqual(judgeDevice('chrome_dnd_late_shared', [mayHave, nothing], background), { pass: true, reasons: [] });
  assert.equal(judgeDevice('chrome_dnd_late_shared', [mayHave, { ...nothing, dropped: true }], background).pass, false, '"nothing was dropped" and it dropped');
  assert.equal(judgeDevice('chrome_dnd_late_shared', [mayHave, { ...nothing, witness: false }], background).pass, false, '"nothing was dropped" and the desktop changed');
  assert.equal(judgeDevice('chrome_dnd_late_shared', [nothing], background).pass, false, 'never late: the case proved nothing');
  assert.equal(judgeDevice('chrome_dnd_late_shared', [{ ...mayHave, ok: true, error: undefined }], background).pass, false);
});

test('the in-front drop passes only where the engine recorded the window in front and the desktop ended as it began', () => {
  assert.equal(DEVICE_OPS.chrome_dnd_in_front_shared.inFront, true, 'the witness allowance is declared for the in-front drops alone');
  assert.deepEqual(Object.keys(DEVICE_OPS).filter((op) => DEVICE_OPS[op].inFront), ['chrome_dnd_in_front_shared', 'chrome_dnd_short_in_front_shared', 'chrome_dnd_inzone_out_in_front_shared', 'chrome_dnd_long_left_in_front_shared', 'chrome_dnd_short_pointer_outside_shared', 'chrome_select_nudged_shared']);
  const good = row({ ok: true, effect: true, route: 'background', dnd: { in_front: true }, desktop_same: true, state_notice: null });
  const audit = { clean: true, kind: 'background', answered: [{ ok: true }] };
  assert.deepEqual(judgeDevice('chrome_dnd_in_front_shared', [good], audit), { pass: true, reasons: [], drops: { samples: 1, landed: 1, ok: 1, false_ok: 0, unconfirmed_landed: 0 } });
  assert.equal(judgeDevice('chrome_dnd_in_front_shared', [{ ...good, dnd: { in_front: false } }], audit).pass, false, 'not the in-front path');
  assert.equal(judgeDevice('chrome_dnd_in_front_shared', [{ ...good, desktop_same: false }], audit).pass, false);
  assert.equal(judgeDevice('chrome_dnd_in_front_shared', [{ ...good, witness: false }], audit).pass, false);
  assert.equal(judgeDevice('chrome_dnd_in_front_shared', [good], { clean: false, kind: 'background', forbidden: ['_NET_ACTIVE_WINDOW ClientMessage'] }).pass, false, 'the engine sent an activation');
});

test("GTK 4's scale is dragged away from where it stands, whichever sample of whichever block", () => {
  const [from, to] = scalePath({ before: { scale: 0 } });
  assert.ok(to.x > from.x, 'up from the start');
  const [back, end] = scalePath({ before: { scale: 74 } });
  assert.ok(end.x < back.x, 'down from three quarters');
  assert.deepEqual(scalePath({ before: null }), scalePath({ before: { scale: 0 } }), 'unread: up');
});

test('with the signature already held, the cases pass only where the engine watched the drag and recorded the bits held', () => {
  const cancelled = dndCancelledSentence('Google-chrome');
  const late = dndMayHaveDroppedSentence('Google-chrome');
  const held = { in_front: false, held_at_start: true, outcome: 'in_time' };
  const good = row({ ok: false, error: cancelled, expected_error: cancelled, dropped: false, dnd: held });
  const audit = { clean: true, kind: 'background', answered: [{ ok: false, error: cancelled, expected_error: cancelled }] };
  assert.deepEqual(judgeDevice('chrome_dnd_obscured_in_front_shared', [good], audit), { pass: true, reasons: [] });
  assert.equal(judgeDevice('chrome_dnd_obscured_in_front_shared', [{ ...good, dnd: { in_front: true } }], audit).pass, false, 'not watched');
  assert.equal(judgeDevice('chrome_dnd_obscured_in_front_shared', [{ ...good, dnd: { ...held, held_at_start: false } }], audit).pass, false, 'the arrangement did not hold');
  const fields = { expected_error: cancelled, late_error: late };
  const mayHave = row({ ok: false, error: late, dropped: true, witness: false, dnd: { ...held, outcome: 'late' }, ...fields });
  const lateAudit = { clean: true, kind: 'background', answered: [{ ok: false, error: late, ...fields }] };
  assert.deepEqual(judgeDevice('chrome_dnd_obscured_in_front_late_shared', [mayHave], lateAudit), { pass: true, reasons: [] });
  // the defect this case exists to catch: "nothing was dropped" though it dropped, the signature unable to show it
  assert.equal(judgeDevice('chrome_dnd_obscured_in_front_late_shared', [{ ...mayHave, error: cancelled }], lateAudit).pass, false);
});

test('the forced late take passes only where the drag answered plainly, the read carried the notice, the next request was refused with it, and the witness saw the drop', () => {
  const app = 'Google-chrome';
  assert.equal(
    dndLateNotice(app),
    'Pending from your last drag, a late drag and drop: Google-chrome started a drag and drop after your drag into it ended, so the drag did not end as it answered; it may have dropped and changed the desktop. Read the window before sending input again: your next input request will not be run',
    "dnd.rs's notice",
  );
  const notice = dndLateRefusal(app, 'move');
  assert.equal(notice, 'Pending from your last drag, a late drag and drop: Google-chrome started a drag and drop after your drag into it ended, so the drag did not end as it answered; it may have dropped and changed the desktop; this move request was not run, so read the window before sending it again');
  assert.deepEqual(OPS.chrome_dnd_late_take_shared.cuaArgs('device-chrome-dnd'), ['--dnd-defer-take']);
  const good = row({ ok: true, read_ok: true, read_notice: true, next_ok: false, next_error: notice, expected_notice: notice, dropped: true, witness: false });
  const audit = { clean: true, kind: 'background', answered: [{ ok: true }] };
  assert.deepEqual(judgeDevice('chrome_dnd_late_take_shared', [good], audit), { pass: true, reasons: [] });
  assert.equal(judgeDevice('chrome_dnd_late_take_shared', [{ ...good, read_notice: false }], audit).pass, false, "the read's reply carried no notice");
  assert.equal(judgeDevice('chrome_dnd_late_take_shared', [{ ...good, next_ok: true, next_error: null }], audit).pass, false, 'the notice was not given');
  assert.equal(judgeDevice('chrome_dnd_late_take_shared', [{ ...good, ok: false, error: 'x' }], audit).pass, false, 'the drag itself refused');
  assert.equal(judgeDevice('chrome_dnd_late_take_shared', [{ ...good, read_ok: false }], audit).pass, false, 'the read was refused');
  assert.equal(judgeDevice('chrome_dnd_late_take_shared', [{ ...good, witness: true }], audit).pass, false, 'a drop the witness did not record');
  assert.equal(judgeDevice('chrome_dnd_late_take_shared', [{ ...good, dropped: false, witness: true }], audit).pass, false, 'no drop: nothing shown');
  assert.equal(judgeDevice('chrome_dnd_late_take_shared', [good, { ...good, dropped: false, witness: true }], audit).pass, true, 'a missed drop beside landed ones');
});

test("an unconfirmed drop's refusal is dnd.rs's, naming the request not run", () => {
  assert.equal(
    dndUnconfirmedRefusal('Google-chrome', 'click'),
    'Pending from your last drag, an unconfirmed drop: your drag into Google-chrome began a drag and drop, and Google-chrome did not confirm a drop after the release, so the drop may not have landed as the drag answered; this click request was not run, so read the window before sending it again',
  );
});

test("a landed drop reported unconfirmed is honest, counted apart; a false ok fails its case (the design session, 2026-11-10)", () => {
  for (const op of ['chrome_dnd_in_front_shared', 'chrome_dnd_short_in_front_shared', 'chrome_dnd_covered_dedicated', 'chrome_dnd_short_covered_dedicated', 'chrome_dnd_short_pointer_outside_dedicated']) {
    assert.equal(OPS[op].confirm, true, op);
    const dedicated = OPS[op].device === 'foreground';
    const good = row({ ok: true, effect: true, state_notice: null, ...(dedicated ? { route: 'foreground', activated: true } : { dnd: { in_front: true }, desktop_same: true }) });
    const audit = { clean: true, kind: dedicated ? 'foreground' : 'background', answered: [{ ok: true }] };
    assert.deepEqual(judgeDevice(op, [good], audit), { pass: true, reasons: [], drops: { samples: 1, landed: 1, ok: 1, false_ok: 0, unconfirmed_landed: 0 } }, op);
    // landed, its confirmation late: honest, the case passes and the run counts it
    const honest = judgeDevice(op, [good, { ...good, i: 1, state_notice: dndUnconfirmedNotice('Google-chrome') }], audit);
    assert.equal(honest.pass, true, `${op}: an honest unconfirmed`);
    assert.deepEqual(honest.drops, { samples: 2, landed: 2, ok: 2, false_ok: 0, unconfirmed_landed: 1 });
  }
  // a false ok: answered ok, nothing dropped, nothing pending
  const op = 'chrome_dnd_inzone_out_in_front_shared';
  const base = row({ ok: true, effect: false, started: true, dropped: false, dnd: { in_front: true }, desktop_same: true, state_notice: dndUnconfirmedNotice('Google-chrome') });
  const audit = { clean: true, kind: 'background', answered: [{ ok: true }] };
  assert.deepEqual(judgeDevice(op, [base], audit), { pass: true, reasons: [], drops: { samples: 1, landed: 0, ok: 1, false_ok: 0, unconfirmed_landed: 0 } }, 'nothing landed, reported');
  const falseOk = judgeDevice(op, [base, { ...base, i: 1, state_notice: null }], audit);
  assert.equal(falseOk.pass, false);
  assert.match(falseOk.reasons[0], /answered ok with no drop and nothing pending on 1 of 2 samples/);
  assert.equal(judgeDevice(op, [{ ...base, started: false }], audit).pass, false, 'no drag and drop started: the control proved nothing');
  assert.deepEqual(OPS[op].cuaArgs('device-chrome-dnd'), [], 'shipped, the floor');
  assert.ok(DEVICE_SCENE_OPS['device-chrome-dnd'].includes(op), 'in the gate');
  assert.deepEqual(pagePath('dnd-inzone', 0), [[720, 195], [720, 250]], 'from inside the zone out of its bottom edge');
  // the long path that leaves: the same judge, in the gate, at the floor, its path longer than the floor's 350 ms
  const long = 'chrome_dnd_long_left_in_front_shared';
  assert.equal(OPS[long].device, 'leaves');
  assert.deepEqual(OPS[long].cuaArgs('device-chrome-dnd'), []);
  assert.ok(DEVICE_SCENE_OPS['device-chrome-dnd'].includes(long));
  assert.equal(judgeDevice(long, [{ ...base, state_notice: null }], audit).pass, false, 'a false ok fails it');
  const p = pagePath('dnd-long-left', 0);
  const length = p.slice(1).reduce((n, [x, y], k) => n + Math.hypot(x - p[k][0], y - p[k][1]), 0);
  assert.ok(length > 700, `${length} px`);
  const inTarget = ([x, y]) => x >= 560 && x <= 760 && y >= 120 && y <= 220;
  assert.ok(p.some(inTarget) && !inTarget(p.at(-1)), 'across the target, ending outside it');
});

test("a run's landed drops reported unconfirmed are a finding only above 5% of its landed drops", () => {
  const v = (landed, unconfirmed) => ({ kind: 'verdict', scene: 's', op: `o${landed}${unconfirmed}`, candidate: 'cua', pass: true, verdict: 'pass', drops: { samples: landed, landed, ok: landed, false_ok: 0, unconfirmed_landed: unconfirmed } });
  assert.equal(dropCounts([v(45, 2)]).finding, null, '2 of 45, 4.4%');
  assert.match(dropCounts([v(45, 3)]).finding, /3 of 45, over 5%/);
  // summed over the run's cases: one load
  assert.deepEqual({ ...dropCounts([v(9, 1), v(36, 1), { kind: 'verdict', pass: true }]), finding: null }, { cases: 2, samples: 45, landed: 45, ok: 45, false_ok: 0, unconfirmed_landed: 2, finding: null });
  const outcome = runOutcome([v(20, 2)], { valid: true });
  assert.equal(outcome.pass, false);
  assert.match(outcome.failed[0], /landed drops reported unconfirmed: 2 of 20/);
  assert.equal(runOutcome([v(45, 2)], { valid: true }).pass, true);
});

test("a Chromium drag a stray pointer event may have reset passes only with the engine's sentence, nothing dropped, the witness unchanged and the background audit clean", () => {
  assert.equal(
    strayNotice('Google-chrome'),
    'Google-chrome may not have started the drag, and the page may have taken the press as a click: the desktop pointer was outside the window, or entered or moved in it during the press. Read the window to see what happened before dragging again',
    "stray.rs's sentence",
  );
  for (const op of ['chrome_dnd_short_pointer_outside_shared', 'chrome_select_nudged_shared']) {
    assert.equal(DEVICE_OPS[op].device, 'stray');
    assert.deepEqual(DEVICE_OPS[op].cuaArgs('device-chrome-dnd'), [], `${op}: shared mode`);
    assert.ok(DEVICE_SCENE_OPS['device-chrome-dnd'].includes(op));
    const sentence = strayNotice('Google-chrome');
    const good = row({ ok: false, error: sentence, expected_error: sentence, dropped: false, dnd: { in_front: true }, desktop_same: true });
    const background = { clean: true, kind: 'background', answered: [{ ok: false, error: sentence, expected_error: sentence }] };
    assert.deepEqual(judgeDevice(op, [good], background), { pass: true, reasons: [] }, op);
    assert.equal(judgeDevice(op, [{ ...good, ok: true, error: undefined }], background).pass, false, `${op}: answered success`);
    assert.equal(judgeDevice(op, [{ ...good, error: dndCancelledSentence('Google-chrome') }], background).pass, false, `${op}: another answer`);
    assert.equal(judgeDevice(op, [{ ...good, dropped: true }], background).pass, false, `${op}: it dropped`);
    assert.equal(judgeDevice(op, [{ ...good, witness: false }], background).pass, false, `${op}: the desktop changed`);
    assert.equal(judgeDevice(op, [good], { ...background, answered: [{ ok: true }] }).pass, false, `${op}: the audited drag answered success`);
    assert.equal(judgeDevice(op, [good], { clean: false, kind: 'background', forbidden: ['XTEST FakeInput'] }).pass, false, `${op}: the engine sent XTEST`);
  }
  // the nudges are the case's own: the witness allows the pointer it moves, and nothing else
  assert.equal(DEVICE_OPS.chrome_select_nudged_shared.pointerMoves, true);
  assert.equal(typeof DEVICE_OPS.chrome_select_nudged_shared.alongside, 'function');
  assert.ok(Object.keys(DEVICE_OPS).filter((op) => DEVICE_OPS[op].pointerMoves).every((op) => op === 'chrome_select_nudged_shared'));
  // dedicated: the pointer outside takes the foreground route, and the drop lands
  const ded = DEVICE_OPS.chrome_dnd_short_pointer_outside_dedicated;
  assert.equal(ded.device, 'foreground');
  assert.deepEqual(ded.cuaArgs('device-chrome-dnd'), ['--desktop', 'dedicated']);
  assert.equal(routeOf('chrome_dnd_short_pointer_outside_dedicated', 'device-chrome-dnd'), 'foreground');
});

test('every Chromium case that takes the background route parks the real pointer in its window first, so no case depends on where the one before left it', () => {
  const chromium = [...DEVICE_SCENE_OPS['device-chrome'], ...DEVICE_SCENE_OPS['device-chrome-dnd']];
  const background = chromium.filter((op) => !['refusal', 'foreground'].includes(DEVICE_OPS[op].device) && op !== 'chrome_dnd_short_pointer_outside_shared');
  assert.deepEqual(background.filter((op) => !DEVICE_OPS[op].park), [], 'parked in the window');
  assert.equal(background.length, 11);
  assert.equal(DEVICE_OPS.chrome_dnd_short_pointer_outside_shared.park, undefined, 'parked outside by its condition instead');
});

test("the pointer allowance lifts the pointer field alone, and only for a case whose harness moves the pointer", () => {
  const judged = { clean: false, fields: ['pointer'], allowed: [] };
  assert.deepEqual(allowPointer(judged, true), { clean: true, fields: [], allowed: ['pointer'] });
  assert.deepEqual(allowPointer(judged, false), judged, 'no allowance declared');
  assert.deepEqual(allowPointer({ clean: false, fields: ['pointer', 'focus'], allowed: [] }, true), { clean: false, fields: ['focus'], allowed: ['pointer'] }, 'the focus still fails');
  const clean = { clean: true, fields: [], allowed: [] };
  assert.equal(allowPointer(clean, true), clean, 'nothing to lift');
});

test("a case's pointer goes only onto the root or a live window of the run's, read at the point just before each move", async () => {
  const { parkPointer } = await import('../../scripts/linux-engine-diff/device.mjs');
  // `unsafe`: the points where the top window is not the run's (a popup of the person's, say); `later`: those that
  // become so by the time the sample's cleanup runs
  const run = ({ unsafe = [], later = [] } = {}) => {
    const calls = [];
    const disposals = [];
    const skips = [];
    const tool = (...args) => {
      calls.push(args.join(' '));
      return args[0] === 'getmouselocation' ? 'X=300\nY=200\nSCREEN=0\nWINDOW=7\n' : '';
    };
    let blocked = unsafe;
    const desktop = { pointerSafeAt: (p) => !blocked.some((b) => b.x === p.x && b.y === p.y), skip: (what, window, reason) => skips.push(what) };
    const ctx = { desktop, dispose: (fn) => disposals.push(fn) };
    let error = null;
    try {
      parkPointer(ctx, { x: 600, y: 600 }, { tool });
    } catch (e) {
      error = e;
    }
    blocked = [...unsafe, ...later];
    for (const fn of disposals) fn();
    return { moves: calls.filter((c) => c.startsWith('mousemove')), skips, error };
  };
  assert.deepEqual(run().moves, ['mousemove 600 600', 'mousemove 300 200'], 'back where it was found');
  // found over another's window: parked on the front window's middle instead, a window of the run's
  assert.deepEqual(run({ unsafe: [{ x: 300, y: 200 }] }).moves, ['mousemove 600 600', 'mousemove 1170 715']);
  // the park point itself under another's window (the person's menu over the scene): no move, and the case fails
  const blocked = run({ unsafe: [{ x: 600, y: 600 }] });
  assert.deepEqual(blocked.moves, []);
  assert.match(blocked.error?.message ?? '', /over a window the run did not open/);
  // both places another's by the cleanup: the pointer stays, and the skip is recorded
  const stays = run({ later: [{ x: 300, y: 200 }, { x: 1170, y: 715 }] });
  assert.deepEqual(stays.moves, ['mousemove 600 600']);
  assert.deepEqual(stays.skips, ['pointer restore']);
});
