// fix1-evidence.mjs <dir>...: the task 22 runs' prepare-faults rows written before the fix had their run's name
// replaced by the rule's aggregate (`run`); each is given back its run's name (the meta row's), the aggregate kept as
// `total`, and summary.md rendered again.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { writeSummary } from '/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/scripts/linux-engine-diff/report.mjs';

for (const dir of process.argv.slice(2)) {
  const path = join(dir, 'results.jsonl');
  const rows = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const name = rows.find((r) => r.kind === 'meta').run;
  let fixed = 0;
  const out = rows.map((r) => {
    if (r.kind !== 'prepare-faults' || typeof r.run === 'string') return r;
    fixed++;
    const { run: total, ...rest } = r;
    return { run: name, ...rest, total };
  });
  writeFileSync(path, `${out.map((r) => JSON.stringify(r)).join('\n')}\n`);
  writeSummary(dir);
  console.log(dir, 'fixed', fixed, 'object Object left:', readFileSync(join(dir, 'summary.md'), 'utf8').includes('object Object'));
}
