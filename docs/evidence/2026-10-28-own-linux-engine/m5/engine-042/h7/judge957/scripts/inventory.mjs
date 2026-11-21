// task 128: every stored results file under the roots with drop-signals runs or device-chrome-dnd drop verdicts.
//   node inventory.mjs <root>...
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
const files = [];
const walk = (d) => {
  let names;
  try { names = readdirSync(d); } catch { return; }
  for (const n of names) {
    const p = join(d, n);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p);
    else if (/^results\.jsonl(\.gz)?$/.test(n)) files.push(p);
  }
};
for (const root of process.argv.slice(2)) walk(root);
for (const f of files) {
  let text;
  try {
    const b = readFileSync(f);
    text = (f.endsWith('.gz') ? gunzipSync(b) : b).toString('utf8');
  } catch { continue; }
  const metas = [];
  let leaves = 0;
  for (const l of text.split('\n')) {
    if (l.includes('"kind":"meta"') && l.includes('"experiment":"drop-signals"')) {
      try { const r = JSON.parse(l); metas.push(`${r.run}:${(r.families ?? []).join(',') || 'chrome'}:${r.plan}`); } catch {}
    }
    if (l.includes('chrome_dnd_long_left_in_front_shared') || l.includes('chrome_dnd_inzone_out_in_front_shared')) leaves++;
  }
  if (metas.length || leaves) console.log(`${f}\t${metas.join(' ') || '-'}\tleaves-lines=${leaves}`);
}
