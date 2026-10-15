// scripts/extract-meriyah.mjs: the Meriyah parser cua's own REPL kernel uses (src/repl-host/vendor/meriyah/) is the exact
// Meriyah version package.json pins, the 7.0.0 the vendor's node_repl embeds (readable chatgpt-26.928.40906
// NR:meriyah.umd.min.js:1-5), and the extractor refuses anything else: a range pin, another installed version, or a
// bundle whose bytes are not the vendor-embedded copy's. The committed module is checked against a fresh extraction when
// the pinned package is installed (a devDependency: a checkout without `npm ci` skips that one test visibly), and the
// committed module itself must load and parse without touching the global object.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {extractMeriyah, writeMeriyah, VENDOR_BUNDLE_SHA256} from '../../scripts/extract-meriyah.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const VENDOR = join(ROOT, 'src/repl-host/vendor/meriyah');
const installed = existsSync(join(ROOT, 'node_modules/meriyah/package.json'));
const FAKE_BUNDLE = '!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?t(exports):t((e=globalThis).meriyah={})}(this,(function(e){e.parseModule=()=>"parsed";e.version="7.0.0"}));\n';

// A repository root with package.json pinning `pin` and an installed meriyah of `version` whose UMD bundle is `source`.
function fakeRoot(t, {pin = '7.0.0', version = '7.0.0', source = FAKE_BUNDLE} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'cua-extract-meriyah-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  writeFileSync(join(root, 'package.json'), JSON.stringify({devDependencies: pin == null ? {} : {meriyah: pin}}));
  const pkg = join(root, 'node_modules/meriyah');
  mkdirSync(join(pkg, 'dist'), {recursive: true});
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({name: 'meriyah', version, license: 'ISC'}));
  writeFileSync(join(pkg, 'dist/meriyah.umd.min.js'), source);
  writeFileSync(join(pkg, 'LICENSE.md'), 'ISC License\n\nCopyright (c) 2019 and later, KFlash and others.\n');
  return root;
}

test('the extractor refuses a range pin, a missing pin, an installed version other than the pin, and a missing package', t => {
  assert.throws(() => extractMeriyah(fakeRoot(t, {pin: '^7.0.0'})), /meriyah to one exact version/);
  assert.throws(() => extractMeriyah(fakeRoot(t, {pin: null})), /no meriyah devDependency/);
  assert.throws(() => extractMeriyah(fakeRoot(t, {pin: '7.0.0', version: '7.0.1'})),
    /installed meriyah 7\.0\.1 does not match the pinned 7\.0\.0/);
  const root = fakeRoot(t);
  rmSync(join(root, 'node_modules/meriyah'), {recursive: true});
  assert.throws(() => extractMeriyah(root), /meriyah 7\.0\.0 is not installed/);
});

test('the extractor refuses a bundle that is not byte-identical to the vendor-embedded copy, unless told which bytes to expect', t => {
  assert.throws(() => extractMeriyah(fakeRoot(t)), /not byte-identical to the vendor-embedded Meriyah/);
  const other = fakeRoot(t, {pin: '7.0.1', version: '7.0.1'});
  assert.throws(() => extractMeriyah(other), /pins meriyah 7\.0\.1, but the vendor embeds 7\.0\.0/);
});

test('the extracted module wraps the bundle unchanged as an ES module, with the ISC licence and its version', async t => {
  const root = fakeRoot(t);
  const {createHash} = await import('node:crypto');
  const expectSha256 = createHash('sha256').update(FAKE_BUNDLE).digest('hex');
  const {version, content} = extractMeriyah(root, {expectSha256});
  assert.equal(version, '7.0.0');
  assert.match(content, /^\/\*/, 'opens with the licence notice');
  assert.match(content, /npm package meriyah 7\.0\.0 \(dist\/meriyah\.umd\.min\.js\)/);
  assert.match(content, /ISC License/);
  assert.ok(content.includes(FAKE_BUNDLE), 'the bundle bytes are carried unchanged');
  const out = join(root, 'out');
  writeMeriyah(root, out, {expectSha256});
  assert.equal(readFileSync(join(out, 'VERSION'), 'utf8'), '7.0.0\n');
  const meriyah = (await import(pathToFileURL(join(out, 'meriyah.mjs')))).default;
  assert.equal(meriyah.parseModule(), 'parsed');
  assert.equal(globalThis.meriyah, undefined, 'nothing is set on the global object');
});

test('the committed Meriyah is the pinned version, the one the vendor embeds', () => {
  const pin = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).devDependencies.meriyah;
  assert.equal(pin, '7.0.0', 'the version the vendor embeds');
  assert.equal(readFileSync(join(VENDOR, 'VERSION'), 'utf8'), `${pin}\n`);
  const content = readFileSync(join(VENDOR, 'meriyah.mjs'), 'utf8');
  assert.match(content, /npm package meriyah 7\.0\.0/);
  assert.match(VENDOR_BUNDLE_SHA256, /^[0-9a-f]{64}$/);
});

test('the committed Meriyah is a fresh extraction of the installed pin', {skip: !installed && 'meriyah not installed (npm ci): the drift check needs the pinned package'}, () => {
  assert.equal(readFileSync(join(VENDOR, 'meriyah.mjs'), 'utf8'), extractMeriyah(ROOT).content);
});

test('the committed module parses a module with ranges and tokens, and sets nothing on the global object', async () => {
  const before = new Set(Object.getOwnPropertyNames(globalThis));
  const meriyah = (await import(pathToFileURL(join(VENDOR, 'meriyah.mjs')))).default;
  assert.deepEqual(Object.getOwnPropertyNames(globalThis).filter(name => !before.has(name)), []);
  assert.equal(meriyah.version, '7.0.0');
  const tokens = [];
  const ast = meriyah.parseModule('let a = await 1;', {next: true, module: true, ranges: true, onToken: tokens});
  assert.equal(ast.body[0].type, 'VariableDeclaration');
  assert.equal(ast.body[0].start, 0);
  assert.ok(tokens.length > 0);
});
