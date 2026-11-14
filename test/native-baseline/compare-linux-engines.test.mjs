// The native baseline's Linux engine comparison (#171, docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md,
// The facade suites; Acceptance 10): `compare --engines <cv-dir> <cc-dir>`, cua's own host with the vendor engine
// against it with cua's engine, the engine the one attested difference. Every row is judged as the default compare
// judges it; an operation the engine answers also fails when cua's median is above the vendor engine's; the typeText and
// paste method cases require success on every cua sample (Plan of Work M2). The rows are real: the committed Linux
// cua-host triple of #116 M5 (docs/evidence/2026-10-14-own-repl-host-native/m5-cua-bench/cua), each run given the
// fields an engine-lane run records for the lane it stands for.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {readRuns} from '../../scripts/native-baseline/summary.mjs';
import {compareLanes, DECLARED_ENGINE_GAPS, LINUX_LANE_MODES, renderComparison} from '../../scripts/native-baseline/compare.mjs';

const SCRIPT = fileURLToPath(new URL('../../scripts/native-baseline.mjs', import.meta.url));
const EVIDENCE = fileURLToPath(new URL('../../docs/evidence/2026-10-14-own-repl-host-native/m5-cua-bench/cua', import.meta.url));
const REAL = readRuns(EVIDENCE);
const BIN = '/home/admin/Developer/GitHub/cua-171/native/linux-engine/target/release/cua-engine';

