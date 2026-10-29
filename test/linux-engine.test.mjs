// cua's Linux engine as cua installs it (#171; docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, "Selection,
// distribution and install" and Interfaces, Pins): the pin `scripts/linux-engine-pin.mjs` writes, parsed strictly; the
// pinned asset fetched into $CUA_HOME/engine/linux/, verified and placed with one rename that replaces an engine of
// another version while a running one keeps its file; a local `cargo build` placed the same way and recorded as one;
// and what an inspection of the placed engine says it is. Everything runs in scratch homes, with fetch, cargo and the
// built engine stubbed: nothing is downloaded or built.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildLinuxEngine, ENGINE_PIN_FILE, engineAsset, inspectLinuxEngine, installedLinuxEngine, linuxEnginePath, loadEnginePin, parseEnginePin, parseEngineVersion, readEngineRecord} from '../src/runtime/linux-engine.mjs';
import {installLinuxEngine} from '../src/runtime/install.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const ENGINE = Buffer.from('#!/bin/sh\necho "cua-engine 0.1.0 (643909f32bbb)"\n');
const NEWER = Buffer.from('#!/bin/sh\necho "cua-engine 0.2.0 (0123456789ab)"\n');
const url = (version, arch) => `https://github.com/SSFSKIM/cua/releases/download/linux-engine-v${version}/cua-engine-${version}-linux-${arch}`;
const pinFor = (version, x64, arm64 = Buffer.from('arm')) => ({version, release: `linux-engine-v${version}`,
  assets: {x64: {url: url(version, 'x64'), sha256: sha(x64)}, arm64: {url: url(version, 'arm64'), sha256: sha(arm64)}}});
const PIN = pinFor('0.1.0', ENGINE);
const LINUX = {platform: 'linux', arch: 'x64'};

function setup(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cua-linux-engine-')));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return {dir, home: join(dir, 'home')};
}
const serving = (bytes, urls = []) => async href => { urls.push(href); return new Response(bytes, {headers: {'content-length': String(bytes.length)}}); };
const expectCode = (code, pattern) => error => { assert.equal(error.code, code, `${error.code}: ${error.message}`); if (pattern) assert.match(error.message, pattern); return true; };

// ---- the pin ----

test('the pin parses exactly in the Interfaces schema, each asset this repository\'s release asset of that version', () => {
  assert.deepEqual(parseEnginePin(PIN), PIN);
  const broken = {
    extraField: p => ({...p, notes: 'x'}),
    missingAssets: ({assets, ...p}) => p,
    badVersion: p => ({...p, version: '0.1'}),
    releaseNotVersion: p => ({...p, release: 'linux-engine-v0.2.0'}),
    missingArch: p => ({...p, assets: {x64: p.assets.x64}}),
    extraArch: p => ({...p, assets: {...p.assets, riscv64: p.assets.x64}}),
    assetField: p => ({...p, assets: {...p.assets, x64: {...p.assets.x64, length: 1}}}),
    otherRepository: p => ({...p, assets: {...p.assets, x64: {...p.assets.x64, url: p.assets.x64.url.replace('SSFSKIM/cua', 'someone/else')}}}),
    otherRelease: p => ({...p, assets: {...p.assets, x64: {...p.assets.x64, url: url('0.2.0', 'x64')}}}),
    swappedArch: p => ({...p, assets: {...p.assets, x64: {...p.assets.x64, url: url('0.1.0', 'arm64')}}}),
    shortSum: p => ({...p, assets: {...p.assets, x64: {...p.assets.x64, sha256: 'abc'}}}),
    upperSum: p => ({...p, assets: {...p.assets, x64: {...p.assets.x64, sha256: p.assets.x64.sha256.toUpperCase()}}}),
  };
  for (const [name, edit] of Object.entries(broken)) assert.throws(() => parseEnginePin(edit(structuredClone(PIN))), expectCode('invalid_pin'), name);
  assert.throws(() => parseEnginePin([]), expectCode('invalid_pin'));
});

