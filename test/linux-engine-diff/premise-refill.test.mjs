// premise-refill.mjs (rulings 823, 825): V5's premise cells refilled by more runs of the unchanged runner. The main run
// and every refill run are made through the real paths (premise-fixture.mjs: the cases' own reads and checks, their
// evidence, the real judge's in-run verdicts); the launcher stands in for the sitting, writing the refill run's step
// directory as the runner and the sitting would.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { refillCommand, refillStep } from '../../scripts/linux-engine-gate/premise-refill.mjs';
import { CANCEL, HEAD, UNMET, caseSamples, engineBin, finishRun, removeScratch, scratch, startRun } from './premise-fixture.mjs';

after(removeScratch);

const OP = 'chrome_dnd_shared';
const three = (spec) => [spec, spec, spec];

/** A V5 step with one premise cell, through the real paths: its blocks and audit as given. */
async function mainStep(name, { blocks, audit, bin }) {
  const dir = join(scratch(name), 'V5.pinned-release');
  const run = 'pinned-V5';
  const out = startRun({ dir, run, bin, ops: [OP] });
  const { rows, answered } = await caseSamples({ out, run, op: OP, bin, blocks, audit });
  const verdicts = finishRun({ dir, run, cases: [{ op: OP, rows, answered }] });
  return { dir, verdict: verdicts[0] };
}

/**
 * The launcher's stand-in: it reads the refill run's command as the runner would (its directory, run name, case, blocks
 * and whether it audits) and writes that run, each block and audited request as `spec(n)` gives them, at the head,
 * engine and load `spec(n)` names (the main run's by default).
 */
