// The spike's bundle assembly (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Concrete Steps "M0 spike
// build and sign"; Design, "The engine"): `build` is the hash of the native/engine/ source tree plus the assembling
// script, embedded in `cua Engine.app`'s Info.plist so ping reports it; the bundle is an LSUIElement app with the
// engine's bundle id, signed with hardened runtime and no entitlements. The end-to-end case signs ad hoc (no keychain)
// and runs the bundle's executable directly, which raises nothing.
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {REPO, scratch, shortScratch} from './fixtures/runtime-fixture.mjs';
import {API_VERSION, Wire, debugEngine, engineSkip, engineVersionFromSource, startEngine} from './helpers/engine-wire.mjs';
import {ASSEMBLE_SCRIPT, BUNDLE_ID, PROBE_NAME, engineBuild, infoPlist} from '../scripts/spike/engine/assemble.mjs';

const ASSEMBLE = join(REPO, 'scripts', 'spike', 'engine', 'assemble.mjs');

function fakeTree(t) {
  const root = scratch('cua-engine-tree-');
  t.after(root.cleanup);
  const write = (path, text) => { mkdirSync(join(root.dir, path, '..'), {recursive: true}); writeFileSync(join(root.dir, path), text); };
  write('Package.swift', '// swift-tools-version:6.0\n');
  write('Sources/Engine/main.swift', 'print("a")\n');
  const script = join(root.dir, '..', `${root.dir.split('/').pop()}-assemble.mjs`);
  writeFileSync(script, '// assemble\n');
  t.after(() => rmSync(script, {force: true}));
  return {root: root.dir, script, write};
}

test('build is a stable hash of the source tree and the assembling script, blind to build products, Finder litter and the unit tests', t => {
  const {root, script, write} = fakeTree(t);
  const first = engineBuild({sourceRoot: root, script});
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(engineBuild({sourceRoot: root, script}), first);
  write('.build/debug/x.o', 'object');
  write('.swiftpm/state', 'state');
  write('Sources/.DS_Store', 'finder');
  assert.equal(engineBuild({sourceRoot: root, script}), first, 'build products and litter do not move it');
  write('Tests/EngineTests/WalkTests.swift', 'final class T {}\n');
  assert.equal(engineBuild({sourceRoot: root, script}), first, 'the unit tests are not the program');
  write('Sources/Engine/Tests/Kept.swift', '');
  const nested = engineBuild({sourceRoot: root, script});
  assert.notEqual(nested, first, 'only the package\'s top-level Tests directory is left out');
  rmSync(join(root, 'Sources', 'Engine', 'Tests'), {recursive: true});
  write('Sources/Engine/main.swift', 'print("b")\n');
  const edited = engineBuild({sourceRoot: root, script});
  assert.notEqual(edited, first, 'a source edit moves it');
  write('Sources/Engine/Other.swift', '');
  assert.notEqual(engineBuild({sourceRoot: root, script}), edited, 'a new file moves it');
  writeFileSync(script, '// assemble, edited\n');
  assert.notEqual(engineBuild({sourceRoot: root, script}), engineBuild({sourceRoot: root, script: ASSEMBLE_SCRIPT}), 'the script is part of it');
});

test('assemble refuses without a signing identity, naming CUA_SIGNING_IDENTITY', t => {
  const out = scratch('cua-engine-out-');
  t.after(out.cleanup);
  const result = spawnSync(process.execPath, [ASSEMBLE, '--build', out.dir, '--identity', '', '--out', out.dir], {encoding: 'utf8'});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CUA_SIGNING_IDENTITY/);
});

