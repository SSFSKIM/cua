// A sitting's one job (scripts/hosted-sittings/run.mjs): the plan's steps in order, each read by its own check
// (./checks.test.mjs has the checks), a step whose needs did not pass skipped, a cleanup run whatever came between, and
// the sitting's exit: 1 on any failure, 4 NO VERDICT, 5 when a full sitting holds a step not built yet, 3 OWNER, else 0.
// Every step's command is a spy.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {Writable} from 'node:stream';
import {join} from 'node:path';
import {execStep, JOB_LIMIT_MINUTES, jobStartedOf, renderSitting, runSitting} from '../../scripts/hosted-sittings/run.mjs';

const plan = (steps, form = 'full') => ({sitting: 'x', title: 'a test sitting', proves: 'nothing', form, setup: true, counts: [], pilotReads: false, steps});
const step = (id, kind = 'run', extra = {}) => ({id, label: id, kind, argv: ['node', `${id}.mjs`], ...extra});
async function run(p, exits = {}, {logs = {}, files = {}} = {}) {
  const ran = [], kept = [], removed = [];
  const report = await runSitting(p, {out: '/w/out', exec: async s => { ran.push(s.id); return {exit: exits[s.id] ?? 0}; },
    keep: (from, to) => kept.push([from, to]), readText: path => logs[path.split('/').at(-1).replace(/\.log$/, '')] ?? '',
    readJson: path => files[path] ?? null, exists: path => Object.hasOwn(files, path), remove: path => removed.push([path, ran.length]), now: () => 0, log: () => {}});
  return {report, ran, kept, removed};
}
const statuses = report => Object.fromEntries(report.steps.map(s => [s.id, s.status]));

test('steps run in order; one whose needs failed is skipped; a cleanup runs once what it needs ran', async () => {
  const {report, ran} = await run(plan([step('prepare'), step('vendor', 'run', {needs: ['prepare']}), step('cua', 'run', {needs: ['prepare']}),
    step('diff', 'verdict', {needs: ['vendor', 'cua']}), step('cleanup', 'cleanup', {needs: ['prepare']})]), {vendor: 1});
  assert.deepEqual(ran, ['prepare', 'vendor', 'cua', 'cleanup']);
  assert.deepEqual(statuses(report), {prepare: 'PASS', vendor: 'FAIL', cua: 'PASS', diff: 'SKIP', cleanup: 'PASS'});
  assert.equal(report.exit, 1);
  assert.equal(report.verdict, 'FAIL');
  assert.match(report.steps.find(s => s.id === 'diff').reason, /vendor/);
});

test('a cleanup whose fixture never ran is skipped', async () => {
  const {report, ran} = await run(plan([step('up', 'fixture'), step('down', 'cleanup', {needs: ['up']})]), {up: 1});
  assert.deepEqual(ran, ['up', 'down'], 'a fixture that ran and failed may have left something up');
  const missing = await run(plan([step('up', 'fixture', {missing: 'no TextEdit'}), step('down', 'cleanup', {needs: ['up']})]));
  assert.deepEqual(missing.ran, []);
  assert.deepEqual(statuses(missing.report), {up: 'FAIL', down: 'SKIP'});
});

test('an expect step passes on the exit it names, a missing prerequisite is a failure never run, and kept files are copied', async () => {
  const before = await run(plan([step('fixture', 'expect', {expect: 1}), step('approved', 'expect', {expect: 1, keep: ['default-selection-approved-out/report.json']})]), {fixture: 1, approved: 0});
  assert.deepEqual(statuses(before.report), {fixture: 'PASS', approved: 'FAIL'});
  assert.match(before.report.steps[1].reason, /exit 0, expected 1/);
  assert.deepEqual(before.kept, [['default-selection-approved-out/report.json', '/w/out/approved/report.json']]);
  const judged = await run(plan([step('summary', 'run', {check: 'report', report: '/w/out/summary.md'})]), {summary: 4}, {files: {'/w/out/summary.md': {}}});
  assert.deepEqual(judged.removed, [['/w/out/summary.md', 0]], 'a step\'s report is removed before it runs, so the one read is its own');
  assert.equal(statuses(judged.report).summary, 'PASS');
  const missing = await run(plan([step('fixture', 'expect', {expect: 1, missing: 'no Node 22 in the tool cache'})]));
  assert.deepEqual(missing.ran, []);
  assert.deepEqual([missing.report.steps[0].status, missing.report.steps[0].reason], ['FAIL', 'no Node 22 in the tool cache']);
});

test('a step not built yet: pending, never run; a full sitting holding one is incomplete (exit 5), a pilot is not', async () => {
  const steps = [step('a'), step('t3b', 'pending', {argv: undefined, pending: 'T3b: not built'})];
  const full = await run(plan(steps));
  assert.deepEqual(full.ran, ['a']);
  assert.deepEqual(statuses(full.report), {a: 'PASS', t3b: 'PENDING'});
  assert.deepEqual([full.report.verdict, full.report.exit], ['INCOMPLETE', 5]);
  const pilot = await run(plan(steps, 'pilot'));
  assert.deepEqual([pilot.report.verdict, pilot.report.exit], ['PASS', 0]);
});

