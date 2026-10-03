// The profile registry ($CUA_HOME/profiles.json), the passive Chrome facts it is checked against (a scratch Chrome
// user-data directory stands in for the real one), and the bind rule. Nothing here reads the real Chrome profile
// tree, launches a runtime or talks to a browser.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, readFileSync, statSync, existsSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {readRegistry, addProfile, removeProfile, bindProfile, profileStatuses, PROFILE_KEY} from '../src/profiles/registry.mjs';
import {chromeFacts, OPENAI_EXTENSION_ID, hostPathClass, countLiveHosts} from '../src/profiles/chrome.mjs';
import {decideBinding} from '../src/profiles/bind.mjs';

// A Chrome user-data directory with `profiles` ({dir: {name, extension}}) and a Local State naming them.
function fakeChrome(t, profiles = {}, {localState} = {}) {
  const s = scratch();
  t.after(s.cleanup);
  const userData = join(s.dir, 'Chrome');
  mkdirSync(userData, {recursive: true});
  const infoCache = {};
  for (const [dir, {name = dir, extension = false} = {}] of Object.entries(profiles)) {
    mkdirSync(join(userData, dir), {recursive: true});
    infoCache[dir] = {name, avatar_icon: 'x'};
    if (extension) {
      const version = join(userData, dir, 'Extensions', OPENAI_EXTENSION_ID, '1.26.901.11451_0');
      mkdirSync(version, {recursive: true});
      writeFileSync(join(version, 'manifest.json'), '{}');
    }
  }
  writeFileSync(join(userData, 'Local State'), localState ?? JSON.stringify({profile: {info_cache: infoCache, profiles_order: Object.keys(infoCache), last_used: 'Default'}}));
  const home = join(s.dir, 'home');
  return {home, userData, chrome: chromeFacts({userData})};
}

const THREE = {Default: {name: 'Personal', extension: true}, 'Profile 8': {name: 'Work'}, 'Profile 6': {name: 'School'}};

test('profile keys are short lowercase identifiers', () => {
  for (const good of ['personal', 'work', 'school-2', 'a', 'a'.repeat(32)]) assert.ok(PROFILE_KEY.test(good), good);
  for (const bad of ['', 'Personal', '2work', 'work_1', 'a'.repeat(33), 'a b', '-x']) assert.ok(!PROFILE_KEY.test(bad), bad);
});

