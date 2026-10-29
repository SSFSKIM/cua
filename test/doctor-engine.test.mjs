import './helpers/scratch-home.mjs'; // first: nothing here may read the account's engine settings or approved engine
// cua doctor's `engine` row (src/runtime/doctor-engine.mjs; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// acceptance 1, "Install, signing and permissions", the Input section's route 4, the Decision Log's "M3 pre-flight" item
// 1): the selection it reports, the approved bundle, its signature as a match, the socket's owner, the three grants,
// the probe's ability, the route-4 overrides and the apps routeAdvice names, and the row's sentence when cua's engine is
// not selected. The engine's read is a stub here (src/runtime/engine.mjs inspectEngine has its own tests): nothing is
// launched, signed or connected to.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {engineCheck} from '../src/runtime/doctor-engine.mjs';
import {inspectRuntime} from '../src/runtime/doctor.mjs';
import {replHostFor} from '../src/runtime/launch.mjs';
import {CuaError} from '../src/runtime/errors.mjs';
import {surfacesFrom} from '../src/mcp/surface.mjs';
import {scratch} from './fixtures/runtime-fixture.mjs';

const BUILD = 'a'.repeat(64);
const OTHER_BUILD = 'c'.repeat(64);
const BUNDLE = '/Users/someone/Library/Application Support/cua/engine/cua Engine.app';
const SOCKET = '/Users/someone/Library/Application Support/cua/engine/engine.sock';
const APP = {bundlePath: BUNDLE, engineVersion: '0.4.0', build: BUILD};
const IDENTITY = 'ABCDEF0123456789ABCDEF0123456789ABCDEF01';

const status = over => ({engineVersion: '0.4.0', build: BUILD, accessibility: true, screenRecording: true, inputMonitoring: true, canPostHid: true,
  socket: SOCKET, pid: 4242, bundlePath: BUNDLE, connections: 0, routes: {}, routeAdvice: [], ...over});
// inspectEngine's report for an approved bundle whose engine was already running.
const facts = over => ({bundlePath: BUNDLE, exists: true, engineVersion: '0.4.0', build: BUILD, bundleId: 'io.github.ssfskim.cua.engine',
  signature: {kind: 'identity', identityMatches: true}, approved: true, approvedBuild: BUILD, approvedAt: '2026-10-21T00:00:00.000Z', pending: null,
  running: true, status: status(), statusError: null, launch: null, ...over});

const WITH_NODE = () => '/usr/local/bin/node';
const WITHOUT_NODE = () => { throw Object.assign(new CuaError('repl_host_node', 'cua\'s own host needs Node 24 or later and none was found'), {tried: ['/usr/bin/node (v22.0.0)']}); };

// The row for `env` (CUA_SHIM_SURFACES defaults to the computer surface), with the selection's inputs and the read
// stubbed; the session's selection is repl.host's, computed as doctor computes it (replHostFor with the same inputs).
async function row(env = {}, {read = facts(), installed = true, config = {}, defaultEngine = 'vendor', platform = 'darwin', records, node = true} = {}) {
  const inspections = [];
  const fullEnv = {HOME: '/nonexistent-home', CUA_SHIM_SURFACES: 'computer,browser', ...env};
  const engine = {defaultEngine, config: () => config, installed: () => (installed ? APP : null)};
  let session;
  try { session = replHostFor({platform, surfaces: surfacesFrom(fullEnv.CUA_SHIM_SURFACES), ambient: fullEnv, home: '/nonexistent-home', resolveOwnNode: node ? WITH_NODE : WITHOUT_NODE, engine}); } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    session = {code: error.code, message: error.message};
  }
  const result = await engineCheck({env: fullEnv, platform, session, engine,
    inspect: async options => { inspections.push(options); return read; },
    records: records ?? (() => ({bundlePath: BUNDLE, exists: false, approved: null, pending: null}))});
  return {...result, inspected: inspections.length, mayLaunch: inspections[0]?.mayLaunch, session};
}

const noIdentity = value => assert.ok(!JSON.stringify(value).includes(IDENTITY), 'no identity');

