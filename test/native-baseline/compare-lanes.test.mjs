// #117's three comparisons on the native baseline (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// Verification system part 1): A (--engines) vendor host and engine against the vendor host with cua's engine, B
// (--hosts) that against cua's host and engine, C (--end-to-end) the two ends. Each judges every row the default compare
// judges, needs three complete, attested runs a side of one sitting, and names exactly which attested fields may differ.
// The rows are real: the mini's committed approved-runtime vendor triple (docs/evidence/2026-10-17-own-sandbox/m0/
// mini-vendor-computer), each run given the fields an M1b run records (its engine, the approved engine, the attestation,
// the engine's process, setup.activate) for the lane it stands for.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readRuns} from '../../scripts/native-baseline/summary.mjs';
import {compareLanes, LANE_MODES, renderComparison} from '../../scripts/native-baseline/compare.mjs';

const SCRIPT = fileURLToPath(new URL('../../scripts/native-baseline.mjs', import.meta.url));
const EVIDENCE = fileURLToPath(new URL('../../docs/evidence/2026-10-17-own-sandbox/m0/mini-vendor-computer', import.meta.url));
const REAL = readRuns(EVIDENCE);
const BUILD = 'c'.repeat(64);
const BUNDLE = '/Users/fixture/Library/Application Support/cua/engine/cua Engine.app';

