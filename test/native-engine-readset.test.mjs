// cua's native engine, the reduced read set's rendering equivalence on a fake tree (docs/doperpowers/specs/
// 2026-10-18-own-native-engine-design.md, Decision Log 2026-10-19: reads are dropped only where the rendered text
// cannot change). The Swift case ReadSetTests walks one fake window under both read sets and writes both Skyshots;
// the stand-in renderer must print identical text from them. The live cell on the four scenes is the harness's.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PACKAGE, engineSkip} from './helpers/engine-wire.mjs';
import {render} from '../scripts/spike/engine/render.mjs';

test('the stand-in renderer prints the same text from the reduced read set as from the full one', {skip: engineSkip, timeout: 900_000}, t => {
  const dir = mkdtempSync(join(tmpdir(), 'cua-readset-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const out = join(dir, 'fixture.json');
  const result = spawnSync('swift', ['test', '--package-path', PACKAGE, '--scratch-path', join(tmpdir(), 'cua-engine-unit-build'),
    '--filter', 'ReadSetTests'], {encoding: 'utf8', timeout: 900_000, env: {...process.env, CUA_READSET_FIXTURE_OUT: out}});
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`.slice(-4000));
  const {full, reduced} = JSON.parse(readFileSync(out, 'utf8'));
  const text = render(full);
  assert.equal(render(reduced), text);
  // The fixture prints what the dropped reads could have changed: a settable field, the Markdown value, a secondary
  // action, a selected row, a disabled control.
  for (const piece of ['settable', '**Body** text', 'Secondary Actions', 'selected', 'disabled', 'settable, float']) {
    assert.ok(text.includes(piece), `the fixture's text shows ${piece}:\n${text}`);
  }
});
