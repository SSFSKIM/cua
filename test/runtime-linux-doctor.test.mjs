// Doctor on Linux (Phase F): the darwin helper and permission rows give way to display, accessibility.bus and
// sandbox.userns; the IPC and signature rows say why they do not apply; secrets read `skip`. The Linux host and every
// system probe are injected, so this runs on any machine.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, realpathSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {inspectRuntime, summarize} from '../src/runtime/doctor.mjs';
import {installRuntime} from '../src/runtime/install.mjs';
import {parsePin} from '../src/runtime/manifest.mjs';
import {linuxDesktopChecks, sessionBusAddress} from '../src/runtime/linux-desktop.mjs';
import {shortScratch, debFixture, linuxFixturePin, debTools} from './fixtures/runtime-fixture.mjs';

const LINUX = {platform: 'linux', arch: 'x64'};
const byName = report => Object.fromEntries(report.checks.map(c => [c.name, c]));
const never = what => async () => { throw new Error(`${what} must not run on linux`); };

async function linuxHome(t) {
  const s = shortScratch();
  t.after(s.cleanup);
  const archive = debFixture(s.dir);
  const pin = parsePin(linuxFixturePin({sha256: archive.sha256, length: archive.length}));
  const home = join(s.dir, 'home');
  await installRuntime({home, manifest: pin, archivePath: archive.deb, host: LINUX, tools: debTools(), verifySignatures: never('codesign')});
  return {home, pin};
}

const DESKTOP_ROWS = [
  {name: 'display', status: 'pass', detail: 'fixture'},
  {name: 'accessibility.bus', status: 'pass', detail: 'fixture'},
  {name: 'sandbox.userns', status: 'blocked', detail: 'fixture'},
];

test('a healthy Linux install: no darwin rows, the Linux desktop rows, IPC and signatures not applicable, the secret store', async t => {
  const {home, pin} = await linuxHome(t);
  let asked = 0;
  const report = await inspectRuntime({home, env: {}, pins: [pin], host: LINUX, verifySignatures: never('codesign'),
    inspectHelper: never('the native socket helper inspection'), inspectSecrets: async () => ({dir: '/home/u/.config/claude-secrets', exists: true, directory: true, owned: true, mode: 0o700, keys: ['K'], unsafe: []}),
    inspectLinux: async ({env}) => { assert.deepEqual(env, {}); return DESKTOP_ROWS; },
    inspectLogin: async () => { asked++; return {state: 'logged-in'}; }, inspectChrome: async () => [], inspectAgent: async () => []});
  const rows = byName(report);
  assert.equal(report.ok, true);
  for (const name of ['platform', 'runtime.installed', 'runtime.files', 'runtime.vendor-manifest', 'runtime.ipc', 'runtime.signatures', 'chrome.host.config', 'sandbox', 'codex.login'])
    assert.equal(rows[name]?.status, 'pass', name);
  assert.equal(rows['runtime.ipc'].detail, 'not applicable on linux');
  assert.match(rows['runtime.signatures'].detail, /archive hash is the trust root on linux/);
  assert.match(rows['chrome.host.config'].detail, /extension-host\/linux\/x64\/extension-host trusted by the archive hash/);
  assert.equal(rows['helper.live'], undefined);
  assert.equal(rows['helper.permissions'], undefined);
  assert.deepEqual(['display', 'accessibility.bus'].map(n => rows[n].status), ['pass', 'pass']);
  assert.match(rows.sandbox.detail, /^CUA_SHIM_SANDBOX unset: on linux with the computer surface the default is disabled/);
  assert.equal(rows['sandbox.userns'].status, 'skip', 'no sandbox runs under the Linux default, so a refusing bubblewrap blocks nothing');
  assert.equal(rows['secrets.helper'], undefined);
  assert.equal(rows['secrets.store'].status, 'pass', 'Linux has the same file store');
  assert.equal(asked, 1, 'the bundled CLI is asked about the login: the release is trusted by its hash');
  assert.equal(summarize(report), 'passive runtime checks pass');
});