test('a missing pin is no pin (before the engine\'s first release); an unreadable or invalid one is refused', t => {
  const {dir} = setup(t);
  assert.equal(loadEnginePin(join(dir, 'absent.json')), null);
  writeFileSync(join(dir, 'pin.json'), JSON.stringify(PIN));
  assert.deepEqual(loadEnginePin(join(dir, 'pin.json')), PIN);
  writeFileSync(join(dir, 'bad.json'), '{');
  assert.throws(() => loadEnginePin(join(dir, 'bad.json')), expectCode('invalid_pin'));
  assert.equal(ENGINE_PIN_FILE.endsWith('/runtime/engine/linux-engine.json'), true);
  assert.deepEqual(engineAsset(PIN, 'arm64'), PIN.assets.arm64);
  assert.throws(() => engineAsset(PIN, 'ia32'), expectCode('unsupported_platform'));
});

test('cua-engine --version is parsed as the engine prints it, and nothing else', () => {
  assert.deepEqual(parseEngineVersion('cua-engine 0.1.0 (643909f32bbb)\n'), {version: '0.1.0', commit: '643909f32bbb'});
  assert.deepEqual(parseEngineVersion('cua-engine 1.12.3 (unknown)'), {version: '1.12.3', commit: 'unknown'});
  for (const text of ['', 'sky_linux 1.0', 'cua-engine 0.1 (x)', 'cua-engine 0.1.0']) assert.equal(parseEngineVersion(text), null, text);
});

// ---- install ----

test('install fetches the pinned asset for the machine, verifies it, and places it 0755 with its record; the staging is gone', async t => {
  const {home} = setup(t);
  const urls = [];
  const result = await installLinuxEngine({home, pin: PIN, host: LINUX, fetch: serving(ENGINE, urls)});
  const path = join(realpathSync(home), 'engine', 'linux', 'cua-engine');
  assert.deepEqual(result, {path, version: '0.1.0', release: 'linux-engine-v0.1.0', sha256: sha(ENGINE), changed: true});
  assert.deepEqual(urls, [PIN.assets.x64.url]);
  assert.deepEqual(readFileSync(path), ENGINE);
  assert.equal(statSync(path).mode & 0o777, 0o755);
  assert.equal(linuxEnginePath(realpathSync(home)), path);
  assert.deepEqual(installedLinuxEngine({home}), {path});
  const record = readEngineRecord(realpathSync(home));
  assert.deepEqual({...record, installedAt: 'x'}, {schema: 1, build: 'pinned', version: '0.1.0', release: 'linux-engine-v0.1.0', sha256: sha(ENGINE), source: PIN.assets.x64.url, installedAt: 'x'});
  assert.deepEqual(readdirSync(join(realpathSync(home), 'staging')), []);
});

test('a placed pinned engine makes install a no-op; its mode or a lost record is restored without a download', async t => {
  const {home} = setup(t);
  const placed = await installLinuxEngine({home, pin: PIN, host: LINUX, fetch: serving(ENGINE)});
  const none = async () => assert.fail('no download');
  assert.deepEqual(await installLinuxEngine({home, pin: PIN, host: LINUX, fetch: none}), {...placed, changed: false});
  chmodSync(placed.path, 0o644);
  assert.deepEqual(await installLinuxEngine({home, pin: PIN, host: LINUX, fetch: none}), placed);
  assert.equal(statSync(placed.path).mode & 0o777, 0o755);
  rmSync(join(realpathSync(home), 'engine', 'linux', 'install.json'));
  assert.deepEqual(await installLinuxEngine({home, pin: PIN, host: LINUX, fetch: none}), placed);
  assert.equal(readEngineRecord(realpathSync(home)).build, 'pinned');
});

// A running engine keeps the file it was started from: the new one is renamed over the path, never written into it.
test('install replaces an engine of another version with one rename: an open handle on the old one still reads the old bytes', async t => {
  const {home} = setup(t);
  const old = await installLinuxEngine({home, pin: PIN, host: LINUX, fetch: serving(ENGINE)});
  const before = statSync(old.path).ino;
  const fd = openSync(old.path, 'r');
  t.after(() => closeSync(fd));
  const next = await installLinuxEngine({home, pin: pinFor('0.2.0', NEWER), host: LINUX, fetch: serving(NEWER)});
  assert.deepEqual([next.version, next.changed, next.path], ['0.2.0', true, old.path]);
  assert.deepEqual(readFileSync(next.path), NEWER);
  assert.notEqual(statSync(next.path).ino, before, 'a new file, not the old one rewritten');
  const kept = Buffer.alloc(ENGINE.length);
  readSync(fd, kept, 0, kept.length, 0);
  assert.deepEqual(kept, ENGINE);
  assert.equal(readEngineRecord(realpathSync(home)).version, '0.2.0');
});

