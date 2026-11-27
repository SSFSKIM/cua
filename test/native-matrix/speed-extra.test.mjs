// Ruling 1228 (F): the three speed ops the full sitting C missed (electron and TextEdit paste.replace, TextEdit
// typeText.replace) may be re-timed in a run job, behind a flag off by default: `--samples` more samples of each on both
// lanes, each case run on its own prepare as the full run runs it (TextEdit's document written back whole between
// samples, unrecorded), recorded as the run's extra speed samples (cell speed-extra). The judge pools them with the full
// runs' samples for those three ops alone, when both lanes of a run have them; without them nothing changes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cellResult, writeCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {manifestOf} from '../../scripts/native-matrix/manifest.mjs';
import {MATRIX_CELLS} from '../../scripts/native-matrix/registry.mjs';
import {planOf, SPEED_EXTRA_IDS} from '../../scripts/native-matrix/run.mjs';
import {judge, readResults, renderSummary} from '../../scripts/native-matrix/summary.mjs';
import {runWith} from './run-doubles.mjs';

const IDS = ['electron/method.paste.replace', 'textedit/method.paste.replace', 'textedit/method.typeText.replace'];

test('the speed-extra cell times the three missed ops alone, --samples each, and is never the full plan', () => {
  assert.deepEqual([...SPEED_EXTRA_IDS].sort(), IDS);
  assert.ok(MATRIX_CELLS['speed-extra']);
  const plan = planOf('speed-extra');
  assert.equal(plan.id, 'speed-extra');
  assert.deepEqual(plan.frontmost, ['textedit', 'electron']);
  assert.deepEqual(manifestOf({run: 2, samples: 3}, plan).map(r => `${r.id}#${r.sample}`).sort(), IDS.flatMap(id => [1, 2, 3].map(s => `${id}#${s}`)).sort());
  assert.equal(planOf('matrix').speedExtra, undefined, 'the full matrix is unchanged');
});

test('a speed-extra run records each op\'s samples on its own prepare, TextEdit\'s document written back between samples', async () => {
  const calls = [];
  const {result} = await runWith({plan: planOf('speed-extra'), cellName: 'speed-extra', calls});
  assert.deepEqual(result.rows.map(r => `${r.section} ${r.id}#${r.sample}`).sort(), IDS.flatMap(id => [1, 2].map(s => `speed ${id}#${s}`)).sort());
  assert.equal(result.meta.planId, 'speed-extra');
  // TextEdit's two cases, then its document's whole write, once per sample.
  const writes = calls.filter(c => c.code.includes('cua matrix set')).length;
  assert.equal(writes, 2);
});

// Three full runs a side, every speed sample `ms`; the speed-extra results of `extra` runs beside them.
const OS = {name: 'macOS', version: '26.0', build: '25A354'};
const full = (engine, run, ms) => cellResult({cell: 'matrix', device: 'mini', started: '2026-11-27T00:00:00Z', lanes: [{host: engine, engine, build: `b-${engine}`, version: 'v'}], complete: true,
  rows: manifestOf({run, samples: 2}).filter(r => r.section === 'speed').map(({section, id, sample}) => ({section, id, engine, sample, ok: true, inCellMs: ms})),
  meta: {run, samples: 2, sitting: 's1', commit: 'c', os: OS, planId: 'full', nativeEngine: {approved: {build: 'a'.repeat(64)}}}});
const extra = (engine, run, ms, n = 10) => cellResult({cell: 'speed-extra', device: 'mini', started: '2026-11-27T00:00:00Z', lanes: [{host: engine, engine, build: `b-${engine}`, version: 'v'}], complete: true,
  rows: IDS.flatMap(id => Array.from({length: n}, (_, i) => ({section: 'speed', id, engine, sample: i + 1, ok: true, inCellMs: ms}))),
  meta: {run, samples: n, sitting: 's1', commit: 'c', os: OS, planId: 'speed-extra'}});
function judgedWith(extras, fullOf = full) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'speed-extra-'));
  try {
    for (let n = 1; n <= 3; n++) for (const engine of ['vendor', 'cua']) writeCellResult(join(dir, engine, `run-${n}`), fullOf(engine, n, 40));
    extras.forEach((r, i) => writeCellResult(join(dir, 'speed-extra', `x-${i}`), r));
    const {results, problems} = readResults([dir]);
    return judge(results, problems, {departures: []});
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

test('without extra samples the speed verdict is as it was; with them the three ops pool them, and only those', () => {
  const before = judgedWith([]);
  for (const id of IDS) assert.equal(before.speed.find(s => s.id === id).beat, false, id);
  assert.ok(before.speed.every(s => s.extra === undefined));
  const after = judgedWith([extra('vendor', 2, 100), extra('cua', 2, 40)]);
  for (const id of IDS) {
    const s = after.speed.find(x => x.id === id);
    assert.deepEqual([s.beat, s.extra, s.vendor.median, s.cua.median], [true, {runs: [2], vendor: 10, cua: 10}, 100, 40], id);
  }
  assert.deepEqual(after.speed.filter(s => !IDS.includes(s.id)), before.speed.filter(s => !IDS.includes(s.id)), 'every other op judged as before');
  assert.match(renderSummary(after), /^- method\.paste\.replace: pooled with the speed-extra cell's samples of run 2 \(vendor 10, cua 10\)$/m);
  assert.doesNotMatch(renderSummary(before), /pooled/);
  // One lane's extra samples alone are no pair: nothing pooled.
  const lone = judgedWith([extra('vendor', 2, 100)]);
  for (const id of IDS) assert.equal(lone.speed.find(s => s.id === id).extra, undefined, id);
  // Split review: pooled only as the judge takes a full run's samples: each lane attesting its own side, and the run's
  // full pair one proof (pairable).
  const fallback = {...extra('cua', 2, 40), lanes: [{host: 'cua', engine: 'vendor', build: 'b-vendor', version: 'v'}]};
  for (const id of IDS) assert.equal(judgedWith([extra('vendor', 2, 100), fallback]).speed.find(s => s.id === id).extra, undefined, id);
  const torn = (engine, run, ms) => (engine === 'cua' && run === 2 ? {...full(engine, run, ms), meta: {...full(engine, run, ms).meta, commit: 'other'}} : full(engine, run, ms));
  for (const id of IDS) assert.equal(judgedWith([extra('vendor', 2, 100), extra('cua', 2, 40)], torn).speed.find(s => s.id === id).extra, undefined, id);
});
