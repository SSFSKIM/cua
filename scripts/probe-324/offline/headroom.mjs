// For every raise the watch saw inside a hold: when it began after the action's events (dlv.post, else the activation),
// and how long before the frozen span's end the order read back (the headroom the hold had), per block, mode and step.
//   node scripts/probe-324/offline/headroom.mjs <dir>...
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
const files = [];
const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/^results-.*\.json$/.test(n)) files.push(p); } };
for (const d of process.argv.slice(2)) walk(d);
const by = new Map();
for (const f of files) for (const r of JSON.parse(readFileSync(f, 'utf8')).results) (r.steps ?? []).forEach((s, i) => {
  const k = `${r.block} | ${r.mode} | ${r.block === 'residue' ? r.cell.replace(/#\d+$/, '') : r.cell} | ${i}:${s.kind}`;
  if (!by.has(k)) by.set(k, {n: 0, raises: [], outlived: []});
  const g = by.get(k); g.n += 1;
  if (s.record.delivery?.transientRaise?.outlivedHold) g.outlived.push(`${r.label} visible=${s.read.visibleMs} byCall=${s.read.visibleMsByCall ?? '-'} trace=${JSON.stringify(s.read.trace)} holds=${JSON.stringify(s.read.holdSpans)}`);
  const tr = s.read.trace, spans = s.read.holdSpans;
  const post = s.events.find(e => e.ev === 'dlv.post')?.t ?? s.events.find(e => e.ev === 'act')?.t;
  for (let j = 0; j < tr.length; j++) {
    if (!tr[j][1]) continue;
    const start = tr[j][0], end = tr[j + 1]?.[0] ?? null;
    const span = spans.find(sp => sp[0] <= start && sp[1] > start);
    g.raises.push({at: post != null ? start - post : null, dur: end != null ? end - start : null, headroom: span && end != null ? span[1] - end : null});
  }
});
const q = (a, p) => { const s = a.filter(v => v != null).sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 10) / 10 : null; };
console.log('block | mode | cell | step: n raises | raise starts after events min/med/max | lasts med/max | headroom before release min/p10/med');
for (const [k, g] of [...by].sort()) {
  if (!g.raises.length && !g.outlived.length) continue;
  const a = g.raises.map(x => x.at), d = g.raises.map(x => x.dur), h = g.raises.map(x => x.headroom);
  console.log(`${k}: ${g.n} ${g.raises.length} | ${q(a, 0)}/${q(a, .5)}/${q(a, 1)} | ${q(d, .5)}/${q(d, 1)} | ${q(h, 0)}/${q(h, .1)}/${q(h, .5)}`);
  for (const o of g.outlived) console.log(`    transientRaise.outlivedHold: ${o}`);
}
