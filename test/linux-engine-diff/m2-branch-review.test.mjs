// Regression tests for M2's whole-branch review (#171, docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md,
// Decision Log, M2 whole-branch review and the design session's top-up; Acceptance 3, 5 and 6): the foreground
// route's activation and focus evidence, its audit, a text operation's effect obligation, the desktop route's
// under-sampled groups, and the display-wide unconfirmed-paste window.

import assert from 'node:assert/strict';
import test from 'node:test';

import { auditForeground } from '../../scripts/linux-engine-diff/audit.mjs';
import { waitQuarantineOver } from '../../scripts/linux-engine-diff/clip.mjs';
import { DEVIATIONS, declaredDeviation } from '../../scripts/linux-engine-diff/deviations.mjs';
import { topUpRounds } from '../../scripts/linux-engine-diff/run.mjs';
import { medianDifferenceInterval } from '../../scripts/linux-engine-diff/events.mjs';
import { judgeOperation } from '../../scripts/linux-engine-diff/stats.mjs';
import { TEXT_OPS } from '../../scripts/linux-engine-diff/text.mjs';
import { judgeFocus, judgeForegroundSpan } from '../../scripts/linux-engine-diff/witness.mjs';

const ROOT = 0x21d;
const [OTHER_FRAME, FRAME] = [0x47b14b, 0x47b0dc];
const CLIENT = 0x2e00004;
const span = (focus, changes = []) => ({ tree: [], restacks: [], root: ROOT, focus, changes });
const focusIn = (window, detail = 4) => ({ kind: 'focus_in', window, detail, mode: 0 });
const focusOut = (window, detail = 4) => ({ kind: 'focus_out', window, detail, mode: 0 });
const facts = { target: CLIENT, frame: FRAME, focusWithin: (w) => w === CLIENT || w === CLIENT + 1 };

// ---------------------------------------------------------------------------------------------------------------
// the activation and focus evidence

test("the target's activation, and the focus going into its frame, are allowed", () => {
  const activation = span(
    [{ kind: 'activate', window: CLIENT, source: 2 }, focusOut(OTHER_FRAME), focusIn(FRAME)],
    [{ field: 'active', notify: true }, { field: 'active', from: [0x1200003], to: [CLIENT] }, { field: 'focus', from: 0x1200004, to: CLIENT + 1 }],
  );
  assert.deepEqual(judgeFocus(activation, facts), { clean: true, violations: [] });
  assert.deepEqual(judgeForegroundSpan(activation, facts), { clean: true, fields: [], allowed: ['active', 'focus'] });
  // through no focus (the root's FocusIn, detail None) on the way to the target
  assert.equal(judgeFocus(span([focusIn(ROOT, 7), focusIn(ROOT, 5), focusIn(FRAME)]), facts).clean, true);
  // nothing at all
  assert.deepEqual(judgeFocus(span([]), facts), { clean: true, violations: [] });
  // a client created on the root before its window manager framed it has the focus events selected too: the focus
  // moving inside the target's own window is the target's
  assert.equal(judgeFocus(span([focusIn(CLIENT, 2), focusOut(CLIENT, 2)]), facts).clean, true);
  assert.equal(judgeFocus(span([focusIn(0x1200003, 2)]), facts).clean, false, "inside another client's window");
});

test('the focus and the active window switched to another window and back under one server grab fail', () => {
  // the coalesced form: the property is read after its notifies and the focus sampled, so neither shows the switch
  const report = span([focusOut(FRAME), focusIn(OTHER_FRAME), focusOut(OTHER_FRAME), focusIn(FRAME)], [
    { field: 'active', notify: true },
    { field: 'active', notify: true },
  ]);
  assert.equal(judgeFocus(report, facts).clean, false);
  const judged = judgeForegroundSpan(report, facts);
  assert.equal(judged.clean, false);
  assert.ok(judged.fields.includes('focus') && judged.fields.includes('active'), judged.fields.join());
  assert.equal(judged.allowed.includes('active'), false, 'no active-window notify is allowed beside a forbidden switch');
});

