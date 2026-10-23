// The matrix's run (scripts/native-matrix/run.mjs) against doubles of the device and the lane (./lane.mjs dryOps and
// dryConnect, steered per test, on one made-up device clock): the hold's order, the result's shape, the refusals, the
// engine pinned, the key guard, the activation watcher's coverage (an activation charged to the step it fell in, one in
// no step, a watcher gone, a record lost), the paste rows' alert watch, the windowless pairing and the launch path's
// journaled identity.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {dryOps} from '../../scripts/native-matrix/lane.mjs';
import {caseCells} from '../../scripts/native-matrix/matrix-cells.mjs';
import {CASES} from '../../scripts/native-matrix/plan.mjs';
import {cleanupMatrix, FULL_PLAN, PASTING, planOf} from '../../scripts/native-matrix/run.mjs';

import {args, BUNDLE, cellsOf, matrixSteps, names, runWith, stopWith} from './run-doubles.mjs';

test('one pairing of the background regime: the hold in order, a conforming result, every row judged by the oracle', async () => {
  const {code, steps, result} = await runWith();
  assert.equal(code, 0);
  assert.deepEqual(validateCellResult(result), []);
  assert.equal(result.cell, 'non-interference');
  const order = names(steps).filter(s => !/^(matrix read|matrix step|matrix alerts|helpers)/.test(s));
  assert.deepEqual(order, ['home', 'live begin', 'matrix load', 'prepare', 'preflight', 'scenes preflight', 'scenes up', 'goldens steps', 'scenes up', 'goldens steps', 'goldens engine-stop',
    'matrix compile', 'live watch', 'serve', 'live watch', 'matrix launched', 'live recover', 'matrix launched', 'scenes frontmost', 'cleanup', 'matrix load']);
  // The device's load before the run's work and after its put-back, for the hold's record.
  assert.deepEqual(Object.keys(result.meta.load), ['before', 'after']);
  assert.deepEqual(result.meta.load.before, {loadavg: [1.5, 1.2, 1], uptimeS: 86_400, cpus: 10});
  assert.deepEqual(matrixSteps(steps, 'alerts')[0], ['alerts', 'baseline', '--run', result.meta.runDir], 'the alert baseline is kept before the lane');
  const method = result.rows.filter(r => r.section === 'method');
  assert.ok(method.length > 10 && method.every(r => r.regime === 'background' && r.user === 'finder' && r.id.endsWith('@finder')));
  assert.ok(method.every(r => r.interference?.ok === true), 'no activation, the front unchanged, the focus kept');
  assert.deepEqual(result.lanes, [{host: 'cua', engine: 'cua', build: 'd'.repeat(64), version: '0.0.0'}]);
  assert.deepEqual([result.meta.planId, result.meta.sitting], ['background:textedit@finder', 's1']);
  // Every read names the watcher; the after-read carries the focus probe on the user window.
  assert.ok(matrixSteps(steps, 'read').every(a => a.includes('--watcher')));
  assert.ok(matrixSteps(steps, 'read').some(a => a.includes('--focus') && /^\d+,100,100,800,600$/.test(a[a.indexOf('--focus') + 1])));
  // Each scene is brought to the front before its bind, so getApp's emitted text is the run's window.
  assert.deepEqual(matrixSteps(steps, 'step').slice(0, 2).map(a => a.slice(1, 3)), [['activate', 'textedit'], ['activate', 'finder']]);
});

test('a lane can run exactly run n of a hold (--run-number), and --runs counts from it', async () => {
  const third = await runWith({runNumber: 3});
  assert.deepEqual(Object.keys(third.results), ['run-3']);
  assert.deepEqual([third.result.meta.run, third.result.meta.sitting], [3, 's1']);
  assert.ok(third.result.rows.filter(r => r.section === 'method').every(r => r.sample === 3), 'the run number is the sample');
  const two = await runWith({runNumber: 2, runs: 2});
  assert.deepEqual(Object.entries(two.results).map(([d, r]) => [d, r.meta.run]), [['run-2', 2], ['run-3', 3]]);
  const plain = await runWith({runs: 2});
  assert.deepEqual(Object.keys(plain.results), ['run-1', 'run-2']);
  await assert.rejects(runWith({runNumber: 0}), /--run-number/);
});

