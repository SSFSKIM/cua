import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {chmodSync, mkdirSync, readFileSync, readdirSync, rmSync, realpathSync, writeFileSync} from 'node:fs';
import {agentChecks, inspectRuntime, classifyHelper, summarize} from '../src/runtime/doctor.mjs';
import {agentPlistPath, installAgent} from '../src/remote/launchd.mjs';
import {enrollDevice} from '../src/remote/device.mjs';
import {UID, fakeLaunchctl} from './fixtures/fake-launchctl.mjs';
import {installRuntime} from '../src/runtime/install.mjs';
import {sweepRun} from '../src/runtime/run-dir.mjs';
import {parsePin, recoveryHint} from '../src/runtime/manifest.mjs';
import {scratch, shortScratch, zipFixture, fixturePin, acceptSignatures} from './fixtures/runtime-fixture.mjs';

const darwin = process.platform === 'darwin';
const HOST = {platform: 'darwin', arch: 'arm64'};
const check = (report, name) => report.checks.find(c => c.name === name);
const noHelper = async () => ({socket: '/x/computeruse.sock', holders: []});
const noSecrets = async () => ({path: '/x/cua-keychain', built: false});
const noAgent = async () => [];

// Under /tmp, outside $TMPDIR, where the scoped sandbox allows a home (the `sandbox` check).
async function installedHome(t) {
  const s = shortScratch();
  t.after(s.cleanup);
  const archive = zipFixture(s.dir);
  const pin = parsePin(fixturePin({sha256: archive.sha256, length: archive.length}));
  const home = join(s.dir, 'home');
  await installRuntime({home, manifest: pin, archivePath: archive.zip, verifySignatures: acceptSignatures, host: HOST});
  return {home, pin};
}

test('a missing runtime fails with install guidance and still reports helper and permission evidence separately', async () => {
  const s = scratch();
  try {
    const report = await inspectRuntime({home: s.dir, host: HOST, inspectHelper: noHelper, inspectSecrets: noSecrets, inspectAgent: noAgent});
    assert.equal(report.ok, false);
    assert.equal(report.runtime, undefined);
    assert.equal(check(report, 'platform').status, 'pass');
    const installed = check(report, 'runtime.installed');
    assert.equal(installed.status, 'fail');
    assert.match(installed.detail, /cua install/);
    assert.equal(check(report, 'runtime.signatures'), undefined, 'no tree to check');
    assert.equal(check(report, 'helper.live').status, 'blocked');
    assert.equal(check(report, 'helper.permissions').status, 'blocked');
  } finally { s.cleanup(); }
});

test('an unsupported platform is an explicit failure and nothing else is inspected', async () => {
  const s = scratch();
  try {
    let helperInspected = false;
    const report = await inspectRuntime({home: s.dir, host: {platform: 'linux', arch: 'x64'}, inspectHelper: async () => { helperInspected = true; }});
    assert.equal(report.ok, false);
    assert.deepEqual(report.checks.map(c => [c.name, c.status]), [['platform', 'fail']]);
    assert.match(report.checks[0].detail, /linux-x64/);
    assert.equal(helperInspected, false);
  } finally { s.cleanup(); }
});

test('a healthy installed runtime names its release and passes every installed-runtime check', {skip: !darwin}, async t => {
  const {home, pin} = await installedHome(t);
  const report = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: noHelper, inspectSecrets: noSecrets, inspectAgent: noAgent});
  assert.equal(report.ok, true);
  assert.equal(report.runtime.release, pin.release);
  assert.equal(report.runtime.root, join(realpathSync(home), 'runtimes', pin.release));
  for (const name of ['platform', 'runtime.installed', 'runtime.files', 'runtime.vendor-manifest', 'runtime.ipc', 'runtime.signatures', 'sandbox'])
    assert.equal(check(report, name)?.status, 'pass', name);
  assert.match(check(report, 'runtime.installed').detail, new RegExp(pin.release));
  // No running helper is not a failure: it is evidence a passive check cannot give.
  assert.equal(check(report, 'helper.live').status, 'blocked');
});

