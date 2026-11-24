// Sitting C's key-route diagnostic (ruling 1198; scripts/hosted-sittings/key-route.mjs): its own step after the counted
// lanes, a diagnostic whose status is INFO and never C's verdict, save a cleanup failure, which is a FAIL by name; Input
// Monitoring written for its own tap app alone through the guarded TCC writer, the engines' rows read before and after
// and compared; off a GitHub-hosted runner it refuses before it writes or opens anything. Nothing here touches a real
// TCC database, a GUI or an engine: every store and device is a spy.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {CHECKS} from '../../scripts/hosted-sittings/checks.mjs';
import {keyRouteSummary, renderKeyRoute, runKeyRoute} from '../../scripts/hosted-sittings/key-route.mjs';
import {stepSections} from '../../scripts/hosted-sittings/key-route-report.mjs';
import {sittingPlan} from '../../scripts/hosted-sittings/plan.mjs';
import {runSitting} from '../../scripts/hosted-sittings/run.mjs';
import {CLIENTS, DIAGNOSTIC_CLIENT, engineRows, grantDiagnosticListen, O0_COMMIT, rowsChanged, SERVICES, SYSTEM_DB} from '../../scripts/hosted-sittings/tcc.mjs';
import {TAP_APP, TAP_BUNDLE_ID} from '../../scripts/native-matrix/key-route-device.mjs';

const CTX = {commit: 'c'.repeat(40), out: '/w/out', approvedRuntime: '/Users/runner/Library/Application Support/cua',
  approvedEngine: '/Users/runner/Library/Application Support/cua/engine/cua Engine.app', runId: '45144483807-1', olderNode: null, scratch: '/t/scratch', flipped: false};
const O0 = '- Decision (2026-11-23, the owner: TCC rows may be written by kits on GitHub-hosted runners only, never on any of the\n  owner\'s Macs (O0; ruling 1111)): a kit that writes a TCC row refuses, before any write, unless …\n';
const SPEC = `# Design\n\n## Decision Log\n\n${O0}\n## Outcomes\n`;
const HOSTED = {env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'darwin', decisionLog: () => ({sha: O0_COMMIT, text: SPEC})};

function spyStore({rows = []} = {}) {
  const calls = [];
  return {calls, store: {
    exists: path => { calls.push(['exists', path]); return true; },
    csreq: bundle => { calls.push(['csreq', bundle]); return 'fade'; },
    sql: (db, statement) => { calls.push(['sql', db, statement]); return statement.startsWith('select') ? (typeof rows === 'function' ? rows(statement) : rows.join('\n')) : ''; },
  }};
}

test('C: the key-route diagnostic is its own step, the last, after the counted lanes and their judges; never counted, in both forms', () => {
  for (const pilot of [false, true]) {
    const plan = sittingPlan('c', {...CTX, pilot});
    const step = plan.steps.at(-1);
    assert.equal(step.id, 'key-route');
    assert.deepEqual([step.kind, step.check], ['diagnostic', 'diagnostic']);
    assert.deepEqual(step.argv, ['node', 'scripts/hosted-sittings.mjs', 'key-route', '--approved-runtime', CTX.approvedRuntime, '--approved-engine', CTX.approvedEngine,
      '--sitting', 'hosted-45144483807-1-c', '--out', '/w/out/key-route']);
    assert.deepEqual([step.report, step.section, step.record], ['/w/out/key-route/key-route.json', '/w/out/key-route/key-route.md', undefined],
      'read by its own check and section, never by the alert guard\'s tally of run records');
    assert.ok(plan.steps.findIndex(s => s.id === 'compare') < plan.steps.length - 1 && plan.steps.slice(0, -1).every(s => s.id !== 'key-route'));
    assert.ok(!plan.counts.some(dir => dir.includes('key-route')), 'its lanes are no counted lane');
    assert.equal(step.needs, undefined, 'it runs whatever the lanes before it did: its own preflight refuses what they left');
  }
});

