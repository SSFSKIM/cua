// H2: `cua chrome register|unregister` on the cua route (registerCuaHost/unregisterCuaHost) and the route of a home,
// against injected browser directories only. Nothing here reads or writes a real browser's NativeMessagingHosts
// directory or the real default cua home: every test passes its own scratch `browsers` table and CUA_HOME.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, symlinkSync, utimesSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {browsersFor, chooseVendorRoute, manifestText, readCuaRecord, registerCuaHost, unregisterCuaHost} from '../src/chrome/registration.mjs';
import {chromeRoute} from '../src/chrome/route.mjs';
import {CUA_EXTENSION_ID, CUA_HOST_NAME, MAX_SOCKET_PATH_BYTES, backendDir, launcherLog, launcherPath, logDir, longestSocketPath} from '../src/chrome/extension.mjs';
import {defaultHome} from '../src/runtime/layout.mjs';
import {PERMISSION_FIX} from '../src/profiles/chrome.mjs';
import {REPO, shortScratch} from './fixtures/runtime-fixture.mjs';

const DARWIN = {platform: 'darwin', arch: 'arm64'};
const MANIFEST = `${CUA_HOST_NAME}.json`;
const VENDOR_MANIFEST = 'com.openai.codexextension.json';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const expectCode = code => err => { assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`); return true; };
const cuaManifest = launcher => manifestText({name: CUA_HOST_NAME, description: 'cua browser native messaging host', extensionIds: [CUA_EXTENSION_ID]}, launcher);

// A cua home, a checkout holding src/chrome/host.mjs, and a user home where Chrome (with a NativeMessagingHosts
// directory holding the vendor's manifest) and Brave (without one) have user-data directories; the others do not.
function machine(t, {hostScript = '// host\n'} = {}) {
  // Under /tmp: a home's socket path must fit 103 bytes, which a macOS per-user temp directory nearly exhausts.
  const s = shortScratch();
  t.after(s.cleanup);
  const dir = realpathSync(s.dir);
  const home = join(dir, 'cua');
  mkdirSync(home);
  const checkout = join(dir, 'checkout');
  mkdirSync(join(checkout, 'src', 'chrome'), {recursive: true});
  writeFileSync(join(checkout, 'src', 'chrome', 'host.mjs'), hostScript);
  const userHome = join(dir, 'user');
  const support = join(userHome, 'Library', 'Application Support');
  const chromeNmh = join(support, 'Google', 'Chrome', 'NativeMessagingHosts');
  mkdirSync(chromeNmh, {recursive: true});
  mkdirSync(join(support, 'BraveSoftware', 'Brave-Browser'), {recursive: true});
  const vendorBytes = `${JSON.stringify({allowed_origins: ['chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/'], description: 'ChatGPT browser native messaging host', name: 'com.openai.codexextension', path: '/Applications/ChatGPT.app/x/ChatGPT for Chrome', type: 'stdio'}, null, 2)}\n`;
  writeFileSync(join(chromeNmh, VENDOR_MANIFEST), vendorBytes);
  const browsers = browsersFor({host: DARWIN, userHome});
  const manifests = {
    chrome: join(chromeNmh, MANIFEST),
    brave: join(support, 'BraveSoftware', 'Brave-Browser', 'NativeMessagingHosts', MANIFEST),
    edge: join(support, 'Microsoft Edge', 'NativeMessagingHosts', MANIFEST),
  };
  return {dir, home, checkout, userHome, support, browsers, manifests, vendorManifest: join(chromeNmh, VENDOR_MANIFEST), vendorBytes};
}
const register = (m, extra = {}) => registerCuaHost({home: m.home, checkout: m.checkout, nodePath: process.execPath, browsers: m.browsers, ...extra});
const unregister = (m, extra = {}) => unregisterCuaHost({home: m.home, browsers: m.browsers, ...extra});

test('register writes the cua manifest naming this home\'s launcher into each present browser, the launcher, the socket and log directories, and the record', async t => {
  const m = machine(t);
  const result = await register(m);
  const launcher = launcherPath(m.home);
  assert.equal(result.launcher, launcher);
  assert.deepEqual(result.browsers.map(b => [b.browser, b.action, b.previous]), [['chrome', 'placed', null], ['brave', 'placed', null]]);
  const expected = cuaManifest(launcher);
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), expected);
  assert.equal(readFileSync(m.manifests.brave, 'utf8'), expected);
  assert.deepEqual(JSON.parse(expected), {allowed_origins: [`chrome-extension://${CUA_EXTENSION_ID}/`], description: 'cua browser native messaging host', name: CUA_HOST_NAME, path: launcher, type: 'stdio'});
  assert.equal(existsSync(join(m.support, 'Microsoft Edge')), false, 'a browser that is not there gets nothing');
  // The vendor's manifest is untouched (acceptance 2).
  assert.equal(readFileSync(m.vendorManifest, 'utf8'), m.vendorBytes);
  // The launcher bakes this home and execs this node on the checkout's host, Node's own stderr into the launcher log.
  const text = readFileSync(launcher, 'utf8');
  assert.equal(statSync(launcher).mode & 0o777, 0o700);
  assert.match(text, /^#!\/bin\/sh\n/);
  assert.ok(text.includes(`CUA_HOME='${m.home}'`), text);
  assert.ok(text.includes(`node='${process.execPath}'`), text);
  assert.ok(text.includes(`host='${join(m.checkout, 'src', 'chrome', 'host.mjs')}'`), text);
  assert.match(text, /exec "\$node" "\$host" "\$@" 2>>"\$log"/);
  for (const d of [backendDir(m.home), logDir(m.home)]) assert.equal(statSync(d).mode & 0o777, 0o700, d);
  assert.deepEqual(readCuaRecord(m.home), {schema: 1, route: 'cua', launcher, backendsDir: backendDir(m.home),
    browsers: {chrome: {manifestPath: m.manifests.chrome, previous: null}, brave: {manifestPath: m.manifests.brave, previous: null}}});
  assert.equal(chromeRoute(m.home), 'cua');
});

