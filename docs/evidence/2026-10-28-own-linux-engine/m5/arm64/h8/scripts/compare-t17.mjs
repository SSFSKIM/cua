#!/usr/bin/env node
// Task 136: H1's cross-check, its T17 Electron cells (drop-signals-judge.mjs `electronDropVerdict`'s table) at two heads,
// cell by cell: each column the earlier and later run share, by its header name, with a two-sided Fisher exact test on
// each count column that is a proportion of the cell's drags (landed, ok with nothing pending, unconfirmed, false ok
// …), and the two runs' verdict and findings lines. A column that only the later run has (a new judge's) is shown, not
// compared. Read-only.
//   node compare-t17.mjs <earlier summary.md> <later summary.md>
import { readFileSync } from 'node:fs';

const [a, b] = process.argv.slice(2);
const table = (file) => {
  const lines = readFileSync(file, 'utf8').split('\n');
  const at = lines.findIndex((l) => /^T17's Electron cells/.test(l));
  const head = lines.slice(at).find((l) => l.startsWith('| lane | cell'));
  const cols = head.split('|').slice(1, -1).map((c) => c.trim());
  const rows = new Map();
  for (const l of lines.slice(lines.indexOf(head) + 2)) {
    if (!l.startsWith('|')) break;
    const c = l.split('|').slice(1, -1).map((x) => x.trim());
    rows.set(`${c[0]} | ${c[1]}`, Object.fromEntries(cols.map((k, i) => [k, c[i]])));
  }
  const verdict = lines.slice(at).find((l) => /^(No false ok|\*\*Fails)/.test(l)) ?? '–';
  return { cols, rows, verdict };
};
const lnf = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
// two-sided Fisher exact p for [[x1, n1-x1], [x2, n2-x2]]
const fisher = (x1, n1, x2, n2) => {
  const k = x1 + x2, n = n1 + n2;
  const p = (x) => Math.exp(lnf(k) + lnf(n - k) + lnf(n1) + lnf(n2) - lnf(x) - lnf(k - x) - lnf(n1 - x) - lnf(n2 - k + x) - lnf(n));
  const p0 = p(x1);
  let s = 0;
  for (let x = Math.max(0, k - n2); x <= Math.min(k, n1); x++) { const q = p(x); if (q <= p0 * (1 + 1e-9)) s += q; }
  return Math.min(1, s);
};
const A = table(a), B = table(b);
const shared = A.cols.filter((c) => B.cols.includes(c) && !['lane', 'cell', 'drags'].includes(c));
console.log(`# H1's T17 cells: ${a} against ${b}`);
console.log(`columns compared: ${shared.join(', ')}; only in the later: ${B.cols.filter((c) => !A.cols.includes(c)).join(', ') || 'none'}`);
console.log('\n| lane | cell | drags | column | earlier → later | Fisher p |');
console.log('|---|---|---:|---|---|---:|');
let minP = 1, differ = 0, sets = 0;
for (const key of new Set([...A.rows.keys(), ...B.rows.keys()])) {
  const x = A.rows.get(key), y = B.rows.get(key);
  if (!x || !y) { sets += 1; console.log(`| ${key} | – | – | ${x ? 'only in the earlier' : 'only in the later'} | – |`); continue; }
  for (const c of shared) {
    const u = Number(String(x[c]).split(' ')[0]), v = Number(String(y[c]).split(' ')[0]);
    if (!Number.isFinite(u) || !Number.isFinite(v) || x[c] === y[c]) continue;
    differ += 1;
    const pv = fisher(u, Number(x.drags), v, Number(y.drags));
    minP = Math.min(minP, pv);
    console.log(`| ${key} | ${x.drags}/${y.drags} | ${c} | ${x[c]} → ${y[c]} | ${pv.toFixed(3)} |`);
  }
}
console.log(`\ncells: ${A.rows.size} and ${B.rows.size}; in one only ${sets}; differing counts ${differ}; the smallest Fisher p ${minP.toFixed(3)}`);
console.log(`verdict, earlier: ${A.verdict}`);
console.log(`verdict, later: ${B.verdict}`);
