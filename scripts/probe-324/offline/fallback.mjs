// set_value's and select_text's focus on an unfocused field, per block and mode over every run given: delivered, the
// watch's raises inside and after the holds, the gap left unfrozen between the held activation's hold and the fallback
// click's, the total freeze and the answer's latency.
//   node scripts/probe-324/offline/fallback.mjs <dir>...
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
const files = [];
const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/^results-.*\.json$/.test(n)) files.push(p); } };
for (const d of process.argv.slice(2)) walk(d);
const q = (a, p) => { const s = a.filter(v => v != null).sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 10) / 10 : null; };
const by = new Map();
for (const f of files) for (const r of JSON.parse(readFileSync(f, 'utf8')).results) {
  if (!/^(sv|st)\//.test(r.cell ?? '') || /focused/.test(r.cell) || !r.steps?.length) continue;
  const s = r.steps[0];
  // run 42472740707's caret mode ran main's path (the patch gated press alone): counted by what the engine did.
  const mode = r.mode === 'caret' && s.events.some(e => e.ev === 'ff.click') ? 'main' : r.mode;
  const field = /notes|area/.test(r.cell) ? 'textarea' : 'text field';
  const k = `${r.block} | ${mode} | ${s.kind} ${field}`;
  if (!by.has(k)) by.set(k, []);
  const spans = s.read.holdSpans;
  by.get(k).push({ok: s.answer === 'success' && s.effect?.seen, inside: s.read.raisedInside, after: s.read.raisedAfter, raised: s.read.raised,
    gap: spans.length > 1 ? spans[1][0] - spans[0][1] : null, frozen: s.read.frozenMs, ms: s.ms, front: s.read.frontHeld, key: s.read.keyHeld, clicks: s.posted});
}
console.log('block | mode | method field: n delivered | raised (inside, after) | front key held | unfrozen gap ms med/max | freeze ms med/max | latency ms med/max');
for (const [k, v] of [...by].sort()) {
  const c = f => v.filter(f).length;
  console.log(`${k}: ${v.length} ${c(x => x.ok)} | ${c(x => x.raised)} (${c(x => x.inside)}, ${c(x => x.after)}) | ${c(x => x.front)} ${c(x => x.key)} | ${q(v.map(x => x.gap), .5)}/${q(v.map(x => x.gap), 1)} | ${q(v.map(x => x.frozen), .5)}/${q(v.map(x => x.frozen), 1)} | ${q(v.map(x => x.ms), .5)}/${q(v.map(x => x.ms), 1)}`);
}
