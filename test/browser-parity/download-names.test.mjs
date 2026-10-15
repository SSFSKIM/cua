import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureDownloadPathGuard} from './support/fixture-download-name.mjs';
import chooser from './scenarios/downloads/chooser.mjs';
import twoTabs from './scenarios/downloads/two-tabs.mjs';
import blockedNavigation from './scenarios/downloads/blocked-navigation.mjs';
import {readdirSync} from 'node:fs';

// The corpus reads a download only when its path names this fixture's artifact. Chrome names a repeated download
// `parity (n).txt` and, once those run out, `parity - YYYY-MM-DDTdddddd.ddd.txt` (observed on the mini, M3 task 4).
const guard = new RegExp(fixtureDownloadPathGuard.slice(1, -1));

test('the fixture download guard accepts exactly the observed Chrome names', () => {
  for (const name of ['parity.txt', 'parity (1).txt', 'parity (100).txt', 'parity - 2026-10-15T211005.985.txt']) {
    assert.ok(guard.test(`/Users/x/Downloads/${name}`), name);
  }
  for (const name of [
    'parity.txt.exe', 'other.txt', 'xparity.txt', 'parity (a).txt', 'parity - 2026-10-15.txt',
    'parity - 2026-10-15T21100.985.txt', 'parity - 2026-10-15T211005.98.txt', 'parity-2026-10-15T211005.985.txt',
    'parity - 2026-10-15T211005.985 (1).txt', 'parity (1) - 2026-10-15T211005.985.txt',
  ]) {
    assert.ok(!guard.test(`/Users/x/Downloads/${name}`), name);
  }
  assert.ok(!guard.test('parity.txt'), 'a relative path is not a fixture path');
});

test('every download case that reads the fixture artifact guards its path with that grammar, identically for either host', () => {
  const cells = [
    chooser.cells.find(c => c.label === 'path'),
    twoTabs.cells.find(c => c.label === 'both'),
    blockedNavigation.cells.find(c => c.label === 'armed'),
  ];
  for (const {code} of cells) {
    assert.ok(code.includes(`const expected=${fixtureDownloadPathGuard};`), code.slice(0, 120));
    assert.equal(code.split('const expected=').length, 2);
  }
});

test('no corpus scenario keeps another grammar for the fixture artifact', async () => {
  const dir = new URL('./scenarios/downloads/', import.meta.url);
  for (const file of readdirSync(dir).filter(name => name.endsWith('.mjs'))) {
    const {default: scenario} = await import(new URL(file, dir));
    for (const {code = ''} of scenario.cells) {
      const named = code.split('/parity').length - 1;
      const guarded = code.split(fixtureDownloadPathGuard).length - 1;
      assert.equal(named, guarded, `${file}: every fixture-name pattern is the shared guard`);
    }
  }
});
