// measure.mjs's engine steps (scripts/spike/engine/measure/engine-control.mjs; the own native engine spec, Interfaces:
// EngineInstall.approveEngine and stopEngine, EngineProtocol status/approve/shutdown; Verification system: every live run
// begins and ends with the stop discipline and refuses unless the checkout's build is the approved one), judged against
// a fake engine (the injected device operations), and engine-device.mjs's one-shot rpc against a fake engine socket.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {approveEngine, stopEngine, engineStatus, buildProblems, assertApprovedBuild, EngineRefusal} from '../scripts/spike/engine/measure/engine-control.mjs';
import {rpc, writeApproved, readApproved, probeCopyDir, main as engineDevice} from '../scripts/spike/engine/measure/engine-device.mjs';
import {engineOps} from '../scripts/spike/engine/measure/device.mjs';
import {startFakeEngine, EngineFailure} from './helpers/fake-engine.mjs';

const BUNDLE = '/Users/u/Library/Application Support/cua/engine/cua Engine.app';
const BUILD = 'b'.repeat(64), IDENTITY = 'A'.repeat(40);

// A fake engine behind the device operations: running or not, its pid, other connections, the grants each approve
// answers, and every operation in order.
function fakeDevice({running = true, connections = 0, approvals = [], busyShutdown = 0, bundlePath = BUNDLE, build = BUILD, approved = null, checkout = BUILD, identity = IDENTITY} = {}) {
  const log = [];
  let pid = running ? 100 : null, nextPid = 200, answers = [...approvals];
  const state = {written: null, approved};
  const ops = {
    log, state,
    rpc(method) {
      log.push(method);
      if (pid === null) return {ok: false, unreachable: 'ENOENT'};
      if (method === 'status') return {ok: true, result: {engineVersion: '0.1.0', build, pid, bundlePath, connections, accessibility: true, screenRecording: false, socket: '/s', canPostHid: false}};
      if (method === 'approve') return {ok: true, result: answers.shift() ?? {accessibility: false, screenRecording: false, captured: false}};
      if (method === 'shutdown') {
        if (busyShutdown > 0) return {ok: false, error: {code: -10005, message: 'busy', errorName: 'busy', connections: busyShutdown}};
        pid = null; return {ok: true, result: {}};
      }
      throw new Error(`unexpected ${method}`);
    },
    bundle: () => { log.push('bundle'); return {bundle: BUNDLE, exists: true, engineVersion: '0.1.0', build, identity}; },
    approved: () => { log.push('approved'); return state.approved; },
    writeApproved: record => { log.push('writeApproved'); state.written = record; state.approved = record; return {written: '/x/approved.json'}; },
    launch: ({plain = false} = {}) => { log.push(plain ? 'launch-plain' : 'launch'); pid = nextPid++; return {launched: true}; },
    checkoutBuild: () => { log.push('checkoutBuild'); return {build: checkout, engineVersion: '0.1.0'}; },
  };
  return ops;
}
const fast = {sleep: async () => {}, now: (() => { let t = 0; return () => (t += 50); })()};
const confirmYes = async () => true;

test('approve refuses while another connection is open, before sending approve', async () => {
  const ops = fakeDevice({connections: 2});
  await assert.rejects(approveEngine(ops, {confirm: confirmYes, log: () => {}, ...fast}), error => error instanceof EngineRefusal && /2 other connection/.test(error.message));
  assert.ok(!ops.log.includes('approve') && !ops.log.includes('shutdown'));
});

test('approve runs the loop: approve, the console confirmation, shutdown, open -n -g -a, status, approve again, and on captured writes approved.json', async () => {
  const ops = fakeDevice({approvals: [{accessibility: true, screenRecording: false, captured: false}, {accessibility: true, screenRecording: true, captured: true}]});
  const prompts = [];
  const out = await approveEngine(ops, {confirm: async message => { prompts.push(message); return true; }, log: () => {}, ...fast, now: () => Date.parse('2026-10-18T12:00:00Z')});
  assert.equal(out.approved, true);
  assert.deepEqual(ops.state.written, {build: BUILD, identity: IDENTITY, approvedAt: '2026-10-18T12:00:00.000Z'});
  assert.equal(prompts.length, 1);
  const order = ops.log.filter(step => ['approve', 'shutdown', 'launch', 'writeApproved'].includes(step));
  assert.deepEqual(order, ['approve', 'shutdown', 'launch', 'approve', 'writeApproved']);
  assert.equal(out.first.screenRecording, false);
  assert.equal(out.observedBeforeRelaunch.screenRecording, false, 'probe (f): what the running engine saw before the relaunch');
  assert.notEqual(out.relaunchedPid, 100);
});

