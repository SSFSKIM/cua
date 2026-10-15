// scripts/extract-zod.mjs: the Zod validator cua's browser client uses (src/cua-api/vendor/zod/) is the exact zod
// release package.json pins, 3.25.76, whose v3 code is the code the vendor's client bundles, and the extractor refuses
// anything else: a range pin, another installed version, another pinned version, or a file whose bytes are not the
// release's. The committed files are checked against the release's digests always, and against a fresh extraction when
// the pinned package is installed (a devDependency: a checkout without `npm ci` skips that one test visibly).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {extractZod, FILES, sha256, VENDOR_VERSION, vendoredPath, writeZod} from '../../scripts/extract-zod.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const VENDOR = join(ROOT, 'src/cua-api/vendor/zod');
const installed = existsSync(join(ROOT, 'node_modules/zod/package.json'));

// A repository root pinning zod `pin`, with an installed zod `version` whose files hold `content(file)`.
function fakeRoot(t, {pin = VENDOR_VERSION, version = VENDOR_VERSION, content = file => `// ${file}\n`} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'cua-extract-zod-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  writeFileSync(join(root, 'package.json'), JSON.stringify({devDependencies: pin == null ? {} : {zod: pin}}));
  const pkg = join(root, 'node_modules/zod');
  mkdirSync(pkg, {recursive: true});
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({name: 'zod', version, license: 'MIT'}));
  for (const file of Object.keys(FILES)) {
    mkdirSync(dirname(join(pkg, file)), {recursive: true});
    writeFileSync(join(pkg, file), content(file));
  }
  return root;
}
const fakeDigests = Object.fromEntries(Object.keys(FILES).map(file => [file, sha256(`// ${file}\n`)]));

const walk = dir => readdirSync(dir).flatMap(name => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));

test('the extractor refuses a range pin, a missing pin, an installed version other than the pin, another pinned version and a missing package', t => {
  assert.throws(() => extractZod(fakeRoot(t, {pin: '^3.25.76'})), /zod to one exact version/);
  assert.throws(() => extractZod(fakeRoot(t, {pin: null})), /no zod devDependency/);
  assert.throws(() => extractZod(fakeRoot(t, {version: '3.25.75'})), /installed zod 3\.25\.75 does not match the pinned 3\.25\.76/);
  assert.throws(() => extractZod(fakeRoot(t, {pin: '3.25.75', version: '3.25.75'})), /pins zod 3\.25\.75, but the vendor's browser client bundles 3\.25\.76/);
  const root = fakeRoot(t);
  rmSync(join(root, 'node_modules/zod'), {recursive: true});
  assert.throws(() => extractZod(root), /zod 3\.25\.76 is not installed/);
});

test('the extractor refuses any file whose bytes are not the pinned release\'s, and a missing file', t => {
  assert.throws(() => extractZod(fakeRoot(t)), /zod 3\.25\.76's v3\/external\.js is not the pinned release's bytes/);
  const root = fakeRoot(t);
  rmSync(join(root, 'node_modules/zod/v3/types.js'));
  assert.throws(() => extractZod(root, {expect: fakeDigests}), /zod 3\.25\.76 has no v3\/types\.js/);
});

test('the extractor writes the module graph unchanged below the vendor directory, with LICENSE and VERSION, replacing what was there', t => {
  const root = fakeRoot(t);
  const out = join(root, 'out');
  mkdirSync(out);
  writeFileSync(join(out, 'stale.js'), 'stale');
  assert.deepEqual(writeZod(root, out, {expect: fakeDigests}), {version: VENDOR_VERSION, count: Object.keys(FILES).length});
  assert.deepEqual(walk(out).map(path => relative(out, path)).sort(), [...Object.keys(FILES).map(vendoredPath), 'VERSION'].sort());
  assert.equal(readFileSync(join(out, 'types.js'), 'utf8'), '// v3/types.js\n');
  assert.equal(readFileSync(join(out, 'VERSION'), 'utf8'), `${VENDOR_VERSION}\n`);
});

test('the committed validator is exactly the pinned release\'s files', () => {
  assert.equal(readFileSync(join(VENDOR, 'VERSION'), 'utf8'), `${VENDOR_VERSION}\n`);
  assert.deepEqual(walk(VENDOR).map(path => relative(VENDOR, path)).sort(), [...Object.keys(FILES).map(vendoredPath), 'VERSION'].sort(), 'nothing else is committed');
  for (const [file, digest] of Object.entries(FILES)) assert.equal(sha256(readFileSync(join(VENDOR, vendoredPath(file)))), digest, file);
});

test('the committed validator matches a fresh extraction of the installed pin', {skip: installed ? false : 'zod is not installed (npm ci)'}, () => {
  const {version, files} = extractZod(ROOT);
  assert.equal(version, VENDOR_VERSION);
  for (const [file, bytes] of files) assert.deepEqual(readFileSync(join(VENDOR, file)), bytes, file);
});

test('the vendored module loads as ES modules, sets nothing global and reports Zod\'s own issues', async () => {
  const before = new Set(Object.getOwnPropertyNames(globalThis));
  const z = await import('../../src/cua-api/vendor/zod/external.js');
  assert.deepEqual(Object.getOwnPropertyNames(globalThis).filter(name => !before.has(name)), []);
  const result = z.object({a: z.string()}).safeParse({a: 1, b: 2});
  assert.equal(result.success, false);
  assert.deepEqual(result.error.issues, [{code: 'invalid_type', expected: 'string', received: 'number', path: ['a'], message: 'Expected string, received number'}]);
  assert.deepEqual(z.object({a: z.string()}).parse({a: 'x', b: 2}), {a: 'x'}, 'unknown keys are stripped');
});
