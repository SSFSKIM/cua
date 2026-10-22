import './helpers/scratch-home.mjs'; // first: doctor's engine row must not read (or launch) the account's approved engine
// H2: doctor's Chrome rows (acceptance 1's rows, against fixtures): chrome.route saying whether the home is registered
// for the cua extension and what the removed ChatGPT extension route left (#79), chrome.extension.<key> by the cua
// presence rule, chrome.host.registered for io.github.ssfskim.cua and this home's launcher and its targets,
// chrome.hosts.live counting the sockets in $CUA_HOME/chrome/b that accept a connection (the one row that connects).
// Scratch homes and Chrome directories only; the sockets are this test's own.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, realpathSync, rmSync, utimesSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {chromeFacts, CUA_EXTENSION_ID} from '../src/profiles/chrome.mjs';
import {chromeChecks, routeCheck} from '../src/profiles/checks.mjs';
import {inspectRuntime} from '../src/runtime/doctor.mjs';
import {browsersFor, registerCuaHost} from '../src/chrome/registration.mjs';
import {backendDir, CUA_HOST_NAME, launcherPath} from '../src/chrome/extension.mjs';
import {cuaRecordFile} from '../src/chrome/route.mjs';
import {shortScratch, scratch} from './fixtures/runtime-fixture.mjs';
import {writeVendorRecord} from './fixtures/route-records.mjs';

const DARWIN = {platform: 'darwin', arch: 'arm64'};
const byName = checks => Object.fromEntries(checks.map(c => [c.name, c]));

// A cua home registered on the cua route (a real registerCuaHost against a scratch Chrome), with profiles `personal`
// (cua extension loaded unpacked in Default) and `work` (nothing in Profile 1).
async function machine(t) {
  const s = shortScratch();
  t.after(s.cleanup);
  const dir = realpathSync(s.dir);
  const home = join(dir, 'h');
  mkdirSync(home);
  const userHome = join(dir, 'u');
  const browsers = browsersFor({host: DARWIN, userHome});
  const userData = browsers.find(b => b.browser === 'chrome').dataDir;
  mkdirSync(join(userData, 'Default', 'Local Extension Settings', CUA_EXTENSION_ID), {recursive: true});
  mkdirSync(join(userData, 'Profile 1'), {recursive: true});
  const checkout = join(dir, 'c');
  mkdirSync(join(checkout, 'src', 'chrome'), {recursive: true});
  writeFileSync(join(checkout, 'src', 'chrome', 'host.mjs'), '');
  await registerCuaHost({home, checkout, nodePath: process.execPath, browsers});
  writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: {personal: {chromeProfileDirectory: 'Default'}, work: {chromeProfileDirectory: 'Profile 1'}}}));
  const chrome = chromeFacts({userData});
  return {dir, home, userHome, userData, checkout, chrome, checks: () => chromeChecks({home, chrome})};
}

function listen(t, path) {
  const server = createServer(socket => socket.end());
  t.after(() => server.close());
  return new Promise(resolve => server.listen(path, resolve));
}
// A socket file whose listener is gone (a host killed before it could clean up).
function staleSocket(path) {
  const r = spawnSync(process.execPath, ['-e', `require('node:net').createServer().listen(${JSON.stringify(path)}, () => process.exit(0))`]);
  assert.equal(r.status, 0, String(r.stderr));
  assert.ok(existsSync(path));
}

test('on the cua route the extension row uses the presence rule and the registration row names this home\'s launcher and its targets', async t => {
  const m = await machine(t);
  const checks = byName(await m.checks());
  assert.equal(checks['chrome.extension.personal'].status, 'pass', checks['chrome.extension.personal'].detail);
  assert.match(checks['chrome.extension.personal'].detail, /cua extension/);
  assert.equal(checks['chrome.extension.work'].status, 'blocked');
  assert.match(checks['chrome.extension.work'].detail, /cua extension is not installed/);
  const registered = checks['chrome.host.registered'];
  assert.equal(registered.status, 'pass', registered.detail);
  assert.equal(registered.detail, `cua: ${CUA_HOST_NAME} names this home's launcher ${launcherPath(m.home)} (node ${process.execPath}, host ${join(m.checkout, 'src', 'chrome', 'host.mjs')})`);
});