// Issue #36: under the scoped default a home or checkout below $TMPDIR would make node_repl refuse every kernel; the
// doctor says so plainly, while disabled and default are choices it only describes.
test('the sandbox check describes the mode and fails a scoped home whose runtime lies below $TMPDIR, naming the remedy', {skip: !darwin}, async t => {
  const {home, pin} = await installedHome(t);
  const inspect = env => inspectRuntime({home, env, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: noHelper, inspectSecrets: noSecrets, inspectAgent: noAgent});
  const scoped = check(await inspect({TMPDIR: '/private/var/folders/xx/T/'}), 'sandbox');
  assert.equal(scoped.status, 'pass');
  assert.match(scoped.detail, /^CUA_SHIM_SANDBOX=scoped \(the default\): .*run directory and \$TMPDIR.*no network/);
  const conflicted = await inspect({TMPDIR: realpathSync(home)});
  assert.equal(conflicted.ok, false);
  const failed = check(conflicted, 'sandbox');
  assert.equal(failed.status, 'fail');
  assert.match(failed.detail, /\$TMPDIR \(.*\), which contains the trusted code path .*runtimes/);
  assert.match(failed.detail, /cua serve .*refuse/);
  assert.match(failed.detail, /outside \$TMPDIR.*CUA_SHIM_SANDBOX=disabled/);
  for (const [mode, text] of [['disabled', /wherever your account can.*network/], ['default', /denies every write/]]) {
    const row = check(await inspect({TMPDIR: realpathSync(home), CUA_SHIM_SANDBOX: mode}), 'sandbox');
    assert.equal(row.status, 'pass', mode);
    assert.match(row.detail, text, mode);
  }
  const invalid = check(await inspect({CUA_SHIM_SANDBOX: 'managed'}), 'sandbox');
  assert.equal(invalid.status, 'fail');
  assert.match(invalid.detail, /must be scoped, disabled or default/);
});

test('signature and layout damage in the installed tree fail the doctor with the component named', {skip: !darwin}, async t => {
  const {home, pin} = await installedHome(t);
  const rejectNode = async (root, p) => p.signing.components.map(c => ({component: c, valid: c !== 'cua_node/bin/node', detail: c === 'cua_node/bin/node' ? 'invalid signature' : 'ok'}));
  const report = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures: rejectNode, inspectHelper: noHelper, inspectSecrets: noSecrets, inspectAgent: noAgent});
  assert.equal(report.ok, false);
  assert.equal(check(report, 'runtime.signatures').status, 'fail');
  assert.match(check(report, 'runtime.signatures').detail, /cua_node\/bin\/node/);
  rmSync(join(realpathSync(home), 'runtimes', pin.release, 'CodexCLI.app/Contents/MacOS/codex'));
  const damaged = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: noHelper, inspectSecrets: noSecrets, inspectAgent: noAgent});
  assert.equal(damaged.ok, false);
  assert.equal(check(damaged, 'runtime.files').status, 'fail');
  assert.match(check(damaged, 'runtime.files').detail, /codexCli/);
  // A damaged release is never repaired in place, so the advice is the offline recovery, not a bare reinstall.
  const root = join(realpathSync(home), 'runtimes', pin.release);
  assert.ok(check(damaged, 'runtime.files').detail.includes(recoveryHint(root)), check(damaged, 'runtime.files').detail);
  assert.ok(check(report, 'runtime.signatures').detail.includes(recoveryHint(root)), check(report, 'runtime.signatures').detail);
});

test('an incompatible running helper is a diagnosed conflict that fails the doctor', {skip: !darwin}, async t => {
  const {home, pin} = await installedHome(t);
  const incompatible = async () => ({socket: '/x/computeruse.sock', holders: [{pid: 42, executable: '/Old/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService', ipc: ['CodexComputerUseIPC-4']}]});
  const report = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: incompatible, inspectSecrets: noSecrets, inspectAgent: noAgent});
  assert.equal(report.ok, false);
  const helper = check(report, 'helper.live');
  assert.equal(helper.status, 'fail');
  assert.match(helper.detail, /CodexComputerUseIPC-4/);
  assert.match(helper.detail, /not stop/i);
});

