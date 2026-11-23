// Checked-in release pins and installed-runtime resolution.
//
// A pin (runtime/releases/<release>.json) is the only source of what may be downloaded, extracted, trusted and
// launched. Parsing is strict: an unknown or malformed field is an error, never ignored, because every field affects
// execution. `resolveRuntime` turns the active (or a named) installed release into absolute relocated paths.
//
// The schema branches on `platform`. A darwin pin names a zip whose components are signed by the pinned Apple team.
// A linux pin names a vendor deb (`archive.format: "deb"`) whose length and SHA-256 are the whole trust root: it has no
// `signing`, no native IPC version and no helper app, its components may be files, its layout
// names the X11 helper (`skyLinuxBin`), and an optional `notes` records how the archive's provenance was checked when
// the pin was written. A pin is selected only by its own host, so the
// Linux pins ship beside the darwin one without affecting a macOS install.
// cua's own Linux engine (#171) is not a layout key: it is no part of the vendor's release, but an owned path under the
// cua home ($CUA_HOME/engine/linux/cua-engine) with its own pin, runtime/engine/linux-engine.json (src/runtime/linux-
// engine.mjs), so a release tree never names it and installing it never touches one.
//
// On Linux a session no longer resolves the vendor's release (#171 M6a; docs/doperpowers/specs/2026-10-28-own-linux-
// engine-m6a-preflight.md §2, §3.1). The Linux runtime record, runtime/linux-runtime.json, names cua's own four parts
// by their pins: the ModuleTree's lock (src/runtime/module-tree.mjs), the managed Node (managed-node.mjs), the sandbox
// helper (src/sandbox/linux.mjs) and the engine (linux-engine.mjs). It is bound to those pins at load, and its release
// name is derived from it, so a change to any part is a new release for the handshake records. `locateRuntime` and
// `resolveRuntime` answer that record on a Linux host and never read the pointer there: it records what `cua install`
// last completed and selects nothing (§4.3). The vendor's tree is reached only through `vendorLinuxRuntime`, for
// `CUA_NATIVE_ENGINE=vendor`, until M6b removes it. Every Linux remedy names this cua's own installer by its absolute
// path (`ownInstaller`, ruling 1110's F9): a `cua` on PATH from another checkout installs that checkout's runtime.
import {readFileSync, readdirSync, lstatSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fail} from './errors.mjs';
import {homeLayout, readPointer, realHome} from './layout.mjs';
import {checkLayout} from './checks.mjs';
import {MODULES_PIN_DIR, checkModuleTree, loadModuleLock, moduleHost, readModuleTree} from './module-tree.mjs';
import {NODE_FLOOR, NODE_PINS_DIR, loadNodePins, selectNodePin} from './managed-node.mjs';
import {ENGINE_PIN_FILE, loadEnginePin} from './linux-engine.mjs';
import {HELPER_PIN_FILE, loadHelperPin} from '../sandbox/linux.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RELEASES_DIR = join(REPO_ROOT, 'runtime', 'releases');
export const LINUX_RUNTIME_FILE = join(REPO_ROOT, 'runtime', 'linux-runtime.json');
// This cua's own entry point: the checkout's, or the plugin copy's, whichever this module was loaded from.
export const CUA_ENTRY = join(REPO_ROOT, 'bin', 'cua.mjs');
export const RECORD_FILE = 'install.json';
// `browserVendorService` names the vendor's @oai/browser-desktop service module, which no launch selects since #79; only
// the parity harnesses' vendor oracle loads it (test/browser-parity/vendor-oracle.mjs).
// The darwin layout names no Codex CLI since #115 M2 (the vendor host's CODEX_CLI_PATH is cua's compat executable,
// bin/cua-codex-compat); a release installed before keeps its CodexCLI.app, which this cua neither checks nor
// launches (an older cua sharing the home may), until `cua install --prune-leftovers` removes it
// (src/runtime/codex-leftovers.mjs). The Linux layout names none since #115 M3 (cua's own host
// confines its children with the pinned helper, src/sandbox/linux.mjs); a Linux release installed before keeps its
// `codex` file, which this cua never launches, until the same prune removes it.
export const LAYOUT_KEYS = ['node', 'nodeRepl', 'moduleDir', 'cuaRepl', 'skyServiceApp', 'skyVendorService', 'browserVendorService', 'vendorManifest', 'ipcClient'];
export const LINUX_LAYOUT_KEYS = ['node', 'nodeRepl', 'moduleDir', 'cuaRepl', 'skyLinuxBin', 'skyVendorService', 'browserVendorService', 'vendorManifest'];
// A word a POSIX shell reads as one argument, quoted only where it needs to be.
const shellWord = word => /^[A-Za-z0-9_./:=@%+,-]+$/.test(word) ? word : `'${word.replaceAll('\'', '\'\\\'\'')}'`;

