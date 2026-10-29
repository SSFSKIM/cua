// Engine selection on Linux (#171; docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, "Selection,
// distribution and install" and Interfaces, Selection): nativeEngineFor resolves CUA_NATIVE_ENGINE, else engine.json's
// `engine`, else the default (`vendor`), with macOS's precedence, reasons and refusals; a `cua` selection carries the
// engine's path, the installed one or CUA_LINUX_ENGINE_BIN's (read only then), and a Linux computer launch hands it to
// the vendor service as OAI_SKY_LINUX_BIN; the scoped preflight protects it. The device mode resolves beside it. Every
// home and HOME here is a scratch directory: the account's engine.json and engine are never read.
import './helpers/scratch-home.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, mkdirSync, realpathSync, symlinkSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {buildLaunch, desktopModeFor, nativeEngineFor, replHostFor, SKY_SERVICE} from '../src/runtime/launch.mjs';
import {parsePin, runtimeFor} from '../src/runtime/manifest.mjs';
import {assertSandboxFits} from '../src/runtime/sandbox.mjs';
import {scratch, linuxFixturePin} from './fixtures/runtime-fixture.mjs';

const SESSION = '6f1c2d3e-0000-4000-8000-000000000171';
const NODE = '/opt/node-24/bin/node';
const ownNode = () => NODE;

function cuaHome(t) {
  const s = scratch('cua-linux-select-');
  t.after(s.cleanup);
  const dir = realpathSync(s.dir);
  const home = join(dir, 'home');
  mkdirSync(home);
  return {dir, home, user: join(dir, 'user')};
}
// An executable file standing in for cua-engine at `path`.
function engineAt(path) {
  mkdirSync(join(path, '..'), {recursive: true});
  writeFileSync(path, '#!/bin/sh\n', {mode: 0o755});
  return path;
}
const installedIn = home => engineAt(join(home, 'engine', 'linux', 'cua-engine'));
const select = (home, env, options = {}) => nativeEngineFor({env, platform: 'linux', home, ...options});

test('the default is the vendor engine; CUA_NATIVE_ENGINE and engine.json select as on macOS, an unknown value refused', t => {
  const {home, user} = cuaHome(t);
  assert.deepEqual(select(home, {HOME: user}), {engine: 'vendor', reason: 'default', status: 'pass'});
  assert.deepEqual(select(home, {HOME: user, CUA_NATIVE_ENGINE: 'vendor'}), {engine: 'vendor', reason: 'explicit', status: 'pass'});
  assert.deepEqual(select(home, {HOME: user, CUA_NATIVE_ENGINE: ''}), {engine: 'vendor', reason: 'default', status: 'pass'}, 'empty reads as unset');
  assert.throws(() => select(home, {HOME: user, CUA_NATIVE_ENGINE: 'sky'}), {code: 'invalid_setting', message: 'CUA_NATIVE_ENGINE must be vendor or cua'});
  mkdirSync(join(user, '.config', 'cua'), {recursive: true});
  writeFileSync(join(user, '.config', 'cua', 'engine.json'), JSON.stringify({engine: 'vendor'}));
  assert.deepEqual(select(home, {HOME: user}), {engine: 'vendor', reason: 'settings', status: 'pass'});
  writeFileSync(join(user, '.config', 'cua', 'engine.json'), JSON.stringify({engine: 'other'}));
  assert.throws(() => select(home, {HOME: user}), error => error.code === 'invalid_setting' && /"engine" in .*engine\.json must be vendor or cua/.test(error.message));
  writeFileSync(join(user, '.config', 'cua', 'engine.json'), '[');
  assert.throws(() => select(home, {HOME: user}), {code: 'invalid_setting'});
});

test('cua\'s engine needs one installed in the cua home: refused without it when set, carried by path with it', t => {
  const {home, user} = cuaHome(t);
  const path = join(home, 'engine', 'linux', 'cua-engine');
  for (const [env, source] of [[{CUA_NATIVE_ENGINE: 'cua'}, /^CUA_NATIVE_ENGINE=cua selects/], [{}, /^"engine": "cua" in ~\/\.config\/cua\/engine\.json selects/]]) {
    const config = env.CUA_NATIVE_ENGINE ? () => ({}) : () => ({engine: 'cua'});
    assert.throws(() => select(home, {HOME: user, ...env}, {config}), error => error.code === 'engine_not_installed' && source.test(error.message)
      && error.message.includes(path) && /cua install --engine/.test(error.message) && /cua engine build/.test(error.message) && /CUA_NATIVE_ENGINE=vendor/.test(error.message));
  }
  installedIn(home);
  assert.deepEqual(select(home, {HOME: user, CUA_NATIVE_ENGINE: 'cua'}), {engine: 'cua', reason: 'explicit', status: 'pass', bin: {path, source: 'installed'}});
  assert.deepEqual(select(home, {HOME: user}, {config: () => ({engine: 'cua'})}).reason, 'settings');
  chmodSync(path, 0o644);
  if (process.getuid?.() !== 0) assert.throws(() => select(home, {HOME: user, CUA_NATIVE_ENGINE: 'cua'}), {code: 'engine_not_installed'}, 'a file sessions could not run is no engine');
});

