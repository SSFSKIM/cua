import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

import {reinstallCheck} from '../scripts/accept/reinstall.mjs';
import {enginePaths} from '../src/runtime/engine.mjs';
import {infoPlist} from '../src/runtime/engine-bundle.mjs';

// No runtime acquisition or engine process: the external CLI boundary returns its actual JSON contract.
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'accept-reinstall-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  mkdirSync(join(root, 'runtime'));
  writeFileSync(join(root, 'runtime', 'file'), 'unchanged runtime');
  return {root, runtimeRoot: join(root, 'runtime'), cli: '/fixture/bin/cua.mjs', archivePath: '/must-not-read.zip', platform: 'darwin',
    env: {HOME: '/fixture/home', CUA_HOME: '/fixture/runtime', CUA_NATIVE_ENGINE: 'cua', CUA_SIGNING_IDENTITY: 'fixture identity'}};
}
const result = (extra = {}) => ({code: 0, stdout: JSON.stringify({ok: true, changed: false, engine: {skipped: 'not_selected'}, ...extra}), stderr: ''});
const only = checks => {
  assert.equal(checks.length, 1, JSON.stringify(checks));
  return checks[0];
};

test('acceptance reinstall pins acquisition to vendor without changing the driven session environment', async t => {
  const options = fixture(t), env = {...options.env};
  const check = only(await reinstallCheck({...options, run: async (file, args, {env}) => {
    assert.equal(file, process.execPath);
    assert.deepEqual(args, [options.cli, 'install', '--json', '--archive', options.archivePath]);
    assert.equal(env.CUA_NATIVE_ENGINE, 'vendor');
    assert.equal(env.HOME, options.env.HOME);
    assert.equal(env.CUA_HOME, options.env.CUA_HOME);
    return result();
  }}));
  assert.equal(check.status, 'PASS', check.detail);
  assert.match(check.detail, /engine.*not_selected/);
  assert.deepEqual(options.env, env);
});

test('an unchanged runtime cannot hide a missing engine skip, build, warning or failed command', async t => {
  const options = fixture(t);
  for (const answer of [
    result({engine: undefined}),
    result({engine: {status: 'pass', changed: true}}),
    result({engine: {status: 'pass', changed: false}}),
    result({engine: {status: 'warn'}}),
    result({ok: false}),
    {...result(), code: 1},
    {...result(), stdout: 'not JSON'},
  ]) {
    const check = only(await reinstallCheck({...options, run: async () => answer}));
    assert.equal(check.status, 'FAIL', JSON.stringify(answer));
  }
});

test('reinstall still rejects mutations to the runtime tree even when the engine is skipped', async t => {
  const options = fixture(t);
  const check = only(await reinstallCheck({...options, run: async () => {
    writeFileSync(join(options.runtimeRoot, 'unexpected'), 'added');
    return result();
  }}));
  assert.equal(check.status, 'FAIL');
  assert.match(check.detail, /1 added/);
});

test('Linux reinstall has no macOS engine outcome to require', async t => {
  const check = only(await reinstallCheck({...fixture(t), platform: 'linux', run: async () => result({engine: undefined})}));
  assert.equal(check.status, 'PASS', check.detail);
});

// --- cua's engine pinned: T1's build-beside contract (design ruling 1118) -----------------------------------------
// A temporary engine directory with an approved bundle (its Info.plist and executable) and approved.json; the fake
// install answers as buildEngine does and writes what a real build would write.
const APPROVED = 'a'.repeat(64), OTHER = 'b'.repeat(64);
function writeBundle(bundle, build) {
  mkdirSync(join(bundle, 'Contents', 'MacOS'), {recursive: true});
  writeFileSync(join(bundle, 'Contents', 'Info.plist'), infoPlist({version: '0.1.0', build}));
  writeFileSync(join(bundle, 'Contents', 'MacOS', 'cua-engine'), `engine ${build}`);
}
function engineFixture(t, {identity = 'f'.repeat(40)} = {}) {
  const options = fixture(t);
  const paths = enginePaths(join(options.root, 'engine'));
  writeBundle(paths.bundle, APPROVED);
  writeFileSync(paths.approved, JSON.stringify({build: APPROVED, identity, approvedAt: '2026-11-23T00:00:00.000Z'}) + '\n');
  return {...options, engine: 'cua', engineDir: paths.dir, paths};
}
const built = engine => result({engine: {status: 'pass', engineVersion: '0.1.0', signature: {kind: 'identity', identityMatches: true}, ...engine}});
const noOp = paths => built({bundlePath: paths.bundle, build: APPROVED, changed: false, pending: false, approved: true});
const named = (checks, prefix) => checks.find(check => check.name.startsWith(prefix));
const ENGINE_CHECK = 'reinstall keeps the approved engine';

test('cua pinned: install runs with cua selected, and an identical approved build changes nothing', async t => {
  const options = engineFixture(t);
  const checks = await reinstallCheck({...options, run: async (file, args, {env}) => {
    assert.deepEqual(args, [options.cli, 'install', '--json', '--archive', options.archivePath]);
    assert.equal(env.CUA_NATIVE_ENGINE, 'cua');
    return noOp(options.paths);
  }});
  assert.deepEqual(checks.map(check => check.status), ['PASS', 'PASS'], JSON.stringify(checks));
  assert.match(named(checks, ENGINE_CHECK).detail, /already the approved build aaaaaaaaaaaa; nothing changed/);
});

