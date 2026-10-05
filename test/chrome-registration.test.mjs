// M12: `cua chrome register|unregister` against injected browser directories only. Nothing here reads or writes a real
// browser's NativeMessagingHosts directory: every test passes its own scratch `userHome`.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, chmodSync, linkSync, renameSync, openSync, writeSync, closeSync, statSync, fstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {registerHost, unregisterHost, BROWSERS, isOwnHostPath, hostSuffixes} from '../src/chrome/registration.mjs';
import {resolveRuntime, parsePin} from '../src/runtime/manifest.mjs';
import {chromeFacts} from '../src/profiles/chrome.mjs';
import {chromeChecks} from '../src/profiles/checks.mjs';
import {REPO, scratch, forgeActiveRuntime, forgeChromeComponent, acceptSignatures, realPinJson} from './fixtures/runtime-fixture.mjs';

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

test('without the desktop app, register fills only empty slots with nothing backed up, and unregister leaves them empty again', async t => {
  const m = machine(t);
  const result = await register(m);
  assert.ok(result.browsers.every(b => b.action === 'placed' && !b.backup), JSON.stringify(result.browsers));
  assert.equal(existsSync(m.backups), false);
  const removed = unregister(m);
  assert.equal(removed.blocked, false);
  assert.deepEqual(removed.browsers.filter(b => b.action !== 'absent').map(b => [b.browser, b.action, b.restoration]), [['chrome', 'removed', 'not_needed'], ['brave', 'removed', 'not_needed']]);
  for (const path of Object.values(m.manifests)) assert.equal(existsSync(path), false, path);
  assert.equal(existsSync(m.backups), false);
  assert.deepEqual(record(m).browsers, {});
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

// Review fix: only a whole native-messaging manifest becomes a backup. Anything else in the slot is left as it is,
// even with --replace, and reported contended (it may be mid-write) with the way to clear a damaged one.
test('a slot that does not hold a whole manifest is never backed up or replaced, even with --replace', async t => {
  const name = 'com.openai.codexextension';
  for (const bytes of ['{not json', '', '[]', JSON.stringify({name, type: 'stdio'}), JSON.stringify({name, type: 'stdio', path: ''}),
    JSON.stringify({name: 'com.example.other', type: 'stdio', path: '/opt/host'}), JSON.stringify({name, type: 'sockets', path: '/opt/host'})]) {
    const m = machine(t, {chromeManifest: bytes});
    const steps = [];
    await assert.rejects(register(m, {replace: true, onReplace: () => assert.fail('nothing may be announced'), onStep: name => steps.push(name)}), err => {
      assert.equal(err.code, 'registration_contended', bytes);
      assert.match(err.message, /did not read as a whole native-messaging manifest in 3 attempts/, bytes);
      assert.ok(err.hint.includes(`mv "${m.manifests.chrome}"`), err.hint);
      return true;
    });
    assert.deepEqual(steps, ['settle', 'settle'], `${bytes}: it waited between attempts and never took the file`);
    assert.equal(readFileSync(m.manifests.chrome, 'utf8'), bytes, bytes);
    assert.equal(existsSync(m.backups), false, bytes);
    assert.equal(existsSync(m.manifests.brave), false, `${bytes}: nothing else was registered`);
  }
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

test('register refuses before writing when the host configuration is missing or names paths outside the release', async t => {
  const gone = machine(t);
  rmSync(join(dirname(gone.component.host), 'extension-host-config.json'));
  await assert.rejects(register(gone), err => {
    assert.equal(err.code, 'host_config_invalid');
    assert.match(err.message, /extension-host-config\.json/);
    assert.match(err.hint, /cua install/);
    return true;
  });
  assert.equal(existsSync(gone.manifests.chrome), false);
  assert.equal(existsSync(gone.manifests.brave), false);

  for (const config of [{browserServicePath: '/Users/x/.codex/plugins/cache/openai-bundled/chrome/latest/scripts/browser-service.mjs'}, {codexHome: '/Users/x/.codex'}, {schemaVersion: 2}]) {
    const m = machine(t);
    forgeChromeComponent(m.home, {config});
    await assert.rejects(register(m), expectCode('host_config_invalid'), JSON.stringify(config));
    assert.equal(existsSync(m.manifests.chrome), false, JSON.stringify(config));
    assert.equal(existsSync(m.manifests.brave), false, JSON.stringify(config));
  }
});

// Review fixes (M12 frontier review): concurrent writers, late announcement, exact ownership, restoration I/O failure.
const hook = (browser, step, act) => (name, row) => { if (row.browser === browser && name === step) act(row); };

test('a manifest another program writes into an empty slot between cua\'s read and its write is never clobbered', async t => {
  const m = machine(t);
  const desktop = desktopBytes(m.userHome);
  await assert.rejects(register(m, {onStep: hook('chrome', 'publish', () => writeFileSync(m.manifests.chrome, desktop))}), expectCode('registration_in_use'));
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), desktop);
  assert.equal(record(m).browsers.chrome, undefined);
  assert.equal(existsSync(m.backups), false);
  // With --replace the newcomer takes the announced, backed-up path instead.
  const r = machine(t);
  const announced = [];
  let fired = false;
  const result = await register(r, {replace: true, onReplace: () => announced.push(readFileSync(r.manifests.chrome, 'utf8')),
    onStep: hook('chrome', 'publish', () => { if (!fired) { fired = true; writeFileSync(r.manifests.chrome, desktop); } })});
  assert.deepEqual(announced, [desktop]);
  assert.equal(result.browsers[0].action, 'replaced');
  assert.equal(readFileSync(join(r.backups, 'chrome.json'), 'utf8'), desktop);
  assert.equal(readFileSync(r.manifests.chrome, 'utf8'), ourManifest(r.component.host));
});

test('our manifest that turns foreign before cua takes or republishes it is neither overwritten nor removed', async t => {
  const older = m => join(m.runtime.home, 'runtimes', '0.0.1-darwin-arm64', 'chrome-plugin/extension-host/macos/arm64/ChatGPT for Chrome');
  for (const step of ['take', 'publish']) {
    const m = machine(t);
    const desktop = desktopBytes(m.userHome);
    writeFileSync(m.manifests.chrome, ourManifest(older(m)));
    await assert.rejects(register(m, {onStep: hook('chrome', step, () => writeFileSync(m.manifests.chrome, desktop))}), expectCode('registration_in_use'), step);
    assert.equal(readFileSync(m.manifests.chrome, 'utf8'), desktop, step);
  }
  const u = machine(t);
  const desktop = desktopBytes(u.userHome);
  writeFileSync(u.manifests.chrome, ourManifest(u.component.host));
  const result = unregisterHost({home: u.home, userHome: u.userHome, onStep: hook('chrome', 'take', () => writeFileSync(u.manifests.chrome, desktop))});
  assert.deepEqual([result.browsers[0].action, result.browsers[0].pathClass], ['not_ours', 'desktop']);
  assert.equal(readFileSync(u.manifests.chrome, 'utf8'), desktop);
});

test('a foreign manifest that appears during the signature check is announced before it is replaced', async t => {
  const m = machine(t);
  const desktop = desktopBytes(m.userHome);
  const announced = [];
  const result = await register(m, {replace: true,
    verifySignatures: async (root, pin) => { mkdirSync(dirname(m.manifests.brave), {recursive: true}); writeFileSync(m.manifests.brave, desktop); return acceptSignatures(root, pin); },
    onReplace: lines => announced.push({lines, brave: readFileSync(m.manifests.brave, 'utf8')})});
  assert.equal(announced.length, 1);
  assert.equal(announced[0].lines.length, 2);
  assert.equal(announced[0].brave, desktop, 'announced while the foreign manifest is still in place');
  assert.deepEqual(result.browsers.map(b => [b.browser, b.action]), [['chrome', 'placed'], ['brave', 'replaced']]);
  assert.equal(readFileSync(join(m.backups, 'brave.json'), 'utf8'), desktop);
  // Without --replace the late arrival is refused and left in place.
  const n = machine(t);
  await assert.rejects(register(n, {verifySignatures: async (root, pin) => { mkdirSync(dirname(n.manifests.brave), {recursive: true}); writeFileSync(n.manifests.brave, desktop); return acceptSignatures(root, pin); }}), expectCode('registration_in_use'));
  assert.equal(readFileSync(n.manifests.brave, 'utf8'), desktop);
});

test('only the pinned Chrome host location of a release counts as cua\'s; other executables and escaping paths do not', async t => {
  const m = machine(t);
  const runtimes = join(m.runtime.home, 'runtimes');
  const suffixes = hostSuffixes([parsePin(realPinJson())]);
  const own = p => isOwnHostPath(p, {home: m.runtime.home, suffixes});
  assert.equal(own(m.component.host), true);
  assert.equal(own(join(runtimes, '0.0.1-darwin-arm64/chrome-plugin/extension-host/macos/arm64/ChatGPT for Chrome')), true);
  for (const path of [
    join(runtimes, m.runtime.release, 'cua_node/bin/node'),
    join(runtimes, m.runtime.release, 'chrome-plugin/scripts/browser-service.mjs'),
    `${runtimes}/${m.runtime.release}/chrome-plugin/../chrome-plugin/extension-host/macos/arm64/ChatGPT for Chrome`,
    `${runtimes}//${m.runtime.release}/chrome-plugin/extension-host/macos/arm64/ChatGPT for Chrome`,
    join(runtimes, 'evil/chrome-plugin/extension-host/macos/arm64/ChatGPT for Chrome'),
    join(runtimes, 'chrome-plugin/extension-host/macos/arm64/ChatGPT for Chrome'),
    'runtimes/x/chrome-plugin/extension-host/macos/arm64/ChatGPT for Chrome',
  ]) assert.equal(own(path), false, path);
  // A manifest naming the runtime's node is not cua's: register refuses it and unregister leaves it.
  const node = ourManifest(join(runtimes, m.runtime.release, 'cua_node/bin/node'));
  writeFileSync(m.manifests.chrome, node);
  await assert.rejects(register(m), expectCode('registration_in_use'));
  assert.equal(unregister(m).browsers[0].action, 'not_ours');
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), node);
});

