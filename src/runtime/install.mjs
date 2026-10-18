// Pinned runtime installation and activation.
//
// install: acquire the pinned archive (a local file or the official URL), verify its length and SHA-256 before
// anything reads it as an archive, extract it in a staging directory owned by this operation, keep only the pinned
// components, verify the tree (layout, vendor manifest, IPC version, vendor code signatures), record it, move it into
// runtimes/<release> with one rename and only then rewrite the pointer. Any failure before the pointer write leaves
// the previous pointer and every existing release untouched, and the staging directory is always removed.
//
// An existing release tree is never repaired, replaced or deleted: a running connection may still execute from it.
// A verified release makes install a no-op; a damaged one is an error with offline recovery guidance; a target path
// that is not positively a release this tool installed (a file, symlink, empty directory, or a directory without a
// valid install record) is refused and left exactly as it is. Vendor
// bytes are never modified: extraction uses `ditto`, which keeps modes, symlinks, extended attributes and quarantine,
// and components move by rename on the same volume.
//
// A linux pin names the vendor's deb (`archive.format: "deb"`): the system `ar` takes its data.tar.xz member out and
// `tar` unpacks that, both checked for (with `xz`, which tar runs) before anything is downloaded, so a machine without
// them is refused with missing_tool and the package to install. A component may be a file.
// A linux pin lists nothing to signature-check; the archive hash is its trust root.
//
// The archive's Chrome plugin (OpenAI's host for the ChatGPT extension) is not installed: #79 removed that route. A
// release installed before keeps the chrome-plugin directory it was given; nothing reads or launches it.
//
// installSandboxHelper is `cua install`'s Linux sandbox helper step (#115 M3; src/sandbox/linux.mjs): the pinned asset
// for the machine's architecture, fetched from its pinned URL (Node's fetch) or taken from a local file, checked against
// the pin's length and SHA-256 in staging before anything else reads it, then placed at
// $CUA_HOME/sandbox/<upstreamTag>/codex-linux-sandbox (0755, in a 0755 directory) with one rename. The pin's hash is
// the trust root; the release's provenance attestation is checked when the pin is written, not here. A helper already
// placed with the pinned bytes makes the step a no-op; one whose bytes differ is never replaced in place (running
// children may be executing it, and a tampered file is a finding), so the step refuses with the remedy.
//
// The signature checker, fetch and the tool lookup are injectable for tests through this module API only; the CLI
// always uses the production codesign check, the global fetch and the PATH.
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, statSync, lstatSync, renameSync, writeFileSync, copyFileSync, constants as fsConstants, createReadStream, createWriteStream} from 'node:fs';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {join} from 'node:path';
import {CuaError, fail} from './errors.mjs';
import {homeLayout, readPointer, writePointer, realHome} from './layout.mjs';
import {findPin, loadPins, readInstalledRecord, assertHostSupports, recoveryHint, isRealDirectory, RECORD_FILE} from './manifest.mjs';
import {verifyCodeSignatures, verifyRuntimeTree} from './checks.mjs';
import {findTool, requireTools} from './tools.mjs';
import {helperAsset, helperDir, helperPath, loadHelperPin, sha256Of} from '../sandbox/linux.mjs';

// What unpacking a deb runs, and the package each comes from.
const DEB_TOOLS = {ar: 'binutils', tar: 'tar', xz: 'xz-utils'};
const DEB_PAYLOAD = 'data.tar.xz';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options}, (error, stdout, stderr) =>
      error ? reject(Object.assign(error, {stderr})) : resolve(stdout));
  });
}

export async function installRuntime({home, manifest, archivePath, fetch = globalThis.fetch, verifySignatures = verifyCodeSignatures, host, onProgress, tools = name => findTool(name)}) {
  assertHostSupports(manifest, host);
  const real = realHome(home, {create: true});
  const layout = homeLayout(real);
  mkdirSync(layout.runtimes, {recursive: true, mode: 0o700});
  mkdirSync(layout.staging, {recursive: true, mode: 0o700});
  const target = join(layout.runtimes, manifest.release);
  const acquisition = {manifest, archivePath, fetch, onProgress, tools, staging: layout.staging};

  // Idempotent path: a release this tool installed that still verifies is kept byte-for-byte and (re)activated.
  const existing = existingRelease(target, manifest);
  if (existing) {
    try {
      await verifyRuntimeTree(target, manifest, {verifySignatures});
    } catch (error) {
      if (!(error instanceof CuaError)) throw error;
      fail('installed_release_invalid', `installed release ${manifest.release} no longer verifies (${error.message}); it is not repaired in place`, {hint: recoveryHint(target, manifest.platform), cause: error});
    }
    activate(real, manifest.release);
    return {release: manifest.release, root: target, record: existing, changed: false};
  }
  assertTargetFree(target);

  return withStage(acquisition, async (stage, {extracted, source}) => {
    const tree = join(stage, 'release');
    mkdirSync(tree, {mode: 0o755});
    for (const [name, from] of Object.entries(manifest.components)) {
      const component = join(extracted, from);
      let stat;
      try { stat = lstatSync(component); } catch { stat = null; }
      if (!stat?.isDirectory() && !stat?.isFile()) fail('layout_invalid', `archive for ${manifest.release} has no component ${from}`);
      renameSync(component, join(tree, name));
    }
    await verifyRuntimeTree(tree, manifest, {verifySignatures});
    rmSync(extracted, {recursive: true, force: true});
    const fresh = {schema: 1, release: manifest.release, archive: {sha256: manifest.archive.sha256, length: manifest.archive.length}, source, installedAt: new Date().toISOString()};
    writeFileSync(join(tree, RECORD_FILE), JSON.stringify(fresh, null, 2) + '\n', {mode: 0o644});

    moveIntoPlace(tree, target);
    activate(real, manifest.release);
    return {release: manifest.release, root: target, record: fresh, changed: true};
  });
}

