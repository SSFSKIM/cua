// cua's own mapping of extension instances to Chrome profile directories (src/profiles/directory-map.mjs), against
// scratch Chrome user-data directories whose extension stores are real LevelDB stores written here with the runtime's
// classic-level. The "live" stores stay open while the mapping runs, as Chrome keeps them: the mapping must work on
// copies, leave Chrome's directory exactly as it was, and remove its copies whatever happens.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, utimesSync, writeFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {CLASSIC_LEVEL_MODULES, NO_CLASSIC_LEVEL, writeStore} from './fixtures/classic-level.mjs';
import {chromeFacts, OPENAI_EXTENSION_ID} from '../src/profiles/chrome.mjs';
import {mapExtensionDirectories, STAGING_PREFIX} from '../src/profiles/directory-map.mjs';

const OTHER_EXTENSION_ID = 'odlomjlbamekndcpllcnffbgeohgkmjh';
const EXTENSION_IDS = [OPENAI_EXTENSION_ID, OTHER_EXTENSION_ID];
const asRoot = process.getuid?.() === 0;
const skip = NO_CLASSIC_LEVEL;

// profiles: {<directory>: {name, store?: instanceId | null (a store without the key), other?: instanceId}}
async function setup(t, profiles) {
  const s = scratch();
  t.after(s.cleanup);
  const userData = join(s.dir, 'Chrome');
  const home = join(s.dir, 'cua');
  mkdirSync(home);
  const infoCache = {};
  const open = [];
  for (const [dir, {name, store, other}] of Object.entries(profiles)) {
    mkdirSync(join(userData, dir), {recursive: true});
    infoCache[dir] = {name};
    for (const [id, extension] of [[store, OPENAI_EXTENSION_ID], [other, OTHER_EXTENSION_ID]]) {
      if (id === undefined) continue;
      const path = join(userData, dir, 'Local Extension Settings', extension);
      mkdirSync(join(path, '..'), {recursive: true});
      open.push(await writeStore(path, id ?? undefined, {keepOpen: true, extra: {someSetting: {a: 1}}}));
    }
  }
  t.after(() => Promise.all(open.map(db => db.close())));
  writeFileSync(join(userData, 'Local State'), JSON.stringify({profile: {info_cache: infoCache, profiles_order: Object.keys(infoCache)}}));
  const map = (options = {}) => mapExtensionDirectories({home, chrome: chromeFacts({userData}), moduleDir: CLASSIC_LEVEL_MODULES, extensionIds: EXTENSION_IDS, ...options});
  return {home, userData, map, staging: join(home, 'staging')};
}

// Every file under a directory with its size and content, to show the mapping changed nothing there.
function snapshot(root) {
  const out = {};
  const walk = dir => {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else out[relative(root, path)] = readFileSync(path).toString('base64');
    }
  };
  walk(root);
  return out;
}

const leftovers = staging => { try { return readdirSync(staging); } catch { return []; } };

test('each profile\'s store is read from a copy: directories by instance id, colliding names and all, Chrome untouched', {skip}, async t => {
  const {map, userData, staging} = await setup(t, {
    Default: {name: 'Same', store: 'inst-default'},
    'Profile 12': {name: 'Same', store: 'inst-twelve', other: 'inst-twelve-beta'},
    'Profile 3': {name: 'Other'},
    'Profile 4': {name: 'Keyless', store: null},
  });
  const before = snapshot(userData);
  const result = await map();
  assert.deepEqual(result.status, 'complete');
  assert.deepEqual(Object.fromEntries(result.stores), {Default: ['inst-default'], 'Profile 12': ['inst-twelve', 'inst-twelve-beta'], 'Profile 4': []});
  assert.deepEqual(Object.fromEntries(result.names), {Default: 'Same', 'Profile 12': 'Same', 'Profile 3': 'Other', 'Profile 4': 'Keyless'});
  assert.deepEqual(snapshot(userData), before, 'nothing in Chrome\'s directory changed, the live LOCK included');
  assert.deepEqual(leftovers(staging), [], 'the copies are gone');
});

// Review fix (PR #45): a store directory that is itself a symlink was copied as a link, so the LOCK removal and the
// open acted on the live store through it. The copy follows the link; the live store stays exactly as it was.
test('a store that is a symlink is copied through the link: the live store it points at is never touched', {skip}, async t => {
  const {map, userData, staging} = await setup(t, {Default: {name: 'A'}});
  const outside = join(userData, '..', 'elsewhere', 'store');
  mkdirSync(join(outside, '..'), {recursive: true});
  const db = await writeStore(outside, 'inst-linked', {keepOpen: true});
  t.after(() => db.close());
  const link = join(userData, 'Default', 'Local Extension Settings', OPENAI_EXTENSION_ID);
  mkdirSync(join(link, '..'), {recursive: true});
  symlinkSync(outside, link);
  assert.ok(lstatSync(link).isSymbolicLink());
  const before = snapshot(outside);
  const result = await map();
  assert.deepEqual({status: result.status, stores: Object.fromEntries(result.stores)}, {status: 'complete', stores: {Default: ['inst-linked']}});
  assert.deepEqual(snapshot(outside), before, 'the live store, LOCK included, is unchanged');
  assert.ok(lstatSync(link).isSymbolicLink());
  assert.deepEqual(leftovers(staging), []);
});

