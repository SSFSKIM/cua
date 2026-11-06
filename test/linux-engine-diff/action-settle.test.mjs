// The settle experiment's display-free parts (scripts/linux-engine-diff/action-settle-cells.mjs; M4's T8): the lanes, the
// cells, what counts as each kind's effect, a run's and a series' verdict, and the per-method constants the search
// sittings give.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import {
  CELLS, CONSECUTIVE, FAMILY_SCENES, KIND_METHOD, MAX_RUNS, SCENES, STEPS, cellName, cellsFor, chosenPlan, heldStep, hopeless, landed, laneSettles, lostInput, methodConstants, runPasses, settleVerdict,
} from '../../scripts/linux-engine-diff/action-settle-cells.mjs';
import { SETTLE_MS } from '../../src/services/engine/linux/settle.mjs';

test('the lanes: the shipped constants, or every method at one measured step; the steps start at the 0 ms control and end at the vendor\'s 100', () => {
  assert.deepEqual(STEPS, [0, 10, 25, 50, 75, 100]);
  assert.deepEqual(laneSettles('shipped'), SETTLE_MS);
  assert.deepEqual(laneSettles('settle-25'), Object.fromEntries(Object.keys(SETTLE_MS).map((m) => [m, 25])));
  assert.deepEqual(laneSettles('settle-0').press_key, 0);
  assert.throws(() => laneSettles('settle-30'), /unknown settle lane settle-30; known: shipped, settle-0, settle-10/);
  assert.throws(() => laneSettles('fast'), /unknown settle lane fast/);
});

test('a sitting searches the steps upward unless --lanes names lanes; the lanes come in the experiment\'s order', () => {
  assert.deepEqual(chosenPlan({}), { search: true, lanes: STEPS.map((ms) => `settle-${ms}`) });
  assert.deepEqual(chosenPlan({ lanes: ['shipped'] }), { search: false, lanes: ['shipped'] });
  assert.deepEqual(chosenPlan({ lanes: ['settle-50', 'shipped', 'settle-0'] }), { search: false, lanes: ['shipped', 'settle-0', 'settle-50'] });
  assert.throws(() => chosenPlan({ lanes: ['settle-7'] }), /unknown settle lane settle-7/);
  const a = parseArgs(['--experiment', 'settle', '--cua', '/c', '--out', '/o', '--family', 'gedit,chrome', '--kinds', 'click', '--routes', 'background,desktop', '--load-factor', '2']);
  assert.equal(a.experiment, 'settle');
  assert.deepEqual(a.routes, ['background', 'desktop']);
  assert.throws(() => parseArgs(['--experiment', 'settle', '--cua', '/c', '--out', '/o', '--routes', 'sideways']), /--routes takes background, desktop and dedicated/);
});

test('every cell names a known scene, kind, route and occlusion, and every kind one method that defers', () => {
  const methods = new Set(Object.keys(SETTLE_MS));
  for (const [kind, method] of Object.entries(KIND_METHOD)) assert.ok(methods.has(method), `${kind}: ${method}`);
  const names = new Set();
  for (const cell of CELLS) {
    assert.ok(SCENES[cell.scene], cellName(cell));
    assert.ok(KIND_METHOD[cell.kind], cellName(cell));
    assert.ok(['background', 'desktop', 'dedicated'].includes(cell.route), cellName(cell));
    assert.ok(['covered', 'unobscured', 'active'].includes(cell.occlusion), cellName(cell));
    // the desktop route reaches the window with the focus, which the harness gives the scene window
    assert.equal(cell.occlusion === 'active', cell.route === 'desktop', cellName(cell));
    assert.ok(!names.has(cellName(cell)), `${cellName(cell)} twice`);
    names.add(cellName(cell));
  }
  for (const scenes of Object.values(FAMILY_SCENES)) for (const scene of scenes) assert.ok(SCENES[scene], scene);
  for (const scene of Object.keys(SCENES)) assert.ok(Object.values(FAMILY_SCENES).flat().includes(scene), `${scene} belongs to a family`);
});

