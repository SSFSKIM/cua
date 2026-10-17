// #79: what a home still has to do to be on the cua route alone (src/chrome/route.mjs chromeMigration), as doctor's
// chrome.route row, `cua chrome register` and every `cua profiles` command say it. The removed ChatGPT extension route's
// record and the manifests it lists live in scratch directories only; nothing here reads a real browser directory.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, mkdirSync, realpathSync, utimesSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {chromeMigration, cuaRecordFile, rebindRequired, vendorRecordFile} from '../src/chrome/route.mjs';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {writeCuaRecord} from './fixtures/route-records.mjs';

const EARLY = 1_760_000_000, LATE = 1_760_090_000;
const REGISTER = 'run `cua chrome register`';

// A scratch cua home and, beside it, a directory standing in for the browsers' NativeMessagingHosts directories.
function fixture(t) {
  const s = scratch();
  t.after(s.cleanup);
  const dir = realpathSync(s.dir);
  const home = join(dir, 'home');
  mkdirSync(join(home, 'chrome'), {recursive: true});
  const browsers = join(dir, 'browsers');
  mkdirSync(browsers);
  // The removed route's host as cua relocated it under the home, and a manifest per browser in the scratch directory.
  const ownHost = join(home, 'runtimes', 'r', 'chrome-plugin', 'extension-host', 'ChatGPT for Chrome');
  const manifestFor = browser => join(browsers, browser, 'com.openai.codexextension.json');
  const writeManifest = (browser, host) => {
    mkdirSync(join(browsers, browser), {recursive: true});
    writeFileSync(manifestFor(browser), JSON.stringify({name: 'com.openai.codexextension', path: host, type: 'stdio'}));
  };
  const writeVendor = (entries = {chrome: {manifest: manifestFor('chrome'), replaced: false}}, at = EARLY) => {
    writeFileSync(vendorRecordFile(home), JSON.stringify({schema: 1, browsers: entries}));
    utimesSync(vendorRecordFile(home), at, at);
  };
  const backupFor = browser => join(home, 'chrome', 'manifest-backup', `${browser}.json`);
  const profiles = entries => writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: entries}));
  return {home, ownHost, manifestFor, writeManifest, writeVendor, backupFor, profiles};
}
const cleanupStep = f => `then remove the old record and its backups: rm -rf "${vendorRecordFile(f.home)}" "${join(f.home, 'chrome', 'manifest-backup')}"`;

