// `cua install`'s macOS engine step (#117 M4; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, "Install,
// signing and permissions" and M4 in the Plan of Work): the engine is built and signed when it is selected
// (CUA_NATIVE_ENGINE, else ~/.config/cua/engine.json, else the default) or asked for with --engine, which on macOS as on
// Linux makes the engine required: only then does its failure fail the install. The build goes beside the approved
// engine, which keeps serving (design ruling 1118), and is left pending: approval is
// `cua engine approve`'s, with the owner at the console, never install's. Through the CLI with the installers and the
// engine step's build and approval read doubled: no compiler, signing identity, GUI process or owner's engine is
// touched. That install never approves, over the real build, is test/runtime-engine.test.mjs's.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {main} from '../src/cli.mjs';
import {installMacosEngine} from '../src/runtime/install.mjs';
import {CuaError} from '../src/runtime/errors.mjs';
import {shortScratch} from './fixtures/runtime-fixture.mjs';

const BUILD = 'a'.repeat(64);
const built = {bundlePath: '/fixture/pending/cua Engine.app', engineVersion: '0.1.0', build: BUILD, signature: {kind: 'identity', identityMatches: true}, changed: true, pending: true};
const manifest = {release: 'fixture', platform: process.platform, arch: process.arch, archive: {url: 'https://invalid.example/runtime'}};

// A darwin (or `platform`) install with every installer stubbed. The engine step is the real installMacosEngine with
// its build and approval read doubled: `build` answers as given, `installed` is the approved engine (null: none), and
// `events` records the steps.
function fixture(t, {env = {}, platform = 'darwin', build = async () => built, installed = () => null} = {}) {
  const scratch = shortScratch('cua-install-eng-');
  t.after(scratch.cleanup);
  const events = [], builds = [];
  const deps = {home: join(scratch.dir, 'runtime'), env: {HOME: scratch.dir, ...env}, platform,
    pins: () => [manifest], nodePins: () => [], enginePin: () => null,
    installRuntime: async () => { events.push('runtime'); return {release: 'fixture', root: '/fixture/runtime', changed: true, record: {source: 'archive'}}; },
    installHelper: async () => { events.push('helper'); return {path: '/fixture/helper', changed: true}; },
    installMacosEngine: options => installMacosEngine({...options,
      build: async buildOptions => { events.push('engine'); builds.push(buildOptions); return build(buildOptions); }, installed})};
  return {deps, events, builds, settings(value) {
    const dir = join(scratch.dir, '.config/cua'); mkdirSync(dir, {recursive: true});
    writeFileSync(join(dir, 'engine.json'), JSON.stringify(value));
  }};
}

async function invoke(deps, args = [], {withNode = false} = {}) {
  let stdout = '', stderr = '';
  const out = process.stdout.write, err = process.stderr.write;
  process.stdout.write = text => { stdout += text; return true; };
  process.stderr.write = text => { stderr += text; return true; };
  try { return {status: await main(['install', ...(withNode ? [] : ['--no-node']), ...args], deps), stdout, stderr}; }
  finally { process.stdout.write = out; process.stderr.write = err; }
}

