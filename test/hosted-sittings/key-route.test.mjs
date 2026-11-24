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
import {KEY_ROUTE_BUDGET_MS, KEY_ROUTE_RESERVE_MS, keyRouteSummary, LANE_GRACE_MS, LANE_MIN_MS, LANE_TIMEOUT_MS, pgrepPids, renderKeyRoute, runKeyRoute} from '../../scripts/hosted-sittings/key-route.mjs';
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
// A store whose access table has `columns` and holds `tuples` (each the row as SQL's quote() spells its values).
const hex = text => Buffer.from(text, 'utf8').toString('hex').toUpperCase();
const tableStore = (columns, tuples) => spyStore({rows: statement => (statement.includes('pragma_table_info') ? columns.join('\n') : tuples.map(t => hex(t)).join('\n'))});

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

// A lane's taps as they worked: started ready with Input Monitoring and every tap created, stopped with their log read.
const tapOf = (events, {start = {}, stop = {}} = {}) => ({start: {launched: true, ready: true, pid: 41, listenAccess: true, taps: [{label: 'textedit', pid: 500, created: true}, {label: 'panelService', pid: 700, created: true}], ...start},
  stop: {exited: true, killed: false, why: 'stop', logRead: true, ready: true, events, ...stop}});
const PRESSED = {sent: true, at: [1_000, 1_010]};

test('the diagnostic check: INFO with what it recorded; a cleanup failure FAIL by name; a record not written FAIL, its cleanup unconfirmed', () => {
  const step = {report: '/w/out/key-route/key-route.json'};
  const record = {cleanup: {ok: true, failures: []}, engines: {vendor: {keyRoute: {press: PRESSED, closed: true, after: {up: false}, tap: tapOf([{label: 'panelService', target: 700, source: 600, at: 1_005}])}},
    cua: {keyRoute: {press: PRESSED, after: {up: true}, cancel: {closed: true}, closed: true, tap: tapOf([{label: 'textedit', target: 500, source: 800, at: 1_005}])}}}};
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

// The orchestrator on doubles: every device and store call recorded in order. `results[engine]`: {lane (runEngine's
// answer), result (its result.json; null: not written), takesMs (the clock it moves)}; rows are the access tuples.
const laneResult = (engine, over = {}) => ({complete: true, problems: [], verdict: 'no-verdict', putBack: {ok: true, stopped: true},
  ...over, meta: {preparationCleanup: {removed: true}, keyRoute: {engine, closed: true, cleanup: []}, ...over.meta}});
function hostedIo({rowsBefore = ['a'], rowsAfter = rowsBefore, leftovers = [{tap: [], textedit: [], panels: 0}], results = {}, buildTap, grantTap, startMs = 0} = {}) {
  const calls = [], written = {}, bounds = {};
  let rowReads = 0, leftoverReads = 0, clock = startMs;
  const io = {
    env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'darwin', log: () => {}, now: () => clock,
    engineRows: () => { calls.push(['engineRows']); const rows = rowReads++ === 0 ? rowsBefore : rowsAfter; if (rows instanceof Error) throw rows; return {columns: ['service'], rows}; },
    buildTap: buildTap ?? (() => { calls.push(['buildTap']); return {app: TAP_APP, bundleId: TAP_BUNDLE_ID}; }),
    grantTap: grantTap ?? (app => { calls.push(['grantTap', app]); return {client: DIAGNOSTIC_CLIENT, granted: true}; }),
    runEngine: async (engine, dir, {timeoutMs}) => {
      calls.push(['runEngine', engine, dir]);
      bounds[engine] = timeoutMs;
      clock += results[engine]?.takesMs ?? 60_000;
      return results[engine]?.lane ?? {exit: 1, signal: null, timedOut: false};
    },
    readJson: path => { const engine = path.split('/').at(-3); return results[engine] && 'result' in results[engine] ? results[engine].result : laneResult(engine); },
    leftovers: () => { calls.push(['leftovers']); return leftovers[Math.min(leftoverReads++, leftovers.length - 1)]; },
    stopTap: pids => { calls.push(['stopTap', pids]); },
    write: (path, text) => { written[path] = text; },
  };
  return {io, calls, written, bounds};
}
const failuresOf = written => JSON.parse(written['/w/out/key-route/key-route.json']).cleanup.failures;
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
  const changed = hostedIo({rowsBefore: ["('kTCCServiceListenEvent', 'io.github.ssfskim.cua.engine', 0)"], rowsAfter: ["('kTCCServiceListenEvent', 'io.github.ssfskim.cua.engine', 2)"]});
  assert.equal(await runKeyRoute(OPTIONS, changed.io), 1);
  assert.deepEqual(failuresOf(changed.written),
    ['the engines\' TCC rows changed during the diagnostic: added (\'kTCCServiceListenEvent\', \'io.github.ssfskim.cua.engine\', 2); removed (\'kTCCServiceListenEvent\', \'io.github.ssfskim.cua.engine\', 0)']);
  const unread = hostedIo({rowsBefore: new Error('sudo: a password is required')});
  assert.equal(await runKeyRoute(OPTIONS, unread.io), 1);
  assert.deepEqual(failuresOf(unread.written), ['the engines\' TCC rows could not be read before the diagnostic (sudo: a password is required): unchanged is unproven']);
  const lane = hostedIo({results: {cua: {result: laneResult('cua', {complete: false, problems: ['stopped'], meta: {keyRoute: {engine: 'cua', closed: false, cleanup: ['TextEdit\'s Open panel stayed up after the AX cancel']}}})}}});
  assert.equal(await runKeyRoute(OPTIONS, lane.io), 1);
  assert.deepEqual(failuresOf(lane.written), ['cua\'s lane: TextEdit\'s Open panel stayed up after the AX cancel']);
  // The tap still running is stopped (its own process), then read again; TextEdit and a panel window are only named.
  const left = hostedIo({leftovers: [{tap: [41], textedit: [5], panels: 1}, {tap: [], textedit: [5], panels: 1}]});
  assert.equal(await runKeyRoute(OPTIONS, left.io), 1);
  assert.deepEqual(left.calls.slice(-3), [['leftovers'], ['stopTap', [41]], ['leftovers']]);
  assert.deepEqual(JSON.parse(left.written['/w/out/key-route/key-route.json']).cleanup.failures, ['TextEdit still running (pid 5)', 'an Open panel window still on screen (1)']);
  const stuck = hostedIo({leftovers: [{tap: [41], textedit: [], panels: 0}]});
  assert.equal(await runKeyRoute(OPTIONS, stuck.io), 1);
  assert.deepEqual(JSON.parse(stuck.written['/w/out/key-route/key-route.json']).cleanup.failures, ['the tap app still running after it was stopped (pid 41)']);
});

