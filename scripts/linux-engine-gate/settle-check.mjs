#!/usr/bin/env node
// Ruling 827's condition, checked per step (#171 M5, task 103): whether the settle's branch ran in each named step,
// from the step's settle-counts.json (scripts/linux-engine-diff/settle-counts.mjs). Each step reads `not taken` (every
// cua engine recorded its counter at zero), `TAKEN` (the step reruns as class A), or `unknown` (a record or an engine's
// counter missing, which is never read as not taken).
//
//   node scripts/linux-engine-gate/settle-check.mjs <step dir>...
//
// A step directory is gate.mjs's `<step>.<label>` (its record is in `run/`) or a harness out directory. Exits 0 only
// when every named step shows the branch not taken, 1 otherwise, 2 when no step is named.

import { checkSteps } from '../linux-engine-diff/settle-counts.mjs';

const dirs = process.argv.slice(2);
if (!dirs.length) {
  process.stderr.write('usage: settle-check.mjs <step dir>...\n');
  process.exit(2);
}
const { lines, code } = checkSteps(dirs);
process.stdout.write(`${lines.join('\n')}\n`);
process.exit(code);
