// EngineInstall (src/runtime/engine.mjs; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Interfaces
// "EngineInstall", "Install, signing and permissions", the Decision Log's "M1b pre-flight" items 1-3): buildEngine's
// staged build, its stop-then-two-renames move into the approved location and pending.json; the approve loop with the
// by-hand grant steps, the relaunch, the capture and its confirmation watch, then approved.json; status, stop and the
// approved bundle. The engine directory is a temp directory, the engine a fake on its socket, and swift, codesign, open,
// launchctl and replayd's log are fakes: nothing is built, signed, launched or prompted here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {PassThrough} from 'node:stream';
import {shortScratch} from './fixtures/runtime-fixture.mjs';
import {EngineFailure, startFakeEngine} from './helpers/fake-engine.mjs';
import {CERT_SHA1, CODESIGN_TIMED_OUT, NAME, fakeCodesignRead, markSigned} from './helpers/fake-codesign.mjs';
const CODESIGN_TIMED_OUT_READ = () => CODESIGN_TIMED_OUT;
import {BUNDLE_NAME, engineBuild, infoPlist} from '../src/runtime/engine-bundle.mjs';
import {approveEngine, buildEngine, CAPTURE_ALERT_PREDICATE, engineStatus, installedEngine, lineReader, stopEngine, watchCaptureAlerts} from '../src/runtime/engine.mjs';
import {main} from '../src/cli.mjs';

const OLD_BUILD = 'b'.repeat(64);

