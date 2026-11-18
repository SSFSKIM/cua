// The events experiment's scenario verdicts of a stored run judged again (the M5 pre-flight's §8.1, point 4: a fix to a
// judge alone re-judges the stored rows of the steps it reaches; #171 M5, T4's arm64 round, item (f), ruling 818),
// display-free from the run's own `events` rows: each scenario's records by this checkout's judge (events.mjs
// `judgeScenario`), beside the differences the run stored, and beside a former judge's where one is named (`--old`, an
// events.mjs of the head the run ran at, whose `firstDifference` must reproduce every stored verdict for the replay to
// stand). A verdict moves when an engine's difference appears or goes, or a declared deviation changes; a difference's
// detail may read differently (the new judge says why) without moving it. Read-only. One JSON line per scenario that moved, fails for cua or was not reproduced, then one per run with
// its counts, the scenarios that moved and those failing for cua now. Only the scenarios' differences are re-judged; the
// run's speed and motion verdicts stand as stored.
//
//   node scripts/linux-engine-diff/rejudge-events.mjs [--old <events.mjs>] <step dir or results.jsonl[.gz]>...

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { VENDOR_JS_SCENARIOS, judgeScenario, scenarios } from './events.mjs';

/** A step's results file: the path given, or its `run/results.jsonl` (or `.gz`), or its own `results.jsonl`. */
function resultsOf(path) {
  if (!statSync(path).isDirectory()) return path;
  for (const p of ['run/results.jsonl', 'run/results.jsonl.gz', 'results.jsonl', 'results.jsonl.gz']) if (existsSync(join(path, p))) return join(path, p);
  throw new Error(`${path}: no results.jsonl`);
}

export const rowsOf = (file) => {
  const bytes = readFileSync(file);
  return (file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
};

/** A scenario's verdicts as the `events` row keeps them: each engine's first difference or null, and its declared deviation. */
const verdictOf = ({ verdicts, declared }) => ({ differences: verdicts, declared });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** A scenario's verdict per engine: which engines differ, and which a declared deviation excused (not each difference's detail). */
const outcome = (v) => ({ failing: Object.keys(v.differences).filter((l) => v.differences[l]).sort(), declared: v.declared });
const cuaFails = (v) => Object.entries(v.differences).some(([label, d]) => d && label.startsWith('cua'));

/** Every scenario of the rows' runs, re-judged: `[{run, scenarios: [...], moved, failing, unreproduced}]`. */
export function rejudgeEvents(rows, { old = null } = {}) {
  const out = [];
  for (const run of [...new Set(rows.map((r) => r.run))]) {
    const list = [];
    for (const row of rows.filter((r) => r.run === run && r.kind === 'events')) {
      const scenario = (row.via === 'vendor-js' ? VENDOR_JS_SCENARIOS : scenarios()).find((s) => s.name === row.scenario);
      if (!scenario) throw new Error(`${run}: no scenario named ${JSON.stringify(row.scenario)} in this checkout`);
      const labels = Object.keys(row.records);
      const stored = { differences: row.differences, declared: row.declared ?? {} };
      const now = verdictOf(judgeScenario(scenario, row.records, labels));
      const then = old ? verdictOf(judgeScenario(scenario, row.records, labels, { first: old })) : null;
      list.push({ name: row.scenario, via: row.via, stored, ...(then ? { reproduced: same(then, stored) } : {}), now, moved: !same(outcome(now), outcome(stored)), cua: { stored: cuaFails(stored) ? 'fail' : 'pass', now: cuaFails(now) ? 'fail' : 'pass' } });
    }
    out.push({
      run,
      scenarios: list,
      moved: list.filter((s) => s.moved).map((s) => `${s.name}: cua ${s.cua.stored} -> ${s.cua.now}`),
      failing: list.filter((s) => s.cua.now === 'fail').map((s) => s.name),
      unreproduced: old ? list.filter((s) => !s.reproduced).map((s) => s.name) : null,
    });
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--old');
  const oldPath = at >= 0 ? argv.splice(at, 2)[1] : null;
  const old = oldPath ? (await import(pathToFileURL(resolve(oldPath)).href)).firstDifference : null;
  let failed = false;
  for (const path of argv) {
    for (const r of rejudgeEvents(rowsOf(resultsOf(path)), { old })) {
      for (const s of r.scenarios.filter((x) => x.moved || x.cua.now === 'fail' || x.reproduced === false)) process.stdout.write(`${JSON.stringify({ path, run: r.run, ...s })}\n`);
      const { scenarios: list, ...summary } = r;
      process.stdout.write(`${JSON.stringify({ path, ...summary, scenarios: list.length })}\n`);
      failed ||= r.failing.length > 0 || (r.unreproduced?.length ?? 0) > 0;
    }
  }
  process.exitCode = failed ? 1 : 0;
}
