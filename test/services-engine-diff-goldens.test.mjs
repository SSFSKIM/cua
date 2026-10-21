// The diff's goldens (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system, parts 3 and
// 7; test/native-goldens/PROVENANCE.md): each scene's action sequence, the observation before one click and the
// default-mode observation after it in the same lineage. cua's diff is pinned byte for byte (cua.diff.txt), and against
// the vendor's diff text of the same sequence it differs only as test/native-goldens/expected.json declares; its removed
// IDs and changed lines name the same elements as the vendor's, through the two lanes' first observations.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SCENES, declared, renderDiff, pinned, shot, compareDiff} from './native-goldens/goldens.mjs';

for (const scene of SCENES) {
  test(`${scene}: the diff of the recorded action is pinned`, () => {
    const text = renderDiff(scene);
    assert.equal(text, pinned(scene, 'cua.diff.txt', text), 'the pinned diff changed; review it and rerun with UPDATE_GOLDENS=1');
  });

  test(`${scene}: against the vendor's diff, only the declared differences`, () => {
    assert.deepEqual(compareDiff(scene, declared(scene, 'diff')).differences, []);
  });

  test(`${scene}: every declared difference of the diff is needed`, () => {
    const rules = declared(scene, 'diff');
    for (const rule of rules.filter(each => each.scene === scene && each.golden !== undefined)) {
      assert.notDeepEqual(compareDiff(scene, rules.filter(each => each !== rule)).differences, [], `${rule.kind} ${rule.cua ?? rule.head ?? ''} is declared but changes nothing`);
    }
  });
}

test('the action pairs share a lineage, so the diff is a diff', () => {
  for (const scene of SCENES) assert.equal(shot(scene, 'action.before.skyshot.json').lineage, shot(scene, 'action.after.skyshot.json').lineage, scene);
});
