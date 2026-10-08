// H2: doctor on the cua route (acceptance 1's rows, against fixtures): chrome.extension.<key> by the cua presence rule,
// chrome.host.registered for io.github.ssfskim.cua and this home's launcher and its targets, chrome.hosts.live counting
// the sockets in $CUA_HOME/chrome/b that accept a connection (the one row that connects), codex.login skipped and
// chrome.host.config not reported. Scratch homes and Chrome directories only; the sockets are this test's own.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {chromeFacts, CUA_EXTENSION_ID} from '../src/profiles/chrome.mjs';
import {cuaChromeChecks} from '../src/profiles/checks.mjs';
import {inspectRuntime} from '../src/runtime/doctor.mjs';
import {browsersFor, registerCuaHost} from '../src/chrome/registration.mjs';
import {backendDir, CUA_HOST_NAME, launcherPath} from '../src/chrome/extension.mjs';
import {shortScratch, scratch} from './fixtures/runtime-fixture.mjs';

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
  const chrome = chromeFacts({userData, extensionId: CUA_EXTENSION_ID});
  return {dir, home, userHome, userData, checkout, chrome, checks: () => cuaChromeChecks({home, chrome, userHome})};
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

test('doctor on the cua route skips codex.login with the stated text, omits chrome.host.config, and runs the cua Chrome checks', async t => {
  const m = await machine(t);
  let asked = false;
  let chromeRoute;
  const report = await inspectRuntime({home: m.home, host: DARWIN, inspectHelper: async () => ({socket: '/x', holders: []}), inspectSecrets: async () => ({dir: '/none', exists: false}),
    inspectAgent: async () => [], inspectLogin: async () => { asked = true; return {state: 'logged-in'}; },
    inspectChrome: async ({route}) => { chromeRoute = route; return []; }});
  const login = report.checks.find(c => c.name === 'codex.login');
  assert.deepEqual(login, {name: 'codex.login', status: 'skip', detail: 'not needed: the cua extension route needs no Codex login (the ChatGPT extension route does)'});
  assert.equal(asked, false);
  assert.equal(report.checks.some(c => c.name === 'chrome.host.config'), false);
  assert.equal(chromeRoute, 'cua');
});

test('doctor with no registration keeps codex.login and chrome.host.config as before', async t => {
  const s = scratch();
  t.after(s.cleanup);
  let chromeRoute = 'unset';
  const report = await inspectRuntime({home: s.dir, host: DARWIN, inspectHelper: async () => ({socket: '/x', holders: []}), inspectSecrets: async () => ({dir: '/none', exists: false}),
    inspectAgent: async () => [], inspectChrome: async ({route}) => { chromeRoute = route; return []; }});
  assert.equal(report.checks.find(c => c.name === 'codex.login').status, 'blocked');
  assert.equal(report.checks.find(c => c.name === 'chrome.host.config').status, 'blocked');
  assert.equal(chromeRoute, null);
});
