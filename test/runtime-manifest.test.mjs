import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cpSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import fs from 'node:fs';  // the mutable module object: its functions are wrapped below
import {syncBuiltinESMExports} from 'node:module';
import {dirname, join} from 'node:path';
import {parsePin, loadPins, selectPin, locateRuntime, resolveRuntime, runtimeFor, vendorLinuxRuntime, linuxRelease, loadLinuxRuntime, ownInstaller, installHint, RELEASES_DIR} from '../src/runtime/manifest.mjs';
import {MODULES_PIN_DIR} from '../src/runtime/module-tree.mjs';
import {defaultHome, realHome} from '../src/runtime/layout.mjs';
import {checkIpc} from '../src/runtime/checks.mjs';
import {realPinJson, linuxPinJson, scratch, forgeActiveRuntime, REPO} from './fixtures/runtime-fixture.mjs';
import {fakeModuleTree} from './fixtures/own-linux-runtime.mjs';

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

test('three pins ship: the darwin one and the two Linux debs, each selected only by its own host', () => {
  const pins = loadPins();
  assert.deepEqual(pins.map(p => p.release), ['26.928.40906-darwin-arm64', '26.928.40906-linux-arm64', '26.928.40906-linux-x64']);
  assert.equal(selectPin(pins, LINUX_X64).release, '26.928.40906-linux-x64');
  assert.equal(selectPin(pins, LINUX_ARM64).release, '26.928.40906-linux-arm64');
  assert.throws(() => selectPin(pins, {platform: 'darwin', arch: 'x64'}), err => /darwin-arm64, linux-arm64, linux-x64/.test(err.message));
});

test('the Linux pins name the vendor pool debs by length and hash, with the provenance check recorded and no signing', () => {
  const pins = loadPins();
  const expected = {
    x64: {deb: 'amd64', length: 474898954, sha256: '8094004f1cbccf35deefded15961aa42b4db889121a5d952c5f30cf82bd8ad30'},
    arm64: {deb: 'arm64', length: 453477698, sha256: 'ab3eea138b767555aecb2b69f4aa553d843e6c5ef3037645e544aafc72d0f5cd'},
  };
  for (const [arch, {deb, length, sha256}] of Object.entries(expected)) {
    const pin = pins.find(p => p.release === `26.928.40906-linux-${arch}`);
    assert.deepEqual(pin.archive, {format: 'deb', url: `https://persistent.oaistatic.com/codex-app-prod/linux/deb/pool/main/c/chatgpt/chatgpt_26.928.40906_${deb}.deb`, length, sha256});
    assert.match(pin.notes, /_gpgorigin/);
    assert.match(pin.notes, /3BFA0E4AE8B8CC16A2D9BA684A3B4A566C4660E4/);
    assert.match(pin.notes, /GOODSIG/);
    assert.match(pin.notes, new RegExp(`chatgpt_26\\.928\\.40906_${deb}\\.deb`));
    assert.equal(pin.signing, undefined);
    assert.deepEqual(pin.runtime, {version: '0.0.27/20260927214556-b77d38801cca', node: '24.21.0-cua.1'});
    assert.deepEqual(pin.components, {cua_node: 'usr/lib/chatgpt/resources/cua_node'}, 'no Codex CLI since #115 M3');
    assert.equal('codexCli' in pin.layout, false);
    assert.equal(pin.layout.skyLinuxBin, `cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_${arch}`);
    assert.equal('skyServiceApp' in pin.layout || 'ipcClient' in pin.layout, false);
    assert.equal('chromePlugin' in pin, false);
  }
});

