#!/usr/bin/env node
// Task 121: drop-signals runs judged again by a checkout's judge (drop-signals-judge.mjs `dropSignalsVerdict`), from
// their stored rows: the verdict's fails and its counts, beside the stored summary's line.
//   node rejudge-drops.mjs <repo> <plan> <results.jsonl[.gz]>...
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const [repo, plan, ...files] = process.argv.slice(2);
const { dropSignalsVerdict } = await import(pathToFileURL(join(repo, 'scripts/linux-engine-diff/drop-signals-judge.mjs')).href);
for (const f of files) {
  const raw = readFileSync(f);
  const text = f.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
  const rows = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const v = dropSignalsVerdict({ families: ['chrome'], plan }, rows);
  const { bands, late, late_reported, false_ok, false_alarms } = v.counts;
  console.log(JSON.stringify({ file: f, judge: v.judge, pass: v.failed.length === 0, failed: v.failed, bands, late, late_reported, false_ok, false_alarms }));
}
