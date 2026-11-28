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

// Ruling 1278 (c): Chrome's typeText.replace, which the full split on 0.3.3 missed on p95 alone, with them.
const IDS = ['chrome/method.typeText.replace', 'electron/method.paste.replace', 'textedit/method.paste.replace', 'textedit/method.typeText.replace'];
// Ruling 1232's controls: the base's most narrowly passing method timings on a scene the cell can bring up.
const CONTROLS = ['chrome/method.paste.replace', 'electron/method.pressKey.tab', 'textedit/method.getAXState.tree'];

test('the speed-extra cell times the four missed ops and their controls, --samples each, and is never the full plan', () => {
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
function judgedWith(extras, fullOf = full, {acceptedMisses = []} = {}) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'speed-extra-'));
  try {
    for (let n = 1; n <= 3; n++) for (const engine of ['vendor', 'cua']) writeCellResult(join(dir, engine, `run-${n}`), fullOf(engine, n, 40));
    extras.forEach((r, i) => writeCellResult(join(dir, 'speed-extra', `x-${i}`), r));
    const {results, problems} = readResults([dir]);
    return judge(results, problems, {departures: [], acceptedMisses});
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

// Each of the three runs' extra samples on both lanes: the vendor's at `vendorMs`, cua's at `cuaMs`.
const everyRun = (vendorMs, cuaMs, ids = IDS) => [1, 2, 3].flatMap(run => [extra('vendor', run, vendorMs, 10, ids), extra('cua', run, cuaMs, 10, ids)]);

test('ruling 1232: the four missed ops are judged on the re-measurement alone, n = 30 a side, the base shown beside it, a pass read as one on re-measurement', () => {
  const before = judgedWith([]);
  const after = judgedWith(everyRun(100, 40));
  for (const id of IDS) {
    const s = after.speed.find(x => x.id === id), base = before.speed.find(x => x.id === id);
    // The re-measurement alone: 30 samples a side, never the base's 3 pooled in.
    assert.deepEqual([s.beat, s.vendor.n, s.cua.n, s.vendor.median, s.cua.median], [true, 30, 30, 100, 40], id);
    assert.deepEqual(s.remeasured, {runs: [1, 2, 3], vendor: 30, cua: 30, need: {runs: 3, samples: 10}, short: []}, id);
    assert.deepEqual([s.base.vendor, s.base.cua, s.base.deltaPct, s.base.beat], [base.vendor, base.cua, base.deltaPct, false], id);
    assert.equal(after.cells.find(c => c.section === 'speed' && c.id === id).verdict, 'beat-remeasured', id);
  }
  assert.deepEqual(after.speed.filter(s => !IDS.includes(s.id)), before.speed.filter(s => !IDS.includes(s.id)), 'every other op judged as before');
  const text = renderSummary(after);
  assert.match(text, /^\| method\.paste\.replace \| 100\.0 \| 100\.0 \| 40\.0 \| 40\.0 \| -60% \| passes on re-measurement \|$/m);
  assert.doesNotMatch(text, /pooled with/);
  // The asymmetry, said plainly, and each re-measured op's base beside it.
  assert.match(text, /^4 ops were re-measured, at n = 30 a side \(the speed-extra cell, 10 samples a lane in each of runs 1, 2, 3\), and are judged on the re-measurement alone \(in the base, 4 of them missed the beat\); the other \d+ ops \(\d+ of them beating the vendor\) rest on the full runs' samples, n = 6 or 3 a side\. The base's samples are shown beside each re-measured op for reference, never pooled; a pass on re-measurement counts as a pass, and any other re-measured op stays the owner's unless it is an accepted miss \(rulings 1232, 1240\)\.$/m);
  assert.match(text, /^- method\.typeText\.replace: re-measured, n = 30 a side \(runs 1, 2, 3\); the base for reference \(n = 3 a side\): vendor median 40\.0, p95 40\.0; cua median 40\.0, p95 40\.0; change 0%; it missed the beat there$/m);
  assert.match(text, /^- \*\*Speed\*\*: \d+ of \d+ measured ops beat the vendor by at least 10% with p95 not worse, 4 of them on re-measurement \(ruling 1240\); \d+ missed \(the owner's fork\), /m);
});

// The split judge's compare reads its one combined dir (../hosted-sittings/plan.mjs: `compare <out>/combined`): the
// speed-extra records under it among the rest, as summary reads them.
test('compare over one combined dir reads the speed-extra records beneath it: the four ops judged on their re-measurement', async () => {
  const {main} = await import('../../scripts/native-matrix.mjs');
  const dir = fs.mkdtempSync(join(tmpdir(), 'speed-extra-compare-'));
  try {
    for (let n = 1; n <= 3; n++) for (const engine of ['vendor', 'cua']) writeCellResult(join(dir, engine, `run-${n}`), full(engine, n, 40));
    everyRun(100, 40).forEach(r => writeCellResult(join(dir, 'speed-extra', r.lanes[0].engine, `run-${r.meta.run}`), r));
    const lines = [], out = join(dir, 'comparison.md');
    await main(['compare', dir, '--out', out], {log: line => lines.push(line)});
    assert.ok(lines.some(l => /^VERDICT: /.test(l)), lines.join('\n'));
    for (const id of IDS) assert.ok(!lines.some(l => l.startsWith(`  owner: speed: ${id}`)), `${id}\n${lines.join('\n')}`);
    assert.match(fs.readFileSync(out, 'utf8'), /passes on re-measurement/);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('ruling 1232, as 1240 settles it: a pass on re-measurement counts as a pass; any other re-measured op is the owner\'s whatever its numbers', () => {
  const passed = judgedWith(everyRun(100, 40));
  assert.deepEqual(passed.owner.filter(o => IDS.some(id => o.includes(id))), [], 'a pass on re-measurement is no owner\'s fork (ruling 1240)');
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

// Ruling 1240: the owner accepted textedit/method.typeText.replace's miss, #593. A declaration (departures.json's
// acceptedMisses: section speed, the id, its ticket and its ruling) keeps the op judged and shown with its numbers, reads
// "accepted miss", blocks nothing and leaves the owner's list; an entry that names no speed row or cites no ticket or
// ruling applies to nothing and is itself blocking.
const ACCEPTED = {section: 'speed', id: 'textedit/method.typeText.replace', ticket: '#593', ruling: '1240'};
test('ruling 1240: an accepted miss is judged and shown with its numbers, read as accepted, off the owner\'s list and not blocking', () => {
  // On re-measurement: the other two pass, typeText.replace misses.
  const ms = id => (id === ACCEPTED.id ? 40 : 100);
  const plain = judgedWith(everyRun(ms, 40));
  const j = judgedWith(everyRun(ms, 40), full, {acceptedMisses: [ACCEPTED]});
  const s = j.speed.find(x => x.id === ACCEPTED.id);
  assert.deepEqual([s.beat, s.accepted, s.vendor.n, s.cua.n], [false, {ticket: '#593', ruling: '1240'}, 30, 30]);
  assert.equal(j.cells.find(c => c.section === 'speed' && c.id === ACCEPTED.id).verdict, 'accepted-miss');
  assert.equal(plain.cells.find(c => c.section === 'speed' && c.id === ACCEPTED.id).verdict, 'missed-remeasured');
  assert.ok(plain.owner.some(o => o.startsWith(`speed: ${ACCEPTED.id} missed the 10% beat on re-measurement (`)), plain.owner.join('\n'));
  assert.deepEqual(j.owner.filter(o => o.includes(ACCEPTED.id)), []);
  assert.deepEqual(j.blocking, plain.blocking);
  assert.deepEqual(j.acceptedMisses, [{section: 'speed', id: ACCEPTED.id, ticket: '#593', ruling: '1240', vendor: s.vendor, cua: s.cua, deltaPct: s.deltaPct, remeasured: s.remeasured}]);
  const text = renderSummary(j);
  assert.match(text, /^\| method\.typeText\.replace \| 40\.0 \| 40\.0 \| 40\.0 \| 40\.0 \| 0% \| accepted miss \(#593, ruling 1240\) \|$/m);
  assert.match(text, /^- \*\*Speed\*\*: \d+ of \d+ measured ops beat the vendor by at least 10% with p95 not worse, 3 of them on re-measurement \(ruling 1240\); 1 accepted miss \(not blocking\); \d+ missed \(the owner's fork\), /m);
  assert.match(text, /^## Accepted misses \(not blocking\)$/m);
  assert.match(text, /^- speed: textedit\/method\.typeText\.replace: accepted miss \(#593, ruling 1240\): cua 40 ms against 40 ms median, p95 40 against 40, n = 30 a side on re-measurement$/m);
  // Not re-measured: the plain miss accepted the same way.
  const base = judgedWith([], full, {acceptedMisses: [ACCEPTED]});
  assert.equal(base.cells.find(c => c.section === 'speed' && c.id === ACCEPTED.id).verdict, 'accepted-miss');
  assert.ok(!base.owner.some(o => o.includes(ACCEPTED.id)));
  // A beat is no miss: the declaration applies to nothing.
  const beat = judgedWith(everyRun(100, 40), full, {acceptedMisses: [ACCEPTED]});
  assert.equal(beat.cells.find(c => c.section === 'speed' && c.id === ACCEPTED.id).verdict, 'beat-remeasured');
  assert.deepEqual(beat.acceptedMisses, []);
});

test('ruling 1240: an accepted-miss entry that names no speed row, or cites no ticket or ruling, applies to nothing and is blocking', () => {
  for (const [entry, why] of [[{...ACCEPTED, section: 'method'}, /names no speed row/], [{...ACCEPTED, id: 'textedit/method.nothing'}, /names no speed row/],
    [{...ACCEPTED, ticket: undefined}, /cites no ticket/], [{...ACCEPTED, ruling: 'soon'}, /cites no ruling/]]) {
    const j = judgedWith([], full, {acceptedMisses: [entry]});
    assert.ok(j.blocking.some(b => /^accepted misses: /.test(b) && why.test(b)), `${JSON.stringify(entry)}\n${j.blocking.join('\n')}`);
    assert.equal(j.cells.find(c => c.section === 'speed' && c.id === ACCEPTED.id).verdict, 'missed');
  }
});

// Ruling 1278: the acceptance at C's n = 30 (docs/evidence/2026-11-27-m5-sitting-c-split: cua 300.7 ms median, p95 442;
// the vendor 304.9, p95 406) holds a re-measurement only while cua's median and p95, each as a ratio to the vendor's, are
// no worse than those; a base miss at n = 3 is not held to it.
const BOUND = {ruling: '1278', evidence: 'docs/evidence/2026-11-27-m5-sitting-c-split', n: 30, cua: {median: 300.7, p95: 442.0}, vendor: {median: 304.9, p95: 406.0}};
test('the committed declarations accept typeText.replace\'s miss under #593 and ruling 1240, bound by ruling 1278 to C\'s n = 30, and nothing else', async () => {
  const {readAcceptedMisses} = await import('../../scripts/native-matrix/departures.mjs');
  assert.deepEqual(readAcceptedMisses(), [{...ACCEPTED, bound: BOUND}]);
});

test('ruling 1278: a bounded acceptance holds while the re-measurement\'s cua/vendor ratios are no worse than the bound\'s, else the miss is the owner\'s with why', () => {
  const bounded = {...ACCEPTED, bound: BOUND};
  // Within: both ratios under the bound's (median 0.986, p95 1.089); the vendor is 300 throughout, cua 290: a miss (ratio 0.967).
  const within = judgedWith(everyRun(300, id => (id === ACCEPTED.id ? 290 : 100)), full, {acceptedMisses: [bounded]});
  const w = within.speed.find(x => x.id === ACCEPTED.id);
  assert.deepEqual([w.beat, w.accepted, w.acceptanceExceeded], [false, {ticket: '#593', ruling: '1240'}, undefined]);
  assert.ok(!within.owner.some(o => o.includes(ACCEPTED.id)), within.owner.join('\n'));
  // Worse: cua 330 against the vendor's 300 (1.1 on both median and p95): no longer accepted, the owner's, with why.
  const worse = judgedWith(everyRun(300, id => (id === ACCEPTED.id ? 330 : 100)), full, {acceptedMisses: [bounded]});
  const x = worse.speed.find(s => s.id === ACCEPTED.id);
  assert.equal(x.accepted, undefined);
  assert.deepEqual(x.acceptanceExceeded.worse, ['median', 'p95']);
  assert.equal(worse.cells.find(c => c.section === 'speed' && c.id === ACCEPTED.id).verdict, 'missed-remeasured');
  assert.deepEqual(worse.acceptedMisses, []);
  const line = worse.owner.find(o => o.startsWith(`speed: ${ACCEPTED.id} missed the 10% beat on re-measurement (`));
  assert.match(line ?? '', /; worse than #593's accepted bound \(ruling 1278, docs\/evidence\/2026-11-27-m5-sitting-c-split\) on median and p95: cua\/vendor median 1\.100 against 0\.986, p95 1\.100 against 1\.089, so no longer the accepted miss$/, worse.owner.join('\n'));
  // Not re-measured: the n = 3 base miss is not held to an n = 30 bound.
  const base = judgedWith([], full, {acceptedMisses: [bounded]});
  assert.equal(base.cells.find(c => c.section === 'speed' && c.id === ACCEPTED.id).verdict, 'accepted-miss');
  // A malformed bound applies to nothing and is blocking.
  const bad = judgedWith([], full, {acceptedMisses: [{...ACCEPTED, bound: {...BOUND, vendor: {median: 0, p95: 406}}}]});
  assert.ok(bad.blocking.some(b => /^accepted misses: .*'s bound names no ruling, evidence, n, or cua and vendor median and p95 above 0$/.test(b)), bad.blocking.join('\n'));
});

// Review of ruling 1278 (c): the bound is C's n = 30, so a re-measurement qualifies (a beat or a miss, the bound applied)
// only when every re-measured run holds SPEED_EXTRA_SAMPLES usable samples on both lanes, and at least the runs the rule
// asks for were re-measured. Short of that it is not qualified: the owner's, the counts said, the bound not evaluated.
test('a re-measurement qualifies only with SPEED_EXTRA_SAMPLES usable samples in each run on both lanes; short, the owner\'s with the counts and the bound not evaluated', async () => {
  const {SPEED_EXTRA_SAMPLES} = await import('../../scripts/hosted-sittings/plan.mjs');
  assert.equal(SPEED_EXTRA_SAMPLES, 10);
  const bounded = {...ACCEPTED, bound: BOUND};
  // Run 2's cua lane recorded 7 samples: worse than the bound on its numbers, but not qualified, so not held to it.
  const fewer = [1, 2, 3].flatMap(run => [extra('vendor', run, 300), extra('cua', run, id => (id === ACCEPTED.id ? 330 : 100), run === 2 ? 7 : 10)]);
  const j = judgedWith(fewer, full, {acceptedMisses: [bounded]});
  const s = j.speed.find(x => x.id === ACCEPTED.id);
  assert.deepEqual([s.beat, s.accepted, s.acceptanceExceeded], [null, undefined, undefined]);
  assert.deepEqual(s.remeasured, {runs: [1, 2, 3], vendor: 30, cua: 27, need: {runs: 3, samples: 10}, short: [{run: 2, vendor: 10, cua: 7}]});
  assert.equal(j.cells.find(c => c.section === 'speed' && c.id === ACCEPTED.id).verdict, 'no-verdict');
  assert.deepEqual(j.acceptedMisses, []);
  const line = j.owner.find(o => o.startsWith(`speed: ${ACCEPTED.id} not qualified on re-measurement (`));
  assert.match(line ?? '', /^speed: textedit\/method\.typeText\.replace not qualified on re-measurement \(run 2 holds 10 vendor and 7 cua usable samples, of the 10 a lane each re-measured run needs; cua 330 ms against 300 ms/, j.owner.join('\n'));
  assert.match(line, /: the owner's whatever the numbers \(ruling 1232\); #593's acceptance not evaluated: the re-measurement does not qualify$/);
  // An op that would pass is not qualified either: no pass on a short re-measurement.
  const other = j.speed.find(x => x.id === 'textedit/method.paste.replace');
  assert.deepEqual([other.beat, other.remeasured.short], [null, [{run: 2, vendor: 10, cua: 7}]]);
  // A sample with a cause is not usable: run 3's vendor lane holds 9.
  const invalid = r => (r.meta.run === 3 && r.lanes[0].engine === 'vendor' ? {...r, rows: r.rows.map((row, i) => (i === 0 ? {...row, ok: false, invalid: 'not prepared'} : row))} : r);
  const k = judgedWith(everyRun(100, 40).map(invalid)).speed.find(x => x.id === IDS[0]);
  assert.deepEqual([k.beat, k.remeasured.short], [null, [{run: 3, vendor: 9, cua: 10}]]);
  // Fewer runs than the rule asks: said by count.
  const one = judgedWith([extra('vendor', 2, 100), extra('cua', 2, 40)]);
  assert.match(one.owner.find(o => o.startsWith(`speed: ${IDS[0]} not qualified on re-measurement (`)) ?? '', /^speed: \S+ not qualified on re-measurement \(1 of the 3 runs it needs re-measured; cua 40 ms/);
  // Every run full: qualified as before.
  assert.deepEqual(judgedWith(everyRun(100, 40)).speed.find(x => x.id === IDS[0]).remeasured.short, []);
});

// Review of ruling 1278 (c): the re-measurement's sentence says what the base did, by count. In the planned run both
// paste.replace ops passed in the base and are re-timed beside the two that missed.
test('the re-measurement sentence counts the re-measured ops that missed and that passed in the base, never calling them all misses', () => {
  const fastPaste = (engine, run, ms) => {
    const r = full(engine, run, ms);
    return {...r, rows: r.rows.map(row => (row.id.endsWith('paste.replace') && engine === 'vendor' ? {...row, inCellMs: 100} : row))};
  };
  const j = judgedWith(everyRun(100, 40), fastPaste);
  assert.deepEqual(IDS.map(id => j.speed.find(s => s.id === id).base.beat), [false, true, true, false]);
  const text = renderSummary(j);
  assert.match(text, /^4 ops were re-measured, at n = 30 a side \(the speed-extra cell, 10 samples a lane in each of runs 1, 2, 3\), and are judged on the re-measurement alone \(in the base, 2 of them missed the beat and 2 of them beat it\); the other \d+ ops /m);
  assert.doesNotMatch(text, /that missed in the base/);
});

// Review of ruling 1278 (c): a ratio that cannot be formed (a median or p95 of 0) is no evidence of "worse": the bound
// could not be evaluated, said so, and the acceptance stays withheld.
test('a bound whose ratio cannot be formed is said not evaluated, not worse, and the acceptance stays withheld', async () => {
  const {acceptanceExceeded} = await import('../../scripts/native-matrix/departures.mjs');
  const bounded = {...ACCEPTED, bound: BOUND};
  const at = (vendor, cua) => ({remeasured: {runs: [1, 2, 3]}, vendor: {median: vendor, p95: vendor}, cua: {median: cua, p95: cua}});
  assert.deepEqual(acceptanceExceeded(bounded, at(0, 40)).worse, []);
  assert.deepEqual(acceptanceExceeded(bounded, at(0, 40)).unread, ['median', 'p95']);
  assert.deepEqual(acceptanceExceeded(bounded, at(300, 330)).unread, []);
  const j = judgedWith(everyRun(id => (id === ACCEPTED.id ? 0 : 300), id => (id === ACCEPTED.id ? 40 : 100)), full, {acceptedMisses: [bounded]});
  const s = j.speed.find(x => x.id === ACCEPTED.id);
  assert.deepEqual([s.beat, s.accepted], [false, undefined]);
  const line = j.owner.find(o => o.startsWith(`speed: ${ACCEPTED.id} missed the 10% beat on re-measurement (`)) ?? '';
  assert.match(line, /; #593's accepted bound \(ruling 1278, docs\/evidence\/2026-11-27-m5-sitting-c-split\) could not be evaluated \(cua\/vendor median unread, p95 unread\): the acceptance is withheld$/, j.owner.join('\n'));
  assert.doesNotMatch(line, /worse than/);
});
