// scripts/extract-markdown-it.mjs: the markdown-it cua ships (src/browser-service/vendor/markdown-it/) comes from the
// exact markdown-it version package.json pins, the version the vendor embeds, and the extractor refuses anything else.
// The committed module is checked against a fresh extraction when the pinned package is installed (a devDependency: a
// checkout without `npm ci` skips that one test visibly), and the committed module itself must load and render.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {extractMarkdownIt, writeMarkdownIt} from '../../scripts/extract-markdown-it.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const VENDOR = join(ROOT, 'src/browser-service/vendor/markdown-it');
const installed = existsSync(join(ROOT, 'node_modules/markdown-it/package.json'));
const BUNDLED = ['entities', 'linkify-it', 'mdurl', 'punycode.js', 'uc.micro'];

// A repository root with package.json pinning `pin` and an installed markdown-it of `version` whose bundle is `source`.
function fakeRoot(t, {pin = '14.1.1', version = '14.1.1', source = '/*! markdown-it 14.1.1 */\nmodule.exports = () => "rendered";\n'} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'cua-extract-md-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  writeFileSync(join(root, 'package.json'), JSON.stringify({devDependencies: pin == null ? {} : {'markdown-it': pin}}));
  const pkg = join(root, 'node_modules/markdown-it');
  mkdirSync(join(pkg, 'dist'), {recursive: true});
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({name: 'markdown-it', version, license: 'MIT'}));
  writeFileSync(join(pkg, 'dist/markdown-it.js'), source);
  writeFileSync(join(pkg, 'LICENSE'), 'Copyright (c) 2014 Vitaly Puzrin, Alex Kocharin.\n');
  for (const name of BUNDLED) {
    mkdirSync(join(root, 'node_modules', name), {recursive: true});
    writeFileSync(join(root, 'node_modules', name, name === 'punycode.js' ? 'LICENSE-MIT.txt' : 'LICENSE'), `${name} licence\n`);
  }
  return root;
}

test('the extractor refuses a range pin, an installed version other than the pin, and a missing package', t => {
  assert.throws(() => extractMarkdownIt(fakeRoot(t, {pin: '^14.1.1'})), /markdown-it to one exact version/);
  assert.throws(() => extractMarkdownIt(fakeRoot(t, {pin: null})), /no markdown-it devDependency/);
  assert.throws(() => extractMarkdownIt(fakeRoot(t, {pin: '14.1.1', version: '14.2.0'})),
    /installed markdown-it 14\.2\.0 does not match the pinned 14\.1\.1/);
  const root = fakeRoot(t);
  rmSync(join(root, 'node_modules/markdown-it'), {recursive: true});
  assert.throws(() => extractMarkdownIt(root), /markdown-it 14\.1\.1 is not installed/);
});

test('the extracted module wraps the bundle unchanged as an ES module, with every licence and its version', async t => {
  const root = fakeRoot(t);
  const {version, content} = extractMarkdownIt(root);
  assert.equal(version, '14.1.1');
  assert.match(content, /^\/\*/, 'opens with the licence notices');
  assert.match(content, /npm package markdown-it 14\.1\.1/);
  assert.match(content, /Vitaly Puzrin/);
  for (const name of BUNDLED) assert.match(content, new RegExp(`${name.replace('.', '\\.')} licence`), name);
  assert.ok(content.includes('module.exports = () => "rendered";'));
  const out = join(root, 'out');
  writeMarkdownIt(root, out);
  assert.equal(readFileSync(join(out, 'VERSION'), 'utf8'), '14.1.1\n');
  const markdownit = (await import(pathToFileURL(join(out, 'markdown-it.mjs')))).default;
  assert.equal(markdownit(), 'rendered');
});

test('the committed markdown-it is the pinned version\'s', () => {
  const pin = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).devDependencies['markdown-it'];
  assert.equal(pin, '14.1.1', 'the version the vendor embeds');
  assert.equal(readFileSync(join(VENDOR, 'VERSION'), 'utf8'), `${pin}\n`);
  assert.match(readFileSync(join(VENDOR, 'markdown-it.mjs'), 'utf8'), /npm package markdown-it 14\.1\.1/);
});

test('the committed markdown-it is a fresh extraction of the installed pin', {skip: !installed && 'markdown-it not installed (npm ci): the drift check needs the pinned package'}, () => {
  assert.equal(readFileSync(join(VENDOR, 'markdown-it.mjs'), 'utf8'), extractMarkdownIt(ROOT).content);
});

test('the committed module renders Markdown and sets nothing on the global object', async () => {
  const before = new Set(Object.getOwnPropertyNames(globalThis));
  const markdownit = (await import(pathToFileURL(join(VENDOR, 'markdown-it.mjs')))).default;
  assert.deepEqual(Object.getOwnPropertyNames(globalThis).filter(name => !before.has(name)), []);
  assert.equal(markdownit().render('**bold** [x](https://example.com)'), '<p><strong>bold</strong> <a href="https://example.com">x</a></p>\n');
});