test('a restore that cannot write is BLOCKED for that browser with the manual recovery, and every browser is processed', async t => {
  const m = machine(t, {chromeManifest: DESKTOP});
  await register(m, {replace: true, onReplace: () => {}});
  const dir = dirname(m.manifests.chrome);
  chmodSync(dir, 0o555);
  let result;
  try { result = unregister(m); } finally { chmodSync(dir, 0o755); }
  assert.equal(result.blocked, true);
  const [chrome, brave] = result.browsers.filter(b => b.action !== 'absent');
  assert.equal(chrome.browser, 'chrome');
  assert.equal(chrome.action, 'not_removed');
  assert.equal(chrome.restoration, 'blocked');
  assert.match(chrome.reason, /EACCES/);
  const backup = join(m.backups, 'chrome.json');
  assert.ok(chrome.userAction.includes(backup) && chrome.userAction.includes(m.manifests.chrome), chrome.userAction);
  assert.equal(readFileSync(backup, 'utf8'), m.original, 'backup kept');
  assert.equal(record(m).browsers.chrome.replaced, true, 'record kept');
  assert.deepEqual([brave.browser, brave.action, brave.restoration], ['brave', 'removed', 'not_needed']);
  // Once the cause is fixed, unregister completes the restore.
  const again = unregister(m);
  assert.equal(again.blocked, false);
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), m.original);
});