test('register bakes real paths: a symlinked home and a symlinked checkout (npm link) are resolved', async t => {
  const m = machine(t);
  const linkHome = join(m.dir, 'home-link');
  const linkCheckout = join(m.dir, 'checkout-link');
  symlinkSync(m.home, linkHome);
  symlinkSync(m.checkout, linkCheckout);
  const result = await registerCuaHost({home: linkHome, checkout: linkCheckout, nodePath: process.execPath, browsers: m.browsers});
  assert.equal(result.launcher, launcherPath(m.home));
  const text = readFileSync(launcherPath(m.home), 'utf8');
  assert.ok(text.includes(`CUA_HOME='${m.home}'`));
  assert.ok(text.includes(`host='${join(m.checkout, 'src', 'chrome', 'host.mjs')}'`));
  // A home that does not exist yet, under a symlinked parent, is baked as the real path it gets once created.
  symlinkSync(m.dir, join(m.dir, 'parent-link'));
  const fresh = await registerCuaHost({home: join(m.dir, 'parent-link', 'fresh'), checkout: m.checkout, nodePath: process.execPath, browsers: m.browsers, replace: true});
  assert.equal(fresh.launcher, launcherPath(join(m.dir, 'fresh')));
  assert.ok(readFileSync(fresh.launcher, 'utf8').includes(`CUA_HOME='${join(m.dir, 'fresh')}'`));
});

test('a second register is unchanged and keeps what the first recorded', async t => {
  const m = machine(t);
  await register(m);
  const again = await register(m);
  assert.deepEqual(again.browsers.map(b => b.action), ['unchanged', 'unchanged']);
});

test('register refuses a manifest naming another home\'s launcher (other_home, hint --replace) and writes nothing', async t => {
  const m = machine(t);
  const other = '/Users/someone/Library/Application Support/cua/chrome/host';
  const otherBytes = cuaManifest(other);
  writeFileSync(m.manifests.chrome, otherBytes);
  await assert.rejects(register(m), err => {
    expectCode('other_home')(err);
    assert.match(err.message, new RegExp(other.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(err.hint, /--replace/);
    return true;
  });
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), otherBytes);
  assert.equal(existsSync(m.manifests.brave), false);
  assert.equal(existsSync(launcherPath(m.home)), false);
  assert.equal(readCuaRecord(m.home), null);
  assert.equal(chromeRoute(m.home), null);
});

