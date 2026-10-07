// H2: what the profile registry, readiness and bind know of the cua route — the route's extension id, the presence
// rule for cua's extension (an unpacked load has only `Local Extension Settings/<id>/`), the binding's route and
// rebind_required. A scratch Chrome user-data directory stands in for the real one; no runtime is launched.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {chromeFacts, CUA_EXTENSION_ID, OPENAI_EXTENSION_ID} from '../src/profiles/chrome.mjs';
import {CUA_EXTENSION_ID as EXTENSION_MODULE_ID, CUA_HOST_NAME} from '../src/chrome/extension.mjs';
import {addProfile, bindProfile, profileStatuses, readRegistry, reasonText} from '../src/profiles/registry.mjs';
import {bindCommand} from '../src/profiles/commands.mjs';
import {extensionIdFor} from '../src/chrome/route.mjs';

const VERSIONED = 'versioned';
const UNPACKED = 'unpacked';

// A Chrome user-data directory whose profiles hold `install` of `extensionId`: a store-installed copy
// (Extensions/<id>/<version>/manifest.json) or an unpacked load (only Local Extension Settings/<id>/).
function fakeChrome(t, profiles) {
  const s = scratch();
  t.after(s.cleanup);
  const userData = join(s.dir, 'Chrome');
  const infoCache = {};
  for (const [dir, {name = dir, installs = []} = {}] of Object.entries(profiles)) {
    mkdirSync(join(userData, dir), {recursive: true});
    infoCache[dir] = {name};
    for (const [extensionId, how] of installs) {
      if (how === VERSIONED) {
        const v = join(userData, dir, 'Extensions', extensionId, '1.0_0');
        mkdirSync(v, {recursive: true});
        writeFileSync(join(v, 'manifest.json'), '{}');
      } else {
        mkdirSync(join(userData, dir, 'Local Extension Settings', extensionId), {recursive: true});
      }
    }
  }
  writeFileSync(join(userData, 'Local State'), JSON.stringify({profile: {info_cache: infoCache}}));
  return {home: join(s.dir, 'cua'), userData};
}

// Puts a home on the cua route as `cua chrome register` leaves it (route.mjs reads the record).
function onCuaRoute(home) {
  mkdirSync(join(home, 'chrome'), {recursive: true});
  writeFileSync(join(home, 'chrome', 'cua-registration.json'), JSON.stringify({schema: 1, route: 'cua', launcher: join(home, 'chrome', 'host'), backendsDir: join(home, 'chrome', 'b'), browsers: {}}));
}

test('chrome.mjs re-exports the cua extension id, and each route reads its own extension', () => {
  assert.equal(CUA_EXTENSION_ID, EXTENSION_MODULE_ID);
  assert.equal(extensionIdFor('cua'), CUA_EXTENSION_ID);
  assert.equal(extensionIdFor('vendor'), OPENAI_EXTENSION_ID);
  assert.equal(extensionIdFor(null), OPENAI_EXTENSION_ID, 'a home with no registration reads as the vendor route');
});

test('an unpacked-style profile (only Local Extension Settings/<id>/) counts as present for the cua id (acceptance 10)', t => {
  const {userData} = fakeChrome(t, {
    Default: {installs: [[CUA_EXTENSION_ID, UNPACKED]]},
    'Profile 1': {installs: [[CUA_EXTENSION_ID, VERSIONED]]},
    'Profile 2': {installs: [[OPENAI_EXTENSION_ID, VERSIONED]]},
    'Profile 3': {installs: [[OPENAI_EXTENSION_ID, UNPACKED]]},
  });
  const cua = chromeFacts({userData, extensionId: CUA_EXTENSION_ID});
  assert.equal(cua.extensionInstalled('Default'), 'installed');
  assert.equal(cua.extensionInstalled('Profile 1'), 'installed');
  assert.equal(cua.extensionInstalled('Profile 2'), 'absent');
  // The vendor route's rule is unchanged: only an installed copy counts.
  const vendor = chromeFacts({userData});
  assert.equal(vendor.extensionInstalled('Profile 2'), 'installed');
  assert.equal(vendor.extensionInstalled('Profile 3'), 'absent');
  assert.equal(vendor.extensionInstalled('Default'), 'absent');
});

