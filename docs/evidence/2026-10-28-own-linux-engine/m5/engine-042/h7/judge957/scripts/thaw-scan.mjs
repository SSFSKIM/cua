// task 128: every stored freeze record's stop and continue against its cell's thaw.  node thaw-scan.mjs <results files...>
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const out = {};
for (const f of process.argv.slice(2)) {
  const bytes = readFileSync(f);
  const text = (f.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8');
  for (const l of text.split('\n')) {
    if (!l.includes('"freeze"')) continue;
    let r;
    try { r = JSON.parse(l); } catch { continue; }
    const m = /^freeze-(\d+)$/.exec(r.cell ?? '');
    if (r.kind !== 'drop-signal' || !m || !r.freeze) continue;
    const to = Number(m[1]);
    const k = f;
    out[k] ??= { n: 0, skipped: 0, minStop: Infinity, maxStop: -Infinity, minContMinusThaw: Infinity, contBeforeStop: 0 };
    const o = out[k];
    o.n++;
    if (r.freeze.skipped) { o.skipped++; continue; }
    o.minStop = Math.min(o.minStop, r.freeze.stopped_ms);
    o.maxStop = Math.max(o.maxStop, r.freeze.stopped_ms);
    o.minContMinusThaw = Math.min(o.minContMinusThaw, r.freeze.continued_ms - to);
    if (!(r.freeze.continued_ms > r.freeze.stopped_ms)) o.contBeforeStop++;
  }
}
for (const [k, v] of Object.entries(out)) console.log(JSON.stringify({ file: k.split('/').slice(-4).join('/'), ...v }));
