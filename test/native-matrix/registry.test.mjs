// The matrix's cell registry (scripts/native-matrix/registry.mjs): its own cells by plan, an external harness's cells
// called through that harness's runCell and cellIo with its result read back and checked, the planned ones named.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cellResult, writeCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {externalCells, listCells, resolveCell, runExternal} from '../../scripts/native-matrix/registry.mjs';
import {planOf, scenesOf} from '../../scripts/native-matrix/run.mjs';

const residue = (cell, ok = true) => cellResult({cell, device: 'mini', started: '2026-10-21T00:00:00Z', lanes: [{host: null, engine: 'cua', build: 'b', version: 'v'}], complete: true,
  rows: [{section: 'residue', id: `${cell}/one`, engine: 'cua', sample: 1, ok}]});
// A live harness double: its names module and its runner, which writes the cell's result where it is told.
function harness({write = (name, out) => writeCellResult(out, residue(name))} = {}) {
  const calls = [];
  const modules = {
    './residue-checks.mjs': {RESIDUE_CELLS: ['route4', 'hscroll']},
    './live.mjs': {cellIo: (options, base) => ({built: true, base}), runCell: async (name, options, io) => { calls.push({name, options, io}); write(name, options.out); return 0; }},
  };
  return {calls, load: async spec => { if (!modules[spec]) throw Object.assign(new Error('missing'), {code: 'ERR_MODULE_NOT_FOUND'}); return modules[spec]; }};
}

test('the matrix\'s own cells resolve to plans; a planned one names the task that builds it; an unknown one lists the cells', async () => {
  const {load} = harness();
  assert.deepEqual(await resolveCell('non-interference', {load}), {kind: 'matrix', section: 'method', plan: 'background',
    describe: 'the background regime\'s cells under the oracle: --scene <driven> [--user <user window\'s scene>]'});
  assert.equal((await resolveCell('concurrent-use', {load})).by, 'M2b.3');
  await assert.rejects(resolveCell('nope', {load}), /no cell nope; the cells: matrix, method, speed, finding, non-interference, launch, route4, hscroll, concurrent-use/);
  const listed = await listCells({load});
  assert.deepEqual(listed.filter(c => c.kind === 'external').map(c => [c.name, c.section, c.module]), [['route4', 'residue', './live.mjs'], ['hscroll', 'residue', './live.mjs']]);
});

test('M5\'s cell non-interference --scene textedit --user finder is one pairing of the background regime', () => {
  const plan = planOf('background', {scene: 'textedit', user: 'finder'});
  assert.deepEqual(plan.background, [{driven: 'textedit', user: 'finder'}]);
  assert.deepEqual([plan.frontmost, plan.launch, plan.speed], [[], [], false]);
  assert.deepEqual(scenesOf(plan), ['textedit', 'finder']);
  assert.deepEqual(planOf('background', {scene: 'openPanel'}).background, [{driven: 'openPanel', user: 'finder'}]);
  assert.deepEqual(scenesOf(planOf('matrix')), ['textedit', 'finder', 'chrome', 'electron']);
  assert.throws(() => planOf('launch', {scene: 'chrome'}), /nothing to run/);
  assert.throws(() => planOf('method', {scene: 'safari'}), /--scene is one of/);
});

test('an external cell runs through its harness\'s own io, and its result is read back and checked', async () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'registry-'));
  try {
    const {load, calls} = harness();
    const def = (await externalCells({load})).route4;
    assert.equal(await runExternal('route4', def, {out: join(dir, 'route4'), device: 'mini'}, {log: () => {}}), 0);
    assert.equal(calls[0].io.built, true, 'the harness built its own io');
    const wrong = harness({write: (name, out) => writeCellResult(out, residue('hscroll'))});
    await assert.rejects(runExternal('route4', (await externalCells({load: wrong.load})).route4, {out: join(dir, 'w')}, {log: () => {}}), /answers hscroll, not route4/);
    const none = harness({write: () => {}});
    await assert.rejects(runExternal('route4', (await externalCells({load: none.load})).route4, {out: join(dir, 'n')}, {log: () => {}}), /wrote no/);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('a source not on this checkout is skipped; a name defined twice is refused', async () => {
  assert.deepEqual(await externalCells({load: async () => { throw Object.assign(new Error('x'), {code: 'ERR_MODULE_NOT_FOUND'}); }}), {});
  await assert.rejects(externalCells({load: async spec => (spec === './residue-checks.mjs' ? {RESIDUE_CELLS: ['speed']} : {})}), /defined twice/);
});
