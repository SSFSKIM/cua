// Doctor's Chrome checks (C5): per registered profile the extension's presence, the native-messaging registration and
// which host it names, and the running hosts. All are passive capability evidence: pass or blocked, never a failure of
// runtime health.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {chromeFacts, OPENAI_EXTENSION_ID} from '../src/profiles/chrome.mjs';
import {chromeChecks} from '../src/profiles/checks.mjs';
import {inspectRuntime} from '../src/runtime/doctor.mjs';

const PS_TWO_HOSTS = [
  '  100     1 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '  200   100 /Users/x/.codex/plugins/cache/openai-bundled/chrome/latest/extension-host/macos/arm64/ChatGPT for Chrome',
  '  201   100 /Users/x/.codex/plugins/cache/openai-bundled/chrome/latest/extension-host/macos/arm64/ChatGPT for Chrome',
].join('\n');

function machine(t) {
  const s = scratch();
  t.after(s.cleanup);
  const userData = join(s.dir, 'Chrome');
  for (const dir of ['Default', 'Profile 8']) mkdirSync(join(userData, dir), {recursive: true});
  const v = join(userData, 'Default', 'Extensions', OPENAI_EXTENSION_ID, '1.0_0');
  mkdirSync(v, {recursive: true});
  writeFileSync(join(v, 'manifest.json'), '{}');
  const home = join(s.dir, 'cua');
  mkdirSync(home);
  writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: {personal: {chromeProfileDirectory: 'Default'}, work: {chromeProfileDirectory: 'Profile 8'}, school: {chromeProfileDirectory: 'Profile 6'}}}));
  return {home, userData, chrome: chromeFacts({userData})};
}
const byName = checks => Object.fromEntries(checks.map(c => [c.name, c]));

test('per-profile extension checks, the native host registration by path class, and the live host count', t => {
  const {home, userData, chrome} = machine(t);
  mkdirSync(join(userData, 'NativeMessagingHosts'));
  writeFileSync(join(userData, 'NativeMessagingHosts', 'com.openai.codexextension.json'), JSON.stringify({path: '/Users/x/.codex/plugins/cache/openai-bundled/chrome/latest/extension-host/macos/arm64/ChatGPT for Chrome'}));
  const checks = byName(chromeChecks({home, chrome, psText: PS_TWO_HOSTS, userHome: '/Users/x'}));
  assert.equal(checks['chrome.extension.personal'].status, 'pass');
  assert.equal(checks['chrome.extension.work'].status, 'blocked');
  assert.match(checks['chrome.extension.work'].detail, /not installed/);
  assert.equal(checks['chrome.extension.school'].status, 'blocked');
  assert.match(checks['chrome.extension.school'].detail, /no longer exists/);
  assert.equal(checks['chrome.host.registered'].status, 'pass');
  assert.match(checks['chrome.host.registered'].detail, /^desktop: /);
  assert.equal(checks['chrome.hosts.live'].status, 'pass');
  assert.match(checks['chrome.hosts.live'].detail, /^2 /);
});

test('no registration and no running host are blocked with what the user can do', t => {
  const {home, chrome} = machine(t);
  const checks = byName(chromeChecks({home, chrome, psText: ''}));
  assert.equal(checks['chrome.host.registered'].status, 'blocked');
  assert.match(checks['chrome.host.registered'].detail, /com\.openai\.codexextension/);
  assert.equal(checks['chrome.hosts.live'].status, 'blocked');
  assert.match(checks['chrome.hosts.live'].detail, /Chrome/);
});

test('an unreadable registry is one blocked check with the fix, not a crash', t => {
  const {home, chrome} = machine(t);
  writeFileSync(join(home, 'profiles.json'), 'garbage');
  const checks = byName(chromeChecks({home, chrome, psText: ''}));
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
    inspectChrome: async ({home}) => { assert.equal(home, s.dir); return injected; }});
  assert.deepEqual(report.checks.filter(c => c.name.startsWith('chrome.')), injected);
  for (const c of report.checks.filter(c => c.name.startsWith('chrome.'))) assert.notEqual(c.status, 'fail');
});
