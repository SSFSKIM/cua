// Ruling 1228 (E): a filtered rerun of run n replaces only its listed cells' rows of run n, both lanes together, in the
// full run's records; every replaced row names the job its evidence came from, and a cell that failed in the full run
// on its own verdict (not a missing proof) and passes only in the rerun is flagged, never silently replaced.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {combineReruns} from '../../scripts/native-matrix/combine.mjs';
import {main, parseCommand} from '../../scripts/native-matrix.mjs';

const A = 'method electron/frontmost/click.point', B = 'method savePanel/frontmost/typeText.name', C = 'method textedit/frontmost/click.element';
const idOf = key => key.slice(key.indexOf(' ') + 1);
const row = (key, engine, extra = {}) => ({section: key.split(' ')[0], id: idOf(key), engine, sample: 1, ok: true, ...extra});
const result = (engine, run, rows, meta = {}) => ({path: `/x/${engine}/run-${run}/result.json`, result: {cell: 'matrix', lanes: [{engine, build: `b-${engine}`, version: 'v'}], rows,
  meta: {run, planId: 'full', commit: 'c1', runner: {run: {id: '45468052791', attempt: '1'}}, ...meta}}});
const base = run => ['vendor', 'cua'].map(engine => result(engine, run, [row(A, engine, {ok: false}), row(B, engine, engine === 'vendor' ? {ok: false, invalid: 'not prepared'} : {}), row(C, engine)]));
const rerun = (run, engine, rows, meta = {}) => result(engine, run, rows, {planId: 'filtered', filter: [A, B], commit: 'c2', runner: {run: {id: '777', attempt: '2'}}, ...meta});

test('a filtered rerun replaces its listed cells of its run number in both lanes, each replaced row naming its job', () => {
  const reruns = ['vendor', 'cua'].map(engine => rerun(2, engine, [row(A, engine), row(B, engine)]));
  const out = combineReruns([...base(1), ...base(2)], reruns);
  assert.deepEqual(out.problems, []);
  const run2 = engine => out.results.find(r => r.result.meta.run === 2 && r.result.lanes[0].engine === engine).result;
  for (const engine of ['vendor', 'cua']) {
    const rows = run2(engine).rows;
    assert.deepEqual(rows.map(r => `${r.section} ${r.id}`).sort(), [A, B, C].sort(), 'nothing added, nothing lost');
    assert.deepEqual(rows.find(r => `${r.section} ${r.id}` === A).evidence, {runId: '777', attempt: '2'});
    assert.equal(rows.find(r => `${r.section} ${r.id}` === C).evidence, undefined, 'the full run\'s own rows keep their run\'s job');
    assert.deepEqual(run2(engine).meta.reruns, [{runId: '777', attempt: '2', commit: 'c2', filter: [A, B], build: `b-${engine}`}]);
    assert.equal(run2(engine).meta.commit, 'c1', 'the pair keeps one commit for the judge; the rerun\'s is on meta.reruns');
  }
  // Run 1 untouched.
  assert.equal(out.results.find(r => r.result.meta.run === 1 && r.result.lanes[0].engine === 'cua').result.meta.reruns, undefined);
  assert.deepEqual(out.combined, [{run: 2, runId: '777', attempt: '2', cells: [A, B]}]);
});

test('a cell that failed on its own verdict in the full run and passes only in the rerun is flagged; one with a missing proof is not', () => {
  const reruns = ['vendor', 'cua'].map(engine => rerun(2, engine, [row(A, engine), row(B, engine)]));
  const {flags} = combineReruns(base(2), reruns);
  // A failed on both lanes (ok false, no invalid): flagged on each; B's vendor row was invalid: a missing proof, no flag.
  assert.deepEqual(flags, [
    {run: 2, engine: 'vendor', cell: A, full: {runId: '45468052791', attempt: '1'}, rerun: {runId: '777', attempt: '2'}},
    {run: 2, engine: 'cua', cell: A, full: {runId: '45468052791', attempt: '1'}, rerun: {runId: '777', attempt: '2'}}]);
});

test('a rerun is combined only with both lanes of its run number, the same cells listed, and a full run beneath it', () => {
  const one = combineReruns(base(2), [rerun(2, 'cua', [row(A, 'cua'), row(B, 'cua')])]);
  assert.match(one.problems[0], /^run 2's filtered rerun \(job 777, attempt 2\) has no vendor lane: not combined$/);
  assert.equal(one.results.find(r => r.result.meta.run === 2 && r.result.lanes[0].engine === 'cua').result.rows.find(r => `${r.section} ${r.id}` === A).ok, false);
  const differ = combineReruns(base(2), [rerun(2, 'vendor', [row(A, 'vendor')], {filter: [A]}), rerun(2, 'cua', [row(A, 'cua'), row(B, 'cua')])]);
  assert.match(differ.problems[0], /lanes list different cells/);
  const orphan = combineReruns(base(1), ['vendor', 'cua'].map(engine => rerun(3, engine, [row(A, engine), row(B, engine)])));
  assert.match(orphan.problems[0], /^run 3's filtered rerun \(job 777, attempt 2\) has no full run of its number beneath it: not combined$/);
  // A listed cell the rerun did not record leaves the full run's row in place, said.
  const short = combineReruns(base(2), ['vendor', 'cua'].map(engine => rerun(2, engine, [row(A, engine)])));
  assert.match(short.problems[0], /^run 2's filtered rerun \(job 777, attempt 2\) recorded no row of method savePanel\/frontmost\/typeText\.name on vendor: the full run's kept$/);
});

test('the combine command reads every result under its directories and writes the full runs combined, per lane, with the flags', async () => {
  assert.deepEqual(parseCommand(['combine', '/a', '/b', '--out', '/o']), {command: 'combine', dirs: ['/a', '/b'], out: '/o'});
  assert.throws(() => parseCommand(['combine', '/a']), /--out/);
  let combined = null;
  const io = {readResults: dirs => ({results: [...base(2), ...['vendor', 'cua'].map(engine => rerun(2, engine, [row(A, engine), row(B, engine)]))], problems: []}),
    writeResult: (dir, result) => { (combined ??= []).push([dir, result.meta.run, result.lanes[0].engine, result.meta.rerunFlags?.length ?? 0]); }, writeJson: () => {}};
  const lines = [];
  await main(['combine', '/a', '/b', '--out', '/o'], {log: l => lines.push(l), io: {combine: io}});
  assert.deepEqual(combined, [['/o/vendor/run-2', 2, 'vendor', 2], ['/o/cua/run-2', 2, 'cua', 2]]);
  assert.ok(lines.some(l => /^combined run 2 from job 777 attempt 2: 2 cell\(s\)$/.test(l)), lines.join('\n'));
  assert.ok(lines.some(l => /^FLAG: method electron\/frontmost\/click\.point on vendor, run 2/.test(l)), lines.join('\n'));
});
