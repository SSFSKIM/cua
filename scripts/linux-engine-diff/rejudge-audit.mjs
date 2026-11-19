// The route audits' foreign-window findings of a stored run judged again from the traces it kept (the M5 pre-flight's
// §8.1, point 4; #171 M5, task 106, ruling 858), display-free: each audit row's kept lifecycle traces
// (audit-traces.mjs) judged by this checkout's foreign-window judge (foreign.mjs `auditForeign`, as a route audit)
// against the windows the run had registered then, beside the findings the row stored. Read-only. One JSON line per
// audit row whose findings moved or whose traces were not kept, then one per run with its counts and its end row's
// foreign failures: those of the route audits as re-judged now, the others (the harness's own trace, the record, the
// stub check) as stored. A run re-judges whole only when every audit row kept its traces.
//
//   node scripts/linux-engine-diff/rejudge-audit.mjs <step dir or results.jsonl[.gz]>...

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { parseXtrace } from './audit.mjs';
import { readKeptTraces } from './audit-traces.mjs';
import { auditForeign, foreignLine } from './foreign.mjs';

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

/** The end row's prefix of an engine's foreign change (run.mjs: `engineForeign`, then the run's failures). */
const FOREIGN_FAILURE = 'a window the harness did not open was changed: ';
const auditPrefix = (r) => `${r.engine} on ${r.scene} ${r.op}: `;

/**
 * Every audit row of the rows' runs, re-judged from its kept traces (`out`, the run's output directory, where they lie):
 * `[{run, rows: [...], moved, unkept, foreign: {stored, now}}]`. A row's `now` is null where its traces were not kept.
 */
export function rejudgeAudits(rows, out) {
  const runs = new Map();
  for (const r of rows) {
    if (!runs.has(r.run)) runs.set(r.run, { audits: [], end: null });
    if (r.kind === 'audit') runs.get(r.run).audits.push(r);
    if (r.kind === 'end') runs.get(r.run).end = r;
  }
  return [...runs].map(([run, { audits, end }]) => {
    const judged = audits.map((r) => {
      const traces = readKeptTraces(out, r.kept_traces);
      const stored = r.foreign ?? [];
      if (!traces) return { engine: r.engine, scene: r.scene, op: r.op, stored, now: null, reason: r.kept_traces?.reason ?? 'no traces kept (a run before task 106)' };
      const { registered, root } = r.kept_traces;
      const now = traces.flatMap((t) => auditForeign(parseXtrace(t), { registered: new Set(registered), root, routeAudit: true }).foreign).map(foreignLine);
      return { engine: r.engine, scene: r.scene, op: r.op, stored, now, moved: JSON.stringify(stored) !== JSON.stringify(now.slice(0, 10)) };
    });
    // the end row's foreign failures: an audited operation's re-judged where its traces were kept, the rest as stored
    const failures = (end?.failed ?? []).filter((f) => f.startsWith(FOREIGN_FAILURE));
    const rejudged = new Set(judged.filter((j) => j.now).map((j) => auditPrefix(j)));
    const standing = failures.filter((f) => ![...rejudged].some((p) => f.slice(FOREIGN_FAILURE.length).startsWith(p)));
    const now = [...standing, ...judged.filter((j) => j.now).flatMap((j) => j.now.map((line) => `${FOREIGN_FAILURE}${auditPrefix(j)}${line}`))];
    return { run, rows: judged, moved: judged.filter((j) => j.moved).length, unkept: judged.filter((j) => !j.now).length, foreign: { stored: failures, now } };
  });
}

async function main(argv) {
  if (!argv.length) {
    process.stderr.write('usage: rejudge-audit.mjs <step dir or results.jsonl[.gz]>...\n');
    return 2;
  }
  let whole = true;
  for (const path of argv) {
    const file = resultsOf(resolve(path));
    for (const r of rejudgeAudits(rowsOf(file), dirname(file))) {
      for (const j of r.rows) if (j.moved || !j.now) process.stdout.write(`${JSON.stringify({ file, run: r.run, ...j })}\n`);
      if (r.unkept) whole = false;
      process.stdout.write(`${JSON.stringify({ file, run: r.run, audits: r.rows.length, moved: r.moved, unkept: r.unkept, foreign_stored: r.foreign.stored.length, foreign_now: r.foreign.now })}\n`);
    }
  }
  return whole ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await main(process.argv.slice(2));
