#!/usr/bin/env node
// The thumb drags' distance against the motions Chrome received (T10's count, for T11's plot), from a drag run's rows:
// per family and lane, each run's (received raw, distance), the lane's medians, and the Spearman rank correlation of
// distance with received motions over every run of the cell (all lanes), so a per-motion rounding shows as a negative one.
// usage: node received-table.mjs <results.jsonl> [kind=scroller]
import { readFileSync } from 'node:fs';

const [file, kind = 'scroller'] = process.argv.slice(2);
const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.kind === 'drag-run' && r.drag === kind && r.received && typeof r.after === 'number');
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
const ranks = (xs) => {
  const order = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let k = 0; k < order.length; ) {
    let j = k;
    while (j + 1 < order.length && order[j + 1][0] === order[k][0]) j++;
    for (let m = k; m <= j; m++) r[order[m][1]] = (k + j) / 2 + 1;
    k = j + 1;
  }
  return r;
};
const spearman = (xs, ys) => {
  const rx = ranks(xs);
  const ry = ranks(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / rx.length;
  const my = ry.reduce((a, b) => a + b, 0) / ry.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  if (dx * dy === 0) return '–';
  return Math.round((num / Math.sqrt(dx * dy)) * 100) / 100;
};
for (const family of [...new Set(rows.map((r) => r.family))]) {
  const cell = rows.filter((r) => r.family === family);
  const dist = (r) => Math.abs(r.after - r.before);
  // a page that dispatched no pointerrawupdate counts nothing
  if (cell.every((r) => r.received.raw === 0)) {
    console.log(`\n${family} ${kind}: no pointerrawupdate events : not counted`);
    continue;
  }
  console.log(`\n${family} ${kind}: distance (px) against the motions the page received (pointerrawupdate), ${cell.length} runs; Spearman over all lanes ${spearman(cell.map((r) => r.received.raw), cell.map(dist))}`);
  console.log('| lane | runs | received median [min–max] | distance median [min–max] | Spearman in the lane | (received, distance) per run |');
  console.log('|---|---:|---|---|---:|---|');
  for (const lane of [...new Set(cell.map((r) => r.engine))]) {
    const mine = cell.filter((r) => r.engine === lane);
    const rec = mine.map((r) => r.received.raw);
    const d = mine.map(dist);
    const within = new Set(rec).size > 1 && new Set(d).size > 1 ? spearman(rec, d) : '–';
    console.log(`| ${lane} | ${mine.length} | ${median(rec)} [${Math.min(...rec)}–${Math.max(...rec)}] | ${median(d)} [${Math.min(...d)}–${Math.max(...d)}] | ${within} | ${mine.map((r) => `(${r.received.raw}, ${dist(r)})`).join(' ')} |`);
  }
}
