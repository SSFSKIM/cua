// The key-window reading (scripts/hosted-sittings/key-window.mjs): the window a cell acts in, read by ax-state against
// the app's own focused and main window. A sheet (in the window list a window of its own, in Accessibility a part of its
// parent) counts as the window it lies on; a reading not taken keeps why, so a sitting can tell an untrusted reader
// from a window that was not there.
import assert from 'node:assert/strict';
import test from 'node:test';
import {ownKeyWindow, sceneWindowOf, SHEET_PARENTS} from '../../scripts/hosted-sittings/key-window.mjs';

const rect = (x, y, width, height) => ({x, y, width, height});
const win = (number, bounds, pid = 600) => ({ownerPid: pid, layer: 0, number, bounds});
const SCENE = win(4, rect(242, 107, 603, 505)), UNTITLED = win(9, rect(262, 127, 603, 505)), SHEET = win(11, rect(323, 149, 480, 300));
const answer = (over = {}) => ({trusted: true, ok: true, failed: [], found: true, frontmost: true, focused: true, main: true, focusedWindow: 'run', mainWindow: 'run', windows: 2, ...over});

test('the window a cell acts in: the recorded one when named, else the process\'s frontmost', () => {
  assert.deepEqual(sceneWindowOf([UNTITLED, SCENE], {pid: 600, number: 4}), {pid: 600, number: 4, bounds: SCENE.bounds});
  assert.deepEqual(sceneWindowOf([UNTITLED, SCENE], {pid: 600}), {pid: 600, number: 9, bounds: UNTITLED.bounds});
  assert.equal(sceneWindowOf([win(1, rect(0, 0, 10, 10), 7)], {pid: 600}), null);
});

test('a second document in front (⌘N): the reading is against it, never the recorded scene window', () => {
  const asked = [];
  const r = ownKeyWindow([UNTITLED, SCENE], {scene: 'textedit', pid: 600}, (pid, bounds) => { asked.push(bounds); return answer(); });
  assert.deepEqual(asked, ['262,127,603,505']);
  assert.deepEqual(r, {scene: 'textedit', number: 9, trusted: true, ok: true, found: true, failed: [], frontmost: true, focusedWindow: 'run', mainWindow: 'run'});
});

const unmatched = answer({ok: false, found: false, focused: null, main: null, focusedWindow: 'other', mainWindow: 'other'});
test('a sheet in front counts as the window it lies on: Accessibility lists no window at its bounds, and shows it as an AXSheet of the window behind', () => {
  const asked = [];
  const r = ownKeyWindow([SHEET, UNTITLED, SCENE], {scene: 'textedit', pid: 600}, (pid, bounds, sheet) => {
    asked.push([bounds, sheet]);
    return bounds === '323,149,480,300' ? unmatched : answer({sheet: bounds === '262,127,603,505' && sheet === '323,149,480,300'});
  });
  // Every window enclosing it is asked; only the untitled document has it as its AXSheet.
  assert.deepEqual(asked, [['323,149,480,300', undefined], ['262,127,603,505', '323,149,480,300'], ['242,107,603,505', '323,149,480,300']]);
  assert.deepEqual([r.number, r.ok, r.focusedWindow, r.sheet], [9, true, 'run', 11]);
});

// The review's case: a front window Accessibility does not list, lying inside another of the process's windows, is not
// thereby a sheet of it. Without Accessibility's AXSheet at its bounds the window behind is never certified: unread.
test('a front window inside another that Accessibility shows as no sheet of it: the window behind is never read as the scene window', () => {
  const FRONT = win(12, rect(110, 120, 600, 400)), UNDER = win(106, rect(102, 100, 720, 560));
  for (const sheet of [false, undefined]) {
    const r = ownKeyWindow([FRONT, UNDER], {scene: 'electron', pid: 600}, (pid, bounds) => (bounds === '110,120,600,400' ? unmatched : answer({...(sheet === undefined ? {} : {sheet})})));
    assert.deepEqual([r.number, r.ok, 'sheet' in r], [12, false, false], String(sheet));
    assert.match(r.reason, /no sheet of the window behind it/);
  }
});

