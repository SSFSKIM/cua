// The settle experiment's judges of a complete effect, and of a measurement that may set a cell aside
// (scripts/linux-engine-diff/action-settle-cells.mjs; task 62's fix wave, the review's findings 2, 3 and 5): a partial
// effect, a clipboard that held the word already, and a failed measurement each fail.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { landed, lostInput, methodConstants } from '../../scripts/linux-engine-diff/action-settle-cells.mjs';

const ESC = '\u001b';
// xterm's normal mouse reports (mode 1000): ESC [ M, then 32 plus the button code, the column and the row
const report = (code, col, row) => `${ESC}[M${String.fromCharCode(32 + code, 32 + col, 32 + row)}`;
const recorded = (before, ...reports) => ({ before: { bytes: before.length, data: before }, after: { bytes: before.length + reports.join('').length, data: before + reports.join('') } });

test('xterm: a click is its press and its release, a drag its press and its release elsewhere, a scroll one wheel report a step, decoded in full', () => {
  const old = report(0, 5, 5) + report(3, 5, 5);
  let r = recorded(old, report(0, 40, 12), report(3, 40, 12));
  assert.equal(landed('record', 'click', r.before, r.after, {}), true);
  r = recorded(old, report(0, 40, 12));
  assert.equal(landed('record', 'click', r.before, r.after, {}), false, 'the press alone: six bytes of the twelve');
  r = recorded(old, report(0, 30, 12), report(3, 50, 12));
  assert.equal(landed('record', 'drag', r.before, r.after, {}), true);
  r = recorded(old, report(0, 30, 12));
  assert.equal(landed('record', 'drag', r.before, r.after, {}), false, 'not released yet');
  r = recorded(old, report(0, 30, 12), report(3, 30, 12));
  assert.equal(landed('record', 'drag', r.before, r.after, {}), false, 'a release where it was pressed is a click');
  r = recorded(old, report(65, 40, 12));
  assert.equal(landed('record', 'scroll', r.before, r.after, { direction: 'down', steps: 1 }), true);
  assert.equal(landed('record', 'scroll', r.before, r.after, { direction: 'up', steps: 1 }), false, 'the other way');
  r = recorded(old, report(64, 40, 12));
  assert.equal(landed('record', 'scroll', r.before, r.after, { direction: 'down', steps: 2 }), false, 'one step of two');
  r = recorded(old, 'x');
  assert.equal(landed('record', 'press_key', r.before, r.after, { key: 'x' }), true);
  r = recorded(old, report(0, 40, 12).slice(0, 4));
  assert.equal(landed('record', 'click', r.before, r.after, {}), false, 'a report cut short');
});

test('gnome-terminal: its screen shows the last report its program echoed: a click\'s release, a scroll\'s wheel step in its direction', () => {
  const blank = { text: '\n\n\n' };
  assert.equal(landed('screen', 'click', blank, { text: '#F*\n\n\n' }, {}), true);
  assert.equal(landed('screen', 'click', blank, { text: ' F*\n\n\n' }, {}), false, 'the press\'s report: its release not echoed yet');
  assert.equal(landed('screen', 'scroll', blank, { text: 'aD*\n\n\n' }, { direction: 'down' }), true);
  assert.equal(landed('screen', 'scroll', blank, { text: '`D*\n\n\n' }, { direction: 'up' }), true);
  assert.equal(landed('screen', 'scroll', blank, { text: '`D*\n\n\n' }, { direction: 'down' }), false);
});

test('an editor\'s drag: the selection must be the one the scene settles at, not the drag still under way', () => {
  const line = [0, 22];
  const settled = { selection: [0, 13] };
  assert.equal(landed('editor', 'drag', { selection: null }, { selection: [0, 13] }, { line, settled }), true);
  assert.equal(landed('editor', 'drag', { selection: null }, { selection: [0, 11] }, { line, settled }), false, 'the review\'s [0,11] for a path that settles at [0,13]');
  assert.equal(landed('editor', 'drag_handle', { selection: null }, { selection: [0, 12] }, { line, settled }), false);
  assert.equal(landed('editor', 'drag', { selection: null }, { selection: [0, 13] }, { line }), false, 'no settled reading: nothing to judge against');
  assert.equal(landed('editor', 'drag', { selection: [0, 13] }, { selection: [0, 13] }, { line, settled }), false, 'the last drag\'s selection still');
});

