// task 128: a plan-of-parts run's parts, each judged by the given judge.  node judge-parts.mjs <judge> <results.jsonl>
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const j = await import(pathToFileURL(process.argv[2]).href);
const rows = readFileSync(process.argv[3], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
for (const part of [...new Set(rows.filter((r) => r.part !== undefined).map((r) => r.part))]) {
  const own = rows.filter((r) => r.part === part);
  const scene = own.find((r) => r.kind === 'drop-signal-scene');
  const d = own.filter((r) => r.kind === 'drop-signal');
  const v = j.dropSignalsVerdict({ families: [scene.family], plan: scene.plan }, own);
  console.log(JSON.stringify({ part, plan: scene.plan, family: scene.family, drags: d.length, failed: v.failed, landed: v.counts.landed, stale: v.counts.stale_drops, false_ok: v.counts.false_ok, untaken: v.counts.untaken, long_path: v.counts.long_path }));
}