test('approve launches a stopped engine with open -n -g -a before the first approve', async () => {
  const ops = fakeDevice({running: false, approvals: [{accessibility: true, screenRecording: true, captured: true}, {accessibility: true, screenRecording: true, captured: true}]});
  const out = await approveEngine(ops, {confirm: confirmYes, log: () => {}, ...fast});
  assert.equal(out.approved, true);
  assert.equal(ops.log.indexOf('launch') < ops.log.indexOf('approve'), true);
});

test('approve without the operator\'s confirmation stops before shutdown and writes nothing', async () => {
  const ops = fakeDevice({approvals: [{accessibility: true, screenRecording: false, captured: false}]});
  const out = await approveEngine(ops, {confirm: async () => false, log: () => {}, ...fast});
  assert.equal(out.approved, false);
  assert.match(out.reason, /confirm/);
  assert.ok(!ops.log.includes('shutdown') && !ops.log.includes('writeApproved'));
});

test('approve writes nothing when the second approve does not capture', async () => {
  const ops = fakeDevice({approvals: [{accessibility: true, screenRecording: false, captured: false}, {accessibility: true, screenRecording: false, captured: false}]});
  const out = await approveEngine(ops, {confirm: confirmYes, log: () => {}, ...fast});
  assert.equal(out.approved, false);
  assert.equal(ops.state.written, null);
  assert.match(out.reason, /captured/);
});

test('approve refuses on a busy shutdown, naming the connections, and does not relaunch', async () => {
  const ops = fakeDevice({busyShutdown: 3, approvals: [{accessibility: true, screenRecording: true, captured: false}]});
  await assert.rejects(approveEngine(ops, {confirm: confirmYes, log: () => {}, ...fast}), error => error instanceof EngineRefusal && /busy: 3 other connection/.test(error.message));
  assert.ok(!ops.log.includes('launch'));
});

test('approve refuses an engine that answers from another bundle or another build', async () => {
  for (const ops of [fakeDevice({bundlePath: '/elsewhere/cua Engine.app'})]) {
    await assert.rejects(approveEngine(ops, {confirm: confirmYes, log: () => {}, ...fast}), /another copy/);
    assert.ok(!ops.log.includes('approve'));
  }
  const stale = fakeDevice();
  stale.rpc = (orig => method => (method === 'status' ? {ok: true, result: {...orig(method).result, build: 'other'}} : orig(method)))(stale.rpc.bind(stale));
  await assert.rejects(approveEngine(stale, {confirm: confirmYes, log: () => {}, ...fast}), /build/);
});

test('approve --dry-run reads status and the bundle and sends no approve, shutdown or launch', async () => {
  for (const running of [true, false]) {
    const ops = fakeDevice({running});
    const out = await approveEngine(ops, {dryRun: true, confirm: () => assert.fail('no prompt in a dry run'), log: () => {}, ...fast});
    assert.equal(out.dryRun, true);
    assert.equal(out.running, running);
    assert.ok(!ops.log.some(step => ['approve', 'shutdown', 'launch', 'launch-plain', 'writeApproved'].includes(step)), ops.log.join());
  }
});

test('stop: nothing running is nothing to do; a running engine gets shutdown and is waited out; busy refuses naming the connections', async () => {
  const idle = fakeDevice({running: false});
  assert.deepEqual(await stopEngine(idle, fast), {wasRunning: false});
  const running = fakeDevice();
  const out = await stopEngine(running, fast);
  assert.equal(out.wasRunning, true);
  assert.equal(out.pid, 100);
  assert.deepEqual(running.log.filter(s => s !== 'bundle'), ['status', 'shutdown', 'status']);
  const busy = fakeDevice({connections: 1});
  await assert.rejects(stopEngine(busy, fast), error => error instanceof EngineRefusal && /1 other connection/.test(error.message));
  assert.ok(!busy.log.includes('shutdown'), 'status.connections > 0 refuses before shutdown');
  const raced = fakeDevice({busyShutdown: 2});
  await assert.rejects(stopEngine(raced, fast), /busy: 2 other connection/);
  const dry = fakeDevice();
  const planned = await stopEngine(dry, {...fast, dryRun: true});
  assert.equal(planned.dryRun, true);
  assert.ok(!dry.log.includes('shutdown'));
});

