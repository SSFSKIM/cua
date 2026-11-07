// M4's T9, the remaining fixed waits: the harness's side (display-free).
import assert from 'node:assert/strict';
import test from 'node:test';

import { cellsFor } from '../../scripts/linux-engine-diff/action-settle-cells.mjs';
import { SPEED_GAPS, declaredSpeedGap } from '../../scripts/linux-engine-diff/deviations.mjs';
import { eventSpeeds } from '../../scripts/linux-engine-diff/events.mjs';

test("desktop move's later requests are no declared gap any more: a loss there fails", () => {
  assert.equal(declaredSpeedGap({ op: 'move', route: 'desktop', series: 'later' }), null);
  assert.deepEqual(SPEED_GAPS, []);
  const rows = (centre) => Array.from({ length: 20 }, (_, i) => ({ command: 'move', ms: centre + (i % 5) * 0.01, first: false, scenario: 's', step: 1 }));
  const [move] = eventSpeeds([], { blocks: [{ route: 'desktop', records: { pinned: rows(8.6), newest: rows(6), cua: rows(8.5) } }] });
  assert.equal(move.verdict, 'fail');
});

test('the desktop route carries pointer input into every family of the matrix in the settle experiment', () => {
  const pointer = ['click', 'move', 'scroll', 'drag', 'drag_handle'];
  for (const family of ['chrome', 'electron', 'gedit', 'kate', 'qtcreator', 'writer', 'gnome-terminal', 'xterm', 'gtk3', 'qt5', 'qt6']) {
    assert.ok(cellsFor({ families: [family], routes: ['desktop'] }).some((c) => pointer.includes(c.kind)), family);
  }
  // GTK 4 and Gecko take it in front, through the foreground route's XTEST
  for (const family of ['gtk4', 'firefox']) assert.ok(cellsFor({ families: [family], routes: ['dedicated'] }).some((c) => pointer.includes(c.kind)), family);
});
