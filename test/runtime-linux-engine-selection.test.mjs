// Engine selection on Linux (#171; docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, "Selection,
// distribution and install" and Interfaces, Selection; M6a's pre-flight, §3.3 and §3.4; M6b's pre-flight, §2.1):
// nativeEngineFor resolves CUA_NATIVE_ENGINE, else engine.json's `engine`, else the default (cua's), with macOS's
// precedence and reasons. A `cua` selection carries the engine's path, the installed one at or above MIN_ENGINE_VERSION
// by a record of its own bytes, or CUA_LINUX_ENGINE_BIN's (read only then); anything else is refused at the open, under
// the default as under an explicit setting (F2, F3). A `vendor` selection is refused as engine_retired (M6b), by its
// sources, whatever the home holds. Every refusal ends with the one install command, after the prerequisite of the source
// that selected it, and carries a hint that holds no command. No lookup of either engine is ever led into the vendor's
// tree. A Linux computer launch hands cua's engine to cua's own Linux service (M3) as CUA_ENGINE_BIN, with the device
// mode as CUA_DESKTOP_MODE; the scoped preflight protects it.
// Every home and HOME here is a scratch directory: the account's engine.json and engine are never read.
import './helpers/scratch-home.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chmodSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {buildLaunch, defaultNativeEngine, desktopModeFor, nativeEngineFor, replHostFor, LINUX_ENGINE_SERVICE, SKY_SERVICE, VENDOR_ENGINE_RETIRED_IN} from '../src/runtime/launch.mjs';
import {engineVersionOf, isOlder, MIN_ENGINE_VERSION} from '../src/services/engine/linux/client.mjs';
import {REPO, forgeActiveRuntime} from './fixtures/runtime-fixture.mjs';
import {CUA_ENTRY, resolveRuntime} from '../src/runtime/manifest.mjs';
import {ENGINE_HINT} from '../src/runtime/installer.mjs';
import {assertSandboxFits} from '../src/runtime/sandbox.mjs';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {fakeModuleTree} from './fixtures/own-linux-runtime.mjs';
import {inVendorTree, recorded} from './helpers/vendor-tree-recorder.mjs';

const SESSION = '6f1c2d3e-0000-4000-8000-000000000171';
const NODE = '/opt/node-24/bin/node';
const ownNode = () => NODE;
const LINUX = {platform: 'linux', arch: 'x64'};
// The installer every refusal names: this cua's own, by its absolute path (manifest.mjs ownInstaller).
const INSTALLER = `node ${CUA_ENTRY} install`;
// The end of every engine refusal (M6b's pre-flight, §2.1): the one command, after the source's prerequisite.
const RUN = `run \`${INSTALLER} --engine\``;
// The hint every engine refusal carries, which holds no command.
const HINT = 'a `cua` from another checkout installs that checkout\'s engine, not this one\'s';
// engine_retired's sentence by its sources, in precedence order (§2.1).
const RETIRED = 'which cua 0.30.0 removed from Linux, where cua\'s own engine (CUA_NATIVE_ENGINE=cua, the default) is the only one';
const retired = (settings, {env = false, file = false}) => (env && file
  ? `CUA_NATIVE_ENGINE=vendor and "engine": "vendor" in ${settings} select the vendor's engine, ${RETIRED}: unset CUA_NATIVE_ENGINE and remove "engine" from ${settings}, then ${RUN}`
  : env ? `CUA_NATIVE_ENGINE=vendor selects the vendor's engine, ${RETIRED}: unset CUA_NATIVE_ENGINE, then ${RUN}`
    : `"engine": "vendor" in ${settings} selects the vendor's engine, ${RETIRED}: remove "engine" from ${settings}, then ${RUN}`);
const settingsOf = user => join(user, '.config', 'cua', 'engine.json');
function writeSettings(user, value) {
  mkdirSync(dirname(settingsOf(user)), {recursive: true});
  writeFileSync(settingsOf(user), typeof value === 'string' ? value : JSON.stringify(value));
  return settingsOf(user);
}
// The refusal `run` throws -> {code, message, hint}.
function refusalOf(run) {
  try { run(); } catch (error) { return {code: error.code, message: error.message, hint: error.hint}; }
  return assert.fail('not refused');
}

function cuaHome(t) {
  const s = scratch('cua-linux-select-');
  t.after(s.cleanup);
  const dir = realpathSync(s.dir);
  const home = join(dir, 'home');
  mkdirSync(home);
  return {dir, home, user: join(dir, 'user')};
}
// An executable file standing in for cua-engine at `path`, with no record of what it is, answering --version as
// `version` would (an override's version is read at the open: fix wave 1), or printing `line` instead.
function engineAt(path, {version = MIN_ENGINE_VERSION, line = `cua-engine ${version} (0123456789ab)`} = {}) {
  mkdirSync(join(path, '..'), {recursive: true});
  writeFileSync(path, `#!/bin/sh\necho "${line}"\n`, {mode: 0o755});
  return path;
}
// The engine `cua install` would leave in the directory `dir` at `version`: an executable and its install.json, whose
// SHA-256 is the file's unless `recordOf` names other bytes (an interrupted downgrade: the older file beside the newer
// record). `build` is the record's (`local` for `cua engine build`'s).
function recordedAt(dir, version, {recordOf, build = 'pinned'} = {}) {
  const bytes = `#!/bin/sh\necho "cua-engine ${version} (0123456789ab)"\n`;
  const path = engineAt(join(dir, 'cua-engine'));
  writeFileSync(path, bytes, {mode: 0o755});
  const sha256 = createHash('sha256').update(recordOf ?? bytes).digest('hex');
  writeFileSync(join(dir, 'install.json'), JSON.stringify({schema: 1, build, version, ...(build === 'pinned' ? {release: `linux-engine-v${version}`} : {}), sha256, source: 'test', installedAt: '2026-11-14T00:00:00.000Z'}));
  return path;
}
const recordedIn = (home, version, options) => recordedAt(join(home, 'engine', 'linux'), version, options);