// After M5 flips the default, a home without the engine keeps the vendor's with a warning, as on macOS until M6.
test('a default cua engine with none installed keeps the vendor engine with a warning', t => {
  const {home, user} = cuaHome(t);
  assert.deepEqual(select(home, {HOME: user}, {defaultEngine: 'cua'}), {engine: 'vendor', reason: 'engine_not_installed', status: 'warn'});
  installedIn(home);
  assert.deepEqual(select(home, {HOME: user}, {defaultEngine: 'cua'}).engine, 'cua');
});

test('CUA_LINUX_ENGINE_BIN names the engine only when the selection is cua: absolute, an executable file, or refused', t => {
  const {dir, home, user} = cuaHome(t);
  const built = engineAt(join(dir, 'checkout', 'target', 'release', 'cua-engine'));
  assert.deepEqual(select(home, {HOME: user, CUA_LINUX_ENGINE_BIN: 'relative/cua-engine'}), {engine: 'vendor', reason: 'default', status: 'pass'}, 'not read for the vendor engine');
  assert.deepEqual(select(home, {HOME: user, CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: built}), {engine: 'cua', reason: 'explicit', status: 'pass', bin: {path: built, source: 'override'}},
    'no engine need be installed');
  installedIn(home);
  assert.equal(select(home, {HOME: user, CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: built}).bin.path, built, 'it wins over the installed one');
  assert.equal(select(home, {HOME: user, CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: ''}).bin.source, 'installed', 'empty reads as unset');
  assert.throws(() => select(home, {HOME: user, CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: 'target/cua-engine'}), {code: 'invalid_setting', message: 'CUA_LINUX_ENGINE_BIN must be an absolute path'});
  assert.throws(() => select(home, {HOME: user, CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: join(dir, 'absent')}),
    error => error.code === 'engine_not_installed' && error.message.includes(join(dir, 'absent')) && /CUA_LINUX_ENGINE_BIN/.test(error.message));
});

test('replHostFor carries a Linux computer session\'s engine, resolved before Node; a browser-only session resolves none', t => {
  const {home, user} = cuaHome(t);
  const ambient = {HOME: user, CUA_NATIVE_ENGINE: 'cua'};
  let asked = 0;
  const node = () => { asked++; return NODE; };
  assert.throws(() => replHostFor({platform: 'linux', surfaces: ['computer'], ambient, home, resolveOwnNode: node}), {code: 'engine_not_installed'});
  assert.equal(asked, 0, 'the engine refuses before Node is asked for');
  const browser = replHostFor({platform: 'linux', surfaces: ['browser'], ambient, home, resolveOwnNode: node});
  assert.deepEqual(browser, {host: 'cua', reason: 'linux', node: NODE});
  const path = installedIn(home);
  const engine = {engine: 'cua', reason: 'explicit', status: 'pass', bin: {path, source: 'installed'}};
  assert.deepEqual(replHostFor({platform: 'linux', surfaces: ['computer', 'browser'], ambient, home, resolveOwnNode: node}), {host: 'cua', reason: 'linux', node: NODE, engine});
  assert.deepEqual(replHostFor({platform: 'linux', surfaces: ['computer'], ambient: {...ambient, CUA_REPL_HOST: 'cua'}, home, resolveOwnNode: node}), {host: 'cua', reason: 'explicit', node: NODE, engine});
  assert.deepEqual(replHostFor({platform: 'linux', surfaces: ['computer'], ambient: {HOME: user}, home, resolveOwnNode: node}).engine, {engine: 'vendor', reason: 'default', status: 'pass'});
  assert.throws(() => replHostFor({platform: 'linux', surfaces: ['computer'], ambient: {...ambient, CUA_REPL_HOST: 'vendor'}, home, resolveOwnNode: node}), {code: 'repl_host_refused'}, 'the vendor host stays refused first');
  // The engine inputs reach the selection, as doctor and the tests pass them.
  assert.equal(replHostFor({platform: 'linux', surfaces: ['computer'], ambient: {HOME: user}, home, resolveOwnNode: node, engine: {config: () => ({engine: 'cua'})}}).engine.reason, 'settings');
  assert.throws(() => replHostFor({platform: 'linux', surfaces: ['computer'], ambient: {HOME: user}, home, resolveOwnNode: node, engine: {config: () => ({engine: 'cua'}), installed: () => null}}), {code: 'engine_not_installed'});
});

