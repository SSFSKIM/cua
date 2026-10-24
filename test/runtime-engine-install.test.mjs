// Install selection is exercised through the CLI and the shared installer. Only downloads and the native build
// boundary are doubled: no compiler, signing identity, GUI process or owner's engine is touched.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {main} from '../src/cli.mjs';
import * as installers from '../src/runtime/install.mjs';
import {CuaError} from '../src/runtime/errors.mjs';
import {shortScratch} from './fixtures/runtime-fixture.mjs';

const built = {bundlePath: '/fixture/cua Engine.app', engineVersion: '0.1.0', build: 'a'.repeat(64), signature: {kind: 'adhoc', identityMatches: null}, changed: true, stopped: null};
const manifest = {release: 'fixture', platform: process.platform, arch: process.arch, archive: {url: 'https://invalid.example/runtime'}};
function fixture(t, {env = {}, platform = 'darwin', build = async () => built} = {}) {
  const scratch = shortScratch('cua-install-eng-');
  t.after(scratch.cleanup);
  const events = [], calls = [];
  const deps = {home: join(scratch.dir, 'runtime'), env: {HOME: scratch.dir, ...env}, platform,
    pins: () => [manifest], nodePins: () => [],
    installRuntime: async () => { events.push('runtime'); return {release: 'fixture', root: '/fixture/runtime', changed: true, record: {source: 'archive'}}; },
    installHelper: async () => { events.push('helper'); return {path: '/fixture/helper', changed: true}; },
    buildEngine: async options => { events.push('engine'); calls.push(options); return build(options); }};
  return {deps, events, calls, settings(value) {
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

test('ordinary vendor install leaves the engine untouched, even with unused signing configuration', async t => {
  const f = fixture(t, {env: {CUA_SIGN_WAIT_MS: 'invalid'}});
  const r = await invoke(f.deps, ['--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(f.events, ['runtime']);
  assert.equal(JSON.parse(r.stdout).engine.skipped, 'not_selected');
});

test('engine selection uses env then settings; --engine overrides vendor without changing the preference', async t => {
  for (const {env, settings, args, selected} of [
    {env: {CUA_NATIVE_ENGINE: 'cua'}, settings: {engine: 'vendor'}, selected: true},
    {env: {}, settings: {engine: 'cua'}, selected: true},
    {env: {CUA_NATIVE_ENGINE: 'vendor'}, settings: {engine: 'cua'}, selected: false},
    {env: {CUA_NATIVE_ENGINE: 'vendor'}, settings: {engine: 'vendor'}, args: ['--engine'], selected: true},
  ]) {
    const f = fixture(t, {env}); f.settings(settings);
    const r = await invoke(f.deps, [...(args ?? []), '--json']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(f.calls.length, selected ? 1 : 0);
    if (selected) {
      assert.deepEqual(JSON.parse(r.stdout).engine, {status: 'pass', ...built});
      assert.equal(f.calls[0].dir, join(f.deps.env.HOME, 'Library/Application Support/cua/engine'), 'CUA_HOME never relocates the engine');
      assert.equal(f.calls[0].identity, undefined, 'normal builds resolve the configured identity, never ad hoc');
    }
  }
});

test('a future cua default builds through the same selection rule, without an installed-engine check', async () => {
  let calls = 0;
  const result = await installers.installEngine({env: {HOME: '/fixture'}, platform: 'darwin', selection: {defaultEngine: 'cua'},
    build: async () => { calls++; return built; }});
  assert.equal(calls, 1);
  assert.equal(result.status, 'pass');
});

test('selected implicit build failures warn after the runtime install, while explicit --engine fails with recovery', async t => {
  for (const error of [new CuaError('engine_identity_missing', 'no signing identity', {hint: 'set signingIdentity'}), new Error('compiler unavailable')]) {
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
      assert.match(refusal.hint, /fixture is installed and active/);
      if (!explicit) { assert.equal(answer.engine.status, 'warn'); assert.match(r.stderr, /warning:.*engine/i); }
    }
  }
});

test('the Node step finishes before an engine build failure; a failed Node step never starts a build', async t => {
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

test('the real builder refuses a missing identity without compiling, warning or failing by explicitness', async t => {
  for (const explicit of [false, true]) {
    const f = fixture(t, {env: {CUA_NATIVE_ENGINE: 'cua'}});
    delete f.deps.buildEngine;
    const r = await invoke(f.deps, [...(explicit ? ['--engine'] : []), '--json']);
    assert.equal(r.status, explicit ? 1 : 0, r.stderr);
    const answer = JSON.parse(r.stdout);
    assert.equal((explicit ? answer.error : answer.engine).code, 'engine_identity_missing');
    assert.match(r.stderr, /signingIdentity/);
  }
});

test('text installs report a pending build and warn visibly on an implicit failure', async t => {
  const success = fixture(t);
  const r = await invoke(success.deps, ['--engine']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /pending.*cua engine approve/);
  const failure = fixture(t, {env: {CUA_NATIVE_ENGINE: 'cua'}, build: async () => { throw new CuaError('engine_busy', 'engine has 2 other connections'); }});
  const warning = await invoke(failure.deps);
  assert.equal(warning.status, 0);
  assert.match(warning.stderr, /warning:.*2 other connections/);
});

test('install passes explicit ad hoc signing and the bounded flag/env/default wait to the builder', async t => {
  for (const [env, args, expected] of [
    [{}, [], 45000],
    [{CUA_SIGN_WAIT_MS: '600000'}, [], 600000],
    [{CUA_SIGN_WAIT_MS: 'bad'}, ['--sign-wait', '900000'], 900000],
  ]) {
    const f = fixture(t, {env});
    const r = await invoke(f.deps, ['--engine', '--engine-sign', 'adhoc', ...args, '--json']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(f.calls[0].identity, 'adhoc');
    assert.equal(f.calls[0].signOptions.timeoutMs, expected);
  }
});

test('engine-sign alone is not an engine selection, and Linux installs never build a macOS engine', async t => {
  const f = fixture(t);
  const r = await invoke(f.deps, ['--engine-sign', 'adhoc', '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(f.calls.length, 0);
  const linux = fixture(t, {platform: 'linux', env: {CUA_NATIVE_ENGINE: 'cua'}});
  const l = await invoke(linux.deps, ['--json']);
  assert.equal(l.status, 0, l.stderr);
  assert.deepEqual(linux.events, ['runtime', 'helper']);
  assert.equal(JSON.parse(l.stdout).engine, undefined);
});

test('bad signing flags and platform options fail before installing the runtime', async t => {
  for (const [platform, args, status] of [
    ['darwin', ['--engine-sign', 'identity'], 2],
    ['darwin', ['--engine', '--sign-wait', '45s'], 1],
    ['linux', ['--engine'], 2],
    ['linux', ['--engine-sign', 'adhoc'], 2],
    ['linux', ['--sign-wait', '600000'], 2],
  ]) {
    const f = fixture(t, {platform});
    const r = await invoke(f.deps, args);
    assert.equal(r.status, status, r.stderr);
    assert.deepEqual(f.events, [], 'invalid flags cannot start downloads');
  }
});

test('an invalid wait from the environment is a selected build refusal, never a call to the compiler', async t => {
  for (const explicit of [false, true]) {
    const f = fixture(t, {env: {CUA_NATIVE_ENGINE: 'cua', CUA_SIGN_WAIT_MS: '1800001'}});
    const r = await invoke(f.deps, [...(explicit ? ['--engine'] : []), '--json']);
    assert.equal(r.status, explicit ? 1 : 0, r.stderr);
    assert.equal(f.calls.length, 0);
    const answer = JSON.parse(r.stdout);
    assert.equal((explicit ? answer.error : answer.engine).code, 'engine_sign_wait_invalid');
  }
});
