// The renderer's goldens (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system, parts 3
// and 7; test/native-goldens/PROVENANCE.md): on each scene's fixed state, cua's rendering of the recorded Skyshot is
// pinned byte for byte (cua.txt), and against the vendor's text of the same state, recorded in the same sitting, it
// differs only as test/native-goldens/expected.json declares, under part 3's modulo-renumbering rule.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join} from 'node:path';
import {compare} from './native-goldens/compare.mjs';
import {SCENES, STRUCTURAL, DIR, declared, read, renderFull, pinned, shot} from './native-goldens/goldens.mjs';
import {rekey} from './native-goldens/rekey.mjs';

const SOURCE = join(DIR, '../../docs/doperpowers/research/2026-10-18-own-native-engine/spike/sit2/u9/cua/run-2/goldens');

for (const scene of SCENES) {
  test(`${scene}: the rendering of the recorded Skyshot is pinned`, () => {
    const text = renderFull(scene);
    assert.equal(text, pinned(scene, 'cua.txt', text), 'the pinned rendering changed; review it and rerun with UPDATE_GOLDENS=1');
  });

  test(`${scene}: against the vendor's text, only the declared differences`, () => {
    const rules = declared(scene, 'full');
    const result = compare(read(scene, 'vendor.txt'), renderFull(scene, rules), {structural: STRUCTURAL.has(scene), declared: rules});
    assert.deepEqual(result.differences, []);
    // Part 3: no golden declares more than 10% added lines without a Decision Log entry.
    assert.ok(result.added <= result.lines * 0.1 || rules.some(rule => rule.kind === 'addedOverTenPercent'), `${result.added} of ${result.lines} lines added`);
  });

  test(`${scene}: every declared difference is needed`, () => {
    const rules = declared(scene, 'full');
    for (const rule of rules.filter(each => each.scene === scene)) {
      const without = rules.filter(each => each !== rule);
      const result = compare(read(scene, 'vendor.txt'), renderFull(scene, without), {structural: STRUCTURAL.has(scene), declared: without});
      assert.notDeepEqual(result.differences, [], `${rule.kind} ${rule.correction ?? ''} is declared but changes nothing`);
    }
  });

  test(`${scene}: the Skyshot golden is the recorded capture, re-keyed`, () => {
    const recorded = JSON.parse(fs.readFileSync(join(SOURCE, `${scene}.skyshot.json`), 'utf8'));
    assert.deepEqual(shot(scene, 'skyshot.json'), rekey(recorded));
  });
}

test('the scenes\' disclosable correction is needed somewhere', () => {
  const universal = declared('chrome', 'full').filter(rule => rule.scene === '*');
  assert.ok(universal.length > 0);
  for (const rule of universal) {
    const needed = SCENES.some(scene => {
      const without = declared(scene, 'full').filter(each => each !== rule);
      return compare(read(scene, 'vendor.txt'), renderFull(scene, without), {structural: STRUCTURAL.has(scene), declared: without}).differences.length > 0;
    });
    assert.ok(needed, `${rule.correction} is declared but changes nothing`);
  }
});
