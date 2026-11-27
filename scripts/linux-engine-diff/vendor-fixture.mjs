// The comparator fixture (#171 M6b, its pre-flight §4.4, F7): the one place the gate (scripts/linux-engine-gate/gate.mjs)
// finds the pinned vendor build and the vendor's JavaScript client, now that no cua home holds them for it. A development
// instrument only: nothing that serve, install or doctor reaches imports this module or names its directory.
//
// A fixture is a directory outside any cua home, one per architecture, holding
//   - `26.928.40906-linux-<arch>.tar`: the vendor's release tree as an installed home held it (`cua_node/` and cua's own
//     `install.json`), compared once with its authenticated deb before its entry below was written
//     (vendor-fixture-pin.mjs);
//   - `tree-sha256.txt`: every file of that tree with its SHA-256, `<hash>  ./<path>`, one a line;
//   - `SHA256SUMS`: the tar's hash (kept for `sha256sum -c`; the repository's manifest is what this module trusts).
// The repository's manifest, scripts/linux-engine-gate/vendor-fixture.json, holds for each architecture the tar's SHA-256
// and length, the SHA-256 of tree-sha256.txt and its file count, the deb it was compared with, and the pinned build's
// digest; it holds hashes only, never a byte of the vendor's (ruling 1217, N7).
//
// verifyVendorFixture checks the list against the manifest, extracts the tar beside it on first use (once its hash is the
// manifest's), and before every use checks every extracted file against the list: the same names, regular files only,
// the same bytes, nothing extra. Any difference refuses: it is never a skip and never a fetch, and nothing here fetches.
// Whoever runs the gate restores a lost fixture from the x64 VM's copy or the owner's MacBook's, checked by the same hashes.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The pinned vendor release the fixtures hold (runtime/releases' Linux pins, until M6b moved them to provenance). */
export const VENDOR_FIXTURE_RELEASE = '26.928.40906';
export const releaseName = (arch) => `${VENDOR_FIXTURE_RELEASE}-linux-${arch}`;
export const MANIFEST_FILE = new URL('../linux-engine-gate/vendor-fixture.json', import.meta.url);
/** The tree list's name in a fixture directory, and the directory the tar is extracted into beside it. */
export const TREE_LIST = 'tree-sha256.txt';
export const EXTRACTED = 'extracted';
/** The vendor's client and the pinned build inside the release tree, relative to it. */
export const SKY_DIR = 'cua_node/lib/node_modules/@oai/sky';
export const binaryPath = (arch) => `${SKY_DIR}/bin/linux/sky_linux_${arch}`;
export const SERVICE_PATH = `${SKY_DIR}/dist/project/cua/sky_js/src/service.js`;

/** Where a fixture lives on #171's VMs when no `--vendor-fixture` names one: `~/.local/share/cua-171/vendor-<arch>-pinned`. */
export const defaultFixtureDir = (arch, home = homedir()) => join(home, '.local/share/cua-171', `vendor-${arch}-pinned`);

/** The paths a fixture gives, by its directory alone (nothing is read): the release tree, the pinned build, the client. */
export function fixturePaths(dir, arch) {
  const root = join(dir, EXTRACTED, releaseName(arch));
  return { root, vendor: join(root, binaryPath(arch)), vendorJs: join(root, SKY_DIR) };
}

export class VendorFixtureRefused extends Error {
  constructor(message) {
    super(message);
    this.name = 'VendorFixtureRefused';
  }
}
const refuse = (message) => {
  throw new VendorFixtureRefused(message);
};

const HEX64 = /^[0-9a-f]{64}$/;
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const keysAre = (value, keys) => plain(value) && Object.keys(value).sort().join() === [...keys].sort().join();