test('a sitting is required, and only the whole matrix\'s plan is the full one', async () => {
  await assert.rejects(runWith({sitting: ''}), /--sitting/);
  assert.equal(planOf('matrix').id, 'full');
  assert.equal(planOf('matrix', {scene: 'textedit'}).id, 'matrix:textedit');
  assert.equal(planOf('method', {scene: 'windowless', user: 'finder'}).id, 'method:windowless@finder');
  assert.ok(FULL_PLAN.background.some(p => p.driven === 'windowless'));
});

test('a dirty checkout is refused before anything on the device; a begin refusal is refused with nothing prepared', async () => {
  const dirty = await runWith({checkout: {commit: 'c', dirty: true}});
  assert.equal(dirty.code, 2);
  assert.equal(dirty.result.verdict, 'refused');
  assert.ok(!names(dirty.steps).includes('live begin'));
  const refused = await runWith({ops: {live: (base, a) => (a[0] === 'begin' ? {refusals: ['a run that died left finder up']} : base(a))}});
  assert.equal(refused.code, 2);
  assert.deepEqual(refused.result.problems, ['a run that died left finder up']);
  assert.ok(!names(refused.steps).includes('prepare'));
});

test('a result attesting another engine stops the lane, and the put-back and cleanup still run', async () => {
  const {code, steps, result} = await runWith({attest: 'vendor'});
  assert.equal(code, 1);
  assert.equal(result.complete, false);
  assert.ok(result.problems.some(p => /attested the vendor engine, not the requested cua/.test(p)));
  assert.ok(names(steps).includes('live recover') && names(steps).includes('cleanup'));
});

test('an activation inside a row fails that row\'s oracle only; one inside a harness step is the harness\'s', async () => {
  const scroll = cellsOf('textedit', 'scroll', 'down').act;
  const calls = [];
  const r = await runWith({calls, ops: stopWith(() => {
    const during = calls.find(c => c.code.includes(scroll)).at[0] + 1;
    // calls[0] is the lane's first cell, [1] TextEdit's bind, [2] Finder's: the activate before Finder's bind is a harness
    // step intending Finder, its window the two clock readings before that bind's.
    const harness = calls[2].at[0] - 3_000;
    return {activations: [{kind: 'activated', bundleId: 'com.apple.TextEdit', scene: true, at: during}, {kind: 'activated', bundleId: 'com.apple.finder', at: harness}]};
  })});
  const failed = r.result.rows.filter(row => row.interference && !row.interference.ok);
  assert.deepEqual(failed.map(row => row.id), ['textedit/background/scroll.down@finder']);
  assert.equal(failed[0].interference.activations, 1);
  assert.equal(r.result.complete, true, JSON.stringify(r.result.problems));
  assert.deepEqual(r.result.meta.activations.unaccounted, []);
  assert.deepEqual(r.result.meta.activations.accounted.map(a => [a.kind, a.key]), [['harness', 'activate:finder']]);
  // A standalone cell (`cell non-interference`, never counted as a full run) judges the oracle too: it fails, exit 1.
  assert.deepEqual([r.result.judgesInterference, r.result.verdict, r.code], [true, 'fail', 1]);
});

test('an activation the run cannot place makes the run incomplete, never clean', async () => {
  // 1.5 s after a row's check ends: past the margin, before the next step reads its clock.
  const check = cellsOf('textedit', 'click', 'control').check;
  const calls = [];
  const r = await runWith({calls, ops: stopWith(() => ({activations: [{kind: 'activated', bundleId: 'com.example.other', at: calls.find(c => c.code.includes(check)).at[1] + 1_500}]}))});
  assert.equal(r.result.complete, false);
  assert.ok(r.result.problems.some(p => /fell in no step/.test(p)));
  assert.equal(r.result.meta.activations.unaccounted.length, 1);
});

