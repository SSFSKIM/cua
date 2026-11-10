// Offline only; no GUI/engine. Walk downloaded artifacts, treating each paired results.json as its own experiment.
// node scripts/probe-330/offline/paired-table.mjs <artifact-directory-or-results.json> [--accept all|candidate]
// Writes aggregate diagnostic tables AND per-head acceptance in either mode; --accept candidate changes only selection/exit.
// Exit 0: selected head(s) pass the per-app rule; 1: incomplete/slow/unreadable; 2: no paired dataset/invalid arguments.
import {readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {summarizePaired} from './paired-report.mjs';

const args = process.argv.slice(2);
let source, mode = 'all';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--accept' && ['all', 'candidate'].includes(args[i + 1])) mode = args[++i];
  else if (!args[i].startsWith('--') && !source) source = args[i];
  else {console.error('usage: paired-table.mjs <artifact-directory-or-results.json> [--accept all|candidate]'); process.exit(2);}
}
if (!source) {console.error('usage: paired-table.mjs <artifact-directory-or-results.json> [--accept all|candidate]'); process.exit(2);}
const input = resolve(source), directory = statSync(input).isDirectory() ? input : dirname(input);
const walk = path => statSync(path).isDirectory() ? readdirSync(path, {withFileTypes: true}).filter(e => !e.isSymbolicLink())
  .flatMap(e => e.isDirectory() || e.name === 'results.json' ? walk(join(path, e.name)) : []) : [path];
const reports = [], parseErrors = [];
for (const file of walk(input)) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (data.config?.group !== 'paired') continue;
    reports.push({source: file, ...summarizePaired(data)});
  } catch (e) {parseErrors.push({source: file, error: String(e)});}
}
const lines = [], line = text => lines.push(text), n = value => value == null ? '-' : typeof value === 'number' ? Number(value.toFixed(3)) : value;
line('PAIRED WALK COST: milliseconds; sample median p50; nearest-rank p95 (ceil(.95*n)).');
line('Differences are comparison minus control; negative is faster. p95 delta is reported both marginally and over round-paired differences.');
line('Measured and warm requests are separate. No timing/error/duplicate/missing slot is silently removed from its planned denominator.');
line('A measured slot is usable only with its two planned, valid, correctly attributed warm-ups; incomplete comparisons have null/unjudgeable flags.');
line('Binding acceptance is per APP p50 <= 110% of control; per-scene flags are diagnostics only. Faster than control passes.');
line(`Selected acceptance mode: ${mode}; aggregate diagnostics for both comparison heads remain below.`);
for (const report of reports) {
  line(`\nDATASET ${report.source}`);
  line(JSON.stringify({completed: report.config.completed, kit: report.config.commit, engines: report.config.engines,
    rounds: report.config.rounds, warmupsPerVisit: report.config.warmupsPerVisit,
    strategy: report.config.processStrategy, warmup: report.config.warmupStrategy, order: report.config.orderStrategy,
    exception: report.config.exception, cleanupException: report.config.cleanupException, signal: report.config.signal}));
  for (const [title, groups] of [['PER SCENE (diagnostic only)', report.scenes], ['PER APP (binding; equally sampled scene/round pool)', report.apps]]) {
    line(`\n${title}`);
    line('| scene/app | head | valid/planned | failed | missing | duplicate slots | median walkMs | p95 walkMs |');
    line('|---|---|---:|---:|---:|---:|---:|---:|');
    for (const g of groups) for (const [head, stats] of Object.entries(g.engines)) {
      line(`| ${g.scene ?? g.app} | ${head} | ${stats.valid}/${stats.expected} | ${stats.failed} | ${stats.missing} | ${stats.duplicateSlots} | ${n(stats.p50)} | ${n(stats.p95)} |`);
    }
    line('| scene/app | vs control | median delta ms | p95 delta ms | median delta % | valid pairs/planned | paired median delta ms | paired p95 delta ms | within 10% p50 |');
    line('|---|---|---:|---:|---:|---:|---:|---:|---|');
    for (const g of groups) for (const [head, c] of Object.entries(g.comparisons)) {
      line(`| ${g.scene ?? g.app} | ${head} | ${n(c.p50DifferenceMs)} | ${n(c.p95DifferenceMs)} | ${n(c.p50DifferencePct)} | ${c.paired.valid}/${c.paired.expected} | ${n(c.paired.p50DifferenceMs)} | ${n(c.paired.p95DifferenceMs)} | ${c.within10PctP50 ?? 'null (incomplete/zero control)'} |`);
    }
  }
  line('\nPAIRED DIFFERENCES BY SCENE AND ROUND');
  for (const scene of report.scenes) for (const [head, comparison] of Object.entries(scene.comparisons)) {
    for (const pair of comparison.paired.byRound) line(JSON.stringify({head, ...pair}));
  }
  line('\nWARM SLOTS (retained, deliberately NOT included in measured quantiles)');
  for (const group of report.warmups.groups) line(JSON.stringify(group));
  line('\nEVERY FAILED / MISSING / INVALID / DUPLICATE / UNPLANNED WARM OR MEASURED SLOT');
  for (const issue of report.issues) line(JSON.stringify(issue));
  for (const scene of report.config.scenes) if (scene.exception || scene.cleanupException) line(`SCENE FAILURE ${JSON.stringify(scene)}`);
  for (const [head, result] of Object.entries(report.acceptance)) line(`PER-APP ACCEPTANCE ${head}: ${JSON.stringify(result)}`);
  line(`BOTH HEADS COMPLETE AND WITHIN PER-APP 10% P50: ${report.passed}`);
}
for (const error of parseErrors) line(`UNREADABLE ${JSON.stringify(error)}`);
if (!reports.length) line('NO PAIRED DATASETS FOUND');
const passed = reports.length > 0 && parseErrors.length === 0 && reports.every(r => mode === 'candidate' ? r.acceptance.candidate.passed : r.passed);
const acceptance = {mode, passed};
line(`SELECTED ACCEPTANCE ${mode}: ${passed ? 'PASS' : 'FAIL'}`);
const text = lines.join('\n') + '\n';
writeFileSync(join(directory, 'paired-tables.txt'), text);
writeFileSync(join(directory, 'paired-report.json'), JSON.stringify({acceptance, reports, parseErrors}, null, 2));
console.log(text);
process.exitCode = !reports.length ? 2 : passed ? 0 : 1;
