import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { changedFields, dndLanes } from '../../scripts/linux-engine-diff/dnd.mjs';
import { readQtCounts } from '../../scripts/linux-engine-diff/families.mjs';
import { KIND_FAMILIES, QT_TOOL_BUTTON, hoverTarget } from '../../scripts/linux-engine-diff/kinds.mjs';

const args = { vendor: '/v', newest: null, cua: '/c', variants: [{ label: 'cua:dedicated', args: ['--desktop', 'dedicated'] }] };

test('the drag-and-drop lanes: the window-in-front lane runs only when asked for, and --lanes narrows them', () => {
  assert.deepEqual(dndLanes(args).map((l) => l.label), ['pinned', 'cua', 'cua:dedicated']);
  const asked = dndLanes({ ...args, lanes: ['cua', 'cua:active', 'cua:dedicated'] });
  assert.deepEqual(asked.map((l) => [l.label, l.bin, l.args, Boolean(l.activate)]), [
    ['cua', '/c', [], false],
    ['cua:active', '/c', [], true],
    ['cua:dedicated', '/c', ['--desktop', 'dedicated'], false],
  ]);
});

test('a drop changes the desktop in the fields that differ', () => {
  const before = { active: 1, focus: 2, stacking: [1, 2] };
  assert.deepEqual(changedFields(before, before), []);
  assert.deepEqual(changedFields(before, { active: 3, focus: 3, stacking: [2, 1] }), ['active', 'focus', 'stacking']);
});

test("the Qt style scenes measure the move on their tool button's highlight, beside its hover count", async () => {
  assert.deepEqual(KIND_FAMILIES['qt5-breeze'], ['move']);
  assert.deepEqual(KIND_FAMILIES['qt5-fusion'], ['move']);
  assert.deepEqual(await hoverTarget(null, null, { family: 'qt5-breeze', kindOf: 'qt-style' }), QT_TOOL_BUTTON);
  const record = join(mkdtempSync(join(tmpdir(), 'qt-counts-')), 'counts');
  writeFileSync(record, 'moves 0 wheels 0 presses 0 hovers 0\nmoves 3 wheels 1 presses 2 hovers 4\n');
  assert.deepEqual(readQtCounts({ record }), { moves: 3, wheels: 1, presses: 2, hovers: 4 });
  writeFileSync(record, '');
  assert.equal(readQtCounts({ record }), null);
});
