#!/usr/bin/env node
// M4's gate (T18, task 76): T19's predicates manifest's dnd cases re-judged by the design session's ruling on P6
// (2026-11-13, sminos 662, ruling 650's principle): on an allowed dnd case an honest miss (cua answered an error, and
// no drop landed) is a landing miss, judged by the one-sided Fisher test of cua's misses against the pinned build's at
// LOAD_P (drag-judge.mjs, the load lane's own tolerance); any run answered ok with no effect fails hard. Everything else
// stays the manifest's own judge (predicates.mjs judgeCase): its row classes and counts, the valid-run count, the
// witness, the refused and leave cases. A run that answered an error yet took effect is no miss and fails too. Read-only.
// usage: node rejudge-dnd-fisher.mjs <harness checkout (the candidate's commit)> <results.jsonl>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [harness, file] = process.argv.slice(2);
if (!harness || !file) {
  console.error('usage: node rejudge-dnd-fisher.mjs <harness checkout> <results.jsonl>');
  process.exit(2);
}
const { judgeCase, caseKey } = await import(join(harness, 'scripts/linux-engine-diff/predicates.mjs'));
const { LOAD_P, fisherMissesAtLeast } = await import(join(harness, 'scripts/linux-engine-diff/drag-judge.mjs'));
const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const meta = rows.find((r) => r.kind === 'meta');
const cases = rows.filter((r) => r.kind === 'dnd').map(({ family, group, occlusion, park, expect, why }) => ({ family, group, kind: 'dnd', occlusion, park, expect, why }));
const runs = rows.filter((r) => r.kind === 'pointer-route-run' && r.input === 'dnd');

console.log(`# ${meta?.run}'s dnd cases re-judged: an allowed case's honest misses by one-sided Fisher against the pinned build (p >= ${LOAD_P}), ok with no effect hard (${file})`);
console.log(`label: ${meta?.label}; candidate ${meta?.candidate?.sha256} (${meta?.candidate?.version})`);
console.log('\n| case | expect | n | took | honest misses | ok with no effect | error yet took | pinned took | p | verdict | why |');
console.log('|---|---|---:|---:|---:|---:|---:|---|---|---|---|');
let allPass = true;
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
    p = fisherMissesAtLeast(cua.n - cua.took, cua.n, pinned.n - pinned.took, pinned.n);
    const landed = cua.took >= pinned.took || p >= LOAD_P;
    if (!landed) why.push(`landed ${cua.took} of ${cua.n} against the pinned build's ${pinned.took} of ${pinned.n} (one-sided Fisher p = ${p.toFixed(4)})`);
    pass = why.length === 0;
  } else {
    why.push(...judged.failed);
  }
  if (!pass) allPass = false;
  console.log(`| ${caseKey(c)} | ${c.expect} | ${cua.n} | ${cua.took} | ${c.expect === 'allowed' ? honest : '–'} | ${cua.ok_no_effect} | ${c.expect === 'allowed' ? errorTook : '–'} | ${pinned.took} of ${pinned.n} | ${p === null ? '–' : p.toFixed(4)} | ${pass ? 'PASS' : 'FAIL'} | ${why.join('; ') || (c.expect === 'allowed' ? 'the manifest\'s judge, honest misses by Fisher' : 'the manifest\'s judge')} |`);
}
console.log(`\ncases: ${cases.length}; VERDICT (the manifest's judge, allowed dnd cases' honest misses by Fisher at ${LOAD_P}): ${allPass ? 'PASS' : 'FAIL'}`);
process.exit(allPass ? 0 : 1);
