// Ruling 1227, refined by 1228 (E): sitting C split into one job per run number and a final judging job. Each run job:
// the setup (the workflow's), the witness tap, its own vendor/cua pair in the lane order v/c/v by job, and its run's
// save-sheet steps, optionally filtered to the cells that need a rerun. The judge job checks the run jobs are one harness
// and one pair of engines (else it refuses), records each job's runner, combines their records (with a full run's
// beneath filtered reruns) and judges them, then runs key-route.
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {sittingPlan} from '../../scripts/hosted-sittings/plan.mjs';
import {jobsCheck, renderJobs, SAVE_SHEET_CELL} from '../../scripts/hosted-sittings/split.mjs';
import {JOB_LIMIT_MINUTES} from '../../scripts/hosted-sittings/run.mjs';

const CTX = {commit: 'c'.repeat(40), out: '/w/out', approvedRuntime: '/Users/runner/Library/Application Support/cua',
  approvedEngine: '/Users/runner/Library/Application Support/cua/engine/cua Engine.app', runId: '9-1', olderNode: null, scratch: '/t', flipped: false, pilot: false};
const plan = split => sittingPlan('c', {...CTX, split});
const flag = (argv, name) => argv[argv.indexOf(name) + 1];

test('a run job holds the witness tap, its own pair in the job\'s lane order, and its run\'s save-sheet steps; nothing judged', () => {
  const lanes = n => plan({run: n}).steps.map(s => s.id);
  assert.deepEqual(lanes(1), ['witness-tap', 'matrix-vendor-1', 'matrix-cua-1', 'save-sheet-vendor-1', 'save-sheet-cua-1']);
  assert.deepEqual(lanes(2), ['witness-tap', 'matrix-cua-2', 'matrix-vendor-2', 'save-sheet-cua-2', 'save-sheet-vendor-2']);
  assert.deepEqual(lanes(3), ['witness-tap', 'matrix-vendor-3', 'matrix-cua-3', 'save-sheet-vendor-3', 'save-sheet-cua-3']);
  const two = plan({run: 2});
  const cua = two.steps.find(s => s.id === 'matrix-cua-2'), vendor = two.steps.find(s => s.id === 'matrix-vendor-2');
  assert.deepEqual([flag(cua.argv, '--run-number'), flag(cua.argv, '--first-lane'), cua.needs], ['2', 'cua', undefined]);
  assert.deepEqual([vendor.needs, vendor.pair], [['matrix-cua-2'], '/w/out/cua/run-2/result.json'], 'the pair inside one job, chained on its put-back');
  assert.deepEqual(two.counts, [], 'a run job judges nothing');
  assert.deepEqual(two.laneOrder.runs, [{run: 2, first: 'cua'}]);
  assert.throws(() => plan({run: 4}), /run job is one of 1, 2, 3/);
});

test('a filtered run job runs only the listed cells: the matrix lanes with --only, the save-sheet steps only when listed', () => {
  const cells = ['electron/frontmost/click.point', 'savePanel/frontmost/typeText.name'];
  const matrixOnly = plan({run: 1, only: cells});
  assert.deepEqual(matrixOnly.steps.map(s => s.id), ['witness-tap', 'matrix-vendor-1', 'matrix-cua-1']);
  assert.equal(flag(matrixOnly.steps[1].argv, '--only'), cells.join(','));
  const sheetOnly = plan({run: 3, only: [SAVE_SHEET_CELL]});
  assert.deepEqual(sheetOnly.steps.map(s => s.id), ['witness-tap', 'save-sheet-vendor-3', 'save-sheet-cua-3']);
  assert.ok(plan({run: 3, only: [...cells, SAVE_SHEET_CELL]}).steps.every(s => !s.argv.includes(SAVE_SHEET_CELL)), 'the save-sheet id never reaches the matrix');
});