// The installer every Linux remedy names: this cua's own bin/cua.mjs by its absolute path, and the release it installs
// where the caller knows it -> {command, hint}.
export function ownInstaller({release, entry = CUA_ENTRY} = {}) {
  const command = `node ${shellWord(entry)} install`;
  return {command, hint: `run \`${command}\`; a \`cua\` from another checkout installs that checkout's runtime${release ? `, which may not be ${release}` : ', not this one\'s'}`};
}

// The remedy for the vendor's release: on macOS the plain `cua install` (unchanged), on Linux this cua's own
// installer; each also with `--archive` and the platform's pinned archive.
export const installHint = (platform = process.platform) => {
  const command = platform === 'linux' ? ownInstaller().command : 'cua install';
  return `run \`${command}\` (or \`${command} --archive <${platform === 'linux' ? 'ChatGPT deb' : 'ChatGPT zip'}>\` with the pinned archive)`;
};
const hostTarget = () => ({platform: process.platform, arch: process.arch});

// A damaged installed release is never repaired in place (a running connection may still execute from it), so its
// recovery is offline and explicit.
export const recoveryHint = (root, platform = process.platform) => `stop any \`cua serve\` using it, remove ${root}, then ${installHint(platform)}`;

// Release trees are real directories; a symlink at a release path is never followed as an installed release.
export function isRealDirectory(path) {
  try { return lstatSync(path).isDirectory(); } catch { return false; }
}

export function assertHostSupports(pin, host = hostTarget()) {
  if (pin.platform !== host.platform || pin.arch !== host.arch)
    fail('unsupported_platform', `release ${pin.release} is for ${pin.platform}-${pin.arch}; this host is ${host.platform}-${host.arch}`);
}

const invalid = (where, why) => fail('invalid_pin', `release pin ${where}: ${why}`);
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function exactKeys(value, keys, where, optional = []) {
  if (!isObject(value)) invalid(where, 'must be an object');
  for (const key of Object.keys(value)) if (!keys.includes(key) && !optional.includes(key)) invalid(where, `unknown field "${key}"`);
  for (const key of keys) if (!(key in value)) invalid(where, `missing field "${key}"`);
}

function text(value, where, pattern) {
  if (typeof value !== 'string' || !value || (pattern && !pattern.test(value))) invalid(where, `invalid value ${JSON.stringify(value)}`);
  return value;
}

// A path relative to the archive or the release tree that cannot escape it.
function relativePath(value, where) {
  text(value, where);
  if (value.startsWith('/') || value.split('/').some(s => s === '' || s === '.' || s === '..')) invalid(where, `unsafe path ${JSON.stringify(value)}`);
  return value;
}

function underComponent(value, components, where) {
  relativePath(value, where);
  if (!Object.hasOwn(components, value.split('/')[0])) invalid(where, `${JSON.stringify(value)} is not inside an extracted component`);
  return value;
}

