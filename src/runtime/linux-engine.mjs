// cua's own Linux engine as cua installs and reports it (#171; docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md,
// "Selection, distribution and install" and Interfaces). `cua-engine` is built by this repository's release workflow
// (.github/workflows/linux-engine.yml), attested there and published as the release `linux-engine-v<version>`; the pin
// (runtime/engine/linux-engine.json, written by scripts/linux-engine-pin.mjs after `gh attestation verify` of both
// assets) is the trust root. Until the engine's first release there is no pin: loadEnginePin answers null, `cua install`
// says the engine is not pinned, and `cua install --engine` refuses (engine_not_pinned).
//
// One engine per cua home, at $CUA_HOME/engine/linux/cua-engine, with install.json beside it saying what was placed
// ({schema, build: 'pinned' | 'local', version, release?, commit?, sha256, source, installedAt}). It is placed with one
// rename (placeLinuxEngine), so an engine of another version is replaced while a running one keeps its file. The bytes
// decide what the engine is, never the record alone: the pinned asset's SHA-256 is the pinned engine whatever the
// record says, and the record names an engine only while its SHA-256 is the file's (inspectLinuxEngine). `cua engine
// build` places a local `cargo build --release` of the checkout the same way, recorded as `local` (buildLinuxEngine).
import {accessSync, chmodSync, constants, copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fail} from './errors.mjs';
import {homeLayout, realHome} from './layout.mjs';
import {findTool} from './tools.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ENGINE_PIN_FILE = join(REPO_ROOT, 'runtime', 'engine', 'linux-engine.json');
export const ENGINE_SOURCE = join(REPO_ROOT, 'native', 'linux-engine');
export const ENGINE_BINARY = 'cua-engine';
export const ENGINE_RECORD = 'install.json';
const ARCHES = ['x64', 'arm64'];
const RELEASE_URL = 'https://github.com/SSFSKIM/cua/releases/download/';
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const SHA256 = /^[0-9a-f]{64}$/;
const BUILDS = ['pinned', 'local'];

const sha256Of = bytes => createHash('sha256').update(bytes).digest('hex');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// ---- the pin ----

