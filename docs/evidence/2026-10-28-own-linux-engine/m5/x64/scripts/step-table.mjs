// Task 89 (from task 87's pilot-table.mjs and M4's step-table.mjs): T5's step table. For every gate step with a record
// in the out root (`<step>.<label dir>/step.json`): the SHA it ran at, the lock lines (acquire and release, UTC, with
// the load at each, from host-lock.log, holder t5-x64, matched by the step's own command), the measured minutes, the
// exit, the run's unclean end and the step's end check, and the verdict lines of its output.
// :0 steps have no lock line of their own (the sitting holds one lock across them): their times are from zero.log.
// usage: node step-table.mjs <out root> <worktree> [label dir, default pinned-release] [steps, comma-separated]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [out, wt, label = 'pinned-release', only] = process.argv.slice(2);
const { STEPS } = await import(join(wt, 'scripts/linux-engine-gate/steps.mjs'));
const lock = readFileSync('/Users/new/.local/share/cua-171/host-lock.log', 'utf8').split('\n').filter((l) => / t5-x64 /.test(l));
const zero = existsSync(join(out, 'zero.log')) ? readFileSync(join(out, 'zero.log'), 'utf8').split('\n') : [];
const hm = (iso) => (iso ? iso.slice(11, 19) : '-');
const loadOf = (line) => (/load=([\d.]+ [\d.]+ [\d.]+)/.exec(line ?? '') ?? [])[1] ?? '-';

console.log('| step | SHA | acquire (UTC) | release | min | exit | load at acquire | load at release | end | verdict |');
console.log('|---|---|---|---|---:|---:|---|---|---|---|');
for (const s of STEPS) {
  if (only && !only.split(',').includes(s.name)) continue;
  const dir = join(out, `${s.name}.${label}`);
  if (!existsSync(join(dir, 'step.json')) && !existsSync(join(dir, 'all-clear.json'))) continue;
  const r = existsSync(join(dir, 'step.json')) ? JSON.parse(readFileSync(join(dir, 'step.json'), 'utf8')) : {};
  let acq, rel;
  if (s.display === ':0') {
    acq = zero.find((l) => l.includes(` start ${s.name} `));
    rel = zero.find((l) => l.includes(` end ${s.name} `));
  } else {
    const mine = (l) => l.includes(`g.sh run ${s.name} --pinned`) && l.includes(`--out ${out} `);
    acq = lock.filter((l) => / acquire /.test(l) && mine(l)).at(-1);
    rel = lock.filter((l) => / release /.test(l) && mine(l)).at(-1);
  }
  const t = (l) => (l ?? '').slice(0, 20);
  const min = acq && rel ? ((Date.parse(t(rel)) - Date.parse(t(acq))) / 60000).toFixed(1) : '-';
  const exit = r.exit ?? (/exit (\d+)/.exec(rel ?? '') ?? [])[1] ?? '-';
  const ec = r.end_check;
  const end = [
    r.unclean?.length ? `unclean: ${r.unclean.join('; ')}` : 'clean',
    ec ? (ec.clear ? 'end check clear' : `end check: ${[...(ec.left_by_step ?? []), ...(ec.foreign ?? [])].length} finding(s)`) : '',
  ].filter(Boolean).join('; ');
  const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : '');
  const text = (read('stdout.log') + read('wrap.out')).split('\n');
  const verdict = text.filter((l) => /verdict|VERDICT|PASS|FAIL|declared|complete|passes|passed|refused/i.test(l) && !/^\|/.test(l) && !/^acceptance on the pinned release: .* exit/.test(l)).slice(-3).join(' / ').slice(0, 400).replace(/\|/g, '/');
  console.log(`| ${s.name} | ${(r.checkout?.commit ?? '').slice(0, 8)} | ${t(acq).slice(11, 19)} | ${t(rel).slice(11, 19)} | ${min} | ${exit} | ${loadOf(acq)} | ${loadOf(rel)} | ${end} | ${verdict} |`);
}
