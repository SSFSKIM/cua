// Design ruling 1148 (#117 M5, the flip): "no approved cua engine" is the normal first-run state on every Mac between
// the flip's install and the first approve. The one line that says why a macOS computer session keeps the vendor engine
// and what to run (src/runtime/engine-notice.mjs), and the record of the last failed engine build it reads
// (src/runtime/engine-build-failure.mjs). Pure, or on a scratch engine directory: nothing is built or signed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {shortScratch} from './fixtures/runtime-fixture.mjs';
import {CuaError} from '../src/runtime/errors.mjs';
import {engineFallback, engineFallbackFor, fallbackLine, sessionNotice} from '../src/runtime/engine-notice.mjs';
import {buildFailureCause, buildFailureFix, clearBuildFailure, readBuildFailure, recordBuildFailure} from '../src/runtime/engine-build-failure.mjs';
import {ENGINE_DIRECTORY_IN_HOME} from '../src/runtime/layout.mjs';

const NOT_INSTALLED = {engine: 'vendor', reason: 'engine_not_installed', status: 'warn'};
const BUILD = 'a1b2c3d4e5f6'.padEnd(64, '0');
const PENDING = {build: BUILD, engineVersion: '0.3.0', bundlePath: '/e/pending/cua Engine.app', builtAt: '2026-11-23T00:00:00.000Z'};
const MINIMUM = '0.2.0';
const BUILD_THEN_APPROVE = 'run `cua install --engine`, then `cua engine approve` with the owner at the console';

test('no approved engine and nothing built: not built, and the remedy builds then approves', () => {
  const fallback = engineFallback({selection: NOT_INSTALLED, pending: null, buildFailure: null, minimum: MINIMUM});
  assert.deepEqual(fallback, {why: 'no approved cua engine (not built)', remedy: `to use cua's engine, ${BUILD_THEN_APPROVE}`});
  assert.equal(sessionNotice(fallback),
    `cua: this session keeps the vendor engine: no approved cua engine (not built); to use cua's engine, ${BUILD_THEN_APPROVE}`);
  assert.equal(fallbackLine('macOS computer sessions keep', fallback).split('\n').length, 1, 'one line');
});

test('a build pending beside the approved location: built, awaiting approve, and the remedy is the approve alone', () => {
  const fallback = engineFallback({selection: NOT_INSTALLED, pending: PENDING, buildFailure: null, minimum: MINIMUM});
  assert.deepEqual(fallback, {why: 'no approved cua engine (build a1b2c3d4e5f6 built, awaiting approve)', remedy: 'to use it, run `cua engine approve` with the owner at the console'});
  // A pending build wins over an older failure: approving it is what works.
  assert.deepEqual(engineFallback({selection: NOT_INSTALLED, pending: PENDING, buildFailure: {code: 'engine_build_failed', cause: 'x'}, minimum: MINIMUM}), fallback);
  // A pending.json with no bundle is no build awaiting approve.
  assert.equal(engineFallback({selection: NOT_INSTALLED, pending: {...PENDING, engineVersion: null, bundlePath: null}, buildFailure: null, minimum: MINIMUM}).why, 'no approved cua engine (not built)');
});

test('a pending build older than the minimum, with no approved engine: approving it would not be used, so the remedy builds a newer one first', () => {
  const fallback = engineFallback({selection: NOT_INSTALLED, pending: {...PENDING, engineVersion: '0.1.0'}, buildFailure: null, minimum: MINIMUM});
  assert.deepEqual(fallback, {why: 'no approved cua engine (build a1b2c3d4e5f6 pending is version 0.1.0, older than 0.2.0, the oldest this cua drives)',
    remedy: 'to use cua\'s engine, build it with `cua install --engine`, which builds it pending approval, then approve it with `cua engine approve` with the owner at the console'});
  assert.doesNotMatch(fallback.remedy, /^to use it, run `cua engine approve`/);
});

