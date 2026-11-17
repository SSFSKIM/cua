// The Linux native suite's engine lanes (#171, docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, The facade
// suites; M1b): `--engine vendor|cua` with `--host cua`, and `--engine-bin <absolute path>` with `--engine cua`, on a
// declared Linux device; the native command forwards them to the device's serve as CUA_NATIVE_ENGINE and
// CUA_LINUX_ENGINE_BIN. Nothing reaches a device.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSelection, assertNativeEngine, assertPreparationServes} from '../../scripts/repl-parity.mjs';
import {nativeCommand} from '../../scripts/repl-parity/native.mjs';
import {DEVICES} from '../../scripts/repl-parity/devices.mjs';

const run = (...rest) => parseSelection(['run', '--device', 'cua-171', '--host', 'cua', '--suite', 'native', '--out', '/nowhere', ...rest]);
const BIN = '/Users/new/Developer/GitHub/cua-171/native/linux-engine/target/release/cua-engine';

test('the #171 VMs are declared Linux devices', () => {
  assert.equal(DEVICES['cua-171'].platform, 'linux');
  assert.equal(DEVICES['cua-171-arm64'].platform, 'linux');
});

test('parseSelection: a Linux native run names its engine, with cua\'s host, and the cua lane may name its binary', () => {
  assert.equal(run('--engine', 'vendor').v.engine, 'vendor');
  assert.equal(run('--engine', 'cua').v.engine, 'cua');
  assert.equal(run('--engine', 'cua', '--engine-bin', BIN).v['engine-bin'], BIN);
  assert.equal(parseSelection(['run', '--device', 'cua-gce', '--host', 'cua', '--suite', 'all', '--engine', 'cua', '--out', '/x']).v.engine, 'cua');
  assert.throws(() => run('--engine', 'sky'), /--engine vendor\|cua/);
  assert.throws(() => run('--engine', 'vendor', '--engine-bin', BIN), /--engine-bin .*--engine cua/);
  assert.throws(() => run('--engine-bin', BIN), /--engine-bin .*--engine cua/);
  assert.throws(() => run('--engine', 'cua', '--engine-bin', 'relative/cua-engine'), /absolute/);
  assert.throws(() => parseSelection(['run', '--device', 'cua-171', '--host', 'vendor', '--suite', 'native', '--engine', 'cua', '--out', '/x']), /--host cua/);
});

test('parseSelection: the Linux engine options belong to a Linux run of the native cases, nowhere else', () => {
  assert.throws(() => parseSelection(['run', '--device', 'cua-171', '--host', 'cua', '--suite', 'cells', '--engine', 'cua', '--out', '/x']), /native-mac.*--suite native/s);
  assert.throws(() => parseSelection(['run', '--device', 'mini', '--host', 'cua', '--suite', 'native', '--engine', 'cua', '--out', '/x']), /native-mac.*--suite native/s);
  assert.throws(() => parseSelection(['diff', 'a', 'b', '--engine', 'cua']), /native-mac/);
  assert.throws(() => parseSelection(['prepare', '--device', 'cua-171', '--commit', 'abc1234', '--engine-bin', BIN]), /--engine-bin/);
});

test('assertNativeEngine: a run whose selection holds native cases names its engine', () => {
  const native = [{id: 'native/cua/computer', backend: 'native'}], cells = [{id: 'cells/x', backend: 'no-services'}];
  assert.doesNotThrow(() => assertNativeEngine(native, {engine: 'vendor'}));
  assert.doesNotThrow(() => assertNativeEngine(cells, {}));
  assert.throws(() => assertNativeEngine(native, {}), /names its engine: --engine vendor\|cua/);
});

test('nativeCommand forwards the lane\'s engine to the device\'s serve, explicitly, and its binary only on the cua lane', () => {
  const facts = {device: 'cua-171', platform: 'linux', host: 'cua', checkout: '/c', home: '/h'};
  const script = c => c.args.at(-1);
  assert.match(script(nativeCommand({...facts, engine: 'vendor'})), / CUA_NATIVE_ENGINE='vendor' CUA_LINUX_ENGINE_BIN='' node test\/repl-parity\/serve-native\.mjs$/, 'an ambient override never reaches the vendor lane');
  assert.match(script(nativeCommand({...facts, engine: 'cua', engineBin: BIN})), new RegExp(` CUA_NATIVE_ENGINE='cua' CUA_LINUX_ENGINE_BIN='${BIN}' node test/repl-parity/serve-native\\.mjs$`));
  assert.throws(() => nativeCommand(facts), /names its engine/);
  assert.throws(() => nativeCommand({...facts, engine: 'vendor', engineBin: BIN}), /--engine cua only/);
  assert.throws(() => nativeCommand({...facts, engine: 'cua', engineBin: 'cua-engine'}), /absolute/);
});

// #171 M4 (T18): `prepare --native-only` prepares a declared Linux device for the native suite alone (no profile is
// listed or bound), and a run takes such a preparation only for the native suite.
test('a native-only preparation is a Linux prepare, and serves the native suite alone', () => {
  const prepare = (...rest) => parseSelection(['prepare', '--commit', 'abcdef1', ...rest]);
  assert.equal(prepare('--device', 'cua-171', '--native-only').v['native-only'], true);
  assert.throws(() => prepare('--device', 'cua-171', '--native-only', '--profile', 'me'), /--native-only/);
  assert.throws(() => prepare('--device', 'mini', '--native-only'), /--native-only/);
  assert.throws(() => run('--engine', 'cua', '--native-only'), /--native-only/);
  assert.doesNotThrow(() => assertPreparationServes({nativeOnly: true}, 'native'));
  assert.doesNotThrow(() => assertPreparationServes({profile: 'me'}, 'all'));
  for (const suite of ['all', 'cells', 'api']) assert.throws(() => assertPreparationServes({nativeOnly: true}, suite), /native-only/);
});
