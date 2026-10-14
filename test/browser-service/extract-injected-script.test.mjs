// scripts/extract-injected-script.mjs: the Playwright InjectedScript cua ships (src/browser-service/vendor/) comes from
// the exact playwright-core version package.json pins, and the extractor refuses anything else. The committed file is
// checked against a fresh extraction when the pinned package is installed (it is a devDependency: a checkout without
// `npm ci` skips that one test visibly), and the committed file itself must load and construct a working InjectedScript.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {extractInjectedScript, pinnedVersion, renderInjectedScript, writeInjectedScript} from '../../scripts/extract-injected-script.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const VENDOR = join(ROOT, 'src/browser-service/vendor');
const installed = existsSync(join(ROOT, 'node_modules/playwright-core/package.json'));

// A repository root with package.json pinning `pin` and an installed playwright-core of `version` whose generated
// injected source is `source`.
function fakeRoot(t, {pin = '1.59.1', version = '1.59.1', source = '\nvar InjectedScript = 1;\n'} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'cua-extract-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  writeFileSync(join(root, 'package.json'), JSON.stringify({devDependencies: pin == null ? {} : {'playwright-core': pin}}));
  const pkg = join(root, 'node_modules/playwright-core');
  mkdirSync(join(pkg, 'lib/generated'), {recursive: true});
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({name: 'playwright-core', version, license: 'Apache-2.0'}));
  writeFileSync(join(pkg, 'lib/generated/injectedScriptSource.js'), `"use strict";\nmodule.exports = { source: ${JSON.stringify(source)} };\n`);
  writeFileSync(join(pkg, 'NOTICE'), 'Playwright\nCopyright (c) Microsoft Corporation\n');
  return root;
}

test('the pin must be one exact version', () => {
  assert.equal(pinnedVersion({devDependencies: {'playwright-core': '1.59.1'}}), '1.59.1');
  for (const range of ['^1.59.1', '~1.59.1', '>=1.59.1', '1.59.x', '*', 'latest', '']) {
    assert.throws(() => pinnedVersion({devDependencies: {'playwright-core': range}}), /exact version/, range);
  }
  assert.throws(() => pinnedVersion({devDependencies: {}}), /devDependency/);
  assert.throws(() => pinnedVersion({dependencies: {'playwright-core': '1.59.1'}}), /devDependency/);
});

test('the extractor refuses an installed version other than the pin, and a missing package', t => {
  assert.throws(() => extractInjectedScript(fakeRoot(t, {pin: '1.59.1', version: '1.60.0'})),
    /installed playwright-core 1\.60\.0 does not match the pinned 1\.59\.1/);
  const root = fakeRoot(t);
  rmSync(join(root, 'node_modules'), {recursive: true});
  assert.throws(() => extractInjectedScript(root), /playwright-core 1\.59\.1 is not installed/);
});

test('the extracted file wraps the generated source as the PlaywrightInjected global, with the licence notice and its version', t => {
  const {version, content} = extractInjectedScript(fakeRoot(t, {source: '\nvar InjectedScript = 42;\n'}));
  assert.equal(version, '1.59.1');
  assert.match(content, /^\/\*/, 'opens with the licence notice');
  assert.match(content, /playwright-core 1\.59\.1/);
  assert.match(content, /Apache License, Version 2\.0/);
  assert.match(content, /Copyright \(c\) Microsoft Corporation/);
  assert.match(content, /var InjectedScript = 42;/);
  assert.match(content, /var PlaywrightInjected = /);
});

test('writing puts the script and its VERSION side by side and reports the sha', t => {
  const root = fakeRoot(t);
  const out = join(root, 'out');
  const {sha256, version} = writeInjectedScript(root, out);
  assert.equal(version, '1.59.1');
  assert.match(sha256, /^[0-9a-f]{64}$/);
  assert.equal(readFileSync(join(out, 'VERSION'), 'utf8'), '1.59.1\n');
  assert.equal(readFileSync(join(out, 'injected-script.js'), 'utf8'), renderInjectedScript({version: '1.59.1', source: '\nvar InjectedScript = 1;\n', notice: 'Playwright\nCopyright (c) Microsoft Corporation\n'}));
});

test('the committed injected script is the pinned version\'s', () => {
  const pin = pinnedVersion(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')));
  assert.equal(readFileSync(join(VENDOR, 'VERSION'), 'utf8'), `${pin}\n`);
  assert.match(readFileSync(join(VENDOR, 'injected-script.js'), 'utf8'), new RegExp(`playwright-core ${pin.replaceAll('.', '\\.')}`));
});

test('the committed injected script is a fresh extraction of the installed pin', {skip: !installed && 'playwright-core not installed (npm ci): the drift check needs the pinned package'}, () => {
  assert.equal(readFileSync(join(VENDOR, 'injected-script.js'), 'utf8'), extractInjectedScript(ROOT).content);
});

test('the committed script defines a constructible InjectedScript that parses selectors', () => {
  const noop = () => {};
  const window = {document: {addEventListener: noop, removeEventListener: noop}, addEventListener: noop, removeEventListener: noop,
    MutationObserver: class { observe() {} disconnect() {} }};
  window.window = window;
  const context = vm.createContext(window);
  vm.runInContext(readFileSync(join(VENDOR, 'injected-script.js'), 'utf8'), context);
  const injected = vm.runInContext(`new PlaywrightInjected.InjectedScript(window, {isUnderTest: false, sdkLanguage: 'javascript',
    testIdAttributeName: 'data-testid', stableRafCount: 1, browserName: 'chromium', customEngines: []})`, context);
  const parsed = injected.parseSelector('internal:role=button[name="Go"i] >> internal:control=enter-frame >> text=x');
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.parts.map(p => [p.name, p.body]))),
    [['internal:role', 'button[name="Go"i]'], ['internal:control', 'enter-frame'], ['text', 'x']]);
});
