// Ruling 1228 (E): a filtered rerun of run n replaces only its listed cells' rows of run n, both lanes together, in the
// full run's records; every replaced row names the job its evidence came from, and a cell that failed in the full run
// on its own verdict (not a missing proof) and passes only in the rerun is flagged, never silently replaced.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {cellResult, writeCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {combineReruns} from '../../scripts/native-matrix/combine.mjs';
import {main, parseCommand} from '../../scripts/native-matrix.mjs';
import {composingRetriesOf} from '../../scripts/native-matrix/composing-retries.mjs';
import {judge, splitPanelRuns} from '../../scripts/native-matrix/summary.mjs';

const A = 'method electron/frontmost/click.point', B = 'method savePanel/frontmost/typeText.name', C = 'method textedit/frontmost/click.element';
const idOf = key => key.slice(key.indexOf(' ') + 1);
const row = (key, engine, extra = {}) => ({section: key.split(' ')[0], id: idOf(key), engine, sample: 1, ok: true, ...extra});
const result = (engine, run, rows, meta = {}, top = {}) => ({path: `/x/${engine}/run-${run}/result.json`, result: {cell: 'matrix', lanes: [{engine, build: `b-${engine}`, version: 'v'}], rows,
  complete: true, verdict: 'pass', meta: {run, planId: 'full', commit: 'c1', runner: {run: {id: '45468052791', attempt: '1'}}, ...meta}, ...top}});
const base = run => ['vendor', 'cua'].map(engine => result(engine, run, [row(A, engine, {ok: false}), row(B, engine, engine === 'vendor' ? {ok: false, invalid: 'not prepared'} : {}), row(C, engine)]));
const rerun = (run, engine, rows, meta = {}, top = {}) => result(engine, run, rows, {planId: 'filtered', filter: [A, B], commit: 'c2', runner: {run: {id: '777', attempt: '2'}}, ...meta}, top);

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

test('a cell that failed in the full run and passes only in the rerun is flagged; one with a missing proof is not', () => {
  const reruns = ['vendor', 'cua'].map(engine => rerun(2, engine, [row(A, engine), row(B, engine)]));
  const {flags} = combineReruns(base(2), reruns);
  // A failed on both lanes (ok false, no invalid): its rows flagged; B's vendor row was invalid: a missing proof, no flag.
  assert.deepEqual(flags.map(f => [f.run, f.cell, f.full, f.rerun]), [[2, A, {runId: '45468052791', attempt: '1'}, {runId: '777', attempt: '2'}]]);
  assert.match(flags[0].why, /^its cua row failed in the full run and passes in the rerun$/);
});

// Ruling 1231: the owner's flags are cua's alone (its row, or the pair's verdict, from fail to not); a change on the
// vendor's side only goes to the parity list, never flagged.
test('a vendor-only fail to pass is listed as parity, not flagged; a cua row or a pair verdict from fail to not is flagged', () => {
  const pair = (run, {vendor = {}, cua = {}} = {}, meta = null) => ['vendor', 'cua'].map(engine => {
    const rows = [row(B, engine, engine === 'vendor' ? vendor : cua), row(C, engine)];
    return meta ? rerun(run, engine, rows, meta) : result(engine, run, rows);
  });
  // The vendor failed and cua passed in the base (the pair: better); both pass in the rerun (equal).
  const vendorOnly = combineReruns(pair(2, {vendor: {ok: false}}), pair(2, {}, {filter: [B]}));
  assert.deepEqual(vendorOnly.flags, []);
  assert.deepEqual(vendorOnly.vendorOnly.map(v => [v.run, v.cell, v.full, v.rerun]), [[2, B, {runId: '45468052791', attempt: '1'}, {runId: '777', attempt: '2'}]]);
  // The vendor's base sample had no verdict (the pair no verdict), cua's row failed: cua's own change, flagged.
  const cuaRow = combineReruns(pair(2, {vendor: {ok: false, invalid: 'not prepared'}, cua: {ok: false}}), pair(2, {}, {filter: [B]}));
  assert.deepEqual([cuaRow.flags.map(f => f.why), cuaRow.vendorOnly], [['its cua row failed in the full run and passes in the rerun'], []]);
  const verdict = combineReruns(pair(2, {cua: {ok: false}}), pair(2, {}, {filter: [B]}));
  assert.deepEqual(verdict.flags.map(f => f.why), ['its pair was judged fail in the full run and equal in the rerun']);
  assert.ok(verdict.flags.every(f => f.vendorRegressed === undefined));
});

