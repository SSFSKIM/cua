import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isLabel} from '../src/secrets/label.mjs';

test('labels follow [A-Za-z0-9][A-Za-z0-9._-]{0,127}', () => {
  for (const ok of ['a', 'Z', '0', 'work-password', 'a.b_c-d', 'x'.repeat(128)]) assert.equal(isLabel(ok), true, ok);
  for (const bad of ['', '-lead', '.lead', '_lead', 'has space', 'slash/no', 'colon:no', '{{secret:x}}', 'é', 'x'.repeat(129), 'nl\n', 'a\nb', 'nul\0', 7, null, undefined, ['a']])
    assert.equal(isLabel(bad), false, JSON.stringify(bad));
});