const invalid = why => fail('invalid_pin', `the Linux engine pin: ${why}`);
function exactKeys(value, keys, where) {
  if (!isObject(value)) invalid(`${where} must be an object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) invalid(`${where} has an unknown field "${key}"`);
  for (const key of keys) if (!(key in value)) invalid(`${where} is missing "${key}"`);
}
const text = (value, where, pattern) => (typeof value === 'string' && pattern.test(value) ? value : invalid(`${where} is invalid: ${JSON.stringify(value)}`));

// The pin's JSON -> the pin, exactly: {version, release: "linux-engine-v<version>", assets: {x64 | arm64: {url, sha256}}},
// each URL the release's own asset `cua-engine-<version>-linux-<arch>` of this repository. Anything else is refused
// (invalid_pin).
export function parseEnginePin(json) {
  exactKeys(json, ['version', 'release', 'assets'], 'the pin');
  const version = text(json.version, 'version', VERSION);
  const release = text(json.release, 'release', /^linux-engine-v/);
  if (release !== `linux-engine-v${version}`) invalid(`release must be linux-engine-v${version}`);
  exactKeys(json.assets, ARCHES, 'assets');
  const assets = {};
  for (const arch of ARCHES) {
    const asset = json.assets[arch];
    exactKeys(asset, ['url', 'sha256'], `assets.${arch}`);
    const expected = `${RELEASE_URL}${release}/${ENGINE_BINARY}-${version}-linux-${arch}`;
    if (asset.url !== expected) invalid(`assets.${arch}.url must be ${expected}`);
    assets[arch] = {url: expected, sha256: text(asset.sha256, `assets.${arch}.sha256`, SHA256)};
  }
  return {version, release, assets};
}

// The checked-in pin, or null while there is none (before the engine's first release).
export function loadEnginePin(file = ENGINE_PIN_FILE) {
  let source;
  try { source = readFileSync(file, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return null;
    invalid(`${file}: ${error.code ?? error.message}`);
  }
  let json;
  try { json = JSON.parse(source); } catch (error) { invalid(`${file}: ${error.message}`); }
  return parseEnginePin(json);
}

// The refusal for an install that needs the pin when this cua has none (engine_not_pinned).
export function refuseUnpinned() {
  fail('engine_not_pinned', `this cua pins no Linux engine yet (runtime/engine/linux-engine.json comes with the engine's first release), so there is none to install`,
    {hint: 'update cua to a release that pins one, or build one from this checkout with `cua engine build`'});
}

// The pinned asset for a machine of `arch` (process.arch).
export function engineAsset(pin, arch) {
  if (!ARCHES.includes(arch)) fail('unsupported_platform', `cua's Linux engine is built for ${ARCHES.join(' and ')}; this machine is ${arch}`);
  return pin.assets[arch];
}

// `cua-engine --version`'s line, `cua-engine <version> (<commit>)` -> {version, commit}, or null for anything else.
export function parseEngineVersion(output) {
  const match = /^cua-engine ((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)) \(([^()\s]+)\)\s*$/.exec(output ?? '');
  return match ? {version: match[1], commit: match[2]} : null;
}

// ---- the placed engine ----

export const linuxEngineDir = home => join(homeLayout(home).engine, 'linux');
export const linuxEnginePath = home => join(linuxEngineDir(home), ENGINE_BINARY);
const recordPath = home => join(linuxEngineDir(home), ENGINE_RECORD);

export function executableFile(path) {
  try { return statSync(path).isFile() && (accessSync(path, constants.X_OK), true); } catch { return false; }
}

// The engine `cua install` or `cua engine build` placed in the cua home `home` -> {path}, or null when nothing a session
// could execute is there. Nothing is read but the file's metadata: what the engine is, is doctor's (inspectLinuxEngine).
export function installedLinuxEngine({home}) {
  const path = linuxEnginePath(realHome(home));
  return executableFile(path) ? {path} : null;
}

// install.json in the cua home `home`, or null when it is absent or not a record this cua wrote.
export function readEngineRecord(home) {
  let record;
  try { record = JSON.parse(readFileSync(recordPath(home), 'utf8')); } catch { return null; }
  const valid = isObject(record) && record.schema === 1 && BUILDS.includes(record.build) && typeof record.version === 'string' && VERSION.test(record.version)
    && typeof record.sha256 === 'string' && SHA256.test(record.sha256);
  return valid ? record : null;
}

// Write-then-rename, so a reader sees one record or the other.
export function writeEngineRecord(home, record) {
  const path = recordPath(home);
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify({schema: 1, ...record}, null, 2) + '\n', {mode: 0o644});
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, {force: true});
    throw error;
  }
}

// Moves `staged` (a verified file in the home's staging directory, on the same volume) to the engine's path with one
// rename, 0755 in a 0755 directory, then writes `record`. A running engine keeps the file it was started from. A
// directory at the path is refused (target_occupied) and left as it is.
export function placeLinuxEngine({home, staged, record}) {
  const path = linuxEnginePath(home);
  mkdirSync(linuxEngineDir(home), {recursive: true, mode: 0o755});
  let existing = null;
  try { existing = lstatSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing?.isDirectory()) fail('target_occupied', `${path} is a directory, not an engine cua placed; it is left untouched`, {hint: 'move it aside yourself, then run the command again'});
  // Set, not inherited from how the staged copy was made: a umask must not take the execute bits away.
  chmodSync(staged, 0o755);
  renameSync(staged, path);
  writeEngineRecord(home, {...record, installedAt: new Date().toISOString()});
  return {path};
}

// What the engine placed in the cua home `home` is, for a machine of `arch` and this cua's `pin` (null before the first
// release) -> {path, exists, executable, sha256, build, version, release, pinned, current}. `build` is `pinned` when the
// file holds the pinned asset's bytes, else the record's build (`pinned` from another release, or `local`) while the
// record's SHA-256 is the file's, else `unknown`; null when there is no file. `pinned` is this cua's pin for `arch`
// ({version, release, sha256}) or null; `current` says the placed engine is exactly that.
export function inspectLinuxEngine({home, arch, pin}) {
  const real = realHome(home);
  const path = linuxEnginePath(real);
  const pinned = pin && ARCHES.includes(arch) ? {version: pin.version, release: pin.release, sha256: pin.assets[arch].sha256} : null;
  let bytes = null;
  try { if (statSync(path).isFile()) bytes = readFileSync(path); } catch { bytes = null; }
  const facts = {path, exists: bytes !== null, executable: bytes !== null && executableFile(path), sha256: bytes && sha256Of(bytes), build: null, version: null, release: null, pinned, current: false};
  if (!bytes) return facts;
  if (pinned && facts.sha256 === pinned.sha256) return {...facts, build: 'pinned', version: pinned.version, release: pinned.release, current: true};
  const record = readEngineRecord(real);
  if (record?.sha256 === facts.sha256) return {...facts, build: record.build, version: record.version, release: record.release ?? null};
  return {...facts, build: 'unknown'};
}