test('helper classification: compatible, incompatible, unknown and absent are distinct outcomes', () => {
  const expected = 'CodexComputerUseIPC-5';
  const root = '/h/runtimes/r';
  const pinned = `${root}/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService`;
  const other = '/Users/x/.codex/computer-use/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService';
  const ok = classifyHelper({socket: 's', holders: [{pid: 1, executable: other, ipc: [expected]}]}, {expectedIpc: expected, runtimeRoot: root});
  assert.equal(ok.status, 'pass');
  assert.match(ok.detail, /pid 1/);
  assert.match(ok.detail, /not started by cua|another installation/);
  const ours = classifyHelper({socket: 's', holders: [{pid: 2, executable: pinned, ipc: [expected]}]}, {expectedIpc: expected, runtimeRoot: root});
  assert.equal(ours.status, 'pass');
  assert.match(ours.detail, /pinned runtime/);
  assert.equal(classifyHelper({socket: 's', holders: [{pid: 1, executable: other, ipc: ['CodexComputerUseIPC-6']}]}, {expectedIpc: expected, runtimeRoot: root}).status, 'fail');
  assert.equal(classifyHelper({socket: 's', holders: [{pid: 1, executable: other, ipc: []}]}, {expectedIpc: expected, runtimeRoot: root}).status, 'blocked');
  assert.equal(classifyHelper({socket: 's', holders: []}, {expectedIpc: expected, runtimeRoot: root}).status, 'blocked');
});

test('the doctor refuses a live mode: live probes are separate explicit scripts', async () => {
  await assert.rejects(inspectRuntime({home: '/nonexistent', live: true}), /probe/);
});

test('the human verdict names runtime health only and says live capability is unverified while checks are blocked', () => {
  const report = rows => ({ok: !rows.some(([, status]) => status === 'fail'), checks: rows.map(([name, status]) => ({name, status, detail: ''}))});
  assert.equal(summarize(report([['runtime.files', 'pass']])), 'passive runtime checks pass');
  const blocked = summarize(report([['runtime.files', 'pass'], ['helper.live', 'blocked'], ['helper.permissions', 'blocked']]));
  assert.match(blocked, /^passive runtime checks pass; live capability remains unverified/);
  assert.match(blocked, /helper\.live, helper\.permissions/);
  assert.doesNotMatch(blocked, /healthy|accept/i);
  assert.equal(summarize(report([['runtime.files', 'fail'], ['helper.live', 'blocked']])), 'unhealthy: see FAIL lines');
});

test('a vendor manifest that is JSON null is a failed check, not an exception', {skip: !darwin}, async t => {
  const {home, pin} = await installedHome(t);
  const {writeFileSync} = await import('node:fs');
  writeFileSync(join(realpathSync(home), 'runtimes', pin.release, pin.layout.vendorManifest), 'null');
  const report = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: noHelper, inspectSecrets: noSecrets, inspectAgent: noAgent});
  assert.equal(report.ok, false);
  assert.equal(check(report, 'runtime.vendor-manifest').status, 'fail');
  assert.match(check(report, 'runtime.vendor-manifest').detail, /not a JSON object/);
});

