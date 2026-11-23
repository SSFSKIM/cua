// Task 87 (from task 74's pilot-table.mjs): the x64 pilot's per-step table: exit, measured minutes (step.json's
// started..finished), the plan's estimate, and the lines of the harness's output that name a failure or the completion.
// usage: node pilot-table.mjs <pilot out dir> <worktree>
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [out, wt] = process.argv.slice(2);
const { STEPS } = await import(join(wt, 'scripts/linux-engine-gate/steps.mjs'));
console.log('| step | display | estimate min | pilot min | exit | note |');
console.log('|---|---|---:|---:|---:|---|');
for (const s of STEPS) {
  const dir = join(out, `${s.name}.development-run.pilot`);
  if (!existsSync(join(dir, 'step.json'))) {
    console.log(`| ${s.name} | ${s.display} | ${s.minutes} | - | - | not run |`);
    continue;
  }
  const r = JSON.parse(readFileSync(join(dir, 'step.json'), 'utf8'));
  const min = r.finished ? ((Date.parse(r.finished) - Date.parse(r.started)) / 60000).toFixed(1) : '-';
  const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '');
  const text = read('stdout.log') + read('stderr.log') + read('wrap.out');
  const note = text.split('\n').filter((l) => /Incomplete|FAIL|Error|refused|failed|not reached|STOPPED|VERDICT|complete/i.test(l) && !/^\| /.test(l)).slice(-3).join(' / ').slice(0, 300).replace(/\|/g, '/');
  console.log(`| ${s.name} | ${s.display} | ${s.minutes} | ${min} | ${r.exit ?? '-'} | ${note} |`);
}
