// `cua install`'s Node step: the pinned official Node 24 for cua's own REPL host (managed-node.mjs), placed under
// $CUA_HOME/node/<version> with the runtime's discipline (install.mjs). Acquire the tarball (a local
// `--node-archive` or the pinned nodejs.org URL) into a staging directory owned by this operation, verify its length
// and SHA-256 before anything reads it, unpack only bin/node and the licence, check that the binary is signed by the
// pinned Developer ID on darwin (before it is ever run) and that `node --version` is the pinned version, record it,
// move it into place with one rename, then rewrite the pointer. The record binds the install to the SHA-256 and size
// of the bin/node it verified, and nothing whose bytes differ is ever run again (managed-node.mjs). The pointer is
// checked, and its replacement written, before the install is published; a failure anywhere leaves the pointer and
// every previously installed Node untouched, removes a just-published install whose pointer could not be written, and
// always removes the staging directory. On Linux the archive hash is the trust root.
//
// An installed Node is never repaired, replaced or deleted (a running own host may execute from it): one whose bin/node
// is still the recorded bytes (checked before it is run), signed on darwin, and reporting the pinned version makes the
// step a no-op (re-activating it if another is active), a damaged one is an error with offline recovery
// guidance, and a target path this tool did not install is refused and left as it is. Older versions stay until the
// user removes them.
//
// The signature checker, the version probe, fetch and the tool lookup are injectable for tests through this module
// API only; the CLI always uses codesign, the binary itself, the global fetch and the PATH.
import {copyFileSync, lstatSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync, constants as fsConstants} from 'node:fs';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {CuaError, fail} from './errors.mjs';
import {homeLayout, realHome} from './layout.mjs';
import {isRealDirectory} from './manifest.mjs';
import {assertTargetFree, download, moveIntoPlace, verifyArchive} from './install.mjs';
import {findTool, requireTools} from './tools.mjs';
import {NODE_RECORD_FILE, fileDigest, nodeDistName, nodeLayout, nodeMatchesRecord, nodeVersion, readNodePointer, readNodeRecord} from './managed-node.mjs';

// What unpacking the tarball runs, and the package each comes from (GNU tar runs gzip for -z).
const NODE_TOOLS = {tar: 'tar', gzip: 'gzip'};
const hostTarget = () => ({platform: process.platform, arch: process.arch});

function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}, (error, stdout, stderr) =>
      error ? reject(Object.assign(error, {stderr})) : resolve(stdout));
  });
}

// Apple's Developer ID Application certificate for `team`: Apple's anchor, the Developer ID intermediate and leaf
// markers, and the team in the leaf. A validly signed binary of another team, or one signed otherwise, fails.
export const developerIdRequirement = team =>
  `anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = "${team}"`;

export function verifyNodeSignature(path, team, {codesign = '/usr/bin/codesign'} = {}) {
  return new Promise(resolve => {
    execFile(codesign, ['--verify', '--strict', '-R', `=${developerIdRequirement(team)}`, path], {encoding: 'utf8'}, (error, stdout, stderr) => {
      const detail = (stderr || stdout || '').trim().split('\n').slice(-2).join(' ');
      resolve({valid: !error, detail: error ? detail || error.message : `signed by Developer ID team ${team}`});
    });
  });
}

export async function installNode({home, pin, archivePath, fetch = globalThis.fetch, verifySignature = verifyNodeSignature, versionOf = nodeVersion, host = hostTarget(), onProgress, tools = name => findTool(name)}) {
  if (pin.platform !== host.platform || pin.arch !== host.arch)
    fail('unsupported_platform', `Node ${pin.version} is pinned for ${pin.platform}-${pin.arch}; this host is ${host.platform}-${host.arch}`);
  const real = realHome(home, {create: true});
  const nodes = nodeLayout(real);
  const {staging} = homeLayout(real);
  mkdirSync(nodes.root, {recursive: true, mode: 0o700});
  mkdirSync(staging, {recursive: true, mode: 0o700});
  const target = nodes.version(pin.version);
  const result = (record, changed, activated) => ({version: pin.version, root: target, node: join(target, 'bin', 'node'), changed, activated, source: record.source});
  const checks = {verifySignature, versionOf};

  const existing = isRealDirectory(target) ? readNodeRecord(target, pin) : null;
  if (existing) {
    try {
      await verifyNodeTree(target, pin, checks, existing);
    } catch (error) {
      if (!(error instanceof CuaError)) throw error;
      fail('node_install_invalid', `the installed Node ${pin.version} at ${target} no longer verifies (${error.message}); it is not repaired in place`,
        {hint: `stop any \`cua serve\` using it, remove ${target}, then run \`cua install\``, cause: error});
    }
    const pointer = stagePointer(real, pin.version);
    pointer.commit();
    return result(existing, false, pointer.needed);
  }
  assertTargetFree(target);

  const unpack = requireTools(NODE_TOOLS, tools, `cua install needs them to unpack Node ${pin.version}`);
  const stage = mkdtempSync(join(staging, `node-${pin.version}-`));
  try {
    const archive = join(stage, 'node.tar.gz');
    const source = archivePath ? 'archive' : 'download';
    if (archivePath) snapshotArchive(archivePath, archive, pin);
    else await download(pin.archive, archive, fetch, onProgress);
    await verifyArchive(archive, pin.archive);

    const extracted = join(stage, 'extract');
    const top = nodeDistName(pin);
    mkdirSync(extracted);
    try {
      await run(unpack.tar, ['-xzf', archive, '-C', extracted, `${top}/bin/node`, `${top}/LICENSE`]);
    } catch (error) {
      fail('extract_failed', `could not unpack bin/node and LICENSE from the Node ${pin.version} tarball: ${(error.stderr || error.message).trim().split('\n').at(-1)}`);
    }
    rmSync(archive, {force: true});
    const tree = join(stage, 'node');
    mkdirSync(join(tree, 'bin'), {recursive: true, mode: 0o755});
    for (const part of ['bin/node', 'LICENSE']) {
      assertRegularFile(join(extracted, top), part, pin);
      renameSync(join(extracted, top, part), join(tree, part));
    }
    const node = await verifyNodeTree(tree, pin, checks);
    const record = {schema: 1, version: pin.version, platform: pin.platform, arch: pin.arch, archive: {sha256: pin.archive.sha256, length: pin.archive.length},
      node, source, installedAt: new Date().toISOString()};
    writeFileSync(join(tree, NODE_RECORD_FILE), JSON.stringify(record, null, 2) + '\n', {mode: 0o644});
    const pointer = stagePointer(real, pin.version);
    try {
      moveIntoPlace(tree, target);
    } catch (error) {
      pointer.discard();
      throw error;
    }
    try {
      pointer.commit();
    } catch (error) {
      rmSync(target, {recursive: true, force: true});   // published a moment ago, and never pointed at
      throw error;
    }
    return result(record, true, pointer.needed);
  } finally {
    rmSync(stage, {recursive: true, force: true});
  }
}

