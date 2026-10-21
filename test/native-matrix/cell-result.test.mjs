// The native matrix's cell-result shape (scripts/native-matrix/cell-result.mjs): what every cell writes, its own and
// those implemented on the live harness, so summary and compare read one shape.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CELL_RESULT_SCHEMA, cellResult, readCellResults, rowProblems, validateCellResult, verdictOf, writeCellResult} from '../../scripts/native-matrix/cell-result.mjs';

const row = (extra = {}) => ({section: 'method', id: 'textedit/background/click.element', engine: 'cua', sample: 1, ok: true, ...extra});
const base = (extra = {}) => cellResult({cell: 'matrix', device: 'mini', started: '2026-10-21T00:00:00.000Z', finished: '2026-10-21T00:01:00.000Z',
  lanes: [{host: 'cua', engine: 'cua', build: 'b', version: 'v'}], complete: true, rows: [row()], ...extra});

test('the verdict: refused, then no-verdict without a valid row, fail on a bad row or an incomplete cell, else pass', () => {
  assert.equal(verdictOf({refused: true, complete: false, rows: [row()]}), 'refused');
  assert.equal(verdictOf({complete: true, rows: []}), 'no-verdict');
  assert.equal(verdictOf({complete: true, rows: [row({ok: false, invalid: 'the probe posted outside the interval'})]}), 'no-verdict');
  assert.equal(verdictOf({complete: true, rows: [row(), row({ok: false, id: 'b'})]}), 'fail');
  assert.equal(verdictOf({complete: false, rows: [row()]}), 'no-verdict', 'an incomplete cell is no verdict: never a pass, never a plain fail');
  assert.equal(verdictOf({complete: false, rows: [row({ok: false})]}), 'no-verdict', 'missing evidence outranks a failed row');
  assert.equal(verdictOf({complete: false, rows: []}), 'no-verdict');
  assert.equal(verdictOf({complete: true, rows: [row(), row({id: 'c', ok: false, invalid: 'not in front'})]}), 'pass', 'an invalid row counts for nothing');
});

test('a declared row is not ok and does not fail the verdict; it needs a kind and a cause', () => {
  const defect = row({id: 'hscroll/vendor', engine: 'vendor', ok: false, declared: {kind: 'vendor-defect', cause: 'the vendor scrolls the wrong axis'}});
  assert.equal(verdictOf({complete: true, rows: [row(), defect]}), 'pass');
  assert.equal(verdictOf({complete: true, rows: [defect]}), 'pass');
  assert.equal(verdictOf({complete: false, rows: [defect]}), 'no-verdict', 'an incomplete cell still never passes');
  assert.deepEqual(validateCellResult(base({rows: [row(), defect]})), []);
  assert.ok(rowProblems({...defect, declared: {kind: 'vendor-defect'}}).some(p => /declared needs a kind and a cause/.test(p)));
});

test('a built result conforms, carries its verdict and bounds its sentences', () => {
  const result = base({rows: [row({error: 'x'.repeat(400)})], problems: ['y'.repeat(400)]});
  assert.equal(result.schema, CELL_RESULT_SCHEMA);
  assert.equal(result.verdict, 'pass');
  assert.equal(result.rows[0].error.length, 300);
  assert.equal(result.problems[0].length, 300);
  assert.deepEqual(validateCellResult(result), []);
  const refused = base({refused: true, rows: [], complete: true});
  assert.equal(refused.verdict, 'refused');
  assert.equal(refused.complete, false, 'a refused cell is not complete');
  assert.deepEqual(validateCellResult(refused), []);
});

