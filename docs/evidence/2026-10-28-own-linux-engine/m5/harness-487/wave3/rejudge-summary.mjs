// Summarises a rejudge-settle-rest.mjs output (argv[2]): totals, the runs moved from the base judge, and every run whose
// verdict judged now differs from the verdict it stored, with the base judge's verdict beside it.
import { readFileSync } from 'node:fs';

const lines = readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const s = lines.at(-1);
const runs = lines.filter((l) => !l.summary);
console.log(`runs ${s.runs}, judged ${s.judged}, t17-fix3 ${s.t17_fix3}, moved from base: ${s.moved_from_base.length}`);
for (const m of s.moved_from_base) console.log(`  moved: ${m}`);
const h9 = runs.filter((l) => /engine-044\/reach/.test(l.path) && l.judge);
console.log(`H9 judged runs: ${h9.length}`);
for (const l of h9) console.log(`  ${l.path.split('reach/')[1]} ${l.plan} stored ${l.stored_pass} now ${l.pass} base-moved ${l.moved_from_base} ${l.settle_rest ? JSON.stringify(l.settle_rest) : ''}`);
const differ = runs.filter((l) => l.stored_pass !== null && l.pass !== null && l.stored_pass !== l.pass);
console.log(`stored verdict differs from now: ${differ.length} (of them also differing from base: ${differ.filter((l) => l.moved_from_base).length})`);
