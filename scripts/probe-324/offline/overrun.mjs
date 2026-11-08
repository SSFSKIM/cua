// Per directory and head: the delivery's logged span to SLSReenableUpdate's call and to its return, each against the
// record's screenHoldMs (the spike's "release runs late"), and B's frozenMs against the span to the call.
//   node scripts/probe-324/offline/overrun.mjs <dir>...
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
const q = (a, p) => { const s = a.filter(v => v != null && Number.isFinite(v)).sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 10) / 10 : '-'; };
const d3 = a => `${q(a, .5)}/${q(a, .9)}/${q(a, 1)}`;
for (const dir of process.argv.slice(2)) {
  const files = [];
  const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/^results-.*\.json$/.test(n)) files.push(p); } };
  walk(dir);
  const by = {};
  for (const f of files) for (const r of JSON.parse(readFileSync(f, 'utf8')).results) for (const s of r.steps ?? []) {
    const d = s.record.delivery, post = s.events.find(e => e.ev === 'dlv.post');
    if (!d || !post) continue;
    let i = -1; s.read.holdSpans.forEach((sp, k) => { if (sp[0] <= post.t + 0.5) i = k; });
    if (i < 0) continue;
    const call = s.read.holdSpansByCall[i][1] - s.read.holdSpansByCall[i][0], ret = s.read.holdSpans[i][1] - s.read.holdSpans[i][0];
    (by[r.mode] ??= []).push({call: call - d.screenHoldMs, ret: ret - d.screenHoldMs, frozen: d.frozenMs != null ? d.frozenMs - call : null});
  }
  for (const [h, v] of Object.entries(by)) console.log(`${dir} ${h}: n ${v.length} | call span - screenHoldMs p50/p90/max ${d3(v.map(x => x.call))} | return span - screenHoldMs ${d3(v.map(x => x.ret))} | frozenMs - call span ${d3(v.map(x => x.frozen))}`);
}
