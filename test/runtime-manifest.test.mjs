import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePin, loadPins, selectPin, resolveRuntime, runtimeFor} from '../src/runtime/manifest.mjs';
import {defaultHome} from '../src/runtime/layout.mjs';
import {checkIpc} from '../src/runtime/checks.mjs';
import {realPinJson, linuxPinJson, scratch} from './fixtures/runtime-fixture.mjs';

const LINUX_X64 = {platform: 'linux', arch: 'x64'};
const LINUX_ARM64 = {platform: 'linux', arch: 'arm64'};

const expectCode = code => err => { assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`); return true; };

test('the checked-in pin names the official archive, its length and hash, and the vendor runtime it carries', () => {
  const pin = loadPins().find(p => p.platform === 'darwin');
  assert.equal(pin.release, '26.928.40906-darwin-arm64');
  assert.equal(pin.archive.url, 'https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.928.40906.zip');
  assert.equal(pin.archive.length, 687457051);
  assert.equal(pin.archive.sha256, '93bf16b32c80c567e46141f87317ab48489f5b9b6454060ba694f1eed5fbf857');
  assert.deepEqual(pin.runtime, {version: '0.0.27/20260927214556-b77d38801cca', node: '24.21.0-cua.1', ipc: 'CodexComputerUseIPC-5'});
  assert.equal(pin.signing.team, '2DC432GLL2');
  assert.deepEqual(Object.values(pin.components), ['ChatGPT.app/Contents/Resources/cua_node', 'ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app']);
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
    assert.deepEqual(pin.components, {cua_node: 'usr/lib/chatgpt/resources/cua_node', codex: 'usr/lib/chatgpt/resources/codex'});
    assert.equal(pin.layout.codexCli, 'codex');
    assert.equal(pin.layout.skyLinuxBin, `cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_${arch}`);
    assert.equal('skyServiceApp' in pin.layout || 'ipcClient' in pin.layout, false);
    assert.equal(pin.chromePlugin.layout.host, `extension-host/linux/${arch}/extension-host`);
    assert.deepEqual(pin.chromePlugin.signing, []);
  }
});

test('Linux pin parsing is strict too: no signing, no IPC, a deb archive, the Linux layout keys and an empty plugin signing list', () => {
  const cases = {
    signing: p => { p.signing = {team: '2DC432GLL2', components: ['cua_node/bin/node']}; },
    ipc: p => { p.runtime.ipc = 'CodexComputerUseIPC-5'; },
    noFormat: p => { delete p.archive.format; },
    zip: p => { p.archive.format = 'zip'; },
    darwinLayout: p => { p.layout.skyServiceApp = 'cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app'; },
    ipcClient: p => { p.layout.ipcClient = 'cua_node/lib/node_modules/x.js'; },
    noSkyLinuxBin: p => { delete p.layout.skyLinuxBin; },
    pluginSigning: p => { p.chromePlugin.signing = [p.chromePlugin.layout.host]; },
    notes: p => { p.notes = 42; },
    codexOutside: p => { p.layout.codexCli = 'usr/lib/chatgpt/resources/codex'; },
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

test('the darwin pin keeps its schema: no archive format, no notes, the plugin host must be signature-listed', () => {
  const cases = {
    format: p => { p.archive.format = 'zip'; },
    notes: p => { p.notes = 'checked'; },
    emptyPluginSigning: p => { p.chromePlugin.signing = []; },
    noSigning: p => { delete p.signing; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const pin = realPinJson();
    mutate(pin);
    assert.throws(() => parsePin(pin), expectCode('invalid_pin'), name);
  }
});

test('a Linux runtime record carries its own layout paths, and the IPC check does not apply to it', () => {
  const pin = parsePin(linuxPinJson('arm64'));
  const runtime = runtimeFor({home: '/home/u/.local/share/cua', pin, record: null});
  const root = '/home/u/.local/share/cua/runtimes/26.928.40906-linux-arm64';
  assert.equal(runtime.paths.codexCli, `${root}/codex`);
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

test('resolving with no pointer is a classified not-installed error with install guidance', () => {
  const {dir, cleanup} = scratch();
  try {
    assert.throws(() => resolveRuntime({home: dir}), err => {
      assert.equal(err.code, 'runtime_not_installed');
      assert.match(err.hint, /cua install/);
      return true;
    });
  } finally { cleanup(); }
});

test('install and recovery hints name the archive this host installs: a zip on macOS (unchanged), a deb on Linux', async () => {
  const {installHint, recoveryHint} = await import('../src/runtime/manifest.mjs');
  assert.equal(installHint('darwin'), 'run `cua install` (or `cua install --archive <ChatGPT zip>` with the pinned archive)');
  assert.equal(installHint('linux'), 'run `cua install` (or `cua install --archive <ChatGPT deb>` with the pinned archive)');
  assert.match(recoveryHint('/r', 'linux'), /^stop any `cua serve` using it, remove \/r, then run `cua install` .*<ChatGPT deb>/);
  const {dir, cleanup} = scratch();
  try {
    assert.throws(() => resolveRuntime({home: dir, host: LINUX_X64}), err => /<ChatGPT deb>/.test(err.hint));
    assert.throws(() => resolveRuntime({home: dir, host: {platform: 'darwin', arch: 'arm64'}}), err => /<ChatGPT zip>/.test(err.hint));
  } finally { cleanup(); }
});

test('the sandbox-conflict hint names this platform\'s default home', async () => {
  const {sandboxConflictHint} = await import('../src/runtime/sandbox.mjs');
  assert.equal(sandboxConflictHint('darwin'), 'keep CUA_HOME and the cua checkout outside $TMPDIR, and nothing of cua\'s under $CUA_HOME/run '
    + '(the default CUA_HOME, ~/Library/Application Support/cua, and a directory under /tmp both work), or set CUA_SHIM_SANDBOX=disabled');
  assert.match(sandboxConflictHint('linux'), /the default CUA_HOME, ~\/\.local\/share\/cua,/);
  assert.doesNotMatch(sandboxConflictHint('linux'), /Library/);
});

test('a relative XDG_DATA_HOME is ignored, as the XDG Base Directory spec requires', () => {
  assert.equal(defaultHome({HOME: '/home/u', XDG_DATA_HOME: 'data'}, LINUX_X64), '/home/u/.local/share/cua');
  assert.equal(defaultHome({HOME: '/home/u', XDG_DATA_HOME: './x'}, LINUX_X64), '/home/u/.local/share/cua');
});