test('Keychain helper checks are reported beside runtime health: blocked leaves ok alone, a broken helper fails', {skip: !darwin}, async t => {
  const {home, pin} = await installedHome(t);
  const common = {home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: noHelper, inspectAgent: noAgent};
  let asked;
  const unbuilt = await inspectRuntime({...common, inspectSecrets: async args => { asked = args; return noSecrets(); }});
  assert.equal(asked.home, home, 'the helper is looked up for the inspected home');
  assert.equal(unbuilt.ok, true);
  assert.equal(check(unbuilt, 'secrets.helper').status, 'blocked');
  assert.match(check(unbuilt, 'secrets.helper').detail, /npm run build:helper/);

  const adhoc = await inspectRuntime({...common, inspectSecrets: async () => ({path: '/x/cua-keychain', built: true, protocols: [1], signature: {valid: true, adhoc: true}})});
  assert.equal(adhoc.ok, true);
  assert.equal(check(adhoc, 'secrets.helper').status, 'pass');
  assert.equal(check(adhoc, 'secrets.signing').status, 'blocked');
  assert.match(summarize(adhoc), /secrets\.signing/);

  const stale = await inspectRuntime({...common, inspectSecrets: async () => ({path: '/x/cua-keychain', built: true, protocols: [0], signature: {valid: true, adhoc: true}})});
  assert.equal(stale.ok, false);
  assert.equal(check(stale, 'secrets.helper').status, 'fail');
});

test('codex.login is capability evidence: pass when logged in, blocked with "run cua login" otherwise, ok unchanged', {skip: !darwin}, async t => {
  const {home, pin} = await installedHome(t);
  const seen = [];
  const common = {home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: noHelper, inspectSecrets: noSecrets, inspectAgent: noAgent};
  const as = state => async args => { seen.push(args); return {state, ...(state === 'logged-in' ? {} : {reason: 'codex login status reports no login'})}; };
  const loggedIn = await inspectRuntime({...common, inspectLogin: as('logged-in')});
  assert.equal(check(loggedIn, 'codex.login').status, 'pass');
  assert.equal(loggedIn.ok, true);
  assert.equal(seen[0].runtime.release, pin.release, 'the check asks the active runtime');
  for (const state of ['not-logged-in', 'unknown']) {
    const report = await inspectRuntime({...common, inspectLogin: as(state)});
    const login = check(report, 'codex.login');
    assert.equal(login.status, 'blocked', state);
    assert.match(login.detail, /run cua login/);
    assert.equal(report.ok, true, 'a missing login never fails runtime health');
  }
});

test('codex.login without a usable runtime is blocked and asks nothing', async () => {
  const s = scratch();
  try {
    let asked = false;
    const report = await inspectRuntime({home: s.dir, host: HOST, inspectHelper: noHelper, inspectSecrets: noSecrets, inspectAgent: noAgent, inspectLogin: async () => { asked = true; }});
    assert.equal(asked, false);
    assert.equal(check(report, 'codex.login').status, 'blocked');
    assert.match(check(report, 'codex.login').detail, /cua install/);
  } finally { s.cleanup(); }
});

test('the default codex.login check runs codex login status with the owned CODEX_HOME and never shows its output', {skip: !darwin}, async t => {
  const {home, pin} = await installedHome(t);
  const {writeFileSync: write, mkdirSync: mkdir, readFileSync: read, chmodSync: chmod} = await import('node:fs');
  const {fakeCodexScript, FAKE_CODEX_SENTINEL} = await import('./fixtures/runtime-fixture.mjs');
  const real = realpathSync(home);
  const cli = join(real, 'runtimes', pin.release, pin.layout.codexCli);
  write(cli, fakeCodexScript({exit: 1}));
  chmod(cli, 0o755);
  const codexHome = join(real, 'state', 'codex');
  mkdir(codexHome, {recursive: true});
  const report = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: noHelper, inspectSecrets: noSecrets, inspectAgent: noAgent});
  assert.equal(check(report, 'codex.login').status, 'blocked');
  assert.doesNotMatch(JSON.stringify(report), new RegExp(FAKE_CODEX_SENTINEL));
  const log = read(join(codexHome, 'fake-codex.log'), 'utf8');
  assert.match(log, /^argv: login status$/m);
  assert.ok(log.includes(`env:CODEX_HOME=${codexHome}\n`));
});