test('a restore that does not read back as the backup is BLOCKED and keeps the backup and its record', async t => {
  const m = machine(t, {chromeManifest: DESKTOP});
  await register(m, {replace: true, onReplace: () => {}});
  const result = unregisterHost({home: m.home, userHome: m.userHome, onStep: hook('chrome', 'restored', () => writeFileSync(m.manifests.chrome, 'changed under us'))});
  const chrome = result.browsers[0];
  assert.deepEqual([chrome.action, chrome.restoration], ['restored', 'blocked']);
  assert.match(chrome.reason, /does not read back/);
  assert.equal(readFileSync(join(m.backups, 'chrome.json'), 'utf8'), m.original);
  assert.equal(record(m).browsers.chrome.replaced, true);
  assert.equal(result.browsers.find(b => b.browser === 'brave').restoration, 'not_needed');
});

// Re-review fix: a taken manifest always goes back when what follows the take fails, and a failed rollback is never silent.
const eio = () => Object.assign(new Error('EIO: injected'), {code: 'EIO'});
// node:fs with linkSync failing for links into `manifestPath`: from a temp file (the publish) and/or from a taken
// file (the rollback); and readFileSync failing for taken files.
function failingIo({manifestPath, publish = false, rollback = false, readTaken = false}) {
  return {
    linkSync: (from, to) => {
      if (to === manifestPath && ((publish && from.endsWith('.tmp')) || (rollback && from.endsWith('.taken')))) throw eio();
      return linkSync(from, to);
    },
    renameSync, writeFileSync,
    readFileSync: (path, ...rest) => { if (readTaken && String(path).endsWith('.taken')) throw eio(); return readFileSync(path, ...rest); },
  };
}
const hidden = path => readdirSync(dirname(path)).filter(name => name.startsWith('.'));
const olderHost = m => join(m.runtime.home, 'runtimes', '0.0.1-darwin-arm64', 'chrome-plugin/extension-host/macos/arm64/ChatGPT for Chrome');

test('a failed publish after taking the manifest puts it back, for an update and for a replacement', async t => {
  const u = machine(t);
  const older = ourManifest(olderHost(u));
  writeFileSync(u.manifests.chrome, older);
  await assert.rejects(register(u, {io: failingIo({manifestPath: u.manifests.chrome, publish: true})}), err => {
    assert.equal(err.code, 'manifest_write_failed');
    assert.match(err.message, /EIO/);
    assert.match(err.message, /back in place/);
    return true;
  });
  assert.equal(readFileSync(u.manifests.chrome, 'utf8'), older);
  assert.deepEqual(hidden(u.manifests.chrome), []);

  const r = machine(t, {chromeManifest: DESKTOP});
  await assert.rejects(register(r, {replace: true, onReplace: () => {}, io: failingIo({manifestPath: r.manifests.chrome, publish: true})}), expectCode('manifest_write_failed'));
  assert.equal(readFileSync(r.manifests.chrome, 'utf8'), r.original);
  assert.deepEqual(hidden(r.manifests.chrome), []);
});

test('a failed rollback keeps the taken bytes and names their path with the exact restore command', async t => {
  for (const kind of ['update', 'replacement']) {
    const m = machine(t, kind === 'replacement' ? {chromeManifest: DESKTOP} : {});
    const before = kind === 'update' ? ourManifest(olderHost(m)) : m.original;
    if (kind === 'update') writeFileSync(m.manifests.chrome, before);
    let error;
    await register(m, {replace: true, onReplace: () => {}, io: failingIo({manifestPath: m.manifests.chrome, publish: true, rollback: true})}).catch(e => { error = e; });
    assert.equal(error?.code, 'manifest_rollback_failed', kind);
    const [aside] = hidden(m.manifests.chrome);
    assert.ok(aside?.endsWith('.taken'), `${kind}: ${hidden(m.manifests.chrome)}`);
    const asidePath = join(dirname(m.manifests.chrome), aside);
    assert.equal(readFileSync(asidePath, 'utf8'), before, kind);
    assert.ok(error.message.includes(asidePath), error.message);
    assert.equal(error.hint, `restore it yourself: mv "${asidePath}" "${m.manifests.chrome}"`);
    assert.equal(existsSync(m.manifests.chrome), false, kind);
  }
});

test('a failure while checking a taken manifest puts it back', async t => {
  const m = machine(t);
  const older = ourManifest(olderHost(m));
  writeFileSync(m.manifests.chrome, older);
  await assert.rejects(register(m, {io: failingIo({manifestPath: m.manifests.chrome, readTaken: true})}), expectCode('manifest_write_failed'));
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), older);
  assert.deepEqual(hidden(m.manifests.chrome), []);
});