test('the build gate refuses unless the checkout, the bundle and approved.json name one build and the bundle\'s identity is the approved one', async () => {
  const approved = {build: BUILD, identity: IDENTITY, approvedAt: 't'};
  assert.deepEqual(buildProblems({bundle: {exists: true, build: BUILD, identity: IDENTITY}, approved, checkout: {build: BUILD}}), []);
  assert.match(buildProblems({bundle: {exists: true, build: BUILD, identity: IDENTITY}, approved: null, checkout: {build: BUILD}}).join(), /no approved\.json/);
  assert.match(buildProblems({bundle: {exists: true, build: BUILD, identity: IDENTITY}, approved, checkout: {build: 'c'.repeat(64)}}).join(), /checkout's build cccccccccccc is not the approved build bbbbbbbbbbbb/);
  assert.match(buildProblems({bundle: {exists: true, build: 'd'.repeat(64), identity: IDENTITY}, approved, checkout: {build: BUILD}}).join(), /pending/);
  assert.match(buildProblems({bundle: {exists: true, build: BUILD, identity: 'adhoc'}, approved, checkout: {build: BUILD}}).join(), /identity/);
  assert.match(buildProblems({bundle: {exists: false}, approved, checkout: {build: BUILD}}).join(), /no engine bundle/);
  await assert.rejects(assertApprovedBuild(fakeDevice({checkout: 'e'.repeat(64), approved})), error => error instanceof EngineRefusal && /checkout's build/.test(error.message));
  const ok = await assertApprovedBuild(fakeDevice({approved}));
  assert.equal(ok.build, BUILD);
});

test('engineStatus reports the running engine, the bundle, approved.json and whether the bundle is the approved one', async () => {
  const approved = {build: BUILD, identity: IDENTITY, approvedAt: 't'};
  const up = await engineStatus(fakeDevice({approved}));
  assert.equal(up.running, true);
  assert.equal(up.installed, true);
  const down = await engineStatus(fakeDevice({running: false}));
  assert.equal(down.running, false);
  assert.equal(down.installed, false);
});

test('engine-device rpc: one request per connection; an error carries busy\'s connections; no engine is unreachable', async t => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'cua-measure-rpc-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const socket = join(dir, 'engine.sock');
  assert.deepEqual(await rpc(socket, 'status'), {ok: false, unreachable: 'ENOENT'});
  await startFakeEngine(t, socket, {handlers: {
    status: () => ({connections: 0, pid: 7}),
    shutdown: () => { throw new EngineFailure(-10005, 'busy', 'busy', {connections: 2}); },
  }});
  assert.deepEqual(await rpc(socket, 'status'), {ok: true, result: {connections: 0, pid: 7}});
  const busy = await rpc(socket, 'shutdown');
  assert.equal(busy.ok, false);
  assert.equal(busy.error.errorName, 'busy');
  assert.equal(busy.error.connections, 2);
});

test('engine-device writes approved.json beside the bundle with exactly build, identity and approvedAt, mode 0600', t => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'cua-measure-approved-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const bundle = join(dir, 'cua Engine.app');
  assert.equal(readApproved(bundle), null);
  writeApproved(bundle, {build: BUILD, identity: IDENTITY, approvedAt: '2026-10-18T12:00:00.000Z', extra: 'dropped'});
  assert.deepEqual(readApproved(bundle), {build: BUILD, identity: IDENTITY, approvedAt: '2026-10-18T12:00:00.000Z'});
  assert.equal(fs.statSync(join(dir, 'approved.json')).mode & 0o777, 0o600);
  assert.throws(() => writeApproved(bundle, {build: BUILD}), /needs/);
});

test('a probe copy may live only in an engine-probe-* directory beside the approved engine\'s directory', () => {
  assert.equal(probeCopyDir(BUNDLE, '/Users/u/Library/Application Support/cua/engine-probe-c'), '/Users/u/Library/Application Support/cua/engine-probe-c');
  for (const bad of ['/Users/u/Library/Application Support/cua/engine', '/tmp/engine-probe-c', '/Users/u/Library/Application Support/cua/engine-probe-../x'])
    assert.throws(() => probeCopyDir(BUNDLE, bad), /engine-probe/);
});