/** One architecture's entry of the manifest, checked for its shape; throws naming what is wrong. */
export function checkManifestEntry(arch, entry) {
  const ok =
    keysAre(entry, ['release', 'tar', 'treeList', 'binary', 'deb']) &&
    entry.release === releaseName(arch) &&
    keysAre(entry.tar, ['name', 'sha256', 'length']) && entry.tar.name === `${releaseName(arch)}.tar` && HEX64.test(entry.tar.sha256) && Number.isSafeInteger(entry.tar.length) && entry.tar.length > 0 &&
    keysAre(entry.treeList, ['sha256', 'files']) && HEX64.test(entry.treeList.sha256) && Number.isSafeInteger(entry.treeList.files) && entry.treeList.files > 0 &&
    keysAre(entry.binary, ['path', 'sha256']) && entry.binary.path === binaryPath(arch) && HEX64.test(entry.binary.sha256) &&
    keysAre(entry.deb, ['release', 'sha256', 'length']) && entry.deb.release === releaseName(arch) && HEX64.test(entry.deb.sha256) && Number.isSafeInteger(entry.deb.length);
  if (!ok) refuse(`the comparator fixture manifest's ${arch} entry is not {release, tar: {name, sha256, length}, treeList: {sha256, files}, binary: {path, sha256}, deb: {release, sha256, length}} for ${releaseName(arch)}`);
  return entry;
}

/** The manifest, `{schema: 1, about, fixtures: {<arch>: entry}}`, each entry checked. */
export function loadFixtureManifest(file = MANIFEST_FILE) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    refuse(`the comparator fixture manifest ${file instanceof URL ? file.pathname : file} cannot be read: ${error.message}`);
  }
  if (!keysAre(manifest, ['schema', 'about', 'fixtures']) || manifest.schema !== 1 || !plain(manifest.fixtures)) refuse('the comparator fixture manifest is not {schema: 1, about, fixtures}');
  for (const [arch, entry] of Object.entries(manifest.fixtures)) checkManifestEntry(arch, entry);
  return manifest;
}

export const sha256Bytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** A file's SHA-256, read in chunks (the tars are about 210 MB). */
export function sha256File(path) {
  const hash = createHash('sha256');
  const fd = openSync(path, 'r');
  try {
    const chunk = Buffer.alloc(1 << 20);
    let n;
    while ((n = readSync(fd, chunk, 0, chunk.length, null)) > 0) hash.update(chunk.subarray(0, n));
  } finally {
    closeSync(fd);
  }
  return hash.digest('hex');
}

/**
 * A tree list's text -> Map(<path relative to the release, no `./`> -> sha256). Every line is `<64 hex>  ./<path>` of
 * plain components (no `.` or `..`, no empty one), each path once; anything else refuses.
 */
export function parseTreeList(text) {
  const files = new Map();
  for (const line of text.split('\n')) {
    if (line === '') continue;
    const match = /^([0-9a-f]{64}) {2}\.\/(.+)$/.exec(line);
    const parts = match ? match[2].split('/') : [];
    if (!match || parts.some((p) => p === '' || p === '.' || p === '..') || files.has(match[2])) refuse(`the tree list has a line that is not \`<sha256>  ./<path>\` of a new plain path: ${JSON.stringify(line.slice(0, 200))}`);
    files.set(match[2], match[1]);
  }
  return files;
}

/**
 * The tree at `root` walked by `lstat`, following nothing -> {files: Map(path -> sha256), other: [paths of entries that
 * are neither a regular file nor a directory]}; paths relative to `root`.
 */
export function walkTree(root) {
  const files = new Map();
  const other = [];
  const walk = (dir, rel) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      const stat = lstatSync(path);
      if (stat.isDirectory()) walk(path, relPath);
      else if (stat.isFile()) files.set(relPath, sha256File(path));
      else other.push(relPath);
    }
  };
  walk(root, '');
  return { files, other };
}

/** What differs between a walked tree and the list -> sentences, the first `limit` of each kind. */
export function treeDifferences({ files, other }, listed, limit = 10) {
  const missing = [...listed.keys()].filter((p) => !files.has(p));
  const extra = [...files.keys()].filter((p) => !listed.has(p));
  const changed = [...listed.keys()].filter((p) => files.has(p) && files.get(p) !== listed.get(p));
  const out = [];
  const say = (what, list) => list.length && out.push(`${list.length} ${what}: ${list.slice(0, limit).join(', ')}${list.length > limit ? ', …' : ''}`);
  say('missing', missing);
  say('not in the list', extra);
  say('changed', changed);
  say('neither a file nor a directory', other);
  return out;
}

/**
 * Whether `path` is a real directory of the fixture's own, by `lstat`: false when nothing is there, true for a directory;
 * a link (even one that leads to a directory that holds the listed bytes, a cua home's runtimes/ say) or anything else
 * refuses. Nothing is followed.
 */
