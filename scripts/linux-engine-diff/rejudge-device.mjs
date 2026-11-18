// The device cases' verdicts of a stored verdict run judged again (the M5 pre-flight's §8.1, point 4: a fix to a judge
// alone re-judges the stored rows of the steps it reaches), display-free from the run's own rows: each device verdict
// by this checkout's judge (device.mjs `judgeDevice`) over the cua samples and the audit the run recorded for it,
// beside the stored verdict, and beside a former judge's where one is named (`--old`, a device.mjs of the head the run
// ran at, which must reproduce every stored verdict for the replay to stand). Read-only. One JSON line per verdict that
// moved or failed, then one per run with its counts, the verdicts that moved, those failing now, the run's end record's
// other failures (which stand as stored), and how each sample of ruling 823's cells reads under it (premise.mjs
// `classifyPremise`, by class: `unmet` the excluded, `unshown` those whose records cannot show it either way).
//
//   node scripts/linux-engine-diff/rejudge-device.mjs [--old <device.mjs>] <step dir or results.jsonl[.gz]>...

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { PREMISE_OPS, judgeDevice } from './device.mjs';
import { adjacency, bindAudit, classifyPremise, evidenceLabel } from './premise.mjs';

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

/** The audit as run.mjs hands it to the judge, from its stored row; none where the operation was not audited. */
const auditOf = (a) => a && { clean: a.clean, kind: a.audit, oks: a.oks, answered: a.answered, forbidden: (a.forbidden ?? []).map((f) => f?.what ?? f), lifecycles: a.lifecycles ?? 1 };

/** A step's evidence of ruling 823 (`run/premise-evidence.jsonl` beside its results), or null where it kept none. */
export function evidenceOf(path) {
  const dir = statSync(path).isDirectory() ? path : dirname(path);
  const file = ['run/premise-evidence.jsonl', 'premise-evidence.jsonl'].map((p) => join(dir, p)).find(existsSync);
  return file ? rowsOf(file) : null;
}

const outcome = (judged) => ({ verdict: judged.pass ? 'pass' : 'fail', reasons: judged.reasons });
const same = (a, b) => a.verdict === b.verdict && JSON.stringify(a.reasons) === JSON.stringify(b.reasons);

/** How many of `entries` read as each of ruling 823's classes, by its one adjacency rule (premise.mjs `adjacency`). */
const classes = (entries) => {
  const next = adjacency(entries);
  const out = {};
  for (const e of entries) {
    const c = classifyPremise(e, next(e));
    out[c] = (out[c] ?? 0) + 1;
  }
  return out;
};

/** Every device verdict of the rows' runs, re-judged: `[{run, verdicts: [...], moved, failing, unreproduced, others}]`. */
export function rejudgeDevice(rows, { judge = judgeDevice, old = null, lines = null } = {}) {
  const out = [];
  for (const run of [...new Set(rows.map((r) => r.run))]) {
    const own = rows.filter((r) => r.run === run);
    const samples = own.filter((r) => r.kind === 'sample' && r.engine === 'cua');
    const verdicts = [];
    for (const v of own.filter((r) => r.kind === 'verdict' && r.device && r.candidate === 'cua')) {
      const opRows = samples.filter((r) => r.scene === v.scene && r.op === v.op);
      const audit = auditOf(own.find((r) => r.kind === 'audit' && r.engine === 'cua' && r.scene === v.scene && r.op === v.op));
      const stored = { verdict: v.verdict ?? (v.pass ? 'pass' : 'fail'), reasons: v.reasons ?? [] };
      // a cell of ruling 823's: its audit bound to the run's evidence, where the step kept it (premise.mjs)
      const auditRow = own.find((r) => r.kind === 'audit' && r.engine === 'cua' && r.scene === v.scene && r.op === v.op);
      const window = Array.isArray(auditRow?.ancestry) && Number.isInteger(auditRow.ancestry[0]) ? auditRow.ancestry[0] : null;
      const bound = PREMISE_OPS.has(v.op) && audit ? bindAudit(audit, lines, { run, scene: v.scene, op: v.op, window, label: evidenceLabel(opRows) }) : null;
      const now = outcome(bound ? judge(v.op, opRows, audit, bound) : judge(v.op, opRows, audit));
      const then = old ? outcome(old(v.op, opRows, audit)) : null;
      // and how its timed samples and its audited requests read under it
      const premise = PREMISE_OPS.has(v.op) ? { timed: classes(opRows), audit: bound ? classes(bound.entries) : null } : null;
      verdicts.push({ name: `${v.scene} ${v.op} cua`, samples: opRows.length, stored, ...(then ? { then, reproduced: same(then, stored) } : {}), now, moved: !same(now, stored), ...(premise ? { premise } : {}) });
    }
    const names = new Set(verdicts.map((v) => v.name));
    const end = own.find((r) => r.kind === 'end');
    out.push({
      run,
      verdicts,
      moved: verdicts.filter((v) => v.moved).map((v) => `${v.name}: ${v.stored.verdict} -> ${v.now.verdict}`),
      failing: verdicts.filter((v) => v.now.verdict !== 'pass').map((v) => v.name),
      unreproduced: old ? verdicts.filter((v) => !v.reproduced).map((v) => v.name) : null,
      // the run's terminal failures this re-judge does not reach: they stand as stored
      others: (end?.failed ?? []).filter((f) => !names.has(f)),
      premise: verdicts.filter((v) => v.premise).map((v) => ({ name: v.name, verdict: v.now.verdict, moved: v.moved, ...v.premise })),
    });
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--old');
  const oldPath = at >= 0 ? argv.splice(at, 2)[1] : null;
  const old = oldPath ? (await import(pathToFileURL(resolve(oldPath)).href)).judgeDevice : null;
  let failed = false;
  for (const path of argv) {
    for (const r of rejudgeDevice(rowsOf(resultsOf(path)), { old, lines: evidenceOf(path) })) {
      for (const v of r.verdicts.filter((x) => x.moved || x.now.verdict !== 'pass' || x.reproduced === false)) process.stdout.write(`${JSON.stringify({ path, run: r.run, ...v })}\n`);
      const { verdicts, ...summary } = r;
      process.stdout.write(`${JSON.stringify({ path, ...summary, device_verdicts: verdicts.length })}\n`);
      failed ||= r.failing.length > 0 || r.others.length > 0 || (r.unreproduced?.length ?? 0) > 0;
    }
  }
  process.exitCode = failed ? 1 : 0;
}