test('the cells reach every method but launch_app, whose service method no production call reaches (the wrapper launches)', () => {
  const reached = new Set(CELLS.map((c) => KIND_METHOD[c.kind]));
  assert.deepEqual(Object.keys(SETTLE_MS).filter((m) => !reached.has(m)), ['launch_app']);
});

test('Chromium takes background drags only with the path in view, Gecko every pointer kind only fully unobscured: those cells are unobscured', () => {
  const at = (scene, kind, route = 'background') => CELLS.find((c) => c.scene === scene && c.kind === kind && c.route === route);
  assert.equal(at('chrome-input', 'drag').occlusion, 'unobscured');
  assert.equal(at('electron-input', 'drag').occlusion, 'unobscured');
  assert.equal(at('chrome-input', 'click').occlusion, 'covered');
  for (const kind of ['click', 'right_click', 'move', 'scroll', 'drag']) assert.equal(at('firefox-input', kind).occlusion, 'unobscured', kind);
  for (const kind of ['press_key', 'click_element', 'secondary_action']) assert.equal(at('firefox-input', kind).occlusion, 'covered', kind);
  // GTK 4 takes no synthetic input: its pointer and key kinds run in dedicated mode, through the foreground route
  for (const c of CELLS.filter((c) => c.scene === 'gtk4-input')) assert.equal(c.route, 'dedicated', cellName(c));
  assert.equal(at('gtk4-button', 'click_element').route, 'background', 'an element action takes effect on GTK 4 in shared mode');
});

test('every family the foreground route carries pointer input for has its covered cells in dedicated mode (task 63)', () => {
  const dedicated = (scene, kind) => CELLS.find((c) => c.scene === scene && c.kind === kind && c.route === 'dedicated');
  const cells = [
    ...['click', 'move', 'scroll', 'drag'].map((kind) => ['gtk4-input', kind]),
    ...['click', 'right_click', 'move', 'scroll', 'drag'].map((kind) => ['firefox-input', kind]),
    ['chrome-input', 'drag'],
    ['electron-input', 'drag'],
    ['settle-qt5', 'scroll'],
    ['settle-qt6', 'scroll'],
  ];
  for (const [scene, kind] of cells) assert.equal(dedicated(scene, kind)?.occlusion, 'covered', `${scene} ${kind}`);
});

test('activate_window then a pipelined windowless click runs in both modes, covered, and is judged by the click landing in the window (task 63)', () => {
  for (const route of ['background', 'dedicated']) {
    const c = CELLS.find((x) => x.scene === 'settle-gtk3' && x.kind === 'activate_click' && x.route === route);
    assert.equal(c?.occlusion, 'covered', route);
  }
  assert.equal(KIND_METHOD.activate_click, 'activate_window');
  assert.equal(landed('settle-scene', 'activate_click', { presses: 3 }, { presses: 4 }), true);
  assert.equal(landed('settle-scene', 'activate_click', { presses: 3 }, { presses: 3 }), false, 'the click went elsewhere');
  const ok = { answersOk: true, landed: true };
  assert.equal(runPasses({ route: 'background', kind: 'activate_click', ...ok, desktopClean: false, frontActive: false }), true, 'it activates on purpose');
});

test('--family and --kinds and --routes choose cells; an unknown name is refused', () => {
  const gedit = cellsFor({ families: ['gedit'] });
  assert.ok(gedit.length > 0 && gedit.every((c) => c.scene === 'gedit'));
  assert.deepEqual(cellsFor({ families: ['gedit'], kinds: ['click'], routes: ['background'] }).map(cellName), ['gedit click background']);
  assert.equal(cellsFor({}).length, CELLS.length);
  assert.throws(() => cellsFor({ families: ['vim'] }), /unknown settle family vim/);
  assert.throws(() => cellsFor({ kinds: ['wink'] }), /unknown settle kind wink/);
});

