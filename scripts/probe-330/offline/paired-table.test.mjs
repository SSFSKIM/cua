import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync, readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDataset} from '../paired.mjs';

function fixture() {
  const engines = ['control', 'branch', 'candidate'].map((head, i) => ({head, ref: String(i + 1).repeat(40)}));
  const data = createDataset(engines); data.config.completed = true;
  for (const row of [...data.results, ...data.warmups]) Object.assign(row, {status: 'ok', requestSent: true, timings: {walkMs: row.head === 'branch' ? 200 : 100}});
  return data;
}
function runReader(data, args = []) {
  const dir = mkdtempSync(join(tmpdir(), 'p330-accept-'));
  try {
    writeFileSync(join(dir, 'results.json'), JSON.stringify(data));
    const run = spawnSync(process.execPath, [fileURLToPath(new URL('./paired-table.mjs', import.meta.url)), dir, ...args], {encoding: 'utf8'});
    return {...run, report: JSON.parse(readFileSync(join(dir, 'paired-report.json'), 'utf8')), tables: readFileSync(join(dir, 'paired-tables.txt'), 'utf8')};
  } finally {rmSync(dir, {recursive: true, force: true});}
}

test('candidate-only acceptance passes a valid candidate while retaining the failing old branch in aggregate diagnostic tables', () => {
  const data = fixture();
  const aggregate = runReader(data);
  assert.equal(aggregate.status, 1);
  const candidate = runReader(data, ['--accept', 'candidate']);
  assert.equal(candidate.status, 0, candidate.stderr);
  assert.deepEqual(candidate.report.acceptance, {mode: 'candidate', passed: true});
  assert.equal(candidate.report.reports[0].passed, false);
  assert.equal(candidate.report.reports[0].acceptance.branch.passed, false);
  assert.equal(candidate.report.reports[0].acceptance.candidate.passed, true);
  assert.ok(candidate.tables.includes('| branch |'));
  assert.ok(candidate.tables.includes('PER SCENE'));
});

test('candidate-only acceptance exits nonzero for a candidate slower than 110% of control per app', () => {
  const data = fixture();
  for (const row of data.results) if (row.head === 'candidate') row.timings.walkMs = 111;
  const run = runReader(data, ['--accept', 'candidate']);
  assert.equal(run.status, 1);
  assert.equal(run.report.acceptance.passed, false);
});

test('candidate-only acceptance rejects a missing measured slot', () => {
  const data = fixture();
  data.results = data.results.filter(r => !(r.head === 'candidate' && r.scene === 'firefox-body' && r.round === 1));
  const run = runReader(data, ['--accept', 'candidate']);
  assert.equal(run.status, 1);
  assert.equal(run.report.reports[0].apps.find(a => a.app === 'firefox').engines.candidate.missing, 1);
});

test('all 600 failed warm slots cannot pass despite all 300 measured requests succeeding', () => {
  const data = fixture();
  for (const row of data.warmups) row.status = 'failed';
  const run = runReader(data, ['--accept', 'candidate']);
  assert.equal(run.status, 1);
  const report = run.report.reports[0];
  assert.equal(report.warmups.total, 600);
  assert.equal(report.acceptance.candidate.passed, false);
  assert.equal(report.apps.find(a => a.app === 'firefox').engines.candidate.expected, 60);
  assert.equal(report.apps.find(a => a.app === 'firefox').engines.candidate.valid, 0);
  assert.equal(data.results.length, 300);
  assert.equal(report.issues.filter(i => i.phase === 'warm').length, 600);
});

for (const head of ['control', 'candidate']) test(`candidate-only acceptance rejects one missing ${head} warm-up`, () => {
  const data = fixture();
  data.warmups = data.warmups.filter(r => !(r.head === head && r.scene === 'finder-files' && r.round === 1 && r.warm === 2));
  const run = runReader(data, ['--accept', 'candidate']);
  assert.equal(run.status, 1);
  assert.equal(run.report.reports[0].acceptance.candidate.complete, false);
});

test('candidate-only acceptance does not hide an incomplete diagnostic branch', () => {
  const data = fixture();
  for (const row of [...data.results, ...data.warmups]) if (row.head === 'branch') row.status = 'pending';
  const run = runReader(data, ['--accept', 'candidate']);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.report.reports[0].acceptance.branch.complete, false);
  assert.ok(run.report.reports[0].issues.some(i => i.head === 'branch'));
});