// What F2 measured on Ubuntu 24.04 (docs/evidence/2026-10-06-linux-acceptance.md): under any managed profile node_repl
// lets no runtime process connect to a socket, so the scoped sandbox keeps the computer-use helper off the X display
// and the session bus; and where bubblewrap cannot create a user namespace the runtime runs cells with no sandbox.
test('the sandbox row on Linux says what the mode does there: scoped breaks the computer surface, and confines nothing without user namespaces', async t => {
  const {home, pin} = await linuxHome(t);
  const doctor = (env, userns) => inspectRuntime({home, env, pins: [pin], host: LINUX, verifySignatures: never('codesign'),
    inspectHelper: never('the native socket helper inspection'), inspectSecrets: async () => ({dir: '/home/u/.config/claude-secrets', exists: true, directory: true, owned: true, mode: 0o700, keys: ['K'], unsafe: []}),
    inspectLinux: async () => [DESKTOP_ROWS[0], DESKTOP_ROWS[1], {name: 'sandbox.userns', status: userns, detail: 'fixture'}],
    inspectLogin: async () => ({state: 'logged-in'}), inspectChrome: async () => [], inspectAgent: async () => []}).then(byName);

  let rows = await doctor({CUA_SHIM_SANDBOX: 'scoped'}, 'pass');
  assert.equal(rows.sandbox.status, 'fail');
  assert.match(rows.sandbox.detail, /computer-use helper \(sky_linux\) cannot reach the X display or the session bus/);
  assert.match(rows.sandbox.detail, /CUA_SHIM_SURFACES=browser/);
  assert.equal(rows['sandbox.userns'].status, 'pass');

  rows = await doctor({CUA_SHIM_SURFACES: 'browser'}, 'pass');
  assert.equal(rows.sandbox.status, 'pass', 'the browser surface alone keeps scoped, and it works there');
  assert.match(rows.sandbox.detail, /^CUA_SHIM_SANDBOX=scoped/);

  rows = await doctor({CUA_SHIM_SURFACES: 'browser'}, 'blocked');
  assert.equal(rows.sandbox.status, 'fail');
  assert.match(rows.sandbox.detail, /fails open/);
  assert.match(rows.sandbox.detail, /refuse scoped connections \(sandbox_unavailable\)/);
  assert.equal(rows['sandbox.userns'].status, 'blocked', 'the probe row keeps its own verdict and remedy');

  rows = await doctor({CUA_SHIM_SANDBOX: 'scoped'}, 'blocked');
  assert.equal(rows.sandbox.status, 'fail');
  assert.match(rows.sandbox.detail, /fails open/, 'refused user namespaces are named first: that is what happens in this state');
  assert.match(rows.sandbox.detail, /refuse scoped connections \(sandbox_unavailable\)/);
  assert.match(rows.sandbox.detail, /even with user namespaces.*X display/, 'the computer surface\'s own problem is still said');

  for (const value of ['', 'computer,', 'mouse']) {
    rows = await doctor({CUA_SHIM_SURFACES: value}, 'pass');
    assert.equal(rows.sandbox.status, 'fail', JSON.stringify(value));
    assert.match(rows.sandbox.detail, /CUA_SHIM_SURFACES must be computer, browser or computer,browser/);
  }

  // Fix wave 2: computer,browser with the mode unset serves under disabled, but cua profiles list and bind still
  // launch scoped and are refused, so the probe's verdict stands.
  rows = await doctor({CUA_SHIM_SURFACES: 'computer,browser'}, 'blocked');
  assert.equal(rows.sandbox.status, 'pass');
  assert.equal(rows['sandbox.userns'].status, 'blocked');
  assert.match(rows['sandbox.userns'].detail, /cua profiles list and bind launch under scoped and are refused \(sandbox_unavailable\)/);
  // Fix wave 3: an explicitly scoped connection is itself refused, browser surface or not, so the probe's row stands.
  rows = await doctor({CUA_SHIM_SANDBOX: 'scoped'}, 'blocked');
  assert.equal(rows['sandbox.userns'].status, 'blocked', 'scoped with the computer surface only is still a scoped launch');
  assert.equal(rows['sandbox.userns'].detail, 'fixture');
  rows = await doctor({CUA_SHIM_SURFACES: 'computer,browser', CUA_SHIM_SANDBOX: 'disabled'}, 'blocked');
  assert.equal(rows['sandbox.userns'].status, 'skip', 'an explicit disabled reaches the listing too');

  rows = await doctor({CUA_SHIM_SANDBOX: 'disabled'}, 'blocked');
  assert.equal(rows.sandbox.status, 'pass');
  assert.match(rows.sandbox.detail, /^CUA_SHIM_SANDBOX=disabled/);
  assert.equal(rows['sandbox.userns'].status, 'skip');
  assert.match(rows['sandbox.userns'].detail, /not needed here: no scoped launch happens with CUA_SHIM_SANDBOX=disabled/);
});