test('the input page\'s effects: keys, presses, clicks, context menus, moves, scroll and drags, each counted in its status lines', () => {
  const s = (o = {}) => ({ moves: 3, downs: 2, ups: 2, drags: 1, key_downs: 4, key_ups: 4, last_key: 'b', scroll: 0, context: 1, context_on: 'menu', clicks: 5, ...o });
  const before = s();
  assert.equal(landed('input-page', 'press_key', before, s({ key_downs: 5, key_ups: 5, last_key: 'x' }), {}), true);
  assert.equal(landed('input-page', 'press_key', before, s({ key_downs: 5, last_key: 'x' }), {}), false, 'the key\'s release not yet');
  assert.equal(landed('input-page', 'key_down', before, s({ key_downs: 5, last_key: 'x' }), {}), true);
  assert.equal(landed('input-page', 'key_up', before, s({ key_ups: 5, last_key: 'x' }), {}), true);
  assert.equal(landed('input-page', 'key_up', before, before, {}), false);
  assert.equal(landed('input-page', 'click', before, s({ downs: 3, ups: 3 }), {}), true);
  assert.equal(landed('input-page', 'click', before, s({ downs: 3 }), {}), false, 'the release not yet');
  assert.equal(landed('input-page', 'click_element', before, s({ clicks: 6 }), {}), true);
  assert.equal(landed('input-page', 'right_click', before, s({ context: 2 }), {}), true);
  assert.equal(landed('input-page', 'secondary_action', before, s({ context: 2, context_on: 'far' }), {}), false, 'on another element');
  assert.equal(landed('input-page', 'secondary_action', before, s({ context: 2 }), { action: 'showContextMenu' }), true);
  assert.equal(landed('input-page', 'secondary_action', before, s({ clicks: 6 }), { action: 'press' }), true, 'Gecko\'s buttons offer only press');
  assert.equal(landed('input-page', 'secondary_action', before, s({ context: 2 }), { action: 'press' }), false);
  assert.equal(landed('input-page', 'move', before, s({ moves: 4 }), {}), true);
  assert.equal(landed('input-page', 'move_relative', before, before, {}), false);
  assert.equal(landed('input-page', 'scroll', before, s({ scroll: 120 }), { direction: 'down' }), true);
  assert.equal(landed('input-page', 'scroll', s({ scroll: 300 }), s({ scroll: 180 }), { direction: 'up' }), true);
  assert.equal(landed('input-page', 'scroll', before, before, { direction: 'down' }), false);
  assert.equal(landed('input-page', 'drag', before, s({ drags: 2, downs: 3, ups: 3 }), {}), true);
  assert.equal(landed('input-page', 'drag_handle', before, s({ drags: 2, downs: 3 }), {}), false, 'not released yet');
  assert.equal(landed('input-page', 'press_key', null, before, {}), false, 'no read before');
});

test('a field\'s effects: the key\'s character in or out, the pasted text once more, the copied word on the clipboard, the window activated', () => {
  assert.equal(landed('field', 'press_key', { text: 'abc' }, { text: 'abcx' }, { key: 'x' }), true);
  assert.equal(landed('field', 'press_key', { text: 'abcx' }, { text: 'abc' }, { key: 'BackSpace' }), true);
  assert.equal(landed('field', 'press_key', { text: 'abc' }, { text: 'abc' }, { key: 'x' }), false);
  assert.equal(landed('field', 'key_down', { text: 'abc' }, { text: 'abcx' }, { key: 'x' }), true);
  assert.equal(landed('field', 'type_text', { text: 'a s1q' }, { text: 'a s1qs2q' }, { text: 's2q' }), true);
  assert.equal(landed('field', 'type_text', { text: 'a s2q' }, { text: 'a s2q' }, { text: 's2q' }), false);
  assert.equal(landed('field', 'clipboard_write', { text: 'cua171 x' }, { text: 'cua171 xcua171' }, { word: 'cua171' }), true);
  assert.equal(landed('field', 'clipboard_read', {}, { clipboard: 'cua171' }, { word: 'cua171' }), true);
  assert.equal(landed('field', 'clipboard_read', {}, { clipboard: 'other' }, { word: 'cua171' }), false);
  assert.equal(landed('field', 'activate_window', { wm: false, active: false }, { wm: true, active: true }, {}), true);
  assert.equal(landed('field', 'activate_window', { wm: false, active: null }, { wm: true, active: null }, {}), true, 'Chromium reports no ACTIVE state');
  assert.equal(landed('editor', 'activate_window', { wm: false, active: false }, { wm: true, active: false }, {}), false, 'the application has not taken it yet');
  assert.equal(landed('editor', 'activate_window', { wm: false, active: false }, { wm: false, active: true }, {}), false, 'the window manager has not');
  assert.equal(landed('editor', 'activate_window', { wm: true, active: true }, { wm: true, active: true }, {}), false, 'active before the run');
  assert.equal(landed('field', 'press_key', { text: null }, { text: 'x' }, { key: 'x' }), false, 'no text before');
});