test('an empty home has an empty registry; add records an existing directory and reports extension presence', t => {
  const {home, chrome} = fakeChrome(t, THREE);
  assert.deepEqual(readRegistry(home), {version: 1, profiles: {}});
  const personal = addProfile({home, key: 'personal', directory: 'Default', chrome});
  assert.deepEqual(personal, {key: 'personal', chromeProfileDirectory: 'Default', extensionInstalled: true});
  const work = addProfile({home, key: 'work', directory: 'Profile 8', chrome});
  assert.equal(work.extensionInstalled, false);
  const file = join(home, 'profiles.json');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {version: 1, profiles: {personal: {chromeProfileDirectory: 'Default'}, work: {chromeProfileDirectory: 'Profile 8'}}});
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

test('add refuses bad keys, missing or unsafe directories, a taken key and a directory another key holds', t => {
  const {home, chrome} = fakeChrome(t, THREE);
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  const code = expected => error => { assert.equal(error.code, expected); return true; };
  assert.throws(() => addProfile({home, key: 'Bad Key', directory: 'Profile 8', chrome}), code('invalid_profile_key'));
  for (const directory of ['Profile 99', '../Default', 'Default/Extensions', '.', '..', ''])
    assert.throws(() => addProfile({home, key: 'work', directory, chrome}), code('chrome_profile_not_found'), directory);
  assert.throws(() => addProfile({home, key: 'personal', directory: 'Profile 8', chrome}), code('profile_exists'));
  assert.throws(() => addProfile({home, key: 'again', directory: 'Default', chrome}), code('chrome_profile_registered'));
  assert.deepEqual(Object.keys(readRegistry(home).profiles), ['personal']);
});

test('remove deletes only the named registry entry and never touches the Chrome profile', t => {
  const {home, userData, chrome} = fakeChrome(t, THREE);
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  addProfile({home, key: 'school', directory: 'Profile 6', chrome});
  removeProfile({home, key: 'school'});
  assert.deepEqual(Object.keys(readRegistry(home).profiles), ['personal']);
  assert.ok(existsSync(join(userData, 'Profile 6')));
  assert.throws(() => removeProfile({home, key: 'school'}), error => error.code === 'unknown_profile');
});

test('readiness: bound with the extension installed is ready; otherwise the reason is named', t => {
  const {home, userData, chrome} = fakeChrome(t, THREE);
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  addProfile({home, key: 'work', directory: 'Profile 8', chrome});
  const status = () => Object.fromEntries(profileStatuses({home, chrome}).map(s => [s.key, s]));
  assert.deepEqual(status().personal, {key: 'personal', chromeProfileDirectory: 'Default', ready: false, reason: 'not_bound'});
  assert.equal(status().work.reason, 'extension_not_installed');
  bindProfile({home, key: 'personal', extensionInstanceId: 'inst-1', now: new Date('2026-10-03T00:00:00Z')});
  assert.deepEqual(status().personal, {key: 'personal', chromeProfileDirectory: 'Default', ready: true, extensionInstanceId: 'inst-1', boundAt: '2026-10-03T00:00:00.000Z'});
  // The user removes the profile from Chrome: the registration stays, not ready.
  mkdirSync(join(userData, 'gone'));
  addProfile({home, key: 'gone', directory: 'gone', chrome});
  rmSync(join(userData, 'gone'), {recursive: true});
  assert.equal(status().gone.reason, 'profile_directory_missing');
  assert.deepEqual(profileStatuses({home, chrome}).map(s => s.key), ['gone', 'personal', 'work'], 'sorted by key');
});

test('bind refuses an unknown key and an instance id already bound to another key', t => {
  const {home, chrome} = fakeChrome(t, THREE);
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  addProfile({home, key: 'work', directory: 'Profile 8', chrome});
  bindProfile({home, key: 'personal', extensionInstanceId: 'inst-1'});
  assert.throws(() => bindProfile({home, key: 'nobody', extensionInstanceId: 'inst-2'}), error => error.code === 'unknown_profile');
  assert.throws(() => bindProfile({home, key: 'work', extensionInstanceId: 'inst-1'}), error => error.code === 'instance_already_bound');
  bindProfile({home, key: 'personal', extensionInstanceId: 'inst-1'});
});

test('a damaged or foreign registry file is refused with a fix, never silently replaced', t => {
  const {home, chrome} = fakeChrome(t, THREE);
  mkdirSync(home, {recursive: true});
  for (const text of ['not json', '[]', '{"version":2,"profiles":{}}', '{"version":1,"profiles":{"Bad":{"chromeProfileDirectory":"Default"}}}',
    '{"version":1,"profiles":{"a":{"chromeProfileDirectory":"Default","extra":1}}}', '{"version":1,"profiles":{"a":{}}}',
    '{"version":1,"profiles":{"a":{"chromeProfileDirectory":"Default","extensionInstanceId":7}}}']) {
    writeFileSync(join(home, 'profiles.json'), text);
    assert.throws(() => readRegistry(home), error => error.code === 'profiles_invalid' && /profiles\.json/.test(error.hint), text);
    assert.throws(() => addProfile({home, key: 'personal', directory: 'Default', chrome}), error => error.code === 'profiles_invalid');
    assert.equal(readFileSync(join(home, 'profiles.json'), 'utf8'), text);
  }
});

test('Chrome display names come from Local State; an unreadable Local State is an explicit failure', t => {
  const {chrome} = fakeChrome(t, THREE);
  assert.deepEqual(Object.fromEntries(chrome.displayNames()), {Default: 'Personal', 'Profile 8': 'Work', 'Profile 6': 'School'});
  const broken = fakeChrome(t, THREE, {localState: '{"profile": 3}'});
  assert.throws(() => broken.chrome.displayNames(), error => error.code === 'chrome_local_state_unreadable');
});

test('the native-messaging registration is classified by the host path it names', t => {
  const {userData, chrome} = fakeChrome(t, THREE);
  assert.deepEqual(chrome.nativeHost({cuaHome: '/Users/x/Library/Application Support/cua'}), {present: false});
  mkdirSync(join(userData, 'NativeMessagingHosts'));
  const desktop = '/Users/x/.codex/plugins/cache/openai-bundled/chrome/latest/extension-host/macos/arm64/ChatGPT for Chrome';
  writeFileSync(join(userData, 'NativeMessagingHosts', 'com.openai.codexextension.json'), JSON.stringify({name: 'com.openai.codexextension', type: 'stdio', path: desktop}));
  assert.deepEqual(chrome.nativeHost({cuaHome: '/Users/x/Library/Application Support/cua', userHome: '/Users/x'}), {present: true, path: desktop, pathClass: 'desktop'});
  writeFileSync(join(userData, 'NativeMessagingHosts', 'com.openai.codexextension.json'), 'garbage');
  assert.deepEqual(chrome.nativeHost({cuaHome: '/c'}), {present: true, unreadable: true});
});

test('host path classes: cua\'s release tree, the desktop\'s installs, anything else', () => {
  const opts = {cuaHome: '/Users/x/Library/Application Support/cua', userHome: '/Users/x'};
  assert.equal(hostPathClass('/Users/x/Library/Application Support/cua/runtimes/r/chrome/ChatGPT for Chrome', opts), 'cua');
  assert.equal(hostPathClass('/Users/x/.codex/plugins/cache/openai-bundled/chrome/latest/ChatGPT for Chrome', opts), 'desktop');
  assert.equal(hostPathClass('/Applications/ChatGPT.app/Contents/Resources/x/ChatGPT for Chrome', opts), 'desktop');
  assert.equal(hostPathClass('/Applications/Codex.app/Contents/Resources/x/ChatGPT for Chrome', opts), 'desktop');
  assert.equal(hostPathClass('/Users/x/Library/Application Support/cua-other/ChatGPT for Chrome', opts), 'other');
  assert.equal(hostPathClass('/opt/host', opts), 'other');
});

test('live hosts are the OpenAI host processes whose parent is the user\'s Chrome', () => {
  const ps = [
    '  100     1 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '  200   100 /Users/x/.codex/plugins/cache/openai-bundled/chrome/latest/extension-host/macos/arm64/ChatGPT for Chrome',
    '  201   100 /Users/x/.codex/plugins/cache/openai-bundled/chrome/latest/extension-host/macos/arm64/ChatGPT for Chrome',
    '  300   999 /somewhere/ChatGPT for Chrome',
    '  400   100 /Applications/Google Chrome.app/Contents/Frameworks/Helper',
  ].join('\n');
  assert.equal(countLiveHosts(ps), 2);
  assert.equal(countLiveHosts(''), 0);
});

// ---- the bind rule -------------------------------------------------------------------------------------------

const NAMES = new Map([['Default', 'Personal'], ['Profile 8', 'Work'], ['Profile 6', 'School']]);

test('automatic bind: a unique display name and exactly one live backend carrying it', () => {
  const backends = [{instanceId: 'a', profileName: 'Personal'}, {instanceId: 'b', profileName: 'Work'}];
  assert.deepEqual(decideBinding({directory: 'Default', displayNames: NAMES, backends}), {outcome: 'bound', how: 'automatic', instanceId: 'a'});
});

test('automatic bind is undetermined, never a guess, when labels are missing, ambiguous or absent', () => {
  const undetermined = (backends, names = NAMES, directory = 'Default') => decideBinding({directory, displayNames: names, backends});
  assert.deepEqual(undetermined([]), {outcome: 'undetermined', reason: 'no_live_backends'});
  assert.deepEqual(undetermined([{instanceId: 'a'}]), {outcome: 'undetermined', reason: 'unlabelled'}, 'a singleton unlabelled backend is never bound');
  assert.deepEqual(undetermined([{instanceId: 'a'}, {instanceId: 'b'}]), {outcome: 'undetermined', reason: 'unlabelled'});
  assert.deepEqual(undetermined([{instanceId: 'a', profileName: 'Work'}]), {outcome: 'undetermined', reason: 'no_matching_backend'});
  assert.deepEqual(undetermined([{instanceId: 'a', profileName: 'Personal'}, {instanceId: 'b', profileName: 'Personal'}]), {outcome: 'undetermined', reason: 'several_matching_backends'});
  const twins = new Map([['Default', 'Same'], ['Profile 8', 'Same']]);
  assert.deepEqual(undetermined([{instanceId: 'a', profileName: 'Same'}], twins), {outcome: 'undetermined', reason: 'display_name_not_unique'});
  assert.deepEqual(undetermined([{instanceId: 'a', profileName: 'Personal'}], NAMES, 'Profile 1'), {outcome: 'undetermined', reason: 'no_display_name'});
});

test('an explicit pick is accepted only for a live backend, and never against the runtime\'s own label', () => {
  const backends = [{instanceId: 'a'}, {instanceId: 'b', profileName: 'Work'}, {instanceId: 'c', profileName: 'Personal'}];
  assert.deepEqual(decideBinding({directory: 'Default', displayNames: NAMES, backends, explicitId: 'c'}), {outcome: 'bound', how: 'explicit', instanceId: 'c'});
  assert.deepEqual(decideBinding({directory: 'Default', displayNames: NAMES, backends: backends.slice(0, 2), explicitId: 'a'}), {outcome: 'bound', how: 'explicit', instanceId: 'a'});
  assert.deepEqual(decideBinding({directory: 'Default', displayNames: NAMES, backends, explicitId: 'zzz'}), {outcome: 'refused', reason: 'not_live'});
  assert.deepEqual(decideBinding({directory: 'Default', displayNames: NAMES, backends, explicitId: 'b'}), {outcome: 'refused', reason: 'labelled_other_profile'});
});