test('a reading not taken keeps why: an untrusted reader, a reader that failed, a window Accessibility does not list, a read that failed, none on screen', () => {
  const at = given => ownKeyWindow([SCENE], {scene: 'textedit', pid: 600}, given);
  assert.deepEqual(at(() => ({trusted: false})), {scene: 'textedit', number: 4, trusted: false, ok: false, found: null, failed: [], frontmost: null, focusedWindow: null, mainWindow: null,
    reason: 'the reader is not trusted for Accessibility'});
  const threw = at(() => { throw new Error('ax-state exited 64'); });
  assert.deepEqual([threw.trusted, threw.ok, threw.reason], [null, false, 'the reader failed (ax-state exited 64)']);
  assert.equal(at(() => answer({ok: false, found: false, focusedWindow: 'other'})).reason, 'Accessibility lists no window at the scene window\'s bounds');
  assert.equal(at(() => answer({ok: false, failed: ['focusedWindow'], focusedWindow: null})).reason, 'a read failed: focusedWindow');
  assert.deepEqual(ownKeyWindow([], {scene: 'textedit', pid: 600}, () => answer()), {scene: 'textedit', number: null, trusted: null, ok: false, reason: 'the scene window is not on screen'});
});

// Pilot C-4 (and C-3 before it): both TextEdit cells that open a sheet on the run's untitled document (super+w's
// keep-or-delete sheet, super+s's Save sheet) passed the guard for every key up to the sheet and were refused at the
// first cell after it, "the textedit app's key window is another of its windows". With a sheet up the app's
// AXFocusedWindow is the sheet (an AXSheet whose parent is the document), never CFEqual to the document: ax-state names
// it `sheet`, the document's own. The focused window's role, subrole and frame ride on every reading (`focused`), its
// number resolved from the window list, so a refusal says which window held the focus.
test('a sheet of the window read is its focused window: kept as `sheet`, and the focused window resolved to its number', () => {
  const r = ownKeyWindow([SHEET, UNTITLED, SCENE], {scene: 'textedit', pid: 600, number: 9}, () => answer({frontmost: false, focusedWindow: 'sheet', mainWindow: 'run',
    focusedWindowElement: {role: 'AXSheet', subrole: null, frame: SHEET.bounds}}));
  assert.deepEqual([r.number, r.ok, r.focusedWindow], [9, true, 'sheet']);
  assert.deepEqual(r.focused, {number: 11, frame: SHEET.bounds, role: 'AXSheet', subrole: null, parent: 9});
  // Another window focused: its number when the list holds a window at its frame, else null with the frame kept.
  const other = ownKeyWindow([UNTITLED, SCENE], {scene: 'textedit', pid: 600, number: 9}, () => answer({focusedWindow: 'other', focusedWindowElement: {role: 'AXWindow', subrole: 'AXStandardWindow', frame: {...SCENE.bounds, x: 243}}}));
  assert.deepEqual(other.focused, {number: 4, frame: {...SCENE.bounds, x: 243}, role: 'AXWindow', subrole: 'AXStandardWindow', parent: null});
  const unlisted = ownKeyWindow([SCENE], {scene: 'textedit', pid: 600}, () => answer({focusedWindow: 'other', focusedWindowElement: {role: 'AXWindow', subrole: null, frame: rect(1, 2, 3, 4)}}));
  assert.deepEqual(unlisted.focused, {number: null, frame: rect(1, 2, 3, 4), role: 'AXWindow', subrole: null, parent: null});
  // Ruling 1214: a sheet of another window focused keeps its parent's number, from the parent's frame ax-state reads.
  const elsewhere = ownKeyWindow([SHEET, UNTITLED, SCENE], {scene: 'textedit', pid: 600, number: 9}, () => answer({focusedWindow: 'other',
    focusedWindowElement: {role: 'AXSheet', subrole: null, frame: SHEET.bounds, parentFrame: SCENE.bounds}}));
  assert.deepEqual(elsewhere.focused, {number: 11, frame: SHEET.bounds, role: 'AXSheet', subrole: null, parent: 4});
  // No focused window: none recorded; a reader that says nothing of it (an older reader): no `focused` at all.
  assert.equal(ownKeyWindow([SCENE], {scene: 'textedit', pid: 600}, () => answer({focusedWindow: 'none', focusedWindowElement: null})).focused, null);
  assert.equal('focused' in ownKeyWindow([SCENE], {scene: 'textedit', pid: 600}, () => answer()), false);
});