test('a lane whose result is missing, whose put-back did not hold, or whose approved home was not cleaned is a failure by name; a refused lane changed nothing', async () => {
  const missing = hostedIo({results: {vendor: {result: null, lane: {exit: 1, signal: null, timedOut: false}}}});
  assert.equal(await runKeyRoute(OPTIONS, missing.io), 1);
  assert.deepEqual(failuresOf(missing.written), ['vendor\'s lane wrote no result (exit 1): its put-back and cleanup are unconfirmed']);
  for (const [putBack, named] of [[{ok: false, stopped: false, manual: 'quit TextEdit by hand'}, 'quit TextEdit by hand'], [{ok: false, stopped: false, error: 'ssh: lost'}, 'ssh: lost'], [undefined, 'none recorded']]) {
    const io = hostedIo({results: {cua: {result: laneResult('cua', {putBack})}}});
    assert.equal(await runKeyRoute(OPTIONS, io.io), 1);
    assert.deepEqual(failuresOf(io.written), [`cua's lane: its put-back did not hold (${named})`]);
  }
  const home = hostedIo({results: {cua: {result: laneResult('cua', {meta: {preparationCleanup: {removed: false}}})}}});
  assert.equal(await runKeyRoute(OPTIONS, home.io), 1);
  assert.deepEqual(failuresOf(home.written), ['cua\'s lane: its approved home\'s cleanup was not confirmed']);
  const refused = hostedIo({results: {cua: {result: {complete: false, problems: ['refused'], verdict: 'refused', meta: {}}}}});
  assert.equal(await runKeyRoute(OPTIONS, refused.io), 0);
});

