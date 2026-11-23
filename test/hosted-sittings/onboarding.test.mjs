// T3b's hosted staged onboarding (scripts/hosted-sittings/onboarding.mjs) and its judge (onboarding-judge.mjs): the
// stages set by cua's engine's TCC rows (none, Accessibility, Screen Recording added, then Input Monitoring and post
// events), a relaunch at every stage, the product's answers recorded, and the record judged against M4's behaviour.
// Everything here is a double: a fake product that answers as M4's code does (Skyshot.swift's order of checks,
// client.mjs's owed relaunch, doctor-engine.mjs's row), so nothing touches a TCC database, an engine or a GUI.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cuaCli, disposeSession, runOnboarding, STAGES} from '../../scripts/hosted-sittings/onboarding.mjs';
import {openSession} from '../../scripts/accept/mcp-session.mjs';
import {EXPECTED, judgeOnboarding} from '../../scripts/hosted-sittings/onboarding-judge.mjs';
import {CLIENTS, SERVICES} from '../../scripts/hosted-sittings/tcc.mjs';
import {TIMEOUT_SENTENCE} from '../../src/repl-host/supervisor.mjs';

const HOSTED = {env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'darwin'};
const BUNDLE = '/Users/runner/Library/Application Support/cua/engine/cua Engine.app';
const ATTEST = {engine: 'cua', version: '0.3.0', build: 'b'.repeat(64)};
const PANES = {accessibility: 'Accessibility', screenRecording: 'Screen & System Audio Recording'};
const APPROVAL = {jsonrpc: '2.0', id: 'e1', method: 'elicitation/create', params: {message: 'Allow Computer Use to use "TextEdit"?', mode: 'form',
  requestedSchema: {type: 'object', properties: {}}, _meta: {connector_id: 'computer-use', codex_approval_kind: 'mcp_tool_call', tool_params: {app: 'com.apple.TextEdit'}}}};
const TEXTEDIT = 'com.apple.TextEdit', ALERT = 'com.apple.UserNotificationCenter';
const CONFIRMATION = {jsonrpc: '2.0', id: 'e2', method: 'elicitation/create', params: {message: 'Type ready once the owner granted it', mode: 'form', requestedSchema: {type: 'object', properties: {answer: {type: 'string'}}}}};

