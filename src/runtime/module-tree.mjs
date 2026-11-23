// The ModuleTree (#171 M6a; docs/doperpowers/specs/2026-10-28-own-linux-engine-m6a-preflight.md §4.2, F1 ruled (b);
// #117 M6 reuses it): the packages cells import (`CUA_REPL_NODE_MODULE_DIRS`) and `classic-level`, which cua's
// profile map loads, installed by cua itself under $CUA_HOME/modules/<lock hash>/, with no npm, no tar and no package
// script run.
//
// The pin. runtime/modules/package.json names six packages at exact versions and holds the rest with `overrides`;
// package-lock.json (version 3) is what npm resolved from it, each entry resolved at its canonical registry URL with a
// SHA-512 integrity. runtime/modules/provenance.json, which scripts/modules-pin.mjs writes, holds for each target the
// closure and every tarball's length, and names the lock it was computed from and the vendor archives whose own
// lockfile vouched for every name, version and SHA-512 in it. Both are parsed strictly; anything off is invalid_pin.
//
// The closure is what is reachable from the root, not every entry that fits the host: dependencies always, an optional
// edge only where the target's os, cpu and libc admit the host, never a peer or development edge, each name resolved
// to the nearest node_modules/<name> above its dependent. It must equal the provenance's closure for the host.
//
// The install fetches each tarball of the closure at its pinned length into staging (or takes a local copy, still
// checked), checks its SHA-512 before anything reads it, unpacks it with cua's own reader (src/runtime/tarball.mjs) and
// records the payload as it is written: install.json holds, for each package, its file count and a digest over every
// file it unpacked, and every native file (.node, .so, .dylib) with its size and SHA-256. The tree moves into place with
// one rename. Two checks read that record: checkModuleTree, at every connection, stats each package.json and each
// native file against its size; verifyModuleTree recomputes every digest and finds anything added. A tree that
// verifies makes the install a no-op; one that does not is refused and never repaired in place, since a running session
// may be importing from it; a path cua did not install is target_occupied.
import {copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CuaError, fail} from './errors.mjs';
import {homeLayout, realHome} from './layout.mjs';
import {isRealDirectory, ownInstaller} from './manifest.mjs';
import {assertTargetFree, download, moveIntoPlace, verifyArchive} from './install.mjs';
import {unpackTarball} from './tarball.mjs';

export const MODULES_PIN_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'runtime', 'modules');
const LOCK_FILE = 'package-lock.json';
const PROVENANCE_FILE = 'provenance.json';
export const MODULE_RECORD_FILE = 'install.json';
const REGISTRY = 'https://registry.npmjs.org/';

const NAME = '(?:@[a-z0-9][a-z0-9._~-]*/)?[a-z0-9][a-z0-9._~-]*';
const PACKAGE_PATH = new RegExp(`^node_modules/${NAME}(?:/node_modules/${NAME})*$`);
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/;
const HEX64 = /^[0-9a-f]{64}$/;
const NATIVE_FILE = /\.(?:node|dylib)$|\.so(?:\.\d+)*$/;

export const tarballUrl = (name, version) => `${REGISTRY}${name}/-/${name.split('/').pop()}-${version}.tgz`;
// The file name `--modules-dir` holds a tarball under, npm pack's: `@scope/name` becomes `scope-name`.
export const localTarballName = (name, version) => `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`;
export const nameAt = path => path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
const byPath = (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const summary = problems => problems.slice(0, 5).join('; ') + (problems.length > 5 ? `; and ${problems.length - 5} more` : '');

// The remedy for a damaged tree: remove it, then run this cua's own installer, which names the release it installs
// where the caller knows it (F9).
export const moduleRecoveryHint = (root, release) => `stop any \`cua serve\` using it, remove ${root}, then ${ownInstaller({release}).hint}`;

// The host a closure is computed for: npm's os and cpu names, and on Linux the C library, which decides between the
// glibc and musl builds of a native package.
export function moduleHost() {
  const host = {platform: process.platform, arch: process.arch};
  if (host.platform === 'linux') host.libc = process.report.getReport().header.glibcVersionRuntime ? 'glibc' : 'musl';
  return host;
}

// ---- the lock ----

const invalidLock = (where, why) => fail('invalid_pin', `module lock ${where}: ${why}`);

function edges(value, where, field) {
  if (value === undefined) return {};
  if (!isObject(value) || Object.values(value).some(v => typeof v !== 'string')) invalidLock(where, `${field} is not a map of names to ranges`);
  return value;
}

function platformList(value, where, field) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.length || value.some(v => typeof v !== 'string' || !v)) invalidLock(where, `${field} is not a list of names`);
  return value;
}