test('an editor\'s pointer effects, which the tree hides: the caret into the line clicked, a selection inside the line dragged', () => {
  const line = { line: [23, 45] };
  assert.equal(landed('editor', 'click', { caret: 46 }, { caret: 23 }, line), true);
  assert.equal(landed('editor', 'click', { caret: 46 }, { caret: 30 }, line), true);
  assert.equal(landed('editor', 'click', { caret: 46 }, { caret: 46 }, line), false);
  assert.equal(landed('editor', 'click', { caret: 46 }, { caret: 5 }, line), false, 'another line');
  assert.equal(landed('editor', 'key_click', { caret: 46 }, { caret: 23 }, line), true);
  assert.equal(landed('editor', 'drag', { selection: null }, { selection: [23, 28] }, line), true);
  assert.equal(landed('editor', 'drag', { selection: null }, { selection: null }, line), false);
  assert.equal(landed('editor', 'drag', { selection: null }, { selection: [23, 23] }, line), false, 'an empty selection');
  assert.equal(landed('editor', 'drag_handle', { selection: null }, { selection: [2, 9] }, line), false, 'outside the line');
  assert.equal(landed('editor', 'drag', { selection: [23, 28] }, { selection: [33, 38] }, line), true, 'the last drag\'s selection replaced');
  assert.equal(landed('editor', 'drag', { selection: [23, 28] }, { selection: [23, 28] }, line), false, 'the last drag\'s selection still');
  // a Writer paragraph: the caret is the clicked paragraph's own, -1 while it is elsewhere
  assert.equal(landed('paragraphs', 'click', { caret: -1 }, { caret: 0 }, { line: [0, 22] }), true);
  assert.equal(landed('paragraphs', 'click', { caret: -1 }, { caret: -1 }, { line: [0, 22] }), false);
});

test('a terminal\'s effects: one more x on its cleared screen, any change for its pointer kinds; xterm\'s program received more bytes', () => {
  assert.equal(landed('screen', 'press_key', { text: '\n\n' }, { text: 'x\n\n' }, {}), true);
  assert.equal(landed('screen', 'press_key', { text: '\n' }, { text: '\n' }, {}), false);
  assert.equal(landed('screen', 'press_key', { text: '' }, { text: 'xx' }, {}), false, 'two keys');
  assert.equal(landed('screen', 'click', { text: '' }, { text: ' !!' }, {}), true);
  assert.equal(landed('screen', 'scroll', { text: 'a' }, { text: 'a' }, {}), false);
  assert.equal(landed('screen', 'type_text', { text: '' }, { text: 's3q' }, { text: 's3q' }), true);
  assert.equal(landed('record', 'click', { bytes: 12 }, { bytes: 24 }, {}), true);
  assert.equal(landed('record', 'press_key', { bytes: 12 }, { bytes: 12 }, {}), false);
});

