// Every acceptance script parses, and the ones accept-native.mjs imports load. Most run only on a device, so the unit
// suite never executes them; a syntax error in one (a nested template left unescaped inside a cell's source) would
// otherwise surface first as accept-native crashing on load there.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {REPO} from './fixtures/runtime-fixture.mjs';

const ACCEPT = join(REPO, 'scripts', 'accept');
const scripts = [...readdirSync(ACCEPT).filter(name => name.endsWith('.mjs')).map(name => join(ACCEPT, name)), join(REPO, 'scripts', 'accept-native.mjs')];

test('every acceptance script parses (node --check)', () => {
  assert.ok(scripts.length > 2);
  for (const file of scripts) {
    const run = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8'});
    assert.equal(run.status, 0, `${file}: ${run.stderr}`);
  }
});

test('the modules accept-native.mjs imports from scripts/accept load and export what it imports', async () => {
  const source = readFileSync(join(REPO, 'scripts', 'accept-native.mjs'), 'utf8');
  const imports = [...source.matchAll(/^import \{([^}]+)\} from '\.\/accept\/([\w-]+\.mjs)';$/gm)];
  assert.ok(imports.some(([, , file]) => file === 'own-sandbox.mjs'), 'accept-native imports own-sandbox.mjs');
  for (const [, names, file] of imports) {
    const module = await import(join(ACCEPT, file));
    for (const name of names.split(',').map(n => n.trim()).filter(Boolean)) assert.equal(typeof module[name] === 'undefined', false, `${file} exports ${name}`);
  }
});