test('Linux pin parsing is strict too: no signing, no IPC, a deb archive and the Linux layout keys', () => {
  const cases = {
    signing: p => { p.signing = {team: '2DC432GLL2', components: ['cua_node/bin/node']}; },
    ipc: p => { p.runtime.ipc = 'CodexComputerUseIPC-5'; },
    noFormat: p => { delete p.archive.format; },
    zip: p => { p.archive.format = 'zip'; },
    darwinLayout: p => { p.layout.skyServiceApp = 'cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app'; },
    ipcClient: p => { p.layout.ipcClient = 'cua_node/lib/node_modules/x.js'; },
    noSkyLinuxBin: p => { delete p.layout.skyLinuxBin; },
    notes: p => { p.notes = 42; },
    codexCli: p => { p.layout.codexCli = 'cua_node/bin/codex'; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const pin = linuxPinJson();
    mutate(pin);
    assert.throws(() => parsePin(pin), expectCode('invalid_pin'), name);
  }
  const noNotes = linuxPinJson();
  delete noNotes.notes;
  assert.equal(parsePin(noNotes).notes, undefined, 'notes are optional');
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
  for (const [name, json] of [['darwin', realPinJson()], ['linux', linuxPinJson()]])
    assert.throws(() => parsePin({...json, chromePlugin}), err => expectCode('invalid_pin')(err) && /chromePlugin/.test(err.message), name);
});

test('a Linux runtime record carries its own layout paths, and the IPC check does not apply to it', () => {
  const pin = parsePin(linuxPinJson('arm64'));
  const runtime = runtimeFor({home: '/home/u/.local/share/cua', pin, record: null});
  const root = '/home/u/.local/share/cua/runtimes/26.928.40906-linux-arm64';
  assert.equal(runtime.paths.skyLinuxBin, `${root}/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64`);
  assert.deepEqual(Object.keys(runtime.paths), Object.keys(pin.layout));
  assert.deepEqual(checkIpc(root, pin), {ok: true, found: [], detail: 'not applicable on linux'});
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

// F9 (ruling 1110): on Linux every remedy names this cua's own installer by its absolute path, never the bare `cua
// install`, which may run another checkout's cua. The vendor tree's own errors keep the `--archive` form.
test('install and recovery hints name the archive this host installs: a zip on macOS (unchanged), a deb on Linux by this cua\'s own installer', async () => {
  const {installHint, recoveryHint} = await import('../src/runtime/manifest.mjs');
  const own = `node ${CUA_ENTRY} install`;
  assert.equal(installHint('darwin'), 'run `cua install` (or `cua install --archive <ChatGPT zip>` with the pinned archive)');
  assert.equal(installHint('linux'), `run \`${own}\` (or \`${own} --archive <ChatGPT deb>\` with the pinned archive)`);
  assert.equal(recoveryHint('/r', 'linux'), `stop any \`cua serve\` using it, remove /r, then ${installHint('linux')}`);
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

test('linux: the home an older cua\'s install leaves (vendor pointer, vendor tree intact, no module tree) is refused, and nothing under runtimes/ is read', t => {
  const home = linuxHome(t);
  forgeActiveRuntime(home, {}, {host: LINUX_X64, ownRuntime: false});
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
  forgeActiveRuntime(home, {}, {host: LINUX_X64, ownRuntime: false});
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

// ---- the vendor tree, for CUA_NATIVE_ENGINE=vendor only ----

test('vendorLinuxRuntime: the pinned vendor tree for the host, found without the pointer', t => {
  const home = linuxHome(t);
  const {root} = forgeActiveRuntime(home, {}, {host: LINUX_X64, ownRuntime: false});
  rmSync(join(home, 'current.json'));
  const pin = selectPin(loadPins(), LINUX_X64);
  const vendor = vendorLinuxRuntime({home, host: LINUX_X64});
  assert.equal(vendor.release, pin.release);
  assert.equal(vendor.root, root);
  assert.equal(vendor.paths.skyLinuxBin, join(root, pin.layout.skyLinuxBin));
  assert.equal(vendor.paths.skyVendorService, join(root, pin.layout.skyVendorService));
  assert.equal(vendor.paths.moduleDir, join(root, pin.layout.moduleDir));
  writePointer(home, derived(LINUX_X64));
  assert.equal(vendorLinuxRuntime({home, host: LINUX_X64}).root, root);
});

// T3 renders its own refusal for the vendor selection and T4 skips an absent tree but fails a damaged one, so the
// lookup tells the two apart by code and carries the release, the home and the tree's root as structured context.
test('vendorLinuxRuntime: an absent tree is release_not_installed; one present but damaged is release_damaged; each carries its release, home and root', t => {
  const own = quote(`node ${CUA_ENTRY} install`);
  const hint = new RegExp(`^run \`${own}\` \\(or \`${own} --archive <ChatGPT deb>\` with the pinned archive\\)$`);
  const pin = selectPin(loadPins(), LINUX_X64);
  const contextOf = home => ({release: pin.release, home, root: join(home, 'runtimes', pin.release)});

  const empty = linuxHome(t);
  assert.throws(() => vendorLinuxRuntime({home: empty, host: LINUX_X64}), err => {
    assert.equal(err.code, 'release_not_installed');
    assert.match(err.hint, hint);
    assert.deepEqual(err.context, contextOf(empty));
    return true;
  });

  const damaged = {
    'a file at the tree\'s path': home => { mkdirSync(join(home, 'runtimes')); writeFileSync(join(home, 'runtimes', pin.release), ''); },
    'a link to a real tree': home => {
      const {root} = forgeActiveRuntime(home, {}, {host: LINUX_X64, ownRuntime: false});
      fs.renameSync(root, `${root}.real`);
      fs.symlinkSync(`${root}.real`, root);
    },
    'runtimes/ a file, so the tree cannot be stat-ed': home => writeFileSync(join(home, 'runtimes'), ''),
    'an install record that is not the pin\'s': home => { const {root} = forgeActiveRuntime(home, {}, {host: LINUX_X64, ownRuntime: false}); writeFileSync(join(root, 'install.json'), '{}'); },
    'a layout file missing': home => { const {root} = forgeActiveRuntime(home, {}, {host: LINUX_X64, ownRuntime: false}); rmSync(join(root, pin.layout.skyLinuxBin)); },
  };
  for (const [name, plant] of Object.entries(damaged)) {
    const home = linuxHome(t);
    plant(home);
    assert.throws(() => vendorLinuxRuntime({home, host: LINUX_X64}), err => {
      assert.equal(err.code, 'release_damaged', `${name}: ${err.code} ${err.message}`);
      assert.deepEqual(err.context, contextOf(home), name);
      assert.equal(err.hint, `stop any \`cua serve\` using it, remove ${contextOf(home).root}, then ${installHint('linux')}`, name);
      return true;
    }, name);
  }
  const home = linuxHome(t);
  const {root} = forgeActiveRuntime(home, {}, {host: LINUX_X64, ownRuntime: false});
  rmSync(join(root, pin.layout.skyLinuxBin));
  assert.throws(() => vendorLinuxRuntime({home, host: LINUX_X64}), err => /skyLinuxBin/.test(err.message));
  assert.throws(() => vendorLinuxRuntime({home, host: DARWIN}), expectCode('unsupported_platform'));
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
