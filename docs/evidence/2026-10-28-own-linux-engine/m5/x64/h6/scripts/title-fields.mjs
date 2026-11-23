#!/usr/bin/env node
// Task 123: the structural title scan's inventory (the controller's word, in place of the live title half on x64,
// whose :0 is the owner's display): every JSON key, in every JSON or JSONL file (gzipped too) under the given dirs,
// whose name can carry a window's title or name, with its count of values and of distinct values. Key names and
// counts only, never a value.
// usage: node title-fields.mjs <dir>...
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const KEY = /title|name|wm_?class|icon/i;
const files = [];
const walk = (d) => { for (const e of readdirSync(d)) { const p = join(d, e); const s = statSync(p); if (s.isDirectory()) walk(p); else if (s.isFile()) files.push(p); } };
for (const d of process.argv.slice(2)) walk(d);
const keys = new Map();
let parsed = 0, lines = 0, unparsed = 0;
const visit = (v, path) => {
  if (Array.isArray(v)) { for (const x of v) visit(x, path); return; }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (KEY.test(k) && (typeof x === 'string' || Array.isArray(x))) {
        const e = keys.get(k) ?? { n: 0, distinct: new Set(), parents: new Set() };
        for (const s of [x].flat()) if (typeof s === 'string') { e.n++; e.distinct.add(s); }
        e.parents.add(path.split('.').slice(-1)[0] || '(top)');
        keys.set(k, e);
      }
      visit(x, `${path}.${k}`);
    }
  }
};
for (const f of files) {
  let text;
  try { const b = readFileSync(f); text = (f.endsWith('.gz') ? gunzipSync(b) : b).toString('utf8'); } catch { continue; }
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!(t.startsWith('{') || t.startsWith('['))) continue;
    lines++;
    try { visit(JSON.parse(t), ''); parsed++; } catch { unparsed++; }
  }
  // a whole-file JSON document
  if (/\.json$/.test(f)) { try { visit(JSON.parse(text), ''); } catch {} }
}
console.log(`files ${files.length}, JSON lines ${lines} (parsed ${parsed}, not JSON ${unparsed})`);
for (const [k, e] of [...keys].sort((a, b) => b[1].n - a[1].n)) console.log(`${k}: ${e.n} values, ${e.distinct.size} distinct; under ${[...e.parents].slice(0, 6).join(', ')}`);
