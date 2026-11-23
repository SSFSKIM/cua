// Task 90 fix wave: the task review's probe on V5's stored rows, read-only. 0/1 keeps its notice and late_dnd, and
// takes 0/2's drag record, press, route and page counts; H′'s judge must fail the cell. The unaltered rows must pass.
// usage: node probe-ran.mjs <H′ checkout> <results.jsonl>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [harness, file] = process.argv.slice(2);
const { judgeDevice } = await import(join(harness, 'scripts/linux-engine-diff/device.mjs'));
const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const OP = 'chrome_dnd_shared';
const samples = rows.filter((r) => r.kind === 'sample' && r.engine === 'cua' && r.op === OP);
const a = rows.find((r) => r.kind === 'audit' && r.engine === 'cua' && r.op === OP);
const audit = { clean: a.clean, kind: a.audit, oks: a.oks, answered: a.answered, forbidden: a.forbidden.map((f) => f?.what ?? f) };
const at = (b, i) => samples.find((r) => r.block === b && r.i === i);
const s01 = at(0, 1);
const s02 = at(0, 2);
const ran = {
  ...s01,
  route: s02.route,
  dnd: s02.dnd,
  press: { ...s02.press, taken: true },
  drop_status: { before: s01.drop_status.before, after: s02.drop_status.after },
  engine_stats: { ...s01.engine_stats, dnd: s02.engine_stats.dnd, press: { ...s02.engine_stats.press, taken: true }, wall: s02.engine_stats.wall },
};
const real = judgeDevice(OP, samples, audit);
const probed = judgeDevice(OP, samples.map((r) => (r === s01 ? ran : r)), audit);
console.log('stored rows:', JSON.stringify(real));
console.log("probe (0/1 ran 0/2's drag):", JSON.stringify(probed));
const ok = real.pass === true && probed.pass === false;
console.log(ok ? 'as expected: the stored rows pass, the probe fails' : 'NOT as expected');
process.exitCode = ok ? 0 : 1;
