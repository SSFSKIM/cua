// Task 103, ruling 834's proof part 2: D1's judge and report over one run's records, printed to stdout. The judge is
// the drag experiment's own (drag.mjs `judgeDragCell` over the recorded drag runs, `dragVerdict`, `dragCompleteness`),
// the report report.mjs's `writeSummary` (summary.md). Run on a copy of the records as recorded and on a copy with the
// stats files and settle-counts.json removed; the two outputs must be byte-identical.
//
//   HEAD_HARNESS=<scripts/linux-engine-diff> RUN_DIR=<the harness out> node judge-report.mjs

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const harness = resolve(process.env.HEAD_HARNESS);
const dir = resolve(process.env.RUN_DIR);
const { dragCompleteness, dragPlan, judgeDragCell } = await import(join(harness, 'drag.mjs'));
const { dragVerdict, dragVerdictText } = await import(join(harness, 'drag-judge.mjs'));
const { writeSummary } = await import(join(harness, 'report.mjs'));

const rows = readFileSync(join(dir, 'results.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const meta = rows.find((r) => r.kind === 'meta');
const recorded = rows.filter((r) => r.kind === 'drag-cell');
const lanes = [...new Set(rows.filter((r) => r.kind === 'drag-run').map((r) => r.engine))];
const cuaLanes = ['cua', 'cua:0ms'].filter((l) => lanes.includes(l));
const vendors = ['pinned', 'newest'].filter((l) => lanes.includes(l));
const cells = recorded.map((c) => {
  const runs = rows.filter((r) => r.kind === 'drag-run' && r.family === c.family && r.drag === c.drag).map(({ kind, ...r }) => r);
  return judgeDragCell(c.family, c.drag, runs, { cuaLanes, vendors, laneLabels: ['pinned', 'newest', 'cua', 'cua:0ms'], load: false }).row;
});
const plan = dragPlan(meta.families, meta.ops && meta.ops !== 'all' ? meta.ops : null);
const errors = rows.filter((r) => r.kind === 'drag-error').map((r) => ({ family: r.family, kind: r.drag, error: String(r.error).split('\n')[0].slice(0, 200) }));
const verdict = dragVerdict(cells, { pilot: true });
const judge = {
  cells,
  reproduces_recorded_cells: JSON.stringify(cells) === JSON.stringify(recorded.map(({ run, ...c }) => c)),
  verdict,
  verdict_text: dragVerdictText(verdict),
  completeness: dragCompleteness(plan, cells, errors),
  summary_row: rows.filter((r) => r.kind === 'experiment-summary').map(({ complete, failed }) => ({ complete, failed })),
};
process.stdout.write(`== judge\n${JSON.stringify(judge, null, 1)}\n== report (summary.md)\n${writeSummary(dir)}\n`);
