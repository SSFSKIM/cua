#!/usr/bin/env node
// Task 105: D1's cross-check (pre-flight §8.1 point 2), its record at H'''' against its record at H, cell by cell, in
// the form of M4's compare-settle.mjs (m4/gate/scripts/compare-settle.mjs), for the drag experiment's summary.md: per
// family and kind every lane's runs taken, the witness and the verdict; the judges' verdict for `cua`; the cells where a
// cua lane missed a run the pinned build took; the declared speed gaps (which cells, not their numbers); every
// "Incomplete or failed" line; and the desktop line's foreign windows acted on. Timings and medians are measurements
// and are left out.
// A difference in what the gate judges (the shipped lane `cua`: its runs taken, a cell's verdict for it, the judges'
// verdict, the witness, a failure line, the declared set) is a difference of the cross-check. `cua:0ms` is "measured,
// not judged" (the summary's own words), and the newest vendor build is a reference lane: their runs taken (and
// cua:0ms's verdict word) are listed apart, as measured.
// Read-only. usage: node compare-drag.mjs <earlier summary.md> <later summary.md>
import { readFileSync } from 'node:fs';

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('usage: node compare-drag.mjs <earlier summary.md> <later summary.md>');
  process.exit(2);
}
const read = (file) => {
  const lines = readFileSync(file, 'utf8').split('\n');
  let header = null;
  const cells = new Map();
  const notes = { failed: [], missed: null, verdict: null, declared: [], desktopActed: null };
  for (const line of lines) {
    const c = line.split('|').slice(1, -1).map((x) => x.trim());
    if (c[0] === 'family' && c[1] === 'kind') { header = c; continue; }
    if (header && c.length === header.length && !/^-+:?$/.test(c[0]) && c[0] !== 'family') {
      const row = Object.fromEntries(header.map((h, i) => [h, c[i]]));
      cells.set(`${row.family} ${row.kind}`, row);
      continue;
    }
    const f = line.match(/^\*\*Incomplete or failed:\*\* (.*)\.$/);
    if (f) notes.failed.push(...f[1].split('; '));
    if (line.startsWith('Cells where a cua lane missed')) notes.missed = line.replace(/^[^:]*: /, '');
    const v = line.match(/^The judges' verdict for `cua`: (.*)$/);
    if (v) notes.verdict = v[1];
    if (line.startsWith('Declared speed gaps')) notes.declared = [...line.matchAll(/(\w+ \w+): (cua(?::0ms)?) declared speed gap \((#\d+)\)/g)].map((m) => `${m[1]} ${m[2]} ${m[3]}`);
    if (line.startsWith('desktop:')) notes.desktopActed = /neither acted on/.test(line) ? 'neither acted on' : line.replace(/;.*/, '');
  }
  return { header, cells, notes };
};
const A = read(a);
const B = read(b);
const took = (h) => h.filter((x) => / took$/.test(x));
const judged = [];
const measured = [];
const keys = [...new Set([...A.cells.keys(), ...B.cells.keys()])];
console.log(`cells: earlier ${A.cells.size}, later ${B.cells.size}`);
for (const k of keys) {
  const x = A.cells.get(k);
  const y = B.cells.get(k);
  if (!x || !y) { judged.push(`${k}: only in the ${x ? 'earlier' : 'later'} record`); console.log(`${k}: only in the ${x ? 'earlier' : 'later'}`); continue; }
  const parts = [];
  for (const h of took(A.header)) {
    const same = x[h] === y[h];
    parts.push(`${h} ${x[h]}${same ? '' : ` -> ${y[h]}`}`);
    if (!same) (h === 'cua took' || h === 'pinned took' ? judged : measured).push(`${k}: ${h} ${x[h]} -> ${y[h]}`);
  }
  if (x.witness !== y.witness) judged.push(`${k}: witness ${x.witness} -> ${y.witness}`);
  parts.push(`witness ${x.witness}${x.witness === y.witness ? '' : ` -> ${y.witness}`}`);
  const vc = (v) => v.split(', ').find((s) => s.startsWith('cua ') && !s.startsWith('cua:0ms')) ?? v;
  const v0 = (v) => v.split(', ').find((s) => s.startsWith('cua:0ms')) ?? '';
  if (vc(x.verdict) !== vc(y.verdict)) judged.push(`${k}: cua's verdict ${vc(x.verdict)} -> ${vc(y.verdict)}`);
  if (v0(x.verdict) !== v0(y.verdict)) measured.push(`${k}: ${v0(x.verdict)} -> ${v0(y.verdict)}`);
  parts.push(`verdict ${x.verdict}${x.verdict === y.verdict ? '' : ` -> ${y.verdict}`}`);
  console.log(`${k}: ${parts.join('; ')}`);
}
const same = (p, q) => JSON.stringify(p) === JSON.stringify(q);
for (const [name, p, q] of [
  ["the judges' verdict for cua", A.notes.verdict, B.notes.verdict],
  ['incomplete or failed', A.notes.failed, B.notes.failed],
  ['declared speed gaps (cells)', A.notes.declared, B.notes.declared],
  ['desktop, foreign windows', A.notes.desktopActed, B.notes.desktopActed],
]) {
  console.log(`${name}: ${JSON.stringify(p)}${same(p, q) ? ' (the same)' : ` -> ${JSON.stringify(q)} **DIFFERS**`}`);
  if (!same(p, q)) judged.push(`${name}: ${JSON.stringify(p)} -> ${JSON.stringify(q)}`);
}
console.log(`cells where a cua lane missed a run: ${A.notes.missed} -> ${B.notes.missed}`);
console.log(`measured-only differences (cua:0ms and the newest vendor build, not judged): ${measured.length ? measured.join('; ') : 'none'}`);
console.log(judged.length ? `CROSS-CHECK DIFFERS: ${judged.join('; ')}` : 'CROSS-CHECK: the same (every judged cell, verdict, witness, failure line and declared cell agrees)');
process.exit(judged.length ? 1 : 0);
