// The timing diagnosis's plans (scripts/cursor-sitting/diagnose.mjs) go through the same guards as the sitting's: every
// cell names its scene, every timed key series waits for TextEdit's run window on top, every session that acts was opened.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PLANS} from '../../scripts/cursor-sitting/diagnose.mjs';
import {scenesOf} from '../../scripts/cursor-sitting/target-guard.mjs';

test('every diagnosis cell carries its scene, its key series the key guard, and runs on an opened session', () => {
  for (const [name, plan] of Object.entries(PLANS)) {
    const steps = plan({rounds: 2});
    const opened = new Set(steps.filter(s => s.open).map(s => s.open));
    for (const step of steps.filter(s => s.run)) {
      assert.ok(opened.has(step.run), `${name}: ${step.label}`);
      assert.ok(scenesOf(step.cell).length >= 1, `${name}: ${step.label}`);
      if (step.cell.includes('pressKey')) assert.equal(step.keys, 'textedit', `${name}: ${step.label}`);
    }
  }
});
