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
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {readRuns} from '../../scripts/native-baseline/summary.mjs';
import {compareLanes, LINUX_LANE_MODES, renderComparison} from '../../scripts/native-baseline/compare.mjs';

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
    if (['method.typeText', 'method.paste'].includes(r.op)) return {...r, wallMs: engine === 'cua' ? 30 : 10_200, outcome: engine === 'cua' ? 'returned' : 'threw', methodError: engine === 'cua' ? undefined : 'editable Paste did not insert text', target: 'survived', inserted: engine === 'cua' ? true : null};
    return scale[r.op] ? {...r, wallMs: r.wallMs * scale[r.op]} : r;
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
  // 90 samples a side: judged by Acceptance 3's interval rule, a 5% loss reaching past max(5% of the bar, 1 ms)
  assert.match(op(result, 'warm.getAXState').reasons.join(' '), /bootstrap 95% interval .* of cua's median minus the vendor engine's .* past the bound .* an operation the engine answers/);
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
    const slower = judge(t, triple('vendor'), triple('cua', {scale: FASTER, edit: (meta, rows) => { rows.find(r => r.op === name).wallMs = 10_248.8; }}));
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
// of cua's median minus the vendor's is within max(5% of the vendor's median, 1 ms). Its basis is the counted sitting at
// 8ab1cc75 (docs/evidence/2026-10-28-own-linux-engine/m4/facade/baseline/): warm.getState and warm.listApps, cua's medians
// 0.3 and 0.4 ms above the vendor's, a tie the old rule (no cua median above) failed.
const SITTING = fileURLToPath(new URL('../../docs/evidence/2026-10-28-own-linux-engine/m4/facade/baseline/', import.meta.url));
const sitting = side => readRuns(join(SITTING, side));
// The old rule failed both ties. Acceptance 3's passes warm.getState's (its interval includes 0 and stays within the
// 1 ms bound) and leaves warm.listApps's undetermined (its interval includes 0 but reaches past the bound), which at 90
// samples a side fails.
test('the counted sitting re-judged by Acceptance 3\'s interval rule: getState\'s tie passes, listApps\'s interval reaches past the bound', () => {
  const result = compareLanes('engines', sitting('cv'), sitting('cc'));
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.operations.filter(o => o.verdict === 'fail').map(o => o.op), ['warm.listApps']);
  const state = op(result, 'warm.getState'), apps = op(result, 'warm.listApps');
  assert.equal(state.verdict, 'pass');
  assert.deepEqual([state.speed.rule, state.speed.samples, state.speed.label], ['interval', {vendor: 90, cua: 90}, 'same (within noise)']);
  assert.ok(state.speed.interval[0] <= 0 && state.speed.interval[1] <= state.speed.bound, JSON.stringify(state.speed));
  assert.equal(apps.speed.label, 'undetermined');
  assert.ok(apps.speed.interval[0] <= 0 && apps.speed.interval[1] > apps.speed.bound, JSON.stringify(apps.speed));
  assert.match(apps.reasons.join(' '), /undetermined at 90 samples a side/);
  for (const name of ['warm.getState', 'warm.listApps']) assert.ok(result.above.some(a => a.op === name && a.engineAnswered), name);
  // every other operation the engine answers passes, the series with 20 samples or more as faster
  for (const name of ['warm.getAXState', 'warm.getScreenshot', 'task.act', 'task.verify', 'task.clear', 'task.total']) assert.deepEqual([op(result, name).verdict, op(result, name).speed.label], ['pass', 'faster'], name);
  for (const name of ['bind.getApp', 'method.typeText', 'method.paste']) assert.deepEqual([op(result, name).verdict, op(result, name).speed.rule], ['pass', 'median'], name);
  const text = renderComparison(result);
  assert.match(text, /## Speed of the operations the engine answers/);
  assert.match(text, /\| warm\.getState \| 90 \/ 90 \|.*\| same \(within noise\) \| pass \|/);
  assert.match(text, /\| warm\.listApps \| 90 \/ 90 \|.*\| undetermined \| fail \|/);
  assert.match(text, /- warm\.getState: cua 17\.9 ms, vendor 17\.6 ms \(an operation the engine answers: judged by Acceptance 3's interval rule, pass\)/);
});

test('a clear cua loss beyond the bound still fails by the interval rule, as does a cua median above on a series too short for it', () => {
  const slower = sitting('cc').map(run => ({...run, rows: run.rows.map(r => (r.op === 'warm.getState' && r.ok ? {...r, wallMs: r.wallMs + 5} : r))}));
  const result = compareLanes('engines', sitting('cv'), slower);
  assert.equal(result.verdict, 'FAIL');
  const o = op(result, 'warm.getState');
  assert.equal(o.verdict, 'fail');
  assert.ok(o.speed.interval[0] > o.speed.bound, JSON.stringify(o.speed));
  assert.equal(o.speed.label, 'loss');
  assert.match(o.reasons.join(' '), /bootstrap 95% interval .* of cua's median minus the vendor engine's .* past the bound .*: a loss/);
  // bind.getApp has 3 samples a side, fewer than the interval rule's 20: it keeps the median rule
  const bind = sitting('cc').map(run => ({...run, rows: run.rows.map(r => (r.op === 'bind.getApp' && r.ok ? {...r, wallMs: 700} : r))}));
  const short = compareLanes('engines', sitting('cv'), bind);
  assert.equal(op(short, 'bind.getApp').verdict, 'fail');
  assert.equal(op(short, 'bind.getApp').speed.rule, 'median');
  assert.match(op(short, 'bind.getApp').reasons.join(' '), /above the vendor engine's .* fewer than 20 samples a side/);
});

// #171 M4 T18, the gate's R2 (the design session, 2026-11-13): Acceptance 3's own remedy for a series the comparison
// leaves undetermined, built into the comparison. The counted sitting names the series that need it (`topUp.needed`); a
// comparison given one top-up (three more runs a lane, the same candidate and display) pools exactly those series through
// the committed rule's own calls, once. Its basis is the facade's own top-up at 8ab1cc75 (m4/facade/baseline-topup/):
// warm.listApps at 180 a side, pooled by scripts/pool-listapps.mjs to [-0.16, 0.732] ms.
const TOPUP = fileURLToPath(new URL('../../docs/evidence/2026-10-28-own-linux-engine/m4/facade/baseline-topup/', import.meta.url));
const topUpSitting = side => readRuns(join(TOPUP, side));
// The counted sitting's own runs standing in for a top-up of the same session, cua's warm.listApps samples edited.
const editedTopUp = edit => ({baseline: sitting('cv'), candidate: sitting('cc').map(run => {
  let i = 0;
  return {...run, rows: run.rows.map(r => (r.op === 'warm.listApps' && r.ok === true ? {...r, wallMs: edit(r.wallMs, i++)} : r))};
})});

test('the counted sitting names the undetermined series a top-up would decide, and only those', () => {
  const result = compareLanes('engines', sitting('cv'), sitting('cc'));
  assert.deepEqual(result.topUp, {given: false, needed: ['warm.listApps'], pooled: [], undetermined: []});
  // a series that fails on anything else is no top-up's to decide: a clear loss is final, and so is every other failure
  const loss = compareLanes('engines', sitting('cv'), sitting('cc').map(run => ({...run, rows: run.rows.map(r => (r.op === 'warm.getAXState' && r.ok ? {...r, wallMs: r.wallMs + 500} : r))})));
  assert.equal(op(loss, 'warm.getAXState').speed.label, 'loss');
  assert.deepEqual(loss.topUp.needed, [], 'another failure stands whatever a top-up finds, so none is run');
  const failed = compareLanes('engines', sitting('cv'), sitting('cc').map(run => ({...run, rows: run.rows.map(r => (r.op === 'task.verify' ? {...r, ok: false, error: 'verify failed'} : r))})));
  assert.deepEqual(failed.topUp.needed, []);
  assert.match(renderComparison(result), /## Top-up\n\nUndetermined at the samples of this sitting, and so failing until its one top-up \(three more runs a lane, the same candidate and display\) decides it: warm\.listApps\./);
});

test('a series undetermined in the counted sitting resolves when pooled with its top-up', () => {
  const result = compareLanes('engines', sitting('cv'), sitting('cc'), {topUp: {baseline: topUpSitting('cv'), candidate: topUpSitting('cc')}});
  assert.deepEqual(result.problems, []);
  assert.equal(result.verdict, 'PASS', JSON.stringify(result.operations.filter(o => o.verdict === 'fail').map(o => [o.op, o.reasons])));
  const apps = op(result, 'warm.listApps');
  assert.deepEqual([apps.verdict, apps.speed.verdict, apps.speed.label], ['pass', 'pass', 'same (within noise)']);
  // the committed rule's own calls over both sittings' samples, as pool-listapps.mjs makes them
  assert.deepEqual([apps.speed.samples, apps.speed.interval, apps.speed.bound], [{vendor: 180, cua: 180}, [-0.16, 0.732], 1]);
  assert.deepEqual(apps.speed.toppedUp, {samples: {vendor: 90, cua: 90}, interval: [-0.227, 1.124], bound: 1, label: 'undetermined'});
  assert.deepEqual(result.topUp, {given: true, needed: [], pooled: ['warm.listApps'], undetermined: []});
  // a series the counted sitting decided is not pooled: warm.getState stays at its 90 a side
  assert.deepEqual([op(result, 'warm.getState').speed.samples, op(result, 'warm.getState').speed.toppedUp], [{vendor: 90, cua: 90}, undefined]);
  const text = renderComparison(result);
  assert.match(text, /\| warm\.listApps \| 180 \/ 180 \|.*\| \[-0\.16, 0\.732\] \| 1 \| same \(within noise\) \| pass \|/);
  assert.match(text, /## Top-up\n\nOne top-up, three more runs a lane.*\n\n- warm\.listApps: undetermined at 90 \/ 90, \[-0\.227, 1\.124\] ms; pooled at 180 \/ 180, \[-0\.16, 0\.732\] ms against the bound 1 ms: same \(within noise\), pass/);
  assert.match(text, /Verdict: \*\*PASS\*\*/);
});

test('a series still undetermined after its top-up is reported with its interval, and is not a failure', () => {
  const result = compareLanes('engines', sitting('cv'), sitting('cc'), {topUp: editedTopUp((ms, i) => ms + (i % 2 ? 4 : -4))});
  assert.deepEqual(result.problems, []);
  assert.equal(result.verdict, 'PASS', JSON.stringify(result.operations.filter(o => o.verdict === 'fail').map(o => [o.op, o.reasons])));
  const apps = op(result, 'warm.listApps');
  assert.deepEqual([apps.verdict, apps.speed.verdict, apps.speed.label], ['pass', 'undetermined', 'undetermined']);
  assert.ok(apps.speed.interval[0] <= 0 && apps.speed.interval[1] > apps.speed.bound, JSON.stringify(apps.speed));
  assert.deepEqual(result.topUp.undetermined, [{op: 'warm.listApps', samples: {vendor: 180, cua: 180}, interval: apps.speed.interval, bound: 1}]);
  assert.deepEqual(result.topUp.needed, [], 'one top-up only: a series still undetermined asks for no second');
  assert.match(apps.reasons.join(' '), /still undetermined after its one top-up, at 180 samples a side: reported, not a failure/);
  const text = renderComparison(result);
  assert.match(text, /\| warm\.listApps \| 180 \/ 180 \|.*\| undetermined \| undetermined \|/);
  assert.match(text, new RegExp(`Still undetermined after its top-up, reported and not a failure: warm\\.listApps \\[${apps.speed.interval.join(', ').replace(/[.[\]-]/g, '\\$&')}\\] ms against the bound 1 ms\\.`));
});

test('a series the top-up shows cua slower beyond the bound fails', () => {
  const result = compareLanes('engines', sitting('cv'), sitting('cc'), {topUp: editedTopUp(ms => ms + 3)});
  assert.equal(result.verdict, 'FAIL');
  const apps = op(result, 'warm.listApps');
  assert.deepEqual([apps.verdict, apps.speed.verdict, apps.speed.label, apps.speed.samples], ['fail', 'fail', 'loss', {vendor: 180, cua: 180}]);
  assert.ok(apps.speed.interval[0] > 0 && apps.speed.interval[1] > apps.speed.bound, JSON.stringify(apps.speed));
  assert.match(apps.reasons.join(' '), /pooled with its top-up at 180 samples a side .* a loss/);
  assert.deepEqual(result.topUp.undetermined, []);
});

test('at most one top-up: it pools each undetermined series once, must match its sitting, and is Linux\'s alone', () => {
  // the pooled series is the counted sitting's samples and one top-up's, never more: a second top-up has no way in
  const result = compareLanes('engines', sitting('cv'), sitting('cc'), {topUp: {baseline: topUpSitting('cv'), candidate: topUpSitting('cc')}});
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

test('compare --engines prints the series a top-up would decide, takes one top-up and prints what it left undetermined', t => {
  const counted = [join(SITTING, 'cv'), join(SITTING, 'cc')];
  const wide = editedTopUp((ms, i) => ms + (i % 2 ? 4 : -4));
  const still = spawnSync(process.execPath, [SCRIPT, 'compare', '--engines', ...counted, '--top-up-baseline', dir(t, wide.baseline), '--top-up-candidate', dir(t, wide.candidate)], {encoding: 'utf8'});
  assert.equal(still.status, 0, still.stderr);
  assert.match(still.stderr, /^UNDETERMINED AFTER TOP-UP \(reported, not a failure\): warm\.listApps \[-?[\d.]+, [\d.]+\] ms, bound 1 ms, 180 \/ 180 samples$/m);
  assert.match(still.stderr, /^VERDICT: PASS$/m);
  const first = spawnSync(process.execPath, [SCRIPT, 'compare', '--engines', ...counted], {encoding: 'utf8'});
  assert.equal(first.status, 1);
  assert.match(first.stderr, /^TOP-UP NEEDED: warm\.listApps$/m);
  assert.match(first.stderr, /^VERDICT: FAIL$/m);
  const topped = spawnSync(process.execPath, [SCRIPT, 'compare', '--engines', ...counted, '--top-up-baseline', join(TOPUP, 'cv'), '--top-up-candidate', join(TOPUP, 'cc')], {encoding: 'utf8'});
  assert.equal(topped.status, 0, topped.stderr);
  assert.doesNotMatch(topped.stderr, /TOP-UP NEEDED/);
  assert.match(topped.stderr, /^VERDICT: PASS$/m);
  const twice = spawnSync(process.execPath, [SCRIPT, 'compare', '--engines', ...counted, '--top-up-baseline', join(TOPUP, 'cv'), '--top-up-candidate', join(TOPUP, 'cc'), '--top-up-baseline', join(TOPUP, 'cv'), '--top-up-candidate', join(TOPUP, 'cc')], {encoding: 'utf8'});
  assert.notEqual(twice.status, 0);
  assert.match(twice.stderr, /one top-up/);
  const half = spawnSync(process.execPath, [SCRIPT, 'compare', '--engines', ...counted, '--top-up-baseline', join(TOPUP, 'cv')], {encoding: 'utf8'});
  assert.notEqual(half.status, 0);
  assert.match(half.stderr, /--top-up-baseline and --top-up-candidate/);
});