// A fake native/engine tree (so `build` is computed from it) and a home whose engine.json names the identity.
function world(t, {identity = CERT_SHA1, engineAnswers = {}} = {}) {
  const s = shortScratch('cua-eng-');
  t.after(s.cleanup);
  const home = s.dir;
  const dir = join(home, 'engine');
  const source = join(home, 'src');
  mkdirSync(join(source, 'Sources', 'Engine'), {recursive: true});
  writeFileSync(join(source, 'Package.swift'), '// swift-tools-version:6.0\n');
  writeFileSync(join(source, 'Sources', 'Engine', 'Version.swift'), 'let engineVersion = "9.9.9"\n');
  if (identity) {
    mkdirSync(join(home, '.config', 'cua'), {recursive: true});
    writeFileSync(join(home, '.config', 'cua', 'engine.json'), JSON.stringify({signingIdentity: identity}));
  }
  const bundle = join(dir, BUNDLE_NAME);
  const socket = join(dir, 'engine.sock');
  const calls = [];
  const logs = [];
  const engines = [];
  let nextPid = 100;
  let clock = 0;
  // The engine's grants and connections as the fakes answer them; `onApprove` and `onStatus` may change them.
  const state = {accessibility: true, screenRecording: true, inputMonitoring: true, connections: 0, captured: true, busyOnShutdown: false, ...engineAnswers};

  async function startEngine() {
    const pid = nextPid++;
    const plist = readFileSync(join(bundle, 'Contents', 'Info.plist'), 'utf8');
    const build = /<key>CUAEngineBuild<\/key>\s*<string>([^<]*)</.exec(plist)[1];
    const engine = {pid, received: [], stopped: false};
    const fake = await startFakeEngine(t, socket, {identity: {engineVersion: '9.9.9', build}, handlers: {
      status: () => { state.onStatus?.(state); return {engineVersion: '9.9.9', build, accessibility: state.accessibility, screenRecording: state.screenRecording,
        inputMonitoring: state.inputMonitoring, canPostHid: true, socket, pid, bundlePath: state.bundlePath ?? bundle, connections: state.connections}; },
      approve: () => { order.push('approve'); state.onApprove?.(state, engine); return {accessibility: state.accessibility, screenRecording: state.screenRecording, captured: state.accessibility && state.screenRecording && state.captured}; },
      shutdown: () => {
        if (state.connections > 0 || state.busyOnShutdown) throw new EngineFailure(-10005, 'busy', 'busy', {connections: state.connections || 1});
        setImmediate(() => { engine.stopped = true; fake.stop(); });
        return {};
      },
    }});
    engine.received = fake.received;
    engines.push(engine);
    return engine;
  }

  const run = async (file, args) => {
    calls.push([file, ...args]);
    if (file === 'swift') {
      if (state.swift) return state.swift(args);
      const scratchPath = args[args.indexOf('--scratch-path') + 1];
      mkdirSync(join(scratchPath, 'release'), {recursive: true});
      writeFileSync(join(scratchPath, 'release', 'cua-engine'), '#!/bin/sh\n');
      return {code: 0, stdout: 'Build complete!\n', stderr: ''};
    }
    if (file === '/bin/launchctl' && args[0] === 'managername') return {code: 0, stdout: 'Aqua\n', stderr: ''};
    if (file === '/usr/bin/codesign' && args[0] === '--force') { markSigned(args.at(-1), args[2] === '-' ? 'adhoc' : 'identity'); return {code: 0, stdout: '', stderr: ''}; }
    if (file === '/usr/bin/codesign' && args[0] === '--verify') return {code: 0, stdout: '', stderr: ''};
    if (file === '/usr/bin/open') {
      assert.deepEqual(args, ['-n', '-g', '-a', bundle]);
      await startEngine();
      return {code: 0, stdout: '', stderr: ''};
    }
    throw new Error(`unexpected ${file} ${args.join(' ')}`);
  };

  // The operator at the terminal: answers from `state.lines` (a line, or null for no terminal), counting the questions.
  const operator = {asked: 0, next() { operator.asked++; const lines = state.lines ?? []; return Promise.resolve(lines.length ? lines.shift() : null); }};
  // The capture watch: `alerts` lists, per watch in order, the SCAlert lines it sees; `order` records every watch start
  // and stop and every approve the engine answers, so a test can check that each approve falls inside a watch.
  const order = [];
  const watcher = {started: 0, alerts: [], ready: true, intact: true};
  const watchCaptureAlerts = () => {
    const index = watcher.started++;
    order.push('watch');
    return {ready: Promise.resolve(watcher.ready), stop: async () => { order.push('stop'); return {alerts: watcher.alerts[index] ?? 0, intact: watcher.intact}; }};
  };

  const deps = {dir, env: {HOME: home}, sourceRoot: source, run, runSync: fakeCodesignRead, log: line => logs.push(line), operator, watchCaptureAlerts,
    sleep: async ms => { clock += ms; await new Promise(resolve => setImmediate(resolve)); }, now: () => clock};

  // A bundle at the approved location, signed (`kind`), with the given build, optionally approved.
  function placeBundle({build = OLD_BUILD, kind = 'identity', approved = false} = {}) {
    mkdirSync(join(bundle, 'Contents', 'MacOS'), {recursive: true});
    writeFileSync(join(bundle, 'Contents', 'Info.plist'), infoPlist({version: '9.9.9', build}));
    if (kind) markSigned(bundle, kind);
    if (approved) writeFileSync(join(dir, 'approved.json'), JSON.stringify({build, identity: kind === 'adhoc' ? 'adhoc' : CERT_SHA1, approvedAt: '2026-10-20T00:00:00.000Z'}));
  }
  const checkoutBuild = () => engineBuild({sourceRoot: source});
  const json = name => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  const plistBuild = () => /<key>CUAEngineBuild<\/key>\s*<string>([^<]*)</.exec(readFileSync(join(bundle, 'Contents', 'Info.plist'), 'utf8'))[1];
  return {home, dir, bundle, socket, deps, state, calls, logs, engines, operator, watcher, order, startEngine, placeBundle, checkoutBuild, json, plistBuild};
}

const noIdentity = (value, label) => {
  const text = JSON.stringify(value);
  assert.ok(!text.includes(CERT_SHA1) && !text.includes(NAME), `${label} carries no identity`);
};

// ---- buildEngine ----

test('buildEngine refuses without a configured identity before building anything', async t => {
  const w = world(t, {identity: null});
  await assert.rejects(buildEngine(w.deps), {code: 'engine_identity_missing'});
  assert.deepEqual(w.calls, []);
  assert.ok(!existsSync(w.bundle));
});

