// The Electron fixture app for the spike's Electron scene (the own native engine spec, Verification system part 2): a
// copy of the pinned `electron` dev dependency's Electron.app whose Info.plist names its own bundle id
// (io.github.ssfskim.cua.fixture.electron), name and executable, carrying the source in ./electron/ as its app, and
// re-signed ad hoc, since the rewrite invalidates the shipped signature. So the Electron accessibility path is proven on
// a process the harness owns, and the stock com.github.Electron id that MAWS's dev builds on the mini share is never a
// scene's. The helpers take `<id>.helper` (the one id the shipped helpers share, moved under the fixture's), so no
// process of the fixture carries a stock Electron id either.
//
// The build goes to ~/Library/Caches/cua-harness/electron-fixture/<electron version>-<source hash>/, assembled in a
// staging directory of its own and renamed into place only once `codesign --verify --deep --strict` passes; a built
// bundle is reused while its marker matches. The source hash covers ./electron/ and this builder, so a change to either
// is a new bundle at a new path. The dependency's own Electron.app is only ever read.
import * as fs from 'node:fs';
import {homedir} from 'node:os';
import {join, relative} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const FIXTURE_BUNDLE_ID = 'io.github.ssfskim.cua.fixture.electron';
export const FIXTURE_NAME = 'cua Electron Fixture';
export const STOCK_BUNDLE_ID = 'com.github.Electron';
export const SOURCE_DIR = fileURLToPath(new URL('./electron/', import.meta.url));
export const CACHE_ROOT = join(homedir(), 'Library/Caches/cua-harness/electron-fixture');
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const BUILDER = fileURLToPath(import.meta.url);
const MARKER = 'built.json';

// Every control the fixture puts on screen, as the scene's targets name them: the AX role Chromium gives it and its name.
export const FIXTURE_CONTROLS = Object.freeze([
  {id: 'text', role: 'AXTextArea', name: 'Fixture text'},
  {id: 'list', role: 'AXList', name: 'Fixture list'},
  ...['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'].map(name => ({id: `option${name}`, role: 'AXStaticText', name})),
  {id: 'button', role: 'AXButton', name: 'Fixture button'},
  {id: 'status', role: 'AXGroup', name: 'Fixture status'},
].map(Object.freeze));
// The fixed state's values, which the method matrix reads back against.
export const FIXTURE_INITIAL = Object.freeze({text: '', selected: null, status: 'Pressed 0 times'});

const sourceFiles = () => fs.readdirSync(SOURCE_DIR).filter(name => !name.startsWith('.')).sort();
export function fixtureSourceHash() {
  const hash = createHash('sha256');
  for (const file of [...sourceFiles().map(name => join(SOURCE_DIR, name)), BUILDER])
    hash.update(`${relative(REPO_ROOT, file)}\0`).update(fs.readFileSync(file)).update('\0');
  return hash.digest('hex').slice(0, 12);
}
export const fixtureAppPath = ({cacheRoot = CACHE_ROOT, electronVersion, sourceHash = fixtureSourceHash()}) =>
  join(cacheRoot, `${electronVersion}-${sourceHash}`, `${FIXTURE_NAME}.app`);

const plutil = (args, options = {}) => execFileSync('/usr/bin/plutil', args, {encoding: 'utf8', ...options});
const readKey = (file, key) => plutil(['-extract', key, 'raw', '-o', '-', file]).trim();
const setKey = (file, key, value) => plutil(['-replace', key, '-string', value, file]);

// Rewrites a copy of the stock Electron.app in place: main Info.plist (bundle id, name, display name, executable, with
// the executable renamed to match) and every helper's bundle id. Refuses a bundle that is not the stock one, so the
// rewrite never runs twice and never on anything else.
export function rewriteBundle(app) {
  const contents = join(app, 'Contents'), info = join(contents, 'Info.plist');
  if (readKey(info, 'CFBundleIdentifier') !== STOCK_BUNDLE_ID) throw new Error(`${app} is not the dependency's Electron.app (its bundle id is not ${STOCK_BUNDLE_ID})`);
  const executable = readKey(info, 'CFBundleExecutable');
  setKey(info, 'CFBundleIdentifier', FIXTURE_BUNDLE_ID);
  setKey(info, 'CFBundleName', FIXTURE_NAME);
  setKey(info, 'CFBundleDisplayName', FIXTURE_NAME);
  setKey(info, 'CFBundleExecutable', FIXTURE_NAME);
  fs.renameSync(join(contents, 'MacOS', executable), join(contents, 'MacOS', FIXTURE_NAME));
  for (const helper of helperApps(app)) setKey(join(helper, 'Contents', 'Info.plist'), 'CFBundleIdentifier', `${FIXTURE_BUNDLE_ID}.helper`);
}
const helperApps = app => {
  const frameworks = join(app, 'Contents', 'Frameworks');
  return fs.readdirSync(frameworks).filter(name => name.endsWith('.app')).sort().map(name => join(frameworks, name));
};