test('each lane is bounded, the whole diagnostic too: a lane past its bound is stopped and named; a lane with no time left is skipped, recorded', async () => {
  const {io, bounds, written} = hostedIo({results: {vendor: {lane: {exit: 143, signal: null, timedOut: true}, takesMs: LANE_TIMEOUT_MS + LANE_GRACE_MS}}});
  assert.equal(await runKeyRoute(OPTIONS, io), 1);
  assert.equal(bounds.vendor, LANE_TIMEOUT_MS);
  assert.ok(failuresOf(written).includes(`vendor's lane ran past its bound (${LANE_TIMEOUT_MS / 60_000} min) and was stopped`), JSON.stringify(failuresOf(written)));
  const report = JSON.parse(written['/w/out/key-route/key-route.json']);
  assert.equal(report.engines.vendor.timedOut, true);
  // The second lane gets what is left of the budget, its grace and the reserve for cleanup and the report held back.
  assert.equal(bounds.cua, KEY_ROUTE_BUDGET_MS - KEY_ROUTE_RESERVE_MS - LANE_GRACE_MS - (LANE_TIMEOUT_MS + LANE_GRACE_MS));
  // Too little left for a lane: cua's is skipped, recorded as such, and the cleanup still runs.
  const late = hostedIo({results: {vendor: {takesMs: KEY_ROUTE_BUDGET_MS - KEY_ROUTE_RESERVE_MS - LANE_GRACE_MS - LANE_MIN_MS + 1}}});
  assert.equal(await runKeyRoute(OPTIONS, late.io), 0);
  assert.deepEqual(late.calls.filter(c => c[0] === 'runEngine').map(c => c[1]), ['vendor']);
  const skipped = JSON.parse(late.written['/w/out/key-route/key-route.json']).engines.cua;
  assert.match(skipped.skipped, /the diagnostic's time ran out/);
  assert.deepEqual(late.calls.slice(-2), [['engineRows'], ['leftovers']]);
  assert.match(keyRouteSummary(JSON.parse(late.written['/w/out/key-route/key-route.json'])), /cua: not recorded \(skipped: the diagnostic's time ran out/);
});

test('pgrep\'s exit 1 is no process; any other failure is a reading that failed, never an empty list', () => {
  assert.deepEqual(pgrepPids(['-x', 'TextEdit'], () => '12\n34\n'), [12, 34]);
  assert.deepEqual(pgrepPids(['-x', 'TextEdit'], () => { throw Object.assign(new Error('exit 1'), {status: 1}); }), []);
  assert.throws(() => pgrepPids(['-x', 'TextEdit'], () => { throw Object.assign(new Error('pgrep: bad'), {status: 2}); }), /pgrep: bad/);
  assert.throws(() => pgrepPids(['-x', 'TextEdit'], () => { throw Object.assign(new Error('timed out'), {status: null, signal: 'SIGTERM'}); }), /timed out/);
});

test('a tap that could not be built or granted is recorded, and both lanes still run: the AX half and the panel\'s close stand without it', async () => {
  const {io, calls, written} = hostedIo({buildTap: () => { throw new Error('swiftc failed'); }});
  assert.equal(await runKeyRoute(OPTIONS, io), 0);
  assert.deepEqual(calls.filter(c => c[0] === 'runEngine').map(c => c[1]), ['vendor', 'cua']);
  assert.deepEqual(JSON.parse(written['/w/out/key-route/key-route.json']).tap, {error: 'swiftc failed'});
});

test('the TCC writer is asked for the diagnostic\'s own identity only: every write names its tap app and Input Monitoring, never an engine', async () => {
  const {store, calls} = spyStore({rows: statement => (statement.includes('pragma_table_info') ? 'service\nclient'
    : statement.includes(DIAGNOSTIC_CLIENT) ? `kTCCServiceListenEvent|${DIAGNOSTIC_CLIENT}|2` : hex('(\'kTCCServiceAccessibility\', \'io.github.ssfskim.cua.engine\')'))});
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

test('engineRows: hosted only, every column of the engines\' rows as the table has them, losslessly; nothing else read', () => {
  const off = spyStore();
  assert.throws(() => engineRows({env: {}, platform: 'darwin', store: off.store}), /refused: .*GitHub-hosted/);
  assert.deepEqual(off.calls, []);
  const columns = ['service', 'client', 'client_type', 'auth_value', 'csreq'];
  const {store, calls} = tableStore(columns, ["('kTCCServiceListenEvent', 'io.github.ssfskim.cua.engine', 0, 2, X'FADE')", "('kTCCServiceAccessibility', 'com.openai.sky.CUAService', 0, 2, NULL)"]);
  assert.deepEqual(engineRows({...HOSTED, store}), {columns,
    rows: ["('kTCCServiceAccessibility', 'com.openai.sky.CUAService', 0, 2, NULL)", "('kTCCServiceListenEvent', 'io.github.ssfskim.cua.engine', 0, 2, X'FADE')"]});
  const sql = calls.filter(c => c[0] === 'sql').map(c => c[2]);
  assert.deepEqual(sql[0], 'select name from pragma_table_info(\'access\') order by cid;');
  assert.equal(sql[1], `select hex('(' || quote("service") || ', ' || quote("client") || ', ' || quote("client_type") || ', ' || quote("auth_value") || ', ' || quote("csreq") || ')') from access where client in ('io.github.ssfskim.cua.engine', 'com.openai.sky.CUAService');`);
  assert.equal(sql.length, 2);
  // A table whose columns cannot be read, or read as no names, is unread, never an empty snapshot.
  assert.throws(() => engineRows({...HOSTED, store: tableStore([], []).store}), /the access table's columns could not be read/);
  assert.throws(() => engineRows({...HOSTED, store: tableStore(['ok', 'bad name'], []).store}), /the access table's columns could not be read/);
});

test('rowsChanged: a multiset compare of whole rows and of the columns; a column a narrower read would omit counts', () => {
  const COLS = ['service', 'client', 'client_type', 'auth_value'];
  const snap = (rows, columns = COLS) => ({columns, rows});
  assert.equal(rowsChanged(snap(['a', 'b']), snap(['b', 'a'])), null);
  assert.deepEqual(rowsChanged(snap(['a', 'b']), snap(['b', 'c'])), {added: ['c'], removed: ['a']});
  // client_type alone moved (a row's identity kind): changed.
  const before = "('kTCCServiceListenEvent', 'io.github.ssfskim.cua.engine', 0, 2)", after = "('kTCCServiceListenEvent', 'io.github.ssfskim.cua.engine', 1, 2)";
  assert.deepEqual(rowsChanged(snap([before]), snap([after])), {added: [after], removed: [before]});
  // A duplicate gained or lost counts.
  assert.deepEqual(rowsChanged(snap(['a', 'a']), snap(['a'])), {added: [], removed: ['a']});
  // The table's columns changed (a column added, dropped or reordered): changed, the rows' compare aside.
  assert.deepEqual(rowsChanged(snap(['a']), snap(['a'], [...COLS, 'pid'])), {added: [], removed: [], columns: {before: COLS, after: [...COLS, 'pid']}});
});

test('the section: per engine the Escape\'s posted and receiving pids and the panel; the AX ancestors; cua\'s keyboardTarget; every public route against ActualPid and the selected ancestor', () => {
  const ax = {trusted: true, pid: 500, actualPidAvailable: true, actualPid: 700, cuaKeyboardTarget: 500, staticReadingTarget: 700, selectedAncestor: {depth: 0, pid: 700},
    chain: [{depth: 0, role: 'AXTextField', pid: 500, actualPid: 700}, {depth: 1, role: 'AXWindow', pid: 500, actualPid: 700}, {depth: 2, role: 'AXApplication', pid: 500, actualPid: 500}],
    processes: {500: {running: true, bundleId: 'com.apple.TextEdit', activationPolicy: 'regular', finishedLaunching: true}, 700: {running: true, bundleId: 'com.apple.appkit.xpc.openAndSavePanelService', activationPolicy: 'prohibited', finishedLaunching: true}},
    routes: [{route: 'runningApplicationsPanelService', read: true, pids: [700], matchesActual: true, matchesSelected: true, how: 'h'},
      {route: 'windowListAtPanelFrame', read: true, pids: [500], matchesActual: false, matchesSelected: false, how: 'h'},
      {route: 'axWindowsPanelPid', read: false, error: 'AXError -25204', how: 'h'}]};
  const report = {ruling: 1198, tap: {app: TAP_APP, bundleId: TAP_BUNDLE_ID, grant: {granted: true}}, tcc: {engines: {unchanged: true, rows: 8}}, cleanup: {ok: true, failures: []},
    engines: {vendor: {exit: 0, keyRoute: {engine: 'vendor', opened: {ok: true}, ax, press: {...PRESSED, closedByEngineView: true}, after: {up: false}, closed: true,
      tap: tapOf([{label: 'panelService', tapPid: 700, target: 700, source: 600, at: 1_005}])}},
    cua: {exit: 0, keyRoute: {engine: 'cua', opened: {ok: true}, ax, press: {...PRESSED, closedByEngineView: false}, after: {up: true}, cancel: {via: 'cancelButton', closed: true}, closed: true,
      tap: tapOf([{label: 'textedit', tapPid: 500, target: 500, source: 800, at: 1_005}])}}}};
  const md = renderKeyRoute(report);
  assert.match(md, /^\| vendor \| yes \| 700 \| 600 \| panelService \| yes \| \|$/m);
  assert.match(md, /^\| cua \| yes \| 500 \| 800 \| textedit \| no \(closed by the AX cancel: cancelButton\) \| \|$/m);
  assert.match(md, /^\| 0 \| AXTextField \| 500 \| 700 \| com\.apple\.appkit\.xpc\.openAndSavePanelService \| prohibited \| yes \|$/m);
  assert.match(md, /cua's keyboardTarget \(native\/engine\/Sources\/Engine\/Input\.swift:1014\): pid 500; the focused element's ActualPid: 700; the selected ancestor \(the static reading's walk\): depth 0, pid 700; the static reading's rule: pid 700/);
  assert.match(md, /^\| runningApplicationsPanelService \| yes \| 700 \| yes \| yes \|$/m);
  assert.match(md, /^\| windowListAtPanelFrame \| yes \| 500 \| no \| no \|$/m);
  assert.match(md, /^\| axWindowsPanelPid \| no: AXError -25204 \| - \| - \| - \|$/m);
  assert.match(md, /Input Monitoring granted to io\.github\.ssfskim\.cua\.key-route-tap: yes\. The engines' TCC rows: unchanged \(8 rows\)\./);
  assert.match(md, /Cleanup: confirmed\./);
  assert.equal(keyRouteSummary(report), 'vendor: Escape posted to pid 700 by pid 600, seen by the panelService tap, the panel closed by it; cua: Escape posted to pid 500 by pid 800, seen by the textedit tap, the panel not closed by it');
});

test('the section and the summary tell a tap that failed from one that saw nothing, read only the press\'s own window, and print an unreadable pid as unavailable', () => {
  const lane = (tap, extra = {}) => ({exit: 1, keyRoute: {opened: {ok: true}, press: PRESSED, after: {up: false}, closed: true, tap, ...extra}});
  const report = (vendor, cua) => ({tap: {grant: {granted: true}}, cleanup: {ok: true, failures: []}, engines: {vendor, cua}});
  const failed = report(lane(tapOf([], {start: {listenAccess: false}})), lane(tapOf([], {stop: {logRead: false, ready: false}})));
  assert.equal(keyRouteSummary(failed), 'vendor: Escape sent, where it landed is unknown (the tap app has no Input Monitoring access), the panel closed by it; '
    + 'cua: Escape sent, where it landed is unknown (the tap\'s log could not be read), the panel closed by it');
  assert.match(renderKeyRoute(failed), /^\| vendor \| yes \| - \| - \| unknown \| yes \| the taps failed: the tap app has no Input Monitoring access \|$/m);
  // A stray Escape outside the press's window is never the press's; a pid field read as 0 is unavailable.
  const quiet = report(lane(tapOf([{label: 'textedit', tapPid: 500, target: 500, source: 800, at: 9_000}])), lane(tapOf([{label: 'textedit', tapPid: 500, target: 0, source: -1, at: 1_004}])));
  assert.equal(keyRouteSummary(quiet), 'vendor: Escape sent, seen by no tap in its window (1 Escape keyDown outside it), the panel closed by it; '
    + 'cua: Escape posted to pid unavailable by pid unavailable, seen by the textedit tap, the panel closed by it');
  const md = renderKeyRoute(quiet);
  assert.match(md, /^\| vendor \| yes \| - \| - \| none \| yes \| 1 Escape keyDown outside the press's window \(not counted\) \|$/m);
  assert.match(md, /^\| cua \| yes \| unavailable \| unavailable \| textedit \| yes \| \|$/m);
  assert.ok(!/\| 0 \|/.test(md.split('\n').filter(l => /^\| (vendor|cua) /.test(l)).join('\n')), 'never a pid printed as 0');
});
