// The Node cua's own REPL host runs on by default: an official nodejs.org build of the current Node 24 LTS, pinned per
// platform and installed by `cua install` (src/runtime/node-install.mjs) under the home (spec
// docs/doperpowers/specs/2026-10-14-own-repl-host-design.md, Decision Log 2026-10-16). cua itself keeps running on the
// user's Node; only the own host's children use this one, and the vendor host keeps its pinned vendor Node.
//
// A pin (runtime/releases/node/<version>-<platform>-<arch>.json) names the nodejs.org tarball by its official URL,
// length and SHA-256, and on darwin the Apple team whose Developer ID signs bin/node. Its `notes` record how the hash
// was checked when the pin was written (SHASUMS256.txt and its GPG signature by a Node.js release key). Parsing is
// strict, as for the runtime pins (manifest.mjs).
//
// Under the home:
//   node/<version>/bin/node, LICENSE   the kept parts of the tarball, never modified after placement
//   node/<version>/install.json        {schema, version, platform, arch, archive: {sha256, length},
//                                      node: {sha256, size}, source, installedAt}: `node` binds the record to the
//                                      bytes of bin/node that install verified
//   node/current.json                  {schema, version}: the installed Node the own host takes, replaced atomically
// None of it is writable by a scoped cell: every launch protects node/ like the trusted code (src/runtime/sandbox.mjs).
// And nothing there runs unless its bytes are the recorded ones: install re-checks them before reusing an install, and
// the resolution (managedNode) before it offers the binary as a candidate, whose --version is then run.
import {closeSync, lstatSync, openSync, readFileSync, readSync, readdirSync, realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fail} from './errors.mjs';
import {homeLayout, realHome} from './layout.mjs';
import {isRealDirectory} from './manifest.mjs';

// The oldest Node major cua's own REPL host runs on (its kernel's vm modules); the vendor host keeps its pinned Node.
export const NODE_FLOOR = 24;
export const NODE_PINS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'runtime', 'releases', 'node');
export const NODE_RECORD_FILE = 'install.json';
const TARGETS = {darwin: ['arm64', 'x64'], linux: ['arm64', 'x64']};
const VERSION = /^\d+\.\d+\.\d+$/;
const FIXED_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
const hostTarget = () => ({platform: process.platform, arch: process.arch});
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// The official tarball's name and the directory it unpacks into.
export const nodeDistName = ({version, platform, arch}) => `node-v${version}-${platform}-${arch}`;
const officialUrl = pin => `https://nodejs.org/dist/v${pin.version}/${nodeDistName(pin)}.tar.gz`;

export function nodeLayout(home) {
  const root = homeLayout(home).node;
  return {root, pointer: join(root, 'current.json'), version: version => join(root, version)};
}

const invalid = (where, why) => fail('invalid_pin', `Node pin ${where}: ${why}`);

function exactKeys(value, keys, where) {
  if (!isObject(value)) invalid(where, 'must be an object');
  for (const key of Object.keys(value)) if (!keys.includes(key)) invalid(where, `unknown field "${key}"`);
  for (const key of keys) if (!(key in value)) invalid(where, `missing field "${key}"`);
}

export function parseNodePin(json, {file} = {}) {
  const where = file ?? 'pin';
  const darwin = isObject(json) && json.platform === 'darwin';
  exactKeys(json, ['schema', 'version', 'platform', 'arch', 'archive', ...(darwin ? ['signing'] : []), 'notes'], where);
  if (json.schema !== 1) invalid(where, `unsupported schema ${JSON.stringify(json.schema)}`);
  if (!Object.hasOwn(TARGETS, json.platform) || !TARGETS[json.platform].includes(json.arch)) invalid(where, `unsupported target ${json.platform}-${json.arch}`);
  if (typeof json.version !== 'string' || !VERSION.test(json.version)) invalid(`${where}.version`, `invalid value ${JSON.stringify(json.version)}`);
  if (Number(json.version.split('.')[0]) < NODE_FLOOR) invalid(`${where}.version`, `${json.version} is below the own host's Node ${NODE_FLOOR}`);
  const pin = {schema: 1, version: json.version, platform: json.platform, arch: json.arch};
  exactKeys(json.archive, ['url', 'length', 'sha256'], `${where}.archive`);
  if (json.archive.url !== officialUrl(pin)) invalid(`${where}.archive.url`, `must be the official ${officialUrl(pin)}`);
  if (!Number.isSafeInteger(json.archive.length) || json.archive.length <= 0) invalid(`${where}.archive.length`, 'must be a positive integer');
  if (typeof json.archive.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(json.archive.sha256)) invalid(`${where}.archive.sha256`, 'must be 64 lowercase hex digits');
  let signing;
  if (darwin) {
    exactKeys(json.signing, ['team'], `${where}.signing`);
    if (typeof json.signing.team !== 'string' || !/^[A-Z0-9]{10}$/.test(json.signing.team)) invalid(`${where}.signing.team`, `invalid value ${JSON.stringify(json.signing.team)}`);
    signing = {team: json.signing.team};
  }
  if (typeof json.notes !== 'string' || !json.notes) invalid(`${where}.notes`, 'must record the provenance check');
  return {...pin, archive: {url: json.archive.url, length: json.archive.length, sha256: json.archive.sha256}, ...(signing ? {signing} : {}), notes: json.notes};
}

