// The matrix's judgment and report (scripts/native-matrix/summary.mjs): methods sample for sample in front and against
// ground truth behind, the 10% beat, the finding rule with its parity, non-interference with declared causes, the
// launch path judged on its own outcome, the proof (full runs only, the manifest, one sitting, three attested runs per
// side) and any other cell's result read in the same shape.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cellResult, writeCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {judge, judgeMethod, judgeSpeed, manifestOf, readResults, renderSummary} from '../../scripts/native-matrix/summary.mjs';

const m = (engine, sample, ok, extra = {}) => ({section: 'method', id: 'textedit/frontmost/click.control', engine, sample, ok, regime: 'frontmost', method: 'click', case: 'control', ...extra});

test('a frontmost method row is judged sample for sample against the vendor; a background one against ground truth', () => {
  assert.equal(judgeMethod('frontmost', [m('vendor', 1, true), m('vendor', 2, false)], [m('cua', 1, true), m('cua', 2, false)]).verdict, 'equal');
  assert.equal(judgeMethod('frontmost', [m('vendor', 1, false)], [m('cua', 1, true)]).verdict, 'better');
  assert.equal(judgeMethod('frontmost', [m('vendor', 1, true), m('vendor', 2, false)], [m('cua', 1, false), m('cua', 2, true)]).verdict, 'worse', 'better on one sample does not buy back a worse one');
  assert.equal(judgeMethod('frontmost', [m('vendor', 1, true)], [m('cua', 1, false, {invalid: 'not in front'})]).verdict, 'no-verdict');
  assert.equal(judgeMethod('frontmost', [m('vendor', 1, true, {invalid: 'x'})], [m('cua', 1, false)]).verdict, 'worse', 'an unpaired cua sample must pass on its own');
  assert.equal(judgeMethod('background', [m('vendor', 1, false)], [m('cua', 1, true)]).verdict, 'better');
  assert.equal(judgeMethod('background', [], [m('cua', 1, true), m('cua', 2, false)]).verdict, 'worse');
  const routes = judgeMethod('frontmost', [m('vendor', 1, true)], [m('cua', 1, true, {inputRoute: 3}), m('cua', 2, true, {inputRoute: "2'"})]).routes;
  assert.deepEqual(routes, {vendor: [null], cua: [3, "2'"]});
});

test('the speed beat: cua\'s median at most 90% of the vendor\'s and its p95 not worse', () => {
  const rows = (engine, times) => times.map((t, i) => ({section: 'speed', id: 'textedit/getAXState', engine, sample: i + 1, ok: true, inCellMs: t}));
  assert.equal(judgeSpeed(rows('vendor', [50, 50, 50]), rows('cua', [45, 45, 45])).beat, true);
  assert.equal(judgeSpeed(rows('vendor', [50, 50, 50]), rows('cua', [46, 46, 46])).beat, false);
  assert.equal(judgeSpeed(rows('vendor', [50, 50, 50]), rows('cua', [40, 40, 60])).beat, false, 'p95 worse');
  assert.equal(judgeSpeed(rows('vendor', [50]), []).beat, null);
  assert.equal(judgeSpeed(rows('vendor', [50, 50]), rows('cua', [40, 40])).deltaPct, -20);
});

