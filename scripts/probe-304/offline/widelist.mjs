// widelist.mjs <run-dir> [--diag]: per coverage page (the -diag groups with --diag, else the others), each head's median
// widthMs, and B's median wideLists, wideListFrames, wideListMs and frameReads over its timed observations, with B's
// live price per frame read (the median of wideListMs / wideListFrames per observation).
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
const dir = process.argv[2];
const diag = process.argv.includes('--diag');
const med = xs => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : null; };
const f1 = v => v == null ? '-' : Math.round(v * 10) / 10;
const acc = new Map();
for (const d of readdirSync(dir).sort()) {
  const f = join(dir, d, 'results.json');
  if (!existsSync(f)) continue;
  const j = JSON.parse(readFileSync(f, 'utf8'));
  if (!('aCommit' in j.config) || j.config.group.endsWith('-diag') !== diag) continue;
  const app = j.config.group.startsWith('safari') ? 'safari' : 'chrome';
  for (const r of j.results ?? []) for (const s of r.slots ?? []) {
    if (!s.obs) continue;
    const k = `${app}/${r.target}`;
    if (!acc.has(k)) acc.set(k, {a: [], b: []});
    acc.get(k)[s.head].push(s.obs.timings ?? {});
  }
}
console.log('| page | A widthMs | B widthMs | B wideLists | B wideListFrames | B wideListMs | B ms per frame | A frameReads | B frameReads |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const [k, v] of acc) {
  const m = (h, key) => med(v[h].map(t => t[key]));
  const price = med(v.b.map(t => t.wideListFrames ? t.wideListMs / t.wideListFrames : NaN));
  console.log(`| ${k} | ${f1(m('a', 'widthMs'))} | ${f1(m('b', 'widthMs'))} | ${f1(m('b', 'wideLists'))} | ${f1(m('b', 'wideListFrames'))} | ${f1(m('b', 'wideListMs'))} | ${price == null ? '-' : price.toFixed(3)} | ${f1(m('a', 'frameReads'))} | ${f1(m('b', 'frameReads'))} |`);
}