test('codex.login never executes a release binary the same run found untrusted: blocked naming runtime.signatures', {skip: !darwin}, async t => {
  const {home, pin} = await installedHome(t);
  const {writeFileSync: write, mkdirSync: mkdir, existsSync: exists, chmodSync: chmod} = await import('node:fs');
  const {fakeCodexScript} = await import('./fixtures/runtime-fixture.mjs');
  const real = realpathSync(home);
  const cli = join(real, 'runtimes', pin.release, pin.layout.codexCli);
  write(cli, fakeCodexScript({exit: 0}));
  chmod(cli, 0o755);
  const codexHome = join(real, 'state', 'codex');
  mkdir(codexHome, {recursive: true});
  const marker = join(codexHome, 'fake-codex.log');
  const rejectCli = async (root, p) => p.signing.components.map(c => ({component: c, valid: !c.startsWith('CodexCLI.app'), detail: 'invalid signature'}));
  const unchecked = async () => [];
  for (const [name, verifySignatures] of [['codex CLI rejected', rejectCli], ['no component checked', unchecked]]) {
    // The production login probe: had it run, the fake CLI would have written its marker and reported a login.
    const report = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures, inspectHelper: noHelper, inspectSecrets: noSecrets, inspectAgent: noAgent});
    assert.equal(check(report, 'runtime.signatures').status, 'fail', name);
    const login = check(report, 'codex.login');
    assert.equal(login.status, 'blocked', name);
    assert.match(login.detail, /runtime\.signatures failed/, name);
    assert.equal(exists(marker), false, `${name}: the rejected CLI was executed`);
  }
  // With the signatures valid, the same CLI is asked.
  const trusted = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: noHelper, inspectSecrets: noSecrets, inspectAgent: noAgent});
  assert.equal(check(trusted, 'codex.login').status, 'pass');
  assert.equal(exists(marker), true);
});

// Issue #29: doctor sweeps $CUA_HOME/run as `cua serve` does at start and names what it removed; a session it could
// not remove fails the row, a live one and an unrecorded entry are left alone.
test('the run.stale check removes the sessions of gone owners and says so', async t => {
  const s = shortScratch();
  t.after(s.cleanup);
  const run = join(s.dir, 'run');
  const stale = '00000000-0000-4000-8000-000000000001';
  mkdirSync(join(run, stale), {recursive: true});
  writeFileSync(join(run, `${stale}.pid`), '999999\n');
  writeFileSync(join(run, `${process.pid}-live.pid`), `${process.pid}\n`);
  const inspect = extra => inspectRuntime({home: s.dir, host: HOST, inspectHelper: noHelper, inspectSecrets: noSecrets, inspectAgent: noAgent, ...extra});
  const row = check(await inspect({sweep: home => sweepRun(home, {alive: pid => pid === process.pid})}), 'run.stale');
  assert.equal(row.status, 'pass');
  assert.match(row.detail, new RegExp(`removed the leftovers of 1 connection whose cua process is gone \\(${stale}, pid 999999\\); 1 live session left alone$`));
  assert.deepEqual(readdirSync(run), [`${process.pid}-live.pid`]);
  rmSync(join(run, `${process.pid}-live.pid`));
  assert.match(check(await inspect(), 'run.stale').detail, /: nothing stale$/);
  const failed = check(await inspect({sweep: () => ({run, swept: [], live: [], unowned: [], failed: [{session: stale, pid: 7, errors: [`${run}/${stale}: EACCES`]}]})}), 'run.stale');
  assert.equal(failed.status, 'fail');
  assert.match(failed.detail, /could not remove the leftovers of .*EACCES/);
  const unreadable = await inspect({sweep: () => { throw Object.assign(new Error('scandir'), {code: 'EACCES'}); }});
  assert.deepEqual([check(unreadable, 'run.stale').status, check(unreadable, 'helper.live').status], ['fail', 'blocked'], 'the rest of the report still runs');
  assert.match(check(unreadable, 'run.stale').detail, /could not be swept \(EACCES\)/);
});

