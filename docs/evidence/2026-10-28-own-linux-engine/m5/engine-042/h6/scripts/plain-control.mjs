// Task 121: each run's plain control under a checkout's canaryPlainControl (measured warm waits only)
//   node plain-control.mjs <repo> <results.jsonl>...
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, ...files] = process.argv.slice(2);
const { canaryPlainControl } = await import(pathToFileURL(join(repo, 'scripts/linux-engine-diff/device.mjs')).href);
for (const f of files) {
  const rows = readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === 'sample' && r.engine === 'cua' && r.op === 'chrome_select_nudged_shared');
  console.log(f.split('task121/')[1], JSON.stringify(canaryPlainControl(rows)));
}