test('cua\'s engine selected, approved, already running and fully granted: pass, with acceptance 1\'s fields', async () => {
  const {row: check, report, inspected, mayLaunch} = await row({CUA_NATIVE_ENGINE: 'cua'});
  assert.equal(inspected, 1);
  assert.equal(mayLaunch, true, 'sessions drive cua\'s engine, so doctor may launch it');
  assert.deepEqual(report.preferred, {engine: 'cua', reason: 'explicit'});
  assert.equal(check.name, 'engine');
  assert.equal(check.status, 'pass', check.detail);
  assert.equal(report.selected, 'cua');
  assert.equal(report.reason, 'explicit');
  assert.equal(report.bundle, BUNDLE);
  assert.deepEqual(report.signature, {kind: 'identity', identityMatches: true});
  assert.equal(report.build, BUILD);
  assert.equal(report.approvedBuild, BUILD);
  assert.deepEqual(report.permissions, {accessibility: true, screenRecording: true, inputMonitoring: true});
  assert.deepEqual(report.socket, {path: SOCKET, ownerIsApproved: true});
  assert.deepEqual(report.probe, {canPostHid: true});
  assert.equal(report.running, true);
  assert.equal(report.launched, null);
  assert.deepEqual(report.routes, {});
  assert.deepEqual(report.routeAdvice, []);
  assert.ok(check.detail.startsWith('cua\'s engine is selected (CUA_NATIVE_ENGINE=cua): the approved cua Engine.app at '), check.detail);
  for (const part of ['version 0.4.0, build aaaaaaaaaaaa', 'signed by the configured identity', 'pid 4242', 'already running', 'left alone',
    'Accessibility granted', 'Screen Recording granted', 'Input Monitoring granted', '--probe keystroke', 'no route-4 override']) assert.ok(check.detail.includes(part), part);
  noIdentity({check, report});
});

test('with no engine running doctor reports the one it launched and stopped, or left running for a session, or could not stop', async () => {
  const launched = await row({CUA_NATIVE_ENGINE: 'cua'}, {read: facts({running: false, launch: {pid: 77, stopped: true}, status: status({pid: 77})})});
  assert.equal(launched.row.status, 'pass', launched.row.detail);
  assert.match(launched.row.detail, /no engine was running, so doctor launched this bundle \(open -n -g -a, pid 77\) to read its grants and stopped it/);
  assert.deepEqual(launched.report.launched, {pid: 77, stopped: true});
  assert.equal(launched.report.running, false);
  assert.deepEqual(launched.report.permissions, {accessibility: true, screenRecording: true, inputMonitoring: true});
  const kept = await row({CUA_NATIVE_ENGINE: 'cua'}, {read: facts({running: false, status: status({pid: 78}),
    launch: {pid: 78, stopped: false, leftRunning: true, detail: 'the engine (pid 78) has 1 other connection open'}})});
  assert.equal(kept.row.status, 'pass');
  assert.match(kept.row.detail, /a session connected before doctor could stop it, so it was left running for that session/);
  const stuck = await row({CUA_NATIVE_ENGINE: 'cua'}, {read: facts({running: false, status: status({pid: 79}),
    launch: {pid: 79, stopped: false, error: 'the engine (pid 79) accepted shutdown but still answers after 10 s'}})});
  assert.equal(stuck.row.status, 'warn');
  assert.match(stuck.row.detail, /could not stop it: the engine \(pid 79\) accepted shutdown/);
});

test('a launch that fails, or a status read that fails, fails the row with the grants unread', async () => {
  const failed = await row({CUA_NATIVE_ENGINE: 'cua'}, {read: facts({running: false, status: null, launch: {error: 'open -n -g -a … failed (exit 1): LSOpenURLsWithRole() failed'}})});
  assert.equal(failed.row.status, 'fail');
  assert.match(failed.row.detail, /no engine was running, and launching this bundle to read its grants failed: open -n -g -a/);
  assert.deepEqual(failed.report.permissions, {accessibility: null, screenRecording: null, inputMonitoring: null});
  assert.deepEqual(failed.report.probe, {canPostHid: null});
  assert.equal(failed.report.socket.ownerIsApproved, null);
  const unreadable = await row({CUA_NATIVE_ENGINE: 'cua'}, {read: facts({status: null, statusError: 'the engine at /x did not answer status: internal error'})});
  assert.equal(unreadable.row.status, 'fail');
  assert.match(unreadable.row.detail, /answered status with an error: the engine at \/x did not answer status: internal error/);
  assert.equal(unreadable.report.statusError, 'the engine at /x did not answer status: internal error');
});

