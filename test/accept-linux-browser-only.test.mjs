// The browser-only fixture's judges (#171 M6a, T6; the M6a pre-flight §5.2, "The browser-only session", F7): the tool
// list, where the kernel's resolver selected each of the six packages, their imports and native uses, and the native
// files mapped. Each judge has its negative control here; the cells themselves are checked to parse.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BY_NAME, COMPARED, ENTRIES, SPECIFIERS, cellJson, importComparison, nativesProblems, playwrightProblems, selectionCell, selectionProblems, toolsProblems, useCell, useProblems} from '../scripts/accept/linux-browser-only.mjs';

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
// The by-name outcomes as the cell records them: 'ok', or the error's code and message (fix wave 1, #3).
const PW = {code: null, message: 'The requested module \'./index.js\' does not provide an export named \'default\''};
const SHARP = {code: null, message: 'Unsupported import specifier "../package.json" in node_repl. Only .js and .mjs files are supported.'};
const OLDER_BASE = '/run/user/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib';
const imported = {playwright: PW, sharp: SHARP, pixelmatch: 'ok', pngjs: 'ok', 'jpeg-js': 'ok', 'classic-level': 'ok'};
const older = {base: OLDER_BASE, imported};
const use = (o = {}) => ({base: ROOT, imported: {...imported}, used: {sharp: 'ok', 'classic-level': 'ok'}, via: {sharp: 'require', 'classic-level': 'import'}, ...o});

test('the by-name four are judged by name; playwright and sharp by the older cua\'s outcome; sharp runs through require', () => {
  assert.deepEqual(BY_NAME, ['pixelmatch', 'pngjs', 'jpeg-js', 'classic-level']);
  assert.deepEqual(COMPARED, ['playwright', 'sharp']);
  assert.deepEqual(useProblems(use(), {older}), []);
});

test('negative control: a by-name package that does not import, or a native use that fails, fails the imports', () => {
  assert.match(useProblems(use({imported: {...imported, 'jpeg-js': {code: 'ERR_MODULE_NOT_FOUND', message: 'Cannot find module'}}}), {older}).join('; '), /jpeg-js did not import \(ERR_MODULE_NOT_FOUND: Cannot find module\)/);
  assert.match(useProblems(use({used: {sharp: 'ok', 'classic-level': 'EACCES'}}), {older}).join('; '), /classic-level did not run \(EACCES\)/);
  assert.match(useProblems(use({used: {'classic-level': 'ok'}}), {older}).join('; '), /sharp did not run \(not tried\)/);
  assert.deepEqual(useProblems(null, {older}), ['the cell reported no imports']);
});

test('negative control (fix wave 1, #3): a different relative specifier, the same code with another message, or another code is a difference', () => {
  const other = {code: null, message: SHARP.message.replace('../package.json', '../other.json')};
  assert.match(useProblems(use({imported: {...imported, sharp: other}}), {older}).join('; '), /sharp's import by name differs from the cua before M6a's/);
  const coded = message => ({code: 'ERR_MODULE_NOT_FOUND', message});
  assert.match(useProblems(use({imported: {...imported, playwright: coded('Cannot find a')}}), {older: {...older, imported: {...imported, playwright: coded('Cannot find b')}}}).join('; '), /playwright's import by name differs/);
  assert.match(useProblems(use({imported: {...imported, playwright: {...PW, code: 'ERR_X'}}}), {older}).join('; '), /playwright's import by name differs/);
  assert.match(useProblems(use({imported: {...imported, playwright: 'ok'}}), {older}).join('; '), /playwright's import by name differs .*"ok" here/);
});

test('only the two install roots are set aside: the same message naming each side\'s own root is the same', () => {
  const at = base => ({code: null, message: `Cannot read ${base}/node_modules/sharp/package.json`});
  assert.deepEqual(useProblems(use({imported: {...imported, sharp: at(ROOT)}}), {older: {...older, imported: {...imported, sharp: at(OLDER_BASE)}}}), []);
  // Any other absolute path is kept as it is.
  assert.match(useProblems(use({imported: {...imported, sharp: at('/tmp/a')}}), {older: {...older, imported: {...imported, sharp: at('/tmp/b')}}}).join('; '), /sharp's import by name differs/);
});

test('negative control (fix wave 1, #3): a malformed outcome on either side, or a baseline without its root, compares equal to nothing', () => {
  assert.match(useProblems(use(), {older: {...older, imported: {...imported, sharp: 42}}}).join('; '), /the cua before M6a's outcome for sharp is malformed/);
  assert.match(useProblems(use({imported: {...imported, playwright: {code: 7}}}), {older}).join('; '), /this cua's outcome for playwright is malformed/);
  assert.match(useProblems(use(), {older: {imported}}).join('; '), /no outcome of the cua before M6a to compare/);
  assert.match(useProblems(use(), {older: null}).join('; '), /no outcome of the cua before M6a to compare playwright's import with/);
});

test('sharp runs through require whatever its by-name import gave, a success on both cuas included', () => {
  const both = {...imported, sharp: 'ok'};
  assert.deepEqual(useProblems(use({imported: both}), {older: {...older, imported: both}}), []);
  assert.match(useProblems(use({via: {sharp: 'import'}}), {older}).join('; '), /sharp did not run through require \(import\)/);
});

test('the comparison names each compared package\'s outcome here and under the older cua', () => {
  assert.deepEqual(importComparison(use(), older), {playwright: {here: PW, older: PW, same: true}, sharp: {here: SHARP, older: SHARP, same: true}});
  assert.deepEqual(importComparison(use({imported: {...imported, sharp: 'ok'}}), null).sharp, {here: 'ok', older: null, same: false});
});

// Playwright through require (ruling 1162; fix wave 1, #4): the entry it resolved, loaded, and the graph that require loaded.
const graph = (o = {}) => ({resolved: `${MODULES}/playwright/index.js`, entry: `${MODULES}/playwright/index.js`, complete: true,
  files: [`${MODULES}/playwright/index.js`, `${MODULES}/playwright-core/index.js`, `${MODULES}/playwright-core/lib/inprocess.js`], ...o});

test('playwright passes when the entry require resolved is the one loaded, its graph is whole and every file is in the module tree', () => {
  assert.deepEqual(playwrightProblems(graph(), {root: ROOT}), []);
});

test('negative control (fix wave 1, #4): absent evidence, another entry, an unfinished load, a file from elsewhere or unread, or no playwright-core fails', () => {
  const judged = o => playwrightProblems(o === null ? null : graph(o), {root: ROOT}).join('; ');
  assert.match(judged(null), /no evidence of playwright's load/);
  assert.match(judged({entry: `${MODULES}/other/index.js`}), /the loaded entry .*other.* is not the one require resolved/);
  assert.match(judged({complete: false}), /did not finish loading/);
  assert.match(judged({files: undefined}), /no graph of what require loaded/);
  assert.match(judged({files: []}), /no graph of what require loaded/);
  // A dependency resolved outside the tree, whatever its path's words.
  assert.match(judged({files: [...graph().files, '/usr/lib/node_modules/whatever/x.js']}), /1 file of the graph is outside the module tree: \/usr\/lib/);
  assert.match(judged({files: [...graph().files, null]}), /1 file of the graph is outside the module tree: an unread path/);
  assert.match(judged({files: [`${MODULES}/playwright/index.js`]}), /playwright-core's entry is not in the graph/);
  assert.match(judged({resolved: '/run/user/.local/share/cua/runtimes/26/x/playwright/index.js', entry: '/run/user/.local/share/cua/runtimes/26/x/playwright/index.js'}), /resolved .*runtimes.* outside the module tree/);
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
