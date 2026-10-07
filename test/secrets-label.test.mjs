import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isLabel, isReserved, RESERVED_PREFIX} from '../src/secrets/label.mjs';

test('keys follow the secrets mod grammar [A-Za-z_][A-Za-z0-9_]*', () => {
  for (const ok of ['a', 'Z', '_', '_lead', 'WORK_PASSWORD', 'work_password2', 'x'.repeat(200)]) assert.equal(isLabel(ok), true, ok);
  for (const bad of ['', '0', '9lead', '-lead', '.lead', 'work-password', 'a.b', 'has space', 'slash/no', 'colon:no', '{{secret:x}}', 'é', 'nl\n', 'a\nb', 'nul\0', 7, null, undefined, ['a']])
    assert.equal(isLabel(bad), false, JSON.stringify(bad));
});

// In any case: macOS's default file system is case-insensitive, so cua_device_<id> opens the file CUA_DEVICE_<id>.
test('keys starting CUA_DEVICE_, in any case, are reserved for device credentials; nothing else is', () => {
  assert.equal(RESERVED_PREFIX, 'CUA_DEVICE_');
  for (const key of ['CUA_DEVICE_nuadM_MUKSbSN4L59EffLQ', 'CUA_DEVICE_', 'CUA_DEVICE_x', 'cua_device_x', 'Cua_Device_nuadM_MUKSbSN4L59EffLQ', 'cUA_dEVICE_'])
    assert.equal(isReserved(key), true, key);
  for (const key of ['CUA_DEVICE', 'cua_device', 'X_CUA_DEVICE_x', 'CUA_DEVICES', 'WORK_PASSWORD', '', null, undefined, 7, ['CUA_DEVICE_x']])
    assert.equal(isReserved(key), false, JSON.stringify(key));
});
