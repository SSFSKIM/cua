// `cua profiles bind` and readiness with the live check as a whole, with an injected backend listing and picker, and
// the CLI routes for add/list/remove/bind against a scratch CUA_HOME and a scratch Chrome user-data directory (HOME
// points there). No runtime is launched: the live listing is profiles-inventory.test.mjs's (and serve-cli.test.mjs's
// through a fake runtime), the real run is evidence.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {REPO, scratch} from './fixtures/runtime-fixture.mjs';
import {chromeFacts, OPENAI_EXTENSION_ID} from '../src/profiles/chrome.mjs';
import {addProfile, bindProfile, readRegistry, reasonText, removeProfile} from '../src/profiles/registry.mjs';
import {bindCommand, profileReadiness} from '../src/profiles/commands.mjs';
import {fakeChromeFacts} from './fixtures/chrome-facts.mjs';

function setup(t, profiles = {Default: {name: 'Personal', extension: true}, 'Profile 8': {name: 'Work'}, 'Profile 6': {name: 'School'}}) {
  const s = scratch();
  t.after(s.cleanup);
  const userHome = join(s.dir, 'user');
  const userData = join(userHome, 'Library', 'Application Support', 'Google', 'Chrome');
  const infoCache = {};
  for (const [dir, {name, extension}] of Object.entries(profiles)) {
    mkdirSync(join(userData, dir), {recursive: true});
    infoCache[dir] = {name};
    if (extension) {
      const v = join(userData, dir, 'Extensions', OPENAI_EXTENSION_ID, '1.0_0');
      mkdirSync(v, {recursive: true});
      writeFileSync(join(v, 'manifest.json'), '{}');
    }
  }
  writeFileSync(join(userData, 'Local State'), JSON.stringify({profile: {info_cache: infoCache, profiles_order: Object.keys(infoCache)}}));
  const home = join(s.dir, 'cua');
  return {home, userHome, userData, chrome: chromeFacts({userData})};
}

// The live listing; a backend without its own `family` key is a Google Chrome one.
const listing = backends => async () => ({backends: backends.map(b => 'family' in b ? b : {family: 'chrome', ...b}), elicitationsDeclined: 0, teardown: {confirmed: true, steps: ['eof']}});

test('bind stores the automatically labelled backend and says how it was chosen', async t => {
  const {home, chrome} = setup(t);
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  const result = await bindCommand({home, key: 'personal', chrome, listBackends: listing([{instanceId: 'inst-a', profileName: 'Personal', tabCount: 3}, {instanceId: 'inst-b', tabCount: 0}])});
  assert.deepEqual({ok: result.ok, how: result.how, id: result.extensionInstanceId}, {ok: true, how: 'automatic', id: 'inst-a'});
  assert.equal(readRegistry(home).profiles.personal.extensionInstanceId, 'inst-a');
});

test('an undetermined bind without a picker stores nothing and returns the listing with tab counts, never labels', async t => {
  const {home, chrome} = setup(t);
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  const result = await bindCommand({home, key: 'personal', chrome, listBackends: listing([{instanceId: 'inst-a', tabCount: 38}, {instanceId: 'inst-b', tabCount: 0}])});
  assert.deepEqual(result, {ok: false, outcome: 'undetermined', reason: 'unlabelled', key: 'personal', elicitationsDeclined: 0,
    backends: [{instanceId: 'inst-a', tabCount: 38, label: 'unlabelled'}, {instanceId: 'inst-b', tabCount: 0, label: 'unlabelled'}]});
  assert.equal(readRegistry(home).profiles.personal.extensionInstanceId, undefined);
  const labelled = await bindCommand({home, key: 'personal', chrome, listBackends: listing([{instanceId: 'inst-b', profileName: 'Work', tabCount: 2}])});
  assert.deepEqual(labelled.backends, [{instanceId: 'inst-b', tabCount: 2, label: 'other-profile'}]);
  assert.ok(!JSON.stringify(labelled).includes('Work'), 'display names never leave the bind');
});

