// Task 71's fix wave: a manifest run's recorded rows (results.jsonl, `pointer-route-run`) judged again by the judge as
// it is now (predicates.mjs `judgeCase`), per case and lane: valid runs, missed parks, unread effects, and each
// answer beside its observed effect. A run whose failed request was never read (before the fix wave, click, scroll and
// move) carries `took: false` with `after: null`; it is reported as unread here, not as no effect.
// usage: node rejudge.mjs <harness dir> <results.jsonl>...
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [harness, ...files] = process.argv.slice(2);
const { PREDICATE_CASES, judgeCase, caseKey } = await import(pathToFileURL(`${harness}/scripts/linux-engine-diff/predicates.mjs`).href);
const rows = files.flatMap((f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).filter((r) => r.kind === 'pointer-route-run');
// a failed request's effect never read: after null and not a drag's own read
const unread = (r) => (r.ok !== true && r.after == null && r.input !== 'select' ? { ...r, took: null } : r);
for (const c of PREDICATE_CASES) {
  const own = rows.filter((r) => r.case === caseKey(c)).map(unread);
  if (!own.length) continue;
  const row = judgeCase(c, own);
  const lanes = Object.entries(row.counts).map(([lane, n]) => `${lane} ${JSON.stringify(n)}`).join(' ');
  console.log(`${caseKey(c)} [${c.expect}] ${row.pass ? 'PASS' : `FAIL ${row.failed.join(', ')}`} :: ${lanes}`);
}