test('a first build compiles into the engine directory\'s scratch, assembles and signs in staging, moves the bundle into place and writes pending.json', async t => {
  const w = world(t);
  const result = await buildEngine(w.deps);
  const build = w.checkoutBuild();
  assert.deepEqual(w.calls[0], ['swift', 'build', '-c', 'release', '--package-path', join(w.home, 'src'), '--scratch-path', join(w.dir, 'build')]);
  const sign = w.calls.find(c => c[0] === '/usr/bin/codesign' && c[1] === '--force');
  assert.equal(sign.at(-1), join(w.dir, 'staging', BUNDLE_NAME), 'signed in staging, before the move');
  assert.equal(w.plistBuild(), build);
  assert.ok(!existsSync(join(w.dir, 'staging', BUNDLE_NAME)));
  assert.equal(statSync(w.dir).mode & 0o777, 0o700);
  const pending = w.json('pending.json');
  assert.deepEqual(Object.keys(pending).sort(), ['build', 'builtAt', 'identity']);
  assert.equal(pending.build, build);
  assert.equal(pending.identity, CERT_SHA1, 'the device state records the leaf\'s SHA-1');
  assert.equal(statSync(join(w.dir, 'pending.json')).mode & 0o777, 0o600);
  assert.ok(!existsSync(join(w.dir, 'approved.json')));
  assert.deepEqual(result, {bundlePath: w.bundle, engineVersion: '9.9.9', build, signature: {kind: 'identity', identityMatches: true}, changed: true, stopped: null});
  noIdentity(result, 'the result');
  noIdentity(w.logs, 'the log');
});

test('a rebuild stops the running engine with shutdown, moves the old bundle aside and the new one in, and leaves approved.json alone', async t => {
  const w = world(t);
  w.placeBundle({approved: true});
  const engine = await w.startEngine();
  const result = await buildEngine(w.deps);
  assert.ok(engine.received.some(r => r.method === 'shutdown'));
  assert.equal(engine.stopped, true);
  assert.deepEqual(result.stopped, {pid: engine.pid});
  assert.equal(w.plistBuild(), w.checkoutBuild());
  assert.match(readFileSync(join(w.dir, 'previous', 'Contents', 'Info.plist'), 'utf8'), new RegExp(OLD_BUILD));
  assert.equal(w.json('approved.json').build, OLD_BUILD, 'approval is the approve step\'s alone');
  assert.equal(w.json('pending.json').build, w.checkoutBuild());
  assert.equal(installedEngine({dir: w.dir, runSync: fakeCodesignRead}), null, 'the new build is pending, not installed');
});

for (const [why, answers] of [['status counts another connection', {connections: 1}], ['shutdown itself answers busy', {busyOnShutdown: true}]]) {
  test(`a busy engine (${why}) fails the build visibly and leaves the bundle, approved.json and the engine untouched, the staged bundle discarded`, async t => {
    const w = world(t, {engineAnswers: answers});
    w.placeBundle({approved: true});
    const engine = await w.startEngine();
    await assert.rejects(buildEngine(w.deps), error => {
      assert.equal(error.code, 'engine_busy');
      assert.match(error.message, /1 other connection/);
      noIdentity({m: error.message, h: error.hint}, 'the refusal');
      return true;
    });
    assert.equal(engine.stopped, false);
    assert.equal(w.plistBuild(), OLD_BUILD);
    assert.equal(w.json('approved.json').build, OLD_BUILD);
    assert.ok(!existsSync(join(w.dir, 'pending.json')));
    assert.ok(!existsSync(join(w.dir, 'staging', BUNDLE_NAME)));
    assert.ok(!existsSync(join(w.dir, 'previous')));
  });
}

test('a bundle whose build and signature already match is left as it is: nothing is built or stopped', async t => {
  const w = world(t);
  w.placeBundle({build: w.checkoutBuild(), approved: true});
  const engine = await w.startEngine();
  const result = await buildEngine(w.deps);
  assert.equal(result.changed, false);
  assert.deepEqual(result.signature, {kind: 'identity', identityMatches: true});
  assert.ok(!w.calls.some(c => c[0] === 'swift'));
  assert.ok(!engine.received.some(r => r.method === 'shutdown'));
});

