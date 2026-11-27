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
import {baseCheck, baseLayersOf, baseRejudge, HARNESS_PATHS, jobsCheck, readJudgeFixes, renderBaseRejudge, reportFactsOf, reportMoves, renderJobs, renderSourceRun, runJobStops, SAVE_SHEET_CELL, saveSheetVerdict, sourceRunCheck} from '../../scripts/hosted-sittings/split.mjs';
import {JOB_LIMIT_MINUTES} from '../../scripts/hosted-sittings/run.mjs';
import {parseCommand} from '../../scripts/native-matrix.mjs';

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
  // The matrix CLI takes the judge's own summary and compare steps as the plan writes them: each over the one combined dir.
  for (const id of ['summary', 'compare']) {
    const argv = full.steps.find(s => s.id === id).argv;
    assert.deepEqual(argv.slice(0, 2), ['node', 'scripts/native-matrix.mjs']);
    const parsed = parseCommand(argv.slice(2));
    assert.deepEqual([parsed.command, parsed.dirs], [id, [full.steps.find(s => s.id === 'combine').argv.at(-1)]], id);
  }
  const sheet = full.steps.find(s => s.id === 'save-sheet');
  assert.deepEqual([sheet.argv.slice(2), sheet.check, sheet.needs], [['save-sheet-verdicts', '--jobs-file', '/w/out/jobs.json', '--runs', '1,2,3'], 'verdict', ['jobs-check']], 'every run asked, both lanes');
  assert.deepEqual(full.split, {judge: true, jobs: ['/j/1', '/j/2', '/j/3'], runs: [1, 2, 3], base: null}, 'the plan carries its split, so the run command knows a run job from the judge');
  assert.deepEqual([summary.argv.slice(3, 4), compare.argv.slice(3, 4)], [['/w/out/combined'], ['/w/out/combined']], 'the judges read the lanes and any speed-extra records combine wrote');
  assert.deepEqual(judge.counts, ['/w/out/combined/vendor', '/w/out/combined/cua', '/j/1/save-sheet', '/j/2/save-sheet', '/j/3/save-sheet']);
  assert.deepEqual(plan({judge: true, jobs: ['/j/1'], runs: [1], base: null}).steps[0].argv.slice(2), ['jobs-check', '--jobs', '/j/1', '--out', '/w/out/jobs.json']);
});

// Ruling 1239: the base of a later filtered run is rebuilt from the raw committed records with the current combine, in
// layers: the full run's records, then each judged rerun's run-job records, then the new run jobs; never an already
// combined result.
test('a layered base: combine takes the full run\'s records, each rerun layer\'s run jobs, then the new jobs; jobs-check and rejudge-base take every layer', () => {
  const layers = ['/b/sitting', '/s/jobs/m5-sitting-c-run-1-1/sitting', '/s/jobs/m5-sitting-c-run-2-1/sitting'];
  const judge = plan({judge: true, jobs: ['/j/1', '/j/2'], runs: [1, 2], base: '/b,/s', baseRunId: '45468052791,46069842660', baseRecords: layers, only: ['electron/frontmost/click.point']});
  const [check, rejudge, combine] = judge.steps;
  assert.deepEqual(check.argv.slice(2), ['jobs-check', '--jobs', '/j/1,/j/2', '--base', '/b,/s', '--base-run-id', '45468052791,46069842660', '--out', '/w/out/jobs.json']);
  assert.deepEqual(rejudge.argv.slice(2), ['rejudge-base', '--base', '/b,/s', '--out', '/w/out/base-rejudge.json']);
  assert.deepEqual(combine.argv.slice(2), ['combine', ...layers, '/j/1', '/j/2', '--out', '/w/out/combined']);
});

test('baseLayersOf: the first directory\'s records under sitting/, each later one\'s run jobs\' records, in name order; a later one with no run jobs refuses', () => {
  const listed = {'/s/jobs': ['m5-sitting-c-run-2-1', 'm5-sitting-c-run-1-1'], '/t/jobs': []};
  const list = dir => listed[dir] ?? null;
  assert.deepEqual(baseLayersOf(['/b'], {list}), [{dir: '/b', records: ['/b/sitting']}]);
  assert.deepEqual(baseLayersOf(['/b', '/s'], {list}), [{dir: '/b', records: ['/b/sitting']}, {dir: '/s', records: ['/s/jobs/m5-sitting-c-run-1-1/sitting', '/s/jobs/m5-sitting-c-run-2-1/sitting']}]);
  for (const later of ['/t', '/u']) assert.throws(() => baseLayersOf(['/b', later], {list}), /holds no run jobs/);
});

