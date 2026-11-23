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

// The pre-flight's sitting D (§7): items 1 to 8, 10, 11, 12 and 13, with --live-textedit and --live-secrets, never the
// release gates (item 9). Its exact selection must be valid as written, carry every dependency, and leave no item
// BLOCKED for want of an opt-in.
const SITTING_D = '1,2,3,4,5,6,7,8,10,11,12,13';

test('sitting D\'s exact selection resolves with its dependencies and without the release gates', () => {
  const selected = lib.acceptanceSelection(SITTING_D);
  assert.deepEqual([...selected].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13]);
  assert.equal(selected.has(9), false, 'item 9, the release gates, is never part of sitting D');
  for (const [item, needs] of Object.entries(lib.ITEM_DEPENDENCIES)) {
    if (selected.has(Number(item))) for (const need of needs) assert.ok(selected.has(need), `item ${item} brings item ${need}`);
  }
  assert.deepEqual(lib.optInGaps(selected, {'live-textedit': true, 'live-secrets': true}), []);
});

test('--live-textedit alone leaves item 6 BLOCKED for want of --live-secrets, as the run reports before any item', () => {
  const selected = lib.acceptanceSelection(SITTING_D);
  assert.deepEqual(lib.optInGaps(selected, {'live-textedit': true}), [{item: 6, flag: '--live-secrets'}]);
  assert.deepEqual(lib.optInGaps(selected, {}), [
    {item: 5, flag: '--live-textedit'}, {item: 6, flag: '--live-secrets'}, {item: 8, flag: '--live-textedit'},
  ]);
  // An unfiltered run selects every item, the owner's onboarding included.
  assert.deepEqual(lib.optInGaps(null, {'live-textedit': true, 'live-secrets': true}), [{item: 14, flag: '--fresh-onboarding'}]);
  assert.deepEqual(lib.optInGaps(lib.acceptanceSelection('1,7,8'), {'live-secrets': true}), [{item: 8, flag: '--live-textedit'}]);
});

// Items 6 and 7 consume the live secrets probe. A probe whose output did not complete (a descendant held its pipes)
// may not have finished, so whatever report it left proves nothing: the evidence is missing, which both items FAIL on.
test('an incomplete secrets-probe run is missing evidence for its consumers, whatever report it left', () => {
  const report = {status: 'PASS', steps: [{name: 'x', status: 'PASS'}]};
  const incomplete = lib.secretsProbeEvidence({result: {code: 0, streamsIncomplete: true}, report, ended: 'exit 0'});
  assert.match(incomplete.missing, /did not complete/);
  assert.deepEqual(incomplete.steps, []);
  assert.equal(lib.secretsProbeEvidence({result: {code: 0, streamsIncomplete: false}, report, ended: 'exit 0'}), report);
  assert.match(lib.secretsProbeEvidence({result: {code: 1, streamsIncomplete: false}, report: null, ended: 'exit 1', lastError: 'boom'}).missing, /wrote no report \(exit 1\): boom/);
});