test('every field a row needs is checked by name', () => {
  assert.deepEqual(rowProblems(row()), []);
  const problems = rowProblems({section: 'methods', id: '', engine: 'sky', sample: 0, ok: 'yes', regime: 'behind', inCellMs: 'fast', inputRoute: 5,
    interference: {}, declared: {kind: 'owner'}, invalid: ''});
  for (const field of ['section', 'id', 'engine', 'sample', 'ok', 'regime', 'inCellMs', 'inputRoute', 'interference.ok', 'declared', 'invalid'])
    assert.ok(problems.some(p => p.includes(`.${field} `) || p.includes(`row.${field}`)), `${field}: ${problems.join(' | ')}`);
  assert.deepEqual(rowProblems(row({inputRoute: "2'"})), []);
  assert.deepEqual(rowProblems(row({inputRoute: null})), []);
});

test('a result whose verdict does not follow from its rows, or that repeats a row, does not conform', () => {
  const lying = {...base(), verdict: 'pass', rows: [row({ok: false})]};
  assert.ok(validateCellResult(lying).some(p => /does not follow/.test(p)));
  const incomplete = {...base(), complete: false, verdict: 'pass'};
  assert.ok(validateCellResult(incomplete).some(p => /incomplete result cannot pass/.test(p)));
  assert.ok(validateCellResult({...base(), complete: false, verdict: 'fail'}).some(p => /cannot fail: it is no-verdict/.test(p)));
  const twice = base({rows: [row(), row()]});
  assert.ok(validateCellResult(twice).some(p => /two rows/.test(p)));
  // The same id on the other engine, or another sample, is another row.
  assert.deepEqual(validateCellResult(base({rows: [row(), row({engine: 'vendor'}), row({sample: 2})]})), []);
  assert.ok(validateCellResult({...base(), schema: 'native-live-1'}).some(p => /schema/.test(p)));
});

test('results are written only when they conform, and read back from any depth, other schemas skipped', () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'cell-result-'));
  try {
    assert.throws(() => writeCellResult(join(dir, 'bad'), {...base(), rows: [{}]}), /does not conform/);
    writeCellResult(join(dir, 'matrix', 'cua', 'run-1'), base());
    writeCellResult(join(dir, 'route4'), base({cell: 'route4', rows: [row({section: 'residue', id: 'route4/canvas', engine: 'vendor'})]}));
    fs.mkdirSync(join(dir, 'live'), {recursive: true});
    fs.writeFileSync(join(dir, 'live', 'result.json'), JSON.stringify({schema: 'native-live-1'}));
    const read = readCellResults(dir);
    assert.deepEqual(read.map(r => r.path), ['matrix/cua/run-1', 'route4']);
    assert.ok(read.every(r => r.problems.length === 0));
    assert.equal(read[1].result.rows[0].section, 'residue');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('a standalone cell judges its rows\' oracle too: interference not held fails the row unless the oracle declared it; the flag is part of the result', () => {
  const steal = {ok: false, frontmost: false, topWindow: true, activations: 1, route4: false};
  const rows = [row({interference: {ok: true, frontmost: true, topWindow: true, activations: 0, route4: false}}), row({id: 'b', interference: steal})];
  assert.equal(verdictOf({complete: true, rows}), 'pass', 'a full run\'s verdict is its outcomes; summary judges its oracle');
  assert.equal(verdictOf({complete: true, rows, judgesInterference: true}), 'fail');
  const declared = [row({interference: {...steal, declared: {kind: 'route4-accepted', cause: 'route 4 on a family the owner accepted'}}})];
  assert.equal(verdictOf({complete: true, rows: declared, judgesInterference: true}), 'pass', 'an oracle declaration is the owner\'s, not a failure');
  const result = base({cell: 'non-interference', rows, judgesInterference: true});
  assert.deepEqual([result.verdict, result.judgesInterference], ['fail', true]);
  assert.deepEqual(validateCellResult(result), []);
  assert.match(validateCellResult({...result, verdict: 'pass'}).join(' '), /does not follow/);
  assert.equal(base({rows}).judgesInterference, undefined);
  assert.match(validateCellResult({...result, judgesInterference: 'yes'}).join(' '), /judgesInterference/);
});
