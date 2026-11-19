#!/usr/bin/env node
// Task 99 (T7 part 2; in the form of M4's m4/gate/scripts/compare-settle.mjs, for a drag step): D1's cross-check, its
// H''' record on 0.4.0 against its H'''' record on 0.4.1 (pre-flight §8.1 point 2: compared cell by cell, with its
// failures). It reads the two summary.md tables the drag experiment writes: per family and kind every lane's runs
// taken, the witness, and the verdict, then the step's judges' verdict line, its declared speed gaps, and its "Cells
// where a cua lane missed" line. It prints every cell with what differs, and a line saying whether the verdicts, the
// cell sets, the witnesses, the shipped lane's misses and the step verdict agree. A cua:0ms (the control lane) or
// vendor lane's take count that moves is listed as noise to read, not a difference, as compare-settle lists misses.
// Read-only. usage: node compare-drag.mjs <earlier summary.md> <later summary.md>
import { readFileSync } from 'node:fs';

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('usage: node compare-drag.mjs <earlier summary.md> <later summary.md>');
  process.exit(2);
}
const read = (file) => {
  const cells = new Map();
  let header = null;
  let verdict = null;
  const declared = [];
  let missed = null;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const c = line.split('|').slice(1, -1).map((x) => x.trim());
    if (c[0] === 'family' && c[1] === 'kind') { header = c; continue; }
    if (header && c.length === header.length && /^\d+\/\d+$/.test(c[2] ?? '')) {
      const row = Object.fromEntries(header.map((h, i) => [h, c[i]]));
      cells.set(`${c[0]} | ${c[1]}`, row);
      continue;
    }
    const v = line.match(/^The judges' verdict for `cua`: (.*)$/);
    if (v) verdict = v[1];
    // the gaps' names and cells, their figures masked (each gap's bound is judged in its cell's verdict); ticket numbers kept
    if (/^Declared speed gaps/.test(line)) declared.push(line.replace(/(?<![#\d.])-?\d+(\.\d+)?/g, '<n>'));
    if (/^Cells where a cua lane missed/.test(line)) missed = line;
  }
  return { cells, verdict, declared, missed };
};
const x = read(a);
const y = read(b);
let verdicts = 0, sets = 0, witness = 0, took = 0;
const noise = [];
console.log(`# the drag cross-check: ${a} against ${b}`);
console.log('\n| family | kind | cua took | witness | verdict | differs |');
console.log('|---|---|---|---|---|---|');
for (const key of new Set([...x.cells.keys(), ...y.cells.keys()])) {
  const p = x.cells.get(key);
  const q = y.cells.get(key);
  const diff = [];
  if (!p || !q) { diff.push(p ? 'only in the earlier' : 'only in the later'); sets += 1; }
  else {
    if (p.verdict !== q.verdict) { diff.push('verdict'); verdicts += 1; }
    if (p.witness !== q.witness) { diff.push('witness'); witness += 1; }
    // the shipped lane's misses (runs minus takes) must agree; a series topped up to 40 on one side only is not a difference
    const missedOf = (t) => { const [n, d] = t.split('/').map(Number); return d - n; };
    if (missedOf(p['cua took']) !== missedOf(q['cua took'])) { diff.push('cua misses'); took += 1; }
    else if (p['cua took'] !== q['cua took']) noise.push(`${key} cua took ${p['cua took']} → ${q['cua took']} (runs topped up differently, no miss)`);
    for (const lane of ['pinned took', 'newest took', 'cua:0ms took']) if (p[lane] !== q[lane]) noise.push(`${key} ${lane} ${p[lane]} → ${q[lane]}`);
  }
  const pair = (f) => `${p ? p[f] : '–'} → ${q ? q[f] : '–'}`;
  console.log(`| ${key} | ${pair('cua took')} | ${pair('witness')} | ${pair('verdict')} | ${diff.join(', ') || '–'} |`);
}
const stepSame = x.verdict === y.verdict;
const declaredSame = JSON.stringify(x.declared) === JSON.stringify(y.declared);
console.log(`\nthe judges' verdict for cua: earlier ${x.verdict}; later ${y.verdict}${stepSame ? '' : ' (DIFFERS)'}`);
console.log(`declared speed gaps: earlier ${x.declared.join('; ') || 'none'}; later ${y.declared.join('; ') || 'none'}${declaredSame ? '' : ' (DIFFER)'}`);
console.log(`cells a cua lane missed: earlier ${x.missed ?? 'none'}; later ${y.missed ?? 'none'}`);
console.log(`the other lanes' take counts that moved (noise, read them): ${noise.join('; ') || 'none'}`);
const same = verdicts === 0 && sets === 0 && witness === 0 && took === 0 && stepSame && declaredSame;
console.log(`cells: ${x.cells.size} and ${y.cells.size}; verdicts differing ${verdicts}, cells in one only ${sets}, witnesses differing ${witness}, cua misses differing ${took}`);
console.log(`CROSS-CHECK: ${same ? 'SAME verdicts, cells, witnesses, cua misses and the step verdict' : 'DIFFERS'}`);
process.exit(same ? 0 : 1);