function linuxRuntime(home) {
  return runtimeFor({home, pin: parsePin(linuxFixturePin({arch: 'x64', sha256: 'a'.repeat(64), length: 1})), record: null});
}
const AMBIENT = {HOME: '/home/u', USER: 'u', PATH: '/usr/bin', DISPLAY: ':0'};

test('a Linux computer launch with cua\'s engine runs it behind the vendor service: OAI_SKY_LINUX_BIN is the engine', t => {
  const {dir, home} = cuaHome(t);
  const runtime = linuxRuntime(home);
  const launch = ambient => buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, ...ambient}, services: {sky: SKY_SERVICE}, resolveOwnNode: ownNode});
  const vendor = launch({});
  assert.equal(vendor.env.OAI_SKY_LINUX_BIN, runtime.paths.skyLinuxBin, 'the default is today\'s path');
  assert.equal(vendor.linuxEngine, null);
  const path = installedIn(home);
  const cua = launch({CUA_NATIVE_ENGINE: 'cua'});
  assert.equal(cua.env.OAI_SKY_LINUX_BIN, path);
  assert.equal(cua.env.CUA_SKY_SERVICE, runtime.paths.skyVendorService, 'the vendor service until M3');
  assert.deepEqual(cua.linuxEngine, {path, source: 'installed'});
  assert.equal(cua.engineRoot, join(home, 'engine'), 'the engine directory, which the scoped preflight protects');
  assert.equal(cua.nativeEngine, null);
  for (const name of ['CUA_NATIVE_ENGINE', 'CUA_LINUX_ENGINE_BIN']) assert.equal(name in cua.env, false, `${name} is the proxy's alone`);
  const built = engineAt(join(dir, 'checkout', 'cua-engine'));
  assert.equal(launch({CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: built}).env.OAI_SKY_LINUX_BIN, built);
  assert.equal(launch({CUA_LINUX_ENGINE_BIN: built}).env.OAI_SKY_LINUX_BIN, runtime.paths.skyLinuxBin, 'the override is read only for cua\'s engine');
  // A selection the connection resolved once is what every launch of it runs.
  const resolved = replHostFor({platform: 'linux', surfaces: ['computer'], ambient: {...AMBIENT, CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: built}, home, resolveOwnNode: ownNode});
  assert.equal(buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, services: {sky: SKY_SERVICE}, replHost: resolved}).env.OAI_SKY_LINUX_BIN, built);
});

test('scoped: an engine cells could write is refused before anything starts, the home\'s engine directory or the one CUA_LINUX_ENGINE_BIN names', t => {
  const {home} = cuaHome(t);
  const runtime = linuxRuntime(home);
  const launch = ambient => buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, ...ambient}, services: {sky: SKY_SERVICE}, resolveOwnNode: ownNode});
  installedIn(home);
  assertSandboxFits('scoped', launch({CUA_NATIVE_ENGINE: 'cua'}));
  const planted = engineAt(join(home, 'run', SESSION, 'cua-engine'));
  const inRun = launch({CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: planted});
  assert.throws(() => assertSandboxFits('scoped', inRun), error => error.code === 'sandbox_conflict' && /Linux engine/.test(error.message));
  assertSandboxFits('default', inRun);
});

test('a home whose engine directory leads into a write root is refused under scoped', t => {
  const {home} = cuaHome(t);
  const runtime = linuxRuntime(home);
  mkdirSync(join(home, 'run', SESSION), {recursive: true});
  symlinkSync(join(home, 'run', SESSION), join(home, 'engine'));
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, services: {sky: SKY_SERVICE}, resolveOwnNode: ownNode});
  assert.throws(() => assertSandboxFits('scoped', launch), error => error.code === 'sandbox_conflict' && /Linux engine/.test(error.message));
});

test('the device mode: CUA_DESKTOP_MODE, else engine.json\'s desktop, else shared; any other value refused', () => {
  const none = () => ({});
  assert.deepEqual(desktopModeFor({env: {}, config: none}), {mode: 'shared', reason: 'default'});
  assert.deepEqual(desktopModeFor({env: {CUA_DESKTOP_MODE: ''}, config: () => ({desktop: 'dedicated'})}), {mode: 'dedicated', reason: 'settings'});
  assert.deepEqual(desktopModeFor({env: {CUA_DESKTOP_MODE: 'shared'}, config: () => ({desktop: 'dedicated'})}), {mode: 'shared', reason: 'explicit'});
  assert.throws(() => desktopModeFor({env: {CUA_DESKTOP_MODE: 'private'}, config: none}), {code: 'invalid_setting', message: 'CUA_DESKTOP_MODE must be shared or dedicated'});
  assert.throws(() => desktopModeFor({env: {HOME: '/h'}, config: () => ({desktop: true})}), {code: 'invalid_setting', message: '"desktop" in /h/.config/cua/engine.json must be shared or dedicated'});
});