test('a --bundle-id bundle (U7) carries that id and the probe name; the default keeps the engine\'s; a malformed id is refused', t => {
  const probe = infoPlist({version: '1', build: 'b', bundleId: 'io.github.ssfskim.cua.engine.u7'});
  assert.match(probe, /<key>CFBundleIdentifier<\/key>\n\t<string>io\.github\.ssfskim\.cua\.engine\.u7<\/string>/);
  assert.match(probe, new RegExp(`<key>CFBundleDisplayName</key>\\n\\t<string>${PROBE_NAME}</string>`));
  const plain = infoPlist({version: '1', build: 'b'});
  assert.ok(plain.includes(`<string>${BUNDLE_ID}</string>`) && plain.includes('<string>cua Engine</string>') && !plain.includes(PROBE_NAME));
  const out = scratch('cua-engine-out-');
  t.after(out.cleanup);
  const result = spawnSync(process.execPath, [ASSEMBLE, '--build', out.dir, '--identity', 'adhoc', '--out', out.dir, '--bundle-id', 'not an id'], {encoding: 'utf8'});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /reverse-DNS/);
});

let bin;
before(() => { if (!engineSkip) bin = debugEngine(); });

test('assemble builds an LSUIElement bundle signed with hardened runtime and no entitlements, whose engine reports the embedded build and binds beside the bundle', {skip: engineSkip}, async t => {
  const work = shortScratch('cua-asm-');
  t.after(work.cleanup);
  // A scratch path laid out as `swift build -c release` leaves it, holding the test's debug executable.
  const buildDir = join(work.dir, 'scratch');
  mkdirSync(join(buildDir, 'release'), {recursive: true});
  copyFileSync(bin, join(buildDir, 'release', 'cua-engine'));
  const outDir = join(work.dir, 'out');
  const assembled = spawnSync(process.execPath, [ASSEMBLE, '--build', buildDir, '--identity', 'adhoc', '--out', outDir], {encoding: 'utf8'});
  assert.equal(assembled.status, 0, assembled.stderr);
  const bundle = join(outDir, 'cua Engine.app');
  assert.equal(assembled.stdout.trim(), bundle);

  const plist = key => spawnSync('plutil', ['-extract', key, 'raw', '-o', '-', join(bundle, 'Contents', 'Info.plist')], {encoding: 'utf8'}).stdout.trim();
  const build = engineBuild();
  assert.equal(plist('CFBundleIdentifier'), 'io.github.ssfskim.cua.engine');
  assert.equal(plist('CFBundleExecutable'), 'cua-engine');
  assert.equal(plist('LSUIElement'), 'true');
  assert.equal(plist('LSMinimumSystemVersion'), '14.0');
  assert.equal(plist('CFBundleShortVersionString'), engineVersionFromSource());
  assert.equal(plist('CUAEngineBuild'), build);

  const details = spawnSync('codesign', ['-dv', bundle], {encoding: 'utf8'});
  assert.equal(details.status, 0, details.stderr);
  assert.match(details.stderr, /flags=0x\w+\([^)]*\bruntime\b/);
  assert.match(details.stderr, /Identifier=io\.github\.ssfskim\.cua\.engine/);
  const entitlements = spawnSync('codesign', ['-d', '--entitlements', '-', '--xml', bundle], {encoding: 'utf8'});
  assert.equal(entitlements.stdout.trim(), '', 'no entitlements');
  assert.equal(spawnSync('codesign', ['--verify', '--strict', bundle]).status, 0);

  const executable = join(bundle, 'Contents', 'MacOS', 'cua-engine');
  const direct = await startEngine(t, executable, {socket: join(work.dir, 'direct.sock')});
  const wire = await Wire.connect(join(work.dir, 'direct.sock'));
  const ping = await wire.result('ping', {clientApiVersion: API_VERSION});
  assert.deepEqual(ping, {serverApiVersion: API_VERSION, engineVersion: engineVersionFromSource(), build});
  const status = await wire.result('status');
  assert.equal(status.bundlePath, bundle);
  assert.deepEqual(await wire.result('shutdown'), {});
  await direct.exited;

  const beside = join(outDir, 'engine.sock');
  const bundled = await startEngine(t, executable, {socket: null, expect: beside});
  const second = await Wire.connect(beside);
  assert.equal((await second.result('status')).socket, beside);
  assert.deepEqual(await second.result('shutdown'), {});
  await bundled.exited;
});
