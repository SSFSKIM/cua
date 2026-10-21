// The matrix's judgment and report (scripts/native-matrix/summary.mjs): methods sample for sample in front and against
// ground truth behind, the 10% beat, the finding rule with its parity, non-interference with declared causes, and any
// other cell's result read in the same shape.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cellResult, writeCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {judge, judgeMethod, judgeSpeed, readResults, renderSummary} from '../../scripts/native-matrix/summary.mjs';

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

// A full pair of matrix results, one per engine, written and read back as summary reads them.
function lane(engine, {clickOk = true, resolved = 8, interferenceOk = true, axMs = 40, route = 3} = {}) {
  const rows = [
    m(engine, 1, clickOk, {inputRoute: engine === 'cua' ? route : null}),
    {section: 'method', id: 'textedit/background/click.control', engine, sample: 1, ok: true, regime: 'background', method: 'click', case: 'control', user: 'finder',
      inputRoute: engine === 'cua' ? route : null, interference: {ok: interferenceOk, frontmost: interferenceOk, topWindow: true, activations: 0, route4: route === 4}},
    ...[1, 2, 3].map(sample => ({section: 'speed', id: 'textedit/getAXState', engine, sample, ok: true, inCellMs: axMs})),
    ...Array.from({length: 10}, (_, i) => ({section: 'finding', id: `textedit/target.t${i}`, engine, sample: 1, ok: true, outcome: {found: i < resolved, resolved: i < resolved}})),
    {section: 'finding', id: 'textedit/lines', engine, sample: 1, ok: true, outcome: {lines: 100, named: 60, unclassified: 0}},
    {section: 'finding', id: 'textedit/ids', engine, sample: 1, ok: true, outcome: {ids: 1}},
  ];
  return cellResult({cell: 'matrix', device: 'mini', started: '2026-10-21T00:00:00Z', lanes: [{host: engine, engine, build: 'b', version: 'v'}], complete: true, rows});
}
function judged(vendor, cua, extra = []) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'matrix-summary-'));
  try {
    writeCellResult(join(dir, 'vendor', 'run-1'), vendor);
    writeCellResult(join(dir, 'cua', 'run-1'), cua);
    extra.forEach((r, i) => writeCellResult(join(dir, `other-${i}`), r));
    const {results, problems} = readResults([dir]);
    return judge(results, problems);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

test('the verdict: a worse method, a lower finding measure or an interfering row fails; misses and parity go to the owner', () => {
  const pass = judged(lane('vendor', {axMs: 50}), lane('cua', {resolved: 9, axMs: 40}));
  assert.equal(pass.verdict, 'OWNER', 'one run per side is the owner\'s note, not a failure');
  assert.deepEqual(pass.blocking, []);
  assert.equal(pass.findingVerdict, 'pass');
  assert.equal(pass.speed[0].beat, true);
  assert.ok(pass.owner.some(o => /runs: 1 vendor and 1 cua/.test(o)));

  assert.equal(judged(lane('vendor'), lane('cua', {clickOk: false})).verdict, 'FAIL');
  assert.equal(judged(lane('vendor'), lane('cua', {resolved: 7})).findingVerdict, 'fail');
  assert.equal(judged(lane('vendor'), lane('cua')).findingVerdict, 'parity');
  const interfering = judged(lane('vendor'), lane('cua', {interferenceOk: false}));
  assert.ok(interfering.blocking.some(b => /not interfering: textedit\/background\/click.control failed on cua/.test(b)));
  const route4 = judged(lane('vendor'), lane('cua', {route: 4}));
  assert.equal(route4.interference.cua.route4, 1);
  const slow = judged(lane('vendor', {axMs: 40}), lane('cua', {axMs: 39}));
  assert.ok(slow.owner.some(o => /missed the 10% beat/.test(o)));
});

test('another cell\'s result (a residue cell on the live harness) is read in the same shape and listed', () => {
  const residue = cellResult({cell: 'route4', device: 'mini', started: '2026-10-21T00:00:00Z', lanes: [{host: null, engine: 'cua', build: 'b', version: 'v'}], complete: true,
    rows: [{section: 'residue', id: 'route4/override', engine: 'cua', sample: 1, ok: false}]});
  const j = judged(lane('vendor'), lane('cua', {resolved: 9}), [residue]);
  assert.deepEqual(j.others.map(o => [o.cell, o.engine, o.verdict]), [['route4', 'cua', 'fail']]);
  assert.ok(j.blocking.includes('route4: fail on cua'));
  const text = renderSummary(j);
  for (const part of ['## The three points', '## Methods', '| click | ', '## Speed (in-cell ms)', '### textedit', '## Finding elements', '## Not interfering', '## Other cells', '| route4 | cua | residue | fail |'])
    assert.ok(text.includes(part), part);
  assert.match(text, /finder set_value: a value written into a file's name field/);
});

test('an incomplete result is a blocking problem, and a result that does not conform is named', () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'matrix-summary-'));
  try {
    writeCellResult(join(dir, 'a'), {...lane('cua'), complete: false, verdict: 'no-verdict', problems: ['the put-back did not hold']});
    fs.mkdirSync(join(dir, 'b'));
    fs.writeFileSync(join(dir, 'b', 'result.json'), JSON.stringify({schema: 'native-matrix-cell-1', cell: 'x'}));
    const {results, problems} = readResults([dir]);
    assert.equal(problems.length, 1);
    const j = judge(results, problems);
    assert.ok(j.blocking.some(b => /incomplete \(the put-back did not hold\)/.test(b)));
    assert.equal(j.verdict, 'FAIL');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('a declared row passes its comparison and is listed for the owner; an oracle declaration is the owner\'s too', () => {
  const declaredVendor = m('vendor', 1, false, {declared: {kind: 'vendor-defect', cause: 'the vendor caps the count'}});
  assert.equal(judgeMethod('frontmost', [declaredVendor], [m('cua', 1, true)]).verdict, 'equal', 'a declared vendor row is the reference as passing');
  const vendor = lane('vendor'), cua = lane('cua', {resolved: 9});
  cua.rows[1] = {...cua.rows[1], interference: {...cua.rows[1].interference, ok: false, declared: {kind: 'self-activating', cause: 'TextEdit activated at its launch'}}};
  cua.verdict = 'pass';
  vendor.rows[0] = declaredVendor;
  vendor.verdict = 'pass';
  const j = judged(vendor, cua);
  assert.deepEqual(j.blocking, []);
  assert.ok(j.owner.some(o => /declared: method textedit\/frontmost\/click.control on vendor: vendor-defect/.test(o)));
  assert.ok(j.owner.some(o => /not interfering: textedit\/background\/click.control: TextEdit activated/.test(o)));
  assert.equal(j.verdict, 'OWNER');
});