// A build pending below the minimum and a failure record: the newer known fact speaks. A pending build with no recorded
// build time is taken as older than the failure, whose time is always recorded.
test('a pending build below the minimum and a failure record: the newer one names the reason; an unknown build time yields to the failure', () => {
  const failure = {code: 'engine_build_failed', cause: 'Xcode is not installed or not selected', failedAt: '2026-11-22T00:00:00.000Z'};
  const stale = at => ({...PENDING, engineVersion: '0.1.0', builtAt: at});
  const why = (pending, buildFailure) => engineFallback({selection: NOT_INSTALLED, pending, buildFailure, minimum: MINIMUM}).why;
  assert.match(why(stale('2026-11-23T00:00:00.000Z'), failure), /build a1b2c3d4e5f6 pending is version 0\.1\.0/, 'the pending build is newer');
  assert.match(why(stale('2026-11-21T00:00:00.000Z'), failure), /build failed: Xcode/, 'the failure is newer');
  assert.match(why(stale(null), failure), /build failed: Xcode/, 'no build time');
  // A build awaiting approve speaks whatever the times: approving it is what works.
  assert.match(why({...PENDING, builtAt: '2026-11-01T00:00:00.000Z'}, failure), /awaiting approve/);
});

test('a failed build: its cause, and the remedy fixes it, then builds and approves', () => {
  const fallback = engineFallback({selection: NOT_INSTALLED, pending: null, buildFailure: {code: 'engine_build_failed', cause: 'Xcode is not installed (no swift)'}, minimum: MINIMUM});
  assert.deepEqual(fallback, {why: 'no approved cua engine (build failed: Xcode is not installed (no swift))', remedy: `fix that, then ${BUILD_THEN_APPROVE}`});
});

test('an approved engine older than the minimum names its version and the outdated remedy; every other selection has no notice', () => {
  const outdated = {engine: 'vendor', reason: 'engine_outdated', status: 'warn', outdated: {bundlePath: '/e/cua Engine.app', engineVersion: '0.1.0', build: 'b'.repeat(64)}, minimum: MINIMUM, pending: PENDING};
  assert.deepEqual(engineFallback({selection: outdated}), {why: 'the approved cua engine is version 0.1.0, older than 0.2.0, the oldest this cua drives',
    remedy: 'a newer build (a1b2c3d4e5f6, version 0.3.0) is pending beside it: approve it with `cua engine approve` with the owner at the console'});
  for (const selection of [null, undefined, {engine: 'cua', reason: 'default', status: 'pass'}, {engine: 'vendor', reason: 'default', status: 'pass'},
    {engine: 'vendor', reason: 'own_host_node_unavailable', status: 'warn'}])
    assert.equal(engineFallback({selection}), null, JSON.stringify(selection));
});

test('engineFallbackFor reads the pending build and the failure record only for a missing approved engine, through the seams or HOME\'s engine directory', t => {
  const s = shortScratch('cua-notice-');
  t.after(s.cleanup);
  const asked = [];
  const engine = {pending: () => { asked.push('pending'); return null; }, buildFailure: () => { asked.push('failure'); return {code: 'engine_identity_missing', cause: 'no signing identity is configured'}; }};
  assert.equal(engineFallbackFor({selection: NOT_INSTALLED, env: {HOME: s.dir}, engine}).why, 'no approved cua engine (build failed: no signing identity is configured)');
  assert.deepEqual(asked, ['pending', 'failure']);
  assert.equal(engineFallbackFor({selection: {engine: 'cua', reason: 'default', status: 'pass'}, env: {HOME: s.dir}, engine}), null);
  assert.deepEqual(asked, ['pending', 'failure'], 'nothing read for a selection with no notice');
  // Without seams: the files under HOME.
  const dir = join(s.dir, ENGINE_DIRECTORY_IN_HOME);
  assert.equal(engineFallbackFor({selection: NOT_INSTALLED, env: {HOME: s.dir}}).why, 'no approved cua engine (not built)');
  recordBuildFailure({dir, error: new CuaError('engine_build_failed', 'swift is not installed, so cua\'s engine cannot be built')});
  assert.equal(engineFallbackFor({selection: NOT_INSTALLED, env: {HOME: s.dir}}).why, 'no approved cua engine (build failed: Xcode is not installed (no swift))');
});

