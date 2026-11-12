import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEVIATIONS, declaredDeviation, fixtureTruncationMismatch, lineAsReported, setAsideTruncation, truncationMismatch } from '../../scripts/linux-engine-diff/deviations.mjs';

test('every declared deviation names its operation, field, reason and the spec section', () => {
  assert.ok(DEVIATIONS.length >= 6);
  for (const d of DEVIATIONS) {
    // the truncated declaration names no operation: it covers every read that was cut; nor does the pending refusal,
    // which answers whatever acts first after the drag that left it
    if (d.field !== 'truncated' && !(d.field === 'error' && d.answer({ ok: false, error: PENDING }))) assert.equal(typeof d.op, 'string');
    assert.equal(typeof d.field, 'string');
    assert.ok(d.reason.length > 10, d.op);
    assert.match(d.section, /Decision Log|Design|Plan of Work/);
  }
});

const PENDING =
  'Pending from your last drag, an unconfirmed drop: your drag into Google-chrome began a drag and drop, and Google-chrome did not confirm a drop after the release, so the drop may not have landed as the drag answered; this click request was not run, so read the window before sending it again';

test("the refusal of the request after a drag that left something pending is declared, by its own sentence, for whatever acts (M4's T14)", () => {
  for (const op of ['click', 'drag', 'press_key', 'preflight']) {
    const error = PENDING.replace('this click request', `this ${op} request`);
    assert.ok(declaredDeviation({ op, scene: 'device-chrome-dnd', field: 'error', candidate: { ok: false, error } }), op);
  }
  for (const cause of [
    'a late drag and drop: Google-chrome started a drag and drop after your drag into it ended, so the drag did not end as it answered; it may have dropped and changed the desktop',
    'a failed watch: the drag-and-drop watch after your drag into Google-chrome failed (no reply), so a drop may have happened unseen and changed the desktop',
    // a handle the engine released for its idle bound (M4's T17 fix wave)
    'a drag handle released by timeout: your drag handle in XTerm got no request for 30 s, so it was released where the pointer was, at (250, 200); the release may have dropped what it held and changed the desktop',
  ])
    assert.ok(declaredDeviation({ op: 'click', field: 'error', candidate: { ok: false, error: `Pending from your last drag, ${cause}; this click request was not run, so read the window before sending it again` } }), cause);
  assert.equal(declaredDeviation({ op: 'click', field: 'error', candidate: { ok: false, error: 'Pending from your last drag, something else; this click request was not run, so read the window before sending it again' } }), null, 'another cause');
  assert.equal(declaredDeviation({ op: 'click', field: 'error', candidate: { ok: true, output: null } }), null, 'a success is not the refusal');
  assert.equal(declaredDeviation({ op: 'click', field: 'output', candidate: { ok: false, error: PENDING } }), null, 'the error field alone');
});