test('the judge job checks the jobs, combines their records (a full run beneath), judges them and runs key-route last', () => {
  const judge = plan({judge: true, jobs: ['/j/1', '/j/2', '/j/3'], base: '/b'});
  assert.deepEqual(judge.steps.map(s => s.id), ['jobs-check', 'combine', 'summary', 'compare', 'key-route']);
  const [check, combine, summary, compare] = judge.steps;
  assert.deepEqual(check.argv.slice(2), ['jobs-check', '--jobs', '/j/1,/j/2,/j/3', '--base', '/b', '--out', '/w/out/jobs.json']);
  assert.deepEqual(combine.argv.slice(2), ['combine', '/b/vendor', '/b/cua', '/j/1/vendor', '/j/1/cua', '/j/2/vendor', '/j/2/cua', '/j/3/vendor', '/j/3/cua', '--out', '/w/out/combined']);
  assert.deepEqual([combine.needs, summary.needs, compare.needs], [['jobs-check'], ['combine'], ['combine']]);
  assert.deepEqual(compare.argv.slice(3, 5), ['/w/out/combined/vendor', '/w/out/combined/cua']);
  assert.deepEqual(judge.counts, ['/w/out/combined/vendor', '/w/out/combined/cua', '/j/1/save-sheet', '/j/2/save-sheet', '/j/3/save-sheet']);
  assert.deepEqual(plan({judge: true, jobs: ['/j/1'], base: null}).steps[0].argv.slice(2), ['jobs-check', '--jobs', '/j/1', '--out', '/w/out/jobs.json']);
});

// A job's record as the judge reads it: its results (each with the runner, commit and lanes) and its hardware.
const job = (dir, {run = 1, commit = 'h1', vendor = '26.924.1001281', cua = '0.3.0', id = '50', attempt = '1', planId = 'full', hardware = {model: 'VirtualMac2,1', cpus: 3}} = {}) => ({dir, hardware,
  results: ['vendor', 'cua'].map(engine => ({result: {cell: 'matrix', lanes: [{engine, version: engine === 'vendor' ? vendor : cua}], meta: {run, commit, planId,
    runner: {image: {name: 'macos27', version: '20261104'}, run: {id, attempt}, vm: {id: `vm-${dir}`}, engine: {engineVersion: cua}}}}}))});

test('the judge refuses jobs of another harness commit or engine version, and records each job\'s runner and hardware', () => {
  const ok = jobsCheck([job('/j/1', {run: 1}), job('/j/2', {run: 2, attempt: '2'}), job('/j/3', {run: 3})]);
  assert.deepEqual(ok.refused, []);
  assert.deepEqual(ok.jobs.map(j => [j.dir, j.runs, j.runId, j.attempt, j.image, j.vm, j.hardware.model]),
    [['/j/1', [1], '50', '1', 'macos27 20261104', 'vm-/j/1', 'VirtualMac2,1'], ['/j/2', [2], '50', '2', 'macos27 20261104', 'vm-/j/2', 'VirtualMac2,1'], ['/j/3', [3], '50', '1', 'macos27 20261104', 'vm-/j/3', 'VirtualMac2,1']]);
  assert.match(jobsCheck([job('/j/1'), job('/j/2', {run: 2, commit: 'h2'})]).refused[0], /^the jobs ran more than one harness commit: h1 \(\/j\/1\), h2 \(\/j\/2\)$/);
  assert.match(jobsCheck([job('/j/1'), job('/j/2', {run: 2, cua: '0.3.1'})]).refused[0], /^the jobs ran more than one cua engine version: 0\.3\.0 \(\/j\/1\), 0\.3\.1 \(\/j\/2\)$/);
  assert.match(jobsCheck([job('/j/1'), job('/j/2', {run: 2, vendor: '27.0'})]).refused[0], /more than one vendor version/);
  assert.match(jobsCheck([job('/j/1'), job('/j/2', {run: 1})]).refused[0], /^run 1 was run by more than one job/);
  // Beneath filtered reruns a full run of another commit is allowed; a full job over it is not.
  assert.deepEqual(jobsCheck([job('/j/1', {planId: 'filtered', commit: 'h3'})], {base: job('/b', {commit: 'h0', id: '45468052791'})}).refused, []);
  assert.match(jobsCheck([job('/j/1')], {base: job('/b', {commit: 'h0'})}).refused[0], /^\/j\/1 is a full run job over a full run beneath it/);
  assert.deepEqual(jobsCheck([job('/j/1', {hardware: null})]).jobs[0].hardware, null);
});