const select = (home, env, options = {}) => nativeEngineFor({env, platform: 'linux', arch: 'x64', home, ...options});

test('the default is cua\'s engine; CUA_NATIVE_ENGINE and engine.json select as on macOS; an unknown value is refused, naming cua alone', t => {
  const {home, user} = cuaHome(t);
  const path = recordedIn(home, MIN_ENGINE_VERSION);
  const cua = reason => ({engine: 'cua', reason, status: 'pass', bin: {path, lookup: path, source: 'installed'}});
  assert.deepEqual(select(home, {HOME: user}), cua('default'));
  assert.deepEqual(select(home, {HOME: user, CUA_NATIVE_ENGINE: 'cua'}), cua('explicit'));
  assert.deepEqual(select(home, {HOME: user, CUA_NATIVE_ENGINE: ''}), cua('default'), 'empty reads as unset');
  // M6b (§2.1): Linux's sentence stops offering the value it refuses; macOS's is unchanged.
  assert.throws(() => select(home, {HOME: user, CUA_NATIVE_ENGINE: 'sky'}), {code: 'invalid_setting', message: 'CUA_NATIVE_ENGINE must be cua (cua 0.30.0 removed the vendor\'s engine from Linux)'});
  assert.throws(() => nativeEngineFor({env: {HOME: user, CUA_NATIVE_ENGINE: 'sky'}, platform: 'darwin'}), {code: 'invalid_setting', message: 'CUA_NATIVE_ENGINE must be vendor or cua'});
  writeSettings(user, {engine: 'cua'});
  assert.deepEqual(select(home, {HOME: user}), cua('settings'));
  writeSettings(user, {engine: 'other'});
  assert.throws(() => select(home, {HOME: user}), {code: 'invalid_setting', message: `"engine" in ${settingsOf(user)} must be cua (cua 0.30.0 removed the vendor's engine from Linux)`});
  assert.throws(() => nativeEngineFor({env: {HOME: user}, platform: 'darwin'}), {code: 'invalid_setting', message: `"engine" in ${settingsOf(user)} must be vendor or cua`});
  writeSettings(user, '[');
  assert.throws(() => select(home, {HOME: user}), {code: 'invalid_setting'});
});

// ---- engine_retired (#171 M6b; the pre-flight's §2.1) ----

test('the release that retired the vendor\'s engine is 0.30.0, no later than the plugin\'s version', () => {
  assert.equal(VENDOR_ENGINE_RETIRED_IN, '0.30.0');
  const version = text => text.split('.').map(Number);
  for (const file of ['plugin.json', 'marketplace.json']) {
    const manifest = JSON.parse(readFileSync(join(REPO, '.claude-plugin', file), 'utf8'));
    const plugin = version(manifest.version ?? manifest.plugins[0].version);
    assert.ok(!isOlder(plugin.join('.'), VENDOR_ENGINE_RETIRED_IN), `${file} names ${plugin.join('.')}, which is older than ${VENDOR_ENGINE_RETIRED_IN}`);
  }
});

// One test per source, each pinning the whole sentence and the hint, with the vendor's tree absent, present and damaged:
// the refusal is the selection's first act, looks for no tree, and touches nothing under runtimes/.
for (const [label, env, file] of [['CUA_NATIVE_ENGINE=vendor', true, false], ['"engine": "vendor" in engine.json', false, true], ['both, in precedence order', true, true]]) {
  test(`the vendor selection by ${label} is refused as engine_retired, its sentence the same whatever the home holds`, t => {
    const {home, user} = cuaHome(t);
    if (file) writeSettings(user, {engine: 'vendor', desktop: 'shared'});
    const ambient = {HOME: user, ...(env ? {CUA_NATIVE_ENGINE: 'vendor'} : {})};
    const expected = {code: 'engine_retired', message: retired(settingsOf(user), {env, file}), hint: HINT};
    assert.equal(ENGINE_HINT, HINT);
    assert.deepEqual(refusalOf(() => select(home, ambient)), expected, 'no tree');
    recordedIn(home, MIN_ENGINE_VERSION);
    assert.deepEqual(refusalOf(() => select(home, ambient)), expected, 'cua\'s engine installed changes nothing');
    const {root} = forgeActiveRuntime(home, {}, {host: LINUX, ownRuntime: false});
    let seen = recorded(() => assert.deepEqual(refusalOf(() => select(home, ambient)), expected, 'the tree present'));
    assert.deepEqual(inVendorTree(seen, home), [], 'nothing under runtimes/ is touched');
    writeFileSync(join(root, 'install.json'), '{}');
    seen = recorded(() => assert.deepEqual(refusalOf(() => select(home, ambient)), expected, 'the tree damaged'));
    assert.deepEqual(inVendorTree(seen, home), []);
    // An override is read only for cua's engine: the selection is refused before it.
    assert.deepEqual(refusalOf(() => select(home, {...ambient, CUA_LINUX_ENGINE_BIN: 'relative/cua-engine'})), expected);
    // Through replHostFor, as a connection opens: refused before Node; a browser-only session asks for no engine.
    let asked = 0;
    const node = () => { asked++; return NODE; };
    assert.deepEqual(refusalOf(() => replHostFor({platform: 'linux', surfaces: ['computer', 'browser'], ambient, home, resolveOwnNode: node})), expected);
    assert.equal(asked, 0);
    assert.deepEqual(replHostFor({platform: 'linux', surfaces: ['browser'], ambient, home, resolveOwnNode: node}), {host: 'cua', reason: 'linux', node: NODE});
  });
}

