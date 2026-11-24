#!/usr/bin/env node
// Writes runtime/modules/provenance.json, the pin of the ModuleTree (#171 M6a; docs/doperpowers/specs/2026-10-28-own-
// linux-engine-m6a-preflight.md §4.2, "The pin, and who vouches for it"; src/runtime/module-tree.mjs).
//
//   node scripts/modules-pin.mjs <pinned vendor deb>...
//
// The one authenticated statement of these packages is the vendor's own lockfile, `.pnpm/lock.yaml`, inside a deb whose
// length and SHA-256 are recorded (runtime/provenance/<release>.json) and whose signature was checked when that record
// was written. Those records are this script's alone (#171 M6b; docs/doperpowers/specs/2026-10-28-own-linux-engine-m6b-
// preflight.md §4.1, §4.2): they were the vendor's Linux pins until cua 0.30.0 retired the vendor's engine there, and
// are now trimmed to what names an archive and the one member read from it. Nothing that installs, diagnoses or launches
// reads them, and the reader here returns no URL, so the directory is never a place to fetch from. For each deb given,
// the script
//   1. matches the deb to a record by its length and SHA-256, and refuses one that is no record's;
//   2. takes the lockfile its record names out of its data.tar.xz (cua reads the ar archive; the system `tar` extracts
//      that one member to standard output, so nothing else is unpacked);
//   3. computes both architectures' closures from runtime/modules/package-lock.json, as the installer does;
//   4. computes the vendor's closures from the same roots in its lockfile, by the same rule, and requires the two to
//      hold the same packages by name, version and SHA-512. That lockfile lists every platform's packages, so either
//      deb vouches for both closures; given both, it compares against each and records that it did;
// Each deb is first copied into a private scratch directory, and that one snapshot is hashed, matched and read, so a
// file replaced while the script runs cannot pair a pinned hash with another lockfile.
// Then 5. fetches each tarball once from its canonical URL (a redirect is refused) under a size bound, checks its
// SHA-512, reads it as an npm package by the installer's own step (readPackageTarball, so a package the installer would
// refuse is refused here), and records its length. It writes nothing unless every check passes, and run twice it
// writes the same bytes. It runs no package script and unpacks no package. Run it when the lock is written and
// whenever it changes, on a machine that holds a pinned deb, and review its output like any pin.
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {closeSync, constants as fsConstants, copyFileSync, createReadStream, createWriteStream, fstatSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import {fail} from '../src/runtime/errors.mjs';
import {admitsHost, MODULES_PIN_DIR, moduleClosure, parseModuleLock, parseModuleProvenance} from '../src/runtime/module-tree.mjs';
import {readPackageTarball} from '../src/runtime/tarball.mjs';

// The targets cua's Linux runtime serves: the vendor's two debs, both glibc.
export const TARGETS = [{platform: 'linux', arch: 'arm64', libc: 'glibc'}, {platform: 'linux', arch: 'x64', libc: 'glibc'}];

// The vendor debs' provenance records, outside package.json's `files`: a checkout's, for this script.
export const PROVENANCE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'runtime', 'provenance');

// The largest tarball accepted from the registry; the largest pinned one, libvips, is about 8.5 MB.
export const MAX_TARBALL_BYTES = 64 * 1024 * 1024;

const mismatch = message => fail('pin_mismatch', message);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// ---- the provenance records ----

const invalid = (where, why) => fail('invalid_provenance', `provenance record ${where}: ${why}`);
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function exactKeys(value, keys, where) {
  if (!isObject(value)) invalid(where, 'must be an object');
  for (const key of Object.keys(value)) if (!keys.includes(key)) invalid(where, `unknown field "${key}"`);
  for (const key of keys) if (!(key in value)) invalid(where, `missing field "${key}"`);
}
// The lockfile's path inside the deb's payload: relative, of plain components, ending in the pnpm lockfile.
const PLAIN_COMPONENT = /^[A-Za-z0-9._@-]+$/;
function lockfileMember(value, where) {
  if (typeof value !== 'string' || !value.endsWith('/.pnpm/lock.yaml')
    || !value.split('/').every(part => PLAIN_COMPONENT.test(part) && part !== '.' && part !== '..' && !part.startsWith('-')))
    invalid(`${where}.lockfile`, `${JSON.stringify(value)} is not a relative path of plain components ending in /.pnpm/lock.yaml`);
  return value;
}

