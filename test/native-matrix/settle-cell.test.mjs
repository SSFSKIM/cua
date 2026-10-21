// The settle cell (scripts/native-matrix/settle-cell.mjs; the spec's Verification system part 7): one implementation,
// the native-mac suite's ACTION and isSettled, its rows in the matrix's result shape per scene and engine, a lane that
// did not settle declarable per engine as the suite's diff declares it, and `cell settle` running the suite's lane.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {runCell, SETTLE_CELLS, settleResult} from '../../scripts/native-matrix/settle-cell.mjs';

const meta = (over = {}) => ({device: 'mini', host: 'cua', engine: 'cua', commit: 'c'.repeat(40), started: '2026-10-21T00:00:00.000Z', finished: '2026-10-21T00:10:00.000Z',
  plan: {scenes: ['textedit', 'finder', 'chrome', 'electron']}, complete: true, problems: [], hostAttestation: {host: 'cua'},
  engineAttestation: {attested: [{engine: 'cua', version: '0.1.0', build: 'b'.repeat(64)}], unattested: 0}, ...over});
const settle = (scene, settled) => ({scene, cell: 'settle', ok: true, settled});

test('a native-mac lane\'s settle rows as the matrix\'s rows: one per scene, a lane that moved fails unless declared for its engine', () => {
  const rows = [settle('textedit', true), settle('finder', true), settle('chrome', false), {scene: 'chrome', cell: 'action', ok: true}, settle('electron', true)];
  const result = settleResult({meta: meta(), rows, declarations: [{scene: 'chrome', golden: 'settle', kind: 'settle', lane: 'vendor', fault: 'vendor', cause: 'vendor only'}]});
  assert.deepEqual(validateCellResult(result), []);
  assert.equal(result.cell, 'settle');
  assert.deepEqual(result.lanes, [{host: 'cua', engine: 'cua', build: 'b'.repeat(64), version: '0.1.0'}]);
  assert.deepEqual(result.rows.map(r => [r.id, r.ok, r.invalid ?? null]), [['textedit/settle', true, null], ['finder/settle', true, null], ['chrome/settle', false, null],
    ['electron/settle', true, null]]);
  assert.equal(result.verdict, 'fail', 'a vendor declaration does not excuse cua\'s lane');
  const declared = settleResult({meta: meta(), rows, declarations: [{scene: '*', golden: 'settle', kind: 'settle', lane: 'cua', fault: 'scene state', cause: 'the page animates'}]});
  assert.deepEqual(declared.rows[2].declared, {kind: 'settle', cause: 'the page animates'});
  assert.equal(declared.verdict, 'pass');
  assert.equal(settleResult({meta: meta({complete: false, error: 'stopped'}), rows}).verdict, 'no-verdict');
  assert.equal(settleResult({meta: meta({refused: ['dirty']}), rows: []}).verdict, 'refused');
});

test('cell settle runs the suite\'s lane with this checkout\'s commit; a dry run runs nothing', async () => {
  assert.deepEqual(SETTLE_CELLS, ['settle']);
  const runs = [], lines = [];
  const io = {log: line => lines.push(line), controllerCheckout: () => ({commit: 'd'.repeat(40), dirty: false}), runSuite: async options => { runs.push(options); return 0; }};
  const options = {device: 'mini', host: 'vendor', engine: 'cua', approvedRuntime: '/h', approvedEngine: '/e', out: '/tmp/settle-out', run: undefined, sitting: 's'};
  assert.equal(await runCell('settle', options, {...io, dryRun: true}), 0);
  assert.equal(runs.length, 0);
  assert.match(lines.join('\n'), /native-mac suite/);
  assert.equal(await runCell('settle', options, io), 0);
  assert.deepEqual(runs, [{device: 'mini', host: 'vendor', engine: 'cua', approvedRuntime: '/h', approvedEngine: '/e', commit: 'd'.repeat(40), sitting: 's', out: '/tmp/settle-out'}]);
  await assert.rejects(runCell('nope', options, io), /settle/);
});

test('the settle cell needs every scene\'s settle reading, whatever the suite\'s completion says: one settled scene and three failed actions is no verdict', () => {
  // The suite is complete (a lane cell's failure is its outcome for the diff), but only TextEdit's action settled.
  const rows = [settle('textedit', true), {scene: 'finder', cell: 'action', ok: false, error: 'x'}, {scene: 'chrome', cell: 'action', ok: false, error: 'x'}, {scene: 'electron', cell: 'bind', ok: false, error: 'x'}];
  const result = settleResult({meta: meta(), rows});
  assert.deepEqual(validateCellResult(result), []);
  assert.deepEqual([result.complete, result.verdict], [false, 'no-verdict']);
  assert.ok(result.problems.includes('finder: no settle reading (its action did not complete): the settle cell needs every scene\'s'), result.problems.join('\n'));
  assert.equal(result.problems.length, 3);
});