// The product as M4 built it, over a TCC table the doubles of grantRows and revokeRows edit. `fault` bends one behaviour.
function fakeProduct(fault = {}) {
  const rows = new Set(Object.keys(SERVICES));   // the setup's state: every row granted
  const log = [];
  let engine = {pid: 100, grants: null}, nextPid = 101, open = 0;
  const grantsNow = () => fault.rowsIgnored ? {accessibility: true, screenRecording: true, inputMonitoring: true, canPostHid: true}
    : {accessibility: rows.has('accessibility'), screenRecording: rows.has('screenRecording'), inputMonitoring: rows.has('inputMonitoring'), canPostHid: rows.has('postEvent')};
  engine.grants = grantsNow();
  if (fault.stoppedAtStart) engine = null;   // the setup stops the engine after its approve
  const launch = () => { engine = {pid: nextPid++, grants: grantsNow()}; };   // a row is read at launch only (H0)
  const decision = {entry: 'O0', commit: 'c'.repeat(40)};
  let jsCount = 0, alertShown = false, pendingExtra = false, clientAfter = false, unreadDone = false;
  // The screen around each cell: TextEdit (pid 500) front and key, unless a fault puts an alert or another app there.
  const screen = {
    activate: () => { log.push(['activate']); },
    sample: () => {
      if (fault.noActivation) return {front: 'com.apple.finder', keyOwnerPid: 300, appPid: 500, alertPids: []};
      if (fault.alertAfterJs === jsCount && !alertShown) { alertShown = true; return {front: ALERT, keyOwnerPid: 900, appPid: 500, alertPids: [900]}; }
      return {front: TEXTEDIT, keyOwnerPid: 500, appPid: 500, alertPids: []};
    },
  };
  const saves = [];
  const grant = (grants, deps) => {
    assert.equal(deps.env.RUNNER_ENVIRONMENT, 'github-hosted');
    assert.deepEqual(grants.map(g => [g.client, g.bundle]), [[CLIENTS.engine, BUNDLE]]);
    log.push(['grant', grants[0].services.join('+')]);
    for (const s of grants[0].services) rows.add(s);
    if (fault.baselineMoved && grants[0].services.includes('screenRecording')) launch();
    if (grants[0].services.includes('screenRecording')) pendingExtra = true;   // another restart before the retry
    return {decision, rows: [{client: CLIENTS.engine, granted: grants[0].services}], missing: fault.grantMissing ? [`${CLIENTS.engine} accessibility`] : []};
  };
  const revoke = ({client, services}, deps) => {
    assert.equal(deps.env.RUNNER_ENVIRONMENT, 'github-hosted');
    assert.equal(client, CLIENTS.engine);
    log.push(['revoke', services.join('+')]);
    for (const s of services) rows.delete(s);
    return {decision, client, removed: services, remaining: []};
  };
  const json = (value, status = 0) => ({status, stdout: `${JSON.stringify(value, null, 2)}\n`, stderr: ''});
  const cli = args => {
    log.push(['cli', args.join(' ')]);
    const command = args.join(' ');
    if (command === 'engine stop') {
      if (fault.stopBusy || (engine && open > 0)) return json({ok: false, error: {code: 'engine_busy', message: 'busy'}}, 1);
      const was = engine;
      engine = null;
      return json({ok: true, ...(was ? {wasRunning: true, pid: was.pid} : {wasRunning: false})});
    }
    const extra = (fault.extraConnection && pendingExtra) || clientAfter ? 1 : 0;
    if (command === 'engine status') { pendingExtra = false; clientAfter = false; }
    if (command === 'engine status' && fault.firstStatusUnreadInC && jsCount === 5 && !unreadDone) { unreadDone = true; return {status: 1, stdout: '', stderr: 'no answer'}; }
    if (command === 'engine status') return json({bundlePath: BUNDLE, running: Boolean(engine), status: engine ? {pid: engine.pid, connections: open + extra, build: ATTEST.build, ...engine.grants} : null});
    if (command === 'doctor') {
      const g = engine?.grants ?? {};
      const missing = Object.entries(PANES).filter(([key]) => !g[key]).map(([, pane]) => `${pane} not granted`);
      const status = fault.doctorPass ? 'pass' : missing.length ? 'fail' : g.inputMonitoring ? 'warn' : 'warn';
      const detail = [...missing, g.inputMonitoring ? 'Input Monitoring granted' : 'Input Monitoring not granted, so the engine runs with intervention detection off', 'signed ad hoc'].join('; ');
      return json({engine: {permissions: {accessibility: g.accessibility === true, screenRecording: g.screenRecording === true, inputMonitoring: g.inputMonitoring === true}},
        checks: [{name: 'engine', status, detail}]}, status === 'fail' ? 1 : 0);
    }
    throw new Error(`the driver ran cua ${command}`);
  };
  const refusal = permission => {
    const steps = `cua Engine needs ${PANES[permission]}: at the console, open System Settings → Privacy & Security → ${PANES[permission]}, click "+", press ⌘⇧G and enter ${fault.noGuidance ? '/elsewhere/x.app' : BUNDLE}, then switch it on`;
    const next = permission === 'screenRecording' ? '; a relaunch of the engine is pending before screenshots can use it. Retry after granting it.' : ', then retry.';
    return {result: {isError: true, content: [{type: 'text', text: `Error: permissionsPending (-10014): ${steps}${next}`}],
      _meta: {'cua/nativeEngine': fault.vendor ? {engine: 'vendor', version: '1.0', build: 'r'} : ATTEST, 'cua/permission': permission, 'cua/errorName': 'permissionsPending'}}};
  };
  const connect = onServerRequest => {
    log.push(['connect']);
    open++;
    let owed = null, approved = false;
    return {
      initialize: async () => {},
      js: async code => {
        const call = code.includes('getScreenshot') ? 'screenRecording' : 'accessibility';
        log.push(['js', call]);
        jsCount++;
        if (fault.timeoutAtJs === jsCount) return {timedOut: true};
        if (fault.productTimeoutAtJs === jsCount) return {result: {isError: true, content: [{type: 'text', text: TIMEOUT_SENTENCE}]}};
        if (!approved) { assert.equal(onServerRequest(CONFIRMATION).action, 'decline'); approved = onServerRequest(APPROVAL).action === 'accept'; }
        if (!engine) launch();
        // A client arriving before the retry makes the engine refuse the relaunch's shutdown (busy): no relaunch.
        if (fault.clientInWindow && jsCount === 5) clientAfter = true;
        if (owed === engine.pid && !fault.noRelaunch && !clientAfter) { launch(); owed = null; }   // client.mjs relaunchForPermissions
        const g = engine.grants;
        if (fault.screenRecordingFirst && !g.screenRecording) { owed = engine.pid; return refusal('screenRecording'); }
        if (!g.accessibility && !fault.answersWithoutGrant) return refusal('accessibility');
        if (!g.screenRecording && !fault.answersWithoutGrant) { owed = engine.pid; return refusal('screenRecording'); }
        const payload = call === 'screenRecording' ? {onboarding: true, bytes: 48_213} : {onboarding: true, bound: true};
        return {result: {content: [{type: 'text', text: `${JSON.stringify(payload)}`}], _meta: {'cua/nativeEngine': fault.vendor ? {engine: 'vendor', version: '1.0', build: 'r'} : ATTEST}}};
      },
      close: () => { log.push(['close']); open--; return fault.closeHangs ? new Promise(() => {}) : Promise.resolve({code: 0}); },
    };
  };
  const prepare = async () => ({serveEnv: {CUA_NATIVE_ENGINE: 'cua', CUA_HOME: '/Users/runner/Library/Application Support/cua'}, expected: ATTEST, bundlePath: BUNDLE, selection: {host: 'cua', reason: 'cua_engine'}});
  const enginePids = () => { log.push(['pids']); return fault.replacedInWindow ? [999] : engine ? [engine.pid] : []; };
  return {log, saves, deps: {...HOSTED, prepare, grant, revoke, cli, connect, screen, enginePids, save: record => saves.push(structuredClone(record)), sleep: async () => {}, now: () => 1_700_000_000_000, log: () => {},
    ...(fault.closeHangs ? {closeMs: 20} : {})}};
}
const run = async fault => { const product = fakeProduct(fault); return {product, record: await runOnboarding(product.deps)}; };