// Ruling 1239: one fix-declaration (expected/judge-fixes.json): the commit that changed how the judge reads the same
// records, its ruling, and the exact ids it may move. Its one rule: the differences it explains are those it lists.
test('a judge\'s fix explains exactly the cells it lists, citing its ruling; anything outside the list refuses', () => {
  const CONTROL = 'method textedit/frontmost/click.control';
  const fix = {commit: 'ad285cedf', ruling: '1239', ids: [CONTROL]};
  const moved = baseCells({[CONTROL]: {verdict: 'better'}});
  const r = baseRejudge(baseCells({}), moved, {fixes: [fix]});
  assert.deepEqual(r.refused, []);
  assert.deepEqual(r.differences.map(d => [d.cell, d.was, d.now, d.by.kind, d.by.declaration, d.by.ruling]), [[CONTROL, 'equal', 'better', 'fix', 'ad285cedf', '1239']]);
  assert.match(renderBaseRejudge({...r, at: 'c0b2ce8f1'}).join('\n'), /^- method textedit\/frontmost\/click\.control: equal, now better \(expected: the judge's fix ad285cedf, ruling 1239\)$/m);
  // Outside the list, or the list empty: refused. A fix that cites no ruling or names no commit explains nothing.
  assert.equal(baseRejudge(baseCells({}), baseCells({[CONTROL]: {verdict: 'better'}, [DRAG]: {verdict: 'equal'}}), {fixes: [fix]}).refused.length, 1);
  assert.equal(baseRejudge(baseCells({}), moved, {fixes: [{...fix, ids: []}]}).refused.length, 1);
  assert.equal(baseRejudge(baseCells({}), moved, {fixes: [{...fix, ruling: undefined}]}).refused.length, 1);
  assert.equal(baseRejudge(baseCells({}), moved, {fixes: [{...fix, commit: ''}]}).refused.length, 1);
});

test('the committed fix-declaration names ad285cedf under ruling 1239 with the two openPanel cells design approved (ruling 1248)', () => {
  const [fix, ...rest] = readJudgeFixes();
  assert.deepEqual([fix.commit, fix.ruling, fix.ids, rest],
    ['ad285cedf', '1239', ['method openPanel/background/getAXState.panel@finder', 'method openPanel/background/click.cancel@finder'], []]);
});

// Ruling 1248 C: the report-level moves between the base's rebuild and its own judgment, printed as information and
// never judged: the cells that do not qualify, the owner's lines, the composing-retries section, not interfering.
const judged = ({unqualified = 0, cells = 3, owner = [], retries = {lines: ['r']}, cua = [2, 2], vendor = [2, 2]} = {}) => ({
  cells: Array.from({length: cells}, (_, i) => ({qualifies: i >= unqualified})), owner, composingRetries: retries,
  interference: {cua: {ok: cua[0], rows: cua[1]}, vendor: {ok: vendor[0], rows: vendor[1]}}});
const renderRetries = c => c.lines;
test('ruling 1248 C: the report-level facts of a judgment, and the moves between two, each with its before and after', () => {
  assert.deepEqual(reportFactsOf(judged({unqualified: 1, owner: ['o1'], cua: [3, 4]}), {renderComposingRetries: renderRetries}),
    {unqualified: '1 of 3', owner: ['o1'], composingRetries: ['r'], notInterfering: 'cua 3/4, vendor 2/2'});
  const was = reportFactsOf(judged({unqualified: 2, cells: 4, owner: ['o1', 'o2', 'o3'], retries: {lines: ['old']}, cua: [3, 4]}), {renderComposingRetries: renderRetries});
  const now = reportFactsOf(judged({unqualified: 1, owner: ['o1', 'o4'], retries: {lines: ['new']}, cua: [4, 4]}), {renderComposingRetries: renderRetries});
  assert.deepEqual(reportMoves(was, now), [
    {field: 'cells that do not qualify', was: '2 of 4', now: '1 of 3'},
    {field: 'owner lines', left: ['o2', 'o3'], arrived: ['o4']},
    {field: 'the composing-retries section', was: ['old'], now: ['new']},
    {field: 'not interfering', was: 'cua 3/4, vendor 2/2', now: 'cua 4/4, vendor 2/2'},
  ]);
  assert.deepEqual(reportMoves(was, was), []);
  const lines = renderBaseRejudge({at: 'c0', differences: [], refused: [], reportMoves: reportMoves(was, now)}).join('\n');
  assert.match(lines, /^### Report-level changes \(informational, never judged; ruling 1248\)$/m);
  assert.match(lines, /^- cells that do not qualify: 2 of 4, now 1 of 3$/m);
  assert.match(lines, /^- owner line left: o2$/m);
  assert.match(lines, /^- owner line arrived: o4$/m);
  assert.match(lines, /^- not interfering: cua 3\/4, vendor 2\/2, now cua 4\/4, vendor 2\/2$/m);
  assert.match(lines, /^- the composing-retries section: was$/m);
  assert.doesNotMatch(renderBaseRejudge({at: 'c0', differences: [], refused: [], reportMoves: []}).join('\n'), /Report-level/);
  // Never judged: moves alone refuse nothing.
  assert.deepEqual(baseRejudge(baseCells({}), baseCells({})).refused, []);
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
  // H1: the base is the committed directory, never an artifact; only a judge-only dispatch's run jobs come from another run.
  assert.equal((judge.match(/run-id:/g) ?? []).length, 1);
  assert.match(judge, /- if: inputs\.jobs_run_id != ''\n\s+uses: actions\/download-artifact@[0-9a-f]{40} # v8\.0\.1\n\s+with:\n\s+pattern: m5-sitting-c-run-\*\n\s+path: \$\{\{ runner\.temp \}\}\/m5-jobs\n\s+run-id: \$\{\{ inputs\.jobs_run_id \}\}\n\s+github-token: \$\{\{ github\.token \}\}/);
  assert.match(judge, /- if: inputs\.jobs_run_id == ''\n\s+uses: actions\/download-artifact@[0-9a-f]{40} # v8\.0\.1\n\s+with:\n\s+pattern: m5-sitting-c-run-\*\n\s+path: \$\{\{ runner\.temp \}\}\/m5-jobs\n/);
  // Ruling 1239: base_run_id names the layers in order, the full run first; each is the one committed directory naming it.
  assert.match(judge, /for id in \$\{ids\/\/,\/ \}; do\n\s+readmes=\(\)\n\s+while IFS= read -r f; do readmes\+=\("\$f"\); done < <\(grep -l "actions\/runs\/\$id\)" docs\/evidence\/\*\/README\.md \|\| true\)/);
  assert.match(judge, /\[ "\$\{#readmes\[@\]\}" -eq 1 \] \|\| \{ echo .*exactly one must"; exit 1; \}/, 'two committed bases naming a run refuse');
  assert.match(judge, /echo "M5_BASE=\$\(IFS=,; echo "\$\{bases\[\*\]\}"\)" >> "\$GITHUB_ENV"\n\s+echo "M5_BASE_RUN_ID=\$ids" >> "\$GITHUB_ENV"/);
  assert.match(judge, /flags=\(--split-judge --jobs "\$M5_JOBS" --runs "\$M5_RUNS"\)\n\s+\[ -n "\$\{M5_BASE:-\}" \] && flags\+=\(--base "\$M5_BASE" --base-run-id "\$M5_BASE_RUN_ID"\)\n\s+\[ -n "\$FILTER" \] && flags\+=\(--only "\$FILTER"\)/);
  assert.match(judge, /tee "\$RUNNER_TEMP\/m5-out\/sitting\/attempts\.md"/, 'every attempt listed in sitting.md too');
  assert.match(job('split_refused'), /inputs\.form == 'split' && inputs\.sitting != 'c'[\s\S]*exit 2/);
  assert.match(judge, /name: m5-sitting-c-judge-\$\{\{ github\.run_attempt \}\}/);
});

// Ruling 1234: a judge-only dispatch (jobs_run_id, its attempt and drawing commit pinned) skips the run jobs and judges
// the source run's, checked by source-run before anything is judged.
test('the workflow\'s judge-only dispatch: no run job, the source run\'s artifacts, and source-run before the judging', () => {
  const workflow = WORKFLOW(), jobs = new Map(jobsOf(workflow).map(j => [j.id, j.text]));
  for (const input of ['jobs_run_id', 'jobs_run_attempt', 'jobs_commit']) assert.match(workflow, new RegExp(`\\n      ${input}:\\n.*\\n\\s+type: string\\n\\s+default: ''`), input);
  assert.match(jobs.get('split_run'), /if: \$\{\{ !cancelled\(\) && .*inputs\.jobs_run_id == '' && needs\.engine\.result == 'success' \}\}/);
  const judge = jobs.get('split_judge');
  // A skipped split_run leaves the judge running: its condition is a status function's, never needs.split_run's result.
  assert.match(judge, /needs: \[engine, split_run\]\n\s+if: \$\{\{ !cancelled\(\) && /);
  assert.doesNotMatch(judge, /needs\.split_run/);
  assert.match(judge, /permissions:\n\s+contents: read\n\s+actions: read\n/);
  assert.match(judge, /\[\[ "\$JOBS_RUN_ID" =~ \^\[0-9\]\+\$ && "\$JOBS_RUN_ATTEMPT" =~ \^\[0-9\]\+\$ && "\$JOBS_COMMIT" =~ \^\[0-9a-f\]\{40\}\$ \]\]/);
  const step = judge.slice(judge.indexOf('- name: The source run (a judge-only dispatch)'));
  assert.match(step, /^- name: The source run \(a judge-only dispatch\)\n\s+if: inputs\.jobs_run_id != ''\n\s+shell: bash\n\s+env:\n\s+GH_TOKEN: \$\{\{ github\.token \}\}/);
  for (const call of ['gh api "$api" > "$src/run.json"', 'gh api --paginate --slurp "$api/jobs?filter=all&per_page=100" > "$src/jobs.json"', 'gh api --paginate --slurp "$api/artifacts?per_page=100" > "$src/artifacts.json"']) assert.ok(step.includes(call), call);
  assert.match(step, /node scripts\/hosted-sittings\.mjs source-run --jobs "\$M5_JOBS" --source "\$src" --run-id "\$JOBS_RUN_ID" --attempt "\$JOBS_RUN_ATTEMPT" --commit "\$JOBS_COMMIT" \\\n\s+--repo "\$GITHUB_REPOSITORY" --runs "\$M5_RUNS" --only "\$FILTER" \$\{flags\[@\]\+"\$\{flags\[@\]\}"\} --out "\$RUNNER_TEMP\/m5-out\/sitting\/source-run\.json"/);
  // Before anything is judged: after the run jobs are listed, before the judge's own setup and steps.
  const at = name => judge.indexOf(`- name: ${name}`);
  assert.ok(at('The run jobs (every attempt listed, each run\'s latest judged)') < at('The source run (a judge-only dispatch)') && at('The source run (a judge-only dispatch)') < at('The judge'));
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
  const lookup = (readmes, baseRunId = '45468052791') => {
    const root = fs.mkdtempSync(join(tmpdir(), 'base-lookup-'));
    try {
      readmes.forEach((runId, i) => {
        const dir = join(root, 'docs', 'evidence', `base-${i}`);
        fs.mkdirSync(dir, {recursive: true});
        fs.writeFileSync(join(dir, 'README.md'), `The full run: [run](https://github.com/o/r/actions/runs/${runId})\n`);
        fs.writeFileSync(join(dir, 'digests.sha256'), '');
      });
      const env = join(root, 'env');
      const r = spawnSync('/bin/bash', ['-c', `set -euo pipefail\n${step}`], {cwd: root, encoding: 'utf8', env: {PATH: process.env.PATH, BASE_RUN_ID: baseRunId, GITHUB_ENV: env}});
      return {status: r.status, out: r.stdout + r.stderr, env: fs.existsSync(env) ? fs.readFileSync(env, 'utf8') : ''};
    } finally { fs.rmSync(root, {recursive: true, force: true}); }
  };
  const one = lookup(['45468052791', '1']);
  assert.deepEqual([one.status, one.env], [0, 'M5_BASE=docs/evidence/base-0\nM5_BASE_RUN_ID=45468052791\n'], one.out);
  // Ruling 1239: the layers in the order given, each the one README naming its run; spaces stripped.
  const layered = lookup(['46069842660', '45468052791'], '45468052791, 46069842660');
  assert.deepEqual([layered.status, layered.env], [0, 'M5_BASE=docs/evidence/base-1,docs/evidence/base-0\nM5_BASE_RUN_ID=45468052791,46069842660\n'], layered.out);
  assert.match(lookup(['45468052791'], '45468052791,46069842660').out, /^0 committed bases name run 46069842660 \(none\): exactly one must$/m);
  assert.equal(lookup(['45468052791'], '45468052791;1').status, 2);
  const none = lookup(['1']);
  assert.equal(none.status, 1, none.out);
  assert.match(none.out, /^0 committed bases name run 45468052791 \(none\): exactly one must$/m);
  const two = lookup(['45468052791', '45468052791']);
  assert.equal(two.status, 1, two.out);
  assert.match(two.out, /^2 committed bases name run 45468052791 \(docs\/evidence\/base-0\/README\.md docs\/evidence\/base-1\/README\.md\): exactly one must$/m);
});

// Ruling 1234: a judge-only dispatch judges the run jobs of an earlier run (jobs_run_id) without re-running them, and
// only when that run is this workflow's in this repo, completed at its pinned attempt and drawing commit, every artifact
// judged is that run's at that commit and the latest attempt of its run job, that job concluded success, its records
// name that run, attempt and commit, the dispatch's runs, filter and speed_extra are what the records ran, and nothing
// under native/, src/ or package.json differs between the drawing commit and the judging one.
const SHA = '313fbf534c6dcfe8495318fb8441b67a35d87ccd', JUDGING = 'a'.repeat(40), RUN_ID = '46052931439';
const PICKED_FILTER = ['savePanel/frontmost/typeText.name', 'electron/frontmost/click.point'];
const resolveFilter = ids => new Set(ids.map(id => `method ${id}`));
function source({runs = [1, 2, 3], attempts = {}, over = {}} = {}) {
  const at = n => attempts[n] ?? 1;
  const record = (n, cell, meta = {}) => ({result: {cell, lanes: [{engine: 'vendor'}], rows: [], meta: {run: n, commit: SHA, runner: {run: {id: RUN_ID, attempt: String(at(n))}}, ...meta}}});
  const picked = runs.map(n => ({name: `m5-sitting-c-run-${n}-${at(n)}`, results: [record(n, 'matrix', {planId: 'filtered', filter: PICKED_FILTER.map(id => `method ${id}`)}), record(n, 'intervention-save-sheet'), record(n, 'speed-extra', {planId: 'speed-extra'})]}));
  return {
    run: {id: Number(RUN_ID), repository: {full_name: 'SSFSKIM/cua'}, path: '.github/workflows/m5-sittings.yml', status: 'completed', conclusion: 'failure', run_attempt: 1, head_sha: SHA, event: 'workflow_dispatch'},
    jobs: runs.map(n => ({name: `split_run (${n})`, run_attempt: at(n), conclusion: 'success'})),
    artifacts: runs.map(n => ({name: `m5-sitting-c-run-${n}-${at(n)}`, expired: false, workflow_run: {id: Number(RUN_ID), head_sha: SHA}})),
    picked, pin: {runId: RUN_ID, attempt: '1', commit: SHA, repo: 'SSFSKIM/cua'},
    inputs: {runs: [1, 2, 3], only: [SAVE_SHEET_CELL, ...PICKED_FILTER], speedExtra: true}, resolveFilter, diff: {clean: true}, judging: JUDGING, ...over,
  };
}
test('a judge-only dispatch: the source run, its artifacts, jobs and records checked against the pin and the dispatch\'s inputs', () => {
  const ok = sourceRunCheck(source());
  assert.deepEqual(ok.refused, []);
  assert.deepEqual([ok.runId, ok.attempt, ok.drawing, ok.judging], [RUN_ID, 1, SHA, JUDGING]);
  const text = renderSourceRun(ok).join('\n');
  assert.match(text, /^## The source run \(a judge-only dispatch, ruling 1234\)$/m);
  assert.match(text, new RegExp(`^- source run: ${RUN_ID}, attempt 1 \\(\\.github/workflows/m5-sittings\\.yml, completed\\)$`, 'm'));
  assert.match(text, new RegExp(`^- drawing commit \\(the run jobs'\\): ${SHA}$`, 'm'));
  assert.match(text, new RegExp(`^- judging commit \\(this judge's\\): ${JUDGING}$`, 'm'));
  assert.match(text, /^- run 2: m5-sitting-c-run-2-1, attempt 1$/m);
  const refused = (over, why) => { const r = sourceRunCheck({...source(), ...over}); assert.ok(r.refused.some(x => why.test(x)), `${why}\n${r.refused.join('\n')}`); };
  const base = source();
  refused({run: {...base.run, path: '.github/workflows/other.yml'}}, /is of \.github\/workflows\/other\.yml, not \.github\/workflows\/m5-sittings\.yml/);
  refused({run: {...base.run, repository: {full_name: 'someone/cua'}}}, /is of someone\/cua, not SSFSKIM\/cua/);
  refused({run: {...base.run, status: 'in_progress'}}, /is in_progress, not completed/);
  refused({run: {...base.run, run_attempt: 2}}, /is at attempt 2, not the pinned 1/);
  refused({run: {...base.run, head_sha: 'b'.repeat(40)}}, /ran b{40}, not the pinned drawing commit/);
  // The harness the jobs ran: the engine and server sources and the package's own manifest and lock.
  assert.deepEqual(HARNESS_PATHS, ['native', 'src', 'package.json', 'package-lock.json']);
  refused({diff: {clean: false}}, /the drawing commit and the judging commit differ under native, src, package\.json or package-lock\.json/);
  refused({artifacts: base.artifacts.slice(1)}, /m5-sitting-c-run-1-1 is not among run 46052931439's artifacts/);
  refused({artifacts: base.artifacts.map((a, i) => (i ? a : {...a, workflow_run: {id: 1, head_sha: SHA}}))}, /m5-sitting-c-run-1-1 is run 1's artifact, not run 46052931439's/);
  refused({artifacts: base.artifacts.map((a, i) => (i ? a : {...a, workflow_run: {id: Number(RUN_ID), head_sha: 'c'.repeat(40)}}))}, /m5-sitting-c-run-1-1 was made at c{40}, not the pinned drawing commit/);
  refused({artifacts: [...base.artifacts, {name: 'm5-sitting-c-run-1-2', expired: false, workflow_run: {id: Number(RUN_ID), head_sha: SHA}}]}, /run job 1's latest attempt among run 46052931439's artifacts is 2; the judge picked 1/);
  refused({jobs: base.jobs.map((j, i) => (i ? j : {...j, conclusion: 'failure'}))}, /run job 1 \(attempt 1\) concluded failure, not success/);
  refused({picked: base.picked.map((p, i) => (i ? p : {...p, results: p.results.map(r => ({result: {...r.result, meta: {...r.result.meta, runner: {run: {id: RUN_ID, attempt: '2'}}}}}))}))}, /m5-sitting-c-run-1-1: 3 record\(s\) name another run or attempt than 46052931439 attempt 1/);
  refused({picked: base.picked.map((p, i) => (i ? p : {...p, results: p.results.map(r => ({result: {...r.result, meta: {...r.result.meta, commit: 'd'.repeat(40)}}}))}))}, /m5-sitting-c-run-1-1's records ran d{40}, not the pinned drawing commit/);
  // The dispatch's inputs against what the records ran.
  refused({inputs: {...base.inputs, runs: [1, 2]}}, /the judge was handed runs 1, 2, 3; this dispatch's runs are 1, 2/);
  refused({inputs: {...base.inputs, speedExtra: false}}, /m5-sitting-c-run-1-1 has speed-extra records; this dispatch's speed_extra is false/);
  refused({inputs: {...base.inputs, only: PICKED_FILTER}}, /m5-sitting-c-run-1-1 has save-sheet records; this dispatch's filter does not run the save-sheet cell/);
  refused({inputs: {...base.inputs, only: [SAVE_SHEET_CELL, PICKED_FILTER[0]]}}, /m5-sitting-c-run-1-1 ran the filter of 2 cell\(s\); this dispatch's filter resolves to 1/);
  refused({inputs: {...base.inputs, only: []}}, /m5-sitting-c-run-1-1 is a filtered rerun; this dispatch's filter is empty/);
  refused({resolveFilter: () => { throw new Error('--only names nope'); }}, /this dispatch's filter does not resolve: --only names nope/);
  const twice = sourceRunCheck(source({attempts: {2: 2}, over: {run: {...source().run, run_attempt: 2}, pin: {...source().pin, attempt: '2'}}}));
  assert.deepEqual(twice.refused, [], 'a run job re-run in a later attempt is judged at that attempt');
  assert.match(renderSourceRun({...twice, refused: ['x']}).join('\n'), /^Refused to judge: x\.$/m);
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

// Ruling 1239 against the committed records: the two layers (45468052791's full run, 46052931439's run jobs, judged by
// 46069842660) checked by their digests and READMEs, each layer's jobs against the full run's engines.
const FULL_BASE = 'docs/evidence/2026-11-24-m5-sitting-c-full', SPLIT_BASE = 'docs/evidence/2026-11-27-m5-sitting-c-split';
test('jobs-check over a layered base: each layer by its own digests and README, the rerun layer\'s jobs against the full run\'s engines', () => {
  const cli = (...args) => spawnSync(process.execPath, ['scripts/hosted-sittings.mjs', ...args], {encoding: 'utf8'});
  const root = fs.mkdtempSync(join(tmpdir(), 'split-layers-')), job = join(root, 'job', 'sitting');
  fs.mkdirSync(job, {recursive: true});
  fs.writeFileSync(join(job, 'sitting.json'), JSON.stringify({steps: []}));
  try {
    const out = join(root, 'jobs.json');
    const ok = cli('jobs-check', '--jobs', job, '--base', `${FULL_BASE},${SPLIT_BASE}`, '--base-run-id', '45468052791,46069842660', '--out', out);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    const check = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.deepEqual(check.layers.map(l => [l.runId, l.jobs.map(j => j.runs.join(','))]), [['46069842660', ['1', '2', '3']]]);
    assert.deepEqual(check.refused, []);
    // The ids name the layers in order: swapped, each README names another run.
    assert.equal(cli('jobs-check', '--jobs', job, '--base', `${FULL_BASE},${SPLIT_BASE}`, '--base-run-id', '46069842660,45468052791', '--out', out).status, 2);
    // One id for two layers is a usage error.
    assert.equal(cli('jobs-check', '--jobs', job, '--base', `${FULL_BASE},${SPLIT_BASE}`, '--base-run-id', '45468052791', '--out', out).status, 2);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

// The CLI's judge plan over the committed layers: the rerun layer's run jobs found under it, in name order.
test('plan c --split-judge over a layered base: combine reads the full run\'s records, then the rerun layer\'s run jobs, then the new jobs', async () => {
  const {RUNNER_RECORD_IN_HOME} = await import('../../scripts/hosted-sittings/runner.mjs');
  const home = fs.mkdtempSync(join(tmpdir(), 'split-plan-home-'));
  fs.mkdirSync(join(home, RUNNER_RECORD_IN_HOME, '..'), {recursive: true});
  fs.writeFileSync(join(home, RUNNER_RECORD_IN_HOME), JSON.stringify({install: {home: '/H'}, engine: {bundle: '/E.app'}}));
  const cli = (...args) => spawnSync(process.execPath, ['scripts/hosted-sittings.mjs', 'plan', 'c', '--out', join(home, 'out'), '--split-judge', '--jobs', '/j/1', '--runs', '1', '--only', 'x', ...args], {encoding: 'utf8', env: {...process.env, HOME: home}});
  try {
    const r = cli('--base', `${FULL_BASE},${SPLIT_BASE}`, '--base-run-id', '45468052791,46069842660');
    assert.equal(r.status, 0, r.stderr);
    const steps = JSON.parse(r.stdout).steps, combine = steps.find(st => st.id === 'combine').argv;
    const relative = d => (d.includes('docs/evidence/') ? d.slice(d.indexOf('docs/evidence/')) : d);
    assert.deepEqual(combine.slice(3, -2).map(relative), [`${FULL_BASE}/sitting`, ...[1, 2, 3].map(n => `${SPLIT_BASE}/jobs/m5-sitting-c-run-${n}-1/sitting`), '/j/1']);
    assert.match(flag(steps.find(st => st.id === 'jobs-check').argv, '--base-run-id'), /^45468052791,46069842660$/);
    // One id for two layers, or a rerun layer with no run jobs, is refused before anything runs.
    assert.equal(cli('--base', `${FULL_BASE},${SPLIT_BASE}`, '--base-run-id', '45468052791').status, 2);
    const r2 = cli('--base', `${FULL_BASE},${FULL_BASE}`, '--base-run-id', '45468052791,45468052791');
    assert.equal(r2.status, 2);
    assert.match(r2.stderr, /holds no run jobs/);
  } finally { fs.rmSync(home, {recursive: true, force: true}); }
});

// The two-layer rebuild against the judgment recorded at c0b2ce8f1 (that commit's own combine and judge over the same raw
// records), cell by cell: the four differences each explained, the two openPanel cells by ad285cedf's declaration
// (ruling 1248), so the judging goes on. Needs c0b2ce8f1 in the checkout's history.
const HAS_JUDGING_COMMIT = spawnSync('git', ['cat-file', '-e', 'c0b2ce8f1b01a2fda19f3d384f40557feb96fa7b^{commit}']).status === 0;
test('rejudge-base over the committed layers: the rebuild\'s differences from the judgment recorded at c0b2ce8f1', {skip: HAS_JUDGING_COMMIT ? false : 'c0b2ce8f1 is not in this checkout'}, () => {
  const root = fs.mkdtempSync(join(tmpdir(), 'split-rejudge-')), out = join(root, 'base-rejudge.json');
  try {
    const r = spawnSync(process.execPath, ['scripts/hosted-sittings.mjs', 'rejudge-base', '--base', `${FULL_BASE},${SPLIT_BASE}`, '--out', out], {encoding: 'utf8'});
    const report = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(report.at, 'c0b2ce8f1b01a2fda19f3d384f40557feb96fa7b');
    assert.deepEqual(report.differences.map(d => [d.cell, d.was, d.now, d.expected, d.by?.kind ?? null]).sort((a, b) => a[0].localeCompare(b[0])), [
      ['method openPanel/background/click.cancel@finder', 'no-verdict', 'equal', true, 'fix'],
      ['method openPanel/background/getAXState.panel@finder', 'no-verdict', 'equal', true, 'fix'],
      ['speed textedit/method.panel.typeText.search', 'no-verdict', 'not judged', true, 'not judged'],
      ['speed textedit/method.typeText.replace', 'missed-remeasured', 'accepted-miss', true, 'accepted miss'],
    ]);
    assert.deepEqual(report.refused, []);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    // Ruling 1248 C: the report-level moves, printed with their before and after, never judged.
    const moves = Object.fromEntries(report.reportMoves.map(m => [m.field, m]));
    assert.deepEqual(Object.keys(moves), ['cells that do not qualify', 'owner lines', 'the composing-retries section', 'not interfering']);
    assert.deepEqual([moves['cells that do not qualify'].was, moves['cells that do not qualify'].now], ['4 of 418', '1 of 417']);
    assert.deepEqual([moves['owner lines'].left.map(l => /^speed: ([\w/.]+) /.exec(l)?.[1]), moves['owner lines'].arrived],
      [['electron/method.paste.replace', 'textedit/method.paste.replace', 'textedit/method.typeText.replace'], []]);
    assert.ok(moves['the composing-retries section'].was.some(l => /vendor 0 retries in 0 group\(s\), 2 never composed/.test(l)));
    assert.ok(moves['the composing-retries section'].now.some(l => /vendor 3 retries in 2 group\(s\), 0 never composed/.test(l)));
    assert.deepEqual([moves['not interfering'].was, moves['not interfering'].now], ['cua 379/382, vendor 379/382', 'cua 381/384, vendor 381/384']);
    assert.match(r.stdout, /^### Report-level changes \(informational, never judged; ruling 1248\)$/m);
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

// R1 (ruling 1230): the base's stored rows re-judged by the new judge, against its judgment at its own commit. Ruling
// 1234: a difference is expected only where a declaration of this commit that cites its ruling explains it: a departure
// now declared, a ticketed not-judged rule's row now not judged.
const DRAG = 'method chrome/background/drag.select@textedit', NAME_TIMING = 'speed textedit/method.savePanel.typeText.name';
const baseCells = over => [{section: 'method', id: 'chrome/background/drag.select@textedit', verdict: 'worse'}, {section: 'method', id: 'textedit/frontmost/click.control', verdict: 'equal'},
  {section: 'speed', id: 'textedit/getAXState', verdict: 'beat'}, {section: 'speed', id: 'textedit/method.savePanel.typeText.name', verdict: 'no-verdict'}]
  .map(c => ({...c, ...(over[`${c.section} ${c.id}`] ?? {})})).filter(c => c.verdict !== null);
test('the base re-judged: the declared departure and #592\'s not-judged row differ as their declarations say, each listed with its ticket and ruling', () => {
  const fine = baseRejudge(baseCells({}), baseCells({[DRAG]: {verdict: 'declared'}, [NAME_TIMING]: {verdict: null}}));
  assert.deepEqual(fine.refused, []);
  assert.deepEqual(fine.differences.map(d => [d.cell, d.was, d.now, d.expected, d.by.kind, d.by.ticket, d.by.ruling]),
    [[DRAG, 'worse', 'declared', true, 'departure', '#282', '1228'], [NAME_TIMING, 'no-verdict', 'not judged', true, 'not judged', '#592', '1231']]);
  const text = renderBaseRejudge({...fine, at: 'bfa8cf486'}).join('\n');
  assert.match(text, /^- method chrome\/background\/drag\.select@textedit: worse, now declared \(expected: the declared departure, ticket #282, ruling 1228: Decision Log, 2026-11-05, #282/m);
  assert.match(text, /^- speed textedit\/method\.savePanel\.typeText\.name: no-verdict, now not judged \(expected: the not-judged rule savePanelNameTiming, ticket #592, ruling 1231\)$/m);
  assert.doesNotMatch(text, /^Refused to judge/m);
});

test('the base re-judged: the Open panel search case\'s timing leaves the judgment under #588, citing ruling 1235', () => {
  const SEARCH_TIMING = {section: 'speed', id: 'textedit/method.panel.typeText.search', verdict: 'no-verdict'};
  const r = baseRejudge([...baseCells({}), SEARCH_TIMING], baseCells({}));
  assert.deepEqual(r.refused, []);
  assert.deepEqual(r.differences.map(d => [d.cell, d.was, d.now, d.by.declaration, d.by.ticket, d.by.ruling]),
    [['speed textedit/method.panel.typeText.search', 'no-verdict', 'not judged', 'openPanelSearchTiming', '#588', '1235']]);
});

// Ruling 1240: an accepted miss (departures.json's acceptedMisses) moves its op from a miss the owner had pending to
// accepted; rejudge-base reads that move as explained by the entry's ruling citation, and nothing else of it.
test('the base re-judged: a miss the owner accepted reads accepted, explained by its declaration\'s ticket and ruling', () => {
  const TYPE = {section: 'speed', id: 'textedit/method.typeText.replace', verdict: 'missed-remeasured'};
  const accepted = {section: 'speed', id: 'textedit/method.typeText.replace', ticket: '#593', ruling: '1240'};
  const r = baseRejudge([...baseCells({}), TYPE], [...baseCells({}), {...TYPE, verdict: 'accepted-miss'}], {acceptedMisses: [accepted]});
  assert.deepEqual(r.refused, []);
  assert.deepEqual(r.differences.map(d => [d.cell, d.was, d.now, d.by.kind, d.by.ticket, d.by.ruling]), [['speed textedit/method.typeText.replace', 'missed-remeasured', 'accepted-miss', 'accepted miss', '#593', '1240']]);
  assert.match(renderBaseRejudge({...r, at: 'c0b2ce8f1'}).join('\n'), /^- speed textedit\/method\.typeText\.replace: missed-remeasured, now accepted-miss \(expected: the accepted miss, ticket #593, ruling 1240\)$/m);
  // A plain miss accepted the same way; no ruling, or another move, explains nothing.
  assert.deepEqual(baseRejudge([{...TYPE, verdict: 'missed'}], [{...TYPE, verdict: 'accepted-miss'}], {acceptedMisses: [accepted]}).refused, []);
  assert.equal(baseRejudge([TYPE], [{...TYPE, verdict: 'accepted-miss'}], {acceptedMisses: [{...accepted, ruling: undefined}]}).refused.length, 1);
  assert.equal(baseRejudge([TYPE], [{...TYPE, verdict: 'beat-remeasured'}], {acceptedMisses: [accepted]}).refused.length, 1);
  // The committed declaration is read by default.
  assert.deepEqual(baseRejudge([TYPE], [{...TYPE, verdict: 'accepted-miss'}]).refused, []);
});

test('the base re-judged: what no declaration explains refuses, a row leaving the judgment with no rule and a declared row changing verdict while judged among them', () => {
  const refusedOn = (over, options) => baseRejudge(baseCells({}), baseCells(over), options).refused;
  assert.deepEqual(refusedOn({'method textedit/frontmost/click.control': {verdict: 'worse'}}), ['the new judge reads the base differently from its own judgment at its commit: method textedit/frontmost/click.control equal, now worse']);
  // Moved to not judged with no rule.
  assert.match(refusedOn({'method textedit/frontmost/click.control': {verdict: null}})[0], /method textedit\/frontmost\/click\.control equal, now not judged$/);
  // The departure's row leaving the judgment, or changing verdict otherwise than to declared.
  assert.match(refusedOn({[DRAG]: {verdict: null}})[0], /drag\.select@textedit worse, now not judged$/);
  assert.match(refusedOn({[DRAG]: {verdict: 'equal'}})[0], /drag\.select@textedit worse, now equal$/);
  // The not-judged rule's row changing verdict while it stays judged.
  assert.match(refusedOn({[NAME_TIMING]: {verdict: 'beat'}})[0], /savePanel\.typeText\.name no-verdict, now beat$/);
  const shown = renderBaseRejudge({...baseRejudge(baseCells({}), baseCells({'method textedit/frontmost/click.control': {verdict: 'worse'}})), at: 'bfa8cf486'}).join('\n');
  assert.match(shown, /^Refused to judge: the new judge reads the base differently/m);
});

test('the base re-judged: a declaration with a ticket but no ruling explains nothing, even one the base\'s commit already had', () => {
  const CONTROL = 'method textedit/frontmost/click.control';
  const rule = {section: 'method', condition: 'fresh', matches: id => id === 'textedit/frontmost/click.control', cause: 'a new rule', ticket: '#999'};
  const gone = {[CONTROL]: {verdict: null}};
  assert.match(baseRejudge(baseCells({}), baseCells(gone), {rules: [rule]}).refused[0], /click\.control equal, now not judged$/);
  // The same rule citing its ruling explains it.
  assert.deepEqual(baseRejudge(baseCells({}), baseCells(gone), {rules: [{...rule, ruling: '1299'}]}).refused, []);
  // A rule with no ticket explains nothing, ruling or not.
  assert.equal(baseRejudge(baseCells({}), baseCells(gone), {rules: [{...rule, ticket: undefined, ruling: '1299'}]}).refused.length, 1);
  // Ruling 1234 keeps it that strict: having declared the row at the base's commit is no citation (the option is gone).
  const atBase = baseRejudge(baseCells({}), baseCells(gone), {rules: [rule], declaredAtBase: cell => cell === CONTROL});
  assert.deepEqual([atBase.refused.length, atBase.differences[0].expected, atBase.differences[0].by], [1, false, undefined]);
  assert.doesNotMatch(renderBaseRejudge(atBase).join('\n'), /base's commit\)/);
  // A departure with no ruling, the same.
  const departure = {section: 'method', id: 'chrome/background/drag.select@textedit', decision: 'Decision Log, #282'};
  assert.equal(baseRejudge(baseCells({}), baseCells({[DRAG]: {verdict: 'declared'}}), {departures: [departure]}).refused.length, 1);
  assert.equal(baseRejudge(baseCells({}), baseCells({[DRAG]: {verdict: 'declared'}}), {departures: [departure], declaredAtBase: cell => cell === DRAG}).refused.length, 1);
  assert.deepEqual(baseRejudge(baseCells({}), baseCells({[DRAG]: {verdict: 'declared'}}), {departures: [{...departure, ruling: '1228'}]}).refused, []);
});