// The coordinator's: the vendor's row passing in the full run and failing in the rerun, cua's failing in both, moves the
// pair from fail to shared: still flagged, its reason saying it is no gain of cua's.
test('a vendor pass to fail with cua failing in both is flagged as the pair now shared, never as cua\'s gain', () => {
  // A fixed-string row (ruling 1144): the same read-back failing on both engines is a shared limit.
  const LINES = 'unicode chrome/korean/typeText.lines';
  const falseOk = {ok: false, outcome: {exact: false, nfcEqual: false, length: 3, expectedLength: 5, hash: 'h1'}};
  const pair = (run, {vendor = {}, cua = {}} = {}, meta = null) => ['vendor', 'cua'].map(engine => {
    const rows = [row(LINES, engine, engine === 'vendor' ? vendor : cua), row(C, engine)];
    return meta ? rerun(run, engine, rows, meta) : result(engine, run, rows);
  });
  const shared = combineReruns(pair(2, {cua: falseOk}), pair(2, {vendor: falseOk, cua: falseOk}, {filter: [LINES]}));
  assert.deepEqual(shared.flags.map(f => [f.cell, f.why, f.vendorRegressed]), [[LINES, 'pair now shared: vendor regressed; cua unchanged (fail)', true]]);
  assert.deepEqual(shared.vendorOnly, []);
  // cua's own fail to pass keeps its wording.
  const gained = combineReruns(pair(2, {cua: falseOk}), pair(2, {}, {filter: [LINES]}));
  assert.deepEqual(gained.flags.map(f => [f.why, f.vendorRegressed]), [['its pair was judged fail in the full run and equal in the rerun', undefined]]);
});

// I5 of the split review: the cell judged per run, the full run's pair against the rerun's, as the judge reads it; a
// change from a failing verdict to another is flagged, whatever the rows' own ok said.
test('a cell whose pair failed the judge in the full run (cua worse than the vendor, or interfering) and not in the rerun is flagged', () => {
  const D = 'method textedit/background/click.element@finder';
  const held = {ok: true, frontmost: true, topWindow: true, focus: true, activations: 0, route4: false};
  const pair = (run, cua, meta) => ['vendor', 'cua'].map(engine => { const rows = [row(D, engine, {regime: 'background', interference: held, ...(engine === 'cua' ? cua : {})}), row(C, engine)]; return meta ? rerun(run, engine, rows, meta) : result(engine, run, rows); });
  const interfered = combineReruns(pair(2, {interference: {...held, ok: false, frontmost: false}}), pair(2, {}, {filter: [D]}));
  assert.deepEqual(interfered.flags.map(f => [f.cell, f.why]), [[D, 'its pair was judged fail in the full run and equal in the rerun']]);
  // A cua sample worse than the vendor's in the full run.
  const worse = combineReruns(['vendor', 'cua'].map(engine => result(engine, 2, [row(B, engine, engine === 'cua' ? {ok: false} : {}), row(C, engine)])),
    ['vendor', 'cua'].map(engine => rerun(2, engine, [row(B, engine)], {filter: [B]})));
  assert.deepEqual(worse.flags.map(f => f.why), ['its pair was judged fail in the full run and equal in the rerun'], 'judged before the rows: a cua row failing alone reads worse');
  const same = combineReruns(pair(2, {}), pair(2, {}, {filter: [D]}));
  assert.deepEqual(same.flags, [], 'a pass that stays one is no flag');
});