test('a home with cua\'s registration alone and no binding left on the ChatGPT extension has nothing to do', t => {
  const f = fixture(t);
  writeCuaRecord(f.home);
  assert.equal(chromeMigration(f.home), null);
  // A record of the removed route that names no browser (what `unregister --vendor` left) counts as absent.
  f.writeVendor({});
  assert.equal(chromeMigration(f.home), null);
  f.profiles({personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-personal', boundAt: 'x', route: 'cua'}, school: {chromeProfileDirectory: 'Profile 2'}});
  assert.equal(chromeMigration(f.home), null);
});

test('cua\'s registration alone with profiles bound on the ChatGPT extension: rebind_required, registered, naming each bind', t => {
  const f = fixture(t);
  writeCuaRecord(f.home);
  f.profiles({
    work: {chromeProfileDirectory: 'Profile 1', extensionInstanceId: 'inst-work', boundAt: 'x'},
    personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-personal', boundAt: 'x', route: 'cua'},
  });
  assert.deepEqual(chromeMigration(f.home), {code: 'rebind_required', registered: true,
    message: 'cua\'s own extension and host are registered: work was bound on the ChatGPT extension: bind it again on the cua extension: cua profiles bind work'});
  f.profiles({
    work: {chromeProfileDirectory: 'Profile 1', extensionInstanceId: 'inst-work', boundAt: 'x'},
    school: {chromeProfileDirectory: 'Profile 2', extensionInstanceId: 'inst-school', boundAt: 'x'},
  });
  assert.equal(chromeMigration(f.home).message, 'cua\'s own extension and host are registered: work, school were bound on the ChatGPT extension: bind them again on the cua extension: cua profiles bind work; cua profiles bind school');
});

test('no registration: chrome_not_registered, naming `cua chrome register` and the cua extension', t => {
  const f = fixture(t);
  const migration = chromeMigration(f.home);
  assert.deepEqual([migration.code, migration.registered], ['chrome_not_registered', false]);
  assert.ok(migration.message.startsWith('this home has no Chrome registration: '), migration.message);
  assert.ok(migration.message.includes(REGISTER), migration.message);
  assert.match(migration.message, /install or load the cua extension in each Chrome profile/);
  assert.doesNotMatch(migration.message, /ChatGPT|rm /);
});

test('only the ChatGPT route\'s record: chatgpt_route_removed, not registered, register first and the cleanup last', t => {
  const f = fixture(t);
  f.writeVendor();
  const migration = chromeMigration(f.home);
  assert.deepEqual([migration.code, migration.registered], ['chatgpt_route_removed', false]);
  assert.ok(migration.message.includes(`ChatGPT extension route (cua chrome register --vendor, ${new Date(EARLY * 1000).toISOString()})`), migration.message);
  assert.match(migration.message, /no longer supports \(removed in #79\)/);
  assert.ok(migration.message.indexOf(REGISTER) < migration.message.indexOf('install or load the cua extension'), migration.message);
  assert.ok(migration.message.endsWith(cleanupStep(f)), migration.message);
});

test('the ChatGPT route\'s record newer than cua\'s: chatgpt_route_removed, registered, run `cua chrome register` again', t => {
  const f = fixture(t);
  writeCuaRecord(f.home, {at: EARLY});
  f.writeVendor(undefined, LATE);
  const migration = chromeMigration(f.home);
  assert.deepEqual([migration.code, migration.registered], ['chatgpt_route_removed', true]);
  assert.ok(migration.message.includes(`after cua's own registration of ${new Date(EARLY * 1000).toISOString()}`), migration.message);
  assert.ok(migration.message.includes('run `cua chrome register` again so cua\'s registration is the current one'), migration.message);
  assert.doesNotMatch(migration.message, /install or load the cua extension/);
  assert.ok(migration.message.endsWith(cleanupStep(f)), migration.message);
});

test('cua\'s record newer than the ChatGPT route\'s: chatgpt_route_leftover, registered, only the cleanup', t => {
  const f = fixture(t);
  f.writeVendor(undefined, EARLY);
  writeCuaRecord(f.home, {at: LATE});
  const migration = chromeMigration(f.home);
  assert.deepEqual([migration.code, migration.registered], ['chatgpt_route_leftover', true]);
  assert.match(migration.message, /is left from before #79 removed that route, and cua no longer reads it: /);
  assert.ok(!migration.message.includes(REGISTER), migration.message);
  assert.ok(migration.message.endsWith(cleanupStep(f)), migration.message);
});

test('a profile bound on the ChatGPT extension is named for `cua profiles bind`; one bound on the cua extension is not', t => {
  const f = fixture(t);
  f.profiles({
    work: {chromeProfileDirectory: 'Profile 1', extensionInstanceId: 'inst-work', boundAt: 'x'},
    personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-personal', boundAt: 'x', route: 'cua'},
    school: {chromeProfileDirectory: 'Profile 2'},
  });
  assert.deepEqual(rebindRequired(f.home), ['work']);
  for (const setup of [() => {}, () => f.writeVendor(), () => writeCuaRecord(f.home, {at: LATE}), () => f.writeVendor({})]) {
    setup();
    const {code, message} = chromeMigration(f.home);
    assert.ok(message.includes('work was bound on the ChatGPT extension: bind it again on the cua extension: cua profiles bind work'), `${code}: ${message}`);
    assert.doesNotMatch(message, /cua profiles bind (personal|school)/, code);
  }
  f.profiles({personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-personal', boundAt: 'x', route: 'cua'}});
  assert.equal(chromeMigration(f.home), null, 'registered, nothing left of the removed route, nothing to bind again');
});

test('cleanup: a listed manifest naming a host under the home is removed, or its backup put back when it replaced one', t => {
  const f = fixture(t);
  for (const browser of ['chrome', 'brave', 'edge']) f.writeManifest(browser, f.ownHost);
  mkdirSync(join(f.home, 'chrome', 'manifest-backup'));
  writeFileSync(f.backupFor('brave'), '{}');
  f.writeVendor({
    chrome: {manifest: f.manifestFor('chrome'), replaced: false},
    brave: {manifest: f.manifestFor('brave'), replaced: true, backupSha256: 'x'},
    edge: {manifest: f.manifestFor('edge'), replaced: true, backupSha256: 'x'},   // its backup is gone
  });
  const {message} = chromeMigration(f.home);
  const rm = `in chrome, remove the manifest cua placed: rm "${f.manifestFor('chrome')}"`;
  const cp = `in brave, put back the manifest cua replaced: cp "${f.backupFor('brave')}" "${f.manifestFor('brave')}"`;
  const gone = `in edge, remove the manifest cua wrote over the ChatGPT desktop app's (its backup is gone; reopening the desktop app rewrites its own): rm "${f.manifestFor('edge')}"`;
  for (const step of [rm, cp, gone]) assert.ok(message.includes(step), `${step}\n${message}`);
  assert.ok(message.indexOf(rm) < message.indexOf(cp) && message.indexOf(cp) < message.indexOf(gone), message);
  assert.ok(message.endsWith(`${gone}; ${cleanupStep(f)}`), message);
});

test('cleanup: a manifest that is gone, names another host, or does not parse gives no step; the record removal is always last', t => {
  const f = fixture(t);
  f.writeManifest('brave', '/Applications/ChatGPT.app/Contents/Resources/ChatGPT for Chrome');   // the desktop app's own again
  f.writeManifest('edge', f.ownHost);
  writeFileSync(f.manifestFor('edge'), 'not json');
  f.writeVendor({
    chrome: {manifest: f.manifestFor('chrome'), replaced: false},          // gone
    brave: {manifest: f.manifestFor('brave'), replaced: true},
    edge: {manifest: f.manifestFor('edge'), replaced: false},
    opera: {replaced: false},                                             // names no manifest
  });
  const {message} = chromeMigration(f.home);
  assert.doesNotMatch(message, /rm "|cp "|check /);
  assert.ok(message.endsWith(`install or load the cua extension in each Chrome profile you use (README, "Chrome"); ${cleanupStep(f)}`), message);
});

test('cleanup: a listed manifest this process may not read is named for the user to check', {skip: process.getuid?.() === 0 && 'root reads anything'}, t => {
  const f = fixture(t);
  f.writeManifest('chrome', f.ownHost);
  f.writeVendor();
  chmodSync(f.manifestFor('chrome'), 0o000);
  let message;
  try { ({message} = chromeMigration(f.home)); } finally { chmodSync(f.manifestFor('chrome'), 0o644); }
  assert.ok(message.includes(`check ${f.manifestFor('chrome')}, which this process may not read (EACCES): if it names a host under ${f.home}, remove it`), message);
  assert.ok(message.endsWith(cleanupStep(f)), message);
});

test('the cua record\'s write time decides between removed and leftover', t => {
  const f = fixture(t);
  f.writeVendor(undefined, EARLY + 10);
  writeCuaRecord(f.home, {at: EARLY});
  assert.equal(chromeMigration(f.home).code, 'chatgpt_route_removed');
  utimesSync(cuaRecordFile(f.home), EARLY + 20, EARLY + 20);
  assert.equal(chromeMigration(f.home).code, 'chatgpt_route_leftover');
});
