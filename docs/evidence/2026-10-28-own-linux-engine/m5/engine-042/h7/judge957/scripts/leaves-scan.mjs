// task 128: the device scene's leaves cases in stored verdict runs: per file, lane and case, the samples and those
// whose drop counter rose (effect true: by ruling 957 a drop at a stale position), with their answers.
//   node leaves-scan.mjs <results.jsonl[.gz]>...
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const OPS = ['chrome_dnd_inzone_out_in_front_shared', 'chrome_dnd_long_left_in_front_shared'];
for (const f of process.argv.slice(2)) {
  const b = readFileSync(f);
  const text = (f.endsWith('.gz') ? gunzipSync(b) : b).toString('utf8');
  const by = {};
  for (const l of text.split('\n')) {
    if (!OPS.some((o) => l.includes(o))) continue;
    let r;
    try { r = JSON.parse(l); } catch { continue; }
    if (!OPS.includes(r.op) || r.kind === 'verdict' || typeof r.effect !== 'boolean') continue;
    const k = `${r.engine ?? r.lane ?? '?'} ${r.op}`;
    by[k] ??= { samples: 0, dropped: 0, ok_dropped: 0, which: [] };
    by[k].samples++;
    if (r.effect === true) {
      by[k].dropped++;
      if (r.ok) by[k].ok_dropped++;
      by[k].which.push(`${r.block}/${r.i}`);
    }
  }
  if (Object.keys(by).length) console.log(JSON.stringify({ file: f.replace(/.*\/m5\//, '').replace(/.*vm-rows\//, 'VM/'), ...by }));
}