test('the diagnostic check: INFO with what it recorded; a cleanup failure FAIL by name; a record not written FAIL, its cleanup unconfirmed', () => {
  const step = {report: '/w/out/key-route/key-route.json'};
  const record = {cleanup: {ok: true, failures: []}, engines: {vendor: {keyRoute: {press: {sent: true}, closed: true, after: {up: false}, tap: {stop: {events: [{label: 'panelService', target: 700, source: 600}]}}}},
    cua: {keyRoute: {press: {sent: true}, after: {up: true}, cancel: {closed: true}, closed: true, tap: {stop: {events: [{label: 'textedit', target: 500, source: 800}]}}}}}};
  const [status, reason] = CHECKS.diagnostic(step, {exit: 0, readJson: () => record});
  assert.equal(status, 'INFO');
  assert.match(reason, /vendor: Escape posted to pid 700 by pid 600, seen by the panelService tap, the panel closed by it/);
  assert.match(reason, /cua: Escape posted to pid 500 by pid 800, seen by the textedit tap, the panel not closed by it/);
  const failed = CHECKS.diagnostic(step, {exit: 1, readJson: () => ({...record, cleanup: {ok: false, failures: ['the tap app (pid 9) did not exit', 'TextEdit still running (pid 5)']}})});
  assert.deepEqual(failed, ['FAIL', 'cleanup: the tap app (pid 9) did not exit; TextEdit still running (pid 5)']);
  assert.deepEqual(CHECKS.diagnostic(step, {exit: 1, readJson: () => null}), ['FAIL', 'the diagnostic\'s record /w/out/key-route/key-route.json was not written (exit 1): its cleanup is unconfirmed']);
});

test('sitting.md carries the diagnostic\'s section as it wrote it, or names it unwritten with the step\'s status', () => {
  const steps = [{id: 'compare', label: 'c'}, {id: 'key-route', label: 'the key-route diagnostic', section: '/w/out/key-route/key-route.md'}];
  assert.deepEqual(stepSections(steps, {steps: [{id: 'key-route', status: 'INFO'}]}, {read: path => `# from ${path}\n`}), ['# from /w/out/key-route/key-route.md\n']);
  assert.deepEqual(stepSections(steps, {steps: [{id: 'key-route', status: 'FAIL'}]}, {read: () => null}), ['## the key-route diagnostic\n\nIts section was not written (the step: FAIL).\n']);
});

test('in a sitting the diagnostic\'s INFO never changes the verdict; its cleanup failure does, by name', async () => {
  const plan = steps => ({sitting: 'c', form: 'full', title: 't', proves: 'p', steps});
  const diag = {id: 'key-route', label: 'k', kind: 'diagnostic', check: 'diagnostic', report: '/r.json', argv: ['x']};
  const sit = (steps, file) => runSitting(plan(steps), {out: '/w/out', exec: async () => ({exit: 0}), keep: () => {}, readText: () => '', readJson: () => file, exists: () => true,
    remove: () => {}, now: () => 0, log: () => {}});
  const info = await sit([{id: 'a', label: 'a', kind: 'run', argv: ['x']}, diag], {cleanup: {ok: true, failures: []}, engines: {}});
  assert.deepEqual([info.steps[1].status, info.verdict, info.exit], ['INFO', 'PASS', 0]);
  const dirty = await sit([diag], {cleanup: {ok: false, failures: ['an Open panel window still on screen']}, engines: {}});
  assert.deepEqual([dirty.steps[0].status, dirty.steps[0].reason, dirty.verdict, dirty.exit], ['FAIL', 'cleanup: an Open panel window still on screen', 'FAIL', 1]);
});

// The orchestrator on doubles: every device and store call recorded in order.
function hostedIo({rowsBefore = ['a'], rowsAfter = rowsBefore, leftovers = [{tap: [], textedit: [], panels: 0}], results = {}, buildTap, grantTap} = {}) {
  const calls = [], written = {};
  let rowReads = 0, leftoverReads = 0;
  const io = {
    env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'darwin', log: () => {},
    engineRows: () => { calls.push(['engineRows']); const rows = rowReads++ === 0 ? rowsBefore : rowsAfter; if (rows instanceof Error) throw rows; return rows; },
    buildTap: buildTap ?? (() => { calls.push(['buildTap']); return {app: TAP_APP, bundleId: TAP_BUNDLE_ID}; }),
    grantTap: grantTap ?? (app => { calls.push(['grantTap', app]); return {client: DIAGNOSTIC_CLIENT, granted: true}; }),
    runEngine: async (engine, dir) => { calls.push(['runEngine', engine, dir]); return results[engine]?.exit ?? 0; },
    readJson: path => results[path.split('/').at(-3)]?.result ?? {complete: true, problems: [], meta: {keyRoute: {engine: path.split('/').at(-3), closed: true, cleanup: []}}},
    leftovers: () => { calls.push(['leftovers']); return leftovers[Math.min(leftoverReads++, leftovers.length - 1)]; },
    stopTap: pids => { calls.push(['stopTap', pids]); },
    write: (path, text) => { written[path] = text; },
  };
  return {io, calls, written};
}
const OPTIONS = {approvedRuntime: CTX.approvedRuntime, approvedEngine: CTX.approvedEngine, sitting: 'hosted-1-c', out: '/w/out/key-route'};

