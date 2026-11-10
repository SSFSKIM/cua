import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizePaired} from './paired-report.mjs';

function fixture() {
  const scenes = [{id: 'body', app: 'firefox'}, {id: 'compose', app: 'firefox'}, {id: 'files', app: 'finder'}];
  const engines = ['control', 'branch', 'candidate'].map((head, i) => ({head, ref: String(i + 1).repeat(40), sha256: `binary-${i}`}));
  const results = [];
  for (const scene of scenes) for (let round = 1; round <= 4; round++) for (const engine of engines) {
    const walkMs = {control: [10, 20, 30, 40], branch: [20, 40, 40, 40], candidate: [11, 22, 33, 44]}[engine.head][round - 1];
    results.push({scene: scene.id, app: scene.app, head: engine.head, ref: engine.ref, round, phase: 'measured', status: 'ok', timings: {walkMs}, nodeCount: 10, truncated: null});
  }
  const warmups = results.flatMap(row => [1, 2].map(warm => ({...row, phase: 'warm', warm, requestSent: true, timings: {walkMs: 99999}})));
  return {config: {group: 'paired', rounds: 4, warmupsPerVisit: 2, scenes, engines, completed: true}, results, warmups};
}

test('medians, marginal p95 differences, and round-paired deltas are distinct; warm cost never contaminates measured p50', () => {
  const report = summarizePaired(fixture());
  const scene = report.scenes.find(s => s.scene === 'body');
  assert.deepEqual(scene.engines.control, {expected: 4, present: 4, valid: 4, failed: 0, missing: 0, duplicateSlots: 0, p50: 25, p95: 40});
  const branch = scene.comparisons.branch;
  assert.equal(branch.p50DifferenceMs, 15);
  assert.equal(branch.p95DifferenceMs, 0);
  assert.equal(branch.paired.p50DifferenceMs, 10);
  assert.equal(branch.paired.p95DifferenceMs, 20);
  assert.deepEqual(branch.paired.byRound.map(r => [r.round, r.differenceMs]), [[1, 10], [2, 20], [3, 10], [4, 0]]);
  assert.equal(branch.within10PctP50, false);
  assert.equal(scene.comparisons.candidate.within10PctP50, true);
  const firefox = report.apps.find(a => a.app === 'firefox');
  assert.equal(firefox.engines.control.expected, 8);
  assert.equal(firefox.comparisons.branch.paired.expected, 8);
  assert.equal(firefox.comparisons.candidate.within10PctP50, true);
  assert.equal(report.warmups.total, 72);
  assert.equal(report.passed, false);
});

test('failed, absent, pending and duplicate observations remain in the planned denominator and cannot produce a passing flag', () => {
  const data = fixture();
  const rows = data.results.filter(r => r.scene === 'body' && r.head === 'candidate');
  rows[0].status = 'failed'; rows[0].error = {message: 'AX failed'};
  data.results = data.results.filter(r => r !== rows[1]);
  rows[2].status = 'pending';
  data.results.push({...rows[3]});
  const report = summarizePaired(data);
  const scene = report.scenes.find(s => s.scene === 'body');
  assert.deepEqual(scene.engines.candidate, {expected: 4, present: 4, valid: 0, failed: 3, missing: 1, duplicateSlots: 1, p50: null, p95: null});
  assert.equal(scene.comparisons.candidate.within10PctP50, null);
  assert.equal(scene.comparisons.candidate.paired.valid, 0);
  assert.deepEqual(scene.comparisons.candidate.paired.byRound.map(r => r.status), ['unpaired', 'unpaired', 'unpaired', 'unpaired']);
  assert.equal(report.issues.filter(i => i.head === 'candidate' && i.scene === 'body').length, 4);
  assert.equal(report.passed, false);
});

test('missing timing, negative cost, wrong head identity, or unplanned rows cannot silently improve a benchmark', () => {
  const data = fixture();
  const rows = data.results.filter(r => r.scene === 'body' && r.head === 'candidate');
  delete rows[0].timings.walkMs;
  rows[1].timings.walkMs = -1;
  rows[2].ref = 'wrong-head';
  data.results.push({...rows[3], round: 99});
  const report = summarizePaired(data);
  assert.equal(report.scenes.find(s => s.scene === 'body').engines.candidate.valid, 1);
  assert.equal(report.passed, false);
  assert.ok(report.issues.some(i => i.reason === 'unplanned observation'));
});

