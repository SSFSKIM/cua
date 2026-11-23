// Task 142 (#487's settle-rest check, ruling 1102): every stored drop-signals run under the given directories judged by
// the base judge (`--base`, a copy of origin/main's drop-signals-judge.mjs at da7585c3) and by this branch's, through the
// dispatcher (`dropSignalsVerdict`, the run's meta row included), with the verdict each run stored. One JSON line per run,
// then a summary line: the runs whose fails differ between the judges, and the stored H8 t17-fix3 runs' verdicts.
//
//   node docs/evidence/2026-10-28-own-linux-engine/m5/harness-487/rejudge-settle-rest.mjs --base <judge.mjs> <dir>...

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { dropSignalsVerdict } from '../../../../../scripts/linux-engine-diff/drop-signals-judge.mjs';

const argv = process.argv.slice(2);
const at = argv.indexOf('--base');
const base = await import(pathToFileURL(resolve(argv.splice(at, 2)[1])).href);
const ROOT = resolve(new URL('../../../../../',import.meta.url).pathname);

const files = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (statSync(p).isDirectory()) return files(p);
  return /^results\.jsonl(\.gz)?$/.test(n) ? [p] : [];
});
const rowsOf = (file) => {
  const bytes = readFileSync(file);
  return (file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
};
const KINDS = ['chrome-drop-verdict', 'electron-drop-verdict', 'drop-parts-verdict'];

const out = [];
for (const file of argv.flatMap((d) => files(resolve(d))).sort()) {
  const rows = rowsOf(file);
  for (const run of [...new Set(rows.map((r) => r.run))]) {
    const own = rows.filter((r) => r.run === run);
    const meta = own.find((r) => r.kind === 'meta');
    if (meta?.experiment !== 'drop-signals') continue;
    const args = { families: meta.families ?? ['chrome'], plan: meta.plan ?? 'main', samplesTrials: meta.trials ?? null };
    const now = dropSignalsVerdict(args, own);
    const then = base.dropSignalsVerdict(args, own);
    const stored = own.find((r) => KINDS.includes(r.kind)) ?? null;
    const line = {
      path: relative(ROOT, file),
      run,
      plan: args.plan,
      family: args.families[0],
      cua_version: meta.cua_version ?? null,
      drags: own.filter((r) => r.kind === 'drop-signal').length,
      judge: now?.judge ?? null,
      base_failed: then?.failed ?? null,
      failed: now?.failed ?? null,
      moved_from_base: JSON.stringify(then?.failed ?? null) !== JSON.stringify(now?.failed ?? null),
      stored_pass: stored ? stored.pass === true : null,
      pass: now ? now.failed.length === 0 : null,
      settle_rest: now?.counts?.settle_rest ?? null,
    };
    out.push(line);
    process.stdout.write(`${JSON.stringify(line)}\n`);
  }
}
const fix3H8 = out.filter((l) => l.plan === 't17-fix3' && /\/h8\//.test(l.path));
process.stdout.write(`${JSON.stringify({
  summary: true,
  runs: out.length,
  judged: out.filter((l) => l.judge).length,
  moved_from_base: out.filter((l) => l.moved_from_base).map((l) => `${l.path} ${l.run}`),
  t17_fix3: out.filter((l) => l.plan === 't17-fix3').length,
  t17_fix3_h8: fix3H8.map((l) => ({ path: l.path, cua_version: l.cua_version, stored_pass: l.stored_pass, pass: l.pass, failed: l.failed, settle_rest: l.settle_rest })),
})}\n`);
