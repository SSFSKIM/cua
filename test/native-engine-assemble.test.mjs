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
import {ASSEMBLE_SCRIPT, engineBuild} from '../scripts/spike/engine/assemble.mjs';

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

test('build is a stable hash of the source tree and the assembling script, blind to build products and Finder litter', t => {
  const {root, script, write} = fakeTree(t);
  const first = engineBuild({sourceRoot: root, script});
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(engineBuild({sourceRoot: root, script}), first);
  write('.build/debug/x.o', 'object');
  write('.swiftpm/state', 'state');
  write('Sources/.DS_Store', 'finder');
  assert.equal(engineBuild({sourceRoot: root, script}), first, 'build products and litter do not move it');
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