// One real run as an M1b run of the lane {host, engine}; `edit(meta, rows)` adjusts it.
function laneRun(real, {host, engine, build = BUILD, scale = 1, edit = () => {}}) {
  const meta = structuredClone(real.meta), release = meta.runtime.release;
  const answering = host === 'cua' ? meta.ownNode : meta.answeringNode;
  const launch = {launcher: host === 'cua' ? 'cua' : 'cua-compat', tmpdir: 'session'};
  const attested = engine === 'cua' ? {engine: 'cua', version: '0.1.0', build} : {engine: 'vendor', version: '26.924.1001281', build: release};
  Object.assign(meta, {
    host, answeringNode: answering, sandboxLaunch: launch,
    environment: {...meta.environment, CUA_REPL_HOST: host, CUA_NATIVE_ENGINE: engine},
    hostAttestations: meta.hostAttestations.map(() => ({host, serverInfo: host === 'cua' ? {name: 'cua-repl-host', version: '0.3.0'} : {name: 'rmcp', version: '1.5.0'},
      _meta: {'cua/nativeExecution': answering, 'cua/sandboxLaunch': launch, 'cua/nativeEngine': attested, ...(host === 'cua' ? {'cua/replHost': {host: 'cua', version: '0.3.0'}} : {})}})),
    nativeEngine: {requested: engine, approved: {bundlePath: BUNDLE, engineVersion: '0.1.0', build: BUILD}, checkoutBuild: BUILD, attested: [attested], unattested: 0},
    engineStop: {start: {wasRunning: false}, end: {wasRunning: true, pid: 4242}},
    service: {surface: 'computer', engine, answered: engine, helper: engine === 'cua' ? 'approved engine' : 'pinned runtime',
      helpers: [engine === 'cua' ? {path: '~/Library/Application Support/cua/engine/cua Engine.app/Contents/MacOS/cua-engine', kind: 'cua', origin: 'approved engine', ageSeconds: 50, startedDuringRun: true}
        : {...real.meta.service.helpers[0], kind: 'vendor'}]},
    textEdit: {...meta.textEdit, pid: 4242},
  });
  const rows = real.rows.map(r => (scale !== 1 && r.op === 'task.total' ? {...r, wallMs: r.wallMs * scale} : r));
  rows.splice(rows.findIndex(r => r.op === 'setup.newDocument'), 0, {op: 'setup.activate', sample: 1, ok: true, wallMs: 310.5, attempts: 1, frontmost: {pid: 4242, bundleId: 'com.apple.TextEdit'}});
  edit(meta, rows);
  return {meta, rows};
}
const triple = (lane, options = {}) => REAL.map(real => laneRun(real, {...lane, ...options}));
function dir(t, runs) {
  const root = mkdtempSync(join(tmpdir(), 'cua-m1b4-lanes-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  runs.forEach(({meta, rows}, i) => {
    mkdirSync(join(root, `run-${i + 1}`));
    writeFileSync(join(root, `run-${i + 1}`, 'meta.json'), JSON.stringify(meta));
    writeFileSync(join(root, `run-${i + 1}`, 'results.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  });
  return root;
}
const VV = {host: 'vendor', engine: 'vendor'}, VC = {host: 'vendor', engine: 'cua'}, CC = {host: 'cua', engine: 'cua'};
const judge = (t, mode, baseline, candidate) => compareLanes(mode, readRuns(dir(t, baseline)), readRuns(dir(t, candidate)));
const op = (result, name) => result.operations.find(o => o.op === name);

test('the three modes name their lanes and exactly what may differ', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(LANE_MODES).map(([k, m]) => [k, {id: m.id, baseline: m.baseline, candidate: m.candidate, differ: m.differ}])), {
    engines: {id: 'A', baseline: VV, candidate: VC, differ: ['engine', 'service']},
    hosts: {id: 'B', baseline: VC, candidate: CC, differ: ['host', 'sandbox']},
    'end-to-end': {id: 'C', baseline: VV, candidate: CC, differ: ['host', 'sandbox', 'engine', 'service']},
  });
});

test('A on the real triple: every row judged as the default compare judges it, only the engine and the service differ', t => {
  const result = judge(t, 'engines', triple(VV), triple(VC));
  assert.deepEqual(result.problems, []);
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.mode, 'engines');
  assert.deepEqual(result.permitted.map(p => p.field), ['engine', 'service']);
  assert.match(result.permitted[0].baseline, /^vendor \(attested: vendor 26\.924\.1001281, build 26\.928\.40906-darwin-arm64\)$/);
  assert.match(result.permitted[0].candidate, /^cua \(attested: cua 0\.1\.0, build cccccccccccc\)$/);
  for (const name of ['warm.getAXState', 'warm.getScreenshot', 'task.total', 'bind.getApp', 'cold.miss.total']) assert.equal(op(result, name).verdict, 'pass', name);
  for (const name of ['setup.activate', 'setup.newDocument', 'approval.elicitation', 'ssh.roundtrip', 'guard.scratch']) assert.equal(op(result, name).verdict, 'not judged', name);
  assert.equal(op(result, 'warm.getAXState').baseline.samples, 90);
  const text = renderComparison(result);
  assert.match(text, /^# Native baseline comparison A: engine and service/);
  assert.match(text, /--host vendor --engine vendor.*--host vendor --engine cua/);
  assert.match(text, /\| Engine \| vendor \(attested/);
  assert.match(text, /## What differs, by design/);
  assert.match(text, /- engine: vendor \(attested: .*\) -> cua \(attested: cua 0\.1\.0, build cccccccccccc\)/);
  assert.match(text, /Verdict: \*\*PASS\*\*/);
});

test('A judges latency by the default rule: a candidate task.total beyond its limit fails', t => {
  const result = judge(t, 'engines', triple(VV), triple(VC, {scale: 1.25}));
  assert.equal(result.verdict, 'FAIL');
  assert.equal(op(result, 'task.total').verdict, 'fail');
  assert.match(op(result, 'task.total').reasons.join(), /above the limit/);
});

test('A holds every other attested field equal: a host, a build, a commit or an approved engine that differs is no verdict', t => {
  const wrongHost = judge(t, 'engines', triple(VV), triple(CC));
  assert.equal(wrongHost.verdict, 'NO VERDICT');
  assert.ok(wrongHost.problems.some(p => /the candidate attests the cua host, not vendor \(compare --engines <vv-dir> <vc-dir>\)/.test(p)), wrongHost.problems.join('\n'));
  const wrongEngine = judge(t, 'engines', triple(VC), triple(VC));
  assert.ok(wrongEngine.problems.some(p => /the baseline attests the cua engine, not vendor/.test(p)), wrongEngine.problems.join('\n'));
  const approved = judge(t, 'engines', triple(VV), triple(VC, {edit: m => { m.nativeEngine.approved.build = m.nativeEngine.checkoutBuild = m.nativeEngine.attested[0].build = 'd'.repeat(64); }}));
  assert.ok(approved.problems.some(p => /approved engine differs \(baseline cccccccccccc .*, candidate dddddddddddd .*\); comparison A permits only engine and service to differ/.test(p)), approved.problems.join('\n'));
  const commit = judge(t, 'engines', triple(VV), triple(VC, {edit: m => { m.commit = 'f00d'; }}));
  assert.ok(commit.problems.some(p => /commit differs .*; comparison A permits only engine and service to differ/.test(p)), commit.problems.join('\n'));
  const sitting = judge(t, 'engines', triple(VV), triple(VC, {edit: m => { m.measurement.experiment = 'another-sitting'; }}));
  assert.ok(sitting.problems.some(p => /experiment environment differs between the baseline and the candidate/.test(p)), sitting.problems.join('\n'));
  const launch = judge(t, 'engines', triple(VV), triple(VC, {edit: m => { m.sandboxLaunch = {launcher: 'cua', tmpdir: 'session'}; m.hostAttestations.forEach(a => { a._meta['cua/sandboxLaunch'] = m.sandboxLaunch; }); }}));
  assert.ok(launch.problems.some(p => /sandbox differs .*launcher cua-compat.*launcher cua,.*comparison A permits only engine and service/.test(p)), launch.problems.join('\n'));
});

test('B on the real triple: only the host and the sandbox differ; another engine build is no verdict', t => {
  const result = judge(t, 'hosts', triple(VC), triple(CC));
  assert.deepEqual(result.problems, []);
  assert.equal(result.verdict, 'PASS');
  assert.deepEqual(result.permitted.map(p => p.field), ['host', 'sandbox']);
  assert.match(result.permitted.find(p => p.field === 'sandbox').candidate, /launcher cua, TMPDIR session/);
  const build = judge(t, 'hosts', triple(VC), triple(CC, {edit: m => { m.nativeEngine.attested[0].version = '0.2.0'; m.nativeEngine.approved.engineVersion = '0.2.0'; }}));
  assert.equal(build.verdict, 'NO VERDICT');
  assert.ok(build.problems.some(p => /engine differs .*comparison B permits only host and sandbox to differ/.test(p)), build.problems.join('\n'));
});

test('C on the real triple: the product verdict, host and engine both differing, labelled as two variables', t => {
  const result = judge(t, 'end-to-end', triple(VV), triple(CC));
  assert.deepEqual(result.problems, []);
  assert.equal(result.verdict, 'PASS');
  assert.deepEqual(result.permitted.map(p => p.field), ['host', 'sandbox', 'engine', 'service']);
  assert.match(renderComparison(result), /two variables/);
});

test('runs recorded before engine attestation (the committed triple as it is) get no verdict', t => {
  const raw = REAL.map(r => ({meta: r.meta, rows: r.rows}));
  const result = judge(t, 'engines', raw, triple(VC));
  assert.equal(result.verdict, 'NO VERDICT');
  for (const run of ['run-1', 'run-2', 'run-3']) assert.ok(result.problems.some(p => p === `baseline: ${run} has no requested engine (recorded before engine attestation; remeasure it)`), result.problems.join('\n'));
});

test('a run missing setup.activate, or whose engine attestation is unsound, gets no verdict', t => {
  const missing = judge(t, 'engines', triple(VV), triple(VC, {edit: (m, rows) => rows.splice(rows.findIndex(r => r.op === 'setup.activate'), 1)}));
  assert.ok(missing.problems.some(p => /candidate: run-1 covers 0 setup\.activate samples, the plan 1/.test(p)), missing.problems.join('\n'));
  const unsound = judge(t, 'engines', triple(VV), triple(VC, {edit: m => { m.nativeEngine.unattested = 3; }}));
  assert.ok(unsound.problems.some(p => /candidate: run-1: 3 js results carry no cua\/nativeEngine attestation/.test(p)), unsound.problems.join('\n'));
});

test('a comparison of runs smaller than the default plan is a diagnostic, never a pass', t => {
  const small = lane => triple(lane, {edit: m => { m.plan = {...m.plan, samples: 3}; }});
  const result = judge(t, 'engines', small(VV), small(VC));
  assert.equal(result.verdict, 'NO VERDICT', 'the real rows cover 30 samples, so a 3-sample plan is also a coverage problem');
  const fit = lane => triple(lane, {edit: (m, rows) => { m.plan = {...m.plan, tasks: 9}; rows.splice(0, rows.length, ...rows.filter(r => !(r.op.startsWith('task.') && r.sample === 10))); }});
  const diagnostic = judge(t, 'engines', fit(VV), fit(VC));
  assert.equal(diagnostic.verdict, 'DIAGNOSTIC');
  assert.equal(diagnostic.diagnostic.verdict, 'PASS');
});

test('the CLI: compare --engines prints the comparison and the VERDICT line; one mode at a time', t => {
  const vv = dir(t, triple(VV)), vc = dir(t, triple(VC));
  const out = join(mkdtempSync(join(tmpdir(), 'cua-m1b4-out-')), 'A.md');
  t.after(() => rmSync(join(out, '..'), {recursive: true, force: true}));
  const passed = spawnSync(process.execPath, [SCRIPT, 'compare', '--engines', vv, vc, '--out', out], {encoding: 'utf8'});
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stderr, /^VERDICT: PASS$/m);
  assert.match(readFileSync(out, 'utf8'), /comparison A: engine and service/);
  const both = spawnSync(process.execPath, [SCRIPT, 'compare', '--engines', '--hosts', vv, vc], {encoding: 'utf8'});
  assert.notEqual(both.status, 0);
  assert.match(both.stderr, /compare takes one of --same-host, --engines, --hosts, --end-to-end, not --engines and --hosts/);
  const usage = spawnSync(process.execPath, [SCRIPT, 'compare', '--hosts', vv], {encoding: 'utf8'});
  assert.match(usage.stderr, /compare --hosts requires <vc-dir> <cc-dir>/);
  const reversed = spawnSync(process.execPath, [SCRIPT, 'compare', '--engines', vc, vv], {encoding: 'utf8'});
  assert.equal(reversed.status, 1);
  assert.match(reversed.stderr, /^VERDICT: NO VERDICT$/m);
});

test('the committed triple is a valid source of rows: copied and summarised as it is, it stays a complete, attested triple', t => {
  const copy = mkdtempSync(join(tmpdir(), 'cua-m1b4-real-'));
  t.after(() => rmSync(copy, {recursive: true, force: true}));
  cpSync(EVIDENCE, copy, {recursive: true});
  const summary = spawnSync(process.execPath, [SCRIPT, 'summary', copy], {encoding: 'utf8'});
  assert.equal(summary.status, 0, summary.stderr);
  assert.match(readFileSync(join(copy, 'summary.md'), 'utf8'), /\| Engine \| – \|/);
});

// The M1b.4 review: the vendor's first getApp of a TextEdit it launches can hit timeoutReached and bind on a retry
// (macos.mjs). A side's retry is part of its bind's cost: bind.getApp is judged as the first attempt plus the retry, on
// whichever side retried, and the retry row stays reported (not judged), never dropped.
const retried = (firstMs, retryMs) => (m, rows) => {
  const i = rows.findIndex(r => r.op === 'bind.getApp');
  rows[i] = {...rows[i], ok: false, wallMs: firstMs, inCellMs: firstMs - 10, error: 'Computer Use server error -10005: timeoutReached'};
  rows.splice(i + 1, 0, {op: 'bind.getApp.retry', sample: 1, ok: true, wallMs: retryMs, inCellMs: retryMs - 10});
};
test('a bind retried on one side is judged as the first attempt plus the retry, its retry row reported', t => {
  const vendorRetry = judge(t, 'engines', triple(VV, {edit: retried(5200, 700)}), triple(VC));
  assert.deepEqual(vendorRetry.problems, []);
  assert.equal(vendorRetry.verdict, 'PASS');
  const bind = op(vendorRetry, 'bind.getApp');
  assert.equal(bind.verdict, 'pass');
  assert.equal(bind.baseline.ok, 3, 'the retried bind succeeded');
  assert.equal(bind.baseline.wall.median, 5900);
  const retry = op(vendorRetry, 'bind.getApp.retry');
  assert.equal(retry.verdict, 'not judged');
  assert.match(retry.reasons.join(), /counted in bind\.getApp, the first attempt plus the retry/);
  assert.match(renderComparison(vendorRetry), /\| bind\.getApp\.retry \|/);
  // The same retry on the candidate is its cost: well beyond the baseline's bind, it fails the bind.
  const candidateRetry = judge(t, 'engines', triple(VV), triple(VC, {edit: retried(5200, 700)}));
  assert.equal(op(candidateRetry, 'bind.getApp').verdict, 'fail');
  assert.equal(op(candidateRetry, 'bind.getApp.retry').verdict, 'not judged');
  // A retry that failed too is a failed bind.
  const failed = judge(t, 'engines', triple(VV), triple(VC, {edit: (m, rows) => { retried(5200, 700)(m, rows); rows.find(r => r.op === 'bind.getApp.retry').ok = false; }}));
  assert.match(op(failed, 'bind.getApp').reasons.join(), /0\/3 succeeded, the baseline 3\/3/);
});