// package-lock.json's text -> {hash, packages}: `hash` is the SHA-256 of the file, which names the tree's directory;
// `packages` maps each path ('' for the root) to {name, version, resolved, integrity, dependencies,
// optionalDependencies, os, cpu, libc}, the fields the closure and the install read.
export function parseModuleLock(text) {
  let lock;
  try { lock = JSON.parse(text); } catch (error) { invalidLock('', `not JSON (${error.message})`); }
  if (!isObject(lock)) invalidLock('', 'not an object');
  if (lock.lockfileVersion !== 3) invalidLock('', `lockfileVersion is ${JSON.stringify(lock.lockfileVersion)}, not 3`);
  if (!isObject(lock.packages) || !isObject(lock.packages[''])) invalidLock('', 'has no root package');
  const root = lock.packages[''];
  const packages = {'': {dependencies: edges(root.dependencies, 'root', 'dependencies'), optionalDependencies: edges(root.optionalDependencies, 'root', 'optionalDependencies')}};
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path === '') continue;
    if (!PACKAGE_PATH.test(path)) invalidLock(path, 'is not a node_modules path');
    if (!isObject(entry)) invalidLock(path, 'is not an object');
    if (entry.link) invalidLock(path, 'is a link; every package must be a registry tarball');
    if (entry.inBundle) invalidLock(path, 'is bundled inside another package; every package must be a registry tarball');
    const name = nameAt(path);
    if (entry.name !== undefined && entry.name !== name) invalidLock(path, `is an alias of ${JSON.stringify(entry.name)}`);
    if (typeof entry.version !== 'string' || !VERSION.test(entry.version)) invalidLock(path, `version ${JSON.stringify(entry.version)} is not exact`);
    const canonical = tarballUrl(name, entry.version);
    if (entry.resolved !== canonical) invalidLock(path, `resolved ${JSON.stringify(entry.resolved)} is not ${canonical}`);
    if (typeof entry.integrity !== 'string' || !INTEGRITY.test(entry.integrity)) invalidLock(path, `integrity ${JSON.stringify(entry.integrity)} is not one SHA-512`);
    packages[path] = {
      name, version: entry.version, resolved: entry.resolved, integrity: entry.integrity,
      dependencies: edges(entry.dependencies, path, 'dependencies'), optionalDependencies: edges(entry.optionalDependencies, path, 'optionalDependencies'),
      os: platformList(entry.os, path, 'os'), cpu: platformList(entry.cpu, path, 'cpu'), libc: platformList(entry.libc, path, 'libc'),
    };
  }
  return {hash: sha256(Buffer.from(text)), packages};
}

export function loadModuleLock(dir = MODULES_PIN_DIR) {
  let text;
  try { text = readFileSync(join(dir, LOCK_FILE), 'utf8'); } catch (error) { fail('invalid_pin', `module lock ${join(dir, LOCK_FILE)} is not readable: ${error.code ?? error.message}`); }
  return parseModuleLock(text);
}

// ---- the closure ----

// npm's rule for os, cpu and libc: a `!name` excludes, and a list of plain names admits only those. A host without
// the value (libc off Linux) is admitted only by a list that does not name it.
function admits(list, value) {
  if (!list) return true;
  const excluded = list.filter(v => v.startsWith('!')).map(v => v.slice(1));
  const named = list.filter(v => !v.startsWith('!'));
  if (value === undefined) return !named.length;
  return !excluded.includes(value) && (!named.length || named.includes(value));
}
export const admitsHost = (entry, host) => admits(entry.os, host.platform) && admits(entry.cpu, host.arch) && admits(entry.libc, host.libc);

// The nearest node_modules/<name> at or above the dependent.
function resolveEdge(packages, from, name) {
  let base = from;
  while (true) {
    const candidate = base ? `${base}/node_modules/${name}` : `node_modules/${name}`;
    if (packages[candidate]) return candidate;
    if (!base) return null;
    const at = base.lastIndexOf('/node_modules/');
    base = at === -1 ? '' : base.slice(0, at);
  }
}