test('the stages: none, Accessibility, Screen Recording added, then Input Monitoring and post events last; each sets its rows, then relaunches', async () => {
  assert.deepEqual(STAGES.map(s => [s.id, s.rows.join('+'), s.relaunch]), [
    ['none', '', 'engine stop'], ['accessibility', 'accessibility', 'engine stop'],
    ['screenRecording', 'accessibility+screenRecording', 'product'], ['full', 'accessibility+screenRecording+inputMonitoring+postEvent', 'engine stop']]);
  assert.deepEqual(Object.keys(EXPECTED), STAGES.map(s => s.id), 'every stage has its expected behaviour');
  const {product, record} = await run();
  const calls = ['activate', 'js accessibility', 'cli engine status', 'activate', 'js screenRecording', 'cli engine status', 'cli doctor'];
  assert.deepEqual(product.log.map(e => e.join(' ')), [
    'revoke accessibility+screenRecording+inputMonitoring+postEvent', 'cli engine stop', 'connect', ...calls,
    'close', 'grant accessibility', 'cli engine stop', 'connect', ...calls,
    'grant screenRecording', 'activate', 'cli engine status', 'pids', ...calls.slice(1),
    'close', 'grant inputMonitoring+postEvent', 'cli engine stop', 'connect', ...calls, 'close']);
  assert.equal(record.complete, true);
  assert.equal(record.problem, null);
});

test('a relaunch at every stage: cua engine stop and a fresh session, or, for Screen Recording, the product\'s own relaunch on the same connection', async () => {
  const {record} = await run();
  assert.deepEqual(record.stages.map(s => [s.id, s.relaunch.method, s.relaunched]), [
    ['none', 'engine stop', true], ['accessibility', 'engine stop', true], ['screenRecording', 'product', true], ['full', 'engine stop', true]]);
  const [none, ax, sr, full] = record.stages;
  assert.deepEqual(none.relaunch.stop, {ok: true, wasRunning: true, pid: 100, code: null, attempts: 1});
  assert.deepEqual([none.calls[0].statusAfter.pid, ax.relaunch.stop.pid, ax.calls[0].statusAfter.pid], [101, 101, 102]);
  // Accessibility only: the bind's refusal arms the owed relaunch, which the capture makes (still no grant: refused again).
  assert.deepEqual(ax.calls.map(c => c.statusAfter.pid), [102, 103]);
  assert.deepEqual(sr.relaunch.before, {pid: 103, connections: 1}, 're-read just before the retry');
  assert.equal(sr.relaunch.refusedBy, 103, 'the engine that last refused Screen Recording in the stage before');
  assert.deepEqual(sr.calls.map(c => c.statusAfter.pid), [104, 104], 'the recovery: the product relaunched once, on the first observation after the grant');
  assert.equal(full.calls[0].statusAfter.pid, 105);
});

