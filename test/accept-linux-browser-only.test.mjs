// The browser-only fixture's judges (#171 M6a, T6; the M6a pre-flight §5.2, "The browser-only session", F7): the tool
// list, where the kernel's resolver selected each of the six packages, their imports and native uses, and the native
// files mapped. Each judge has its negative control here; the cells themselves are checked to parse.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BY_NAME, COMPARED, ENTRIES, SPECIFIERS, cellJson, importComparison, nativesProblems, selectionCell, selectionProblems, toolsProblems, useCell, useProblems} from '../scripts/accept/linux-browser-only.mjs';

const ROOT = '/run/user/.local/share/cua/modules/b71dc1f8185d';
const MODULES = `${ROOT}/node_modules`;
const identity = path => path;
const selected = () => Object.fromEntries(SPECIFIERS.map(spec => [spec, `${MODULES}/${ENTRIES[spec]}`]));

test('the six entries are the pre-flight\'s: three ES modules and three CommonJS files', () => {
  assert.deepEqual(ENTRIES, {playwright: 'playwright/index.mjs', sharp: 'sharp/dist/index.mjs', pixelmatch: 'pixelmatch/index.js', pngjs: 'pngjs/lib/png.js',
    'jpeg-js': 'jpeg-js/index.js', 'classic-level': 'classic-level/index.js'});
});

test('the selection passes when each entry is the one named, in the module tree', () => {
  assert.deepEqual(selectionProblems({selected: selected(), moduleDir: MODULES, real: identity}), []);
});

test('negative control: an entry from the vendor tree, another entry of the package, or none fails the selection', () => {
  const vendor = {...selected(), sharp: '/run/user/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/sharp/dist/index.mjs'};
  assert.match(selectionProblems({selected: vendor, moduleDir: MODULES, real: identity}).join('; '), /sharp selected .*runtimes.*, not .*modules/);
  const cjs = {...selected(), playwright: `${MODULES}/playwright/index.js`};
  assert.match(selectionProblems({selected: cjs, moduleDir: MODULES, real: identity}).join('; '), /playwright selected .*index\.js/);
  const none = {...selected(), pngjs: null};
  assert.match(selectionProblems({selected: none, moduleDir: MODULES, real: identity}).join('; '), /pngjs was not selected/);
  assert.deepEqual(selectionProblems({selected: null, moduleDir: MODULES}), ['the cell reported no selection']);
});

test('a selection is compared by real path, so a spelling through a link is the same entry', () => {
  const linked = {...selected(), pngjs: '/link/pngjs/lib/png.js'};
  const real = path => path.replace('/link/', `${MODULES}/`);
  assert.deepEqual(selectionProblems({selected: linked, moduleDir: MODULES, real}), []);
});

// The kernel's loader refuses these two by name under the cua before M6a too (the coordinator's ruling on F7, task 152):
// their by-name outcome is compared with the older cua's, and sharp runs through require.
const PW = 'The requested module \'./index.js\' does not provide an export named \'default\'';
const SHARP = 'Unsupported import specifier "../package.json" in node_repl. Only .js and .mjs files are supported.';
const older = {playwright: PW, sharp: SHARP, pixelmatch: 'ok', pngjs: 'ok', 'jpeg-js': 'ok', 'classic-level': 'ok'};
// Playwright loaded through require from the kernel's base (ruling 1162): its entry and playwright-core's, from the tree.
const loaded = (o = {}) => ({playwright: {entry: `${MODULES}/playwright/index.js`, core: `${MODULES}/playwright-core/index.js`, files: 120, outside: [], ...o}});
const use = (o = {}) => ({imported: {...older}, used: {playwright: 'ok', sharp: 'ok', 'classic-level': 'ok'}, via: {playwright: 'require', sharp: 'require', 'classic-level': 'import'},
  loaded: loaded(), ...o});

test('the by-name four are judged by name; playwright and sharp by the older cua\'s outcome; sharp runs through require', () => {
  assert.deepEqual(BY_NAME, ['pixelmatch', 'pngjs', 'jpeg-js', 'classic-level']);
  assert.deepEqual(COMPARED, ['playwright', 'sharp']);
  assert.deepEqual(useProblems(use(), {older, root: ROOT}), []);
});