test('engine-device rpc sends the two spike probes, probe_tap and probe_spike, and refuses an execute', async t => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'cua-measure-probe-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const bundle = join(dir, 'cua Engine.app');
  const {received} = await startFakeEngine(t, join(dir, 'engine.sock'), {handlers: {
    probe_spike: params => ({op: params.op, listed: false, axError: -25205}),
    probe_tap: () => { throw new EngineFailure(-10005, 'The active event tap could not be created (listen preflight not granted, post preflight granted)', 'tapNotCreated', {mode: 'active', listenPreflight: false, postPreflight: true}); },
  }});
  assert.deepEqual(await engineDevice(['rpc', 'probe_spike', JSON.stringify({op: 'activationPoint', app: 'com.apple.TextEdit'}), '--engine', bundle]),
    {ok: true, result: {op: 'activationPoint', listed: false, axError: -25205}});
  const tap = await engineDevice(['rpc', 'probe_tap', JSON.stringify({op: 'start', app: 'com.apple.TextEdit', mode: 'active'}), '--engine', bundle]);
  assert.equal(tap.ok, false);
  assert.deepEqual([tap.error.errorName, tap.error.mode, tap.error.listenPreflight, tap.error.postPreflight], ['tapNotCreated', 'active', false, true]);
  assert.deepEqual(received.map(r => [r.method, r.params]), [
    ['probe_spike', {op: 'activationPoint', app: 'com.apple.TextEdit'}],
    ['probe_tap', {op: 'start', app: 'com.apple.TextEdit', mode: 'active'}],
  ]);
  await assert.rejects(engineDevice(['rpc', 'execute', '{}', '--engine', bundle]), /rpc takes ping, status, approve, shutdown, probe_tap, probe_spike/);
});

// engineOps over a shell answering as engine-device.mjs prints on the device; -> {ops, sent: [[method, params]]}.
function opsAnswering(answer) {
  const sent = [];
  const shell = script => {
    const [, method, params] = script.match(/'rpc' '(\w+)' '(\{.*\})'/);
    sent.push([method, JSON.parse(params)]);
    return JSON.stringify(typeof answer === 'function' ? answer(method) : answer) + '\n';
  };
  return {ops: engineOps({node: 'node'}, shell), sent};
}

test('engineOps.probeSpike sends {op, ...extra} and answers the engine\'s result out of the envelope', () => {
  const result = {op: 'selection', role: 'AXTextArea', range: {location: 3, length: 0}, axError: 0, setError: 0};
  const {ops, sent} = opsAnswering({ok: true, result});
  assert.deepEqual(ops.probeSpike('selection', {app: 'com.apple.TextEdit', set: {location: 3, length: 0}}), result);
  assert.deepEqual(sent, [['probe_spike', {op: 'selection', app: 'com.apple.TextEdit', set: {location: 3, length: 0}}]]);
});

test('a probe refusal is thrown with its errorName, code and sentence and its other members as data; probeTap the same', () => {
  const report = {believedBefore: false, activationRan: true, deactivationPosted: true};
  const {ops} = opsAnswering(method => method === 'probe_spike'
    ? {ok: false, error: {code: -10005, errorName: 'activationFailed', message: 'The app could not be prepared for input: x.', probe: report}}
    : {ok: false, error: {code: -10005, errorName: 'tapNotCreated', message: 'The active event tap could not be created (listen preflight not granted, post preflight granted)', mode: 'active', listenPreflight: false, postPreflight: true}});
  assert.throws(() => ops.probeSpike('activate', {app: 'a'}), error => {
    assert.equal(error.errorName, 'activationFailed');
    assert.equal(error.code, -10005);
    assert.equal(error.message, 'The app could not be prepared for input: x.');
    assert.deepEqual(error.data, {probe: report});
    return true;
  });
  assert.throws(() => ops.probeTap('start', {app: 'a', seconds: 30, mode: 'active'}), error => {
    assert.equal(error.errorName, 'tapNotCreated');
    assert.match(error.message, /listen preflight not granted, post preflight granted/);
    assert.deepEqual(error.data, {mode: 'active', listenPreflight: false, postPreflight: true});
    return true;
  });
});

test('an unreachable engine is thrown with the reason and no errorName', () => {
  const {ops} = opsAnswering({ok: false, unreachable: 'ENOENT'});
  assert.throws(() => ops.probeSpike('activationPoint', {app: 'a'}), error => {
    assert.equal(error.message, 'the engine is unreachable (ENOENT)');
    assert.equal(error.errorName, null);
    assert.deepEqual(error.data, {});
    return true;
  });
});
