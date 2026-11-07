// An events run's differences for one scenario (by regex), per engine.
// usage: node scenario-diffs.mjs <results.jsonl> <regex>
import { readFileSync } from 'node:fs';

const [file, pattern] = process.argv.slice(2);
for (const line of readFileSync(file, 'utf8').trim().split('\n')) {
  const r = JSON.parse(line);
  if (r.kind === 'events' && new RegExp(pattern, 'i').test(r.scenario)) console.log(r.run, r.scenario, JSON.stringify(r.differences).slice(0, 400));
}