export function parsePin(json, {file} = {}) {
  const where = file ?? 'pin';
  const linux = isObject(json) && json.platform === 'linux';
  const keys = ['schema', 'release', 'appVersion', 'platform', 'arch', 'archive', 'components', 'runtime', 'layout', ...(linux ? [] : ['signing'])];
  exactKeys(json, keys, where, linux ? ['notes'] : []);
  if (json.schema !== 1) invalid(where, `unsupported schema ${JSON.stringify(json.schema)}`);
  const appVersion = text(json.appVersion, `${where}.appVersion`, /^\d+(\.\d+)+$/);
  const platform = text(json.platform, `${where}.platform`, /^[a-z0-9]+$/);
  const arch = text(json.arch, `${where}.arch`, /^[a-z0-9]+$/);
  const release = text(json.release, `${where}.release`);
  if (release !== `${appVersion}-${platform}-${arch}`) invalid(`${where}.release`, `must be "${appVersion}-${platform}-${arch}"`);
  const notes = linux && 'notes' in json ? text(json.notes, `${where}.notes`) : undefined;

  exactKeys(json.archive, linux ? ['format', 'url', 'length', 'sha256'] : ['url', 'length', 'sha256'], `${where}.archive`);
  if (linux && json.archive.format !== 'deb') invalid(`${where}.archive.format`, 'must be "deb" on linux');
  let url;
  try { url = new URL(json.archive.url); } catch { invalid(`${where}.archive.url`, 'not a URL'); }
  if (url.protocol !== 'https:') invalid(`${where}.archive.url`, 'must be https');
  if (!Number.isSafeInteger(json.archive.length) || json.archive.length <= 0) invalid(`${where}.archive.length`, 'must be a positive integer');
  const sha256 = text(json.archive.sha256, `${where}.archive.sha256`, /^[0-9a-f]{64}$/);

  if (!isObject(json.components) || !Object.keys(json.components).length) invalid(`${where}.components`, 'must name at least one component');
  const components = {};
  for (const [name, from] of Object.entries(json.components)) {
    text(name, `${where}.components`, /^[A-Za-z0-9][A-Za-z0-9._-]*$/);
    components[name] = relativePath(from, `${where}.components.${name}`);
  }

  exactKeys(json.runtime, linux ? ['version', 'node'] : ['version', 'node', 'ipc'], `${where}.runtime`);
  const runtime = {
    version: text(json.runtime.version, `${where}.runtime.version`),
    node: text(json.runtime.node, `${where}.runtime.node`),
    ...(linux ? {} : {ipc: text(json.runtime.ipc, `${where}.runtime.ipc`, /^[A-Za-z]+-\d+$/)}),
  };

  const layoutKeys = linux ? LINUX_LAYOUT_KEYS : LAYOUT_KEYS;
  exactKeys(json.layout, layoutKeys, `${where}.layout`);
  const layout = Object.fromEntries(layoutKeys.map(key => [key, underComponent(json.layout[key], components, `${where}.layout.${key}`)]));

  let signing;
  if (!linux) {
    exactKeys(json.signing, ['team', 'components'], `${where}.signing`);
    if (!Array.isArray(json.signing.components) || !json.signing.components.length) invalid(`${where}.signing.components`, 'must be a non-empty list');
    signing = {
      team: text(json.signing.team, `${where}.signing.team`, /^[A-Z0-9]{10}$/),
      components: json.signing.components.map((c, i) => underComponent(c, components, `${where}.signing.components[${i}]`)),
    };
  }

  const archive = {...(linux ? {format: 'deb'} : {}), url: url.href, length: json.archive.length, sha256};
  return {schema: 1, release, appVersion, platform, arch, archive, ...(notes === undefined ? {} : {notes}), components, runtime, layout, ...(signing ? {signing} : {})};
}

export function loadPins(dir = RELEASES_DIR) {
  return readdirSync(dir).filter(name => name.endsWith('.json')).sort().map(name => {
    const file = join(dir, name);
    let json;
    try { json = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { fail('invalid_pin', `release pin ${file}: ${error.message}`); }
    const pin = parsePin(json, {file});
    if (name !== `${pin.release}.json`) invalid(file, `file name must be ${pin.release}.json`);
    return pin;
  });
}

const versionParts = v => v.split('.').map(Number);
const newer = (a, b) => { const x = versionParts(a), y = versionParts(b); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0); return false; };

