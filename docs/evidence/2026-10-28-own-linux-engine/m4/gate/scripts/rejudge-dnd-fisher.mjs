#!/usr/bin/env node
// M4's gate (T18, task 76): T19's predicates manifest's dnd cases re-judged by the design session's ruling on P6
// (2026-11-13, sminos 662, ruling 650's principle): on an allowed dnd case an honest miss (cua answered an error, and
// no drop landed) is a landing miss, judged by the one-sided Fisher test of cua's misses against the pinned build's at
// LOAD_P (drag-judge.mjs, the load lane's own tolerance); any run answered ok with no effect fails hard. Everything else
// stays the manifest's own judge (predicates.mjs judgeCase): its row classes and counts, the valid-run count, the
// witness, the refused and leave cases. A run that answered an error yet took effect is no miss and fails too. Read-only.
// The landing is judged by Fisher alone: p >= LOAD_P. Fisher answers 1 wherever cua missed no more often than the
// pinned build, so no shortcut on raw counts is needed, and one would be wrong where the two lanes' valid runs differ
// (judgeCase drops runs whose park missed): cua 22 of 30 against the pinned build's 20 of 20 has more landings and
// p = 0.0109. The pinned build's reference must be a full side: at least the manifest's own count for an allowed case
// (predicates.mjs ALLOWED_RUNS, 30, the count cua must reach too), as the load judge it borrows from compares full sides
// (Acceptance 3's load lane, "40 a side"); with fewer, a reference of a few lucky runs, or of none, would excuse cua's
// misses (fixed after review, the design session's ruling 697).
// Run-wide: the run's own terminal failures (the experiment summary's `failed`: every case's, a measurement error, a
// change to a window the harness did not open) all stand but the exact ones this ruling replaces, an allowed case's
// "N did not take effect" where its landing now passes; and every case of the step (the candidate's steps.mjs, through
// the manifest's predicatePlan) is judged, measured or not (ruling 697).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [harness, file] = process.argv.slice(2);
if (!harness || !file) {
  console.error('usage: node rejudge-dnd-fisher.mjs <harness checkout> <results.jsonl>');
  process.exit(2);
}
const { judgeCase, caseKey, predicatePlan, ALLOWED_RUNS } = await import(join(harness, 'scripts/linux-engine-diff/predicates.mjs'));
const { LOAD_P, fisherMissesAtLeast } = await import(join(harness, 'scripts/linux-engine-diff/drag-judge.mjs'));
const { stepNamed } = await import(join(harness, 'scripts/linux-engine-gate/steps.mjs'));
const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const meta = rows.find((r) => r.kind === 'meta');
const summary = rows.find((r) => r.kind === 'experiment-summary');
// the step's cases, as the gate planned them: its arguments through the manifest's own plan
const step = stepNamed(String(meta?.run).replace(/^m4-gate-/, ''));
const argOf = (name) => (step.args.includes(name) ? step.args[step.args.indexOf(name) + 1] : undefined);
const cases = predicatePlan({ ops: argOf('--ops')?.split(','), plan: argOf('--plan') }).filter((c) => c.kind === 'dnd');
const runs = rows.filter((r) => r.kind === 'pointer-route-run' && r.input === 'dnd');
const PINNED_MIN = ALLOWED_RUNS;

