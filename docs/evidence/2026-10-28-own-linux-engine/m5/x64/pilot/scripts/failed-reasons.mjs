// Task 87: a pilot step's "Incomplete or failed" reasons, split into the expected one of a pilot (a series too short for
// its rule) and every other, which is a candidate finding.
// usage: node failed-reasons.mjs <step dir>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const text = readFileSync(join(process.argv[2], 'stdout.log'), 'utf8');
const line = text.split('\n').find((l) => l.startsWith('**Incomplete or failed:**'));
if (!line) {
  console.log('no "Incomplete or failed" line');
  process.exit(0);
}
const reasons = line.replace('**Incomplete or failed:** ', '').split('; ');
const short = reasons.filter((r) => /a development series of \d+, not the \d+ the \w+ needs/.test(r));
const other = reasons.filter((r) => !short.includes(r));
console.log(`reasons ${reasons.length}: too short ${short.length}, other ${other.length}`);
for (const r of other) console.log(`  OTHER: ${r.slice(0, 400)}`);