// E2: the launchd agent rows. A scratch user home holds the LaunchAgents plist, `launchctl` is the fake domain and the
// console reader is injected, so nothing here reads the real launchd domain or the real console.
async function agentSetup(t, {enrol = true, relayUrl, install = null, consoleState = {onConsole: true, locked: false}, env = {}} = {}) {
  const s = scratch();
  t.after(s.cleanup);
  const home = join(s.dir, 'home');
  const userHome = join(s.dir, 'user');
  mkdirSync(userHome);
  const cli = join(s.dir, 'cua.mjs');
  writeFileSync(cli, '');
  if (enrol) enrollDevice({home, ...(relayUrl ? {relayUrl} : {})});
  const launchctl = fakeLaunchctl();
  const launchd = {userHome, uid: UID, launchctl: launchctl.run, settleMs: 1};
  if (install) await installAgent({home, env: {}, node: process.execPath, cli, ...launchd, ...install});
  launchctl.calls.length = 0;
  const readConsole = async () => { if (consoleState instanceof Error) throw consoleState; return consoleState; };
  const rows = async (extra = {}) => Object.fromEntries((await agentChecks({home, env, host: HOST, launchd, checkConsole: readConsole, ...extra})).map(c => [c.name, c]));
  return {home, userHome, cli, launchctl, launchd, rows};
}

test('on a Mac never enrolled, with no job, every agent row reads skip with the way in; neither launchd nor the console is read', async t => {
  let consoleRead = false;
  const {launchctl, rows} = await agentSetup(t, {enrol: false});
  const r = await rows({checkConsole: async () => { consoleRead = true; return {onConsole: true, locked: true}; }});
  assert.deepEqual(Object.keys(r), ['agent.installed', 'agent.running', 'agent.enrolled', 'agent.console']);
  for (const name of Object.keys(r)) {
    assert.equal(r[name].status, 'skip', name);
    assert.match(r[name].detail, /cua remote enroll.*cua agent install/, name);
  }
  assert.deepEqual(launchctl.calls, []);
  assert.equal(consoleRead, false, 'a locked Mac that does no remote control is healthy');
});

test('an enrolled Mac with its agent installed and running passes, naming the plist, program, node, pid and device', async t => {
  const {cli, rows} = await agentSetup(t, {install: {http: '192.168.1.20:7801'}});
  const r = await rows();
  for (const name of ['agent.installed', 'agent.running', 'agent.enrolled', 'agent.console']) assert.equal(r[name].status, 'pass', `${name}: ${r[name].detail}`);
  assert.ok(r['agent.installed'].detail.includes(`node ${process.execPath}`), r['agent.installed'].detail);
  assert.ok(r['agent.installed'].detail.includes(`${cli} agent run --http 192.168.1.20:7801`), r['agent.installed'].detail);
  assert.match(r['agent.running'].detail, /pid 4242/);
  assert.match(r['agent.enrolled'].detail, /^device \S+, local only \(no relay\)$/);
});

test('enrolled but not installed is blocked with the install step; installed but stopped or unloaded fails naming the log', async t => {
  let {rows} = await agentSetup(t);
  let r = await rows();
  assert.deepEqual([r['agent.installed'].status, r['agent.running'].status, r['agent.enrolled'].status], ['blocked', 'blocked', 'pass']);
  assert.match(r['agent.installed'].detail, /cua agent install/);

  const stopped = await agentSetup(t, {install: {http: '127.0.0.1:7801'}});
  stopped.launchctl.running = false;
  stopped.launchctl.lastExit = '1';
  r = await stopped.rows();
  assert.equal(r['agent.running'].status, 'fail');
  assert.match(r['agent.running'].detail, /not running.*last exit code 1/);
  assert.ok(r['agent.running'].detail.includes(join(stopped.home, 'state', 'agent.log')), r['agent.running'].detail);
  stopped.launchctl.loaded = false;
  r = await stopped.rows();
  assert.equal(r['agent.running'].status, 'fail');
  assert.match(r['agent.running'].detail, /not loaded.*cua agent install/);
});

