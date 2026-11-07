#!/usr/bin/env node
// Per series of a settle sitting: its runs, how many took effect, came late, were answered success with no effect
// ever (lost and success-misreported: the answer said it was done, and it never showed), and were refused (an
// answer was an error; the refusals this route sends say nothing was sent), with each refusal's sentence.
// usage: series-table.mjs <results.jsonl[.gz]>...
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const rows = process.argv.slice(2).flatMap((f) => {
  const raw = readFileSync(f);
  return (f.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
});
const series = new Map();
for (const r of rows.filter((r) => r.kind === 'settle-run')) {
  const key = `${r.cell} (${r.lane}, load ${r.load})`;
  if (!series.has(key)) series.set(key, []);
  series.get(key).push(r);
}
console.log('| series | runs | took effect | late | lost, answered success | refused | prepared wrong |');
console.log('|---|---:|---:|---:|---:|---:|---:|');
const why = new Map();
for (const [key, runs] of series) {
  const refused = runs.filter((r) => r.answers?.some((a) => !a.ok));
  for (const r of refused) for (const a of r.answers.filter((a) => !a.ok)) why.set(a.error, (why.get(a.error) ?? 0) + 1);
  const prepared = runs.filter((r) => r.error);
  const ok = runs.filter((r) => r.answers?.every((a) => a.ok));
  const landed = ok.filter((r) => r.landed);
  const late = ok.filter((r) => !r.landed && r.late_ms !== null && r.late_ms !== undefined);
  const lost = ok.filter((r) => !r.landed && (r.late_ms === null || r.late_ms === undefined));
  console.log(`| ${key} | ${runs.length} | ${landed.length} | ${late.length} | ${lost.length ? `**${lost.length}**` : 0} | ${refused.length} | ${prepared.length} |`);
}
if (why.size) {
  console.log('\nRefusals:');
  for (const [sentence, n] of why) console.log(`- ${n} × ${sentence}`);
}
