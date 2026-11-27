import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import fs from 'node:fs';  // the mutable module object: its functions are wrapped below
import {syncBuiltinESMExports} from 'node:module';
import {dirname, join} from 'node:path';
import * as manifest from '../src/runtime/manifest.mjs';
import {parsePin, loadPins, selectPin, locateRuntime, resolveRuntime, linuxRelease, loadLinuxRuntime, ownInstaller, installHint, RELEASES_DIR} from '../src/runtime/manifest.mjs';
import {MODULES_PIN_DIR} from '../src/runtime/module-tree.mjs';
import {defaultHome, realHome} from '../src/runtime/layout.mjs';
import {realPinJson, scratch, forgeActiveRuntime, REPO} from './fixtures/runtime-fixture.mjs';
import {RETIRED, plantRetiredRelease} from './fixtures/retired-release.mjs';
import {fakeModuleTree} from './fixtures/own-linux-runtime.mjs';
import {VENDOR_ENGINE_RETIRED_IN} from '../src/runtime/launch.mjs';

const LINUX_X64 = {platform: 'linux', arch: 'x64'};
const LINUX_ARM64 = {platform: 'linux', arch: 'arm64'};
const DARWIN = {platform: 'darwin', arch: 'arm64'};
const CUA_ENTRY = join(REPO, 'bin', 'cua.mjs');