function ownDirectory(path) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    refuse(`${path} cannot be read: ${error.code ?? error.message}`);
  }
  if (stat.isSymbolicLink()) refuse(`${path} is a link, not a directory of the fixture's own: a cache root is never followed`);
  if (!stat.isDirectory()) refuse(`${path} is not a directory`);
  return true;
}

/** Extract `tar` into `into` with the system tar, which never touches a display. */
const tarExtract = (tar, into) => execFileSync('tar', ['-xf', tar, '-C', into], { stdio: ['ignore', 'ignore', 'pipe'] });

/**
 * The checked fixture at `dir` for `arch` -> {root, vendor, vendorJs, entry, binarySha256, serviceSha256}, or refuses
 * (VendorFixtureRefused). `manifest` is loadFixtureManifest()'s; `extract` the tar seam.
 */
export function verifyVendorFixture({ dir, arch, manifest = loadFixtureManifest(), extract = tarExtract }) {
  const entry = manifest.fixtures[arch];
  if (!entry) refuse(`the comparator fixture manifest has no ${arch} entry: no fixture was compared with that architecture's deb`);
  checkManifestEntry(arch, entry);
  if (!existsSync(dir)) refuse(`no comparator fixture at ${dir}: copy it from the x64 VM's or the MacBook's (~/.local/share/cua-171/vendor-fixtures/${arch}/), or name one with --vendor-fixture`);
  const listFile = join(dir, TREE_LIST);
  let listBytes;
  try {
    listBytes = readFileSync(listFile);
  } catch (error) {
    refuse(`the fixture's tree list ${listFile} cannot be read: ${error.code ?? error.message}`);
  }
  if (sha256Bytes(listBytes) !== entry.treeList.sha256) refuse(`the fixture's tree list ${listFile} is not the manifest's (SHA-256 ${sha256Bytes(listBytes)}, not ${entry.treeList.sha256})`);
  const listed = parseTreeList(listBytes.toString('utf8'));
  if (listed.size !== entry.treeList.files) refuse(`the fixture's tree list names ${listed.size} files, not the manifest's ${entry.treeList.files}`);
  if (listed.get(entry.binary.path) !== entry.binary.sha256) refuse(`the fixture's tree list gives ${entry.binary.path} as ${listed.get(entry.binary.path) ?? 'absent'}, not the manifest's pinned build ${entry.binary.sha256}`);

  const extracted = join(dir, EXTRACTED);
  if (!ownDirectory(extracted)) {
    const tar = join(dir, entry.tar.name);
    let size;
    try {
      size = lstatSync(tar).size;
    } catch (error) {
      refuse(`the fixture's tar ${tar} cannot be read: ${error.code ?? error.message}`);
    }
    const digest = sha256File(tar);
    if (size !== entry.tar.length || digest !== entry.tar.sha256) refuse(`the fixture's tar ${tar} is not the manifest's (${size} bytes, SHA-256 ${digest}; the manifest has ${entry.tar.length} bytes, ${entry.tar.sha256})`);
    const scratch = join(dir, `.${EXTRACTED}-${process.pid}`);
    rmSync(scratch, { recursive: true, force: true });
    mkdirSync(scratch, { mode: 0o700 });
    try {
      extract(tar, scratch);
      renameSync(scratch, extracted);
    } catch (error) {
      rmSync(scratch, { recursive: true, force: true });
      refuse(`the fixture's tar ${tar} could not be extracted: ${String(error.stderr ?? error.message).trim().split('\n').at(-1)}`);
    }
  }
  const top = readdirSync(extracted);
  if (top.length !== 1 || top[0] !== releaseName(arch)) refuse(`${extracted} holds ${JSON.stringify(top)}, not the one release ${releaseName(arch)}`);
  const paths = fixturePaths(dir, arch);
  if (!ownDirectory(paths.root)) refuse(`${paths.root} is not there`);
  const differences = treeDifferences(walkTree(paths.root), listed);
  if (differences.length) refuse(`the extracted fixture ${paths.root} is not its list: ${differences.join('; ')}`);
  return { ...paths, entry, binarySha256: listed.get(entry.binary.path), serviceSha256: listed.get(SERVICE_PATH) ?? null };
}
