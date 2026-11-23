// Task 101: whether each drag that took or skipped a second rest was its block's cold first drag. usage: cold.mjs <dir>...
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

for (const dir of process.argv.slice(2)) {
  const rows = gunzipSync(readFileSync(`${dir}/results.jsonl.gz`)).toString().split('\n').filter(Boolean).flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  }).filter((r) => r.kind === 'drop-signal');
  const c = (r) => r.drop_cursor ?? r.handle?.drop_cursor;
  const rested = rows.filter((r) => ['taken', 'skipped'].includes(c(r)?.settle?.second_rest));
  console.log(dir, rested.length, rested.map((r) => `${r.lane} ${r.cell} #${r.i} cold=${r.cold}`).join('; '));
}
