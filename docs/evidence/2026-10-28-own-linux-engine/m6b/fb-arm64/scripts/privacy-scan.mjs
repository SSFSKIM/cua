// Task 109: read-only checks of the evidence to be committed (rulings 863, 874, 875), counts only, never a value.
// (1) Window titles from :0: the titles of :0's windows that are not the harness's (read live from :0 by the caller and
//     given on stdin, one a line, held in memory only), each counted in every file; a title shorter than 4 characters is
//     not looked for. (2) Key codes: rows whose held-release samples or findings name a code (task 106's
//     count-held-codes.mjs pattern), and minimized rows whose hold/release events carry a raw numeric `detail` or whose
//     keys_held/keys_before/keys_down are lists of codes rather than counts. Prints per-file counts and totals.
// usage: <titles> | node privacy-scan.mjs <dir>...
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const titles = readFileSync(0, 'utf8').split('\n').map((t) => t.trim()).filter((t) => t.length >= 4);
const CODE = /"(?:key|button) \d+"|(?:Key|Button)(?:Press|Release) \d+|never sent (?:key|button) \d+|KeyRelease \d+/;
const files = [];
const walk = (d) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (s.isFile()) files.push(p);
  }
};
for (const d of process.argv.slice(2)) walk(d);
const rawCodes = (r) => {
  let n = 0;
  for (const k of ['hold_events', 'release_events']) for (const e of Array.isArray(r[k]) ? r[k] : []) if (/^(Key|Button)/.test(e?.type ?? '') && typeof e.detail === 'number') n++;
  for (const k of ['keys_held', 'keys_before', 'keys_down']) if (Array.isArray(r[k]) && r[k].some((v) => typeof v === 'number')) n++;
  return n;
};
const total = { files: 0, title_hits: 0, held_code_rows: 0, minimized_raw_codes: 0 };
for (const f of files) {
  let text;
  try {
    const b = readFileSync(f);
    text = (f.endsWith('.gz') ? gunzipSync(b) : b).toString('utf8');
  } catch {
    continue;
  }
  total.files++;
  let th = 0;
  for (const t of titles) th += text.split(t).length - 1;
  let held = 0;
  let mini = 0;
  for (const line of text.split('\n')) {
    if ((line.includes('"held"') || line.includes('forbidden')) && CODE.test(line)) held++;
    if (line.startsWith('{') && /minimized/.test(line)) {
      try {
        mini += rawCodes(JSON.parse(line));
      } catch {}
    }
  }
  if (th || held || mini) console.log(`${f}: title_hits ${th}, held_code_rows ${held}, minimized_raw_codes ${mini}`);
  total.title_hits += th;
  total.held_code_rows += held;
  total.minimized_raw_codes += mini;
}
console.log(`titles looked for: ${titles.length}; ${JSON.stringify(total)}`);
process.exit(total.title_hits || total.held_code_rows || total.minimized_raw_codes ? 1 : 0);
