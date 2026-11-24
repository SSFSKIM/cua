// Harmless stand-ins for the pinned ChatGPT archive: the same directory shape and vendor metadata as the real
// release, a few bytes per file, zipped with the same `ditto` the installer extracts with. Fixture pins reuse the
// checked-in pin's layout with the fixture's own release id, length and hash, so the layout data is exercised too.
import {mkdirSync, writeFileSync, symlinkSync, readFileSync, mkdtempSync, rmSync, chmodSync, realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPins, selectPin} from '../../src/runtime/manifest.mjs';
import {fakeModuleTree} from './own-linux-runtime.mjs';
import {RETIRED, plantRetiredRelease} from './retired-release.mjs';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REAL_PIN_FILE = join(REPO, 'runtime', 'releases', '26.928.40906-darwin-arm64.json');
export const realPinJson = () => JSON.parse(readFileSync(REAL_PIN_FILE, 'utf8'));
export const XATTR_NAME = 'com.example.cua-fixture';

export function scratch(prefix = 'cua-test-', parent = tmpdir()) {
  const dir = mkdtempSync(join(parent, prefix));
  return {dir, cleanup: () => rmSync(dir, {recursive: true, force: true})};
}

// A user's HOME for a test that serves a CUA_HOME: its own scratch directory, beside the cua home and never inside it
// (since #115 M1 a secret store or ~/.config/cua inside CUA_HOME is an overlapping layout, refused before launch).
export function scratchUserHome(t) {
  const user = scratch('cua-user-');
  t.after(user.cleanup);
  return user.dir;
}

// The same for helpers that hold a cua home but no test context: one scratch user home per cua home, removed when the
// test process exits.
const userHomes = new Map();
export function userHomeBeside(home) {
  if (!userHomes.has(home)) {
    if (!userHomes.size) process.once('exit', () => { for (const dir of userHomes.values()) rmSync(dir, {recursive: true, force: true}); });
    userHomes.set(home, scratch('cua-user-').dir);
  }
  return userHomes.get(home);
}

// A scratch directory short enough for unix socket paths below it (the macOS per-user temp directory is not), and
// outside $TMPDIR, where the scoped sandbox requires a CUA_HOME to be: /tmp, or /var/tmp where $TMPDIR covers /tmp (a
// Linux session may export TMPDIR=/tmp).
const SHORT_PARENTS = ['/tmp', '/var/tmp'];
const realOrSelf = path => { try { return realpathSync(path); } catch { return path; } };
export function shortScratch(prefix = 'cua-') {
  const tmp = process.env.TMPDIR?.startsWith('/') ? realOrSelf(process.env.TMPDIR).replace(/\/+$/, '') : null;
  const parent = SHORT_PARENTS.find(dir => { const real = realOrSelf(dir); return !tmp || (real !== tmp && !real.startsWith(`${tmp}/`)); });
  if (!parent) throw new Error(`no short scratch parent outside $TMPDIR (${process.env.TMPDIR}) among ${SHORT_PARENTS.join(', ')}`);
  return scratch(prefix, parent);
}

// Writes the fixture app tree under `root`. `vendor` overrides fields of cua_node/manifest.json (`vendorRaw` replaces
// its text outright); `ipc` replaces the IPC version string; `omit` lists layout-relative paths (inside the extracted
// components; `chrome/...` inside the Chrome plugin) to leave out.
export function writeFixtureApp(root, {vendor = {}, vendorRaw, ipc = 'CodexComputerUseIPC-5', omit = []} = {}) {
  const res = join(root, 'ChatGPT.app/Contents/Resources');
  const files = {
    'ChatGPT.app/Contents/MacOS/ChatGPT': '#!/bin/sh\necho desktop app, never installed\n',
    'ChatGPT.app/Contents/Resources/app.asar': 'not a runtime component',
    'cua_node/bin/node': '#!/bin/sh\necho fixture node\n',
    'cua_node/bin/node_repl': '#!/bin/sh\necho fixture node_repl\n',
    'cua_node/lib/node_modules/@oai/cua-repl/bin/cua-repl.mjs': 'export {};\n',
    'cua_node/lib/node_modules/@oai/sky/dist/project/cua/sky_js/src/service.js': 'export async function handleRpc() {}\n',
    'cua_node/lib/node_modules/@oai/browser-desktop/scripts/browser-service.mjs': 'export async function handleRpc() {}\n',
    'cua_node/lib/node_modules/@oai/sky/dist/project/cua/sky_js/src/targets/mac/client.js': `this.apiVersion="${ipc}";\n`,
    'cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService': `helper ${ipc}\n`,
    'cua_node/lib/node_modules/corepack/dist/corepack.js': '// corepack\n',
    'cua_node/manifest.json': vendorRaw ?? JSON.stringify({
      platform: 'darwin', arch: 'arm64', target: 'darwin-arm64',
      node_version: '24.21.0-cua.1', runtime_archive_version: '0.0.27/20260927214556-b77d38801cca',
      ...vendor,
    }),
    'CodexCLI.app/Contents/MacOS/codex': '#!/bin/sh\necho fixture codex\n',
    // The archive's Chrome plugin (OpenAI's host for the ChatGPT extension), which install leaves out since #79.
    'chrome/extension-host/macos/arm64/ChatGPT for Chrome': '#!/bin/sh\necho fixture host, never run\n',
    'chrome/scripts/browser-client.mjs': 'export {};\n',
    'chrome/scripts/browser-service.mjs': 'export {};\n',
    'chrome/scripts/installManifest.mjs': 'export async function install() {}\n',
    'chrome/node_modules/classic-level.mjs': 'export {};\n',
  };
  for (const [rel, body] of Object.entries(files)) {
    if (omit.includes(rel)) continue;
    const path = rel.startsWith('ChatGPT.app/') ? join(root, rel)
      : rel.startsWith('CodexCLI.app/') ? join(res, 'codex-cli', rel)
        : rel.startsWith('chrome/') ? join(res, 'plugins/openai-bundled/plugins', rel) : join(res, rel);
    mkdirSync(dirname(path), {recursive: true});
    writeFileSync(path, body);
    if (body.startsWith('#!')) chmodSync(path, 0o755);
  }
  // A relative symlink like the real cua_node/bin/corepack, and an extended attribute, both of which must survive.
  if (!omit.includes('cua_node/bin/corepack'))
    symlinkSync('../lib/node_modules/corepack/dist/corepack.js', join(res, 'cua_node/bin/corepack'));
  spawnSync('xattr', ['-w', XATTR_NAME, 'kept', join(res, 'cua_node/bin/node_repl')]);
}

