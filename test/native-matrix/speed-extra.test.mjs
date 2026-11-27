// Ruling 1228 (F): the three speed ops the full sitting C missed (electron and TextEdit paste.replace, TextEdit
// typeText.replace) may be re-timed in a run job, behind a flag off by default: `--samples` more samples of each on both
// lanes, each case run on its own prepare as the full run runs it (TextEdit's document written back whole between
// samples, unrecorded), recorded as the run's extra speed samples (cell speed-extra). Ruling 1232: the judge judges those
// three ops on the extra samples alone (never pooled), the base's beside them for reference, each the owner's whatever its
// numbers; the base's most narrowly passing ops the cell can host are re-timed beside them as controls, reported and
// never judged. Without the extra samples nothing changes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cellResult, writeCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {manifestOf} from '../../scripts/native-matrix/manifest.mjs';
import {MATRIX_CELLS} from '../../scripts/native-matrix/registry.mjs';
import {planOf, SPEED_CONTROL_IDS, SPEED_EXTRA_IDS} from '../../scripts/native-matrix/run.mjs';
import {judge, readResults, renderSummary} from '../../scripts/native-matrix/summary.mjs';
import {runWith} from './run-doubles.mjs';

const IDS = ['electron/method.paste.replace', 'textedit/method.paste.replace', 'textedit/method.typeText.replace'];
// Ruling 1232's controls: the base's most narrowly passing method timings on a scene the cell can bring up.
const CONTROLS = ['chrome/method.paste.replace', 'electron/method.pressKey.tab', 'textedit/method.getAXState.tree'];

test('the speed-extra cell times the three missed ops and their controls, --samples each, and is never the full plan', () => {
  assert.deepEqual([...SPEED_EXTRA_IDS].sort(), IDS);
  assert.deepEqual([...SPEED_CONTROL_IDS].sort(), CONTROLS);
  assert.ok(MATRIX_CELLS['speed-extra']);
  const plan = planOf('speed-extra');
  assert.equal(plan.id, 'speed-extra');
  assert.deepEqual([...plan.frontmost].sort(), ['chrome', 'electron', 'textedit']);
  assert.deepEqual(manifestOf({run: 2, samples: 3}, plan).map(r => `${r.id}#${r.sample}`).sort(), [...IDS, ...CONTROLS].flatMap(id => [1, 2, 3].map(s => `${id}#${s}`)).sort());
  assert.equal(planOf('matrix').speedExtra, undefined, 'the full matrix is unchanged');
});