console.log(`# ${meta?.run}'s dnd cases re-judged: an allowed case's honest misses by one-sided Fisher against the pinned build (p >= ${LOAD_P}, the pinned build's valid runs at least ${PINNED_MIN}), ok with no effect hard (${file})`);
console.log(`label: ${meta?.label}; candidate ${meta?.candidate?.sha256} (${meta?.candidate?.version})`);
console.log('\n| case | expect | n | took | honest misses | ok with no effect | error yet took | pinned took | p | verdict | why |');
console.log('|---|---|---:|---:|---:|---:|---:|---|---|---|---|');
let allPass = true;
const replaced = new Set();
for (const c of cases) {
  const mine = runs.filter((r) => r.case === caseKey(c));
  const judged = judgeCase(c, mine);
  const cua = judged.counts.cua ?? { n: 0, took: 0, ok_no_effect: 0 };
  const pinned = judged.counts.pinned ?? { n: 0, took: 0 };
  // the valid cua runs as the manifest counts them (park held at the request, effect read)
  const valid = mine.filter((r) => r.engine === 'cua' && r.pointer?.held === true && typeof r.took === 'boolean');
  const honest = valid.filter((r) => r.ok !== true && r.took !== true).length;
  const errorTook = valid.filter((r) => r.ok !== true && r.took === true).length;
  let pass = judged.pass;
  let p = null;
  const why = [];
  if (c.expect === 'allowed') {
    // the manifest's own failures but its "did not take effect", which the ruling replaces
    const others = judged.failed.filter((f) => !/did not take effect$/.test(f));
    why.push(...others);
    if (cua.ok_no_effect) why.push(`${cua.ok_no_effect} answered ok with no effect`);
    if (errorTook) why.push(`${errorTook} answered an error and took effect`);
    if (pinned.n < PINNED_MIN) why.push(`the pinned build's reference is ${pinned.n} valid runs, under the ${PINNED_MIN} a side the landing is judged on`);
    p = fisherMissesAtLeast(cua.n - cua.took, cua.n, pinned.n - pinned.took, pinned.n);
    if (!(p >= LOAD_P)) why.push(`landed ${cua.took} of ${cua.n} against the pinned build's ${pinned.took} of ${pinned.n} (one-sided Fisher p = ${p.toFixed(4)})`);
    pass = why.length === 0;
    // the run's own failure of this case, which the ruling replaces when the case now passes
    if (pass && judged.failed.length) replaced.add(`${caseKey(c)}: ${judged.failed.join(', ')}`);
  } else {
    why.push(...judged.failed);
  }
  if (!pass) allPass = false;
  console.log(`| ${caseKey(c)} | ${c.expect} | ${cua.n} | ${cua.took} | ${c.expect === 'allowed' ? honest : '–'} | ${cua.ok_no_effect} | ${c.expect === 'allowed' ? errorTook : '–'} | ${pinned.took} of ${pinned.n} | ${p === null ? '–' : p.toFixed(4)} | ${pass ? 'PASS' : 'FAIL'} | ${why.join('; ') || (c.expect === 'allowed' ? 'the manifest\'s judge, honest misses by Fisher' : 'the manifest\'s judge')} |`);
}
// the run's terminal failures but the replaced ones, and the run's summary itself
const problems = [];
if (!summary) problems.push('the run has no summary: it did not end');
if (!cases.length) problems.push(`the step plans no dnd case (${step.args.join(' ')})`);
const retained = (summary?.failed ?? []).filter((f) => !replaced.has(f));
for (const f of retained) problems.push(`the run's own failure: ${f}`);
// a case the run never measured fails above (cua ran 0 of its count); named here too
const unmeasured = cases.filter((c) => !runs.some((r) => r.case === caseKey(c))).map(caseKey);
if (unmeasured.length) problems.push(`the step's cases with no run: ${unmeasured.join(', ')}`);
console.log(`\ncoverage: ${cases.length - unmeasured.length} of the step's ${cases.length} dnd cases (${step.name}: --ops ${argOf('--ops')}) measured`);
console.log(`replaced by the ruling: ${[...replaced].join('; ') || 'none'}`);
console.log(`other terminal failures retained: ${retained.join('; ') || 'none'}`);
if (problems.length) console.log(`run problems: ${problems.join('; ')}`);
if (problems.length) allPass = false;
console.log(`cases: ${cases.length}; VERDICT (the manifest's judge, allowed dnd cases' honest misses by Fisher at ${LOAD_P}): ${allPass ? 'PASS' : 'FAIL'}`);
process.exit(allPass ? 0 : 1);
