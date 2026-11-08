// The real freeze (the hold log's SLSDisableUpdate to SLSReenableUpdate) against the record's screenHoldMs, and the
// release's lag after the engine asked for it (dlv.end or the cap), per block and mode.
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
const files = [];
const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/^results-.*\.json$/.test(n)) files.push(p); } };
for (const d of process.argv.slice(2)) walk(d);
const by = new Map();
for (const f of files) for (const r of JSON.parse(readFileSync(f, 'utf8')).results) for (const s of r.steps ?? []) {
  const d = s.record.delivery; if (!d) continue;
  const spans = s.read.holdSpans; const last = spans[spans.length - 1]; if (!last) continue;
  const real = last[1] - last[0];
  const post = s.events.find(e => e.ev === 'dlv.post'), end = s.events.find(e => e.ev === 'dlv.end');
  const asked = end && post ? Math.min(end.t, last[0] + (post.capMs ?? 200)) : null;
  const k = `${r.block} ${r.mode}`;
  if (!by.has(k)) by.set(k, []);
  by.get(k).push({over: real - d.screenHoldMs, lag: asked != null ? last[1] - asked : null, capped: d.capped, real, label: r.label});
}
const q = (a, p) => { const s = a.filter(v => v != null).sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 10) / 10 : null; };
for (const [k, v] of by) {
  console.log(k, 'n', v.length, '| real-minus-screenHoldMs p50/p90/p99/max', q(v.map(x => x.over), .5), q(v.map(x => x.over), .9), q(v.map(x => x.over), .99), q(v.map(x => x.over), 1),
    '| release lag after asked p50/p90/max', q(v.map(x => x.lag), .5), q(v.map(x => x.lag), .9), q(v.map(x => x.lag), 1),
    '| real freeze p50/p95/max', q(v.map(x => x.real), .5), q(v.map(x => x.real), .95), q(v.map(x => x.real), 1), '| over 250 ms:', v.filter(x => x.real > 250).length);
}
