import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {rmSync, realpathSync} from 'node:fs';
import {inspectRuntime, classifyHelper, summarize} from '../src/runtime/doctor.mjs';
import {installRuntime} from '../src/runtime/install.mjs';
import {parsePin} from '../src/runtime/manifest.mjs';
import {scratch, zipFixture, fixturePin, acceptSignatures} from './fixtures/runtime-fixture.mjs';

const darwin = process.platform === 'darwin';
const HOST = {platform: 'darwin', arch: 'arm64'};
const check = (report, name) => report.checks.find(c => c.name === name);
const noHelper = async () => ({socket: '/x/computeruse.sock', holders: []});

async function installedHome(t) {
  const s = scratch();
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
    const report = await inspectRuntime({home: s.dir, host: HOST, inspectHelper: noHelper});
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
  const report = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: noHelper});
  assert.equal(report.ok, true);
  assert.equal(report.runtime.release, pin.release);
  assert.equal(report.runtime.root, join(realpathSync(home), 'runtimes', pin.release));
  for (const name of ['platform', 'runtime.installed', 'runtime.files', 'runtime.vendor-manifest', 'runtime.ipc', 'runtime.signatures'])
    assert.equal(check(report, name)?.status, 'pass', name);
  assert.match(check(report, 'runtime.installed').detail, new RegExp(pin.release));
  // No running helper is not a failure: it is evidence a passive check cannot give.
  assert.equal(check(report, 'helper.live').status, 'blocked');
});

test('signature and layout damage in the installed tree fail the doctor with the component named', {skip: !darwin}, async t => {
  const {home, pin} = await installedHome(t);
  const rejectNode = async (root, p) => p.signing.components.map(c => ({component: c, valid: c !== 'cua_node/bin/node', detail: c === 'cua_node/bin/node' ? 'invalid signature' : 'ok'}));
  const report = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures: rejectNode, inspectHelper: noHelper});
  assert.equal(report.ok, false);
  assert.equal(check(report, 'runtime.signatures').status, 'fail');
  assert.match(check(report, 'runtime.signatures').detail, /cua_node\/bin\/node/);
  rmSync(join(realpathSync(home), 'runtimes', pin.release, 'CodexCLI.app/Contents/MacOS/codex'));
  const damaged = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: noHelper});
  assert.equal(damaged.ok, false);
  assert.equal(check(damaged, 'runtime.files').status, 'fail');
  assert.match(check(damaged, 'runtime.files').detail, /codexCli/);
});

test('an incompatible running helper is a diagnosed conflict that fails the doctor', {skip: !darwin}, async t => {
  const {home, pin} = await installedHome(t);
  const incompatible = async () => ({socket: '/x/computeruse.sock', holders: [{pid: 42, executable: '/Old/Codex Computer Use.app/Contents/MacOS/SkyComputerUseService', ipc: ['CodexComputerUseIPC-4']}]});
  const report = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: incompatible});
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
  const report = await inspectRuntime({home, pins: [pin], host: HOST, verifySignatures: acceptSignatures, inspectHelper: noHelper});
  assert.equal(report.ok, false);
  assert.equal(check(report, 'runtime.vendor-manifest').status, 'fail');
  assert.match(check(report, 'runtime.vendor-manifest').detail, /not a JSON object/);
});