// -> [{path, name, version, resolved, integrity}], sorted by path.
export function moduleClosure(lock, host) {
  const {packages} = lock;
  const reached = new Set();
  const queue = [''];
  while (queue.length) {
    const from = queue.shift();
    const entry = packages[from];
    for (const name of Object.keys(entry.dependencies)) {
      const to = resolveEdge(packages, from, name);
      if (!to) invalidLock(from || 'root', `depends on ${name}, which the lock does not hold`);
      if (!reached.has(to)) { reached.add(to); queue.push(to); }
    }
    for (const name of Object.keys(entry.optionalDependencies)) {
      const to = resolveEdge(packages, from, name);
      if (!to || reached.has(to) || !admitsHost(packages[to], host)) continue;
      reached.add(to);
      queue.push(to);
    }
  }
  return [...reached].map(path => {
    const {name, version, resolved, integrity} = packages[path];
    return {path, name, version, resolved, integrity};
  }).sort(byPath);
}

// ---- the provenance ----

const invalidProvenance = (where, why) => fail('invalid_pin', `module provenance ${where}: ${why}`);

function exactKeys(value, keys, where, optional = []) {
  if (!isObject(value)) invalidProvenance(where, 'is not an object');
  for (const key of Object.keys(value)) if (!keys.includes(key) && !optional.includes(key)) invalidProvenance(where, `has an unknown field "${key}"`);
  for (const key of keys) if (!(key in value)) invalidProvenance(where, `is missing "${key}"`);
}
function matching(value, pattern, where) {
  if (typeof value !== 'string' || !pattern.test(value)) invalidProvenance(where, `has an invalid value ${JSON.stringify(value)}`);
}
function nonEmptyList(value, where) {
  if (!Array.isArray(value) || !value.length) invalidProvenance(where, 'is not a non-empty list');
  return value;
}

export function parseModuleProvenance(value) {
  exactKeys(value, ['schema', 'lock', 'vendor', 'targets'], '');
  if (value.schema !== 1) invalidProvenance('schema', `is ${JSON.stringify(value.schema)}, not 1`);
  matching(value.lock, HEX64, 'lock');
  nonEmptyList(value.vendor, 'vendor').forEach((vendor, i) => {
    exactKeys(vendor, ['release', 'archiveSha256', 'lockfileSha256'], `vendor[${i}]`);
    matching(vendor.release, /^[0-9A-Za-z._-]+$/, `vendor[${i}].release`);
    matching(vendor.archiveSha256, HEX64, `vendor[${i}].archiveSha256`);
    matching(vendor.lockfileSha256, HEX64, `vendor[${i}].lockfileSha256`);
  });
  nonEmptyList(value.targets, 'targets').forEach((target, i) => {
    const where = `targets[${i}]`;
    exactKeys(target, ['platform', 'arch', 'packages'], where, ['libc']);
    matching(target.platform, /^[a-z0-9]+$/, `${where}.platform`);
    matching(target.arch, /^[a-z0-9]+$/, `${where}.arch`);
    if (target.libc !== undefined) matching(target.libc, /^[a-z]+$/, `${where}.libc`);
    nonEmptyList(target.packages, `${where}.packages`).forEach((pkg, j) => {
      const at = `${where}.packages[${j}]`;
      exactKeys(pkg, ['path', 'name', 'version', 'integrity', 'length'], at);
      matching(pkg.path, PACKAGE_PATH, `${at}.path`);
      if (pkg.name !== nameAt(pkg.path)) invalidProvenance(`${at}.name`, `is not the name at ${pkg.path}`);
      matching(pkg.version, VERSION, `${at}.version`);
      matching(pkg.integrity, INTEGRITY, `${at}.integrity`);
      if (!Number.isSafeInteger(pkg.length) || pkg.length <= 0) invalidProvenance(`${at}.length`, `is not a byte count`);
    });
  });
  return value;
}

