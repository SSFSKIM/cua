// The M0 spike's fixtures (scripts/spike/engine/fixtures/): the Chrome for Testing pin and its placement with hash
// verification, the Electron fixture builder's Info.plist rewrite (on a scratch copy of a fake bundle, never the
// dependency's), and the loopback scene page. Nothing here launches an app or downloads anything.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {loadPin, validatePin, verifyArchive, placeChromeForTesting, placedAppPath, PIN_PATH} from '../scripts/spike/engine/fixtures/chrome-for-testing.mjs';
import {FIXTURE_BUNDLE_ID, FIXTURE_NAME, FIXTURE_CONTROLS, rewriteBundle, fixtureSourceHash, fixtureAppPath} from '../scripts/spike/engine/fixtures/electron-fixture.mjs';
import {startScenePage, PAGE_CONTROLS, PAGE_TITLE} from '../scripts/spike/engine/fixtures/scene-page.mjs';

const scratch = () => fs.mkdtempSync(join(tmpdir(), 'spike-fixtures-'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pinFor = bytes => ({...loadPin(), size: bytes.length, sha256: sha(bytes)});

test('the committed pin is a stable mac-arm64 Chrome for Testing build named by version, URL and SHA-256', () => {
  const pin = loadPin(PIN_PATH);
  assert.equal(pin.platform, 'mac-arm64');
  assert.match(pin.version, /^\d+\.\d+\.\d+\.\d+$/);
  assert.equal(pin.url, `https://storage.googleapis.com/chrome-for-testing-public/${pin.version}/mac-arm64/chrome-mac-arm64.zip`);
  assert.match(pin.sha256, /^[0-9a-f]{64}$/);
  assert.equal(pin.bundleId, 'com.google.chrome.for.testing');
  assert.equal(pin.app, 'chrome-mac-arm64/Google Chrome for Testing.app');
});

test('a pin of another shape is refused, naming the field', () => {
  const good = loadPin();
  for (const [field, value, pattern] of [
    ['version', '155', /version/], ['platform', 'mac-x64', /platform/], ['sha256', 'ABC', /sha256/],
    ['url', 'http://example.com/chrome.zip', /url/], ['url', good.url.replace(good.version, '1.2.3.4'), /url/],
    ['size', 0, /size/], ['bundleId', 'com.google.Chrome', /bundleId/], ['app', '../evil.app', /app/],
  ]) assert.throws(() => validatePin({...good, [field]: value}), pattern, `${field}=${value}`);
  assert.throws(() => validatePin(null), /pin/);
});

test('archive verification: the size and the SHA-256 must both match the pin', async () => {
  const dir = scratch();
  try {
    const bytes = Buffer.from('a chrome for testing archive, in miniature');
    const file = join(dir, 'chrome.zip');
    fs.writeFileSync(file, bytes);
    await verifyArchive(file, pinFor(bytes));
    await assert.rejects(verifyArchive(file, {...pinFor(bytes), sha256: sha('other')}), /SHA-256 mismatch/);
    await assert.rejects(verifyArchive(file, {...pinFor(bytes), size: bytes.length + 1}), /size/);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

// A placement whose download writes `bytes` and whose extraction makes the app directory with the given bundle id.
function seams(bytes, {bundleId = 'com.google.chrome.for.testing', calls = []} = {}) {
  return {
    download: async (url, file) => { calls.push(['download', url]); fs.writeFileSync(file, bytes); },
    extract: (zip, dest) => { calls.push(['extract']); fs.mkdirSync(join(dest, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents'), {recursive: true}); },
    bundleIdOf: app => { calls.push(['bundleId', app]); return bundleId; },
  };
}

test('placement: downloads into a staging directory of its own, verifies, then moves the tree to <cache>/<version>/', async () => {
  const cache = scratch();
  try {
    const bytes = Buffer.from('zip bytes'), pin = pinFor(bytes), calls = [];
    const placed = await placeChromeForTesting({pin, cacheRoot: cache, ...seams(bytes, {calls})});
    assert.equal(placed.appPath, placedAppPath(pin, cache));
    assert.equal(placed.appPath, join(cache, pin.version, 'chrome-mac-arm64', 'Google Chrome for Testing.app'));
    assert.equal(placed.reused, false);
    assert.deepEqual(calls.map(c => c[0]), ['download', 'extract', 'bundleId']);
    assert.equal(calls[0][1], pin.url);
    const marker = JSON.parse(fs.readFileSync(join(cache, pin.version, 'placed.json'), 'utf8'));
    assert.equal(marker.sha256, pin.sha256);
    assert.deepEqual(fs.readdirSync(cache), [pin.version], 'no staging directory or archive is left behind');
    // A second placement of the same pin reuses the tree and downloads nothing.
    const again = await placeChromeForTesting({pin, cacheRoot: cache, ...seams(bytes, {calls: []}), download: () => assert.fail('downloaded again')});
    assert.equal(again.reused, true);
    assert.equal(again.appPath, placed.appPath);
  } finally { fs.rmSync(cache, {recursive: true, force: true}); }
});

test('placement: a size or hash mismatch, a missing app or a wrong bundle id places nothing and leaves no staging', async () => {
  const bytes = Buffer.from('zip bytes');
  for (const [name, override, pattern] of [
    ['hash', {}, /SHA-256 mismatch/],
    ['size', {}, /size/],
    ['bundle id', {bundleIdOf: () => 'com.google.Chrome'}, /bundle id/],
    ['app', {extract: () => {}}, /holds no/],
  ]) {
    const cache = scratch();
    try {
      const pin = name === 'hash' ? {...pinFor(bytes), sha256: sha('something else')} : name === 'size' ? {...pinFor(bytes), size: 1} : pinFor(bytes);
      await assert.rejects(placeChromeForTesting({pin, cacheRoot: cache, ...seams(bytes), ...override}), pattern, name);
      assert.deepEqual(fs.readdirSync(cache), [], `${name}: nothing placed`);
    } finally { fs.rmSync(cache, {recursive: true, force: true}); }
  }
});

test('placement: a version directory without a matching marker (an interrupted placement) is replaced, not trusted', async () => {
  const cache = scratch();
  try {
    const bytes = Buffer.from('zip bytes'), pin = pinFor(bytes);
    fs.mkdirSync(join(cache, pin.version, 'leftover'), {recursive: true});
    const placed = await placeChromeForTesting({pin, cacheRoot: cache, ...seams(bytes)});
    assert.equal(placed.reused, false);
    assert.equal(fs.existsSync(join(cache, pin.version, 'leftover')), false);
  } finally { fs.rmSync(cache, {recursive: true, force: true}); }
});

const darwin = {skip: process.platform !== 'darwin' && 'plutil is macOS-only'};
const plist = (file, key) => execFileSync('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', file], {encoding: 'utf8'}).trim();

// A scratch bundle shaped like the dependency's Electron.app (main plist, executable, four helpers), never the real one.
function fakeElectronApp(root) {
  const app = join(root, 'Electron.app'), contents = join(app, 'Contents');
  fs.mkdirSync(join(contents, 'MacOS'), {recursive: true});
  fs.writeFileSync(join(contents, 'MacOS', 'Electron'), '#!/bin/sh\n', {mode: 0o755});
  const write = (file, entries) => {
    fs.mkdirSync(join(file, '..'), {recursive: true});
    fs.writeFileSync(file, '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>'
      + Object.entries(entries).map(([k, v]) => `<key>${k}</key><string>${v}</string>`).join('') + '</dict></plist>\n');
  };
  write(join(contents, 'Info.plist'), {CFBundleIdentifier: 'com.github.Electron', CFBundleName: 'Electron', CFBundleDisplayName: 'Electron', CFBundleExecutable: 'Electron'});
  for (const helper of ['Electron Helper', 'Electron Helper (GPU)', 'Electron Helper (Plugin)', 'Electron Helper (Renderer)'])
    write(join(contents, 'Frameworks', `${helper}.app`, 'Contents', 'Info.plist'), {CFBundleIdentifier: 'com.github.Electron.helper', CFBundleName: helper});
  return app;
}

test('the fixture builder rewrites the copy\'s Info.plist: its own bundle id, name and executable; helpers under its id', darwin, () => {
  const root = scratch();
  try {
    const app = fakeElectronApp(root);
    rewriteBundle(app);
    const info = join(app, 'Contents', 'Info.plist');
    assert.equal(plist(info, 'CFBundleIdentifier'), FIXTURE_BUNDLE_ID);
    assert.equal(plist(info, 'CFBundleName'), FIXTURE_NAME);
    assert.equal(plist(info, 'CFBundleDisplayName'), FIXTURE_NAME);
    assert.equal(plist(info, 'CFBundleExecutable'), FIXTURE_NAME);
    assert.ok(fs.existsSync(join(app, 'Contents', 'MacOS', FIXTURE_NAME)));
    assert.equal(fs.existsSync(join(app, 'Contents', 'MacOS', 'Electron')), false);
    for (const helper of fs.readdirSync(join(app, 'Contents', 'Frameworks')))
      assert.equal(plist(join(app, 'Contents', 'Frameworks', helper, 'Contents', 'Info.plist'), 'CFBundleIdentifier'), `${FIXTURE_BUNDLE_ID}.helper`, helper);
    assert.throws(() => rewriteBundle(app), /not the dependency's Electron.app/, 'a bundle already rewritten is not rewritten twice');
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('the fixture app path names the Electron version and the fixture source, so a source change is a new bundle', () => {
  const hash = fixtureSourceHash();
  assert.match(hash, /^[0-9a-f]{12}$/);
  assert.equal(fixtureAppPath({cacheRoot: '/c', electronVersion: '44.9.0', sourceHash: hash}), `/c/44.9.0-${hash}/${FIXTURE_NAME}.app`);
});

test('the fixture source declares a text field, a list and a button, and never enables accessibility itself', () => {
  const names = FIXTURE_CONTROLS.map(c => c.name);
  for (const role of ['AXTextArea', 'AXList', 'AXButton']) assert.ok(FIXTURE_CONTROLS.some(c => c.role === role), role);
  assert.equal(new Set(names).size, names.length);
  const code = fs.readFileSync(new URL('../scripts/spike/engine/fixtures/electron/main.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /setAccessibilitySupportEnabled|force-renderer-accessibility|accessibility/i);
  const html = fs.readFileSync(new URL('../scripts/spike/engine/fixtures/electron/index.html', import.meta.url), 'utf8');
  for (const name of names) assert.ok(html.includes(name), name);
});

test('the scene page: served on its exact loopback Host only, every control present, under a CSP that allows no network', async () => {
  const page = await startScenePage();
  try {
    assert.match(page.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    const response = await fetch(page.url);
    assert.equal(response.status, 200);
    const csp = response.headers.get('content-security-policy');
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /connect-src 'none'/);
    const html = await response.text();
    assert.ok(html.includes(`<title>${PAGE_TITLE}</title>`));
    for (const control of PAGE_CONTROLS) assert.ok(html.includes(control.name), control.name);
    assert.ok(html.includes('<textarea'), 'the textarea the Korean matrix types into');
    assert.equal((await fetch(new URL('/other', page.url))).status, 404);
    const port = new URL(page.url).port;
    const misdirected = await new Promise((resolve, reject) => {
      import('node:http').then(({request}) => request({host: '127.0.0.1', port, path: '/', headers: {host: `localhost:${port}`}}, res => { res.resume(); resolve(res.statusCode); }).on('error', reject).end());
    });
    assert.equal(misdirected, 421);
  } finally { await page.close(); }
});
