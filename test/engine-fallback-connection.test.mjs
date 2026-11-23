import {SCRATCH_HOME} from './helpers/scratch-home.mjs'; // first: the native engine's selection must not read the account's own settings
// Design ruling 1148 (#117 M5, the flip): with cua's engine the macOS default, "no approved cua engine" is the normal
// first-run state on every Mac between the install and the first approve. Through openConnection, one test per state:
//   (1) no approved engine, the vendor runtime present: the session keeps the vendor engine and its first js result
//       says why and what to run, once;
//   (2) no approved engine, no vendor runtime: the open is refused with the same reason and remedy;
//   (3) a failed build while a previously approved build still serves (ruling 1118's restore): cua's engine serves,
//       with no notice;
//   (4) an approve after the fallback: the next connection drives cua's engine, with no notice.
// The engine's inputs come through openConnection's `engine` seam; every launch runs the fake upstream (a cua-engine
// launch is rewritten to it by prepareLaunch, its selection already made), so nothing is built, signed or launched.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {realpathSync} from 'node:fs';
import {openConnection} from '../src/mcp/connection.mjs';
import {ENGINE_NOTICE_META} from '../src/mcp/server.mjs';
import {FAKE_UPSTREAM, fakeInstalledHome} from './fixtures/installed-home.mjs';
import {shortScratch} from './fixtures/runtime-fixture.mjs';

const DARWIN = {platform: 'darwin', arch: 'arm64'};
const APP = {bundlePath: '/Users/someone/Library/Application Support/cua/engine/cua Engine.app', engineVersion: '0.3.0', build: 'f'.repeat(64), approvedAt: '2026-10-20T00:00:00.000Z'};
const BASE_ENV = {PATH: '/usr/bin:/bin', HOME: SCRATCH_HOME, CUA_SHIM_SECRETS: 'off', CUA_SHIM_SURFACES: 'computer'};
const NOT_BUILT = 'cua: this session keeps the vendor engine: no approved cua engine (not built); to use cua\'s engine, run `cua install --engine`, then `cua engine approve` with the owner at the console';
// The engine's inputs on a Mac: the default (no engine.json), the approved engine (`installed`), the build pending
// beside it and the last build's failure.
const engineWith = ({installed = null, pending = null, buildFailure = null} = {}) => ({config: () => ({}), installed: () => installed, pending: () => pending, buildFailure: () => buildFailure});
// Every launch runs the fake upstream, whatever host and engine were selected for it.
const runFake = launch => ({...launch, command: process.execPath, args: [FAKE_UPSTREAM]});

// A connection on `home`, opened, initialized and asked two js calls -> {launch, results} or {error}.
async function session(t, {home, env = {}, engine}) {
  const input = new PassThrough(), output = new PassThrough();
  const frames = [];
  createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
  const launches = [];
  const opened = await openConnection({home, env: {...BASE_ENV, ...env}, host: DARWIN, sessionId: randomUUID(), input, output, diagnostics: () => {},
    prepareLaunch: launch => { launches.push(launch); return runFake(launch); }, chrome: {}, listBackends: async () => ({backends: []}),
    resolveOwnNode: () => process.execPath, engine}).then(connection => ({connection}), error => ({error}));
  if (opened.error) return {error: opened.error};
  const reply = async id => {
    for (let i = 0; i < 800; i++) { const frame = frames.find(f => f.id === id); if (frame) return frame; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw new Error(`no reply to ${id}`);
  };
  const send = msg => input.write(JSON.stringify({jsonrpc: '2.0', ...msg}) + '\n');
  send({id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'engine-fallback', version: '0'}}});
  await reply(1);
  send({method: 'notifications/initialized'});
  const results = [];
  for (const [id, code] of [[2, 'first'], [3, 'second']]) {
    send({id, method: 'tools/call', params: {name: 'js', arguments: {code}}});
    results.push((await reply(id)).result);
  }
  input.end();
  await opened.connection.closed;
  return {launch: launches[0], results};
}

const texts = result => result.content.filter(item => item.type === 'text').map(item => item.text);

test('(1) no approved engine, the vendor runtime present: the vendor engine serves, and the first js result says why and what to run, once', async t => {
  const home = fakeInstalledHome(t, {host: DARWIN});
  const {launch, results, error} = await session(t, {home, engine: engineWith()});
  assert.ok(launch, error?.message);
  assert.deepEqual(launch.replHost, {host: 'vendor', reason: 'engine_not_installed'});
  const [first, second] = results;
  assert.equal(texts(first).at(-1), NOT_BUILT, 'the line follows the runtime\'s own content');
  assert.match(texts(first)[0], /"code":"first"/, 'the runtime\'s answer stands first, unchanged');
  assert.equal(first._meta[ENGINE_NOTICE_META], NOT_BUILT, 'the same string in _meta');
  assert.equal(first._meta['cua/nativeEngine'].engine, 'vendor');
  assert.ok(!texts(second).includes(NOT_BUILT), 'only the first call carries it');
  assert.equal(Object.hasOwn(second._meta, ENGINE_NOTICE_META), false);
  // The reason follows the engine directory: a build awaiting approve, a failed build.
  const awaiting = await session(t, {home, engine: engineWith({pending: {build: 'a'.repeat(64), engineVersion: '0.3.0', bundlePath: '/e/pending/cua Engine.app', builtAt: null}})});
  assert.equal(awaiting.results[0]._meta[ENGINE_NOTICE_META], 'cua: this session keeps the vendor engine: no approved cua engine (build aaaaaaaaaaaa built, awaiting approve); to use it, run `cua engine approve` with the owner at the console');
  const failed = await session(t, {home, engine: engineWith({buildFailure: {code: 'engine_identity_missing', cause: 'no signing identity is configured', failedAt: null}})});
  assert.equal(failed.results[0]._meta[ENGINE_NOTICE_META], 'cua: this session keeps the vendor engine: no approved cua engine (build failed: no signing identity is configured); fix that, then run `cua install --engine`, then `cua engine approve` with the owner at the console');
  // An explicit vendor engine is the owner's choice: no notice.
  const vendor = await session(t, {home, env: {CUA_NATIVE_ENGINE: 'vendor'}, engine: engineWith()});
  assert.equal(Object.hasOwn(vendor.results[0]._meta, ENGINE_NOTICE_META), false);
});

