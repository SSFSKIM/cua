// The native baseline's Linux engine comparison (#171, docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md,
// The facade suites; Acceptance 10): `compare --engines <cv-dir> <cc-dir>`, cua's own host with the vendor engine
// against it with cua's engine, the engine the one attested difference. Every row is judged as the default compare
// judges it; an operation the engine answers also fails when cua's median is above the vendor engine's; the typeText and
// paste method cases require success on every cua sample (Plan of Work M2). The rows are real: the committed Linux
// cua-host triple of #116 M5 (docs/evidence/2026-10-14-own-repl-host-native/m5-cua-bench/cua), each run given the
// fields an engine-lane run records for the lane it stands for.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {readRuns} from '../../scripts/native-baseline/summary.mjs';
import {compareLanes, LINUX_LANE_MODES, renderComparison} from '../../scripts/native-baseline/compare.mjs';

const EVIDENCE = fileURLToPath(new URL('../../docs/evidence/2026-10-14-own-repl-host-native/m5-cua-bench/cua', import.meta.url));
const REAL = readRuns(EVIDENCE);
const BIN = '/home/admin/Developer/GitHub/cua-171/native/linux-engine/target/release/cua-engine';

function laneRun(real, {engine, scale = {}, edit = () => {}}) {
  const meta = structuredClone(real.meta), release = meta.runtime.release;
  const expected = engine === 'cua' ? BIN : `${meta.home}/runtimes/${release}/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64`;
  Object.assign(meta, {
    environment: {...meta.environment, CUA_NATIVE_ENGINE: engine, ...(engine === 'cua' ? {CUA_LINUX_ENGINE_BIN: BIN} : {})},
    service: {surface: 'computer', engine: 'sky', answered: 'vendor'},
    nativeEngine: {requested: engine, bin: engine === 'cua' ? BIN : null, expected, error: null, observed: [{exe: expected, kind: engine, parent: 'trusted-worker.mjs'}]},
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

test('Linux has one lane comparison: cua\'s host, the vendor engine against cua\'s, only the engine differs', () => {
  assert.deepEqual(Object.keys(LINUX_LANE_MODES), ['engines']);
  const lane = LINUX_LANE_MODES.engines;
  assert.deepEqual({baseline: lane.baseline, candidate: lane.candidate, differ: lane.differ}, {baseline: {host: 'cua', engine: 'vendor'}, candidate: {host: 'cua', engine: 'cua'}, differ: ['engine']});
});

test('the Linux engines comparison passes with positive cua text cases against the failing vendor engine', t => {
  const result = judge(t, triple('vendor'), triple('cua', {scale: FASTER}));
  assert.deepEqual(result.problems, []);
  assert.equal(result.verdict, 'PASS', JSON.stringify(result.operations.filter(o => o.verdict === 'fail')));
  assert.deepEqual(result.permitted.map(p => p.field), ['engine']);
  assert.equal(result.permitted[0].baseline, 'vendor (answered: sky_linux_arm64 of the run\'s runtime)');
  assert.equal(result.permitted[0].candidate, `cua (answered: cua-engine named by --engine-bin ${BIN})`);
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
  assert.match(op(result, 'warm.getAXState').reasons.join(' '), /above the vendor engine's .* an operation the engine answers/);
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
});
