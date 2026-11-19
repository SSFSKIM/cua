// Task 99 (T7; from task 89's step-table.mjs): the arm64 step table. For every gate step with a record in the out root
// (`<step>.<label dir>/step.json`): the SHA it ran at, the lock lines (acquire and release, UTC, with the load at each,
// from host-lock.log, holder t7-arm64, matched by the driver's own command, `task99/step.sh` or, at H'''', `step-h4.sh <step> <out root>`), the
// step's own start after the quiet wait inside the hold (step.sh's line in <step>.driver.out, with its load), the
// measured minutes, the exit, the run's unclean end and the step's end check, and the verdict lines of its output.
// :0 steps have no lock line of their own (the sitting holds one lock across them): their times are from zero.log.
// usage: node step-table.mjs <out root> <worktree> [label dir, default pinned-release] [steps, comma-separated]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [out, wt, label = 'pinned-release', only] = process.argv.slice(2);
const { STEPS } = await import(join(wt, 'scripts/linux-engine-gate/steps.mjs'));
const lock = readFileSync('/Users/new/.local/share/cua-171/host-lock.log', 'utf8').split('\n').filter((l) => / t7-arm64 /.test(l));
const zero = existsSync(join(out, 'zero.log')) ? readFileSync(join(out, 'zero.log'), 'utf8').split('\n') : [];
const loadOf = (line) => (/load=([\d.]+ [\d.]+ [\d.]+)/.exec(line ?? '') ?? [])[1] ?? '-';

console.log('| step | SHA | acquire (UTC) | step start | release | min | exit | load at step start | load at release | end | verdict |');
console.log('|---|---|---|---|---|---:|---:|---|---|---|---|');
for (const s of STEPS) {
  if (only && !only.split(',').includes(s.name)) continue;
  const dir = join(out, `${s.name}.${label}`);
  if (!existsSync(join(dir, 'step.json')) && !existsSync(join(dir, 'all-clear.json'))) continue;
  const r = existsSync(join(dir, 'step.json')) ? JSON.parse(readFileSync(join(dir, 'step.json'), 'utf8')) : {};
  let acq, rel, start;
  if (s.display === ':0') {
    acq = zero.find((l) => l.includes(` start ${s.name} `));
    rel = zero.find((l) => l.includes(` end ${s.name} `));
    start = acq;
  } else {
    const mine = (l) => l.includes(`task99/step.sh ${s.name} ${out}`) || l.includes(`task99/step-h4.sh ${s.name} ${out}`);
    acq = lock.filter((l) => / acquire /.test(l) && mine(l)).at(-1);
    rel = lock.filter((l) => / release /.test(l) && mine(l)).at(-1);
    const drv = join(out, `${s.name}.driver.out`);
    const sl = existsSync(drv) ? readFileSync(drv, 'utf8').split('\n').find((l) => l.startsWith(`step.sh `) && l.includes(` start ${s.name} `)) : null;
    start = sl ? `${sl.slice(8, 28)} ${sl.slice(28)}` : null;
  }
  const t = (l) => (l ?? '').slice(0, 20);
  const min = start && rel ? ((Date.parse(t(rel)) - Date.parse(t(start))) / 60000).toFixed(1) : '-';
  const exit = r.exit ?? (/exit (\d+)/.exec(rel ?? '') ?? [])[1] ?? '-';
  const ec = r.end_check;
  const end = [
    r.unclean?.length ? `unclean: ${r.unclean.join('; ')}` : 'clean',
    ec ? (ec.clear ? 'end check clear' : `end check: ${[...(ec.left_by_step ?? []), ...(ec.foreign ?? [])].length} finding(s)`) : '',
  ].filter(Boolean).join('; ');
  const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '');
  const text = (read('stdout.log') + read('wrap.out')).split('\n');
  const verdict = text.filter((l) => /verdict|VERDICT|PASS|FAIL|declared|complete|passes|passed|refused/i.test(l) && !/^\|/.test(l) && !/^acceptance on the pinned release: .* exit/.test(l)).slice(-3).join(' / ').slice(0, 400).replace(/\|/g, '/');
  console.log(`| ${s.name} | ${(r.checkout?.commit ?? '').slice(0, 8)} | ${t(acq).slice(5, 19).replace('T', ' ')} | ${t(start).slice(11, 19)} | ${t(rel).slice(11, 19)} | ${min} | ${exit} | ${loadOf(start)} | ${loadOf(rel)} | ${end} | ${verdict} |`);
}
