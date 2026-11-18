// The text windows a lane ended, as a stored verdict run recorded them, judged again by this checkout's judge
// (scene-ended.mjs `judgeSceneEnds`, with the vendor builds' declared ends of M5's T4 arm64 round; the pre-flight's §8.1,
// point 4), display-free from the run's own rows: each run's `text-scene-ends` row beside the re-judge of its
// `scene-ended` and `scene-lost` rows, the builds read from its meta row. Read-only. One JSON line per run: whether the
// stored counts and pass stand, and the vendor ends declared and undeclared now (neither fails a step).
//
//   node scripts/linux-engine-diff/rejudge-scene-ends.mjs <step dir or results.jsonl[.gz]>...

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { judgeSceneEnds } from './scene-ended.mjs';

/** A step's results file: the path given, or its `run/results.jsonl` (or `.gz`), or its own `results.jsonl`. */
function resultsOf(path) {
  if (!statSync(path).isDirectory()) return path;
  for (const p of ['run/results.jsonl', 'run/results.jsonl.gz', 'results.jsonl', 'results.jsonl.gz']) if (existsSync(join(path, p))) return join(path, p);
  throw new Error(`${path}: no results.jsonl`);
}

const rowsOf = (file) => {
  const bytes = readFileSync(file);
  return (file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
};

/** Each run of the rows that counted its text windows' ends, re-judged: `[{run, stored, now, stands}]`. */
export function rejudgeSceneEnds(rows) {
  const out = [];
  for (const run of [...new Set(rows.map((r) => r.run))]) {
    const own = rows.filter((r) => r.run === run);
    const stored = own.findLast((r) => r.kind === 'text-scene-ends');
    if (!stored) continue;
    const meta = own.find((r) => r.kind === 'meta');
    const builds = Object.fromEntries((meta?.engines ?? []).map((e) => [e.label, e.sha256]));
    const lanes = Object.keys(stored.lanes);
    const vendors = (meta?.engines ?? []).map((e) => e.label).filter((l) => ['pinned', 'newest'].includes(l));
    const now = judgeSceneEnds(own, lanes, vendors, { builds });
    const stands = JSON.stringify(now.lanes) === JSON.stringify(stored.lanes) && now.pass === stored.pass && JSON.stringify(now.reasons) === JSON.stringify(stored.reasons);
    out.push({ run, stored: { lanes: stored.lanes, pass: stored.pass }, now: { lanes: now.lanes, pass: now.pass, vendor: now.vendor }, stands });
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let moved = false;
  for (const path of process.argv.slice(2)) {
    for (const r of rejudgeSceneEnds(rowsOf(resultsOf(path)))) {
      process.stdout.write(`${JSON.stringify({ path, ...r })}\n`);
      moved ||= !r.stands;
    }
  }
  process.exitCode = moved ? 1 : 0;
}