test('agent.installed fails for a plist cua cannot read, a node or program that is gone, or a job that disagrees with the relay enrolment', async t => {
  const broken = await agentSetup(t, {install: {http: '127.0.0.1:7801'}});
  writeFileSync(agentPlistPath(broken.userHome), 'not a plist');
  let r = await broken.rows();
  assert.equal(r['agent.installed'].status, 'fail');
  assert.match(r['agent.installed'].detail, /cua agent install/);
  assert.equal(r['agent.running'].status, 'blocked');

  const moved = await agentSetup(t, {install: {http: '127.0.0.1:7801', node: '/nonexistent/bin/node'}});
  r = await moved.rows();
  assert.equal(r['agent.installed'].status, 'fail');
  assert.match(r['agent.installed'].detail, /\/nonexistent\/bin\/node, is gone.*cua agent install/);

  const relayLater = await agentSetup(t, {install: {http: '127.0.0.1:7801'}});
  enrollDevice({home: relayLater.home, relayUrl: 'wss://relay.example/ws'});
  r = await relayLater.rows();
  assert.equal(r['agent.installed'].status, 'fail');
  assert.match(r['agent.installed'].detail, /relay.*cua agent install/);
  assert.match((await relayLater.rows())['agent.enrolled'].detail, /relay wss:\/\/relay\.example\/ws/);
});

test('agent.enrolled fails for a device record others can read, an unreadable one, or an agent installed on a Mac no longer enrolled', async t => {
  const {home, rows} = await agentSetup(t);
  chmodSync(join(home, 'remote', 'device.json'), 0o644);
  let r = await rows();
  assert.equal(r['agent.enrolled'].status, 'fail');
  assert.match(r['agent.enrolled'].detail, /mode 0644.*chmod 600/);
  writeFileSync(join(home, 'remote', 'device.json'), '{}', {mode: 0o600});
  chmodSync(join(home, 'remote', 'device.json'), 0o600);
  r = await rows();
  assert.equal(r['agent.enrolled'].status, 'fail');
  assert.match(r['agent.enrolled'].detail, /--rotate/);

  enrollDevice({home, rotate: true});
  const file = join(home, 'remote', 'device.json');
  writeFileSync(file, JSON.stringify({...JSON.parse(readFileSync(file, 'utf8')), relayUrl: 'ws://relay.example/ws'}), {mode: 0o600});
  r = await rows();
  assert.equal(r['agent.enrolled'].status, 'fail', 'a relay URL the agent would refuse');
  assert.match(r['agent.enrolled'].detail, /wss:\/\/.*cua remote enroll --relay/);

  const orphan = await agentSetup(t, {install: {http: '127.0.0.1:7801'}});
  rmSync(join(orphan.home, 'remote'), {recursive: true});
  r = await orphan.rows();
  assert.equal(r['agent.enrolled'].status, 'fail');
  assert.match(r['agent.enrolled'].detail, /not enrolled.*cua remote enroll/);
  assert.equal(r['agent.installed'].status, 'pass', 'the job itself is still the one cua wrote');
});

test('agent.console fails while locked or off the console, is blocked when unreadable, and reads skip with the check turned off', async t => {
  const as = async (consoleState, env) => (await (await agentSetup(t, {consoleState, env})).rows())['agent.console'];
  let row = await as({onConsole: true, locked: true});
  assert.equal(row.status, 'fail');
  assert.match(row.detail, /screen is locked/);
  row = await as({onConsole: false, locked: false});
  assert.equal(row.status, 'fail');
  assert.match(row.detail, /not on the console/);
  row = await as(Object.assign(new Error('ioreg exited 1'), {code: 'console_unreadable'}));
  assert.equal(row.status, 'blocked');
  assert.match(row.detail, /console_unreadable/);
  row = await as({onConsole: true, locked: true}, {CUA_AGENT_CONSOLE_CHECK: 'off'});
  assert.equal(row.status, 'skip');
  assert.match(row.detail, /CUA_AGENT_CONSOLE_CHECK=off/);
  row = await as({onConsole: true, locked: false}, {CUA_AGENT_CONSOLE_CHECK: 'maybe'});
  assert.equal(row.status, 'fail');
  assert.match(row.detail, /CUA_AGENT_CONSOLE_CHECK must be on or off/);
});

