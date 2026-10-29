import './helpers/scratch-home.mjs'; // first: nothing here may read the account's engine settings
// cua doctor's `engine` row on Linux (#171; docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, "Doctor",
// acceptance 1's engine row and 9): the engine sessions here run, its version and SHA-256 against this cua's pin, a
// local build or an unknown file said as such, the device mode, and why cua's engine is not in use when it is not. The
// placed engine's inspection is a stub here (src/runtime/linux-engine.mjs inspectLinuxEngine has its own tests), but
// for the one test that runs doctor whole over a scratch home.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, realpathSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {engineCheck} from '../src/runtime/doctor-engine.mjs';
import {inspectRuntime} from '../src/runtime/doctor.mjs';
import {replHostFor} from '../src/runtime/launch.mjs';
import {CuaError} from '../src/runtime/errors.mjs';
import {surfacesFrom} from '../src/mcp/surface.mjs';
import {scratch} from './fixtures/runtime-fixture.mjs';

const HOME = '/home/u/.local/share/cua';
const PATH = `${HOME}/engine/linux/cua-engine`;
const SHA = 'a'.repeat(64);
const PINNED = {version: '0.1.0', release: 'linux-engine-v0.1.0', sha256: SHA};
const facts = over => ({path: PATH, exists: true, executable: true, sha256: SHA, build: 'pinned', version: '0.1.0', release: 'linux-engine-v0.1.0', pinned: PINNED, current: true, ...over});
const NONE = facts({exists: false, executable: false, sha256: null, build: null, version: null, release: null, current: false});

// The row for `env` on Linux, with the selection computed as doctor computes it (replHostFor with the same inputs).
async function row(env = {}, {read = facts(), config = {}, defaultEngine = 'vendor', installed} = {}) {
  const fullEnv = {HOME: '/nonexistent-home', CUA_SHIM_SURFACES: 'computer,browser', ...env};
  const engine = {defaultEngine, config: () => config, installed: () => (installed ?? read.executable) ? {path: read.path} : null};
  let session;
  try { session = replHostFor({platform: 'linux', surfaces: surfacesFrom(fullEnv.CUA_SHIM_SURFACES), ambient: fullEnv, home: HOME, resolveOwnNode: () => '/usr/bin/node', engine}); } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    session = {code: error.code, message: error.message};
  }
  const reads = [];
  const result = await engineCheck({env: fullEnv, platform: 'linux', arch: 'x64', home: HOME, session, engine, inspectLinux: options => { reads.push(options); return read; }});
  return {...result, reads};
}

test('cua\'s engine selected and the pinned one installed: pass, with its version, release, hash and the device mode', async () => {
  const {row: check, report, reads} = await row({CUA_NATIVE_ENGINE: 'cua'});
  assert.equal(check.name, 'engine');
  assert.equal(check.status, 'pass', check.detail);
  assert.equal(check.detail, `cua's engine is selected (CUA_NATIVE_ENGINE=cua): sessions here run the pinned cua-engine 0.1.0 (linux-engine-v0.1.0) at ${PATH}, SHA-256 ${SHA}, `
    + 'behind the vendor\'s service until cua\'s own; device mode shared (the default: CUA_DESKTOP_MODE=dedicated, or "desktop": "dedicated" in ~/.config/cua/engine.json, gives the agent the desktop)');
  assert.deepEqual(reads, [{home: HOME, arch: 'x64'}]);
  assert.deepEqual(report, {selected: 'cua', reason: 'explicit', refused: null, preferred: {engine: 'cua', reason: 'explicit'}, runs: {path: PATH, source: 'installed'},
    installed: {path: PATH, exists: true, executable: true, sha256: SHA, version: '0.1.0', build: 'pinned', release: 'linux-engine-v0.1.0', current: true},
    pinned: PINNED, desktop: {mode: 'shared', reason: 'default'}});
});