// Review of b12c7121a..2a2dd8dd6, finding 1: the window behind a sheet in front is the one Accessibility confirms, never
// merely the first enclosing one; the expected document wins among several confirmed, and several with none expected
// is no reading.
test('a sheet in front: the enclosing window Accessibility confirms is read, the expected one among several; several unexpected are unread', () => {
  const ax = parents => (pid, bounds, sheet) => (bounds === '323,149,480,300' ? unmatched : answer({sheet: Boolean(sheet) && parents.includes(bounds)}));
  // The first enclosing window (the untitled document) is not its parent; the scene document behind it is.
  const second = ownKeyWindow([SHEET, UNTITLED, SCENE], {scene: 'textedit', pid: 600}, ax(['242,107,603,505']));
  assert.deepEqual([second.number, second.ok, second.sheet], [4, true, 11]);
  // Both confirmed (an Accessibility that answers so): the expected scene window, else no reading.
  const both = ax(['262,127,603,505', '242,107,603,505']);
  assert.deepEqual([ownKeyWindow([SHEET, UNTITLED, SCENE], {scene: 'textedit', pid: 600, expect: 4}, both).number, ownKeyWindow([SHEET, UNTITLED, SCENE], {scene: 'textedit', pid: 600, expect: 9}, both).number], [4, 9]);
  const unexpected = ownKeyWindow([SHEET, UNTITLED, SCENE], {scene: 'textedit', pid: 600, expect: 77}, both);
  assert.deepEqual([unexpected.ok, unexpected.reason], [false, SHEET_PARENTS]);
});

// Finding 2's join and minor 4: a focused frame matching two windows joins none; an AXFocusedWindow read that failed is
// 'unread', distinct from no focused window (null).
test('the focused window: joined only to a unique window; unread kept apart from none', () => {
  const twin = win(12, SCENE.bounds);
  const r = ownKeyWindow([UNTITLED, SCENE, twin], {scene: 'textedit', pid: 600, number: 9}, () => answer({focusedWindow: 'other', focusedWindowElement: {role: 'AXWindow', subrole: null, frame: SCENE.bounds}}));
  assert.deepEqual([r.focused.number, r.focused.ambiguous], [null, 2]);
  assert.equal(ownKeyWindow([SCENE], {scene: 'textedit', pid: 600}, () => answer({focusedWindow: null, ok: false, failed: ['focusedWindow'], focusedWindowElement: 'unread'})).focused, 'unread');
  assert.equal(ownKeyWindow([SCENE], {scene: 'textedit', pid: 600}, () => answer({focusedWindow: 'none', focusedWindowElement: null})).focused, null);
});

// Ruling 1219 (s3), diagnostics only: for a focused AXSheet ax-state also says what decided its side: sheetOf's own
// answer against the window read, its parent's role, and whether the app lists the sheet among its AXWindows. The
// reading keeps them on `focused.sheetAx`; nothing is judged on them.
test('a focused sheet carries what ax-state saw of it: sheetOf, its parent\'s role, whether it is listed', () => {
  const r = ownKeyWindow([SHEET, UNTITLED, SCENE], {scene: 'textedit', pid: 600, number: 9}, () => answer({frontmost: false, focusedWindow: 'sheet', mainWindow: 'run',
    focusedWindowElement: {role: 'AXSheet', subrole: null, frame: SHEET.bounds, parentFrame: UNTITLED.bounds, sheetOf: true, parentRole: 'AXWindow', listed: false}}));
  assert.deepEqual(r.focused, {number: 11, frame: SHEET.bounds, role: 'AXSheet', subrole: null, parent: 9, sheetAx: {sheetOf: true, parentRole: 'AXWindow', listed: false}});
  const odd = ownKeyWindow([SHEET, UNTITLED, SCENE], {scene: 'textedit', pid: 600, number: 9}, () => answer({focusedWindow: 'other',
    focusedWindowElement: {role: 'AXSheet', subrole: null, frame: SHEET.bounds, sheetOf: null, parentRole: 7, listed: 'x'}}));
  assert.deepEqual(odd.focused.sheetAx, {sheetOf: null, parentRole: null, listed: null}, 'anything malformed is unread');
});