test('what each stage records: the rows, the answers with cua/permission and the attestation, the capabilities read, doctor\'s engine row', async () => {
  const {record} = await run();
  assert.equal(record.kind, 'hosted-onboarding');
  assert.equal(record.hosted, true);
  assert.deepEqual([record.expected, record.bundlePath, record.app], [ATTEST, BUNDLE, 'com.apple.TextEdit']);
  const [none, ax, sr, full] = record.stages;
  assert.deepEqual(none.rows, {set: [], removed: {client: CLIENTS.engine, removed: Object.keys(SERVICES), remaining: []}, granted: null, problem: null});
  assert.deepEqual(ax.rows.granted, {rows: [{client: CLIENTS.engine, granted: ['accessibility']}], missing: []});
  const call = none.calls[0];
  assert.deepEqual([call.id, call.completion, call.isError, call.metadata.permission, call.guidance, call.errorName, call.nativeEngine], ['accessibility', 'error', true, 'accessibility', true, 'permissionsPending', ATTEST]);
  assert.match(call.errorText, /permissionsPending \(-10014\): cua Engine needs Accessibility/);
  assert.deepEqual(ax.calls.map(c => [c.metadata.permission, c.guidance]), [['screenRecording', true], ['screenRecording', true]]);
  assert.deepEqual(sr.calls.map(c => [c.completion, c.isError, c.bound, c.screenshotBytes, c.errorText]), [['returned', null, true, null, null], ['returned', null, null, 48_213, null]], 'a result with no isError is no error');
  assert.deepEqual(none.status, {read: true, running: true, pid: 101, connections: 1, build: ATTEST.build, accessibility: false, screenRecording: false, inputMonitoring: false, canPostHid: false});
  assert.deepEqual(full.status, {...none.status, pid: 105, accessibility: true, screenRecording: true, inputMonitoring: true, canPostHid: true});
  assert.deepEqual(none.doctor, {received: true, permissions: {accessibility: false, screenRecording: false, inputMonitoring: false}, engineRow: {present: true, status: 'fail', interventionOff: true}});
  assert.deepEqual(full.doctor.engineRow, {present: true, status: 'warn', interventionOff: false});
});

test('it never writes an operator\'s confirmation: no engine approve, every CLI with its input closed, and every elicitation but the app\'s approval declined', async () => {
  const {product, record} = await run();
  assert.ok(product.log.every(e => e[0] !== 'cli' || ['engine stop', 'engine status', 'doctor'].includes(e[1])), 'only stop, status and doctor; never approve');
  assert.deepEqual(record.elicitations, {accepted: 3, declined: 3}, 'one app approval per connection, as a client answers it; the confirmation-shaped form declined');
  let spawned;
  const cli = cuaCli({HOME: '/Users/runner', CUA_NATIVE_ENGINE: 'cua'}, {spawn: (command, args, options) => { spawned = {command, args, options}; return {status: 0, stdout: '{}'}; }});
  cli(['engine', 'status']);
  assert.equal(spawned.command, process.execPath);
  assert.deepEqual(spawned.args.slice(1), ['engine', 'status', '--json']);
  assert.equal(spawned.options.stdio[0], 'ignore', 'a product that waits for an operator reads the end of its input, never an answer');
  assert.equal(spawned.options.env.CUA_NATIVE_ENGINE, 'cua');
  assert.throws(() => cli(['engine', 'approve']), /never runs cua engine approve/);
});

test('a transport timeout is a wait, and the session is uncertain: no further cell on it; the next stage opens a fresh one', async () => {
  const {product, record} = await run({timeoutAtJs: 1});
  const [first, second] = record.stages[0].calls;
  assert.deepEqual([first.completion, first.waited, first.waitedBy], ['timeout', true, 'transport']);
  assert.deepEqual([second.sent, second.skipped], [false, 'the session was abandoned after a call with no answer']);
  assert.equal(product.log.filter(e => e[0] === 'js').length, 1 + 2 + 2 + 2, 'nothing more sent on the uncertain session');
  assert.equal(record.complete, true);
  assert.deepEqual(record.stages.map(s => s.id), STAGES.map(s => s.id));
  const [status, reason] = judgeOnboarding(record);
  assert.equal(status, 'NO VERDICT');
  assert.match(reason, /none: accessibility call: no answer within .* nothing answered it/);
});

