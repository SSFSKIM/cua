// `cua install`'s Node step: the pinned official Node 24 for cua's own REPL host (managed-node.mjs), placed under
// $CUA_HOME/node/<version> with the runtime's discipline (install.mjs). Acquire the tarball (a local
// `--node-archive` or the pinned nodejs.org URL) into a staging directory owned by this operation, verify its length
// and SHA-256 before anything reads it, unpack only bin/node and the licence, check that the binary is signed by the
// pinned Developer ID on darwin (before it is ever run) and that `node --version` is the pinned version, record it,
// move it into place with one rename, then rewrite the pointer. Any failure before the pointer write leaves the
// pointer and every installed Node untouched, and the staging directory is always removed. On Linux the archive hash
// is the trust root.
//
// An installed Node is never repaired, replaced or deleted (a running own host may execute from it): a verified one
// makes the step a no-op (re-activating it if another is active), a damaged one is an error with offline recovery
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
import {NODE_RECORD_FILE, nodeDistName, nodeLayout, nodeVersion, readNodePointer, readNodeRecord} from './managed-node.mjs';

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
      await verifyNodeTree(target, pin, checks);
    } catch (error) {
      if (!(error instanceof CuaError)) throw error;
      fail('node_install_invalid', `the installed Node ${pin.version} at ${target} no longer verifies (${error.message}); it is not repaired in place`,
        {hint: `stop any \`cua serve\` using it, remove ${target}, then run \`cua install\``, cause: error});
    }
    return result(existing, false, activate(real, pin.version));
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
    await verifyNodeTree(tree, pin, checks);
    const record = {schema: 1, version: pin.version, platform: pin.platform, arch: pin.arch, archive: {sha256: pin.archive.sha256, length: pin.archive.length}, source, installedAt: new Date().toISOString()};
    writeFileSync(join(tree, NODE_RECORD_FILE), JSON.stringify(record, null, 2) + '\n', {mode: 0o644});
    moveIntoPlace(tree, target);
    return result(record, true, activate(real, pin.version));
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

// The kept files, the darwin signature (before the binary runs) and the version the binary reports.
async function verifyNodeTree(root, pin, {verifySignature, versionOf}) {
  for (const part of ['bin/node', 'LICENSE']) assertRegularFile(root, part, pin);
  const node = join(root, 'bin', 'node');
  if (pin.signing) {
    const signature = await verifySignature(node, pin.signing.team);
    if (!signature.valid) fail('signature_invalid', `Node ${pin.version}'s bin/node is not signed by the pinned Developer ID (team ${pin.signing.team}): ${signature.detail}`);
  }
  const reported = versionOf(node);
  if (reported !== `v${pin.version}`) fail('node_version_mismatch', `Node ${pin.version}'s bin/node reports ${reported ?? 'no readable version'}, the pin expects v${pin.version}`);
}

// Rewrites node/current.json only when it does not already name `version` (write-then-rename); true when it did.
function activate(home, version) {
  let current = null;
  try { current = readNodePointer(home); } catch (error) { if (!(error instanceof CuaError)) throw error; }
  if (current === version) return false;
  const {pointer} = nodeLayout(home);
  const temp = `${pointer}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify({schema: 1, version}) + '\n', {mode: 0o600});
    renameSync(temp, pointer);
  } catch (error) {
    rmSync(temp, {force: true});
    fail('activation_failed', `Node ${version} is installed but could not be made the own host's: ${error.message}`, {cause: error});
  }
  return true;
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
