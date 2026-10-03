// M12: doctor's chrome.host.config — the placed host component, its signature, and the configuration the host reads
// from its own directory: present, every executable/script path inside the active release tree, and codexHome equal
// to the owned writable <home>/state/codex.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, rmSync, writeFileSync, chmodSync, realpathSync} from 'node:fs';
import {join} from 'node:path';
import {inspectRuntime} from '../src/runtime/doctor.mjs';
import {installRuntime} from '../src/runtime/install.mjs';
import {parsePin, loadPins} from '../src/runtime/manifest.mjs';
import {scratch, zipFixture, fixturePin, acceptSignatures, forgeActiveRuntime, forgeChromeComponent} from './fixtures/runtime-fixture.mjs';

const darwin = process.platform === 'darwin';
const HOST = {platform: 'darwin', arch: 'arm64'};
const passive = {host: HOST, verifySignatures: acceptSignatures, inspectHelper: async () => ({socket: '/x', holders: []}),
  inspectSecrets: async () => ({path: '/x', built: false}), inspectLogin: async () => ({state: 'not_logged_in'}), inspectChrome: async () => []};
const configCheck = report => report.checks.find(c => c.name === 'chrome.host.config');

function forged(t, options) {
  const s = scratch();
  t.after(s.cleanup);
  const home = join(s.dir, 'cua');
  mkdirSync(home);
  forgeActiveRuntime(home);
  return {home, component: options === null ? null : forgeChromeComponent(home, options)};
}
const doctor = (home, extra = {}) => inspectRuntime({home, pins: loadPins(), ...passive, ...extra});

test('a fixture install passes chrome.host.config', {skip: !darwin}, async t => {
  const s = scratch();
  t.after(s.cleanup);
  const archive = zipFixture(s.dir);
  const pin = parsePin(fixturePin({sha256: archive.sha256, length: archive.length}));
  const home = join(s.dir, 'home');
  await installRuntime({home, manifest: pin, archivePath: archive.zip, verifySignatures: acceptSignatures, host: HOST});
  const report = await inspectRuntime({home, pins: [pin], ...passive});
  const check = configCheck(report);
  assert.equal(check.status, 'pass', check.detail);
  assert.match(check.detail, /inside the active release/);
  assert.ok(check.detail.includes(join(realpathSync(home), 'state', 'codex')), check.detail);
  assert.equal(report.ok, true);
});

test('a forged runtime with a correct component passes; without the component the check is blocked with the fix', t => {
  const ok = forged(t);
  return doctor(ok.home).then(async report => {
    assert.equal(configCheck(report).status, 'pass', configCheck(report).detail);
    const absent = forged(t, null);
    const blocked = configCheck(await doctor(absent.home));
    assert.equal(blocked.status, 'blocked');
    assert.match(blocked.detail, /cua install/);
  });
});

test('a configuration that points outside the release, at a missing file, or at another CODEX_HOME fails', async t => {
  const cases = {
    'node outside the release': {nodePath: '/usr/bin/true'},
    'browser service outside the release': {browserServicePath: '/Users/x/.codex/plugins/cache/openai-bundled/chrome/latest/scripts/browser-service.mjs'},
    'codexHome is the desktop\'s': {codexHome: '/Users/x/.codex'},
    'missing key': {codexCliPath: undefined},
  };
  for (const [name, config] of Object.entries(cases)) {
    const m = forged(t, {config});
    const check = configCheck(await doctor(m.home));
    assert.equal(check.status, 'fail', `${name}: ${check.detail}`);
    assert.match(check.detail, /chrome-plugin/, name);
  }
  const unreadable = forged(t);
  writeFileSync(join(unreadable.component.host, '..', 'extension-host-config.json'), 'nope');
  assert.equal(configCheck(await doctor(unreadable.home)).status, 'fail');
  const gone = forged(t);
  rmSync(join(gone.component.host, '..', 'extension-host-config.json'));
  assert.equal(configCheck(await doctor(gone.home)).status, 'fail');
});

test('a path inside the release that does not exist, or a non-writable codexHome, fails', async t => {
  const m = forged(t);
  rmSync(m.component.config.browserClientPath);
  assert.equal(configCheck(await doctor(m.home)).status, 'fail');
  const ro = forged(t);
  chmodSync(ro.component.config.codexHome, 0o500);
  let check;
  try { check = configCheck(await doctor(ro.home)); } finally { chmodSync(ro.component.config.codexHome, 0o700); }
  assert.equal(check.status, 'fail');
  assert.match(check.detail, /writable/);
});

test('an invalid host signature fails the check with the host named', async t => {
  const m = forged(t);
  const rejectHost = async (root, pin) => pin.signing.components.map(c => ({component: c, valid: !c.includes('ChatGPT for Chrome'), detail: 'invalid signature'}));
  const check = configCheck(await doctor(m.home, {verifySignatures: rejectHost}));
  assert.equal(check.status, 'fail');
  assert.match(check.detail, /ChatGPT for Chrome/);
});