export function loadModuleProvenance(dir = MODULES_PIN_DIR) {
  const file = join(dir, PROVENANCE_FILE);
  let value;
  try { value = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { fail('invalid_pin', `module provenance ${file} is not readable JSON: ${error.code ?? error.message}`); }
  return parseModuleProvenance(value);
}

// The host's closure, bound to the provenance: the same lock, and for this host exactly the same packages, by path,
// name, version and integrity -> the closure's entries, each with its pinned tarball length.
export function pinnedClosure(lock, provenance, host) {
  if (provenance.lock !== lock.hash) fail('invalid_pin', `the module provenance is of lock ${provenance.lock}, not of the checked-in lock ${lock.hash}`, {hint: 'run scripts/modules-pin.mjs against the pinned vendor deb'});
  const target = provenance.targets.find(t => t.platform === host.platform && t.arch === host.arch && t.libc === host.libc);
  if (!target) fail('unsupported_platform', `the module tree is pinned for ${provenance.targets.map(t => [t.platform, t.arch, t.libc].filter(Boolean).join('-')).join(', ')}; this host is ${[host.platform, host.arch, host.libc].filter(Boolean).join('-')}`);
  const closure = moduleClosure(lock, host);
  const pinned = new Map(target.packages.map(p => [p.path, p]));
  const differences = [];
  for (const entry of closure) {
    const pin = pinned.get(entry.path);
    if (!pin) differences.push(`${entry.path} is in the closure, not the provenance`);
    else if (pin.version !== entry.version || pin.integrity !== entry.integrity) differences.push(`${entry.path} is ${entry.version} ${entry.integrity.slice(0, 19)}… in the lock, ${pin.version} ${pin.integrity.slice(0, 19)}… in the provenance`);
    pinned.delete(entry.path);
  }
  for (const path of pinned.keys()) differences.push(`${path} is in the provenance, not the closure`);
  if (differences.length) fail('invalid_pin', `the module lock's closure for ${host.platform}-${host.arch} is not the provenance's: ${summary(differences)}`, {hint: 'run scripts/modules-pin.mjs against the pinned vendor deb'});
  const lengths = new Map(target.packages.map(p => [p.path, p.length]));
  return closure.map(entry => ({...entry, length: lengths.get(entry.path)}));
}

// ---- the installed tree ----

function pathExists(path) {
  try { lstatSync(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

const RECORD_KEYS = ['schema', 'lock', 'platform', 'arch', 'packages', 'natives', 'source', 'installedAt'];

function validRecord(record) {
  const keysAre = (value, keys) => isObject(value) && Object.keys(value).length === keys.length && keys.every(key => key in value);
  return keysAre(record, RECORD_KEYS) && record.schema === 1 && Array.isArray(record.packages) && Array.isArray(record.natives)
    && record.packages.every(p => keysAre(p, ['path', 'name', 'version', 'files', 'digest']) && PACKAGE_PATH.test(p.path) && Number.isSafeInteger(p.files) && HEX64.test(p.digest))
    && record.natives.every(n => keysAre(n, ['path', 'size', 'sha256']) && insidePackage(n.path, record.packages) && Number.isSafeInteger(n.size) && HEX64.test(n.sha256));
}

// A recorded file path: under one of the recorded packages, with no part that could leave it.
function insidePackage(path, packages) {
  return typeof path === 'string' && !path.split('/').some(part => part === '' || part === '.' || part === '..')
    && packages.some(p => path.startsWith(`${p.path}/`));
}

// The tree this lock names under the home, when cua installed it for this host: a real directory whose install.json is
// this lock's and this host's and lists exactly the host's closure -> {root, moduleDir, record}. Anything else, nothing
// there included, is null.
export function readModuleTree(home, lock, host) {
  const {modules} = homeLayout(realHome(home));
  const root = join(modules, lock.hash);
  if (!isRealDirectory(modules) || !isRealDirectory(root) || !isRegularFile(join(root, MODULE_RECORD_FILE))) return null;
  let record;
  try { record = JSON.parse(readFileSync(join(root, MODULE_RECORD_FILE), 'utf8')); } catch { return null; }
  if (!validRecord(record) || record.lock !== lock.hash || record.platform !== host.platform || record.arch !== host.arch) return null;
  const closure = moduleClosure(lock, host);
  const listed = record.packages.map(({path, name, version}) => `${path} ${name} ${version}`);
  if (listed.join('\n') !== closure.map(({path, name, version}) => `${path} ${name} ${version}`).join('\n')) return null;
  return {root, moduleDir: join(root, 'node_modules'), record};
}

function isRegularFile(path) {
  try { return lstatSync(path).isFile(); } catch { return false; }
}

// The first directory on the way from the root down to `rel` (inclusive) that is not a real directory, or null. A link
// anywhere on the way would take a check outside the tree, so none is followed. `known` caches directories found real.
function notRealOnTheWay(root, rel, known) {
  const parts = rel ? rel.split('/') : [];
  for (let i = 1; i <= parts.length; i++) {
    const sub = parts.slice(0, i).join('/');
    if (known.has(sub)) continue;
    if (!isRealDirectory(join(root, sub))) return sub;
    known.add(sub);
  }
  return null;
}

// The connection's check: every package's package.json and every native file, by a stat against the recorded size,
// each reached through real directories only. `release`, the runtime the tree belongs to, is named in the remedy.
export function checkModuleTree(root, record, {release} = {}) {
  const problems = [];
  const known = new Set();
  const reachable = rel => {
    const broken = notRealOnTheWay(root, rel, known);
    if (broken) problems.push(`${broken} is not a real directory`);
    return !broken;
  };
  if (!isRealDirectory(root)) problems.push(`${root} is not a real directory`);
  else {
    for (const {path} of record.packages) {
      if (!reachable(path)) continue;
      let stat;
      try { stat = lstatSync(join(root, path, 'package.json')); } catch { stat = null; }
      if (!stat?.isFile()) problems.push(`${path}/package.json is missing`);
    }
    for (const native of record.natives) {
      if (!reachable(dirname(native.path))) continue;
      let stat;
      try { stat = lstatSync(join(root, native.path)); } catch { stat = null; }
      if (!stat?.isFile()) problems.push(`${native.path} is missing or not a regular file`);
      else if (stat.size !== native.size) problems.push(`${native.path} is ${stat.size} bytes, recorded as ${native.size}`);
    }
  }
  if (problems.length) fail('layout_invalid', `the module tree ${root} is damaged: ${summary(problems)}`, {hint: moduleRecoveryHint(root, release)});
  return {packages: record.packages.length, natives: record.natives.length};
}

// The digest of a package's payload: the SHA-256 of its files' sorted [path, size, sha256] list.
const payloadDigest = files => sha256(JSON.stringify([...files].sort(byPath).map(f => [f.path, f.size, f.sha256])));

// A package directory's regular files, skipping the nested packages under it (each is its own record entry). Only real
// directories are entered and only regular files read: a link, a FIFO or a device is reported, never opened.
function packageFiles(root, path, nested, problems) {
  const files = [];
  const walk = rel => {
    let entries;
    try { entries = readdirSync(join(root, path, rel), {withFileTypes: true}); } catch (error) { problems.push(`${path}${rel ? `/${rel}` : ''} is not readable (${error.code})`); return; }
    for (const entry of entries) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { if (!nested.has(child)) walk(child); }
      else if (entry.isFile()) {
        const bytes = readFileSync(join(root, path, child));
        files.push({path: child, size: bytes.length, sha256: sha256(bytes)});
      } else problems.push(`${path}/${child} is not a regular file`);
    }
  };
  walk('');
  return files;
}

// The full check: every package's digest and file count recomputed from what is on disk, every native file found
// against the record's complete list, and nothing in the tree that the record does not account for. Every file is read
// once, by the walk; nothing is reached through a link.
export function verifyModuleTree(root, record) {
  const problems = [];
  if (!isRealDirectory(root)) fail('module_tree_invalid', `the module tree ${root} is not a real directory`, {hint: moduleRecoveryHint(root)});
  const known = new Set();
  const paths = new Set(record.packages.map(p => p.path));
  const containers = new Set();
  for (const path of paths) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) containers.add(parts.slice(0, i).join('/'));
  }
  const scan = rel => {
    let entries;
    try { entries = readdirSync(join(root, rel), {withFileTypes: true}); } catch { return; }
    for (const entry of entries) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (!rel && path === MODULE_RECORD_FILE) continue;
      if (paths.has(path)) continue;
      if (!containers.has(path)) problems.push(`${path} is not part of the installed tree`);
      else if (entry.isDirectory()) scan(path);
      else problems.push(`${path} is not a real directory`);
    }
  };
  scan('');
  const found = new Map();  // every regular file the walk read, by its path in the tree
  for (const pkg of record.packages) {
    const broken = notRealOnTheWay(root, pkg.path, known);
    if (broken) { problems.push(`${broken} is missing or not a real directory`); continue; }
    const nested = new Set([...paths].filter(other => other.startsWith(`${pkg.path}/`)).map(other => other.slice(pkg.path.length + 1)));
    const files = packageFiles(root, pkg.path, nested, problems);
    for (const file of files) found.set(`${pkg.path}/${file.path}`, file);
    if (files.length !== pkg.files || payloadDigest(files) !== pkg.digest) problems.push(`${pkg.path}'s files are not the ones installed`);
  }
  const recorded = new Set();
  for (const native of record.natives) {
    recorded.add(native.path);
    const file = found.get(native.path);
    if (!file) problems.push(`${native.path} is missing or not a regular file`);
    else if (file.size !== native.size || file.sha256 !== native.sha256) problems.push(`${native.path} is not the file installed`);
  }
  for (const path of found.keys()) if (NATIVE_FILE.test(path) && !recorded.has(path)) problems.push(`${path} is a native file not recorded`);
  if (problems.length) fail('module_tree_invalid', `the module tree ${root} does not verify: ${summary(problems)}`, {hint: moduleRecoveryHint(root)});
  return {packages: record.packages.length, natives: record.natives.length};
}