test('unregister puts cua\'s manifest back when the restore cannot be published, and names the aside file if that fails too', async t => {
  const m = machine(t, {chromeManifest: DESKTOP});
  await register(m, {replace: true, onReplace: () => {}});
  const ours = readFileSync(m.manifests.chrome, 'utf8');
  const result = unregisterHost({home: m.home, userHome: m.userHome, io: failingIo({manifestPath: m.manifests.chrome, publish: true})});
  const chrome = result.browsers[0];
  assert.deepEqual([chrome.action, chrome.restoration], ['not_removed', 'blocked']);
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), ours);
  assert.equal(readFileSync(join(m.backups, 'chrome.json'), 'utf8'), m.original);
  assert.deepEqual(hidden(m.manifests.chrome), []);

  const both = unregisterHost({home: m.home, userHome: m.userHome, io: failingIo({manifestPath: m.manifests.chrome, publish: true, rollback: true})});
  const [aside] = hidden(m.manifests.chrome);
  const asidePath = join(dirname(m.manifests.chrome), aside);
  assert.equal(readFileSync(asidePath, 'utf8'), ours);
  assert.equal(both.browsers[0].restoration, 'blocked');
  assert.ok(both.browsers[0].userAction.includes(`mv "${asidePath}" "${m.manifests.chrome}"`), both.browsers[0].userAction);
});

test('a manifest that changed before the take is put back, and a failed put-back names the aside file', async t => {
  for (const command of ['register', 'unregister']) {
    const m = machine(t);
    const desktop = desktopBytes(m.userHome);
    writeFileSync(m.manifests.chrome, ourManifest(command === 'register' ? olderHost(m) : m.component.host));
    // Turn the slot foreign just before the take, and fail the link that would put it back.
    const options = {onStep: hook('chrome', 'take', () => writeFileSync(m.manifests.chrome, desktop)), io: failingIo({manifestPath: m.manifests.chrome, rollback: true})};
    let error, result;
    if (command === 'register') await register(m, options).catch(e => { error = e; });
    else result = unregisterHost({home: m.home, userHome: m.userHome, ...options});
    const [aside] = hidden(m.manifests.chrome);
    assert.ok(aside?.endsWith('.taken'), `${command}: ${hidden(m.manifests.chrome)}`);
    const asidePath = join(dirname(m.manifests.chrome), aside);
    assert.equal(readFileSync(asidePath, 'utf8'), desktop, command);
    const restore = `mv "${asidePath}" "${m.manifests.chrome}"`;
    if (command === 'register') {
      assert.equal(error?.code, 'manifest_rollback_failed');
      assert.match(error.message, /changed after cua read it/);
      assert.ok(error.message.includes(asidePath), error.message);
      assert.equal(error.hint, `restore it yourself: ${restore}`);
    } else {
      const chrome = result.browsers[0];
      assert.equal(chrome.restoration, 'blocked');
      assert.ok(chrome.userAction.includes(restore), chrome.userAction);
    }
  }
  // Without the injected failure the mismatched manifest goes straight back.
  const ok = machine(t);
  const desktop = desktopBytes(ok.userHome);
  writeFileSync(ok.manifests.chrome, ourManifest(olderHost(ok)));
  await assert.rejects(register(ok, {onStep: hook('chrome', 'take', () => writeFileSync(ok.manifests.chrome, desktop))}), expectCode('registration_in_use'));
  assert.equal(readFileSync(ok.manifests.chrome, 'utf8'), desktop);
  assert.deepEqual(hidden(ok.manifests.chrome), []);
});

// Final-review fixes: a backup is restored only with its recorded hash; a mid-run refusal undoes this run's writes.
test('a backup without a matching recorded hash is never restored: our manifest is removed, the backup kept, BLOCKED', async t => {
  for (const variant of ['no record', 'record without a hash']) {
    const m = machine(t);
    writeFileSync(m.manifests.chrome, ourManifest(m.component.host));
    const stale = ourManifest('/Applications/Other.app/Contents/MacOS/other-host');
    mkdirSync(m.backups, {recursive: true});
    writeFileSync(join(m.backups, 'chrome.json'), stale);
    if (variant === 'record without a hash') {
      mkdirSync(join(m.runtime.home, 'chrome'), {recursive: true});
      writeFileSync(join(m.runtime.home, 'chrome', 'registration.json'), JSON.stringify({schema: 1, browsers: {chrome: {manifest: m.manifests.chrome, replaced: true}}}));
    }
    const result = unregister(m);
    const chrome = result.browsers[0];
    assert.deepEqual([chrome.action, chrome.restoration], ['removed', 'blocked'], variant);
    assert.match(chrome.reason, /unverified|no record|does not match/, variant);
    assert.ok(chrome.userAction.includes(join(m.backups, 'chrome.json')) && chrome.userAction.includes(m.manifests.chrome), chrome.userAction);
    assert.equal(existsSync(m.manifests.chrome), false, `${variant}: the stale backup is not installed`);
    assert.equal(readFileSync(join(m.backups, 'chrome.json'), 'utf8'), stale, `${variant}: the backup is kept`);
    assert.equal(result.blocked, true);
  }
});

const lateBrave = (m, desktop) => async (root, pin) => { mkdirSync(dirname(m.manifests.brave), {recursive: true}); writeFileSync(m.manifests.brave, desktop); return acceptSignatures(root, pin); };

test('a refusal found after earlier browsers were registered undoes them, so "Nothing was changed" is true', async t => {
  const m = machine(t);
  const desktop = desktopBytes(m.userHome);
  await assert.rejects(register(m, {verifySignatures: lateBrave(m, desktop)}), err => {
    assert.equal(err.code, 'registration_in_use');
    assert.match(err.message, /Nothing was changed/);
    return true;
  });
  assert.equal(existsSync(m.manifests.chrome), false);
  assert.equal(readFileSync(m.manifests.brave, 'utf8'), desktop);
  assert.deepEqual(record(m).browsers, {});
  assert.deepEqual(hidden(m.manifests.chrome), []);

});