test('off a GitHub-hosted runner it refuses before it reads, builds, writes or opens anything', async () => {
  for (const [env, platform] of [[{}, 'darwin'], [{RUNNER_ENVIRONMENT: 'self-hosted'}, 'darwin'], [{RUNNER_ENVIRONMENT: 'github-hosted'}, 'linux']]) {
    const {io, calls, written} = hostedIo();
    await assert.rejects(runKeyRoute(OPTIONS, {...io, env, platform}), /the key-route diagnostic: refused: .*GitHub-hosted/);
    assert.deepEqual(calls, []);
    assert.deepEqual(written, {});
  }
  // The command itself, with RUNNER_ENVIRONMENT cleared (a hosted CI job's own is never handed on): exit 2, no output made.
  const out = join(mkdtempSync(join(tmpdir(), 'key-route-')), 'out');
  try {
    const cli = spawnSync(process.execPath, ['scripts/hosted-sittings.mjs', 'key-route', '--approved-runtime', '/H', '--approved-engine', '/H/e.app', '--sitting', 's', '--out', out],
      {cwd: new URL('../..', import.meta.url), env: {...process.env, RUNNER_ENVIRONMENT: ''}, encoding: 'utf8'});
    assert.equal(cli.status, 2);
    assert.match(cli.stderr, /the key-route diagnostic: refused: it runs only on a GitHub-hosted runner/);
    assert.equal(existsSync(out), false);
  } finally { rmSync(dirname(out), {recursive: true, force: true}); }
});

