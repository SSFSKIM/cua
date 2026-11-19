#!/usr/bin/env node
// Task 108 (ruling 867; fix wave 1, ruling 870): a stored V5 step's device verdicts re-judged, read-only, by the live
// judge with ruling 680 encoded (this checkout's device.mjs), beside the judge it replaces (the base's device.mjs) and
// beside ruling 680's script's output on the same rows (its table; a row it does not list kept its stored verdict).
// Both judges run through rejudge-device.mjs `rejudgeDevice` with the same inputs: the step's rows, its premise sidecar
// and its recorded plan. Prints every row that is not a plain pass in all four columns, then the counts: where the
// encoded judge agrees with the script, and which rows it moved against the base judge. Verdicts compare as pass or
// fail: a premise cell's replayed pass reads `DIAGNOSTIC_PASS` (wave 8) and counts as a pass here.
//   node compare.mjs <checkout> <base checkout> <step dir> <the 680 script's output>
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const [checkout, base, step, scriptOut] = process.argv.slice(2);
const load = (root, file) => import(pathToFileURL(join(root, 'scripts/linux-engine-diff', file)).href);
const { evidenceOf, judgedVerdict, rejudgeDevice } = await load(checkout, 'rejudge-device.mjs');
const { judgeDevice } = await load(checkout, 'device.mjs');
const { judgeDevice: baseJudge } = await load(base, 'device.mjs');
const file = ['run/results.jsonl', 'run/results.jsonl.gz'].map((p) => join(step, p)).find(existsSync);
const bytes = readFileSync(file);
const rows = (file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

// the script's table, `| verdict row | stored | re-judged | why |`, before its controls
const listed = new Map();
for (const line of readFileSync(scriptOut, 'utf8').split('\n')) {
  if (line.startsWith('== controls')) break;
  const cells = line.split('|').map((c) => c.trim());
  if (cells.length >= 6 && / cua$/.test(cells[1])) listed.set(cells[1], cells[3]);
}

// the encoded judge, its record of the span-limited samples kept for the print
const limited = new Map();
const judge = (op, samples, audit, premise) => {
  const j = judgeDevice(op, samples, audit, premise);
  if (j.span_limited) limited.set(op, j.span_limited);
  return j;
};
const sidecar = evidenceOf(step);
const [run] = rejudgeDevice(rows, { judge, lines: sidecar });
const [baseRun] = rejudgeDevice(rows, { judge: baseJudge, lines: sidecar });
const baseOf = new Map(baseRun.verdicts.map((v) => [v.name, v]));
for (const v of run.verdicts) v.then = baseOf.get(v.name).now;
const unreproduced = baseRun.verdicts.filter((v) => v.moved).map((v) => v.name);
const disagree = [];
console.log(`# ${run.run}: ${file}`);
console.log('| verdict row | stored | 680 script | base judge | encoded judge |');
console.log('|---|---|---|---|---|');
for (const v of run.verdicts) {
  const script = listed.get(v.name) ?? v.stored.verdict;
  const then = judgedVerdict(v.then);
  const now = judgedVerdict(v.now);
  if (now !== script) disagree.push(`${v.name} (script ${script}, encoded ${now})`);
  if ([v.stored.verdict, script, then, now].some((x) => x !== 'pass')) console.log(`| ${v.name} | ${v.stored.verdict} | ${script} | ${then} | ${now}${v.now.verdict !== now ? ` (${v.now.verdict})` : ''} |`);
}
const moved = run.verdicts.filter((v) => judgedVerdict(v.then) !== judgedVerdict(v.now) || JSON.stringify(v.then.reasons) !== JSON.stringify(v.now.reasons));
const n = run.verdicts.length;
console.log(`\nthe base judge reproduces the stored verdict and reasons on ${n - unreproduced.length} of ${n}${unreproduced.length ? ` (not on: ${unreproduced.join('; ')})` : ''}`);
console.log(`rows: ${n}; the encoded judge agrees with the 680 script on ${n - disagree.length} of ${n}${disagree.length ? `; not on: ${disagree.join('; ')}` : ''}`);
console.log(`moved against the base judge (verdict or reasons): ${moved.map((v) => `${v.name}: ${judgedVerdict(v.then)} -> ${judgedVerdict(v.now)}`).join('; ') || 'none'}`);
for (const v of moved) console.log(`  base: ${v.then.verdict} ${JSON.stringify(v.then.reasons)}\n  encoded: ${v.now.verdict} ${JSON.stringify(v.now.reasons)}`);
console.log(`span_limited, as the run's verdict row would carry it: ${JSON.stringify(Object.fromEntries(limited))}`);
console.log(`the run's other terminal failures (they stand as stored): ${run.others.join('; ') || 'none'}`);
