// Chrome on Linux (Phase F): the browsers' native-messaging directories under ~/.config (honouring CHROME_CONFIG_HOME
// and XDG_CONFIG_HOME as the vendor's installManifest does), registration of the Linux host there, profile discovery
// in ~/.config/google-chrome, the desktop app's Linux installs, live hosts from `ps -eo pid=,args=`, and `profiles
// open` through google-chrome. Everything runs against scratch directories with the Linux host injected.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {browsersFor, registerHost, unregisterHost} from '../src/chrome/registration.mjs';
import {chromeFacts, chromeUserData, countLiveHosts, hostPathClass} from '../src/profiles/chrome.mjs';
import {chromeChecks} from '../src/profiles/checks.mjs';
import {openCommand, openInvocation} from '../src/profiles/commands.mjs';
import {installRuntime} from '../src/runtime/install.mjs';
import {parsePin, resolveRuntime, loadPins} from '../src/runtime/manifest.mjs';
import {scratch, debFixture, linuxFixturePin, debTools} from './fixtures/runtime-fixture.mjs';
import {fakeChromeFacts} from './fixtures/chrome-facts.mjs';
import {addProfile} from '../src/profiles/registry.mjs';

const LINUX = {platform: 'linux', arch: 'x64'};
const DARWIN = {platform: 'darwin', arch: 'arm64'};
const MANIFEST = 'com.openai.codexextension.json';
const expectCode = code => err => { assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`); return true; };
const tableOf = browsers => Object.fromEntries(browsers.map(b => [b.browser, b.dataDir]));

test('on macOS the browser table is the five browsers under ~/Library/Application Support, as before', () => {
  const browsers = browsersFor({host: DARWIN, env: {CHROME_CONFIG_HOME: '/ignored', XDG_CONFIG_HOME: '/ignored'}, userHome: '/Users/x'});
  assert.deepEqual(browsers.map(b => [b.browser, b.name]), [['chrome', 'Google Chrome'], ['edge', 'Microsoft Edge'], ['brave', 'Brave'], ['opera', 'Opera'], ['vivaldi', 'Vivaldi']]);
  assert.deepEqual(tableOf(browsers), {
    chrome: '/Users/x/Library/Application Support/Google/Chrome',
    edge: '/Users/x/Library/Application Support/Microsoft Edge',
    brave: '/Users/x/Library/Application Support/BraveSoftware/Brave-Browser',
    opera: '/Users/x/Library/Application Support/com.operasoftware.Opera',
    vivaldi: '/Users/x/Library/Application Support/Vivaldi',
  });
});

test('on Linux the table is the vendor\'s user-level set under ~/.config; CHROME_CONFIG_HOME moves only the Chrome family', () => {
  const defaults = browsersFor({host: LINUX, env: {}, userHome: '/home/u'});
  assert.deepEqual(defaults.map(b => [b.browser, b.name]), [
    ['chrome', 'Google Chrome'], ['chrome-beta', 'Google Chrome Beta'], ['chrome-unstable', 'Google Chrome Unstable'], ['chromium', 'Chromium'],
    ['edge', 'Microsoft Edge'], ['brave', 'Brave'], ['opera', 'Opera'], ['vivaldi', 'Vivaldi']]);
  assert.deepEqual(tableOf(defaults), {
    chrome: '/home/u/.config/google-chrome', 'chrome-beta': '/home/u/.config/google-chrome-beta', 'chrome-unstable': '/home/u/.config/google-chrome-unstable',
    chromium: '/home/u/.config/chromium', edge: '/home/u/.config/microsoft-edge', brave: '/home/u/.config/BraveSoftware/Brave-Browser',
    opera: '/home/u/.config/opera', vivaldi: '/home/u/.config/vivaldi',
  });
  const moved = tableOf(browsersFor({host: LINUX, env: {CHROME_CONFIG_HOME: '/c', XDG_CONFIG_HOME: '/x'}, userHome: '/home/u'}));
  assert.equal(moved.chrome, '/c/google-chrome');
  assert.equal(moved['chrome-beta'], '/c/google-chrome-beta');
  assert.equal(moved.chromium, '/c/chromium');
  assert.equal(moved.edge, '/x/microsoft-edge');
  assert.equal(moved.vivaldi, '/x/vivaldi');
  assert.equal(tableOf(browsersFor({host: LINUX, env: {CHROME_CONFIG_HOME: '', XDG_CONFIG_HOME: ''}, userHome: '/home/u'})).chrome, '/home/u/.config/google-chrome');
});

test('Chrome\'s user-data directory follows the same rule: ~/.config/google-chrome on Linux, Application Support on macOS', () => {
  assert.equal(chromeUserData({host: LINUX, env: {}, userHome: '/home/u'}), '/home/u/.config/google-chrome');
  assert.equal(chromeUserData({host: LINUX, env: {XDG_CONFIG_HOME: '/x'}, userHome: '/home/u'}), '/x/google-chrome');
  assert.equal(chromeUserData({host: LINUX, env: {CHROME_CONFIG_HOME: '/c', XDG_CONFIG_HOME: '/x'}, userHome: '/home/u'}), '/c/google-chrome');
  assert.equal(chromeUserData({host: DARWIN, env: {XDG_CONFIG_HOME: '/x'}}), join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome'));
  assert.equal(chromeFacts({host: LINUX, env: {}, userHome: '/home/u'}).userData, '/home/u/.config/google-chrome');
});

test('the desktop app\'s Linux install and plugin cache are the desktop\'s hosts', () => {
  const opts = {cuaHome: '/home/u/.local/share/cua', userHome: '/home/u'};
  assert.equal(hostPathClass('/usr/lib/chatgpt/resources/plugins/openai-bundled/plugins/chrome/extension-host/linux/x64/extension-host', opts), 'desktop');
  assert.equal(hostPathClass('/home/u/.codex/plugins/cache/openai-bundled/chrome/latest/extension-host/linux/x64/extension-host', opts), 'desktop');
  assert.equal(hostPathClass('/home/u/.local/share/cua/runtimes/r/chrome-plugin/extension-host/linux/x64/extension-host', opts), 'cua');
  assert.equal(hostPathClass('/opt/other/extension-host', opts), 'other');
});

test('on Linux live hosts are counted from `ps -eo pid=,args=` by the host path for this arch', () => {
  const ps = [
    '    1 /sbin/init splash',
    '  100 /opt/google/chrome/chrome --profile-directory=Default',
    '  200 /home/u/.local/share/cua/runtimes/26.928.40906-linux-x64/chrome-plugin/extension-host/linux/x64/extension-host chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/',
    '  201 /usr/lib/chatgpt/resources/plugins/openai-bundled/plugins/chrome/extension-host/linux/x64/extension-host chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/ --parent-window=0',
    '  202 /home/u/a dir/chrome-plugin/extension-host/linux/x64/extension-host',
    '  300 /home/u/x/extension-host/linux/arm64/extension-host',
    '  400 grep extension-host/linux/x64/extension-host',
    '  500 /home/u/extension-host/linux/x64/extension-host-config.json',
  ].join('\n');
  assert.equal(countLiveHosts(ps, {host: LINUX}), 3);
  assert.equal(countLiveHosts(ps, {host: {platform: 'linux', arch: 'arm64'}}), 1);
  assert.equal(countLiveHosts('', {host: LINUX}), 0);
  const home = '/nonexistent-cua-home';
  const live = chromeChecks({home, host: LINUX, chrome: fakeChromeFacts(), psText: ps}).find(c => c.name === 'chrome.hosts.live');
  assert.equal(live.status, 'pass');
  assert.match(live.detail, /^3 OpenAI Chrome host/);
});

// A cua home with an installed Linux release (fixture deb), and a user home where Google Chrome and Brave have
// user-data directories under ~/.config.
async function linuxMachine(t) {
  const s = scratch();
  t.after(s.cleanup);
  const archive = debFixture(s.dir);
  const pin = parsePin(linuxFixturePin({sha256: archive.sha256, length: archive.length}));
  const home = join(s.dir, 'cua');
  await installRuntime({home, manifest: pin, archivePath: archive.deb, host: LINUX, tools: debTools(), verifySignatures: async () => { throw new Error('nothing is signed'); }});
  const runtime = resolveRuntime({home, pins: [pin], host: LINUX});
  const userHome = join(s.dir, 'user');
  for (const dir of ['.config/google-chrome', '.config/BraveSoftware/Brave-Browser']) mkdirSync(join(userHome, dir), {recursive: true});
  return {home, runtime, userHome, pins: [...loadPins(), pin], browsers: browsersFor({host: LINUX, env: {}, userHome})};
}

test('register on Linux writes the vendor manifest naming the Linux host into each present browser; unregister takes it back', async t => {
  const m = await linuxMachine(t);
  const result = await registerHost({home: m.home, runtime: m.runtime, userHome: m.userHome, browsers: m.browsers, pins: m.pins,
    verifySignatures: async () => { throw new Error('nothing is signed'); }});
  const host = join(m.runtime.root, 'chrome-plugin', 'extension-host', 'linux', 'x64', 'extension-host');
  assert.equal(result.host, host);
  assert.deepEqual(result.browsers.map(b => [b.browser, b.action]), [['chrome', 'placed'], ['brave', 'placed']]);
  const chromeManifest = join(m.userHome, '.config/google-chrome/NativeMessagingHosts', MANIFEST);
  assert.deepEqual(JSON.parse(readFileSync(chromeManifest, 'utf8')), {
    allowed_origins: ['chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/', 'chrome-extension://odlomjlbamekndcpllcnffbgeohgkmjh/'],
    description: 'ChatGPT browser native messaging host', name: 'com.openai.codexextension', path: host, type: 'stdio'});
  const record = JSON.parse(readFileSync(join(m.runtime.home, 'chrome', 'registration.json'), 'utf8'));
  assert.deepEqual(Object.keys(record.browsers), ['chrome', 'brave']);
  const facts = chromeFacts({host: LINUX, env: {}, userHome: m.userHome});
  assert.deepEqual(facts.nativeHost({cuaHome: m.runtime.home, userHome: m.userHome}), {present: true, path: host, pathClass: 'cua'});

  const removed = unregisterHost({home: m.home, userHome: m.userHome, browsers: m.browsers, pins: m.pins});
  assert.equal(removed.blocked, false);
  assert.equal(existsSync(chromeManifest), false);
  assert.deepEqual(removed.browsers.filter(b => b.action !== 'absent').map(b => [b.browser, b.action]), [['chrome', 'removed'], ['brave', 'removed']]);
});

test('register on Linux with no browser under ~/.config refuses, naming the browsers and where it looked', async t => {
  const m = await linuxMachine(t);
  const empty = join(m.userHome, 'empty');
  await assert.rejects(registerHost({home: m.home, runtime: m.runtime, userHome: empty, browsers: browsersFor({host: LINUX, env: {}, userHome: empty}), pins: m.pins}), err => {
    assert.equal(err.code, 'no_supported_browser');
    assert.match(err.message, /Chrome, Chrome Beta, Chrome Unstable, Chromium, Edge, Brave, Opera or Vivaldi/);
    assert.ok(err.message.endsWith(`under ${join(empty, '.config')}`), err.message);
    return true;
  });
});

test('profiles open on Linux starts google-chrome detached in the profile and names the deb when it cannot', async t => {
  assert.deepEqual(openInvocation('Profile 6', {host: LINUX}), {command: 'google-chrome', args: ['--profile-directory=Profile 6'], detached: true});
  assert.deepEqual(openInvocation('Profile 6', {host: DARWIN}), {command: 'open', args: ['-n', '-a', 'Google Chrome', '--args', '--profile-directory=Profile 6']});
  const s = scratch();
  t.after(s.cleanup);
  const home = join(s.dir, 'cua');
  mkdirSync(home);
  const chrome = fakeChromeFacts({Default: {extension: 'installed'}});
  addProfile({home, key: 'me', directory: 'Default', chrome});
  const runs = [];
  const run = async (command, args, options) => { runs.push({command, args, options}); return {code: 0, stderr: ''}; };
  const result = await openCommand({home, key: 'me', chrome, run, host: LINUX, pollAt: [0], wait: async () => {}, listBackends: async () => ({backends: []})});
  assert.deepEqual(runs, [{command: 'google-chrome', args: ['--profile-directory=Default'], options: {detached: true}}]);
  assert.deepEqual(result.command, ['google-chrome', '--profile-directory=Default']);
  await assert.rejects(openCommand({home, key: 'me', chrome, host: LINUX, run: async () => ({code: 1, stderr: 'spawn google-chrome ENOENT'}), pollAt: [], listBackends: async () => ({backends: []})}), err => {
    assert.equal(err.code, 'chrome_open_failed');
    assert.match(err.hint, /google-chrome-stable/);
    return true;
  });
});
