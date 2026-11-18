// premise-refill.mjs (rulings 823, 825; the controller's route B'): a V5 step whose premise cells are short is refilled
// by whole reruns of V5, its own command with a fresh out directory, at most two of them, and V5's verdict combines
// every run. The main run and every refill run are made from V5's own command as the gate prints it, read back through
// the harness's own parser, their samples through the real paths (premise-fixture.mjs `v5Step`, `v5Runner`).
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';

import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { matchProblems, refillCommand, refillStep } from '../../scripts/linux-engine-gate/premise-refill.mjs';
import { CANCEL, HELD_CANCEL, HELD_UNMET, UNMET, removeScratch, v5Runner, v5Step } from './premise-fixture.mjs';

after(removeScratch);

const OP = 'chrome_dnd_shared';
const quiet = () => {};
const recordOf = (dir) => readFileSync(join(dir, 'premise-refill.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const endOf = (dir) => recordOf(dir).find((r) => r.kind === 'end');
const cellOf = (dir, op = OP) => recordOf(dir).find((r) => r.kind === 'cell' && r.op === op);
const runsOf = (dir) => recordOf(dir).filter((r) => r.kind === 'run');
/** The harness arguments a sitting command carries, through the harness's own parser. */
const harnessOf = (argv) => {
  const rest = argv.slice(argv.indexOf('--') + 1);
  const r71 = rest.findIndex((x) => x.endsWith('/run71.sh'));
  return parseArgs([...rest.slice(r71 + 3), '--out', '/x/run']);
};
/** The refill's directory for the main step `dir` and refill `n`: the same step under a fresh out root. */
const refillDir = (dir, n) => join(`${dirname(dir)}.r${n}`, 'V5.pinned-release');

/** A V5 step run whole by the stand-in: call 0 is the main run, as `spec(0)` gives it; later calls are refills. */
async function v5(name, spec = () => ({})) {
  const step = v5Step(name);
  const runner = v5Runner(spec);
  await runner.launch(step.argv);
  return { ...step, runner };
}
const runnerExit = (dir) => JSON.parse(readFileSync(join(dir, 'all-clear.json'), 'utf8')).exit;

/** The main run's first block with an unmet cold sample, the rest as a passing run has them. */
const unmetCold = { cells: { [OP]: { blocks: [[UNMET, CANCEL, CANCEL]] } } };

test('a main run with nothing excluded leaves no refill, and V5 passes on it', async () => {
  const step = await v5('none');
  const { code } = await refillStep({ dir: step.dir, launch: step.runner.launch, log: quiet });
  assert.equal(code, 0, JSON.stringify(recordOf(step.dir)));
  assert.equal(step.runner.calls.length, 1, 'no refill launched');
  assert.deepEqual(endOf(step.dir), { kind: 'end', pass: true, failed: [], refilled: false, refill_runs: 0 });
  assert.match(readFileSync(join(step.dir, 'premise.md'), 'utf8'), /Nothing was excluded, so nothing was refilled/);
});

test('a refill is V5 whole: its own command with only the out directory fresh, and its samples pooled, tagged by run, lifecycle and series', async () => {
  const step = await v5('whole', (n) => (n === 0 ? unmetCold : {}));
  const printed = [];
  const { code } = await refillStep({ dir: step.dir, launch: step.runner.launch, log: (l) => printed.push(l) });
  assert.equal(code, 0, JSON.stringify(recordOf(step.dir).filter((r) => r.kind !== 'run')));
  assert.equal(step.runner.calls.length, 2, 'the main run and one refill');
  const argv = step.runner.calls[1];
  const to = refillDir(step.dir, 1);
  assert.deepEqual(argv, step.argv.map((a) => (a === step.dir ? to : a)), 'only the step directory differs');
  assert.equal(printed[0], `premise-refill: ${argv.join(' ')}`, 'the exact command, printed before it runs');
  // the real parser reads the same plan, blocks, run name and load as the main run's
  const [main, refill] = [harnessOf(step.argv), harnessOf(argv)];
  for (const k of ['scenes', 'ops', 'blocks', 'run', 'ballast', 'audit', 'gate', 'cua']) assert.deepEqual(refill[k], main[k], k);
  assert.ok(refill.ops.length > 40 && refill.audit, 'every cell of V5, audited');
  assert.ok(existsSync(join(to, 'step.json')), "the refill's step record, written as the gate's print writes one");
  const runs = runsOf(step.dir);
  assert.deepEqual(runs.map((r) => [r.role, r.origin, r.run, r.used]), [['main', 'main', 'pinned-V5', true], ['refill', 'r1', 'pinned-V5', true]]);
  const cell = cellOf(step.dir);
  assert.equal(cell.verdict, 'pass', cell.reasons.join('\n'));
  assert.deepEqual(cell.premise_unmet.timed.unmet_samples, ['0/0']);
  // the pooled samples, each tagged with its run, its engine's lifecycle and its series
  const r1 = cell.samples.filter((x) => x.origin === 'r1');
  assert.equal(r1.length, 9);
  assert.ok(cell.samples.every((x) => typeof x.lifecycle === 'string' && ['cold', 'warm'].includes(x.series)));
  assert.equal(new Set(r1.map((x) => x.lifecycle)).size, 3, 'a lifecycle per series');
  assert.deepEqual(cell.samples.find((x) => x.origin === 'main' && x.block === 0 && x.i === 0).class, 'unmet');
  assert.equal(cell.audit.filter((x) => x.origin === 'r1').length, 2);
  assert.deepEqual(cell.refilled, { cold: 3, warm: 6, audit: 2 });
});

test('an audit-only shortage refills by a whole run, which the real parser takes', async () => {
  const step = await v5('auditonly', (n) => (n === 0 ? { cells: { [OP]: { audit: [UNMET, CANCEL] } } } : {}));
  const { code } = await refillStep({ dir: step.dir, launch: step.runner.launch, log: quiet });
  assert.equal(code, 0, JSON.stringify(recordOf(step.dir).filter((r) => r.kind !== 'run')));
  assert.equal(step.runner.calls.length, 2);
  const argv = step.runner.calls[1];
  assert.ok(!argv.includes('--no-audit') && !argv.includes('0'), 'the whole run, never --blocks 0');
  assert.equal(harnessOf(argv).blocks, 3);
  assert.deepEqual(cellOf(step.dir).premise_unmet.audit.unmet_samples, ['audit/0']);
});

test('negative control: a stale or prepopulated out directory is refused, and nothing is launched into it', async () => {
  const step = await v5('stale', (n) => (n === 0 ? unmetCold : {}));
  const to = refillDir(step.dir, 1);
  mkdirSync(join(to, 'run'), { recursive: true });
  writeFileSync(join(to, 'run', 'results.jsonl'), `${JSON.stringify({ run: 'pinned-V5', kind: 'meta' })}\n`);
  const { code } = await refillStep({ dir: step.dir, launch: step.runner.launch, log: quiet });
  assert.equal(code, 1);
  assert.equal(step.runner.calls.length, 1, 'no refill launched');
  assert.ok(endOf(step.dir).failed.some((f) => /\.r1 exists: a refill run's out directory must be fresh/.test(f)), endOf(step.dir).failed.join('\n'));
});

test('negative control: a refill whose loaded run name is not its command\'s is refused and not used', async () => {
  const step = await v5('runname', (n) => (n === 0 ? unmetCold : { run: 'pinned-V9' }));
  const { code } = await refillStep({ dir: step.dir, launch: step.runner.launch, log: quiet });
  assert.equal(code, 1);
  const refill = runsOf(step.dir).find((r) => r.role === 'refill');
  assert.equal(refill.used, false);
  assert.ok(refill.problems.some((p) => /its run is pinned-V9, not its command's pinned-V5/.test(p)), refill.problems.join('; '));
  assert.equal(cellOf(step.dir).samples.filter((x) => x.origin === 'r1').length, 0, 'none of its samples pooled');
});

test("negative control: a launcher exit that its terminal record does not explain fails V5", async () => {
  for (const [what, spec, expected] of [
    ['a refused launch (2) over a passing end record', { exit: 2 }, /exit 2 is not explained by its terminal record/],
    ['exit 0 over a failing end record', { exit: 0, failing: ['device-firefox firefox_click_visible_shared cua'] }, /exit 0, but its terminal record does not pass/],
    ['exit 1 with no end record', { exit: 1, end: false }, /no terminal record/],
  ]) {
    const step = await v5(`exit-${what.slice(0, 8)}`, (n) => (n === 0 ? unmetCold : spec));
    const { code } = await refillStep({ dir: step.dir, launch: step.runner.launch, log: quiet });
    assert.equal(code, 1, what);
    const refill = runsOf(step.dir).find((r) => r.role === 'refill');
    assert.ok([...refill.problems, ...refill.failures].some((p) => expected.test(p)), `${what}: ${[...refill.problems, ...refill.failures].join('; ')}`);
  }
  // the main run's exit 1, explained by its recorded, provisional premise verdict, is no failure
  const step = await v5('exit-main', (n) => (n === 0 ? unmetCold : {}));
  assert.equal(runnerExit(step.dir), 1);
  assert.equal((await refillStep({ dir: step.dir, launch: step.runner.launch, log: quiet })).code, 0);
  assert.deepEqual(runsOf(step.dir)[0].recombined, ['device-chrome-dnd chrome_dnd_shared cua']);
});

test('negative control (ruling 825): empty metas never match, and another head, other engine bytes or another load is refused', async () => {
  const problems = matchProblems({ meta: {} }, { meta: {} });
  for (const field of ['head', 'engine sha256', 'engine arguments', 'ballast', 'occlusion', 'plan']) assert.ok(problems.some((p) => p.includes(field)), `${field}: ${problems.join('; ')}`);
  for (const [what, spec, expected] of [
    ['another head', { head: 'f'.repeat(40) }, /another head/],
    ['another load', { meta: (m) => delete m.ballast }, /no ballast/],
  ]) {
    const step = await v5(`825-${what.slice(0, 8)}`, (n) => (n === 0 ? unmetCold : spec));
    const { code } = await refillStep({ dir: step.dir, launch: step.runner.launch, log: quiet });
    assert.equal(code, 1, what);
    const refill = runsOf(step.dir).find((r) => r.role === 'refill');
    assert.equal(refill.used, false, what);
    assert.ok(refill.problems.some((p) => expected.test(p)), `${what}: ${refill.problems.join('; ')}`);
  }
});

test('negative control: a foreign fixture, a missing notice field or an orphan line in the sidecar fails V5 closed, and nothing is refilled on it', async () => {
  const edits = [
    ['a foreign fixture', (lines) => lines.map((l) => (l.block === 'audit' && l.op === OP && l.i === 0 ? { ...l, fixture: { label: 'cua171-diff-pinned-V5-0badc0de-device_cua' } } : l)), /another fixture|not of run|fixture/],
    ['a missing notice field', (lines) => lines.map((l) => (l.block === 'audit' && l.op === OP && l.i === 0 ? { ...l, reply: { ok: l.reply.ok, error: l.reply.error } } : l)), /does not record the reply's ok, error and notice/],
    ['an orphan line of no cell', (lines) => [...lines, { ...lines[0], op: 'chrome_dnd_in_front_shared' }], /a line of no premise cell \(chrome_dnd_in_front_shared\)/],
    ['an orphan line of no sample', (lines) => [...lines, { ...lines.find((l) => l.op === OP && l.block === 0), block: 7 }], /a line for no sample or audited request of the run/],
  ];
  for (const [what, edit, expected] of edits) {
    const step = await v5(`side-${what.slice(2, 10)}`, (n) => (n === 0 ? unmetCold : {}));
    const file = join(step.dir, 'run', 'premise-evidence.jsonl');
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    writeFileSync(file, `${edit(lines).map((l) => JSON.stringify(l)).join('\n')}\n`);
    const { code } = await refillStep({ dir: step.dir, launch: step.runner.launch, log: quiet });
    assert.equal(code, 1, what);
    assert.equal(step.runner.calls.length, 1, `${what}: no refill on evidence that does not fit`);
    const failed = endOf(step.dir).failed.join('\n');
    assert.match(failed, expected, what);
  }
});

test('negative control: an obscured no-session sample whose guard was not held fails on that guard, refill or not', async () => {
  const OBS = 'chrome_dnd_obscured_in_front_shared';
  const unheld = { ...HELD_UNMET, row: { ...HELD_UNMET.row, dnd: { ...HELD_UNMET.row.dnd, in_front: true, held_at_start: false } } };
  const step = await v5('obscured', (n) => (n === 0 ? { cells: { [OBS]: { blocks: [[unheld, HELD_CANCEL, HELD_CANCEL]] } } } : {}));
  const { code } = await refillStep({ dir: step.dir, launch: step.runner.launch, log: quiet });
  assert.equal(code, 1);
  assert.equal(step.runner.calls.length, 1, 'V5 fails on the guard already: no refill');
  assert.match(endOf(step.dir).failed.join('\n'), /the engine did not watch the drag with the signature already held on 1 of 9 samples \(0\/0\)/);
  assert.match(endOf(step.dir).skipped, /the engine did not watch the drag/);
});

test("negative control: a refill run's other cell's failure is kept, and no rerun erases one", async () => {
  const other = 'device-firefox firefox_click_visible_shared cua';
  const step = await v5('othercell', (n) => (n === 0 ? unmetCold : { failing: [other] }));
  const { code } = await refillStep({ dir: step.dir, launch: step.runner.launch, log: quiet });
  assert.equal(code, 1);
  assert.equal(cellOf(step.dir).verdict, 'pass', 'the premise cell itself is filled');
  assert.ok(endOf(step.dir).failed.some((f) => f === `r1: ${other}`), endOf(step.dir).failed.join('\n'));
});

test('V5 already failing for another reason is not refilled: the skip names every failure besides the shortage', async () => {
  const others = ['device-firefox firefox_click_visible_shared cua', 'identity identity_apart cua'];
  const step = await v5('doomed', (n) => (n === 0 ? { ...unmetCold, failing: others } : {}));
  const { code } = await refillStep({ dir: step.dir, launch: step.runner.launch, log: quiet });
  assert.equal(code, 1);
  assert.equal(step.runner.calls.length, 1);
  const end = endOf(step.dir);
  for (const o of others) assert.ok(end.skipped.includes(o), end.skipped);
});

test('the bound: two whole refill runs at most; a cell still short after them is incomplete and fails', async () => {
  // every run's cold drags all excluded: no run brings a cold sample
  const allCold = { cells: { [OP]: { block: [UNMET, CANCEL, CANCEL] } } };
  const step = await v5('bound', () => allCold);
  const { code } = await refillStep({ dir: step.dir, launch: step.runner.launch, log: quiet });
  assert.equal(code, 1);
  assert.equal(step.runner.calls.length, 3, 'the main run and two refills');
  const cell = cellOf(step.dir);
  assert.ok(cell.reasons.some((r) => /^incomplete: Chrome never started a drag and drop on 9 of 27 samples .* so 0 cold were judged of the 3 planned, with 18 refilled of a bound of 18$/.test(r)), cell.reasons.join('\n'));
  assert.deepEqual(endOf(step.dir).refill_runs, 2);
});

test('negative control: a main run with no terminal record, or whose plan lacks a premise cell, is never a success', async () => {
  const noEnd = await v5('noend', () => ({ end: false }));
  assert.equal((await refillStep({ dir: noEnd.dir, launch: noEnd.runner.launch, log: quiet })).code, 1);
  assert.match(endOf(noEnd.dir).failed.join('\n'), /main: no terminal record/);
  const noCell = await v5('nocell', () => ({ meta: (m) => (m.ops = m.ops.filter((o) => !o.endsWith(':chrome_dnd_late_shared'))) }));
  assert.equal((await refillStep({ dir: noCell.dir, launch: noCell.runner.launch, log: quiet })).code, 1);
  assert.match(endOf(noCell.dir).failed.join('\n'), /main: its plan has no premise cell device-chrome-dnd:chrome_dnd_late_shared/);
});

test("--print prints the whole-V5 refill command, in the gate's print form, and launches and writes nothing", async () => {
  const step = await v5('print', (n) => (n === 0 ? unmetCold : {}));
  const printed = [];
  const { code } = await refillStep({ dir: step.dir, print: true, launch: () => assert.fail('nothing launched'), log: (l) => printed.push(l) });
  assert.equal(code, 0);
  assert.deepEqual(printed, [`premise-refill: ${step.argv.map((a) => (a === step.dir ? refillDir(step.dir, 1) : a)).join(' ')}`]);
  assert.ok(!existsSync(join(step.dir, 'premise-refill.jsonl')) && !existsSync(dirname(refillDir(step.dir, 1))), 'nothing written');
  // a command whose step directory is not the step's, or which carries it in another form, is refused
  assert.throws(() => refillCommand('x --dir /a -- run71.sh /a /c', { dir: '/b', to: '/b2' }), /does not name the step directory/);
  assert.throws(() => refillCommand('x --dir /b -- run71.sh /b /c --out /b/run', { dir: '/b', to: '/b2' }), /names the step directory inside another argument/);
});