test('the interactive picker binds the user\'s choice; cancelling stores nothing', async t => {
  const {home, chrome} = setup(t);
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  const backends = [{instanceId: 'inst-a', tabCount: 38}, {instanceId: 'inst-b', tabCount: 0}];
  const offered = [];
  const cancelled = await bindCommand({home, key: 'personal', chrome, listBackends: listing(backends), pick: async list => { offered.push(list); return null; }});
  assert.equal(cancelled.ok, false);
  assert.equal(readRegistry(home).profiles.personal.extensionInstanceId, undefined);
  assert.deepEqual(offered[0].map(b => b.instanceId), ['inst-a', 'inst-b']);
  const picked = await bindCommand({home, key: 'personal', chrome, listBackends: listing(backends), pick: async () => 'inst-a'});
  assert.deepEqual({ok: picked.ok, how: picked.how, id: picked.extensionInstanceId}, {ok: true, how: 'explicit', id: 'inst-a'});
});

test('an explicit --extension-instance-id is bound only when live, and never against the runtime\'s label', async t => {
  const {home, chrome} = setup(t);
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  const backends = [{instanceId: 'inst-a', tabCount: 38}, {instanceId: 'inst-b', profileName: 'Work', tabCount: 0}];
  await assert.rejects(bindCommand({home, key: 'personal', chrome, explicitId: 'gone', listBackends: listing(backends)}), e => e.code === 'bind_refused' && /not among the live backends/.test(e.message));
  await assert.rejects(bindCommand({home, key: 'personal', chrome, explicitId: 'inst-b', listBackends: listing(backends)}), e => e.code === 'bind_refused');
  const ok = await bindCommand({home, key: 'personal', chrome, explicitId: 'inst-a', listBackends: listing(backends), pick: async () => assert.fail('no picker with an explicit id')});
  assert.deepEqual({ok: ok.ok, how: ok.how}, {ok: true, how: 'explicit'});
  assert.deepEqual(ok.backends.map(b => b.instanceId), ['inst-a', 'inst-b'], 'the listing is reported with the pick');
});

test('bind refuses an unknown key and a profile without the extension before launching anything', async t => {
  const {home, chrome} = setup(t);
  addProfile({home, key: 'work', directory: 'Profile 8', chrome});
  const never = async () => assert.fail('nothing may be launched');
  await assert.rejects(bindCommand({home, key: 'nobody', chrome, listBackends: never}), e => e.code === 'unknown_profile');
  await assert.rejects(bindCommand({home, key: 'work', chrome, listBackends: never}), e => e.code === 'profile_not_ready' && /extension/.test(e.message));
});

test('an unreadable Local State leaves the automatic branch undetermined but still allows an explicit pick', async t => {
  const {home, userData, chrome} = setup(t);
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  writeFileSync(join(userData, 'Local State'), 'garbage');
  const auto = await bindCommand({home, key: 'personal', chrome, listBackends: listing([{instanceId: 'inst-a', profileName: 'Personal'}])});
  assert.deepEqual({ok: auto.ok, reason: auto.reason}, {ok: false, reason: 'no_display_name'});
  const pick = await bindCommand({home, key: 'personal', chrome, explicitId: 'inst-a', listBackends: listing([{instanceId: 'inst-a'}])});
  assert.equal(pick.ok, true);
  const labelled = await bindCommand({home, key: 'personal', chrome, explicitId: 'inst-b', listBackends: listing([{instanceId: 'inst-b', profileName: 'Someone'}])});
  assert.deepEqual({ok: labelled.ok, id: labelled.extensionInstanceId}, {ok: true, id: 'inst-b'}, 'a label cannot conflict with an unknown name');
});

test('without the profile\'s own display name, a labelled backend is listed as not comparable, never as another profile', async t => {
  const {home, userData, chrome} = setup(t);
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  writeFileSync(join(userData, 'Local State'), 'garbage');
  const result = await bindCommand({home, key: 'personal', chrome, listBackends: listing([{instanceId: 'inst-a', profileName: 'Personal', tabCount: 4}, {instanceId: 'inst-b', tabCount: 0}])});
  assert.deepEqual(result.backends, [{instanceId: 'inst-a', tabCount: 4, label: 'comparison-unknown'}, {instanceId: 'inst-b', tabCount: 0, label: 'unlabelled'}]);
  assert.ok(!JSON.stringify(result).includes('Personal'), 'display names never leave the bind');
});