test('(2) no approved engine and no vendor runtime: the macOS computer open is refused with the runtime\'s words and the engine\'s reason and remedy', async t => {
  const s = shortScratch('cua-noruntime-');
  t.after(s.cleanup);
  const home = realpathSync(s.dir);
  const refused = await session(t, {home, engine: engineWith()});
  assert.equal(refused.error?.code, 'runtime_not_installed');
  assert.equal(refused.error.message, `no runtime is installed in ${home}, and cua's engine cannot serve macOS computer sessions instead: no approved cua engine (not built)`);
  assert.match(refused.error.hint, /^run `cua install`/, 'the runtime\'s own remedy first');
  assert.match(refused.error.hint, /; to use cua's engine, run `cua install --engine`, then `cua engine approve` with the owner at the console$/);
  // The same reason as the session line, for a build awaiting approve.
  const awaiting = await session(t, {home, engine: engineWith({pending: {build: 'a'.repeat(64), engineVersion: '0.3.0', bundlePath: '/e/pending/cua Engine.app', builtAt: null}})});
  assert.match(awaiting.error.message, /no approved cua engine \(build aaaaaaaaaaaa built, awaiting approve\)$/);
  assert.match(awaiting.error.hint, /; to use it, run `cua engine approve` with the owner at the console$/);
  // Explicit selections, a browser-only session and an approved engine keep the runtime's refusal as it was.
  const plain = `no runtime is installed in ${home}`;
  for (const [label, env, engine] of [
    ['CUA_NATIVE_ENGINE=cua', {CUA_NATIVE_ENGINE: 'cua'}, engineWith()],
    ['CUA_NATIVE_ENGINE=vendor', {CUA_NATIVE_ENGINE: 'vendor'}, engineWith()],
    ['CUA_REPL_HOST=cua', {CUA_REPL_HOST: 'cua'}, engineWith()],
    ['browser only', {CUA_SHIM_SURFACES: 'browser'}, engineWith()],
    ['an approved engine', {}, engineWith({installed: APP})],
  ]) {
    const other = await session(t, {home, env, engine});
    assert.equal(other.error?.code, 'runtime_not_installed', label);
    assert.equal(other.error.message, plain, label);
    assert.doesNotMatch(other.error.hint, /cua engine approve/, label);
  }
});

test('(3) a failed build while a previously approved build still serves: cua\'s engine serves the session, with no notice', async t => {
  const home = fakeInstalledHome(t, {host: DARWIN});
  const {launch, results, error} = await session(t, {home, engine: engineWith({installed: APP, buildFailure: {code: 'engine_build_failed', cause: 'Xcode is not installed (no swift)', failedAt: null}})});
  assert.ok(launch, error?.message);
  assert.deepEqual(launch.replHost, {host: 'cua', reason: 'cua_engine'});
  assert.deepEqual(launch.nativeEngine, {engine: 'cua', version: APP.engineVersion, build: APP.build});
  assert.equal(launch.env.CUA_ENGINE_APP, APP.bundlePath);
  for (const result of results) {
    assert.equal(Object.hasOwn(result._meta, ENGINE_NOTICE_META), false);
    assert.ok(!texts(result).some(text => text.includes('keeps the vendor engine')));
  }
});

test('(4) an approve after the fallback: the next connection drives cua\'s engine, with no notice', async t => {
  const home = fakeInstalledHome(t, {host: DARWIN});
  let approved = null;
  const engine = {...engineWith(), installed: () => approved, pending: () => (approved ? null : {build: APP.build, engineVersion: APP.engineVersion, bundlePath: '/e/pending/cua Engine.app', builtAt: null})};
  const before = await session(t, {home, engine});
  assert.deepEqual(before.launch.replHost, {host: 'vendor', reason: 'engine_not_installed'});
  assert.match(before.results[0]._meta[ENGINE_NOTICE_META], /built, awaiting approve\); to use it, run `cua engine approve`/);
  approved = APP;     // `cua engine approve` promoted the pending build and wrote approved.json
  const after = await session(t, {home, engine});
  assert.deepEqual(after.launch.replHost, {host: 'cua', reason: 'cua_engine'});
  assert.deepEqual(after.launch.nativeEngine, {engine: 'cua', version: APP.engineVersion, build: APP.build});
  assert.equal(Object.hasOwn(after.results[0]._meta, ENGINE_NOTICE_META), false);
});