test('the variable `vendor` beside an engine.json that is no second source: the variable\'s sentence alone, at once', t => {
  const {dir, home, user} = cuaHome(t);
  const ambient = {HOME: user, CUA_NATIVE_ENGINE: 'vendor'};
  const alone = {code: 'engine_retired', message: retired(settingsOf(user), {env: true}), hint: HINT};
  const {root} = forgeActiveRuntime(home, {}, {host: LINUX, ownRuntime: false});
  assert.deepEqual(refusalOf(() => select(home, ambient)), alone, 'absent');
  for (const [what, value] of [['malformed', '{"engine": "vendor"'], ['not an object', '["vendor"]'], ['another engine', {engine: 'cua'}], ['no engine', {desktop: 'shared'}],
    ['over 64 KiB', JSON.stringify({engine: 'vendor', pad: 'x'.repeat(64 * 1024)})]]) {
    writeSettings(user, value);
    assert.deepEqual(refusalOf(() => select(home, ambient)), alone, what);
  }
  writeSettings(user, {engine: 'vendor'});
  assert.equal(refusalOf(() => select(home, ambient)).message, retired(settingsOf(user), {env: true, file: true}), 'the control: a regular file names both');
  // a link to a regular file that names vendor, outside the tree: a link is no second source
  const elsewhere = join(dir, 'elsewhere.json');
  writeFileSync(elsewhere, JSON.stringify({engine: 'vendor'}));
  const path = settingsOf(user);
  spawnSync('rm', ['-f', path]);
  symlinkSync(elsewhere, path);
  assert.deepEqual(refusalOf(() => select(home, ambient)), alone, 'a link');
  // a directory
  spawnSync('rm', ['-f', path]);
  mkdirSync(path);
  assert.deepEqual(refusalOf(() => select(home, ambient)), alone, 'a directory');
  spawnSync('rmdir', [path]);
  // a link into the recorded release: never opened, nothing under runtimes/ touched
  writeFileSync(join(root, 'engine.json'), JSON.stringify({engine: 'vendor'}));
  symlinkSync(join(root, 'engine.json'), path);
  let seen = recorded(() => assert.deepEqual(refusalOf(() => select(home, ambient)), alone, 'a link into the tree'));
  assert.deepEqual(inVendorTree(seen, home), []);
  // a FIFO: never opened, so nothing waits on it
  spawnSync('rm', ['-f', path]);
  assert.equal(spawnSync('mkfifo', [path]).status, 0, 'mkfifo');
  const started = Date.now();
  seen = recorded(() => assert.deepEqual(refusalOf(() => select(home, ambient)), alone, 'a FIFO'));
  assert.ok(Date.now() - started < 2000, 'nothing waited');
  assert.deepEqual(seen.filter(({call, path: at}) => at === path && !/^(?:l?stat|readlink|access)(?:Sync)?$/.test(call)), [], 'the FIFO is never opened');
  assert.deepEqual(inVendorTree(seen, home), []);
});

// Fix wave 1: the second look opens the path the vendor-tree guard resolved, never the spelling again, so a directory
// link on the way that changes after the check cannot redirect the read (O_NOFOLLOW guards the last component alone).
test('the second look reads engine.json at the path the guard resolved: its lstat and open name no link on the way', t => {
  const {dir, home, user} = cuaHome(t);
  const real = join(dir, 'elsewhere', 'config');
  mkdirSync(join(real, 'cua'), {recursive: true});
  writeFileSync(join(real, 'cua', 'engine.json'), JSON.stringify({engine: 'vendor'}));
  mkdirSync(user, {recursive: true});
  symlinkSync(real, join(user, '.config'));
  const spelled = settingsOf(user);
  let message;
  const seen = recorded(() => { message = refusalOf(() => select(home, {HOME: user, CUA_NATIVE_ENGINE: 'vendor'})).message; });
  assert.equal(message, retired(spelled, {env: true, file: true}), 'the file, reached through the link, is a second source');
  const opens = seen.filter(({call, path}) => call === 'openSync' && path.endsWith('engine.json'));
  assert.deepEqual(opens.map(({path}) => path), [join(real, 'cua', 'engine.json')], 'opened by its resolved path, once');
  assert.deepEqual(seen.filter(({call, path}) => /^lstat/.test(call) && path === spelled), [], 'never lstat-ed by its spelling either');
});

// #171 M6a (F3): M5's fallback is gone. Without an engine this cua can drive, the default refuses as an explicit setting
// does; M6b (§2.1): with the one install command and no other way out, the hint holding none.
test('cua\'s engine needs one installed in the cua home: refused without it, under the default as when set, naming the one install command', t => {
  const {home, user} = cuaHome(t);
  const path = join(home, 'engine', 'linux', 'cua-engine');
  for (const [env, config, source] of [[{CUA_NATIVE_ENGINE: 'cua'}, () => ({}), 'CUA_NATIVE_ENGINE=cua'], [{}, () => ({engine: 'cua'}), '"engine": "cua" in ~/.config/cua/engine.json'],
    [{}, () => ({}), 'the default engine (cua)']]) {
    assert.deepEqual(refusalOf(() => select(home, {HOME: user, ...env}, {config})),
      {code: 'engine_not_installed', message: `${source} selects cua's own engine, and none is installed in this cua home (${path}): ${RUN}`, hint: HINT}, source);
  }
  recordedIn(home, MIN_ENGINE_VERSION);
  assert.deepEqual(select(home, {HOME: user, CUA_NATIVE_ENGINE: 'cua'}), {engine: 'cua', reason: 'explicit', status: 'pass', bin: {path, lookup: path, source: 'installed'}});
  assert.deepEqual(select(home, {HOME: user}, {config: () => ({engine: 'cua'})}).reason, 'settings');
  chmodSync(path, 0o644);
  if (process.getuid?.() !== 0) assert.throws(() => select(home, {HOME: user, CUA_NATIVE_ENGINE: 'cua'}), {code: 'engine_not_installed'}, 'a file sessions could not run is no engine');
});

