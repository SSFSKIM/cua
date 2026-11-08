#!/usr/bin/env node
// The thumb plot T11's row asks for: each Chromium scrollbar-thumb drag's distance against the motions the page
// received (the coalesced pointerrawupdate samples, T10's `received.raw`), one small multiple per lane, the pinned
// build's mean distance of the same sitting drawn across every panel. Writes <out>.svg and <out>.md.
// usage: node thumb-plot.mjs <out base> <family> <results.jsonl[.gz]>...
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const [out, family, ...files] = process.argv.slice(2);
const rows = files.flatMap((f) => {
  const buf = readFileSync(f);
  const text = f.endsWith('.gz') ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
});
const runs = rows.filter((r) => r.kind === 'drag-run' && r.family === family && r.drag === 'scroller' && typeof r.after === 'number');
const lanes = [...new Set(runs.map((r) => r.engine))];
const pinned = runs.filter((r) => r.engine === 'pinned' && r.took);
const mean = pinned.reduce((s, r) => s + r.after, 0) / Math.max(1, pinned.length);
const spearman = (xs, ys) => {
  const rank = (v) => {
    const order = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(v.length);
    for (let i = 0; i < order.length; ) {
      let j = i;
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
      for (let k = i; k <= j; k++) r[order[k][1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  if (new Set(xs).size < 2 || new Set(ys).size < 2) return null;
  const [rx, ry] = [rank(xs), rank(ys)];
  const m = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const [mx, my] = [m(rx), m(ry)];
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
};
const med = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
const md = [`${family} scroller: distance (px) against the motions the page received (coalesced pointerrawupdate samples); pinned mean ${mean.toFixed(1)} px`, '', '| lane | runs | received median [min–max] | distance median [min–max] | at or past the pinned mean | Spearman in the lane |', '|---|---:|---|---|---:|---:|'];
const W = 220, H = 180, PAD = { l: 40, r: 10, t: 28, b: 34 };
const allRecv = runs.map((r) => r.received?.raw).filter((x) => typeof x === 'number');
const xMax = Math.max(70, ...allRecv);
const yMax = 160;
const panels = [];
lanes.forEach((lane, n) => {
  const lr = runs.filter((r) => r.engine === lane);
  const pts = lr.filter((r) => typeof r.received?.raw === 'number').map((r) => [r.received.raw, r.after]);
  const recv = pts.map((p) => p[0]);
  const dist = lr.map((r) => r.after);
  const rho = spearman(pts.map((p) => p[0]), pts.map((p) => p[1]));
  md.push(`| ${lane} | ${lr.length} | ${med(recv) ?? '–'} [${recv.length ? Math.min(...recv) : '–'}–${recv.length ? Math.max(...recv) : '–'}] | ${med(dist)} [${Math.min(...dist)}–${Math.max(...dist)}] | ${dist.filter((d) => d >= mean).length}/${lr.length} | ${rho === null ? '–' : rho.toFixed(2)} |`);
  const ox = (n % 4) * (W + 16), oy = Math.floor(n / 4) * (H + 16);
  const sx = (v) => ox + PAD.l + (v / xMax) * (W - PAD.l - PAD.r);
  const sy = (v) => oy + H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b);
  const g = [`<g><text x="${ox + PAD.l}" y="${oy + 16}" class="t">${lane}</text>`];
  for (const v of [0, 50, 100, 150]) g.push(`<line x1="${sx(0)}" x2="${sx(xMax)}" y1="${sy(v)}" y2="${sy(v)}" class="grid"/><text x="${ox + PAD.l - 4}" y="${sy(v) + 3}" class="a" text-anchor="end">${v}</text>`);
  for (const v of [0, 20, 40, 60]) if (v <= xMax) g.push(`<text x="${sx(v)}" y="${oy + H - PAD.b + 12}" class="a" text-anchor="middle">${v}</text>`);
  g.push(`<line x1="${sx(0)}" x2="${sx(xMax)}" y1="${sy(mean)}" y2="${sy(mean)}" class="ref"/>`);
  for (const [x, y] of pts) g.push(`<circle cx="${sx(x).toFixed(1)}" cy="${sy(y).toFixed(1)}" r="4" class="dot"><title>${lane}: ${x} received, ${y} px</title></circle>`);
  g.push('</g>');
  panels.push(g.join(''));
});
const rowsN = Math.ceil(lanes.length / 4);
const svgW = 4 * (W + 16), svgH = rowsN * (H + 16) + 30;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" font-family="sans-serif">
<style>.t{font-size:12px;fill:#0b0b0b;font-weight:600}.a{font-size:10px;fill:#52514e}.grid{stroke:#e4e3df;stroke-width:1}.ref{stroke:#52514e;stroke-width:1;stroke-dasharray:4 3}.dot{fill:#2a78d6;fill-opacity:.55;stroke:#fcfcfb;stroke-width:1}</style>
<rect width="100%" height="100%" fill="#fcfcfb"/>
${panels.join('\n')}
<text x="8" y="${svgH - 10}" class="a">${family} scrollbar thumb: x = motions the page received per drag, y = content distance (px); dashed: the pinned build's mean (${mean.toFixed(1)} px)</text>
</svg>
`;
writeFileSync(`${out}.svg`, svg);
writeFileSync(`${out}.md`, `${md.join('\n')}\n`);
console.log(md.join('\n'));