// Review fix: the reviewer's reproduction, an Edge backend labelled "Personal" auto-bound to Chrome's "Personal".
test('bind never binds another browser\'s backend and reports such backends only as an excluded count', async t => {
  const {home, chrome} = setup(t);
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  const edge = {instanceId: 'inst-edge', family: 'edge', profileName: 'Personal', tabCount: 5};
  const noFamily = {instanceId: 'inst-none', family: undefined, profileName: 'Personal', tabCount: 1};
  const alone = await bindCommand({home, key: 'personal', chrome, listBackends: listing([edge])});
  assert.deepEqual(alone, {ok: false, outcome: 'undetermined', reason: 'no_live_backends', key: 'personal', backends: [], elicitationsDeclined: 0, nonChromeExcluded: 1});
  const offered = [];
  const mixed = await bindCommand({home, key: 'personal', chrome, listBackends: listing([edge, noFamily, {instanceId: 'inst-c', tabCount: 2}]),
    pick: async (list, reason, excluded) => { offered.push({list, reason, excluded}); return null; }});
  assert.deepEqual(offered, [{list: [{instanceId: 'inst-c', tabCount: 2, label: 'unlabelled'}], reason: 'unlabelled', excluded: 2}]);
  assert.deepEqual({ok: mixed.ok, reason: mixed.reason, excluded: mixed.nonChromeExcluded}, {ok: false, reason: 'unlabelled', excluded: 2});
  for (const result of [alone, mixed]) assert.ok(!/inst-edge|inst-none/.test(JSON.stringify(result)), 'a non-Chrome backend is a count, never listed');
  for (const explicitId of ['inst-edge', 'inst-none'])
    await assert.rejects(bindCommand({home, key: 'personal', chrome, explicitId, listBackends: listing([edge, noFamily])}), e => e.code === 'bind_refused' && /Google Chrome/.test(e.message), explicitId);
  assert.equal(readRegistry(home).profiles.personal.extensionInstanceId, undefined);
  // With Chrome's own backend labelled too, that one is bound, and the result still counts the excluded one.
  const bound = await bindCommand({home, key: 'personal', chrome, listBackends: listing([edge, {instanceId: 'inst-c', profileName: 'Personal', tabCount: 2}])});
  assert.deepEqual({ok: bound.ok, how: bound.how, id: bound.extensionInstanceId, excluded: bound.nonChromeExcluded}, {ok: true, how: 'automatic', id: 'inst-c', excluded: 1});
});

// Review fix: the reviewer's reproduction, the key removed and re-added for Profile 8 while discovery for Default ran.
test('a registration that changes during discovery is not bound with the instance found for the old one', async t => {
  const {home, userData, chrome} = setup(t);
  const v = join(userData, 'Profile 8', 'Extensions', OPENAI_EXTENSION_ID, '1.0_0');
  mkdirSync(v, {recursive: true});
  writeFileSync(join(v, 'manifest.json'), '{}');
  const duringDiscovery = (change, backends) => async () => { change(); return listing(backends)(); };
  const reAdd = () => { removeProfile({home, key: 'personal'}); addProfile({home, key: 'personal', directory: 'Profile 8', chrome}); };
  for (const [how, extra] of [['automatic', {}], ['explicit', {explicitId: 'inst-a'}], ['picked', {pick: async () => 'inst-a'}]]) {
    if (readRegistry(home).profiles.personal) removeProfile({home, key: 'personal'});
    addProfile({home, key: 'personal', directory: 'Default', chrome});
    const backends = how === 'automatic' ? [{instanceId: 'inst-a', profileName: 'Personal'}] : [{instanceId: 'inst-a'}, {instanceId: 'inst-b'}];
    await assert.rejects(bindCommand({home, key: 'personal', chrome, listBackends: duringDiscovery(reAdd, backends), ...extra}),
      e => e.code === 'profile_changed' && /bind personal again/.test(e.hint), how);
    assert.deepEqual(readRegistry(home).profiles.personal, {chromeProfileDirectory: 'Profile 8'}, `${how}: nothing recorded under the re-added key`);
  }
  // Removed for good during discovery: refused as removed, and nothing re-created.
  addProfile({home, key: 'other', directory: 'Default', chrome});
  await assert.rejects(bindCommand({home, key: 'other', chrome, listBackends: duringDiscovery(() => removeProfile({home, key: 'other'}), [{instanceId: 'inst-a', profileName: 'Personal'}])}),
    e => e.code === 'profile_changed' && /was removed/.test(e.message));
  assert.equal(readRegistry(home).profiles.other, undefined);
});