// Ad-hoc signing of the whole bundle, nested code included (--deep: the shipped frameworks are only linker-signed, with
// no sealed resources, which a strict verification of the re-signed app refuses), then a strict deep verification.
export function signAdHoc(app, {exec = execFileSync} = {}) {
  exec('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', app], {stdio: ['ignore', 'ignore', 'pipe']});
  try { exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], {stdio: ['ignore', 'ignore', 'pipe']}); }
  catch (error) { throw new Error(`the fixture's ad-hoc signature does not verify: ${String(error.stderr ?? error.message).trim()}`); }
}

// The dependency's Electron.app, its binary fetched by the package's own installer when absent (electron 44 has no
// postinstall; install.js verifies the download against the package's checksums.json).
export function electronDist({root = REPO_ROOT, exec = execFileSync} = {}) {
  const pkg = join(root, 'node_modules', 'electron'), dist = join(pkg, 'dist');
  const version = JSON.parse(fs.readFileSync(join(pkg, 'package.json'), 'utf8')).version;
  const installed = () => { try { return fs.readFileSync(join(dist, 'version'), 'utf8').trim().replace(/^v/, ''); } catch { return null; } };
  if (installed() !== version) exec(process.execPath, [join(pkg, 'install.js')], {stdio: ['ignore', 'ignore', 'inherit'], timeout: 600_000});
  if (installed() !== version) throw new Error(`node_modules/electron/dist is not Electron ${version}`);
  return {app: join(dist, 'Electron.app'), version};
}

// Builds (or reuses) the fixture app. -> {appPath, bundleId, electronVersion, sourceHash, reused}.
export function buildElectronFixture({root = REPO_ROOT, cacheRoot = CACHE_ROOT, now = () => new Date().toISOString()} = {}) {
  const {app: stock, version: electronVersion} = electronDist({root});
  const sourceHash = fixtureSourceHash(), appPath = fixtureAppPath({cacheRoot, electronVersion, sourceHash});
  const target = join(appPath, '..'), result = {appPath, bundleId: FIXTURE_BUNDLE_ID, electronVersion, sourceHash};
  let marker = null;
  try { marker = JSON.parse(fs.readFileSync(join(target, MARKER), 'utf8')); } catch {}
  if (marker?.sourceHash === sourceHash && marker?.electronVersion === electronVersion && fs.existsSync(appPath)) return {...result, reused: true};
  fs.mkdirSync(cacheRoot, {recursive: true, mode: 0o700});
  const staging = fs.mkdtempSync(join(cacheRoot, '.staging-'));
  try {
    const tree = join(staging, 'tree'), copy = join(tree, `${FIXTURE_NAME}.app`);
    fs.mkdirSync(tree, {mode: 0o700});
    execFileSync('/usr/bin/ditto', [stock, copy], {stdio: 'ignore', timeout: 300_000});
    rewriteBundle(copy);
    const appSource = join(copy, 'Contents', 'Resources', 'app');
    fs.mkdirSync(appSource);
    for (const name of sourceFiles()) fs.copyFileSync(join(SOURCE_DIR, name), join(appSource, name));
    signAdHoc(copy);
    fs.writeFileSync(join(tree, MARKER), JSON.stringify({bundleId: FIXTURE_BUNDLE_ID, electronVersion, sourceHash, builtAt: now()}, null, 2) + '\n', {mode: 0o600});
    fs.rmSync(target, {recursive: true, force: true});   // an interrupted build of this version and source: never trusted
    fs.renameSync(tree, target);
    return {...result, reused: false};
  } finally { fs.rmSync(staging, {recursive: true, force: true}); }
}

// `node scripts/spike/engine/fixtures/electron-fixture.mjs [--cache <root>]`: builds the fixture; prints the JSON.
if (process.argv[1] && BUILDER === fs.realpathSync(process.argv[1])) {
  const at = process.argv.indexOf('--cache');
  try { process.stdout.write(JSON.stringify(buildElectronFixture(at > 0 ? {cacheRoot: process.argv[at + 1]} : {})) + '\n'); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
