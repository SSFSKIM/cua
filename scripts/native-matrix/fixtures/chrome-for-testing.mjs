// Chrome for Testing for the Chrome scene of the macOS scenes (scripts/repl-parity/scenes-mac.mjs; the own native engine
// spec, Verification system part 2), promoted in M1b from the M0 spike's copy (scripts/spike/engine/fixtures/): one stable
// mac-arm64 build pinned in ./chrome-for-testing.json by version, URL and SHA-256, downloaded on the device and unzipped
// under ~/Library/Caches/cua-harness/chrome-for-testing/<version>/. Its bundle id, com.google.chrome.for.testing, is not
// the owner's Chrome's, and nothing here touches the owner's Chrome or its data.
//
// Placement is all-or-nothing: the archive goes into a new staging directory of its own inside the cache root, its size
// and SHA-256 are checked against the pin before it is unzipped (ditto, which keeps the frameworks' symlinks), the app's
// bundle id is checked, and only then is the tree renamed into place with a `placed.json` marker. A version directory
// without a marker for the pinned hash is an interrupted placement and is replaced. The pin was taken from Google's
// Chrome for Testing endpoint (`source`), which publishes no hashes; the SHA-256 is of the archive downloaded once at
// pinning, and it is the whole integrity check: Chrome for Testing's mac-arm64 builds carry no Developer ID signature,
// only the linker's ad-hoc one (codesign -dv: flags=0x20002(adhoc,linker-signed), no sealed resources), so a codesign
// verification proves nothing about where the bundle came from. The download carries no quarantine attribute (only
// com.apple.provenance, seen on the MacBook), so Gatekeeper is expected not to assess it at launch; the sitting's first
// launch confirms that.
import * as fs from 'node:fs';
import {homedir} from 'node:os';
import {join, isAbsolute, normalize} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';

export const PIN_PATH = fileURLToPath(new URL('./chrome-for-testing.json', import.meta.url));
export const CHROME_FOR_TESTING_BUNDLE_ID = 'com.google.chrome.for.testing';
export const CACHE_ROOT = join(homedir(), 'Library/Caches/cua-harness/chrome-for-testing');
const MARKER = 'placed.json';

// The pin, checked field by field; -> the pin, or throws naming the field.
export function validatePin(pin) {
  if (!pin || typeof pin !== 'object') throw new Error('the Chrome for Testing pin must be an object');
  const fail = field => { throw new Error(`the Chrome for Testing pin's ${field} is not valid`); };
  if (typeof pin.version !== 'string' || !/^\d+\.\d+\.\d+\.\d+$/.test(pin.version)) fail('version');
  if (pin.platform !== 'mac-arm64') fail('platform');
  if (pin.url !== `https://storage.googleapis.com/chrome-for-testing-public/${pin.version}/mac-arm64/chrome-mac-arm64.zip`) fail('url');
  if (typeof pin.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(pin.sha256)) fail('sha256');
  if (!Number.isSafeInteger(pin.size) || pin.size <= 0) fail('size');
  if (pin.bundleId !== CHROME_FOR_TESTING_BUNDLE_ID) fail('bundleId');
  if (typeof pin.app !== 'string' || isAbsolute(pin.app) || normalize(pin.app) !== pin.app || pin.app.split('/').includes('..') || !pin.app.endsWith('.app')) fail('app');
  return pin;
}
export const loadPin = (path = PIN_PATH) => validatePin(JSON.parse(fs.readFileSync(path, 'utf8')));

export async function sha256File(file) {
  const hash = createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

// Throws unless `file` has the pin's size and SHA-256.
export async function verifyArchive(file, pin) {
  const {size} = fs.statSync(file);
  if (size !== pin.size) throw new Error(`Chrome for Testing archive size ${size} is not the pinned ${pin.size}`);
  const actual = await sha256File(file);
  if (actual !== pin.sha256) throw new Error(`Chrome for Testing archive SHA-256 mismatch: expected ${pin.sha256}, got ${actual}`);
}

export const placedAppPath = (pin, cacheRoot = CACHE_ROOT) => join(cacheRoot, pin.version, pin.app);

const defaults = {
  async download(url, file) {
    const response = await fetch(url, {redirect: 'error'});
    if (!response.ok || !response.body) throw new Error(`downloading ${url} failed: HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(file, {flags: 'wx', mode: 0o600}));
  },
  extract: (zip, dest) => execFileSync('/usr/bin/ditto', ['-x', '-k', zip, dest], {stdio: 'ignore', timeout: 300_000}),
  bundleIdOf: app => execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', join(app, 'Contents', 'Info.plist')], {encoding: 'utf8'}).trim(),
};

const readMarker = dir => { try { return JSON.parse(fs.readFileSync(join(dir, MARKER), 'utf8')); } catch { return null; } };

// Places the pinned build in the cache (or reuses a verified placement). -> {appPath, version, reused}.
export async function placeChromeForTesting({pin = loadPin(), cacheRoot = CACHE_ROOT, now = () => new Date().toISOString(), ...seams} = {}) {
  validatePin(pin);
  const {download, extract, bundleIdOf} = {...defaults, ...seams};
  const target = join(cacheRoot, pin.version), appPath = placedAppPath(pin, cacheRoot);
  const marker = readMarker(target);
  if (marker?.sha256 === pin.sha256 && fs.existsSync(appPath)) return {appPath, version: pin.version, reused: true};
  fs.mkdirSync(cacheRoot, {recursive: true, mode: 0o700});
  const staging = fs.mkdtempSync(join(cacheRoot, `.staging-${pin.version}-`));
  try {
    const archive = join(staging, 'chrome-mac-arm64.zip'), tree = join(staging, 'tree');
    await download(pin.url, archive);
    await verifyArchive(archive, pin);
    fs.mkdirSync(tree, {mode: 0o700});
    extract(archive, tree);
    const stagedApp = join(tree, pin.app);
    if (!fs.existsSync(stagedApp)) throw new Error(`the archive holds no ${pin.app}`);
    const bundleId = bundleIdOf(stagedApp);
    if (bundleId !== pin.bundleId) throw new Error(`the archive's app has bundle id ${bundleId}, not ${pin.bundleId}`);
    fs.writeFileSync(join(tree, MARKER), JSON.stringify({version: pin.version, sha256: pin.sha256, url: pin.url, placedAt: now()}, null, 2) + '\n', {mode: 0o600});
    fs.rmSync(target, {recursive: true, force: true});   // an interrupted placement of this version: never trusted
    fs.renameSync(tree, target);
    return {appPath, version: pin.version, reused: false};
  } finally { fs.rmSync(staging, {recursive: true, force: true}); }
}

// `node scripts/native-matrix/fixtures/chrome-for-testing.mjs [--cache <root>]`: places the pinned build; prints the JSON.
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const at = process.argv.indexOf('--cache');
  placeChromeForTesting(at > 0 ? {cacheRoot: process.argv[at + 1]} : {}).then(
    placed => process.stdout.write(JSON.stringify(placed) + '\n'),
    error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
