// The engine-swift gate's check of the real bundle `cua engine build --sign adhoc` leaves (scripts/engine-gate/
// verify-bundle.mjs): the build answered pending in the slot, the bundle's Info.plist and signature, and nothing
// approved. Each case builds through the real buildEngine, swift faked with a copy of a system binary and codesign
// real, ad hoc: no identity, no keychain, nothing launched.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {shortScratch} from '../fixtures/runtime-fixture.mjs';
import {buildEngine} from '../../src/runtime/engine.mjs';
import {runCommand} from '../../src/runtime/engine-sign.mjs';
import {verifyEngineBundle} from '../../scripts/engine-gate/verify-bundle.mjs';

const SCRIPT = fileURLToPath(new URL('../../scripts/engine-gate/verify-bundle.mjs', import.meta.url));
const darwinOnly = {skip: process.platform !== 'darwin' && 'codesign is macOS only'};
const codesign = (...args) => spawnSync('/usr/bin/codesign', args, {encoding: 'utf8'});

async function built(t) {
  const work = shortScratch('cua-vb-');
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
  const answer = {ok: true, ...await buildEngine({identity: 'adhoc', dir, sourceRoot: source, env: {HOME: work.dir}, run, log: () => {}})};
  const bundle = answer.bundlePath;
  const plist = join(bundle, 'Contents', 'Info.plist');
  // Edits the Info.plist, then signs again as buildEngine signs, so only the edited property is wrong.
  const resign = (edit, options = ['--options', 'runtime']) => {
    if (edit) writeFileSync(plist, edit(readFileSync(plist, 'utf8')));
    assert.equal(codesign('--force', '--sign', '-', ...options, '--timestamp=none', bundle).status, 0);
  };
  const verify = (overrides = {}) => verifyEngineBundle({answer, dir, expected: {build: answer.build, engineVersion: '1.2.3'}, ...overrides});
  return {work, dir, answer, bundle, resign, verify};
}

const failed = checks => checks.filter(c => !c.ok).map(c => c.label);

test('a fresh ad hoc build passes every check: pending in the slot, this source\'s build, the bundle\'s id, LSUIElement, a strict signature with hardened runtime, nothing approved', darwinOnly, async t => {
  const b = await built(t);
  const checks = b.verify();
  assert.deepEqual(failed(checks), [], JSON.stringify(checks, null, 1));
  assert.deepEqual(checks.map(c => c.label), [
    'the build answered pending in the slot beside the approved path',
    'the answer\'s build and version metadata match this checkout\'s source',
    'Info.plist: bundle id io.github.ssfskim.cua.engine',
    'Info.plist: LSUIElement true',
    'Info.plist: build and version equal the source\'s',
    'the executable is Mach-O code',
    'codesign --verify --strict',
    'signed ad hoc with hardened runtime, identifier io.github.ssfskim.cua.engine, no entitlements',
    'pending.json names this build, ad hoc',
    'nothing approved: no bundle at the approved path, no approved.json',
  ]);
});

test('a build that is not this checkout\'s source fails the source and Info.plist checks', darwinOnly, async t => {
  const b = await built(t);
  assert.deepEqual(failed(b.verify({expected: {build: 'f'.repeat(64), engineVersion: '1.2.3'}})),
    ['the answer\'s build and version metadata match this checkout\'s source', 'Info.plist: build and version equal the source\'s', 'pending.json names this build, ad hoc']);
  assert.deepEqual(failed(b.verify({expected: {build: b.answer.build, engineVersion: '9.9.9'}})),
    ['the answer\'s build and version metadata match this checkout\'s source', 'Info.plist: build and version equal the source\'s']);
});

test('an answer that is not a fresh pending build in the slot fails the slot check', darwinOnly, async t => {
  const b = await built(t);
  for (const patch of [{ok: false}, {pending: false}, {changed: false}, {bundlePath: join(b.dir, 'cua Engine.app')}])
    assert.deepEqual(failed(b.verify({answer: {...b.answer, ...patch}})), ['the build answered pending in the slot beside the approved path'], JSON.stringify(patch));
});

test('a signature without hardened runtime, or none at all, fails the signature checks', darwinOnly, async t => {
  const b = await built(t);
  b.resign(null, []);
  assert.deepEqual(failed(b.verify()), ['signed ad hoc with hardened runtime, identifier io.github.ssfskim.cua.engine, no entitlements']);
  assert.equal(codesign('--remove-signature', b.bundle).status, 0);
  assert.deepEqual(failed(b.verify()), ['codesign --verify --strict', 'signed ad hoc with hardened runtime, identifier io.github.ssfskim.cua.engine, no entitlements']);
});

test('an Info.plist without LSUIElement, or with another bundle id, fails its check even when signed again', darwinOnly, async t => {
  const b = await built(t);
  b.resign(text => text.replace('\t<key>LSUIElement</key>\n\t<true/>', '\t<key>LSUIElement</key>\n\t<false/>'));
  assert.deepEqual(failed(b.verify()), ['Info.plist: LSUIElement true']);
  b.resign(text => text.replace('<string>io.github.ssfskim.cua.engine</string>', '<string>com.example.other</string>'));
  assert.deepEqual(failed(b.verify()), ['Info.plist: bundle id io.github.ssfskim.cua.engine', 'Info.plist: LSUIElement true',
    'signed ad hoc with hardened runtime, identifier io.github.ssfskim.cua.engine, no entitlements']);
});

test('a bundle at the approved path or an approved.json fails the nothing-approved check', darwinOnly, async t => {
  const b = await built(t);
  writeFileSync(join(b.dir, 'approved.json'), JSON.stringify({build: b.answer.build, identity: 'adhoc', approvedAt: 'now'}));
  assert.deepEqual(failed(b.verify()), ['nothing approved: no bundle at the approved path, no approved.json']);
});

test('a missing bundle fails every check that reads it, and none throws', darwinOnly, async t => {
  const b = await built(t);
  renameSync(b.bundle, join(b.work.dir, 'moved.app'));
  assert.deepEqual(failed(b.verify()), ['Info.plist: bundle id io.github.ssfskim.cua.engine', 'Info.plist: LSUIElement true',
    'Info.plist: build and version equal the source\'s', 'the executable is Mach-O code', 'codesign --verify --strict',
    'signed ad hoc with hardened runtime, identifier io.github.ssfskim.cua.engine, no entitlements']);
});

test('the command prints a PASS or FAIL line per check and exits 1 when the build\'s answer cannot be read', t => {
  const work = shortScratch('cua-vb-');
  t.after(work.cleanup);
  const run = spawnSync(process.execPath, [SCRIPT, join(work.dir, 'absent.json')], {encoding: 'utf8', env: {...process.env, HOME: work.dir}});
  assert.equal(run.status, 1);
  assert.match(run.stdout, /^FAIL the build answered pending in the slot beside the approved path/m);
  assert.match(run.stdout, /^engine-gate: \d+ of \d+ checks failed$/m);
});
