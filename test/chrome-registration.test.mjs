// M12: `cua chrome register|unregister` against injected browser directories only. Nothing here reads or writes a real
// browser's NativeMessagingHosts directory: every test passes its own scratch `userHome`.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, chmodSync, linkSync, renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join, dirname} from 'node:path';
import {registerHost, unregisterHost, BROWSERS, isOwnHostPath, hostSuffixes} from '../src/chrome/registration.mjs';
import {resolveRuntime, parsePin} from '../src/runtime/manifest.mjs';
import {scratch, forgeActiveRuntime, forgeChromeComponent, acceptSignatures, realPinJson} from './fixtures/runtime-fixture.mjs';

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