test('chrome.host.registered is blocked when the manifest is missing, names another host, or the launcher\'s targets moved', async t => {
  const m = await machine(t);
  const manifest = join(m.userData, 'NativeMessagingHosts', `${CUA_HOST_NAME}.json`);
  rmSync(join(m.checkout, 'src', 'chrome', 'host.mjs'));
  let row = byName(await m.checks())['chrome.host.registered'];
  assert.equal(row.status, 'blocked');
  assert.match(row.detail, /host\.mjs .*is not there.*cua chrome register/);
  writeFileSync(manifest, JSON.stringify({path: '/elsewhere/chrome/host'}));
  row = byName(await m.checks())['chrome.host.registered'];
  assert.equal(row.status, 'blocked');
  assert.match(row.detail, /names \/elsewhere\/chrome\/host, not this home's launcher/);
  rmSync(manifest);
  row = byName(await m.checks())['chrome.host.registered'];
  assert.equal(row.status, 'blocked');
  assert.match(row.detail, /no native-messaging manifest for io\.github\.ssfskim\.cua.*cua chrome register/);
});

test('chrome.hosts.live counts the sockets that accept a connection, removes a refused one, and is blocked at zero', async t => {
  const m = await machine(t);
  let row = byName(await m.checks())['chrome.hosts.live'];
  assert.equal(row.status, 'blocked');
  assert.match(row.detail, /no cua host is serving/);
  const live = join(backendDir(m.home), 'aaaaaaaaaaaa.sock');
  const stale = join(backendDir(m.home), 'bbbbbbbbbbbb.sock');
  await listen(t, live);
  staleSocket(stale);
  writeFileSync(join(backendDir(m.home), 'bbbbbbbbbbbb.json'), '{}');
  row = byName(await m.checks())['chrome.hosts.live'];
  assert.equal(row.status, 'pass', row.detail);
  assert.match(row.detail, /^1 cua host\(s\) serving/);
  assert.match(row.detail, /removed 1 stale socket/);
  assert.equal(existsSync(stale), false, 'the refused socket file is removed');
  assert.equal(existsSync(live), true);
});

// ---- chrome.route (route.mjs chromeMigration; test/chrome-migration.test.mjs covers its messages) -----------------

const EARLY = 1_760_000_000, LATE = 1_760_090_000;

test('chrome.route passes on a home registered for the cua extension with nothing left, and is the first Chrome row', async t => {
  const m = await machine(t);
  const checks = await m.checks();
  assert.deepEqual(checks[0], {name: 'chrome.route', status: 'pass', detail: 'cua\'s own extension and host (cua chrome register): the only Chrome route'});
});

test('chrome.route is blocked with no registration and with only the ChatGPT route\'s record, naming the migration code', t => {
  const s = scratch();
  t.after(s.cleanup);
  let row = routeCheck(s.dir);
  assert.equal(row.status, 'blocked');
  assert.match(row.detail, /^this home has no Chrome registration: run `cua chrome register`.* \[chrome_not_registered\]$/);
  writeVendorRecord(s.dir, {at: EARLY});
  row = routeCheck(s.dir);
  assert.equal(row.status, 'blocked');
  assert.match(row.detail, /ChatGPT extension route .*no longer supports.* \[chatgpt_route_removed\]$/);
});

test('chrome.route warns when cua\'s registration is in place but a profile is still bound on the ChatGPT extension', async t => {
  const m = await machine(t);
  writeFileSync(join(m.home, 'profiles.json'), JSON.stringify({version: 1, profiles: {personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-p', boundAt: 'x'}}}));
  const row = (await m.checks())[0];
  assert.deepEqual([row.name, row.status], ['chrome.route', 'warn']);
  assert.equal(row.detail, 'cua\'s own extension and host are registered: personal was bound on the ChatGPT extension: bind it again on the cua extension: cua profiles bind personal [rebind_required]');
});

test('chrome.route warns when cua\'s registration is in place but the ChatGPT route\'s record is newer, or left over', async t => {
  const m = await machine(t);
  utimesSync(cuaRecordFile(m.home), EARLY, EARLY);
  writeVendorRecord(m.home, {at: LATE});
  let row = (await m.checks())[0];
  assert.deepEqual([row.name, row.status], ['chrome.route', 'warn']);
  assert.match(row.detail, /run `cua chrome register` again.* \[chatgpt_route_removed\]$/);
  utimesSync(cuaRecordFile(m.home), LATE + 60, LATE + 60);
  row = (await m.checks())[0];
  assert.equal(row.status, 'warn');
  assert.match(row.detail, /left from before #79 .* \[chatgpt_route_leftover\]$/);
});

test('doctor runs the Chrome checks with no route argument and reports none of the removed rows', async t => {
  const m = await machine(t);
  let asked;
  const report = await inspectRuntime({home: m.home, host: DARWIN, inspectHelper: async () => ({socket: '/x', holders: []}), inspectSecrets: async () => ({dir: '/none', exists: false}),
    inspectAgent: async () => [], inspectChrome: async args => { asked = args; return chromeChecks({home: args.home, chrome: m.chrome}); }});
  assert.deepEqual(Object.keys(asked).sort(), ['env', 'home', 'host']);
  const names = report.checks.map(c => c.name);
  for (const removed of ['codex.login', 'chrome.host.config', 'browser.service']) assert.equal(names.includes(removed), false, removed);
  assert.equal(report.checks.find(c => c.name === 'chrome.route').status, 'pass');
  assert.doesNotMatch(report.checks.find(c => c.name === 'repl.host').detail, /Browser route/);
});
