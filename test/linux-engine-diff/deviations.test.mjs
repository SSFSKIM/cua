import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEVIATIONS, declaredDeviation, lineAsReported, setAsideTruncation, truncationAsDeclared } from '../../scripts/linux-engine-diff/deviations.mjs';

test('every declared deviation names its operation, field, reason and the spec section', () => {
  assert.ok(DEVIATIONS.length >= 6);
  for (const d of DEVIATIONS) {
    // the truncated declaration alone names no operation: it covers every read that was cut
    if (d.field !== 'truncated') assert.equal(typeof d.op, 'string');
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

// A state of `count` nodes whose deepest node sits at depth `deepest` (the root at 0): a chain from the root down to
// `deepest`, the rest leaves under the root. `truncated` beside the tree where given; `source` the tree's source.
const tree = (count, deepest = 1, { truncated, source = 'at_spi' } = {}) => {
  let n = 0;
  const node = () => ({ id: `n${n++}`, children: [] });
  const root = node();
  let tip = root;
  for (let d = 1; d <= deepest; d++) {
    const child = node();
    tip.children.push(child);
    tip = child;
  }
  while (n < count) root.children.push(node());
  return { ax_tree_source: source, ax_tree: root, ...(truncated !== undefined ? { truncated } : {}) };
};
const answer = (state) => ({ ok: true, output: state });
const declared = (op, scene, state) => declaredDeviation({ op, scene, field: 'truncated', candidate: answer(state) });

test("cua's truncated is declared once, for any read and scene whose tree shows the cut (M4 T3)", () => {
  const entries = DEVIATIONS.filter((d) => d.field === 'truncated');
  assert.equal(entries.length, 1, 'one declaration');
  assert.equal(entries[0].op, undefined, 'no operation listed');
  assert.equal(entries[0].scene, undefined, 'no scene listed');
  const atLimit = tree(5000, 63, { truncated: { nodes: 1263, depth: 2, failed: 0 } });
  for (const op of ['tree', 'tree_shot', 'after_resize']) {
    for (const scene of ['over-budget', 'calc', 'gtk-table', 'a-scene-not-yet-written']) assert.ok(declared(op, scene, atLimit), `${op} ${scene}`);
  }
  assert.equal(declaredDeviation({ op: 'tree', scene: 'calc', field: 'output', candidate: answer(atLimit) }), null, 'the field alone');
  assert.equal(declaredDeviation({ op: 'tree', scene: 'calc', field: 'truncated', candidate: { ok: false, error: 'x' } }), null);
});

test('every count of a declared truncated is an unsigned 32-bit integer, and one of them is not 0', () => {
  const at = (truncated, count = 5000) => declared('tree', 'calc', tree(count, 63, { truncated }));
  // each count in turn, beside counts the tree agrees with whatever its value, so only its range decides
  const cases = { nodes: [{ depth: 1, failed: 0 }, 5000], depth: [{ nodes: 1, failed: 0 }, 5000], failed: [{ nodes: 0, depth: 1 }, 700] };
  for (const [key, [rest, count]] of Object.entries(cases)) {
    for (const good of [1, 0xffffffff]) assert.ok(at({ ...rest, [key]: good }, count), `${key} ${good}`);
    for (const bad of [-1, 2 ** 32, 1.5, Number.NaN, '3', null, undefined]) assert.equal(at({ ...rest, [key]: bad }, count), null, `${key} ${String(bad)}`);
  }
  assert.equal(at({ nodes: 0, depth: 0, failed: 0 }), null, 'a read that cut nothing reports no field');
  assert.equal(at({ nodes: 1, depth: 0 }), null, 'a count missing');
  assert.equal(at({ nodes: 1, depth: 0, failed: 0, more: 1 }), null, 'a field the wire does not have');
  assert.equal(at(null), null);
  assert.equal(at([1, 0, 0]), null);
});

test("a declared truncated agrees with the tree it came with: each count a cut that tree's limits show", () => {
  // nodes: the element limit refused a listed node, so 5,000 nodes were admitted, those whose GetRoleName failed among them
  assert.ok(declared('tree', 'calc', tree(5000, 3, { truncated: { nodes: 9, depth: 0, failed: 0 } })));
  assert.ok(declared('tree', 'calc', tree(4998, 3, { truncated: { nodes: 9, depth: 0, failed: 2 } })));
  assert.equal(declared('tree', 'calc', tree(4999, 3, { truncated: { nodes: 9, depth: 0, failed: 0 } })), null, 'under the limit');
  assert.equal(declared('tree', 'gedit', tree(498, 12, { truncated: { nodes: 1, depth: 0, failed: 0 } })), null, 'a whole gedit read');
  // depth: a node at depth 63 had children the depth limit refused
  assert.ok(declared('tree', 'calc', tree(700, 63, { truncated: { nodes: 0, depth: 4, failed: 0 } })));
  assert.equal(declared('tree', 'calc', tree(700, 62, { truncated: { nodes: 0, depth: 4, failed: 0 } })), null, 'no node at depth 63');
  // failed: a dropped node leaves nothing in the tree to see, so the count stands on the engine's word (its fake-bus tests)
  assert.ok(declared('tree', 'chrome', tree(243, 9, { truncated: { nodes: 0, depth: 0, failed: 1 } })));
  // the X11 fallback was read by no accessibility read
  assert.equal(declared('tree', 'calc', tree(5000, 63, { truncated: { nodes: 1, depth: 1, failed: 0 }, source: 'x11' })), null);
});

test('a declared truncated is set aside before the state is compared, and any other stays in it', () => {
  const cut = tree(5000, 63, { truncated: { nodes: 4200, depth: 2, failed: 0 } });
  for (const scene of ['over-budget', 'calc']) {
    const set = setAsideTruncation({ op: 'tree', scene, response: answer(cut) });
    const { truncated, ...rest } = cut;
    assert.deepEqual(set.response, answer(rest), scene);
    assert.equal(set.deviation.field, 'truncated');
  }
  // undeclared: counts the tree does not show, or a malformed count, stay in the state, which then differs
  for (const kept of [tree(498, 12, { truncated: { nodes: 4200, depth: 2, failed: 0 } }), tree(5000, 63, { truncated: { nodes: -1, depth: 2, failed: 0 } })]) {
    const { response, deviation } = setAsideTruncation({ op: 'tree', scene: 'gedit', response: answer(kept) });
    assert.equal(deviation, null);
    assert.deepEqual(response, answer(kept));
  }
  const plain = answer(tree(498, 12));
  assert.deepEqual(setAsideTruncation({ op: 'tree', scene: 'gedit', response: plain }), { response: plain, deviation: null });
  const failed = { ok: false, error: 'x' };
  assert.deepEqual(setAsideTruncation({ op: 'tree', scene: 'over-budget', response: failed }), { response: failed, deviation: null });
});

test('a read carries truncated exactly when its tree was cut: present as declared, absent where nothing shows a cut', () => {
  // whole reads: present as declared, and absent only below the element limit
  assert.equal(truncationAsDeclared({ scene: 'calc', state: tree(5000, 20, { truncated: { nodes: 31, depth: 0, failed: 0 } }) }), true);
  assert.equal(truncationAsDeclared({ scene: 'calc', state: tree(5000, 20) }), false, 'the element limit was reached: the field is required');
  assert.equal(truncationAsDeclared({ scene: 'gedit', state: tree(498, 12) }), true);
  assert.equal(truncationAsDeclared({ scene: 'chrome', state: tree(243, 9) }), true);
  assert.equal(truncationAsDeclared({ scene: 'gedit', state: tree(498, 12, { truncated: { nodes: 0, depth: 0, failed: 0 } }) }), false, 'no all-zero field');
  assert.equal(truncationAsDeclared({ scene: 'gedit', state: tree(498, 12, { truncated: { nodes: 2, depth: 0, failed: 0 } }) }), false, 'a cut the tree does not show');
  assert.equal(truncationAsDeclared({ scene: 'gedit', state: tree(1, 0, { source: 'x11' }) }), true, 'the X11 fallback carries nothing');
  assert.equal(truncationAsDeclared({ scene: 'gedit', state: tree(1, 0, { source: 'x11', truncated: { nodes: 0, depth: 0, failed: 1 } }) }), false);
});

test("the harness's over-budget page is built with both causes: its read must count both", () => {
  const read = (truncated) => truncationAsDeclared({ scene: 'over-budget', state: tree(5000, 63, { truncated }) });
  assert.equal(read({ nodes: 1263, depth: 2, failed: 0 }), true);
  assert.equal(read({ nodes: 1263, depth: 0, failed: 0 }), false, 'the depth cut missing');
  assert.equal(read({ nodes: 0, depth: 2, failed: 0 }), false, 'the element cut missing');
  assert.equal(read(undefined), false, 'the released 0.3.0 engine reports nothing');
  // another scene at the limit with one cause is still as declared
  assert.equal(truncationAsDeclared({ scene: 'calc', state: tree(5000, 63, { truncated: { nodes: 1263, depth: 0, failed: 0 } }) }), true);
});

test("a read filtered by a query carries the field exactly when the window's whole read did", () => {
  const whole = tree(5000, 63, { truncated: { nodes: 1263, depth: 2, failed: 0 } });
  const filtered = (truncated) => tree(3, 1, { truncated });
  assert.equal(truncationAsDeclared({ scene: 'over-budget', state: filtered(whole.truncated), whole }), true);
  assert.equal(truncationAsDeclared({ scene: 'over-budget', state: filtered(undefined), whole }), false, 'an over-budget query missing its field');
  assert.equal(truncationAsDeclared({ scene: 'over-budget', state: filtered({ nodes: 2 ** 32, depth: 2, failed: 0 }), whole }), false, 'a malformed count');
  const gedit = tree(498, 12);
  assert.equal(truncationAsDeclared({ scene: 'gedit', state: filtered(undefined), whole: gedit }), true);
  assert.equal(truncationAsDeclared({ scene: 'gedit', state: filtered({ nodes: 1, depth: 0, failed: 0 }), whole: gedit }), false, 'a field the whole read did not have');
  // the 0.3.0 engine: the whole read at the limit with no field requires one on its query as well
  assert.equal(truncationAsDeclared({ scene: 'calc', state: filtered(undefined), whole: tree(5000, 20) }), false);
});

test("the rendered line agrees with the read's truncated: its count the sum, and no line for a read that cut nothing", () => {
  assert.equal(lineAsReported(4202, { nodes: 4200, depth: 2, failed: 0 }), true);
  assert.equal(lineAsReported(4200, { nodes: 4200, depth: 2, failed: 0 }), false);
  assert.equal(lineAsReported(null, { nodes: 4200, depth: 2, failed: 0 }), false, 'a read that cut must show the line');
  assert.equal(lineAsReported(null, null), true);
  assert.equal(lineAsReported(null, { nodes: 0, depth: 0, failed: 0 }), true);
  assert.equal(lineAsReported(3, null), false, 'no line without the field');
});
