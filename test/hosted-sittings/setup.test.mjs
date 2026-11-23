// The runner's setup for a sitting (scripts/hosted-sittings/setup.mjs): in H0's order, the loopback device, the
// harness checkout, the run's install and engine, the system-database rows for the vendor's helper and cua's engine
// before either launches, the relaunch and two-pass approve, then the runner's record the harnesses attest. Every
// command, row and approve is a spy here; nothing runs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hostedSetup} from '../../scripts/hosted-sittings/setup.mjs';
import {CLIENTS} from '../../scripts/hosted-sittings/tcc.mjs';

const HOSTED = {RUNNER_ENVIRONMENT: 'github-hosted', ImageOS: 'macos15', ImageVersion: '20261118.1', GITHUB_RUN_ID: '45144483807', GITHUB_RUN_ATTEMPT: '1', PATH: '/usr/bin'};
const HOME = '/Users/runner';
const CUA_HOME = `${HOME}/Library/Application Support/cua`;
const ENGINE = `${CUA_HOME}/engine/cua Engine.app`;
const SKY = `${CUA_HOME}/runtimes/r1/SkyComputerUseService.app`;
const COMMIT = 'c'.repeat(40);

function spies({fail = null, vendorUp = false, approved = true, missing = []} = {}) {
  const calls = [];
  const exec = (command, args, options = {}) => {
    const line = [command, ...args].join(' ');
    calls.push({kind: 'exec', line, env: options.env});
    if (fail && line.includes(fail)) return {status: 1, stdout: '', stderr: 'no'};
    if (command === 'ssh') return {status: 0, stdout: `${process.version}\n`, stderr: ''};
    if (line.includes('install --json')) return {status: 0, stdout: JSON.stringify({ok: true, release: 'r1'}), stderr: ''};
    return {status: 0, stdout: '', stderr: ''};
  };
  const deps = {
    env: HOSTED, platform: 'darwin', home: HOME, checkout: '/w/cua', commit: COMMIT, exec,
    runtimeOf: home => { calls.push({kind: 'runtime', home}); return {release: 'r1', home, paths: {skyServiceApp: SKY}}; },
    engineOf: () => ENGINE,
    identityOf: () => ({build: 'b'.repeat(40), engineVersion: '0.5.0'}),
    vmOf: () => ({platformUuid: '5F2C1A9E-1D2B-4C3D-8E4F-0123456789AB', bootedAt: '2026-11-23T09:58:12.000Z'}), newId: () => 'setup-1',
    realpath: path => path,
    vendorRunning: app => { calls.push({kind: 'vendor-running', app}); return vendorUp; },
    grant: grants => { calls.push({kind: 'grant', clients: grants.map(g => g.client)}); return {rows: [], missing}; },
    approve: ({home}) => { calls.push({kind: 'approve', home}); return {approved, summary: approved ? 'approved in two passes: pass 1 engine_capture_confirmation, pass 2 approved' : 'not approved: pass 1 engine_capture_confirmation, pass 2 engine_capture_confirmation'}; },
    write: (path, record) => calls.push({kind: 'write', path, record}),
    log: () => {},
  };
  return {calls, deps};
}

test('off a GitHub-hosted runner it refuses before any command, row or approve', async () => {
  for (const [env, platform] of [[{}, 'darwin'], [{RUNNER_ENVIRONMENT: 'self-hosted'}, 'darwin'], [HOSTED, 'linux']]) {
    const {calls, deps} = spies();
    await assert.rejects(hostedSetup({...deps, env, platform}), /refused/);
    assert.deepEqual(calls, []);
  }
});