test('the same build under a signature that is not the configured identity is rebuilt (the second reinstall trigger)', async t => {
  const w = world(t);
  w.placeBundle({build: w.checkoutBuild(), kind: 'adhoc'});
  const result = await buildEngine(w.deps);
  assert.equal(result.changed, true);
  assert.deepEqual(result.signature, {kind: 'identity', identityMatches: true});
});

test('a signature codesign cannot read fails closed in build: the same build is rebuilt, and an unreadable staged signature fails before the move', async t => {
  const w = world(t);
  w.placeBundle({build: w.checkoutBuild(), approved: true});
  const result = await buildEngine({...w.deps, runSync: (file, args) => (args.at(-1) === w.bundle ? CODESIGN_TIMED_OUT : fakeCodesignRead(file, args))});
  assert.equal(result.changed, true, 'an installed bundle whose signature cannot be read is not taken as signed as asked');

  const fresh = world(t);
  fresh.placeBundle({approved: true});
  await assert.rejects(buildEngine({...fresh.deps, runSync: () => CODESIGN_TIMED_OUT}), error => {
    assert.equal(error.code, 'engine_sign_failed');
    assert.match(error.message, /could not be read after signing \(codesign did not finish within 60 s/);
    return true;
  });
  assert.equal(fresh.plistBuild(), OLD_BUILD, 'the approved bundle is untouched');
  assert.ok(!existsSync(join(fresh.dir, 'pending.json')));
  assert.ok(!existsSync(join(fresh.dir, 'staging', BUNDLE_NAME)));
});

test('cua engine build waits for the GUI-session sign as long as --sign-wait or CUA_SIGN_WAIT_MS says (the flag first), 45 s by default', {skip: process.platform !== 'darwin' && 'the engine commands are macOS only'}, async t => {
  // Over SSH (launchd's manager is not Aqua) with a job that never answers: the refusal names the bound the wait used.
  const waited = async (args, env = {}) => {
    const w = world(t);
    const run = async (file, rest) => {
      if (file !== '/bin/launchctl') return w.deps.run(file, rest);
      w.calls.push([file, ...rest]);
      return {code: 0, stdout: rest[0] === 'managername' ? 'Background\n' : '', stderr: ''};
    };
    // The command's own lines are strings; the test runner's reports, which share these streams, pass through.
    const out = [];
    const keep = (stream, into) => { const write = stream.write.bind(stream); t.mock.method(stream, 'write', (chunk, ...rest) => (typeof chunk === 'string' ? (into?.push(chunk), true) : write(chunk, ...rest))); };
    keep(process.stdout, out);
    keep(process.stderr);
    const code = await main(['engine', 'build', ...args, '--json'], {...w.deps, run, env: {...w.deps.env, ...env}, signOptions: {tmp: w.home}});
    t.mock.restoreAll();
    assert.equal(code, 1);
    const {error} = JSON.parse(out.join(''));
    assert.equal(error.code, 'engine_sign_prompt_waiting');
    assert.ok(w.calls.some(c => c[0] === '/bin/launchctl' && c[1] === 'bootout'), 'the job is booted out');
    return /within (\d+) s/.exec(error.message)[1];
  };
  assert.equal(await waited([]), '45');
  assert.equal(await waited([], {CUA_SIGN_WAIT_MS: '90000'}), '90');
  assert.equal(await waited(['--sign-wait', '120000'], {CUA_SIGN_WAIT_MS: '90000'}), '120');
});

test('--sign adhoc needs no identity, signs with "-", and records adhoc', async t => {
  const w = world(t, {identity: null});
  const result = await buildEngine({...w.deps, identity: 'adhoc'});
  assert.equal(w.calls.find(c => c[1] === '--force')[3], '-');
  assert.deepEqual(result.signature, {kind: 'adhoc', identityMatches: null});
  assert.equal(w.json('pending.json').identity, 'adhoc');
  assert.ok(!w.calls.some(c => c[0] === '/bin/launchctl'), 'ad hoc never asks for the GUI session');
});

test('a failed swift build, or no swift at all, fails visibly and changes nothing at the location', async t => {
  const w = world(t);
  w.placeBundle({approved: true});
  w.state.swift = () => ({code: 1, stdout: 'Compiling\n', stderr: 'error: cannot find type Foo\n'});
  await assert.rejects(buildEngine(w.deps), error => (assert.equal(error.code, 'engine_build_failed'), assert.match(error.message, /cannot find type Foo/), true));
  assert.equal(w.plistBuild(), OLD_BUILD);
  w.state.swift = () => ({code: -1, stdout: '', stderr: 'spawn swift ENOENT', error: 'ENOENT'});
  await assert.rejects(buildEngine(w.deps), error => (assert.equal(error.code, 'engine_build_failed'), assert.match(error.hint, /Xcode/), true));
  assert.ok(!existsSync(join(w.dir, 'pending.json')));
});

// ---- stopEngine ----

test('stopEngine sends shutdown and waits for the engine to go; with nothing running it says so; another connection refuses, never a signal', async t => {
  const w = world(t);
  assert.deepEqual(await stopEngine(w.deps), {wasRunning: false});
  w.placeBundle();
  const engine = await w.startEngine();
  assert.deepEqual(await stopEngine(w.deps), {wasRunning: true, pid: engine.pid});
  assert.equal(engine.stopped, true);
  const busy = await w.startEngine();
  w.state.connections = 2;
  await assert.rejects(stopEngine(w.deps), error => (assert.equal(error.code, 'engine_busy'), assert.match(error.message, /2 other connections/), true));
  assert.ok(!busy.received.some(r => r.method === 'shutdown'));
});

// ---- engineStatus and installedEngine ----

test('engineStatus reports the bundle, the signature as a match, the engine\'s status and approval, never the identity', async t => {
  const w = world(t);
  const empty = await engineStatus(w.deps);
  assert.equal(empty.exists, false);
  assert.equal(empty.approved, false);
  assert.equal(empty.running, false);
  w.placeBundle({approved: true});
  await w.startEngine();
  const status = await engineStatus(w.deps);
  assert.equal(status.bundlePath, w.bundle);
  assert.equal(status.build, OLD_BUILD);
  assert.deepEqual(status.signature, {kind: 'identity', identityMatches: true});
  assert.equal(status.approved, true);
  assert.equal(status.approvedAt, '2026-10-20T00:00:00.000Z');
  assert.equal(status.running, true);
  assert.equal(status.status.accessibility, true);
  assert.equal(status.status.screenRecording, true);
  assert.equal(status.status.inputMonitoring, true);
  noIdentity(status, 'status');
  writeFileSync(join(w.dir, 'pending.json'), JSON.stringify({build: 'c'.repeat(64), identity: CERT_SHA1, builtAt: 'x'}));
  noIdentity((await engineStatus(w.deps)).pending, 'pending');
});

test('a signature codesign cannot read reports approval as unknown, never as no; installedEngine and approve still refuse it', async t => {
  const w = world(t);
  w.placeBundle({approved: true});
  const deps = {...w.deps, runSync: CODESIGN_TIMED_OUT_READ};
  const status = await engineStatus(deps);
  assert.equal(status.signature.kind, 'unreadable');
  assert.equal(status.signature.identityMatches, null);
  assert.match(status.signature.reason, /codesign did not finish within 60 s/);
  assert.equal(status.approved, null, 'unknown: the build is approved.json\'s and the signature could not be read');
  assert.equal(status.approvedBuild, OLD_BUILD);
  noIdentity(status, 'status');
  writeFileSync(join(w.dir, 'approved.json'), JSON.stringify({build: 'c'.repeat(64), identity: CERT_SHA1, approvedAt: 'when'}));
  assert.equal((await engineStatus(deps)).approved, false, 'another build is approved: no, whatever the signature');
  writeFileSync(join(w.dir, 'approved.json'), JSON.stringify({build: OLD_BUILD, identity: CERT_SHA1, approvedAt: 'when'}));
  assert.equal(installedEngine({dir: w.dir, runSync: CODESIGN_TIMED_OUT_READ}), null, 'gating: an unverified bundle is not the approved engine');
  await assert.rejects(approveEngine(deps), error => {
    assert.equal(error.code, 'engine_signature_unreadable');
    assert.match(error.message, /could not be read \(codesign did not finish within 60 s/);
    return true;
  });
  assert.equal(w.engines.length, 0, 'nothing launched');
  assert.equal(w.json('approved.json').identity, CERT_SHA1, 'approved.json untouched');
});

test('installedEngine is the bundle only when its build and signature are approved.json\'s', t => {
  const w = world(t);
  const installed = () => installedEngine({dir: w.dir, runSync: fakeCodesignRead});
  assert.equal(installed(), null, 'no bundle');
  w.placeBundle();
  assert.equal(installed(), null, 'no approved.json');
  writeFileSync(join(w.dir, 'approved.json'), JSON.stringify({build: OLD_BUILD, identity: CERT_SHA1, approvedAt: 'when'}));
  assert.deepEqual(installed(), {bundlePath: w.bundle, engineVersion: '9.9.9', build: OLD_BUILD, approvedAt: 'when'});
  writeFileSync(join(w.dir, 'approved.json'), JSON.stringify({build: 'c'.repeat(64), identity: CERT_SHA1, approvedAt: 'when'}));
  assert.equal(installed(), null, 'another build is pending');
  writeFileSync(join(w.dir, 'approved.json'), JSON.stringify({build: OLD_BUILD, identity: 'adhoc', approvedAt: 'when'}));
  assert.equal(installed(), null, 'another signature');
  writeFileSync(join(w.dir, 'approved.json'), '{broken');
  assert.equal(installed(), null, 'an unreadable approval is no approval');
});

// ---- approveEngine ----

const approves = engine => engine.received.filter(r => r.method === 'approve').length;

test('the ordinary approve after a same-identity rebuild needs no one: grants read true, relaunch, the capture with no confirmation, approved.json', async t => {
  const w = world(t);
  w.placeBundle();
  const result = await approveEngine(w.deps);
  assert.equal(result.approved, true);
  assert.equal(w.engines.length, 2, 'launched (it was not running), then relaunched');
  assert.equal(approves(w.engines[0]), 1);
  assert.equal(w.engines[0].stopped, true, 'stopped with shutdown before the relaunch');
  assert.equal(approves(w.engines[1]), 1, 'the capture on the relaunched engine');
  assert.deepEqual(w.order, ['watch', 'approve', 'stop', 'watch', 'approve', 'stop'], 'each approve, the first one\'s capture too, inside a watch');
  assert.equal(w.operator.asked, 0, 'no question for the operator');
  const approved = w.json('approved.json');
  assert.deepEqual(Object.keys(approved).sort(), ['approvedAt', 'build', 'identity']);
  assert.equal(approved.build, OLD_BUILD);
  assert.equal(approved.identity, CERT_SHA1);
  assert.equal(statSync(join(w.dir, 'approved.json')).mode & 0o777, 0o600);
  noIdentity(result, 'the result');
  noIdentity(w.logs, 'the log');
  assert.equal(installedEngine({dir: w.dir, runSync: fakeCodesignRead}).build, OLD_BUILD);
});

test('approve refuses with no bundle, with another connection open, and against an engine from another copy or build', async t => {
  const w = world(t);
  await assert.rejects(approveEngine(w.deps), {code: 'engine_not_built'});
  w.placeBundle();
  w.state.connections = 1;
  await w.startEngine();
  await assert.rejects(approveEngine(w.deps), error => (assert.equal(error.code, 'engine_busy'), assert.match(error.message, /1 other connection/), true));
  assert.equal(approves(w.engines[0]), 0);
  w.state.connections = 0;
  w.state.bundlePath = '/elsewhere/cua Engine.app';
  await assert.rejects(approveEngine(w.deps), error => (assert.equal(error.code, 'engine_mismatch'), assert.match(error.hint, /cua engine stop/), true));
  assert.ok(!existsSync(join(w.dir, 'approved.json')));
});

test('a grant that reads false gets its by-hand steps, and the loop goes on once status reads it true', async t => {
  const w = world(t, {engineAnswers: {screenRecording: false, inputMonitoring: false}});
  let polls = 0;
  w.state.onStatus = state => { if (++polls === 4) { state.screenRecording = true; state.inputMonitoring = true; } };
  w.state.lines = [];
  w.operator.next = () => { w.operator.asked++; return new Promise(() => {}); };  // a terminal where no one types
  w.placeBundle();
  const result = await approveEngine(w.deps);
  assert.equal(result.approved, true);
  const text = w.logs.join('\n');
  assert.match(text, /Privacy & Security → Screen & System Audio Recording/);
  assert.match(text, /Privacy & Security → Input Monitoring/);
  assert.doesNotMatch(text, /→ Accessibility/, 'only the grants that read false');
  assert.match(text, /"\+"/);
  assert.ok(text.includes(w.bundle), 'the bundle\'s path');
  assert.match(text, /intervention detection off/);
});

test('the operator\'s Enter confirms a grant the running engine cannot see, "n" aborts, and no terminal at all fails naming the console', async t => {
  const w = world(t, {engineAnswers: {screenRecording: false}});
  w.state.onApprove = (state, engine) => { if (engine.pid !== 100) state.screenRecording = true; };  // seen only after the relaunch
  w.state.lines = [''];
  w.placeBundle();
  assert.equal((await approveEngine(w.deps)).approved, true);

  const n = world(t, {engineAnswers: {accessibility: false}});
  n.state.lines = ['n'];
  n.placeBundle();
  const aborted = await approveEngine(n.deps);
  assert.equal(aborted.approved, false);
  assert.equal(n.engines[0].stopped, false);
  assert.ok(!existsSync(join(n.dir, 'approved.json')));

  const gone = world(t, {engineAnswers: {accessibility: false}});
  gone.state.lines = [null];
  gone.placeBundle();
  await assert.rejects(approveEngine(gone.deps), error => (assert.equal(error.code, 'engine_grant_pending'), assert.match(error.message, /Accessibility/), assert.match(error.hint, /console/), true));
  assert.ok(gone.deps.now() < 60_000, 'at once, not after the 15-minute bound');
  assert.ok(!existsSync(join(gone.dir, 'approved.json')));
});

test('a capture that reports false after the relaunch is no approval', async t => {
  const w = world(t, {engineAnswers: {captured: false}});
  w.placeBundle();
  const result = await approveEngine(w.deps);
  assert.equal(result.approved, false);
  assert.match(result.reason, /captured/);
  assert.ok(!existsSync(join(w.dir, 'approved.json')));
});

test('a capture confirmation seen in replayd\'s log waits for the operator\'s word; with no terminal the approve fails naming the console', async t => {
  const w = world(t);
  w.watcher.alerts = [0, 1];
  w.state.lines = [''];
  w.placeBundle();
  const result = await approveEngine(w.deps);
  assert.equal(result.approved, true);
  assert.equal(result.captureConfirmation, 'answered');
  assert.equal(w.operator.asked, 1);
  assert.match(w.logs.join('\n'), /capture confirmation/);

  const none = world(t);
  none.watcher.alerts = [0, 2];
  none.state.lines = [null];
  none.placeBundle();
  await assert.rejects(approveEngine(none.deps), error => (assert.equal(error.code, 'engine_capture_confirmation'), assert.match(error.message, /console/), true));
  assert.ok(!existsSync(join(none.dir, 'approved.json')));
});

test('the first approve\'s capture after a same-identity rebuild is watched: a confirmation it raises waits for the operator', async t => {
  const w = world(t);
  w.watcher.alerts = [1, 0];
  w.placeBundle();
  w.state.lines = [null];
  await assert.rejects(approveEngine(w.deps), {code: 'engine_capture_confirmation'});
  assert.ok(!existsSync(join(w.dir, 'approved.json')));
});

for (const [why, set] of [['cannot start', watcher => { watcher.ready = false; }], ['ends on its own after starting', watcher => { watcher.intact = false; }]]) {
  test(`when replayd's log stream ${why}, the approve asks the operator as if a confirmation had appeared`, async t => {
    const w = world(t);
    set(w.watcher);
    w.state.lines = [''];
    w.placeBundle();
    const result = await approveEngine(w.deps);
    assert.equal(result.approved, true);
    assert.equal(result.captureConfirmation, 'unwatched');
    assert.equal(w.operator.asked, 1);
  });
}

// ---- the operator's lines and replayd's log ----

test('the line reader answers one question per line, discards lines typed before a question, and answers null once its input has ended', async () => {
  const input = new PassThrough();
  const reader = lineReader(input);
  input.write('typed ahead\n');
  await new Promise(resolve => setImmediate(resolve));
  const first = reader.next();
  input.write('\n');
  assert.equal(await first, '', 'the line typed before the question is not its answer');
  const abandoned = reader.next();
  const second = reader.next();
  input.write('n\n');
  assert.equal(await second, 'n', 'a new question replaces one left unanswered');
  let settled = false;
  abandoned.then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  input.end();
  assert.equal(await reader.next(), null);
  reader.close();
});

// A stand-in for `log stream --style ndjson`: its banner, then the given lines, then it waits to be killed.
const fakeLog = lines => () => spawn(process.execPath, ['-e', `process.stdout.write('Filtering the log data using ...\\n' + ${JSON.stringify(lines.map(l => JSON.stringify(l) + '\n').join(''))}); setInterval(() => {}, 1000);`], {stdio: ['ignore', 'pipe', 'ignore']});

test('the capture watch counts replayd\'s SCAlert lines once its stream is up, keeping no line', async () => {
  const watch = watchCaptureAlerts({spawnLog: fakeLog([
    {eventMessage: '+[SCAlert userAcknowledgementAlertWithBundleID:] io.github.ssfskim.cua.engine', processImagePath: '/usr/libexec/replayd'},
    {eventMessage: 'something else'},
  ])});
  assert.equal(await watch.ready, true);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.deepEqual(await watch.stop(), {alerts: 1, intact: true});
});

// replayd's lines at a capture stream's start with no alert shown (the mini, 2026-10-20 22:15:50Z, M1b.5).
test('the capture watch does not count SCAlertStatsManager\'s bookkeeping lines', async () => {
  const watch = watchCaptureAlerts({spawnLog: fakeLog([
    '-[SCAlertStatsManager approveOnStreamStartWithCanonicalBundleID:auditToken:streamID:methodType:]:118',
    '-[SCAlertStatsManager requireAlertWithCanonicalBundleID:auditToken:]:161',
    '-[SCAlertStatsManager updateClientWithIdentifier:lastUsedDate:lastAlertedDate:]:262',
    '-[SCAlertStatsManager requirePrivacyHintWithCanonicalBundleID:auditToken:]:205',
  ].map(eventMessage => ({eventMessage: `[INFO] ${eventMessage}`, processImagePath: '/usr/libexec/replayd'})))});
  assert.equal(await watch.ready, true);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.deepEqual(await watch.stop(), {alerts: 0, intact: true});
  assert.equal(CAPTURE_ALERT_PREDICATE, 'process == "replayd" AND eventMessage CONTAINS "[SCAlert "');
});

test('a capture watch whose stream ends after it started is not intact', async () => {
  const watch = watchCaptureAlerts({spawnLog: () => spawn(process.execPath, ['-e', 'process.stdout.write("Filtering the log data using ...\\n")'], {stdio: ['ignore', 'pipe', 'ignore']})});
  assert.equal(await watch.ready, true);
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.deepEqual(await watch.stop(), {alerts: 0, intact: false});
});

test('a capture watch whose stream cannot start is not ready', async () => {
  const broken = watchCaptureAlerts({spawnLog: () => spawn(process.execPath, ['-e', 'process.exit(1)'], {stdio: ['ignore', 'pipe', 'ignore']})});
  assert.equal(await broken.ready, false);
  assert.deepEqual(await broken.stop(), {alerts: 0, intact: false});
  const missing = watchCaptureAlerts({spawnLog: () => { throw new Error('no log'); }});
  assert.equal(await missing.ready, false);
});