test('the watcher\'s coverage: gone at a row\'s read leaves that row invalid; a record lost leaves every judged row invalid', async () => {
  // Reads: the user window (1), the first row's before (2) and after (3).
  let reads = 0;
  const gone = await runWith({ops: {matrix: (base, a) => {
    const answer = base(a);
    return a[0] === 'read' && ++reads === 3 ? {...answer, watcher: false} : answer;
  }}});
  assert.deepEqual(gone.result.rows.filter(r => /watcher was not running/.test(r.invalid ?? '')).map(r => r.id), ['textedit/background/getAXState.tree@finder']);
  // An activation inside a row that ended invalid is kept as that row's, not dropped.
  const calls = [], first = cellsOf('textedit', 'getAXState', 'tree').act;
  reads = 0;
  const kept = await runWith({calls, ops: {
    matrix: (base, a) => { const answer = base(a); return a[0] === 'read' && ++reads === 3 ? {...answer, watcher: false} : answer; },
    ...stopWith(() => ({activations: [{kind: 'activated', bundleId: 'com.apple.TextEdit', at: calls.find(c => c.code.includes(first)).at[0] + 1}]})),
  }});
  assert.deepEqual(kept.result.meta.activations.accounted.map(a => a.kind), ['invalid-row']);
  const lost = await runWith({ops: stopWith(() => { throw new Error('ssh: connection reset'); })});
  assert.equal(lost.result.complete, false);
  assert.ok(lost.result.problems.some(p => /could not be read/.test(p)));
  assert.equal(lost.result.rows.filter(r => r.section === 'method' && !r.invalid).length, 0, 'no row stands without coverage');
  const empty = await runWith({ops: stopWith(() => ({}))});
  assert.equal(empty.result.complete, false, 'a stop with no activations array is a lost record, not "no activations"');
});

test('the watcher not running at the end: its coverage of the run is not proven', async () => {
  // The helpers are read twice: after the binds and after the last row; every read after the second is the end's.
  let snapshots = 0;
  const r = await runWith({ops: {
    matrix: (base, a) => { const answer = base(a); return a[0] === 'read' && snapshots >= 2 ? {...answer, watcher: false} : answer; },
    helpers: base => { snapshots++; return base(); },
  }});
  assert.equal(r.result.complete, false);
  assert.ok(r.result.problems.some(p => /not running at the end/.test(p)));
  assert.ok(r.result.rows.filter(row => row.section === 'method').every(row => row.invalid));
});

test('a paste or typeText act is sent only between two alert checks; an alert before it stops the run with nothing sent', async () => {
  const ok = await runWith();
  const checks = matrixSteps(ok.steps, 'alerts').filter(a => a[1] === 'check');
  assert.equal(checks.length, 2 * CASES.textedit.filter(c => PASTING.includes(c.method)).length);
  assert.ok(checks.every(a => a.join(' ').includes(`--approved-runtime /H --approved-engine ${BUNDLE}`)), 'the engine under test\'s roots reach every check');
  assert.ok(matrixSteps(ok.steps, 'read').every(a => a.join(' ').includes(`--approved-runtime /H --approved-engine ${BUNDLE}`)), 'and every oracle read');
  const pastingActs = CASES.textedit.filter(c => PASTING.includes(c.method)).map(c => caseCells('textedit', c).act);
  let sent = 0;
  const stopped = await runWith({lane: code => { if (pastingActs.some(a => code.includes(a))) sent++; },
    ops: {matrix: (base, a) => (a[0] === 'alerts' && a[1] === 'check' ? {abort: true, export: {alerts: [{bundleId: 'com.apple.UserNotificationCenter', layer: 8}]}} : base(a))}});
  assert.equal(sent, 0);
  assert.equal(stopped.result.complete, false);
  assert.ok(stopped.result.problems.some(p => /possible system alert appeared before/.test(p)));
  assert.deepEqual(stopped.result.meta.alert.alerts, [{bundleId: 'com.apple.UserNotificationCenter', layer: 8}]);
  assert.ok(names(stopped.steps).includes('live recover'));
});

test('the windowless pairing: the app brought up by the harness, its refusal case run behind the user window, then quit', async () => {
  const {steps, result} = await runWith({plan: planOf('background', {scene: 'windowless', user: 'finder'})});
  assert.deepEqual(names(steps).filter(s => /^matrix (windowless|launched)/.test(s)), ['matrix windowless', 'matrix launched', 'matrix launched', 'matrix launched']);
  assert.deepEqual(result.rows.map(r => r.id), ['windowless/background/getAXState.noWindow@finder']);
  assert.ok(result.rows[0].interference, 'judged by the oracle');
});

