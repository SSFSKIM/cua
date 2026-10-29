// The native baseline's Linux engine lanes (#171, docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, The
// facade suites; M1b): a Linux computer run names its engine (--engine vendor|cua, on cua's own host, the only one Linux
// serves) and, on the cua lane, may name its binary (--engine-bin); the serve gets them as CUA_NATIVE_ENGINE and
// CUA_LINUX_ENGINE_BIN; the run judges which engine answered from the trusted worker's child, by its executable.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertEngineOptions, engineProblem} from '../../scripts/native-baseline/engine.mjs';
import {nativeEnvironment, preflightScript} from '../../scripts/native-baseline/remote.mjs';
import {linuxDevice, linuxEnginesScript} from '../../scripts/native-baseline/linux.mjs';
import {attestation} from '../../scripts/native-baseline/summary.mjs';

const BIN = '/Users/new/Developer/GitHub/cua-171/native/linux-engine/target/release/cua-engine';
const linux = {platform: 'linux', surface: 'computer', host: 'cua'};

test('a Linux computer run names its engine; --engine-bin is the cua lane\'s, an absolute path', () => {
  assertEngineOptions({...linux, engine: 'vendor'});
  assertEngineOptions({...linux, engine: 'cua'});
  assertEngineOptions({...linux, engine: 'cua', engineBin: BIN});
  assert.throws(() => assertEngineOptions(linux), /a Linux computer run needs --engine vendor\|cua/);
  assert.throws(() => assertEngineOptions({...linux, engine: 'sky'}), /needs --engine vendor\|cua/);
  assert.throws(() => assertEngineOptions({...linux, engine: 'vendor', engineBin: BIN}), /--engine-bin .*--engine cua/);
  assert.throws(() => assertEngineOptions({...linux, engine: 'cua', engineBin: 'cua-engine'}), /--engine-bin needs an absolute path/);
  assert.throws(() => assertEngineOptions({...linux, engine: 'cua', approvedEngine: '/x/cua Engine.app'}), /--approved-engine .*macOS/);
  assert.throws(() => assertEngineOptions({platform: 'darwin', surface: 'computer', host: 'cua', engine: 'cua', approvedEngine: '/x/cua Engine.app', engineBin: BIN}), /--engine-bin .*Linux/);
  assert.throws(() => assertEngineOptions({platform: 'linux', surface: 'browser', host: 'cua', engine: 'cua'}), /a linux browser run has none/);
});

test('the serve\'s environment carries the lane\'s engine, and its binary only when named', () => {
  const base = {home: '/h', userHome: '/u', host: 'cua', platform: 'linux', xSession: {DISPLAY: ':0'}};
  assert.match(nativeEnvironment({...base, engine: 'vendor'}), / CUA_NATIVE_ENGINE=vendor /);
  assert.doesNotMatch(nativeEnvironment({...base, engine: 'vendor'}), /CUA_LINUX_ENGINE_BIN/);
  assert.match(nativeEnvironment({...base, engine: 'cua', engineBin: BIN}), new RegExp(` CUA_NATIVE_ENGINE=cua CUA_LINUX_ENGINE_BIN='${BIN}' `));
  assert.throws(() => nativeEnvironment({...base, engine: 'vendor', engineBin: BIN}), /--engine cua/);
  // Without a prepared home the ambient one is cleared, so it never reaches a serve that did not name it.
  assert.match(nativeEnvironment({home: '/h', host: 'cua', platform: 'linux', display: ':0', engine: 'vendor'}), /-u CUA_LINUX_ENGINE_BIN /);
});

test('the Linux preflight reads the lane\'s expected engine on the device', () => {
  const script = preflightScript({host: 'cua', engine: 'cua', engineBin: BIN, display: ':0'});
  assert.match(script, /expectedEngine/);
  assert.ok(script.includes(JSON.stringify(BIN)));
});

test('linuxDevice.engines reads the engine processes below the run\'s serves', () => {
  const seen = [];
  const device = linuxDevice(script => { seen.push(script); return JSON.stringify([{pid: 7, exe: BIN, kind: 'cua', parent: 'trusted-worker.mjs'}]); }, {display: ':0', checkout: '/c/cua-parity'});
  assert.deepEqual(device.engines(), [{pid: 7, exe: BIN, kind: 'cua', parent: 'trusted-worker.mjs'}]);
  assert.equal(seen[0], linuxEnginesScript('/c/cua-parity'));
  assert.match(seen[0], /engineProcesses/);
});

const runMeta = (requested, extra = {}) => {
  const expected = requested === 'cua' ? BIN : '/s/run-x/runtimes/r/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64';
  return {platform: 'linux', host: 'cua', runtime: {release: '26.928.40906-linux-x64'}, service: {surface: 'computer', engine: 'sky', answered: 'vendor'},
    nativeEngine: {requested, bin: requested === 'cua' ? BIN : null, expected, error: null, observed: [{exe: expected, kind: requested, parent: 'trusted-worker.mjs'}], ...extra}};
};

test('engineProblem on Linux: the requested engine answered alone, at the expected executable, as the trusted worker\'s child', () => {
  assert.equal(engineProblem(runMeta('cua'), 'run-1'), null);
  assert.equal(engineProblem(runMeta('vendor'), 'run-1'), null);
  assert.match(engineProblem(runMeta('cua', {observed: []}), 'run-1'), /^run-1: no engine process answered/);
  assert.match(engineProblem(runMeta('cua', {observed: [{exe: '/x/sky_linux_x64', kind: 'vendor', parent: 'trusted-worker.mjs'}]}), 'run-1'), /sky_linux_x64 \(vendor\) answered, not the requested cua/);
  assert.match(engineProblem(runMeta('cua', {expected: null, error: 'no engine is installed at /h/engine/linux/cua-engine'}), 'run-1'), /no expected cua engine \(no engine is installed/);
  assert.equal(engineProblem({platform: 'linux', host: 'cua'}, 'run-1'), null, 'a Linux run from before the engine lanes records no engine');
});

test('a Linux run attests its engine by kind and source, never by a per-run path', () => {
  const vendor = attestation(runMeta('vendor')), cua = attestation(runMeta('cua'));
  assert.equal(vendor.engine, 'vendor (answered: sky_linux_x64 of the run\'s runtime)');
  assert.equal(cua.engine, `cua (answered: cua-engine named by --engine-bin ${BIN})`);
  assert.equal(attestation(runMeta('cua', {bin: null, expected: '/s/run-y/engine/linux/cua-engine', observed: [{exe: '/s/run-y/engine/linux/cua-engine', kind: 'cua', parent: 'trusted-worker.mjs'}]})).engine,
    'cua (answered: cua-engine installed in the run\'s home)');
  assert.equal(vendor.service, cua.service, 'the service is the same on both lanes until M3');
});
