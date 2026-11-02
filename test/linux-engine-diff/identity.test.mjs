// M4's T5: the identity cases' expectations, bindings and judge (scripts/linux-engine-diff/identity.mjs), display-free.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEVIATIONS, declaredDeviation } from '../../scripts/linux-engine-diff/deviations.mjs';
import { IDENTITY_OPS, IDENTITY_SCENE_OPS, arranged, duplicatesSentence, expectedRead, identityAuditKind, judgeIdentity, keyRecord, ownState, parseKeys, targetOf } from '../../scripts/linux-engine-diff/identity.mjs';
import { OPS, SCENE_OPS } from '../../scripts/linux-engine-diff/ops.mjs';
import { planOps } from '../../scripts/linux-engine-diff/run.mjs';

const windows = [
  { id: 101, marker: 'cua171-diff-r-n-identity-chrome-cua-1' },
  { id: 102, marker: 'cua171-diff-r-n-identity-chrome-cua-2' },
  { id: 103, marker: 'cua171-diff-r-n-identity-chrome-cua-3' },
];
const scene = (toolkit) => ({ kind: 'identity', toolkit, id: 101, windows, size: [600, 380] });
const sceneNameOf = { chrome: 'identity', gtk3: 'identity-gtk3', gtk4: 'identity-gtk4', kate: 'identity-kate' };
const ctxFor = (toolkit, i) => ({ scene: scene(toolkit), sceneName: sceneNameOf[toolkit], i, arranged: { how: 'stacked', origins_ok: true } });

/** A state read of a window whose page shows `marker`. */
const state = (id, marker, source = 'at_spi') => ({
  ok: true,
  output: {
    window: { id },
    ax_tree_source: source,
    ax_tree: { role: 'frame', name: 'cua171 - Google Chrome', children: [{ role: 'heading', name: `marker ${marker}`, children: [] }] },
    screenshots: [],
  },
});
const refused = (id) => ({ ok: false, error: duplicatesSentence(id) });

test('what each read must answer: its own tree where position or the active state tells it apart, else the sentence', () => {
  for (const toolkit of ['chrome', 'gtk3']) assert.equal(expectedRead(toolkit, 'apart'), 'own', `${toolkit} placed apart`);
  assert.equal(expectedRead('gtk4', 'apart'), 'sentence', "GTK 4's window-relative extents: never told apart");
  for (const toolkit of ['chrome', 'gtk3', 'gtk4']) {
    assert.equal(expectedRead(toolkit, 'stacked'), 'sentence', `${toolkit} stacked, a separate window active`);
    assert.equal(expectedRead(toolkit, 'stacked-other'), 'sentence', `${toolkit} stacked, another duplicate active`);
  }
  assert.equal(expectedRead('gtk3', 'stacked-self'), 'own', "GTK 3 marks the active window's frame");
  assert.equal(expectedRead('chrome', 'stacked-self'), 'sentence', 'Chrome marks no frame active (measured)');
  assert.equal(expectedRead('gtk4', 'stacked-self'), 'sentence');
});

test("a read is the window's own only with its id, through the bus, its marker and no other window's", () => {
  const others = windows.slice(1);
  assert.equal(ownState(state(101, windows[0].marker).output, windows[0], others), true);
  assert.equal(ownState(state(102, windows[0].marker).output, windows[0], others), false, 'another window id');
  assert.equal(ownState(state(101, windows[1].marker).output, windows[0], others), false, "another window's tree: the wrong association");
  assert.equal(ownState(state(101, windows[0].marker, 'x11').output, windows[0], others), false, 'the X11 fallback');
  const both = state(101, windows[0].marker).output;
  both.ax_tree.children.push({ role: 'heading', name: `marker ${windows[1].marker}`, children: [] });
  assert.equal(ownState(both, windows[0], others), false, "a tree showing another window's marker too");
  const bare = { window: { id: 101 }, ax_tree_source: 'at_spi', ax_tree: { role: 'frame', name: `marker ${windows[0].marker}`, children: [] } };
  assert.equal(ownState(bare, windows[0], others), false, 'one node');
});

test('the samples go to the windows in turn, so a block reads each', () => {
  const seen = [0, 1, 2, 3].map((i) => targetOf({ scene: scene('chrome'), i }).id);
  assert.deepEqual(seen, [101, 102, 103, 101]);
  assert.equal(targetOf({ scene: scene('chrome'), i: 0 }, 1).id, 102, 'another of the duplicates');
});

test('an arrangement reads back: stacked when every origin is one, apart when each is its own', () => {
  assert.equal(arranged([[0, 0], [0, 0], [0, 0]], 'stacked'), true);
  assert.equal(arranged([[0, 0], [640, 0], [0, 0]], 'stacked'), false);
  assert.equal(arranged([[0, 0], [640, 0], [0, 400]], 'apart'), true);
  assert.equal(arranged([[0, 0], [640, 0], [0, 0]], 'apart'), false);
});