export function loadNodePins(dir = NODE_PINS_DIR) {
  return readdirSync(dir).filter(name => name.endsWith('.json')).sort().map(name => {
    const file = join(dir, name);
    let json;
    try { json = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { fail('invalid_pin', `Node pin ${file}: ${error.message}`); }
    const pin = parseNodePin(json, {file});
    if (name !== `${pin.version}-${pin.platform}-${pin.arch}.json`) invalid(file, `file name must be ${pin.version}-${pin.platform}-${pin.arch}.json`);
    return pin;
  });
}

const versionParts = v => v.split('.').map(Number);
const newer = (a, b) => { const x = versionParts(a), y = versionParts(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };

// The pin `cua install` installs on this host: the newest for its platform and arch, or null where none is pinned
// (the own host then runs on the user's Node, or the session keeps the vendor host).
export function selectNodePin(pins, host = hostTarget()) {
  const matching = pins.filter(p => p.platform === host.platform && p.arch === host.arch);
  return matching.length ? matching.reduce((best, p) => newer(p.version, best.version) ? p : best) : null;
}

const HEX64 = /^[0-9a-f]{64}$/;
const positive = v => Number.isSafeInteger(v) && v > 0;
const hasExactly = (value, keys) => isObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const RECORD_KEYS = ['schema', 'version', 'platform', 'arch', 'archive', 'node', 'source', 'installedAt'];

// The install record of node/<version> when it is exactly a record of that version for `target` ({platform, arch}),
// with the archive it came from and the digest of its bin/node, else null. A pin, when given, must also match the
// record's archive.
export function readNodeRecord(dir, {version, platform, arch, archive}) {
  let record;
  try { record = JSON.parse(readFileSync(join(dir, NODE_RECORD_FILE), 'utf8')); } catch { return null; }
  const valid = hasExactly(record, RECORD_KEYS) && record.schema === 1 && record.version === version && record.platform === platform && record.arch === arch
    && hasExactly(record.archive, ['sha256', 'length']) && HEX64.test(record.archive.sha256) && positive(record.archive.length)
    && hasExactly(record.node, ['sha256', 'size']) && typeof record.node.sha256 === 'string' && HEX64.test(record.node.sha256) && positive(record.node.size)
    && ['archive', 'download'].includes(record.source) && typeof record.installedAt === 'string'
    && (!archive || (record.archive.sha256 === archive.sha256 && record.archive.length === archive.length));
  return valid ? record : null;
}

// {sha256, size} of the regular file at `path`, read in chunks (bin/node is about 120 MB: some 100 ms).
export function fileDigest(path) {
  const hash = createHash('sha256');
  const fd = openSync(path, 'r');
  let size = 0;
  try {
    const chunk = Buffer.allocUnsafe(4 << 20);
    for (let n; (n = readSync(fd, chunk, 0, chunk.length, null)) > 0; size += n) hash.update(chunk.subarray(0, n));
  } finally { closeSync(fd); }
  return {sha256: hash.digest('hex'), size};
}

// Whether bin/node under `dir` is, by real path, that very file (no symlinked part), a regular file, and the bytes
// `record.node` names. Read only; nothing is run.
export function nodeMatchesRecord(dir, record) {
  const path = join(dir, 'bin', 'node');
  try {
    if (realpathSync.native(path) !== path || !lstatSync(path).isFile() || lstatSync(path).size !== record.node.size) return false;
    const {sha256, size} = fileDigest(path);
    return sha256 === record.node.sha256 && size === record.node.size;
  } catch { return false; }
}

// The version node/current.json names, or null when there is none; a pointer that is not one, or cannot be read, is an
// error (node_pointer_invalid).
export function readNodePointer(home) {
  const {pointer} = nodeLayout(home);
  let text;
  try { text = readFileSync(pointer, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return null;
    fail('node_pointer_invalid', `${pointer} cannot be read (${error.code ?? error.message})`);
  }
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!isObject(json) || json.schema !== 1 || typeof json.version !== 'string' || !VERSION.test(json.version)) fail('node_pointer_invalid', `${pointer} is not a valid pointer`);
  return json.version;
}

// The cua-installed Node of `home` for this host -> {path, version}, or {missing: why}. It never throws: the own
// host's Node resolution (launch.mjs ownHostNode) moves on to its next candidate, naming why. A binary is offered only
// when its bytes are the ones its install record names (nodeMatchesRecord), so nothing unrecorded is ever run, its
// --version probe included; the darwin signature was checked when that record was written.
export function managedNode(home, {host = hostTarget()} = {}) {
  let real, version;
  try { real = realHome(home); } catch (error) { return {missing: `home unreadable (${error.code ?? error.message})`}; }
  try { version = readNodePointer(real); } catch (error) { return {missing: error.message}; }
  if (!version) return {missing: 'not installed'};
  const dir = nodeLayout(real).version(version);
  const record = isRealDirectory(dir) ? readNodeRecord(dir, {version, ...host}) : null;
  if (!record) return {missing: `${dir} is not a recorded install for ${host.platform}-${host.arch}`};
  if (!nodeMatchesRecord(dir, record)) return {missing: `${join(dir, 'bin', 'node')} is not the binary its install record names`};
  return {path: join(dir, 'bin', 'node'), version};
}

// `vX.Y.Z` as the executable at `path` reports it, or null.
export function nodeVersion(path) {
  try {
    const out = execFileSync(path, ['--version'], {encoding: 'utf8', timeout: 5000, env: {PATH: FIXED_PATH}, stdio: ['ignore', 'pipe', 'ignore']});
    return out.trim().match(/^v\d+\.\d+\.\d+/)?.[0] ?? null;
  } catch { return null; }
}
