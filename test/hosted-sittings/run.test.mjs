// A sitting's one job (scripts/hosted-sittings/run.mjs): the plan's steps in order, each step's status from its kind
// and exit, a step whose needs did not pass skipped, a cleanup run whatever came between, and the sitting's exit: 1 on
// any failure, 3 when a full sitting holds a step not built yet, else 0. Every step's command is a spy.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderSitting, runSitting} from '../../scripts/hosted-sittings/run.mjs';

const plan = (steps, form = 'full') => ({sitting: 'x', title: 'a test sitting', proves: 'nothing', form, setup: true, counts: [], pilotReads: false, steps});
const step = (id, kind = 'run', extra = {}) => ({id, label: id, kind, argv: ['node', `${id}.mjs`], ...extra});
async function run(p, exits = {}) {
  const ran = [], kept = [];
  const report = await runSitting(p, {out: '/w/out', exec: async s => { ran.push(s.id); return {exit: exits[s.id] ?? 0}; },
    keep: (from, to) => kept.push([from, to]), now: () => 0, log: () => {}});
  return {report, ran, kept};
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
  const judged = await runSitting(plan([step('fixture', 'expect', {expect: 1, report: '/w/out/fixture.json'}), step('approved', 'expect', {expect: 1, report: 'r.json'})]),
    {out: '/w/out', exec: async () => ({exit: 1}), exists: path => path === '/w/out/fixture.json', now: () => 0, log: () => {}});
  assert.deepEqual(statuses(judged), {fixture: 'PASS', approved: 'FAIL'});
  assert.match(judged.steps[1].reason, /no report at r\.json/);
  const missing = await run(plan([step('fixture', 'expect', {expect: 1, missing: 'no Node 22 in the tool cache'})]));
  assert.deepEqual(missing.ran, []);
  assert.deepEqual([missing.report.steps[0].status, missing.report.steps[0].reason], ['FAIL', 'no Node 22 in the tool cache']);
});

test('a step not built yet: pending, never run; a full sitting holding one is incomplete (exit 3), a pilot is not', async () => {
  const steps = [step('a'), step('t3b', 'pending', {argv: undefined, pending: 'T3b: not built'})];
  const full = await run(plan(steps));
  assert.deepEqual(full.ran, ['a']);
  assert.deepEqual(statuses(full.report), {a: 'PASS', t3b: 'PENDING'});
  assert.deepEqual([full.report.verdict, full.report.exit], ['INCOMPLETE', 3]);
  const pilot = await run(plan(steps, 'pilot'));
  assert.deepEqual([pilot.report.verdict, pilot.report.exit], ['PASS', 0]);
});

test('in the pilot a verdict is recorded, never a failure: one run a lane has no verdict to give', async () => {
  const steps = [step('m1'), step('summary', 'verdict'), step('reading', 'pilot')];
  const pilot = await run(plan(steps, 'pilot'), {summary: 1, reading: 1});
  assert.deepEqual(statuses(pilot.report), {m1: 'PASS', summary: 'INFO', reading: 'INFO'});
  assert.equal(pilot.report.exit, 0);
  const full = await run(plan(steps.slice(0, 2)), {summary: 1});
  assert.deepEqual([statuses(full.report).summary, full.report.exit], ['FAIL', 1]);
});

test('the report renders as the job summary: one line a step, its status, exit and time, then the verdict', async () => {
  const {report} = await run(plan([step('a'), step('b', 'run', {needs: ['a']})]), {a: 1});
  const text = renderSitting(report);
  assert.match(text, /^## Sitting X \(full\): a test sitting$/m);
  assert.match(text, /^\| a \| run \| FAIL \| 1 \| 0 s \| \|$/m);
  assert.match(text, /^\| b \| run \| SKIP \| - \| - \| needs a, which did not pass \|$/m);
  assert.match(text, /^\*\*FAIL\*\* \(exit 1\)/m);
});