test("the identity page's key line", () => {
  const read = (line) => keyRecord({ ax_tree: { role: 'frame', children: [{ role: 'paragraph', name: line, children: [] }] } });
  assert.deepEqual(read('held none ups 0'), { held: [], ups: 0 });
  assert.deepEqual(read('held Shift ups 2'), { held: ['Shift'], ups: 2 });
  assert.deepEqual(read('held Control,Shift ups 1'), { held: ['Control', 'Shift'], ups: 1 });
  assert.equal(read('nothing here'), null);
  assert.deepEqual(parseKeys('held Shift ups 7'), { held: ['Shift'], ups: 7 }, 'the line as the harness reads it off the bus');
  assert.equal(parseKeys('held Shift'), null);
});

test("a case's check binds its answer to the window it read, and to the scene's declaration", () => {
  const apart = IDENTITY_OPS.identity_apart.check(ctxFor('chrome', 1), state(102, windows[1].marker));
  assert.equal(apart.target, 102);
  assert.equal(apart.answer_ok, true);
  assert.equal(apart.declared, true);
  const wrong = IDENTITY_OPS.identity_apart.check(ctxFor('chrome', 1), state(102, windows[0].marker));
  assert.equal(wrong.answer_ok, false, "the first window's tree for the second");
  const fallback = IDENTITY_OPS.identity_apart.check(ctxFor('chrome', 0), state(101, windows[0].marker, 'x11'));
  assert.equal(fallback.answer_ok, false);
  assert.equal(fallback.declared, false, "the vendor's one-node X11 tree is not cua's declared answer");
  const stacked = IDENTITY_OPS.identity_stacked.check(ctxFor('chrome', 2), refused(103));
  assert.equal(stacked.answer_ok, true);
  assert.equal(stacked.expected_error, duplicatesSentence(103));
  assert.equal(stacked.declared, true);
  assert.equal(IDENTITY_OPS.identity_stacked.check(ctxFor('chrome', 2), refused(101)).answer_ok, false, "another window's sentence");
  // GTK 3's active window, stacked: its own tree is required, so an engine without the active-state tie-break fails
  assert.equal(IDENTITY_OPS.identity_stacked_self_active.check(ctxFor('gtk3', 0), state(101, windows[0].marker)).answer_ok, true);
  assert.equal(IDENTITY_OPS.identity_stacked_self_active.check(ctxFor('gtk3', 0), refused(101)).answer_ok, false, 'no tie-break: the sentence');
  // Chrome's active window, stacked: Chrome marks no frame active, so the sentence, and a tree would be a guess
  assert.equal(IDENTITY_OPS.identity_stacked_self_active.check(ctxFor('chrome', 0), refused(101)).answer_ok, true);
  assert.equal(IDENTITY_OPS.identity_stacked_self_active.check(ctxFor('chrome', 0), state(101, windows[0].marker)).answer_ok, false);
  // a refusal of input: no declaration of reads, the sentence for its own window
  const click = IDENTITY_OPS.identity_click_element.check(ctxFor('chrome', 1), refused(102));
  assert.equal(click.answer_ok, true);
  assert.equal('declared' in click, false);
});

/** A judged row: a sample that answered as its check says. */
const row = (fields) => ({ engine: 'cua', block: 0, i: 0, ok: false, witness: true, arranged: { how: 'stacked', origins_ok: true }, ...fields });
const cleanAudit = (answered, kind = 'background') => ({ clean: true, kind, answered, forbidden: [] });

test('the reads pass only when every sample answered as expected, declared, on more than one window, witnessed clean', () => {
  const rows = [101, 102, 103].map((target, i) => row({ i, target, answer_ok: true, declared: true, ok: false, error: duplicatesSentence(target), expected_error: duplicatesSentence(target) }));
  const audit = cleanAudit(rows.slice(0, 2).map((r) => ({ ok: false, error: r.error, expected_error: r.expected_error })));
  assert.deepEqual(judgeIdentity('identity_stacked', rows, audit), { pass: true, reasons: [] });
  const fails = (changed, why) => assert.equal(judgeIdentity('identity_stacked', changed, audit).pass, false, why);
  fails([{ ...rows[0], answer_ok: false }, ...rows.slice(1)], 'a sample not as expected (the engine without the tie-break, or the wrong tree)');
  fails([{ ...rows[0], declared: false }, ...rows.slice(1)], 'an undeclared answer');
  fails(rows.map((r) => ({ ...r, target: 101 })), 'one window read');
  fails([{ ...rows[0], witness: false }, ...rows.slice(1)], 'the witness changed');
  fails([{ ...rows[0], arranged: { how: 'stacked', origins_ok: false } }, ...rows.slice(1)], 'the windows were not stacked');
  assert.equal(judgeIdentity('identity_stacked', rows, { ...audit, clean: false, forbidden: ['SetInputFocus'] }).pass, false, 'a dirty audit');
  assert.equal(judgeIdentity('identity_stacked', rows, cleanAudit([{ ok: true, error: null, expected_error: duplicatesSentence(101) }])).pass, false, "an audited request that did not answer the sentence");
  assert.equal(judgeIdentity('identity_stacked', rows, null).pass, false, 'no audit');
  assert.equal(judgeIdentity('identity_stacked', [], audit).pass, false, 'no samples');
});

