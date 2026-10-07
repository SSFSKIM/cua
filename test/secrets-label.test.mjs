import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isLabel} from '../src/secrets/label.mjs';

test('keys follow the secrets mod grammar [A-Za-z_][A-Za-z0-9_]*', () => {
  for (const ok of ['a', 'Z', '_', '_lead', 'WORK_PASSWORD', 'work_password2', 'x'.repeat(200)]) assert.equal(isLabel(ok), true, ok);
  for (const bad of ['', '0', '9lead', '-lead', '.lead', 'work-password', 'a.b', 'has space', 'slash/no', 'colon:no', '{{secret:x}}', 'é', 'nl\n', 'a\nb', 'nul\0', 7, null, undefined, ['a']])
    assert.equal(isLabel(bad), false, JSON.stringify(bad));
});