// ---- readiness with the live check ---------------------------------------------------------------------------------

const failing = error => async () => { throw error; };

test('readiness: a bound profile is ready only while its instance is live; other live backends is binding_stale, none live is host_not_live, no listing is backends_unlistable', async t => {
  const {home, chrome} = setup(t, {Default: {name: 'Personal', extension: true}, 'Profile 8': {name: 'Work'}});
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  addProfile({home, key: 'work', directory: 'Profile 8', chrome});
  bindProfile({home, key: 'personal', extensionInstanceId: 'inst-a', now: new Date('2026-10-03T00:00:00Z')});
  const personal = async listBackends => (await profileReadiness({home, chrome, listBackends})).profiles.find(p => p.key === 'personal');
  const bound = {key: 'personal', chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-a', boundAt: '2026-10-03T00:00:00.000Z'};

  // live
  assert.deepEqual(await personal(listing([{instanceId: 'other'}, {instanceId: 'inst-a'}])), {...bound, ready: true});
  // stale: backends are live, the bound one is not (a toggle or reinstall minted a new id), even a lone new one
  assert.deepEqual(await personal(listing([{instanceId: 'inst-new'}])), {...bound, ready: false, reason: 'binding_stale'});
  // only Google Chrome's backends are evidence: the bound id on another browser's or a family-less backend is not live
  const edge = {instanceId: 'inst-a', family: 'edge'};
  const noFamily = {instanceId: 'inst-a', family: undefined};
  assert.deepEqual(await personal(listing([edge, noFamily, {instanceId: 'other'}])), {...bound, ready: false, reason: 'binding_stale'});
  // host_not_live: the listing worked and no Google Chrome backend is live at all, so no host serves this profile
  // (Chrome closed, or its host exited); never stale, never ready
  assert.deepEqual(await personal(listing([edge, noFamily])), {...bound, ready: false, reason: 'host_not_live'});
  assert.deepEqual(await personal(listing([])), {...bound, ready: false, reason: 'host_not_live'});
  // unlistable: the listing itself failed
  const failed = await profileReadiness({home, chrome, listBackends: failing(Object.assign(new Error('the runtime did not answer initialize in time'), {code: 'runtime_unresponsive'}))});
  assert.deepEqual(failed.profiles.find(p => p.key === 'personal'), {...bound, ready: false, reason: 'backends_unlistable'});
  assert.deepEqual(failed.listingError, {code: 'runtime_unresponsive', message: 'the runtime did not answer initialize in time'});
  const unconfirmed = await profileReadiness({home, chrome, listBackends: async () => ({backends: [{instanceId: 'inst-a'}], teardown: {confirmed: false, steps: ['eof'], reason: 'a member survived'}})});
  assert.equal(unconfirmed.profiles.find(p => p.key === 'personal').reason, 'backends_unlistable', 'a listing whose runtime was not shown stopped proves nothing');
  assert.equal(unconfirmed.listingError.code, 'runtime_teardown_unconfirmed');
  // a profile that is not ready for a file reason keeps that reason whatever is live
  for (const list of [[{instanceId: 'inst-a'}], []]) assert.equal((await profileReadiness({home, chrome, listBackends: listing(list)})).profiles.find(p => p.key === 'work').reason, 'extension_not_installed');
});

test('the not-live reasons name the key, the Chrome profile directory and the one wake action; toggling is not offered as a plain wake', () => {
  const p = {key: 'personal', chromeProfileDirectory: 'Profile 8', extensionInstanceId: 'inst-a'};
  const notLive = reasonText({...p, reason: 'host_not_live'});
  assert.match(notLive, /Chrome profile "Profile 8"/);
  assert.match(notLive, /click the OpenAI \(ChatGPT\) extension's icon.*then retry/);
  assert.match(notLive, /chrome:\/\/extensions.*new instance id.*cua profiles bind personal/, 'a toggle wakes it too but needs a rebind');
  // Other profiles' backends are live but not this one's: unlabelled backends cannot tell a sleeping host from a new id,
  // so the text says so and gives both steps, the wake first.
  const stale = reasonText({...p, reason: 'binding_stale'});
  assert.match(stale, /Chrome profile "Profile 8".*click the OpenAI \(ChatGPT\) extension's icon.*cua profiles bind personal/);
  assert.match(stale, /cannot tell which/);
});

test('readiness lists nothing when no profile is bound and otherwise ready', async t => {
  const {home, chrome} = setup(t);
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  addProfile({home, key: 'work', directory: 'Profile 8', chrome});
  bindProfile({home, key: 'work', extensionInstanceId: 'inst-w'});
  const result = await profileReadiness({home, chrome, listBackends: async () => assert.fail('nothing may be launched')});
  assert.deepEqual(result.profiles.map(p => [p.key, p.ready, p.reason]), [['personal', false, 'not_bound'], ['work', false, 'extension_not_installed']]);
  assert.equal(result.listingError, undefined);
});

test('bind over a stale binding marks it and still needs the user\'s pick, even for a lone new unlabelled backend', async t => {
  const {home, chrome} = setup(t);
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  bindProfile({home, key: 'personal', extensionInstanceId: 'inst-old'});
  const lone = await bindCommand({home, key: 'personal', chrome, listBackends: listing([{instanceId: 'inst-new', tabCount: 21}])});
  assert.deepEqual(lone, {ok: false, outcome: 'undetermined', reason: 'unlabelled', key: 'personal', elicitationsDeclined: 0, staleBinding: 'inst-old',
    backends: [{instanceId: 'inst-new', tabCount: 21, label: 'unlabelled'}]});
  assert.equal(readRegistry(home).profiles.personal.extensionInstanceId, 'inst-old', 'nothing is rebound for the user');

  const offered = [];
  const cancelled = await bindCommand({home, key: 'personal', chrome, listBackends: listing([{instanceId: 'inst-new', tabCount: 21}]), pick: async (list, reason, excluded, context) => { offered.push({list, reason, excluded, context}); return null; }});
  assert.equal(cancelled.ok, false);
  assert.deepEqual(offered, [{list: [{instanceId: 'inst-new', tabCount: 21, label: 'unlabelled'}], reason: 'unlabelled', excluded: 0, context: {staleBinding: 'inst-old'}}]);
  assert.equal(readRegistry(home).profiles.personal.extensionInstanceId, 'inst-old');

  const picked = await bindCommand({home, key: 'personal', chrome, explicitId: 'inst-new', listBackends: listing([{instanceId: 'inst-new', tabCount: 21}])});
  assert.deepEqual({ok: picked.ok, id: picked.extensionInstanceId, how: picked.how, staleBinding: picked.staleBinding}, {ok: true, id: 'inst-new', how: 'explicit', staleBinding: 'inst-old'});
  assert.equal(readRegistry(home).profiles.personal.extensionInstanceId, 'inst-new');

  // With no backend live (or only another browser's), or with the bound one live, nothing is called stale.
  for (const backends of [[], [{instanceId: 'inst-x', family: 'edge'}], [{instanceId: 'inst-new'}, {instanceId: 'inst-b'}]])
    assert.equal((await bindCommand({home, key: 'personal', chrome, listBackends: listing(backends)})).staleBinding, undefined);
});

// ---- the CLI routes ----------------------------------------------------------------------------------------------

const CLI = join(REPO, 'bin', 'cua.mjs');
const cua = (args, {home, userHome}) => spawnSync(process.execPath, [CLI, ...args], {env: {...process.env, CUA_HOME: home, HOME: userHome}, encoding: 'utf8', timeout: 30_000});

test('cua profiles add/list/remove against the user\'s Chrome directory, with readiness reasons', t => {
  const env = setup(t);
  const add = cua(['profiles', 'add', 'personal', '--chrome-profile', 'Default'], env);
  assert.equal(add.status, 0, add.stderr);
  assert.match(add.stdout, /registered personal -> Chrome profile "Default"; the OpenAI extension is installed there/);
  const work = cua(['profiles', 'add', 'work', '--chrome-profile', 'Profile 8', '--json'], env);
  assert.deepEqual(JSON.parse(work.stdout), {ok: true, key: 'work', chromeProfileDirectory: 'Profile 8', extension: 'absent'});
  const list = JSON.parse(cua(['profiles', 'list', '--json'], env).stdout);
  assert.deepEqual(list.profiles.map(p => [p.key, p.ready, p.reason]), [['personal', false, 'not_bound'], ['work', false, 'extension_not_installed']]);
  const human = cua(['profiles', 'list'], env);
  assert.match(human.stdout, /work\s+not ready\s+Profile 8\s+the OpenAI extension is not installed/);
  const missing = cua(['profiles', 'add', 'school', '--chrome-profile', 'Profile 99'], env);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /chrome_profile_not_found/);
  assert.equal(cua(['profiles', 'remove', 'work'], env).status, 0);
  assert.deepEqual(JSON.parse(cua(['profiles', 'list', '--json'], env).stdout).profiles.map(p => p.key), ['personal']);
});

test('cua profiles list reports a bound profile it cannot check as backends_unlistable, naming why the listing failed', t => {
  const env = setup(t);
  assert.equal(cua(['profiles', 'add', 'personal', '--chrome-profile', 'Default'], env).status, 0);
  bindProfile({home: env.home, key: 'personal', extensionInstanceId: 'inst-a'});
  // No runtime is installed in this home, so the live backends cannot be listed.
  const json = cua(['profiles', 'list', '--json'], env);
  assert.equal(json.status, 0, json.stderr);
  const listed = JSON.parse(json.stdout);
  assert.deepEqual(listed.profiles.map(p => [p.key, p.ready, p.reason, p.extensionInstanceId]), [['personal', false, 'backends_unlistable', 'inst-a']]);
  assert.equal(listed.listingError, 'runtime_not_installed');
  const human = cua(['profiles', 'list'], env);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /^personal\s+not ready\s+Default\s+the live OpenAI extension backends could not be listed .*whether its bound instance is live cannot be told$/m);
  assert.match(human.stderr, /could not be listed \(runtime_not_installed: /);
});

test('cua profiles usage errors exit 2', t => {
  const env = setup(t);
  for (const args of [['profiles'], ['profiles', 'add', 'x'], ['profiles', 'add', '--chrome-profile', 'Default'], ['profiles', 'bind'], ['profiles', 'list', 'extra'], ['profiles', 'nope']])
    assert.equal(cua(args, env).status, 2, args.join(' '));
});

test('a bind whose runtime teardown was unconfirmed stores nothing and reports the cleanup failure', async t => {
  const {home, chrome} = setup(t);
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  const unconfirmed = async () => ({backends: [{instanceId: 'inst-a', profileName: 'Personal'}], elicitationsDeclined: 0, teardown: {confirmed: false, steps: ['eof', 'sigterm'], reason: 'listing timed out'}});
  await assert.rejects(bindCommand({home, key: 'personal', chrome, listBackends: unconfirmed}), e => e.code === 'runtime_teardown_unconfirmed' && /listing timed out/.test(e.message));
  await assert.rejects(bindCommand({home, key: 'personal', chrome, explicitId: 'inst-a', listBackends: unconfirmed}), e => e.code === 'runtime_teardown_unconfirmed');
  assert.equal(readRegistry(home).profiles.personal.extensionInstanceId, undefined);
});

// ---- Chrome data this process may not read (macOS privacy protection) ---------------------------------------------

function unreadableHome(t) {
  const s = scratch();
  t.after(s.cleanup);
  return join(s.dir, 'cua');
}

test('readiness lists the live backends for a bound profile whose Chrome data is unreadable, and the live backend decides', async t => {
  const home = unreadableHome(t);
  const chrome = fakeChromeFacts({Default: {extension: 'unreadable'}, 'Profile 8': {extension: 'unreadable'}});
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  addProfile({home, key: 'work', directory: 'Profile 8', chrome});
  // Only unbound ones: nothing can become ready, so nothing is launched.
  const idle = await profileReadiness({home, chrome, listBackends: async () => assert.fail('nothing may be launched')});
  assert.deepEqual(idle.profiles.map(p => [p.key, p.ready, p.reason, p.chromeDataError]), [['personal', false, 'chrome_data_unreadable', 'EPERM'], ['work', false, 'chrome_data_unreadable', 'EPERM']]);
  bindProfile({home, key: 'personal', extensionInstanceId: 'inst-a'});
  const personal = async listBackends => (await profileReadiness({home, chrome, listBackends})).profiles.find(p => p.key === 'personal');
  assert.deepEqual(await personal(listing([{instanceId: 'inst-a'}])).then(p => [p.ready, p.reason, p.extensionInstanceId]), [true, undefined, 'inst-a']);
  for (const list of [listing([{instanceId: 'inst-new'}]), listing([]), failing(Object.assign(new Error('x'), {code: 'runtime_unresponsive'}))])
    assert.deepEqual(await personal(list).then(p => [p.ready, p.reason]), [false, 'chrome_data_unreadable']);
});

test('bind skips the presence check when Chrome data is unreadable, still refuses an absent extension, and names a refused Local State', async t => {
  const home = unreadableHome(t);
  const never = async () => assert.fail('nothing may be launched');
  const absent = fakeChromeFacts({'Profile 8': {extension: 'absent'}});
  addProfile({home, key: 'work', directory: 'Profile 8', chrome: absent});
  await assert.rejects(bindCommand({home, key: 'work', chrome: absent, listBackends: never}), e => e.code === 'profile_not_ready' && /not installed/.test(e.message));

  const chrome = fakeChromeFacts({Default: {directory: 'unreadable'}}, {localState: 'unreadable'});
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  const labelled = await bindCommand({home, key: 'personal', chrome, listBackends: listing([{instanceId: 'inst-a', profileName: 'Personal', tabCount: 2}])});
  assert.deepEqual(labelled, {ok: false, outcome: 'undetermined', reason: 'local_state_unreadable', key: 'personal', elicitationsDeclined: 0,
    backends: [{instanceId: 'inst-a', tabCount: 2, label: 'comparison-unknown'}], chromeDataUnreadable: 'EPERM', localStateUnreadable: 'EPERM'});
  const picked = await bindCommand({home, key: 'personal', chrome, explicitId: 'inst-a', listBackends: listing([{instanceId: 'inst-a'}])});
  assert.deepEqual({ok: picked.ok, id: picked.extensionInstanceId, data: picked.chromeDataUnreadable}, {ok: true, id: 'inst-a', data: 'EPERM'});
  assert.equal(readRegistry(home).profiles.personal.extensionInstanceId, 'inst-a');
});

test('cua profiles add and list name an unreadable Chrome data directory, never a missing extension', {skip: process.getuid?.() === 0}, t => {
  const env = setup(t, {Default: {name: 'Personal', extension: true}});
  const extensions = join(env.userData, 'Default', 'Extensions');
  chmodSync(extensions, 0o000);
  try {
    const add = cua(['profiles', 'add', 'personal', '--chrome-profile', 'Default'], env);
    assert.equal(add.status, 0, add.stderr);
    assert.match(add.stdout, /cannot read Chrome's data directory \(EACCES\).*registered anyway \(next: cua profiles bind personal.*Full Disk Access/);
    const list = JSON.parse(cua(['profiles', 'list', '--json'], env).stdout);
    assert.deepEqual(list.profiles.map(p => [p.key, p.ready, p.reason, p.chromeDataError]), [['personal', false, 'chrome_data_unreadable', 'EACCES']]);
    const human = cua(['profiles', 'list'], env);
    assert.match(human.stdout, /^personal\s+not ready\s+Default\s+this process cannot read Chrome's data directory .*it is not bound yet/m);
    assert.doesNotMatch(human.stdout, /not installed/);
  } finally { chmodSync(extensions, 0o755); }
  const json = JSON.parse(cua(['profiles', 'add', 'again', '--chrome-profile', 'Default', '--json'], {...env, home: join(env.home, 'other')}).stdout);
  assert.deepEqual(json, {ok: true, key: 'again', chromeProfileDirectory: 'Default', extension: 'installed'});
});