test('a grant that reads false: Accessibility or Screen Recording fails the row, Input Monitoring warns that intervention detection is off', async () => {
  for (const [grant, pane, verdict] of [['accessibility', 'Accessibility', 'fail'], ['screenRecording', 'Screen & System Audio Recording', 'fail'], ['inputMonitoring', 'Input Monitoring', 'warn']]) {
    const {row: check, report} = await row({CUA_NATIVE_ENGINE: 'cua'}, {read: facts({status: status({[grant]: false})})});
    assert.equal(check.status, verdict, grant);
    assert.equal(report.permissions[grant], false);
    assert.ok(check.detail.includes(`System Settings → Privacy & Security → ${pane}`), check.detail);
    assert.ok(check.detail.includes(BUNDLE));
  }
  const im = await row({CUA_NATIVE_ENGINE: 'cua'}, {read: facts({status: status({inputMonitoring: false})})});
  assert.match(im.row.detail, /intervention detection off/);
  const probe = await row({CUA_NATIVE_ENGINE: 'cua'}, {read: facts({status: status({canPostHid: false})})});
  assert.equal(probe.row.status, 'pass', 'the probe\'s ability is reported, not judged');
  assert.match(probe.row.detail, /the probe mode cannot post HID events/);
});

test('an engine answering at the socket that is not the approved bundle fails the row', async () => {
  for (const other of [{bundlePath: '/elsewhere/cua Engine.app'}, {build: OTHER_BUILD}]) {
    const {row: check, report} = await row({CUA_NATIVE_ENGINE: 'cua'}, {read: facts({status: status(other)})});
    assert.equal(check.status, 'fail', JSON.stringify(other));
    assert.equal(report.socket.ownerIsApproved, false);
    assert.match(check.detail, /is not this bundle: it runs .*; sessions refuse it.*cua engine stop/);
  }
});

test('the signature is reported as a match and a kind: another identity, ad hoc, or none configured warns', async () => {
  for (const [signature, words] of [[{kind: 'identity', identityMatches: false}, /not by the configured signing identity: cua engine build re-signs it/],
    [{kind: 'adhoc', identityMatches: false}, /signed ad hoc, so its grants do not survive a rebuild/],
    [{kind: 'identity', identityMatches: null}, /no signing identity is configured to compare it with/]]) {
    const {row: check, report} = await row({CUA_NATIVE_ENGINE: 'cua'}, {read: facts({signature})});
    assert.equal(check.status, 'warn', JSON.stringify(signature));
    assert.deepEqual(report.signature, signature);
    assert.match(check.detail, words);
  }
});

