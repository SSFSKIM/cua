import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEVIATIONS, declaredDeviation, lineAsReported, setAsideTruncation, truncationAsDeclared } from '../../scripts/linux-engine-diff/deviations.mjs';

test('every declared deviation names its operation, field, reason and the spec section', () => {
  assert.ok(DEVIATIONS.length >= 6);
  for (const d of DEVIATIONS) {
    assert.equal(typeof d.op, 'string');
    assert.equal(typeof d.field, 'string');
    assert.ok(d.reason.length > 10, d.op);
    assert.match(d.section, /Decision Log|Design|Plan of Work/);
  }
});

test("M1a's text and clipboard refusals are gone: M2's paste route answers those commands", () => {
  for (const op of ['type_text', 'clipboard_read', 'clipboard_write', 'clipboard_release']) {
    const error = `${op} is not available in this engine build`;
    for (const scene of ['refusals', 'gedit', 'chrome-textarea']) {
      for (const field of ['error', 'answer']) assert.equal(declaredDeviation({ op, scene, field, candidate: { ok: false, error } }), null, `${op} ${scene} ${field}`);
    }
  }
});

test('where no vendor build applies the text, only a cua success is declared, on those scenes only', () => {
  const ok = { ok: true, output: null };
  assert.ok(declaredDeviation({ op: 'type_text', scene: 'gnome-text-editor', field: 'answer', candidate: ok }));
  assert.ok(declaredDeviation({ op: 'clipboard_write', scene: 'gedit', field: 'answer', candidate: ok }));
  assert.equal(declaredDeviation({ op: 'type_text', scene: 'gnome-text-editor', field: 'answer', candidate: { ok: false, error: 'x' } }), null);
  assert.equal(declaredDeviation({ op: 'type_text', scene: 'gedit', field: 'answer', candidate: ok }), null, 'gedit has the newest build as its reference');
  assert.equal(declaredDeviation({ op: 'type_text', scene: 'gnome-text-editor', field: 'output', candidate: ok }), null);
});

