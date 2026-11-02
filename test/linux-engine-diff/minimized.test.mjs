// M4's T4: the minimized cases' judge and checks, and the minimized listing's deviation, display-free.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEVIATIONS, setAsideMinimized } from '../../scripts/linux-engine-diff/deviations.mjs';
import { DEVICE_OPS, DEVICE_SCENE_OPS, judgeDevice } from '../../scripts/linux-engine-diff/device.mjs';
import {
  MINIMIZED_OPS,
  MINIMIZED_SCENE_OPS,
  foreignActive,
  isMinimized,
  judgeMinimized,
  listedAsMinimized,
  minimizedAuditKind,
  minimizedSentence,
  minimizedState,
  restoredState,
} from '../../scripts/linux-engine-diff/minimized.mjs';
import { OPS, SCENE_OPS } from '../../scripts/linux-engine-diff/ops.mjs';

const ID = 4194311;
const window = (id, extra = {}) => ({ app: 'org.gnome.gedit', focused: false, height: 756, id, modal: false, title: `w${id}`, width: 910, x: 0, y: 0, ...extra });
const tree = { role: 'frame', name: 'w', children: [{ role: 'text', name: '' }] };

test('the minimized scenes run every case once, cua alone, through the device cases and the scene list', () => {
  const ops = Object.values(MINIMIZED_SCENE_OPS).flat();
  assert.deepEqual(new Set(ops), new Set(Object.keys(MINIMIZED_OPS)), 'every case is on a scene, once');
  for (const op of ops) {
    assert.equal(DEVICE_OPS[op], MINIMIZED_OPS[op]);
    assert.equal(OPS[op].cuaOnly, true, op);
    assert.equal(typeof OPS[op].restore, 'function', `${op} restores its window`);
  }
  assert.deepEqual(SCENE_OPS.minimized, MINIMIZED_SCENE_OPS.minimized);
  assert.deepEqual(DEVICE_SCENE_OPS['minimized-xterm'], MINIMIZED_SCENE_OPS['minimized-xterm']);
  // every window-targeted input of the wire is refused on the minimized window (engine.rs input_window)
  const refused = new Set(ops.filter((op) => MINIMIZED_OPS[op].device === 'minimized').map((op) => MINIMIZED_OPS[op].request({ scene: { id: ID }, element: { id: '7', action: 'click' } })[0]));
  for (const command of ['press_key', 'key_down', 'click', 'move', 'scroll', 'drag', 'perform_secondary_action', 'type_text', 'type_characters', 'clipboard_read', 'clipboard_write']) {
    assert.ok(refused.has(command), `${command} has a refusal case`);
  }
});

test('the audit kinds: nothing sent for a refusal, the target alone for an activation, the hold counted for a foreground release', () => {
  assert.equal(minimizedAuditKind('minimized_press_key'), 'nothing-sent');
  assert.equal(minimizedAuditKind('minimized_xterm_key_dedicated'), 'nothing-sent');
  assert.equal(minimizedAuditKind('minimized_tree'), 'background');
  assert.equal(minimizedAuditKind('minimized_key_up_background'), 'background');
  assert.equal(minimizedAuditKind('minimized_xterm_key_up_foreground'), 'held-release');
  assert.equal(minimizedAuditKind('minimized_activate'), 'foreground');
  assert.equal(minimizedAuditKind('minimized_activate_withdrawn'), 'foreground');
});

test('the listing check needs this window minimized and no other window with the field; restored, no field at all', () => {
  assert.equal(listedAsMinimized([window(ID, { minimized: true }), window(2)], ID), true);
  assert.equal(listedAsMinimized([window(ID), window(2)], ID), false, 'the field missing');
  assert.equal(listedAsMinimized([window(2)], ID), false, 'not listed');
  assert.equal(listedAsMinimized([window(ID, { minimized: true }), window(2, { minimized: true })], ID), false, 'an engine that marks every window');
  assert.equal(listedAsMinimized([window(ID, { minimized: false }), window(2)], ID, false), false, 'restored: no field, not false');
  assert.equal(listedAsMinimized([window(ID), window(2)], ID, false), true);
});

test('a minimized read: an accessibility tree and no screenshot; restored: one screenshot and no field', () => {
  const state = { ax_tree: tree, ax_tree_source: 'at_spi', screenshots: [], window: window(ID, { minimized: true }) };
  assert.equal(minimizedState(state), true);
  assert.equal(minimizedState({ ...state, ax_tree_source: 'x11' }), false, 'the X11 fallback is no read');
  assert.equal(minimizedState({ ...state, ax_tree: { role: 'frame', name: 'w' } }), false, 'one node');
  assert.equal(minimizedState({ ...state, screenshots: [{ filepath: '/x.jpg' }] }), false, 'a screenshot of a minimized window');
  assert.equal(minimizedState({ ...state, window: window(ID) }), false, 'the field missing');
  const restored = { ax_tree: tree, ax_tree_source: 'at_spi', screenshots: [{ filepath: '/x.jpg' }], window: window(ID) };
  assert.equal(restoredState(restored), true);
  assert.equal(restoredState({ ...restored, screenshots: [] }), false, 'an engine that answers no screenshot for every window');
  assert.equal(restoredState({ ...restored, window: window(ID, { minimized: true }) }), false);
});

test("the person's windows: after a minimize, only none or a harness window may be active", () => {
  assert.equal(foreignActive(0, [5, 6]), false);
  assert.equal(foreignActive(5, [5, 6]), false);
  assert.equal(foreignActive(0x600002, [5, 6]), true);
  assert.equal(isMinimized({ state: 'Iconic', viewable: false }), true);
  assert.equal(isMinimized({ state: 'Iconic', viewable: true }), false);
  assert.equal(isMinimized({ state: 'Normal', viewable: false }), false);
});