// One full matrix run of one engine, every manifest row present and passing; `tweak(rows)` edits the rows, `meta` and
// `lane` the result's.
const CLICK = 'textedit/frontmost/click.control', BACK = 'textedit/background/click.control@finder', LAUNCH = 'textedit/background/launch@finder';
function fullRun(engine, run, {axMs = 40, resolved = 10, tweak = rows => rows, meta = {}, lane = {}, complete = true} = {}) {
  const samples = 2;
  const rows = manifestOf({run, samples}).map(({section, id, sample}) => {
    const row = {section, id, engine, sample, ok: true};
    if (section === 'method') {
      const [target, regime, rest] = id.split('/');
      const [mc, user] = rest.split('@');
      Object.assign(row, {target, regime, method: mc.slice(0, mc.indexOf('.')), case: mc.slice(mc.indexOf('.') + 1), inputRoute: engine === 'cua' ? 3 : null, ...(user ? {user} : {})});
      if (regime === 'background') row.interference = {ok: true, frontmost: true, topWindow: true, focus: true, activations: 0, route4: false};
    }
    if (section === 'launch') row.interference = {ok: true, frontmost: true, topWindow: true, focus: true, activations: 0, route4: false};
    if (section === 'speed') row.inCellMs = axMs;
    if (section === 'finding') {
      const target = /\/target\./.test(id) ? manifestOf({run, samples}).filter(e => e.id.startsWith(id.slice(0, id.indexOf('/') + 1)) && /\/target\./.test(e.id)).findIndex(e => e.id === id) : -1;
      row.outcome = id.endsWith('/lines') ? {lines: 100, named: 60, unclassified: 0} : id.endsWith('/ids') ? {ids: 1} : {found: target < resolved, resolved: target < resolved};
    }
    return row;
  });
  return cellResult({cell: 'matrix', device: 'mini', started: '2026-10-21T00:00:00Z', lanes: [{host: engine, engine, build: `b-${engine}`, version: 'v', ...lane}], complete, rows: tweak(rows),
    meta: {run, samples, sitting: 's1', commit: 'c', os: '26.0', planId: 'full', ...meta}});
}
const set = (id, patch) => rows => rows.map(r => (r.id === id ? {...r, ...patch} : r));
// Three full runs per side unless given; `extra` results written beside them.
function judged({vendor = {}, cua = {}, runs = 3, extra = []} = {}) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'matrix-summary-'));
  try {
    for (let n = 1; n <= runs; n++) {
      writeCellResult(join(dir, 'vendor', `run-${n}`), fullRun('vendor', n, vendor));
      writeCellResult(join(dir, 'cua', `run-${n}`), fullRun('cua', n, cua));
    }
    extra.forEach((r, i) => writeCellResult(join(dir, `other-${i}`), r));
    const {results, problems} = readResults([dir]);
    return judge(results, problems);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

test('the verdict: a worse method, a launch that failed, a lower finding measure or an interfering row fails; misses and parity go to the owner', () => {
  const pass = judged({vendor: {axMs: 50, resolved: 9}, cua: {axMs: 40}});
  assert.deepEqual([pass.blocking, pass.missing], [[], []]);
  assert.equal(pass.verdict, 'PASS');
  assert.equal(pass.findingVerdict, 'pass');
  assert.ok(pass.speed.every(sp => sp.beat === true));

  assert.equal(judged({cua: {tweak: set(CLICK, {ok: false})}}).verdict, 'FAIL');
  const launch = judged({vendor: {resolved: 9}, cua: {tweak: set(LAUNCH, {ok: false, outcome: {scene: false, panel: true}})}});
  assert.equal(launch.verdict, 'FAIL', 'a launch that never reached the run\'s window blocks, whatever its interference');
  assert.ok(launch.blocking.includes(`launch: ${LAUNCH} did not launch on cua`));
  assert.equal(judged({cua: {resolved: 9}}).findingVerdict, 'fail');
  assert.equal(judged().findingVerdict, 'parity');
  const interfering = judged({vendor: {resolved: 9}, cua: {tweak: set(BACK, {interference: {ok: false, frontmost: false, topWindow: true, activations: 1, route4: false}})}});
  assert.ok(interfering.blocking.includes(`not interfering: ${BACK} failed on cua`));
  const slow = judged({vendor: {axMs: 40, resolved: 9}, cua: {axMs: 39}});
  assert.equal(slow.verdict, 'OWNER');
  assert.ok(slow.owner.some(o => /missed the 10% beat/.test(o)));
});

test('missing proof is NO VERDICT, never a pass: fewer than three runs, a missing row, a repeated sample, two sittings, two builds', () => {
  const two = judged({runs: 2, vendor: {resolved: 9}});
  assert.equal(two.verdict, 'NO VERDICT');
  assert.ok(two.missing.some(p => /runs: 2 complete, attested full matrix run\(s\) on vendor, 3 are the rule/.test(p)));
  const gap = judged({vendor: {resolved: 9}, cua: {tweak: rows => rows.filter(r => r.id !== 'electron/getScreenshot' || r.sample !== 2)}});
  assert.equal(gap.verdict, 'NO VERDICT');
  assert.ok(gap.missing.some(p => /1 row\(s\) of the manifest missing \(speed electron\/getScreenshot#2\)/.test(p)));
  // The same lane's results read twice (two --out directories): its samples cannot be told apart.
  const twice = judged({vendor: {resolved: 9}, extra: [fullRun('cua', 1)]});
  assert.ok(twice.missing.some(p => /repeat run number\(s\) 1/.test(p)));
  assert.ok(twice.missing.some(p => /appear twice/.test(p)));
  const sittings = judged({vendor: {resolved: 9, meta: {sitting: 's0'}}});
  assert.ok(sittings.missing.some(p => /more than one sitting/.test(p)));
  const builds = judged({vendor: {resolved: 9}, extra: [fullRun('cua', 4, {lane: {build: 'b-other'}})]});
  assert.ok(builds.missing.some(p => /more than one build of the cua engine/.test(p)));
  const unattested = judged({vendor: {resolved: 9}, cua: {lane: {build: null}}});
  assert.ok(unattested.missing.some(p => /0 complete, attested full matrix run\(s\) on cua/.test(p)));
  // A row whose every cua sample is invalid has no verdict: it blocks, and it is not a failure.
  const invalid = judged({vendor: {resolved: 9}, cua: {tweak: set(CLICK, {invalid: 'not in front'})}});
  assert.deepEqual([invalid.verdict, invalid.blocking], ['NO VERDICT', []]);
  assert.ok(invalid.missing.includes(`method: ${CLICK} has no valid cua sample`));
});

test('a narrowed matrix cell is listed and not counted; it never stands in for a full run', () => {
  const narrowed = cellResult({cell: 'matrix', device: 'mini', started: '2026-10-21T00:00:00Z', lanes: [{host: 'cua', engine: 'cua', build: 'b-cua', version: 'v'}], complete: true,
    rows: [{section: 'method', id: CLICK, engine: 'cua', sample: 4, ok: false, regime: 'frontmost'}], meta: {run: 4, samples: 2, sitting: 's1', commit: 'c', planId: 'matrix:textedit'}});
  const j = judged({vendor: {resolved: 9, axMs: 50}, extra: [narrowed]});
  assert.equal(j.verdict, 'PASS', 'its failing row is not counted');
  assert.deepEqual(j.narrowed.map(n => [n.cell, n.planId]), [['matrix', 'matrix:textedit']]);
  assert.match(renderSummary(j), /## Narrowed matrix cells \(listed, not counted\)/);
  const short = judged({runs: 2, vendor: {resolved: 9}, extra: [{...narrowed, meta: {...narrowed.meta, run: 3}}]});
  assert.equal(short.verdict, 'NO VERDICT', 'a narrowed run does not make up a missing full one');
});

test('another cell\'s result (a residue cell on the live harness) is read in the same shape and listed', () => {
  const residue = cellResult({cell: 'route4', device: 'mini', started: '2026-10-21T00:00:00Z', lanes: [{host: null, engine: 'cua', build: 'b', version: 'v'}], complete: true,
    rows: [{section: 'residue', id: 'route4/override', engine: 'cua', sample: 1, ok: false}]});
  const j = judged({vendor: {resolved: 9}, extra: [residue]});
  assert.deepEqual(j.others.map(o => [o.cell, o.engine, o.verdict]), [['route4', 'cua', 'fail']]);
  assert.ok(j.blocking.includes('route4: fail on cua'));
  const text = renderSummary(j);
  for (const part of ['## The three points', '## Methods', '| click | ', '## Speed (in-cell ms)', '### textedit', '## Finding elements', '## Launch path', '## Not interfering', '## Other cells', '| route4 | cua | residue | fail |'])
    assert.ok(text.includes(part), part);
  assert.match(text, /finder set_value: a value written into a file's name field/);
  const incomplete = {...residue, complete: false, verdict: 'no-verdict', problems: ['the watcher was lost'], rows: [{...residue.rows[0], ok: true}]};
  const k = judged({vendor: {resolved: 9}, extra: [incomplete]});
  assert.equal(k.verdict, 'NO VERDICT');
  assert.ok(k.missing.includes('route4: no-verdict on cua'));
});

test('an incomplete full run is missing proof, and a result that does not conform is named', () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'matrix-summary-'));
  try {
    for (let n = 1; n <= 3; n++) {
      writeCellResult(join(dir, 'vendor', `run-${n}`), fullRun('vendor', n, {resolved: 9}));
      writeCellResult(join(dir, 'cua', `run-${n}`), n === 3 ? {...fullRun('cua', n), complete: false, verdict: 'no-verdict', problems: ['the put-back did not hold']} : fullRun('cua', n));
    }
    fs.mkdirSync(join(dir, 'b'));
    fs.writeFileSync(join(dir, 'b', 'result.json'), JSON.stringify({schema: 'native-matrix-cell-1', cell: 'x'}));
    const {results, problems} = readResults([dir]);
    assert.equal(problems.length, 1);
    const j = judge(results, problems);
    assert.ok(j.missing.some(b => /incomplete \(the put-back did not hold\)/.test(b)));
    assert.ok(j.missing.some(b => /2 complete, attested full matrix run\(s\) on cua/.test(b)));
    assert.equal(j.verdict, 'NO VERDICT');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('a declared row passes its comparison and is listed for the owner; an oracle declaration is the owner\'s too', () => {
  const declared = {declared: {kind: 'vendor-defect', cause: 'the vendor caps the count'}};
  assert.equal(judgeMethod('frontmost', [m('vendor', 1, false, declared)], [m('cua', 1, true)]).verdict, 'equal', 'a declared vendor row is the reference as passing');
  const j = judged({vendor: {resolved: 9, tweak: set(CLICK, {ok: false, ...declared})},
    cua: {tweak: set(BACK, {interference: {ok: false, frontmost: true, topWindow: true, activations: 1, route4: false, declared: {kind: 'self-activating', cause: 'TextEdit activated at its launch'}}})}});
  assert.deepEqual([j.blocking, j.missing], [[], []]);
  assert.ok(j.owner.some(o => /declared: method textedit\/frontmost\/click.control on vendor: vendor-defect/.test(o)));
  assert.ok(j.owner.some(o => /not interfering: textedit\/background\/click.control@finder: TextEdit activated/.test(o)));
  assert.equal(j.verdict, 'OWNER');
});