test('register --replace records the previous launcher and unregister restores its manifest byte for byte (acceptance 2)', async t => {
  const m = machine(t);
  const other = '/Users/someone/Library/Application Support/cua/chrome/host';
  const otherBytes = cuaManifest(other);
  writeFileSync(m.manifests.chrome, otherBytes);
  const vendorBefore = sha(readFileSync(m.vendorManifest));
  const result = await register(m, {replace: true});
  assert.deepEqual(result.browsers.map(b => [b.browser, b.action, b.previous]), [['chrome', 'replaced', other], ['brave', 'placed', null]]);
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), cuaManifest(launcherPath(m.home)));
  assert.equal(readCuaRecord(m.home).browsers.chrome.previous, other);
  // A re-register keeps the recorded previous launcher, so the later unregister still restores it.
  await register(m);
  const out = unregister(m);
  assert.equal(out.blocked, false);
  const rows = Object.fromEntries(out.browsers.map(b => [b.browser, b]));
  assert.equal(rows.chrome.action, 'restored');
  assert.equal(rows.chrome.restoration, 'restored');
  assert.equal(rows.chrome.previous, other);
  assert.equal(rows.brave.action, 'removed');
  assert.equal(rows.brave.restoration, 'not_needed');
  assert.equal(rows.edge.action, 'absent');
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), otherBytes, 'restored byte-identical');
  assert.equal(existsSync(m.manifests.brave), false);
  assert.equal(sha(readFileSync(m.vendorManifest)), vendorBefore, 'the vendor manifest never changed');
  // Nothing of the cua route is left: no record, no launcher, so the home has no route.
  assert.equal(readCuaRecord(m.home), null);
  assert.equal(existsSync(launcherPath(m.home)), false);
  assert.equal(chromeRoute(m.home), null);
});

test('a manifest that does not parse is refused too, and --replace backs it up and restores it', async t => {
  const m = machine(t);
  writeFileSync(m.manifests.chrome, 'not json');
  await assert.rejects(register(m), expectCode('other_home'));
  const result = await register(m, {replace: true});
  assert.deepEqual(result.browsers.find(b => b.browser === 'chrome'), {browser: 'chrome', manifestPath: m.manifests.chrome, action: 'replaced', previous: null, backup: join(m.home, 'chrome', 'cua-manifest-backup', 'chrome.json')});
  unregister(m);
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), 'not json');
});

test('unregister removes only a manifest naming this home\'s launcher', async t => {
  const m = machine(t);
  await register(m);
  const other = cuaManifest('/elsewhere/chrome/host');
  writeFileSync(m.manifests.brave, other);
  const out = unregister(m);
  const rows = Object.fromEntries(out.browsers.map(b => [b.browser, b]));
  assert.equal(rows.chrome.action, 'removed');
  assert.equal(rows.brave.action, 'not_ours');
  assert.equal(readFileSync(m.manifests.brave, 'utf8'), other);
  assert.equal(existsSync(m.manifests.chrome), false);
});

test('a backup whose hash the record does not hold is never restored: BLOCKED with the user action, the record kept', async t => {
  const m = machine(t);
  writeFileSync(m.manifests.chrome, cuaManifest('/elsewhere/chrome/host'));
  await register(m, {replace: true});
  const backup = join(m.home, 'chrome', 'cua-manifest-backup', 'chrome.json');
  writeFileSync(backup, 'tampered');
  const out = unregister(m);
  const chrome = out.browsers.find(b => b.browser === 'chrome');
  assert.equal(out.blocked, true);
  assert.equal(chrome.restoration, 'blocked');
  assert.match(chrome.userAction, /chrome\/host|cp /);
  assert.equal(existsSync(m.manifests.chrome), false, 'cua\'s own manifest is still removed');
  assert.ok(readCuaRecord(m.home), 'the record stays while a restoration is blocked');
  assert.equal(readFileSync(backup, 'utf8'), 'tampered');
});

test('register with no present browser refuses with no_supported_browser; unreadable slots refuse as a whole', {skip: process.getuid?.() === 0}, async t => {
  const m = machine(t);
  await assert.rejects(registerCuaHost({home: m.home, checkout: m.checkout, nodePath: process.execPath, browsers: browsersFor({host: DARWIN, userHome: join(m.dir, 'nobody')})}), expectCode('no_supported_browser'));
  const nmh = join(m.support, 'Google', 'Chrome', 'NativeMessagingHosts');
  chmodSync(nmh, 0o000);
  try {
    await assert.rejects(register(m), err => { expectCode('chrome_data_unreadable')(err); assert.ok(err.hint.includes(PERMISSION_FIX)); return true; });
    assert.throws(() => unregister(m), expectCode('chrome_data_unreadable'));
  } finally { chmodSync(nmh, 0o755); }
  assert.equal(existsSync(m.manifests.brave), false);
});

test('register refuses a checkout without src/chrome/host.mjs, and a node that is not there', async t => {
  const m = machine(t);
  await assert.rejects(register(m, {checkout: join(m.dir, 'nowhere')}), expectCode('host_missing'));
  await assert.rejects(register(m, {nodePath: join(m.dir, 'no-node')}), expectCode('node_missing'));
  assert.equal(existsSync(m.manifests.chrome), false);
});

// ---- the socket path bound (acceptance 10) -----------------------------------------------------------------------