const expectCode = code => err => { assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`); return true; };

test('the checked-in pin names the official archive, its length and hash, and the vendor runtime it carries', () => {
  const pin = loadPins().find(p => p.platform === 'darwin');
  assert.equal(pin.release, '26.928.40906-darwin-arm64');
  assert.equal(pin.archive.url, 'https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.928.40906.zip');
  assert.equal(pin.archive.length, 687457051);
  assert.equal(pin.archive.sha256, '93bf16b32c80c567e46141f87317ab48489f5b9b6454060ba694f1eed5fbf857');
  assert.deepEqual(pin.runtime, {version: '0.0.27/20260927214556-b77d38801cca', node: '24.21.0-cua.1', ipc: 'CodexComputerUseIPC-5'});
  assert.equal(pin.signing.team, '2DC432GLL2');
  assert.deepEqual(Object.values(pin.components), ['ChatGPT.app/Contents/Resources/cua_node'], 'no CodexCLI.app since #115 M2');
  assert.equal(Object.hasOwn(pin.layout, 'codexCli'), false);
  assert.deepEqual(pin.signing.components, ['cua_node/bin/node', 'cua_node/bin/node_repl', 'cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app']);
});

// #115 M2: the release id is the app version, platform and arch, so dropping CodexCLI.app keeps it, and every
// installed tree of this release (with its native helper at the same path) stays this release.
test('the darwin pin keeps its release id across M2, and a darwin layout naming codexCli is refused', () => {
  const pin = parsePin(realPinJson());
  assert.equal(pin.release, `${pin.appVersion}-${pin.platform}-${pin.arch}`);
  assert.equal(pin.release, '26.928.40906-darwin-arm64');
  const json = realPinJson();
  json.layout.codexCli = 'cua_node/bin/codex';
  assert.throws(() => parsePin(json), expectCode('invalid_pin'));
});

test('pin parsing rejects fields it does not know, at any level, rather than ignoring something that affects execution', () => {
  assert.throws(() => parsePin({...realPinJson(), postInstall: 'sh x'}), expectCode('invalid_pin'));
  const nested = realPinJson();
  nested.archive.mirror = 'https://elsewhere.invalid/x.zip';
  assert.throws(() => parsePin(nested), expectCode('invalid_pin'));
  const layout = realPinJson();
  layout.layout.extra = 'cua_node/bin/other';
  assert.throws(() => parsePin(layout), expectCode('invalid_pin'));
});

test('pin parsing rejects malformed values: schema, hash, length, url scheme, release id and escaping paths', () => {
  const cases = {
    schema: p => { p.schema = 2; },
    sha: p => { p.archive.sha256 = 'abc'; },
    length: p => { p.archive.length = -1; },
    http: p => { p.archive.url = 'http://persistent.oaistatic.com/x.zip'; },
    release: p => { p.release = '26.928.40906-linux-x64'; },
    absoluteLayout: p => { p.layout.node = '/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node'; },
    dotdotLayout: p => { p.layout.node = 'cua_node/../../outside'; },
    layoutOutsideComponents: p => { p.layout.node = 'elsewhere/bin/node'; },
    componentName: p => { p.components = {'../x': 'ChatGPT.app/Contents/Resources/cua_node'}; },
    signingOutside: p => { p.signing.components = ['/usr/bin/true']; },
    team: p => { p.signing.team = ''; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const pin = realPinJson();
    mutate(pin);
    assert.throws(() => parsePin(pin), expectCode('invalid_pin'), name);
  }
});

test('platform selection returns the host pin and refuses other targets instead of guessing a download', () => {
  const pins = loadPins();
  assert.equal(selectPin(pins, {platform: 'darwin', arch: 'arm64'}).release, '26.928.40906-darwin-arm64');
  assert.throws(() => selectPin(pins, {platform: 'darwin', arch: 'x64'}), err => {
    assert.equal(err.code, 'unsupported_platform');
    assert.match(err.message, /darwin-x64/);
    assert.match(err.message, /darwin-arm64/);
    return true;
  });
  assert.throws(() => selectPin(pins, {platform: 'linux', arch: 'riscv64'}), expectCode('unsupported_platform'));
});

// #171 M6b (its pre-flight's §1.2, §4.1): the two Linux deb pins left runtime/releases/ for runtime/provenance/, where
// scripts/modules-pin.mjs alone reads them; the parser keeps the darwin schema alone, and a Linux pin is refused, naming
// Linux's own record, so a record put back here cannot load.
test('one pin ships, the darwin one: a Linux host has none, and is told so as unsupported_platform', () => {
  const pins = loadPins();
  assert.deepEqual(pins.map(p => p.release), ['26.928.40906-darwin-arm64']);
  for (const host of [LINUX_X64, LINUX_ARM64]) assert.throws(() => selectPin(pins, host), expectCode('unsupported_platform'), host.arch);
  assert.throws(() => selectPin(pins, {platform: 'darwin', arch: 'x64'}), err => /pinned runtimes exist only for darwin-arm64$/.test(err.message));
});

// §3.6: a cloud VM's provisioner from before 0.30.0 is what still asks for a Linux pin; the sentence names its successor.
test('selectPin for a Linux host names deploy/cloud-vm/update.sh as what replaces the provisioner that asked', () => {
  for (const host of [LINUX_X64, LINUX_ARM64, {platform: 'linux', arch: 'riscv64'}]) {
    assert.throws(() => selectPin(loadPins(), host), err => {
      assert.equal(err.code, 'unsupported_platform');
      assert.equal(err.message, `cua ${VENDOR_ENGINE_RETIRED_IN} has no vendor release for Linux; a cloud VM's provisioner that asks for one is replaced with \`deploy/cloud-vm/update.sh\``);
      return true;
    }, host.arch);
  }
});

test('a Linux pin is invalid_pin, whatever else it holds, naming runtime/linux-runtime.json as Linux\'s record; one put back in a pins directory refuses the load', t => {
  const asLinux = json => ({...json, platform: 'linux', arch: 'x64', release: `${json.appVersion}-linux-x64`});
  const whole = realPinJson();
  const cases = {
    'the darwin pin moved to Linux': asLinux(whole),
    'the old Linux pin\'s shape': {...asLinux(whole), archive: {...whole.archive, format: 'deb'}, notes: 'checked', signing: undefined},
    'a provenance record': JSON.parse(readFileSync(join(REPO, 'runtime', 'provenance', '26.928.40906-linux-x64.json'), 'utf8')),
    'a bare platform': {platform: 'linux'},
  };
  for (const [name, json] of Object.entries(cases))
    assert.throws(() => parsePin(json), err => expectCode('invalid_pin')(err) && err.message.endsWith('cua 0.30.0 reads no Linux release pin: Linux\'s runtime is cua\'s own, recorded in runtime/linux-runtime.json'), name);
  const dir = mkdtempSync(join(scratchDir(t), 'pins-'));
  cpSync(join(RELEASES_DIR, '26.928.40906-darwin-arm64.json'), join(dir, '26.928.40906-darwin-arm64.json'));
  assert.deepEqual(loadPins(dir).map(p => p.release), ['26.928.40906-darwin-arm64']);
  cpSync(join(REPO, 'runtime', 'provenance', '26.928.40906-linux-x64.json'), join(dir, '26.928.40906-linux-x64.json'));
  assert.throws(() => loadPins(dir), expectCode('invalid_pin'));
});

