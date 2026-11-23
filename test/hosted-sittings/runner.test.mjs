// The hosted runner's attestation (scripts/hosted-sittings/runner.mjs): the record the runner's setup writes on the
// device, its checks, and what a harness concludes from it beside its controller's environment (meta.hosted).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {assertGithubHosted, hostedRunOf as hostedRunOfAny, readRunnerRecord, runnerKey, runnerProblems, runnerRecord, runnerRecordPath, runnerText, venueFramesOf, vmIdentity} from '../../scripts/hosted-sittings/runner.mjs';

const ENV = {RUNNER_ENVIRONMENT: 'github-hosted', ImageOS: 'macos26', ImageVersion: '20261117.0516.1', GITHUB_RUN_ID: '45144483807', GITHUB_RUN_ATTEMPT: '2'};
const INSTALL = {home: '/Users/runner/Library/Application Support/cua', release: '26.928.40906-darwin-arm64'};
const ENGINE = {bundle: '/Users/runner/Library/Application Support/cua/engine/cua Engine.app', build: '6f874040aa11bb22cc33dd44', engineVersion: '0.2.0'};
// The VM the setup ran on: its platform UUID and boot time, and the setup's own id.
const MACHINE = {platformUuid: '5F2C1A9E-1D2B-4C3D-8E4F-0123456789AB', bootedAt: '2026-11-23T09:58:12.000Z'};
const VM = {id: '3b1f0c8e-7d6a-4e2b-9c1d-5a4b3c2d1e0f', ...MACHINE};
const record = (env = ENV, vm = VM) => runnerRecord(env, {install: INSTALL, engine: ENGINE, vm, now: () => Date.UTC(2026, 10, 23)});
// The harness reads its own VM, the controller's; here it is the setup's unless a test says otherwise.
const hostedRunOf = (r, env, options = {}) => hostedRunOfAny(r, env, {controllerVm: () => MACHINE, ...options});

test('the record names the image, the run and its attempt, the run\'s install and its engine build', () => {
  assert.deepEqual(record(), {kind: 'github-hosted', image: {name: 'macos26', version: '20261117.0516.1'}, run: {id: '45144483807', attempt: '2'},
    install: INSTALL, engine: ENGINE, vm: VM, writtenAt: '2026-11-23T00:00:00.000Z'});
  assert.deepEqual(runnerProblems(record()), []);
  assert.equal(runnerKey(record()), 'macos26 20261117.0516.1, run 45144483807 attempt 2, VM 3b1f0c8e-7d6a-4e2b-9c1d-5a4b3c2d1e0f');
  assert.equal(runnerText(record()), 'GitHub-hosted macos26 20261117.0516.1, run 45144483807 attempt 2, VM 3b1f0c8e-7d6a-4e2b-9c1d-5a4b3c2d1e0f; the run\'s install 26.928.40906-darwin-arm64 at /Users/runner/Library/Application Support/cua; its engine build 6f874040aa11 (cua 0.2.0)');
  assert.equal(runnerText(null), null);
});

test('a record is written only from a GitHub-hosted runner\'s own environment, every field present', () => {
  assert.throws(() => record({...ENV, RUNNER_ENVIRONMENT: 'self-hosted'}), /GitHub-hosted/);
  assert.throws(() => record({...ENV, GITHUB_RUN_ID: undefined}), /run\.id/);
  assert.throws(() => record({...ENV, ImageVersion: ''}), /image\.version/);
  assert.throws(() => runnerRecord(ENV, {install: {...INSTALL, home: 'relative'}, engine: ENGINE}), /install\.home/);
  assert.throws(() => runnerRecord(ENV, {install: INSTALL, engine: {...ENGINE, build: null}}), /engine\.build/);
  assert.match(runnerProblems({kind: 'github-hosted'}).join('; '), /image\.name.*run\.id.*vm\.id/);
  assert.throws(() => record(ENV, {...VM, platformUuid: null}), /vm\.platformUuid/);
});

