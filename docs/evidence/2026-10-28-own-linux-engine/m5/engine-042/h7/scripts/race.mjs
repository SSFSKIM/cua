// Task 125: a t14-late run's rows against the race (ruling 954): per cell, the identification, the browser's press mark,
// the stop's start and the thaw, all ms after the send, and the band verdict.  node race.mjs <repo> <results.jsonl>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, file] = process.argv.slice(2);
const { dropSignalsVerdict } = await import(pathToFileURL(join(repo, 'scripts/linux-engine-diff/drop-signals-judge.mjs')).href);
const all = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rows = all.filter((r) => r.kind === 'drop-signal');
const by = new Map();
for (const r of rows) by.set(r.cell, [...(by.get(r.cell) ?? []), r]);
const q = (xs) => (xs.length ? `${Math.min(...xs).toFixed(1)} / ${xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)].toFixed(1)} / ${Math.max(...xs).toFixed(1)}` : '–');
console.log('| cell | n | identified | press marked (ms after send, min/median/max) | stop began | thawed | stopped before the press mark + 55 | skipped | landed | late takes | hold notice, no drop |');
console.log('|---|---:|---:|---|---|---|---:|---:|---:|---:|---:|');
for (const [cell, l] of by) {
  const f = l.map((r) => r.freeze ?? {});
  const early = f.filter((x) => typeof x.stopped_ms === 'number' && typeof x.press_ms === 'number' && x.stopped_ms < x.press_ms + 55 - 1).length;
  console.log(`| ${cell} | ${l.length} | ${l.filter((r) => r.hold?.adaptive?.source?.identified === true).length} | ${q(f.map((x) => x.press_ms).filter((x) => typeof x === 'number'))} | ${q(f.map((x) => x.stopped_ms).filter((x) => typeof x === 'number'))} | ${q(f.map((x) => x.continued_ms).filter((x) => typeof x === 'number'))} | ${early} | ${f.filter((x) => x.skipped).length} | ${l.filter((r) => r.outcome?.landed).length} | ${l.filter((r) => r.signals?.late_take).length} | ${l.filter((r) => r.reply_notice === 'the page may have started a drag that did not complete' && !r.outcome?.landed && !r.signals?.late_take).length} |`);
}
const v = dropSignalsVerdict({ families: ['chrome'], plan: 't14-late' }, all);
console.log('');
console.log(`verdict: ${v.failed.length ? `FAIL: ${v.failed.join('; ')}` : 'PASS'}; bands ${JSON.stringify(v.counts.bands)}; late ${v.counts.late}, reported ${v.counts.late_reported}; false ok ${v.counts.false_ok}; unjudged ${v.counts.unjudged}`);