test('all apps must have complete measured slots before the within-10%-p50 gate passes', () => {
  const data = fixture();
  for (const row of data.results) if (row.head === 'branch') row.timings.walkMs = {1: 9, 2: 18, 3: 27, 4: 36}[row.round];
  assert.equal(summarizePaired(data).passed, true);
  data.config.completed = false;
  assert.equal(summarizePaired(data).passed, false);
});

test('candidate acceptance is independent of a slow or incomplete diagnostic branch', () => {
  const data = fixture();
  let report = summarizePaired(data);
  assert.equal(report.acceptance.candidate.passed, true);
  assert.equal(report.acceptance.branch.passed, false);
  assert.equal(report.passed, false);
  data.warmups = data.warmups.filter(r => r.head !== 'branch');
  data.results = data.results.filter(r => r.head !== 'branch');
  report = summarizePaired(data);
  assert.equal(report.acceptance.candidate.passed, true);
  assert.equal(report.acceptance.branch.complete, false);
  assert.equal(report.acceptance.branch.passed, false);
});

test('per-scene slowdown remains diagnostic when the binding per-app p50 passes', () => {
  const data = fixture();
  for (const row of data.results) {
    if (row.head === 'branch') row.timings.walkMs = row.round * 9;
    if (row.head === 'candidate' && row.app === 'firefox') row.timings.walkMs = row.round * (row.scene === 'body' ? 12 : 8);
  }
  const report = summarizePaired(data);
  assert.equal(report.scenes.find(s => s.scene === 'body').comparisons.candidate.within10PctP50, false);
  assert.equal(report.apps.find(s => s.app === 'firefox').comparisons.candidate.within10PctP50, true);
  assert.equal(report.acceptance.candidate.passed, true);
  assert.equal(report.passed, true);
});

test('a candidate exceeding the per-app p50 limit is complete but fails candidate acceptance', () => {
  const data = fixture();
  for (const row of data.results) if (row.head === 'candidate') row.timings.walkMs = row.round * 12;
  const report = summarizePaired(data);
  assert.equal(report.acceptance.candidate.complete, true);
  assert.equal(report.acceptance.candidate.passed, false);
});

for (const head of ['control', 'candidate']) for (const defect of ['failed', 'pending', 'not-run', 'missing', 'duplicate', 'ref', 'app', 'round', 'phase', 'timing', 'request']) {
  test(`${head} warm-up ${defect} invalidates its measured visit and candidate acceptance without shrinking the denominator`, () => {
    const data = fixture();
    const row = data.warmups.find(r => r.head === head && r.scene === 'body' && r.round === 1 && r.warm === 1);
    if (['failed', 'pending', 'not-run'].includes(defect)) row.status = defect;
    if (defect === 'missing') data.warmups = data.warmups.filter(r => r !== row);
    if (defect === 'duplicate') data.warmups.push({...row});
    if (defect === 'ref') row.ref = 'wrong-ref';
    if (defect === 'app') row.app = 'wrong-app';
    if (defect === 'round') row.round = 99;
    if (defect === 'phase') row.phase = 'measured';
    if (defect === 'timing') delete row.timings.walkMs;
    if (defect === 'request') row.requestSent = false;
    const report = summarizePaired(data);
    const app = report.apps.find(s => s.app === 'firefox');
    assert.equal(app.engines[head].expected, 8);
    assert.equal(app.engines[head].valid, 7);
    assert.equal(app.comparisons.candidate.paired.valid, 7);
    assert.equal(app.comparisons.candidate.within10PctP50, null);
    assert.equal(report.acceptance.candidate.passed, false);
    assert.ok(report.issues.some(i => i.head === head && i.phase === 'warm'));
    assert.ok(report.issues.some(i => i.head === head && i.phase === 'measured' && /warm/.test(i.reason)));
    assert.equal(data.results.length, 36);
  });
}

test('a manifest cannot opt out of the two required warm-up requests', () => {
  const data = fixture(); data.config.warmupsPerVisit = 0;
  assert.throws(() => summarizePaired(data), /manifest/);
});