// #171 M6a (F2): either selection takes a recorded release at or above MIN_ENGINE_VERSION, by the version its bytes
// bear out: the pinned one, or one behind or ahead of the pin (doctor warns of those). Below the minimum, or with no
// record of the file, the open is refused; an explicit selection too, where M5 left it to the first request.
test('either selection takes an installed engine at or above MIN_ENGINE_VERSION by its record, and refuses one below it or unrecorded at the open', t => {
  const {home, user} = cuaHome(t);
  const settings = [['default', {}, () => ({})], ['explicit', {CUA_NATIVE_ENGINE: 'cua'}, () => ({})], ['settings', {}, () => ({engine: 'cua'})]];
  const each = check => { for (const [reason, env, config] of settings) check(reason, () => select(home, {HOME: user, ...env}, {config})); };
  const path = recordedIn(home, MIN_ENGINE_VERSION);
  const cua = reason => ({engine: 'cua', reason, status: 'pass', bin: {path, lookup: path, source: 'installed'}});
  each((reason, run) => assert.deepEqual(run(), cua(reason), `${reason}, at MIN_ENGINE_VERSION`));
  recordedIn(home, '9.0.0');
  each((reason, run) => assert.deepEqual(run(), cua(reason), `${reason}, ahead`));
  // the releases below the minimum (0.4.7): 0.3.0, 0.4.0 to 0.4.5, the earlier pins, and 0.4.6, which the released
  // plugin pins; each is what a home that installed it holds after the update
  const sources = {default: 'the default engine (cua)', explicit: 'CUA_NATIVE_ENGINE=cua', settings: '"engine": "cua" in ~/.config/cua/engine.json'};
  for (const version of ['0.3.0', '0.4.0', '0.4.1', '0.4.2', '0.4.3', '0.4.4', '0.4.5', '0.4.6']) {
    assert.ok(isOlder(version, MIN_ENGINE_VERSION), `the minimum is past ${version}`);
    recordedIn(home, version);
    // 1212's literal: the installed engine below the minimum names the one command and nothing else
    each((reason, run) => assert.deepEqual(refusalOf(run), {code: 'engine_outdated',
      message: `${sources[reason]} selects cua's own engine, and the engine installed in this cua home (${path}) is ${version}, older than ${MIN_ENGINE_VERSION}, which this cua needs: ${RUN}`,
      hint: HINT}, `${reason}, ${version}`));
  }
  // a local build (cua engine build) is a named override: taken at or above the minimum, refused below it
  recordedIn(home, '9.9.9', {build: 'local'});
  each((reason, run) => assert.deepEqual(run(), cua(reason), `${reason}, a local build`));
  recordedIn(home, '0.4.2', {build: 'local'});
  each((reason, run) => assert.throws(run, {code: 'engine_outdated'}, `${reason}, an old local build`));
  // F5a: a record that is not the file's says nothing of it, whatever version it names
  recordedIn(home, MIN_ENGINE_VERSION, {recordOf: 'another engine\'s bytes'});
  each((reason, run) => assert.deepEqual(refusalOf(run), {code: 'engine_unrecorded',
    message: `${sources[reason]} selects cua's own engine, and no record says what the engine installed in this cua home (${path}) is: its install.json is absent, unreadable or another file's: ${RUN}`,
    hint: HINT}, `${reason}, another file's record`));
  writeFileSync(join(home, 'engine', 'linux', 'install.json'), '{');
  each((reason, run) => assert.throws(run, {code: 'engine_unrecorded'}, `${reason}, an unreadable record`));
  // the installed-version read is a seam, as doctor's tests pass it
  assert.equal(select(home, {HOME: user}, {installedVersion: () => MIN_ENGINE_VERSION}).engine, 'cua');
  assert.throws(() => select(home, {HOME: user}, {installedVersion: () => null}), {code: 'engine_unrecorded'});
  assert.throws(() => select(home, {HOME: user, CUA_NATIVE_ENGINE: 'cua'}, {installedVersion: () => '0.1.0'}), {code: 'engine_outdated'});
});

// #171 M5: the default is per platform (one constant served both, the pre-flight's C16), and macOS's stays the vendor's
// (#192 decides it there).
test('the default is per platform; macOS\'s is the vendor\'s, whatever is installed', () => {
  assert.equal(defaultNativeEngine('darwin'), 'vendor');
  assert.equal(defaultNativeEngine('linux'), 'cua', 'flipped by #171 M5, on the owner\'s word');
  const app = {bundlePath: '/Users/u/Library/Application Support/cua/engine/CuaEngine.app', engineVersion: '0.9.0', build: 'b'};
  assert.deepEqual(nativeEngineFor({env: {HOME: '/Users/u'}, platform: 'darwin', config: () => ({}), installed: () => app}), {engine: 'vendor', reason: 'default', status: 'pass'});
  assert.deepEqual(nativeEngineFor({env: {HOME: '/Users/u'}, config: () => ({}), installed: () => app}), {engine: 'vendor', reason: 'default', status: 'pass'}, 'macOS when no platform is named');
});

test('CUA_LINUX_ENGINE_BIN names the engine only when the selection is cua: absolute, an executable file, or refused', t => {
  const {dir, home, user} = cuaHome(t);
  const built = engineAt(join(dir, 'checkout', 'target', 'release', 'cua-engine'));
  assert.deepEqual(select(home, {HOME: user, CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: built}), {engine: 'cua', reason: 'explicit', status: 'pass', bin: {path: built, lookup: built, source: 'override'}},
    'no engine need be installed');
  assert.deepEqual(select(home, {HOME: user, CUA_LINUX_ENGINE_BIN: built}).bin.source, 'override', 'under the default too: it is the named override');
  recordedIn(home, MIN_ENGINE_VERSION);
  assert.equal(select(home, {HOME: user, CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: built}).bin.path, built, 'it wins over the installed one');
  assert.equal(select(home, {HOME: user, CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: ''}).bin.source, 'installed', 'empty reads as unset');
  // A relative path takes the form too (§2.1: every override invalid_setting): the unset, then the one command.
  assert.deepEqual(refusalOf(() => select(home, {HOME: user, CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: 'target/cua-engine'})), {code: 'invalid_setting',
    message: `CUA_NATIVE_ENGINE=cua selects cua's own engine, and CUA_LINUX_ENGINE_BIN names target/cua-engine, which is not an absolute path: unset CUA_LINUX_ENGINE_BIN, then ${RUN}`,
    hint: HINT});
  // the override's prerequisite, then the one command: no build, no second remedy
  assert.deepEqual(refusalOf(() => select(home, {HOME: user, CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: join(dir, 'absent')})), {code: 'engine_not_installed',
    message: `CUA_NATIVE_ENGINE=cua selects cua's own engine, and CUA_LINUX_ENGINE_BIN names ${join(dir, 'absent')}, which is not an executable file: unset CUA_LINUX_ENGINE_BIN, then ${RUN}`,
    hint: HINT});
});