test('only the target may be activated or take the focus, and a span without the record is not clean', () => {
  assert.equal(judgeFocus(span([{ kind: 'activate', window: 0x1200003, source: 2 }]), facts).clean, false, 'another window activated');
  assert.equal(judgeFocus(span([focusIn(ROOT, 7)]), facts).clean, false, 'the focus left with no window');
  assert.equal(judgeFocus(span([focusIn(FRAME), focusIn(ROOT, 6)]), facts).clean, false, 'the focus went to the pointer root after the target');
  assert.equal(judgeFocus({ tree: [], restacks: [], changes: [] }, facts).clean, false, 'no focus record');
  assert.deepEqual(judgeForegroundSpan({ tree: [], restacks: [], changes: [] }, facts).fields, ['focus']);
});

test("the foreground audit allows the target's activation, raise and focus and XTEST input, nothing else", () => {
  const request = (major, text, minor = null) => ({ conn: 0, seq: 1, major, minor, name: null, text });
  const trace = (...requests) => ({ requests, extensions: { XTEST: 132 } });
  const activate = (w) => request(25, `Request(25): SendEvent propagate=false(0x00) destination=0x0000021d event-mask=SubstructureNotify,SubstructureRedirect ClientMessage(33) format=0x20 window=0x${w.toString(16).padStart(8, '0')} type=0x134("_NET_ACTIVE_WINDOW")`);
  const raise = (w) => request(12, `Request(12): ConfigureWindow window=0x${w.toString(16).padStart(8, '0')} values={stack-mode=Above(0x00)}`);
  const focus = (w) => request(42, `Request(42): SetInputFocus revert-to=PointerRoot(0x01) focus=0x${w.toString(16).padStart(8, '0')} time=CurrentTime(0x00000000)`);
  const fake = request(132, 'XTEST-Request(132,2): UNKNOWN opcode=0x84 opcode2=0x02', 2);
  const ok = auditForeground(trace(activate(CLIENT), raise(CLIENT), focus(CLIENT), fake), CLIENT);
  assert.equal(ok.clean, true, JSON.stringify(ok.forbidden));
  assert.equal(ok.allowed, 4);
  for (const bad of [activate(0x1200003), raise(0x1200003), focus(0x1200004), request(41, 'Request(41): WarpPointer')]) {
    assert.equal(auditForeground(trace(activate(CLIENT), bad, fake), CLIENT).clean, false, bad.text);
  }
  assert.equal(auditForeground(trace(), CLIENT).clean, false, 'nothing traced');
});

// ---------------------------------------------------------------------------------------------------------------
// a text operation's effect

test('every text operation names its independent effect, or why it has none', () => {
  for (const [op, def] of Object.entries(TEXT_OPS)) {
    assert.ok(typeof def.effect === 'function' || typeof def.effectFree === 'string', `${op} has an effect or a reason it has none`);
    if (typeof def.effect === 'function') assert.equal(typeof def.read, 'function', `${op} reads its effect`);
  }
});

test('successful, witness-clean, clipboard-keeping samples whose effect could not be read fail', () => {
  const row = (series, extra = {}) => ({ engine: 'cua', series, ms: 100, ok: true, witness: true, clipboard_kept: true, effect_required: true, ...extra });
  // type_text_dedicated: no vendor samples, so no readable sample of any engine
  const unread = [row('cold', { effect_unread: true, effect: false }), row('warm', { effect_unread: true, effect: false })];
  const v = judgeOperation(unread, { vendors: ['pinned', 'newest'], candidate: 'cua', text: true });
  assert.equal(v.pass, false);
  assert.match(v.reasons.join(), /the effect was not verified on 2 samples/);
  // the same with the effect absent altogether
  assert.equal(judgeOperation([row('cold'), row('warm')], { vendors: ['pinned', 'newest'], candidate: 'cua', text: true }).pass, false);
  // read and landed: a pass
  assert.equal(judgeOperation([row('cold', { effect: true }), row('warm', { effect: true })], { vendors: ['pinned', 'newest'], candidate: 'cua', text: true }).pass, true);
});