test('the launch path: the intent journaled before the act, the identity after it, the launch quit even when the lane fails', async () => {
  const plan = planOf('launch');
  const order = [];
  const {steps, result} = await runWith({plan, lane: code => { if (code.includes('cua.computer.get_app_state') && !code.includes('cua.listApps')) order.push('act'); },
    ops: {matrix: (base, a) => { if (a[0] === 'launched') order.push(a[1]); return base(a); }}});
  // electron: intent, act, record, quit; then the run's own quit before the put-back, and the settle after it.
  assert.deepEqual(order, ['intent', 'act', 'record', 'quit', 'quit', 'settle']);
  const recordArgs = matrixSteps(steps, 'launched').find(a => a[1] === 'record');
  assert.equal(recordArgs[2], 'electron');
  assert.ok(Number.isSafeInteger(Number(recordArgs[recordArgs.indexOf('--since') + 1])));
  assert.deepEqual(result.rows.map(r => [r.id, r.ok]), [['electron/background/launch@finder', true]]);
  assert.ok(result.rows.every(r => r.interference && r.outcome.launched === true));
  // The user window comes to the front before the scene goes down, so the quit hands the front to nothing.
  const sceneSteps = matrixSteps(steps, 'step').map(a => a.slice(1, 3).join(' '));
  assert.ok(sceneSteps.indexOf('down electron') > sceneSteps.lastIndexOf('activate finder'));

  // The lane fails during the act (a controller that loses it): the intent was journaled first, and the quit still runs.
  const failing = await runWith({plan, lane: code => { if (code.includes('cua.computer.get_app_state') && !code.includes('cua.listApps')) throw new Error('transport closed'); }});
  assert.deepEqual(matrixSteps(failing.steps, 'launched').map(a => a[1]).slice(0, 3), ['intent', 'record', 'quit']);
  assert.equal(failing.result.complete, false);

  // The launch row's outcome is its own: the scene's window never came to the front.
  const stuck = await runWith({plan, cell: code => (code.includes('cua.listApps({emit: false})') ? {ok: false, outcome: {listed: true, running: true, scene: false, panel: true}} : null)});
  assert.ok(stuck.result.rows.every(r => r.ok === false && r.outcome.panel === true));
  // TextEdit's launch is an owner option, not a cell to run.
  assert.throws(() => planOf('launch', {scene: 'textedit'}), /TextEdit launch under the engine: provable in a scratch macOS user if wanted/);
});

