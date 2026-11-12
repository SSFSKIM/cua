import assert from 'node:assert/strict';
import { test } from 'node:test';

import { APP_IDENTITY } from '../../scripts/linux-engine-diff/app-identity.mjs';
import { FAMILIES } from '../../scripts/linux-engine-diff/families.mjs';
import { SCENE_OPS } from '../../scripts/linux-engine-diff/ops.mjs';
import { SCENE_FAMILY } from '../../scripts/linux-engine-diff/run.mjs';

test('every family an opener can name has a declared identity, so no runner meets one it cannot verify', () => {
  assert.deepEqual(Object.keys(FAMILIES).filter((name) => !APP_IDENTITY[name]), []);
});

test("every differential-run scene that opens a window is verified as a declared family's", () => {
  // `desktop` opens no window; `paste-target` is the safety cases' own window (safety.mjs), never opened by openScene
  const opened = Object.keys(SCENE_OPS).filter((s) => !['desktop', 'paste-target'].includes(s));
  assert.deepEqual(opened.filter((s) => !SCENE_FAMILY[s]), []);
  assert.deepEqual(Object.entries(SCENE_FAMILY).filter(([, family]) => !APP_IDENTITY[family]), []);
  // a few the run reads as their family's, by the opener behind them
  assert.equal(SCENE_FAMILY['device-qt'], 'kate');
  assert.equal(SCENE_FAMILY['minimized-xterm'], 'xterm');
  assert.equal(SCENE_FAMILY['chrome-address-bar'], 'chrome');
});