// ---------------------------------------------------------------------------------------------------------------
// the desktop route's under-sampled groups

test('a 3-sample desktop group is never judged on its medians, faster or slower', () => {
  const series = (engine, cold, warm) => [...cold.map((ms) => ({ engine, series: 'cold', ms, ok: true })), ...warm.map((ms) => ({ engine, series: 'warm', ms, ok: true }))];
  const warm = Array.from({ length: 21 }, (_, i) => 0.7 + (i % 3) * 0.01);
  const opts = { vendors: ['pinned', 'newest'], candidate: 'cua', noise: medianDifferenceInterval };
  // cua faster on three cold samples: still not a pass
  const faster = [...series('pinned', [4.9, 5.1, 5.0], warm), ...series('newest', [4.0, 4.1, 3.9], warm), ...series('cua', [3.0, 3.1, 2.9], warm)];
  const v = judgeOperation(faster, opts);
  assert.equal(v.pass, false);
  assert.match(v.reasons.join(), /cold .* undetermined: 3 samples a side, fewer than 20; not judged on medians/);
  // slower on three: the reason is the sample count, not the medians
  const slower = [...series('pinned', [4.9, 5.1, 5.0], warm), ...series('newest', [4.0, 4.1, 3.9], warm), ...series('cua', [4.4, 4.5, 4.3], warm)];
  assert.deepEqual(judgeOperation(slower, opts).reasons, ['cua: cold 4.4 ms against the bar 4 ms, undetermined: 3 samples a side, fewer than 20; not judged on medians']);
  // with 20 a side, judged
  const cold20 = (c) => Array.from({ length: 20 }, (_, i) => c + (i % 5) * 0.01);
  assert.equal(judgeOperation([...series('pinned', cold20(5), warm), ...series('newest', cold20(4), warm), ...series('cua', cold20(3), warm)], opts).pass, true);
});

test('the top-up adds fresh-engine rounds until every engine has 20 samples in each series', () => {
  // three blocks of one cold and seven warm samples: 17 cold-only rounds
  assert.deepEqual(topUpRounds({ cold: 3, warm: 21 }, { min: 20, warmPerRound: 7 }), { rounds: 17, warm: false });
  // one block: the warm series is short too, so every round takes its warm samples
  assert.deepEqual(topUpRounds({ cold: 1, warm: 7 }, { min: 20, warmPerRound: 7 }), { rounds: 19, warm: true });
  assert.deepEqual(topUpRounds({ cold: 20, warm: 140 }, { min: 20, warmPerRound: 7 }), { rounds: 0, warm: false });
});

// ---------------------------------------------------------------------------------------------------------------
// the display-wide unconfirmed-paste window

test('the harness waits the display-wide window out, never removing it', async () => {
  const reads = [{ open: true, remaining_ms: 900 }, { open: true, remaining_ms: 40 }, { open: false, remaining_ms: 0 }];
  const slept = [];
  const waited = await waitQuarantineOver({ read: () => reads.shift(), sleep: async (ms) => slept.push(ms) });
  assert.deepEqual(waited, { waited_ms: 940 + 2 * 50, reads: 3 });
  assert.deepEqual(slept, [950, 90]);
  // a window that never closes within its longest length is an error, not a removal
  await assert.rejects(waitQuarantineOver({ read: () => ({ open: true, remaining_ms: 10_000 }), sleep: async () => {}, maxMs: 12_000 }), /still open/);
});

test("the declared refusal names the display-wide window and clipboard_read's Copy", () => {
  const sentence = 'a previous paste could not be confirmed and may still be read; nothing was sent; retry after 7 s';
  for (const op of ['type_text', 'clipboard_write', 'clipboard_read']) {
    const d = declaredDeviation({ op, scene: 'gedit', field: 'error', candidate: { ok: false, error: sentence } });
    assert.ok(d, op);
    assert.match(d.reason, /any cua engine on the display/);
    assert.match(d.section, /whole-branch review/);
  }
  assert.equal(DEVIATIONS.filter((d) => d.field === 'error' && /previous paste/.test(d.reason)).length, 0, 'the reason states the rule, not the sentence');
});
