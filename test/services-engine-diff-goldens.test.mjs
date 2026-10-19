// The diff's goldens (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system, parts 3 and
// 7; test/native-goldens/PROVENANCE.md): each scene's action sequence, the observation before one click and the
// default-mode observation after it in the same lineage. cua's diff is pinned byte for byte (cua.diff.txt), and against
// the vendor's diff text of the same sequence it differs only as test/native-goldens/expected.json declares.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compare} from './native-goldens/compare.mjs';
import {SCENES, STRUCTURAL, declared, read, renderDiff, pinned, shot} from './native-goldens/goldens.mjs';

for (const scene of SCENES) {
  test(`${scene}: the diff of the recorded action is pinned`, () => {
    const text = renderDiff(scene);
    assert.equal(text, pinned(scene, 'cua.diff.txt', text), 'the pinned diff changed; review it and rerun with UPDATE_GOLDENS=1');
  });

  test(`${scene}: against the vendor's diff, only the declared differences`, () => {
    const rules = declared(scene, 'diff');
    const state = rules.find(rule => rule.kind === 'state');
    if (state) {
      // The two lanes' actions left different states; the declaration names why, and cua's own answer is checked.
      assert.ok(renderDiff(scene, rules).startsWith(`There has been no change in the accessibility tree for Window: "${shot(scene, 'action.after.skyshot.json').window.title}".`));
      return;
    }
    const judge = these => compare(read(scene, 'action.vendor.diff.txt'), renderDiff(scene, these), {kind: 'diff', structural: STRUCTURAL.has(scene), declared: these});
    assert.deepEqual(judge(rules).differences, []);
    for (const rule of rules.filter(each => each.scene === scene && each.golden === 'diff')) {
      assert.notDeepEqual(judge(rules.filter(each => each !== rule)).differences, [], `${rule.kind} is declared but changes nothing`);
    }
  });
}

test('the action pairs share a lineage, so the diff is a diff', () => {
  for (const scene of SCENES) assert.equal(shot(scene, 'action.before.skyshot.json').lineage, shot(scene, 'action.after.skyshot.json').lineage, scene);
});
