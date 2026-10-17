// Chrome on Linux (Phase F): the browsers' native-messaging directories under ~/.config (honouring CHROME_CONFIG_HOME
// and XDG_CONFIG_HOME as the vendor's installManifest does), registration of cua's host there, profile discovery in
// ~/.config/google-chrome, and `profiles open` through google-chrome. Everything runs against scratch directories with
// the Linux host injected.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {browsersFor, registerCuaHost, unregisterCuaHost} from '../src/chrome/registration.mjs';
import {CUA_EXTENSION_ID, CUA_HOST_NAME, launcherPath} from '../src/chrome/extension.mjs';
import {chromeFacts, chromeUserData} from '../src/profiles/chrome.mjs';
import {openCommand, openInvocation} from '../src/profiles/commands.mjs';
import {scratch, shortScratch} from './fixtures/runtime-fixture.mjs';
import {fakeChromeFacts} from './fixtures/chrome-facts.mjs';
import {addProfile} from '../src/profiles/registry.mjs';

const LINUX = {platform: 'linux', arch: 'x64'};
const DARWIN = {platform: 'darwin', arch: 'arm64'};
const MANIFEST = `${CUA_HOST_NAME}.json`;
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

// A cua home, a checkout holding src/chrome/host.mjs, and a user home where Google Chrome and Brave have user-data
// directories under ~/.config.
function linuxMachine(t) {
  // Under /tmp: a home's socket path must fit 103 bytes, which a macOS per-user temp directory nearly exhausts.
  const s = shortScratch();
  t.after(s.cleanup);
  const dir = realpathSync(s.dir);
  const home = join(dir, 'cua');
  const checkout = join(dir, 'checkout');
  mkdirSync(join(checkout, 'src', 'chrome'), {recursive: true});
  writeFileSync(join(checkout, 'src', 'chrome', 'host.mjs'), '// host\n');
  const userHome = join(dir, 'user');
  for (const d of ['.config/google-chrome', '.config/BraveSoftware/Brave-Browser']) mkdirSync(join(userHome, d), {recursive: true});
  return {home, checkout, userHome, browsers: browsersFor({host: LINUX, env: {}, userHome})};
}

test('register on Linux writes cua\'s manifest naming this home\'s launcher into each present browser; unregister takes it back', async t => {
  const m = linuxMachine(t);
  const result = await registerCuaHost({home: m.home, checkout: m.checkout, browsers: m.browsers});
  const launcher = launcherPath(m.home);
  assert.equal(result.launcher, launcher);
  assert.deepEqual(result.browsers.map(b => [b.browser, b.action]), [['chrome', 'placed'], ['brave', 'placed']]);
  const chromeManifest = join(m.userHome, '.config/google-chrome/NativeMessagingHosts', MANIFEST);
  assert.deepEqual(JSON.parse(readFileSync(chromeManifest, 'utf8')), {
    allowed_origins: [`chrome-extension://${CUA_EXTENSION_ID}/`], description: 'cua browser native messaging host', name: CUA_HOST_NAME, path: launcher, type: 'stdio'});
  assert.ok(existsSync(join(m.userHome, '.config/BraveSoftware/Brave-Browser/NativeMessagingHosts', MANIFEST)));
  assert.deepEqual(chromeFacts({host: LINUX, env: {}, userHome: m.userHome}).nativeHost(), {present: true, path: launcher});

  const removed = unregisterCuaHost({home: m.home, browsers: m.browsers});
  assert.equal(removed.blocked, false);
  assert.equal(existsSync(chromeManifest), false);
  assert.deepEqual(removed.browsers.filter(b => b.action !== 'absent').map(b => [b.browser, b.action]), [['chrome', 'removed'], ['brave', 'removed']]);
});

test('register on Linux with no browser under ~/.config refuses, naming the browsers and where it looked', async t => {
  const m = linuxMachine(t);
  const empty = join(m.userHome, 'empty');
  await assert.rejects(registerCuaHost({home: m.home, checkout: m.checkout, browsers: browsersFor({host: LINUX, env: {}, userHome: empty})}), err => {
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

test('the fix for an unreadable Chrome directory is Full Disk Access on macOS only; on Linux it is plain file access', async () => {
  const {permissionFix} = await import('../src/profiles/chrome.mjs');
  assert.equal(permissionFix('darwin'), 'grant Full Disk Access to your terminal (System Settings → Privacy & Security → Full Disk Access), or run from a process that has it');
  assert.doesNotMatch(permissionFix('linux'), /Full Disk Access|System Settings/);
  assert.match(permissionFix('linux'), /read/);
});

test('relative XDG_CONFIG_HOME and CHROME_CONFIG_HOME are ignored, as the XDG Base Directory spec requires', () => {
  assert.equal(chromeUserData({host: LINUX, env: {XDG_CONFIG_HOME: 'cfg'}, userHome: '/home/u'}), '/home/u/.config/google-chrome');
  assert.equal(chromeUserData({host: LINUX, env: {CHROME_CONFIG_HOME: 'c', XDG_CONFIG_HOME: '/x'}, userHome: '/home/u'}), '/x/google-chrome');
  const table = tableOf(browsersFor({host: LINUX, env: {CHROME_CONFIG_HOME: 'c', XDG_CONFIG_HOME: 'x'}, userHome: '/home/u'}));
  assert.equal(table.chrome, '/home/u/.config/google-chrome');
  assert.equal(table.edge, '/home/u/.config/microsoft-edge');
});