test('an apply-time failure undoes the run\'s update and replacement, restoring the bytes that were there', async t => {
  const m = machine(t, {chromeManifest: DESKTOP});
  const priorBrave = ourManifest(olderHost(m));
  mkdirSync(dirname(m.manifests.brave), {recursive: true});
  writeFileSync(m.manifests.brave, priorBrave);
  // Vivaldi comes last; its publish fails, after Chrome was replaced and Brave updated.
  mkdirSync(join(m.support, 'Vivaldi'), {recursive: true});
  const vivaldi = join(m.support, 'Vivaldi', 'NativeMessagingHosts', 'com.openai.codexextension.json');
  await assert.rejects(register(m, {replace: true, onReplace: () => {}, io: failingIo({manifestPath: vivaldi, publish: true})}), err => {
    assert.equal(err.code, 'manifest_write_failed');
    assert.match(err.message, /undid/);
    return true;
  });
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), m.original);
  assert.equal(readFileSync(m.manifests.brave, 'utf8'), priorBrave);
  assert.equal(existsSync(vivaldi), false);
  assert.equal(existsSync(join(m.backups, 'chrome.json')), false);
  assert.deepEqual(record(m).browsers, {});
});

test('undoing preserves a concurrent writer\'s file, and an undo that cannot complete reports the partial state', async t => {
  const m = machine(t);
  const desktop = desktopBytes(m.userHome);
  await assert.rejects(register(m, {verifySignatures: lateBrave(m, desktop), onStep: hook('chrome', 'undo', () => writeFileSync(m.manifests.chrome, desktop))}), expectCode('registration_in_use'));
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), desktop, 'the writer\'s file stands');
  assert.deepEqual(hidden(m.manifests.chrome), []);

  const p = machine(t);
  const failRename = {linkSync, writeFileSync, readFileSync, renameSync: (from, to) => { if (from === p.manifests.chrome) throw eio(); return renameSync(from, to); }};
  let error;
  await register(p, {verifySignatures: lateBrave(p, desktop), io: failRename}).catch(e => { error = e; });
  assert.equal(error?.code, 'registration_partial');
  assert.doesNotMatch(error.message, /Nothing was changed/);
  assert.match(error.message, /chrome/);
  assert.match(error.hint, /cua chrome unregister/);
  assert.equal(readFileSync(p.manifests.chrome, 'utf8'), ourManifest(p.component.host));
  assert.deepEqual(record(p).browsers.chrome, {manifest: p.manifests.chrome, replaced: false});
  // The recovery the error names works.
  const after = unregister(p);
  assert.deepEqual([after.browsers[0].action, after.browsers[0].restoration], ['removed', 'not_needed']);
});

// Re-review of the undo path: recovery data is discarded only once the earlier manifest is confirmed back, or no cua
// registration remains that needs it.
test('an undo that finds another cua-owned manifest in the slot keeps the backup and record and reports the partial state', async t => {
  for (const step of ['undo', 'undo-publish']) {
    const m = machine(t, {chromeManifest: DESKTOP});
    mkdirSync(join(m.support, 'Vivaldi'), {recursive: true});
    const vivaldi = join(m.support, 'Vivaldi', 'NativeMessagingHosts', 'com.openai.codexextension.json');
    const otherCua = ourManifest(olderHost(m));
    let error;
    await register(m, {replace: true, onReplace: () => {}, io: failingIo({manifestPath: vivaldi, publish: true}),
      onStep: hook('chrome', step, () => writeFileSync(m.manifests.chrome, otherCua))}).catch(e => { error = e; });
    assert.equal(error?.code, 'registration_partial', step);
    assert.ok(error.message.includes(m.manifests.chrome), error.message);
    assert.match(error.message, /unconfirmed/);
    assert.equal(readFileSync(m.manifests.chrome, 'utf8'), otherCua, `${step}: the concurrent writer's manifest stands`);
    assert.equal(readFileSync(join(m.backups, 'chrome.json'), 'utf8'), m.original, `${step}: backup kept`);
    assert.deepEqual(record(m).browsers.chrome, {manifest: m.manifests.chrome, replaced: true, backupSha256: sha(m.original)}, step);
    // The kept recovery data lets unregister finish the job.
    const after = unregister(m);
    assert.deepEqual([after.browsers[0].action, after.browsers[0].restoration], ['restored', 'restored'], step);
    assert.equal(readFileSync(m.manifests.chrome, 'utf8'), m.original, step);
  }
});

