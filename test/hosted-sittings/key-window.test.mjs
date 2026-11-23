// The key-window reading (scripts/hosted-sittings/key-window.mjs): the window a cell acts in, read by ax-state against
// the app's own focused and main window. A sheet (in the window list a window of its own, in Accessibility a part of its
// parent) counts as the window it lies on; a reading not taken keeps why, so a sitting can tell an untrusted reader
// from a window that was not there.
import assert from 'node:assert/strict';
import test from 'node:test';
import {ownKeyWindow, sceneWindowOf} from '../../scripts/hosted-sittings/key-window.mjs';

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

test('a sheet in front counts as the window it lies on: Accessibility lists no window at its bounds, so its parent is read', () => {
  const asked = [];
  const r = ownKeyWindow([SHEET, UNTITLED, SCENE], {scene: 'textedit', pid: 600}, (pid, bounds) => {
    asked.push(bounds);
    return bounds === '323,149,480,300' ? answer({ok: false, found: false, focused: null, main: null, focusedWindow: 'other', mainWindow: 'other'}) : answer();
  });
  assert.deepEqual(asked, ['323,149,480,300', '262,127,603,505']);
  assert.deepEqual([r.number, r.ok, r.focusedWindow, r.sheet], [9, true, 'run', 11]);
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