test('one attempt\'s jobs are several VMs: the VM is the setup\'s own id, so two VMs of one attempt never share a key, and a controller on another VM refuses', () => {
  const other = record(ENV, {...VM, id: '9e8d7c6b-5a49-4382-a1b0-c9d8e7f6a5b4', platformUuid: '0F0F0F0F-1111-2222-3333-444455556666'});
  assert.notEqual(runnerKey(other), runnerKey(record()), 'sittings A and C of one dispatch share the run and its attempt');
  assert.throws(() => hostedRunOf(record(), ENV, {controllerVm: () => ({...MACHINE, platformUuid: '0F0F0F0F-1111-2222-3333-444455556666'})}), /written on another VM/);
  assert.throws(() => hostedRunOf(record(), ENV, {controllerVm: () => ({...MACHINE, bootedAt: '2026-11-23T11:00:00.000Z'})}), /written on another VM/);
  assert.throws(() => hostedRunOf(record(), ENV, {controllerVm: () => null}), /this controller's VM could not be read/);
});

test('the VM is read from the platform UUID and the boot time', () => {
  const answers = {'/usr/sbin/ioreg': '+-o J416cAP  <class IOPlatformExpertDevice>\n    "IOPlatformUUID" = "5F2C1A9E-1D2B-4C3D-8E4F-0123456789AB"\n',
    '/usr/sbin/sysctl': '{ sec = 1795427892, usec = 0 } Mon Nov 23 09:58:12 2026\n'};
  assert.deepEqual(vmIdentity({exec: cmd => answers[cmd]}), MACHINE);
  assert.equal(vmIdentity({exec: () => { throw new Error('no ioreg'); }}), null);
});

test('the guard refuses off a GitHub-hosted macOS runner, naming what it guards', () => {
  assert.throws(() => assertGithubHosted({}, 'darwin', 'the setup'), /^Error: the setup: refused: .*RUNNER_ENVIRONMENT=github-hosted/);
  assert.throws(() => assertGithubHosted(ENV, 'linux', 'the setup'), /macOS/);
  assert.doesNotThrow(() => assertGithubHosted(ENV, 'darwin', 'the setup'));
});

test('meta.hosted: a run is hosted when the device attests this very run and the controller runs on it', () => {
  assert.deepEqual(hostedRunOf(null, {}), {hosted: false, runner: null});
  assert.deepEqual(hostedRunOf(record(), ENV), {hosted: true, runner: record()});
  // The approved paths a harness was given must be the run's install, when it names them.
  assert.deepEqual(hostedRunOf(record(), ENV, {approvedRuntime: INSTALL.home, approvedEngine: ENGINE.bundle}).hosted, true);
});

test('the device reads its record: none, the record, or an unreadable one that is never "not hosted"', () => {
  const home = mkdtempSync(join(tmpdir(), 'hosted-runner-'));
  try {
    assert.equal(readRunnerRecord(home), null);
    mkdirSync(dirname(runnerRecordPath(home)), {recursive: true});
    writeFileSync(runnerRecordPath(home), JSON.stringify(record()));
    assert.deepEqual(readRunnerRecord(home), record());
    writeFileSync(runnerRecordPath(home), '{half');
    assert.deepEqual(readRunnerRecord(home), {error: 'not JSON'});
    assert.throws(() => hostedRunOf(readRunnerRecord(home), ENV), /not one: kind/);
  } finally { rmSync(home, {recursive: true, force: true}); }
});

test('meta.hosted is never guessed: every disagreement between the device and the controller refuses', () => {
  // A controller on a runner drives the runner itself: hosted, and unattested without the device's record.
  assert.deepEqual(hostedRunOf(null, ENV), {hosted: true, runner: null});
  assert.throws(() => hostedRunOf(record(), {}), /this controller is not on one/);
  assert.throws(() => hostedRunOf(record(), {...ENV, GITHUB_RUN_ID: '1'}), /run 45144483807 attempt 2, not this job's run 1 attempt 2/);
  assert.throws(() => hostedRunOf(record(), {...ENV, GITHUB_RUN_ATTEMPT: '3'}), /not this job's run 45144483807 attempt 3/);
  assert.throws(() => hostedRunOf({...record(), image: null}, ENV), /not one: image\.name/);
  assert.throws(() => hostedRunOf(record(), ENV, {approvedRuntime: '/Users/runner/other'}), /--approved-runtime \/Users\/runner\/other is not the run's install/);
  assert.throws(() => hostedRunOf(record(), ENV, {approvedEngine: '/tmp/cua Engine.app'}), /--approved-engine .* is not the run's engine/);
});

// Ruling 1169: the venue setup chose rides in the record, so the device's scenes launch at its frames and every lane
// keeps it as meta.venue, apart from the run's attestation.
test('the venue: kept in the record, handed out as its own block, its frames read by the device; none off a runner', () => {
  const venue = {frames: {chrome: {x: 22, y: 60, width: 800, height: 600}, finder: {x: 22, y: 80, width: 800, height: 520}}, differences: []};
  const withVenue = runnerRecord(ENV, {install: INSTALL, engine: ENGINE, vm: VM, venue, now: () => Date.UTC(2026, 10, 23)});
  assert.deepEqual(withVenue.venue, venue);
  assert.deepEqual(runnerProblems(withVenue), []);
  assert.deepEqual(hostedRunOf(withVenue, ENV), {hosted: true, runner: record(), venue});
  assert.deepEqual(hostedRunOf(record(), ENV), {hosted: true, runner: record()}, 'a record with no venue gives none');
  assert.deepEqual(venueFramesOf(withVenue), venue.frames);
  // A frame that is not one is dropped (that scene keeps its own); no record, or one with no venue, is no venue.
  assert.deepEqual(venueFramesOf({venue: {frames: {chrome: {x: 1, y: 2, width: 0, height: 600}, electron: {x: 'a'}, finder: venue.frames.finder}}}), {finder: venue.frames.finder});
  for (const none of [null, {error: 'not JSON'}, record()]) assert.equal(venueFramesOf(none), null);
});