test('the scenes\' counters: presses, moves and wheel steps in their names; GTK 4\'s status line', () => {
  assert.equal(landed('settle-scene', 'click', { presses: 2 }, { presses: 3 }, {}), true);
  assert.equal(landed('settle-scene', 'click_element', { presses: 2 }, { presses: 2 }, {}), false);
  assert.equal(landed('settle-scene', 'key_click', { presses: 2 }, { presses: 3 }, {}), true, 'a key then a click: the click\'s effect');
  assert.equal(landed('settle-scene', 'move', { moves: 2 }, { moves: 9 }, {}), true);
  assert.equal(landed('settle-scene', 'scroll', { scrolls: 0 }, { scrolls: 3 }, {}), true);
  assert.equal(landed('counter', 'click_element', { presses: 0 }, { presses: 1 }, {}), true);
  const g = (o = {}) => ({ scroll: 0, scale: 50, moves: 0, presses: 0, keys: 0, rights: 0, ...o });
  assert.equal(landed('gtk4-input', 'press_key', g(), g({ keys: 1 }), {}), true);
  assert.equal(landed('gtk4-input', 'click', g(), g({ presses: 1 }), {}), true);
  assert.equal(landed('gtk4-input', 'move', g(), g({ moves: 4 }), {}), true);
  assert.equal(landed('gtk4-input', 'scroll', g(), g({ scroll: 3 }), {}), true);
  assert.equal(landed('gtk4-input', 'drag', g(), g({ scale: 80 }), {}), true);
  assert.equal(landed('gtk4-input', 'drag', g(), g(), {}), false);
});

test('a run passes on its answers and its effect, and on the background route its desktop left alone; activation and the other routes change the desktop on purpose', () => {
  const ok = { answersOk: true, landed: true, desktopClean: true, frontActive: true };
  assert.equal(runPasses({ route: 'background', kind: 'click', ...ok }), true);
  assert.equal(runPasses({ route: 'background', kind: 'click', ...ok, landed: false }), false);
  assert.equal(runPasses({ route: 'background', kind: 'click', ...ok, answersOk: false }), false);
  assert.equal(runPasses({ route: 'background', kind: 'click', ...ok, desktopClean: false }), false);
  assert.equal(runPasses({ route: 'background', kind: 'click', ...ok, frontActive: false }), false, 'task 61: the window took the active window');
  assert.equal(runPasses({ route: 'background', kind: 'activate_window', ...ok, desktopClean: false, frontActive: false }), true);
  assert.equal(runPasses({ route: 'desktop', kind: 'click', ...ok, desktopClean: false, frontActive: false }), true);
  assert.equal(runPasses({ route: 'dedicated', kind: 'press_key', ...ok, desktopClean: false }), true);
  assert.equal(runPasses({ route: 'dedicated', kind: 'press_key', ...ok, landed: false }), false);
});

test('a series stops once it cannot reach its consecutive passes any more', () => {
  assert.equal(CONSECUTIVE, 30);
  assert.equal(MAX_RUNS, 60);
  const runs = (pattern) => [...pattern].map((c) => c === '1');
  assert.equal(hopeless(runs('1'.repeat(29)), 30, 60), false);
  assert.equal(hopeless(runs(`0${'1'.repeat(29)}0`), 30, 60), true, 'a miss at the 31st run leaves 29 to go');
  assert.equal(hopeless(runs(`${'1'.repeat(30)}0`), 30, 60), false, 'reached already');
  assert.equal(hopeless(runs(`${'1'.repeat(20)}0${'1'.repeat(10)}`), 30, 60), false, '29 left, a streak of 10: still possible');
  assert.equal(hopeless(runs(`${'0'.repeat(25)}${'1'.repeat(15)}0${'1'.repeat(5)}`), 30, 60), true, '14 left and a streak of 5');
});

test('a cell\'s held step is the smallest step whose series reached its passes; none when no step did', () => {
  const s = (lane, reached) => ({ lane, reached });
  assert.equal(heldStep([s('settle-0', false), s('settle-10', false), s('settle-25', true)]), 25);
  assert.equal(heldStep([s('settle-0', true)]), 0);
  assert.equal(heldStep([s('settle-0', false), s('settle-100', false)]), null);
  assert.equal(heldStep([s('shipped', true)]), null, 'the shipped lane is no step');
});

