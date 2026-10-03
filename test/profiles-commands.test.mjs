// `cua profiles bind` as a whole, with an injected backend listing and picker, and the CLI routes for
// add/list/remove/bind against a scratch CUA_HOME and a scratch Chrome user-data directory (HOME points there).
// No runtime is launched: the live listing is profiles-inventory.test.mjs's, the real run is evidence.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {REPO, scratch} from './fixtures/runtime-fixture.mjs';
import {chromeFacts, OPENAI_EXTENSION_ID} from '../src/profiles/chrome.mjs';
import {addProfile, readRegistry} from '../src/profiles/registry.mjs';
import {bindCommand} from '../src/profiles/commands.mjs';

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

const listing = backends => async () => ({backends, elicitationsDeclined: 0, teardown: {confirmed: true, steps: ['eof']}});

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
  assert.deepEqual(JSON.parse(work.stdout), {ok: true, key: 'work', chromeProfileDirectory: 'Profile 8', extensionInstalled: false});
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

test('cua profiles usage errors exit 2', t => {
  const env = setup(t);
  for (const args of [['profiles'], ['profiles', 'add', 'x'], ['profiles', 'add', '--chrome-profile', 'Default'], ['profiles', 'bind'], ['profiles', 'list', 'extra'], ['profiles', 'nope']])
    assert.equal(cua(args, env).status, 2, args.join(' '));
});
