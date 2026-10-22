import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as lib from '../scripts/accept/lib.mjs';

test('a partial selection refuses missing suite and result dependencies instead of fabricating verdicts', () => {
  for (const selection of ['7,8', '2', '1,2', '3', '6', '1,6', '8']) {
    assert.throws(() => lib.acceptanceSelection(selection), /requires.*--items/);
  }
  assert.deepEqual([...lib.acceptanceSelection('1,7,8')], [1,7,8]);
  assert.deepEqual([...lib.acceptanceSelection('1,2,3,4,6')], [1,2,3,4,6]);
});

test('the owner-only onboarding item can run alone without the unattended suite', () => {
  assert.deepEqual([...lib.acceptanceSelection('14')], [14]);
  assert.equal(lib.acceptanceSelection(undefined), null);
  for (const invalid of ['', '0', '15', '1,', 'x', '1.5', '1e0', '  ']) {
    assert.throws(() => lib.acceptanceSelection(invalid), /item numbers/);
  }
});