test("kate's reads arrange nothing: their own trees, declared, on both windows", () => {
  const rows = [101, 102].map((target, i) => row({ i, target, ok: true, answer_ok: true, declared: true, arranged: undefined, expected_error: null }));
  const audit = cleanAudit([{ ok: true, error: null, expected_error: null }]);
  assert.deepEqual(judgeIdentity('identity_kate', rows, audit), { pass: true, reasons: [] });
  assert.equal(judgeIdentity('identity_kate', [{ ...rows[0], answer_ok: false }, rows[1]], audit).pass, false, "the other window's document");
  assert.equal(judgeIdentity('identity_stacked', rows.map((r) => ({ ...r, error: duplicatesSentence(r.target), expected_error: duplicatesSentence(r.target), ok: false })), cleanAudit([{ ok: false, error: duplicatesSentence(101), expected_error: duplicatesSentence(101) }])).pass, false, 'a case that arranges needs its arrangement');
});

test('a refused request passes only with the duplicates sentence for its window and an audit that found nothing sent', () => {
  const rows = [101, 102].map((target, i) => row({ i, target, answer_ok: true, error: duplicatesSentence(target), expected_error: duplicatesSentence(target) }));
  const audit = cleanAudit(rows.map((r) => ({ ok: false, error: r.error, expected_error: r.expected_error })), 'nothing-sent');
  assert.equal(judgeIdentity('identity_type_text', rows, audit).pass, true);
  assert.equal(judgeIdentity('identity_type_text', [{ ...rows[0], error: 'requested field or selection changed before dispatch; nothing was sent' }, rows[1]], audit).pass, false);
  assert.equal(judgeIdentity('identity_type_text', rows, { ...audit, clean: false, forbidden: ['SendEvent'] }).pass, false, 'something was sent');
  assert.equal(identityAuditKind('identity_type_text'), 'nothing-sent');
  assert.equal(identityAuditKind('identity_click_element'), 'nothing-sent');
  assert.equal(identityAuditKind('identity_apart'), 'background');
  assert.equal(identityAuditKind('identity_key_up'), 'background');
});

test('the release passes only with the hold proven, the windows stacked for it, and the key up again after', () => {
  const good = row({ ok: true, answer_ok: true, target: 101, keys_held: { held: ['Shift'], ups: 3 }, keys_after: { held: [], ups: 4 } });
  const audit = cleanAudit([{ ok: true, error: null, expected_error: null }]);
  assert.equal(judgeIdentity('identity_key_up', [good], audit).pass, true);
  const fails = (changed, why) => assert.equal(judgeIdentity('identity_key_up', [{ ...good, ...changed }], audit).pass, false, why);
  fails({ ok: false, error: duplicatesSentence(101) }, 'the release refused');
  fails({ keys_held: { held: [], ups: 3 } }, 'no hold proven');
  fails({ keys_after: { held: ['Shift'], ups: 3 } }, 'still held');
  fails({ keys_after: { held: [], ups: 3 } }, 'no new key up');
  fails({ arranged: { how: 'apart', origins_ok: true } }, 'the windows were apart: no duplicate');
});

test('the identity scenes run cua alone, and every case is planned on its scene', () => {
  for (const [sceneName, ops] of Object.entries(IDENTITY_SCENE_OPS)) {
    assert.deepEqual(SCENE_OPS[sceneName], ops);
    for (const op of ops) {
      assert.ok(op in IDENTITY_OPS, op);
      assert.equal(OPS[op].cuaOnly, true, `${op}: cua alone`);
      assert.equal(OPS[op].kind, 'input', `${op}: on the engine's own windows`);
    }
  }
  const plan = planOps(['identity', 'identity-gtk3', 'identity-gtk4', 'identity-kate'], 'all').filter((p) => p.scene !== 'desktop');
  assert.equal(plan.length, Object.values(IDENTITY_SCENE_OPS).flat().length);
});

test("the identity answers are declared against the vendor's X11 tree, on their scenes only", () => {
  const read = (scene, candidate) => declaredDeviation({ op: 'get_window_state', scene, field: 'identity', candidate });
  for (const scene of ['identity', 'identity-gtk3', 'identity-gtk4']) {
    assert.ok(read(scene, state(101, windows[0].marker)), `${scene}: a tree read through the bus`);
    assert.ok(read(scene, refused(101)), `${scene}: the sentence`);
    assert.equal(read(scene, state(101, windows[0].marker, 'x11')), null, `${scene}: the X11 fallback is the vendor's, not declared`);
    assert.equal(read(scene, { ok: false, error: 'window identity changed while resolving X11 window 101; retry the operation' }), null);
  }
  assert.ok(read('identity-kate', state(101, 'x')));
  assert.equal(read('identity-kate', refused(101)), null, "kate's windows are not duplicates");
  assert.equal(read('gedit', refused(101)), null, 'no other scene');
  assert.equal(DEVIATIONS.filter((d) => d.field === 'identity').length, 4);
});