test('an install with the vendor engine selected leaves cua\'s engine alone and says so, ignoring unused signing settings', async t => {
  const f = fixture(t, {env: {CUA_NATIVE_ENGINE: 'vendor', CUA_SIGN_WAIT_MS: 'invalid'}});
  const json = await invoke(f.deps, ['--json']);
  assert.equal(json.status, 0, json.stderr);
  assert.deepEqual(f.events, ['runtime']);
  assert.deepEqual(JSON.parse(json.stdout).engine, {skipped: 'not_selected'});
  const text = await invoke(fixture(t, {env: {CUA_NATIVE_ENGINE: 'vendor'}}).deps);
  assert.match(text.stdout, /^cua's engine is not selected, so install left it alone: cua install --engine builds it/m);
});

test('the selection is the env, then engine.json; --engine builds whatever the selection says, at HOME\'s approved location, never CUA_HOME\'s', async t => {
  for (const {env, settings, args, selected} of [
    {env: {CUA_NATIVE_ENGINE: 'cua'}, settings: {engine: 'vendor'}, selected: true},
    {env: {}, settings: {engine: 'cua'}, selected: true},
    {env: {}, settings: {}, selected: true},
    {env: {CUA_NATIVE_ENGINE: 'vendor'}, settings: {engine: 'cua'}, selected: false},
    {env: {CUA_NATIVE_ENGINE: 'vendor'}, settings: {engine: 'vendor'}, args: ['--engine'], selected: true},
    {env: {CUA_NATIVE_ENGINE: 'bogus'}, settings: {}, args: ['--engine'], selected: true},
  ]) {
    const f = fixture(t, {env}); f.settings(settings);
    const r = await invoke(f.deps, [...(args ?? []), '--json']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(f.builds.length, selected ? 1 : 0, JSON.stringify({env, settings, args}));
    if (!selected) continue;
    assert.equal(f.builds[0].dir, join(f.deps.env.HOME, 'Library/Application Support/cua/engine'));
    assert.equal(f.builds[0].identity, undefined, 'the configured identity, never ad hoc unless asked');
    assert.deepEqual(JSON.parse(r.stdout).engine, {status: 'pass', ...built, approved: false});
  }
});

test('a default of cua (M5\'s flip) builds through the same rule, before any approved engine exists', async () => {
  let builds = 0;
  const result = await installMacosEngine({env: {HOME: '/fixture'}, selection: {defaultEngine: 'cua', config: () => ({})},
    build: async () => { builds++; return built; }, installed: () => null});
  assert.equal(builds, 1);
  assert.equal(result.status, 'pass');
  assert.equal(result.approved, false);
});

test('a failed build under the selection is reported and the install succeeds; with --engine it fails the install with the remedy', async t => {
  for (const error of [new CuaError('engine_identity_missing', 'no signing identity is configured', {hint: 'set signingIdentity'}), new Error('compiler unavailable')]) {
    for (const explicit of [false, true]) {
      const f = fixture(t, {env: {CUA_NATIVE_ENGINE: 'cua'}, build: async () => { throw error; }});
      const r = await invoke(f.deps, [...(explicit ? ['--engine'] : []), '--json']);
      assert.deepEqual(f.events, ['runtime', 'engine']);
      assert.equal(r.status, explicit ? 1 : 0, r.stderr);
      const answer = JSON.parse(r.stdout);
      assert.equal(answer.ok, !explicit);
      const refusal = explicit ? answer.error : answer.engine;
      assert.equal(refusal.code, error.code ?? 'engine_install_failed');
      assert.match(refusal.message, /no signing identity|compiler unavailable/);
      if (error.hint) assert.match(refusal.hint, /set signingIdentity/);
      if (explicit) {
        assert.match(refusal.hint, /fixture is installed and active; for the engine, run cua install --engine again/);
        assert.match(refusal.message, /^cua's engine was not installed: /);
      } else {
        assert.equal(answer.engine.status, 'warn');
        assert.equal(answer.engine.cause, error.code ? 'no signing identity is configured' : 'engine_install_failed: error: compiler unavailable');
        assert.deepEqual(answer.engine.serves, {engine: 'vendor'});
        assert.match(refusal.hint, /run `cua install --engine`, then `cua engine approve` with the owner at the console; fixture is installed and active$/);
      }
    }
  }
});

// Design ruling 1148: a failed build under the selection (no --engine) is the install's warning, never its failure: it
// names the cause, says which engine sessions keep until a build is approved, and gives the remedy.
test('the install warning on a failed build names the cause, the engine sessions keep, and the remedy; the install succeeds', async t => {
  const REMEDY = 'run `cua install --engine`, then `cua engine approve` with the owner at the console';
  for (const [error, cause, fix] of [
    [new CuaError('engine_build_failed', 'swift is not installed, so cua\'s engine cannot be built', {hint: 'install Xcode (or its command line tools: xcode-select --install), then run cua engine build again'}),
      'Xcode is not installed (no swift)', 'install Xcode or its command line tools (xcode-select --install), then '],
    [new CuaError('engine_identity_missing', 'no signing identity for cua\'s engine: neither CUA_SIGNING_IDENTITY nor signingIdentity in /x/.config/cua/engine.json names one', {hint: 'set "signingIdentity" in ~/.config/cua/engine.json'}),
      'no signing identity is configured', 'set "signingIdentity" in ~/.config/cua/engine.json, then '],
    [new CuaError('engine_build_failed', 'swift build failed (exit 1):\n/src/Foo.swift:1:1: error: cannot find type \'Bar\' in scope', {hint: 'the approved bundle is unchanged'}),
      'compile error (swift build exit 1): cannot find type \'Bar\' in scope', ''],
  ]) {
    const r = await invoke(fixture(t, {env: {CUA_NATIVE_ENGINE: 'cua'}, build: async () => { throw error; }}).deps);
    assert.equal(r.status, 0, r.stderr);
    const [line, ...rest] = r.stdout.split('\n').filter(text => text.startsWith('cua\'s engine') || text.startsWith('/src'));
    assert.equal(line, `cua's engine was not built: ${cause} (${error.code}); sessions keep the vendor engine until a build is approved; to use cua's engine, ${fix}${REMEDY}; fixture is installed and active`);
    if (cause.startsWith('compile error')) assert.deepEqual(rest, ['/src/Foo.swift:1:1: error: cannot find type \'Bar\' in scope'], 'the compiler\'s detail follows the line');
  }
  // A previously approved build still serves (ruling 1118): the warning says so.
  const approved = fixture(t, {env: {CUA_NATIVE_ENGINE: 'cua'}, installed: () => ({bundlePath: '/e/cua Engine.app', engineVersion: '0.3.0', build: 'b'.repeat(64)}),
    build: async () => { throw new CuaError('engine_build_failed', 'swift is not installed, so cua\'s engine cannot be built'); }});
  const json = await invoke(approved.deps, ['--json']);
  assert.equal(json.status, 0);
  assert.deepEqual(JSON.parse(json.stdout).engine.serves, {engine: 'cua', build: 'b'.repeat(64)});
  const text = await invoke(approved.deps);
  assert.match(text.stdout, /^cua's engine was not built: Xcode is not installed \(no swift\) \(engine_build_failed\); sessions keep the approved build bbbbbbbbbbbb until a newer build is approved; to use the new build, install Xcode/m);
  // One below the service's minimum does not serve: sessions keep the vendor engine.
  const old = fixture(t, {env: {CUA_NATIVE_ENGINE: 'cua'}, installed: () => ({bundlePath: '/e/cua Engine.app', engineVersion: '0.1.0', build: 'b'.repeat(64)}),
    build: async () => { throw new CuaError('engine_identity_missing', 'none'); }});
  assert.deepEqual(JSON.parse((await invoke(old.deps, ['--json'])).stdout).engine.serves, {engine: 'vendor'});
});

test('a setting that cannot be read is the engine step\'s failure, reported without --engine', async t => {
  const f = fixture(t, {env: {CUA_NATIVE_ENGINE: 'Cua'}});
  const r = await invoke(f.deps, ['--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(f.builds.length, 0);
  const {engine} = JSON.parse(r.stdout);
  assert.equal(engine.status, 'warn');
  assert.equal(engine.code, 'invalid_setting');
});

test('the Node step finishes before the engine step; a failed Node step never starts a build', async t => {
  for (const failNode of [false, true]) {
    const f = fixture(t, {build: async () => { throw new CuaError('engine_build_failed', 'swift failed'); }});
    f.deps.nodePins = () => [{platform: process.platform, arch: process.arch, version: '24.22.0', archive: {url: 'https://invalid.example/node'}}];
    f.deps.installNode = async () => {
      f.events.push('node');
      if (failNode) throw new CuaError('node_install_failed', 'node failed');
      return {version: '24.22.0', root: '/fixture/node', changed: true};
    };
    const r = await invoke(f.deps, ['--engine', '--json'], {withNode: true});
    assert.equal(r.status, 1);
    assert.deepEqual(f.events, failNode ? ['runtime', 'node'] : ['runtime', 'node', 'engine']);
    assert.equal(JSON.parse(r.stdout).error.code, failNode ? 'node_install_failed' : 'engine_build_failed');
  }
});

test('the real builder refuses a missing identity before compiling: reported under the selection, fatal with --engine', async t => {
  for (const explicit of [false, true]) {
    const f = fixture(t, {env: {CUA_NATIVE_ENGINE: 'cua'}});
    f.deps.installMacosEngine = options => installMacosEngine({...options, installed: () => assert.fail('nothing was built')});
    const r = await invoke(f.deps, [...(explicit ? ['--engine'] : []), '--json']);
    assert.equal(r.status, explicit ? 1 : 0, r.stderr);
    const answer = JSON.parse(r.stdout);
    assert.equal((explicit ? answer.error : answer.engine).code, 'engine_identity_missing');
    assert.match((explicit ? answer.error : answer.engine).hint, /signingIdentity/);
  }
});

test('ad hoc signing and the sign wait (the flag, else CUA_SIGN_WAIT_MS, else 45 s) reach the build as engine build passes them', async t => {
  for (const [env, args, expected] of [
    [{}, [], 45000],
    [{CUA_SIGN_WAIT_MS: '600000'}, [], 600000],
    [{CUA_SIGN_WAIT_MS: 'bad'}, ['--sign-wait', '900000'], 900000],
  ]) {
    const f = fixture(t, {env});
    const r = await invoke(f.deps, ['--engine', '--engine-sign', 'adhoc', ...args, '--json']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(f.builds[0].identity, 'adhoc');
    assert.equal(f.builds[0].signOptions.timeoutMs, expected);
  }
});

test('an invalid CUA_SIGN_WAIT_MS is the selected engine step\'s refusal, never a call to the compiler', async t => {
  for (const explicit of [false, true]) {
    const f = fixture(t, {env: {CUA_NATIVE_ENGINE: 'cua', CUA_SIGN_WAIT_MS: '1800001'}});
    const r = await invoke(f.deps, [...(explicit ? ['--engine'] : []), '--json']);
    assert.equal(r.status, explicit ? 1 : 0, r.stderr);
    assert.equal(f.builds.length, 0);
    const answer = JSON.parse(r.stdout);
    assert.equal((explicit ? answer.error : answer.engine).code, 'engine_sign_wait_invalid');
  }
});

test('--engine-sign alone selects nothing; on Linux --engine keeps its meaning and no macOS engine is built', async t => {
  const f = fixture(t, {env: {CUA_NATIVE_ENGINE: 'vendor'}});
  const r = await invoke(f.deps, ['--engine-sign', 'adhoc', '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(f.builds.length, 0);
  const linux = fixture(t, {platform: 'linux', env: {CUA_NATIVE_ENGINE: 'cua'}});
  linux.deps.installEngine = async () => { linux.events.push('linux engine'); return {path: '/fixture/cua-engine', version: '0.4.3', release: 'linux-engine-v0.4.3', sha256: BUILD, changed: true}; };
  linux.deps.enginePin = () => ({version: '0.4.3', release: 'linux-engine-v0.4.3'});
  const l = await invoke(linux.deps, ['--engine', '--json']);
  assert.equal(l.status, 0, l.stderr);
  assert.deepEqual(linux.events, ['runtime', 'helper', 'linux engine']);
  assert.equal(JSON.parse(l.stdout).engine.release, 'linux-engine-v0.4.3');
});

test('bad engine flags fail before anything is installed', async t => {
  for (const [platform, args, status, words] of [
    ['darwin', ['--engine-sign', 'identity'], 2, /--engine-sign adhoc or no --engine-sign/],
    ['darwin', ['--engine', '--sign-wait', '45s'], 1, /--sign-wait must be a whole number/],
    ['linux', ['--engine-sign', 'adhoc'], 2, /--engine-sign and --sign-wait on macOS only/],
    ['linux', ['--sign-wait', '600000'], 2, /--engine-sign and --sign-wait on macOS only/],
    ['win32', ['--engine'], 2, /--engine on macOS and Linux only/],
  ]) {
    const f = fixture(t, {platform});
    const r = await invoke(f.deps, args);
    assert.equal(r.status, status, r.stderr);
    assert.match(r.stderr, words);
    assert.deepEqual(f.events, [], 'invalid flags cannot start downloads');
  }
});

// ---- what install says of approval ----

test('a build beside the approved engine is pending: install names cua engine approve with the owner at the console', async t => {
  const r = await invoke(fixture(t).deps, ['--engine']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^built cua's engine aaaaaaaaaaaa at \/fixture\/pending\/cua Engine\.app, signed with the configured identity; a new build is pending; cua engine approve to use it \(the owner at the console\)$/m);
  const again = await invoke(fixture(t, {build: async () => ({...built, changed: false})}).deps, ['--engine']);
  assert.match(again.stdout, /^cua's engine aaaaaaaaaaaa at \/fixture\/pending\/cua Engine\.app is already this build, signed with the configured identity; a new build is pending; cua engine approve to use it \(the owner at the console\)$/m);
  const unapproved = await invoke(fixture(t, {build: async () => ({...built, bundlePath: '/fixture/cua Engine.app', changed: false, pending: false})}).deps, ['--engine']);
  assert.match(unapproved.stdout, /^cua's engine aaaaaaaaaaaa at \/fixture\/cua Engine\.app is already this build, signed with the configured identity; not approved yet: cua engine approve \(the owner at the console\)$/m);
});

test('an engine already approved at this build is reported approved', async t => {
  const f = fixture(t, {build: async () => ({...built, bundlePath: '/fixture/cua Engine.app', changed: false, pending: false}), installed: () => ({build: BUILD})});
  const r = await invoke(f.deps, ['--engine']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^cua's engine aaaaaaaaaaaa at \/fixture\/cua Engine\.app is already this build, signed with the configured identity, and approved$/m);
  assert.equal(JSON.parse((await invoke(f.deps, ['--engine', '--json'])).stdout).engine.approved, true);
});
