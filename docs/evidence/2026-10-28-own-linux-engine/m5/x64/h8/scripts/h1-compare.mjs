#!/usr/bin/env node
// Task 135: the H1 cross-check (ruling 990 (3)): H1 at H8 against its H6 record, cell by cell, read-only. Every table
// the two summaries share (by its header) is compared row by row (a row keyed by its leading non-numeric cells). Each
// count that differs, in a table with a `drags` column, gets Fisher's exact two-sided p over (count, drags - count) at
// H6 against H8; a count with no denominator is shown as it differs. A difference beyond chance is one with p < 0.01
// (several dozen counts are compared, so 0.05 alone would flag one by chance). Prints every row, `=` where nothing
// differs. usage: node h1-compare.mjs <H6 summary.md> <H8 summary.md>
import { readFileSync } from 'node:fs';

const tables = (file) => {
  const out = new Map();
  let head = null;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.startsWith('|')) { head = null; continue; }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^-+:?$|^:?-+:?$/.test(c))) continue;
    if (!head) { head = cells; out.set(head.join(' | '), { head, rows: [] }); continue; }
    out.get(head.join(' | ')).rows.push(cells);
  }
  return out;
};
const lf = (() => { const t = [0]; return (n) => { for (let i = t.length; i <= n; i++) t[i] = t[i - 1] + Math.log(i); return t[n]; }; })();
const fisher = (a, b, c, d) => {
  const n = a + b + c + d, r1 = a + b, c1 = a + c;
  const p = (x) => Math.exp(lf(r1) + lf(n - r1) + lf(c1) + lf(n - c1) - lf(n) - lf(x) - lf(r1 - x) - lf(c1 - x) - lf(n - r1 - c1 + x));
  const p0 = p(a);
  let s = 0;
  for (let x = Math.max(0, c1 - (n - r1)); x <= Math.min(r1, c1); x++) { const q = p(x); if (q <= p0 * (1 + 1e-9)) s += q; }
  return Math.min(1, s);
};
const num = (s) => (/^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null);
const [h6, h8] = process.argv.slice(2).map(tables);
let beyond = 0, differing = 0, compared = 0;
const matched = new Set();
for (const [key, t6] of h6) {
  // a table the later judge extended with columns of its own (957's stale-position drops and ambiguous): compared on
  // the columns the H6 record has
  const ext = [...h8.keys()].find((k) => k !== key && k.startsWith(`${key} | `));
  const t8 = h8.get(key) ?? (ext ? h8.get(ext) : undefined);
  if (!t8) { console.log(`\n## only at H6: | ${key} |`); continue; }
  if (ext && !h8.has(key)) { matched.add(ext); console.log(`\n## | ${key} | (H8 adds: ${ext.slice(key.length + 3)}; shown apart)`); }
  else console.log(`\n## | ${key} |`);
  const di = t6.head.findIndex((h) => h === 'drags');
  const keyOf = (r) => { const k = []; for (const c of r) { if (num(c) !== null) break; k.push(c); } return k.join(' | '); };
  const by8 = new Map(t8.rows.map((r) => [keyOf(r), r]));
  for (const r6 of t6.rows) {
    const k = keyOf(r6);
    const r8 = by8.get(k);
    if (!r8) { console.log(`- ${k}: only at H6`); continue; }
    by8.delete(k);
    const diffs = [];
    for (let i = 0; i < t6.head.length; i++) {
      if (r6[i] === r8[i]) continue;
      const [a, c] = [num(r6[i]), num(r8[i])];
      const [n6, n8] = di >= 0 ? [num(r6[di]), num(r8[di])] : [null, null];
      if (a !== null && c !== null && n6 !== null && n8 !== null && i !== di && Number.isInteger(a) && Number.isInteger(c) && a <= n6 && c <= n8) {
        const p = fisher(a, n6 - a, c, n8 - c);
        compared++; differing++;
        if (p < 0.01) beyond++;
        diffs.push(`${t6.head[i]} ${a}/${n6} → ${c}/${n8} (Fisher p ${p.toFixed(3)}${p < 0.01 ? ', BEYOND CHANCE' : ''})`);
      } else diffs.push(`${t6.head[i]} ${r6[i]} → ${r8[i]}`);
    }
    const added = r8.slice(t6.head.length).map((c, x) => `${t8.head[t6.head.length + x]} ${c}`);
    console.log(`- ${k}: ${diffs.length ? diffs.join('; ') : '='}${added.length ? ` [H8 only: ${added.join('; ')}]` : ''}`);
  }
  for (const k of by8.keys()) console.log(`- ${k}: only at H8`);
}
for (const key of h8.keys()) if (!h6.has(key) && !matched.has(key)) console.log(`\n## only at H8: | ${key} |`);
console.log(`\ncounts with a denominator that differ: ${differing}; beyond chance (p < 0.01): ${beyond}`);
process.exit(beyond ? 1 : 0);
