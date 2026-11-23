// The browser-only fixture's judges (#171 M6a, T6; the M6a pre-flight §5.2, "The browser-only session", F7): the tool
// list, where the kernel's resolver selected each of the six packages, their imports and native uses, and the native
// files mapped. Each judge has its negative control here; the cells themselves are checked to parse.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ENTRIES, SPECIFIERS, cellJson, nativesProblems, selectionCell, selectionProblems, toolsProblems, useCell, useProblems} from '../scripts/accept/linux-browser-only.mjs';

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

const use = (o = {}) => ({imported: Object.fromEntries(SPECIFIERS.map(s => [s, 'ok'])), used: {sharp: 'ok', 'classic-level': 'ok'}, ...o});

test('the imports pass when all six import and both natives run', () => {
  assert.deepEqual(useProblems(use()), []);
});

test('negative control: a package that does not import, or a native use that fails, fails the imports', () => {
  assert.match(useProblems(use({imported: {...use().imported, 'jpeg-js': 'ERR_MODULE_NOT_FOUND'}})).join('; '), /jpeg-js did not import \(ERR_MODULE_NOT_FOUND\)/);
  assert.match(useProblems(use({used: {sharp: 'ok', 'classic-level': 'EACCES'}})).join('; '), /classic-level did not run \(EACCES\)/);
  assert.match(useProblems(use({used: {'classic-level': 'ok'}})).join('; '), /sharp did not run \(not tried\)/);
  assert.deepEqual(useProblems(null), ['the cell reported no imports']);
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
