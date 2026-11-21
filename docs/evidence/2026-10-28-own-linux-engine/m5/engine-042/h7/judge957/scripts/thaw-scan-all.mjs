// task 128: find every stored results file under the given roots and scan its freeze records (thaw-scan.mjs).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
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
process.stdout.write(execFileSync(process.execPath, [new URL('./thaw-scan.mjs', import.meta.url).pathname, ...files], { encoding: 'utf8', maxBuffer: 1 << 26 }));
