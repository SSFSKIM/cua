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
import {INVENTORY_COMPILE_MS, KEY_ROUTE_BUDGET_MS, KEY_ROUTE_JOB_RESERVE_MS, KEY_ROUTE_RESERVE_MS, keyRouteSummary, LANE_CLOSE_MS, LANE_GRACE_MS, LANE_STEP_MS, LANE_TIMEOUT_MS, pgrepPids, renderKeyRoute,
  runKeyRoute, SETUP_BOUND_MS} from '../../scripts/hosted-sittings/key-route.mjs';
import {JOB_LIMIT_MINUTES} from '../../scripts/hosted-sittings/run.mjs';
import {captureOf} from '../../scripts/native-matrix/key-route-capture.mjs';
import {recoverBoundMs} from '../../scripts/native-matrix/live-checks.mjs';
import {stepSections} from '../../scripts/hosted-sittings/key-route-report.mjs';
import {sittingPlan} from '../../scripts/hosted-sittings/plan.mjs';
import {runSitting} from '../../scripts/hosted-sittings/run.mjs';
import {CLIENTS, DIAGNOSTIC_CLIENT, engineRows, grantDiagnosticListen, O0_COMMIT, rowsChanged, SERVICES, SYSTEM_DB, TCC_BOOKKEEPING_COLUMNS} from '../../scripts/hosted-sittings/tcc.mjs';
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
// A store whose access table has `columns` and holds `tuples`: each row [its grant columns' tuple, its bookkeeping
// columns' tuple], as SQL's quote() spells the values.
const hex = text => Buffer.from(text, 'utf8').toString('hex').toUpperCase();
const tableStore = (columns, tuples) => spyStore({rows: statement => (statement.includes('pragma_table_info') ? columns.join('\n')
  : tuples.map(([grant, kept = '()']) => `${hex(grant)}|${hex(kept)}`).join('\n'))});

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
  stop: {exited: true, killed: false, why: 'stop', logRead: true, ready: true, rawEvents: events, ...stop}});
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
// The job started at 0 (its limit far off) unless `jobStartedMs` says otherwise; the clock starts at `startMs`.
function hostedIo({rowsBefore = ['a'], rowsAfter = rowsBefore, keptBefore = '(1)', keptAfter = keptBefore, leftovers = [{tap: [], textedit: [], panels: 0}], results = {}, buildTap, grantTap, startMs = 0,
  jobStartedMs = 0, inventory = () => {}} = {}) {
  const calls = [], written = {}, bounds = {};
  let rowReads = 0, leftoverReads = 0, clock = startMs;
  const io = {
    env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'darwin', log: () => {}, now: () => clock, jobStartedMs,
    prepareInventory: () => { calls.push(['prepareInventory']); inventory(); },
    engineRows: () => {
      calls.push(['engineRows']);
      const first = rowReads++ === 0, rows = first ? rowsBefore : rowsAfter, kept = first ? keptBefore : keptAfter;
      if (rows instanceof Error) throw rows;
      return {columns: ['service', 'client', 'last_reminded'], bookkeeping: ['last_reminded'], rows, full: rows.map(r => `${r} ${kept}`)};
    },
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
  assert.deepEqual(calls, [['engineRows'], ['buildTap'], ['grantTap', TAP_APP], ['prepareInventory'], ['runEngine', 'vendor', '/w/out/key-route/vendor'], ['runEngine', 'cua', '/w/out/key-route/cua'],
    ['engineRows'], ['leftovers']]);
  const report = JSON.parse(written['/w/out/key-route/key-route.json']);
  assert.deepEqual(report.cleanup, {ok: true, failures: []});
  assert.deepEqual(report.tcc.engines, {unchanged: true, rows: 1, bookkeepingColumns: ['last_reminded']});
  assert.deepEqual(Object.keys(report.engines), ['vendor', 'cua']);
  assert.equal(report.engines.vendor.keyRoute.engine, 'vendor');
  assert.match(written['/w/out/key-route/key-route.md'], /^## The key-route diagnostic \(ruling 1198\)/);
});

test('the engines\' rows changed, or unread, is a failure by name; so is a cleanup an engine\'s lane reported, and anything left on screen', async () => {
  const changed = hostedIo({rowsBefore: ["('kTCCServiceListenEvent', 'io.github.ssfskim.cua.engine', 0)"], rowsAfter: ["('kTCCServiceListenEvent', 'io.github.ssfskim.cua.engine', 2)"]});
  assert.equal(await runKeyRoute(OPTIONS, changed.io), 1);
  assert.deepEqual(failuresOf(changed.written),
    ['the engines\' TCC rows changed during the diagnostic: added (\'kTCCServiceListenEvent\', \'io.github.ssfskim.cua.engine\', 2); removed (\'kTCCServiceListenEvent\', \'io.github.ssfskim.cua.engine\', 0)']);
  // tccd's bookkeeping moving alone (last_reminded) is recorded, never a failure; a grant change still is.
  const kept = hostedIo({keptAfter: '(9)'});
  assert.equal(await runKeyRoute(OPTIONS, kept.io), 0);
  const keptReport = JSON.parse(kept.written['/w/out/key-route/key-route.json']);
  assert.deepEqual(keptReport.tcc.engines, {unchanged: true, rows: 1, bookkeepingColumns: ['last_reminded'], bookkeeping: {columns: ['last_reminded'], added: ['a (9)'], removed: ['a (1)']}});
  assert.match(kept.written['/w/out/key-route/key-route.md'], /The engines' TCC rows: unchanged \(1 rows; tccd's bookkeeping \(last_reminded\) moved on 1 row, recorded, not a failure\)\./);
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

test('the bounds: the lane grace covers the recovery\'s own bound; the reserve the final inventory, its cold compile when the precompile failed', () => {
  assert.equal(LANE_GRACE_MS, LANE_STEP_MS + recoverBoundMs() + LANE_CLOSE_MS);
  assert.ok(LANE_STEP_MS >= 300_000, 'a device command a lane may be in, bounded by its 300 s compile');
  assert.equal(INVENTORY_COMPILE_MS, 300_000, 'matrix-device.mjs compiled()\'s swiftc timeout');
  assert.ok(KEY_ROUTE_RESERVE_MS >= 60_000 + 2 * 30_000 + 4 * 10_000 + 2_000, 'the window list run, the rows\' read, the pgreps, the tap\'s stop');
});

test('each lane is bounded within the step and the job: a lane past its bound with its cleanup confirmed is INFO, recorded; a lane with no time left is skipped before its hold', async () => {
  const {io, bounds, written} = hostedIo({results: {vendor: {lane: {exit: 143, signal: null, timedOut: true}, takesMs: LANE_TIMEOUT_MS + LANE_GRACE_MS}}});
  // The vendor's lane ran past its bound and was stopped, but its put-back held and nothing was left: INFO.
  assert.equal(await runKeyRoute(OPTIONS, io), 0);
  const firstBound = Math.min(LANE_TIMEOUT_MS, KEY_ROUTE_BUDGET_MS - KEY_ROUTE_RESERVE_MS - LANE_GRACE_MS);
  assert.equal(bounds.vendor, firstBound);
  const report = JSON.parse(written['/w/out/key-route/key-route.json']);
  assert.deepEqual([report.engines.vendor.timedOut, report.cleanup.ok], [true, true]);
  assert.match(written['/w/out/key-route/key-route.md'], /^\| vendor \|.*the lane ran past its bound and was stopped \|$/m);
  // Too little left for the second lane: skipped before its hold, recorded, and the cleanup still runs.
  assert.equal(bounds.cua, undefined);
  assert.match(report.engines.cua.skipped, /the diagnostic's time ran out/);
  assert.deepEqual(report.leftovers, {tap: [], textedit: [], panels: 0});
  // A lane past its bound whose result is missing is still a failure, named.
  const lost = hostedIo({results: {vendor: {lane: {exit: null, signal: 'SIGKILL', timedOut: true}, result: null}}});
  assert.equal(await runKeyRoute(OPTIONS, lost.io), 1);
  assert.deepEqual(failuresOf(lost.written), ['vendor\'s lane wrote no result (exit null, past its bound, SIGKILL): its put-back and cleanup are unconfirmed']);
});

test('the deadline is the job\'s: what C needs to publish is held back from the job\'s limit, and a step that cannot fit is skipped before it builds or holds anything', async () => {
  const jobEnd = JOB_LIMIT_MINUTES * 60_000 - KEY_ROUTE_JOB_RESERVE_MS;
  // The job's limit closer than the step's cap: the lane's bound comes from it (10 min here, under the 20 min cap).
  const near = KEY_ROUTE_RESERVE_MS + LANE_GRACE_MS + 10 * 60_000, close = hostedIo({startMs: jobEnd - near});
  assert.ok(near < KEY_ROUTE_BUDGET_MS, 'the job binds, not the step\'s cap');
  assert.equal(await runKeyRoute(OPTIONS, close.io), 0);
  assert.equal(close.bounds.vendor, 10 * 60_000);
  // Not even the set-up and the cleanup fit: nothing is read, built, granted or held; the skip is recorded, INFO.
  const late = hostedIo({startMs: jobEnd - (SETUP_BOUND_MS + KEY_ROUTE_RESERVE_MS + INVENTORY_COMPILE_MS) + 1});
  assert.equal(await runKeyRoute(OPTIONS, late.io), 0);
  assert.deepEqual(late.calls, []);
  const report = JSON.parse(late.written['/w/out/key-route/key-route.json']);
  assert.match(report.skipped, /the job's time left/);
  assert.match(keyRouteSummary(report), /^skipped: the job's time left/);
  // The job's start unread: the time C needs cannot be kept, so the same skip.
  const unknown = hostedIo({jobStartedMs: null});
  assert.equal(await runKeyRoute(OPTIONS, unknown.io), 0);
  assert.deepEqual(unknown.calls, []);
  assert.match(JSON.parse(unknown.written['/w/out/key-route/key-route.json']).skipped, /the job's start is unread \(M5_JOB_STARTED\)/);
  // The inventory not precompiled: its cold compile is held back too, from every lane's bound; recorded.
  const cold = hostedIo({startMs: jobEnd - near, inventory: () => { throw new Error('swiftc: timed out'); }});
  await runKeyRoute(OPTIONS, cold.io);
  assert.equal(JSON.parse(cold.written['/w/out/key-route/key-route.json']).inventory.error, 'swiftc: timed out');
  assert.equal(cold.bounds.vendor, 10 * 60_000 - INVENTORY_COMPILE_MS);
});

test('key-route.json carries each lane\'s attributed capture, the one the section renders, beside the taps\' raw events', async () => {
  const keyRoute = {engine: 'vendor', closed: true, cleanup: [], opened: {ok: true}, press: {sent: true, at: [1_000, 1_010]}, after: {up: false},
    tap: tapOf([{label: 'panelService', tapPid: 700, target: 700, source: 600, at: 1_005}, {label: 'textedit', tapPid: 500, target: 500, source: 1, at: 9_000}])};
  const {io, written} = hostedIo({results: {vendor: {result: laneResult('vendor', {meta: {keyRoute}})}}});
  assert.equal(await runKeyRoute(OPTIONS, io), 0);
  const lane = JSON.parse(written['/w/out/key-route/key-route.json']).engines.vendor;
  assert.deepEqual(lane.capture, captureOf(keyRoute.tap, keyRoute.press));
  assert.deepEqual([lane.capture.state, lane.capture.events.length, lane.capture.unmatched.length], ['seen', 1, 1]);
  assert.equal(lane.keyRoute.tap.stop.rawEvents.length, 2, 'the raw events kept, labelled raw');
  // The section renders the stored capture.
  assert.match(renderKeyRoute({engines: {vendor: {...lane, capture: {...lane.capture, events: [{label: 'stored', target: 1, source: 2}]}}}}), /^\| vendor \| yes \| 1 \| 2 \| stored \|/m);
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
    : statement.includes(DIAGNOSTIC_CLIENT) ? `kTCCServiceListenEvent|${DIAGNOSTIC_CLIENT}|2` : `${hex('(\'kTCCServiceAccessibility\', \'io.github.ssfskim.cua.engine\')')}|${hex('()')}`)});
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
  const columns = ['service', 'client', 'client_type', 'auth_value', 'csreq', 'last_modified', 'pid'];
  const {store, calls} = tableStore(columns, [["('kTCCServiceListenEvent', 'io.github.ssfskim.cua.engine', 0, 2, X'FADE')", '(1792418253, NULL)'],
    ["('kTCCServiceAccessibility', 'com.openai.sky.CUAService', 0, 2, NULL)", '(1792418000, 77)']]);
  assert.deepEqual(engineRows({...HOSTED, store}), {columns, bookkeeping: ['last_modified', 'pid'],
    rows: ["('kTCCServiceAccessibility', 'com.openai.sky.CUAService', 0, 2, NULL)", "('kTCCServiceListenEvent', 'io.github.ssfskim.cua.engine', 0, 2, X'FADE')"],
    full: ["('kTCCServiceAccessibility', 'com.openai.sky.CUAService', 0, 2, NULL) (1792418000, 77)", "('kTCCServiceListenEvent', 'io.github.ssfskim.cua.engine', 0, 2, X'FADE') (1792418253, NULL)"]});
  const sql = calls.filter(c => c[0] === 'sql').map(c => c[2]);
  assert.deepEqual(sql[0], 'select name from pragma_table_info(\'access\') order by cid;');
  assert.equal(sql[1], `select hex('(' || quote("service") || ', ' || quote("client") || ', ' || quote("client_type") || ', ' || quote("auth_value") || ', ' || quote("csreq") || ')') || '|' || hex('(' || quote("last_modified") || ', ' || quote("pid") || ')') from access where client in ('io.github.ssfskim.cua.engine', 'com.openai.sky.CUAService');`);
  assert.equal(sql.length, 2);
  // A table whose columns cannot be read, read as no names, or without its service and client, is unread, never an
  // empty snapshot.
  assert.throws(() => engineRows({...HOSTED, store: tableStore([], []).store}), /the access table's columns could not be read/);
  assert.throws(() => engineRows({...HOSTED, store: tableStore(['service', 'client', 'bad name'], []).store}), /the access table's columns could not be read/);
  assert.throws(() => engineRows({...HOSTED, store: tableStore(['last_modified'], []).store}), /the access table's columns could not be read/);
  // The bookkeeping set is named in one place; a table without any of it has a bookkeeping tuple of none.
  assert.deepEqual([...TCC_BOOKKEEPING_COLUMNS], ['last_modified', 'last_reminded', 'pid', 'pid_version', 'boot_uuid']);
  assert.deepEqual(engineRows({...HOSTED, store: tableStore(['service', 'client'], [["('s', 'c')"]]).store}), {columns: ['service', 'client'], bookkeeping: [], rows: ["('s', 'c')"], full: ["('s', 'c') ()"]});
});

test('rowsChanged: a grant column, a row gained or lost, a duplicate or the column set changing is a grant change; tccd\'s bookkeeping moving alone is recorded apart', () => {
  const COLS = ['service', 'client', 'client_type', 'auth_value', 'last_modified', 'last_reminded'];
  const snap = (rows, columns = COLS) => ({columns, bookkeeping: ['last_modified', 'last_reminded'], rows: rows.map(([grant]) => grant), full: rows.map(([grant, kept]) => `${grant} ${kept}`)});
  const row = (type, value, kept = '(1, 1)') => [`('kTCCServiceListenEvent', 'io.github.ssfskim.cua.engine', ${type}, ${value})`, kept];
  assert.equal(rowsChanged(snap([row(0, 2), ['b', '()']]), snap([['b', '()'], row(0, 2)])), null);
  // last_reminded alone moved: bookkeeping, no grant change.
  assert.deepEqual(rowsChanged(snap([row(0, 2, '(1, 1)')]), snap([row(0, 2, '(1, 9)')])),
    {grant: null, bookkeeping: {columns: ['last_modified', 'last_reminded'], added: [`${row(0, 2)[0]} (1, 9)`], removed: [`${row(0, 2)[0]} (1, 1)`]}});
  // auth_value, or client_type alone: a grant change.
  assert.deepEqual(rowsChanged(snap([row(0, 2)]), snap([row(0, 0)])), {grant: {added: [row(0, 0)[0]], removed: [row(0, 2)[0]]}, bookkeeping: null});
  assert.deepEqual(rowsChanged(snap([row(0, 2)]), snap([row(1, 2)])), {grant: {added: [row(1, 2)[0]], removed: [row(0, 2)[0]]}, bookkeeping: null});
  // A row gained, or a duplicate lost.
  assert.deepEqual(rowsChanged(snap([row(0, 2)]), snap([row(0, 2), ['b', '()']])).grant, {added: ['b'], removed: []});
  assert.deepEqual(rowsChanged(snap([row(0, 2), row(0, 2)]), snap([row(0, 2)])).grant, {added: [], removed: [row(0, 2)[0]]});
  // The table's columns changed: a grant change, the rows' compare aside.
  assert.deepEqual(rowsChanged(snap([row(0, 2)]), snap([row(0, 2)], [...COLS, 'flags'])).grant, {added: [], removed: [], columns: {before: COLS, after: [...COLS, 'flags']}});
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
  // The Escape's outcome unread: a panel gone by a later reading with no cancel made is kept apart from a confirmed AX
  // cancel; a reading that failed reads as unread.
  const unreadLane = (cancel, after = {up: null, unread: ['the window list was unread']}) => lane(tapOf([]), {after, cancel});
  const later = report(unreadLane({found: false, via: null, pressed: null, closed: true, unread: []}), unreadLane({found: true, via: 'cancelButton', pressed: 0, closed: true, unread: []}, {error: 'the panel reading failed: x'}));
  const mdLater = renderKeyRoute(later);
  assert.match(mdLater, /^\| vendor \| yes \| - \| - \| none \| unread \(gone at a later reading; no cancel made\) \|/m);
  assert.match(mdLater, /^\| cua \| yes \| - \| - \| none \| no \(the reading after it unread; still up at the AX cancel, which closed it: cancelButton\) \|/m);
  assert.match(keyRouteSummary(later), /vendor: Escape sent, seen by no tap in its window, the panel unread after it, gone at a later reading \(no cancel made\); /);
  assert.match(keyRouteSummary(later), /cua: Escape sent, seen by no tap in its window, the panel not closed by it \(still up at the AX cancel\)$/);
});
