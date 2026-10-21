// The engine bundle's assembly (src/runtime/engine-bundle.mjs; docs/doperpowers/specs/2026-10-18-own-native-engine-
// design.md, Design "The engine"): `build` is a stable hash of the native/engine/ source tree plus the assembler, and the
// bundle is an LSUIElement app with the engine's id whose Info.plist carries the version and build. The last case runs
// buildEngine end to end with real codesign, ad hoc, on a throwaway bundle in a temp directory standing in for the
// approved location (swift is faked with a copy of a system binary): no identity, no keychain, nothing launched.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {scratch, shortScratch} from './fixtures/runtime-fixture.mjs';
import {ASSEMBLER, BUNDLE_ID, assembleBundle, engineBuild, engineVersion, infoPlist} from '../src/runtime/engine-bundle.mjs';
import {buildEngine, engineStatus, installedEngine} from '../src/runtime/engine.mjs';
import {readSignature, runCommand} from '../src/runtime/engine-sign.mjs';

function fakeTree(t) {
  const root = scratch('cua-engine-tree-');
  t.after(root.cleanup);
  const write = (path, text) => { mkdirSync(join(root.dir, path, '..'), {recursive: true}); writeFileSync(join(root.dir, path), text); };
  write('Package.swift', '// swift-tools-version:6.0\n');
  write('Sources/Engine/main.swift', 'print("a")\n');
  write('Sources/Engine/Version.swift', 'let engineVersion = "1.2.3"\n');
  const assembler = join(root.dir, '..', `${root.dir.split('/').pop()}-assembler.mjs`);
  writeFileSync(assembler, '// assemble\n');
  t.after(() => rmSync(assembler, {force: true}));
  return {root: root.dir, assembler, write};
}

test('build is a stable hash of the source tree and the assembler, blind to build products, Finder litter and the unit tests', t => {
  const {root, assembler, write} = fakeTree(t);
  const first = engineBuild({sourceRoot: root, assembler});
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(engineBuild({sourceRoot: root, assembler}), first);
  write('.build/debug/x.o', 'object');
  write('.swiftpm/state', 'state');
  write('Sources/.DS_Store', 'finder');
  write('Tests/EngineTests/WalkTests.swift', 'final class T {}\n');
  assert.equal(engineBuild({sourceRoot: root, assembler}), first, 'build products, litter and the unit tests do not move it');
  write('Sources/Engine/main.swift', 'print("b")\n');
  const edited = engineBuild({sourceRoot: root, assembler});
  assert.notEqual(edited, first, 'a source edit moves it');
  write('Sources/Engine/Other.swift', '');
  assert.notEqual(engineBuild({sourceRoot: root, assembler}), edited, 'a new file moves it');
  assert.notEqual(engineBuild({sourceRoot: root, assembler: ASSEMBLER}), engineBuild({sourceRoot: root, assembler}), 'the assembler is part of it');
  assert.equal(engineVersion(root), '1.2.3');
});

test('the bundle is an LSUIElement app with the engine\'s id, minimum macOS 14, and the version and build in its Info.plist', t => {
  const out = scratch('cua-engine-out-');
  t.after(out.cleanup);
  const executable = join(out.dir, 'cua-engine');
  writeFileSync(executable, '#!/bin/sh\n');
  const bundle = assembleBundle({executable, out: out.dir, version: '1.2.3', build: 'abc'});
  assert.equal(bundle, join(out.dir, 'cua Engine.app'));
  const plist = readFileSync(join(bundle, 'Contents', 'Info.plist'), 'utf8');
  assert.equal(plist, infoPlist({version: '1.2.3', build: 'abc'}));
  for (const [key, value] of [['CFBundleIdentifier', BUNDLE_ID], ['CFBundleExecutable', 'cua-engine'], ['CFBundleShortVersionString', '1.2.3'], ['CUAEngineBuild', 'abc'], ['LSMinimumSystemVersion', '14.0']])
    assert.match(plist, new RegExp(`<key>${key}</key>\\n\\t<string>${value.replace(/\./g, '\\.')}</string>`));
  assert.match(plist, /<key>LSUIElement<\/key>\n\t<true\/>/);
  assert.equal(readFileSync(join(bundle, 'Contents', 'PkgInfo'), 'utf8'), 'APPL????');
});

test('buildEngine with --sign adhoc and real codesign: a strictly verifying hardened-runtime bundle with no entitlements, read back as ad hoc', {skip: process.platform !== 'darwin' && 'codesign is macOS only'}, async t => {
  const work = shortScratch('cua-eb-');
  t.after(work.cleanup);
  const source = join(work.dir, 'src');
  mkdirSync(join(source, 'Sources', 'Engine'), {recursive: true});
  writeFileSync(join(source, 'Package.swift'), '// swift-tools-version:6.0\n');
  writeFileSync(join(source, 'Sources', 'Engine', 'Version.swift'), 'let engineVersion = "1.2.3"\n');
  const dir = join(work.dir, 'engine');
  const run = async (file, args, options) => {
    if (file !== 'swift') return runCommand(file, args, options);
    const scratchPath = args[args.indexOf('--scratch-path') + 1];
    mkdirSync(join(scratchPath, 'release'), {recursive: true});
    copyFileSync('/usr/bin/true', join(scratchPath, 'release', 'cua-engine'));
    return {code: 0, stdout: '', stderr: ''};
  };
  const result = await buildEngine({identity: 'adhoc', dir, sourceRoot: source, env: {HOME: work.dir}, run});
  assert.deepEqual(result.signature, {kind: 'adhoc', identityMatches: null});
  const bundle = join(dir, 'cua Engine.app');
  assert.equal(spawnSync('/usr/bin/codesign', ['--verify', '--strict', bundle]).status, 0);
  const details = spawnSync('/usr/bin/codesign', ['-dv', bundle], {encoding: 'utf8'});
  assert.match(details.stderr, /flags=0x\w+\([^)]*\bruntime\b/);
  assert.match(details.stderr, /Identifier=io\.github\.ssfskim\.cua\.engine/);
  assert.equal(spawnSync('/usr/bin/codesign', ['-d', '--entitlements', '-', '--xml', bundle], {encoding: 'utf8'}).stdout.trim(), '', 'no entitlements');
  assert.deepEqual(readSignature(bundle), {kind: 'adhoc'});
  assert.equal(readSignature(join(work.dir, 'src')), null, 'an unsigned directory');

  const status = await engineStatus({dir, env: {HOME: work.dir}});
  assert.equal(status.build, result.build);
  assert.equal(status.running, false);
  assert.equal(status.approved, false);
  assert.equal(installedEngine({dir}), null, 'pending until approved');
  writeFileSync(join(dir, 'approved.json'), JSON.stringify({build: result.build, identity: 'adhoc', approvedAt: 'now'}));
  assert.equal(installedEngine({dir}).build, result.build);
  const again = await buildEngine({identity: 'adhoc', dir, sourceRoot: source, env: {HOME: work.dir}, run});
  assert.equal(again.changed, false, 'a matching build and signature are left as they are');
});
