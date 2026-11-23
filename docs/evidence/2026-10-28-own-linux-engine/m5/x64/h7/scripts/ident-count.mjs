#!/usr/bin/env node
// Task 123, ruling 954: the adaptive hold's identification outcome in every Chrome drag row of the given step
// directories (`hold.adaptive.source`: `identified`, and `by` or the cause when not). Freeze cells (`freeze-…`) are
// counted apart. Per step, load and outcome: the count, and per unidentified cause its count.
// A hold record whose `adaptive` is null (no adaptive hold ran for it: a take on the path, a source not Chrome, or a
// measurement lane) is counted apart, as no identification recorded.
// Read-only. usage: node ident-count.mjs <step dir>...
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { gunzipSync } from 'node:zlib';

for (const dir of process.argv.slice(2)) {
  const f = ['run/results.jsonl', 'run/results.jsonl.gz'].map((p) => join(dir, p)).find(existsSync);
  if (!f) { console.log(`${basename(dir)}: no results`); continue; }
  const raw = readFileSync(f);
  const rows = (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const tally = new Map();
  const add = (k) => tally.set(k, (tally.get(k) ?? 0) + 1);
  for (const r of rows) {
    const cell = r.cell ?? r.op ?? '';
    const freeze = /^freeze-/.test(String(cell));
    // every adaptive-hold record the row carries (a drop-signal row has one; a device row, one per sample)
    const found = [];
    const visit = (v) => {
      if (Array.isArray(v)) return v.forEach(visit);
      if (v && typeof v === 'object') {
        if (v.adaptive && typeof v.adaptive === 'object' && v.adaptive.source && 'identified' in v.adaptive.source) found.push(v.adaptive);
        else if ('adaptive' in v && v.adaptive === null && 'bound_ms' in v) found.push(null);
        for (const x of Object.values(v)) visit(x);
      }
    };
    visit(r);
    for (const a of found) {
      if (a === null) { add(`${r.load ?? '-'} | ${freeze ? 'freeze' : 'non-freeze'} | adaptive null: no identification recorded for this hold`); continue; }
      const s = a.source;
      const cause = s.identified ? `identified by: ${String(s.by ?? '').slice(0, 110)}` : `unidentified: ${String(s.why ?? s.by ?? a.why ?? 'no cause given').slice(0, 160)}`;
      add(`${r.load ?? '-'} | ${freeze ? 'freeze' : 'non-freeze'} | ${cause}`);
    }
  }
  console.log(`== ${basename(dir)}`);
  for (const [k, n] of [...tally].sort()) console.log(`  ${n} | ${k}`);
}
