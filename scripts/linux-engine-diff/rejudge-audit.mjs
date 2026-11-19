// The route audits' foreign-window findings of a stored run judged again from what it kept (the M5 pre-flight's §8.1,
// point 4; #171 M5, task 106, rulings 858 and 863), display-free: each audit row's kept lifecycle projections
// (audit-traces.mjs) judged by this checkout's foreign-window judge (foreign.mjs `judgeForeign`, as a route audit)
// against the windows the run had registered then, beside the findings the row stored. Read-only. One JSON line per
// audit row whose findings moved or whose traces were not kept, then one per run with its counts and its end row's
// foreign failures: those of the route audits as re-judged now, the others (the harness's own trace, the record, the
// stub check) as stored. A run re-judges whole only when it has its end row and audit rows of one execution, and every
// audit row kept its projections; otherwise it is incomplete, and the exit is 1. A run is never an empty clear.
//
//   node scripts/linux-engine-diff/rejudge-audit.mjs <step dir or results.jsonl[.gz]>...

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { readKeptTraces } from './audit-traces.mjs';
import { foreignLine, judgeForeign } from './foreign.mjs';

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
 * Every audit row of the rows' runs, re-judged from its kept projections (`out`, the run's output directory, where they
 * lie): `[{run, rows: [...], moved, unkept, incomplete, foreign: {stored, now}}]`. A row's `now` is null where its
 * projections were not kept, or are not its run's; `incomplete` says why a run cannot be re-judged whole, else null.
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
      const traces = readKeptTraces(out, r.kept_traces, run);
      const stored = r.foreign ?? [];
      if (!traces) return { engine: r.engine, scene: r.scene, op: r.op, stored, now: null, reason: r.kept_traces?.reason ?? (r.kept_traces ? "kept projections not readable as this run's" : 'nothing kept (a run before task 106)') };
      const { registered, root } = r.kept_traces;
      const now = traces.flatMap((t) => judgeForeign(t, { registered: new Set(registered), root, routeAudit: true }).foreign).map(foreignLine);
      return { engine: r.engine, scene: r.scene, op: r.op, stored, now, moved: JSON.stringify(stored) !== JSON.stringify(now.slice(0, 10)) };
    });
    const executions = new Set(audits.map((r) => r.kept_traces?.execution).filter(Boolean));
    const incomplete = !end ? 'no end row: the run did not finish, so its verdict is unknown' : !audits.length ? 'no audit row: nothing was audited to re-judge' : executions.size > 1 ? 'audit rows of more than one execution under one run name: none binds to the end row' : null;
    // the end row's foreign failures: an audited operation's re-judged where its projections were kept, the rest as stored
    const failures = (end?.failed ?? []).filter((f) => f.startsWith(FOREIGN_FAILURE));
    const rejudged = new Set(judged.filter((j) => j.now).map((j) => auditPrefix(j)));
    const standing = failures.filter((f) => ![...rejudged].some((p) => f.slice(FOREIGN_FAILURE.length).startsWith(p)));
    const now = [...standing, ...judged.filter((j) => j.now).flatMap((j) => j.now.map((line) => `${FOREIGN_FAILURE}${auditPrefix(j)}${line}`))];
    return { run, rows: judged, moved: judged.filter((j) => j.moved).length, unkept: judged.filter((j) => !j.now).length, incomplete, foreign: { stored: failures, now } };
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
    const runs = rejudgeAudits(rowsOf(file), dirname(file));
    if (!runs.length) {
      whole = false;
      process.stdout.write(`${JSON.stringify({ file, incomplete: 'no run in the results' })}\n`);
    }
    for (const r of runs) {
      for (const j of r.rows) if (j.moved || !j.now) process.stdout.write(`${JSON.stringify({ file, run: r.run, ...j })}\n`);
      if (r.unkept || r.incomplete) whole = false;
      process.stdout.write(`${JSON.stringify({ file, run: r.run, audits: r.rows.length, moved: r.moved, unkept: r.unkept, incomplete: r.incomplete, foreign_stored: r.foreign.stored.length, foreign_now: r.foreign.now })}\n`);
    }
  }
  return whole ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await main(process.argv.slice(2));
