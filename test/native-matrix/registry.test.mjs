// The matrix's cell registry (scripts/native-matrix/registry.mjs): its own cells by plan (the probe cells and the Korean
// matrix among them), an external harness's cells (M2a's residue, the settle cell) called through that harness's runCell
// and cellIo with its result read back and checked.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cellResult, writeCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {EXPECTED_RESIDUE, externalCells, listCells, resolveCell, runExternal} from '../../scripts/native-matrix/registry.mjs';
import {planOf, scenesOf} from '../../scripts/native-matrix/run.mjs';

const residue = (cell, ok = true) => cellResult({cell, device: 'mini', started: '2026-10-21T00:00:00Z', lanes: [{host: null, engine: 'cua', build: 'b', version: 'v'}], complete: true,
  rows: [{section: 'residue', id: `${cell}/one`, engine: 'cua', sample: 1, ok}]});
// A live harness double: its names module and its runner, which writes the cell's result where it is told.
function harness({write = (name, out) => writeCellResult(out, residue(name)), drop = []} = {}) {
  const calls = [];
  const loaded = [];
  const modules = {
    './residue-checks.mjs': {RESIDUE_CELLS: [...EXPECTED_RESIDUE]},
    './live.mjs': {cellIo: (options, base) => ({built: true, base}), runCell: async (name, options, io) => { calls.push({name, options, io}); write(name, options.out); return 0; }},
    './settle-cell.mjs': {SETTLE_CELLS: ['settle'], cellIo: () => ({}), runCell: async () => 0},
  };
  for (const spec of drop) delete modules[spec];
  return {calls, loaded, modules, load: async spec => { loaded.push(spec); if (!modules[spec]) throw Object.assign(new Error('missing'), {code: 'ERR_MODULE_NOT_FOUND'}); return modules[spec]; }};
}

test('the matrix\'s own cells resolve to plans, the probe cells and the Korean matrix among them; an unknown one lists the cells', async () => {
  const {load} = harness();
  assert.deepEqual(await resolveCell('non-interference', {load}), {kind: 'matrix', section: 'method', plan: 'background',
    describe: 'the background regime\'s cells under the oracle: --scene <driven> [--user <user window\'s scene>]'});
  for (const [name, section] of [['concurrent-use', 'concurrent'], ['concurrent-use-sheet', 'concurrent'], ['intervention-fires', 'intervention'], ['pre-action-refusal', 'intervention'],
    ['korean', 'unicode']]) {
    const resolved = await resolveCell(name, {load});
    assert.deepEqual([resolved.kind, resolved.section, resolved.plan], ['matrix', section, name]);
    assert.doesNotThrow(() => planOf(resolved.plan), name);
  }
  assert.deepEqual(await resolveCell('settle', {load}).then(c => [c.kind, c.section, c.module]), ['external', 'settle', './settle-cell.mjs']);
  await assert.rejects(resolveCell('nope', {load}), /no cell nope; the cells: matrix, method, speed, finding, non-interference, launch, concurrent-use, concurrent-use-sheet, intervention-fires, pre-action-refusal, korean, route4, minimized-select, enablement, menu, hscroll, settle$/);
  const listed = await listCells({load});
  assert.deepEqual(listed.filter(c => c.kind === 'external').map(c => [c.name, c.section, c.module]),
    [...EXPECTED_RESIDUE.map(name => [name, 'residue', './live.mjs']), ['settle', 'settle', './settle-cell.mjs']]);
  assert.deepEqual([...new Set(listed.map(c => c.kind))], ['matrix', 'external'], 'nothing is left planned');
});

test('the probe cells and the Korean matrix narrow as M5\'s steps name them', () => {
  assert.deepEqual(planOf('concurrent-use', {scene: 'finder'}).concurrent, ['finder']);
  assert.deepEqual(scenesOf(planOf('concurrent-use', {scene: 'finder'})), ['textedit', 'finder']);
  assert.throws(() => planOf('concurrent-use', {scene: 'electron'}), /nothing to run/);
  assert.deepEqual(scenesOf(planOf('concurrent-use-sheet')), ['textedit', 'electron']);
  assert.deepEqual(scenesOf(planOf('intervention-fires')), ['textedit']);
  assert.deepEqual(planOf('pre-action-refusal').intervention, ['preAction']);
  // Concrete Steps, M5: `cell korean --scene textedit`, with its background conditions' user window.
  const korean = planOf('korean', {scene: 'textedit'});
  assert.deepEqual(korean.unicode.fields, ['textedit']);
  assert.deepEqual(scenesOf(korean), ['textedit', 'electron']);
  assert.throws(() => planOf('korean', {scene: 'finder'}), /nothing to run/);
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

test('an expected source that is missing, lists other cells or has no runCell and cellIo fails loudly; own names never load it', async () => {
  assert.deepEqual(EXPECTED_RESIDUE, ['route4', 'minimized-select', 'enablement', 'menu', 'hscroll']);
  const gone = harness({drop: ['./residue-checks.mjs']});
  await assert.rejects(externalCells({load: gone.load}), /route4, minimized-select, enablement, menu, hscroll are expected from \.\/residue-checks\.mjs, which is not on this checkout/);
  await assert.rejects(listCells({load: gone.load}), /not on this checkout/);
  await assert.rejects(resolveCell('route4', {load: gone.load}), /not on this checkout/);
  // A matrix cell resolves without the external sources.
  assert.equal((await resolveCell('matrix', {load: gone.load})).kind, 'matrix');
  assert.equal((await resolveCell('korean', {load: gone.load})).kind, 'matrix');
  assert.equal(gone.loaded.length, 3, 'only the three calls above loaded it');
  const short = harness();
  short.modules['./residue-checks.mjs'] = {RESIDUE_CELLS: ['route4', 'hscroll']};
  await assert.rejects(externalCells({load: short.load}), /lists route4, hscroll; this registry expects route4, minimized-select, enablement, menu, hscroll/);
  const noRunner = harness({drop: ['./live.mjs']});
  await assert.rejects(externalCells({load: noRunner.load}), /\.\/live\.mjs, which is not on this checkout/);
  const noIo = harness();
  noIo.modules['./live.mjs'] = {runCell: async () => 0};
  await assert.rejects(externalCells({load: noIo.load}), /\.\/live\.mjs exports no runCell and cellIo/);
  const twice = harness();
  twice.modules['./residue-checks.mjs'] = {RESIDUE_CELLS: ['speed']};
  await assert.rejects(externalCells({load: twice.load, sources: [{names: './residue-checks.mjs', list: 'RESIDUE_CELLS', section: 'residue', runner: './live.mjs', expected: ['speed']}]}), /defined twice/);
});
