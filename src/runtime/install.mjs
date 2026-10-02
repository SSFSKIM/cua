// Pinned runtime installation and activation.
//
// install: acquire the pinned archive (a local file or the official URL), verify its length and SHA-256 before
// anything reads it as a zip, extract it in a staging directory owned by this operation, keep only the pinned
// components, verify the tree (layout, vendor manifest, IPC version, vendor code signatures), record it, move it into
// runtimes/<release> with one rename and only then rewrite the pointer. Any failure before the pointer write leaves
// the previous pointer and every existing release untouched, and the staging directory is always removed. Vendor
// bytes are never modified: extraction uses `ditto`, which keeps modes, symlinks, extended attributes and quarantine,
// and components move by rename on the same volume.
//
// The signature checker and fetch are injectable for tests through this module API only; the CLI always uses the
// production codesign check and the global fetch.
import {mkdirSync, mkdtempSync, rmSync, statSync, lstatSync, renameSync, writeFileSync, existsSync, createReadStream, createWriteStream} from 'node:fs';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {join} from 'node:path';
import {CuaError, fail} from './errors.mjs';
import {homeLayout, readPointer, writePointer, realHome} from './layout.mjs';
import {RECORD_FILE, findPin, loadPins, readInstalledRecord} from './manifest.mjs';
import {verifyCodeSignatures, verifyRuntimeTree} from './checks.mjs';

const hostTarget = () => ({platform: process.platform, arch: process.arch});

function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}, (error, stdout, stderr) =>
      error ? reject(Object.assign(error, {stderr})) : resolve(stdout));
  });
}

export async function installRuntime({home, manifest, archivePath, fetch = globalThis.fetch, verifySignatures = verifyCodeSignatures, host = hostTarget(), onProgress}) {
  if (manifest.platform !== host.platform || manifest.arch !== host.arch)
    fail('unsupported_platform', `release ${manifest.release} is for ${manifest.platform}-${manifest.arch}; this host is ${host.platform}-${host.arch}`);
  const real = realHome(home, {create: true});
  const layout = homeLayout(real);
  mkdirSync(layout.runtimes, {recursive: true, mode: 0o700});
  mkdirSync(layout.staging, {recursive: true, mode: 0o700});
  const target = join(layout.runtimes, manifest.release);

  // Idempotent path: a release this tool installed that still verifies is kept byte-for-byte and (re)activated. One
  // that no longer verifies is replaced below by a fresh verified copy.
  const ours = isOwnedRelease(target);
  const record = ours ? await verifiedRecord(target, manifest, verifySignatures) : null;
  if (record) {
    activate(real, manifest.release);
    return {release: manifest.release, root: target, record, changed: false};
  }

  const stage = mkdtempSync(join(layout.staging, `${manifest.release}-`));
  try {
    const archive = join(stage, 'archive.zip');
    const source = archivePath ? 'archive' : 'download';
    if (archivePath) await snapshotArchive(archivePath, archive, manifest.archive);
    else await download(manifest.archive, archive, fetch, onProgress);
    await verifyArchive(archive, manifest.archive);

    const extracted = join(stage, 'extract');
    try {
      await run('/usr/bin/ditto', ['-x', '-k', archive, extracted]);
    } catch (error) {
      fail('extract_failed', `could not extract ${manifest.release}: ${(error.stderr || error.message).trim().split('\n').at(-1)}`);
    }
    rmSync(archive, {force: true});

    const tree = join(stage, 'release');
    mkdirSync(tree, {mode: 0o755});
    for (const [name, from] of Object.entries(manifest.components)) {
      const component = join(extracted, from);
      let stat;
      try { stat = lstatSync(component); } catch { stat = null; }
      if (!stat?.isDirectory()) fail('layout_invalid', `archive for ${manifest.release} has no component directory ${from}`);
      renameSync(component, join(tree, name));
    }
    rmSync(extracted, {recursive: true, force: true});

    await verifyRuntimeTree(tree, manifest, {verifySignatures});
    const fresh = {schema: 1, release: manifest.release, archive: {sha256: manifest.archive.sha256, length: manifest.archive.length}, source, installedAt: new Date().toISOString()};
    writeFileSync(join(tree, RECORD_FILE), JSON.stringify(fresh, null, 2) + '\n', {mode: 0o644});

    moveIntoPlace(tree, target, {replacing: ours, aside: join(stage, 'previous')});
    activate(real, manifest.release);
    return {release: manifest.release, root: target, record: fresh, changed: true};
  } finally {
    rmSync(stage, {recursive: true, force: true});
  }
}

// Select an installed release: it must have a checked-in pin, an install record matching that pin, and still verify.
export async function useRuntime({home, release, pins = loadPins(), verifySignatures = verifyCodeSignatures}) {
  const pin = findPin(pins, release);
  const real = realHome(home);
  const root = join(homeLayout(real).runtimes, pin.release);
  if (!existsSync(root)) fail('release_not_installed', `release ${pin.release} is not installed in ${real}`, {hint: 'run `cua install` for it first'});
  readInstalledRecord(root, pin);
  await verifyRuntimeTree(root, pin, {verifySignatures});
  activate(real, pin.release);
  return {release: pin.release, root};
}

function isOwnedRelease(target) {
  try { return lstatSync(target).isDirectory() && existsSync(join(target, RECORD_FILE)); } catch { return false; }
}

async function verifiedRecord(root, manifest, verifySignatures) {
  try {
    const record = readInstalledRecord(root, manifest);
    await verifyRuntimeTree(root, manifest, {verifySignatures});
    return record;
  } catch (error) {
    if (error instanceof CuaError) return null;
    throw error;
  }
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

// One rename makes the verified tree visible. Replacing an owned release moves the old tree aside first and puts it
// back if the second rename fails; anything at the target that this tool did not install is left alone.
function moveIntoPlace(tree, target, {replacing, aside}) {
  if (replacing) renameSync(target, aside);
  try {
    renameSync(tree, target);
  } catch (error) {
    if (replacing) renameSync(aside, target);
    fail('activation_failed', `could not place the verified release at ${target}: ${error.code ?? error.message}`, {hint: 'move aside whatever occupies that path, then run install again', cause: error});
  }
}

// A local archive is cloned into staging first (APFS clone; extended attributes and quarantine kept), so the bytes
// that are hashed are exactly the bytes that are extracted.
async function snapshotArchive(path, dest, {length}) {
  let stat;
  try { stat = statSync(path); } catch (error) { fail('archive_missing', `archive ${path} is not readable: ${error.code ?? error.message}`); }
  if (!stat.isFile()) fail('archive_missing', `archive ${path} is not a file`);
  if (stat.size !== length) fail('archive_length_mismatch', `archive ${path} is ${stat.size} bytes; the pin expects ${length}`, {hint: 'pass the pinned ChatGPT archive, or omit --archive to download it'});
  try {
    await run('/bin/cp', ['-c', path, dest]);
  } catch {
    await run('/bin/cp', [path, dest]);
  }
}

async function download({url, length}, dest, fetchImpl, onProgress) {
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

async function verifyArchive(path, {length, sha256}) {
  const size = statSync(path).size;
  if (size !== length) fail('archive_length_mismatch', `archive is ${size} bytes; the pin expects ${length}`);
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  const actual = hash.digest('hex');
  if (actual !== sha256) fail('archive_hash_mismatch', `archive SHA-256 is ${actual}; the pin expects ${sha256}`);
}