test('an engine that is not this cua\'s pinned one is flagged: a local build or an older release warns, an unknown file fails', async () => {
  const local = await row({CUA_NATIVE_ENGINE: 'cua'}, {read: facts({build: 'local', version: '0.2.0', release: null, sha256: 'b'.repeat(64), current: false})});
  assert.equal(local.row.status, 'warn');
  assert.match(local.row.detail, /a local build of cua-engine 0\.2\.0 at .*\(cua engine build\), SHA-256 b{64}, not the pinned engine \(0\.1\.0; cua install --engine puts it back\)/);
  assert.equal(local.report.installed.build, 'local');
  const older = await row({CUA_NATIVE_ENGINE: 'cua'}, {read: facts({version: '0.0.9', release: 'linux-engine-v0.0.9', sha256: 'c'.repeat(64), current: false})});
  assert.equal(older.row.status, 'warn');
  assert.match(older.row.detail, /cua-engine 0\.0\.9 from linux-engine-v0\.0\.9 at .*, which is not this cua's pinned 0\.1\.0: cua install --engine replaces it/);
  const unknown = await row({CUA_NATIVE_ENGINE: 'cua'}, {read: facts({build: 'unknown', version: null, release: null, sha256: 'd'.repeat(64), current: false})});
  assert.equal(unknown.row.status, 'fail');
  assert.match(unknown.row.detail, /the file at .* \(SHA-256 d{64}\) is neither this cua's pinned engine nor a build cua recorded: cua install --engine replaces it/);
  // Before the first release there is no pin to compare with: said, and a warning.
  const unpinned = await row({CUA_NATIVE_ENGINE: 'cua'}, {read: facts({build: 'local', version: '0.1.0', release: null, pinned: null, current: false})});
  assert.equal(unpinned.row.status, 'warn');
  assert.match(unpinned.row.detail, /a local build of cua-engine 0\.1\.0 .*not the pinned engine \(this cua pins none yet\)/);
});

test('CUA_LINUX_ENGINE_BIN is named as what sessions run, a harness setting, beside what is installed', async t => {
  const s = scratch();
  t.after(s.cleanup);
  const built = join(realpathSync(s.dir), 'cua-engine');
  writeFileSync(built, '#!/bin/sh\n', {mode: 0o755});
  const {row: check, report} = await row({CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: built});
  assert.equal(check.status, 'warn');
  assert.ok(check.detail.startsWith(`cua's engine is selected (CUA_NATIVE_ENGINE=cua): sessions here run ${built}, which CUA_LINUX_ENGINE_BIN names in place of the installed engine `
    + '(a harness setting), behind the vendor\'s service until cua\'s own; installed: the pinned cua-engine 0.1.0'), check.detail);
  assert.deepEqual(report.runs, {path: built, source: 'override'});
  assert.equal(report.installed.path, PATH, 'what the home holds, apart from what runs');
});

test('the device mode set in either place is reported; an invalid one fails the row', async () => {
  assert.match((await row({CUA_NATIVE_ENGINE: 'cua', CUA_DESKTOP_MODE: 'dedicated'})).row.detail, /; device mode dedicated \(CUA_DESKTOP_MODE=dedicated\)$/);
  assert.match((await row({CUA_NATIVE_ENGINE: 'cua'}, {config: {desktop: 'dedicated'}})).row.detail, /; device mode dedicated \("desktop": "dedicated" in ~\/\.config\/cua\/engine\.json\)$/);
  const invalid = await row({CUA_NATIVE_ENGINE: 'cua', CUA_DESKTOP_MODE: 'mine'});
  assert.equal(invalid.row.status, 'fail');
  assert.match(invalid.row.detail, /; CUA_DESKTOP_MODE must be shared or dedicated$/);
  assert.equal(invalid.report.desktop, null);
});

test('the vendor engine preferred: skip, saying how to select cua\'s and what this home holds', async () => {
  const {row: check, report, reads} = await row({}, {read: NONE});
  assert.equal(check.status, 'skip');
  assert.equal(check.detail, 'cua\'s engine is not selected: the default engine is the vendor\'s, so Linux computer sessions use the vendor\'s sky_linux helper. '
    + `CUA_NATIVE_ENGINE=cua, or "engine": "cua" in ~/.config/cua/engine.json, selects cua's own: no engine is installed in this cua home (${PATH}): cua install --engine installs the pinned cua-engine 0.1.0 (linux-engine-v0.1.0)`);
  assert.equal(reads.length, 1);
  assert.deepEqual([report.selected, report.preferred, report.runs, report.installed.exists], ['vendor', {engine: 'vendor', reason: 'default'}, null, false]);
  const unpinned = await row({CUA_NATIVE_ENGINE: 'vendor'}, {read: {...NONE, pinned: null}});
  assert.match(unpinned.row.detail, /^cua's engine is not selected: CUA_NATIVE_ENGINE=vendor, .*no engine is installed in this cua home \(.*\), and this cua pins none yet \(runtime\/engine\/linux-engine\.json comes with the engine's first release\): cua engine build installs a local build$/);
});

test('cua\'s engine preferred but not in use: refused sessions fail, the default\'s fallback warns', async () => {
  const refused = await row({CUA_NATIVE_ENGINE: 'cua'}, {read: NONE});
  assert.equal(refused.row.status, 'fail');
  assert.match(refused.row.detail, /^cua's engine is preferred \(CUA_NATIVE_ENGINE=cua\), but sessions here are refused \(engine_not_installed; see repl\.host\): no engine is installed in this cua home/);
  assert.deepEqual([refused.report.selected, refused.report.refused.code], [null, 'engine_not_installed']);
  const fallback = await row({}, {read: NONE, defaultEngine: 'cua'});
  assert.equal(fallback.row.status, 'warn');
  assert.match(fallback.row.detail, /^cua's engine is the default, but none is installed, so Linux computer sessions keep the vendor's sky_linux helper \(engine_not_installed\): no engine is installed/);
  const invalid = await row({CUA_NATIVE_ENGINE: 'sky'});
  assert.equal(invalid.row.status, 'fail');
  assert.match(invalid.row.detail, /^CUA_NATIVE_ENGINE must be vendor or cua; every Linux computer session is refused \(invalid_setting\)$/);
});

test('without the computer surface, or with every connection refused, no engine applies', async () => {
  assert.equal((await row({CUA_SHIM_SURFACES: 'browser'})).row.status, 'skip');
  const none = await engineCheck({env: {CUA_SHIM_SURFACES: 'computer'}, platform: 'linux', arch: 'x64', home: HOME, session: undefined, inspectLinux: () => assert.fail('not read')});
  assert.equal(none.row.status, 'skip');
});

// The whole of doctor over a scratch home with a placed engine: the row the engine's inspection gives, read through the
// home doctor names, and repl.host's sentence naming no engine on Linux (the host is cua's whatever the engine).
test('doctor on Linux reports the placed engine through its own inspection, and repl.host names no engine', async t => {
  const s = scratch();
  t.after(s.cleanup);
  const home = realpathSync(s.dir);
  mkdirSync(join(home, 'engine', 'linux'), {recursive: true});
  writeFileSync(join(home, 'engine', 'linux', 'cua-engine'), '#!/bin/sh\n', {mode: 0o755});
  const stubs = {inspectHelper: async () => ({socket: '/x', holders: []}), inspectSecrets: async () => ({dir: '/none', exists: false}), inspectAgent: async () => [],
    inspectChrome: async () => [], inspectLinux: async () => [], verifySignatures: async () => [], linuxHelper: () => ({path: '/h', sha256: SHA})};
  const report = await inspectRuntime({home, host: {platform: 'linux', arch: 'x64'}, env: {CUA_NATIVE_ENGINE: 'cua', CUA_SHIM_SURFACES: 'computer'}, resolveOwnNode: () => '/usr/bin/node',
    engine: {config: () => ({})}, ...stubs});
  const engine = report.checks.find(c => c.name === 'engine');
  assert.notEqual(engine.status, 'skip', engine.detail);
  assert.deepEqual(report.engine.runs, {path: join(home, 'engine', 'linux', 'cua-engine'), source: 'installed'});
  assert.equal(report.engine.installed.exists, true);
  assert.equal(report.engine.installed.build, 'unknown', 'neither the pinned bytes nor a recorded build');
  const host = report.checks.find(c => c.name === 'repl.host');
  assert.match(host.detail, /^cua host \(linux\) on Node \/usr\/bin\/node: /);
  assert.doesNotMatch(host.detail, /native engine/);
});