// Ruling 1110: an explicit selection below the minimum is refused at the open, the named override included. Its version
// is read once, from the approved path, at the open; the service still checks whatever it starts.
test('CUA_LINUX_ENGINE_BIN below MIN_ENGINE_VERSION, or answering no version, is refused at the open; at or above it is taken', t => {
  const {dir, home, user} = cuaHome(t);
  for (const [env, source] of [[{CUA_NATIVE_ENGINE: 'cua'}, 'CUA_NATIVE_ENGINE=cua'], [{}, 'the default engine (cua)']]) {
    const at = engineAt(join(dir, 'at', 'cua-engine'));
    assert.equal(select(home, {HOME: user, ...env, CUA_LINUX_ENGINE_BIN: at}).bin.path, at);
    // M6b (§2.1): the outdated override's whole sentence: the unset, then the one command, and no build
    const older = engineAt(join(dir, 'older', 'cua-engine'), {version: '0.4.4'});
    assert.deepEqual(refusalOf(() => select(home, {HOME: user, ...env, CUA_LINUX_ENGINE_BIN: older})), {code: 'engine_outdated',
      message: `${source} selects cua's own engine, and CUA_LINUX_ENGINE_BIN names ${older}, which is 0.4.4, older than ${MIN_ENGINE_VERSION}, which this cua needs: unset CUA_LINUX_ENGINE_BIN, then ${RUN}`,
      hint: HINT}, source);
    const garbled = engineAt(join(dir, 'garbled', 'cua-engine'), {line: 'hello'});
    assert.deepEqual(refusalOf(() => select(home, {HOME: user, ...env, CUA_LINUX_ENGINE_BIN: garbled})), {code: 'engine_unrecorded',
      message: `${source} selects cua's own engine, and CUA_LINUX_ENGINE_BIN names ${garbled}, which answers --version with no version this cua recognizes: unset CUA_LINUX_ENGINE_BIN, then ${RUN}`,
      hint: HINT}, source);
  }
});

// M6b (§2.1): no engine refusal offers a build, the vendor's engine, or a second command, and every hint holds none.
test('no engine refusal on Linux offers cua engine build, cargo, the vendor\'s engine or a second command', t => {
  const {dir, home, user} = cuaHome(t);
  const refusals = [];
  const collect = (env, options) => { try { select(home, {HOME: user, ...env}, options); } catch (error) { refusals.push(error); } };
  collect({});
  collect({CUA_LINUX_ENGINE_BIN: join(dir, 'absent')});
  collect({CUA_LINUX_ENGINE_BIN: 'relative/cua-engine'});
  collect({CUA_LINUX_ENGINE_BIN: engineAt(join(dir, 'older', 'cua-engine'), {version: '0.4.4'})});
  collect({CUA_LINUX_ENGINE_BIN: engineAt(join(dir, 'garbled', 'cua-engine'), {line: 'hello'})});
  collect({CUA_LINUX_ENGINE_BIN: `${engineAt(join(dir, 'plain', 'cua-engine'))}/`});
  collect({CUA_LINUX_ENGINE_BIN: join(home, 'runtimes', 'absent', 'cua-engine')});
  collect({CUA_NATIVE_ENGINE: 'vendor'});
  recordedIn(home, '0.4.4');
  collect({});
  collect({}, {installedVersion: () => null});
  assert.equal(refusals.length, 10);
  for (const {code, message, hint} of refusals) {
    assert.doesNotMatch(message, /cua engine build|cargo|or set CUA_NATIVE_ENGINE|for the vendor engine/, `${code}: ${message}`);
    assert.equal(message.split(`${INSTALLER}`).length, 2, `${code}: one command: ${message}`);
    assert.ok(message.endsWith(RUN), `${code}: ends with the one command: ${message}`);
    assert.equal(hint, HINT, code);
  }
});

// Fix wave 2: the resolver answers as the kernel does. A path that climbs out of a regular file, or names one with a
// trailing slash or dot, is ENOTDIR to the kernel, so it is refused as written, never reinterpreted into something that
// exists.
test('CUA_LINUX_ENGINE_BIN that the kernel would refuse (ENOTDIR) is refused, not reinterpreted', t => {
  const {dir, home, user} = cuaHome(t);
  const engine = engineAt(join(dir, 'bin', 'cua-engine'));
  const file = join(dir, 'bin', 'plain');
  writeFileSync(file, 'not a directory');
  const climbs = join(dir, 'bin', 'climbs');
  symlinkSync('plain/../cua-engine', climbs);
  for (const path of [`${file}/../cua-engine`, `${engine}/`, `${engine}/.`, climbs])
    for (const env of [{CUA_NATIVE_ENGINE: 'cua'}, {}])
      assert.throws(() => select(home, {HOME: user, ...env, CUA_LINUX_ENGINE_BIN: path}), error => error.code === 'invalid_setting' && error.message.includes(path)
        && /not a directory/.test(error.message) && error.message.endsWith(`: unset CUA_LINUX_ENGINE_BIN, then ${RUN}`), path);
  assert.equal(select(home, {HOME: user, CUA_LINUX_ENGINE_BIN: engine}).bin.path, engine, 'the same engine named plainly is taken');
});

