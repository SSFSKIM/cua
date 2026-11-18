// Task 100's fix wave 3: the live check's real records (live-probe.mjs's run, fix wave 2) judged by route C's own code:
// the run alone, its planned slots and sidecar checked against its plan, each premise cell's status and counts. The
// run's exit is its harness's, 0 (session.jsonl's run-end); a private-display run has no sitting.
//   node live-check-c.mjs <checkout> <live dir>
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [root, dir] = process.argv.slice(2);
const { loadStep, judgeRun, slotProblems } = await import(pathToFileURL(join(root, 'scripts/linux-engine-gate/premise-refill.mjs')).href);
const run = loadStep(dir);
const judged = judgeRun(run, { exit: 0 });
const out = {
  run: run.run,
  head: run.meta?.commit,
  pass: judged.pass,
  failures: judged.failures,
  short: judged.short,
  cells: judged.cells.map((c) => ({ op: c.op, status: c.status, slot_problems: slotProblems(run, c.op), counts: c.counts })),
};
process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