test('the own host\'s deadline reply (execution timed out, kernel reset) is a wait too, not a refusal; the session stays in use', async () => {
  const {product, record} = await run({productTimeoutAtJs: 1});
  const [first, second] = record.stages[0].calls;
  assert.deepEqual([first.completion, first.waited, first.waitedBy], ['timeout', true, 'product deadline']);
  assert.equal(second.sent, true);
  assert.equal(product.log.filter(e => e[0] === 'js').length, 8);
  assert.match(judgeOnboarding(record).join(' '), /^NO VERDICT none: accessibility call: no answer within/);
});

test('a wait in the Accessibility stage leaves its session uncertain: the Screen Recording stage is not set, the full stage runs on a fresh session', async () => {
  const {product, record} = await run({timeoutAtJs: 3});
  const sr = record.stages[2];
  assert.match(sr.problem, /the session of the stage before was abandoned after a call with no answer/);
  assert.deepEqual(sr.calls, []);
  assert.ok(product.log.map(e => e.join(' ')).join(',').includes('grant screenRecording,close,grant inputMonitoring+postEvent,cli engine stop,connect'), 'its rows written, then the full stage as usual');
  assert.equal(record.complete, true);
  assert.match(judgeOnboarding(record).join(' '), /^NO VERDICT .*screenRecording: not set: the session of the stage before was abandoned/);
});

test('ruling 1141 around each cell: TextEdit activated and front and key first, else the cell is not sent; an alert front or key after it is recorded', async () => {
  const {record} = await run();
  assert.deepEqual(record.stages[2].calls[1].frontKey, {activate: {app: TEXTEDIT, front: true, key: true},
    before: {front: TEXTEDIT, keyOwnerPid: 500, state: 'clear'}, after: {front: TEXTEDIT, keyOwnerPid: 500, state: 'clear'}});
  const blocked = (await run({noActivation: true})).record;
  const call = blocked.stages[0].calls[0];
  assert.deepEqual([call.sent, call.skipped, call.frontKey.activate, call.frontKey.after], [false, 'activation', {app: TEXTEDIT, front: false, key: false}, null]);
  assert.match(judgeOnboarding(blocked).join(' '), /^NO VERDICT none: accessibility call: activation: TextEdit did not take front and key/);
});

test('an otherwise successful capture with the capture alert frontmost is NO VERDICT, never a pass', async () => {
  const {record} = await run({alertAfterJs: 6});
  const capture = record.stages[2].calls[1];
  assert.deepEqual([capture.screenshotBytes, capture.frontKey.after.state], [48_213, 'alert']);
  const [status, reason] = judgeOnboarding(record);
  assert.equal(status, 'NO VERDICT');
  assert.match(reason, /screenRecording: screenRecording call: alert: com\.apple\.UserNotificationCenter front or key/);
});

test('the record is saved before cleanup, and a cleanup that never ends is bounded and recorded', async () => {
  const {product, record} = await run({closeHangs: true});
  assert.equal(record.complete, true);
  assert.equal(record.cleanup.stuck, true);
  const beforeCleanup = product.saves.find(saved => saved.complete && saved.cleanup === null);
  assert.ok(beforeCleanup, 'the complete record was saved before the last cleanup began');
  assert.deepEqual(beforeCleanup.stages.map(s => s.id), STAGES.map(s => s.id));
  assert.equal(product.saves.at(-1).cleanup.stuck, true, 'and again after it');
});