test('GTK 4\'s scale and every pointer move: the reading must be the settled one', () => {
  assert.equal(landed('gtk4-input', 'drag', { scale: 49 }, { scale: 94 }, { settled: { scale: 94 } }), true);
  assert.equal(landed('gtk4-input', 'drag', { scale: 49 }, { scale: 93 }, { settled: { scale: 94 } }), false, 'a motion still to come');
  assert.equal(landed('input-page', 'move', { moves: 3 }, { moves: 9 }, { settled: { moves: 9 } }), true);
  assert.equal(landed('input-page', 'move', { moves: 3 }, { moves: 5 }, { settled: { moves: 9 } }), false, 'motions still to come');
  assert.equal(landed('settle-scene', 'move', { moves: 3 }, { moves: 5 }, { settled: { moves: 9 } }), false);
  assert.equal(landed('gtk4-input', 'move', { moves: 3 }, { moves: 9 }, { settled: { moves: 9 } }), true);
});

test('a scroll\'s wheel steps all arrived: the settle scenes count them', () => {
  assert.equal(landed('settle-scene', 'scroll', { scrolls: 2 }, { scrolls: 3 }, { steps: 1 }), true);
  assert.equal(landed('settle-scene', 'scroll', { scrolls: 2 }, { scrolls: 3 }, { steps: 2 }), false, 'one of two');
  assert.equal(landed('gtk4-input', 'scroll', { scroll: 0 }, { scroll: 37 }, { direction: 'down' }), true);
  assert.equal(landed('gtk4-input', 'scroll', { scroll: 37 }, { scroll: 0 }, { direction: 'down' }), false, 'the other way');
});

test('clipboard_read: the copied word, on a clipboard that held another value before the run', () => {
  assert.equal(landed('field', 'clipboard_read', { clipboard: 'stale 4' }, { clipboard: 'cua171' }, { word: 'cua171' }), true);
  assert.equal(landed('field', 'clipboard_read', { clipboard: 'cua171' }, { clipboard: 'cua171' }, { word: 'cua171' }), false, 'a suppressed or delayed copy finds the word there already');
  assert.equal(landed('field', 'clipboard_read', { clipboard: 'stale 4' }, { clipboard: 'stale 4' }, { word: 'cua171' }), false, 'no copy yet');
});

test('a cell is set aside only on a complete, valid measurement, every miss an effect that never came; a failed one keeps the method at the vendor\'s value', () => {
  const steps = [0, 10, 25, 50, 75, 100];
  const series = (lane, o = {}) => ({ lane, reached: false, need: 30, runs: 31, late: 0, never: 31, refused: 0, invalid: 0, ...o });
  const valid = steps.map((ms) => series(`settle-${ms}`));
  assert.equal(lostInput(valid), true);
  // the review's probe: one failed 0 ms series of 31 oracle errors
  assert.equal(lostInput([series('settle-0', { never: 0, invalid: 31 })]), false, 'its readers failed: nothing is known');
  assert.equal(lostInput(valid.slice(0, 1)), false, 'not every step through 100');
  assert.equal(lostInput([...valid.slice(0, 5), series('settle-100', { refused: 2, never: 29 })]), false, 'commands that failed');
  assert.equal(lostInput([...valid.slice(0, 5), series('settle-100', { invalid: 1, never: 30 })]), false, 'a preparation or a reading that failed');
  // a lost cell adopts no other cell's step: its settle keeps the vendor's 100 unless the loss is established on its own
  const rows = [
    { cell: 'electron-input drag background', settle: 'drag', load: 0, held: 10 },
    { cell: 'gtk4-input drag dedicated', settle: 'drag', load: 2, held: null, lost: false },
  ];
  assert.equal(methodConstants(rows).drag.ms, 100);
  assert.equal(methodConstants([rows[0], { ...rows[1], lost: true }]).drag.ms, 100, 'lost, but no evidence of its own');
  assert.equal(methodConstants([rows[0], { ...rows[1], lost: true }], { setAside: [{ cell: 'gtk4-input drag dedicated', load: 2 }] }).drag.ms, 10);
});
