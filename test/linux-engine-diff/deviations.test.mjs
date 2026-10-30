import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEVIATIONS, declaredDeviation, refusalSentence } from '../../scripts/linux-engine-diff/deviations.mjs';

test('every declared deviation names its operation, field, reason and the spec section', () => {
  assert.ok(DEVIATIONS.length >= 6);
  for (const d of DEVIATIONS) {
    assert.equal(typeof d.op, 'string');
    assert.equal(typeof d.field, 'string');
    assert.ok(d.reason.length > 10, d.op);
    assert.match(d.section, /Decision Log|Design|Plan of Work/);
  }
});

test('the text and clipboard commands are declared refused, each with its own sentence', () => {
  for (const op of ['type_text', 'type_characters', 'clipboard_read', 'clipboard_write', 'clipboard_release']) {
    const d = declaredDeviation({ op, scene: 'refusals', field: 'error', candidate: { ok: false, error: refusalSentence(op) } });
    assert.ok(d, op);
    assert.equal(d.op, op);
  }
  assert.equal(refusalSentence('clipboard_read'), 'clipboard_read is not available in this engine build');
});

test("a deviation covers only its field and only the candidate's declared answer", () => {
  const sentence = 'a sentence of its own';
  const list = [{ op: 'scroll', scene: 'chrome-input', field: 'error', answer: (c) => c.ok === false && c.error === sentence, reason: 'a test deviation', section: 'Design' }];
  const at = { op: 'scroll', scene: 'chrome-input' };
  assert.ok(declaredDeviation({ ...at, field: 'error', candidate: { ok: false, error: sentence } }, list));
  // another difference in the same operation is not excused
  assert.equal(declaredDeviation({ ...at, field: 'output', candidate: { ok: false, error: sentence } }, list), null);
  // nor another answer in the declared field
  assert.equal(declaredDeviation({ ...at, field: 'error', candidate: { ok: false, error: 'something else' } }, list), null);
  // nor the same field on another operation or scene
  assert.equal(declaredDeviation({ op: 'drag', scene: 'chrome-input', field: 'error', candidate: { ok: false, error: sentence } }, list), null);
  assert.equal(declaredDeviation({ op: 'scroll', scene: 'gedit', field: 'error', candidate: { ok: false, error: sentence } }, list), null);
});

test("a paste refused while an earlier unconfirmed paste's window runs is declared, in any scene", () => {
  const error = 'a previous paste could not be confirmed and may still be read; nothing was sent; retry after 7 s';
  for (const op of ['type_text', 'clipboard_write']) {
    for (const scene of ['gedit', 'chrome-textarea']) {
      assert.ok(declaredDeviation({ op, scene, field: 'error', candidate: { ok: false, error } }), `${op} ${scene}`);
    }
    assert.equal(declaredDeviation({ op, scene: 'gedit', field: 'error', candidate: { ok: false, error: `${error}.` } }), null);
    assert.equal(declaredDeviation({ op, scene: 'gedit', field: 'output', candidate: { ok: false, error } }), null);
  }
  assert.equal(declaredDeviation({ op: 'press_key', scene: 'gedit', field: 'error', candidate: { ok: false, error } }), null);
});

test('interrupted input answering an error where the pinned build answers success is declared', () => {
  const candidate = { ok: false, error: 'X11 error X11Error { error_kind: Window, error_code: 3, sequence: N }' };
  assert.ok(declaredDeviation({ op: 'interrupted_hold', scene: 'events', field: 'answer', candidate }));
  assert.equal(declaredDeviation({ op: 'interrupted_hold', scene: 'events', field: 'answer', candidate: { ok: true, output: null } }), null);
});
