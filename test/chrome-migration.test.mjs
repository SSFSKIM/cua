// #79: what a home still has to do to be on the cua route alone (src/chrome/route.mjs chromeMigration), as doctor's
// chrome.route row, `cua chrome register` and every `cua profiles` command say it. The removed ChatGPT extension route's
// record and the manifests it lists live in scratch directories only; nothing here reads a real browser directory.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chmodSync, mkdirSync, readdirSync, realpathSync, utimesSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {PERMISSION_FIX} from '../src/profiles/chrome.mjs';
import {chromeMigration, cuaRecordFile, rebindRequired, vendorRecordFile} from '../src/chrome/route.mjs';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {writeCuaRecord} from './fixtures/route-records.mjs';

const EARLY = 1_760_000_000, LATE = 1_760_090_000;
const REGISTER = 'run `cua chrome register`';

// A scratch cua home and, beside it, a directory standing in for the browsers' NativeMessagingHosts directories.
// `names` overrides the two directory names, to put shell metacharacters in the paths.
function fixture(t, names = {}) {
  const s = scratch();
  t.after(s.cleanup);
  const dir = realpathSync(s.dir);
  const home = join(dir, names.home ?? 'home');
  mkdirSync(join(home, 'chrome'), {recursive: true});
  const browsers = join(dir, names.browsers ?? 'browsers');
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
  // The desktop app's manifest as cua backed it up; -> its sha256, what the record holds for it.
  const writeBackup = (browser, text = '{"name":"com.openai.codexextension","path":"/Applications/ChatGPT.app/host"}') => {
    mkdirSync(join(home, 'chrome', 'manifest-backup'), {recursive: true});
    writeFileSync(backupFor(browser), text);
    return createHash('sha256').update(text).digest('hex');
  };
  const profiles = entries => writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: entries}));
  return {dir, home, ownHost, manifestFor, writeManifest, writeVendor, backupFor, writeBackup, profiles};
}
const cleanupStep = f => `then remove the old record and its backups: rm -rf '${vendorRecordFile(f.home)}' '${join(f.home, 'chrome', 'manifest-backup')}'`;
const KEPT = 'are kept for manual recovery: run `cua doctor` again once the manifests above are dealt with, and it names their removal';

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

test('cleanup: a manifest cua placed is removed, one it replaced is put back from a backup whose hash is the record\'s', t => {
  const f = fixture(t);
  for (const browser of ['chrome', 'brave']) f.writeManifest(browser, f.ownHost);
  const sha = f.writeBackup('brave');
  f.writeVendor({
    chrome: {manifest: f.manifestFor('chrome'), replaced: false},
    brave: {manifest: f.manifestFor('brave'), replaced: true, backupSha256: sha},
  });
  const {message} = chromeMigration(f.home);
  const rm = `in chrome, remove the manifest cua placed: rm '${f.manifestFor('chrome')}'`;
  const cp = `in brave, put back the manifest cua replaced: cp '${f.backupFor('brave')}' '${f.manifestFor('brave')}' (or quit and reopen the ChatGPT desktop app, which rewrites its own)`;
  assert.ok(message.includes(rm), `${rm}\n${message}`);
  assert.ok(message.endsWith(`${rm}; ${cp}; ${cleanupStep(f)}`), message);
});

test('cleanup: a backup that is missing, does not match or has no recorded hash is not put back, and nothing is deleted', t => {
  const f = fixture(t);
  for (const browser of ['chrome', 'brave', 'edge', 'arc']) f.writeManifest(browser, f.ownHost);
  const sha = f.writeBackup('brave');
  f.writeBackup('chrome', 'tampered');
  f.writeBackup('arc');
  f.writeVendor({
    chrome: {manifest: f.manifestFor('chrome'), replaced: true, backupSha256: sha},   // its backup does not match
    brave: {manifest: f.manifestFor('brave'), replaced: true, backupSha256: sha},     // verified
    edge: {manifest: f.manifestFor('edge'), replaced: true, backupSha256: sha},       // its backup is gone
    arc: {manifest: f.manifestFor('arc'), replaced: true},                            // no hash to verify it by
  });
  const {message} = chromeMigration(f.home);
  const unverified = (browser, doubt) => `in ${browser}, cua wrote over the ChatGPT desktop app's manifest and its backup ${f.backupFor(browser)} ${doubt}, so it cannot be verified: remove cua's manifest: rm '${f.manifestFor(browser)}', then quit and reopen the ChatGPT desktop app, which rewrites its own`;
  const inspect = ' (or inspect the backup and put it back yourself if it is the desktop app\'s)';
  for (const step of [
    `${unverified('chrome', 'does not match the hash in the record')}${inspect}`,
    `in brave, put back the manifest cua replaced: cp '${f.backupFor('brave')}' '${f.manifestFor('brave')}'`,
    `${unverified('edge', 'is missing')}; `,
    `${unverified('arc', 'has no hash in the record')}${inspect}`,
  ]) assert.ok(message.includes(step), `${step}\n${message}`);
  assert.doesNotMatch(message, /cp '[^']*chrome\.json'|cp '[^']*edge\.json'|cp '[^']*arc\.json'|rm -rf/);
  assert.ok(message.endsWith(`the old record ${vendorRecordFile(f.home)} and its backups in ${join(f.home, 'chrome', 'manifest-backup')} ${KEPT}`), message);
  // Once the unverified manifests are dealt with (removed, or the desktop app's own again), the next run names the removal.
  for (const browser of ['chrome', 'edge']) writeFileSync(f.manifestFor(browser), JSON.stringify({path: '/Applications/ChatGPT.app/host'}));
  writeFileSync(f.manifestFor('arc'), JSON.stringify({path: '/Applications/ChatGPT.app/host'}));
  assert.ok(chromeMigration(f.home).message.endsWith(cleanupStep(f)), chromeMigration(f.home).message);
});