test('a stage that cannot be set stops the run, recorded: the engine stays busy at its relaunch', async () => {
  const {product, record} = await run({stopBusy: true});
  assert.equal(record.complete, false);
  assert.equal(record.stages.length, 1);
  assert.deepEqual(record.stages[0].relaunch.stop, {ok: false, wasRunning: null, pid: null, code: 'engine_busy', attempts: 5});
  assert.match(record.stages[0].problem, /the engine could not be stopped for the stage's relaunch \(engine_busy\)/);
  assert.ok(!product.log.some(e => e[0] === 'connect'), 'no session on a stage that was not set');
  assert.match(judgeOnboarding(record)[1], /none: not set: the engine could not be stopped/);
  assert.equal(judgeOnboarding(record)[0], 'NO VERDICT');
});

test('off a GitHub-hosted macOS runner it refuses before any row, command or session', async () => {
  for (const where of [{env: {}, platform: 'darwin'}, {env: {RUNNER_ENVIRONMENT: 'self-hosted'}, platform: 'darwin'}, {env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'linux'}]) {
    const product = fakeProduct();
    await assert.rejects(runOnboarding({...product.deps, ...where}), /refused/);
    assert.deepEqual(product.log, []);
  }
});

// ---- the judge ----

test('the product as M4 built it: every stage as expected, PASS', async () => {
  const {record} = await run();
  const [status, reason] = judgeOnboarding(record);
  assert.equal(status, 'PASS', reason);
  assert.match(reason, /none: refused Accessibility .*accessibility: refused Screen Recording .*screenRecording: recovered through the product's relaunch \(pid 103 → 104\).*full: .*intervention on/);
});

const verdictOf = async fault => judgeOnboarding((await run(fault)).record);
test('a wrong behaviour FAILs: a refusal naming the wrong grant, one without the steps, an answer without the grant, no relaunch, a wrong doctor row', async () => {
  for (const [fault, why] of [
    [{screenRecordingFirst: true}, /none: accessibility call: cua\/permission screenRecording, expected accessibility/],
    [{noGuidance: true}, /none: accessibility call: the refusal lacks the Accessibility grant's steps or the approved bundle's path/],
    [{answersWithoutGrant: true}, /none: accessibility call: answered where Accessibility is missing/],
    [{noRelaunch: true}, /screenRecording: the product did not relaunch the engine for the Screen Recording grant \(pid 102 throughout\)/],
    [{doctorPass: true}, /none: doctor's engine row is pass, expected fail/],
  ]) {
    const [status, reason] = await verdictOf(fault);
    assert.equal(status, 'FAIL', JSON.stringify(fault));
    assert.match(reason, why);
  }
});

test('missing proof is NO VERDICT: a vendor attestation (ruling 1149), rows the runner did not honour, a row not written, no record', async () => {
  for (const [fault, why] of [
    [{vendor: true}, /none: accessibility call: the cua side attested the vendor engine.*\(state 1\)/],
    [{vendor: true, rowsIgnored: true}, /none: accessibility call: the cua side attested the vendor engine.*; none: screenRecording call: the cua side attested the vendor engine/],
    [{rowsIgnored: true}, /none: not set: accessibility reads true with the stage's rows/],
    [{grantMissing: true}, /accessibility: not set: rows not read back: io\.github\.ssfskim\.cua\.engine accessibility/],
  ]) {
    const [status, reason] = await verdictOf(fault);
    assert.equal(status, 'NO VERDICT', `${JSON.stringify(fault)}: ${reason}`);
    assert.match(reason, why);
  }
  assert.deepEqual(judgeOnboarding(null, {path: '/o/onboarding.json', exit: 1}), ['NO VERDICT', 'no onboarding record at /o/onboarding.json (exit 1)']);
  assert.match(judgeOnboarding({kind: 'other'})[1], /not an onboarding record/);
  const {record} = await run();
  assert.match(judgeOnboarding({...record, stages: [record.stages[1], record.stages[0]]})[1], /ambiguous: its stages are accessibility, none/);
  assert.match(judgeOnboarding({...record, hosted: false})[1], /not a hosted run/);
  const other = structuredClone(record);
  other.stages[2].calls[1].nativeEngine.build = 'c'.repeat(64);
  assert.match(judgeOnboarding(other).join(' '), /NO VERDICT .*screenRecording: screenRecording call: the result attested engine cua version 0\.3\.0 build c{64} where engine cua version 0\.3\.0 build b{64} was expected/);
  const unread = structuredClone(record);
  unread.stages[3].doctor = {received: false, problem: 'exit 2'};
  assert.match(judgeOnboarding(unread).join(' '), /NO VERDICT .*full: doctor unread \(exit 2\)/);
});

test('ruling 1149\'s order: an answer on another engine anywhere is NO VERDICT before any FAIL; a FAIL outweighs other missing proof, an unattested result included', async () => {
  const fallback = (await run({noGuidance: true})).record;
  fallback.stages[3].calls[0].nativeEngine = {engine: 'vendor', version: '1', build: 'r'};
  const [status, reason] = judgeOnboarding(fallback);
  assert.equal(status, 'NO VERDICT');
  assert.match(reason, /^full: accessibility call: the cua side attested the vendor engine.*\(state 1\)/);
  const unattested = (await run({noGuidance: true})).record;
  unattested.stages[3].calls[0].nativeEngine = null;
  assert.equal(judgeOnboarding(unattested)[0], 'FAIL');
  assert.match(judgeOnboarding((await run()).record, {engine: 'vendor'}).join(' '), /^NO VERDICT the record's engine is cua, not the vendor side the step measures/);
});

test('the recovery is owed only after a Screen Recording refusal was observed: with none, its absence is NO VERDICT, not a FAIL', async () => {
  const {record} = await run({noRelaunch: true});
  for (const call of record.stages[1].calls) Object.assign(call, {completion: 'timeout', waited: true, isError: null, metadata: {...call.metadata, permission: null}});
  const [status, reason] = judgeOnboarding(record);
  assert.equal(status, 'NO VERDICT', reason);
  assert.match(reason, /screenRecording: not set: the recovery follows a Screen Recording refusal in the accessibility stage, and none was observed/);
});

test('stage none from the engine the setup left stopped: the stop finds none running, and the session\'s launch is the relaunch', async () => {
  const {record} = await run({stoppedAtStart: true});
  assert.deepEqual(record.stages[0].relaunch.stop, {ok: true, wasRunning: false, pid: null, code: null, attempts: 1});
  assert.equal(record.stages[0].relaunched, true);
  assert.equal(judgeOnboarding(record)[0], 'PASS');
});

test('missing evidence never passes and never throws: an empty record, malformed stages or calls, no read-back, no relaunch proof', async () => {
  const {record} = await run();
  const nv = (mutate, why) => {
    const copy = structuredClone(record);
    mutate(copy);
    let verdict;
    assert.doesNotThrow(() => { verdict = judgeOnboarding(copy); }, why.source);
    assert.equal(verdict[0], 'NO VERDICT', `${why.source}: ${verdict[1]}`);
    assert.match(verdict[1], why);
  };
  nv(r => { r.stages = []; }, /incomplete: 4 stage\(s\) not run/);
  nv(r => { r.stages.pop(); }, /incomplete: 1 stage\(s\) not run/);
  nv(r => { r.stages[1].calls = null; }, /accessibility: malformed: calls/);
  nv(r => { r.stages[1].calls.pop(); }, /accessibility: malformed: calls/);
  nv(r => { delete r.stages[0].calls[0].resultPresent; }, /none: malformed: accessibility call's resultPresent/);
  nv(r => { r.stages[0].calls[1].frontKey = undefined; }, /none: malformed: screenRecording call's frontKey/);
  nv(r => { r.stages[0].rows.removed = null; }, /none: not set: the rows' read-back is not recorded/);
  nv(r => { r.stages[3].rows.granted.rows[0].granted = ['inputMonitoring']; }, /full: not set: the rows' read-back is not recorded/);
  nv(r => { r.stages[1].relaunch.stop.ok = false; }, /accessibility: not set: the relaunch is not shown/);
  nv(r => { r.stages[3].relaunched = false; }, /full: not set: the relaunch is not shown/);
  nv(r => { r.stages[2] = null; }, /malformed/);
});

test('an unattested call is judged apart: its attested sibling\'s wrong permission still FAILs', async () => {
  const {record} = await run({screenRecordingFirst: true});
  record.stages[0].calls[1].nativeEngine = null;
  const [status, reason] = judgeOnboarding(record);
  assert.equal(status, 'FAIL');
  assert.match(reason, /none: accessibility call: cua\/permission screenRecording, expected accessibility/);
});

test('stage (c)\'s baseline is read just before the retry: a pid other than the one that refused, or another connection, is missing proof', async () => {
  const moved = judgeOnboarding((await run({baselineMoved: true})).record);
  assert.equal(moved[0], 'NO VERDICT', moved[1]);
  assert.match(moved[1], /screenRecording: not set: the engine before the retry \(pid 104\) is not the one that refused Screen Recording \(pid 103\)/);
  const busy = judgeOnboarding((await run({extraConnection: true})).record);
  assert.equal(busy[0], 'NO VERDICT', busy[1]);
  assert.match(busy[1], /screenRecording: not set: 2 connections at the engine before the retry/);
});

// ---- review round 2 ----

test('ruling 1141 holds on the retry too: an alert around it, or no attestation, with the pid unchanged is NO VERDICT, never "did not relaunch"', async () => {
  const alerted = judgeOnboarding((await run({noRelaunch: true, alertAfterJs: 5})).record);
  assert.equal(alerted[0], 'NO VERDICT', alerted[1]);
  assert.match(alerted[1], /screenRecording: accessibility call: alert: com\.apple\.UserNotificationCenter front or key after the cell/);
  const {record} = await run({noRelaunch: true});
  record.stages[2].calls[0].nativeEngine = null;
  const unattested = judgeOnboarding(record);
  assert.equal(unattested[0], 'NO VERDICT', unattested[1]);
  assert.doesNotMatch(unattested[1], /did not relaunch/);
});

test('ruling 1149 across the whole record: another engine\'s answer in a stage that is otherwise unreadable still outranks a FAIL elsewhere', async () => {
  const {record} = await run({noGuidance: true});
  record.stages[1].rows.granted = null;
  record.stages[1].calls[0].nativeEngine = {engine: 'vendor', version: '1', build: 'r'};
  const [status, reason] = judgeOnboarding(record);
  assert.equal(status, 'NO VERDICT', reason);
  assert.match(reason, /^accessibility: accessibility call: the cua side attested the vendor engine.*\(state 1\)/);
  delete record.stages[1].calls[0].resultPresent;
  assert.equal(judgeOnboarding(record)[0], 'NO VERDICT', 'a malformed stage is scanned too');
});

test('stage (c): TextEdit activated before the baseline, then only the socket\'s allowance, then the retry, bracketed by the engine\'s pids', async () => {
  const {product, record} = await run();
  const sr = record.stages[2];
  assert.deepEqual(sr.relaunch.atDispatch, {pids: [103]}, 'the baseline\'s engine and no other, just before the retry');
  const log = product.log.map(e => e.join(' '));
  const at = log.indexOf('grant screenRecording');
  assert.deepEqual(log.slice(at, at + 5), ['grant screenRecording', 'activate', 'cli engine status', 'pids', 'js accessibility']);
  const replaced = judgeOnboarding((await run({replacedInWindow: true})).record);
  assert.equal(replaced[0], 'NO VERDICT', replaced[1]);
  assert.match(replaced[1], /screenRecording: not set: the engine at the retry \(pids 999\) is not the baseline's \(pid 103\)/);
  const client = judgeOnboarding((await run({clientInWindow: true})).record);
  assert.equal(client[0], 'NO VERDICT', client[1]);
  assert.match(client[1], /screenRecording: 2 connections at the engine after the retry: another client may have kept the relaunch from happening/);
  const unread = (await run({firstStatusUnreadInC: true})).record;
  assert.equal(unread.stages[2].relaunched, null, 'the second cell\'s pid never stands in for the first\'s');
  assert.equal(judgeOnboarding(unread)[0], 'NO VERDICT');
});

// A real MCP-shaped child that answers initialize, never answers end_task, and ignores SIGTERM and its input's end.
const STUBBORN = `
process.on('SIGTERM', () => {});
process.stdin.on('end', () => {});
require('readline').createInterface({input: process.stdin}).on('line', line => {
  const msg = JSON.parse(line);
  if (msg.method === 'initialize') process.stdout.write(JSON.stringify({jsonrpc: '2.0', id: msg.id, result: {}}) + '\\n');
});
setInterval(() => {}, 1000);
`;
test('teardown owns its deadline through the escalation: a child that ignores SIGTERM is killed and its handles disposed within the bound', async () => {
  const session = openSession({args: ['-e', STUBBORN], env: process.env});
  await session.initialize();
  const started = Date.now();
  const closed = await disposeSession(session, {closeMs: 300, killWaitMs: 5_000});
  assert.ok(Date.now() - started < 5_000, `bounded (${Date.now() - started} ms)`);
  assert.equal(closed.stuck, true);
  assert.equal(closed.exited, true);
  assert.throws(() => process.kill(session.pid, 0), {code: 'ESRCH'}, 'the child is gone');
});