// A record's JSON -> {release, length, sha256, lockfile}, exactly: {schema: 1, release, platform: 'linux', arch, archive:
// {format: 'deb', url, length, sha256}, lockfile, notes}. The URL is checked to be where an https archive was published
// and is not returned, so no caller can fetch by a record; the notes are the record of the signature check and are kept
// for a reader of the file. Anything else is invalid_provenance.
export function parseProvenanceRecord(json, {file} = {}) {
  const where = file ?? 'record';
  exactKeys(json, ['schema', 'release', 'platform', 'arch', 'archive', 'lockfile', 'notes'], where);
  if (json.schema !== 1) invalid(where, `unsupported schema ${JSON.stringify(json.schema)}`);
  if (json.platform !== 'linux') invalid(`${where}.platform`, `${JSON.stringify(json.platform)} is not "linux"`);
  if (typeof json.arch !== 'string' || !/^[a-z0-9]+$/.test(json.arch)) invalid(`${where}.arch`, `invalid value ${JSON.stringify(json.arch)}`);
  if (typeof json.release !== 'string' || !/^\d+(\.\d+)+-linux-[a-z0-9]+$/.test(json.release) || !json.release.endsWith(`-linux-${json.arch}`))
    invalid(`${where}.release`, `${JSON.stringify(json.release)} is not <version>-linux-${json.arch}`);
  exactKeys(json.archive, ['format', 'url', 'length', 'sha256'], `${where}.archive`);
  if (json.archive.format !== 'deb') invalid(`${where}.archive.format`, 'must be "deb"');
  let url;
  if (typeof json.archive.url !== 'string') invalid(`${where}.archive.url`, 'must be a string');
  try { url = new URL(json.archive.url); } catch { invalid(`${where}.archive.url`, 'not a URL'); }
  if (url.protocol !== 'https:') invalid(`${where}.archive.url`, 'must be https');
  if (!Number.isSafeInteger(json.archive.length) || json.archive.length <= 0) invalid(`${where}.archive.length`, 'must be a positive integer');
  if (typeof json.archive.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(json.archive.sha256)) invalid(`${where}.archive.sha256`, `invalid value ${JSON.stringify(json.archive.sha256)}`);
  if (typeof json.notes !== 'string' || !json.notes) invalid(`${where}.notes`, 'must be a non-empty string');
  return {release: json.release, length: json.archive.length, sha256: json.archive.sha256, lockfile: lockfileMember(json.lockfile, where)};
}

// Every record in `dir`, by file name, each named for its release.
export function loadProvenanceRecords(dir = PROVENANCE_DIR) {
  return readdirSync(dir).filter(name => name.endsWith('.json')).sort().map(name => {
    const file = join(dir, name);
    let json;
    try { json = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { invalid(file, error.message); }
    const record = parseProvenanceRecord(json, {file});
    if (name !== `${record.release}.json`) invalid(file, `file name must be ${record.release}.json`);
    return record;
  });
}

// ---- the deb ----

async function fileSha256(path) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

// The deb's record by its length and SHA-256, read from `snapshot`, the private copy of the deb named `deb`, among
// `records` (loadProvenanceRecords') -> {record, sha256}; a deb that is no record's is refused. Exported for the
// comparator fixture's one-time check (scripts/linux-engine-gate/vendor-fixture-pin.mjs), which asks it only whether a
// deb is the authenticated one.
export async function matchRecord(deb, snapshot, records) {
  const fd = openSync(snapshot, 'r');
  let length;
  try { length = fstatSync(fd).size; } finally { closeSync(fd); }
  const digest = await fileSha256(snapshot);
  const record = records.find(r => r.length === length && r.sha256 === digest);
  if (!record) fail('archive_not_pinned', `${deb} (${length} bytes, SHA-256 ${digest}) is not a vendor deb any provenance record pins`);
  return {record, sha256: digest};
}

// {start, length} of an ar archive member.
export function arMember(path, member) {
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    const magic = Buffer.alloc(8);
    readSync(fd, magic, 0, 8, 0);
    if (magic.toString('latin1') !== '!<arch>\n') fail('lockfile_unreadable', `${path} is not an ar archive`);
    let offset = 8;
    const header = Buffer.alloc(60);
    while (offset + 60 <= size) {
      readSync(fd, header, 0, 60, offset);
      const name = header.toString('latin1', 0, 16).trim().replace(/\/$/, '');
      const length = Number(header.toString('latin1', 48, 58).trim());
      if (!Number.isSafeInteger(length) || offset + 60 + length > size) fail('lockfile_unreadable', `${path} has a malformed ar header`);
      if (name === member) return {start: offset + 60, length};
      offset += 60 + length + (length % 2);
    }
  } finally {
    closeSync(fd);
  }
  fail('lockfile_unreadable', `${path} has no ${member}`);
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, {encoding: 'buffer', maxBuffer: 64 * 1024 * 1024}, (error, stdout, stderr) =>
      error ? reject(Object.assign(error, {stderr: stderr.toString()})) : resolvePromise(stdout));
  });
}