test('each method\'s constant is the largest held step across its cells and sittings; a cell that held at no step keeps the method at its shipped value', () => {
  const rows = [
    { cell: 'chrome-input press_key background', method: 'press_key', load: 0, held: 0 },
    { cell: 'electron-input press_key background', method: 'press_key', load: 0, held: 10 },
    { cell: 'electron-input press_key background', method: 'press_key', load: 2, held: 25 },
    { cell: 'gedit click background', method: 'click', load: 2, held: 0 },
    { cell: 'chrome-input scroll background', method: 'scroll', load: 2, held: null },
  ];
  const constants = methodConstants(rows);
  assert.deepEqual(constants.press_key, { ms: 25, by: ['electron-input press_key background at 2x'], unheld: [], lost: [] });
  assert.deepEqual(constants.click, { ms: 0, by: ['gedit click background at 2x'], unheld: [], lost: [] });
  assert.deepEqual(constants.scroll, { ms: SETTLE_MS.scroll, by: [], unheld: ['chrome-input scroll background at 2x'], lost: [] });
  assert.deepEqual(constants.launch_app, { ms: SETTLE_MS.launch_app, by: [], unheld: [], lost: [], unmeasured: true });
});

test('a cell whose input never came at any step is set aside, listed; one with any late effect is not', () => {
  const s = (lane, late, never, reached = false) => ({ lane, late, never, reached });
  const steps = (late, never) => STEPS.map((ms) => s(`settle-${ms}`, late, never));
  assert.equal(lostInput(steps(0, 9)), true);
  assert.equal(lostInput([...steps(0, 9).slice(0, 5), s('settle-100', 1, 8)]), false, 'one late effect: a settle bears on it');
  assert.equal(lostInput([s('settle-0', 0, 9), s('settle-10', 0, 0, true)]), false, 'it held');
  assert.equal(lostInput([]), false);
  const constants = methodConstants([
    { cell: 'electron-input drag background', method: 'drag', load: 0, held: 10 },
    { cell: 'gtk4-input drag dedicated', method: 'drag', load: 2, held: null, lost: true },
  ]);
  assert.deepEqual(constants.drag, { ms: 10, by: ['electron-input drag background at idle'], unheld: [], lost: ['gtk4-input drag dedicated at 2x'] });
  assert.equal(methodConstants([{ cell: 'x', method: 'drag', load: 2, held: null, lost: true }]).drag.ms, SETTLE_MS.drag, 'with no cell held, the shipped value');
});

test('the verdict: a search sitting needs a held step in every cell, a lanes sitting every judged series reached; a missing cell fails', () => {
  const cell = 'gedit click background';
  const series = (lane, reached, misses = 0) => ({ cell, lane, reached, runs: reached ? 30 + misses : 60, misses, streak: reached ? 30 : 3, need: 30, late: misses, never: 0 });
  let v = settleVerdict([series('settle-0', false, 4), series('settle-10', true)], { search: true, cells: [cell] });
  assert.deepEqual(v.failed, []);
  assert.deepEqual(v.held, { [cell]: 10 });
  v = settleVerdict([series('settle-0', false, 9), series('settle-100', false, 9)], { search: true, cells: [cell] });
  assert.match(v.failed.join('; '), /gedit click background: no step held/);
  v = settleVerdict([series('shipped', true)], { search: false, cells: [cell, 'gedit drag background'] });
  assert.match(v.failed.join('; '), /gedit drag background was not measured/);
  v = settleVerdict([{ ...series('shipped', true), need: 10 }], { search: false, cells: [cell] });
  assert.match(v.failed.join('; '), /a development series of 10/);
});