test('an asset whose bytes are not the pinned ones is refused and nothing is placed; other hosts and a missing pin are refused first', async t => {
  const {home} = setup(t);
  await assert.rejects(installLinuxEngine({home, pin: PIN, host: LINUX, fetch: serving(NEWER)}), expectCode('archive_hash_mismatch'));
  assert.equal(existsSync(join(home, 'engine', 'linux', 'cua-engine')), false);
  assert.deepEqual(readdirSync(join(realpathSync(home), 'staging')), []);
  await assert.rejects(installLinuxEngine({home, pin: PIN, host: {platform: 'darwin', arch: 'arm64'}, fetch: serving(ENGINE)}), expectCode('unsupported_platform'));
  await assert.rejects(installLinuxEngine({home, pin: PIN, host: {platform: 'linux', arch: 'ia32'}, fetch: serving(ENGINE)}), expectCode('unsupported_platform'));
  await assert.rejects(installLinuxEngine({home, pin: null, host: LINUX, fetch: serving(ENGINE)}), expectCode('engine_not_pinned', /runtime\/engine\/linux-engine\.json/));
  await assert.rejects(installLinuxEngine({home, pin: PIN, host: LINUX, fetch: async () => new Response('gone', {status: 404})}), expectCode('download_failed'));
});

test('a directory where the engine goes is refused and left as it is', async t => {
  const {home} = setup(t);
  mkdirSync(join(home, 'engine', 'linux', 'cua-engine'), {recursive: true});
  writeFileSync(join(home, 'engine', 'linux', 'cua-engine', 'keep'), 'x');
  await assert.rejects(installLinuxEngine({home, pin: PIN, host: LINUX, fetch: serving(ENGINE)}), expectCode('target_occupied'));
  assert.equal(readFileSync(join(home, 'engine', 'linux', 'cua-engine', 'keep'), 'utf8'), 'x');
  assert.equal(installedLinuxEngine({home}), null);
});

// ---- the local build ----

// A fake checkout whose cargo "builds" by writing `bytes` where cargo puts the release binary.
function checkout(dir, bytes = NEWER) {
  const source = join(dir, 'native-linux-engine');
  mkdirSync(source, {recursive: true});
  writeFileSync(join(source, 'Cargo.toml'), '[package]\nname = "cua-linux-engine"\nversion = "0.2.0"\n');
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (command === '/fake/cargo') {
      mkdirSync(join(source, 'target', 'release'), {recursive: true});
      writeFileSync(join(source, 'target', 'release', 'cua-engine'), bytes, {mode: 0o755});
      return {status: 0, stdout: ''};
    }
    return {status: 0, stdout: 'cua-engine 0.2.0 (0123456789ab)\n'};
  };
  return {source, calls, run};
}

test('cua engine build runs cargo build --release in the checkout and places the result as a recorded local build', async t => {
  const {dir, home} = setup(t);
  const {source, calls, run} = checkout(dir);
  const built = await buildLinuxEngine({home, sourceRoot: source, cargo: '/fake/cargo', run, host: LINUX});
  const path = join(realpathSync(home), 'engine', 'linux', 'cua-engine');
  assert.deepEqual(built, {path, version: '0.2.0', commit: '0123456789ab', sha256: sha(NEWER), build: 'local', changed: true});
  assert.deepEqual(calls[0], ['/fake/cargo', 'build', '--release', '--locked', '--manifest-path', join(source, 'Cargo.toml'), '--target-dir', join(source, 'target')]);
  assert.deepEqual(calls[1], [join(source, 'target', 'release', 'cua-engine'), '--version']);
  assert.deepEqual(readFileSync(path), NEWER);
  assert.equal(statSync(path).mode & 0o777, 0o755);
  const record = readEngineRecord(realpathSync(home));
  assert.deepEqual([record.build, record.version, record.sha256, record.source], ['local', '0.2.0', sha(NEWER), source]);
  assert.equal((await buildLinuxEngine({home, sourceRoot: source, cargo: '/fake/cargo', run, host: LINUX})).changed, false, 'the same build again changes nothing');
});

