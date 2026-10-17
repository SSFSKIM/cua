// Doctor's Chrome checks (C5): whether the home is on the cua route, per registered profile the cua extension's
// presence, the io.github.ssfskim.cua native-messaging registration, and cua's live hosts. All are passive capability
// evidence: pass, warn or blocked, never a failure of runtime health. test/doctor-cua-route.test.mjs drives a registered
// home; these cover the rows' shape and the unreadable cases.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {chromeFacts, CUA_EXTENSION_ID, PERMISSION_FIX} from '../src/profiles/chrome.mjs';
import {chromeChecks} from '../src/profiles/checks.mjs';
import {inspectRuntime} from '../src/runtime/doctor.mjs';
import {fakeChromeFacts} from './fixtures/chrome-facts.mjs';

function machine(t) {
  const s = scratch();
  t.after(s.cleanup);
  const userData = join(s.dir, 'Chrome');
  for (const dir of ['Default', 'Profile 8']) mkdirSync(join(userData, dir), {recursive: true});
  const v = join(userData, 'Default', 'Extensions', CUA_EXTENSION_ID, '1.0_0');
  mkdirSync(v, {recursive: true});
  writeFileSync(join(v, 'manifest.json'), '{}');
  const home = join(s.dir, 'cua');
  mkdirSync(home);
  writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: {personal: {chromeProfileDirectory: 'Default'}, work: {chromeProfileDirectory: 'Profile 8'}, school: {chromeProfileDirectory: 'Profile 6'}}}));
  return {home, userData, chrome: chromeFacts({userData})};
}
const byName = checks => Object.fromEntries(checks.map(c => [c.name, c]));

test('the rows in order: chrome.route, one per profile with the cua extension\'s presence, the registration, the live hosts', async t => {
  const {home, chrome} = machine(t);
  const list = await chromeChecks({home, chrome, probeMs: 50});
  assert.deepEqual(list.map(c => c.name), ['chrome.route', 'chrome.extension.personal', 'chrome.extension.school', 'chrome.extension.work', 'chrome.host.registered', 'chrome.hosts.live']);
  const checks = byName(list);
  assert.equal(checks['chrome.extension.personal'].status, 'pass');
  assert.equal(checks['chrome.extension.work'].status, 'blocked');
  assert.match(checks['chrome.extension.work'].detail, /cua extension is not installed/);
  assert.equal(checks['chrome.extension.school'].status, 'blocked');
  assert.match(checks['chrome.extension.school'].detail, /no longer exists/);
  for (const c of list) assert.notEqual(c.status, 'fail', c.name);
});

test('no registration and no running host are blocked with what the user can do', async t => {
  const {home, chrome} = machine(t);
  const checks = byName(await chromeChecks({home, chrome, probeMs: 50}));
  assert.equal(checks['chrome.route'].status, 'blocked');
  assert.match(checks['chrome.route'].detail, /cua chrome register.*\[chrome_not_registered\]$/);
  assert.equal(checks['chrome.host.registered'].status, 'blocked');
  assert.match(checks['chrome.host.registered'].detail, /no native-messaging manifest for io\.github\.ssfskim\.cua.*cua chrome register/);
  assert.equal(checks['chrome.hosts.live'].status, 'blocked');
  assert.match(checks['chrome.hosts.live'].detail, /no cua host is serving/);
});

test('an unreadable registry is one blocked check with the fix, not a crash', async t => {
  const {home, chrome} = machine(t);
  writeFileSync(join(home, 'profiles.json'), 'garbage');
  const checks = byName(await chromeChecks({home, chrome, probeMs: 50}));
  assert.equal(checks['chrome.profiles'].status, 'blocked');
  assert.match(checks['chrome.profiles'].detail, /profiles\.json/);
  assert.equal(Object.keys(checks).some(name => name.startsWith('chrome.extension.')), false);
});

test('doctor reports the Chrome checks beside runtime health and they never change ok', async t => {
  const s = scratch();
  t.after(s.cleanup);
  const injected = [{name: 'chrome.hosts.live', status: 'blocked', detail: 'none'}];
  const report = await inspectRuntime({home: s.dir, host: {platform: 'darwin', arch: 'arm64'},
    inspectHelper: async () => ({socket: '/x', holders: []}), inspectSecrets: async () => ({path: '/x', built: false}),
    inspectChrome: async ({home}) => { assert.equal(home, s.dir); return injected; }, inspectAgent: async () => []});
  const capability = report.checks.filter(c => c.name.startsWith('chrome.'));
  assert.deepEqual(capability, injected);
  for (const c of capability) assert.notEqual(c.status, 'fail');
});

test('Chrome data this process may not read is blocked with the Full Disk Access hint and the code, never "not installed"', async t => {
  const {home} = machine(t);
  const chrome = fakeChromeFacts({Default: {extension: 'installed'}, 'Profile 8': {extension: 'unreadable'}, 'Profile 6': {directory: 'unreadable'}}, {nativeHost: {readError: 'EPERM'}});
  const checks = byName(await chromeChecks({home, chrome, probeMs: 50}));
  assert.equal(checks['chrome.extension.personal'].status, 'pass');
  for (const key of ['work', 'school']) {
    const c = checks[`chrome.extension.${key}`];
    assert.equal(c.status, 'blocked', key);
    assert.match(c.detail, /may not read Chrome's data directory \(EPERM\).*the live check still works/, key);
    assert.ok(c.detail.includes(PERMISSION_FIX), key);
    assert.doesNotMatch(c.detail, /not installed|no longer exists/, key);
  }
  assert.equal(checks['chrome.host.registered'].status, 'blocked');
  assert.match(checks['chrome.host.registered'].detail, /is unknown: this process may not read it .*\(EPERM\)/);
  assert.ok(checks['chrome.host.registered'].detail.includes(PERMISSION_FIX));
});

test('a binding made on the ChatGPT extension does not turn unreadable extension evidence into a doctor pass', async t => {
  const {addProfile} = await import('../src/profiles/registry.mjs');
  const s = scratch(); t.after(s.cleanup);
  const chrome = fakeChromeFacts({Default: {directory: 'unreadable'}});
  addProfile({home: s.dir, key: 'work', directory: 'Default', chrome});
  writeFileSync(join(s.dir, 'profiles.json'), JSON.stringify({version: 1, profiles: {work: {chromeProfileDirectory: 'Default', extensionInstanceId: 'instance', boundAt: 'x'}}}));
  const checks = byName(await chromeChecks({home: s.dir, chrome, probeMs: 50}));
  assert.equal(checks['chrome.extension.work'].status, 'blocked');
  assert.match(checks['chrome.extension.work'].detail, /EPERM/);
});
