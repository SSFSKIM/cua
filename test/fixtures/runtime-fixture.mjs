// Harmless stand-ins for the pinned ChatGPT archive: the same directory shape and vendor metadata as the real
// release, a few bytes per file, zipped with the same `ditto` the installer extracts with. Fixture pins reuse the
// checked-in pin's layout with the fixture's own release id, length and hash, so the layout data is exercised too.
import {mkdirSync, writeFileSync, symlinkSync, readFileSync, mkdtempSync, rmSync, chmodSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REAL_PIN_FILE = join(REPO, 'runtime', 'releases', '26.928.40906-darwin-arm64.json');
export const realPinJson = () => JSON.parse(readFileSync(REAL_PIN_FILE, 'utf8'));
export const XATTR_NAME = 'com.example.cua-fixture';

export function scratch(prefix = 'cua-test-', parent = tmpdir()) {
  const dir = mkdtempSync(join(parent, prefix));
  return {dir, cleanup: () => rmSync(dir, {recursive: true, force: true})};
}

// A scratch directory short enough for unix socket paths below it (the macOS per-user temp directory is not).
export const shortScratch = (prefix = 'cua-') => scratch(prefix, '/tmp');

// Writes the fixture app tree under `root`. `vendor` overrides fields of cua_node/manifest.json (`vendorRaw` replaces
// its text outright); `ipc` replaces the IPC version string; `omit` lists layout-relative paths (inside the extracted
// components) to leave out.
export function writeFixtureApp(root, {vendor = {}, vendorRaw, ipc = 'CodexComputerUseIPC-5', omit = []} = {}) {
  const res = join(root, 'ChatGPT.app/Contents/Resources');
  const files = {
    'ChatGPT.app/Contents/MacOS/ChatGPT': '#!/bin/sh\necho desktop app, never installed\n',
    'ChatGPT.app/Contents/Resources/app.asar': 'not a runtime component',
    'cua_node/bin/node': '#!/bin/sh\necho fixture node\n',
    'cua_node/bin/node_repl': '#!/bin/sh\necho fixture node_repl\n',
    'cua_node/lib/node_modules/@oai/cua-repl/bin/cua-repl.mjs': 'export {};\n',
    'cua_node/lib/node_modules/@oai/sky/dist/project/cua/sky_js/src/service.js': 'export async function handleRpc() {}\n',
    'cua_node/lib/node_modules/@oai/sky/dist/project/cua/sky_js/src/targets/mac/client.js': `this.apiVersion="${ipc}";\n`,
    'cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService': `helper ${ipc}\n`,
    'cua_node/lib/node_modules/corepack/dist/corepack.js': '// corepack\n',
    'cua_node/manifest.json': vendorRaw ?? JSON.stringify({
      platform: 'darwin', arch: 'arm64', target: 'darwin-arm64',
      node_version: '24.21.0-cua.1', runtime_archive_version: '0.0.27/20260927214556-b77d38801cca',
      ...vendor,
    }),
    'CodexCLI.app/Contents/MacOS/codex': '#!/bin/sh\necho fixture codex\n',
  };
  for (const [rel, body] of Object.entries(files)) {
    if (omit.includes(rel)) continue;
    const path = rel.startsWith('ChatGPT.app/') ? join(root, rel)
      : rel.startsWith('CodexCLI.app/') ? join(res, 'codex-cli', rel) : join(res, rel);
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

// A home whose active release is the checked-in pin, laid out with placeholder files (no vendor code), so the CLI's
// real pin resolution finds it. Signatures are never checked on this path (resolveRuntime checks structure only).
// `files` maps layout keys to file contents; executables start with "#!".
export function forgeActiveRuntime(home, files = {}) {
  const pin = realPinJson();
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
  return {root, codexCli: join(root, pin.layout.codexCli)};
}

// A stand-in for the bundled `codex` CLI: a shell script (the login environment's PATH is fixed, so no `env node`)
// that appends its argv and environment to $CODEX_HOME/fake-codex.log, prints a sentinel that must never reach cua's
// output, and exits with `exit` (after `sleep` seconds). It never touches the network or any auth file.
export const FAKE_CODEX_SENTINEL = 'fake-codex-account-sentinel@example.invalid';
export function fakeCodexScript({exit = 0, sleep = 0} = {}) {
  return `#!/bin/sh
if [ -n "$CODEX_HOME" ] && [ -d "$CODEX_HOME" ]; then
  { printf 'argv:'; for a in "$@"; do printf ' %s' "$a"; done; printf '\\n'; env | sed 's/^/env:/'; } >> "$CODEX_HOME/fake-codex.log"
fi
echo "Logged in as ${FAKE_CODEX_SENTINEL}"
echo "${FAKE_CODEX_SENTINEL}" >&2
${sleep ? `sleep ${sleep}` : ''}
exit ${exit}
`;
}