test('cua pinned on an ad hoc approved engine: the reinstall asks for an ad hoc signature, as the approved one has', async t => {
  const options = engineFixture(t, {identity: 'adhoc'});
  const checks = await reinstallCheck({...options, run: async (file, args) => {
    assert.deepEqual(args, [options.cli, 'install', '--json', '--archive', options.archivePath, '--engine-sign', 'adhoc']);
    return noOp(options.paths);
  }});
  assert.deepEqual(checks.map(check => check.status), ['PASS', 'PASS'], JSON.stringify(checks));
});

test('cua pinned: a build of another source goes beside the approved engine, at the bundlePath its answer names', async t => {
  const options = engineFixture(t);
  const checks = await reinstallCheck({...options, run: async () => {
    writeBundle(options.paths.pendingBundle, OTHER);
    writeFileSync(options.paths.pending, JSON.stringify({build: OTHER}));
    return built({bundlePath: options.paths.pendingBundle, build: OTHER, changed: true, pending: true, approved: false});
  }});
  const engine = named(checks, ENGINE_CHECK);
  assert.equal(engine.status, 'PASS', engine.detail);
  assert.match(engine.detail, /pending build bbbbbbbbbbbb added beside it/);
});

test('cua pinned: the approved bundle or approved.json touched, or an answer the engine directory does not bear out, fails', async t => {
  const cases = {
    'approved.json rewritten': paths => { writeFileSync(paths.approved, '{}\n'); return noOp(paths); },
    'approved bundle replaced': paths => { writeBundle(paths.bundle, OTHER); return noOp(paths); },
    'no-op answer, but a pending build appeared': paths => { writeBundle(paths.pendingBundle, APPROVED); return noOp(paths); },
    'no-op answer for a build that is not approved': paths => built({bundlePath: paths.bundle, build: APPROVED, changed: false, pending: false, approved: false}),
    'pending answer, but nothing in the slot': paths => built({bundlePath: paths.pendingBundle, build: OTHER, changed: true, pending: true, approved: false}),
    'pending answer naming the approved path': paths => { writeBundle(paths.pendingBundle, OTHER); return built({bundlePath: paths.bundle, build: OTHER, changed: true, pending: true}); },
    'pending answer, another build in the slot': paths => { writeBundle(paths.pendingBundle, 'c'.repeat(64)); return built({bundlePath: paths.pendingBundle, build: OTHER, changed: true, pending: true}); },
    'engine skipped although cua is selected': () => result(),
    'engine build warned': () => result({engine: {status: 'warn', code: 'engine_install_failed', message: 'x'}}),
    'no engine answer': () => result({engine: undefined}),
    'install failed': () => ({...noOp({bundle: 'x'}), code: 1}),
  };
  for (const [name, answer] of Object.entries(cases)) {
    const options = engineFixture(t);
    const checks = await reinstallCheck({...options, run: async () => answer(options.paths)});
    assert.equal(named(checks, ENGINE_CHECK).status, 'FAIL', name);
  }
});

// T1's builder discards a pending copy of the approved build with the approved identity while answering "nothing to do"
// (engine.mjs buildEngine): that one removal is the contract. A different pending build must never disappear.
test('cua pinned: a no-op reinstall may discard only a redundant pending copy of the approved build and identity', async t => {
  const cases = [
    ['the approved build, the approved identity', APPROVED, 'f'.repeat(40), 'PASS'],
    ['another build', OTHER, 'f'.repeat(40), 'FAIL'],
    ['the approved build under another identity', APPROVED, 'adhoc', 'FAIL'],
    ['the approved build with no pending.json to name its identity', APPROVED, null, 'FAIL'],
  ];
  for (const [name, build, identity, status] of cases) {
    const options = engineFixture(t);
    writeBundle(options.paths.pendingBundle, build);
    if (identity) writeFileSync(options.paths.pending, JSON.stringify({build, identity, builtAt: '2026-11-23T00:00:00.000Z'}));
    const checks = await reinstallCheck({...options, run: async () => {
      rmSync(options.paths.pendingDir, {recursive: true, force: true});
      rmSync(options.paths.pending, {force: true});
      return noOp(options.paths);
    }});
    const engine = named(checks, ENGINE_CHECK);
    assert.equal(engine.status, status, `${name}: ${engine.detail}`);
    if (status === 'PASS') assert.match(engine.detail, /redundant pending copy .* discarded/);
  }
});

test('cua pinned: the runtime tree is still compared, apart from the engine', async t => {
  const options = engineFixture(t);
  const checks = await reinstallCheck({...options, run: async () => {
    writeFileSync(join(options.runtimeRoot, 'unexpected'), 'added');
    return noOp(options.paths);
  }});
  assert.equal(named(checks, 'reinstall mutates nothing').status, 'FAIL');
  assert.equal(named(checks, ENGINE_CHECK).status, 'PASS');
});