// The pin to install by default on this host: the newest checked-in pin for its target. Other targets get an
// explicit error rather than a guessed download.
export function selectPin(pins, host = hostTarget()) {
  const target = `${host.platform}-${host.arch}`;
  const matching = pins.filter(p => p.platform === host.platform && p.arch === host.arch);
  if (!matching.length) {
    const supported = [...new Set(pins.map(p => `${p.platform}-${p.arch}`))].join(', ') || 'none';
    fail('unsupported_platform', `unsupported platform ${target}: pinned runtimes exist only for ${supported}`);
  }
  return matching.reduce((best, p) => newer(p.appVersion, best.appVersion) ? p : best);
}

export function findPin(pins, release) {
  const pin = pins.find(p => p.release === release);
  if (!pin) fail('unknown_release', `release ${release} has no checked-in pin`, {hint: `pinned releases: ${pins.map(p => p.release).join(', ') || 'none'}`});
  return pin;
}

// The runtime record handed to launch/doctor: absolute paths for one release tree under a (real) home.
export function runtimeFor({home, pin, record}) {
  const root = join(homeLayout(home).runtimes, pin.release);
  const paths = Object.fromEntries(Object.entries(pin.layout).map(([key, rel]) => [key, join(root, rel)]));
  return {release: pin.release, home, root, paths, manifest: pin, record};
}

export function readInstalledRecord(root, pin) {
  const file = join(root, RECORD_FILE);
  let record;
  try { record = JSON.parse(readFileSync(file, 'utf8')); } catch { record = null; }
  const valid = isObject(record) && record.schema === 1 && record.release === pin.release && isObject(record.archive)
    && record.archive.sha256 === pin.archive.sha256 && record.archive.length === pin.archive.length;
  if (!valid) fail('installed_record_invalid', `${file} does not record a verified install of ${pin.release} from its pinned archive`, {hint: recoveryHint(root, pin.platform)});
  return record;
}

// ---- the Linux runtime record (#171 M6a) ----

const invalidRecord = (where, why) => fail('invalid_pin', `the Linux runtime record ${where}: ${why}`);
const LINUX_RECORD_PARTS = {
  modules: ['lock', /^[0-9a-f]{64}$/],
  node: ['version', /^\d+\.\d+\.\d+$/],
  sandbox: ['upstreamTag', /^rust-v\d+\.\d+\.\d+$/],                     // the helper pin's form
  engine: ['version', /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/],  // the engine pin's form
};

