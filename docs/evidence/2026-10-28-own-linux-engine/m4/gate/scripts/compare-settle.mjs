#!/usr/bin/env node
// M4's gate (T18, task 79): a settle step's cross-check, one candidate's stored summary against another's (ruling 677:
// the same verdict, and the same effects and counts within noise; if it differs, the kept set reruns). It reads the
// two summary.md tables the settle experiment writes: per cell its runs, misses (late / never / refused / invalid) and
// verdict, and per audited cell the audit, the runs that ran their input and the effects missed. It prints every cell
// with what differs, and a line saying whether the verdicts, the cell sets, the audits and the misses agree.
// Read-only. usage: node compare-settle.mjs <earlier summary.md> <later summary.md>
import { readFileSync } from 'node:fs';

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('usage: node compare-settle.mjs <earlier summary.md> <later summary.md>');
  process.exit(2);
}
const cellsOf = (file) => {
  const runs = new Map();
  const audits = new Map();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const c = line.split('|').slice(1, -1).map((x) => x.trim());
    // | cell | lane | runs | misses (...) | streak at the end | verdict |
    if (c.length === 6 && /^\d+$/.test(c[2])) runs.set(`${c[0]} | ${c[1]}`, { runs: Number(c[2]), misses: c[3], verdict: c[5] });
    // | cell | audit | requests | runs that ran their input | effects missed |
    else if (c.length === 5 && /^\d+$/.test(c[2])) audits.set(c[0], { audit: c[1], ran: c[3], missed: c[4] });
  }
  return { runs, audits };
};
const first = cellsOf(a);
const second = cellsOf(b);
const missesOf = (m) => Number(m.split(' ')[0]);
let verdicts = 0;
let sets = 0;
let auditDiff = 0;
let missDiff = 0;
console.log(`# the settle cross-check: ${a} against ${b}`);
console.log('\n| cell | lane | runs | misses | verdict | differs |');
console.log('|---|---|---|---|---|---|');
for (const key of new Set([...first.runs.keys(), ...second.runs.keys()])) {
  const x = first.runs.get(key);
  const y = second.runs.get(key);
  const diff = [];
  if (!x || !y) { diff.push(x ? 'only in the earlier' : 'only in the later'); sets += 1; }
  else {
    if (x.verdict !== y.verdict) { diff.push('verdict'); verdicts += 1; }
    if (missesOf(x.misses) !== missesOf(y.misses)) { diff.push('misses'); missDiff += 1; }
  }
  const pair = (f) => `${x ? x[f] : '–'} → ${y ? y[f] : '–'}`;
  console.log(`| ${key} | ${pair('runs')} | ${pair('misses')} | ${pair('verdict')} | ${diff.join(', ') || '–'} |`);
}
console.log('\n| audited cell | audit | ran | effects missed | differs |');
console.log('|---|---|---|---|---|');
for (const key of new Set([...first.audits.keys(), ...second.audits.keys()])) {
  const x = first.audits.get(key);
  const y = second.audits.get(key);
  const diff = [];
  if (!x || !y) { diff.push(x ? 'only in the earlier' : 'only in the later'); sets += 1; }
  else if (x.audit !== y.audit || x.ran !== y.ran || x.missed !== y.missed) { diff.push('audit'); auditDiff += 1; }
  const pair = (f) => `${x ? x[f] : '–'} → ${y ? y[f] : '–'}`;
  console.log(`| ${key} | ${pair('audit')} | ${pair('ran')} | ${pair('missed')} | ${diff.join(', ') || '–'} |`);
}
const same = verdicts === 0 && sets === 0 && auditDiff === 0;
console.log(`\ncells: ${first.runs.size} and ${second.runs.size}; audited: ${first.audits.size} and ${second.audits.size}; verdicts differing ${verdicts}, cells in one only ${sets}, audits differing ${auditDiff}, cells whose misses differ ${missDiff}`);
console.log(`CROSS-CHECK: ${same ? 'SAME verdicts, cells and audits' : 'DIFFERS'}${missDiff ? ` (misses differ in ${missDiff} cell(s): read them against noise)` : ''}`);
process.exit(same ? 0 : 1);