function launcher(spec, { bin }) {
  const calls = [];
  const launch = async (argv) => {
    const value = (flag) => argv[argv.indexOf(flag) + 1];
    const n = calls.length + 1;
    calls.push(argv);
    const s = { block: three(CANCEL), audit: CANCEL, head: HEAD, bin, ballast: 'gate', failed: [], ...spec(n) };
    const dir = value('--dir');
    const run = value('--run');
    const out = startRun({ dir, run, bin: s.bin, head: s.head, ballast: s.ballast, ops: [value('--ops')] });
    const blocks = Array.from({ length: Number(value('--blocks')) }, () => s.block);
    const { rows, answered } = await caseSamples({ out, run, op: value('--ops'), bin: s.bin, blocks, audit: argv.includes('--no-audit') ? [] : [s.audit, s.audit], offset: 100 * n });
    finishRun({ dir, run, cases: [{ op: value('--ops'), rows, answered }], failed: s.failed });
    return 0;
  };
  return { launch, calls };
}
const quiet = () => {};
const recordOf = (dir) => readFileSync(join(dir, 'premise-refill.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

test('a main run with nothing excluded leaves no refill, and its verdicts of the premise cells are final', async () => {
  const bin = engineBin(scratch('bin0'));
  const { dir, verdict } = await mainStep('none', { blocks: [three(CANCEL), three(CANCEL), three(CANCEL)], audit: [CANCEL, CANCEL], bin });
  assert.equal(verdict.provisional, undefined);
  const { launch, calls } = launcher(() => ({}), { bin });
  const { code } = await refillStep({ dir, launch, log: quiet });
  assert.equal(code, 0);
  assert.equal(calls.length, 0);
  const record = recordOf(dir);
  assert.deepEqual(record.at(-1), { kind: 'end', pass: true, failed: [], refilled: false });
  assert.match(readFileSync(join(dir, 'premise.md'), 'utf8'), /Nothing was excluded, so nothing was refilled/);
});

test('an excluded sample is refilled to its quota by a refill run of the same head, engine and load, listed apart', async () => {
  const bin = engineBin(scratch('bin1'));
  const { dir, verdict } = await mainStep('refill', { blocks: [[UNMET, CANCEL, CANCEL], three(CANCEL), three(CANCEL)], audit: [UNMET, CANCEL], bin });
  assert.equal(verdict.provisional, true, "the main run's own verdict is provisional");
  const { launch, calls } = launcher(() => ({}), { bin });
  const printed = [];
  const { code } = await refillStep({ dir, launch, log: (l) => printed.push(l) });
  assert.equal(code, 0, JSON.stringify(recordOf(dir).filter((r) => r.kind === 'cell')));
  // one refill run: one block for the cold quota, and the audit for the audit's
  assert.equal(calls.length, 1);
  const argv = calls[0];
  const at = (flag) => argv[argv.indexOf(flag) + 1];
  assert.deepEqual([at('--scene'), at('--ops'), at('--blocks'), at('--run'), at('--dir')], ['device-chrome-dnd', OP, '1', 'pinned-V5-r1', `${dir}.r1`]);
  assert.ok(!argv.includes('--no-audit'));
  assert.equal(argv.filter((a) => a === dir).length, 0, "the main run's directory is in no argument");
  assert.equal(printed[0], `premise-refill: ${argv.join(' ')}`, 'the exact command, printed before it runs');
  const record = recordOf(dir);
  const runs = record.filter((r) => r.kind === 'run');
  assert.deepEqual(runs.map((r) => [r.role, r.run, r.used, r.commit, r.lifecycles.length > 0]), [['main', 'pinned-V5', true, HEAD, true], ['refill', 'pinned-V5-r1', true, HEAD, true]]);
  const [cell] = record.filter((r) => r.kind === 'cell');
  assert.equal(cell.verdict, 'pass');
  assert.deepEqual(cell.refill.cold, ['pinned-V5-r1:0/0']);
  assert.deepEqual(cell.refill.warm, ['pinned-V5-r1:0/1', 'pinned-V5-r1:0/2']);
  assert.deepEqual(cell.refill.audit, ['pinned-V5-r1/audit/0', 'pinned-V5-r1/audit/1']);
  assert.deepEqual(cell.premise_unmet.timed.unmet_samples, ['0/0']);
  assert.match(readFileSync(join(dir, 'premise.md'), 'utf8'), /\| chrome_dnd_shared \| pass \| 1 of 12 \(0\/0\) \| 1 of 4 \| 1 \(pinned-V5-r1:0\/0\) \| 2 \(pinned-V5-r1:0\/1, pinned-V5-r1:0\/2\) \| 2 \|/);
});

test('negative control: a refill run that itself excludes, until the bound, leaves the cell incomplete', async () => {
  const bin = engineBin(scratch('bin2'));
  const { dir } = await mainStep('bound', { blocks: [[UNMET, CANCEL, CANCEL], three(CANCEL), three(CANCEL)], audit: [CANCEL, CANCEL], bin });
  const { launch, calls } = launcher(() => ({ block: [UNMET, CANCEL, CANCEL] }), { bin });
  const { code } = await refillStep({ dir, launch, log: quiet });
  assert.equal(code, 1);
  assert.equal(calls.length, 3, 'three blocks of three: the nine samples the timed pass planned');
  const [cell] = recordOf(dir).filter((r) => r.kind === 'cell');
  assert.deepEqual(cell.asked, { timed: 9, audit: 0 });
  assert.ok(cell.reasons.some((r) => /^incomplete: .* so 2 cold were judged of the 3 planned, with 9 refilled of a bound of 9$/.test(r)), cell.reasons.join('\n'));
});

test('negative control: a missing, doubled or foreign evidence line fails the cell closed, and nothing is refilled on it', async () => {
  const bin = engineBin(scratch('bin3'));
  const cases = [
    ['a missing audit line', (lines) => lines.filter((l) => !(l.block === 'audit' && l.i === 0)), /no line for audit\/0/],
    ['a doubled timed line', (lines) => [...lines, lines.find((l) => l.block === 0 && l.i === 0)], /2 lines for 0\/0/],
    ['a line of another run', (lines) => [...lines, { ...lines.find((l) => l.block === 'audit'), run: 'pinned-V9' }], /a line of another run \(pinned-V9\)|not of this run's run/],
  ];
  for (const [what, edit, expected] of cases) {
    const { dir } = await mainStep(`side-${what.replace(/\W+/g, '-')}`, { blocks: [[UNMET, CANCEL, CANCEL], three(CANCEL), three(CANCEL)], audit: [CANCEL, CANCEL], bin });
    const file = join(dir, 'run', 'premise-evidence.jsonl');
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    writeFileSync(file, `${edit(lines).map((l) => JSON.stringify(l)).join('\n')}\n`);
    const { launch, calls } = launcher(() => ({}), { bin });
    const { code } = await refillStep({ dir, launch, log: quiet });
    assert.equal(code, 1, what);
    assert.equal(calls.length, 0, `${what}: no refill on evidence that does not fit`);
    const [cell] = recordOf(dir).filter((r) => r.kind === 'cell');
    assert.ok(cell.reasons.some((r) => expected.test(r)), `${what}: ${cell.reasons.join('\n')}`);
  }
  // and a run whose rows carry evidence with no evidence file at all
  const { dir } = await mainStep('side-gone', { blocks: [[UNMET, CANCEL, CANCEL], three(CANCEL), three(CANCEL)], audit: [CANCEL, CANCEL], bin });
  writeFileSync(join(dir, 'run', 'premise-evidence.jsonl'), '');
  const { code } = await refillStep({ dir, launch: launcher(() => ({}), { bin }).launch, log: quiet });
  assert.equal(code, 1);
});

test("negative control: a refill run's failure of its other checks is kept", async () => {
  const bin = engineBin(scratch('bin4'));
  const { dir } = await mainStep('other', { blocks: [[UNMET, CANCEL, CANCEL], three(CANCEL), three(CANCEL)], audit: [CANCEL, CANCEL], bin });
  const { launch } = launcher(() => ({ failed: ['a window the harness did not open was changed: 0x2a00003 raised'] }), { bin });
  const { code } = await refillStep({ dir, launch, log: quiet });
  assert.equal(code, 1);
  const [cell] = recordOf(dir).filter((r) => r.kind === 'cell');
  assert.ok(cell.reasons.some((r) => /refill run pinned-V5-r1 failed its other checks: a window the harness did not open was changed/.test(r)), cell.reasons.join('\n'));
});

test('negative control (ruling 825): a refill at another head, with other engine bytes, or under another load is refused and not used', async () => {
  for (const [what, spec, expected] of [
    ['another head', () => ({ head: 'f'.repeat(40) }), /another head/],
    ['other engine bytes', () => ({ bin: engineBin(scratch('other-bytes'), 'cua-engine 0.4.1 rebuilt') }), /other engine bytes/],
    ['another load', () => ({ ballast: null }), /another load/],
  ]) {
    const bin = engineBin(scratch(`bin-825-${what.replace(/\W+/g, '-')}`));
    const { dir } = await mainStep(`825-${what.replace(/\W+/g, '-')}`, { blocks: [[UNMET, CANCEL, CANCEL], three(CANCEL), three(CANCEL)], audit: [CANCEL, CANCEL], bin });
    const { launch, calls } = launcher(() => spec(bin), { bin });
    const { code } = await refillStep({ dir, launch, log: quiet });
    assert.equal(code, 1, what);
    assert.equal(calls.length, 1, `${what}: refused, and not tried again`);
    const record = recordOf(dir);
    const refill = record.find((r) => r.kind === 'run' && r.role === 'refill');
    assert.equal(refill.used, false, what);
    assert.ok(refill.problems.some((p) => expected.test(p)), `${what}: ${refill.problems.join('; ')}`);
    const [cell] = record.filter((r) => r.kind === 'cell');
    assert.deepEqual(cell.refill.cold, [], `${what}: none of its samples counted`);
    assert.ok(cell.reasons.some((r) => /is not used/.test(r)), what);
  }
});

test('--print prints the next refill run and launches nothing; the command is the main run\'s own with the refill\'s parts', async () => {
  const bin = engineBin(scratch('bin6'));
  const { dir } = await mainStep('print', { blocks: [[UNMET, CANCEL, CANCEL], three(CANCEL), three(CANCEL)], audit: [CANCEL, CANCEL], bin });
  const printed = [];
  const { code } = await refillStep({ dir, print: true, launch: () => assert.fail('nothing launched'), log: (l) => printed.push(l) });
  assert.equal(code, 0);
  assert.equal(printed.length, 1);
  assert.match(printed[0], /^premise-refill: \/locked\.sh .*sitting\.mjs --dir \S+\.r1 .* --scene device-chrome-dnd --ops chrome_dnd_shared --blocks 1 --no-audit --run pinned-V5-r1 --ballast gate --pinned$/);
  assert.ok(!existsSync(join(dir, 'premise-refill.jsonl')), 'nothing recorded');
  // a command naming another step directory is refused
  assert.throws(() => refillCommand(`x --dir /a --scene s --ops o --blocks 3 --run r`, { dir: '/b', to: '/b.r1', run: 'r-r1', op: OP, blocks: 1, audit: false }), /another step directory/);
});
