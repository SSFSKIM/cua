// T3b's hosted staged onboarding (scripts/hosted-sittings/onboarding.mjs) and its judge (onboarding-judge.mjs): the
// stages set by cua's engine's TCC rows (none, Accessibility, Screen Recording added, then Input Monitoring and post
// events), a relaunch at every stage, the product's answers recorded, and the record judged against M4's behaviour.
// Everything here is a double: a fake product that answers as M4's code does (Skyshot.swift's order of checks,
// client.mjs's owed relaunch, doctor-engine.mjs's row), so nothing touches a TCC database, an engine or a GUI.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cuaCli, runOnboarding, STAGES} from '../../scripts/hosted-sittings/onboarding.mjs';
import {EXPECTED, judgeOnboarding} from '../../scripts/hosted-sittings/onboarding-judge.mjs';
import {CLIENTS, SERVICES} from '../../scripts/hosted-sittings/tcc.mjs';

const HOSTED = {env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'darwin'};
const BUNDLE = '/Users/runner/Library/Application Support/cua/engine/cua Engine.app';
const ATTEST = {engine: 'cua', version: '0.3.0', build: 'b'.repeat(64)};
const PANES = {accessibility: 'Accessibility', screenRecording: 'Screen & System Audio Recording'};
const APPROVAL = {jsonrpc: '2.0', id: 'e1', method: 'elicitation/create', params: {message: 'Allow Computer Use to use "TextEdit"?', mode: 'form',
  requestedSchema: {type: 'object', properties: {}}, _meta: {connector_id: 'computer-use', codex_approval_kind: 'mcp_tool_call', tool_params: {app: 'com.apple.TextEdit'}}}};
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
  const grant = (grants, deps) => {
    assert.equal(deps.env.RUNNER_ENVIRONMENT, 'github-hosted');
    assert.deepEqual(grants.map(g => [g.client, g.bundle]), [[CLIENTS.engine, BUNDLE]]);
    log.push(['grant', grants[0].services.join('+')]);
    for (const s of grants[0].services) rows.add(s);
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
    if (command === 'engine status') return json({bundlePath: BUNDLE, running: Boolean(engine), status: engine ? {pid: engine.pid, connections: open, build: ATTEST.build, ...engine.grants} : null});
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
        if (fault.timeout === call && log.filter(e => e[0] === 'js').length <= 2) return {timedOut: true};
        if (!approved) { assert.equal(onServerRequest(CONFIRMATION).action, 'decline'); approved = onServerRequest(APPROVAL).action === 'accept'; }
        if (!engine) launch();
        if (owed === engine.pid && !fault.noRelaunch) { launch(); owed = null; }   // client.mjs relaunchForPermissions
        const g = engine.grants;
        if (fault.screenRecordingFirst && !g.screenRecording) { owed = engine.pid; return refusal('screenRecording'); }
        if (!g.accessibility && !fault.answersWithoutGrant) return refusal('accessibility');
        if (!g.screenRecording && !fault.answersWithoutGrant) { owed = engine.pid; return refusal('screenRecording'); }
        const payload = call === 'screenRecording' ? {onboarding: true, bytes: 48_213} : {onboarding: true, bound: true};
        return {result: {content: [{type: 'text', text: `${JSON.stringify(payload)}`}], _meta: {'cua/nativeEngine': fault.vendor ? {engine: 'vendor', version: '1.0', build: 'r'} : ATTEST}}};
      },
      close: async () => { log.push(['close']); open--; return {code: 0}; },
    };
  };
  const prepare = async () => ({serveEnv: {CUA_NATIVE_ENGINE: 'cua', CUA_HOME: '/Users/runner/Library/Application Support/cua'}, expected: ATTEST, bundlePath: BUNDLE, selection: {host: 'cua', reason: 'cua_engine'}});
  return {log, deps: {...HOSTED, prepare, grant, revoke, cli, connect, sleep: async () => {}, now: () => 1_700_000_000_000, log: () => {}}};
}
const run = async fault => { const product = fakeProduct(fault); return {product, record: await runOnboarding(product.deps)}; };

test('the stages: none, Accessibility, Screen Recording added, then Input Monitoring and post events last; each sets its rows, then relaunches', async () => {
  assert.deepEqual(STAGES.map(s => [s.id, s.rows.join('+'), s.relaunch]), [
    ['none', '', 'engine stop'], ['accessibility', 'accessibility', 'engine stop'],
    ['screenRecording', 'accessibility+screenRecording', 'product'], ['full', 'accessibility+screenRecording+inputMonitoring+postEvent', 'engine stop']]);
  assert.deepEqual(Object.keys(EXPECTED), STAGES.map(s => s.id), 'every stage has its expected behaviour');
  const {product, record} = await run();
  const calls = ['js accessibility', 'cli engine status', 'js screenRecording', 'cli engine status', 'cli doctor'];
  assert.deepEqual(product.log.map(e => e.join(' ')), [
    'revoke accessibility+screenRecording+inputMonitoring+postEvent', 'cli engine stop', 'connect', ...calls,
    'close', 'grant accessibility', 'cli engine stop', 'connect', ...calls,
    'grant screenRecording', ...calls,
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
  assert.deepEqual(sr.relaunch.before, {pid: 103, connections: 1});
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

test('a call the product holds past its bound is recorded as a wait, and the driver moves on to the next stage', async () => {
  const {product, record} = await run({timeout: 'accessibility'});
  assert.equal(record.stages[0].calls[0].completion, 'timeout');
  assert.equal(record.stages[0].calls[0].waited, true);
  assert.equal(record.complete, true);
  assert.deepEqual(record.stages.map(s => s.id), STAGES.map(s => s.id));
  assert.ok(product.log.some(e => e.join(' ') === 'grant accessibility'));
  const [status, reason] = judgeOnboarding(record);
  assert.equal(status, 'NO VERDICT');
  assert.match(reason, /none: accessibility call: no answer within .* nothing answered it/);
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