test('route-4 overrides and the apps routeAdvice names are listed; advice warns; an override the running engine has not read is noted', async () => {
  const overrides = await row({CUA_NATIVE_ENGINE: 'cua'}, {config: {routes: {'com.example.canvas': 4}}, read: facts({status: status({routes: {'com.example.canvas': 4}})})});
  assert.equal(overrides.row.status, 'pass');
  assert.deepEqual(overrides.report.routes, {'com.example.canvas': 4});
  assert.match(overrides.row.detail, /route 4 \(the foreground assist\) for com\.example\.canvas, by the owner's override/);
  const advised = await row({CUA_NATIVE_ENGINE: 'cua'}, {read: facts({status: status({routeAdvice: ['com.example.paint', 'com.example.draw']})})});
  assert.equal(advised.row.status, 'warn');
  assert.deepEqual(advised.report.routeAdvice, ['com.example.paint', 'com.example.draw']);
  assert.match(advised.row.detail, /route 3 could not prepare com\.example\.paint, com\.example\.draw for a background click .*"routes": \{"<bundle id>": 4\}/);
  const unread = await row({CUA_NATIVE_ENGINE: 'cua'}, {config: {routes: {'com.example.canvas': 4}}});
  assert.match(unread.row.detail, /~\/\.config\/cua\/engine\.json now lists com\.example\.canvas, which the running engine has not read: cua engine stop applies it at the next launch/);
  // Not running: the overrides come from engine.json, which the engine reads at launch.
  const fromFile = await row({CUA_NATIVE_ENGINE: 'cua'}, {config: {routes: {'com.example.canvas': 4}}, read: facts({running: false, status: null, launch: {error: 'x'}})});
  assert.deepEqual(fromFile.report.routes, {'com.example.canvas': 4});
  assert.equal(fromFile.report.routeAdvice, null);
});

test('an engine.json the engine refuses to start with fails the row', async () => {
  for (const [config, words] of [[{routes: {'com.example.canvas': 3}}, /routes in ~\/\.config\/cua\/engine\.json must map bundle ids to 4/],
    [{routes: []}, /routes in ~\/\.config\/cua\/engine\.json must map bundle ids to 4/], [{peerPolicy: 'ancestor'}, /peerPolicy in ~\/\.config\/cua\/engine\.json must be "uid"/]]) {
    const {row: check} = await row({CUA_NATIVE_ENGINE: 'cua'}, {config, read: facts({running: false, status: null, launch: {error: 'did not answer'}})});
    assert.equal(check.status, 'fail', JSON.stringify(config));
    assert.match(check.detail, words);
    assert.match(check.detail, /the engine refuses to start/);
  }
});

test('cua\'s engine preferred with no approved engine: refused sessions fail the row, the default\'s fallback warns; each names what to do; nothing is launched', async () => {
  const cases = [
    [facts({exists: false, engineVersion: null, build: null, signature: {kind: null, identityMatches: null}, approved: false, approvedBuild: null, running: false, status: null}), /no bundle at .*cua Engine\.app: build it with cua engine build, then approve it with cua engine approve/],
    [facts({approved: false, approvedBuild: null, pending: {build: BUILD, builtAt: 'then'}, running: false, status: null}), /\(build aaaaaaaaaaaa\) is pending approval: run cua engine approve with the owner at the console/],
    [facts({approved: false, approvedBuild: OTHER_BUILD, running: false, status: null}), /is build aaaaaaaaaaaa, but approved\.json approves build cccccccccccc: run cua engine approve/],
    [facts({approved: false, running: false, status: null}), /is not signed as approved\.json records: rebuild it with cua engine build, then cua engine approve/],
    [facts({approved: null, signature: {kind: 'unreadable', identityMatches: null, reason: 'codesign did not finish within 60 s'}, running: false, status: null}), /could not be read \(codesign did not finish within 60 s\), so it is not taken as approved/],
  ];
  for (const [read, words] of cases) {
    const refused = await row({CUA_NATIVE_ENGINE: 'cua'}, {installed: false, read});
    assert.equal(refused.row.status, 'fail', refused.row.detail);
    assert.equal(refused.report.selected, null, 'sessions drive no engine');
    assert.deepEqual(refused.report.preferred, {engine: 'cua', reason: 'explicit'});
    assert.equal(refused.report.reason, 'engine_not_installed');
    assert.equal(refused.report.refused.code, 'engine_not_installed');
    assert.equal(refused.mayLaunch, false);
    assert.match(refused.row.detail, /^cua's engine is preferred \(CUA_NATIVE_ENGINE=cua\), but no approved engine is installed, so every macOS computer session is refused \(engine_not_installed\): /);
    assert.match(refused.row.detail, words);
  }
  const fallback = await row({}, {installed: false, defaultEngine: 'cua', read: cases[1][0]});
  assert.equal(fallback.row.status, 'warn');
  assert.equal(fallback.report.selected, 'vendor', 'the engine sessions use');
  assert.deepEqual(fallback.report.preferred, {engine: 'cua', reason: 'default'});
  assert.equal(fallback.report.reason, 'engine_not_installed');
  assert.equal(fallback.report.refused, null);
  assert.equal(fallback.mayLaunch, false);
  assert.match(fallback.row.detail, /^cua's engine is preferred \(the default engine\), but no approved engine is installed, so macOS computer sessions keep the vendor host and engine \(engine_not_installed\): /);
  // A bundle at the approved location that is not cua's engine is never launched, and fails the row.
  const foreign = await row({CUA_NATIVE_ENGINE: 'cua'}, {read: facts({bundleId: 'io.github.ssfskim.cua.fixture-engine', running: false, status: null})});
  assert.equal(foreign.row.status, 'fail');
  assert.match(foreign.row.detail, /is not cua's engine \(bundle id io\.github\.ssfskim\.cua\.fixture-engine\), so doctor does not launch it/);
});

test('the default cua engine without Node 24: sessions keep the vendor engine, so the row warns, reports both selections and launches nothing', async () => {
  const fallback = await row({}, {defaultEngine: 'cua', node: false, read: facts({running: false, status: null})});
  assert.equal(fallback.session.reason, 'own_host_node_unavailable', 'repl.host\'s own selection');
  assert.equal(fallback.row.status, 'warn', fallback.row.detail);
  assert.equal(fallback.report.selected, 'vendor');
  assert.equal(fallback.report.reason, 'own_host_node_unavailable');
  assert.deepEqual(fallback.report.preferred, {engine: 'cua', reason: 'default'});
  assert.equal(fallback.report.refused, null);
  assert.equal(fallback.mayLaunch, false, 'no session would use it, so doctor does not launch it');
  assert.equal(fallback.report.launched, null);
  assert.match(fallback.row.detail, /^cua's engine is preferred \(the default engine\), but cua's own host finds no Node 24 or later \(see repl\.host\), so macOS computer sessions keep the vendor host and engine \(own_host_node_unavailable\): the approved cua Engine\.app at .* is installed, and doctor does not launch it while no session would use it$/);
  // Explicitly preferred, the same missing Node refuses every session (repl_host_node): fail, still nothing launched.
  const explicit = await row({CUA_NATIVE_ENGINE: 'cua'}, {node: false, read: facts({running: false, status: null})});
  assert.equal(explicit.row.status, 'fail');
  assert.equal(explicit.report.selected, null);
  assert.equal(explicit.report.refused.code, 'repl_host_node');
  assert.equal(explicit.mayLaunch, false);
  assert.match(explicit.row.detail, /^cua's engine is preferred \(CUA_NATIVE_ENGINE=cua\), but cua's own host finds no Node 24 or later \(see repl\.host\), so every macOS computer session is refused \(repl_host_node\): /);
});

test('an engine that answers doctor\'s launch but is not this bundle, or one that took the socket by the stop, is reported and left alone', async () => {
  const mismatch = await row({CUA_NATIVE_ENGINE: 'cua'}, {read: facts({running: false, status: status({pid: 91, bundlePath: '/elsewhere/cua Engine.app'}),
    launch: {pid: 91, stopped: false, mismatch: {bundlePath: '/elsewhere/cua Engine.app', build: BUILD}}})});
  assert.equal(mismatch.row.status, 'fail');
  assert.match(mismatch.row.detail, /the engine that answered \(pid 91\) runs \/elsewhere\/cua Engine\.app, build aaaaaaaaaaaa, not this bundle: doctor left it alone/);
  assert.deepEqual(mismatch.report.permissions, {accessibility: null, screenRecording: null, inputMonitoring: null}, 'another engine\'s grants are not this bundle\'s');
  assert.equal(mismatch.report.socket.ownerIsApproved, false);
  const replaced = await row({CUA_NATIVE_ENGINE: 'cua'}, {read: facts({running: false, status: status({pid: 92}),
    launch: {pid: 92, stopped: false, replaced: true, detail: 'another engine (pid 999) answers at /x now, not pid 92; it was left alone'}})});
  assert.equal(replaced.row.status, 'warn');
  assert.match(replaced.row.detail, /by the stop another engine answered at the socket, and doctor left it alone \(another engine \(pid 999\)/);
});

test('the vendor engine selected: skip, saying cua\'s engine is not selected, how to select it and what is installed, with nothing inspected', async () => {
  const today = await row({});
  assert.equal(today.inspected, 0, 'no codesign, no connection, no launch');
  assert.equal(today.row.status, 'skip');
  assert.equal(today.report.selected, 'vendor');
  assert.equal(today.report.reason, 'default');
  assert.deepEqual(today.report.preferred, {engine: 'vendor', reason: 'default'});
  assert.match(today.row.detail, /^cua's engine is not selected: the default engine is the vendor's, so macOS computer sessions use the vendor's Codex Computer Use helper \(helper\.live\)\. CUA_NATIVE_ENGINE=cua, or "engine": "cua" in ~\/\.config\/cua\/engine\.json, selects cua's own, which runs an approved engine: none is installed on this Mac \(cua engine build, then cua engine approve with the owner at the console\)$/);
  assert.deepEqual(today.report.permissions, {accessibility: null, screenRecording: null, inputMonitoring: null});
  const approved = await row({CUA_NATIVE_ENGINE: 'vendor'}, {records: () => ({bundlePath: BUNDLE, exists: true, approved: {build: BUILD, approvedAt: 'when'}, pending: null})});
  assert.equal(approved.row.status, 'skip');
  assert.equal(approved.report.reason, 'explicit');
  assert.match(approved.row.detail, /^cua's engine is not selected: CUA_NATIVE_ENGINE=vendor, so /);
  assert.match(approved.row.detail, /which runs an approved engine: approved\.json approves build aaaaaaaaaaaa at .*cua Engine\.app$/);
  assert.equal(approved.report.approvedBuild, BUILD);
  const pending = await row({}, {config: {engine: 'vendor'}, records: () => ({bundlePath: BUNDLE, exists: true, approved: null, pending: {build: OTHER_BUILD, builtAt: 'then'}})});
  assert.match(pending.row.detail, /^cua's engine is not selected: "engine": "vendor" in ~\/\.config\/cua\/engine\.json, so /);
  assert.match(pending.row.detail, /a bundle at .* is pending approval \(build cccccccccccc; cua engine approve\)$/);
  // The vendor engine with CUA_REPL_HOST=cua is the host's refusal (repl.host names it); the engine row says the vendor's is selected.
  const refusedHost = await row({CUA_REPL_HOST: 'cua'});
  assert.equal(refusedHost.row.status, 'skip');
  assert.equal(refusedHost.report.selected, null);
  assert.deepEqual(refusedHost.report.preferred, {engine: 'vendor', reason: 'default'});
  assert.equal(refusedHost.report.reason, 'repl_host_refused');
  assert.match(refusedHost.row.detail, /sessions here are refused \(repl_host_refused; see repl\.host\)/);
});

// Linux's own engine row is test/doctor-engine-linux.test.mjs (#171): it never reads the macOS approved location.
test('no native engine applies off macOS and Linux or without the computer surface; an unknown setting fails', async () => {
  const other = await engineCheck({env: {CUA_SHIM_SURFACES: 'computer'}, platform: 'win32', session: {host: 'cua'}, inspect: async () => assert.fail('not read')});
  assert.equal(other.row.status, 'skip');
  assert.equal(other.report, undefined);
  assert.match(other.row.detail, /macOS and Linux/);
  const linux = await engineCheck({env: {CUA_SHIM_SURFACES: 'computer', CUA_NATIVE_ENGINE: 'cua'}, platform: 'linux', arch: 'x64', home: '/nonexistent-home', session: {code: 'engine_not_installed', message: 'none'},
    engine: {config: () => ({})}, inspect: async () => assert.fail('the macOS approved location is not read on Linux'), records: () => assert.fail('nor its records'),
    inspectLinux: () => ({path: '/nonexistent-home/engine/linux/cua-engine', exists: false, executable: false, sha256: null, build: null, version: null, release: null, pinned: null, current: false})});
  assert.equal(linux.row.status, 'fail');
  const browser = await row({CUA_NATIVE_ENGINE: 'cua', CUA_SHIM_SURFACES: 'browser'});
  assert.equal(browser.row.status, 'skip');
  assert.equal(browser.report.selected, null);
  assert.equal(browser.inspected, 0);
  assert.match(browser.row.detail, /the computer surface is off here \(CUA_SHIM_SURFACES\)/);
  const unknown = await row({CUA_NATIVE_ENGINE: 'own'});
  assert.equal(unknown.row.status, 'fail');
  assert.equal(unknown.report.selected, null);
  assert.equal(unknown.report.refused.code, 'invalid_setting');
  assert.match(unknown.row.detail, /CUA_NATIVE_ENGINE must be vendor or cua/);
});

test('cua doctor reports the engine row and the JSON `engine`, the selection\'s approved engine read once for repl.host and the engine row', async t => {
  const s = scratch();
  t.after(s.cleanup);
  let installedAsked = 0;
  let read = 0;
  const report = await inspectRuntime({home: s.dir, env: {HOME: s.dir, CUA_NATIVE_ENGINE: 'cua', CUA_SHIM_SURFACES: 'computer,browser'}, host: {platform: 'darwin', arch: 'arm64'},
    inspectHelper: async () => ({socket: '/x', holders: []}), inspectSecrets: async () => ({dir: '/none', exists: false}), inspectAgent: async () => [], inspectChrome: async () => [],
    verifySignatures: async () => [], resolveOwnNode: () => '/usr/local/bin/node',
    engine: {config: () => ({}), installed: () => { installedAsked++; return APP; }},
    inspectEngine: async ({env}) => { read++; assert.equal(env.HOME, s.dir); return facts(); }});
  const check = report.checks.find(c => c.name === 'engine');
  assert.equal(check.status, 'pass', check.detail);
  assert.equal(report.engine.selected, 'cua');
  assert.equal(report.engine.build, BUILD);
  assert.equal(installedAsked, 1);
  assert.equal(read, 1);
});

test('cua doctor reads the approved location once: its codesign serves the selection and the engine row\'s inspection', async t => {
  const s = scratch();
  t.after(s.cleanup);
  const SHA1 = 'F'.repeat(40);
  const location = {dir: '/approved', onDisk: {exists: true, engineVersion: '0.4.0', build: BUILD, signature: {kind: 'identity', sha1: SHA1, authority: 'x'}},
    approved: {build: BUILD, identity: SHA1, approvedAt: 'when'}, pending: null};
  let reads = 0;
  let handed;
  const report = await inspectRuntime({home: s.dir, env: {HOME: s.dir, CUA_NATIVE_ENGINE: 'cua', CUA_SHIM_SURFACES: 'computer'}, host: {platform: 'darwin', arch: 'arm64'},
    inspectHelper: async () => ({socket: '/x', holders: []}), inspectSecrets: async () => ({dir: '/none', exists: false}), inspectAgent: async () => [], inspectChrome: async () => [],
    verifySignatures: async () => [], resolveOwnNode: () => '/usr/local/bin/node',
    engine: {config: () => ({}), location: () => { reads++; return location; }},
    inspectEngine: async options => { handed = options.location(); return facts(); }});
  assert.equal(report.engine.selected, 'cua', 'the selection read the location as installed');
  assert.equal(handed, location, 'the inspection got the same read');
  assert.equal(reads, 1, 'one read, so one codesign');
  assert.ok(!JSON.stringify(report).includes(SHA1), 'no identity');
});

test('cua doctor\'s default engine read finds nothing under an empty HOME and launches nothing', async t => {
  const s = scratch();
  t.after(s.cleanup);
  mkdirSync(join(s.dir, '.config', 'cua'), {recursive: true});
  writeFileSync(join(s.dir, '.config', 'cua', 'engine.json'), JSON.stringify({engine: 'cua'}));
  const report = await inspectRuntime({home: s.dir, env: {HOME: s.dir, CUA_SHIM_SURFACES: 'computer'}, host: {platform: 'darwin', arch: 'arm64'},
    inspectHelper: async () => ({socket: '/x', holders: []}), inspectSecrets: async () => ({dir: '/none', exists: false}), inspectAgent: async () => [], inspectChrome: async () => [],
    verifySignatures: async () => [], resolveOwnNode: () => '/usr/local/bin/node'});
  const check = report.checks.find(c => c.name === 'engine');
  assert.equal(check.status, 'fail');
  assert.equal(report.engine.selected, null);
  assert.deepEqual(report.engine.preferred, {engine: 'cua', reason: 'settings'});
  assert.equal(report.engine.reason, 'engine_not_installed');
  assert.equal(report.engine.exists, false);
  assert.equal(report.engine.launched, null);
  assert.match(check.detail, /no bundle at /);
});
