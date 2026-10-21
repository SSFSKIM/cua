// The renderer's goldens (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system, parts 3
// and 7; test/native-goldens/PROVENANCE.md): on each scene's fixed state, cua's rendering of the recorded Skyshot is
// pinned byte for byte (cua.txt), and against the vendor's text of the same state, recorded in the same sitting, it
// differs only as test/native-goldens/expected.json declares, under part 3's modulo-renumbering rule. The action's first
// observation is a second full comparison per scene.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SCENES, declared, read, renderFull, pinned, compareFull, compareBefore, allowsAddedLines} from './native-goldens/goldens.mjs';
import {SOURCED, fromSource} from './native-goldens/source.mjs';

for (const scene of SCENES) {
  test(`${scene}: the rendering of the recorded Skyshot is pinned`, () => {
    const text = renderFull(scene);
    assert.equal(text, pinned(scene, 'cua.txt', text), 'the pinned rendering changed; review it and rerun with UPDATE_GOLDENS=1');
  });

  for (const [golden, judge] of [['full', compareFull], ['before', compareBefore]]) {
    test(`${scene} (${golden}): against the vendor's text, only the declared differences`, () => {
      const rules = declared(scene, golden);
      const result = judge(scene, rules);
      assert.deepEqual(result.differences, []);
      // Part 3: no golden adds more than 10% of its lines without a Decision Log entry.
      assert.ok(result.added <= result.lines * 0.1 || allowsAddedLines(rules), `${result.added} of ${result.lines} lines added`);
    });

    test(`${scene} (${golden}): every declared difference is needed`, () => {
      const rules = declared(scene, golden);
      for (const rule of rules.filter(each => each.scene === scene)) {
        assert.notDeepEqual(judge(scene, rules.filter(each => each !== rule)).differences, [], `${rule.kind} ${rule.correction ?? rule.cua ?? rule.head ?? ''} is declared but changes nothing`);
      }
    });
  }

  test(`${scene}: every golden file is its source capture, re-keyed or copied`, () => {
    for (const name of SOURCED) assert.equal(read(scene, name), fromSource(scene, name), name);
  });
}

test('each declaration for every scene is needed in some scene', () => {
  // None may remain once the live recording's audit has deleted the expired ones; any that does must be needed.
  const universal = declared(SCENES[0], 'full').filter(rule => rule.scene === '*');
  for (const rule of universal) {
    const needed = SCENES.some(scene => ['full', 'before'].some(golden => {
      const judge = golden === 'full' ? compareFull : compareBefore;
      return judge(scene, declared(scene, golden).filter(each => each !== rule)).differences.length > 0;
    }));
    assert.ok(needed, `${rule.correction} is declared but changes nothing`);
  }
});

test('more than 10% added lines needs a declaration naming a Decision Log entry the spec has', () => {
  assert.equal(allowsAddedLines([]), false);
  assert.equal(allowsAddedLines([{kind: 'addedOverTenPercent'}]), false);
  assert.equal(allowsAddedLines([{kind: 'addedOverTenPercent', decisionLog: 'no such entry in the spec'}]), false);
  // Cited by an entry's dated opening; any other substring of the log, or an undated entry, is not a citation.
  assert.equal(allowsAddedLines([{kind: 'addedOverTenPercent', decisionLog: 'Decision Log'}]), false);
  assert.equal(allowsAddedLines([{kind: 'addedOverTenPercent', decisionLog: '- Decision (review round 1 folded)'}]), false);
  assert.equal(allowsAddedLines([{kind: 'addedOverTenPercent', decisionLog: '- Decision (2026-10-18, verification call at authoring)'}]), true);
});
