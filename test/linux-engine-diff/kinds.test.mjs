import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DRAG_FAMILIES, dragEngines, runPath } from '../../scripts/linux-engine-diff/drag.mjs';
import { FAMILIES } from '../../scripts/linux-engine-diff/families.mjs';
import { KIND_FAMILIES, cellVerdict, kindLanes, scrolled, wheelReported } from '../../scripts/linux-engine-diff/kinds.mjs';

test("M3.1's measurement covers every family of the matrix, scroll in each and drag in each", () => {
  const matrix = ['gedit', 'gnome-text-editor', 'kate', 'qtcreator', 'firefox', 'chrome', 'electron', 'writer', 'writer-gen', 'xterm', 'xterm-allow', 'gnome-terminal'];
  for (const family of matrix) {
    assert.ok(KIND_FAMILIES[family]?.includes('scroll'), `${family} scroll`);
    assert.ok(DRAG_FAMILIES[family]?.length, `${family} drag`);
  }
  for (const family of [...Object.keys(KIND_FAMILIES), ...Object.keys(DRAG_FAMILIES)]) assert.ok(FAMILIES[family], family);
  assert.deepEqual(KIND_FAMILIES['gtk4-input'], ['scroll', 'move', 'click'], "GTK 4's scene reads every kind");
  assert.deepEqual(DRAG_FAMILIES['gtk4-input'], ['scale4']);
});

test('a scroll took effect when its position moved its way; a wheel event reaches a terminal as a button 4 or 5 report', () => {
  assert.equal(scrolled('down', 0, 120), true);
  assert.equal(scrolled('down', 120, 120), false);
  assert.equal(scrolled('up', 120, 0), true);
  assert.equal(scrolled('up', 0, 0), false, 'already at the top: no effect shown');
  assert.equal(scrolled('down', null, 3), null, 'unread is unknown');
  assert.equal(wheelReported('ab', 'ab\x1b[Ma!!'), true, 'button 5 (down): 32 + 64 + 1');
  assert.equal(wheelReported('', '\x1b[M`!!'), true, 'button 4 (up)');
  assert.equal(wheelReported('', '\x1b[M !!\x1b[M#!!'), false, 'a click: button 1 pressed and released');
  assert.equal(wheelReported('\x1b[Ma!!', '\x1b[Ma!!'), false, 'only what arrived since');
  assert.equal(wheelReported(null, 'x'), null);
});

test('a kind is ignored only where the control takes every run and no background lane takes any', () => {
  const runs = (counts) => Object.entries(counts).flatMap(([engine, took]) => Array.from({ length: 4 }, (_, i) => ({ engine, took: i < took })));
  assert.equal(cellVerdict(runs({ pinned: 0, newest: 0, cua: 0, xtest: 4 }), 4), 'ignored');
  assert.equal(cellVerdict(runs({ pinned: 4, newest: 4, cua: 4, xtest: 4 }), 4), 'taken');
  assert.equal(cellVerdict(runs({ pinned: 0, newest: 0, cua: 0, xtest: 3 }), 4), 'undecided', 'a control that misses leaves the reader in doubt');
  assert.equal(cellVerdict(runs({ pinned: 0, newest: 0, cua: 0, xtest: 0 }), 4), 'undecided');
  assert.equal(cellVerdict(runs({ pinned: 1, newest: 0, cua: 0, xtest: 4 }), 4), 'undecided', 'a vendor run that took: not ignored outright');
  assert.equal(cellVerdict(runs({ pinned: 0, newest: 0, cua: 3, xtest: 4 }), 4), 'undecided', 'cua took some: neither');
});

test("the lanes: the vendor builds, cua as it ships and the XTEST control; the drag experiment's control only on request", () => {
  assert.deepEqual(kindLanes({ vendor: 'v', newest: 'n', cua: 'c' }).map((l) => [l.label, Boolean(l.control)]), [['pinned', false], ['newest', false], ['cua', false], ['xtest', true]]);
  const args = { vendor: 'v', newest: 'n', cua: 'c', variants: [] };
  assert.ok(!dragEngines(args).some((l) => l.control), 'the drag lanes as before unless asked');
  assert.deepEqual(dragEngines({ ...args, lanes: ['pinned', 'cua', 'xtest'] }).map((l) => l.label), ['pinned', 'cua', 'xtest']);
  assert.throws(() => dragEngines({ ...args, lanes: ['cua', 'xtest'] }), /need pinned/);
  assert.throws(() => dragEngines({ ...args, lanes: ['pinned', 'nope'] }), /unknown drag lane nope/);
});

test("GTK 4's scale is dragged at its fixed place, a quarter and three quarters along, alternating", () => {
  const at = { scale4: FAMILIES['gtk4-input'].places.scale };
  assert.deepEqual(runPath(at, 'scale4', 0), [{ x: 32, y: 40 }, { x: 434, y: 40 }]);
  assert.deepEqual(runPath(at, 'scale4', 1), [{ x: 434, y: 40 }, { x: 166, y: 40 }]);
});

test('the kinds lanes narrow to those asked for, never without cua and the control', () => {
  assert.deepEqual(kindLanes({ vendor: 'v', newest: 'n', cua: 'c', lanes: ['pinned', 'cua', 'xtest'] }).map((l) => l.label), ['pinned', 'cua', 'xtest']);
  assert.throws(() => kindLanes({ vendor: 'v', cua: 'c', lanes: ['pinned', 'cua'] }), /need xtest/);
});