test('an undo that finds a foreign manifest in the slot leaves it standing; no cua registration remains to need the backup', async t => {
  for (const step of ['undo', 'undo-publish']) {
    const m = machine(t, {chromeManifest: DESKTOP});
    mkdirSync(join(m.support, 'Vivaldi'), {recursive: true});
    const vivaldi = join(m.support, 'Vivaldi', 'NativeMessagingHosts', 'com.openai.codexextension.json');
    const other = ourManifest('/Applications/Other.app/Contents/MacOS/other-host');
    let error;
    await register(m, {replace: true, onReplace: () => {}, io: failingIo({manifestPath: vivaldi, publish: true}),
      onStep: hook('chrome', step, () => writeFileSync(m.manifests.chrome, other))}).catch(e => { error = e; });
    assert.equal(error?.code, 'manifest_write_failed', step);
    assert.match(error.message, /another program's manifest now stands/, step);
    assert.equal(readFileSync(m.manifests.chrome, 'utf8'), other, step);
    assert.equal(record(m).browsers.chrome, undefined, step);
    assert.deepEqual(hidden(m.manifests.chrome), [], step);
  }
});

test('a backup that cannot be removed after a confirmed undo does not stop the other undos, and is reported', async t => {
  const m = machine(t, {chromeManifest: DESKTOP});
  const braveDesktop = desktopBytes(m.userHome);
  mkdirSync(dirname(m.manifests.brave), {recursive: true});
  writeFileSync(m.manifests.brave, braveDesktop);
  mkdirSync(join(m.support, 'Vivaldi'), {recursive: true});
  const vivaldi = join(m.support, 'Vivaldi', 'NativeMessagingHosts', 'com.openai.codexextension.json');
  let error;
  try {
    // The backup directory turns unwritable as the undo starts (Brave first, newest first).
    await register(m, {replace: true, onReplace: () => {}, io: failingIo({manifestPath: vivaldi, publish: true}),
      onStep: (name, row) => { if (name === 'undo' && row.browser === 'brave') chmodSync(m.backups, 0o555); }}).catch(e => { error = e; });
  } finally { chmodSync(m.backups, 0o700); }
  assert.equal(error?.code, 'registration_partial');
  assert.equal(readFileSync(m.manifests.brave, 'utf8'), braveDesktop, 'brave undone');
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), m.original, 'chrome undone after brave\'s cleanup failed');
  for (const browser of ['chrome', 'brave']) {
    const backup = join(m.backups, `${browser}.json`);
    assert.ok(error.message.includes(backup), error.message);
    assert.ok(error.hint.includes(`rm "${backup}"`), error.hint);
    assert.equal(record(m).browsers[browser].replaced, true, `${browser}: record entry kept with its leftover backup`);
  }
  assert.match(error.message, /EACCES/);
  assert.equal(existsSync(vivaldi), false);
});

// Review fix: two cua processes sharing a home interleaved. The second saw the slot the first had emptied by taking the
// desktop's manifest aside, replaced its recovery entry with replaced:false and published; a later unregister then
// removed the registration instead of restoring the original. register and unregister now hold the home's lock.
const lockPath = m => join(m.runtime.home, 'chrome', 'registration.lock');
const FAST = {waitMs: 150, pollMs: 10};
const moduleUrl = rel => JSON.stringify(pathToFileURL(join(REPO, rel)).href);

// Runs register or unregister in a separate real process on the same homes, returning its outcome.
function otherProcess(m, command) {
  const script = `
    import {registerHost, unregisterHost} from ${moduleUrl('src/chrome/registration.mjs')};
    import {resolveRuntime} from ${moduleUrl('src/runtime/manifest.mjs')};
    import {acceptSignatures} from ${moduleUrl('test/fixtures/runtime-fixture.mjs')};
    const {CUA_TEST_HOME: home, CUA_TEST_USER_HOME: userHome, CUA_TEST_COMMAND: command} = process.env;
    const lockTiming = {waitMs: 200, pollMs: 10};
    try {
      const result = command === 'register'
        ? await registerHost({home, runtime: resolveRuntime({home}), userHome, verifySignatures: acceptSignatures, lockTiming})
        : unregisterHost({home, userHome, lockTiming});
      console.log(JSON.stringify({ok: true, result}));
    } catch (error) { console.log(JSON.stringify({ok: false, code: error.code, message: error.message})); }`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {env: {...process.env, CUA_TEST_HOME: m.home, CUA_TEST_USER_HOME: m.userHome, CUA_TEST_COMMAND: command}, encoding: 'utf8', timeout: 30_000});
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout.trim().split('\n').at(-1));
}

test('a second cua process cannot act while the first is mid-replacement, so the original manifest is still restored', async t => {
  for (const command of ['register', 'unregister']) {
    const m = machine(t, {chromeManifest: DESKTOP});
    let other;
    // The first run pauses with the desktop's manifest taken aside, backed up and recorded, right before publishing.
    const result = await register(m, {replace: true, onReplace: () => {}, onStep: hook('chrome', 'publish', () => {
      assert.equal(existsSync(m.manifests.chrome), false, 'the slot is empty at this moment');
      other = otherProcess(m, command);
    })});
    assert.deepEqual({ok: other.ok, code: other.code}, {ok: false, code: 'registration_contended'}, command);
    assert.match(other.message, new RegExp(`process ${process.pid}`), command);
    assert.deepEqual(result.browsers.map(b => [b.browser, b.action]), [['chrome', 'replaced'], ['brave', 'placed']], command);
    assert.deepEqual(record(m).browsers.chrome, {manifest: m.manifests.chrome, replaced: true, backupSha256: sha(m.original)}, command);
    const after = unregister(m);
    assert.deepEqual([after.browsers[0].action, after.browsers[0].restoration], ['restored', 'restored'], command);
    assert.equal(readFileSync(m.manifests.chrome, 'utf8'), m.original, command);
  }
});

