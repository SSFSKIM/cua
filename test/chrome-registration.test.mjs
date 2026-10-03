// M12: `cua chrome register|unregister` against injected browser directories only. Nothing here reads or writes a real
// browser's NativeMessagingHosts directory: every test passes its own scratch `userHome`.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {registerHost, unregisterHost, BROWSERS} from '../src/chrome/registration.mjs';
import {resolveRuntime} from '../src/runtime/manifest.mjs';
import {scratch, forgeActiveRuntime, forgeChromeComponent, acceptSignatures} from './fixtures/runtime-fixture.mjs';

const expectCode = code => err => { assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`); return true; };
const MANIFEST = 'com.openai.codexextension.json';
// The desktop's manifest exactly as its installManifest writes it (bytes matter for the restore check), naming the
// desktop's plugin-cache host under the (scratch) user home.
const DESKTOP = Symbol('the desktop manifest');
const desktopBytes = userHome => ourManifest(join(userHome, '.codex/plugins/cache/openai-bundled/chrome/latest/extension-host/macos/arm64/ChatGPT for Chrome'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

// A cua home with an active forged runtime and its Chrome component, and a user home where Chrome (with a
// NativeMessagingHosts directory) and Brave (without one) have user-data directories; the other browsers do not.
function machine(t, {chromeManifest} = {}) {
  const s = scratch();
  t.after(s.cleanup);
  const home = join(s.dir, 'cua');
  mkdirSync(home);
  forgeActiveRuntime(home);
  const component = forgeChromeComponent(home);
  const userHome = join(s.dir, 'user');
  const support = join(userHome, 'Library', 'Application Support');
  const chromeDir = join(support, 'Google', 'Chrome', 'NativeMessagingHosts');
  mkdirSync(chromeDir, {recursive: true});
  mkdirSync(join(support, 'BraveSoftware', 'Brave-Browser'), {recursive: true});
  const original = chromeManifest === DESKTOP ? desktopBytes(userHome) : chromeManifest;
  if (original !== undefined) writeFileSync(join(chromeDir, MANIFEST), original);
  const runtime = resolveRuntime({home});
  const manifests = {
    chrome: join(chromeDir, MANIFEST),
    brave: join(support, 'BraveSoftware', 'Brave-Browser', 'NativeMessagingHosts', MANIFEST),
    edge: join(support, 'Microsoft Edge', 'NativeMessagingHosts', MANIFEST),
  };
  return {dir: s.dir, home, runtime, userHome, support, component, manifests, original, backups: join(runtime.home, 'chrome', 'manifest-backup')};
}
const register = (m, extra = {}) => registerHost({home: m.home, runtime: m.runtime, userHome: m.userHome, verifySignatures: acceptSignatures, ...extra});
const unregister = m => unregisterHost({home: m.home, userHome: m.userHome});
function ourManifest(host) { return `${JSON.stringify({allowed_origins: ['chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/', 'chrome-extension://odlomjlbamekndcpllcnffbgeohgkmjh/'], description: 'ChatGPT browser native messaging host', name: 'com.openai.codexextension', path: host, type: 'stdio'}, null, 2)}\n`; }
const record = m => JSON.parse(readFileSync(join(m.runtime.home, 'chrome', 'registration.json'), 'utf8'));

test('the browsers are Chrome, Edge, Brave, Opera and Vivaldi, each with its macOS manifest directory', () => {
  assert.deepEqual(Object.fromEntries(BROWSERS.map(b => [b.browser, b.dataDir])), {
    chrome: 'Library/Application Support/Google/Chrome',
    edge: 'Library/Application Support/Microsoft Edge',
    brave: 'Library/Application Support/BraveSoftware/Brave-Browser',
    opera: 'Library/Application Support/com.operasoftware.Opera',
    vivaldi: 'Library/Application Support/Vivaldi',
  });
});

test('register writes the vendor-format manifest naming our host into each browser whose user-data directory exists', async t => {
  const m = machine(t);
  const verified = [];
  const result = await register(m, {verifySignatures: async (root, pin) => { verified.push([root, pin.signing.components]); return acceptSignatures(root, pin); }});
  assert.equal(result.host, m.component.host);
  assert.deepEqual(result.browsers.map(b => [b.browser, b.action]), [['chrome', 'placed'], ['brave', 'placed']]);
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), ourManifest(m.component.host));
  assert.equal(readFileSync(m.manifests.brave, 'utf8'), ourManifest(m.component.host));
  // Browsers that are not there get nothing, not even a directory.
  assert.equal(existsSync(join(m.support, 'Microsoft Edge')), false);
  assert.equal(existsSync(join(m.support, 'Vivaldi')), false);
  // The host's signature is checked before any browser is pointed at it.
  assert.deepEqual(verified, [[m.component.root, ['extension-host/macos/arm64/ChatGPT for Chrome']]]);
  assert.deepEqual(record(m).browsers.chrome, {manifest: m.manifests.chrome, replaced: false});
  assert.equal(existsSync(m.backups), false);
});

test('register refuses when the desktop\'s manifest is present, naming its class, and changes nothing anywhere', async t => {
  const m = machine(t, {chromeManifest: DESKTOP});
  let verified = false;
  await assert.rejects(register(m, {verifySignatures: async () => { verified = true; return []; }}), err => {
    assert.equal(err.code, 'registration_in_use');
    assert.match(err.message, /chrome/);
    assert.match(err.message, /\(desktop\)/);
    assert.match(err.message, /the desktop's registration is in use and already works with `cua serve`/);
    assert.match(err.hint, /--replace/);
    return true;
  });
  assert.equal(verified, false);
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), m.original);
  assert.equal(existsSync(m.manifests.brave), false, 'all or nothing: Brave is not registered either');
  assert.equal(existsSync(join(m.runtime.home, 'chrome')), false);
});

test('a manifest naming some other host, or one that cannot be read, is not ours and is refused the same way', async t => {
  for (const [bytes, cls] of [[ourManifest('/opt/elsewhere/host'), 'other'], ['{not json', 'unreadable']]) {
    const m = machine(t, {chromeManifest: bytes});
    await assert.rejects(register(m), err => {
      assert.equal(err.code, 'registration_in_use');
      assert.match(err.message, new RegExp(`\\(${cls}\\)`));
      return true;
    });
    assert.equal(readFileSync(m.manifests.chrome, 'utf8'), bytes);
  }
});

test('--replace announces both consequences, backs the existing manifest up byte-for-byte, then registers our host', async t => {
  const m = machine(t, {chromeManifest: DESKTOP});
  const announced = [];
  const result = await register(m, {replace: true, onReplace: lines => announced.push({lines, chromeStill: readFileSync(m.manifests.chrome, 'utf8')})});
  assert.equal(announced.length, 1);
  const [{lines, chromeStill}] = announced;
  assert.equal(chromeStill, m.original, 'consequences are announced before anything is overwritten');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /side.panel|app-server/i);
  assert.match(lines[0], /chrome-native-hosts-v2\.json/);
  assert.match(lines[1], /re-?sync|rewrites/i);
  const backup = join(m.backups, 'chrome.json');
  assert.equal(readFileSync(backup, 'utf8'), m.original);
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), ourManifest(m.component.host));
  assert.deepEqual(result.browsers.map(b => [b.browser, b.action]), [['chrome', 'replaced'], ['brave', 'placed']]);
  assert.equal(result.browsers[0].backup, backup);
  assert.deepEqual(record(m).browsers.chrome, {manifest: m.manifests.chrome, replaced: true, backupSha256: sha(m.original)});
});

test('--replace with nothing foreign to replace announces nothing', async t => {
  const m = machine(t);
  let announced = false;
  await register(m, {replace: true, onReplace: () => { announced = true; }});
  assert.equal(announced, false);
});

test('register again is a no-op for our own manifest, and rewrites ours from another release without losing the backup', async t => {
  const m = machine(t, {chromeManifest: DESKTOP});
  await register(m, {replace: true, onReplace: () => {}});
  const again = await register(m);
  assert.deepEqual(again.browsers.map(b => [b.browser, b.action]), [['chrome', 'unchanged'], ['brave', 'unchanged']]);
  const olderRelease = join(m.runtime.home, 'runtimes', '0.0.1-darwin-arm64', 'chrome-plugin/extension-host/macos/arm64/ChatGPT for Chrome');
  writeFileSync(m.manifests.chrome, ourManifest(olderRelease));
  const updated = await register(m);
  assert.deepEqual(updated.browsers.map(b => [b.browser, b.action]), [['chrome', 'updated'], ['brave', 'unchanged']]);
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), ourManifest(m.component.host));
  assert.equal(record(m).browsers.chrome.replaced, true);
  assert.equal(readFileSync(join(m.backups, 'chrome.json'), 'utf8'), m.original);
});

test('unregister removes only our manifests and restores the backed-up one, verified byte-for-byte', async t => {
  const m = machine(t, {chromeManifest: DESKTOP});
  await register(m, {replace: true, onReplace: () => {}});
  const result = unregister(m);
  assert.equal(result.blocked, false);
  assert.deepEqual(result.browsers.filter(b => b.action !== 'absent').map(b => [b.browser, b.action, b.restoration]), [['chrome', 'restored', 'restored'], ['brave', 'removed', 'not_needed']]);
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), m.original);
  assert.equal(existsSync(m.manifests.brave), false);
  assert.equal(existsSync(join(m.backups, 'chrome.json')), false, 'a verified restore consumes its backup');
  assert.deepEqual(record(m).browsers, {});
  // A second unregister finds nothing of ours: a no-op.
  const again = unregister(m);
  assert.equal(again.blocked, false);
  assert.ok(again.browsers.every(b => b.action === 'not_ours' || b.action === 'absent'), JSON.stringify(again.browsers));
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), m.original);
});

test('unregister is a no-op when the manifest is not ours: it leaves the desktop\'s registration byte-for-byte', t => {
  const m = machine(t, {chromeManifest: DESKTOP});
  const result = unregister(m);
  assert.equal(result.blocked, false);
  assert.deepEqual(result.browsers.filter(b => b.action !== 'absent').map(b => [b.browser, b.action, b.pathClass]), [['chrome', 'not_ours', 'desktop']]);
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), m.original);
  assert.equal(existsSync(join(m.runtime.home, 'chrome')), false);
});

test('unregister reports restoration BLOCKED with the exact user action when the backup is gone or does not match', async t => {
  for (const damage of ['missing', 'tampered']) {
    const m = machine(t, {chromeManifest: DESKTOP});
    await register(m, {replace: true, onReplace: () => {}});
    const backup = join(m.backups, 'chrome.json');
    if (damage === 'missing') rmSync(backup);
    else writeFileSync(backup, m.original.replace('stdio', 'stdin'));
    const result = unregister(m);
    assert.equal(result.blocked, true, damage);
    const chrome = result.browsers.find(b => b.browser === 'chrome');
    assert.equal(chrome.action, 'removed', damage);
    assert.equal(chrome.restoration, 'blocked', damage);
    assert.ok(chrome.userAction.includes(m.manifests.chrome), chrome.userAction);
    assert.doesNotMatch(chrome.userAction, /will fix/i);
    assert.equal(existsSync(m.manifests.chrome), false, `${damage}: our manifest is still removed`);
    if (damage === 'tampered') assert.ok(existsSync(backup), 'an unverified backup is kept for the user');
  }
});

test('unregister of our manifest with no record of what it replaced is BLOCKED rather than assumed clean', t => {
  const m = machine(t);
  writeFileSync(m.manifests.chrome, ourManifest(m.component.host));
  const result = unregister(m);
  assert.equal(result.blocked, true);
  const chrome = result.browsers.find(b => b.browser === 'chrome');
  assert.equal(chrome.action, 'removed');
  assert.equal(chrome.restoration, 'blocked');
  assert.match(chrome.reason, /no record/);
  assert.ok(chrome.userAction.includes(m.manifests.chrome), chrome.userAction);
  assert.equal(existsSync(m.manifests.chrome), false);
});

test('an unreadable manifest replaced with --replace is backed up and restored exactly', async t => {
  const m = machine(t, {chromeManifest: '{not json'});
  await register(m, {replace: true, onReplace: () => {}});
  assert.equal(readFileSync(join(m.backups, 'chrome.json'), 'utf8'), '{not json');
  unregister(m);
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), '{not json');
});

test('register refuses before writing when the host signature fails, the component is missing, or no browser exists', async t => {
  const m = machine(t);
  await assert.rejects(register(m, {verifySignatures: async (root, pin) => pin.signing.components.map(c => ({component: c, valid: false, detail: 'bad'}))}), expectCode('signature_invalid'));
  assert.equal(existsSync(m.manifests.chrome), false);
  assert.equal(existsSync(m.manifests.brave), false);

  const noBrowser = machine(t);
  rmSync(join(noBrowser.userHome, 'Library'), {recursive: true});
  await assert.rejects(register(noBrowser), expectCode('no_supported_browser'));

  const noComponent = machine(t);
  rmSync(noComponent.component.root, {recursive: true});
  await assert.rejects(register(noComponent), err => {
    assert.equal(err.code, 'chrome_host_not_installed');
    assert.match(err.hint, /cua install/);
    return true;
  });
  assert.equal(existsSync(noComponent.manifests.chrome), false);
  assert.deepEqual(readdirSync(join(noComponent.support, 'Google', 'Chrome', 'NativeMessagingHosts')), []);
});
