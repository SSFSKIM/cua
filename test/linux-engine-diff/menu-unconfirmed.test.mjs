// Candidate 3 (#171 M4, T18 gate; the design session's rulings 687 and 688): an element's showContextMenu that opens
// no menu answers menuUnconfirmed. The verdict run's chrome-input page cancels its context menu, so its two operations
// that send showContextMenu are declared: a loss listed apart, holding only while every cua sample answers
// menuUnconfirmed with the page's own context counter risen and the witness unchanged. An ignored request, whose page
// saw nothing, never passes as one the page took.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MENU_UNCONFIRMED, declaredRefusal } from '../../scripts/linux-engine-diff/deviations.mjs';
import { declaredRefusalVerdict, declaredWithEffect } from '../../scripts/linux-engine-diff/run.mjs';
import { runOutcome } from '../../scripts/linux-engine-diff/stats.mjs';

// the engine's sentence (native/linux-engine/src/engine/elements.rs `menu_unconfirmed`, whose unit test pins it too)
const SENTENCE =
  'showContextMenu was sent and no menu was seen within 1 s; the application may have shown its own menu or ignored the request; read the window before retrying';
const sample = (over = {}) => ({ ok: false, error: SENTENCE, witness: true, effect: true, ...over });
const EXCUSED = ['cua: a request failed', "cua: the output differs from the vendor's", 'cua: the effect was not verified on 1 sample (0/1)'];
const SPEED = 'cua: warm 1043.2 ms > bar 412.5 ms, the interval [600.1, 650.3] above 0';

test("the engine's sentence is the declared answer, and nothing near it is", () => {
  assert.match(SENTENCE, MENU_UNCONFIRMED);
  assert.doesNotMatch(`${SENTENCE}.`, MENU_UNCONFIRMED);
  assert.doesNotMatch('context menu did not open; no clipboard action was sent', MENU_UNCONFIRMED);
});

test('both chrome-input operations that send showContextMenu are declared unconfirmed with their effect, nothing else', () => {
  for (const op of ['right_click_fallback', 'secondary_action']) {
    const declared = declaredRefusal({ op, scene: 'chrome-input' });
    assert.ok(declared?.unconfirmed && declared.effect && declared.answer === MENU_UNCONFIRMED, op);
  }
  assert.equal(declaredRefusal({ op: 'right_click', scene: 'chrome-input' }), null, 'the coordinate right click is unchanged');
  assert.equal(declaredRefusal({ op: 'secondary_action', scene: 'chrome' }), null, 'only on the input page');
});

test('the effect is read for the declared answer only', () => {
  assert.equal(declaredWithEffect('secondary_action', 'chrome-input', { ok: false, error: SENTENCE }), true);
  assert.equal(declaredWithEffect('secondary_action', 'chrome-input', { ok: false, error: 'AT-SPI element refused action 1' }), false);
  assert.equal(declaredWithEffect('secondary_action', 'chrome-input', { ok: true, output: null }), false, 'a success reads it as before');
  assert.equal(declaredWithEffect('drag', 'chrome-input', { ok: false, error: SENTENCE }), false, "a declared refusal's effect is not read");
  assert.equal(declaredWithEffect('secondary_action', 'gedit', { ok: false, error: SENTENCE }), false);
});

test('every sample menuUnconfirmed with its context rise: declared unconfirmed, its speed not judged', () => {
  const refusal = declaredRefusal({ op: 'secondary_action', scene: 'chrome-input' });
  const verdict = declaredRefusalVerdict({ reasons: [...EXCUSED, SPEED] }, [sample(), sample()], refusal, 'cua');
  assert.deepEqual(verdict, { pass: false, verdict: 'declared unconfirmed', reasons: [] });
  // a loss listed apart: not a pass and not a failure of the run
  const outcome = runOutcome([{ kind: 'verdict', scene: 'chrome-input', op: 'secondary_action', candidate: 'cua', ...verdict }], { valid: true });
  assert.equal(outcome.failed.length, 0, JSON.stringify(outcome.failed));
});

test('the control: a sample whose page saw no context request fails the declaration', () => {
  const refusal = declaredRefusal({ op: 'right_click_fallback', scene: 'chrome-input' });
  for (const effect of [false, undefined]) {
    const verdict = declaredRefusalVerdict({ reasons: EXCUSED }, [sample(), sample({ effect })], refusal, 'cua');
    assert.equal(verdict.verdict, 'fail', `effect ${effect}`);
    assert.deepEqual(verdict.reasons, ['cua: 1 of 2 samples not the declared unconfirmed answer with its effect and the witness unchanged']);
  }
  // an ok, another error, a changed desktop: each fails it
  for (const odd of [{ ok: true, error: undefined }, { error: 'AT-SPI element refused action 1; refresh get_window_state() to check its state' }, { witness: false }]) {
    assert.equal(declaredRefusalVerdict({ reasons: EXCUSED }, [sample(odd)], refusal, 'cua').verdict, 'fail', JSON.stringify(odd));
  }
  // a failure beside the declared ones stands
  const dirty = declaredRefusalVerdict({ reasons: [...EXCUSED, 'cua: the audit found a forbidden request'] }, [sample()], refusal, 'cua');
  assert.deepEqual(dirty.reasons, ['cua: the audit found a forbidden request']);
});

test("a declared refusal's speed is still judged", () => {
  const refusal = declaredRefusal({ op: 'drag', scene: 'chrome-input' });
  const mine = [{ ok: false, error: 'Google-chrome does not accept background input; use a dedicated desktop or activate the window first', witness: true }];
  const verdict = declaredRefusalVerdict({ reasons: [...EXCUSED, SPEED] }, mine, refusal, 'cua');
  assert.deepEqual([verdict.verdict, verdict.reasons], ['fail', [SPEED]]);
});