test('register and unregister wait for a running holder of the home\'s lock, then refuse registration_contended and change nothing', async t => {
  const m = machine(t, {chromeManifest: DESKTOP});
  mkdirSync(join(m.runtime.home, 'chrome'));
  const held = `${JSON.stringify({pid: process.pid, token: 'another run'})}\n`;
  writeFileSync(lockPath(m), held);
  const started = Date.now();
  await assert.rejects(register(m, {replace: true, onReplace: () => assert.fail('nothing may be announced'), lockTiming: FAST}), err => {
    assert.equal(err.code, 'registration_contended');
    assert.match(err.message, new RegExp(`process ${process.pid}.*nothing was changed`));
    assert.ok(err.hint.includes(lockPath(m)), err.hint);
    return true;
  });
  assert.ok(Date.now() - started >= FAST.waitMs, 'it waited for the holder first');
  assert.throws(() => unregisterHost({home: m.home, userHome: m.userHome, lockTiming: FAST}), expectCode('registration_contended'));
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), m.original);
  assert.equal(existsSync(m.manifests.brave), false);
  assert.deepEqual(readdirSync(join(m.runtime.home, 'chrome')), ['registration.lock'], 'no record, no backup');
  assert.equal(readFileSync(lockPath(m), 'utf8'), held, 'a live holder\'s lock is never removed');
  // A lock that names no process cannot be judged stale, so it is never broken either.
  writeFileSync(lockPath(m), '');
  await assert.rejects(register(m, {lockTiming: FAST}), err => err.code === 'registration_contended' && /names no process/.test(err.message) && err.hint.includes(`rm "${lockPath(m)}"`));
  assert.equal(readFileSync(lockPath(m), 'utf8'), '');
  rmSync(lockPath(m));
  const done = await register(m, {replace: true, onReplace: () => {}, lockTiming: FAST});
  assert.deepEqual(done.browsers.map(b => b.action), ['replaced', 'placed']);
});

test('a lock left by a process that no longer runs is broken, and no run leaves its lock behind', async t => {
  const m = machine(t, {chromeManifest: DESKTOP});
  const dead = spawnSync(process.execPath, ['-e', '']).pid;
  const stale = `${JSON.stringify({pid: dead, token: 'crashed run'})}\n`;
  mkdirSync(join(m.runtime.home, 'chrome'));
  writeFileSync(lockPath(m), stale);
  const result = await register(m, {replace: true, onReplace: () => {}, lockTiming: FAST});
  assert.deepEqual(result.browsers.map(b => b.action), ['replaced', 'placed']);
  assert.deepEqual(readdirSync(join(m.runtime.home, 'chrome')).sort(), ['manifest-backup', 'registration.json']);
  writeFileSync(lockPath(m), stale);
  assert.equal(unregisterHost({home: m.home, userHome: m.userHome, lockTiming: FAST}).blocked, false);
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), m.original);
  assert.deepEqual(readdirSync(join(m.runtime.home, 'chrome')).sort(), ['manifest-backup', 'registration.json']);
});

// Review fix: the vendor installer publishes with an asynchronous writeFile (truncating open, then write). A read in
// between saw an empty manifest, which was backed up over the verified backup; the write then landed on the inode cua
// had taken aside and deleted, and unregister later "restored" the empty manifest and deleted the real backup.
const resynced = userHome => ourManifest(join(userHome, '.codex/plugins/cache/openai-bundled/chrome/26.999/extension-host/macos/arm64/ChatGPT for Chrome'));

test('a manifest caught between its writer\'s truncate and write is not backed up; cua waits and backs up the whole one', async t => {
  const m = machine(t, {chromeManifest: DESKTOP});
  await register(m, {replace: true, onReplace: () => {}});
  // The desktop re-syncs its manifest over cua's: opened (truncated) now, written a moment later.
  const later = resynced(m.userHome);
  const fd = openSync(m.manifests.chrome, 'w');
  const announced = [];
  let settled = 0;
  const result = await register(m, {replace: true, onReplace: () => announced.push(readFileSync(m.manifests.chrome, 'utf8')),
    onStep: hook('chrome', 'settle', () => { settled++; writeSync(fd, later); closeSync(fd); })});
  assert.equal(settled, 1);
  assert.deepEqual(announced, [later], 'announced once the whole manifest is there, before replacing it');
  assert.deepEqual(result.browsers.map(b => [b.browser, b.action]), [['chrome', 'replaced'], ['brave', 'unchanged']]);
  assert.equal(readFileSync(join(m.backups, 'chrome.json'), 'utf8'), later);
  assert.deepEqual(record(m).browsers.chrome, {manifest: m.manifests.chrome, replaced: true, backupSha256: sha(later)});
  const after = unregister(m);
  assert.deepEqual([after.browsers[0].action, after.browsers[0].restoration], ['restored', 'restored']);
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), later);
});

test('a manifest that stays truncated is left to its writer and never overwrites the verified backup: registration_contended', async t => {
  const m = machine(t, {chromeManifest: DESKTOP});
  await register(m, {replace: true, onReplace: () => {}});
  const verified = record(m).browsers.chrome;
  const fd = openSync(m.manifests.chrome, 'w');
  try {
    await assert.rejects(register(m, {replace: true, onReplace: () => assert.fail('nothing may be announced')}), err => {
      assert.equal(err.code, 'registration_contended');
      assert.match(err.message, /whole native-messaging manifest/);
      return true;
    });
    assert.equal(readFileSync(join(m.backups, 'chrome.json'), 'utf8'), m.original, 'the verified backup is untouched');
    assert.deepEqual(record(m).browsers.chrome, verified);
    assert.equal(statSync(m.manifests.chrome).ino, fstatSync(fd).ino, 'the writer\'s file is still in the slot, never taken aside');
    // The writer's write lands in the slot, where it belongs.
    writeSync(fd, resynced(m.userHome));
  } finally { closeSync(fd); }
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), resynced(m.userHome));
});

// ---- Browser directories this process may not read (macOS privacy protection) -------------------------------------