// `part` (bin/node or LICENSE) under `root` must be a regular file: a symlink could point anywhere.
function assertRegularFile(root, part, pin) {
  let stat;
  try { stat = lstatSync(join(root, part)); } catch { stat = null; }
  if (!stat?.isFile()) fail('layout_invalid', `Node ${pin.version}'s ${part} is missing or not a regular file`);
}

// The kept files; for an installed Node its recorded bytes; the darwin signature; and only then the version the binary
// reports, so nothing unverified runs. -> the bin/node digest ({sha256, size}).
async function verifyNodeTree(root, pin, {verifySignature, versionOf}, record) {
  for (const part of ['bin/node', 'LICENSE']) assertRegularFile(root, part, pin);
  const node = join(root, 'bin', 'node');
  if (record && !nodeMatchesRecord(root, record)) fail('node_binary_mismatch', `${node} is not the binary its install record names (SHA-256 ${record.node.sha256}, ${record.node.size} bytes)`);
  const digest = record ? record.node : fileDigest(node);
  if (pin.signing) {
    const signature = await verifySignature(node, pin.signing.team);
    if (!signature.valid) fail('signature_invalid', `Node ${pin.version}'s bin/node is not signed by the pinned Developer ID (team ${pin.signing.team}): ${signature.detail}`);
  }
  const reported = versionOf(node);
  if (reported !== `v${pin.version}`) fail('node_version_mismatch', `Node ${pin.version}'s bin/node reports ${reported ?? 'no readable version'}, the pin expects v${pin.version}`);
  return {sha256: digest.sha256, size: digest.size};
}

// node/current.json made ready to name `version`, before anything is published: the path must hold a regular file or
// nothing (a pointer that does not parse is replaced), and the replacement is written beside it now. `needed` is false
// when it already names `version`. `commit` renames the replacement into place and `discard` drops it; every failure
// is activation_failed, and leaves the pointer as it was.
function stagePointer(home, version) {
  const {pointer} = nodeLayout(home);
  const failed = (what, error) => fail('activation_failed', `Node ${version} could not be made the own host's: ${what}${error ? ` (${error.code ?? error.message})` : ''}`, {cause: error});
  let stat = null;
  try { stat = lstatSync(pointer); } catch (error) { if (error.code !== 'ENOENT') failed(`${pointer} cannot be read`, error); }
  if (stat && !stat.isFile()) failed(`${pointer} is not a file`);
  let current = null;
  if (stat) try { current = readNodePointer(home); } catch { current = null; }
  if (current === version) return {needed: false, commit() {}, discard() {}};
  const temp = `${pointer}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify({schema: 1, version}) + '\n', {mode: 0o600, flag: 'wx'});
  } catch (error) {
    rmSync(temp, {force: true});
    failed(`${temp} cannot be written`, error);
  }
  return {
    needed: true,
    commit() {
      try { renameSync(temp, pointer); } catch (error) { rmSync(temp, {force: true}); failed(`${pointer} cannot be replaced`, error); }
    },
    discard() { rmSync(temp, {force: true}); },
  };
}

// A local tarball is copied into staging first (a clone where the filesystem has them), so the bytes that are hashed
// are exactly the bytes that are unpacked.
function snapshotArchive(path, dest, pin) {
  let stat;
  try { stat = statSync(path); } catch (error) { fail('archive_missing', `Node archive ${path} is not readable: ${error.code ?? error.message}`); }
  if (!stat.isFile()) fail('archive_missing', `Node archive ${path} is not a file`);
  if (stat.size !== pin.archive.length) fail('archive_length_mismatch', `Node archive ${path} is ${stat.size} bytes; the pin expects ${pin.archive.length}`,
    {hint: `pass the pinned ${nodeDistName(pin)}.tar.gz from ${pin.archive.url}, or omit --node-archive to download it`});
  copyFileSync(path, dest, fsConstants.COPYFILE_FICLONE);
}