// Acquires and verifies the pinned archive in a staging directory owned by this operation, extracts it there, runs
// `use` with the extracted tree, and always removes the staging directory. A deb's tools are checked first, before
// anything is downloaded or created.
async function withStage({manifest, archivePath, fetch, onProgress, tools, staging}, use) {
  const deb = manifest.archive.format === 'deb';
  const unpackers = deb ? requireTools(DEB_TOOLS, tools, `cua install needs them to unpack the ${manifest.release} deb`) : null;
  const stage = mkdtempSync(join(staging, `${manifest.release}-`));
  try {
    const archive = join(stage, deb ? 'archive.deb' : 'archive.zip');
    const source = archivePath ? 'archive' : 'download';
    if (archivePath) await snapshotArchive(archivePath, archive, manifest.archive, {deb});
    else await download(manifest.archive, archive, fetch, onProgress);
    await verifyArchive(archive, manifest.archive);

    const extracted = join(stage, 'extract');
    try {
      if (deb) await extractDeb(archive, {stage, extracted, unpackers});
      else await run('/usr/bin/ditto', ['-x', '-k', archive, extracted]);
    } catch (error) {
      fail('extract_failed', `could not extract ${manifest.release}: ${(error.stderr || error.message).trim().split('\n').at(-1)}`);
    }
    rmSync(archive, {force: true});
    return await use(stage, {extracted, source});
  } finally {
    rmSync(stage, {recursive: true, force: true});
  }
}

// The deb's payload, unpacked whole into `extracted` (the pin names the components inside it). `ar x` writes the member
// into its working directory, the stage; tar runs xz for the .xz payload.
async function extractDeb(archive, {stage, extracted, unpackers}) {
  await run(unpackers.ar, ['x', archive, DEB_PAYLOAD], {cwd: stage});
  const payload = join(stage, DEB_PAYLOAD);
  mkdirSync(extracted);
  await run(unpackers.tar, ['-xJf', payload, '-C', extracted]);
  rmSync(payload, {force: true});
}

// Select an installed release: it must have a checked-in pin, an install record matching that pin, and still verify.
export async function useRuntime({home, release, pins = loadPins(), verifySignatures = verifyCodeSignatures, host}) {
  const pin = findPin(pins, release);
  assertHostSupports(pin, host);
  const real = realHome(home);
  const root = join(homeLayout(real).runtimes, pin.release);
  if (!isRealDirectory(root)) fail('release_not_installed', `release ${pin.release} is not installed in ${real}`, {hint: 'run `cua install` for it first'});
  readInstalledRecord(root, pin);
  await verifyRuntimeTree(root, pin, {verifySignatures});
  activate(real, pin.release);
  return {release: pin.release, root};
}

// The install record of a release tree this tool installed, or null when nothing is at the target. Ownership needs
// a real directory (not a symlink) holding a record valid for this pin; anything else present is not ours.
function existingRelease(target, manifest) {
  if (!isRealDirectory(target)) return null;
  try { return readInstalledRecord(target, manifest); } catch (error) { if (error instanceof CuaError) return null; throw error; }
}

function occupied(target) {
  return fail('target_occupied', `${target} exists and was not installed by cua; it is left untouched`, {hint: 'move it aside yourself, then run install again'});
}