test('skip is neither a failure nor blocked: ok stays true and the verdict does not list it', () => {
  const report = {ok: true, checks: [{name: 'runtime.files', status: 'pass', detail: ''}, {name: 'secrets.store', status: 'skip', detail: ''}]};
  assert.equal(summarize(report), 'passive runtime checks pass');
});

test('the session bus address is DBUS_SESSION_BUS_ADDRESS, else derived from XDG_RUNTIME_DIR, else none', () => {
  assert.equal(sessionBusAddress({DBUS_SESSION_BUS_ADDRESS: 'unix:path=/x/bus', XDG_RUNTIME_DIR: '/run/user/1000'}), 'unix:path=/x/bus');
  assert.equal(sessionBusAddress({XDG_RUNTIME_DIR: '/run/user/1000'}), 'unix:path=/run/user/1000/bus');
  assert.equal(sessionBusAddress({}), undefined);
});

// A fake system: which tools exist, and what each command prints and exits with.
function system({tools = ['xdpyinfo', 'dbus-send', 'bwrap'], answers = {}, osRelease = 'ID=debian\nVERSION_ID="12"\n'} = {}) {
  const calls = [];
  return {
    calls,
    findTool: name => tools.includes(name) ? `/usr/bin/${name}` : null,
    findSystemTool: name => tools.includes(name) ? `/usr/bin/${name}` : null,
    exec: async (command, args, {env}) => {
      calls.push({command, args, env});
      const key = [command.split('/').pop(), ...args].join(' ');
      const hit = Object.entries(answers).find(([prefix]) => key.startsWith(prefix));
      return hit ? {code: 0, stdout: '', stderr: '', ...hit[1]} : {code: 1, stdout: '', stderr: `unexpected ${key}`};
    },
    osRelease: () => osRelease,
  };
}
const XDPYINFO = 'name of display:    :0\nnumber of extensions:    5\n    BIG-REQUESTS\n    Composite\n    XFIXES\n    XTEST\n    RANDR\ndefault screen number:    0\n';
const NAMES = list => `method return time=1 sender=org.freedesktop.DBus\n   array [\n${list.map(n => `      string "${n}"`).join('\n')}\n   ]\n`;
const rowsOf = async (env, sys) => Object.fromEntries((await linuxDesktopChecks({env, ...sys})).map(r => [r.name, r]));

