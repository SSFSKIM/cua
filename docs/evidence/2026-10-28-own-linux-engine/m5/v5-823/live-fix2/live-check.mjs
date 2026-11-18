// Task 100's fix wave 2, the live check's reading: a development run's real records (live-probe.mjs) read by the
// checkout's own code: each premise sample's page reads parsed as premise.mjs reads them (the scene's label in the
// tree, each status line once), the run's whole sidecar validated as premise-refill.mjs validates it, each cell's audit
// lines bound to the run, and each cell judged with its samples' classes.
//   node live-check.mjs <checkout> <live dir>
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [root, dir] = process.argv.slice(2);
const at = (p) => import(pathToFileURL(join(root, p)).href);
const { loadStep, sidecarProblems, judgeCell } = await at('scripts/linux-engine-gate/premise-refill.mjs');
const { parsePageRead, bindAudit, evidenceLabel, ownLabel } = await at('scripts/linux-engine-diff/premise.mjs');
const { PREMISE_OPS } = await at('scripts/linux-engine-diff/device.mjs');

const run = loadStep(dir);
const out = { run: run.run, head: run.meta?.commit, lines: run.lines?.length ?? null, sidecar_problems: sidecarProblems(run), cells: [] };
for (const op of PREMISE_OPS) {
  const rows = run.rows.filter((r) => r.kind === 'sample' && r.engine === 'cua' && r.op === op);
  const auditRow = run.rows.find((r) => r.kind === 'audit' && r.engine === 'cua' && r.op === op);
  const label = evidenceLabel(rows);
  const lines = run.lines.filter((l) => l.op === op);
  const reads = lines.flatMap((l) => ['before', 'after'].map((side) => l.page?.[side]));
  const bound = bindAudit({ answered: auditRow.answered, lifecycles: auditRow.lifecycles ?? 1 }, run.lines, { run: run.run, scene: auditRow.scene, op, window: auditRow.ancestry?.[0], label });
  const cell = judgeCell(op, [{ run, origin: 'main' }]);
  out.cells.push({
    op,
    label,
    label_of_run: ownLabel(label, run.run),
    timed: rows.length,
    audited: auditRow.answered.length,
    reads: reads.length,
    // the tree carried the scene's label, and each status line once (one distinct dnd line, one moves line)
    titled: reads.filter((r) => r?.titled === true).length,
    one_dnd_one_moves: reads.filter((r) => r?.dnd?.length === 1 && r?.moves?.length === 1).length,
    parsed: reads.filter((r) => parsePageRead(r) != null).length,
    lines_of_this_fixture: lines.filter((l) => l.fixture?.label === label).length,
    lines_with_notice_field: lines.filter((l) => l.reply && 'notice' in l.reply).length,
    lifecycles: new Set(lines.map((l) => l.lifecycle)).size,
    audit_bind_problems: bound.problems,
    audit_entries_with_evidence: bound.entries.filter((e) => e.premise_evidence).length,
    verdict: cell.pass ? 'pass' : 'fail',
    reasons: cell.reasons,
    classes: Object.fromEntries(['timed', 'audit'].map((k) => [k, (k === 'timed' ? cell.samples : cell.audit).reduce((m, s) => ({ ...m, [s.class]: (m[s.class] ?? 0) + 1 }), {})])),
  });
}
process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
