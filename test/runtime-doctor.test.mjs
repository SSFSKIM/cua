import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {mkdirSync, readdirSync, rmSync, realpathSync, writeFileSync} from 'node:fs';
import {inspectRuntime, classifyHelper, summarize} from '../src/runtime/doctor.mjs';
import {installRuntime} from '../src/runtime/install.mjs';
import {sweepRun} from '../src/runtime/run-dir.mjs';
import {parsePin, recoveryHint} from '../src/runtime/manifest.mjs';
import {scratch, shortScratch, zipFixture, fixturePin, acceptSignatures} from './fixtures/runtime-fixture.mjs';

const darwin = process.platform === 'darwin';
const HOST = {platform: 'darwin', arch: 'arm64'};
const check = (report, name) => report.checks.find(c => c.name === name);
const noHelper = async () => ({socket: '/x/computeruse.sock', holders: []});
const noSecrets = async () => ({path: '/x/cua-keychain', built: false});

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
    const report = await inspectRuntime({home: s.dir, host: HOST, inspectHelper: noHelper, inspectSecrets: noSecrets});
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
    const report = await inspectRuntime({home: s.dir, host: {platform: 'linux', arch: 'riscv64'}, inspectHelper: async () => { helperInspected = true; }});
    assert.equal(report.ok, false);
    assert.deepEqual(report.checks.map(c => [c.name, c.status]), [['platform', 'fail']]);
    assert.match(report.checks[0].detail, /linux-riscv64/);
    assert.equal(helperInspected, false);
  } finally { s.cleanup(); }
});

test('a healthy installed runtime names its release and passes every installed-runtime check', {skip: !darwin}, async t => {
  const {home, pin} = await installedHome(t);
  const report = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: noHelper, inspectSecrets: noSecrets});
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
  const inspect = env => inspectRuntime({home, env, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: noHelper, inspectSecrets: noSecrets});
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
  const report = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures: rejectNode, inspectHelper: noHelper, inspectSecrets: noSecrets});
  assert.equal(report.ok, false);
  assert.equal(check(report, 'runtime.signatures').status, 'fail');
  assert.match(check(report, 'runtime.signatures').detail, /cua_node\/bin\/node/);
  rmSync(join(realpathSync(home), 'runtimes', pin.release, 'CodexCLI.app/Contents/MacOS/codex'));
  const damaged = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: noHelper, inspectSecrets: noSecrets});
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
  const report = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: incompatible, inspectSecrets: noSecrets});
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
  const report = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: noHelper, inspectSecrets: noSecrets});
  assert.equal(report.ok, false);
  assert.equal(check(report, 'runtime.vendor-manifest').status, 'fail');
  assert.match(check(report, 'runtime.vendor-manifest').detail, /not a JSON object/);
});

test('Keychain helper checks are reported beside runtime health: blocked leaves ok alone, a broken helper fails', {skip: !darwin}, async t => {
  const {home, pin} = await installedHome(t);
  const common = {home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: noHelper};
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
  const common = {home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: noHelper, inspectSecrets: noSecrets};
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
    const report = await inspectRuntime({home: s.dir, host: HOST, inspectHelper: noHelper, inspectSecrets: noSecrets, inspectLogin: async () => { asked = true; }});
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
  const report = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: noHelper, inspectSecrets: noSecrets});
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
    const report = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures, inspectHelper: noHelper, inspectSecrets: noSecrets});
    assert.equal(check(report, 'runtime.signatures').status, 'fail', name);
    const login = check(report, 'codex.login');
    assert.equal(login.status, 'blocked', name);
    assert.match(login.detail, /runtime\.signatures failed/, name);
    assert.equal(exists(marker), false, `${name}: the rejected CLI was executed`);
  }
  // With the signatures valid, the same CLI is asked.
  const trusted = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: noHelper, inspectSecrets: noSecrets});
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
  const inspect = extra => inspectRuntime({home: s.dir, host: HOST, inspectHelper: noHelper, inspectSecrets: noSecrets, ...extra});
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
