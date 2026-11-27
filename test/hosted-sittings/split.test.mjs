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
import {sittingPlan, SPEED_EXTRA_SAMPLES} from '../../scripts/hosted-sittings/plan.mjs';
import {createHash} from 'node:crypto';
import {baseCheck, baseRejudge, jobsCheck, renderBaseRejudge, renderJobs, runJobStops, SAVE_SHEET_CELL, saveSheetVerdict} from '../../scripts/hosted-sittings/split.mjs';
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

test('F: a run job re-times the three missed speed ops only behind --speed-extra, off by default, both lanes in its lane order', () => {
  const off = plan({run: 2}), on = plan({run: 2, speedExtra: true});
  assert.ok(off.steps.every(s => !s.id.startsWith('speed-extra')), 'flag off: nothing added');
  assert.deepEqual(on.steps.map(s => s.id), ['witness-tap', 'matrix-cua-2', 'matrix-vendor-2', 'speed-extra-cua-2', 'speed-extra-vendor-2', 'save-sheet-cua-2', 'save-sheet-vendor-2']);
  const step = on.steps.find(s => s.id === 'speed-extra-vendor-2');
  assert.deepEqual([step.argv.slice(2, 4), flag(step.argv, '--out'), flag(step.argv, '--samples'), flag(step.argv, '--run-number'), step.check, step.record, step.needs],
    [['cell', 'speed-extra'], '/w/out/speed-extra/vendor', String(SPEED_EXTRA_SAMPLES), '2', 'record', '/w/out/speed-extra/vendor/run-2/result.json', undefined]);
  assert.ok(SPEED_EXTRA_SAMPLES >= 10);
  assert.deepEqual(plan({run: 1, only: ['electron/frontmost/click.point'], speedExtra: true}).steps.map(s => s.id), ['witness-tap', 'matrix-vendor-1', 'matrix-cua-1', 'speed-extra-vendor-1', 'speed-extra-cua-1'], 'a filtered run job takes it too');
});

test('the judge job checks the jobs, combines their records (a full run beneath), judges them and runs key-route last', () => {
  const judge = plan({judge: true, jobs: ['/j/1', '/j/2', '/j/3'], runs: [1, 2, 3], base: '/b', baseRunId: '45468052791', only: ['electron/frontmost/click.point']});
  assert.deepEqual(judge.steps.map(s => s.id), ['jobs-check', 'rejudge-base', 'combine', 'summary', 'compare', 'key-route'], 'a filter without the save-sheet cell asks no save-sheet verdict');
  const [check, rejudge, combine, summary, compare] = judge.steps;
  assert.deepEqual(check.argv.slice(2), ['jobs-check', '--jobs', '/j/1,/j/2,/j/3', '--base', '/b', '--base-run-id', '45468052791', '--out', '/w/out/jobs.json']);
  assert.deepEqual([rejudge.argv.slice(2), rejudge.needs, rejudge.check], [['rejudge-base', '--base', '/b', '--out', '/w/out/base-rejudge.json'], ['jobs-check'], 'exit']);
  assert.deepEqual(combine.argv.slice(2), ['combine', '/b/sitting', '/j/1', '/j/2', '/j/3', '--out', '/w/out/combined']);
  assert.deepEqual([combine.check, combine.needs, summary.needs, compare.needs], ['verdict', ['jobs-check', 'rejudge-base'], ['jobs-check', 'rejudge-base'], ['jobs-check', 'rejudge-base']],
    'a combine problem is the judges\' missing proof, never a skip; a base read differently stops them');
  const full = plan({judge: true, jobs: ['/j/1', '/j/2', '/j/3'], runs: [1, 2, 3], base: null});
  assert.deepEqual(full.steps.map(s => s.id), ['jobs-check', 'combine', 'summary', 'compare', 'save-sheet', 'key-route']);
  const sheet = full.steps.find(s => s.id === 'save-sheet');
  assert.deepEqual([sheet.argv.slice(2), sheet.check, sheet.needs], [['save-sheet-verdicts', '--jobs-file', '/w/out/jobs.json', '--runs', '1,2,3'], 'verdict', ['jobs-check']], 'every run asked, both lanes');
  assert.deepEqual(full.split, {judge: true, jobs: ['/j/1', '/j/2', '/j/3'], runs: [1, 2, 3], base: null}, 'the plan carries its split, so the run command knows a run job from the judge');
  assert.deepEqual([summary.argv.slice(3, 4), compare.argv.slice(3, 4)], [['/w/out/combined'], ['/w/out/combined']], 'the judges read the lanes and any speed-extra records combine wrote');
  assert.deepEqual(judge.counts, ['/w/out/combined/vendor', '/w/out/combined/cua', '/j/1/save-sheet', '/j/2/save-sheet', '/j/3/save-sheet']);
  assert.deepEqual(plan({judge: true, jobs: ['/j/1'], runs: [1], base: null}).steps[0].argv.slice(2), ['jobs-check', '--jobs', '/j/1', '--out', '/w/out/jobs.json']);
});