// Mode 000 stands in for macOS's EPERM without Full Disk Access: a non-root process gets EACCES. Each denied path is
// one place the refusal can come from: the browser's user-data directory itself (what macOS protects), its parent
// (the user-data directory cannot even be stat'ed, so whether the browser is there is unknown), or the manifest
// directory. Permissions are restored before anything is checked or removed.
const asRoot = process.getuid?.() === 0;
const denied = (path, body) => { chmodSync(path, 0o000); try { return body(); } finally { chmodSync(path, 0o755); } };
const deniedAsync = async (path, body) => { chmodSync(path, 0o000); try { return await body(); } finally { chmodSync(path, 0o755); } };
const DENIED = ['Google/Chrome', 'Google', 'Google/Chrome/NativeMessagingHosts'];
const unreadableRefusal = command => err => {
  assert.equal(err.code, 'chrome_data_unreadable', err.message);
  assert.match(err.message, /cannot read the native-messaging directory of Google Chrome \(.*NativeMessagingHosts: EACCES\), so whether com\.openai\.codexextension is registered there is unknown\. Nothing was changed\.$/);
  assert.match(err.hint, new RegExp(`Full Disk Access.*then run \`cua chrome ${command}\` again`));
  return true;
};

test('register refuses as a whole when a browser directory cannot be read, naming the fix, and writes nothing anywhere', {skip: asRoot}, async t => {
  for (const relative of DENIED) {
    const m = machine(t);
    await deniedAsync(join(m.support, relative), () => assert.rejects(register(m), unreadableRefusal('register')), relative);
    assert.equal(existsSync(m.manifests.chrome), false, relative);
    assert.equal(existsSync(m.manifests.brave), false, `${relative}: Brave, which is readable, is not registered either`);
    assert.equal(existsSync(join(m.runtime.home, 'chrome')), false, relative);
  }
  // A foreign manifest elsewhere does not mask the cause: the unreadable directory is what is named.
  const m = machine(t);
  mkdirSync(dirname(m.manifests.brave), {recursive: true});
  writeFileSync(m.manifests.brave, desktopBytes(m.userHome));
  await deniedAsync(join(m.support, 'Google/Chrome'), () => assert.rejects(register(m, {replace: true, onReplace: () => assert.fail('nothing may be announced')}), unreadableRefusal('register')));
  assert.equal(readFileSync(m.manifests.brave, 'utf8'), desktopBytes(m.userHome));
  assert.equal(existsSync(m.backups), false);
});

test('unregister refuses as a whole when a browser directory cannot be read, never reporting it removed or absent', {skip: asRoot}, async t => {
  for (const relative of DENIED) {
    const m = machine(t, {chromeManifest: DESKTOP});
    await register(m, {replace: true, onReplace: () => {}});
    const before = {chrome: readFileSync(m.manifests.chrome), brave: readFileSync(m.manifests.brave), record: record(m)};
    denied(join(m.support, relative), () => assert.throws(() => unregister(m), unreadableRefusal('unregister')), relative);
    assert.ok(readFileSync(m.manifests.chrome).equals(before.chrome), `${relative}: Chrome's registration stands`);
    assert.ok(readFileSync(m.manifests.brave).equals(before.brave), `${relative}: Brave, which is readable, was not unregistered either`);
    assert.deepEqual(record(m), before.record, relative);
    assert.equal(readFileSync(join(m.backups, 'chrome.json'), 'utf8'), m.original, relative);
  }
});

test('doctor\'s chrome.host.registered row says the manifest is unknown, not missing, under the same denied directories', {skip: asRoot}, async t => {
  const m = machine(t);
  await register(m);
  const row = () => chromeChecks({home: m.home, chrome: chromeFacts({userData: join(m.support, 'Google/Chrome')}), psText: '', userHome: m.userHome})
    .find(c => c.name === 'chrome.host.registered');
  assert.deepEqual([row().status, row().detail.startsWith('cua: ')], ['pass', true]);
  for (const relative of DENIED) {
    const check = denied(join(m.support, relative), row);
    assert.equal(check.status, 'blocked', relative);
    assert.match(check.detail, /whether a native-messaging manifest for com\.openai\.codexextension exists is unknown: this process may not read it .*\(EACCES\); grant Full Disk Access/, relative);
  }
});

test('a directory that becomes unreadable mid-run: register undoes its earlier writes, unregister reports the slot unknown', {skip: asRoot}, async t => {
  const m = machine(t);
  const braveData = join(m.support, 'BraveSoftware', 'Brave-Browser');
  try {
    await assert.rejects(register(m, {onStep: hook('chrome', 'publish', () => chmodSync(braveData, 0o000))}), err => {
      assert.equal(err.code, 'chrome_data_unreadable');
      assert.match(err.message, /native-messaging directory of Brave .*EACCES.*Nothing was changed\.$/);
      return true;
    });
  } finally { chmodSync(braveData, 0o755); }
  assert.equal(existsSync(m.manifests.chrome), false, 'the Chrome manifest placed earlier in the run was undone');
  assert.equal(existsSync(m.manifests.brave), false);
  assert.deepEqual(record(m).browsers, {});

  await register(m);
  const ours = readFileSync(m.manifests.chrome);
  const nmh = dirname(m.manifests.chrome);
  let result;
  try {
    result = unregisterHost({home: m.home, userHome: m.userHome, onStep: hook('chrome', 'take', () => chmodSync(nmh, 0o000))});
  } finally { chmodSync(nmh, 0o755); }
  const chrome = result.browsers.find(b => b.browser === 'chrome');
  assert.deepEqual([chrome.action, chrome.restoration], ['unknown', 'blocked']);
  assert.match(chrome.reason, /whether cua's registration is still there is unknown \(this process cannot read it: EACCES\)/);
  assert.match(chrome.userAction, /Full Disk Access.*`cua chrome unregister` again/);
  assert.ok(readFileSync(m.manifests.chrome).equals(ours), 'it was in fact still there');
  assert.equal(result.blocked, true);
});