test('negative control: a playwright that resolves but is not loaded through require from the module tree fails (ruling 1162)', () => {
  // Resolved only: the cell never loaded it.
  assert.match(useProblems(use({used: {sharp: 'ok', 'classic-level': 'ok'}, loaded: {}}), {older, root: ROOT}).join('; '), /playwright did not run \(not tried\).*playwright's entry was not loaded/);
  assert.match(useProblems(use({via: {playwright: 'import', sharp: 'require'}}), {older, root: ROOT}).join('; '), /playwright did not run through require \(import\)/);
  // Loaded, but from somewhere else, or with a file of it from outside the tree.
  const vendor = '/run/user/.local/share/cua/runtimes/26/cua_node/lib/node_modules';
  assert.match(useProblems(use({loaded: loaded({entry: `${vendor}/playwright/index.js`})}), {older, root: ROOT}).join('; '), /playwright's entry was loaded from .*runtimes.*, not the module tree/);
  assert.match(useProblems(use({loaded: loaded({core: null})}), {older, root: ROOT}).join('; '), /playwright-core's entry was not loaded/);
  assert.match(useProblems(use({loaded: loaded({outside: [`${vendor}/playwright-core/lib/x.js`]})}), {older, root: ROOT}).join('; '), /1 file of playwright loaded from outside the module tree/);
});

test('negative control: a by-name package that does not import, or a native use that fails, fails the imports', () => {
  assert.match(useProblems(use({imported: {...older, 'jpeg-js': 'ERR_MODULE_NOT_FOUND'}}), {older, root: ROOT}).join('; '), /jpeg-js did not import \(ERR_MODULE_NOT_FOUND\)/);
  assert.match(useProblems(use({used: {sharp: 'ok', 'classic-level': 'EACCES'}}), {older, root: ROOT}).join('; '), /classic-level did not run \(EACCES\)/);
  assert.match(useProblems(use({used: {'classic-level': 'ok'}}), {older, root: ROOT}).join('; '), /sharp did not run \(not tried\)/);
  assert.deepEqual(useProblems(null, {older, root: ROOT}), ['the cell reported no imports']);
});

test('negative control: any new difference from the older cua\'s by-name outcome fails, a new success included', () => {
  assert.match(useProblems(use({imported: {...older, sharp: 'Cannot find module \'sharp\''}}), {older, root: ROOT}).join('; '), /sharp's import by name differs from the cua before M6a's: "Cannot find module 'sharp'" here, "Unsupported/);
  assert.match(useProblems(use({imported: {...older, playwright: 'ok'}}), {older, root: ROOT}).join('; '), /playwright's import by name differs .*"ok" here/);
  // A path in the message is not a difference: the two trees lie in different places.
  const pathed = {...older, sharp: 'Cannot read /home/a/runtimes/x/sharp/package.json'};
  assert.deepEqual(useProblems(use({imported: {...pathed, sharp: 'Cannot read /home/b/modules/y/sharp/package.json'}}), {older: pathed, root: ROOT}), []);
});

test('negative control: no outcome of the older cua to compare with, or sharp not run through require, fails', () => {
  assert.match(useProblems(use(), {older: null, root: ROOT}).join('; '), /no outcome of the cua before M6a to compare playwright's import with/);
  assert.match(useProblems(use({via: {sharp: 'import'}}), {older, root: ROOT}).join('; '), /sharp did not run through require \(import\)/);
});

test('the comparison names each compared package\'s outcome here and under the older cua', () => {
  assert.deepEqual(importComparison(use(), older), {playwright: {here: PW, older: PW, same: true}, sharp: {here: SHARP, older: SHARP, same: true}});
  assert.deepEqual(importComparison(use({imported: {...older, sharp: 'ok'}}), null).sharp, {here: 'ok', older: null, same: false});
});

const natives = [`${MODULES}/classic-level/prebuilds/linux-x64/classic-level.glibc.node`, `${MODULES}/@img/sharp-linux-x64/lib/sharp-linux-x64.node`,
  `${MODULES}/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.17.3`];

test('the mapped natives pass when each kind is mapped from the module tree and nothing native from elsewhere', () => {
  assert.deepEqual(nativesProblems({natives, root: ROOT}), []);
});

test('negative control: a native mapped from the vendor tree, or a kind not mapped at all, fails', () => {
  const vendor = [...natives, '/run/user/.local/share/cua/runtimes/26/cua_node/lib/node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.17.3'];
  assert.match(nativesProblems({natives: vendor, root: ROOT}).join('; '), /runtimes.* is mapped from outside the module tree/);
  assert.match(nativesProblems({natives: natives.slice(1), root: ROOT}).join('; '), /classic-level's addon is not mapped/);
  assert.match(nativesProblems({natives: [], root: ROOT}).join('; '), /sharp's addon is not mapped.*libvips is not mapped/);
  assert.deepEqual(nativesProblems({natives: null, root: ROOT}), ['the cell reported no mapped files']);
});

test('the tool list must carry js, end_task and profiles_list', () => {
  assert.deepEqual(toolsProblems(['js', 'js_reset', 'end_task', 'profiles_list', 'secrets_list']), []);
  assert.deepEqual(toolsProblems(['js', 'end_task']), ['the tool list lacks profiles_list']);
  assert.deepEqual(toolsProblems(undefined), ['tools/list gave no list']);
});

test('a cell\'s own line of JSON is read by its key, and nothing else is taken for it', () => {
  assert.deepEqual(cellJson('docs...\n{"selection":{"bases":["/b"],"selected":{}}}\n', 'selection'), {bases: ['/b'], selected: {}});
  assert.equal(cellJson('{"use":{"imported":{}}', 'use'), null);
  assert.equal(cellJson('{"other":1}', 'use'), null);
});

test('the cells parse as the kernel would run them: async bodies', () => {
  const AsyncFunction = (async () => {}).constructor;
  for (const source of [selectionCell(SPECIFIERS), useCell()]) assert.doesNotThrow(() => new AsyncFunction('nodeRepl', 'cua', source));
});