test('the worst-case socket path at the default home fits for a 37-character username and not for 38', () => {
  const at = user => Buffer.byteLength(longestSocketPath(defaultHome({HOME: `/Users/${user}`}, {platform: 'darwin'})));
  assert.equal(at('u'.repeat(37)), MAX_SOCKET_PATH_BYTES);
  assert.equal(at('u'.repeat(38)), MAX_SOCKET_PATH_BYTES + 1);
  assert.equal(MAX_SOCKET_PATH_BYTES, 103);
});

test('register refuses a home whose socket path would exceed 103 bytes (socket_path_too_long) before writing anything', async t => {
  const m = machine(t);
  const room = MAX_SOCKET_PATH_BYTES - Buffer.byteLength(longestSocketPath(join(m.dir, 'h')));
  const fits = join(m.dir, `h${'x'.repeat(room)}`);
  const over = join(m.dir, `h${'x'.repeat(room + 1)}`);
  assert.equal(Buffer.byteLength(longestSocketPath(fits)), MAX_SOCKET_PATH_BYTES);
  await assert.rejects(register(m, {home: over}), err => { expectCode('socket_path_too_long')(err); assert.match(err.message, /104 bytes/); return true; });
  assert.equal(existsSync(over), false);
  assert.equal(existsSync(m.manifests.chrome), false);
  mkdirSync(fits);
  await register(m, {home: fits});
  assert.equal(readFileSync(m.manifests.chrome, 'utf8'), cuaManifest(launcherPath(fits)));
});

// ---- the launcher ------------------------------------------------------------------------------------------------

test('the launcher runs the host with CUA_HOME baked in, whatever the caller\'s environment, and logs each start', async t => {
  const m = machine(t);
  await registerCuaHost({home: m.home, checkout: REPO, nodePath: process.execPath, browsers: m.browsers});
  const run = spawnSync(launcherPath(m.home), ['chrome-extension://x/'], {input: '', env: {PATH: '/usr/bin:/bin', CUA_HOME: '/somewhere/else'}, encoding: 'utf8', timeout: 30_000});
  assert.equal(run.status, 1, run.stderr);
  // The real host ran in this home: it waited for a hello, the port closed, and it logged that in chrome/logs.
  const logs = readdirSync(logDir(m.home));
  const hostLog = logs.find(name => /^\d+\.log$/.test(name));
  assert.ok(hostLog, logs.join(', '));
  assert.match(readFileSync(join(logDir(m.home), hostLog), 'utf8'), /port_closed_before_hello/);
  assert.match(readFileSync(launcherLog(m.home), 'utf8'), new RegExp(`start pid ${hostLog.replace('.log', '')}\\b`));
});

test('Node\'s own stderr from a host that dies before main lands in the launcher log, not with Chrome', async t => {
  const m = machine(t, {hostScript: 'throw new Error("boom before main");\n'});
  await register(m);
  const run = spawnSync(launcherPath(m.home), [], {input: '', env: {PATH: '/usr/bin:/bin'}, encoding: 'utf8', timeout: 30_000});
  assert.notEqual(run.status, 0);
  assert.equal(run.stderr, '', 'nothing reaches the caller\'s stderr');
  assert.match(readFileSync(launcherLog(m.home), 'utf8'), /Error: boom before main/);
});

// ---- the route of a home -----------------------------------------------------------------------------------------

test('the route is whichever registration ran last: none, cua, vendor, back to cua; a vendor record without entries does not count', async t => {
  const m = machine(t);
  assert.equal(chromeRoute(m.home), null);
  await register(m);
  assert.equal(chromeRoute(m.home), 'cua');
  const vendorRecord = join(m.home, 'chrome', 'registration.json');
  writeFileSync(vendorRecord, JSON.stringify({schema: 1, browsers: {}}));
  assert.equal(chromeRoute(m.home), 'cua', 'an empty vendor record (after unregister --vendor) is no route');
  writeFileSync(vendorRecord, JSON.stringify({schema: 1, browsers: {chrome: {manifest: '/x', replaced: false}}}));
  const past = new Date(Date.now() - 60_000);
  utimesSync(vendorRecord, past, past);
  assert.equal(chromeRoute(m.home), 'cua', 'an older vendor record');
  chooseVendorRoute(m.home);
  assert.equal(chromeRoute(m.home), 'vendor', 'register --vendor ran last');
  await register(m);
  assert.equal(chromeRoute(m.home), 'cua');
  unregister(m);
  assert.equal(chromeRoute(m.home), 'vendor', 'unregistering the cua route leaves the vendor registration');
});
