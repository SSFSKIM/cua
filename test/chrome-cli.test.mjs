// #79 CLI: the ChatGPT extension route is gone. `cua chrome register|unregister` take no --vendor and `cua login` is no
// command; a home the removed route left behind hears what to do from `cua chrome register` and every `cua profiles`
// command (src/chrome/route.mjs chromeMigration; test/chrome-cua-cli.test.mjs covers the registration itself). Every
// run gets a scratch CUA_HOME and a scratch HOME, so no real browser directory and no real cua home is read or written.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync, existsSync, mkdirSync, realpathSync, utimesSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {browsersFor} from '../src/chrome/registration.mjs';
import {CUA_HOST_NAME} from '../src/chrome/extension.mjs';
import {chromeMigration, cuaRecordFile, vendorRecordFile} from '../src/chrome/route.mjs';
import {PERMISSION_FIX} from '../src/profiles/chrome.mjs';
import {REPO, shortScratch} from './fixtures/runtime-fixture.mjs';

const CLI = join(REPO, 'bin', 'cua.mjs');

function machine(t) {
  // Under /tmp: a home's socket path must fit 103 bytes, which a macOS per-user temp directory nearly exhausts.
  const s = shortScratch();
  t.after(s.cleanup);
  const dir = realpathSync(s.dir);
  const home = join(dir, 'cua');
  mkdirSync(join(home, 'chrome'), {recursive: true});
  const user = join(dir, 'user');
  // This host's Chrome directory: the CLI resolves it itself (HOME=user, no XDG overrides).
  const chromeData = browsersFor({env: {}, userHome: user}).find(b => b.browser === 'chrome').dataDir;
  const nmh = join(chromeData, 'NativeMessagingHosts');
  mkdirSync(nmh, {recursive: true});
  mkdirSync(join(chromeData, 'Default'));
  const env = {...process.env, CUA_HOME: home, HOME: user};
  delete env.XDG_CONFIG_HOME;
  delete env.CHROME_CONFIG_HOME;
  const cua = args => spawnSync(process.execPath, [CLI, ...args], {env, encoding: 'utf8', timeout: 60_000});
  // What the removed route's registration left: its record, listing a manifest that is no longer there.
  const leaveVendorRecord = at => {
    writeFileSync(vendorRecordFile(home), JSON.stringify({schema: 1, browsers: {chrome: {manifest: join(nmh, 'com.openai.codexextension.json'), replaced: false}}}));
    utimesSync(vendorRecordFile(home), at, at);
  };
  return {home, chromeData, nmh, cua, leaveVendorRecord};
}

