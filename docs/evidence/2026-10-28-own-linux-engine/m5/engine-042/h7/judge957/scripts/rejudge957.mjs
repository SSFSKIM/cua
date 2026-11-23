// Task 128 (rulings 957 and 961): every stored drop-signals run judged by the frozen head's judge (`--old`, H7's
// drop-signals-judge.mjs) and by this head's, display-free and read-only. One JSON line per run: its family, plan and
// load, both verdicts' pass, the fails that differ, and the counts the new rule adds (drops at a stale position,
// ambiguous landings); and per run the drop rows whose path ended within the border margin, landed or not.
//   node rejudge957.mjs --old <old judge> --new <new judge> <results.jsonl[.gz]>...
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const argv = process.argv.slice(2);
const flag = (n) => argv.splice(argv.indexOf(n), 2)[1];
const oldJudge = await import(pathToFileURL(flag('--old')).href);
const newJudge = await import(pathToFileURL(flag('--new')).href);

const rowsOf = (file) => {
  const bytes = readFileSync(file);
  return (file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8').split('\n').filter(Boolean).flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
};

for (const file of argv) {
  const rows = rowsOf(file);
  for (const meta of rows.filter((r) => r.kind === 'meta' && r.experiment === 'drop-signals')) {
    const own = rows.filter((r) => r.run === meta.run);
    const args = { families: meta.families ?? [], plan: meta.plan, samplesTrials: meta.trials ?? null };
    const drags = own.filter((r) => r.kind === 'drop-signal');
    const margin = drags.filter((r) => newJudge.pathEndOf(r) === 'ambiguous');
    const unknown = drags.filter((r) => newJudge.pathEndOf(r) === 'unknown');
    let then = null;
    let now = null;
    try {
      then = oldJudge.dropSignalsVerdict(args, own);
      now = newJudge.dropSignalsVerdict(args, own);
    } catch (error) {
      console.log(JSON.stringify({ file, run: meta.run, error: String(error.message) }));
      continue;
    }
    const sum = (v, k) => (v?.counts?.parts ? v.counts.parts.reduce((n, p) => n + (p.counts?.[k] ?? 0), 0) : (v?.counts?.[k] ?? null));
    const staleRows = drags.filter((r) => newJudge.landingOf(r) === 'stale').map((r) => `${r.lane} ${r.cell} #${r.i}`);
    console.log(JSON.stringify({
      file,
      run: meta.run,
      family: args.families[0] ?? 'chrome',
      plan: args.plan,
      load: [...new Set(drags.map((r) => r.load))].join(','),
      drags: drags.length,
      judge: now?.judge ?? null,
      old_pass: then ? then.failed.length === 0 : null,
      new_pass: now ? now.failed.length === 0 : null,
      moved: Boolean(then && now) && (then.failed.length === 0) !== (now.failed.length === 0),
      new_fails: now ? now.failed.filter((f) => !then.failed.includes(f)) : [],
      gone_fails: then ? then.failed.filter((f) => !now.failed.includes(f)) : [],
      landed_old: sum(then, 'landed'),
      landed_new: sum(now, 'landed'),
      stale: staleRows.length,
      stale_rows: staleRows,
      ambiguous: sum(now, 'ambiguous'),
      in_margin: margin.length,
      unplaced: unknown.length,
    }));
  }
}