// The lockfile its record names out of the snapshot, by way of its data.tar.xz member copied beside it. The payload's
// members are spelled `./<path>`, as dpkg-deb writes them.
async function vendorLockfile(deb, snapshot, scratch, record, {tar}) {
  const {start, length} = arMember(snapshot, 'data.tar.xz');
  const payload = join(scratch, 'data.tar.xz');
  const member = `./${record.lockfile}`;
  await pipeline(createReadStream(snapshot, {start, end: start + length - 1}), createWriteStream(payload));
  try {
    return await run(tar, ['-xJOf', payload, member]);
  } catch (error) {
    fail('lockfile_unreadable', `could not take ${member} out of ${deb}: ${(error.stderr || error.message).trim().split('\n').at(-1)}`);
  } finally {
    rmSync(payload, {force: true});
  }
}

// ---- the vendor lockfile ----

// The YAML a pnpm lockfile is written in, and nothing more: block maps indented by two spaces, keys bare or single-
// quoted, values plain or single-quoted scalars, or one-line flow maps and lists of them. Anything else is refused.
function scalar(text) {
  if (text.startsWith("'")) {
    if (!text.endsWith("'") || text.length < 2) throw new Error(`unterminated quote in ${text}`);
    return text.slice(1, -1).replaceAll("''", "'");
  }
  if (/^["&*!|>%@`-]/.test(text) && !/^-?\d/.test(text)) throw new Error(`unsupported scalar ${text}`);
  return text;
}

function splitFlow(inner) {
  const parts = [];
  let depth = 0, quoted = false, start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "'") quoted = !quoted;
    else if (!quoted && (c === '{' || c === '[')) depth++;
    else if (!quoted && (c === '}' || c === ']')) depth--;
    else if (!quoted && !depth && c === ',') { parts.push(inner.slice(start, i).trim()); start = i + 1; }
  }
  const last = inner.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

function value(text) {
  if (text.startsWith('{')) {
    if (!text.endsWith('}')) throw new Error(`unterminated flow map ${text}`);
    const map = {};
    for (const part of splitFlow(text.slice(1, -1))) {
      const [key, rest] = keyAndRest(part);
      if (rest === null) throw new Error(`flow map entry without a value: ${part}`);
      map[key] = value(rest);
    }
    return map;
  }
  if (text.startsWith('[')) {
    if (!text.endsWith(']')) throw new Error(`unterminated flow list ${text}`);
    return splitFlow(text.slice(1, -1)).map(value);
  }
  return scalar(text);
}

// "key: rest" or "key:" -> [key, rest | '' | null when there is no colon].
function keyAndRest(line) {
  let key, after;
  if (line.startsWith("'")) {
    const close = line.indexOf("'", 1);
    if (close === -1) throw new Error(`unterminated quoted key ${line}`);
    key = line.slice(1, close);
    after = line.slice(close + 1);
  } else {
    const colon = line.search(/:( |$)/);
    if (colon === -1) return [line, null];
    key = line.slice(0, colon);
    after = line.slice(colon);
  }
  if (!after.startsWith(':')) return [key, null];
  return [key, after.slice(1).trim()];
}

export function parseLockYaml(text) {
  const root = {};
  const stack = [{indent: -1, map: root}];
  for (const [index, raw] of text.split('\n').entries()) {
    if (!raw.trim()) continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    try {
      if (indent % 2 || raw.includes('\t')) throw new Error('indentation is not two spaces');
      if (line.startsWith('#') || line.startsWith('- ')) throw new Error('comments and block lists are not part of a lockfile');
      while (stack.at(-1).indent >= indent) stack.pop();
      if (indent !== stack.at(-1).indent + 2 && stack.length > 1) throw new Error('indentation skips a level');
      const parent = stack.at(-1).map;
      const [key, rest] = keyAndRest(line);
      if (rest === null) throw new Error('a line that is not "key: value"');
      if (Object.hasOwn(parent, key)) throw new Error(`duplicate key ${key}`);
      if (rest === '') { parent[key] = {}; stack.push({indent, map: parent[key]}); }
      else parent[key] = value(rest);
    } catch (error) {
      fail('lockfile_unreadable', `the vendor lockfile's line ${index + 1} cannot be read: ${error.message}`);
    }
  }
  return root;
}

// -> {packages: {"name@version": {integrity, os, cpu, libc}}, snapshots: {"name@version": {dependencies, optionalDependencies}}}.
export function parseVendorLockfile(text) {
  const doc = parseLockYaml(text);
  if (doc.lockfileVersion !== '9.0') fail('lockfile_unreadable', `the vendor lockfile is version ${JSON.stringify(doc.lockfileVersion)}, not 9.0`);
  const packages = {};
  for (const [key, entry] of Object.entries(doc.packages ?? {})) {
    if (entry.resolution?.directory) continue;  // the vendor's own workspace packages
    if (typeof entry.resolution?.integrity !== 'string') fail('lockfile_unreadable', `the vendor lockfile's ${key} has no integrity`);
    packages[key] = {integrity: entry.resolution.integrity, os: entry.os, cpu: entry.cpu, libc: entry.libc};
  }
  return {packages, snapshots: doc.snapshots ?? {}};
}

// The vendor's closure for a host, from the given roots ({name: version}), by the installer's rule.
export function vendorClosure(vendor, roots, host) {
  const reached = new Map();
  const queue = [];
  const visit = (name, version, optional) => {
    const key = `${name}@${version}`;
    if (reached.has(key)) return;
    const pkg = vendor.packages[key];
    if (!pkg) mismatch(`the vendor lockfile has no ${key}`);
    if (optional && !admitsHost(pkg, host)) return;
    reached.set(key, {name, version, integrity: pkg.integrity});
    queue.push(key);
  };
  for (const [name, version] of Object.entries(roots)) visit(name, version, false);
  while (queue.length) {
    const snapshot = vendor.snapshots[queue.shift()];
    if (snapshot !== undefined && (snapshot === null || typeof snapshot !== 'object')) mismatch('the vendor lockfile has a malformed snapshot');
    for (const [name, version] of Object.entries(snapshot?.dependencies ?? {})) visit(name, version, false);
    for (const [name, version] of Object.entries(snapshot?.optionalDependencies ?? {})) visit(name, version, true);
  }
  return [...reached.values()];
}

function compareClosures(ours, theirs, label) {
  const key = p => `${p.name}@${p.version}`;
  const vendor = new Map(theirs.map(p => [key(p), p.integrity]));
  const differences = [];
  for (const p of ours) {
    if (!vendor.has(key(p))) differences.push(`${key(p)} is in the lock's closure, not the vendor's`);
    else if (vendor.get(key(p)) !== p.integrity) differences.push(`${key(p)}'s SHA-512 is ${p.integrity} in the lock, ${vendor.get(key(p))} in the vendor's`);
    vendor.delete(key(p));
  }
  for (const k of vendor.keys()) differences.push(`${k} is in the vendor's closure, not the lock's`);
  if (differences.length) mismatch(`${label}: ${differences.join('; ')}`);
}

// ---- the tarballs ----

async function fetchTarball(entry, fetchImpl, maxBytes) {
  let response;
  try { response = await fetchImpl(entry.resolved, {redirect: 'error'}); } catch (error) { fail('download_failed', `could not fetch ${entry.resolved}: ${error.cause?.code ?? error.message}`); }
  if (!response.ok || !response.body) fail('download_failed', `${entry.resolved} answered HTTP ${response.status}`);
  const declared = Number(response.headers.get('content-length'));
  if (declared > maxBytes) fail('archive_length_mismatch', `${entry.resolved} declares ${declared} bytes, more than the ${maxBytes}-byte bound`);
  const chunks = [];
  let received = 0;
  const reader = response.body.getReader();
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    received += chunk.value.length;
    if (received > maxBytes) {
      await reader.cancel();
      fail('archive_length_mismatch', `${entry.resolved} sent more than the ${maxBytes}-byte bound`);
    }
    chunks.push(chunk.value);
  }
  const bytes = Buffer.concat(chunks);
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  if (integrity !== entry.integrity) fail('archive_hash_mismatch', `${entry.name}@${entry.version}: ${entry.resolved} has SHA-512 ${integrity}; the lock says ${entry.integrity}`);
  try {
    readPackageTarball(bytes);
  } catch (error) {
    error.message = `${entry.name}@${entry.version}: ${error.message}`;
    throw error;
  }
  return bytes.length;
}