test('chrome takes register or unregister, register takes only --replace and --json, unregister only --json; --vendor is a usage error', t => {
  const m = machine(t);
  for (const args of [['chrome'], ['chrome', 'frob'], ['chrome', 'register', '--force'], ['chrome', 'unregister', '--replace'], ['chrome', 'register', 'extra'],
    ['chrome', 'register', '--vendor', '--replace'], ['chrome', 'unregister', '--vendor', '--json']]) {
    const r = m.cua(args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
  }
  const register = m.cua(['chrome', 'register', '--vendor']);
  assert.equal(register.status, 2, register.stderr);
  assert.match(register.stderr, /^cua: chrome register takes only --replace and --json$/m);
  const unregister = m.cua(['chrome', 'unregister', '--vendor']);
  assert.equal(unregister.status, 2, unregister.stderr);
  assert.match(unregister.stderr, /^cua: chrome unregister takes only --json$/m);
  assert.equal(existsSync(join(m.nmh, `${CUA_HOST_NAME}.json`)), false, 'a refused command registers nothing');
  assert.equal(existsSync(cuaRecordFile(m.home)), false);
});

test('login is an unknown command, and the usage no longer offers it or --vendor', t => {
  const m = machine(t);
  for (const args of [['login'], ['login', '--status'], ['login', '--device-auth']]) {
    const r = m.cua(args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
    assert.match(r.stderr, /^cua: unknown command "login"$/m);
  }
  assert.doesNotMatch(m.cua(['help']).stdout, /^\s+login\b|--vendor/m);
});

test('every profiles command on a home with only the ChatGPT route\'s record writes the migration note to stderr', t => {
  const m = machine(t);
  m.leaveVendorRecord(1_760_000_000);
  const {code, message} = chromeMigration(m.home);
  assert.equal(code, 'chatgpt_route_removed');
  for (const args of [['profiles', 'list'], ['profiles', 'list', '--json'], ['profiles', 'add', 'personal', '--chrome-profile', 'Default'], ['profiles', 'remove', 'personal']]) {
    const r = m.cua(args);
    assert.equal(r.status, 0, `${args.join(' ')}: ${r.stderr}`);
    assert.ok(r.stderr.includes(`note: ${message}\n`), `${args.join(' ')}: ${r.stderr}`);
  }
  assert.deepEqual(JSON.parse(m.cua(['profiles', 'list', '--json']).stdout), {ok: true, profiles: []}, 'the note never reaches stdout');
});

test('a profiles command on a home registered for the cua extension alone writes no note', t => {
  const m = machine(t);
  assert.equal(m.cua(['chrome', 'register']).status, 0);
  const r = m.cua(['profiles', 'list']);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /note:/);
});

test('chrome register on a home the ChatGPT route left: --json carries leftover and rebindRequired; the text prints the note', t => {
  const m = machine(t);
  writeFileSync(join(m.home, 'profiles.json'), JSON.stringify({version: 1, profiles: {
    work: {chromeProfileDirectory: 'Profile 1', extensionInstanceId: 'vendor-inst', boundAt: '2026-10-01T00:00:00.000Z'},
    personal: {chromeProfileDirectory: 'Default'},
  }}));
  m.leaveVendorRecord(Math.floor(Date.now() / 1000) - 3600);
  const r = m.cua(['chrome', 'register', '--json']);
  assert.equal(r.status, 0, r.stderr);
  const json = JSON.parse(r.stdout);
  assert.deepEqual([json.ok, json.route, json.rebindRequired], [true, 'cua', ['work']]);
  const migration = chromeMigration(m.home);
  assert.equal(migration.code, 'chatgpt_route_leftover', 'the registration just made is the newer');
  assert.equal(json.leftover, migration.message);
  assert.match(json.leftover, /cua profiles bind work/);
  assert.ok(json.leftover.endsWith(`rm -rf "${vendorRecordFile(m.home)}" "${join(m.home, 'chrome', 'manifest-backup')}"`), json.leftover);
  const text = m.cua(['chrome', 'register']);
  assert.equal(text.status, 0, text.stderr);
  assert.ok(text.stdout.includes(`note: ${migration.message}\n`), text.stdout);
  // With the record gone only the rebind is left; once bound again, nothing, and --json has no leftover.
  writeFileSync(vendorRecordFile(m.home), JSON.stringify({schema: 1, browsers: {}}));
  const rebind = JSON.parse(m.cua(['chrome', 'register', '--json']).stdout);
  assert.deepEqual(rebind.rebindRequired, ['work']);
  assert.equal(rebind.leftover, 'cua\'s own extension and host are registered: work was bound on the ChatGPT extension: bind it again on the cua extension: cua profiles bind work');
  writeFileSync(join(m.home, 'profiles.json'), JSON.stringify({version: 1, profiles: {work: {chromeProfileDirectory: 'Profile 1', extensionInstanceId: 'cua-inst', boundAt: 'x', route: 'cua'}}}));
  const clean = JSON.parse(m.cua(['chrome', 'register', '--json']).stdout);
  assert.equal('leftover' in clean, false);
  assert.deepEqual(clean.rebindRequired, []);
});

test('chrome register and unregister name an unreadable Chrome directory and the access fix, and write nothing', {skip: process.getuid?.() === 0}, t => {
  const m = machine(t);
  chmodSync(m.chromeData, 0o000);
  let runs;
  try { runs = ['register', 'unregister'].map(command => [command, m.cua(['chrome', command]), JSON.parse(m.cua(['chrome', command, '--json']).stdout)]); } finally { chmodSync(m.chromeData, 0o755); }
  for (const [command, r, json] of runs) {
    assert.equal(r.status, 1, `${command}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /cannot read the native-messaging directory of Google Chrome .*EACCES.*Nothing was changed\. \[chrome_data_unreadable\]/, command);
    assert.ok(r.stderr.includes(`${PERMISSION_FIX}; then run \`cua chrome ${command}\` again`), `${command}: ${r.stderr}`);
    assert.deepEqual([json.ok, json.error.code], [false, 'chrome_data_unreadable'], command);
  }
  assert.equal(existsSync(cuaRecordFile(m.home)), false);
});