test('cleanup: every path in a command is one literal shell word, so pasting it expands nothing', t => {
  const hostile = 'a $(touch pwned) `touch pwned2` $HOME " \' b';
  const f = fixture(t, {home: `home ${hostile}`, browsers: `browsers ${hostile}`});
  for (const browser of ['chrome', 'brave']) f.writeManifest(browser, f.ownHost);
  const sha = f.writeBackup('brave');
  f.writeVendor({
    chrome: {manifest: f.manifestFor('chrome'), replaced: false},
    brave: {manifest: f.manifestFor('brave'), replaced: true, backupSha256: sha},
  });
  const {message} = chromeMigration(f.home);
  // Each printed command is its name and one or more single-quoted words ('\'' inside one is a quote).
  const commands = [...message.matchAll(/\b(?:rm -rf|rm|cp)(?: '[^']*'(?:\\''[^']*')*)+/g)].map(m => m[0]);
  assert.equal(commands.length, 3, message);
  // Run them with rm and cp standing in as functions that print their arguments, one per line, in an empty directory.
  const cwd = join(f.dir, 'run');
  mkdirSync(cwd);
  const r = spawnSync('sh', ['-c', `rm() { printf '%s\\n' rm "$@"; }; cp() { printf '%s\\n' cp "$@"; }; ${commands.join('; ')}`], {cwd, encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  const record = vendorRecordFile(f.home), backups = join(f.home, 'chrome', 'manifest-backup');
  assert.deepEqual(r.stdout.split('\n').slice(0, -1),
    ['rm', f.manifestFor('chrome'), 'cp', f.backupFor('brave'), f.manifestFor('brave'), 'rm', '-rf', record, backups]);
  assert.deepEqual(readdirSync(cwd), [], 'nothing in a path ran');
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
  assert.doesNotMatch(message, /rm '|cp '|cannot read/);
  assert.ok(message.endsWith(`install or load the cua extension in each Chrome profile you use (README, "Chrome"); ${cleanupStep(f)}`), message);
});

test('cleanup: a listed manifest this process may not read is named with the access to give, and nothing is deleted', {skip: process.getuid?.() === 0 && 'root reads anything'}, t => {
  const f = fixture(t);
  for (const browser of ['chrome', 'brave']) f.writeManifest(browser, f.ownHost);
  f.writeVendor({
    chrome: {manifest: f.manifestFor('chrome'), replaced: false},
    brave: {manifest: f.manifestFor('brave'), replaced: false},
  });
  chmodSync(f.manifestFor('chrome'), 0o000);
  let message;
  try { ({message} = chromeMigration(f.home)); } finally { chmodSync(f.manifestFor('chrome'), 0o644); }
  const step = `this process cannot read chrome's manifest ${f.manifestFor('chrome')} (EACCES), so whether it names a host under ${f.home} is unknown: ${PERMISSION_FIX}, then run \`cua doctor\` again`;
  assert.ok(message.includes(step), `${step}\n${message}`);
  assert.ok(message.includes(`in brave, remove the manifest cua placed: rm '${f.manifestFor('brave')}'`), message);
  assert.doesNotMatch(message, /rm -rf/);
  assert.ok(message.endsWith(KEPT), message);
  // Readable again, it gets its rm, and the record's removal comes back last.
  assert.ok(chromeMigration(f.home).message.endsWith(`rm '${f.manifestFor('chrome')}'; in brave, remove the manifest cua placed: rm '${f.manifestFor('brave')}'; ${cleanupStep(f)}`));
});

test('the cua record\'s write time decides between removed and leftover', t => {
  const f = fixture(t);
  f.writeVendor(undefined, EARLY + 10);
  writeCuaRecord(f.home, {at: EARLY});
  assert.equal(chromeMigration(f.home).code, 'chatgpt_route_removed');
  utimesSync(cuaRecordFile(f.home), EARLY + 20, EARLY + 20);
  assert.equal(chromeMigration(f.home).code, 'chatgpt_route_leftover');
});