test('a cell\'s requests to the service: its window on the background and foreground routes, none on the desktop route, a handle\'s three steps, a key then a click', async () => {
  const { requestsOf } = await import('../../scripts/linux-engine-diff/action-settle.mjs');
  const sc = { id: 7, origin: { x: 10, y: 20 } };
  const cellOf = (kind, route = 'background') => ({ scene: 'gedit', kind, route, occlusion: route === 'desktop' ? 'active' : 'covered' });
  assert.deepEqual(requestsOf(cellOf('press_key'), sc, { key: 'x' }), [{ type: 'execute', method: 'press_key', args: [{ window: { id: 7 }, key: 'x' }] }]);
  assert.deepEqual(requestsOf(cellOf('press_key', 'desktop'), sc, { key: 'x' }), [{ type: 'execute', method: 'press_key', args: [{ key: 'x' }] }]);
  assert.deepEqual(requestsOf(cellOf('click', 'desktop'), sc, { point: { x: 1, y: 2 } }), [{ type: 'execute', method: 'click', args: [{ x: 11, y: 22 }] }], 'screen coordinates on the desktop route');
  assert.deepEqual(requestsOf(cellOf('click', 'dedicated'), sc, { point: { x: 1, y: 2 } }), [{ type: 'execute', method: 'click', args: [{ window: { id: 7 }, x: 1, y: 2 }] }]);
  assert.deepEqual(requestsOf(cellOf('key_click'), sc, { point: { x: 1, y: 2 } }).map((r) => [r.method, r.args[0]]), [['press_key', { window: { id: 7 }, key: 'shift' }], ['click', { window: { id: 7 }, x: 1, y: 2 }]]);
  // task 63: the activation, then the click pipelined on its answer, windowless at the window's point on the screen
  for (const route of ['background', 'dedicated']) {
    assert.deepEqual(requestsOf(cellOf('activate_click', route), sc, { point: { x: 1, y: 2 } }).map((r) => [r.method, r.args[0]]), [['activate_window', { window: { id: 7 } }], ['click', { x: 11, y: 22 }]], route);
  }
  assert.deepEqual(requestsOf(cellOf('right_click'), sc, { element: '4' }), [{ type: 'execute', method: 'click', args: [{ window: { id: 7 }, element_id: '4', mouse_button: 'right' }] }]);
  assert.deepEqual(requestsOf(cellOf('drag_handle', 'desktop'), sc, { handle: 'h', path: [{ x: 1, y: 1 }, { x: 5, y: 1 }] }),
    [{ type: 'drag_start', handle_id: 'h', point: { x: 11, y: 21 } }, { type: 'drag_move', handle_id: 'h', point: { x: 15, y: 21 } }, { type: 'drag_end', handle_id: 'h' }]);
  assert.deepEqual(requestsOf(cellOf('activate_window'), sc, {}), [{ type: 'execute', method: 'activate_window', args: [{ window: { id: 7 } }] }]);
  assert.throws(() => requestsOf(cellOf('wink'), sc, {}), /no requests for wink/);
});

test('where a cell\'s effect is read: the tree where it carries it, else the harness\'s reader at the settle\'s end', async () => {
  const { sourceOf, fromTree } = await import('../../scripts/linux-engine-diff/action-settle.mjs');
  const cellOf = (kind) => ({ kind, route: 'background' });
  assert.equal(sourceOf(cellOf('click'), { effects: 'input-page' }), 'tree');
  assert.equal(sourceOf(cellOf('press_key'), { effects: 'editor', textInTree: true }), 'tree');
  assert.equal(sourceOf(cellOf('press_key'), { effects: 'editor', textInTree: false }), 'oracle', 'a field whose node carries no text');
  assert.equal(sourceOf(cellOf('click'), { effects: 'editor', textInTree: true }), 'oracle', 'a caret');
  assert.equal(sourceOf(cellOf('activate_window'), { effects: 'field', textInTree: true }), 'oracle');
  assert.equal(sourceOf(cellOf('press_key'), { effects: 'screen' }), 'oracle');
  const tree = { role: 'frame', name: 'w', children: [{ role: 'push button', name: 'presses 3', children: [] }, { role: 'label', name: 'moves 12 scrolls 2', children: [] }, { role: 'text', name: '', native_id: ':1.2:/f', value: 'abc', children: [] }] };
  assert.deepEqual(fromTree({ effects: 'settle-scene' }, { ax_tree: tree }), { presses: 3, moves: 12, scrolls: 2 });
  assert.deepEqual(fromTree({ effects: 'editor', field: ':1.2:/f' }, { ax_tree: tree }), { text: 'abc' });
});