export function assertTargetFree(target) {
  try { lstatSync(target); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  occupied(target);
}

// Rewrites the pointer only when it does not already name the release, so a repeated install changes nothing.
function activate(home, release) {
  let current = null;
  try { current = readPointer(home); } catch (error) { if (!(error instanceof CuaError)) throw error; }
  if (current === release) return;
  try {
    writePointer(home, release);
  } catch (error) {
    fail('activation_failed', `release ${release} is installed but could not be made active: ${error.message}`, {cause: error});
  }
}

// The target is claimed with an exclusive mkdir, so nothing that appeared there since the earlier check can be
// overwritten (a plain rename would silently replace an empty directory). The rename then replaces only our own
// empty claim. On failure the claim is removed only if it is still empty.
export function moveIntoPlace(tree, target) {
  try {
    mkdirSync(target);
  } catch (error) {
    if (error.code === 'EEXIST') occupied(target);
    throw error;
  }
  try {
    renameSync(tree, target);
  } catch (error) {
    try { rmdirSync(target); } catch {}
    fail('activation_failed', `could not place the verified release at ${target}: ${error.code ?? error.message}`, {cause: error});
  }
}

// A local archive is cloned into staging first (APFS clone; extended attributes and quarantine kept), so the bytes
// that are hashed are exactly the bytes that are extracted. A deb is copied with Node (a reflink where the filesystem
// has them): Linux has no `cp -c`, and a deb carries no extended attributes cua keeps.
async function snapshotArchive(path, dest, {length}, {deb}) {
  let stat;
  try { stat = statSync(path); } catch (error) { fail('archive_missing', `archive ${path} is not readable: ${error.code ?? error.message}`); }
  if (!stat.isFile()) fail('archive_missing', `archive ${path} is not a file`);
  if (stat.size !== length) fail('archive_length_mismatch', `archive ${path} is ${stat.size} bytes; the pin expects ${length}`, {hint: 'pass the pinned ChatGPT archive, or omit --archive to download it'});
  if (deb) { copyFileSync(path, dest, fsConstants.COPYFILE_FICLONE); return; }
  try {
    await run('/bin/cp', ['-c', path, dest]);
  } catch {
    await run('/bin/cp', [path, dest]);
  }
}

export async function download({url, length}, dest, fetchImpl, onProgress) {
  let response;
  try {
    response = await fetchImpl(url, {redirect: 'follow'});
  } catch (error) {
    fail('download_failed', `could not fetch ${url}: ${error.cause?.code ?? error.message}`, {cause: error});
  }
  if (!response.ok || !response.body) fail('download_failed', `${url} answered HTTP ${response.status}`);
  const declared = Number(response.headers.get('content-length'));
  if (declared && declared !== length) fail('archive_length_mismatch', `${url} declares ${declared} bytes; the pin expects ${length}`);
  let received = 0;
  try {
    await pipeline(Readable.fromWeb(response.body), async function* (chunks) {
      for await (const chunk of chunks) {
        received += chunk.length;
        if (received > length) fail('archive_length_mismatch', `${url} sent more than the pinned ${length} bytes`);
        onProgress?.(received, length);
        yield chunk;
      }
    }, createWriteStream(dest, {mode: 0o600}));
  } catch (error) {
    if (error instanceof CuaError) throw error;
    fail('download_failed', `download of ${url} failed after ${received} bytes: ${error.message}`, {cause: error});
  }
}

export async function verifyArchive(path, {length, sha256}) {
  const size = statSync(path).size;
  if (size !== length) fail('archive_length_mismatch', `archive is ${size} bytes; the pin expects ${length}`);
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  const actual = hash.digest('hex');
  if (actual !== sha256) fail('archive_hash_mismatch', `archive SHA-256 is ${actual}; the pin expects ${sha256}`);
}

// `cua install`'s Linux sandbox helper step (the header) -> {path, sha256, changed}. `path` is a local copy of the
// pinned asset to take instead of downloading it.
export async function installSandboxHelper({home, pin = loadHelperPin(), path, fetch = globalThis.fetch, host = {platform: process.platform, arch: process.arch}, onProgress}) {
  if (host.platform !== 'linux') fail('unsupported_platform', `cua's sandbox helper is a Linux binary; this host is ${host.platform}-${host.arch}`);
  const asset = helperAsset(pin, host.arch);
  const real = realHome(home, {create: true});
  const target = helperPath(real, pin);
  let placed = null;
  try { placed = readFileSync(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (placed) {
    if (sha256Of(placed) === asset.sha256) return {path: target, sha256: asset.sha256, changed: false};
    fail('sandbox_helper_invalid', `the sandbox helper at ${target} is not the pinned ${pin.upstreamTag} helper for linux-${host.arch}; it is not replaced in place`,
      {hint: `stop any \`cua serve\` using it, remove ${helperDir(real, pin)}, then run \`cua install\` again`});
  }
  const staging = homeLayout(real).staging;
  mkdirSync(staging, {recursive: true, mode: 0o700});
  const stage = mkdtempSync(join(staging, 'sandbox-helper-'));
  try {
    const staged = join(stage, 'codex-linux-sandbox');
    if (path) {
      let stat;
      try { stat = statSync(path); } catch (error) { fail('archive_missing', `sandbox helper ${path} is not readable: ${error.code ?? error.message}`); }
      if (!stat.isFile()) fail('archive_missing', `sandbox helper ${path} is not a file`);
      copyFileSync(path, staged);
    } else {
      await download(asset, staged, fetch, onProgress);
    }
    await verifyArchive(staged, asset);
    chmodSync(staged, 0o755);
    mkdirSync(helperDir(real, pin), {recursive: true, mode: 0o755});
    renameSync(staged, target);
    return {path: target, sha256: asset.sha256, changed: true};
  } finally {
    rmSync(stage, {recursive: true, force: true});
  }
}