// I4 of the split review: a rerun's pair is combined only as the judge would take a full run's: both lanes complete, not
// refused, each attesting its own side (ruling 1149), on one frame (ruling 1169); else nothing of it is.
test('a rerun pair that is incomplete, refused, attesting the other side or on two frames is not combined, said', () => {
  const lanes = (overrides = {}) => ['vendor', 'cua'].map(engine => rerun(2, engine, [row(A, engine), row(B, engine)], overrides[engine]?.meta ?? {}, overrides[engine]?.top ?? {}));
  const refusedOf = overrides => combineReruns(base(2), lanes(overrides));
  const incomplete = refusedOf({cua: {top: {complete: false, verdict: 'no-verdict'}}});
  assert.match(incomplete.problems[0], /^run 2's filtered rerun \(job 777, attempt 2\): its cua lane is not complete: not combined$/);
  assert.equal(incomplete.combined.length, 0);
  assert.match(refusedOf({vendor: {top: {verdict: 'refused', complete: false}}}).problems[0], /its vendor lane was refused: not combined$/);
  const fallback = combineReruns(base(2), [rerun(2, 'vendor', [row(A, 'vendor'), row(B, 'vendor')]), {...rerun(2, 'cua', [row(A, 'cua'), row(B, 'cua')]), result: {...rerun(2, 'cua', []).result, rows: [row(A, 'cua'), row(B, 'cua')], lanes: [{engine: 'vendor', build: 'b', version: 'v'}]}}]);
  assert.ok(fallback.problems.some(p => /has no cua lane|attested/.test(p)), fallback.problems.join('\n'));
  const frame = (x) => ({meta: {venue: {frames: {electron: {x, y: 0, width: 800, height: 600}}}}});
  const apart = refusedOf({vendor: frame(0), cua: frame(40)});
  assert.match(apart.problems[0], /: its lanes did not stand on one frame \(.*\): not combined$/);
  assert.deepEqual(refusedOf({vendor: frame(0), cua: frame(0)}).problems, []);
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
  assert.deepEqual(combined, [['/o/vendor/run-2', 2, 'vendor', 1], ['/o/cua/run-2', 2, 'cua', 1]]);
  assert.ok(lines.some(l => /^combined run 2 from job 777 attempt 2: 2 cell\(s\)$/.test(l)), lines.join('\n'));
  assert.ok(lines.some(l => /^FLAG: method electron\/frontmost\/click\.point, run 2: its cua row failed/.test(l)), lines.join('\n'));
});

test('F: combine writes a speed-extra cell\'s records through as they are, beside the combined lanes, and nothing else of another cell', async () => {
  const speedExtra = engine => ({path: `/j/speed-extra/${engine}/run-2/result.json`, result: {cell: 'speed-extra', lanes: [{engine}], rows: [], meta: {run: 2, planId: 'speed-extra'}}});
  const sheet = {path: '/j/save-sheet/cua/run-2/result.json', result: {cell: 'intervention-save-sheet', lanes: [{engine: 'cua'}], rows: [], meta: {run: 2}}};
  const written = [];
  const io = {readResults: () => ({results: [...base(2), speedExtra('vendor'), speedExtra('cua'), sheet], problems: []}), writeResult: dir => { written.push(dir); }, writeJson: () => {}};
  await main(['combine', '/j', '--out', '/o'], {log: () => {}, io: {combine: io}});
  assert.deepEqual(written, ['/o/vendor/run-2', '/o/cua/run-2', '/o/speed-extra/vendor/run-2', '/o/speed-extra/cua/run-2']);
});

// C1/I6 of the split review: the real CLI, as the judge job runs it. combine exits 0 when it combined everything, 4 (NO
// VERDICT) when a rerun could not be combined, and the judges read its problems from combined.json as missing proof.
test('the real combine CLI exits an integer, NO VERDICT on a problem, and summary carries each problem as missing proof', () => {
  const root = fs.mkdtempSync(join(tmpdir(), 'combine-cli-'));
  const cli = (...args) => spawnSync(process.execPath, ['scripts/native-matrix.mjs', ...args], {encoding: 'utf8'});
  const valid = (engine, run, planId, extra = {}) => cellResult({cell: 'matrix', device: 'mini', started: '2026-11-27T00:00:00Z', lanes: [{host: engine, engine, build: `b-${engine}`, version: 'v'}], complete: true,
    rows: [row(A, engine), row(C, engine)], meta: {run, samples: 1, sitting: 's', commit: 'c1', planId, runner: {run: {id: '45468052791', attempt: '1'}}, ...extra}});
  try {
    for (const engine of ['vendor', 'cua']) writeCellResult(join(root, 'base', engine, 'run-2'), valid(engine, 2, 'full'));
    const clean = cli('combine', join(root, 'base'), '--out', join(root, 'combined'));
    assert.equal(clean.status, 0, clean.stderr);
    assert.match(clean.stdout, /^VERDICT: PASS$/m);
    // A rerun with its cua lane missing: not combined, a problem, NO VERDICT.
    writeCellResult(join(root, 'job', 'vendor', 'run-2'), valid('vendor', 2, 'filtered', {filter: [A], runner: {run: {id: '9', attempt: '1'}}}));
    const lone = cli('combine', join(root, 'base'), join(root, 'job'), '--out', join(root, 'combined-2'));
    assert.equal(lone.status, 4, lone.stderr);
    assert.match(lone.stdout, /^VERDICT: NO VERDICT$/m);
    const summary = cli('summary', join(root, 'combined-2'), '--out', join(root, 'summary.md'));
    assert.match(fs.readFileSync(join(root, 'summary.md'), 'utf8'), /combine: run 2's filtered rerun \(job 9, attempt 1\) has no cua lane: not combined/, summary.stderr);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

// The run-level meta the judge reads per cell follows the rows combine replaces: a replaced composing group's readings
// (its attempts and the readings around them) and a replaced panel opening's placement come from the rerun's job, each
// naming it; the full run's stay for every cell the rerun did not replace.
test('a rerun\'s composing readings and panel placements replace the full run\'s for the cells it replaced, each naming its job', () => {
  const GROUP_CELLS = ['unicode textedit/composing@electron/typeText.latin', 'unicode electron/composing@textedit/typeText.latin', 'unicode chrome/composing@textedit/typeText.latin'];
  const PANEL = 'method openPanel/background/getAXState.panel@finder', KEPT_PANEL = 'method openPanel/frontmost/getAXState.panel';
  const frame = x => ({x, y: 80, width: 880, height: 448});
  // The full run: old-format readings (no group, no attempt), its panel at -60 on the vendor and -58 on cua.
  const oldReadings = [{when: 'composing@electron:end'}, {when: 'composing@electron', composed: true}, {when: 'composing@textedit', composed: false}, {when: 'composing@textedit', composed: false}, {when: 'latin:textedit'}];
  const fullOf = (engine, run) => result(engine, run, [...GROUP_CELLS, PANEL, KEPT_PANEL, C].map(k => row(k, engine, k.includes('openPanel') ? {opening: idOf(k).includes('background') ? 'openPanel/background@finder' : idOf(k)} : {})),
    {unicode: {readings: oldReadings}, placement: {scenes: {}, panel: [{opening: 'openPanel/frontmost/getAXState.panel', readBack: frame(-58)}, {opening: 'openPanel/background@finder', readBack: frame(engine === 'vendor' ? -60 : -58)}]}});
  // The rerun: new-format readings, the vendor retrying in two groups, cua in none; both panels at -58.
  const attempt = (user, group, n, composed) => [{when: `composing@${user}:end`}, {when: `composing@${user} pre-refocus`}, {when: `composing@${user} post-refocus`}, {when: `composing@${user}`, group, attempt: n, composed}];
  const newReadings = engine => [{when: 'latin:textedit'}, ...attempt('electron', 'textedit@electron', 1, true),
    ...(engine === 'vendor' ? [...attempt('textedit', 'electron@textedit', 1, false), ...attempt('textedit', 'electron@textedit', 2, false), ...attempt('textedit', 'electron@textedit', 3, true),
      ...attempt('textedit', 'chrome@textedit', 1, false), ...attempt('textedit', 'chrome@textedit', 2, true)]
      : [...attempt('textedit', 'electron@textedit', 1, true), ...attempt('textedit', 'chrome@textedit', 1, true)])];
  const rerunOf = engine => rerun(2, engine, [...GROUP_CELLS, PANEL].map(k => row(k, engine, k === PANEL ? {opening: 'openPanel/background@finder'} : {})),
    {filter: [...GROUP_CELLS, PANEL], unicode: {readings: newReadings(engine)}, placement: {scenes: {}, panel: [{opening: 'openPanel/background@finder', readBack: frame(-58)}]}});
  const before = ['vendor', 'cua'].map(e => fullOf(e, 2));
  assert.equal(splitPanelRuns(before).get(2)?.has('openPanel/background@finder'), true, 'the full run alone splits the opening');
  const out = combineReruns(before, ['vendor', 'cua'].map(rerunOf));
  assert.deepEqual(out.problems, []);
  const lane = engine => out.results.find(r => r.result.lanes[0].engine === engine).result;
  for (const engine of ['vendor', 'cua']) {
    const {readings} = lane(engine).meta.unicode, panel = lane(engine).meta.placement.panel;
    // The full run's composing readings are gone, its other readings kept; the rerun's carry the job.
    assert.ok(!readings.some(r => r.when.startsWith('composing@') && r.evidence === undefined), engine);
    assert.ok(readings.some(r => r.when === 'latin:textedit' && r.evidence === undefined), 'a reading of no replaced cell is the full run\'s');
    assert.ok(readings.filter(r => r.when.startsWith('composing@')).every(r => r.evidence?.runId === '777'));
    assert.equal(readings.filter(r => r.when === 'latin:textedit').length, 1, 'the rerun\'s readings of no replaced group are not taken');
    assert.deepEqual(panel.map(p => [p.opening, p.readBack.x, p.evidence?.runId ?? null]), [['openPanel/frontmost/getAXState.panel', -58, null], ['openPanel/background@finder', -58, '777']]);
  }
  assert.equal(splitPanelRuns(out.results).size, 0, 'the replaced opening stands on the rerun\'s frames');
  const retries = composingRetriesOf(out.results);
  assert.deepEqual([retries.lanes.vendor.retries, retries.lanes.vendor.groups, retries.lanes.cua.retries], [3, 2, 0]);
  assert.match(retries.findings[0], /^composing retries are lopsided: the vendor lane needed a retry in 2 groups/);
  // A full run whose old-format readings name a user window some of whose groups the rerun did not replace cannot be
  // told apart: a problem, never a silent mix.
  const partial = combineReruns(['vendor', 'cua'].map(e => fullOf(e, 2)), ['vendor', 'cua'].map(e => ({...rerunOf(e), result: {...rerunOf(e).result,
    rows: rerunOf(e).result.rows.filter(r => !r.id.startsWith('chrome/')), meta: {...rerunOf(e).result.meta, filter: [GROUP_CELLS[0], GROUP_CELLS[1], PANEL]}}})));
  assert.ok(partial.problems.some(p => /composing@textedit's readings in the full run name no group, and the rerun replaced only some of its groups \(electron@textedit\)/.test(p)), partial.problems.join('\n'));
});

// A whole-run frame split in the full run is the full run's: the rows a rerun replaced stand on the rerun's frames, which
// combine checked (its lanes on one frame).
test('a replaced row is judged on its rerun\'s frames, not the full run\'s whole-run split', () => {
  const venue = x => ({venue: {frames: {textedit: {x, y: 0, width: 800, height: 600}}}});
  const before = ['vendor', 'cua'].map(engine => result(engine, 2, [row(A, engine, {ok: false}), row(C, engine)], venue(engine === 'vendor' ? 0 : 4)));
  const reruns = ['vendor', 'cua'].map(engine => rerun(2, engine, [row(A, engine)], {filter: [A], ...venue(0)}));
  const out = combineReruns(before, reruns);
  assert.deepEqual(out.problems, []);
  const j = judge(out.results, [], {departures: []});
  const rowsOf = key => j.methods.find(m => `method ${m.id}` === key);
  assert.equal(rowsOf(A).account.cua.noVerdict.venue ?? 0, 0, 'the rerun\'s row is not the full run\'s venue');
  assert.ok((rowsOf(C).account.cua.noVerdict.venue ?? 0) > 0, 'the full run\'s own row keeps its split');
});

