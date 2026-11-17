// The gate's drop judges run again over stored drop-signals sittings (the harness-fix wave, 2026-11-12), display-free
// from their rows: each run's verdict by the judge its family and plan get now (drop-signals-judge.mjs
// `dropSignalsVerdict`), beside a former judge's where one is named (`--old`, a copy of an earlier drop-signals-judge.mjs,
// whose `electronDropVerdict` is run on the same rows), with the drags whose false-ok reading changed. One JSON line per
// run.
//
//   node scripts/linux-engine-diff/rejudge-drops.mjs [--old <drop-signals-judge.mjs>] <sitting dir or results.jsonl[.gz]>...

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { dropSignalsVerdict, judgedElectronPlan } from './drop-signals-judge.mjs';

/** A sitting's results file: the path given, or its `run/results.jsonl` (or `.gz`), or its own `results.jsonl`. */
function resultsOf(path) {
  if (!statSync(path).isDirectory()) return path;
  for (const p of ['run/results.jsonl', 'run/results.jsonl.gz', 'results.jsonl', 'results.jsonl.gz']) if (existsSync(join(path, p))) return join(path, p);
  throw new Error(`${path}: no results.jsonl`);
}

const rowsOf = (file) => {
  const bytes = readFileSync(file);
  return (file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
};

/** The drags a verdict's false-ok fail names, as `lane cell #i` keys, from its fail lines' first three. */
const named = (failed) => failed.filter((f) => /answered ok with no drop/.test(f)).join('\n');

export async function rejudge(paths, { old = null } = {}) {
  const former = old ? await import(pathToFileURL(resolve(old)).href) : null;
  const out = [];
  for (const path of paths) {
    const file = resultsOf(path);
    const rows = rowsOf(file);
    for (const run of [...new Set(rows.map((r) => r.run))]) {
      const own = rows.filter((r) => r.run === run);
      const meta = own.find((r) => r.kind === 'meta');
      if (meta?.experiment !== 'drop-signals') continue;
      const args = { families: meta.families ?? ['chrome'], plan: meta.plan ?? 'main', samplesTrials: meta.trials ?? null };
      const now = dropSignalsVerdict(args, own);
      const drags = own.filter((r) => r.kind === 'drop-signal');
      const specs = own.find((r) => r.kind === 'drop-signal-scene')?.specs ?? [];
      const then = former && judgedElectronPlan(args) ? former.electronDropVerdict(drags, { specs }) : null;
      out.push({
        path,
        run,
        family: args.families[0],
        plan: args.plan,
        load: drags[0]?.load ?? null,
        drags: drags.length,
        judge: now?.judge ?? null,
        counts: now?.counts ?? null,
        failed: now?.failed ?? null,
        findings: now?.findings ?? null,
        old: then && { counts: then.counts, failed: then.failed },
        false_ok_changed: then ? named(then.failed) !== named(now.failed) : null,
      });
    }
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--old');
  const old = at >= 0 ? argv.splice(at, 2)[1] : null;
  for (const line of await rejudge(argv, { old })) process.stdout.write(`${JSON.stringify(line)}\n`);
}