test('on a runner: the loopback device, the harness checkout, the install and engine, the rows, the approve, then the record', async () => {
  const {calls, deps} = spies();
  const report = await hostedSetup({...deps, engineArchive: '/t/engine.tgz'});
  assert.equal(report.ok, true, report.steps.map(s => `${s.step}: ${s.detail}`).join('\n'));
  assert.deepEqual(report.steps.map(s => s.step), ['loopback', 'harness checkout', 'prepare', 'install', 'engine', 'vendor helper not running', 'vendor rows', 'approve', 'record']);
  const order = calls.map(c => (c.kind === 'exec' ? c.line.split(' ').slice(0, 3).join(' ') : c.kind === 'grant' ? `grant ${c.clients}` : c.kind));
  const at = needle => order.findIndex(o => o.startsWith(needle));
  assert.ok(at('sh scripts/hosted-sittings/loopback.sh') === 0);
  assert.ok(at('ssh') > 0);
  assert.ok(calls.some(c => c.kind === 'exec' && c.line === `ssh -F ${HOME}/.local/share/cua-hosted/ssh/config hosted-macos node -v`), 'the device is reached through its own config only');
  assert.ok(at('node scripts/native-baseline.mjs prepare') > at('git -C'), 'the parity clone is made from the job\'s checkout before prepare');
  assert.ok(at('tar') > at('node bin/cua.mjs install'), 'the engine is unpacked into the run\'s install');
  assert.ok(at('codesign') > at('tar'));
  assert.ok(at(`grant ${CLIENTS.vendor}`) > at('vendor-running'), 'the helper is known not to be running before its rows');
  assert.ok(at('approve') > at(`grant ${CLIENTS.vendor}`), 'both bundles\' rows precede any launch the approve makes');
  assert.equal(at('write'), order.length - 1, 'the record comes last, once the engine is approved');
  const install = calls.find(c => c.kind === 'exec' && c.line.includes('install --json'));
  assert.equal(install.env.CUA_NATIVE_ENGINE, 'vendor');
  assert.equal(install.env.CUA_HOME, undefined, 'the default home, the one the engine directory lives in');
  const {path, record} = calls.at(-1);
  assert.equal(path, `${HOME}/.local/share/cua-hosted/runner.json`);
  assert.deepEqual(record.run, {id: '45144483807', attempt: '1'});
  assert.deepEqual(record.install, {home: CUA_HOME, release: 'r1'});
  assert.deepEqual(record.engine, {bundle: ENGINE, build: 'b'.repeat(40), engineVersion: '0.5.0'});
  assert.deepEqual(record.vm, {id: 'setup-1', platformUuid: '5F2C1A9E-1D2B-4C3D-8E4F-0123456789AB', bootedAt: '2026-11-23T09:58:12.000Z'}, 'the VM the setup ran on, under the setup\'s own id');
  assert.deepEqual(report.approved, {runtime: CUA_HOME, engine: ENGINE});
});

test('without an archive the engine is built on the runner', async () => {
  const {calls, deps} = spies();
  assert.equal((await hostedSetup(deps)).ok, true);
  assert.ok(calls.some(c => c.kind === 'exec' && c.line.includes('bin/cua.mjs engine build --sign adhoc --json')));
  assert.ok(!calls.some(c => c.kind === 'exec' && c.line.startsWith('tar')));
});

test('each step gates the next: a failed one stops the setup with no row, approve or record after it', async () => {
  {
    const {calls, deps} = spies({vendorUp: true});
    const report = await hostedSetup(deps);
    assert.equal(report.ok, false);
    assert.equal(report.steps.at(-1).step, 'vendor helper not running');
    assert.match(report.steps.at(-1).detail, /already running/);
    assert.ok(!calls.some(c => ['grant', 'approve', 'write'].includes(c.kind)));
  }
  {
    const {calls, deps} = spies({approved: false});
    const report = await hostedSetup(deps);
    assert.equal(report.ok, false);
    assert.match(report.steps.at(-1).detail, /not approved/);
    assert.ok(!calls.some(c => c.kind === 'write'));
  }
  {
    const {calls, deps} = spies({missing: ['com.openai.sky.CUAService kTCCServiceAccessibility']});
    const report = await hostedSetup(deps);
    assert.equal(report.steps.at(-1).step, 'vendor rows');
    assert.ok(!calls.some(c => c.kind === 'approve'));
  }
  {
    const {calls, deps} = spies({fail: 'codesign'});
    const report = await hostedSetup({...deps, engineArchive: '/t/engine.tgz'});
    assert.equal(report.steps.at(-1).step, 'engine');
    assert.ok(!calls.some(c => c.kind === 'grant'));
  }
});
