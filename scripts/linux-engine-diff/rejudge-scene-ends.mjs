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

/**
 * Each run of the rows re-judged: `[{run, stored, now, stands}]` for a run that counted its text windows' ends, and
 * `{run, incomplete, now, stands: null}` for one with ends but no count (it stopped before its end: the arm64 pilot's
 * V1), judged from its own rows, never taken as standing. A run with neither is not listed.
 */
export function rejudgeSceneEnds(rows) {
  const out = [];
  for (const run of [...new Set(rows.map((r) => r.run))]) {
    const own = rows.filter((r) => r.run === run);
    const stored = own.findLast((r) => r.kind === 'text-scene-ends');
    const ends = own.some((r) => r.kind === 'scene-ended' || r.kind === 'scene-lost');
    if (!stored && !ends) continue;
    const meta = own.find((r) => r.kind === 'meta');
    const builds = Object.fromEntries((meta?.engines ?? []).map((e) => [e.label, e.sha256]));
    const engines = (meta?.engines ?? []).map((e) => e.label);
    const lanes = stored ? Object.keys(stored.lanes) : engines;
    const vendors = engines.filter((l) => ['pinned', 'newest'].includes(l));
    const now = judgeSceneEnds(own, lanes, vendors, { builds });
    if (!stored) {
      out.push({ run, incomplete: 'no text-scene-ends row: the run stopped before it counted its ends, so nothing stored is re-judged; its ends are judged from its own rows', now: { lanes: now.lanes, pass: now.pass, vendor: now.vendor }, stands: null });
      continue;
    }
    const stands = JSON.stringify(now.lanes) === JSON.stringify(stored.lanes) && now.pass === stored.pass && JSON.stringify(now.reasons) === JSON.stringify(stored.reasons);
    out.push({ run, stored: { lanes: stored.lanes, pass: stored.pass }, now: { lanes: now.lanes, pass: now.pass, vendor: now.vendor }, stands });
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // exit 0 only when at least one run was checked and every one stands; an incomplete run is never a pass
  let moved = false;
  let checked = 0;
  for (const path of process.argv.slice(2)) {
    const runs = rejudgeSceneEnds(rowsOf(resultsOf(path)));
    if (!runs.length) process.stdout.write(`${JSON.stringify({ path, incomplete: 'no run here counted or recorded its text windows\' ends: nothing was checked' })}\n`);
    for (const r of runs) {
      process.stdout.write(`${JSON.stringify({ path, ...r })}\n`);
      checked += 1;
      moved ||= r.stands !== true;
    }
  }
  process.exitCode = moved || checked === 0 ? 1 : 0;
}