test('display passes with XTEST, Composite and XFIXES on the display, and names what is wrong otherwise', async () => {
  const env = {DISPLAY: ':0', XAUTHORITY: '/home/u/.Xauthority', HOME: '/home/u', PATH: '/usr/bin'};
  const ok = system({answers: {xdpyinfo: {stdout: XDPYINFO}, 'dbus-send': {stdout: NAMES(['org.a11y.Bus'])}, bwrap: {}}});
  const rows = await rowsOf(env, ok);
  assert.equal(rows.display.status, 'pass');
  assert.match(rows.display.detail, /:0.*XTEST, Composite and XFIXES/);
  assert.equal(ok.calls.find(c => c.command.endsWith('xdpyinfo')).env.DISPLAY, ':0');

  assert.equal((await rowsOf({...env, DISPLAY: undefined}, ok)).display.status, 'fail');
  assert.match((await rowsOf({HOME: '/home/u'}, ok)).display.detail, /DISPLAY is not set/);
  const noTool = (await rowsOf(env, system({tools: ['dbus-send', 'bwrap']}))).display;
  assert.equal(noTool.status, 'blocked');
  assert.match(noTool.detail, /missing_tool.*xdpyinfo.*x11-utils/);
  const refused = (await rowsOf(env, system({answers: {xdpyinfo: {code: 1, stderr: 'xdpyinfo:  unable to open display ":0".\n'}}}))).display;
  assert.equal(refused.status, 'fail');
  assert.match(refused.detail, /unable to open display/);
  const bare = (await rowsOf(env, system({answers: {xdpyinfo: {stdout: XDPYINFO.replace('    XTEST\n', '')}}}))).display;
  assert.equal(bare.status, 'fail');
  assert.match(bare.detail, /lacks XTEST/);
});

test('accessibility.bus asks the session bus for AT-SPI, at the derived address when only XDG_RUNTIME_DIR is set', async () => {
  const env = {XDG_RUNTIME_DIR: '/run/user/1000', PATH: '/usr/bin'};
  const running = system({answers: {'dbus-send --session --print-reply --dest=org.freedesktop.DBus / org.freedesktop.DBus.ListNames': {stdout: NAMES([':1.0', 'org.a11y.Bus'])}}});
  const rows = await rowsOf(env, running);
  assert.equal(rows['accessibility.bus'].status, 'pass');
  const call = running.calls.find(c => c.command.endsWith('dbus-send'));
  assert.equal(call.env.DBUS_SESSION_BUS_ADDRESS, 'unix:path=/run/user/1000/bus');

  const activatable = system({answers: {
    'dbus-send --session --print-reply --dest=org.freedesktop.DBus / org.freedesktop.DBus.ListNames': {stdout: NAMES([':1.0'])},
    'dbus-send --session --print-reply --dest=org.freedesktop.DBus / org.freedesktop.DBus.ListActivatableNames': {stdout: NAMES(['org.a11y.Bus'])},
  }});
  const started = (await rowsOf(env, activatable))['accessibility.bus'];
  assert.equal(started.status, 'pass');
  assert.match(started.detail, /activatable/);

  const absent = system({answers: {'dbus-send': {stdout: NAMES([':1.0'])}}});
  const none = (await rowsOf(env, absent))['accessibility.bus'];
  assert.equal(none.status, 'fail');
  assert.match(none.detail, /at-spi2-core/);
  assert.equal((await rowsOf({PATH: '/usr/bin'}, absent))['accessibility.bus'].status, 'fail');
  assert.match((await rowsOf({PATH: '/usr/bin'}, absent))['accessibility.bus'].detail, /DBUS_SESSION_BUS_ADDRESS.*XDG_RUNTIME_DIR/);
  assert.equal((await rowsOf(env, system({tools: ['xdpyinfo', 'bwrap']})))['accessibility.bus'].status, 'blocked');
  const silent = (await rowsOf(env, system({answers: {}})))['accessibility.bus'];
  assert.equal(silent.status, 'fail');
  assert.match(silent.detail, /did not answer/);
});