export function zipFixture(dir, options) {
  const tree = join(dir, 'tree');
  mkdirSync(tree, {recursive: true});
  writeFixtureApp(tree, options);
  const zip = join(dir, 'fixture.zip');
  const r = spawnSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', join(tree, 'ChatGPT.app'), zip], {encoding: 'utf8'});
  if (r.status !== 0) throw new Error(`ditto failed: ${r.stderr}`);
  rmSync(tree, {recursive: true, force: true});
  return {zip, ...digest(readFileSync(zip))};
}

export function digest(bytes) {
  return {sha256: createHash('sha256').update(bytes).digest('hex'), length: bytes.length};
}

export function fixturePin({release = '0.0.1-darwin-arm64', appVersion = release.replace(/-darwin-arm64$/, ''), sha256, length, ...overrides} = {}) {
  const pin = realPinJson();
  return {
    ...pin, release, appVersion,
    archive: {url: `https://example.invalid/ChatGPT-${appVersion}.zip`, length, sha256},
    ...overrides,
  };
}

// The production signature check would reject unsigned fixture files; tests that are about other mechanics inject
// this accepting double, and one test proves the production checker does reject the fixture.
export const acceptSignatures = async (root, pin) => pin.signing.components.map(component => ({component, valid: true, detail: 'fixture'}));

// A home whose active release is the checked-in pin of `host` ({platform, arch}; this process's by default), laid out
// with placeholder files (no vendor code), so the CLI's real pin resolution finds it on whatever host runs the suite.
// Signatures are never checked on this path (resolveRuntime checks structure only). `files` maps layout keys to file
// contents; executables start with "#!". A Linux host has no pin since cua 0.30.0 (#171 M6b): its home holds cua's own
// module tree, which its resolution answers, unless `ownRuntime` is false, beside the vendor's release as an older
// cua's install left it (./retired-release.mjs), with current.json naming that release.
export function forgeActiveRuntime(home, files = {}, {host, ownRuntime = true} = {}) {
  const target = host ?? {platform: process.platform, arch: process.arch};
  if (target.platform === 'linux') {
    if (ownRuntime) fakeModuleTree(home, target);
    const {root} = plantRetiredRelease(home, {arch: target.arch});
    writeFileSync(join(home, 'current.json'), JSON.stringify({schema: 1, release: RETIRED[target.arch].release}));
    return {root};
  }
  const pin = selectPin(loadPins(), target);
  const root = join(home, 'runtimes', pin.release);
  const dirs = new Set(['moduleDir', 'skyServiceApp']);
  for (const [key, rel] of Object.entries(pin.layout)) {
    const path = join(root, rel);
    if (dirs.has(key)) { mkdirSync(path, {recursive: true}); continue; }
    mkdirSync(dirname(path), {recursive: true});
    const body = files[key] ?? '';
    writeFileSync(path, body);
    if (body.startsWith('#!')) chmodSync(path, 0o755);
  }
  writeFileSync(join(root, 'install.json'), JSON.stringify({schema: 1, release: pin.release, archive: {sha256: pin.archive.sha256, length: pin.archive.length}}));
  writeFileSync(join(home, 'current.json'), JSON.stringify({schema: 1, release: pin.release}));
  return {root, ...(pin.layout.codexCli ? {codexCli: join(root, pin.layout.codexCli)} : {})};
}

// An ar archive of `members` ([name, bytes]) in the common format dpkg-deb writes, byte by byte (macOS's own `ar` adds a
// symbol table and BSD long names): the shape of a vendor deb, for the pin-time tools' fixtures.
export function arArchive(members) {
  const field = (value, width) => String(value).padEnd(width, ' ');
  const parts = [Buffer.from('!<arch>\n')];
  for (const [name, data] of members) {
    parts.push(Buffer.from(field(name, 16) + field(0, 12) + field(0, 6) + field(0, 6) + field(100644, 8) + field(data.length, 10) + '`\n'), data);
    if (data.length % 2) parts.push(Buffer.from('\n'));
  }
  return Buffer.concat(parts);
}