function recordKeys(value, keys, where, at) {
  if (!isObject(value)) invalidRecord(where, `${at} must be an object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) invalidRecord(where, `${at} has an unknown field "${key}"`);
  for (const key of keys) if (!(key in value)) invalidRecord(where, `${at} is missing "${key}"`);
}

// The record's JSON -> the record, exactly: {schema: 1, platform: 'linux', modules: {lock}, node: {version}, sandbox:
// {upstreamTag}, engine: {version}}, each value in its pin's own form and the Node at or above NODE_FLOOR. Anything
// else is invalid_pin.
export function parseLinuxRuntime(json, {file} = {}) {
  const where = file ?? 'runtime/linux-runtime.json';
  recordKeys(json, ['schema', 'platform', ...Object.keys(LINUX_RECORD_PARTS)], where, 'the record');
  if (json.schema !== 1) invalidRecord(where, `schema ${JSON.stringify(json.schema)} is not 1`);
  if (json.platform !== 'linux') invalidRecord(where, `platform ${JSON.stringify(json.platform)} is not "linux"`);
  const record = {schema: 1, platform: 'linux'};
  for (const [part, [field, pattern]] of Object.entries(LINUX_RECORD_PARTS)) {
    recordKeys(json[part], [field], where, part);
    const value = json[part][field];
    if (typeof value !== 'string' || !pattern.test(value)) invalidRecord(where, `${part}.${field} is invalid: ${JSON.stringify(value)}`);
    record[part] = {[field]: value};
  }
  if (Number(record.node.version.split('.')[0]) < NODE_FLOOR) invalidRecord(where, `node.version ${record.node.version} is below the own host's Node ${NODE_FLOOR}`);
  return record;
}

// The checked-in record, bound to the four pins for `host`'s architecture: each part must equal its pin, or the load is
// invalid_pin naming both files and both values. The files are injectable for tests.
export function loadLinuxRuntime({host = hostTarget(), file = LINUX_RUNTIME_FILE, modulesDir = MODULES_PIN_DIR, nodePinsDir = NODE_PINS_DIR, helperPinFile = HELPER_PIN_FILE, enginePinFile = ENGINE_PIN_FILE} = {}) {
  if (host.platform !== 'linux') fail('unsupported_platform', `cua's Linux runtime is for a Linux host; this host is ${host.platform}-${host.arch}`);
  let json;
  try { json = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { invalidRecord(file, `is not readable JSON (${error.code ?? error.message})`); }
  const record = parseLinuxRuntime(json, {file});
  const nodePin = selectNodePin(loadNodePins(nodePinsDir), host);
  if (!nodePin) fail('unsupported_platform', `cua's Linux runtime has no Node pinned for ${host.platform}-${host.arch} in ${nodePinsDir}`);
  const enginePin = loadEnginePin(enginePinFile);
  if (!enginePin) invalidRecord(file, `engine.version ${record.engine.version} has no engine pin: ${enginePinFile} is missing`);
  const pins = [
    ['modules.lock', record.modules.lock, join(modulesDir, 'package-lock.json'), loadModuleLock(modulesDir).hash, 'SHA-256'],
    ['node.version', record.node.version, join(nodePinsDir, `${nodePin.version}-${nodePin.platform}-${nodePin.arch}.json`), nodePin.version, 'version'],
    ['sandbox.upstreamTag', record.sandbox.upstreamTag, helperPinFile, loadHelperPin(helperPinFile).upstreamTag, 'upstreamTag'],
    ['engine.version', record.engine.version, enginePinFile, enginePin.version, 'version'],
  ];
  for (const [field, recorded, pinFile, pinned, what] of pins)
    if (recorded !== pinned) fail('invalid_pin', `the Linux runtime record ${file} has ${field} ${recorded}, and its pin ${pinFile} has ${what} ${pinned}`,
      {hint: field === 'engine.version' ? 'scripts/linux-engine-pin.mjs writes the engine pin and the record together' : `the record repeats its pins: change ${field} with ${pinFile}`});
  return record;
}

// The release name a record derives on an architecture: one path segment of letters, digits, dots and dashes, which
// no vendor release (digits first) can be, read at sight in current.json, doctor and evidence.
export function linuxRelease(record, arch) {
  if (typeof arch !== 'string' || !/^[a-z0-9]+$/.test(arch)) fail('unsupported_platform', `invalid architecture ${JSON.stringify(arch)}`);
  return `cua-linux-${arch}-e${record.engine.version}-n${record.node.version}-s${record.sandbox.upstreamTag.replace(/^rust-v/, '')}-m${record.modules.lock.slice(0, 12)}`;
}

// The host a module tree is read for: npm's os, cpu and, on Linux, libc. A Linux host injected elsewhere (the tests on
// macOS) is the glibc one every module pin is for.
let processLibc;
function moduleHostOf(host) {
  if (host.libc) return host;
  if (process.platform === 'linux') processLibc ??= moduleHost().libc;
  return {...host, libc: process.platform === 'linux' ? processLibc : 'glibc'};
}

// cua's own Linux runtime as resolution answers it: the record, its derived release, and the module tree this lock
// names, when cua installed it for this host. The pointer is not read, and nothing under runtimes/ is touched.
function locateOwnLinuxRuntime({home, release: named, host}) {
  const parts = loadLinuxRuntime({host});
  const release = linuxRelease(parts, host.arch);
  if (named != null && named !== release)
    fail('unknown_release', `release ${named} is not this cua's Linux runtime, ${release}`, {hint: 'on Linux this cua resolves only its own runtime; CUA_NATIVE_ENGINE=vendor selects the vendor\'s engine'});
  const lock = loadModuleLock();
  const tree = readModuleTree(home, lock, moduleHostOf(host));
  if (!tree) fail('runtime_not_installed', `cua's Linux runtime ${release} is not installed in ${home}: its module tree ${join(homeLayout(home).modules, lock.hash)} is missing`, {hint: ownInstaller({release}).hint});
  return {release, home, root: tree.root, paths: {moduleDir: tree.moduleDir}, manifest: {platform: 'linux', arch: host.arch, release, parts}, record: tree.record};
}

// The vendor's Linux tree, for the vendor selection only (CUA_NATIVE_ENGINE=vendor, until M6b): the host's pinned
// release under runtimes/, its install record and its layout, found by the pin and never through the pointer.
export function vendorLinuxRuntime({home, pins = loadPins(), host = hostTarget()}) {
  if (host.platform !== 'linux') fail('unsupported_platform', `the vendor's Linux tree is for a Linux host; this host is ${host.platform}-${host.arch}`);
  const real = realHome(home);
  const pin = selectPin(pins, host);
  const root = join(homeLayout(real).runtimes, pin.release);
  if (!isRealDirectory(root)) fail('release_not_installed', `the vendor's release ${pin.release} is not installed in ${real}`, {hint: installHint('linux')});
  const runtime = runtimeFor({home: real, pin, record: readInstalledRecord(root, pin)});
  const layout = checkLayout(root, pin);
  if (!layout.ok) fail('layout_invalid', `installed release ${pin.release} is missing ${layout.missing.join(', ')}`, {hint: recoveryHint(root, 'linux')});
  return runtime;
}

// ---- resolution ----

// The installed release a home points at (or the named one), with its pin and install record, without checking its
// files; doctor reports file damage as its own check. A release pinned for another platform is refused here, before
// anything can launch it. On Linux: cua's own runtime, whatever the pointer says.
export function locateRuntime({home, release, pins = loadPins(), host = hostTarget()}) {
  const real = realHome(home);
  if (host.platform === 'linux') return locateOwnLinuxRuntime({home: real, release, host});
  const selected = release ?? readPointer(real);
  if (!selected) fail('runtime_not_installed', `no runtime is installed in ${real}`, {hint: installHint(host.platform)});
  const pin = findPin(pins, selected);
  assertHostSupports(pin, host);
  const root = join(homeLayout(real).runtimes, pin.release);
  if (!isRealDirectory(root)) fail('release_not_installed', `release ${pin.release} is not installed in ${real}`, {hint: installHint(host.platform)});
  return runtimeFor({home: real, pin, record: readInstalledRecord(root, pin)});
}

// The active (or named) installed release as absolute relocated paths. Checks structure only (pin, record, files);
// vendor signatures are verified at install, by `runtime use` and by doctor, not on every launch. On Linux the
// structure is the module tree's: every package.json and native file there at its recorded size (checkModuleTree); its
// full check of every file's hash is the installer's and doctor's.
export function resolveRuntime({home, release, pins = loadPins(), host = hostTarget()}) {
  const runtime = locateRuntime({home, release, pins, host});
  if (host.platform === 'linux') {
    checkModuleTree(runtime.root, runtime.record);
    return runtime;
  }
  const layout = checkLayout(runtime.root, runtime.manifest);
  if (!layout.ok) fail('layout_invalid', `installed release ${runtime.release} is missing ${layout.missing.join(', ')}`, {hint: recoveryHint(runtime.root, runtime.manifest.platform)});
  return runtime;
}