test('nativeHost reads the manifest of the name it is asked for', t => {
  const {userData} = fakeChrome(t, {Default: {}});
  mkdirSync(join(userData, 'NativeMessagingHosts'));
  writeFileSync(join(userData, 'NativeMessagingHosts', `${CUA_HOST_NAME}.json`), JSON.stringify({path: '/h/cua/chrome/host'}));
  const chrome = chromeFacts({userData});
  assert.deepEqual(chrome.nativeHost({cuaHome: '/h/cua', userHome: '/u', name: CUA_HOST_NAME}), {present: true, path: '/h/cua/chrome/host', pathClass: 'cua'});
  assert.deepEqual(chrome.nativeHost({cuaHome: '/h/cua', userHome: '/u'}), {present: false});
});

test('a binding records its route; one made on the other route is rebind_required until bound again', t => {
  const {home, userData} = fakeChrome(t, {Default: {installs: [[CUA_EXTENSION_ID, UNPACKED], [OPENAI_EXTENSION_ID, VERSIONED]]}});
  const vendorChrome = chromeFacts({userData});
  addProfile({home, key: 'personal', directory: 'Default', chrome: vendorChrome});
  bindProfile({home, key: 'personal', extensionInstanceId: 'vendor-inst'});
  assert.equal(readRegistry(home).profiles.personal.route, undefined, 'a vendor-route binding keeps the file as before (no route means vendor)');
  assert.equal(profileStatuses({home, chrome: vendorChrome})[0].ready, true);

  onCuaRoute(home);
  const cuaChrome = chromeFacts({userData, extensionId: CUA_EXTENSION_ID});
  const stale = profileStatuses({home, chrome: cuaChrome})[0];
  assert.equal(stale.ready, false);
  assert.equal(stale.reason, 'rebind_required');
  assert.match(reasonText(stale), /cua profiles bind personal/);

  bindProfile({home, key: 'personal', extensionInstanceId: 'cua-inst', route: 'cua'});
  assert.equal(readRegistry(home).profiles.personal.route, 'cua');
  assert.equal(profileStatuses({home, chrome: cuaChrome})[0].ready, true);
  // Back on the vendor route, the cua binding is the stale one.
  assert.equal(profileStatuses({home, chrome: vendorChrome, route: 'vendor'})[0].reason, 'rebind_required');
});

test('the registry refuses a route that is neither cua nor vendor', t => {
  const {home} = fakeChrome(t, {Default: {}});
  mkdirSync(home, {recursive: true});
  writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: {personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'x', route: 'other'}}}));
  assert.throws(() => readRegistry(home), err => err.code === 'profiles_invalid' && /route/.test(err.message));
});

test('bind on the cua route records route cua', async t => {
  const {home, userData} = fakeChrome(t, {Default: {name: 'Personal', installs: [[CUA_EXTENSION_ID, UNPACKED]]}});
  onCuaRoute(home);
  const chrome = chromeFacts({userData, extensionId: CUA_EXTENSION_ID});
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  const result = await bindCommand({home, key: 'personal', chrome,
    listBackends: async () => ({backends: [{family: 'chrome', instanceId: 'cua-inst'}], elicitationsDeclined: 0, teardown: {confirmed: true}}),
    mapDirectories: async () => ({status: 'complete', stores: new Map([['Default', ['cua-inst']]]), names: new Map([['Default', 'Personal']])})});
  assert.equal(result.ok, true);
  assert.equal(result.by, 'directory');
  assert.deepEqual(readRegistry(home).profiles.personal, {chromeProfileDirectory: 'Default', extensionInstanceId: 'cua-inst', boundAt: readRegistry(home).profiles.personal.boundAt, route: 'cua'});
});

test('a missing extension is worded as the route\'s: cua\'s on the cua route, the OpenAI extension otherwise', () => {
  const p = {key: 'work', reason: 'extension_not_installed', chromeProfileDirectory: 'Profile 1'};
  assert.match(reasonText(p, {route: 'cua'}), /^the cua extension is not installed or loaded in this Chrome profile/);
  assert.match(reasonText(p), /^the OpenAI extension is not installed in this Chrome profile/);
  assert.equal(reasonText(p, {route: 'vendor'}), reasonText(p));
});