test('a store this process may not read leaves the mapping partial with the code; the readable stores still count', {skip: skip || asRoot}, async t => {
  const {map, userData, staging} = await setup(t, {Default: {name: 'A', store: 'inst-a'}, 'Profile 1': {name: 'B', store: 'inst-b'}});
  const denied = join(userData, 'Profile 1', 'Local Extension Settings', OPENAI_EXTENSION_ID);
  chmodSync(denied, 0o000);
  let result;
  try { result = await map(); } finally { chmodSync(denied, 0o755); }
  assert.deepEqual({status: result.status, unreadableStores: result.unreadableStores, readError: result.readError, stores: Object.fromEntries(result.stores)},
    {status: 'partial', unreadableStores: 1, readError: 'EACCES', stores: {Default: ['inst-a']}});
  assert.deepEqual(leftovers(staging), []);
});

test('a Local State this process may not read makes the mapping unavailable with the code, never a failure', {skip: skip || asRoot}, async t => {
  const {map, userData} = await setup(t, {Default: {name: 'A', store: 'inst-a'}});
  chmodSync(join(userData, 'Local State'), 0o000);
  let result;
  try { result = await map(); } finally { chmodSync(join(userData, 'Local State'), 0o644); }
  assert.deepEqual(result, {status: 'unavailable', reason: 'chrome_data_unreadable', readError: 'EACCES'});
});

test('a malformed Local State, or no loadable classic-level when a store exists, is unavailable', {skip}, async t => {
  const {map, userData} = await setup(t, {Default: {name: 'A', store: 'inst-a'}});
  assert.deepEqual(await map({moduleDir: join(userData, 'nowhere')}), {status: 'unavailable', reason: 'classic_level_unavailable'});
  writeFileSync(join(userData, 'Local State'), '{"profile":{}}');
  assert.deepEqual(await map(), {status: 'unavailable', reason: 'local_state_unreadable'});
  const empty = await setup(t, {Default: {name: 'A'}});
  const none = await empty.map({moduleDir: join(empty.userData, 'nowhere')});
  assert.deepEqual({status: none.status, stores: none.stores.size}, {status: 'complete', stores: 0}, 'without any store, classic-level is never needed');
});

test('a store that is not a LevelDB, or a reader that fails, counts as unreadable and its copy is still removed', {skip}, async t => {
  const {map, userData, staging} = await setup(t, {Default: {name: 'A', store: 'inst-a'}, 'Profile 1': {name: 'B'}});
  const bogus = join(userData, 'Profile 1', 'Local Extension Settings', OPENAI_EXTENSION_ID);
  mkdirSync(bogus, {recursive: true});
  writeFileSync(join(bogus, 'not-leveldb'), 'x');
  const result = await map();
  assert.deepEqual({status: result.status, readError: result.readError, stores: Object.fromEntries(result.stores)}, {status: 'partial', readError: 'store_unreadable', stores: {Default: ['inst-a']}});
  assert.deepEqual(leftovers(staging), []);
  class Failing { constructor() {} async open() { throw Object.assign(new Error('boom'), {code: 'LEVEL_IO_ERROR'}); } async close() {} }
  const failed = await map({classicLevel: () => Failing});
  assert.deepEqual({status: failed.status, unreadableStores: failed.unreadableStores}, {status: 'partial', unreadableStores: 2});
  assert.deepEqual(leftovers(staging), [], 'every copy removed after the reader failed');
});

test('copies a killed run left behind are swept once stale; a current run\'s are not', {skip}, async t => {
  const {map, staging} = await setup(t, {Default: {name: 'A', store: 'inst-a'}});
  mkdirSync(join(staging, `${STAGING_PREFIX}old`, '0'), {recursive: true});
  mkdirSync(join(staging, `${STAGING_PREFIX}fresh`), {recursive: true});
  mkdirSync(join(staging, 'release-unrelated'), {recursive: true});
  const old = new Date(Date.now() - 3_600_000);
  utimesSync(join(staging, `${STAGING_PREFIX}old`), old, old);
  utimesSync(join(staging, 'release-unrelated'), old, old);
  await map();
  assert.deepEqual(leftovers(staging).sort(), [`${STAGING_PREFIX}fresh`, 'release-unrelated']);
  assert.equal(statSync(staging).mode & 0o777, 0o700);
});
