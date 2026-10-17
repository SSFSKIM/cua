// H2 and #79: what the profile registry, readiness and bind know of the cua route, the only Chrome route: the presence
// rule for cua's extension (an unpacked load has only `Local Extension Settings/<id>/`), a binding's route and
// rebind_required for one made on the removed ChatGPT extension. A scratch Chrome user-data directory stands in for the
// real one; no runtime is launched.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {chromeFacts, CUA_EXTENSION_ID} from '../src/profiles/chrome.mjs';
import {CUA_EXTENSION_ID as EXTENSION_MODULE_ID, CUA_HOST_NAME} from '../src/chrome/extension.mjs';
import {addProfile, bindProfile, profileStatuses, readRegistry, reasonText, REASONS} from '../src/profiles/registry.mjs';
import {bindCommand} from '../src/profiles/commands.mjs';
import {PICK_REASONS} from '../src/profiles/bind.mjs';

// The removed route's extension (OpenAI's), which counts for nothing now.
const OTHER_EXTENSION_ID = 'hehggadaopoacecdllhhajmbjkdcmajg';
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

test('chrome.mjs re-exports the cua extension id', () => {
  assert.equal(CUA_EXTENSION_ID, EXTENSION_MODULE_ID);
});

test('an unpacked-style profile (only Local Extension Settings/<id>/) counts as present for the cua id; another extension never does (acceptance 10)', t => {
  const {userData} = fakeChrome(t, {
    Default: {installs: [[CUA_EXTENSION_ID, UNPACKED]]},
    'Profile 1': {installs: [[CUA_EXTENSION_ID, VERSIONED]]},
    'Profile 2': {installs: [[OTHER_EXTENSION_ID, VERSIONED]]},
    'Profile 3': {installs: [[OTHER_EXTENSION_ID, UNPACKED]]},
  });
  const chrome = chromeFacts({userData});
  assert.equal(chrome.extensionInstalled('Default'), 'installed');
  assert.equal(chrome.extensionInstalled('Profile 1'), 'installed');
  assert.equal(chrome.extensionInstalled('Profile 2'), 'absent');
  assert.equal(chrome.extensionInstalled('Profile 3'), 'absent');
});

test('nativeHost reads the manifest of the name it is asked for, cua\'s by default', t => {
  const {userData} = fakeChrome(t, {Default: {}});
  mkdirSync(join(userData, 'NativeMessagingHosts'));
  writeFileSync(join(userData, 'NativeMessagingHosts', `${CUA_HOST_NAME}.json`), JSON.stringify({path: '/h/cua/chrome/host'}));
  const chrome = chromeFacts({userData});
  assert.deepEqual(chrome.nativeHost(), {present: true, path: '/h/cua/chrome/host'});
  assert.deepEqual(chrome.nativeHost({name: CUA_HOST_NAME}), chrome.nativeHost());
  assert.deepEqual(chrome.nativeHost({name: 'com.openai.codexextension'}), {present: false});
});

test('a binding is stored on the cua route; one made on the ChatGPT extension (no route) is rebind_required until bound again', t => {
  const {home, userData} = fakeChrome(t, {Default: {installs: [[CUA_EXTENSION_ID, UNPACKED]]}});
  const chrome = chromeFacts({userData});
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: {personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'vendor-inst', boundAt: 'x'}}}));
  const stale = profileStatuses({home, chrome})[0];
  assert.deepEqual([stale.ready, stale.reason], [false, 'rebind_required']);
  assert.equal(reasonText(stale), REASONS.rebind_required.replace('<key>', 'personal'));
  assert.match(reasonText(stale), /ChatGPT extension, a route cua no longer supports \(#79\).*cua chrome register.*cua profiles bind personal$/);
  const bound = bindProfile({home, key: 'personal', extensionInstanceId: 'cua-inst', now: new Date('2026-10-03T00:00:00Z')});
  assert.deepEqual(bound, {chromeProfileDirectory: 'Default', extensionInstanceId: 'cua-inst', boundAt: '2026-10-03T00:00:00.000Z', route: 'cua'});
  assert.deepEqual(readRegistry(home).profiles.personal, bound);
  assert.equal(profileStatuses({home, chrome})[0].ready, true);
});

test('an entry\'s route may only be cua: any other, vendor included, is profiles_invalid', t => {
  const {home} = fakeChrome(t, {Default: {}});
  mkdirSync(home, {recursive: true});
  for (const route of ['vendor', 'other', '', 1]) {
    writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: {personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'x', route}}}));
    assert.throws(() => readRegistry(home), err => err.code === 'profiles_invalid' && /entry personal has a bad route \(only cua\)/.test(err.message), String(route));
  }
});

test('bind records route cua', async t => {
  const {home, userData} = fakeChrome(t, {Default: {name: 'Personal', installs: [[CUA_EXTENSION_ID, UNPACKED]]}});
  onCuaRoute(home);
  const chrome = chromeFacts({userData});
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  const result = await bindCommand({home, key: 'personal', chrome,
    listBackends: async () => ({backends: [{family: 'chrome', instanceId: 'cua-inst'}], elicitationsDeclined: 0, teardown: {confirmed: true}}),
    mapDirectories: async () => ({status: 'complete', stores: new Map([['Default', ['cua-inst']]]), names: new Map([['Default', 'Personal']])})});
  assert.equal(result.ok, true);
  assert.equal(result.by, 'directory');
  assert.deepEqual(readRegistry(home).profiles.personal, {chromeProfileDirectory: 'Default', extensionInstanceId: 'cua-inst', boundAt: readRegistry(home).profiles.personal.boundAt, route: 'cua'});
});

// H2's hand-off to H5: the readiness reasons profiles_list and `cua profiles list` share name cua's extension and its
// popup (which wakes its worker and shows whether the host is connected), and say what mints a new instance id.
test('the readiness reasons and bind\'s pick reasons name cua\'s extension; only rebind_required names the ChatGPT one', () => {
  const p = {key: 'personal', chromeProfileDirectory: 'Profile 8', extensionInstanceId: 'inst-a'};
  for (const reason of ['host_not_live', 'binding_stale', 'backends_unlistable', 'chrome_data_unreadable', 'extension_not_installed', 'not_bound', 'profile_directory_missing'])
    assert.doesNotMatch(reasonText({...p, reason}), /OpenAI|ChatGPT/, reason);
  for (const reason of ['host_not_live', 'binding_stale', 'chrome_data_unreadable'])
    assert.match(reasonText({...p, reason}),
      /Chrome profile "Profile 8" \(one line: cua profiles open personal;.*open the cua extension's popup \(its toolbar icon\).*then retry/, reason);
  assert.match(reasonText({...p, reason: 'extension_not_installed'}), /^the cua extension is not installed or loaded in this Chrome profile/);
  assert.match(reasonText({...p, reason: 'host_not_live'}), /^no live cua extension backend serves it/);
  assert.match(reasonText({...p, reason: 'binding_stale'}), /reinstalled.*bind it again with cua profiles bind personal/);
  assert.match(reasonText({...p, reason: 'backends_unlistable'}), /^the live cua extension backends could not be listed/);
  for (const [reason, text] of Object.entries(PICK_REASONS)) assert.doesNotMatch(text, /OpenAI|ChatGPT/, reason);
  // Every backend is unlabelled on the cua route, so `unlabelled` means the directory had nothing to decide with.
  assert.match(PICK_REASONS.unlabelled, /this profile directory's cua extension store .*no live backend.*no profile label/);
  assert.match(PICK_REASONS.no_live_backends, /^no cua extension backend of Google Chrome is live/);
});
