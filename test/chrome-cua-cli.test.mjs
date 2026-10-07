// H2 CLI: `cua chrome register|unregister` on the cua route (the default), and the route switch as `cua profiles list`
// shows it (acceptance 9). Every run gets a scratch CUA_HOME and a scratch HOME, so no real browser manifest directory
// and no real cua home is ever read or written.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, realpathSync, utimesSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {browsersFor, manifestText} from '../src/chrome/registration.mjs';
import {CUA_EXTENSION_ID, CUA_HOST_NAME, launcherPath} from '../src/chrome/extension.mjs';
import {chromeRoute} from '../src/chrome/route.mjs';
import {REPO, shortScratch} from './fixtures/runtime-fixture.mjs';

const CLI = join(REPO, 'bin', 'cua.mjs');
const cuaManifest = launcher => manifestText({name: CUA_HOST_NAME, description: 'cua browser native messaging host', extensionIds: [CUA_EXTENSION_ID]}, launcher);

function machine(t) {
  // Under /tmp: a home's socket path must fit 103 bytes, which a macOS per-user temp directory nearly exhausts.
  const s = shortScratch();
  t.after(s.cleanup);
  const dir = realpathSync(s.dir);
  const home = join(dir, 'cua');
  mkdirSync(home);
  const user = join(dir, 'user');
  const chromeData = browsersFor({env: {}, userHome: user}).find(b => b.browser === 'chrome').dataDir;
  const nmh = join(chromeData, 'NativeMessagingHosts');
  mkdirSync(nmh, {recursive: true});
  mkdirSync(join(chromeData, 'Default', 'Local Extension Settings', CUA_EXTENSION_ID), {recursive: true});
  writeFileSync(join(chromeData, 'Local State'), JSON.stringify({profile: {info_cache: {Default: {name: 'Personal'}}}}));
  const env = {...process.env, CUA_HOME: home, HOME: user};
  delete env.XDG_CONFIG_HOME;
  delete env.CHROME_CONFIG_HOME;
  const cua = args => spawnSync(process.execPath, [CLI, ...args], {env, encoding: 'utf8', timeout: 60_000});
  return {home, user, chromeData, manifest: join(nmh, `${CUA_HOST_NAME}.json`), cua};
}

test('chrome register defaults to the cua route: the manifest, the launcher on this checkout, and the per-browser table', t => {
  const m = machine(t);
  const r = m.cua(['chrome', 'register']);
  assert.equal(r.status, 0, r.stderr);
  const launcher = launcherPath(m.home);
  assert.equal(readFileSync(m.manifest, 'utf8'), cuaManifest(launcher));
  assert.ok(readFileSync(launcher, 'utf8').includes(`host='${join(realpathSync(REPO), 'src', 'chrome', 'host.mjs')}'`));
  assert.match(r.stdout, new RegExp(`^registered cua's Chrome host launcher ${launcher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'));
  assert.match(r.stdout, /^ {2}chrome\s+placed\s+\S/m);
  assert.match(r.stdout, /^previous launcher recorded: none$/m);
  assert.equal(chromeRoute(m.home), 'cua');
  const json = JSON.parse(m.cua(['chrome', 'register', '--json']).stdout);
  assert.deepEqual([json.ok, json.route, json.launcher, json.previous], [true, 'cua', launcher, []]);
  assert.deepEqual(json.browsers.map(b => [b.browser, b.action]), [['chrome', 'unchanged']]);
});

test('chrome register refuses another home\'s manifest; --replace records it, and unregister restores it byte for byte', t => {
  const m = machine(t);
  const other = '/Users/someone/Library/Application Support/cua/chrome/host';
  const before = cuaManifest(other);
  writeFileSync(m.manifest, before);
  const refused = m.cua(['chrome', 'register']);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /\[other_home\]/);
  assert.match(refused.stderr, /--replace/);
  const replaced = m.cua(['chrome', 'register', '--replace']);
  assert.equal(replaced.status, 0, replaced.stderr);
  assert.match(replaced.stdout, /^ {2}chrome\s+replaced\s+/m);
  assert.ok(replaced.stdout.includes(`previous launcher recorded: ${other}`), replaced.stdout);
  const out = m.cua(['chrome', 'unregister']);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /chrome\s+restored\s+.*verified byte-for-byte/);
  assert.equal(readFileSync(m.manifest, 'utf8'), before);
  assert.equal(chromeRoute(m.home), null);
  const again = m.cua(['chrome', 'unregister', '--json']);
  assert.equal(JSON.parse(again.stdout).ok, true);
  assert.match(m.cua(['chrome', 'unregister']).stdout, /^nothing to unregister/);
});

test('switching routes makes profiles list show rebind_required for a binding made on the other route (acceptance 9)', t => {
  const m = machine(t);
  // Bound on the vendor route (no `route` field), before the home switched to cua.
  writeFileSync(join(m.home, 'profiles.json'), JSON.stringify({version: 1, profiles: {personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'vendor-inst', boundAt: '2026-10-01T00:00:00.000Z'}}}));
  const r = m.cua(['chrome', 'register']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /personal.*cua profiles bind/);
  const list = m.cua(['profiles', 'list', '--json']);
  assert.equal(list.status, 0, list.stderr);
  assert.deepEqual(JSON.parse(list.stdout).profiles.map(p => [p.key, p.ready, p.reason]), [['personal', false, 'rebind_required']]);
  assert.match(m.cua(['profiles', 'list']).stdout, /^personal\s+not ready\s+Default\s+bound on the other Chrome route/m);
  // A later vendor registration (its record newer) takes the home back; the vendor binding is fine again.
  const vendorRecord = join(m.home, 'chrome', 'registration.json');
  writeFileSync(vendorRecord, JSON.stringify({schema: 1, browsers: {chrome: {manifest: '/m', replaced: false}}}));
  const later = new Date(Date.now() + 60_000);
  utimesSync(vendorRecord, later, later);
  assert.equal(chromeRoute(m.home), 'vendor');
  assert.equal(JSON.parse(m.cua(['profiles', 'list', '--json']).stdout).profiles[0].reason, 'extension_not_installed', 'the vendor route reads the OpenAI extension again');
});

test('profiles add on the cua route reports the cua extension loaded unpacked as installed', t => {
  const m = machine(t);
  assert.equal(m.cua(['chrome', 'register']).status, 0);
  const add = m.cua(['profiles', 'add', 'personal', '--chrome-profile', 'Default']);
  assert.equal(add.status, 0, add.stderr);
  assert.match(add.stdout, /the cua extension is installed there/);
  assert.equal(existsSync(join(m.home, 'profiles.json')), true);
});