test('a judge\'s verdict is its own: NO VERDICT exits 4 and OWNER 3; in the pilot only a judge marked for it may give an expected NO VERDICT', async () => {
  const judge = (id, extra = {}) => step(id, 'verdict', {check: 'verdict', ...extra});
  const verdicts = {'compare-A': 'VERDICT: NO VERDICT\n', compare: 'VERDICT: OWNER\n', diff: 'VERDICT: FAIL\n'};
  const nv = await run(plan([judge('compare-A')]), {'compare-A': 1}, {logs: verdicts});
  assert.deepEqual([statuses(nv.report)['compare-A'], nv.report.verdict, nv.report.exit], ['NO VERDICT', 'NO VERDICT', 4]);
  const owner = await run(plan([judge('compare')]), {compare: 3}, {logs: verdicts});
  assert.deepEqual([owner.report.verdict, owner.report.exit], ['OWNER', 3]);
  const pilot = await run(plan([judge('compare-A', {pilotNoVerdict: true}), step('reading', 'pilot')], 'pilot'), {'compare-A': 1, reading: 1}, {logs: verdicts});
  assert.deepEqual(statuses(pilot.report), {'compare-A': 'NO VERDICT', reading: 'INFO'});
  assert.equal(pilot.report.steps[0].expected, true);
  assert.deepEqual([pilot.report.verdict, pilot.report.exit], ['PASS', 0], 'one run a lane: the comparison cannot pass, and says so');
  const b = await run(plan([step('diff', 'verdict')], 'pilot'), {diff: 1});
  assert.deepEqual([statuses(b.report).diff, b.report.exit], ['FAIL', 1], 'B\'s pilot is its full form: its diff keeps its real verdict');
  const unmarked = await run(plan([judge('compare-A')], 'pilot'), {'compare-A': 1}, {logs: verdicts});
  assert.equal(unmarked.report.exit, 4);
});

