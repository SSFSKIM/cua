// Source recordings remain untouched; installed goldens differ only by the documented account-home substitution.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {ROOT, SOURCE, SOURCED, fromSource} from './native-goldens/source.mjs';

test('every sourced golden is exactly its capture with only the recorded home prefix anonymized', () => {
  const meta = JSON.parse(readFileSync(join(ROOT, SOURCE.dir, '..', 'meta.json')));
  const home = meta.runDir.slice(0, meta.runDir.indexOf('/Library/'));
  for (const scene of ['chrome', 'electron', 'finder', 'textedit']) for (const name of SOURCED) {
    const original = readFileSync(join(ROOT, SOURCE.dir, scene, name), 'utf8');
    assert.equal(fromSource(scene, name), original.split(home + '/').join('/Users/xxx/'), `${scene}/${name}`);
  }
});