test('the Linux pin\'s parser and its exports are gone: no Linux layout keys, no vendor tree lookup, no vendor pins guard', () => {
  for (const name of ['LINUX_LAYOUT_KEYS', 'vendorLinuxRuntime', 'vendorPinsOf', 'RESTORE_PINS']) assert.equal(name in manifest, false, name);
  assert.equal(manifest.LAYOUT_KEYS.includes('skyLinuxBin'), false);
});

test('the darwin pin keeps its schema: no archive format, no notes, signing required', () => {
  const cases = {
    format: p => { p.archive.format = 'zip'; },
    notes: p => { p.notes = 'checked'; },
    noSigning: p => { delete p.signing; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const pin = realPinJson();
    mutate(pin);
    assert.throws(() => parsePin(pin), expectCode('invalid_pin'), name);
  }
});

test('no pin carries the Chrome plugin any more: a chromePlugin field is refused as unknown on every platform', () => {
  // The shape the pins had before #79 removed the ChatGPT extension route.
  const chromePlugin = {from: 'ChatGPT.app/Contents/Resources/plugins/openai-bundled/plugins/chrome', dir: 'chrome-plugin',
    layout: {host: 'extension-host/macos/arm64/ChatGPT for Chrome'}, signing: [], nativeHost: {name: 'com.openai.codexextension', description: 'x', extensionIds: []}};
  for (const pin of loadPins()) assert.equal('chromePlugin' in pin, false, pin.release);
  assert.throws(() => parsePin({...realPinJson(), chromePlugin}), err => expectCode('invalid_pin')(err) && /chromePlugin/.test(err.message));
});

test('CUA_HOME overrides the default home, which is under Application Support', () => {
  assert.equal(defaultHome({CUA_HOME: '/tmp/x'}, {platform: 'darwin'}), '/tmp/x');
  assert.match(defaultHome({HOME: '/Users/someone'}, {platform: 'darwin'}), /\/Library\/Application Support\/cua$/);
  assert.equal(defaultHome({HOME: '/Users/someone'}, {platform: 'darwin'}), '/Users/someone/Library/Application Support/cua');
});

test('on Linux the default home follows XDG: $XDG_DATA_HOME/cua, else ~/.local/share/cua; CUA_HOME still wins', () => {
  assert.equal(defaultHome({HOME: '/home/u'}, LINUX_X64), '/home/u/.local/share/cua');
  assert.equal(defaultHome({HOME: '/home/u', XDG_DATA_HOME: '/data/u'}, LINUX_X64), '/data/u/cua');
  assert.equal(defaultHome({HOME: '/home/u', XDG_DATA_HOME: ''}, LINUX_ARM64), '/home/u/.local/share/cua');
  assert.equal(defaultHome({HOME: '/home/u', XDG_DATA_HOME: '/data/u', CUA_HOME: '/srv/cua'}, LINUX_X64), '/srv/cua');
});

test('resolving with no pointer is a classified not-installed error with install guidance (darwin)', () => {
  const {dir, cleanup} = scratch();
  try {
    assert.throws(() => resolveRuntime({home: dir, host: DARWIN}), err => {
      assert.equal(err.code, 'runtime_not_installed');
      assert.match(err.hint, /cua install/);
      return true;
    });
  } finally { cleanup(); }
});

// The vendor's release has a remedy on macOS alone since cua 0.30.0 (#171 M6b): the zip's. Linux's remedies name this
// cua's own installer (F9, ruling 1110), and none offers an archive.
test('install and recovery hints name the archive macOS installs, the zip, and nothing of a deb', async () => {
  const {recoveryHint} = await import('../src/runtime/manifest.mjs');
  assert.equal(installHint(), 'run `cua install` (or `cua install --archive <ChatGPT zip>` with the pinned archive)');
  assert.equal(recoveryHint('/r'), `stop any \`cua serve\` using it, remove /r, then ${installHint()}`);
  const {dir, cleanup} = scratch();
  try {
    assert.throws(() => resolveRuntime({home: dir, host: DARWIN}), err => /<ChatGPT zip>/.test(err.hint));
  } finally { cleanup(); }
});

test('the sandbox-conflict hint names this platform\'s default home', async () => {
  const {sandboxConflictHint} = await import('../src/runtime/sandbox.mjs');
  assert.equal(sandboxConflictHint('darwin'), 'keep CUA_HOME outside cua\'s checkout, ~/.config/cua and the secret store, and nothing of cua\'s under $CUA_HOME/run '
    + '(the default CUA_HOME, ~/Library/Application Support/cua, and a directory under /tmp both work), or set CUA_SHIM_SANDBOX=disabled');
  assert.match(sandboxConflictHint('linux'), /the default CUA_HOME, ~\/\.local\/share\/cua,/);
  assert.doesNotMatch(sandboxConflictHint('linux'), /Library/);
});

test('a relative XDG_DATA_HOME is ignored, as the XDG Base Directory spec requires', () => {
  assert.equal(defaultHome({HOME: '/home/u', XDG_DATA_HOME: 'data'}, LINUX_X64), '/home/u/.local/share/cua');
  assert.equal(defaultHome({HOME: '/home/u', XDG_DATA_HOME: './x'}, LINUX_X64), '/home/u/.local/share/cua');
});

// ---- cua's own Linux runtime (#171 M6a T2; the pre-flight's §3.1, §4.3) ----
//
// On Linux, resolution derives the release from the checked-in record and needs its module tree, installed by cua for
// this lock and host. The pointer selects nothing there: whatever it names, or nothing, the same record resolves, and
// the vendor tree under runtimes/ is never read on the way.

function scratchDir(t) {
  const s = scratch();
  t.after(s.cleanup);
  return s.dir;
}
function linuxHome(t) {
  const s = scratch();
  t.after(s.cleanup);
  return realHome(s.dir);
}
const derived = host => linuxRelease(loadLinuxRuntime({host}), host.arch);
const writePointer = (home, release) => writeFileSync(join(home, 'current.json'), JSON.stringify({schema: 1, release}));
const quote = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Every path the given fs functions are called with while `run` runs: the functions are wrapped and the ES module
// bindings refreshed (syncBuiltinESMExports), so the modules under test call the wrappers too.
const FS_CALLS = ['accessSync', 'existsSync', 'lstatSync', 'openSync', 'opendirSync', 'readFileSync', 'readdirSync', 'readlinkSync', 'realpathSync', 'statSync'];
function pathsTouched(run) {
  const touched = [];
  const originals = Object.fromEntries(FS_CALLS.map(name => [name, fs[name]]));
  for (const name of FS_CALLS) fs[name] = function (path, ...rest) { touched.push(String(path)); return originals[name].call(this, path, ...rest); };
  syncBuiltinESMExports();
  try { return {result: run(), touched}; } catch (error) { return {error, touched}; } finally {
    for (const name of FS_CALLS) fs[name] = originals[name];
    syncBuiltinESMExports();
  }
}

for (const host of [LINUX_X64, LINUX_ARM64]) {
  test(`linux-${host.arch}: no pointer and no module tree is runtime_not_installed, naming the derived release and this cua's own installer`, t => {
    const home = linuxHome(t);
    const release = derived(host);
    const tree = join(home, 'modules', loadLinuxRuntime({host}).modules.lock);
    for (const resolve of [locateRuntime, resolveRuntime]) {
      assert.throws(() => resolve({home, host}), err => {
        assert.equal(err.code, 'runtime_not_installed');
        assert.equal(err.message, `cua's Linux runtime ${release} is not installed in ${home}: its module tree ${tree} is missing`);
        assert.equal(err.hint, ownInstaller({release}).hint);
        assert.match(err.hint, new RegExp(`^run \`node ${quote(CUA_ENTRY)} install\``));
        return true;
      });
    }
  });

  test(`linux-${host.arch}: the installed module tree resolves to the own record, its root the tree and its module base the tree's node_modules`, t => {
    const home = linuxHome(t);
    const tree = fakeModuleTree(home, host);
    const record = loadLinuxRuntime({host});
    const runtime = resolveRuntime({home, host});
    assert.deepEqual(runtime, {
      release: tree.release, home, root: tree.root, paths: {moduleDir: tree.moduleDir},
      manifest: {platform: 'linux', arch: host.arch, release: tree.release, parts: record},
      record: tree.record,
    });
    assert.deepEqual(locateRuntime({home, host}), runtime);
    assert.equal(tree.release, derived(host));
  });
}

test('linux: the pointer selects nothing: absent, unreadable, a vendor release, another own release or garbage, the own record resolves', t => {
  const home = linuxHome(t);
  const tree = fakeModuleTree(home, LINUX_X64);
  const pointers = {
    absent: () => {},
    'not JSON': () => writeFileSync(join(home, 'current.json'), '{"schema"'),
    'the wrong schema': () => writeFileSync(join(home, 'current.json'), JSON.stringify({schema: 9, release: 7})),
    'a vendor release': () => writePointer(home, '26.928.40906-linux-x64'),
    'another own release': () => writePointer(home, 'cua-linux-x64-e0.4.2-n24.22.0-s0.163.0-m000000000000'),
    'a directory': () => mkdirSync(join(home, 'current.json')),
  };
  for (const [name, set] of Object.entries(pointers)) {
    set();
    assert.equal(resolveRuntime({home, host: LINUX_X64}).release, tree.release, name);
    rmSync(join(home, 'current.json'), {recursive: true, force: true});
  }
});

// What Linux resolution may read: nothing under the home's runtimes/, none of the vendor's archive pins (RELEASES_DIR
// and its *.json; a bad vendor pin must not block the own runtime), and the module lock once, for the binding and the
// closure both. The managed Node's pins, in RELEASES_DIR/node/, are the record's own and are read: the control that the
// recorder sees the pin reads at all.
function assertOwnReadsOnly(home, touched) {
  assert.deepEqual(touched.filter(path => path.startsWith(join(home, 'runtimes'))), []);
  assert.deepEqual(touched.filter(path => path === RELEASES_DIR || (dirname(path) === RELEASES_DIR && path.endsWith('.json'))), [], 'no archive pin is read');
  assert.ok(touched.some(path => path.startsWith(join(RELEASES_DIR, 'node'))), 'the recorder saw the Node pins read');
  assert.equal(touched.filter(path => path === join(MODULES_PIN_DIR, 'package-lock.json')).length, 1, 'the module lock is read once');
}

// The home an older cua's install leaves: its recorded release under runtimes/ and the pointer naming it.
function olderInstall(home) {
  plantRetiredRelease(home);
  writePointer(home, RETIRED.x64.release);
}

test('linux: the home an older cua\'s install leaves (vendor pointer, vendor tree intact, no module tree) is refused, and nothing under runtimes/ is read', t => {
  const home = linuxHome(t);
  olderInstall(home);
  const release = derived(LINUX_X64);
  for (const resolve of [locateRuntime, resolveRuntime]) {
    const {error, touched} = pathsTouched(() => resolve({home, host: LINUX_X64}));
    assert.equal(error?.code, 'runtime_not_installed', error?.message);
    assert.equal(error.hint, ownInstaller({release}).hint);
    assertOwnReadsOnly(home, touched);
    assert.ok(touched.some(path => path.startsWith(join(home, 'modules'))), 'the recorder saw the resolution look for the tree');
  }
});

test('linux: an upgraded home whose vendor tree is gone, own parts installed, resolves the own record; with the tree there nothing under runtimes/ is read', t => {
  const home = linuxHome(t);
  olderInstall(home);
  const tree = fakeModuleTree(home, LINUX_X64);
  const {result, error, touched} = pathsTouched(() => resolveRuntime({home, host: LINUX_X64}));
  assert.equal(error, undefined);
  assert.equal(result.release, tree.release);
  assertOwnReadsOnly(home, touched);
  assert.ok(touched.some(path => path.startsWith(tree.root)), 'the recorder saw the tree checked');
  rmSync(join(home, 'runtimes'), {recursive: true});
  assert.equal(resolveRuntime({home, host: LINUX_X64}).release, tree.release);
});

test('linux: a release named other than the derived one is unknown_release; the derived one resolves', t => {
  const home = linuxHome(t);
  const tree = fakeModuleTree(home, LINUX_X64);
  for (const release of ['26.928.40906-linux-x64', derived(LINUX_ARM64), 'cua-linux-x64-e0.4.2-n24.22.0-s0.163.0-m000000000000'])
    assert.throws(() => resolveRuntime({home, release, host: LINUX_X64}), err => expectCode('unknown_release')(err) && err.message.includes(release) && err.message.includes(tree.release), release);
  assert.equal(resolveRuntime({home, release: tree.release, host: LINUX_X64}).release, tree.release);
});

test('linux: a tree that is not cua\'s install of this lock for this host is not installed', t => {
  const cases = {
    'another architecture\'s tree': home => fakeModuleTree(home, LINUX_ARM64),
    'a record of another lock': home => { const {root, record} = fakeModuleTree(home, LINUX_X64); writeFileSync(join(root, 'install.json'), JSON.stringify({...record, lock: 'a'.repeat(64)})); },
    'no record': home => { const {root} = fakeModuleTree(home, LINUX_X64); rmSync(join(root, 'install.json')); },
    'a link to a tree': home => {
      const {root} = fakeModuleTree(home, LINUX_X64);
      cpSync(root, `${root}.real`, {recursive: true});
      rmSync(root, {recursive: true});
      fs.symlinkSync(`${root}.real`, root);
    },
  };
  for (const [name, plant] of Object.entries(cases)) {
    const home = linuxHome(t);
    plant(home);
    assert.throws(() => resolveRuntime({home, host: LINUX_X64}), expectCode('runtime_not_installed'), name);
  }
});

test('linux: a tree with a package.json missing is layout_invalid at resolution, with the recovery hint naming this cua\'s installer; locate does not look', t => {
  const home = linuxHome(t);
  const tree = fakeModuleTree(home, LINUX_X64);
  rmSync(join(tree.root, 'node_modules/sharp/package.json'));
  assert.equal(locateRuntime({home, host: LINUX_X64}).release, tree.release);
  assert.throws(() => resolveRuntime({home, host: LINUX_X64}), err => {
    assert.equal(err.code, 'layout_invalid');
    assert.match(err.message, /node_modules\/sharp\/package\.json is missing/);
    assert.equal(err.hint, `stop any \`cua serve\` using it, remove ${tree.root}, then ${ownInstaller({release: tree.release}).hint}`);
    assert.ok(err.hint.endsWith(`which may not be ${tree.release}`), 'F9: the derived release is named');
    return true;
  });
});

// ---- darwin: unchanged ----

test('darwin: the pointer selects the release, and locate and resolve read its pin, record and layout as before', t => {
  const home = linuxHome(t);
  const {root} = forgeActiveRuntime(home, {}, {host: DARWIN});
  const pin = selectPin(loadPins(), DARWIN);
  const runtime = resolveRuntime({home, host: DARWIN});
  assert.equal(runtime.release, pin.release);
  assert.equal(runtime.root, root);
  assert.deepEqual(runtime.manifest, pin);
  assert.deepEqual(Object.keys(runtime.paths), Object.keys(pin.layout));
  assert.deepEqual(locateRuntime({home, host: DARWIN}), runtime);
  fakeModuleTree(home, LINUX_X64);
  assert.equal(resolveRuntime({home, host: DARWIN}).release, pin.release, 'a module tree changes nothing on darwin');
  rmSync(join(root, pin.layout.cuaRepl));
  assert.throws(() => resolveRuntime({home, host: DARWIN}), expectCode('layout_invalid'));
  rmSync(join(home, 'current.json'));
  assert.throws(() => resolveRuntime({home, host: DARWIN}), expectCode('runtime_not_installed'));
});