// Fix wave 2: the open's version probe is bounded even by a child that ignores SIGTERM, so one bad override cannot stall
// every connection of the process.
test('the open\'s version probe of CUA_LINUX_ENGINE_BIN is killed at its deadline, even when it ignores SIGTERM', t => {
  const {dir, home, user} = cuaHome(t);
  const stubborn = engineAt(join(dir, 'stubborn', 'cua-engine'));
  writeFileSync(stubborn, '#!/bin/sh\ntrap \'\' TERM\nwhile :; do :; done\n', {mode: 0o755});
  const started = Date.now();
  assert.throws(() => select(home, {HOME: user, CUA_LINUX_ENGINE_BIN: stubborn}, {probeTimeoutMs: 300}), {code: 'engine_unrecorded'});
  assert.ok(Date.now() - started < 3000, `the probe returned after ${Date.now() - started} ms`);
});

// Fix wave 2: one version-line reading at both boundaries, the open's and the service's per-start check
// (src/services/engine/linux/client.mjs engineVersionOf), so no override is compatible at one and unrecognised at the
// other.
test('the open reads an override\'s --version line exactly as the service does', t => {
  const {dir, home, user} = cuaHome(t);
  let n = 0;
  for (const line of [`cua-engine ${MIN_ENGINE_VERSION} (0123456789ab)`, `cua-engine ${MIN_ENGINE_VERSION} (a local build)`, `cua-engine ${MIN_ENGINE_VERSION} x`,
    `cua-engine ${MIN_ENGINE_VERSION}`, `cua-engine v${MIN_ENGINE_VERSION} (x)`, 'cua-engine 0.4.2 (x)', 'sky_linux 9.9.9 (x)']) {
    const path = engineAt(join(dir, `v${n++}`, 'cua-engine'), {line});
    const service = engineVersionOf(line);
    const expected = service === null ? 'engine_unrecorded' : isOlder(service, MIN_ENGINE_VERSION) ? 'engine_outdated' : 'taken';
    const outcome = (() => { try { select(home, {HOME: user, CUA_LINUX_ENGINE_BIN: path}); return 'taken'; } catch (error) { return error.code; } })();
    assert.equal(outcome, expected, line);
  }
});

// ---- no lookup of cua's engine is led into the vendor's tree (#171 M6a, F2a; the pre-flight's §3.3, §3.5) ----

// A vendor tree in `home` with an executable where its helper would be.
function vendorTreeIn(home) {
  const bin = join(home, 'runtimes', '26.928.40906-linux-x64', 'cua_node', 'lib', 'node_modules', '@oai', 'sky', 'bin', 'linux', 'sky_linux_x64');
  return engineAt(bin);
}