const refusal = (extra = {}) => ({ block: 0, i: 0, ok: false, error: minimizedSentence(ID), expected_error: minimizedSentence(ID), unchanged: true, witness: true, ...extra });
const nothingSent = (answered) => ({ clean: true, kind: 'nothing-sent', answered });

test('a refusal passes only with the sentence, nothing changed, the witness clean and a clean audit of refused requests', () => {
  const answered = [{ ok: false, error: minimizedSentence(ID), expected_error: minimizedSentence(ID) }];
  assert.deepEqual(judgeDevice('minimized_press_key', [refusal()], nothingSent(answered)), { pass: true, reasons: [] });
  for (const [what, rows, audit] of [
    ['the device sentence instead', [refusal({ error: 'org.gnome.gedit does not accept background input; use a dedicated desktop or activate the window first' })], nothingSent(answered)],
    ['an engine that sends', [refusal({ ok: true, error: undefined })], nothingSent(answered)],
    ['the window restored by the request', [refusal({ unchanged: false })], nothingSent(answered)],
    ['the witness', [refusal({ witness: false })], nothingSent(answered)],
    ['a dirty audit', [refusal()], { ...nothingSent(answered), clean: false, forbidden: ['SendEvent'] }],
    ['an audit of requests that ran', [refusal()], nothingSent([{ ok: true, error: null }])],
    ['no audit', [refusal()], null],
    ['no samples', [], nothingSent(answered)],
  ]) {
    assert.equal(judgeDevice('minimized_press_key', rows, audit).pass, false, what);
  }
});

test('reads, releases and activations are judged by their own facts', () => {
  const ok = (extra) => ({ block: 0, i: 0, ok: true, witness: true, ...extra });
  const audit = (kind) => ({ clean: true, kind, answered: [{ ok: true }] });
  assert.equal(judgeMinimized('minimized_tree', [ok({ answer_ok: true })], audit('background')).pass, true);
  assert.equal(judgeMinimized('minimized_tree', [ok({ answer_ok: false })], audit('background')).pass, false);
  assert.equal(judgeMinimized('minimized_key_up_background', [ok({ still_minimized: true, keys_down: [] })], audit('background')).pass, true);
  assert.equal(judgeMinimized('minimized_key_up_background', [ok({ still_minimized: false, keys_down: [] })], audit('background')).pass, false, 'the release restored the window');
  assert.equal(judgeMinimized('minimized_xterm_key_up_foreground', [ok({ still_minimized: true, keys_down: [50] })], audit('held-release')).pass, false, 'a key still held');
  assert.equal(judgeMinimized('minimized_xterm_key_up_foreground', [ok({ still_minimized: true, keys_down: [] })], { ...audit('held-release'), clean: false, forbidden: ['SetInputFocus: 2 activations for 1 hold'] }).pass, false, 'the release activated it');
  // an activation changes the desktop: its witness is not judged, its result is
  assert.equal(judgeMinimized('minimized_activate', [ok({ witness: false, restored: true, active: true })], audit('foreground')).pass, true);
  assert.equal(judgeMinimized('minimized_activate', [{ block: 0, i: 0, ok: false, error: 'failed to focus X11 window 1: Match', restored: true, active: true }], audit('foreground')).pass, false, 'the false error');
  // the control of its wait: the first error, at the bound, the window still unmapped
  const unmapped = (extra) => ({ block: 0, i: 0, ok: false, error: `failed to focus X11 window ${ID}: X11 error X11Error { error_kind: Match }`, expected_error_start: `failed to focus X11 window ${ID}: `, request_ms: 1003, still: { viewable: false }, ...extra });
  const refusedAudit = { clean: true, kind: 'foreground', answered: [{ ok: false, error: 'x' }] };
  assert.equal(judgeMinimized('minimized_activate_withdrawn', [unmapped()], refusedAudit).pass, true);
  assert.equal(judgeMinimized('minimized_activate_withdrawn', [unmapped({ request_ms: 12 })], refusedAudit).pass, false, 'no wait');
  assert.equal(judgeMinimized('minimized_activate_withdrawn', [unmapped({ ok: true, error: undefined })], refusedAudit).pass, false);
});

test('the listing deviation sets aside exactly the windows marked minimized, and nothing else', () => {
  const vendor = [window(1), window(2)];
  const cua = { ok: true, output: [window(1), window(ID, { minimized: true }), window(2)] };
  const { response, deviation } = setAsideMinimized({ op: 'list_windows', scene: 'desktop', response: cua });
  assert.ok(deviation && DEVIATIONS.includes(deviation));
  assert.deepEqual(response.output, vendor);
  // a malformed field stays in the answer, and so does any other difference
  const odd = { ok: true, output: [window(1), window(ID, { minimized: 'yes' })] };
  assert.equal(setAsideMinimized({ op: 'list_windows', response: odd }).deviation, null);
  assert.equal(setAsideMinimized({ op: 'list_windows', response: { ok: true, output: vendor } }).deviation, null, 'nothing to set aside');
  assert.equal(setAsideMinimized({ op: 'tree', response: cua }).deviation, null, 'only the listings');
  const apps = { ok: true, output: [{ id: 'org.gnome.gedit.desktop', name: 'Text Editor', windows: [window(1), window(ID, { minimized: true })] }] };
  const shown = setAsideMinimized({ op: 'list_apps', response: apps });
  assert.ok(shown.deviation);
  assert.deepEqual(shown.response.output[0].windows, [window(1)]);
  // the activation's success on a minimized window is declared for that scene only
  assert.ok(DEVIATIONS.some((d) => d.op === 'activate_window' && d.scene === 'minimized' && d.answer({ ok: true })));
});