test('a key skipped with one of the run\'s windows in front leaves the row invalid; with another app in front the run stops', async () => {
  // The user window (Finder) is in front; a frontmost-regime key cell for TextEdit sees Finder: skipped, the row invalid.
  const plan = {id: 'test', frontmost: ['finder', 'textedit'], speed: false, finding: false, background: [], launch: []};
  const own = await runWith({plan, ops: {matrix: (base, a) => (a[0] === 'step' && a[1] === 'activate' && a[2] === 'textedit' ? base(['step', 'activate', 'finder', ...a.slice(3)]) : base(a))}});
  const skipped = own.result.rows.filter(r => /key guard/.test(r.invalid ?? ''));
  assert.deepEqual(skipped.map(r => r.id).sort(), ['textedit/frontmost/paste.replace', 'textedit/frontmost/pressKey.selectAll', 'textedit/frontmost/typeText.replace']);
  assert.ok(own.result.rows.filter(r => r.target === 'finder').every(r => !r.invalid), 'Finder\'s own keys went with Finder in front');
  assert.ok(own.result.meta.keySkipped.every(k => k.front.owned === true));
  const foreign = await runWith({plan, ops: {matrix: (base, a) => (a[0] === 'read' ? {reading: {at: 0, frontmost: {pid: null, bundleId: 'com.google.Chrome', owned: false}, topWindow: null}, watcher: true, at: [1, 2]} : base(a))}});
  assert.equal(foreign.code, 1);
  assert.ok(foreign.result.problems.some(p => /not one of the run's windows/.test(p)));
  assert.ok(names(foreign.steps).includes('live recover'));
});

test('the cleanup of a run that died: the journaled launches quit, the recovery, then the intents settled', () => {
  const steps = [];
  const ops = dryOps({log: line => steps.push(line.replace(/^dry: /, '')), engine: 'cua', approvedEngine: BUNDLE, commit: 'c'});
  assert.equal(cleanupMatrix({device: 'mini', run: '/r'}, {ops, log: () => {}, dryRun: true}), 0);
  assert.deepEqual(steps.filter(s => /^(matrix|live)/.test(s)).map(s => `${s.replace(/ .*$/, '')} ${args(s).slice(0, 2).join(' ')}`),
    ['matrix launched quit', 'live recover --run', 'matrix launched settle']);
});

test('the intents settle only after a recovery that stopped the work; an app the settle quit makes the put-back run again', async () => {
  // The recovery's kill phase left a survivor (no put-back ran): the intents are kept and said so.
  const unstopped = await runWith({plan: planOf('launch'), ops: {
    live: (base, a) => (a[0] === 'recover' ? {ok: false, putBack: null, manual: 'nothing was restored: serve outlived SIGKILL'} : base(a))}});
  assert.ok(!matrixSteps(unstopped.steps, 'launched').some(a => a[1] === 'settle'));
  assert.ok(unstopped.result.problems.some(p => /launch intents are kept/.test(p)));
  // The in-flight launch appeared after the run's quit: the settle quits it, and the put-back runs once more.
  const late = await runWith({plan: planOf('launch'), ops: {
    matrix: (base, a) => (a[0] === 'launched' && a[1] === 'settle' ? {quit: 1, remaining: 0, pending: 0, waitedMs: 3_000} : base(a))}});
  assert.equal(names(late.steps).filter(s => s === 'live recover').length, 2);
  assert.ok(late.result.problems.some(p => /appeared only after the run's quit/.test(p)));
  assert.equal(late.result.complete, false);
});

test('the whole matrix\'s verdict stays its outcomes, the oracle summary\'s to judge', async () => {
  const scroll = cellsOf('textedit', 'scroll', 'down').act;
  const calls = [];
  const full = {...planOf('background', {scene: 'textedit', user: 'finder'}), id: 'full'};
  const r = await runWith({calls, plan: full, cellName: 'matrix', ops: stopWith(() => ({activations: [{kind: 'activated', bundleId: 'com.apple.TextEdit', scene: true, at: calls.find(c => c.code.includes(scroll)).at[0] + 1}]}))});
  assert.ok(r.result.rows.some(row => row.interference?.ok === false));
  assert.deepEqual([r.result.judgesInterference, r.result.verdict], [undefined, 'pass']);
});

test('Chrome and Electron rows keep the engine\'s meta of their prepare, act and check; Electron rows record its accessibility mode beside the act; other scenes\' rows neither', async () => {
  const observation = {webShaped: true, enablementPrior: 'false', enabled: 'AXManualAccessibility', settle: 'settled'};
  const interval = {startedAt: 5, endedAt: 6};
  const click = cellsOf('electron', 'click', 'button');
  const cell = code => {
    if (code.includes(click.prepare)) return {ready: true, _meta: {'cua/observation': observation}};
    if (code.includes(click.act)) return {actMs: 1, at: [5, 6], threw: false, _meta: {'cua/inputRoute': 1, 'cua/actionInterval': interval}};
    if (code.includes(click.check)) return {ok: true, outcome: {pressedOnce: true}, _meta: {'cua/observation': {...observation, settleTreeReused: true}}};
    return null;
  };
  const {result, steps} = await runWith({plan: planOf('method', {scene: 'electron'}), cell});
  assert.deepEqual(validateCellResult(result), []);
  const rows = result.rows.filter(r => r.section === 'method' && r.method === 'click' && r.case === 'button');
  assert.deepEqual(rows.map(r => r.regime), ['frontmost', 'background']);
  for (const row of rows) {
    assert.deepEqual(row.engineMeta, {prepare: {observation}, act: {actionInterval: interval}, check: {observation: {...observation, settleTreeReused: true}}}, row.id);
    assert.deepEqual(row.actAt, [5, 6], row.id);
    assert.deepEqual(Object.keys(row.electronMode ?? {}), ['enabled', 'at'], row.id);
    assert.equal(row.inputRoute, 1);
  }
  // Every Electron row's device read after the act asks for the mode: the background's existing after-read, and in the
  // frontmost a read after the check, so the act-to-check timing is the earlier holds'.
  const electronRows = result.rows.filter(r => r.section === 'method' && !r.invalid);
  assert.ok(electronRows.every(r => r.electronMode), 'every Electron method row');
  const reads = matrixSteps(steps, 'read');
  assert.ok(reads.filter(a => a.includes('--electron-mode')).length >= electronRows.length);
  assert.ok(reads.filter(a => a.includes('--electron-mode')).every(a => a[a.indexOf('--electron-mode') + 1] === 'latest'));
  // TextEdit's rows carry neither.
  const textedit = await runWith({cell: code => (code.includes(cellsOf('textedit', 'click', 'control').prepare) ? {ready: true, _meta: {'cua/observation': observation}} : null)});
  const plain = textedit.result.rows.filter(r => r.section === 'method');
  assert.ok(plain.length > 10 && plain.every(r => r.engineMeta === undefined && r.electronMode === undefined && r.actAt === undefined));
  assert.ok(matrixSteps(textedit.steps, 'read').every(a => !a.includes('--electron-mode')));
});

test('the Electron fixture\'s accessibility record is exported whole into the run\'s output before the scene goes down, once', async () => {
  // The launch path brings the scene down: the export comes before that step.
  const launch = await runWith({plan: planOf('launch', {scene: 'electron'})});
  const order = launch.steps.map(s => (s.startsWith('matrix ') ? `matrix ${args(s)[0]}${args(s)[0] === 'step' ? ` ${args(s)[1]} ${args(s)[2]}` : ''}` : s.replace(/ .*$/, '')));
  assert.equal(order.filter(s => s === 'matrix electron-mode').length, 1);
  assert.ok(order.indexOf('matrix electron-mode') < order.indexOf('matrix step down electron'));
  assert.deepEqual(launch.result.meta.electronMode, {file: 'electron-accessibility.jsonl', records: 1});
  assert.deepEqual(launch.files['electron-accessibility.jsonl'].trim().split('\n').map(line => JSON.parse(line)), [{at: 0, enabled: false, source: 'start'}]);
  // Without a launch row, before the put-back takes the scenes down.
  const method = await runWith({plan: planOf('method', {scene: 'electron'})});
  const names2 = names(method.steps);
  assert.equal(names2.filter(s => s === 'matrix electron-mode').length, 1);
  assert.ok(names2.indexOf('matrix electron-mode') < names2.indexOf('live recover'));
  // A run without the Electron scene exports nothing.
  const none = await runWith();
  assert.ok(!names(none.steps).includes('matrix electron-mode'));
  assert.equal(none.result.meta.electronMode, undefined);
  assert.deepEqual(Object.keys(none.files), []);
});

test('the finding rows record Finder\'s list range; a list that did not start at its first rows leaves the cell invalid', async () => {
  const {findingCell} = await import('../../scripts/native-matrix/matrix-cells.mjs');
  const finding = findingCell('finder');
  const scored = await runWith({plan: planOf('finding', {scene: 'finder'}), cell: code => (code.includes(finding)
    ? {inFront: true, targets: [{id: 'file001', found: true, resolved: true}], lines: 10, named: 8, unclassified: 0, ids: 2, showing: {from: 0, to: 21, of: 205}} : null)});
  const rows = scored.result.rows.filter(r => r.section === 'finding');
  assert.deepEqual(rows.map(r => r.id), ['finder/target.file001', 'finder/lines', 'finder/ids']);
  assert.ok(rows.every(r => !r.invalid && r.showing?.from === 0 && r.showing.of === 205));
  const stuck = await runWith({plan: planOf('finding', {scene: 'finder'}), cell: code => (code.includes(finding)
    ? {invalid: 'Finder\'s list did not start at its first rows', showing: {from: 125, to: 146, of: 205}} : null)});
  assert.deepEqual(stuck.result.rows.filter(r => r.section === 'finding').map(r => [r.id, r.invalid, r.showing]),
    [['finder/lines', 'Finder\'s list did not start at its first rows', {from: 125, to: 146, of: 205}]]);
});

test('the matrix retains bind and refusal guard snapshots in row-indexed evidence', async () => {
  const windowOrder = {runWindowFound: true, windows: [{ownerName: 'Claude'}, {ownerPid: 736, ownerName: 'Finder', layer: 0, number: 7, bounds: {x: 80, y: 80, width: 920, height: 520}}]};
  const {result} = await runWith({ops: {matrix: (base, a) => {
    const out = base(a);
    if (a[0] === 'step' && a[1] === 'activate' && a[2] === 'finder') return {...out, answer: {...out.answer, ok: false, reason: 'obscured', windowOrder}};
    return out;
  }}});
  assert.equal(result.complete, false);
  assert.deepEqual(result.meta.activationGuards.map(g => ({scene: g.scene, beforeRow: g.beforeRow, ok: g.ok, windowOrder: g.windowOrder})),
    [{scene: 'finder', beforeRow: 0, ok: false, windowOrder}]);
});