test('CUA_LINUX_ENGINE_BIN under the vendor\'s tree, by its spelling or through a link outside it, is refused (invalid_setting) before anything there is touched', t => {
  const {dir, home, user} = cuaHome(t);
  const inTree = vendorTreeIn(home);
  const link = join(dir, 'engine-link');
  symlinkSync(inTree, link);
  const dirLink = join(dir, 'vendor-dir');
  symlinkSync(dirname(inTree), dirLink);
  for (const path of [inTree, link, join(dirLink, 'sky_linux_x64'), join(home, 'runtimes', 'absent', 'cua-engine')]) {
    for (const env of [{CUA_NATIVE_ENGINE: 'cua'}, {}])
      assert.throws(() => select(home, {HOME: user, ...env, CUA_LINUX_ENGINE_BIN: path}), error => error.code === 'invalid_setting' && error.message.includes(path)
        && /CUA_LINUX_ENGINE_BIN/.test(error.message) && /vendor's tree/.test(error.message) && error.message.endsWith(`: unset CUA_LINUX_ENGINE_BIN, then ${RUN}`), path);
  }
});

test('an installed engine whose path leads into the vendor\'s tree is no engine of cua\'s: engine_not_installed, its bytes never read', t => {
  const {home, user} = cuaHome(t);
  const inTree = vendorTreeIn(home);
  mkdirSync(join(home, 'engine', 'linux'), {recursive: true});
  symlinkSync(inTree, join(home, 'engine', 'linux', 'cua-engine'));
  let looked = 0;
  const installedVersion = () => { looked++; return MIN_ENGINE_VERSION; };
  const lookup = join(home, 'engine', 'linux', 'cua-engine');
  for (const [env, source] of [[{}, 'the default engine (cua)'], [{CUA_NATIVE_ENGINE: 'cua'}, 'CUA_NATIVE_ENGINE=cua']])
    assert.deepEqual(refusalOf(() => select(home, {HOME: user, ...env}, {installedVersion})), {code: 'engine_not_installed',
      message: `${source} selects cua's own engine, and the engine installed in this cua home (${lookup}) leads to ${join(home, 'runtimes')}, under the vendor's tree, which is no part of cua's: move ${lookup} aside, then ${RUN}`,
      hint: HINT}, source);
  assert.equal(looked, 0, 'its version was never read');
  // the engine directory itself a link there
  const {home: other, user: otherUser} = cuaHome(t);
  mkdirSync(join(other, 'engine'), {recursive: true});
  symlinkSync(dirname(vendorTreeIn(other)), join(other, 'engine', 'linux'));
  assert.throws(() => select(other, {HOME: otherUser}), {code: 'engine_not_installed'});
});

test('replHostFor carries a Linux computer session\'s engine, resolved before Node; a browser-only session resolves none', t => {
  const {home, user} = cuaHome(t);
  const ambient = {HOME: user, CUA_NATIVE_ENGINE: 'cua'};
  let asked = 0;
  const node = () => { asked++; return NODE; };
  assert.throws(() => replHostFor({platform: 'linux', surfaces: ['computer'], ambient, home, resolveOwnNode: node}), {code: 'engine_not_installed'});
  assert.throws(() => replHostFor({platform: 'linux', surfaces: ['computer'], ambient: {HOME: user}, home, resolveOwnNode: node}), {code: 'engine_not_installed'}, 'the default refuses as well (F3)');
  assert.equal(asked, 0, 'the engine refuses before Node is asked for');
  const browser = replHostFor({platform: 'linux', surfaces: ['browser'], ambient, home, resolveOwnNode: node});
  assert.deepEqual(browser, {host: 'cua', reason: 'linux', node: NODE});
  assert.deepEqual(replHostFor({platform: 'linux', surfaces: ['browser'], ambient: {HOME: user, CUA_NATIVE_ENGINE: 'vendor'}, home, resolveOwnNode: node}), browser,
    'a browser-only session opens with the vendor selection, which it never resolves');
  const path = recordedIn(home, MIN_ENGINE_VERSION);
  const engine = {engine: 'cua', reason: 'explicit', status: 'pass', bin: {path, lookup: path, source: 'installed'}};
  assert.deepEqual(replHostFor({platform: 'linux', surfaces: ['computer', 'browser'], ambient, home, resolveOwnNode: node}), {host: 'cua', reason: 'linux', node: NODE, engine});
  assert.deepEqual(replHostFor({platform: 'linux', surfaces: ['computer'], ambient: {...ambient, CUA_REPL_HOST: 'cua'}, home, resolveOwnNode: node}), {host: 'cua', reason: 'explicit', node: NODE, engine});
  assert.deepEqual(replHostFor({platform: 'linux', surfaces: ['computer'], ambient: {HOME: user}, home, resolveOwnNode: node}).engine, {engine: 'cua', reason: 'default', status: 'pass', bin: {path, lookup: path, source: 'installed'}}, 'the default, by its file\'s version');
  assert.throws(() => replHostFor({platform: 'linux', surfaces: ['computer'], ambient: {...ambient, CUA_REPL_HOST: 'vendor'}, home, resolveOwnNode: node}), {code: 'repl_host_refused'}, 'the vendor host stays refused first');
  // The engine inputs reach the selection, as doctor and the tests pass them.
  assert.equal(replHostFor({platform: 'linux', surfaces: ['computer'], ambient: {HOME: user}, home, resolveOwnNode: node, engine: {config: () => ({engine: 'cua'})}}).engine.reason, 'settings');
  assert.throws(() => replHostFor({platform: 'linux', surfaces: ['computer'], ambient: {HOME: user}, home, resolveOwnNode: node, engine: {config: () => ({engine: 'cua'}), installed: () => null}}), {code: 'engine_not_installed'});
  assert.throws(() => replHostFor({platform: 'linux', surfaces: ['computer'], ambient: {HOME: user}, home, resolveOwnNode: node, engine: {config: () => ({engine: 'vendor'})}}), {code: 'engine_retired'});
});

// cua's own Linux runtime in `home` (its module tree), resolved as a connection resolves it.
function linuxRuntime(home) {
  fakeModuleTree(home, LINUX);
  return resolveRuntime({home, host: LINUX});
}
const AMBIENT = {HOME: '/home/u', USER: 'u', PATH: '/usr/bin', DISPLAY: ':0'};

test('a Linux computer launch with cua\'s engine runs cua\'s own service (M3): CUA_SKY_SERVICE names it, CUA_ENGINE_BIN the engine, CUA_DESKTOP_MODE the device mode', t => {
  const {dir, home, user} = cuaHome(t);
  const runtime = linuxRuntime(home);
  const launch = ambient => buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, ...ambient}, services: {sky: SKY_SERVICE}, resolveOwnNode: ownNode});
  forgeActiveRuntime(home, {}, {host: LINUX, ownRuntime: false});
  assert.throws(() => launch({CUA_NATIVE_ENGINE: 'vendor', CUA_DESKTOP_MODE: 'mine'}), {code: 'engine_retired'}, 'the vendor\'s engine is refused, its tree present');
  const path = recordedIn(home, MIN_ENGINE_VERSION);
  const cua = launch({});
  assert.equal(LINUX_ENGINE_SERVICE, join(REPO, 'src', 'services', 'engine', 'linux', 'service.mjs'));
  assert.equal(cua.env.CUA_SKY_SERVICE, LINUX_ENGINE_SERVICE, 'the default is cua\'s engine');
  assert.equal(cua.env.CUA_ENGINE_BIN, path);
  assert.equal(cua.env.CUA_DESKTOP_MODE, 'shared', 'the default device mode');
  assert.equal('OAI_SKY_LINUX_BIN' in cua.env, false, 'nothing of the vendor\'s Linux computer surface is named');
  assert.ok(cua.env.CUA_REPL_TRUSTED_CODE_PATHS.split(':').includes(dirname(SKY_SERVICE)) && LINUX_ENGINE_SERVICE.startsWith(`${dirname(SKY_SERVICE)}/`),
    'the trusted worker may import the service: it lies under the wrapper\'s trusted directory');
  assert.deepEqual(cua.linuxEngine, {path, lookup: path, source: 'installed'});
  assert.equal(cua.engineRoot, join(home, 'engine'), 'the engine directory, which the scoped preflight protects');
  assert.equal(cua.nativeEngine, null);
  for (const name of ['CUA_NATIVE_ENGINE', 'CUA_LINUX_ENGINE_BIN']) assert.equal(name in cua.env, false, `${name} is the proxy's alone`);
  const built = engineAt(join(dir, 'checkout', 'cua-engine'));
  assert.equal(launch({CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: built}).env.CUA_ENGINE_BIN, built);
  // The device mode: the caller's CUA_DESKTOP_MODE, else engine.json's desktop; anything else is refused before launch.
  assert.equal(launch({CUA_NATIVE_ENGINE: 'cua', CUA_DESKTOP_MODE: 'dedicated'}).env.CUA_DESKTOP_MODE, 'dedicated');
  mkdirSync(join(user, '.config', 'cua'), {recursive: true});
  writeFileSync(join(user, '.config', 'cua', 'engine.json'), JSON.stringify({desktop: 'dedicated'}));
  assert.equal(launch({HOME: user, CUA_NATIVE_ENGINE: 'cua'}).env.CUA_DESKTOP_MODE, 'dedicated');
  assert.throws(() => launch({CUA_NATIVE_ENGINE: 'cua', CUA_DESKTOP_MODE: 'mine'}), {code: 'invalid_setting', message: 'CUA_DESKTOP_MODE must be shared or dedicated'});
  // A selection the connection resolved once is what every launch of it runs.
  const resolved = replHostFor({platform: 'linux', surfaces: ['computer'], ambient: {...AMBIENT, CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: built}, home, resolveOwnNode: ownNode});
  assert.equal(buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, services: {sky: SKY_SERVICE}, replHost: resolved}).env.CUA_ENGINE_BIN, built);
});

