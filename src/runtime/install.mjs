// Pinned runtime installation and activation.
//
// install: acquire the pinned archive (a local file or the official URL), verify its length and SHA-256 before
// anything reads it as a zip, extract it in a staging directory owned by this operation, keep only the pinned
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
// The archive's Chrome plugin is a separately recorded component inside the release tree (chrome-component.mjs). A fresh
// install places it in the staged tree before the one activation rename. An installed release that lacks it gains it
// on the next install, staged and verified on its own and moved in with one rename, so no existing file changes; this
// needs the archive again (or a download). A release whose component is already placed and verifies is a no-op.
//
// The signature checker and fetch are injectable for tests through this module API only; the CLI always uses the
// production codesign check and the global fetch.
import {mkdirSync, mkdtempSync, rmSync, rmdirSync, statSync, lstatSync, renameSync, writeFileSync, createReadStream, createWriteStream} from 'node:fs';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {join} from 'node:path';
import {CuaError, fail} from './errors.mjs';
import {homeLayout, readPointer, writePointer, realHome} from './layout.mjs';
import {findPin, loadPins, readInstalledRecord, assertHostSupports, recoveryHint, isRealDirectory, runtimeFor, RECORD_FILE} from './manifest.mjs';
import {verifyCodeSignatures, verifyRuntimeTree} from './checks.mjs';
import {componentState, componentRecoveryHint, stageChromeComponent, verifyChromeComponent} from './chrome-component.mjs';


function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}, (error, stdout, stderr) =>
      error ? reject(Object.assign(error, {stderr})) : resolve(stdout));
  });
}

export async function installRuntime({home, manifest, archivePath, fetch = globalThis.fetch, verifySignatures = verifyCodeSignatures, host, onProgress}) {
  assertHostSupports(manifest, host);
  const real = realHome(home, {create: true});
  const layout = homeLayout(real);
  mkdirSync(layout.runtimes, {recursive: true, mode: 0o700});
  mkdirSync(layout.staging, {recursive: true, mode: 0o700});
  const target = join(layout.runtimes, manifest.release);
  const acquisition = {manifest, archivePath, fetch, onProgress, staging: layout.staging};

  // Idempotent path: a release this tool installed that still verifies is kept byte-for-byte and (re)activated, after
  // gaining the Chrome plugin component if it lacks it.
  const existing = existingRelease(target, manifest);
  if (existing) {
    try {
      await verifyRuntimeTree(target, manifest, {verifySignatures});
    } catch (error) {
      if (!(error instanceof CuaError)) throw error;
      fail('installed_release_invalid', `installed release ${manifest.release} no longer verifies (${error.message}); it is not repaired in place`, {hint: recoveryHint(target), cause: error});
    }
    const chromeHost = await ensureChromeComponent({real, target, record: existing, acquisition, verifySignatures});
    activate(real, manifest.release);
    return {release: manifest.release, root: target, record: existing, changed: chromeHost.changed, releaseChanged: false, chromeHost};
  }
  assertTargetFree(target);

  return withStage(acquisition, async (stage, {extracted, source}) => {
    const tree = join(stage, 'release');
    mkdirSync(tree, {mode: 0o755});
    for (const [name, from] of Object.entries(manifest.components)) {
      const component = join(extracted, from);
      let stat;
      try { stat = lstatSync(component); } catch { stat = null; }
      if (!stat?.isDirectory()) fail('layout_invalid', `archive for ${manifest.release} has no component directory ${from}`);
      renameSync(component, join(tree, name));
    }
    await verifyRuntimeTree(tree, manifest, {verifySignatures});
    await stageChromeComponent({extracted, into: tree, runtime: runtimeFor({home: real, pin: manifest, record: null}), source, verifySignatures});
    rmSync(extracted, {recursive: true, force: true});
    const fresh = {schema: 1, release: manifest.release, archive: {sha256: manifest.archive.sha256, length: manifest.archive.length}, source, installedAt: new Date().toISOString()};
    writeFileSync(join(tree, RECORD_FILE), JSON.stringify(fresh, null, 2) + '\n', {mode: 0o644});

    ensureCodexHome(real);
    moveIntoPlace(tree, target);
    activate(real, manifest.release);
    return {release: manifest.release, root: target, record: fresh, changed: true, releaseChanged: true, chromeHost: {root: join(target, manifest.chromePlugin.dir), changed: true}};
  });
}

// The Chrome plugin component of an installed, verified release: kept when it is placed and verifies, refused when its
// path holds something else or it no longer verifies (never repaired in place), otherwise staged from the archive on
// its own and moved in with one rename.
async function ensureChromeComponent({real, target, record, acquisition, verifySignatures}) {
  const {manifest} = acquisition;
  const root = join(target, manifest.chromePlugin.dir);
  const {state} = componentState(root, manifest);
  if (state === 'occupied') occupied(root);
  if (state === 'placed') {
    try {
      await verifyChromeComponent(root, manifest, {verifySignatures});
    } catch (error) {
      if (!(error instanceof CuaError)) throw error;
      fail('chrome_component_invalid', `the Chrome host component of ${manifest.release} no longer verifies (${error.message}); it is not repaired in place`, {hint: componentRecoveryHint(root), cause: error});
    }
    return {root, changed: false};
  }
  return withStage(acquisition, async (stage, {extracted, source}) => {
    const placed = await stageChromeComponent({extracted, into: stage, runtime: runtimeFor({home: real, pin: manifest, record}), source, verifySignatures});
    ensureCodexHome(real);
    moveIntoPlace(placed, root);
    return {root, changed: true};
  });
}

// Acquires and verifies the pinned archive in a staging directory owned by this operation, extracts it there, runs
// `use` with the extracted tree, and always removes the staging directory.
async function withStage({manifest, archivePath, fetch, onProgress, staging}, use) {
  const stage = mkdtempSync(join(staging, `${manifest.release}-`));
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
    return await use(stage, {extracted, source});
  } finally {
    rmSync(stage, {recursive: true, force: true});
  }
}

// The host configuration names <home>/state/codex as CODEX_HOME; it exists (private) once the host is placed.
function ensureCodexHome(home) {
  mkdirSync(homeLayout(home).codexHome, {recursive: true, mode: 0o700});
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

function assertTargetFree(target) {
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
function moveIntoPlace(tree, target) {
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
