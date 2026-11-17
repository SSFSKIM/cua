// A scene window kept wholly on the screen whatever its frame (scripts/linux-engine-diff/scenes.mjs `fitted`,
// `frameExtentsOf`; task 62's fix wave): this VM's title bar grew 2 px when its fonts changed (2026-11-07), and a
// 1050x780 Firefox window then ran off the 800 px screen, so every case that needs it fully visible was refused.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FIT_MARGIN, SCREEN, fitted, frameExtentsOf } from '../../scripts/linux-engine-diff/scenes.mjs';

test('a window keeps its size where its frame fits on the screen with the margin, and shrinks to fit where it would not', () => {
  assert.deepEqual(SCREEN, [1280, 800]);
  assert.equal(FIT_MARGIN, 8);
  // Openbox's frame before the font change (a 20 px title bar) and after it (22 px), 1 px borders, a 4 px handle
  assert.deepEqual(fitted([1050, 780], [1, 1, 20, 4]), [1050, 768], 'off by 4 px with the margin even before');
  assert.deepEqual(fitted([1050, 780], [1, 1, 22, 4]), [1050, 766]);
  assert.deepEqual(fitted([910, 756], [1, 1, 22, 4]), [910, 756], 'gedit fits as it is');
  assert.deepEqual(fitted([1280, 800], [0, 0, 0, 0]), [1272, 792], 'no frame: the margin alone');
  assert.deepEqual(fitted([1300, 700], [4, 4, 30, 4]), [1264, 700]);
  // the frame then lies inside the screen with the margin to spare
  const [left, right, top, bottom] = [1, 1, 22, 4];
  const [w, h] = fitted([1050, 780], [left, right, top, bottom]);
  assert.ok(top + h + bottom + FIT_MARGIN <= SCREEN[1] && left + w + right + FIT_MARGIN <= SCREEN[0]);
});

test('the frame\'s extents are read from _NET_FRAME_EXTENTS; with none, the window has no frame', () => {
  assert.deepEqual(frameExtentsOf('_NET_FRAME_EXTENTS(CARDINAL) = 1, 1, 22, 4\n'), [1, 1, 22, 4]);
  assert.deepEqual(frameExtentsOf('_NET_FRAME_EXTENTS:  not found.\n'), [0, 0, 0, 0]);
  assert.deepEqual(frameExtentsOf(''), [0, 0, 0, 0]);
});