test('off macOS every agent row reads skip: the launchd agent is macOS-only', async t => {
  const {rows} = await agentSetup(t);
  const r = await rows({host: {platform: 'linux', arch: 'x64'}});
  for (const c of Object.values(r)) assert.equal(c.status, 'skip', c.name);
});

test('doctor reports the agent rows, and skip neither fails ok nor counts as blocked in the verdict', async t => {
  const s = scratch();
  t.after(s.cleanup);
  const injected = [{name: 'agent.installed', status: 'skip', detail: 'not enrolled'}, {name: 'agent.console', status: 'pass', detail: 'ok'}];
  const report = await inspectRuntime({home: s.dir, host: HOST, inspectHelper: noHelper, inspectSecrets: noSecrets,
    inspectAgent: async ({home, env, host}) => { assert.equal(home, s.dir); assert.ok(env); assert.deepEqual(host, HOST); return injected; }});
  for (const row of injected) assert.deepEqual(check(report, row.name), row);
  const rows = [['runtime.files', 'pass'], ['agent.installed', 'skip'], ['helper.live', 'blocked']];
  const summary = summarize({ok: true, checks: rows.map(([name, status]) => ({name, status, detail: ''}))});
  assert.match(summary, /blocked: helper\.live\)$/);
  assert.equal(summarize({ok: true, checks: [{name: 'agent.installed', status: 'skip', detail: ''}]}), 'passive runtime checks pass');
});

test('a plist path doctor cannot read is agent.installed fail with the error code, never a thrown doctor', async t => {
  const {userHome, rows} = await agentSetup(t, {install: {http: '127.0.0.1:7801'}});
  rmSync(agentPlistPath(userHome));
  mkdirSync(agentPlistPath(userHome));
  const r = await rows();
  assert.equal(r['agent.installed'].status, 'fail');
  assert.match(r['agent.installed'].detail, /EISDIR/);
  assert.equal(r['agent.running'].status, 'blocked');
});

test('agent.console follows the installed job\'s CUA_AGENT_CONSOLE_CHECK, not doctor\'s own environment, when a job exists', async t => {
  const locked = {onConsole: true, locked: true};
  // The job turns the check off by hand; doctor's environment leaves it on.
  const off = await agentSetup(t, {install: {http: '127.0.0.1:7801'}, consoleState: locked});
  const plist = agentPlistPath(off.userHome);
  writeFileSync(plist, readFileSync(plist, 'utf8').replace('<key>CUA_SHIM_SURFACES</key>', '<key>CUA_AGENT_CONSOLE_CHECK</key>\n\t\t<string>off</string>\n\t\t<key>CUA_SHIM_SURFACES</key>'));
  let row = (await off.rows())['agent.console'];
  assert.equal(row.status, 'skip');
  assert.match(row.detail, /CUA_AGENT_CONSOLE_CHECK=off/);
  // The job leaves it on; doctor's environment turning it off does not speak for the job.
  const on = await agentSetup(t, {install: {http: '127.0.0.1:7801'}, consoleState: locked, env: {CUA_AGENT_CONSOLE_CHECK: 'off'}});
  row = (await on.rows())['agent.console'];
  assert.equal(row.status, 'fail');
  assert.match(row.detail, /screen is locked/);
  // Enrolled without a job: doctor's environment is all there is.
  const noJob = await agentSetup(t, {consoleState: locked, env: {CUA_AGENT_CONSOLE_CHECK: 'off'}});
  assert.equal((await noJob.rows())['agent.console'].status, 'skip');
});

test('the uid doctor names and reads the console for is the one launchd is asked about', async t => {
  const {rows} = await agentSetup(t, {install: {http: '127.0.0.1:7801'}});
  let asked;
  const r = await rows({checkConsole: async options => { asked = options; return {onConsole: true, locked: false}; }});
  assert.deepEqual(asked, {uid: UID});
  assert.match(r['agent.console'].detail, new RegExp(`uid ${UID}\\)`));
  assert.match(r['agent.running'].detail, new RegExp(`gui/${UID}/`));
});
