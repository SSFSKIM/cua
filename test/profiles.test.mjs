// The profile registry ($CUA_HOME/profiles.json), the passive Chrome facts it is checked against (a scratch Chrome
// user-data directory stands in for the real one), and the bind rule. Nothing here reads the real Chrome profile
// tree, launches a runtime or talks to a browser.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, mkdirSync, writeFileSync, readFileSync, statSync, existsSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {readRegistry, addProfile, removeProfile, bindProfile, profileStatuses, withLiveness, reasonText, PROFILE_KEY} from '../src/profiles/registry.mjs';
import {fakeChromeFacts} from './fixtures/chrome-facts.mjs';
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
  assert.deepEqual(personal, {key: 'personal', chromeProfileDirectory: 'Default', extension: 'installed'});
  const work = addProfile({home, key: 'work', directory: 'Profile 8', chrome});
  assert.equal(work.extension, 'absent');
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

// Review fix: bind's discovery takes seconds; the id it found must not land on a registration that changed meanwhile.
test('bind records the instance id only while the registration is the one discovery started from', t => {
  const {home, chrome} = fakeChrome(t, THREE);
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  const started = readRegistry(home).profiles.personal;
  removeProfile({home, key: 'personal'});
  addProfile({home, key: 'personal', directory: 'Profile 8', chrome});
  assert.throws(() => bindProfile({home, key: 'personal', extensionInstanceId: 'inst-default', expected: started}),
    error => error.code === 'profile_changed' && /changed while/.test(error.message) && /bind personal again/.test(error.hint));
  assert.deepEqual(readRegistry(home).profiles.personal, {chromeProfileDirectory: 'Profile 8'}, 'nothing was recorded');
  removeProfile({home, key: 'personal'});
  assert.throws(() => bindProfile({home, key: 'personal', extensionInstanceId: 'inst-default', expected: started}), error => error.code === 'profile_changed' && /was removed/.test(error.message));
  // Bound by another command meanwhile: refused too, the other binding stands.
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  const unbound = readRegistry(home).profiles.personal;
  bindProfile({home, key: 'personal', extensionInstanceId: 'inst-other'});
  assert.throws(() => bindProfile({home, key: 'personal', extensionInstanceId: 'inst-mine', expected: unbound}), error => error.code === 'profile_changed');
  assert.equal(readRegistry(home).profiles.personal.extensionInstanceId, 'inst-other');
  // Unchanged (a rebind of a bound profile included): recorded.
  const bound = readRegistry(home).profiles.personal;
  assert.equal(bindProfile({home, key: 'personal', extensionInstanceId: 'inst-new', expected: bound}).extensionInstanceId, 'inst-new');
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
// Live Google Chrome extension backends (the only bind candidates).
const chrome = (...backends) => backends.map(b => ({family: 'chrome', ...b}));

// Without an explicit pick nothing is ever bound (issue #21): the rule only marks the likely match, for the user.
test('the likely match: a unique display name and exactly one live backend carrying it, never bound without a pick', () => {
  const backends = chrome({instanceId: 'a', profileName: 'Personal'}, {instanceId: 'b', profileName: 'Work'});
  assert.deepEqual(decideBinding({directory: 'Default', displayNames: NAMES, backends}), {outcome: 'pick_required', likelyMatch: 'a'});
  assert.deepEqual(decideBinding({directory: 'Default', displayNames: NAMES, backends: chrome({instanceId: 'a', profileName: 'Personal'})}),
    {outcome: 'pick_required', likelyMatch: 'a'}, 'a lone labelled match is still only marked');
});

test('no likely match, never a guess, when labels are missing, ambiguous or absent', () => {
  const decide = (backends, names = NAMES, directory = 'Default') => decideBinding({directory, displayNames: names, backends: chrome(...backends)});
  assert.deepEqual(decide([]), {outcome: 'undetermined', reason: 'no_live_backends'});
  assert.deepEqual(decide([{instanceId: 'a'}]), {outcome: 'pick_required', reason: 'unlabelled'}, 'a singleton unlabelled backend is never marked');
  assert.deepEqual(decide([{instanceId: 'a'}, {instanceId: 'b'}]), {outcome: 'pick_required', reason: 'unlabelled'});
  assert.deepEqual(decide([{instanceId: 'a', profileName: 'Work'}]), {outcome: 'pick_required', reason: 'no_matching_backend'});
  assert.deepEqual(decide([{instanceId: 'a', profileName: 'Personal'}, {instanceId: 'b', profileName: 'Personal'}]), {outcome: 'pick_required', reason: 'several_matching_backends'});
  const twins = new Map([['Default', 'Same'], ['Profile 8', 'Same']]);
  assert.deepEqual(decide([{instanceId: 'a', profileName: 'Same'}], twins), {outcome: 'pick_required', reason: 'display_name_not_unique'});
  assert.deepEqual(decide([{instanceId: 'a', profileName: 'Personal'}], NAMES, 'Profile 1'), {outcome: 'pick_required', reason: 'no_display_name'});
});

test('an explicit pick is accepted only for a live backend, and never against the runtime\'s own label', () => {
  const backends = chrome({instanceId: 'a'}, {instanceId: 'b', profileName: 'Work'}, {instanceId: 'c', profileName: 'Personal'});
  assert.deepEqual(decideBinding({directory: 'Default', displayNames: NAMES, backends, explicitId: 'c'}), {outcome: 'bound', how: 'explicit', instanceId: 'c'});
  assert.deepEqual(decideBinding({directory: 'Default', displayNames: NAMES, backends: backends.slice(0, 2), explicitId: 'a'}), {outcome: 'bound', how: 'explicit', instanceId: 'a'});
  assert.deepEqual(decideBinding({directory: 'Default', displayNames: NAMES, backends, explicitId: 'zzz'}), {outcome: 'refused', reason: 'not_live'});
  assert.deepEqual(decideBinding({directory: 'Default', displayNames: NAMES, backends, explicitId: 'b'}), {outcome: 'refused', reason: 'labelled_other_profile'});
});

test('without a known display name for the profile, a labelled live backend can still be picked explicitly', () => {
  const backends = chrome({instanceId: 'a', profileName: 'Personal'}, {instanceId: 'b', profileName: 'Work'});
  for (const displayNames of [new Map(), new Map([['Profile 8', 'Work']])])
    assert.deepEqual(decideBinding({directory: 'Default', displayNames, backends, explicitId: 'b'}), {outcome: 'bound', how: 'explicit', instanceId: 'b'});
  assert.deepEqual(decideBinding({directory: 'Default', displayNames: new Map(), backends, explicitId: 'zzz'}), {outcome: 'refused', reason: 'not_live'});
});

// Review fix: an Edge backend labelled "Personal" (from Edge's own profiles) was bound to Chrome's uniquely named
// "Personal" profile. Only Google Chrome's backends are candidates; a backend without a family is not Chrome's.
test('only Google Chrome backends are bind candidates: another browser\'s or a family-less backend is never bound', () => {
  const edge = {instanceId: 'e', family: 'edge', profileName: 'Personal'};
  const unknown = {instanceId: 'u', profileName: 'Personal'};
  for (const backends of [[edge], [unknown], [edge, unknown]])
    assert.deepEqual(decideBinding({directory: 'Default', displayNames: NAMES, backends}), {outcome: 'undetermined', reason: 'no_live_backends'}, JSON.stringify(backends));
  const mixed = [edge, ...chrome({instanceId: 'c'})];
  assert.deepEqual(decideBinding({directory: 'Default', displayNames: NAMES, backends: mixed}), {outcome: 'pick_required', reason: 'unlabelled'}, 'the matching Edge label does not count');
  const both = [edge, ...chrome({instanceId: 'c', profileName: 'Personal'})];
  assert.deepEqual(decideBinding({directory: 'Default', displayNames: NAMES, backends: both}), {outcome: 'pick_required', likelyMatch: 'c'}, 'not several_matching_backends: Edge is no candidate');
  for (const explicitId of ['e', 'u'])
    assert.deepEqual(decideBinding({directory: 'Default', displayNames: NAMES, backends: [edge, unknown, ...chrome({instanceId: 'c'})], explicitId}), {outcome: 'refused', reason: 'not_live'}, explicitId);
});

// ---- Chrome data this process may not read (macOS privacy protection) ---------------------------------------------

// A permission-denied read stands in for macOS's EPERM: mode 000 gives EACCES to a non-root process. Permissions are
// restored before the scratch directory is removed.
const asRoot = process.getuid?.() === 0;
function withDenied(paths, body) {
  for (const path of paths) chmodSync(path, 0o000);
  try { body(); } finally { for (const path of [...paths].reverse()) chmodSync(path, 0o755); }
}

test('the Chrome facts are three-valued: a refused read is unreadable with its code, never absent', {skip: asRoot}, t => {
  const {userData, chrome} = fakeChrome(t, {...THREE, 'Profile 9': {extension: true}});
  assert.equal(chrome.profileDirectoryExists('Default'), 'exists');
  assert.equal(chrome.profileDirectoryExists('Profile 99'), 'missing');
  assert.equal(chrome.extensionInstalled('Default'), 'installed');
  assert.equal(chrome.extensionInstalled('Profile 8'), 'absent');
  assert.equal(chrome.extensionInstalled('Profile 99'), 'absent');
  assert.equal(chrome.readError('Profile 8'), undefined);
  withDenied([join(userData, 'Profile 9', 'Extensions')], () => {
    assert.equal(chrome.profileDirectoryExists('Profile 9'), 'exists');
    assert.equal(chrome.extensionInstalled('Profile 9'), 'unreadable');
    assert.equal(chrome.readError('Profile 9'), 'EACCES');
  });
  withDenied([userData], () => {
    assert.equal(chrome.profileDirectoryExists('Default'), 'unreadable', 'the whole user-data directory refused');
    assert.equal(chrome.extensionInstalled('Default'), 'unreadable');
    assert.equal(chrome.readError('Default'), 'EACCES');
  });
});

test('a Local State and a native-messaging manifest this process may not read report the permission cause', {skip: asRoot}, t => {
  const {userData, chrome} = fakeChrome(t, THREE);
  mkdirSync(join(userData, 'NativeMessagingHosts'));
  writeFileSync(join(userData, 'NativeMessagingHosts', 'com.openai.codexextension.json'), '{"path": "/x"}');
  withDenied([join(userData, 'Local State'), join(userData, 'NativeMessagingHosts')], () => {
    assert.throws(() => chrome.displayNames(), error => error.code === 'chrome_local_state_unreadable' && error.readError === 'EACCES'
      && /may not read/.test(error.message) && /Full Disk Access/.test(error.hint) && /live check still works/.test(error.hint));
    assert.deepEqual(chrome.nativeHost({cuaHome: '/c'}), {readError: 'EACCES'});
  });
});

test('readiness never calls unreadable Chrome data "not installed"; a bound profile there is ready only on live evidence', t => {
  const s = scratch();
  t.after(s.cleanup);
  const home = join(s.dir, 'home');
  const chrome = fakeChromeFacts({Default: {extension: 'unreadable'}, 'Profile 8': {directory: 'unreadable'}, 'Profile 6': {extension: 'absent'}, 'Profile 7': {extension: 'installed'}});
  for (const [key, directory] of [['personal', 'Default'], ['work', 'Profile 8'], ['school', 'Profile 6'], ['spare', 'Profile 7']]) addProfile({home, key, directory, chrome});
  bindProfile({home, key: 'personal', extensionInstanceId: 'inst-p', now: new Date('2026-10-05T00:00:00Z')});
  const files = Object.fromEntries(profileStatuses({home, chrome}).map(p => [p.key, p]));
  assert.deepEqual(files.personal, {key: 'personal', chromeProfileDirectory: 'Default', ready: false, reason: 'chrome_data_unreadable', extensionInstanceId: 'inst-p', boundAt: '2026-10-05T00:00:00.000Z', chromeDataError: 'EPERM'});
  assert.deepEqual(files.work, {key: 'work', chromeProfileDirectory: 'Profile 8', ready: false, reason: 'chrome_data_unreadable', chromeDataError: 'EPERM'});
  assert.equal(files.school.reason, 'extension_not_installed', 'absent stays absent');
  assert.equal(files.spare.reason, 'not_bound');
  const statuses = Object.values(files);
  const live = ids => Object.fromEntries(withLiveness(statuses, ids).map(p => [p.key, p]));
  assert.deepEqual(live(['inst-p']).personal, {key: 'personal', chromeProfileDirectory: 'Default', ready: true, extensionInstanceId: 'inst-p', boundAt: '2026-10-05T00:00:00.000Z', chromeDataError: 'EPERM'});
  for (const ids of [['inst-other'], [], null]) {
    assert.equal(live(ids).personal.reason, 'chrome_data_unreadable', `not live: ${ids}`);
    assert.equal(live(ids).work.reason, 'chrome_data_unreadable', 'an unbound profile cannot become ready on live evidence');
  }
  assert.match(reasonText(files.personal), /Full Disk Access for your terminal.*the live check still works; its bound extension instance was not confirmed live: .*Chrome profile "Default".*extension's icon/);
  assert.match(reasonText(files.work), /the live check still works; it is not bound yet: cua profiles bind work works without that access/);
});

test('add registers a profile in each extension state and never refuses an unreadable one', t => {
  const s = scratch();
  t.after(s.cleanup);
  const home = join(s.dir, 'home');
  const chrome = fakeChromeFacts({Default: {extension: 'installed'}, 'Profile 8': {extension: 'absent'}, 'Profile 6': {extension: 'unreadable'}, 'Profile 7': {directory: 'unreadable'}});
  assert.deepEqual(addProfile({home, key: 'personal', directory: 'Default', chrome}), {key: 'personal', chromeProfileDirectory: 'Default', extension: 'installed'});
  assert.deepEqual(addProfile({home, key: 'work', directory: 'Profile 8', chrome}), {key: 'work', chromeProfileDirectory: 'Profile 8', extension: 'absent'});
  assert.deepEqual(addProfile({home, key: 'school', directory: 'Profile 6', chrome}), {key: 'school', chromeProfileDirectory: 'Profile 6', extension: 'unreadable', chromeDataError: 'EPERM'});
  assert.deepEqual(addProfile({home, key: 'spare', directory: 'Profile 7', chrome}), {key: 'spare', chromeProfileDirectory: 'Profile 7', extension: 'unreadable', chromeDataError: 'EPERM'});
  assert.throws(() => addProfile({home, key: 'gone', directory: 'Profile 99', chrome}), error => error.code === 'chrome_profile_not_found');
  assert.deepEqual(Object.keys(readRegistry(home).profiles), ['personal', 'work', 'school', 'spare']);
});