// ---- the run ----

// `provenanceDir` is the records' directory, read through loadProvenanceRecords; nothing else can name a deb.
export async function pinModules({debs, modulesDir = MODULES_PIN_DIR, provenanceDir = PROVENANCE_DIR, fetch = globalThis.fetch, tar = 'tar', maxTarballBytes = MAX_TARBALL_BYTES, log = message => console.error(message)}) {
  if (!debs?.length) fail('usage', 'name at least one pinned vendor deb');
  const records = loadProvenanceRecords(provenanceDir);
  const lockText = readFileSync(join(modulesDir, 'package-lock.json'), 'utf8');
  const lock = parseModuleLock(lockText);
  const roots = lock.packages[''].dependencies;
  const closures = TARGETS.map(host => ({host, packages: moduleClosure(lock, host)}));

  const vendor = [];
  for (const deb of debs) {
    const scratch = mkdtempSync(join(tmpdir(), 'cua-modules-pin-'));
    let record, archiveSha256, lockfile;
    try {
      const snapshot = join(scratch, 'archive.deb');
      try { copyFileSync(deb, snapshot, fsConstants.COPYFILE_FICLONE); } catch (error) { fail('archive_missing', `${deb} is not readable: ${error.code ?? error.message}`); }
      ({record, sha256: archiveSha256} = await matchRecord(deb, snapshot, records));
      log(`${deb}: the pinned ${record.release}`);
      lockfile = await vendorLockfile(deb, snapshot, scratch, record, {tar});
    } finally {
      rmSync(scratch, {recursive: true, force: true});
    }
    const parsed = parseVendorLockfile(lockfile.toString('utf8'));
    for (const {host, packages} of closures) compareClosures(packages, vendorClosure(parsed, roots, host), `${record.release}'s lockfile against the ${host.arch} closure`);
    log(`${record.release}: its lockfile holds both closures, by name, version and SHA-512`);
    vendor.push({release: record.release, archiveSha256, lockfileSha256: sha256(lockfile)});
  }

  const lengths = new Map();
  for (const {packages} of closures) for (const entry of packages) {
    if (lengths.has(entry.path)) continue;
    lengths.set(entry.path, await fetchTarball(entry, fetch, maxTarballBytes));
    log(`${entry.name}@${entry.version}: ${lengths.get(entry.path)} bytes, SHA-512 checked`);
  }

  const provenance = parseModuleProvenance({
    schema: 1,
    lock: lock.hash,
    vendor: vendor.sort((a, b) => a.release < b.release ? -1 : 1).filter((v, i, all) => i === 0 || v.release !== all[i - 1].release),
    targets: closures.map(({host, packages}) => ({
      platform: host.platform, arch: host.arch, libc: host.libc,
      packages: packages.map(({path, name, version, integrity}) => ({path, name, version, integrity, length: lengths.get(path)})),
    })),
  });
  const out = join(modulesDir, 'provenance.json');
  const temp = `${out}.${process.pid}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify(provenance, null, 2) + '\n');
    renameSync(temp, out);
  } catch (error) {
    rmSync(temp, {force: true});
    throw error;
  }
  return {provenance, path: out};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const debs = process.argv.slice(2);
  if (!debs.length) {
    console.error('usage: node scripts/modules-pin.mjs <pinned vendor deb>...');
    process.exitCode = 2;
  } else {
    pinModules({debs}).then(({provenance, path}) => {
      console.log(`wrote ${path}: lock ${provenance.lock}; ${provenance.targets.map(t => `${t.platform}-${t.arch} ${t.packages.length} packages`).join(', ')}; checked against ${provenance.vendor.map(v => v.release).join(', ')}`);
    }, error => {
      console.error(`modules-pin: ${error.code ?? 'error'}: ${error.message}`);
      process.exitCode = 1;
    });
  }
}