function laneRun(real, {engine, scale = {}, edit = () => {}}) {
  const meta = structuredClone(real.meta), release = meta.runtime.release;
  const expected = engine === 'cua' ? BIN : `${meta.home}/runtimes/${release}/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64`;
  Object.assign(meta, {
    environment: {...meta.environment, CUA_NATIVE_ENGINE: engine, ...(engine === 'cua' ? {CUA_LINUX_ENGINE_BIN: BIN} : {})},
    service: {surface: 'computer', engine},
    nativeEngine: {requested: engine, bin: engine === 'cua' ? BIN : null, expected, error: null, observed: [{exe: expected, kind: engine, parent: 'trusted-worker.mjs', service: engine}]},
  });
  const rows = real.rows.map(r => {
    if (['method.typeText', 'method.paste'].includes(r.op)) return {...r, wallMs: engine === 'cua' ? 30 : 10_200, inCellMs: engine === 'cua' ? 25 : 10_190, outcome: engine === 'cua' ? 'returned' : 'threw', methodError: engine === 'cua' ? undefined : 'editable Paste did not insert text', target: 'survived', inserted: engine === 'cua' ? true : null};
    // a scaled operation is slower or faster inside the cell and around it alike
    return scale[r.op] ? {...r, wallMs: r.wallMs * scale[r.op], ...(r.inCellMs === undefined ? {} : {inCellMs: r.inCellMs * scale[r.op]})} : r;
  });
  edit(meta, rows);
  return {meta, rows};
}
const triple = (engine, options = {}) => REAL.map(real => laneRun(real, {engine, ...options}));
function dir(t, runs) {
  const root = mkdtempSync(join(tmpdir(), 'cua-m1b3-lanes-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  runs.forEach(({meta, rows}, i) => {
    mkdirSync(join(root, `run-${i + 1}`));
    writeFileSync(join(root, `run-${i + 1}`, 'meta.json'), JSON.stringify(meta));
    writeFileSync(join(root, `run-${i + 1}`, 'results.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  });
  return root;
}
const judge = (t, baseline, candidate, mode = 'engines') => compareLanes(mode, readRuns(dir(t, baseline)), readRuns(dir(t, candidate)));
const op = (result, name) => result.operations.find(o => o.op === name);
// The engine-answered rows a little faster on the cua lane, so the strict rule has a margin to judge.
const FASTER = Object.fromEntries(['warm.getState', 'warm.listApps', 'bind.getApp', 'warm.getAXState', 'warm.getScreenshot', 'task.act', 'task.verify', 'task.clear', 'task.total'].map(name => [name, 0.9]));

test('Linux has one lane comparison: cua\'s host, the vendor engine and service against cua\'s, only those differ', () => {
  assert.deepEqual(Object.keys(LINUX_LANE_MODES), ['engines']);
  const lane = LINUX_LANE_MODES.engines;
  assert.deepEqual({baseline: lane.baseline, candidate: lane.candidate, differ: lane.differ}, {baseline: {host: 'cua', engine: 'vendor'}, candidate: {host: 'cua', engine: 'cua'}, differ: ['engine', 'service']});
});

test('the Linux engines comparison passes with positive cua text cases against the failing vendor engine', t => {
  const result = judge(t, triple('vendor'), triple('cua', {scale: FASTER}));
  assert.deepEqual(result.problems, []);
  assert.equal(result.verdict, 'PASS', JSON.stringify(result.operations.filter(o => o.verdict === 'fail')));
  assert.deepEqual(result.permitted.map(p => p.field), ['engine', 'service']);
  assert.equal(result.permitted[0].baseline, 'vendor (answered: sky_linux_arm64 of the run\'s runtime)');
  assert.equal(result.permitted[0].candidate, `cua (answered: cua-engine named by --engine-bin ${BIN})`);
  assert.deepEqual([result.permitted[1].baseline, result.permitted[1].candidate], ['computer surface, answered by vendor', 'computer surface, answered by cua']);
  for (const name of ['method.typeText', 'method.paste']) {
    assert.equal(op(result, name).verdict, 'pass', name);
    assert.match(op(result, name).reasons.join(' '), /better: the method returned, its window survived and its text was read back/);
  }
  assert.equal(op(result, 'method.setValue').verdict, 'pass');
  const text = renderComparison(result);
  assert.match(text, /# Native baseline comparison A: engine \(Linux\)/);
  assert.match(text, /`--host cua --engine vendor`, the candidate `--host cua --engine cua`/);
  assert.match(text, /\| method\.typeText \|.*\| pass \|/);
  assert.match(text, /Verdict: \*\*PASS\*\*/);
});

test('an operation the engine answers fails when cua\'s median is above the vendor engine\'s, even within the tolerance', t => {
  const result = judge(t, triple('vendor'), triple('cua', {scale: {...FASTER, 'warm.getAXState': 1.05}}));
  assert.equal(result.verdict, 'FAIL');
  assert.equal(op(result, 'warm.getAXState').verdict, 'fail');
  // 90 samples a side: judged in-cell by Acceptance 3's interval rule, a 5% loss reaching past max(5% of the bar, 1 ms)
  assert.match(op(result, 'warm.getAXState').reasons.join(' '), /bootstrap 95% interval .* of cua's in-cell median minus the vendor engine's .* past the bound .* an operation the engine answers/);
  // An operation the engine is not in is judged by the tolerance alone, and listed when cua's median is above.
  const noise = judge(t, triple('vendor'), triple('cua', {scale: {...FASTER, 'warm.noop': 1.05}}));
  assert.equal(op(noise, 'warm.noop').verdict, 'pass');
  assert.ok(noise.above.some(a => a.op === 'warm.noop' && a.engineAnswered === false));
  assert.match(renderComparison(noise), /## Where cua's median is above the vendor engine's/);
});

test('every cua text sample must return without an error, survive and read back, even if most improve on the vendor', t => {
  for (const name of ['method.typeText', 'method.paste']) for (const patch of [
    {outcome: 'threw', methodError: 'editable Paste did not insert text', inserted: null},
    {outcome: 'threw', methodError: 'type_text is not available in this engine build', inserted: null},
    {target: 'exited'}, {inserted: false}, {inserted: undefined}, {methodError: 'another failure'}, {ok: false, error: 'harness failed'},
  ]) {
    let sample = 0;
    const result = judge(t, triple('vendor'), triple('cua', {scale: FASTER, edit: (meta, rows) => {if (sample++ === 1) Object.assign(rows.find(r => r.op === name), patch);}}));
    assert.equal(op(result, name).verdict, 'fail', `${name}: ${JSON.stringify(patch)}`);
  }
  const sameFailure = judge(t, triple('vendor'), triple('cua', {scale: FASTER, edit: (meta, rows) => {
    for (const row of rows.filter(r => ['method.typeText', 'method.paste'].includes(r.op))) Object.assign(row, {outcome: 'threw', methodError: 'editable Paste did not insert text', inserted: null});
  }}));
  assert.equal(op(sameFailure, 'method.typeText').verdict, 'fail');
  assert.equal(op(sameFailure, 'method.paste').verdict, 'fail');
});

test('positive cua text cases also pass when the vendor succeeds, without a defect waiver', t => {
  const result = judge(t, triple('vendor', {edit: (meta, rows) => {
    for (const row of rows.filter(r => ['method.typeText', 'method.paste'].includes(r.op))) Object.assign(row, {outcome: 'returned', methodError: undefined, inserted: true});
  }}), triple('cua', {scale: FASTER}));
  assert.equal(result.verdict, 'PASS');
});

test('a positive text method case whose cua median is above the vendor engine\'s fails', t => {
  for (const name of ['method.typeText', 'method.paste']) {
    // slower inside the cell, though its wall time stays the faster: #370 judges the in-cell time
    const slower = judge(t, triple('vendor'), triple('cua', {scale: FASTER, edit: (meta, rows) => { rows.find(r => r.op === name).inCellMs = 10_248.8; }}));
    assert.equal(slower.verdict, 'FAIL', name);
    assert.equal(op(slower, name).verdict, 'fail', name);
    assert.match(op(slower, name).reasons.join(' '), /above the vendor engine's .* an operation the engine answers/);
  }
});

test('the Linux comparison refuses the macOS modes, a lane of the wrong engine, and a run without an engine', t => {
  assert.throws(() => judge(t, triple('vendor'), triple('cua'), 'hosts'), /Linux has one host/);
  const swapped = judge(t, triple('cua'), triple('vendor'));
  assert.equal(swapped.verdict, 'NO VERDICT');
  assert.ok(swapped.problems.some(p => /the baseline attests the cua engine, not vendor/.test(p)));
  const unattested = judge(t, triple('vendor'), triple('cua', {edit: meta => { delete meta.nativeEngine; }}));
  assert.ok(unattested.problems.some(p => /has no requested engine/.test(p)));
  // From M3 the cua lane runs cua's service: a cua lane whose engine the vendor's service drove is no evidence.
  const vendorService = judge(t, triple('vendor'), triple('cua', {scale: FASTER, edit: meta => { meta.nativeEngine.observed[0].service = 'vendor'; }}));
  assert.equal(vendorService.verdict, 'NO VERDICT');
  assert.ok(vendorService.problems.some(p => /the vendor service drove the engine, not the cua lane's/.test(p)), JSON.stringify(vendorService.problems));
});

// #171 M4 T18 (the design session's ruling): the Linux engine comparison judges an operation the engine answers by
// Acceptance 3's speed rule, the gate's own (scripts/linux-engine-diff/stats.mjs judgeSeriesSpeed over events.mjs
// medianDifferenceInterval): with at least 20 samples a side, it passes when the upper end of the bootstrap 95% interval
// of cua's median minus the vendor's is within max(5% of the vendor's median, 1 ms). #171 M5 T3 (#370, the design
// session's F8, sminos 704): that series is the in-cell time, what the engines change; the wall time, which adds the MCP
// transport and the REPL host both lanes share, is reported beside it and judged by nothing. Its basis is the counted
// sitting at 8ab1cc75 (docs/evidence/2026-10-28-own-linux-engine/m4/facade/baseline/): by wall time warm.getState and
// warm.listApps were ties (cua 0.3 and 0.4 ms above), listApps undetermined; inside the cell cua was faster at both.
const SITTING = fileURLToPath(new URL('../../docs/evidence/2026-10-28-own-linux-engine/m4/facade/baseline/', import.meta.url));
const sitting = side => readRuns(join(SITTING, side));
// One side's runs with `name`'s successful samples' `key` (inCellMs or wallMs) edited, `edit(ms, i)` over them in order.
const edited = (runs, name, edit, key = 'inCellMs') => {
  let i = 0;
  return runs.map(run => ({...run, rows: run.rows.map(r => (r.op === name && r.ok === true ? {...r, [key]: edit(r[key], i++)} : r))}));
};

test('the stored sitting re-judged in-cell: every series the engine answers passes, and the wall time is reported beside it, unjudged', () => {
  const result = compareLanes('engines', sitting('cv'), sitting('cc'));
  assert.deepEqual(result.problems, []);
  assert.equal(result.verdict, 'PASS', JSON.stringify(result.operations.filter(o => o.verdict === 'fail').map(o => [o.op, o.reasons])));
  assert.deepEqual(result.topUp, {given: false, needed: [], pooled: [], undetermined: []});
  assert.deepEqual(result.unproved, []);
  const state = op(result, 'warm.getState'), apps = op(result, 'warm.listApps');
  // in the cell cua was faster: 3.6 against 3.94 ms, 3.43 against 3.88
  for (const [o, medians, interval] of [[state, {vendor: 3.94, cua: 3.6}, [-0.51, -0.154]], [apps, {vendor: 3.88, cua: 3.43}, [-0.542, -0.306]]]) {
    assert.equal(o.basis, 'in-cell median', o.op);
    assert.deepEqual([o.verdict, o.speed.rule, o.speed.basis, o.speed.samples, o.speed.medians, o.speed.interval, o.speed.label], ['pass', 'interval', 'in-cell', {vendor: 90, cua: 90}, medians, interval, 'faster'], o.op);
  }
  // the wall time beside it, by the same rule and judged by nothing: listApps's wall interval is the one M4 left undetermined
  assert.deepEqual(state.speed.wall, {samples: {vendor: 90, cua: 90}, medians: {vendor: 17.65, cua: 17.93}, interval: [-0.122, 0.834], bound: 1, label: 'same (within noise)'});
  assert.deepEqual(apps.speed.wall, {samples: {vendor: 90, cua: 90}, medians: {vendor: 16.83, cua: 17.2}, interval: [-0.227, 1.124], bound: 1, label: 'undetermined'});
  for (const name of ['warm.getAXState', 'warm.getScreenshot', 'task.act', 'task.verify', 'task.clear', 'task.total']) assert.deepEqual([op(result, name).verdict, op(result, name).speed.label], ['pass', 'faster'], name);
  for (const name of ['bind.getApp', 'method.typeText', 'method.paste']) assert.deepEqual([op(result, name).verdict, op(result, name).speed.rule, op(result, name).basis], ['pass', 'median', 'in-cell median'], name);
  // an operation no engine answers keeps the wall median
  assert.equal(op(result, 'warm.noop').basis, 'wall median');
  // what is above the vendor's is listed by the judged median, in-cell where the engine answers
  assert.ok(!result.above.some(a => a.op === 'warm.getState' || a.op === 'warm.listApps'), JSON.stringify(result.above));
  const text = renderComparison(result);
  assert.match(text, /## Speed of the operations the engine answers/);
  assert.match(text, /judged by the in-cell time.*the wall time.*reported beside it, unjudged/);
  assert.match(text, /\| warm\.listApps \| 90 \/ 90 \| 3\.88 \| 3\.43 \| \[-0\.542, -0\.306\] \| 1 \| faster \| pass \| 16\.8 \| 17\.2 \| \[-0\.227, 1\.124\] \| undetermined \|/);
  assert.match(text, /\| warm\.listApps \| in-cell median \|/);
  assert.match(text, /Verdict: \*\*PASS\*\*/);
});

// The negative controls: the wall-time judge (M4's) passes each case below that the in-cell judge fails, and fails the
// one it passes.
test('a cell slower in-cell fails, though its wall time is unchanged; a wall time slower around an unchanged cell is reported, not failed', () => {
  const inCell = compareLanes('engines', sitting('cv'), edited(sitting('cc'), 'warm.getState', ms => ms + 5));
  assert.equal(inCell.verdict, 'FAIL');
  const o = op(inCell, 'warm.getState');
  assert.deepEqual([o.verdict, o.speed.label], ['fail', 'loss']);
  assert.ok(o.speed.interval[0] > o.speed.bound, JSON.stringify(o.speed));
  assert.equal(o.speed.wall.label, 'same (within noise)', 'the wall time alone would have passed it');
  assert.match(o.reasons.join(' '), /bootstrap 95% interval .* of cua's in-cell median minus the vendor engine's .* past the bound .*: a loss/);
  const wall = compareLanes('engines', sitting('cv'), edited(sitting('cc'), 'warm.getState', ms => ms + 5, 'wallMs'));
  assert.equal(wall.verdict, 'PASS', JSON.stringify(wall.operations.filter(x => x.verdict === 'fail').map(x => [x.op, x.reasons])));
  const w = op(wall, 'warm.getState');
  assert.deepEqual([w.verdict, w.speed.label, w.speed.wall.label], ['pass', 'faster', 'loss']);
  // the latency tolerance reads the same median: a wall time 600 ms slower around an unchanged cell is not judged
  const slow = compareLanes('engines', sitting('cv'), edited(sitting('cc'), 'warm.getState', ms => ms + 600, 'wallMs'));
  assert.equal(op(slow, 'warm.getState').verdict, 'pass');
  // bind.getApp has 3 samples a side, fewer than the interval rule's 20: it keeps the median rule, in-cell
  const bind = compareLanes('engines', sitting('cv'), edited(sitting('cc'), 'bind.getApp', () => 700));
  assert.deepEqual([op(bind, 'bind.getApp').verdict, op(bind, 'bind.getApp').speed.rule], ['fail', 'median']);
  assert.match(op(bind, 'bind.getApp').reasons.join(' '), /cua's in-cell median 700 ms is above the vendor engine's .* fewer than 20 samples a side/);
});

test('a successful sample with no in-cell time fails its operation: the series the engines change is not shown', () => {
  const missing = sitting('cc').map((run, k) => ({...run, rows: run.rows.map(r => (k === 0 && r.op === 'warm.getAXState' && r.sample === 3 ? (({inCellMs: _, ...rest}) => rest)(r) : r))}));
  const result = compareLanes('engines', sitting('cv'), missing);
  assert.equal(result.verdict, 'FAIL');
  assert.equal(op(result, 'warm.getAXState').verdict, 'fail');
  assert.match(op(result, 'warm.getAXState').reasons.join(' '), /1 of the candidate's 90 successful samples carries no in-cell time/);
  const vendor = compareLanes('engines', sitting('cv').map(run => ({...run, rows: run.rows.map(r => (r.op === 'task.verify' ? (({inCellMs: _, ...rest}) => rest)(r) : r))})), sitting('cc'));
  assert.equal(op(vendor, 'task.verify').verdict, 'fail');
  assert.match(op(vendor, 'task.verify').reasons.join(' '), /30 of the baseline's 30 successful samples carry no in-cell time/);
});

// #171 M4 T18, the gate's R2 (the design session, 2026-11-13): Acceptance 3's own remedy for a series the comparison
// leaves undetermined, built into the comparison. The counted sitting names the series that need it (`topUp.needed`); a
// comparison given one top-up (three more runs a lane, the same candidate and display) pools exactly those series through
// the committed rule's own calls, once. #171 M5 (F8a, sminos 705): a series still undetermined after it fails R2, unless
// the design session declares it a gap by name (`declared`), and a declared series is unproved, listed apart from the
// passes. In-cell the stored sitting leaves nothing undetermined, so these fixtures widen cua's in-cell listApps samples
// by 2 ms either way, alternately: undetermined at 90 a side, [-2.262, 1.392] ms against the bound 1 ms.
const TOPUP = fileURLToPath(new URL('../../docs/evidence/2026-10-28-own-linux-engine/m4/facade/baseline-topup/', import.meta.url));
const topUpSitting = side => readRuns(join(TOPUP, side));
const widen = (ms, i) => ms + (i % 2 ? 2 : -2);
const wideSitting = () => edited(sitting('cc'), 'warm.listApps', widen);
const topUpOf = edit => ({baseline: topUpSitting('cv'), candidate: edit ? edited(topUpSitting('cc'), 'warm.listApps', edit) : topUpSitting('cc')});
const DECLARED = [{op: 'warm.listApps', reason: 'a fixture: the series this test leaves undetermined', ruling: 'the test'}];

test('the counted sitting names the undetermined series a top-up would decide, and only those', () => {
  const result = compareLanes('engines', sitting('cv'), wideSitting());
  assert.deepEqual(result.topUp, {given: false, needed: ['warm.listApps'], pooled: [], undetermined: []});
  const apps = op(result, 'warm.listApps');
  assert.deepEqual([apps.verdict, apps.speed.label, apps.speed.interval], ['fail', 'undetermined', [-2.262, 1.392]]);
  assert.match(apps.reasons.join(' '), /undetermined at 90 samples a side, failing unless its one top-up/);
  // a declaration does not stand in for the top-up: the series still needs it, and fails without it
  const declared = compareLanes('engines', sitting('cv'), wideSitting(), {declared: DECLARED});
  assert.deepEqual([declared.verdict, declared.topUp.needed, declared.unproved], ['FAIL', ['warm.listApps'], []]);
  // a series that fails on anything else is no top-up's to decide: a clear loss is final, and so is every other failure
  const loss = compareLanes('engines', sitting('cv'), edited(wideSitting(), 'warm.getAXState', ms => ms + 500));
  assert.equal(op(loss, 'warm.getAXState').speed.label, 'loss');
  assert.deepEqual(loss.topUp.needed, [], 'another failure stands whatever a top-up finds, so none is run');
  const failed = compareLanes('engines', sitting('cv'), wideSitting().map(run => ({...run, rows: run.rows.map(r => (r.op === 'task.verify' ? {...r, ok: false, error: 'verify failed'} : r))})));
  assert.deepEqual(failed.topUp.needed, []);
  assert.match(renderComparison(result), /## Top-up\n\nUndetermined at the samples of this sitting, and so failing until its one top-up \(three more runs a lane, the same candidate and display\) decides it: warm\.listApps\./);
});

test('a series undetermined in the counted sitting resolves when pooled with its top-up', () => {
  const result = compareLanes('engines', sitting('cv'), wideSitting(), {topUp: topUpOf()});
  assert.deepEqual(result.problems, []);
  assert.equal(result.verdict, 'PASS', JSON.stringify(result.operations.filter(o => o.verdict === 'fail').map(o => [o.op, o.reasons])));
  const apps = op(result, 'warm.listApps');
  assert.deepEqual([apps.verdict, apps.speed.verdict, apps.speed.label], ['pass', 'pass', 'faster']);
  assert.deepEqual([apps.speed.samples, apps.speed.interval, apps.speed.bound], [{vendor: 180, cua: 180}, [-0.484, -0.157], 1]);
  assert.deepEqual(apps.speed.toppedUp, {samples: {vendor: 90, cua: 90}, interval: [-2.262, 1.392], bound: 1, label: 'undetermined'});
  // the wall time beside it is pooled as the in-cell time is, and still judged by nothing
  assert.deepEqual(apps.speed.wall.samples, {vendor: 180, cua: 180});
  assert.deepEqual(result.topUp, {given: true, needed: [], pooled: ['warm.listApps'], undetermined: []});
  assert.deepEqual(result.unproved, []);
  // a series the counted sitting decided is not pooled: warm.getState stays at its 90 a side
  assert.deepEqual([op(result, 'warm.getState').speed.samples, op(result, 'warm.getState').speed.toppedUp], [{vendor: 90, cua: 90}, undefined]);
  const text = renderComparison(result);
  assert.match(text, /\| warm\.listApps \| 180 \/ 180 \|.*\| \[-0\.484, -0\.157\] \| 1 \| faster \| pass \|/);
  assert.match(text, /## Top-up\n\nOne top-up, three more runs a lane.*\n\n- warm\.listApps: undetermined at 90 \/ 90, \[-2\.262, 1\.392\] ms; pooled at 180 \/ 180, \[-0\.484, -0\.157\] ms against the bound 1 ms: faster, pass/);
  assert.match(text, /Verdict: \*\*PASS\*\*/);
});

test('fail closed: a series still undetermined after its one top-up fails the comparison', () => {
  const result = compareLanes('engines', sitting('cv'), wideSitting(), {topUp: topUpOf(widen)});
  assert.deepEqual(result.problems, []);
  assert.equal(result.verdict, 'FAIL');
  const apps = op(result, 'warm.listApps');
  assert.deepEqual([apps.verdict, apps.speed.verdict, apps.speed.label], ['fail', 'fail', 'undetermined']);
  assert.ok(apps.speed.interval[0] <= 0 && apps.speed.interval[1] > apps.speed.bound, JSON.stringify(apps.speed));
  assert.deepEqual(result.topUp.undetermined, [{op: 'warm.listApps', samples: {vendor: 180, cua: 180}, interval: apps.speed.interval, bound: 1}]);
  assert.deepEqual(result.topUp.needed, [], 'one top-up only: a series still undetermined asks for no second');
  assert.deepEqual(result.unproved, []);
  assert.match(apps.reasons.join(' '), /still undetermined after its one top-up, at 180 samples a side, and declared no gap: a failure/);
  const text = renderComparison(result);
  assert.match(text, /\| warm\.listApps \| 180 \/ 180 \|.*\| undetermined \| fail \|/);
  assert.match(text, new RegExp(`Still undetermined after its top-up, and so failing: warm\\.listApps \\[${apps.speed.interval.join(', ').replace(/[.[\]-]/g, '\\$&')}\\] ms against the bound 1 ms\\.`));
  assert.match(text, /Verdict: \*\*FAIL\*\*/);
});

test('a series declared a gap by name is unproved after its top-up: listed apart, never a pass, and the comparison passes', () => {
  const result = compareLanes('engines', sitting('cv'), wideSitting(), {topUp: topUpOf(widen), declared: DECLARED});
  assert.deepEqual(result.problems, []);
  assert.equal(result.verdict, 'PASS', JSON.stringify(result.operations.filter(o => o.verdict === 'fail').map(o => [o.op, o.reasons])));
  const apps = op(result, 'warm.listApps');
  assert.deepEqual([apps.verdict, apps.speed.verdict, apps.speed.label], ['unproved', 'unproved', 'undetermined']);
  assert.deepEqual(result.unproved, [{op: 'warm.listApps', samples: {vendor: 180, cua: 180}, interval: apps.speed.interval, bound: 1, reason: DECLARED[0].reason, ruling: 'the test'}]);
  assert.deepEqual(result.topUp.undetermined, [], 'an unproved series is not among the failures');
  assert.match(apps.reasons.join(' '), /still undetermined after its one top-up, at 180 samples a side: declared a gap by name \(the test\): unproved, not a pass/);
  const text = renderComparison(result);
  assert.match(text, /\| warm\.listApps \| 180 \/ 180 \|.*\| undetermined \| unproved \|/);
  assert.match(text, /## Unproved: declared gaps, not passes\n\n- warm\.listApps: \[-?[\d.]+, [\d.]+\] ms against the bound 1 ms at 180 \/ 180 samples; declared by the test: a fixture: the series this test leaves undetermined/);
  assert.match(text, /Verdict: \*\*PASS\*\*, with 1 series unproved \(declared gaps, listed apart, not passes\)/);
  // a declaration naming another series does not cover this one
  const other = compareLanes('engines', sitting('cv'), wideSitting(), {topUp: topUpOf(widen), declared: [{...DECLARED[0], op: 'warm.getState'}]});
  assert.deepEqual([other.verdict, op(other, 'warm.listApps').verdict, other.unproved], ['FAIL', 'fail', []]);
  // a declaration covers a series left undetermined, never a loss: shown cua slower beyond the bound, it still fails
  const loss = compareLanes('engines', sitting('cv'), wideSitting(), {topUp: topUpOf(ms => ms + 3), declared: DECLARED});
  assert.equal(loss.verdict, 'FAIL');
  const l = op(loss, 'warm.listApps');
  assert.deepEqual([l.verdict, l.speed.verdict, l.speed.label, l.speed.samples], ['fail', 'fail', 'loss', {vendor: 180, cua: 180}]);
  assert.ok(l.speed.interval[0] > 0 && l.speed.interval[1] > l.speed.bound, JSON.stringify(l.speed));
  assert.match(l.reasons.join(' '), /pooled with its top-up at 180 samples a side .* a loss/);
  assert.deepEqual(loss.unproved, []);
});

test('a declaration must name an operation the engine answers, with its reason and ruling; and the list starts empty', () => {
  assert.deepEqual(DECLARED_ENGINE_GAPS, []);
  for (const bad of [[{op: 'warm.noop', reason: 'r', ruling: 'x'}], [{op: 'warm.listApps', ruling: 'x'}], [{op: 'warm.listApps', reason: 'r', ruling: ''}], [DECLARED[0], DECLARED[0]]])
    assert.throws(() => compareLanes('engines', sitting('cv'), sitting('cc'), {declared: bad}), /a declared gap/, JSON.stringify(bad));
});

// The review of 2d5cfeb5 (the coordinator, 2026-11-13): a top-up's failed requests must never vanish from the verdict.
// Its sitting is judged by every rule the counted sitting is (outcomes, verification, method cases, latency), each failure
// carried into the result, and a series is pooled only when both of its top-up sides lost no sample.
const failing = (runs, name) => runs.map(run => ({...run, rows: run.rows.map(r => (r.op === name ? {...r, ok: false, error: 'the request failed'} : r))}));
test('a top-up whose candidate warm.listApps requests all failed fails, never pooling to a passing interval, declared or not', () => {
  const result = compareLanes('engines', sitting('cv'), wideSitting(), {topUp: {baseline: topUpSitting('cv'), candidate: failing(topUpSitting('cc'), 'warm.listApps')}, declared: DECLARED});
  assert.equal(result.verdict, 'FAIL');
  const apps = op(result, 'warm.listApps');
  assert.equal(apps.verdict, 'fail');
  assert.match(apps.reasons.join(' '), /top-up: 0\/90 succeeded, the baseline 90\/90/);
  assert.match(apps.reasons.join(' '), /not pooled: its top-up's candidate lost 90 of 90 samples/);
  assert.equal(apps.speed.verdict, 'fail');
  assert.equal(apps.speed.toppedUp, undefined, 'the series was not pooled');
  assert.deepEqual(apps.speed.samples, {vendor: 90, cua: 90});
  assert.deepEqual([result.topUp.pooled, result.unproved], [[], []]);
});

test('a top-up whose task.verify requests all failed fails the comparison, though the counted sitting\'s verify passed', () => {
  const result = compareLanes('engines', sitting('cv'), wideSitting(), {topUp: {baseline: topUpSitting('cv'), candidate: failing(topUpSitting('cc'), 'task.verify')}});
  assert.equal(result.verdict, 'FAIL');
  const verify = op(result, 'task.verify');
  assert.equal(verify.verdict, 'fail');
  assert.match(verify.reasons.join(' '), /top-up: 0\/30 succeeded, the baseline 30\/30/);
  // the undetermined series itself was clean on both sides, so it is still pooled and judged
  assert.deepEqual(op(result, 'warm.listApps').speed.samples, {vendor: 180, cua: 180});
});

test('a series whose top-up lost a sample on either side is not pooled, even when both sides lost alike', () => {
  const one = runs => runs.map((run, k) => ({...run, rows: run.rows.map(r => (k === 0 && r.op === 'warm.listApps' && r.sample === run.rows.find(x => x.op === 'warm.listApps').sample ? {...r, ok: false, error: 'the request failed'} : r))}));
  const result = compareLanes('engines', sitting('cv'), wideSitting(), {topUp: {baseline: one(topUpSitting('cv')), candidate: one(topUpSitting('cc'))}});
  assert.equal(result.verdict, 'FAIL');
  const apps = op(result, 'warm.listApps');
  assert.equal(apps.verdict, 'fail');
  assert.match(apps.reasons.join(' '), /not pooled: its top-up's baseline lost 1 of 90 samples .* candidate lost 1 of 90/);
  assert.deepEqual(result.topUp.pooled, []);
});

test('at most one top-up: it pools each undetermined series once, must match its sitting, and is Linux\'s alone', () => {
  // the pooled series is the counted sitting's samples and one top-up's, never more: a second top-up has no way in
  const result = compareLanes('engines', sitting('cv'), wideSitting(), {topUp: topUpOf()});
  assert.equal(op(result, 'warm.listApps').speed.samples.cua, 180);
  assert.throws(() => compareLanes('engines', sitting('cv'), sitting('cc'), {topUp: [{baseline: topUpSitting('cv'), candidate: topUpSitting('cc')}]}), /one top-up/);
  // a top-up of another candidate, or one incomplete, decides nothing: no verdict
  const other = compareLanes('engines', sitting('cv'), sitting('cc'), {topUp: {baseline: topUpSitting('cv'), candidate: topUpSitting('cc').map(run => ({...run, meta: {...run.meta, commit: 'f'.repeat(40)}}))}});
  assert.equal(other.verdict, 'NO VERDICT');
  assert.ok(other.problems.some(p => /^top-up: the candidate's commit differs from its sitting's/.test(p)), JSON.stringify(other.problems));
  const short = compareLanes('engines', sitting('cv'), sitting('cc'), {topUp: {baseline: topUpSitting('cv').slice(0, 2), candidate: topUpSitting('cc')}});
  assert.equal(short.verdict, 'NO VERDICT');
  assert.ok(short.problems.some(p => /^top-up: .*2 runs/.test(p)), JSON.stringify(short.problems));
});

// R2 reads compare --engines's exit status, so the fail-closed rule must reach it: a series still undetermined after the
// top-up exits nonzero, and a declared one exits 0 with its UNPROVED line, from the comparison's own list.
const DIRS = fileURLToPath(new URL('../../scripts/native-baseline.mjs', import.meta.url));
const compareWith = (args, declared) => spawnSync(process.execPath, ['--input-type=module', '-e',
  `import {compareDirs} from ${JSON.stringify(DIRS)}; const [b, c, ub, uc, out] = process.argv.slice(1); process.exitCode = compareDirs(b, c, {lanes: 'engines', topUp: {baseline: ub, candidate: uc}, out, declared: ${JSON.stringify(declared)}});`,
  ...args], {encoding: 'utf8'});
test('compare --engines prints the series a top-up would decide, takes one top-up, and exits nonzero on a series it left undetermined', t => {
  const counted = [join(SITTING, 'cv'), dir(t, wideSitting())];
  const wide = topUpOf(widen);
  const still = spawnSync(process.execPath, [SCRIPT, 'compare', '--engines', ...counted, '--top-up-baseline', dir(t, wide.baseline), '--top-up-candidate', dir(t, wide.candidate)], {encoding: 'utf8'});
  assert.equal(still.status, 1, still.stderr);
  assert.match(still.stderr, /^UNDETERMINED AFTER TOP-UP \(a failure: declared no gap\): warm\.listApps \[-?[\d.]+, [\d.]+\] ms, bound 1 ms, 180 \/ 180 samples$/m);
  assert.doesNotMatch(still.stderr, /UNPROVED/);
  assert.match(still.stderr, /^VERDICT: FAIL$/m);
  // declared by name, the same comparison exits 0, and prints the series as unproved
  const out = join(dir(t, []), 'comparison.md');
  const declared = compareWith([...counted, dir(t, wide.baseline), dir(t, wide.candidate), out], DECLARED);
  assert.equal(declared.status, 0, declared.stderr);
  assert.match(declared.stderr, /^UNPROVED \(a declared gap, not a pass; the test\): warm\.listApps \[-?[\d.]+, [\d.]+\] ms, bound 1 ms, 180 \/ 180 samples$/m);
  assert.doesNotMatch(declared.stderr, /UNDETERMINED AFTER TOP-UP/);
  assert.match(declared.stderr, /^VERDICT: PASS$/m);
  assert.match(readFileSync(out, 'utf8'), /## Unproved: declared gaps, not passes/);
  // a declaration naming another series leaves it failing
  const another = compareWith([...counted, dir(t, wide.baseline), dir(t, wide.candidate), out], [{...DECLARED[0], op: 'warm.getState'}]);
  assert.equal(another.status, 1, another.stderr);
  const first = spawnSync(process.execPath, [SCRIPT, 'compare', '--engines', ...counted], {encoding: 'utf8'});
  assert.equal(first.status, 1);
  assert.match(first.stderr, /^TOP-UP NEEDED: warm\.listApps$/m);
  assert.match(first.stderr, /^VERDICT: FAIL$/m);
  const topped = spawnSync(process.execPath, [SCRIPT, 'compare', '--engines', ...counted, '--top-up-baseline', join(TOPUP, 'cv'), '--top-up-candidate', join(TOPUP, 'cc')], {encoding: 'utf8'});
  assert.equal(topped.status, 0, topped.stderr);
  assert.doesNotMatch(topped.stderr, /TOP-UP NEEDED/);
  assert.match(topped.stderr, /^VERDICT: PASS$/m);
  // the stored sitting itself passes in-cell with no top-up
  const stored = spawnSync(process.execPath, [SCRIPT, 'compare', '--engines', join(SITTING, 'cv'), join(SITTING, 'cc')], {encoding: 'utf8'});
  assert.equal(stored.status, 0, stored.stderr);
  const twice = spawnSync(process.execPath, [SCRIPT, 'compare', '--engines', ...counted, '--top-up-baseline', join(TOPUP, 'cv'), '--top-up-candidate', join(TOPUP, 'cc'), '--top-up-baseline', join(TOPUP, 'cv'), '--top-up-candidate', join(TOPUP, 'cc')], {encoding: 'utf8'});
  assert.notEqual(twice.status, 0);
  assert.match(twice.stderr, /one top-up/);
  const half = spawnSync(process.execPath, [SCRIPT, 'compare', '--engines', ...counted, '--top-up-baseline', join(TOPUP, 'cv')], {encoding: 'utf8'});
  assert.notEqual(half.status, 0);
  assert.match(half.stderr, /--top-up-baseline and --top-up-candidate/);
});