test('the report renders as the job summary: one line a step, its status, exit and time, then the verdict', async () => {
  const {report} = await run(plan([step('a'), step('b', 'run', {needs: ['a']})]), {a: 1});
  const text = renderSitting(report);
  assert.match(text, /^## Sitting X \(full\): a test sitting$/m);
  assert.match(text, /^\| a \| run \| FAIL \| 1 \| 0 s \| 0 min \| - \| \|$/m);
  assert.match(text, /^\| b \| run \| SKIP \| - \| - \| 0 min \| - \| needs a, which did not pass \|$/m);
  assert.match(text, /^\*\*FAIL\*\* \(exit 1\)/m);
});

// Design (after pilot C's estimate, 150 of 360 min): each step's wall time and the sitting's and the job's so far are
// recorded as the sitting goes, in the log and to a partial report, so a slowing runner shows before the limit ends it.
test('the wall time so far: each step carries the sitting\'s and the job\'s, logged and handed on as it ends, and the report closes with it against the limit', async () => {
  let t = 10 * 60000;
  const clock = () => t, lines = [], seen = [];
  const report = await runSitting(plan([step('a'), step('b')]), {out: '/w/out', exec: async () => { t += 25 * 60000; return {exit: 0}; },
    keep: () => {}, readText: () => '', readJson: () => null, exists: () => false, remove: () => {}, now: clock, log: line => lines.push(line),
    jobStartedMs: 0, onStep: entry => seen.push([entry.id, entry.wall])});
  assert.deepEqual(seen, [['a', {sittingMs: 25 * 60000, jobMs: 35 * 60000}], ['b', {sittingMs: 50 * 60000, jobMs: 60 * 60000}]]);
  assert.ok(lines.some(l => /x b: PASS; the sitting 50 min so far, the job 60 min of its 360$/.test(l)), lines.join('\n'));
  const text = renderSitting(report);
  assert.match(text, /^\| b \| run \| PASS \| 0 \| 1500 s \| 50 min \| 60 min \| \|$/m);
  assert.match(text, /^Wall time: the sitting 50 min so far, the job 60 min of its 360\.$/m);
  // A progress report that cannot be written is logged and the sitting goes on to its cleanup and verdict.
  const cleanup = step('cleanup', 'cleanup', {needs: ['a']});
  const kept = [];
  const broken = await runSitting(plan([step('a'), cleanup]), {out: '/w/out', exec: async () => ({exit: 0}), keep: () => {}, readText: () => '', readJson: () => null,
    exists: () => false, remove: () => {}, now: () => 0, log: line => kept.push(line), onStep: () => { throw Object.assign(new Error('disk full'), {code: 'ENOSPC'}); }});
  assert.deepEqual(broken.steps.map(s => [s.id, s.status]), [['a', 'PASS'], ['cleanup', 'PASS']]);
  assert.equal(broken.verdict, 'PASS');
  assert.ok(kept.some(l => /a: the progress report was not written \(ENOSPC\)/.test(l)), kept.join('\n'));
  // Without the job's start, the sitting's alone, the limit named.
  const bare = await runSitting(plan([step('a')]), {out: '/w/out', exec: async () => ({exit: 0}), keep: () => {}, readText: () => '', readJson: () => null,
    exists: () => false, remove: () => {}, now: () => 0, log: () => {}});
  assert.match(renderSitting(bare), /^Wall time: the sitting 0 min so far \(the job's start unread; its limit is 360 min\)\.$/m);
});

test('the limit the report names is the sitting job\'s timeout in the workflow, and the job records its start first', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/m5-sittings.yml', import.meta.url), 'utf8');
  const sittingJob = workflow.slice(workflow.indexOf('    strategy:'));
  assert.equal(Number(/timeout-minutes: (\d+)/.exec(sittingJob)?.[1]), JOB_LIMIT_MINUTES);
  const firstStep = sittingJob.slice(sittingJob.indexOf('    steps:\n')).split('\n      - ')[1];
  assert.match(firstStep, /M5_JOB_STARTED=\$\(date \+%s\)/, 'the job records its start in its first step, before checkout');
  assert.equal(jobStartedOf({M5_JOB_STARTED: '1700000000'}), 1700000000000);
  for (const bad of [undefined, '', 'soon', '1.5']) assert.equal(jobStartedOf({M5_JOB_STARTED: bad}), null);
});

test('a pilot that proved nothing is labelled so, not "Proves" and PASS: judges with only the expected NO VERDICT, or steps all pending; the exit stays 0', async () => {
  const judge = step('compare-A', 'verdict', {check: 'verdict', pilotNoVerdict: true});
  const nv = await run(plan([step('a'), judge], 'pilot'), {'compare-A': 1}, {logs: {'compare-A': 'VERDICT: NO VERDICT\n'}});
  assert.deepEqual([nv.report.verdict, nv.report.exit], ['PASS', 0]);
  const text = renderSitting(nv.report);
  assert.doesNotMatch(text, /^Proves:/m);
  assert.match(text, /^Would prove: nothing\. This pilot proves none of it: 1 judge gave the expected NO VERDICT\.$/m);
  assert.match(text, /^\*\*PILOT COMPLETED WITHOUT ACCEPTANCE PROOF\*\* \(exit 0\)/m);
  const f = await run(plan([step('maws', 'pending', {argv: undefined, pending: 'not built'})], 'pilot'));
  assert.deepEqual([f.report.verdict, f.report.exit], ['PASS', 0]);
  assert.match(renderSitting(f.report), /^Would prove: nothing\. This pilot proves none of it: 1 step pending\.$/m);
  assert.match(renderSitting(f.report), /^\*\*PILOT COMPLETED WITHOUT ACCEPTANCE PROOF\*\* \(exit 0\)/m);
  const b = await run(plan([step('diff', 'verdict')], 'pilot'));
  assert.match(renderSitting(b.report), /^Proves: nothing\.$/m, 'B\'s pilot is its full form, and its PASS proves what it says');
  assert.match(renderSitting(b.report), /^\*\*PASS\*\* \(exit 0\)/m);
});

// A real subprocess (I6 of fix wave 2): the step resolves only once its log is flushed, so the verdict it printed last is
// read; a log that cannot be written is the step's runtime error, never a silent loss.
test('a step\'s log is whole when the step resolves, its last line read straight after; a log that cannot be written is an error', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua-sitting-log-'));
  const quiet = {write: () => true};
  try {
    const script = 'const line = "x".repeat(1023) + "\\n"; for (let i = 0; i < 4096; i++) process.stdout.write(line); process.stdout.write("VERDICT: NO VERDICT\\n");';
    const logPath = join(dir, 'logs', 'compare.log');
    const result = await execStep({argv: [process.execPath, '-e', script]}, {logPath, echo: quiet});
    assert.equal(result.exit, 0);
    assert.match(readFileSync(logPath, 'utf8'), /VERDICT: NO VERDICT\n$/);
    // A slow disk: every write lands 30 ms late; the step still resolves only once the last one has.
    const landed = [];
    const slow = () => new Writable({write(chunk, encoding, done) { setTimeout(() => { landed.push(String(chunk)); done(); }, 30); }});
    const late = await execStep({argv: [process.execPath, '-e', 'console.log("one"); console.log("VERDICT: NO VERDICT")']}, {logPath: join(dir, 'logs', 'slow.log'), echo: quiet, openLog: slow});
    assert.equal(late.exit, 0);
    assert.match(landed.join(''), /VERDICT: NO VERDICT\n$/);
    writeFileSync(join(dir, 'blocked'), '');
    const failed = await execStep({argv: [process.execPath, '-e', 'console.log("VERDICT: PASS")']}, {logPath: join(dir, 'blocked', 'x.log'), echo: quiet});
    assert.equal(failed.exit, null);
    assert.match(failed.error, /log/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