test("clipboard_write's restore of the clipboard is declared, on the clipboard field alone", () => {
  const kept = { ok: true, output: null, clipboard_kept: true };
  assert.ok(declaredDeviation({ op: 'clipboard_write', scene: 'gedit', field: 'clipboard', candidate: kept }));
  assert.equal(declaredDeviation({ op: 'clipboard_write', scene: 'gedit', field: 'clipboard', candidate: { ...kept, clipboard_kept: false } }), null);
  assert.equal(declaredDeviation({ op: 'type_text', scene: 'gedit', field: 'clipboard', candidate: kept }), null);
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

test('type_characters is answered, and only its refusal sentence is declared', () => {
  const refused = { ok: false, error: 'type_characters is not available in this engine build' };
  assert.equal(declaredDeviation({ op: 'type_characters', scene: 'refusals', field: 'error', candidate: refused }), null);
  for (const c of ['é', '\\n', '\\u{301}']) {
    const candidate = { ok: false, error: `Character '${c}' is not on the keyboard layout` };
    assert.ok(declaredDeviation({ op: 'type_characters', scene: 'events', field: 'answer', candidate }), c);
  }
  assert.equal(declaredDeviation({ op: 'type_characters', scene: 'events', field: 'answer', candidate: { ok: true, output: 3 } }), null);
  const sentence = { ok: false, error: "Character 'é' is not on the keyboard layout" };
  assert.equal(declaredDeviation({ op: 'type_characters', scene: 'events', field: 'events', candidate: sentence }), null);
});

test('interrupted input answering an error where the pinned build answers success is declared', () => {
  const candidate = { ok: false, error: 'X11 error X11Error { error_kind: Window, error_code: 3, sequence: N }' };
  assert.ok(declaredDeviation({ op: 'interrupted_hold', scene: 'events', field: 'answer', candidate }));
  assert.equal(declaredDeviation({ op: 'interrupted_hold', scene: 'events', field: 'answer', candidate: { ok: true, output: null } }), null);
});

test("cua's truncated is declared on the over-budget tree read alone, with both of its causes counted (M4 T3)", () => {
  const output = (truncated) => ({ ok: true, output: { ax_tree: {}, truncated } });
  const both = { nodes: 4200, depth: 2, failed: 0 };
  assert.ok(declaredDeviation({ op: 'tree', scene: 'over-budget', field: 'truncated', candidate: output(both) }));
  // the page is built with both causes: a count missing is not the declared answer
  for (const missing of [{ ...both, depth: 0 }, { ...both, nodes: 0 }, { nodes: 1, depth: 1 }, null]) {
    assert.equal(declaredDeviation({ op: 'tree', scene: 'over-budget', field: 'truncated', candidate: output(missing) }), null, JSON.stringify(missing));
  }
  // gedit and Chrome read whole: no truncated is declared there, nor for another operation
  for (const [op, scene] of [['tree', 'gedit'], ['tree', 'chrome'], ['tree_shot', 'gedit'], ['tree_shot', 'over-budget']]) {
    assert.equal(declaredDeviation({ op, scene, field: 'truncated', candidate: output(both) }), null, `${op} ${scene}`);
  }
  assert.equal(declaredDeviation({ op: 'tree', scene: 'over-budget', field: 'output', candidate: output(both) }), null, 'the field alone');
});

test('a declared truncated is set aside before the state is compared, and any other stays in it', () => {
  const answer = (scene, truncated) => ({ op: 'tree', scene, response: { ok: true, output: { ax_tree: { id: 'a' }, ...(truncated ? { truncated } : {}) } } });
  const both = { nodes: 4200, depth: 2, failed: 0 };
  const declared = setAsideTruncation(answer('over-budget', both));
  assert.deepEqual(declared.response, { ok: true, output: { ax_tree: { id: 'a' } } });
  assert.equal(declared.deviation.field, 'truncated');
  // undeclared: on gedit, or a count the declaration does not cover, the field stays and the state differs
  for (const kept of [answer('gedit', both), answer('over-budget', { ...both, depth: 0 })]) {
    const { response, deviation } = setAsideTruncation(kept);
    assert.equal(deviation, null);
    assert.deepEqual(response, kept.response);
  }
  const plain = answer('gedit', null);
  assert.deepEqual(setAsideTruncation(plain), { response: plain.response, deviation: null });
  const failed = { op: 'tree', scene: 'over-budget', response: { ok: false, error: 'x' } };
  assert.deepEqual(setAsideTruncation(failed), { response: failed.response, deviation: null });
});

test('a read gives its truncated as declared: present as declared on over-budget, absent everywhere else', () => {
  const both = { nodes: 4200, depth: 2, failed: 0 };
  assert.equal(truncationAsDeclared({ op: 'tree', scene: 'over-budget', truncated: both }), true);
  assert.equal(truncationAsDeclared({ op: 'tree', scene: 'over-budget', truncated: null }), false, 'the page must be cut');
  assert.equal(truncationAsDeclared({ op: 'tree', scene: 'over-budget', truncated: { ...both, nodes: 0 } }), false);
  assert.equal(truncationAsDeclared({ op: 'tree', scene: 'gedit', truncated: null }), true);
  assert.equal(truncationAsDeclared({ op: 'tree', scene: 'chrome', truncated: undefined }), true);
  assert.equal(truncationAsDeclared({ op: 'tree', scene: 'gedit', truncated: { nodes: 0, depth: 0, failed: 1 } }), false, 'no field on gedit');
});

test("the rendered line agrees with the read's truncated: its count the sum, and no line for a read that cut nothing", () => {
  assert.equal(lineAsReported(4202, { nodes: 4200, depth: 2, failed: 0 }), true);
  assert.equal(lineAsReported(4200, { nodes: 4200, depth: 2, failed: 0 }), false);
  assert.equal(lineAsReported(null, { nodes: 4200, depth: 2, failed: 0 }), false, 'a read that cut must show the line');
  assert.equal(lineAsReported(null, null), true);
  assert.equal(lineAsReported(null, { nodes: 0, depth: 0, failed: 0 }), true);
  assert.equal(lineAsReported(3, null), false, 'no line without the field');
});