test('the sitting report lists every job with its runner and hardware, and the judge\'s refusal', () => {
  const lines = renderJobs(jobsCheck([job('/j/1'), job('/j/2', {run: 2, commit: 'h2', hardware: null})])).join('\n');
  assert.match(lines, /^\| \/j\/1 \| 1 \| 50 \| 1 \| macos27 20261104 \| vm-\/j\/1 \| model VirtualMac2,1, cpus 3 \|$/m);
  assert.match(lines, /^\| \/j\/2 \| 2 \| 50 \| 1 \| macos27 20261104 \| vm-\/j\/2 \| unread \|$/m);
  assert.match(lines, /^Refused to judge: the jobs ran more than one harness commit/m);
  assert.deepEqual(renderJobs(null), []);
});

test('the workflow\'s split form: a run job per run number, each attempt its own artifact, and a judge after them all', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/m5-sittings.yml', import.meta.url), 'utf8');
  const job = id => { const at = workflow.indexOf(`\n  ${id}:\n`); assert.ok(at > 0, id); const rest = workflow.slice(at + 1); const end = rest.slice(1).search(/\n  [a-z_]+:\n/); return end < 0 ? rest : rest.slice(0, end + 1); };
  assert.match(job('sitting'), /inputs\.form != 'split'/, 'the one-job sitting stands down for the split form');
  const run = job('split_run'), judge = job('split_judge');
  assert.match(run, /inputs\.form == 'split' && inputs\.sitting == 'c'/);
  assert.match(run, /run: \$\{\{ fromJSON\(format\('\[\{0\}\]', inputs\.split_runs\)\) \}\}/);
  assert.match(run, /name: m5-sitting-c-run-\$\{\{ matrix\.run \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(run, /hardware\.json/);
  assert.match(run, /run c --out "\$RUNNER_TEMP\/m5-out\/sitting" "\$\{flags\[@\]\}"/);
  assert.match(run, /flags=\(--split-run "\$RUN"\)\n\s+\[ -n "\$FILTER" \] && flags\+=\(--only "\$FILTER"\)/);
  for (const j of [run, judge]) assert.equal(Number(/timeout-minutes: (\d+)/.exec(j)?.[1]), JOB_LIMIT_MINUTES);
  assert.match(judge, /needs: \[engine, split_run\]/);
  assert.match(judge, /needs\.split_run\.result == 'success'/, 'a run job that stopped is re-run before anything is judged');
  assert.match(judge, /pattern: m5-sitting-c-run-\*/);
  assert.match(judge, /run-id: \$\{\{ inputs\.base_run_id \}\}/);
  assert.match(judge, /actions: read/);
  assert.match(judge, /flags=\(--split-judge --jobs "\$M5_JOBS"\)/);
  assert.match(judge, /name: m5-sitting-c-judge-\$\{\{ github\.run_attempt \}\}/);
});

test('the CLI: a split option outside a split sitting C refuses, and jobs-check reads each job\'s hardware beside it', () => {
  const cli = (...args) => spawnSync(process.execPath, ['scripts/hosted-sittings.mjs', ...args], {encoding: 'utf8'});
  const refused = (args, why) => { const r = cli('plan', ...args); assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`); assert.match(r.stderr, why); };
  refused(['c', '--out', '/w/out', '--split-judge'], /--split-judge --jobs/);
  refused(['b', '--out', '/w/out', '--split-run', '1'], /only sitting C is split/);
  refused(['c', '--out', '/w/out', '--only', 'x'], /belong to a split sitting C/);
  refused(['c', '--out', '/w/out', '--split-run', 'two'], /--split-run <run number>/);
  const root = fs.mkdtempSync(join(tmpdir(), 'split-cli-')), sitting = join(root, 'job-1', 'sitting');
  fs.mkdirSync(join(sitting, 'cua'), {recursive: true});
  fs.writeFileSync(join(root, 'job-1', 'hardware.json'), JSON.stringify({model: 'VirtualMac2,1'}));
  const out = join(root, 'jobs.json'), check = cli('jobs-check', '--jobs', sitting, '--out', out);
  assert.equal(check.status, 0, check.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')).jobs.map(j => [j.dir, j.hardware]), [[sitting, {model: 'VirtualMac2,1'}]]);
  fs.rmSync(root, {recursive: true, force: true});
});
