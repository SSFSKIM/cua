import assert from 'node:assert/strict';
import { test } from 'node:test';

import { OPS, SCENE_OPS, inputOp, ownWindow, parseInputStatus, shotOf, targeted } from '../../scripts/linux-engine-diff/ops.mjs';
import { differingField } from '../../scripts/linux-engine-diff/run.mjs';
import { asOutput, decimalIds, dehydrateTree } from '../../scripts/linux-engine-diff/vendor-js.mjs';

test("the input scene's status lines parse into counters", () => {
  const s = parseInputStatus(['Press', 'pointer moves 12 downs 2 ups 2 drags 1', 'keys down 3 up 2 last b', 'scroll 300', 'context 4 on far', 'clicks 5']);
  assert.deepEqual(s, { moves: 12, downs: 2, ups: 2, drags: 1, key_downs: 3, key_ups: 2, last_key: 'b', scroll: 300, context: 4, context_on: 'far', clicks: 5 });
  // a missing line reads as unknown, never as zero
  assert.equal(parseInputStatus([]).clicks, null);
});

test('every planned operation is defined, and its kind decides its window, witness and audit', () => {
  for (const op of Object.values(SCENE_OPS).flat()) assert.ok(OPS[op], op);
  assert.equal(ownWindow('tree'), false);
  assert.equal(ownWindow('tree_shot'), true);
  assert.equal(targeted('list_apps'), false);
  assert.equal(inputOp('drag'), true);
  assert.equal(inputOp('after_remap'), true);
  assert.equal(shotOf('after_resize'), true);
  assert.equal(shotOf('get_screenshot'), true);
  // activation is window input whose desktop change is deliberate: not the background route
  assert.equal(OPS.activate_window.background, false);
  assert.equal(OPS.drag.background, true);
});

test('the input operations send what the scene expects and judge the effect from the counters', () => {
  const scene = { id: 7, elements: { press: ':1.5/a', menu: ':1.5/b', far: ':1.5/c' } };
  const ctx = { scene, i: 0, before: { scroll: 0 } };
  assert.deepEqual(OPS.right_click.request(ctx), ['click', { window: { id: 7 }, element_id: ':1.5/b', mouse_button: 'right' }]);
  // decimal ids where the engine numbers them (the vendor JavaScript)
  assert.deepEqual(OPS.click_element.request({ ...ctx, ids: { press: '12' } })[1].element_id, '12');
  assert.equal(OPS.scroll.request(ctx)[1].direction, 'down');
  assert.equal(OPS.scroll.request({ ...ctx, before: { scroll: 300 } })[1].direction, 'up');
  const before = parseInputStatus(['pointer moves 1 downs 0 ups 0 drags 0', 'context 0 on none']);
  const dragged = parseInputStatus(['pointer moves 9 downs 1 ups 1 drags 1', 'context 0 on none']);
  assert.equal(OPS.drag.effect(ctx, {}, before, dragged), true);
  assert.equal(OPS.drag.effect(ctx, {}, before, before), false);
  const opened = parseInputStatus(['context 1 on far']);
  assert.equal(OPS.right_click_fallback.effect(ctx, {}, parseInputStatus(['context 0 on none']), opened), true);
  assert.equal(OPS.right_click.effect(ctx, {}, parseInputStatus(['context 0 on none']), opened), false);
});

test('where two answers differ: success, the error, or the output', () => {
  assert.equal(differingField({ ok: true, output: null }, { ok: false, error: 'x' }), 'answer');
  assert.equal(differingField({ ok: false, error: 'a' }, { ok: false, error: 'b' }), 'error');
  assert.equal(differingField({ ok: false, error: 'a' }, { ok: false, error: 'a' }), null);
  assert.equal(differingField({ ok: true, output: [1] }, { ok: true, output: [2] }), 'output');
  assert.equal(differingField(null, { ok: true }), 'answer');
});

test("the vendor client's hydrated tree goes back to the wire's shape, and its decimal ids are read", () => {
  const hydrated = { id: '0', native_id: ':1.2/root', role: 'frame', children: [{ id: '1', native_id: ':1.2/b', role: 'push button', name: 'Press', children: [] }] };
  assert.deepEqual(dehydrateTree(hydrated), { id: ':1.2/root', role: 'frame', children: [{ id: ':1.2/b', role: 'push button', name: 'Press', children: [] }] });
  assert.deepEqual([...decimalIds(hydrated)], [[':1.2/root', '0'], [':1.2/b', '1']]);
  assert.equal(asOutput('click', undefined), null);
  assert.deepEqual(asOutput('list_windows', [{ id: 1 }]), [{ id: 1 }]);
});