// ---- the install ----

// One tarball into `dest`: a local copy from `dir` at its pinned length, or a download bounded by it.
async function acquire(pkg, dest, {dir, fetch}) {
  // A redirect is refused: the canonical registry URL itself serves the bytes.
  if (!dir) return download({url: pkg.resolved, length: pkg.length, redirect: 'error'}, dest, fetch);
  const local = join(dir, localTarballName(pkg.name, pkg.version));
  let stat;
  try { stat = statSync(local); } catch (error) { fail('archive_missing', `module tarball ${local} is not readable: ${error.code ?? error.message}`); }
  if (!stat.isFile()) fail('archive_missing', `module tarball ${local} is not a file`);
  if (stat.size !== pkg.length) fail('archive_length_mismatch', `module tarball ${local} is ${stat.size} bytes; the pin expects ${pkg.length}`);
  copyFileSync(local, dest);
}

// `cua install`'s module tree step -> {root, moduleDir, lock, changed}. `dir` holds local copies of the tarballs
// (`--modules-dir`), named as localTarballName names them.
export async function installModuleTree({home, lock = loadModuleLock(), host = moduleHost(), fetch = globalThis.fetch, dir, provenance = loadModuleProvenance()}) {
  const packages = pinnedClosure(lock, provenance, host);
  const real = realHome(home, {create: true});
  const layout = homeLayout(real);
  const root = join(layout.modules, lock.hash);
  const answer = changed => ({root, moduleDir: join(root, 'node_modules'), lock: lock.hash, changed});
  // Nothing is read or written through a link where modules/ should be, nor, for a new tree, where staging/ should be.
  const refuseLinked = dir => {
    if (pathExists(dir) && !isRealDirectory(dir)) fail('target_occupied', `${dir} is a link or not a real directory; cua does not install through it`, {hint: 'move it aside yourself, then run install again'});
  };
  refuseLinked(layout.modules);

  const existing = readModuleTree(real, lock, host);
  if (existing) {
    try {
      verifyModuleTree(root, existing.record);
    } catch (error) {
      if (!(error instanceof CuaError)) throw error;
      fail('module_tree_invalid', `${error.message}; it is not repaired in place`, {hint: moduleRecoveryHint(root), cause: error});
    }
    return answer(false);
  }
  assertTargetFree(root);
  refuseLinked(layout.staging);

  mkdirSync(layout.modules, {recursive: true, mode: 0o755});
  mkdirSync(layout.staging, {recursive: true, mode: 0o700});
  const stage = mkdtempSync(join(layout.staging, 'modules-'));
  try {
    const tree = join(stage, 'tree');
    mkdirSync(tree, {mode: 0o755});
    const recorded = [];
    const natives = [];
    for (const pkg of packages) {
      const tarball = join(stage, 'package.tgz');
      await acquire(pkg, tarball, {dir, fetch});
      await verifyArchive(tarball, {length: pkg.length, integrity: pkg.integrity});
      const bytes = readFileSync(tarball);
      rmSync(tarball);
      const dest = join(tree, pkg.path);
      if (pathExists(dest)) fail('tarball_invalid', `${pkg.path} would be written over files another package placed`);
      const {files} = unpackTarball(bytes, dest);
      recorded.push({path: pkg.path, name: pkg.name, version: pkg.version, files: files.length, digest: payloadDigest(files)});
      for (const file of files) if (NATIVE_FILE.test(file.path)) natives.push({path: `${pkg.path}/${file.path}`, size: file.size, sha256: file.sha256});
    }
    const record = {schema: 1, lock: lock.hash, platform: host.platform, arch: host.arch, packages: recorded, natives: natives.sort(byPath),
      source: dir ? 'dir' : 'download', installedAt: new Date().toISOString()};
    writeFileSync(join(tree, MODULE_RECORD_FILE), JSON.stringify(record, null, 2) + '\n', {mode: 0o644});
    moveIntoPlace(tree, root);
    return answer(true);
  } finally {
    rmSync(stage, {recursive: true, force: true});
  }
}