test('a speed-extra run records each op\'s samples on its own prepare, TextEdit\'s document written back between samples', async () => {
  const calls = [];
  const {result} = await runWith({plan: planOf('speed-extra'), cellName: 'speed-extra', calls});
  assert.deepEqual(result.rows.map(r => `${r.section} ${r.id}#${r.sample}`).sort(), [...IDS, ...CONTROLS].flatMap(id => [1, 2].map(s => `speed ${id}#${s}`)).sort());
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
const extra = (engine, run, ms, n = 10, ids = IDS) => cellResult({cell: 'speed-extra', device: 'mini', started: '2026-11-27T00:00:00Z', lanes: [{host: engine, engine, build: `b-${engine}`, version: 'v'}], complete: true,
  rows: ids.flatMap(id => Array.from({length: n}, (_, i) => ({section: 'speed', id, engine, sample: i + 1, ok: true, inCellMs: typeof ms === 'function' ? ms(id) : ms}))),
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

// Each of the three runs' extra samples on both lanes: the vendor's at `vendorMs`, cua's at `cuaMs`.
const everyRun = (vendorMs, cuaMs, ids = IDS) => [1, 2, 3].flatMap(run => [extra('vendor', run, vendorMs, 10, ids), extra('cua', run, cuaMs, 10, ids)]);

test('ruling 1232: the three missed ops are judged on the re-measurement alone, n = 30 a side, the base shown beside it, a pass read as one on re-measurement', () => {
  const before = judgedWith([]);
  const after = judgedWith(everyRun(100, 40));
  for (const id of IDS) {
    const s = after.speed.find(x => x.id === id), base = before.speed.find(x => x.id === id);
    // The re-measurement alone: 30 samples a side, never the base's 3 pooled in.
    assert.deepEqual([s.beat, s.vendor.n, s.cua.n, s.vendor.median, s.cua.median], [true, 30, 30, 100, 40], id);
    assert.deepEqual(s.remeasured, {runs: [1, 2, 3], vendor: 30, cua: 30}, id);
    assert.deepEqual([s.base.vendor, s.base.cua, s.base.deltaPct, s.base.beat], [base.vendor, base.cua, base.deltaPct, false], id);
    assert.equal(after.cells.find(c => c.section === 'speed' && c.id === id).verdict, 'beat-remeasured', id);
  }
  assert.deepEqual(after.speed.filter(s => !IDS.includes(s.id)), before.speed.filter(s => !IDS.includes(s.id)), 'every other op judged as before');
  const text = renderSummary(after);
  assert.match(text, /^\| method\.paste\.replace \| 100\.0 \| 100\.0 \| 40\.0 \| 40\.0 \| -60% \| passes on re-measurement \|$/m);
  assert.doesNotMatch(text, /pooled with/);
  // The asymmetry, said plainly, and each re-measured op's base beside it.
  assert.match(text, /^Only the 3 ops that missed in the base were re-measured, at n = 30 a side \(the speed-extra cell, 10 samples a lane in each of runs 1, 2, 3\), and are judged on the re-measurement alone; the other \d+ ops \(\d+ of them beating the vendor\) rest on the full runs' samples, n = 6 or 3 a side\. The base's samples are shown beside each re-measured op for reference, never pooled; each stays the owner's whatever its numbers \(ruling 1232\)\.$/m);
  assert.match(text, /^- method\.typeText\.replace: re-measured, n = 30 a side \(runs 1, 2, 3\); the base for reference \(n = 3 a side\): vendor median 40\.0, p95 40\.0; cua median 40\.0, p95 40\.0; change 0%; it missed the beat there$/m);
  assert.match(text, /^- \*\*Speed\*\*: \d+ of \d+ measured ops beat the vendor by at least 10% with p95 not worse; 3 pass on re-measurement \(the owner's, ruling 1232\); /m);
});

// The split judge's compare reads its one combined dir (../hosted-sittings/plan.mjs: `compare <out>/combined`): the
// speed-extra records under it among the rest, as summary reads them.
test('compare over one combined dir reads the speed-extra records beneath it: the three ops judged on their re-measurement', async () => {
  const {main} = await import('../../scripts/native-matrix.mjs');
  const dir = fs.mkdtempSync(join(tmpdir(), 'speed-extra-compare-'));
  try {
    for (let n = 1; n <= 3; n++) for (const engine of ['vendor', 'cua']) writeCellResult(join(dir, engine, `run-${n}`), full(engine, n, 40));
    everyRun(100, 40).forEach(r => writeCellResult(join(dir, 'speed-extra', r.lanes[0].engine, `run-${r.meta.run}`), r));
    const lines = [], out = join(dir, 'comparison.md');
    await main(['compare', dir, '--out', out], {log: line => lines.push(line)});
    assert.ok(lines.some(l => /^VERDICT: /.test(l)), lines.join('\n'));
    for (const id of IDS) assert.ok(lines.some(l => l.startsWith(`  owner: speed: ${id} passes on re-measurement (`)), `${id}\n${lines.join('\n')}`);
    assert.match(fs.readFileSync(out, 'utf8'), /passes on re-measurement/);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('ruling 1232: a re-measured op is the owner\'s whatever its numbers', () => {
  const passed = judgedWith(everyRun(100, 40));
  for (const id of IDS) assert.ok(passed.owner.some(o => o.startsWith(`speed: ${id} passes on re-measurement (cua 40 ms against 100 ms, p95 40 against 100, n = 30 a side; the base's n = 3: cua 40 ms against 40 ms): the owner's whatever the numbers (ruling 1232)`)), `${id}\n${passed.owner.join('\n')}`);
  assert.ok(!passed.owner.some(o => IDS.some(id => o.startsWith(`speed: ${id} missed the 10% beat (`))), 'no plain miss for a re-measured op');
  const missed = judgedWith(everyRun(40, 40));
  for (const id of IDS) {
    assert.equal(missed.speed.find(s => s.id === id).beat, false, id);
    assert.ok(missed.owner.some(o => o.startsWith(`speed: ${id} missed the 10% beat on re-measurement (`)), id);
  }
  assert.match(renderSummary(missed), /^\| method\.paste\.replace \| 40\.0 \| 40\.0 \| 40\.0 \| 40\.0 \| 0% \| \*\*no\*\* on re-measurement \|$/m);
  // Fewer runs re-measured than the rule asks: not qualified, NO VERDICT by cell, still the owner's.
  const short = judgedWith([extra('vendor', 2, 100), extra('cua', 2, 40)]);
  for (const id of IDS) {
    const s = short.speed.find(x => x.id === id);
    assert.deepEqual([s.beat, s.remeasured.runs], [null, [2]], id);
    assert.ok(short.owner.some(o => o.startsWith(`speed: ${id} not qualified on re-measurement (`)), id);
  }
  assert.ok(short.missing.some(m => /cell\(s\) do not qualify/.test(m)));
});

test('ruling 1232: the controls are re-measured and reported beside their base, never judged on it', () => {
  const before = judgedWith([]);
  const after = judgedWith(everyRun(id => (CONTROLS.includes(id) ? 50 : 100), 40, [...IDS, ...CONTROLS]));
  assert.deepEqual(after.speed.filter(s => !IDS.includes(s.id)), before.speed.filter(s => !IDS.includes(s.id)), 'a control\'s speed entry is the base\'s, untouched');
  assert.deepEqual(after.speedControls.map(c => [c.id, c.vendor.n, c.cua.n, c.vendor.median, c.cua.median, c.base.vendor.median]), CONTROLS.map(id => [id, 30, 30, 50, 40, 40]));
  assert.ok(after.speedControls.every(c => c.beat === undefined), 'no control carries a beat');
  assert.ok(!after.owner.some(o => CONTROLS.some(id => o.includes(id) && o.includes('re-measurement'))), after.owner.join('\n'));
  const text = renderSummary(after);
  assert.match(text, /^### Controls \(re-measured, not judged; ruling 1232\)$/m);
  assert.match(text, /^\| chrome\/method\.paste\.replace \| 50\.0 \| 50\.0 \| 40\.0 \| 40\.0 \| -20% \| 40\.0 \| 40\.0 \| 0% \|$/m);
});

test('without extra samples the speed verdict and the report are as they were', () => {
  const before = judgedWith([]);
  for (const id of IDS) assert.equal(before.speed.find(s => s.id === id).beat, false, id);
  assert.ok(before.speed.every(s => s.remeasured === undefined && s.base === undefined));
  assert.deepEqual(before.speedControls, []);
  assert.ok(before.owner.some(o => o.startsWith(`speed: ${IDS[0]} missed the 10% beat (`)));
  const text = renderSummary(before);
  assert.doesNotMatch(text, /re-measure|Controls/);
  // One lane's extra samples alone are no pair: nothing re-measured.
  const lone = judgedWith([extra('vendor', 2, 100)]);
  for (const id of IDS) assert.equal(lone.speed.find(s => s.id === id).remeasured, undefined, id);
  // Split review: taken only as the judge takes a full run's samples: each lane attesting its own side, and the run's
  // full pair one proof (pairable).
  const fallback = {...extra('cua', 2, 40), lanes: [{host: 'cua', engine: 'vendor', build: 'b-vendor', version: 'v'}]};
  for (const id of IDS) assert.equal(judgedWith([extra('vendor', 2, 100), fallback]).speed.find(s => s.id === id).remeasured, undefined, id);
  const torn = (engine, run, ms) => (engine === 'cua' && run === 2 ? {...full(engine, run, ms), meta: {...full(engine, run, ms).meta, commit: 'other'}} : full(engine, run, ms));
  for (const id of IDS) assert.equal(judgedWith([extra('vendor', 2, 100), extra('cua', 2, 40)], torn).speed.find(s => s.id === id).remeasured, undefined, id);
});
