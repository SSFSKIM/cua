// Offline only; no GUI/engine. Walk downloaded artifacts, treating each paired results.json as its own experiment.
// node scripts/probe-330/offline/paired-table.mjs <artifact-directory-or-results.json>
// Writes paired-tables.txt and paired-report.json beside the input (or in the input directory).
// Exit 0: both comparison heads pass every scene/app; 1: incomplete/slow/unreadable; 2: no paired dataset.
import {readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {summarizePaired} from './paired-report.mjs';

if (!process.argv[2]) {console.error('usage: paired-table.mjs <artifact-directory-or-results.json>'); process.exit(2);}
const input = resolve(process.argv[2]), directory = statSync(input).isDirectory() ? input : dirname(input);
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
line('A within-10%-p50 flag is null/unjudgeable unless every measured slot in that comparison is valid; faster than control passes.');
for (const report of reports) {
  line(`\nDATASET ${report.source}`);
  line(JSON.stringify({completed: report.config.completed, kit: report.config.commit, engines: report.config.engines,
    rounds: report.config.rounds, warmupsPerVisit: report.config.warmupsPerVisit,
    strategy: report.config.processStrategy, warmup: report.config.warmupStrategy, order: report.config.orderStrategy,
    exception: report.config.exception, cleanupException: report.config.cleanupException, signal: report.config.signal}));
  for (const [title, groups] of [['PER SCENE', report.scenes], ['PER APP (equally sampled scene/round pool)', report.apps]]) {
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
  line('\nEVERY FAILED / MISSING / INVALID / DUPLICATE / UNPLANNED MEASURED SLOT');
  for (const issue of report.issues) line(JSON.stringify(issue));
  for (const scene of report.config.scenes) if (scene.exception || scene.cleanupException) line(`SCENE FAILURE ${JSON.stringify(scene)}`);
  line(`ALL SCENE/APP COMPARISONS COMPLETE AND WITHIN 10% P50: ${report.passed}`);
}
for (const error of parseErrors) line(`UNREADABLE ${JSON.stringify(error)}`);
if (!reports.length) line('NO PAIRED DATASETS FOUND');
const text = lines.join('\n') + '\n';
writeFileSync(join(directory, 'paired-tables.txt'), text);
writeFileSync(join(directory, 'paired-report.json'), JSON.stringify({reports, parseErrors}, null, 2));
console.log(text);
process.exitCode = !reports.length ? 2 : parseErrors.length || reports.some(r => !r.passed) ? 1 : 0;