// A job's record as the judge reads it: its results (each with the runner, commit and lanes) and its hardware.
const job = (dir, {run = 1, commit = 'h1', vendor = '26.924.1001281', cua = '0.3.0', build = 'b1', id = '50', attempt = '1', planId = 'full', hardware = {model: 'VirtualMac2,1', cpus: 3},
  cells = ['matrix'], sheetCommit = commit, report = {steps: []}} = {}) => ({dir, hardware, report,
  results: cells.flatMap(cell => ['vendor', 'cua'].map(engine => ({result: {cell, lanes: [{engine, version: engine === 'vendor' ? vendor : cua, ...(engine === 'cua' ? {build} : {})}],
    meta: {run, commit: cell === 'matrix' ? commit : sheetCommit, ...(cell === 'matrix' ? {planId, plan: {scenes: run === 1 ? ['textedit', 'electron'] : ['textedit']}} : {}),
      runner: {image: {name: 'macos27', version: '20261104'}, run: {id, attempt}, vm: {id: `vm-${dir}`}, engine: {engineVersion: cua}}}}})))});
// A recorded plan's scenes, as ../native-matrix/run.mjs scenesOf reads them (here the fixture names them).
const scenesOf = plan => plan.scenes;

test('the judge refuses jobs of another harness commit or engine version, and records each job\'s runner and hardware', () => {
  const ok = jobsCheck([job('/j/1', {run: 1}), job('/j/2', {run: 2, attempt: '2'}), job('/j/3', {run: 3})]);
  assert.deepEqual(ok.refused, []);
  assert.deepEqual(ok.jobs.map(j => [j.dir, j.runs, j.runId, j.attempt, j.image, j.vm, j.hardware.model]),
    [['/j/1', [1], '50', '1', 'macos27 20261104', 'vm-/j/1', 'VirtualMac2,1'], ['/j/2', [2], '50', '2', 'macos27 20261104', 'vm-/j/2', 'VirtualMac2,1'], ['/j/3', [3], '50', '1', 'macos27 20261104', 'vm-/j/3', 'VirtualMac2,1']]);
  assert.match(jobsCheck([job('/j/1'), job('/j/2', {run: 2, commit: 'h2'})]).refused[0], /^the jobs ran more than one harness commit: h1 \(\/j\/1\), h2 \(\/j\/2\)$/);
  assert.match(jobsCheck([job('/j/1'), job('/j/2', {run: 2, cua: '0.3.1'})]).refused[0], /^the jobs ran more than one cua engine version: 0\.3\.0 build b1 \(\/j\/1\), 0\.3\.1 build b1 \(\/j\/2\)$/);
  assert.match(jobsCheck([job('/j/1'), job('/j/2', {run: 2, build: 'b2'})]).refused[0], /more than one cua engine version: 0\.3\.0 build b1 .*0\.3\.0 build b2/, 'the build counts, not only the version');
  // Every record a job wrote names its commit: a save-sheet record of another commit refuses too (split review).
  assert.match(jobsCheck([job('/j/1', {cells: ['matrix', 'intervention-save-sheet'], sheetCommit: 'h9'})]).refused[0], /^the jobs ran more than one harness commit: h1 \(\/j\/1\), h9 \(\/j\/1\)$/);
  assert.match(jobsCheck([job('/j/1'), job('/j/2', {run: 2, vendor: '27.0'})]).refused[0], /more than one vendor version/);
  assert.match(jobsCheck([job('/j/1'), job('/j/2', {run: 1})]).refused[0], /^run 1 was run by more than one job/);
  // Beneath filtered reruns a full run of another commit is allowed, both recorded; a full job over it is not, nor
  // engines other than the base's exactly (ruling 1230).
  const over = jobsCheck([job('/j/1', {planId: 'filtered', commit: 'h3'})], {base: job('/b', {commit: 'h0', id: '45468052791'})});
  assert.deepEqual([over.refused, over.commits], [[], {jobs: ['h3'], base: ['h0']}]);
  assert.match(jobsCheck([job('/j/1', {planId: 'filtered', build: 'b2'})], {base: job('/b', {commit: 'h0'})}).refused[0], /^\/j\/1 ran the cua engine version and build 0\.3\.0 build b2, the base \/b 0\.3\.0 build b1: a rerun combines only over the same engines \(ruling 1230\)$/);
  assert.match(jobsCheck([job('/j/1', {planId: 'filtered', vendor: '27.0'})], {base: job('/b', {commit: 'h0'})}).refused[0], /^\/j\/1 ran the vendor version 27\.0, the base/);
  // A save-sheet-only rerun job (no matrix record) still names its run and runner.
  assert.deepEqual(jobsCheck([job('/j/1', {cells: ['intervention-save-sheet'], run: 3})]).jobs.map(j => [j.runs, j.runId]), [[[3], '50']]);
  assert.match(jobsCheck([job('/j/1')], {base: job('/b', {commit: 'h0'})}).refused[0], /^\/j\/1 is a full run job over a full run beneath it/);
  assert.deepEqual(jobsCheck([job('/j/1', {hardware: null})]).jobs[0].hardware, null);
});

