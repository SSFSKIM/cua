// M12 CLI: the vendor route, `cua chrome register|unregister --vendor` (before the cua route, the commands without the
// flag; test/chrome-cua-cli.test.mjs covers the cua route). Every run gets a scratch CUA_HOME and a scratch HOME, so no real browser
// manifest directory is ever read or written.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {unregisterLines} from '../src/cli.mjs';
import {browsersFor} from '../src/chrome/registration.mjs';
import {PERMISSION_FIX} from '../src/profiles/chrome.mjs';
import {REPO, scratch, forgeActiveRuntime, forgeChromeComponent} from './fixtures/runtime-fixture.mjs';

const CLI = join(REPO, 'bin', 'cua.mjs');
const MANIFEST = 'com.openai.codexextension.json';

function machine(t, {desktop = false} = {}) {
  const s = scratch();
  t.after(s.cleanup);
  const home = join(s.dir, 'cua');
  mkdirSync(home);
  // This host's pin and Chrome directory: the CLI resolves both itself (HOME=user, no XDG overrides).
  forgeActiveRuntime(home);
  forgeChromeComponent(home);
  const user = join(s.dir, 'user');
  const chromeData = browsersFor({env: {}, userHome: user}).find(b => b.browser === 'chrome').dataDir;
  const nmh = join(chromeData, 'NativeMessagingHosts');
  mkdirSync(nmh, {recursive: true});
  const desktopBytes = `${JSON.stringify({allowed_origins: ['chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/'], description: 'ChatGPT browser native messaging host', name: 'com.openai.codexextension', path: join(user, '.codex/plugins/cache/openai-bundled/chrome/latest/extension-host/macos/arm64/ChatGPT for Chrome'), type: 'stdio'}, null, 2)}\n`;
  if (desktop) writeFileSync(join(nmh, MANIFEST), desktopBytes);
  const env = {...process.env, CUA_HOME: home, HOME: user};
  delete env.XDG_CONFIG_HOME;
  delete env.CHROME_CONFIG_HOME;
  const cua = args => spawnSync(process.execPath, [CLI, ...args], {env, encoding: 'utf8', timeout: 60_000});
  return {home, user, chromeData, nmh, desktopBytes, cua};
}

test('chrome register refuses while the desktop\'s manifest is present, with the stated sentence, and writes nothing', t => {
  const m = machine(t, {desktop: true});
  const r = m.cua(['chrome', 'register', '--vendor']);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /the desktop's registration is in use and already works with `cua serve`/);
  assert.match(r.stderr, /registration_in_use/);
  assert.match(r.stderr, /cua chrome register --vendor --replace/);
  assert.equal(readFileSync(join(m.nmh, MANIFEST), 'utf8'), m.desktopBytes);
  assert.equal(existsSync(join(m.home, 'chrome')), false);
  const json = m.cua(['chrome', 'register', '--vendor', '--json']);
  assert.equal(json.status, 1);
  assert.equal(JSON.parse(json.stdout).error.code, 'registration_in_use');
});

test('chrome unregister is a no-op when the manifest is not ours', t => {
  const m = machine(t, {desktop: true});
  const r = m.cua(['chrome', 'unregister', '--vendor']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /not ours|nothing/i);
  assert.equal(readFileSync(join(m.nmh, MANIFEST), 'utf8'), m.desktopBytes);
  const json = JSON.parse(m.cua(['chrome', 'unregister', '--vendor', '--json']).stdout);
  assert.equal(json.ok, true);
  assert.equal(json.blocked, false);
  assert.deepEqual(json.browsers.filter(b => b.action !== 'absent').map(b => [b.browser, b.action, b.pathClass]), [['chrome', 'not_ours', 'desktop']]);
});

// macOS only: a Linux release is trusted by its archive hash, so there is no host signature to refuse.
test('chrome register uses the production signature check, so a forged host is refused before any manifest is written', {skip: process.platform !== 'darwin' && 'codesign is macOS only'}, t => {
  const m = machine(t);
  const r = m.cua(['chrome', 'register', '--vendor', '--json']);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(JSON.parse(r.stdout).error.code, 'signature_invalid');
  assert.deepEqual(readdirSync(m.nmh), []);
});

test('chrome takes register or unregister, register takes only --vendor, --replace and --json, unregister only --vendor and --json', t => {
  const m = machine(t);
  for (const args of [['chrome'], ['chrome', 'frob'], ['chrome', 'register', '--force'], ['chrome', 'unregister', '--replace'], ['chrome', 'register', 'extra'], ['chrome', 'register', '--vendor', 'extra'], ['chrome', 'unregister', '--vendor', '--replace']]) {
    const r = m.cua(args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
  }
});

test('chrome register and unregister name an unreadable Chrome directory and the access fix, and write nothing', {skip: process.getuid?.() === 0}, t => {
  const m = machine(t, {desktop: true});
  const {chromeData} = m;
  chmodSync(chromeData, 0o000);
  let runs;
  try { runs = ['register', 'unregister'].map(command => [command, m.cua(['chrome', command, '--vendor']), JSON.parse(m.cua(['chrome', command, '--vendor', '--json']).stdout)]); } finally { chmodSync(chromeData, 0o755); }
  for (const [command, r, json] of runs) {
    assert.equal(r.status, 1, `${command}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /cannot read the native-messaging directory of Google Chrome .*EACCES.*Nothing was changed\. \[chrome_data_unreadable\]/, command);
    assert.ok(r.stderr.includes(`${PERMISSION_FIX}; then run \`cua chrome ${command} --vendor\` again`), `${command}: ${r.stderr}`);
    assert.doesNotMatch(r.stdout + r.stderr, /registration_in_use|nothing to unregister|removed|not ours/, command);
    assert.deepEqual([json.ok, json.error.code], [false, 'chrome_data_unreadable'], command);
  }
  assert.equal(readFileSync(join(m.nmh, MANIFEST), 'utf8'), m.desktopBytes);
  assert.equal(existsSync(join(m.home, 'chrome')), false);
});

test('unregister\'s report claims nothing to unregister only when every slot is empty or another host\'s', () => {
  const row = (browser, action, extra = {}) => ({browser, manifestPath: `/x/${browser}.json`, action, ...extra});
  const notOurs = row('edge', 'not_ours', {pathClass: 'desktop'});
  assert.match(unregisterLines({browsers: [row('chrome', 'absent'), notOurs]})[0], /^nothing to unregister/);
  for (const action of ['unknown', 'not_removed']) {
    const lines = unregisterLines({browsers: [row('chrome', action, {restoration: 'blocked', reason: 'r', userAction: 'grant Full Disk Access'}), notOurs]});
    assert.ok(!lines.some(l => /nothing to unregister/.test(l)), `${action}: ${lines.join('\n')}`);
    assert.match(lines[0], /chrome .*restoration BLOCKED: r\. To fix: grant Full Disk Access/);
  }
});
