// Checked-in release pins and installed-runtime resolution.
//
// A pin (runtime/releases/<release>.json) is the only source of what may be downloaded, extracted, trusted and
// launched. Parsing is strict: an unknown or malformed field is an error, never ignored, because every field affects
// execution. `resolveRuntime` turns the active (or a named) installed release into absolute relocated paths.
//
// The schema branches on `platform`. A darwin pin names a zip whose components are signed by the pinned Apple team.
// A linux pin names a vendor deb (`archive.format: "deb"`) whose length and SHA-256 are the whole trust root: it has no
// `signing`, no native IPC version and no helper app, its components may be files (the `codex` sandbox CLI), its layout
// names the X11 helper (`skyLinuxBin`), its Chrome plugin lists no signed files, and an optional `notes` records how
// the archive's provenance was checked when the pin was written. A pin is selected only by its own host, so the
// Linux pins ship beside the darwin one without affecting a macOS install.
import {readFileSync, readdirSync, lstatSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fail} from './errors.mjs';
import {homeLayout, readPointer, realHome} from './layout.mjs';
import {checkLayout} from './checks.mjs';

export const RELEASES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'runtime', 'releases');
export const RECORD_FILE = 'install.json';
export const LAYOUT_KEYS = ['node', 'nodeRepl', 'moduleDir', 'cuaRepl', 'codexCli', 'skyServiceApp', 'skyVendorService', 'browserVendorService', 'vendorManifest', 'ipcClient'];
export const LINUX_LAYOUT_KEYS = ['node', 'nodeRepl', 'moduleDir', 'cuaRepl', 'codexCli', 'skyLinuxBin', 'skyVendorService', 'browserVendorService', 'vendorManifest'];
// The Chrome plugin is an additive component of a release (its own directory and record, src/runtime/chrome-component.mjs).
export const CHROME_LAYOUT_KEYS = ['host', 'browserClient', 'browserService', 'installManifest'];
// What `cua install --archive` takes on each platform.
const ARCHIVE_KIND = {darwin: 'ChatGPT zip', linux: 'ChatGPT deb'};
export const installHint = (platform = process.platform) => `run \`cua install\` (or \`cua install --archive <${ARCHIVE_KIND[platform] ?? ARCHIVE_KIND.darwin}>\` with the pinned archive)`;
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
  const keys = ['schema', 'release', 'appVersion', 'platform', 'arch', 'archive', 'components', 'runtime', 'layout', ...(linux ? [] : ['signing']), 'chromePlugin'];
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

  const chromePlugin = parseChromePlugin(json.chromePlugin, components, `${where}.chromePlugin`, {linux});

  const archive = {...(linux ? {format: 'deb'} : {}), url: url.href, length: json.archive.length, sha256};
  return {schema: 1, release, appVersion, platform, arch, archive, ...(notes === undefined ? {} : {notes}), components, runtime, layout, ...(signing ? {signing} : {}), chromePlugin};
}

// Where the archive's Chrome plugin comes from, the directory it lands in beside the base components, the paths the
// host configuration names, what is signature-checked (on darwin the host at least; on linux nothing, so the list is
// empty), and the native-messaging registration the vendor's own installManifest.mjs writes for this host (name,
// description, extension ids).
function parseChromePlugin(value, components, where, {linux}) {
  exactKeys(value, ['from', 'dir', 'layout', 'signing', 'nativeHost'], where);
  const from = relativePath(value.from, `${where}.from`);
  const dir = text(value.dir, `${where}.dir`, /^[A-Za-z0-9][A-Za-z0-9._-]*$/);
  if (Object.hasOwn(components, dir) || dir === RECORD_FILE) invalid(`${where}.dir`, `${JSON.stringify(dir)} collides with the base release`);
  exactKeys(value.layout, CHROME_LAYOUT_KEYS, `${where}.layout`);
  const layout = Object.fromEntries(CHROME_LAYOUT_KEYS.map(key => [key, relativePath(value.layout[key], `${where}.layout.${key}`)]));
  if (linux ? !Array.isArray(value.signing) || value.signing.length : !Array.isArray(value.signing) || !value.signing.includes(layout.host))
    invalid(`${where}.signing`, linux ? 'must be empty on linux (the archive hash is the trust root)' : 'must list the host');
  const signing = value.signing.map((c, i) => relativePath(c, `${where}.signing[${i}]`));
  exactKeys(value.nativeHost, ['name', 'description', 'extensionIds'], `${where}.nativeHost`);
  const {extensionIds} = value.nativeHost;
  if (!Array.isArray(extensionIds) || !extensionIds.length) invalid(`${where}.nativeHost.extensionIds`, 'must be a non-empty list');
  const nativeHost = {
    // Chrome's native-messaging host name rule.
    name: text(value.nativeHost.name, `${where}.nativeHost.name`, /^[a-z0-9_]+(\.[a-z0-9_]+)*$/),
    description: text(value.nativeHost.description, `${where}.nativeHost.description`),
    extensionIds: extensionIds.map((id, i) => text(id, `${where}.nativeHost.extensionIds[${i}]`, /^[a-p]{32}$/)),
  };
  return {from, dir, layout, signing, nativeHost};
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

// The installed release a home points at (or the named one), with its pin and install record, without checking its
// files; doctor reports file damage as its own check. A release pinned for another platform is refused here, before
// anything can launch it.
export function locateRuntime({home, release, pins = loadPins(), host = hostTarget()}) {
  const real = realHome(home);
  const selected = release ?? readPointer(real);
  if (!selected) fail('runtime_not_installed', `no runtime is installed in ${real}`, {hint: installHint(host.platform)});
  const pin = findPin(pins, selected);
  assertHostSupports(pin, host);
  const root = join(homeLayout(real).runtimes, pin.release);
  if (!isRealDirectory(root)) fail('release_not_installed', `release ${pin.release} is not installed in ${real}`, {hint: installHint(host.platform)});
  return runtimeFor({home: real, pin, record: readInstalledRecord(root, pin)});
}

// The active (or named) installed release as absolute relocated paths. Checks structure only (pin, record, files);
// vendor signatures are verified at install, by `runtime use` and by doctor, not on every launch.
export function resolveRuntime({home, release, pins = loadPins(), host = hostTarget()}) {
  const runtime = locateRuntime({home, release, pins, host});
  const layout = checkLayout(runtime.root, runtime.manifest);
  if (!layout.ok) fail('layout_invalid', `installed release ${runtime.release} is missing ${layout.missing.join(', ')}`, {hint: recoveryHint(runtime.root, runtime.manifest.platform)});
  return runtime;
}
