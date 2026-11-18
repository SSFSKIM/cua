// Task 100's live check (fix wave 2's run, read again at fix wave 4): a development run's real records (live-probe.mjs)
// read by the checkout's own judge alone (route D, ruling 841): each premise sample's page reads parsed as premise.mjs
// reads them (the scene's label in the tree, each status line once), each cell's timed rows and audit bound to the run's
// own sidecar, and each cell judged by device.mjs `judgeDevice` with its samples' classes.
//   node live-check.mjs <checkout> <live dir>
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const [root, dir] = process.argv.slice(2);
const at = (p) => import(pathToFileURL(join(root, p)).href);
const { parsePageRead, bindAudit, bindTimed, evidenceLabel, ownLabel, adjacency, classifyPremise } = await at('scripts/linux-engine-diff/premise.mjs');
const { DEVICE_OPS, PREMISE_OPS, judgeDevice } = await at('scripts/linux-engine-diff/device.mjs');

const jsonl = (file) => {
  const bytes = readFileSync(file);
  return (file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
};
const rowsAll = jsonl(['run/results.jsonl', 'run/results.jsonl.gz'].map((p) => join(dir, p)).find(existsSync));
const lines = jsonl(join(dir, 'run/premise-evidence.jsonl'));
const run = rowsAll.find((r) => r.kind === 'meta').run;
const classes = (entries) => {
  const next = adjacency(entries);
  return entries.reduce((m, e) => ({ ...m, [classifyPremise(e, next(e))]: (m[classifyPremise(e, next(e))] ?? 0) + 1 }), {});
};
const out = { run, head: rowsAll[0].commit, lines: lines.length, cells: [] };
for (const op of PREMISE_OPS) {
  const rows = rowsAll.filter((r) => r.kind === 'sample' && r.engine === 'cua' && r.op === op);
  const auditRow = rowsAll.find((r) => r.kind === 'audit' && r.engine === 'cua' && r.op === op);
  const audit = { clean: auditRow.clean, kind: auditRow.audit, answered: auditRow.answered, forbidden: auditRow.forbidden ?? [], lifecycles: auditRow.lifecycles ?? 1 };
  const window = auditRow.ancestry?.[0];
  const label = evidenceLabel(rows);
  const own = lines.filter((l) => l.op === op);
  const reads = own.flatMap((l) => ['before', 'after'].map((side) => l.page?.[side]));
  const timed = bindTimed(rows, { lines });
  const bound = bindAudit(audit, lines, { run, scene: auditRow.scene, op, expect: DEVICE_OPS[op].device, window, label });
  const verdict = judgeDevice(op, rows, audit, { lines, window, plan: { blocks: rowsAll[0].blocks, audit: true } });
  out.cells.push({
    op,
    label,
    label_of_run: ownLabel(label, run),
    timed: rows.length,
    audited: auditRow.answered.length,
    reads: reads.length,
    // the tree carried the scene's label, and each status line once (one distinct dnd line, one moves line)
    titled: reads.filter((r) => r?.titled === true).length,
    one_dnd_one_moves: reads.filter((r) => r?.dnd?.length === 1 && r?.moves?.length === 1).length,
    parsed: reads.filter((r) => parsePageRead(r) != null).length,
    lines_of_this_fixture: own.filter((l) => l.fixture?.label === label).length,
    lines_with_notice_field: own.filter((l) => l.reply && 'notice' in l.reply).length,
    lifecycles: new Set(own.map((l) => l.lifecycle)).size,
    timed_bind_problems: timed.problems,
    timed_rows_with_evidence: timed.rows.filter((r) => r.premise_evidence).length,
    audit_bind_problems: bound.problems,
    audit_entries_with_evidence: bound.entries.filter((e) => e.premise_evidence).length,
    verdict: verdict.pass ? 'pass' : 'fail',
    reasons: verdict.reasons,
    classes: { timed: classes(timed.rows), audit: classes(bound.entries) },
  });
}
process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