test('a build refuses without a checkout, a cargo, a successful cargo or an engine that answers --version, placing nothing', async t => {
  const {dir, home} = setup(t);
  await assert.rejects(buildLinuxEngine({home, sourceRoot: join(dir, 'none'), cargo: '/fake/cargo', run: () => assert.fail('nothing runs'), host: LINUX}), expectCode('engine_source_missing'));
  const {source, run} = checkout(dir);
  await assert.rejects(buildLinuxEngine({home, sourceRoot: source, cargo: null, run, host: LINUX}), expectCode('missing_tool', /cargo/));
  await assert.rejects(buildLinuxEngine({home, sourceRoot: source, cargo: '/fake/cargo', run: () => ({status: 101, stdout: ''}), host: LINUX}), expectCode('engine_build_failed'));
  await assert.rejects(buildLinuxEngine({home, sourceRoot: source, cargo: '/fake/cargo', run: (command, args) => (command === '/fake/cargo' ? run(command, args) : {status: 0, stdout: 'sky_linux\n'}), host: LINUX}),
    expectCode('engine_build_failed', /--version/));
  await assert.rejects(buildLinuxEngine({home, sourceRoot: source, cargo: '/fake/cargo', run, host: {platform: 'darwin', arch: 'arm64'}}), expectCode('unsupported_platform'));
  assert.equal(installedLinuxEngine({home}), null);
});

// ---- inspection ----

test('an inspection says what the placed engine is: the pinned one, an older pinned one, a local build, an unknown file, or none', async t => {
  const {dir, home} = setup(t);
  const real = () => realpathSync(home);
  mkdirSync(home, {recursive: true});
  const none = inspectLinuxEngine({home, arch: 'x64', pin: PIN});
  assert.deepEqual(none, {path: join(real(), 'engine', 'linux', 'cua-engine'), exists: false, executable: false, sha256: null, build: null, version: null, release: null,
    pinned: {version: '0.1.0', release: 'linux-engine-v0.1.0', sha256: sha(ENGINE)}, current: false});

  await installLinuxEngine({home, pin: PIN, host: LINUX, fetch: serving(ENGINE)});
  const pinned = inspectLinuxEngine({home, arch: 'x64', pin: PIN});
  assert.deepEqual([pinned.exists, pinned.executable, pinned.build, pinned.version, pinned.release, pinned.current, pinned.sha256], [true, true, 'pinned', '0.1.0', 'linux-engine-v0.1.0', true, sha(ENGINE)]);
  // This cua pins a newer release than the one placed: named from its record, and not current.
  const older = inspectLinuxEngine({home, arch: 'x64', pin: pinFor('0.2.0', NEWER)});
  assert.deepEqual([older.build, older.version, older.release, older.current], ['pinned', '0.1.0', 'linux-engine-v0.1.0', false]);
  // With no pin in this cua at all, the placed engine is still named from its record.
  assert.deepEqual([inspectLinuxEngine({home, arch: 'x64', pin: null}).build, inspectLinuxEngine({home, arch: 'x64', pin: null}).pinned], ['pinned', null]);

  const {source, run} = checkout(dir);
  await buildLinuxEngine({home, sourceRoot: source, cargo: '/fake/cargo', run, host: LINUX});
  const local = inspectLinuxEngine({home, arch: 'x64', pin: PIN});
  assert.deepEqual([local.build, local.version, local.current], ['local', '0.2.0', false]);

  writeFileSync(linuxEnginePath(real()), 'tampered', {mode: 0o755});
  const unknown = inspectLinuxEngine({home, arch: 'x64', pin: PIN});
  assert.deepEqual([unknown.build, unknown.version, unknown.current, unknown.sha256], ['unknown', null, false, sha('tampered')]);
  // The pinned bytes are the pinned engine whatever the record says.
  writeFileSync(linuxEnginePath(real()), ENGINE);
  assert.deepEqual([inspectLinuxEngine({home, arch: 'x64', pin: PIN}).build, inspectLinuxEngine({home, arch: 'x64', pin: PIN}).current], ['pinned', true]);
  chmodSync(linuxEnginePath(real()), 0o644);
  assert.equal(inspectLinuxEngine({home, arch: 'x64', pin: PIN}).executable, process.getuid?.() === 0);
  assert.equal(installedLinuxEngine({home}) === null, process.getuid?.() !== 0, 'a file sessions could not execute is not an installed engine');
});