// ---- the local build ----

const runCommand = (command, args, {cwd, passthrough = false} = {}) => {
  const result = spawnSync(command, args, passthrough ? {cwd, stdio: ['ignore', 2, 2]} : {cwd, encoding: 'utf8', timeout: 10_000});
  return {status: result.error ? -1 : result.status, stdout: result.stdout ?? '', error: result.error?.message};
};
// cargo on PATH, else rustup's default place under HOME.
export function findCargo(env = process.env) {
  const rustup = env.HOME ? join(env.HOME, '.cargo', 'bin', 'cargo') : null;
  return findTool('cargo', env.PATH) ?? (rustup && executableFile(rustup) ? rustup : null);
}

// `cua engine build` on Linux: `cargo build --release` of the checkout's native/linux-engine (in that directory, so
// its rust-toolchain.toml chooses the toolchain), then the built engine placed as a recorded local build -> {path,
// version, commit, sha256, build: 'local', changed}. The same build already placed changes nothing. `run` and `cargo`
// are seams for tests; cargo's own output goes to stderr.
export async function buildLinuxEngine({home, sourceRoot = ENGINE_SOURCE, cargo = findCargo(), run = runCommand, host = {platform: process.platform, arch: process.arch}}) {
  if (host.platform !== 'linux') fail('unsupported_platform', `this is the Linux engine's build, and this host is ${host.platform}-${host.arch}`);
  const manifest = join(sourceRoot, 'Cargo.toml');
  try { statSync(manifest); } catch {
    fail('engine_source_missing', `cua engine build needs the engine's sources at ${sourceRoot}, and there are none`, {hint: 'run it from a cua checkout, or install the pinned engine with `cua install --engine`'});
  }
  if (!cargo) fail('missing_tool', 'cargo is not installed; cua engine build needs it to build the engine', {hint: 'install Rust with rustup (https://rustup.rs); the checkout\'s rust-toolchain.toml chooses the version'});
  const target = join(sourceRoot, 'target');
  const cargoRun = run(cargo, ['build', '--release', '--locked', '--manifest-path', manifest, '--target-dir', target], {cwd: sourceRoot, passthrough: true});
  if (cargoRun.status !== 0) fail('engine_build_failed', `cargo build --release of ${sourceRoot} failed (${cargoRun.error ?? `exit ${cargoRun.status}`}); its output is above`);
  const built = join(target, 'release', ENGINE_BINARY);
  const answer = run(built, ['--version']);
  const identity = answer.status === 0 ? parseEngineVersion(answer.stdout) : null;
  if (!identity) fail('engine_build_failed', `the engine cargo built at ${built} did not answer --version as cua-engine (${answer.error ?? JSON.stringify(String(answer.stdout).trim().slice(0, 80))})`);
  const sha256 = sha256Of(readFileSync(built));
  const real = realHome(home, {create: true});
  const placed = inspectLinuxEngine({home: real, arch: host.arch, pin: null});
  const result = changed => ({path: placed.path, version: identity.version, commit: identity.commit, sha256, build: 'local', changed});
  if (placed.build === 'local' && placed.sha256 === sha256 && placed.executable) return result(false);
  const staging = homeLayout(real).staging;
  mkdirSync(staging, {recursive: true, mode: 0o700});
  const stage = mkdtempSync(join(staging, 'linux-engine-'));
  try {
    const staged = join(stage, ENGINE_BINARY);
    copyFileSync(built, staged);
    if (sha256Of(readFileSync(staged)) !== sha256) fail('engine_build_failed', `${built} changed while it was copied; build again`);
    placeLinuxEngine({home: real, staged, record: {build: 'local', version: identity.version, commit: identity.commit, sha256, source: sourceRoot}});
  } finally {
    rmSync(stage, {recursive: true, force: true});
  }
  return result(true);
}