test('scoped: an engine cells could write is refused before anything starts, the home\'s engine directory or the one CUA_LINUX_ENGINE_BIN names', t => {
  const {home} = cuaHome(t);
  const runtime = linuxRuntime(home);
  const launch = ambient => buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, ...ambient}, services: {sky: SKY_SERVICE}, resolveOwnNode: ownNode});
  recordedIn(home, MIN_ENGINE_VERSION);
  assertSandboxFits('scoped', launch({CUA_NATIVE_ENGINE: 'cua'}));
  const planted = engineAt(join(home, 'run', SESSION, 'cua-engine'));
  const inRun = launch({CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: planted});
  assert.throws(() => assertSandboxFits('scoped', inRun), error => error.code === 'sandbox_conflict' && /Linux engine/.test(error.message));
  assertSandboxFits('default', inRun);
});

test('a home whose engine directory leads into a write root is refused under scoped', t => {
  const {home} = cuaHome(t);
  const runtime = linuxRuntime(home);
  recordedAt(join(home, 'run', SESSION, 'linux'), MIN_ENGINE_VERSION);
  symlinkSync(join(home, 'run', SESSION), join(home, 'engine'));
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: AMBIENT, services: {sky: SKY_SERVICE}, resolveOwnNode: ownNode});
  assert.throws(() => assertSandboxFits('scoped', launch), error => error.code === 'sandbox_conflict' && /Linux engine/.test(error.message));
});

// Review fix: what the trusted worker launches must be the file the preflight checked. The selection canonicalizes the
// engine once and the launch names only that; the preflight protects it whatever its source, and refuses a lookup path
// whose symbolic links lie in a writable root.
test('scoped: an installed engine reached through a link into a write root is refused, and the launch names its real path', t => {
  const {home} = cuaHome(t);
  const runtime = linuxRuntime(home);
  const real = recordedAt(join(home, 'run', SESSION, 'planted'), MIN_ENGINE_VERSION);
  mkdirSync(join(home, 'engine'), {recursive: true});
  symlinkSync(join(home, 'run', SESSION, 'planted'), join(home, 'engine', 'linux'));
  const launch = buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_NATIVE_ENGINE: 'cua'}, services: {sky: SKY_SERVICE}, resolveOwnNode: ownNode});
  assert.equal(launch.env.CUA_ENGINE_BIN, real, 'the canonical file, never the replaceable link');
  assert.deepEqual(launch.linuxEngine, {path: real, lookup: join(home, 'engine', 'linux', 'cua-engine'), source: 'installed', links: [join(home, 'engine', 'linux')]},
    'the link the selection followed, carried to the preflight');
  assert.throws(() => assertSandboxFits('scoped', launch), error => error.code === 'sandbox_conflict' && /cua's Linux engine/.test(error.message) && error.message.includes(real));
});

test('scoped: a CUA_LINUX_ENGINE_BIN that is a link in a write root is refused, though its target lies outside; a link outside every write root is fine', t => {
  const {dir, home} = cuaHome(t);
  const runtime = linuxRuntime(home);
  const target = engineAt(join(dir, 'checkout', 'target', 'release', 'cua-engine'));
  const launch = bin => buildLaunch({runtime, home, sessionId: SESSION, ambient: {...AMBIENT, CUA_NATIVE_ENGINE: 'cua', CUA_LINUX_ENGINE_BIN: bin}, services: {sky: SKY_SERVICE}, resolveOwnNode: ownNode});
  mkdirSync(join(home, 'run', SESSION), {recursive: true});
  const writable = join(home, 'run', SESSION, 'cua-engine');
  symlinkSync(target, writable);
  const inRun = launch(writable);
  assert.equal(inRun.env.CUA_ENGINE_BIN, target);
  assert.throws(() => assertSandboxFits('scoped', inRun), error => error.code === 'sandbox_conflict' && /symbolic link on the path to cua's Linux engine/.test(error.message) && error.message.includes(writable));
  // A link through a directory a cell could replace: refused too.
  symlinkSync(join(dir, 'checkout'), join(home, 'run', SESSION, 'checkout'));
  assert.throws(() => assertSandboxFits('scoped', launch(join(home, 'run', SESSION, 'checkout', 'target', 'release', 'cua-engine'))), {code: 'sandbox_conflict'});
  const outside = join(dir, 'engine-link');
  symlinkSync(target, outside);
  const fine = launch(outside);
  assert.equal(fine.env.CUA_ENGINE_BIN, target);
  assertSandboxFits('scoped', fine);
});

test('the device mode: CUA_DESKTOP_MODE, else engine.json\'s desktop, else shared; any other value refused', () => {
  const none = () => ({});
  assert.deepEqual(desktopModeFor({env: {}, config: none}), {mode: 'shared', reason: 'default'});
  assert.deepEqual(desktopModeFor({env: {CUA_DESKTOP_MODE: ''}, config: () => ({desktop: 'dedicated'})}), {mode: 'dedicated', reason: 'settings'});
  assert.deepEqual(desktopModeFor({env: {CUA_DESKTOP_MODE: 'shared'}, config: () => ({desktop: 'dedicated'})}), {mode: 'shared', reason: 'explicit'});
  assert.throws(() => desktopModeFor({env: {CUA_DESKTOP_MODE: 'private'}, config: none}), {code: 'invalid_setting', message: 'CUA_DESKTOP_MODE must be shared or dedicated'});
  assert.throws(() => desktopModeFor({env: {HOME: '/h'}, config: () => ({desktop: true})}), {code: 'invalid_setting', message: '"desktop" in /h/.config/cua/engine.json must be shared or dedicated'});
});