test('the sitting report lists every job with its runner, hardware, scenes and save-sheet verdicts, the commits and the judge\'s refusal', () => {
  const report = {steps: [{id: 'save-sheet-vendor-2', status: 'PASS'}, {id: 'save-sheet-cua-2', status: 'FAIL', reason: 'cua acted'}, {id: 'matrix-cua-2', status: 'PASS'}]};
  const lines = renderJobs(jobsCheck([job('/j/1'), job('/j/2', {run: 2, commit: 'h2', hardware: null, report})], {scenesOf})).join('\n');
  assert.match(lines, /^\| \/j\/1 \| 1 \| 50 \| 1 \| macos27 20261104 \| vm-\/j\/1 \| model VirtualMac2,1, cpus 3 \| textedit, electron \| - \|$/m);
  assert.match(lines, /^\| \/j\/2 \| 2 \| 50 \| 1 \| macos27 20261104 \| vm-\/j\/2 \| unread \| textedit \| save-sheet-vendor-2 PASS, save-sheet-cua-2 FAIL \|$/m);
  assert.match(lines, /^- \/j\/2 save-sheet-cua-2: FAIL \(cua acted\)$/m);
  assert.match(lines, /^Harness commits: the jobs h1, h2\.$/m);
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
  assert.match(run, /flags=\(--split-run "\$RUN"\)\n\s+\[ -n "\$FILTER" \] && flags\+=\(--only "\$FILTER"\)\n\s+\[ "\$SPEED_EXTRA" = true \] && flags\+=\(--speed-extra\)/);
  assert.match(workflow, /speed_extra:\n.*\n\s+type: boolean\n\s+default: false/, 'F\'s flag is off unless a dispatch sets it');
  for (const j of [run, judge]) assert.equal(Number(/timeout-minutes: (\d+)/.exec(j)?.[1]), JOB_LIMIT_MINUTES);
  assert.match(judge, /needs: \[engine, split_run\]/);
  assert.doesNotMatch(judge, /needs\.split_run\.result/, 'I3: a run job fails only on a stop; the judge runs on whatever artifacts there are, one missing failing it closed');
  assert.match(judge, /\[ -n "\$dir" \] \|\| \{ echo "no artifact of run job \$run"; exit 1; \}/);
  // The run numbers once, spaces stripped ("1, 2, 3" is 1,2,3), for the attempts loop and the judge's --runs alike.
  assert.match(judge, /runs=\$\{SPLIT_RUNS\/\/\[\[:space:\]\]\/\}\n.*\n\s+echo "M5_RUNS=\$runs" >> "\$GITHUB_ENV"/);
  assert.match(judge, /for run in \$\{M5_RUNS\/\/,\/ \}; do/);
  assert.doesNotMatch(judge.slice(judge.indexOf('M5_RUNS=')), /\$SPLIT_RUNS|\$\{SPLIT_RUNS/, 'no step after it reads the raw input');
  assert.match(judge, /pattern: m5-sitting-c-run-\*/);
  assert.doesNotMatch(judge, /run-id:|actions: read/, 'H1: the base is the committed directory, not an artifact of another run');
  assert.match(judge, /grep -l "actions\/runs\/\$BASE_RUN_ID\)" docs\/evidence\/\*\/README\.md/);
  assert.match(judge, /\[ "\$\{#readmes\[@\]\}" -eq 1 \] \|\| \{ echo .*exactly one must"; exit 1; \}/, 'two committed bases naming the run refuse');
  assert.match(judge, /flags=\(--split-judge --jobs "\$M5_JOBS" --runs "\$M5_RUNS"\)\n\s+\[ -n "\$\{M5_BASE:-\}" \] && flags\+=\(--base "\$M5_BASE" --base-run-id "\$BASE_RUN_ID"\)\n\s+\[ -n "\$FILTER" \] && flags\+=\(--only "\$FILTER"\)/);
  assert.match(judge, /tee "\$RUNNER_TEMP\/m5-out\/sitting\/attempts\.md"/, 'every attempt listed in sitting.md too');
  assert.match(job('split_refused'), /inputs\.form == 'split' && inputs\.sitting != 'c'[\s\S]*exit 2/);
  assert.match(judge, /name: m5-sitting-c-judge-\$\{\{ github\.run_attempt \}\}/);
});

// A macOS runner's `shell: bash` is /bin/bash 3.2: a bash-4 builtin or expansion dies there, mid-job.
const WORKFLOW = () => fs.readFileSync(new URL('../../.github/workflows/m5-sittings.yml', import.meta.url), 'utf8');
const jobsOf = workflow => {
  const body = workflow.slice(workflow.indexOf('\njobs:\n') + 7);
  return body.split(/\n(?=  [a-z_]+:\n)/).map(text => ({id: /^ {2}([a-z_]+):/.exec(text)?.[1], text})).filter(j => j.id);
};
test('the workflow\'s macOS jobs use nothing bash 3.2 lacks: no mapfile, readarray, declare -A or case-changing expansions', () => {
  const macos = jobsOf(WORKFLOW()).filter(j => !/runs-on: ubuntu-/.test(j.text));
  assert.ok(macos.length >= 4, macos.map(j => j.id).join(', '));
  for (const {id, text} of macos) for (const [what, pattern] of [['mapfile', /\bmapfile\b/], ['readarray', /\breadarray\b/], ['declare -A', /\bdeclare\s+-[a-zA-Z]*A/], ['${var,,} or ${var^^}', /\$\{[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?(,,?|\^\^?)\}/]]) {
    assert.doesNotMatch(text, pattern, `${id}: ${what} is bash 4`);
  }
});

// The judge's base lookup, run as its step runs it (`set -euo pipefail`, /bin/bash: 3.2 on macOS): exactly one committed
// README naming the run sets M5_BASE; none, or two, refuses, naming them.
test('the judge\'s base lookup under the runner\'s bash: one README names the base, none or two refuse', () => {
  const step = /\n {10}if \[ -n "\$BASE_RUN_ID" \]; then\n[\s\S]*?\n {10}fi\n/.exec(WORKFLOW())?.[0];
  assert.ok(step, 'the base lookup');
  const lookup = readmes => {
    const root = fs.mkdtempSync(join(tmpdir(), 'base-lookup-'));
    try {
      readmes.forEach((runId, i) => {
        const dir = join(root, 'docs', 'evidence', `base-${i}`);
        fs.mkdirSync(dir, {recursive: true});
        fs.writeFileSync(join(dir, 'README.md'), `The full run: [run](https://github.com/o/r/actions/runs/${runId})\n`);
        fs.writeFileSync(join(dir, 'digests.sha256'), '');
      });
      const env = join(root, 'env');
      const r = spawnSync('/bin/bash', ['-c', `set -euo pipefail\n${step}`], {cwd: root, encoding: 'utf8', env: {PATH: process.env.PATH, BASE_RUN_ID: '45468052791', GITHUB_ENV: env}});
      return {status: r.status, out: r.stdout + r.stderr, env: fs.existsSync(env) ? fs.readFileSync(env, 'utf8') : ''};
    } finally { fs.rmSync(root, {recursive: true, force: true}); }
  };
  const one = lookup(['45468052791', '1']);
  assert.deepEqual([one.status, one.env], [0, 'M5_BASE=docs/evidence/base-0\n'], one.out);
  const none = lookup(['1']);
  assert.equal(none.status, 1, none.out);
  assert.match(none.out, /^0 committed bases name run 45468052791 \(none\): exactly one must$/m);
  const two = lookup(['45468052791', '45468052791']);
  assert.equal(two.status, 1, two.out);
  assert.match(two.out, /^2 committed bases name run 45468052791 \(docs\/evidence\/base-0\/README\.md docs\/evidence\/base-1\/README\.md\): exactly one must$/m);
});

test('the CLI: a split option outside a split sitting C refuses, and jobs-check reads each job\'s hardware beside it', () => {
  const cli = (...args) => spawnSync(process.execPath, ['scripts/hosted-sittings.mjs', ...args], {encoding: 'utf8'});
  const refused = (args, why) => { const r = cli('plan', ...args); assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`); assert.match(r.stderr, why); };
  refused(['c', '--out', '/w/out', '--split-judge'], /--split-judge --jobs/);
  refused(['b', '--out', '/w/out', '--split-run', '1'], /only sitting C is split/);
  refused(['c', '--out', '/w/out', '--only', 'x'], /belong to a split sitting C/);
  refused(['c', '--out', '/w/out', '--split-run', 'two'], /--split-run <run number>/);
  refused(['c', '--out', '/w/out', '--speed-extra'], /belong to a split sitting C/);
  refused(['c', '--out', '/w/out', '--split-judge', '--jobs', '/j/1', '--speed-extra'], /--split-judge --jobs/);
  const root = fs.mkdtempSync(join(tmpdir(), 'split-cli-')), sitting = join(root, 'job-1', 'sitting');
  fs.mkdirSync(join(sitting, 'cua'), {recursive: true});
  fs.writeFileSync(join(sitting, 'sitting.json'), JSON.stringify({steps: []}));
  fs.writeFileSync(join(root, 'job-1', 'hardware.json'), JSON.stringify({model: 'VirtualMac2,1'}));
  const out = join(root, 'jobs.json'), check = cli('jobs-check', '--jobs', sitting, '--out', out);
  assert.equal(check.status, 0, check.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')).jobs.map(j => [j.dir, j.hardware]), [[sitting, {model: 'VirtualMac2,1'}]]);
  fs.rmSync(root, {recursive: true, force: true});
});

// H1 against the committed base itself: its digests hold; a tampered copy is refused before anything reads it.
test('jobs-check reads the committed base only when its digests hold: the real directory passes, a tampered copy refuses', () => {
  const cli = (...args) => spawnSync(process.execPath, ['scripts/hosted-sittings.mjs', ...args], {encoding: 'utf8'});
  const root = fs.mkdtempSync(join(tmpdir(), 'split-base-')), base = join(root, 'base'), job = join(root, 'job', 'sitting');
  fs.cpSync('docs/evidence/2026-11-24-m5-sitting-c-full', base, {recursive: true});
  fs.mkdirSync(job, {recursive: true});
  fs.writeFileSync(join(job, 'sitting.json'), JSON.stringify({steps: []}));
  try {
    const ok = cli('jobs-check', '--jobs', job, '--base', base, '--base-run-id', '45468052791', '--out', join(root, 'jobs.json'));
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.equal(JSON.parse(fs.readFileSync(join(root, 'jobs.json'), 'utf8')).base.runs.join(','), '1,2,3');
    assert.equal(cli('jobs-check', '--jobs', job, '--base', base, '--base-run-id', '1', '--out', join(root, 'jobs.json')).status, 2, 'another base run id');
    const file = join(base, 'sitting', 'cua', 'run-2', 'result.json');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"ok": true', '"ok": false'));
    const tampered = cli('jobs-check', '--jobs', job, '--base', base, '--base-run-id', '45468052791', '--out', join(root, 'jobs.json'));
    assert.equal(tampered.status, 2);
    assert.match(JSON.parse(fs.readFileSync(join(root, 'jobs.json'), 'utf8')).refused[0], /^the base's sitting\/cua\/run-2\/result\.json does not match digests\.sha256/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

// I3 of the split review: a run job fails only on a harness or infrastructure stop; its verdicts ride to the judge.
test('a run job stops only on a runtime error, a driver failure, a missing record or a skipped step, never on a verdict', () => {
  const step = (id, status, reason = null) => ({id, status, reason});
  assert.deepEqual(runJobStops({steps: [step('matrix-vendor-1', 'PASS'), step('save-sheet-cua-1', 'FAIL', 'cua run-1 sample 1 FAIL (cua acted)'), step('matrix-cua-1', 'NO VERDICT', 'venue: apart'),
    step('save-sheet-vendor-1', 'NO VERDICT', 'set_value no verdict')]}), []);
  assert.deepEqual(runJobStops({steps: [step('matrix-vendor-1', 'FAIL', 'runtime error: no record at /o/vendor/run-1/result.json (exit 1)'), step('matrix-cua-1', 'SKIP', 'needs matrix-vendor-1, which wrote no record'),
    step('save-sheet-cua-1', 'FAIL', 'driver failure: no textedit/intervention.saveSheet sample recorded in /x'), step('witness-tap', 'FAIL', 'cleanup: not confirmed')]}).map(s => s.id),
    ['matrix-vendor-1', 'matrix-cua-1', 'save-sheet-cua-1', 'witness-tap']);
  assert.deepEqual(runJobStops(null).map(s => s.id), ['sitting.json'], 'no report at all is a stop');
});

test('the judge\'s save-sheet verdict is the worst the run jobs recorded, each named; every run and lane asked must be there', () => {
  const jobs = [{dir: '/j/1', saveSheet: [{id: 'save-sheet-vendor-1', status: 'PASS'}, {id: 'save-sheet-cua-1', status: 'NO VERDICT', reason: 'no witness'}]},
    {dir: '/j/2', saveSheet: [{id: 'save-sheet-vendor-2', status: 'PASS'}, {id: 'save-sheet-cua-2', status: 'FAIL', reason: 'cua acted'}]}];
  const v = saveSheetVerdict({jobs}, {runs: [1, 2]});
  assert.equal(v.verdict, 'FAIL');
  assert.deepEqual(v.lines, ['/j/1 save-sheet-vendor-1: PASS', '/j/1 save-sheet-cua-1: NO VERDICT (no witness)', '/j/2 save-sheet-vendor-2: PASS', '/j/2 save-sheet-cua-2: FAIL (cua acted)']);
  const both = {dir: '/j/1', saveSheet: [{id: 'save-sheet-vendor-1', status: 'PASS'}, {id: 'save-sheet-cua-1', status: 'PASS'}]};
  assert.equal(saveSheetVerdict({jobs: [both]}, {runs: [1]}).verdict, 'PASS');
  // One cua step and no vendor step is no proof (the split verification's case).
  const lone = saveSheetVerdict({jobs: [{dir: '/j/1', saveSheet: [{id: 'save-sheet-cua-1', status: 'PASS'}]}]}, {runs: [1]});
  assert.equal(lone.verdict, 'NO VERDICT');
  assert.ok(lone.lines.includes('save-sheet-vendor-1: not recorded by any run job'), lone.lines.join('\n'));
  assert.equal(saveSheetVerdict({jobs: [{dir: '/j/1', saveSheet: []}]}, {runs: [1]}).verdict, 'NO VERDICT');
  // A step that ended in a harness stop is a stop, never the cell's FAIL.
  const stopped = saveSheetVerdict({jobs: [{dir: '/j/1', saveSheet: [{id: 'save-sheet-vendor-1', status: 'PASS'}, {id: 'save-sheet-cua-1', status: 'FAIL', reason: 'runtime error: no record at /o/save-sheet/cua/run-1/result.json (exit 1)'}]}]}, {runs: [1]});
  assert.equal(stopped.verdict, 'NO VERDICT');
  assert.ok(stopped.lines.includes('/j/1 save-sheet-cua-1: stopped, not judged (runtime error: no record at /o/save-sheet/cua/run-1/result.json (exit 1))'), stopped.lines.join('\n'));
});

// The split verification: the judge runs after a run job stopped (gated on !cancelled()), so a stopped job is refused by
// name, and a save-sheet-only rerun whose run job 2 stopped is no proof, never a PASS.
test('a stopped run job is refused by name, and a save-sheet-only rerun whose run job 2 stopped gives NO VERDICT', () => {
  const stops = {steps: [{id: 'save-sheet-cua-2', status: 'FAIL', reason: 'runtime error: ended by SIGTERM'}, {id: 'save-sheet-vendor-2', status: 'SKIP', reason: 'needs save-sheet-cua-2'}]};
  const sheetOnly = (dir, run, report) => job(dir, {run, cells: ['intervention-save-sheet'], planId: 'filtered', report});
  const check = jobsCheck([sheetOnly('/j/1', 1), sheetOnly('/j/2', 2, stops)], {base: job('/b', {commit: 'h0'})});
  assert.ok(check.refused.some(r => /^\/j\/2 stopped \(save-sheet-cua-2 FAIL: runtime error: ended by SIGTERM; save-sheet-vendor-2 SKIP: needs save-sheet-cua-2\): re-run it before judging$/.test(r)), check.refused.join('\n'));
  assert.match(jobsCheck([job('/j/1', {report: null})]).refused[0], /^\/j\/1 stopped \(sitting\.json FAIL: the run job wrote no sitting report\)/);
  const passed = {steps: [{id: 'save-sheet-vendor-1', status: 'PASS'}, {id: 'save-sheet-cua-1', status: 'PASS'}]};
  const jobs = jobsCheck([sheetOnly('/j/1', 1, passed), sheetOnly('/j/2', 2, stops)]).jobs;
  const v = saveSheetVerdict({jobs}, {runs: [1, 2]});
  assert.equal(v.verdict, 'NO VERDICT', v.lines.join('\n'));
});

// H1: the base read from its committed directory, every result.json checked against digests.sha256 first.
test('the base is judged only when every result.json under it matches digests.sha256 and its README names the base run id', () => {
  const files = {'sitting/vendor/run-1/result.json': 'v1', 'sitting/cua/run-1/result.json': 'c1'};
  const sha = text => createHash('sha256').update(text).digest('hex');
  const io = over => ({digests: Object.entries(files).map(([p, t]) => `${sha(t)}  ${p}`).join('\n') + '\n', readme: 'run [45468052791](https://example/actions/runs/45468052791)',
    results: Object.keys(files), sha: path => (path in files ? sha(files[path]) : null), ...over});
  assert.deepEqual(baseCheck(io(), {runId: '45468052791'}), []);
  assert.match(baseCheck(io({sha: path => (path === 'sitting/cua/run-1/result.json' ? sha('tampered') : sha(files[path]))}), {runId: '45468052791'})[0], /^the base's sitting\/cua\/run-1\/result\.json does not match digests\.sha256/);
  assert.match(baseCheck(io({results: [...Object.keys(files), 'sitting/save-sheet/cua/run-1/result.json']}), {runId: '45468052791'})[0], /^the base's sitting\/save-sheet\/cua\/run-1\/result\.json is not in digests\.sha256/);
  assert.match(baseCheck(io({sha: path => (path === 'sitting/vendor/run-1/result.json' ? null : sha(files[path]))}), {runId: '45468052791'})[0], /^the base's sitting\/vendor\/run-1\/result\.json, in digests\.sha256, is missing/);
  assert.match(baseCheck(io({digests: null}), {runId: '45468052791'})[0], /^the base has no digests\.sha256/);
  assert.match(baseCheck(io(), {runId: '1'})[0], /^the base's README does not name run 1/);
});

// R1 (ruling 1230): the base's stored rows re-judged by the new judge, against its judgment at its own commit; only the
// declared drag cell may differ.
test('the base re-judged: only the declared drag cell differs, the judging proceeds; any other difference stops it', () => {
  const cells = over => [{section: 'method', id: 'chrome/background/drag.select@textedit', verdict: 'worse'}, {section: 'method', id: 'textedit/frontmost/click.control', verdict: 'equal'},
    {section: 'speed', id: 'textedit/getAXState', verdict: 'beat'}].map(c => ({...c, ...(over[`${c.section} ${c.id}`] ?? {})}));
  const fine = baseRejudge(cells({}), cells({'method chrome/background/drag.select@textedit': {verdict: 'declared'}}));
  assert.deepEqual([fine.refused, fine.differences], [[], [{cell: 'method chrome/background/drag.select@textedit', was: 'worse', now: 'declared', expected: true}]]);
  const stop = baseRejudge(cells({}), cells({'method chrome/background/drag.select@textedit': {verdict: 'declared'}, 'method textedit/frontmost/click.control': {verdict: 'worse'}}));
  assert.deepEqual(stop.refused, ['the new judge reads the base differently from its own judgment at its commit: method textedit/frontmost/click.control equal, now worse']);
  assert.match(renderBaseRejudge({...stop, at: 'bfa8cf486'}).join('\n'), /^Refused to judge: the new judge reads the base differently/m);
  const gone = baseRejudge(cells({}), cells({}).slice(1));
  assert.match(gone.refused[0], /method chrome\/background\/drag\.select@textedit worse, now not judged/);
});