test('sandbox.userns finds bwrap where the launch check does, on the system path, not the caller\'s PATH', async () => {
  const sys = system({answers: {'bwrap --ro-bind / / true': {}}});
  const onlySystem = {...sys, findTool: name => (name === 'bwrap' ? null : sys.findTool(name))};
  assert.equal((await rowsOf({PATH: '/home/u/bin'}, onlySystem))['sandbox.userns'].status, 'pass');
  const noSystem = {...sys, findTool: name => `/home/u/bin/${name}`, findSystemTool: () => null};
  assert.equal((await rowsOf({PATH: '/home/u/bin'}, noSystem))['sandbox.userns'].status, 'blocked');
});

test('sandbox.userns runs bwrap --ro-bind / / true; a refusal is blocked with its stderr, naming the Ubuntu sysctl there', async () => {
  const env = {PATH: '/usr/bin'};
  const ok = system({answers: {'bwrap --ro-bind / / true': {}}});
  assert.equal((await rowsOf(env, ok))['sandbox.userns'].status, 'pass');
  const denied = {'bwrap --ro-bind / / true': {code: 1, stderr: 'bwrap: setting up uid map: Permission denied\n'}};
  const ubuntu = (await rowsOf(env, system({answers: denied, osRelease: 'NAME="Ubuntu"\nID=ubuntu\nVERSION_ID="24.04"\n'})))['sandbox.userns'];
  assert.equal(ubuntu.status, 'blocked');
  assert.match(ubuntu.detail, /setting up uid map: Permission denied/);
  assert.match(ubuntu.detail, /kernel\.apparmor_restrict_unprivileged_userns/);
  assert.match(ubuntu.detail, /^bubblewrap could not create an unprivileged user namespace/);
  assert.doesNotMatch(ubuntu.detail, /cannot start/, 'it says what bubblewrap did, not that the runtime\'s sandbox cannot start');
  const older = (await rowsOf(env, system({answers: denied, osRelease: 'ID=ubuntu\nVERSION_ID="22.04"\n'})))['sandbox.userns'];
  assert.doesNotMatch(older.detail, /apparmor_restrict_unprivileged_userns/);
  const debian = (await rowsOf(env, system({answers: denied})))['sandbox.userns'];
  assert.doesNotMatch(debian.detail, /apparmor_restrict_unprivileged_userns/);
  const noBwrap = (await rowsOf(env, system({tools: ['xdpyinfo', 'dbus-send']})))['sandbox.userns'];
  assert.equal(noBwrap.status, 'blocked');
  assert.match(noBwrap.detail, /missing_tool.*bwrap.*bubblewrap/);
});

test('the default Chrome checks on Linux read the host\'s Chrome under $XDG_CONFIG_HOME, as doctor\'s env and host say', async t => {
  const {home, pin} = await linuxHome(t);
  const config = join(home, '..', 'config');
  const manifestDir = join(config, 'google-chrome', 'NativeMessagingHosts');
  mkdirSync(manifestDir, {recursive: true});
  const host = join(realpathSync(home), 'runtimes', pin.release, 'chrome-plugin', 'extension-host', 'linux', 'x64', 'extension-host');
  writeFileSync(join(manifestDir, 'com.openai.codexextension.json'), JSON.stringify({name: 'com.openai.codexextension', type: 'stdio', path: host}));
  // The secrets rows are stubbed: this env has no HOME, so the default would describe the account's own store.
  const report = await inspectRuntime({home, env: {XDG_CONFIG_HOME: realpathSync(config)}, pins: [pin], host: LINUX,
    inspectSecrets: async () => ({dir: '/none', exists: false}), inspectLinux: async () => DESKTOP_ROWS, inspectLogin: async () => ({state: 'logged-in'}), inspectAgent: async () => []});
  const rows = byName(report);
  assert.equal(rows['chrome.host.registered'].status, 'pass');
  assert.equal(rows['chrome.host.registered'].detail, `cua: com.openai.codexextension names ${host}`);
  assert.ok(rows['chrome.hosts.live'], 'the live-host row is computed from the Linux process table');
});