test('the build failure\'s cause is short, one line, and carries no identity, stack or home path', () => {
  const cause = (error, options) => buildFailureCause(error, options);
  assert.equal(cause(new CuaError('engine_build_failed', 'swift is not installed, so cua\'s engine cannot be built')), 'Xcode is not installed (no swift)');
  assert.equal(cause(new CuaError('engine_identity_missing', 'no signing identity for cua\'s engine: neither CUA_SIGNING_IDENTITY nor signingIdentity in /Users/someone/.config/cua/engine.json names one')),
    'no signing identity is configured');
  const compile = new CuaError('engine_build_failed', ['swift build failed (exit 1):', 'Compiling Engine', '/Users/someone/src/native/engine/Sources/Engine/Foo.swift:12:3: error: cannot find type \'Bar\' in scope', '  12 | let x: Bar', 'error: fatalError'].join('\n'));
  assert.equal(cause(compile), 'compile error (swift build exit 1): cannot find type \'Bar\' in scope');
  assert.equal(cause(new CuaError('engine_build_failed', 'swift build failed (exit 1):\nno detail')), 'compile error (swift build exit 1)');
  const sha = 'f'.repeat(40);
  const signed = cause(new CuaError('engine_sign_failed', `codesign could not sign with ${sha} for signer Apple Development: Some One (ABCDE12345) at /Users/someone/Library/x\nmore`), {home: '/Users/someone'});
  assert.equal(signed, 'engine_sign_failed: codesign could not sign with <signing identity> for signer <signing identity> at <path>');
  assert.ok(!signed.includes(sha) && !signed.includes('Some One'));
  // Every absolute path goes, quoted (spaces and all) or bare, under HOME or not.
  const raw = Object.assign(new Error(`EACCES: permission denied, mkdir '/Users/someone/Library/Application Support/cua/engine'\n    at mkdirSync (node:fs:1:1)`), {code: 'EACCES'});
  assert.equal(cause(raw, {home: '/Users/someone'}), 'EACCES: permission denied, mkdir \'<path>\'');
  assert.equal(cause(new CuaError('engine_sign_failed', 'the staged bundle at /private/var/folders/x/T/staging/cua Engine.app reads as unsigned')),
    'engine_sign_failed: the staged bundle at <path> Engine.app reads as unsigned', 'an unquoted path ends at its first space');
  assert.doesNotMatch(cause(new CuaError('engine_sign_failed', 'see /opt/x and "/tmp/a b/c" and (/var/y)')), /\/opt|\/tmp|\/var/);
  assert.ok(cause(new CuaError('engine_build_failed', 'x'.repeat(500))).length <= 200, 'bounded');
});

// A swift shim with no active developer directory exits non-zero with xcrun's or xcode-select's own words: that is a
// missing toolchain, not a compile error, and its fix is Xcode.
test('a missing or unselected toolchain is classified before formatting: Xcode, not a compile error', () => {
  for (const words of ['xcrun: error: invalid active developer path (/Library/Developer/CommandLineTools), missing xcrun at: /Library/Developer/CommandLineTools/usr/bin/xcrun',
    'xcode-select: error: tool \'swift\' requires Xcode, but active developer directory \'/Library/Developer/CommandLineTools\' is a command line tools instance']) {
    for (const error of [new CuaError('engine_build_failed', `swift build failed (exit 1):\n${words}`), new CuaError('engine_build_failed', `Xcode is not installed or not selected, so swift cannot run (exit 1):\n${words}`)]) {
      assert.equal(buildFailureCause(error), 'Xcode is not installed or not selected', error.message);
      assert.match(buildFailureFix(error), /xcode-select --install.*xcode-select --switch/);
    }
  }
});

test('the failure record: written with the cause and the time, never the message; cleared; garbage reads as none; never throws', t => {
  const s = shortScratch('cua-notice-');
  t.after(s.cleanup);
  const dir = join(s.dir, 'engine');
  assert.equal(readBuildFailure({dir}), null);
  const sha = 'e'.repeat(40);
  recordBuildFailure({dir, error: new CuaError('engine_sign_failed', `signing with ${sha} failed`), now: () => Date.parse('2026-11-23T01:02:03.000Z')});
  assert.deepEqual(readBuildFailure({dir}), {code: 'engine_sign_failed', cause: 'engine_sign_failed: signing with <signing identity> failed', failedAt: '2026-11-23T01:02:03.000Z'});
  assert.ok(!readFileSync(join(dir, 'build-failed.json'), 'utf8').includes(sha), 'no identity on disk');
  clearBuildFailure({dir});
  assert.equal(readBuildFailure({dir}), null);
  clearBuildFailure({dir});
  mkdirSync(dir, {recursive: true});
  for (const text of ['not json', '[]', '{"code": 1}']) {
    writeFileSync(join(dir, 'build-failed.json'), text);
    assert.equal(readBuildFailure({dir}), null, text);
  }
  writeFileSync(join(s.dir, 'file'), '');
  assert.doesNotThrow(() => recordBuildFailure({dir: join(s.dir, 'file', 'engine'), error: new Error('x')}), 'a record that cannot be written never masks the build\'s own error');
});