test("drag_handle's lifecycle answers are declared by their own sentences, each on its own requests (M4's T17)", () => {
  const error = (e) => ({ ok: false, error: e });
  const held = 'a drag handle is held; end it before sending desktop pointer input (a handle that gets no request for 30 s is released where it is)';
  for (const op of ['click', 'move', 'scroll', 'drag', 'move_relative', 'drag_handle']) assert.ok(declaredDeviation({ op, field: 'error', candidate: error(held) }), op);
  assert.equal(declaredDeviation({ op: 'click', field: 'error', candidate: error('a drag handle is held; end it before sending desktop pointer input') }), null, 'the sentence names the idle bound');
  assert.equal(declaredDeviation({ op: 'press_key', field: 'error', candidate: error(held) }), null, 'keys run while a handle is held');
  const elsewhere = 'another application holds the pointer (an open menu, or a drag in progress); nothing was pressed. Close it or wait, then start the handle again';
  assert.ok(declaredDeviation({ op: 'drag_handle', field: 'error', candidate: error(elsewhere) }));
  const cut = 'Google-chrome may not have received your drag: another application took the pointer while the handle was held. Read the window to see what happened before dragging again';
  assert.ok(declaredDeviation({ op: 'drag_handle', field: 'error', candidate: error(cut) }));
  const failed = 'the pointer watch on your drag handle into Google-chrome failed (lost), so whether Google-chrome received the drag cannot be told. Read the window to see what happened before dragging again';
  assert.ok(declaredDeviation({ op: 'drag_handle', field: 'error', candidate: error(failed) }));
  for (const at of ['at (10, 20)', 'on another screen']) {
    const moved = `Electron may not have received your drag where you asked: the desktop pointer was moved while the handle was held, so it was released ${at} instead of at (300, 260). Read the window to see what happened before dragging again`;
    assert.ok(declaredDeviation({ op: 'drag_handle', field: 'error', candidate: error(moved) }), at);
  }
  // a move or an end of a handle the idle bound released (the whole-branch review of M4)
  for (const at of ['at (250, 200)', 'on another screen']) {
    const expired = `your drag handle in XTerm is no longer held: it got no request for 0.3 s, so it was released where the pointer was, ${at}; this drag_handle request was not run. Start a new handle to drag again`;
    assert.ok(declaredDeviation({ op: 'drag_handle', field: 'error', candidate: error(expired) }), at);
    assert.equal(declaredDeviation({ op: 'drag', field: 'error', candidate: error(expired) }), null, "a drag's error is not a handle's");
  }
  for (const sentence of [elsewhere, cut, failed]) assert.equal(declaredDeviation({ op: 'drag', field: 'error', candidate: error(sentence) }), null, `a drag's error is not a handle's: ${sentence.slice(0, 30)}`);
  assert.equal(declaredDeviation({ op: 'drag_handle', field: 'error', candidate: error('Google-chrome may not have received your drag: something else') }), null, 'another sentence');
  assert.equal(declaredDeviation({ op: 'drag_handle', field: 'answer', candidate: error(cut) }), null, 'the error field alone');
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

// A `--stats` line's tree record as the engine writes it beside a get_window_state (engine.rs): the source the answer
// took and the read's cut points, zeros included, among the read's other counts.
const record = (truncated, source = 'at_spi') => ({ tree: { source, admitted: 1, discovered: 1, truncated } });
const NONE = { nodes: 0, depth: 0, failed: 0 };
const published = (scene, state, stats) => truncationMismatch({ scene, state, stats });

test("a read's truncated is the engine's own record of its cut points: the re-review's four counterexamples", () => {
  // (a) a depth-only cut keeping a 64-node chain that ends at depth 63: the record's cut requires the field
  const depthOnly = { nodes: 0, depth: 2, failed: 0 };
  assert.match(published('calc', tree(64, 63), record(depthOnly)), /record has cut points .* and the answer no truncated/);
  assert.equal(published('calc', tree(64, 63, { truncated: depthOnly }), record(depthOnly)), null);
  assert.match(published('calc', tree(64, 63, { truncated: { nodes: 0, depth: 1, failed: 0 } }), record(depthOnly)), /differs from the record/);
  // the same chain whose node at depth 63 has nothing below it: no cut, no field
  assert.equal(published('calc', tree(64, 63), record(NONE)), null);
  // (b) an element-limited read keeping 4,999 nodes, one of its 5,000 admissions failed GetRoleName
  const elementAndFailed = { nodes: 1001, depth: 0, failed: 1 };
  assert.match(published('calc', tree(4999, 3), record(elementAndFailed)), /the answer no truncated/);
  assert.equal(published('calc', tree(4999, 3, { truncated: elementAndFailed }), record(elementAndFailed)), null);
  assert.match(published('calc', tree(4999, 3, { truncated: { nodes: 1001, depth: 0, failed: 0 } }), record(elementAndFailed)), /differs from the record/);
  // (c) an uncut tree carrying an invented count
  assert.match(published('gedit', tree(498, 12, { truncated: { nodes: 0, depth: 0, failed: 1 } }), record(NONE)), /where the record has no cut point/);
  assert.equal(published('gedit', tree(498, 12), record(NONE)), null);
  // (d) a complete, uncut tree of exactly 5,000 nodes: no false red
  assert.equal(published('calc', tree(5000, 3), record(NONE)), null);
  assert.match(published('calc', tree(5000, 3, { truncated: { nodes: 1, depth: 0, failed: 0 } }), record(NONE)), /no cut point/);
});

test('a read with no record of its cut points fails: missing, unparseable or malformed stats are not "nothing cut"', () => {
  const gedit = tree(498, 12);
  assert.match(published('gedit', gedit, undefined), /no --stats line/);
  assert.match(published('gedit', gedit, null), /no --stats line/);
  assert.match(published('gedit', gedit, {}), /no tree record/);
  // the released 0.3.0 engine's record: the read's counts, but no cut points
  assert.match(published('gedit', gedit, { tree: { source: 'at_spi', admitted: 498, discovered: 498 } }), /malformed/);
  for (const truncated of [{ nodes: 0, depth: 0 }, { ...NONE, more: 0 }, { ...NONE, failed: '0' }, { ...NONE, nodes: -1 }, { ...NONE, depth: 2 ** 32 }, { ...NONE, depth: 0.5 }, null, [0, 0, 0]]) {
    assert.match(published('gedit', gedit, record(truncated)), /malformed/, JSON.stringify(truncated));
  }
  assert.match(published('gedit', gedit, { tree: { truncated: NONE } }), /malformed/, 'no source');
  assert.match(published('gedit', gedit, { tree: 'at_spi' }), /malformed/);
  // the record names the source of the answer it came with
  assert.match(published('gedit', gedit, record(NONE, 'x11')), /source x11 where the answer has at_spi/);
});

test('the X11 fallback publishes nothing, whatever its record counts: no accessibility read made that tree', () => {
  // a root whose GetRoleName fails gives the fallback, and the record counts that failure
  const fallback = tree(1, 0, { source: 'x11' });
  assert.equal(published('gedit', fallback, record({ nodes: 0, depth: 0, failed: 1 }, 'x11')), null);
  assert.equal(published('gedit', fallback, record(NONE, 'x11')), null);
  assert.match(published('gedit', tree(1, 0, { source: 'x11', truncated: { nodes: 0, depth: 0, failed: 1 } }), record({ nodes: 0, depth: 0, failed: 1 }, 'x11')), /no cut point/);
});

test("the harness's over-budget page is built with both causes: its record and its field must count both", () => {
  const read = (truncated) => published('over-budget', tree(5000, 63, { truncated }), record(truncated ?? NONE));
  assert.equal(read({ nodes: 1263, depth: 2, failed: 0 }), null);
  assert.match(read({ nodes: 1263, depth: 0, failed: 0 }), /built to be cut/, 'the depth cut missing');
  assert.match(read({ nodes: 0, depth: 2, failed: 0 }), /built to be cut/, 'the element cut missing');
  assert.match(read(undefined), /built to be cut/, 'an engine that records no cut there');
  // another scene cut by one cause is as recorded
  assert.equal(published('calc', tree(5000, 63, { truncated: { nodes: 1263, depth: 0, failed: 0 } }), record({ nodes: 1263, depth: 0, failed: 0 })), null);
});

test('with no record (the two-services path), the fixtures decide: over-budget is cut by both causes, the other pages are well below the limits', () => {
  const fixture = (scene, state, whole) => fixtureTruncationMismatch({ scene, state, whole });
  const CUT = { nodes: 1263, depth: 2, failed: 0 };
  const whole = tree(5000, 63, { truncated: CUT });
  assert.equal(fixture('over-budget', whole), null);
  assert.match(fixture('over-budget', tree(5000, 63)), /built to be cut/, 'the released 0.3.0 engine reports nothing');
  assert.match(fixture('over-budget', tree(5000, 63, { truncated: { nodes: 1263, depth: 0, failed: 0 } })), /built to be cut/);
  // a read filtered by a query: the engine filters after its read, so the cut is the whole read's
  const filtered = (truncated) => tree(3, 1, { truncated });
  assert.equal(fixture('over-budget', filtered(CUT), whole), null);
  assert.match(fixture('over-budget', filtered(undefined), whole), /built to be cut/, 'an over-budget query missing its field');
  assert.match(fixture('over-budget', filtered({ nodes: 2 ** 32, depth: 2, failed: 0 }), whole), /built to be cut/, 'a malformed count');
  // the other pages: no field, and a whole read well below both limits, so neither limit can have cut it
  const gedit = tree(498, 12);
  assert.equal(fixture('gedit', gedit), null);
  assert.equal(fixture('chrome', tree(243, 9)), null);
  assert.match(fixture('gedit', tree(498, 12, { truncated: { nodes: 0, depth: 0, failed: 1 } })), /not built to be cut/);
  assert.match(fixture('chrome', tree(4000, 9)), /well below/, 'a read near the element limit cannot be judged without a record');
  assert.match(fixture('chrome', tree(5000, 9)), /well below/);
  assert.match(fixture('chrome', tree(200, 40)), /well below/, 'a read near the depth limit');
  assert.equal(fixture('gedit', filtered(undefined), gedit), null);
  assert.match(fixture('gedit', filtered({ nodes: 1, depth: 0, failed: 0 }), gedit), /not built to be cut/);
  assert.match(fixture('chrome', filtered(undefined), tree(5000, 9)), /well below/, "a query is judged with its window's whole read");
});

test("the rendered line agrees with the read's truncated: its count the sum, and no line for a read that cut nothing", () => {
  assert.equal(lineAsReported(4202, { nodes: 4200, depth: 2, failed: 0 }), true);
  assert.equal(lineAsReported(4200, { nodes: 4200, depth: 2, failed: 0 }), false);
  assert.equal(lineAsReported(null, { nodes: 4200, depth: 2, failed: 0 }), false, 'a read that cut must show the line');
  assert.equal(lineAsReported(null, null), true);
  assert.equal(lineAsReported(null, { nodes: 0, depth: 0, failed: 0 }), true);
  assert.equal(lineAsReported(3, null), false, 'no line without the field');
});