test('on the runner: the engines\' rows read, the tap built and granted, vendor then cua each in its own lane, the rows read again, then the leftovers; recorded INFO', async () => {
  const {io, calls, written} = hostedIo();
  const code = await runKeyRoute(OPTIONS, io);
  assert.equal(code, 0);
  assert.deepEqual(calls, [['engineRows'], ['buildTap'], ['grantTap', TAP_APP], ['runEngine', 'vendor', '/w/out/key-route/vendor'], ['runEngine', 'cua', '/w/out/key-route/cua'],
    ['engineRows'], ['leftovers']]);
  const report = JSON.parse(written['/w/out/key-route/key-route.json']);
  assert.deepEqual(report.cleanup, {ok: true, failures: []});
  assert.deepEqual(report.tcc.engines, {unchanged: true, rows: 1});
  assert.deepEqual(Object.keys(report.engines), ['vendor', 'cua']);
  assert.equal(report.engines.vendor.keyRoute.engine, 'vendor');
  assert.match(written['/w/out/key-route/key-route.md'], /^## The key-route diagnostic \(ruling 1198\)/);
});

test('the engines\' rows changed, or unread, is a failure by name; so is a cleanup an engine\'s lane reported, and anything left on screen', async () => {
  const changed = hostedIo({rowsBefore: ['kTCCServiceListenEvent|io.github.ssfskim.cua.engine|0'], rowsAfter: ['kTCCServiceListenEvent|io.github.ssfskim.cua.engine|2']});
  assert.equal(await runKeyRoute(OPTIONS, changed.io), 1);
  assert.deepEqual(JSON.parse(changed.written['/w/out/key-route/key-route.json']).cleanup.failures,
    ['the engines\' TCC rows changed during the diagnostic: added kTCCServiceListenEvent|io.github.ssfskim.cua.engine|2; removed kTCCServiceListenEvent|io.github.ssfskim.cua.engine|0']);
  const unread = hostedIo({rowsBefore: new Error('sudo: a password is required')});
  assert.equal(await runKeyRoute(OPTIONS, unread.io), 1);
  assert.deepEqual(JSON.parse(unread.written['/w/out/key-route/key-route.json']).cleanup.failures, ['the engines\' TCC rows could not be read before the diagnostic (sudo: a password is required): unchanged is unproven']);
  const lane = hostedIo({results: {cua: {exit: 1, result: {complete: false, problems: ['stopped'], meta: {keyRoute: {engine: 'cua', closed: false, cleanup: ['TextEdit\'s Open panel stayed up after the AX cancel']}}}}}});
  assert.equal(await runKeyRoute(OPTIONS, lane.io), 1);
  assert.deepEqual(JSON.parse(lane.written['/w/out/key-route/key-route.json']).cleanup.failures, ['cua\'s lane: TextEdit\'s Open panel stayed up after the AX cancel']);
  // The tap still running is stopped (its own process), then read again; TextEdit and a panel window are only named.
  const left = hostedIo({leftovers: [{tap: [41], textedit: [5], panels: 1}, {tap: [], textedit: [5], panels: 1}]});
  assert.equal(await runKeyRoute(OPTIONS, left.io), 1);
  assert.deepEqual(left.calls.slice(-3), [['leftovers'], ['stopTap', [41]], ['leftovers']]);
  assert.deepEqual(JSON.parse(left.written['/w/out/key-route/key-route.json']).cleanup.failures, ['TextEdit still running (pid 5)', 'an Open panel window still on screen (1)']);
  const stuck = hostedIo({leftovers: [{tap: [41], textedit: [], panels: 0}]});
  assert.equal(await runKeyRoute(OPTIONS, stuck.io), 1);
  assert.deepEqual(JSON.parse(stuck.written['/w/out/key-route/key-route.json']).cleanup.failures, ['the tap app still running after it was stopped (pid 41)']);
});

test('a tap that could not be built or granted is recorded, and both lanes still run: the AX half and the panel\'s close stand without it', async () => {
  const {io, calls, written} = hostedIo({buildTap: () => { throw new Error('swiftc failed'); }});
  assert.equal(await runKeyRoute(OPTIONS, io), 0);
  assert.deepEqual(calls.filter(c => c[0] === 'runEngine').map(c => c[1]), ['vendor', 'cua']);
  assert.deepEqual(JSON.parse(written['/w/out/key-route/key-route.json']).tap, {error: 'swiftc failed'});
});

test('the TCC writer is asked for the diagnostic\'s own identity only: every write names its tap app and Input Monitoring, never an engine', async () => {
  const {store, calls} = spyStore({rows: statement => (statement.includes(DIAGNOSTIC_CLIENT) ? `kTCCServiceListenEvent|${DIAGNOSTIC_CLIENT}|2` : 'kTCCServiceAccessibility|io.github.ssfskim.cua.engine|2|4|1|FADE|0|1')});
  const {io} = hostedIo({grantTap: app => grantDiagnosticListen({bundle: app}, {...HOSTED, store, log: () => {}})});
  io.engineRows = () => engineRows({...HOSTED, store});
  assert.equal(await runKeyRoute(OPTIONS, io), 0);
  const writes = calls.filter(([kind, , statement]) => kind === 'sql' && !statement.startsWith('select'));
  assert.equal(writes.length, 1);
  assert.match(writes[0][2], new RegExp(`^insert or replace into access .* values \\('kTCCServiceListenEvent', '${DIAGNOSTIC_CLIENT.replaceAll('.', '\\.')}', 0, 2, 4, 1, X'fade'`));
  for (const client of Object.values(CLIENTS)) assert.ok(!writes[0][2].includes(client), `no write names ${client}`);
  assert.deepEqual(calls.filter(([kind]) => kind === 'csreq'), [['csreq', TAP_APP]]);
});

test('grantDiagnosticListen: hosted and under O0 only, the tap app\'s Input Monitoring row alone, read back', () => {
  const off = spyStore();
  assert.throws(() => grantDiagnosticListen({bundle: TAP_APP}, {...HOSTED, env: {}, store: off.store, decisionLog: () => { throw new Error('read before the guard'); }}), /refused: .*GitHub-hosted/);
  assert.deepEqual(off.calls, []);
  const {store, calls} = spyStore({rows: [`kTCCServiceListenEvent|${DIAGNOSTIC_CLIENT}|2`]});
  const grant = grantDiagnosticListen({bundle: TAP_APP}, {...HOSTED, store, log: () => {}, now: () => 1_700_000_000_000});
  assert.deepEqual([grant.client, grant.service, grant.granted, grant.decision.commit], [DIAGNOSTIC_CLIENT, SERVICES.inputMonitoring, true, O0_COMMIT]);
  assert.ok(calls.filter(c => c[0] === 'sql').every(c => c[1] === SYSTEM_DB));
  const none = spyStore({rows: []});
  assert.equal(grantDiagnosticListen({bundle: TAP_APP}, {...HOSTED, store: none.store, log: () => {}}).granted, false);
  assert.throws(() => grantDiagnosticListen({}, {...HOSTED, store: spyStore().store}), /its tap app's bundle only/);
  assert.equal(DIAGNOSTIC_CLIENT, TAP_BUNDLE_ID);
});

test('engineRows: hosted only, a read of the engines\' rows alone; rowsChanged names what was added and removed', () => {
  const off = spyStore();
  assert.throws(() => engineRows({env: {}, platform: 'darwin', store: off.store}), /refused: .*GitHub-hosted/);
  assert.deepEqual(off.calls, []);
  const {store, calls} = spyStore({rows: ['b|x', 'a|y']});
  assert.deepEqual(engineRows({...HOSTED, store}), ['a|y', 'b|x']);
  const sql = calls.filter(c => c[0] === 'sql');
  assert.equal(sql.length, 1);
  assert.match(sql[0][2], /^select service, client, auth_value, auth_reason, auth_version, hex\(csreq\), flags, last_modified from access where client in \('io\.github\.ssfskim\.cua\.engine', 'com\.openai\.sky\.CUAService'\)/);
  assert.deepEqual(rowsChanged(['a', 'b'], ['a', 'b']), null);
  assert.deepEqual(rowsChanged(['a', 'b'], ['b', 'c']), {added: ['c'], removed: ['a']});
});

test('the section: per engine the Escape\'s posted and receiving pids and the panel; the AX ancestors; cua\'s keyboardTarget; every public route against ActualPid', () => {
  const ax = {trusted: true, pid: 500, actualPidAvailable: true, actualPid: 700, cuaKeyboardTarget: 500, staticReadingTarget: 700,
    chain: [{depth: 0, role: 'AXTextField', pid: 500, actualPid: 700}, {depth: 1, role: 'AXWindow', pid: 500, actualPid: 700}, {depth: 2, role: 'AXApplication', pid: 500, actualPid: 500}],
    processes: {500: {running: true, bundleId: 'com.apple.TextEdit', activationPolicy: 'regular', finishedLaunching: true}, 700: {running: true, bundleId: 'com.apple.appkit.xpc.openAndSavePanelService', activationPolicy: 'prohibited', finishedLaunching: true}},
    routes: [{route: 'runningApplicationsPanelService', pids: [700], matchesActual: true, how: 'h'}, {route: 'windowListAtPanelFrame', pids: [500], matchesActual: false, how: 'h'}]};
  const report = {ruling: 1198, tap: {app: TAP_APP, bundleId: TAP_BUNDLE_ID, grant: {granted: true}}, tcc: {engines: {unchanged: true, rows: 8}}, cleanup: {ok: true, failures: []},
    engines: {vendor: {exit: 0, keyRoute: {engine: 'vendor', opened: {ok: true}, ax, press: {sent: true, at: [1, 2], closedByEngineView: true}, after: {up: false}, closed: true,
      tap: {start: {ready: true, listenAccess: true, taps: [{label: 'textedit', pid: 500, created: true}, {label: 'panelService', pid: 700, created: true}]}, stop: {exited: true, events: [{label: 'panelService', tapPid: 700, target: 700, source: 600, at: 2}]}}}},
    cua: {exit: 0, keyRoute: {engine: 'cua', opened: {ok: true}, ax, press: {sent: true, at: [1, 2], closedByEngineView: false}, after: {up: true}, cancel: {via: 'cancelButton', closed: true}, closed: true,
      tap: {start: {ready: true, listenAccess: true, taps: []}, stop: {exited: true, events: [{label: 'textedit', tapPid: 500, target: 500, source: 800, at: 2}]}}}}}};
  const md = renderKeyRoute(report);
  assert.match(md, /^\| vendor \| yes \| 700 \| 600 \| panelService \| yes \| \|$/m);
  assert.match(md, /^\| cua \| yes \| 500 \| 800 \| textedit \| no \(closed by the AX cancel: cancelButton\) \| \|$/m);
  assert.match(md, /^\| 0 \| AXTextField \| 500 \| 700 \| com\.apple\.appkit\.xpc\.openAndSavePanelService \| prohibited \| yes \|$/m);
  assert.match(md, /cua's keyboardTarget \(native\/engine\/Sources\/Engine\/Input\.swift:1014\): pid 500; the focused element's ActualPid: 700; the static reading's rule: pid 700/);
  assert.match(md, /^\| windowListAtPanelFrame \| 500 \| no \|$/m);
  assert.match(md, /Input Monitoring granted to io\.github\.ssfskim\.cua\.key-route-tap: yes\. The engines' TCC rows: unchanged \(8 rows\)\./);
  assert.match(md, /Cleanup: confirmed\./);
  assert.equal(keyRouteSummary(report), 'vendor: Escape posted to pid 700 by pid 600, seen by the panelService tap, the panel closed by it; cua: Escape posted to pid 500 by pid 800, seen by the textedit tap, the panel not closed by it');
});
