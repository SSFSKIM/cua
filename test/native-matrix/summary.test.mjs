// The matrix's judgment and report (scripts/native-matrix/summary.mjs): methods sample for sample in front and against
// ground truth behind, the 10% beat, the finding rule with its parity, non-interference with declared causes, the
// launch path judged on its own outcome, the proof (full runs only, the manifest, one sitting, three attested runs per
// side) and any other cell's result read in the same shape; R3's declared departures, no verdict without a valid vendor
// pair (ruling 1116), the alert-frontmost and failed-activation NO VERDICTs (rulings 1136, 1141) and the NO VERDICT
// counts per cell.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cellResult, writeCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {isCaretRow, isPointerdownRow} from '../../scripts/native-matrix/plan.mjs';
import {FULL_PLAN} from '../../scripts/native-matrix/run.mjs';
import {judgeCell} from '../../scripts/native-matrix/cell-verdict.mjs';
import {judge, judgeMethod, judgeSpeed, manifestOf, readResults, renderSummary, toTopOf, witnessOf} from '../../scripts/native-matrix/summary.mjs';
import {NOT_JUDGED, unicodeRowsOf} from '../../scripts/native-matrix/unicode-plan.mjs';
import {NOT_JUDGED_RULES, notJudgedRefusal} from '../../scripts/native-matrix/not-judged.mjs';

const m = (engine, sample, ok, extra = {}) => ({section: 'method', id: 'textedit/frontmost/click.control', engine, sample, ok, regime: 'frontmost', method: 'click', case: 'control', ...extra});

test('a frontmost method row is judged sample for sample against the vendor; a background one against ground truth', () => {
  // Two failures are equal only as the same failure: the same answer and every effect field the case recorded alike.
  const failed = {outcome: {collapsed: false, unchanged: true}};
  assert.equal(judgeMethod('frontmost', [m('vendor', 1, true), m('vendor', 2, false, failed)], [m('cua', 1, true), m('cua', 2, false, failed)]).verdict, 'equal');
  assert.equal(judgeMethod('frontmost', [m('vendor', 1, true), m('vendor', 2, false, failed)], [m('cua', 1, true), m('cua', 2, false, {outcome: {collapsed: true, unchanged: false}})]).verdict, 'worse');
  assert.equal(judgeMethod('frontmost', [m('vendor', 1, false)], [m('cua', 1, true)]).verdict, 'better');
  assert.equal(judgeMethod('frontmost', [m('vendor', 1, true), m('vendor', 2, false)], [m('cua', 1, false), m('cua', 2, true)]).verdict, 'worse', 'better on one sample does not buy back a worse one');
  assert.equal(judgeMethod('frontmost', [m('vendor', 1, true)], [m('cua', 1, false, {invalid: 'not in front'})]).verdict, 'no-verdict');
  // Ruling 1116: a frontmost row rests on the vendor's answer, so a cua sample with no valid vendor sample of its run has
  // no verdict, whether it passed or failed: never equal, never worse.
  assert.equal(judgeMethod('frontmost', [m('vendor', 1, true, {invalid: 'x'})], [m('cua', 1, false)]).verdict, 'no-verdict');
  assert.equal(judgeMethod('frontmost', [m('vendor', 1, true, {invalid: 'x'})], [m('cua', 1, true)]).verdict, 'no-verdict', 'hold 10\'s 88 invalid vendor rows read equal before');
  assert.equal(judgeMethod('frontmost', [], [m('cua', 1, true)]).verdict, 'no-verdict');
  assert.deepEqual(judgeMethod('frontmost', [m('vendor', 1, true, {invalid: 'x'}), m('vendor', 2, true)], [m('cua', 1, true), m('cua', 2, true)]).account.cua.noVerdict, {unpaired: 1});
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

// One full matrix run of one engine, every manifest row present and passing; `tweak(rows, run)` edits the rows, `meta` and
// `lane` the result's.
const CLICK = 'textedit/frontmost/click.control', BACK = 'textedit/background/click.control@finder', LAUNCH = 'electron/background/launch@finder';
// `hosted`: the run is marked hosted (meta.hosted) and every row carries good front/key readings (READINGS) unless
// `tweak` changes them.
const SCENE_APP = 'app.scene', ALERT = 'com.apple.UserNotificationCenter';
const READINGS = Object.freeze({apps: [SCENE_APP], activate: {app: SCENE_APP, front: true, key: true}, before: {front: SCENE_APP, key: SCENE_APP}, after: {front: SCENE_APP, key: SCENE_APP}});
function fullRun(engine, run, {axMs = 40, resolved = 10, tweak = rows => rows, meta = {}, lane = {}, complete = true, hosted = false, device = 'mini'} = {}) {
  const samples = 2;
  const rows = manifestOf({run, samples}).map(({section, id, sample}) => {
    const row = {section, id, engine, sample, ok: true};
    if (section === 'method') {
      const [target, regime, rest] = id.split('/');
      const [mc, user] = rest.split('@');
      Object.assign(row, {target, regime, method: mc.slice(0, mc.indexOf('.')), case: mc.slice(mc.indexOf('.') + 1), inputRoute: engine === 'cua' ? 3 : null, ...(user ? {user} : {})});
      if (regime === 'background') row.interference = {ok: true, frontmost: true, topWindow: true, focus: true, activations: 0, route4: false};
      // A caret row (#258, #259) carries the device's reading of the field, the same on both engines here.
      if (isCaretRow(id)) row.outcome = {valueKept: true, range: {location: 25, length: 0}, collapsed: true, line: 2, column: 5};
      // A pointerdown row (ruling 1168) carries its count's rise, one on both engines here (the vendor's must be one).
      if (isPointerdownRow(id)) row.outcome = {pointerDownOnce: true, rose: 1};
    }
    if (section === 'launch' || section === 'concurrent' || (section === 'unicode' && id.split('/')[1].includes('@'))) {
      row.interference = {ok: true, frontmost: true, topWindow: true, focus: true, activations: 0, route4: false};
    }
    if (section === 'speed') row.inCellMs = axMs;
    if (hosted) row.frontKey = READINGS;
    if (section === 'finding') {
      const target = /\/target\./.test(id) ? manifestOf({run, samples}).filter(e => e.id.startsWith(id.slice(0, id.indexOf('/') + 1)) && /\/target\./.test(e.id)).findIndex(e => e.id === id) : -1;
      row.outcome = id.endsWith('/lines') ? {lines: 100, named: 60, unclassified: 0} : id.endsWith('/ids') ? {ids: 1} : {found: target < resolved, resolved: target < resolved};
    }
    return row;
  });
  return cellResult({cell: 'matrix', device, started: '2026-10-21T00:00:00Z', lanes: [{host: engine, engine, build: `b-${engine}`, version: 'v', ...lane}], complete, rows: tweak(rows, run),
    meta: {run, samples, sitting: 's1', commit: 'c', os: OS, planId: 'full', nativeEngine: {approved: {build: 'a'.repeat(64)}}, ...(hosted ? {hosted: true, desktopMode: 'shared', runner: HOSTED_RUNNER} : {}),
      ...(typeof meta === 'function' ? meta(run) : meta)}});
}
// The record a hosted run's device attests (T10b′ part 2): one job's run for every hosted fixture.
const HOSTED_RUNNER = {kind: 'github-hosted', image: {name: 'macos26', version: '20261117.0516.1'}, run: {id: '7', attempt: '1'}, vm: {id: 'vm-1', platformUuid: 'P', bootedAt: 'B'},
  install: {home: '/H', release: 'r'}, engine: {bundle: '/A/cua Engine.app', build: 'a'.repeat(64), engineVersion: '0.2.0'}};
const set = (id, patch) => rows => rows.map(r => (r.id === id ? {...r, ...patch} : r));
const OS = Object.freeze({name: 'macOS', version: '26.0', build: '25A354'});
// Three full runs per side unless given; `extra` results written beside them; `departures` the declared-departures
// file's entries (none unless given).
function judged({vendor = {}, cua = {}, runs = 3, extra = [], departures = [], knownDefects, notJudgedRules} = {}) {
  const dir = fs.mkdtempSync(join(tmpdir(), 'matrix-summary-'));
  try {
    for (let n = 1; n <= runs; n++) {
      writeCellResult(join(dir, 'vendor', `run-${n}`), fullRun('vendor', n, vendor));
      writeCellResult(join(dir, 'cua', `run-${n}`), fullRun('cua', n, cua));
    }
    extra.forEach((r, i) => writeCellResult(join(dir, `other-${i}`), r));
    const {results, problems} = readResults([dir]);
    return judge(results, problems, {departures, ...(knownDefects ? {knownDefects} : {}), ...(notJudgedRules ? {notJudgedRules} : {})});
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
  // #485: a row the window order failed keeps that reading in its failure, and the summary names the reason.
  for (const [after, reason] of [[true, /a target window left above the user window/], [null, /window order after the action proved nothing/]]) {
    const raised = judged({vendor: {resolved: 9}, cua: {tweak: set(BACK, {interference: {ok: false, frontmost: true, topWindow: true, activations: 0, route4: false, windowOrder: {before: false, after}}})}});
    assert.deepEqual(raised.interference.cua.failed.find(f => f.id === BACK).windowOrder, {before: false, after});
    assert.match(renderSummary(raised), reason);
  }
  const slow = judged({vendor: {axMs: 40, resolved: 9}, cua: {axMs: 39}});
  assert.equal(slow.verdict, 'OWNER');
  assert.ok(slow.owner.some(o => /missed the 10% beat/.test(o)));
});

// T8e: #258's and #259's caret rows are judged by the device's reading beside the vendor's: both passing their own check
// with the caret elsewhere is worse, the same reading equal; every other frontmost row keeps the reference rule.
test('a caret row (#258, #259) is equal only with the vendor\'s reading, even where both pass their own check', () => {
  const POINT = 'electron/frontmost/click.point';
  const elsewhere = {valueKept: true, range: {location: 26, length: 0}, collapsed: true, line: 2, column: 6};
  const moved = judged({vendor: {resolved: 9}, cua: {tweak: set(POINT, {outcome: elsewhere})}});
  assert.equal(moved.verdict, 'FAIL');
  assert.ok(moved.blocking.includes(`method: ${POINT} is worse on cua`), moved.blocking.join('; '));
  assert.equal(moved.methods.find(m => m.id === POINT).verdict, 'worse');
  // Another frontmost row passing on both with other recorded fields stays equal.
  const other = judged({vendor: {resolved: 9}, cua: {tweak: set('electron/frontmost/click.button', {outcome: {pressedOnce: true, extra: 1}})}});
  assert.equal(other.methods.find(m => m.id === 'electron/frontmost/click.button').verdict, 'equal');
  assert.equal(judged({vendor: {resolved: 9}}).methods.find(m => m.id === POINT).verdict, 'equal');
});

// Ruling 1168 (#534): the pointerdown cells are frontmost rows judged against the vendor's; cua's counter unchanged where
// the vendor's rose blocks the sitting, and no declaration answers for it.
test('ruling 1168: a pointerdown cell where cua\'s press reached no pointer handler and the vendor\'s did FAILs, declared or not', () => {
  const missed = {ok: false, outcome: {pointerDownOnce: false, rose: 0}}, once = {ok: true, outcome: {pointerDownOnce: true, rose: 1}};
  for (const id of ['chrome/frontmost/click.pointerdown', 'electron/frontmost/click.pointerdown']) {
    const worse = judged({vendor: {resolved: 9, tweak: set(id, once)}, cua: {tweak: set(id, missed)}});
    assert.equal(worse.verdict, 'FAIL');
    assert.ok(worse.blocking.includes(`method: ${id} is worse on cua`), worse.blocking.join('; '));
    const declared = judged({vendor: {resolved: 9, tweak: set(id, once)}, cua: {tweak: set(id, {...missed, outcome: {...missed.outcome, threw: 'The click could not be confirmed', errorName: 'clickUnconfirmed', unchanged: true}})},
      departures: [{section: 'method', id, vendor: {answer: 'ok'}, cua: {answer: 'unconfirmed', errorName: 'clickUnconfirmed', sentence: 'The click could not be confirmed'}, decision: 'Decision Log, a made-up entry'}]});
    assert.equal(declared.verdict, 'FAIL');
    assert.equal(declared.methods.find(m => m.id === id).verdict, 'worse');
    // Both counts unchanged: the vendor's real click did not register, so the cell is NO VERDICT (never equal), its
    // reason named in the summary.
    const broken = judged({vendor: {resolved: 9, tweak: set(id, missed)}, cua: {tweak: set(id, missed)}});
    const cell = broken.methods.find(m => m.id === id);
    assert.equal(cell.verdict, 'no-verdict');
    assert.deepEqual(cell.account.cua.noVerdict, {reference: 3});
    assert.notEqual(broken.verdict, 'PASS');
    assert.match(renderSummary(broken), new RegExp(`- method ${id}, run 1: the reference side did not register the pointerdown \\(the vendor's click: its count unchanged\\)`));
    // The headline names the vendor's missing proof, never cua's.
    assert.ok(broken.missing.includes(`method: ${id} has no vendor sample that registered the pointerdown (ruling 1168)`), broken.missing.join('\n'));
    assert.ok(!broken.missing.some(p => p === `method: ${id} has no valid cua sample`));
    // A cua sample of its own cause beside them keeps the general line.
    const mixed = judged({vendor: {resolved: 9, tweak: set(id, missed)}, cua: {tweak: (rows, run) => set(id, run === 1 ? {...missed, invalid: 'not ready'} : missed)(rows)}});
    assert.ok(mixed.missing.includes(`method: ${id} has no valid cua sample`), mixed.missing.join('\n'));
  }
  // Both +1 is equal whatever route carried cua's press: the cell proves reach, not path (Chromium's AXPress dispatches a
  // trusted pointerdown), and the route cua's _meta named stands in the row, unjudged.
  const both = judged({vendor: {axMs: 50, resolved: 9, tweak: rows => rows.map(r => (/click\.pointerdown$/.test(r.id) ? {...r, ...once} : r))}, cua: {axMs: 40, tweak: rows => rows.map(r => (/click\.pointerdown$/.test(r.id) ? {...r, ...once, inputRoute: 1} : r))}});
  const reached = both.methods.find(m => m.id === 'chrome/frontmost/click.pointerdown');
  assert.equal(reached.verdict, 'equal');
  assert.deepEqual(reached.routes.cua, [1]);
  assert.match(renderSummary(both), /^\| chrome\/frontmost\/click\.pointerdown \| [^|]+ \| [^|]+ \| [^|]+ \| [^|]+ \| 1 \|$/m);
  assert.equal(both.verdict, 'PASS');
});

// Ruling 1149: a full run whose lane attests another engine than its rows measure is no measurement of its side. The cua
// side answered by the vendor's engine (state 1) would compare the vendor with itself: its rows are not judged, and the
// missing proof names it, whatever the run says of itself.
test('ruling 1149: a cua run whose lane attests the vendor engine is NO VERDICT naming state 1, its rows not judged; never a pass', () => {
  const fellBack = judged({vendor: {axMs: 50, resolved: 9}, cua: {lane: {engine: 'vendor', build: 'b-vendor'}, meta: {nativeEngine: {requested: 'cua', approved: {build: 'a'.repeat(64)}}}}});
  assert.equal(fellBack.verdict, 'NO VERDICT');
  for (const n of [1, 2, 3]) {
    assert.ok(fellBack.missing.some(p => p.includes(`cua/run-${n}: the cua side attested the vendor engine, a fallback that compares the vendor with itself (state 1)`)
      && p.endsWith('its rows are not judged')), fellBack.missing.join('\n'));
  }
  assert.deepEqual(fellBack.runs, {vendor: 3, cua: 0}, 'counted on neither side as a cua run nor as a vendor one');
  assert.ok(!fellBack.missing.some(p => /repeat run number/.test(p)), 'not read as a second vendor run');
  assert.ok(fellBack.methods.every(row => row.cua.valid === 0), 'no cua row judged');
  // Without meta.nativeEngine.requested, the rows' own engine names the side.
  const unnamed = judged({vendor: {axMs: 50, resolved: 9}, cua: {lane: {engine: 'vendor'}}});
  assert.equal(unnamed.verdict, 'NO VERDICT');
  assert.equal(unnamed.missing.filter(p => p.includes('(state 1)')).length, 3);
  // The other way: cua's engine on the vendor side is named too.
  const swapped = judged({vendor: {lane: {engine: 'cua'}}});
  assert.equal(swapped.verdict, 'NO VERDICT');
  assert.ok(swapped.missing.some(p => /vendor\/run-1: the result attested engine cua .* where engine vendor was expected; its rows are not judged/.test(p)), swapped.missing.join('\n'));
});

// The lane names the run's first attestation (./run.mjs); the run keeps every one it saw (meta.nativeEngine
// {attested, unattested}). A later answer of the vendor's, or one with none, is judged from that whole set.
test('ruling 1149: a run whose first answer is cua\'s but a later one the vendor\'s, or unattested, is set aside and named', () => {
  const CUA_ANSWER = {engine: 'cua', version: 'v', build: 'b-cua'}, VENDOR_ANSWER = {engine: 'vendor', version: null, build: 'r'};
  const kept = (attested, unattested = 0) => ({cua: {meta: {nativeEngine: {requested: 'cua', approved: {build: 'a'.repeat(64)}, attested, unattested}}}});
  const later = judged({vendor: {axMs: 50, resolved: 9}, ...kept([CUA_ANSWER, VENDOR_ANSWER])});
  assert.equal(later.verdict, 'NO VERDICT');
  assert.equal(later.missing.filter(p => p.includes('(state 1)') && p.endsWith('its rows are not judged')).length, 3, later.missing.join('\n'));
  assert.deepEqual(later.runs, {vendor: 3, cua: 0});
  const unattested = judged({vendor: {axMs: 50, resolved: 9}, ...kept([CUA_ANSWER], 2)});
  assert.equal(unattested.verdict, 'NO VERDICT');
  assert.equal(unattested.missing.filter(p => /2 js result\(s\) carry no cua\/nativeEngine attestation; its rows are not judged$/.test(p)).length, 3, unattested.missing.join('\n'));
  // Every answer cua's: judged as before.
  assert.equal(judged({vendor: {axMs: 50, resolved: 9}, cua: {axMs: 40, ...kept([CUA_ANSWER]).cua}}).verdict, 'PASS');
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
  assert.ok(sittings.missing.some(p => /run 1's vendor and cua runs name more than one hold/.test(p)), sittings.missing.join('\n'));
  const builds = judged({vendor: {resolved: 9}, extra: [fullRun('cua', 4, {lane: {build: 'b-other'}})]});
  assert.ok(builds.missing.some(p => /more than one build of the cua engine/.test(p)));
  const unattested = judged({vendor: {resolved: 9}, cua: {lane: {build: null}}});
  assert.ok(unattested.missing.some(p => /0 complete, attested full matrix run\(s\) on cua/.test(p)));
  // A row whose every cua sample is invalid has no verdict: it blocks, and it is not a failure.
  const invalid = judged({vendor: {resolved: 9}, cua: {tweak: set(CLICK, {invalid: 'not in front'})}});
  assert.deepEqual([invalid.verdict, invalid.blocking], ['NO VERDICT', []]);
  assert.ok(invalid.missing.includes(`method: ${CLICK} has no valid cua sample`));
});

test('the manifest needs its metadata, and an applicable row without its oracle reading is missing proof, not left out', () => {
  // meta.samples absent: no speed manifest could be built, so nothing is proven about speed.
  const noSamples = judged({vendor: {resolved: 9, axMs: 50}, cua: {meta: {samples: undefined}}});
  assert.equal(noSamples.verdict, 'NO VERDICT');
  assert.ok(noSamples.missing.some(p => /meta\.samples/.test(p)));
  const noRun = judged({vendor: {resolved: 9, axMs: 50}, cua: {meta: {run: undefined}}});
  assert.equal(noRun.verdict, 'NO VERDICT');
  assert.ok(noRun.missing.some(p => /meta\.run/.test(p)));
  const noHost = judged({vendor: {resolved: 9, axMs: 50}, cua: {lane: {host: undefined}}});
  assert.equal(noHost.verdict, 'NO VERDICT');
  // A background row and a launch row with no interference reading: missing proof on that engine.
  const unread = judged({vendor: {resolved: 9, axMs: 50}, cua: {tweak: rows => rows.map(r => (r.id === BACK || r.id === LAUNCH ? (({interference, ...rest}) => rest)(r) : r))}});
  assert.equal(unread.verdict, 'NO VERDICT');
  assert.ok(unread.missing.some(p => /6 valid background or launch row\(s\) on cua carry no oracle reading/.test(p)), unread.missing.join('\n'));
});

test('TextEdit\'s launch is an owner option: absent from the manifest, listed apart, never missing proof', () => {
  assert.ok(!manifestOf({run: 1, samples: 2}).some(e => e.id.startsWith('textedit/background/launch')));
  const j = judged({vendor: {resolved: 9, axMs: 50}});
  assert.equal(j.verdict, 'PASS');
  assert.deepEqual(j.options.map(o => o.id), ['textedit/background/launch@finder']);
  const text = renderSummary(j);
  assert.match(text, /## Owner options \(not run; not part of the verdict\)/);
  assert.match(text, /TextEdit launch under the engine: provable in a scratch macOS user if wanted/);
  assert.match(text, /restored TextEdit windows/);
  assert.match(text, /iCloud Open panel/);
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

test('a declaration carried on a full run\'s row excuses nothing (R3: the departures file is the one place); an oracle declaration stays the owner\'s', () => {
  const declared = {declared: {kind: 'vendor-defect', cause: 'the vendor caps the count'}};
  assert.equal(judgeMethod('frontmost', [m('vendor', 1, false, declared)], [m('cua', 1, true)]).verdict, 'better', 'judged on its raw outcome');
  assert.equal(judgeMethod('frontmost', [m('vendor', 1, true)], [m('cua', 1, false, declared)]).verdict, 'worse');
  const alike = {ok: false, outcome: {clicked: false}, ...declared};
  const j = judged({vendor: {resolved: 9, tweak: set(CLICK, alike)}, cua: {tweak: set(CLICK, alike)}});
  assert.deepEqual(j.blocking, [], 'both failed alike: equal, judged as they read');
  assert.equal(j.methods.find(x => x.id === CLICK).verdict, 'equal');
  assert.ok(j.missing.includes(`method: ${CLICK} on cua (sample 1) carries a declaration, which no row of the matrix may (R3: the declared-departures file is the one place): its raw outcome is judged`), j.missing.join('\n'));
  assert.equal(j.verdict, 'NO VERDICT');
  const back = judged({vendor: {resolved: 9}, cua: {tweak: set(BACK, {ok: false, ...declared})}});
  assert.ok(back.blocking.includes(`method: ${BACK} is worse on cua`), back.blocking.join('\n'));
  // The oracle's own declarations (a self-activating family, an owner-accepted route 4) are the owner's to read.
  const oracle = judged({vendor: {resolved: 9}, cua: {tweak: set(BACK, {interference: {ok: false, frontmost: true, topWindow: true, activations: 1, route4: false, declared: {kind: 'self-activating', cause: 'TextEdit activated at its launch'}}})}});
  assert.deepEqual([oracle.blocking, oracle.missing], [[], []]);
  assert.ok(oracle.owner.some(o => /not interfering: textedit\/background\/click.control@finder: TextEdit activated/.test(o)));
  assert.equal(oracle.verdict, 'OWNER');
});

const CONCURRENT = 'chrome/concurrent@textedit', FIRES = 'textedit/intervention.fires', KOREAN = 'textedit/korean/typeText.acceptance4';
test('the probe cells and the Korean matrix are in every full run\'s manifest, judged against their own outcome: a failed or unproven cua row blocks', () => {
  const manifest = manifestOf({run: 2, samples: 2});
  assert.deepEqual(manifest.filter(e => ['concurrent', 'intervention'].includes(e.section)).map(e => `${e.section} ${e.id} ${e.sample}`),
    ['concurrent finder/concurrent@textedit 2', 'concurrent chrome/concurrent@textedit 2', 'concurrent textedit/concurrent.sheet@electron 2',
      'intervention textedit/intervention.fires 2', 'intervention textedit/intervention.preAction 2']);
  assert.equal(manifest.filter(e => e.section === 'unicode').length, 225 - 54, 'every Unicode row but the 54 per-context rows (ruling 1119)');
  const pass = judged({vendor: {axMs: 50, resolved: 9}, cua: {axMs: 40}});
  assert.equal(pass.verdict, 'PASS');
  assert.ok(pass.probe.every(p => p.verdict === 'equal') && pass.unicode.every(u => u.verdict === 'equal'));
  // The vendor's results are recorded, never the reference: a vendor that did not keep the user's keystroke is better for cua.
  const vendorFailed = judged({vendor: {axMs: 50, resolved: 9, tweak: set(CONCURRENT, {ok: false})}, cua: {axMs: 40}});
  assert.equal(vendorFailed.verdict, 'PASS');
  assert.equal(vendorFailed.probe.find(p => p.id === CONCURRENT).verdict, 'better');
  const failed = judged({vendor: {axMs: 50, resolved: 9}, cua: {axMs: 40, tweak: set(FIRES, {ok: false, outcome: {fired: false}})}});
  assert.ok(failed.blocking.includes(`intervention: ${FIRES} failed on cua`));
  const unproven = judged({vendor: {axMs: 50, resolved: 9}, cua: {axMs: 40, tweak: set(CONCURRENT, {ok: false, invalid: 'the probe posted 300 ms before the action\'s interval'})}});
  assert.deepEqual([unproven.verdict, unproven.blocking], ['NO VERDICT', []]);
  assert.ok(unproven.missing.includes(`concurrent use: ${CONCURRENT} has no valid cua sample`));
  const korean = judged({vendor: {axMs: 50, resolved: 9}, cua: {axMs: 40, tweak: set(KOREAN, {ok: false})}});
  assert.ok(korean.blocking.includes(`unicode: ${KOREAN} failed on cua`), 'Acceptance 4');
  // The retired Unicode expected file's kind of declaration (a named cause) excuses nothing now (R3).
  const declared = judged({vendor: {axMs: 50, resolved: 9}, cua: {axMs: 40, tweak: set(KOREAN, {ok: false, declared: {kind: 'normalization', cause: 'TextEdit composes'}})}});
  assert.equal(declared.verdict, 'FAIL');
  assert.ok(declared.blocking.includes(`unicode: ${KOREAN} failed on cua`));
  const text = renderSummary(pass);
  for (const part of ['## Concurrent use and intervention', `| ${CONCURRENT} | equal |`, '## Korean and Unicode', '### korean', '| typeText.acceptance4 |',
    '**Concurrent use and intervention**: 5 of 5 rows pass on cua'])
    assert.ok(text.includes(part), part);
});

test('the probe cells\' and the Korean matrix\'s background rows are judged by the oracle too: the sheet variant\'s interference fails it, a reading missing is missing proof', () => {
  const SHEET = 'textedit/concurrent.sheet@electron', COMPOSING = 'chrome/composing@textedit/typeText.hangul';
  const stolen = judged({vendor: {axMs: 50, resolved: 9}, cua: {axMs: 40, tweak: set(SHEET, {interference: {ok: false, frontmost: true, topWindow: true, focus: true, activations: 1, route4: false}})}});
  assert.equal(stolen.verdict, 'FAIL');
  assert.ok(stolen.blocking.includes(`not interfering: ${SHEET} failed on cua`), stolen.blocking.join('\n'));
  const unread = judged({vendor: {axMs: 50, resolved: 9}, cua: {axMs: 40, tweak: rows => rows.map(r => (r.id === SHEET || r.id === COMPOSING ? (({interference, ...rest}) => rest)(r) : r))}});
  assert.equal(unread.verdict, 'NO VERDICT');
  assert.ok(unread.missing.some(p => /6 valid background or launch row\(s\) on cua carry no oracle reading/.test(p)), unread.missing.join('\n'));
});

// #185, ruling 1119: the per-context rows run and report, and the judge never counts them.
const PER_CONTEXT = 'chrome/perContext@textedit/typeText.hangul';
test('the per-context rows are out of the verdict: absent from the manifest, never blocking or missing, listed as not judged with ruling 1119\'s cause', () => {
  assert.ok(!manifestOf({run: 1, samples: 2}).some(e => e.id.includes('/perContext')));
  const planned = unicodeRowsOf(FULL_PLAN.unicode).filter(r => r.condition === 'perContext').map(r => r.id);
  assert.equal(planned.length, 54);
  // cua's per-context rows all failed and one interfered, the vendor's are invalid and carry no `excluded` (as hold 3's
  // rows, recorded before the ruling): none of it counts.
  const perContext = engine => (rows, run) => [...rows, ...planned.map(id => ({section: 'unicode', id, engine, sample: run, ok: false,
    ...(engine === 'cua' ? {excluded: NOT_JUDGED.perContext, interference: {ok: id !== PER_CONTEXT, frontmost: true, topWindow: true, focus: true, activations: 1, route4: false}} : {invalid: 'the context did not read Korean afterwards'})}))];
  const j = judged({vendor: {axMs: 50, resolved: 9, tweak: perContext('vendor')}, cua: {axMs: 40, tweak: perContext('cua')}});
  assert.deepEqual([j.verdict, j.blocking, j.missing, j.owner], ['PASS', [], [], []]);
  assert.ok(!j.unicode.some(u => u.id.includes('/perContext')), 'not among the judged Unicode rows');
  assert.equal(j.interference.cua.rows, j.interference.vendor.rows, 'not among the interference rows');
  assert.deepEqual(j.notJudged.filter(n => n.section === 'unicode').map(n => n.id), [...planned].sort());
  assert.deepEqual(j.notJudged.find(n => n.id === PER_CONTEXT), {id: PER_CONTEXT, section: 'unicode', condition: 'perContext', cause: NOT_JUDGED.perContext, ticket: '#577', recorded: true,
    vendor: {ok: 0, valid: 0, invalid: 3}, cua: {ok: 0, valid: 3, invalid: 0}});
  // Recorded by neither lane: still listed, labelled not recorded (not invalid), with nothing counted.
  const none = judged({vendor: {axMs: 50, resolved: 9}, cua: {axMs: 40}});
  assert.equal(none.verdict, 'PASS');
  assert.deepEqual(none.notJudged.find(n => n.id === PER_CONTEXT), {id: PER_CONTEXT, section: 'unicode', condition: 'perContext', cause: NOT_JUDGED.perContext, ticket: '#577', recorded: false,
    vendor: {ok: 0, valid: 0, invalid: 0}, cua: {ok: 0, valid: 0, invalid: 0}});
  assert.ok(renderSummary(none).includes(`| ${PER_CONTEXT} | not recorded | not recorded |`));
  const text = renderSummary(j);
  for (const part of ['## Not judged', `### perContext\n\n${NOT_JUDGED.perContext}\n\nTicket: #577.`, `| ${PER_CONTEXT} | 0/3 | 0/0 (+3 invalid) |`,
    '**Korean and Unicode**: 171 of 171 rows pass on cua; 54 perContext rows are not judged (below).'])
    assert.ok(text.includes(part), part);
  assert.ok(text.indexOf('## Not judged') > text.indexOf('## What changes for a user'), 'the three-point report\'s order');
  assert.doesNotMatch(text, /of the invalid samples/, 'named only when a not-judged row has such a cause');
  // Off a hosted runner (ruling 1188) every per-context row is NO VERDICT ownerInput, and on a hosted one a source the
  // venue could not enable makes them NO VERDICT venue (ruling 1189). Still out of the verdict, but counted where they
  // are listed, so the report shows what the run could not take.
  const cause = 'off a GitHub-hosted runner … (ruling 1188); the row needs …';
  const marked = (engine, marks) => (rows, run) => [...rows, ...planned.map(id => ({section: 'unicode', id, engine, sample: run, ...marks}))];
  const owned = judged({vendor: {axMs: 50, resolved: 9, tweak: marked('vendor', {ok: false, ownerInput: cause, invalid: cause})},
    cua: {axMs: 40, tweak: marked('cua', {ok: false, venueInput: 'the runner\'s setup could not enable …', invalid: 'the runner\'s setup could not enable …'})}});
  assert.deepEqual([owned.verdict, owned.blocking, owned.missing], ['PASS', [], []]);
  assert.deepEqual(owned.notJudged.find(n => n.id === PER_CONTEXT), {id: PER_CONTEXT, section: 'unicode', condition: 'perContext', cause: NOT_JUDGED.perContext, ticket: '#577', recorded: true,
    vendor: {ok: 0, valid: 0, invalid: 3, ownerInput: 3}, cua: {ok: 0, valid: 0, invalid: 3, venue: 3}});
  assert.ok(renderSummary(owned).includes(`${NOT_JUDGED.perContext}\n\nTicket: #577.\n\nOf the invalid samples, \`ownerInput\` (the owner's input source or per-context preference not the row's, never changed off a GitHub-hosted runner, ruling 1188): cua 0, vendor 162; \`venue\` (an input source the runner's setup could not enable, ruling 1189, or the sources enabled and the per-context context not reading Korean after its reactivation, #577): cua 162, vendor 0.\n`), renderSummary(owned));
});

// The review's regression: only ruling 1119's per-context rows are out of the verdict, by section and condition. An
// `excluded` mark on a mandatory row takes nothing out.
test('an excluded mark on any row but a per-context one takes nothing out: the reader refuses the result, and the judge judges the row as it read', () => {
  const KEYS = 'textedit/korean/pressKey.rk';
  const marked = rows => rows.map(r => (r.id === KEYS ? {...r, ok: false, excluded: 'not judged, says the run'} : r));
  const runs = [];
  for (let n = 1; n <= 3; n++) for (const [engine, extra] of [['vendor', {axMs: 50, resolved: 9}], ['cua', {axMs: 40}]]) runs.push({path: `${engine}/run-${n}`, result: fullRun(engine, n, {...extra, tweak: marked})});
  // Past the reader (in memory): the row is judged as it read, and the marks are named.
  const j = judge(runs);
  assert.equal(j.verdict, 'FAIL');
  assert.ok(j.blocking.includes(`unicode: ${KEYS} failed on cua`), j.blocking.join('\n'));
  assert.ok(j.missing.some(m => /^6 row\(s\) of the full runs are marked excluded, which only ruling 1119's per-context rows may be/.test(m)), j.missing.join('\n'));
  assert.ok(!j.notJudged.some(n => n.id === KEYS));
  // Through the reader: none of the six results conforms, so they are missing proof, never a pass.
  const dir = fs.mkdtempSync(join(tmpdir(), 'matrix-summary-marked-'));
  try {
    for (const {path, result} of runs) { fs.mkdirSync(join(dir, path), {recursive: true}); fs.writeFileSync(join(dir, path, 'result.json'), JSON.stringify(result)); }
    const {results, problems} = readResults([dir]);
    assert.equal(results.length, 0);
    assert.equal(problems.filter(p => /excluded marks a row no ruling puts out of the judged matrix/.test(p)).length, 6, problems.join('\n'));
    assert.notEqual(judge(results, problems).verdict, 'PASS');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

// #189, ruling 1119: pressKey is judged on raw outcomes; a declaration carried on its evidence excuses nothing.
test('a pressKey row is judged on its raw outcomes: a declaration on its evidence is missing proof; a wrong vendor sample fails a Latin row, the Korean row judged against its oracle', () => {
  const KEYS = 'textedit/korean/pressKey.rk', declared = {kind: 'composition', cause: 'composes otherwise'};
  const vendorDeclared = judged({vendor: {axMs: 50, resolved: 9, tweak: set(KEYS, {ok: false, declared})}, cua: {axMs: 40}});
  // Ruling 1219: the Korean row is judged against its oracle on each engine; the vendor's own failure blocks nothing.
  assert.ok(!vendorDeclared.blocking.some(b => b.includes(KEYS)), vendorDeclared.blocking.join('\n'));
  assert.ok(vendorDeclared.missing.includes(`unicode: ${KEYS} on vendor (sample 1) carries a declaration, which no pressKey row may (ruling 1119): its raw outcome is judged`), vendorDeclared.missing.join('\n'));
  assert.ok(!vendorDeclared.owner.some(o => o.includes(KEYS)), 'never the owner\'s to read');
  const cuaDeclared = judged({vendor: {axMs: 50, resolved: 9}, cua: {axMs: 40, tweak: set(KEYS, {ok: false, declared})}});
  assert.ok(cuaDeclared.blocking.includes(`unicode: ${KEYS} failed on cua`), cuaDeclared.blocking.join('\n'));
  const cuaInvalid = judged({vendor: {axMs: 50, resolved: 9, tweak: set(KEYS, {ok: false})}, cua: {axMs: 40, tweak: set(KEYS, {ok: false, invalid: 'not engaged'})}});
  assert.ok(!cuaInvalid.blocking.some(b => b.includes(KEYS)), 'no valid cua sample: no verdict, and the vendor\'s failure is its own');
  // A Latin pressKey row keeps ruling 1119's rule: the vendor composing otherwise fails it.
  const LATIN_KEYS = 'textedit/latin/pressKey.rk';
  const latin = judged({vendor: {axMs: 50, resolved: 9, tweak: set(LATIN_KEYS, {ok: false, outcome: {exact: false}})}, cua: {axMs: 40}});
  assert.ok(latin.blocking.includes(`unicode: ${LATIN_KEYS} composes otherwise on the vendor: the engines differ (ruling 1119)`), latin.blocking.join('\n'));
});

// #189, ruling 1119: a Korean row counts only with 2-Set engaged; without it the row has no verdict, never a pass. If
// the vendor's lane composes differently the row fails and cannot be declared.
test('the Korean pressKey row: no valid cua sample is NO VERDICT, and the vendor composing otherwise is the vendor\'s own failure (ruling 1219)', () => {
  const KEYS = 'textedit/korean/pressKey.rk';
  const unengaged = judged({vendor: {axMs: 50, resolved: 9}, cua: {axMs: 40, tweak: set(KEYS, {ok: false, invalid: 'the Korean source did not engage in textedit after its refocus'})}});
  assert.deepEqual([unengaged.verdict, unengaged.blocking], ['NO VERDICT', []]);
  assert.ok(unengaged.missing.includes(`unicode: ${KEYS} has no valid cua sample`), unengaged.missing.join('\n'));
  const composedOtherwise = judged({vendor: {axMs: 50, resolved: 9}, cua: {axMs: 40, tweak: set(KEYS, {ok: false, outcome: {exact: false}})}});
  assert.ok(composedOtherwise.blocking.includes(`unicode: ${KEYS} failed on cua`));
  // Ruling 1219: the vendor's lane settling on ㄱ where cua composed 가 fails the vendor against ruling 1119's oracle, never
  // cua: the row is a declared departure where cua is right, listed, and blocks nothing. Another Unicode row the vendor
  // failed stays better for cua.
  const vendorOtherwise = judged({vendor: {axMs: 50, resolved: 9, tweak: rows => set(KOREAN, {ok: false})(set(KEYS, {ok: false, outcome: {exact: false}})(rows))}, cua: {axMs: 40}});
  assert.ok(!vendorOtherwise.blocking.some(b => b.includes(KEYS)), vendorOtherwise.blocking.join('\n'));
  const keysCell = vendorOtherwise.unicode.find(u => u.id === KEYS);
  assert.equal(keysCell.verdict, 'better');
  assert.deepEqual(keysCell.oracle, {expected: '가', cuaRight: 3, vendorWrong: 3});
  assert.deepEqual(vendorOtherwise.oracleDepartures, [{section: 'unicode', id: KEYS, expected: '가', cuaRight: 3, vendorWrong: 3}]);
  assert.ok(renderSummary(vendorOtherwise).includes(`- unicode ${KEYS}: judged against ruling 1119's oracle 가 on each engine (ruling 1219): cua read it in 3 sample(s), the vendor composed otherwise in 3; a declared departure where cua is right, the vendor's own failure and no cua block`), renderSummary(vendorOtherwise));
  assert.equal(vendorOtherwise.unicode.find(u => u.id === KOREAN).verdict, 'better');
  assert.ok(!vendorOtherwise.blocking.some(b => b.includes(KOREAN)));
  const vendorUnengaged = judged({vendor: {axMs: 50, resolved: 9, tweak: set(KEYS, {ok: false, invalid: 'not engaged'})}, cua: {axMs: 40}});
  assert.deepEqual(vendorUnengaged.blocking, [], 'an invalid vendor sample is no answer to differ from');
});

test('the hold is judged per run number: each run\'s vendor and cua results share one hold, one commit and one approved build; the run numbers may span holds', () => {
  // Hold 2a's runs 1 and 2, hold 2b's run 3 (each vendor/cua pair in one sitting), at a later commit: one proof.
  const hold = n => (n === 3 ? {sitting: 'hold-2b', commit: 'c2'} : {sitting: 'hold-2a', commit: 'c'});
  const dir = fs.mkdtempSync(join(tmpdir(), 'matrix-summary-'));
  const judgeRuns = (vendorMeta, cuaMeta, numbers = {vendor: [1, 2, 3], cua: [1, 2, 3]}) => {
    fs.rmSync(dir, {recursive: true, force: true});
    for (const n of numbers.vendor) writeCellResult(join(dir, 'vendor', `run-${n}`), fullRun('vendor', n, {resolved: 9, axMs: 50, meta: vendorMeta(n)}));
    for (const n of numbers.cua) writeCellResult(join(dir, 'cua', `run-${n}`), fullRun('cua', n, {meta: cuaMeta(n)}));
    const {results, problems} = readResults([dir]);
    return judge(results, problems);
  };
  try {
    const split = judgeRuns(hold, hold);
    assert.equal(split.verdict, 'PASS', split.missing.join('\n'));
    assert.deepEqual(split.missing, []);
    const crossed = judgeRuns(hold, n => ({...hold(n), sitting: n === 3 ? 'hold-2c' : 'hold-2a'}));
    assert.ok(crossed.missing.some(p => /^run 3's vendor and cua runs name more than one hold \("hold-2[bc]", "hold-2[bc]"\): a pair is measured in one hold$/.test(p)), crossed.missing.join('\n'));
    assert.equal(crossed.missing.filter(p => /^run \d/.test(p)).length, 1, 'runs 1 and 2 share hold 2a');
    const commits = judgeRuns(hold, n => ({...hold(n), commit: n === 2 ? 'c3' : hold(n).commit}));
    assert.ok(commits.missing.some(p => /^run 2's vendor and cua runs name more than one commit/.test(p)));
    const builds = judgeRuns(hold, n => ({...hold(n), nativeEngine: {approved: {build: n === 1 ? 'e'.repeat(64) : 'a'.repeat(64)}}}));
    assert.ok(builds.missing.some(p => /^run 1's vendor and cua runs name more than one approved engine build/.test(p)));
    // A hold or commit absent, null or empty on every run is not one shared hold: each run names what it is missing.
    for (const blank of [undefined, null, '']) {
      const holdless = judgeRuns(n => ({...hold(n), sitting: blank}), n => ({...hold(n), sitting: blank}));
      assert.equal(holdless.verdict, 'NO VERDICT', `sitting ${JSON.stringify(blank)}`);
      assert.deepEqual(holdless.missing.filter(p => /records no hold/.test(p)).length, 3, holdless.missing.join('\n'));
      const commitless = judgeRuns(n => ({...hold(n), commit: blank}), n => ({...hold(n), commit: blank}));
      assert.equal(commitless.verdict, 'NO VERDICT', `commit ${JSON.stringify(blank)}`);
      assert.ok(commitless.missing.some(p => /^run 1: a run records no commit/.test(p)), commitless.missing.join('\n'));
    }
    const oneSide = judgeRuns(hold, n => ({...hold(n), sitting: n === 2 ? null : hold(n).sitting}));
    assert.ok(oneSide.missing.some(p => /^run 2: a run records no hold \(meta\.sitting\)/.test(p)), oneSide.missing.join('\n'));
    const unrecorded = judgeRuns(hold, n => ({...hold(n), nativeEngine: n === 2 ? {} : {approved: {build: 'a'.repeat(64)}}}));
    assert.ok(unrecorded.missing.some(p => /^run 2: a run records no approved engine build/.test(p)), unrecorded.missing.join('\n'));
    const unpaired = judgeRuns(hold, hold, {vendor: [1, 2, 3], cua: [1, 2, 4]});
    assert.ok(unpaired.missing.includes('run 3 has no cua full run: its samples cannot be compared with the vendor\'s'), unpaired.missing.join('\n'));
    assert.ok(unpaired.missing.includes('run 4 has no vendor full run: its samples cannot be compared with cua\'s'));
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

// ---- ruling 1116: no valid pair, no verdict ------------------------------------------------------------------------------

test('a vendor row present and invalid: the cua sample of its run has no valid pair, and the row is NO VERDICT, never equal', () => {
  const invalidIn = n => (rows, run) => (run === n ? set(CLICK, {invalid: 'textedit\'s window was not in front'})(rows) : rows);
  const j = judged({vendor: {resolved: 9, axMs: 50, tweak: invalidIn(2)}, cua: {axMs: 40}});
  assert.equal(j.verdict, 'NO VERDICT');
  assert.deepEqual(j.blocking, []);
  const row = j.methods.find(x => x.id === CLICK);
  assert.equal(row.verdict, 'no-verdict', 'present in the manifest, so its presence proves nothing');
  assert.deepEqual([row.account.vendor.runs, row.account.cua.runs, row.account.qualifies], [2, 2, false]);
  assert.deepEqual([row.account.vendor.noVerdict, row.account.cua.noVerdict], [{invalid: 1}, {unpaired: 1}]);
  const cell = j.cells.find(c => c.section === 'method' && c.id === CLICK);
  assert.equal(cell.qualifies, false);
  assert.ok(j.missing.some(p => /^1 cell\(s\) do not qualify: fewer than 3 complete run pairs/.test(p)), j.missing.join('\n'));
  assert.ok(renderSummary(j).includes(`| method ${CLICK} | **no verdict** | 2 of 3 | 2 | 2 | r1 1/1, r2 0/1, r3 1/1 | r1 1/1, r2 0/1, r3 1/1 | invalid 1 | unpaired 1 | no |`), renderSummary(j));
  // Every vendor sample invalid: no cua sample has a pair.
  const none = judged({vendor: {resolved: 9, axMs: 50, tweak: set(CLICK, {invalid: 'not in front'})}, cua: {axMs: 40}});
  assert.ok(none.missing.includes(`method: ${CLICK} has no cua sample with a valid vendor sample of its run (ruling 1116)`), none.missing.join('\n'));
  // A background row rests on ground truth: an invalid vendor sample leaves cua's samples their verdicts, but the vendor
  // side falls short of the triple, so the cell does not qualify either.
  const back = judged({vendor: {resolved: 9, axMs: 50, tweak: (rows, run) => (run === 1 ? set(BACK, {invalid: 'x'})(rows) : rows)}, cua: {axMs: 40}});
  assert.deepEqual(back.cells.find(c => c.id === BACK).account.cua.noVerdict, {});
  assert.equal(back.methods.find(x => x.id === BACK).verdict, 'no-verdict');
  // A proven worse sample stays worse, qualified or not.
  const worse = judged({vendor: {resolved: 9, axMs: 50, tweak: invalidIn(2)}, cua: {axMs: 40, tweak: (rows, run) => (run === 1 ? set(CLICK, {ok: false})(rows) : rows)}});
  assert.ok(worse.blocking.includes(`method: ${CLICK} is worse on cua`));
});

// Ruling 1169: a pair is measured on one frame. A run pair whose sides stood on different frames (../hosted-sittings/
// venue.mjs frameAsymmetry) is no pair: its samples are NO VERDICT `venue`, so a worse cua sample there is no verdict,
// never a FAIL.
test('a run pair whose sides stood on different frames is left out: its worse cua sample is no verdict, not a FAIL', () => {
  const frame = x => ({x, y: 60, width: 800, height: 760});
  const venue = (x, onlyRun = null) => run => ({venue: {frames: {chrome: frame(onlyRun === null || run === onlyRun ? x : 22)}}});
  const worseIn1 = (rows, run) => (run === 1 ? set(CLICK, {ok: false})(rows) : rows);
  const split = judged({vendor: {resolved: 9, axMs: 50, meta: venue(22)}, cua: {axMs: 40, meta: venue(30, 1), tweak: worseIn1}});
  assert.notEqual(split.verdict, 'FAIL', split.blocking.join('; '));
  assert.ok(!split.blocking.includes(`method: ${CLICK} is worse on cua`));
  assert.equal(split.methods.find(m => m.id === CLICK).verdict, 'no-verdict');
  assert.deepEqual(split.cells.find(c => c.id === CLICK).account.cua.noVerdict, {venue: 1});
  assert.deepEqual(split.cells.find(c => c.id === CLICK).account.vendor.noVerdict, {venue: 1});
  assert.ok(split.missing.some(p => /^run 1's vendor and cua runs did not stand on one frame \(venue:chrome: 30,60 800x760 on this side, 22,60 800x760 on its pair\)/.test(p)), split.missing.join('\n'));
  // On one frame, the same worse sample fails.
  assert.equal(judged({vendor: {resolved: 9, axMs: 50, meta: venue(22)}, cua: {axMs: 40, meta: venue(22), tweak: worseIn1}}).verdict, 'FAIL');
});

// The rules that judge a cua sample with no pair, on its own, would still fail C from a split run: a proven change of
// the user's value, an `own` row (background, launch), an acceptance row, the oracle's interference reading, and pressKey's
// vendor composing otherwise. Every row of a split run is NO VERDICT `venue` before any of them.
test('a split-frame run can never fail the matrix: the user\'s value, own and acceptance rows, interference, pressKey', () => {
  const frame = x => ({x, y: 60, width: 800, height: 760});
  const venueOf = x => run => ({venue: {frames: {chrome: frame(run === 1 ? x : 22)}}});
  const inRun1 = patch => (rows, run) => (run === 1 ? patch(rows) : rows);
  const changed = {ok: false, outcome: {exact: false, length: 0, expectedLength: 5, hash: 'h0', userKept: false, unchanged: true, threw: 'the text did not read back after typing', errorName: 'typeUnconfirmed'}};
  const interfered = {interference: {ok: false, frontmost: false, topWindow: true, activations: 1, route4: false}};
  const PRESS_KEY = 'textedit/latin/pressKey.rk', vendorComposed = {ok: false, outcome: {exact: false}};
  const cases = [
    ['the user\'s value', {cua: inRun1(set(COMPOSING, changed))}, `unicode: ${COMPOSING} failed on cua`],
    ['an own row', {cua: inRun1(set(BACK, {ok: false}))}, `method: ${BACK} is worse on cua`],
    ['a launch row', {cua: inRun1(set(LAUNCH, {ok: false, outcome: {scene: false, panel: true}}))}, `launch: ${LAUNCH} did not launch on cua`],
    ['an acceptance row', {cua: inRun1(set(A4, falseOk('h1')))}, `unicode: ${A4} failed on cua`],
    ['interference', {cua: inRun1(set(BACK, interfered))}, `not interfering: ${BACK} failed on cua`],
    ['pressKey', {vendor: inRun1(set(PRESS_KEY, vendorComposed))}, `unicode: ${PRESS_KEY} composes otherwise on the vendor: the engines differ (ruling 1119)`],
  ];
  for (const [what, tweak, blocking] of cases) {
    const run = (split) => judged({vendor: {resolved: 9, axMs: 50, meta: venueOf(22), tweak: tweak.vendor}, cua: {axMs: 40, meta: venueOf(split ? 30 : 22), tweak: tweak.cua}});
    const one = run(false);
    assert.ok(one.blocking.includes(blocking), `${what} on one frame: ${one.blocking.join('; ')}`);
    const split = run(true);
    assert.notEqual(split.verdict, 'FAIL', `${what}: ${split.blocking.join('; ')}`);
    assert.deepEqual(split.blocking, [], what);
    assert.ok(split.missing.some(p => /^run 1's vendor and cua runs did not stand on one frame/.test(p)), what);
  }
});

test('speed and finding rest on the vendor too: a run whose vendor samples have no verdict leaves cua\'s unpaired', () => {
  const invalidIn = (id, n) => (rows, run) => (run === n ? rows.map(r => (r.id === id ? {...r, invalid: 'x'} : r)) : rows);
  const speed = judged({vendor: {resolved: 9, axMs: 50, tweak: invalidIn('textedit/getAXState', 3)}, cua: {axMs: 40}});
  const row = speed.speed.find(s => s.id === 'textedit/getAXState');
  assert.deepEqual([row.beat, row.provisional], [null, true], 'not qualified: shown as sampled, never counted');
  assert.deepEqual(row.account.cua.noVerdict, {unpaired: 2});
  assert.ok(renderSummary(speed).includes('| getAXState | 50.0 | 50.0 | 40.0 | 40.0 | -20% | not qualified |'), renderSummary(speed));
  assert.ok(speed.missing.some(p => /do not qualify/.test(p)));
  const finding = judged({vendor: {resolved: 9, axMs: 50, tweak: invalidIn('finder/ids', 1)}, cua: {axMs: 40}});
  assert.equal(finding.findingVerdict, 'no-verdict');
});

// ---- R3: the declared departures -------------------------------------------------------------------------------------

const DECISION = 'Decision Log, 2026-11-20, a background click on a shared desktop is refused';
const departure = (patch = {}) => ({section: 'method', id: BACK, vendor: {answer: 'ok'}, cua: {answer: 'refused', errorName: 'backgroundClickRefused', sentence: 'background click refused'}, decision: DECISION, ...patch});
const refusedRow = {ok: false, outcome: {threw: 'Computer Use server error -10005: background click refused; nothing was sent', errorName: 'backgroundClickRefused', unchanged: true}};
test('a declared departure: cua refused where the vendor answered ok, the pair observed with both sides\' checks, listed under what changes for a user', () => {
  const j = judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40, tweak: set(BACK, refusedRow)}, departures: [departure()]});
  assert.deepEqual([j.blocking, j.missing, j.owner], [[], [], []]);
  assert.equal(j.verdict, 'PASS');
  assert.equal(j.methods.find(x => x.id === BACK).verdict, 'declared');
  assert.deepEqual(j.departures.map(d => [d.section, d.id, d.cua.answer, d.decision, d.samples]), [['method', BACK, 'refused', DECISION, 3]]);
  const text = renderSummary(j);
  assert.match(text, /^Verdict: \*\*PASS\*\* \(1 declared departure: What changes for a user\)$/m);
  assert.ok(text.includes(`## What changes for a user\n\nThe places where cua refuses or answers unconfirmed where the vendor answered ok (R3), each declared with its Decision Log entry; nothing else can be here.\n\n- method ${BACK}: the vendor answered ok, cua refused ("background click refused") in 3 sample(s); ${DECISION}`), text);
  // Without its entry the same rows are worse: a difference with no entry fails.
  assert.ok(judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40, tweak: set(BACK, refusedRow)}}).blocking.includes(`method: ${BACK} is worse on cua`));
});

test('a declaration cannot supply an answer nobody observed, nor excuse anything but its one kind', () => {
  const declaredWith = (vendor, cua, list = [departure()]) => judged({vendor: {resolved: 9, axMs: 50, ...vendor}, cua: {axMs: 40, ...cua}, departures: list});
  // The vendor's sample of run 2 invalid: no observed pair there, so no verdict, never declared and never equal.
  const unpaired = declaredWith({tweak: (rows, run) => (run === 2 ? set(BACK, {invalid: 'x'})(rows) : rows)}, {tweak: set(BACK, refusedRow)});
  assert.equal(unpaired.verdict, 'NO VERDICT');
  assert.deepEqual(unpaired.methods.find(x => x.id === BACK).account.cua.noVerdict, {unpaired: 1});
  // The vendor refused too: the entry's kind does not hold; behind, the ground truth judges cua's refusal worse.
  assert.ok(declaredWith({tweak: set(BACK, {ok: false})}, {tweak: set(BACK, refusedRow)}).blocking.includes(`method: ${BACK} is worse on cua`));
  // Another sentence, or a refusal whose effect check did not read the state unchanged: not the declared answer.
  assert.ok(declaredWith({}, {tweak: set(BACK, {ok: false, outcome: {threw: 'another refusal', errorName: 'backgroundClickRefused', unchanged: true}})}).blocking.includes(`method: ${BACK} is worse on cua`));
  assert.ok(declaredWith({}, {tweak: set(BACK, {ok: false, outcome: {threw: 'background click refused', errorName: 'backgroundClickRefused'}})}).blocking.includes(`method: ${BACK} is worse on cua`));
  // A timeout that says it refused is no refusal: the kind comes from the recorded error name (finding 5).
  assert.ok(declaredWith({}, {tweak: set(BACK, {ok: false, outcome: {threw: 'background click refused', errorName: 'timeoutReached', unchanged: true}})}).blocking.includes(`method: ${BACK} is worse on cua`));
  // cua acting differently (answered ok, the check failed): never declarable.
  assert.ok(declaredWith({}, {tweak: set(BACK, {ok: false, outcome: {unchanged: false}})}).blocking.includes(`method: ${BACK} is worse on cua`));
  // A refusal that interfered is not conservative; nor is one beside a vendor sample whose oracle failed.
  const interfered = declaredWith({}, {tweak: set(BACK, {...refusedRow, interference: {ok: false, frontmost: false, topWindow: true, activations: 1, route4: false}})});
  assert.ok(interfered.blocking.includes(`method: ${BACK} is worse on cua`) && interfered.blocking.includes(`not interfering: ${BACK} failed on cua`));
  assert.ok(declaredWith({tweak: set(BACK, {interference: {ok: false, frontmost: false, topWindow: true, activations: 1, route4: false}})}, {tweak: set(BACK, refusedRow)}).blocking.includes(`method: ${BACK} is worse on cua`));
  // The vendor's ok must be an answer that succeeded: a vendor row that passed by refusing (its outcome a refusal) is no
  // vendor ok, whatever the entry says.
  assert.ok(declaredWith({tweak: set(BACK, {outcome: {refused: true, message: 'the vendor refused', unchanged: true}})}, {tweak: set(BACK, refusedRow)}).blocking.includes(`method: ${BACK} is worse on cua`));
  // A frontmost row: the vendor's answer is the reference, sample for sample.
  const front = declaredWith({}, {tweak: set(CLICK, refusedRow)}, [departure({id: CLICK})]);
  assert.equal(front.methods.find(x => x.id === CLICK).verdict, 'declared');
});

test('the judge enforces the kind: an entry of another kind, or one naming a pressKey row, is itself a failure; one no run needed is named', () => {
  const other = judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40}, departures: [departure({vendor: {answer: 'refused'}, cua: {answer: 'ok', sentence: 'x'}})]});
  assert.equal(other.verdict, 'FAIL');
  assert.ok(other.blocking.some(b => /^departures: method textedit\/background\/click\.control@finder is not the one declarable kind \(R3\)/.test(b)), other.blocking.join('\n'));
  const keys = judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40, tweak: set('textedit/korean/pressKey.rk', {ok: false, outcome: {threw: 'refused'}})},
    departures: [departure({section: 'unicode', id: 'textedit/korean/pressKey.rk', cua: {answer: 'refused', errorName: 'backgroundClickRefused', sentence: 'refused before any key'}})]});
  assert.ok(keys.blocking.some(b => /no pressKey row may be declared \(ruling 1119\)/.test(b)), keys.blocking.join('\n'));
  assert.ok(keys.blocking.includes('unicode: textedit/korean/pressKey.rk failed on cua'), 'and the row is judged on its raw outcome');
  const unused = judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40}, departures: [departure()]});
  assert.equal(unused.verdict, 'OWNER');
  assert.ok(unused.owner.includes(`departures: the file declares method ${BACK}, which no sample of the full runs needed: remove it`), unused.owner.join('\n'));
  assert.deepEqual(unused.departures, [], 'nothing unobserved on what changes for a user');
});

// ---- rulings 1136 and 1141: the alert frontmost, the activate check ----------------------------------------------------

const withReadings = (id, frontKey, runs = [1]) => (rows, run) => (runs.includes(run) ? rows.map(r => (r.id === id ? {...r, frontKey: {...READINGS, ...frontKey}} : r)) : rows);
test('hosted runs with every reading good are judged as before', () => {
  const j = judged({vendor: {resolved: 9, axMs: 50, hosted: true}, cua: {axMs: 40, hosted: true}});
  assert.deepEqual([j.verdict, j.missing], ['PASS', []]);
  assert.match(renderSummary(j), /Device mode: shared \(the default\), recorded by every full run; hosted: 6 of 6 full runs\./);
});

test('an alert front or key during a judged sample is NO VERDICT, never a pass: the cell counts it and does not qualify', () => {
  const alert = {after: {front: SCENE_APP, key: ALERT}};
  const j = judged({vendor: {resolved: 9, axMs: 50, hosted: true}, cua: {axMs: 40, hosted: true, tweak: withReadings(CLICK, alert)}});
  assert.equal(j.verdict, 'NO VERDICT');
  assert.deepEqual(j.blocking, []);
  const row = j.methods.find(x => x.id === CLICK);
  assert.equal(row.verdict, 'no-verdict', 'its ok sample is not counted as a pass');
  assert.deepEqual(row.account.cua.noVerdict, {alert: 1});
  assert.ok(renderSummary(j).includes(`| method ${CLICK} | **no verdict** | 2 of 3 | 3 | 2 | r1 1/1, r2 1/1, r3 1/1 | r1 0/1, r2 1/1, r3 1/1 | - | alert 1 | no |`), renderSummary(j));
  // A failing sample with the alert up is no failure: runs 2 and 3 failed with good readings, run 1 is no verdict.
  const failed = judged({vendor: {resolved: 9, axMs: 50, hosted: true}, cua: {axMs: 40, hosted: true, tweak: (rows, run) => withReadings(BACK, alert)(set(BACK, {ok: false})(rows), run)}});
  const back = failed.methods.find(x => x.id === BACK);
  assert.deepEqual([back.verdict, back.account.cua.noVerdict, back.cua.valid], ['worse', {alert: 1}, 2]);
  // Four runs a side: one alert leaves three verdicts, so the cell qualifies and the count is still reported.
  const four = judged({runs: 4, vendor: {resolved: 9, axMs: 50, hosted: true}, cua: {axMs: 40, hosted: true, tweak: withReadings(CLICK, alert)}});
  assert.equal(four.verdict, 'PASS', four.missing.join('\n'));
  assert.ok(renderSummary(four).includes(`| method ${CLICK} | equal | 3 of 3 | 4 | 3 | r1 1/1, r2 1/1, r3 1/1, r4 1/1 | r1 0/1, r2 1/1, r3 1/1, r4 1/1 | - | alert 1 | yes |`), renderSummary(four));
  // The vendor's sample with the alert up leaves cua's of that run without a pair.
  const vendorAlert = judged({vendor: {resolved: 9, axMs: 50, hosted: true, tweak: withReadings(CLICK, alert)}, cua: {axMs: 40, hosted: true}});
  assert.deepEqual(vendorAlert.methods.find(x => x.id === CLICK).account.cua.noVerdict, {unpaired: 1});
});

test('ruling 1154: a sample the alert guard refused is NO VERDICT alert on its own side; the report counts alert per side and per cell', () => {
  const guarded = (rows, run) => (run === 1 ? set(CLICK, {ok: false, invalid: 'the alert guard refused the cell: nothing of it was sent',
    alertGuard: {cause: 'alert', detail: 'alert window 90 (500,300 300x200) overlaps the textedit window (100,100 800x600)'}})(rows) : rows);
  const unread = (rows, run) => (run === 2 ? set(CLICK, {ok: false, invalid: 'the alert guard refused the cell: nothing of it was sent',
    alertGuard: {cause: 'unread', detail: 'the on-screen windows were not read: the alert windows\' bounds are unknown'}})(rows) : rows);
  const j = judged({vendor: {resolved: 9, axMs: 50, hosted: true, tweak: guarded}, cua: {axMs: 40, hosted: true, tweak: (rows, run) => unread(guarded(rows, run), run)}});
  const row = j.methods.find(x => x.id === CLICK);
  assert.equal(row.verdict, 'no-verdict');
  assert.deepEqual([row.account.vendor.noVerdict, row.account.cua.noVerdict], [{alert: 1}, {alert: 1, unread: 1}]);
  const text = renderSummary(j);
  assert.match(text, /^- \*\*NO VERDICT\*\*: 2 cua and 1 vendor sample\(s\) without a verdict; of them `alert` \(an alert in front or key, or the alert guard's refusal\): cua 1, vendor 1;/m);
  assert.ok(text.includes(`| method ${CLICK} | **no verdict** |`) && text.includes('| alert 1 | alert 1, unread 1 | no |'), text);
});

// Ruling 1188: off a GitHub-hosted runner a row needing another input source or preference than the owner's is NO
// VERDICT `ownerInput`; the report counts them per side, so it shows what the owner's machine could not judge.
test('ruling 1188: a row the owner\'s input source did not allow is NO VERDICT ownerInput, counted per side and per cell', () => {
  const cause = 'off a GitHub-hosted runner the harness never selects an input source or writes com.apple.HIToolbox (ruling 1188): they are how the owner types every day; the row needs the input source com.apple.keylayout.ABC, the owner\'s is com.apple.keylayout.US';
  const owned = (rows, run) => (run === 1 ? set(CLICK, {ok: false, ownerInput: cause, invalid: cause})(rows) : rows);
  const j = judged({vendor: {resolved: 9, axMs: 50, tweak: owned}, cua: {axMs: 40, tweak: owned}});
  const row = j.methods.find(x => x.id === CLICK);
  assert.equal(row.verdict, 'no-verdict');
  assert.deepEqual([row.account.vendor.noVerdict, row.account.cua.noVerdict], [{ownerInput: 1}, {ownerInput: 1}]);
  const text = renderSummary(j);
  assert.match(text, /^- \*\*NO VERDICT\*\*: 1 cua and 1 vendor sample\(s\) without a verdict; of them `alert` .*: cua 0, vendor 0; `ownerInput` \(the owner's input source or per-context preference not the row's, never changed off a GitHub-hosted runner, ruling 1188\): cua 1, vendor 1;/m);
  assert.ok(text.includes('| ownerInput 1 | ownerInput 1 | no |'), text);
  assert.doesNotMatch(renderSummary(judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40}})), /`ownerInput`/, 'named only when a row has it');
});

// Ruling 1203: a pointer cell a hosted runner left unsent, its Open panel clamped short of the strip, is NO VERDICT
// `ownerSitting`, counted per side and per cell.
test('ruling 1203: a row left to the owner\'s sitting is NO VERDICT ownerSitting, counted per side and per cell', () => {
  const cause = 'left to the owner\'s sitting, unsent: the Open panel\'s window 994 stood at 0,80 880x448';
  const left = (rows, run) => (run === 3 ? set(CLICK, {ok: false, ownerSitting: cause, invalid: cause})(rows) : rows);
  const j = judged({vendor: {resolved: 9, axMs: 50, tweak: left}, cua: {axMs: 40, tweak: left}});
  const row = j.methods.find(x => x.id === CLICK);
  assert.deepEqual([row.verdict, row.account.vendor.noVerdict, row.account.cua.noVerdict], ['no-verdict', {ownerSitting: 1}, {ownerSitting: 1}]);
  const text = renderSummary(j);
  assert.match(text, /`ownerSitting` \(the Open panel's pointer cells left to the owner's sitting, the panel clamped short of the strip, ruling 1203\): cua 1, vendor 1;/);
  assert.ok(text.includes('| ownerSitting 1 | ownerSitting 1 | no |'), text);
  assert.doesNotMatch(renderSummary(judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40}})), /`ownerSitting`/, 'named only when a row has it');
});

test('ruling 1189: a row whose source the runner could not enable is NO VERDICT venue, counted per side and per cell', () => {
  const cause = 'the runner\'s setup could not enable com.apple.keylayout.ABC (TISEnableInputSource did not read it back as enabled and selectable in TIS\'s list; ruling 1189): the row needs it, and is never run under the US layout';
  const venued = (rows, run) => (run === 2 ? set(CLICK, {ok: false, venueInput: cause, invalid: cause})(rows) : rows);
  const j = judged({vendor: {resolved: 9, axMs: 50, tweak: venued}, cua: {axMs: 40, tweak: venued}});
  const row = j.methods.find(x => x.id === CLICK);
  assert.deepEqual([row.verdict, row.account.vendor.noVerdict, row.account.cua.noVerdict], ['no-verdict', {venue: 1}, {venue: 1}]);
  assert.match(renderSummary(j), /`venue` \(a frame split, or an input source the runner's setup could not enable, ruling 1189\): cua 1, vendor 1;/);
});

test('an activate step that did not take front and key is NO VERDICT, not FAIL; a hosted sample without readings is NO VERDICT', () => {
  const failedActivate = {activate: {app: SCENE_APP, front: false, key: false}, before: {front: ALERT, key: ALERT}};
  const all = [1, 2, 3];
  const j = judged({vendor: {resolved: 9, axMs: 50, hosted: true}, cua: {axMs: 40, hosted: true, tweak: (rows, run) => withReadings(BACK, failedActivate, all)(set(BACK, {ok: false})(rows), run)}});
  assert.deepEqual(j.blocking, [], 'its failed rows were never judged');
  assert.equal(j.verdict, 'NO VERDICT');
  assert.deepEqual(j.methods.find(x => x.id === BACK).account.cua.noVerdict, {activation: 3});
  assert.ok(renderSummary(j).includes(`| method ${BACK} | **no verdict** | 0 of 3 | 3 | 0 | r1 1/1, r2 1/1, r3 1/1 | r1 0/1, r2 0/1, r3 0/1 | - | activation 3 | no |`), renderSummary(j));
  const unread = judged({vendor: {resolved: 9, axMs: 50, hosted: true}, cua: {axMs: 40, hosted: true, tweak: (rows, run) => (run === 2 ? rows.map(r => (r.id === CLICK ? (({frontKey, ...rest}) => rest)(r) : r)) : rows)}});
  assert.equal(unread.verdict, 'NO VERDICT');
  assert.deepEqual(unread.methods.find(x => x.id === CLICK).account.cua.noVerdict, {unread: 1});
  // The same rows off a hosted runner (hold 3's, the mini's) carry no readings and are judged as they read.
  assert.equal(judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40}}).verdict, 'PASS');
  // An alert in a speed sample: the sample leaves the statistics and its run does not count.
  const speed = judged({vendor: {resolved: 9, axMs: 50, hosted: true}, cua: {axMs: 40, hosted: true, tweak: withReadings('textedit/getAXState', {before: {front: ALERT, key: SCENE_APP}})}});
  const row = speed.speed.find(s => s.id === 'textedit/getAXState');
  assert.deepEqual([row.beat, row.account.cua.noVerdict, row.cua.n], [null, {alert: 2}, 4]);
});

test('the device mode: a full run naming another than shared is missing proof; the report states it', () => {
  const j = judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40, meta: {desktopMode: 'dedicated'}}});
  assert.equal(j.verdict, 'NO VERDICT');
  assert.ok(j.missing.some(p => /^3 full run\(s\) record the device mode dedicated: the matrix is judged in the shared device mode \(R3\)$/.test(p)), j.missing.join('\n'));
  assert.match(renderSummary(judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40}})), /Device mode: not recorded by 6 full run\(s\) \(the default, shared, is the rule\); hosted: 0 of 6 full runs\./);
});

test('the report follows the three-point report: speed, finding elements, not interfering, what changes for a user, not judged, NO VERDICT by cell', () => {
  const j = judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40, tweak: set(BACK, refusedRow)}, departures: [departure()]});
  const text = renderSummary(j);
  const order = ['## The three points', '## Speed (in-cell ms)', '## Finding elements', '## Not interfering', '## What changes for a user', '## Not judged', '## NO VERDICT by cell', '## Methods'];
  const at = order.map(h => text.indexOf(h));
  assert.ok(at.every(i => i >= 0), order.filter((h, i) => at[i] < 0).join(', '));
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in this order');
  assert.ok(text.includes('No cell has a NO VERDICT sample, and every cell qualifies (3 complete run pairs).'), text);
});

// ---- the records under docs/ -------------------------------------------------------------------------------------------

test('hold 3\'s records still load and judge: FAIL, on interference and Unicode rows; no cua sample without its vendor pair is judged', () => {
  const {results, problems} = readResults([fileURLToPath(new URL('../../docs/doperpowers/research/2026-10-18-own-native-engine/m2b/hold3', import.meta.url))]);
  const j = judge(results, problems, {departures: []});
  assert.equal(j.verdict, 'FAIL');
  // The mid-switch row is judged by its measured prefix, paired or not: cua's run 2 failure fails it.
  for (const line of ['unicode: chrome/korean/typeText.lines failed on cua', 'finding elements: finder is lower on cua',
    'unicode: chrome/midSwitch/typeText.long failed on cua'])
    assert.ok(j.blocking.includes(line), line);
  // Its concurrent rows failed the oracle on both engines in run 1 with nothing recorded of what came over the user
  // window: that pair is shared and unread, missing proof (ruling 1219, h5; fix wave I1). cua's run 2 failed them too and
  // has no vendor run to pair with, so by the paired rule (fix wave I2) each still blocks.
  for (const id of ['chrome/concurrent@textedit', 'finder/concurrent@textedit']) {
    assert.ok(j.blocking.includes(`not interfering: ${id} failed on cua`), id);
    assert.ok(j.missing.includes(`not interfering: ${id} failed on both engines (unread), NO VERDICT on cua: ticket to be registered`), id);
  }
  assert.deepEqual(j.sharedInterference.map(s => [s.id, s.kind, s.samples]), [['chrome/concurrent@textedit', 'unread', 1], ['finder/concurrent@textedit', 'unread', 1]]);
  // Its Chrome notText row (#190): run 1's pair both refused alike, equal (a frontmost row, no shared limit); cua's run 2
  // has no vendor run, so it no longer fails on its own. It was the record's one frontmost "worse".
  const notText = j.methods.find(x => x.id === 'chrome/frontmost/selectText.notText');
  assert.deepEqual([notText.verdict, notText.account.cua.noVerdict], ['no-verdict', {unpaired: 1}]);
  assert.deepEqual(j.shared, []);
  assert.ok(!j.methods.some(x => x.verdict === 'worse'));
  assert.ok(j.cells.every(c => !c.qualifies), 'one vendor run and two cua runs: no cell has three complete run pairs');
});

// ---- the fix wave: provenance, eligible observations, method timings, ruling 1144 --------------------------------------

// Three runs a side in memory, each run's meta and rows given per engine and run number.
const judgeEach = ({vendor = () => ({}), cua = () => ({}), departures = []} = {}) => {
  const runs = [];
  for (let n = 1; n <= 3; n++) for (const [engine, opts] of [['vendor', vendor(n)], ['cua', cua(n)]]) runs.push({path: `${engine}/run-${n}`, result: fullRun(engine, n, opts)});
  return judge(runs, [], {departures});
};

test('a pair from two commits is not compared: its cua sample has no verdict where the vendor\'s answer is the reference, and still fails on its own behind', () => {
  const j = judgeEach({vendor: () => ({resolved: 9, axMs: 50}),
    cua: n => ({axMs: 40, ...(n === 2 ? {meta: {commit: 'c2'}, tweak: rows => set(BACK, {ok: false})(set(CLICK, {ok: false})(rows))} : {})})});
  assert.ok(j.missing.some(p => /^run 2's vendor and cua runs name more than one commit/.test(p)));
  assert.ok(!j.blocking.includes(`method: ${CLICK} is worse on cua`), 'never compared against another commit\'s vendor sample');
  assert.deepEqual(j.methods.find(x => x.id === CLICK).account.cua.noVerdict, {unpaired: 1});
  assert.ok(j.blocking.includes(`method: ${BACK} is worse on cua`), 'a failure against ground truth needs no pair');
  // Speed is compared only on eligible pairs too.
  assert.deepEqual(j.speed.find(s => s.id === 'textedit/getAXState').account.cua.noVerdict, {unpaired: 2});
});

test('speed and finding compare the same eligible observations on both sides: a vendor reading with no cua match is left out', () => {
  const slow = rows => rows.map(r => (r.id === 'textedit/getAXState' ? {...r, inCellMs: 500} : r));
  const j = judgeEach({vendor: n => ({resolved: 9, axMs: 50, ...(n === 3 ? {tweak: slow} : {})}),
    cua: n => ({axMs: 40, ...(n === 3 ? {tweak: rows => rows.map(r => (r.id === 'textedit/getAXState' ? {...r, invalid: 'x'} : r))} : {})})});
  const row = j.speed.find(s => s.id === 'textedit/getAXState');
  assert.deepEqual([row.vendor.n, row.vendor.median, row.vendor.p95, row.cua.n], [4, 50, 50, 4], 'run 3\'s vendor samples have no cua match');
  assert.equal(row.account.vendor.verdicts, 6, 'the side\'s own count kept as a diagnostic');
  // A finding target the vendor resolved only in a run cua has no verdict for does not count for the vendor.
  const finding = judgeEach({vendor: n => ({resolved: n === 1 ? 10 : 9, axMs: 50}),
    cua: n => ({axMs: 40, resolved: 9, ...(n === 1 ? {tweak: rows => rows.map(r => (r.section === 'finding' && r.id.startsWith('textedit/') ? {...r, invalid: 'x'} : r))} : {})})});
  assert.equal(finding.finding.find(f => f.scene === 'textedit').vendor.resolved, 9);
});

test('the per-method timings are in the manifest and the ledger; a timing without a numeric duration has no verdict', () => {
  const manifest = manifestOf({run: 1, samples: 2});
  for (const id of ['textedit/method.click.control', 'textedit/method.panel.click.cancel', 'finder/method.click.row']) assert.ok(manifest.some(e => e.section === 'speed' && e.id === id && e.sample === 1), id);
  const j = judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40, tweak: (rows, run) => (run === 1 ? rows.map(r => (r.id === 'textedit/method.click.control' ? (({inCellMs, ...rest}) => rest)(r) : r)) : rows)}});
  assert.equal(j.verdict, 'NO VERDICT');
  const cell = j.cells.find(c => c.section === 'speed' && c.id === 'textedit/method.click.control');
  assert.deepEqual([cell.qualifies, cell.account.cua.noVerdict], [false, {unmeasured: 1}]);
});

test('two frontmost failures are equal only as the same failure: a vendor refusal beside a cua wrong effect is worse', () => {
  const vendorRefused = {ok: false, outcome: {collapsed: false, unchanged: true, threw: 'Computer Use server error -10005: element not found', errorName: 'Error'}};
  const j = judged({vendor: {resolved: 9, axMs: 50, tweak: set(CLICK, vendorRefused)}, cua: {axMs: 40, tweak: set(CLICK, {ok: false, outcome: {collapsed: false, unchanged: false}})}});
  assert.ok(j.blocking.includes(`method: ${CLICK} is worse on cua`), j.blocking.join('\n'));
  const alike = judged({vendor: {resolved: 9, axMs: 50, tweak: set(CLICK, vendorRefused)}, cua: {axMs: 40, tweak: set(CLICK, vendorRefused)}});
  assert.equal(alike.methods.find(x => x.id === CLICK).verdict, 'equal');
  assert.deepEqual(alike.shared, [], 'ruling 1144 is the fixed-string rows\' alone: a frontmost row is no shared limit');
});

// Ruling 1144: a row judged by an absolute expected string.
const LINES = 'chrome/korean/typeText.lines', A4 = 'textedit/korean/typeText.acceptance4';
const falseOk = hash => ({ok: false, outcome: {exact: false, nfcEqual: false, length: 3, expectedLength: 5, hash}});
test('ruling 1144: a shared failure with the same read-back is equal and listed as a shared limit; a false ok on both is flagged', () => {
  const j = judged({vendor: {resolved: 9, axMs: 50, tweak: set(LINES, falseOk('h1'))}, cua: {axMs: 40, tweak: set(LINES, falseOk('h1'))}});
  assert.deepEqual([j.verdict, j.blocking, j.missing], ['PASS', [], []]);
  assert.equal(j.unicode.find(u => u.id === LINES).verdict, 'shared');
  assert.deepEqual(j.shared.map(g => [g.kind, g.priority, g.rows.map(r => [r.id, r.samples])]), [['shared false ok', 'P2 or higher', [[LINES, 3]]]]);
  const text = renderSummary(j);
  assert.match(text, /^Verdict: \*\*PASS\*\* \(1 shared limit: Shared limits \(vendor has them too\)\)$/m);
  assert.ok(text.includes(`## Shared limits (vendor has them too)`) && text.includes(`- ${LINES}: 3 sample(s), read back 3 of 5 characters on both`), text);
  assert.ok(text.indexOf('## Shared limits (vendor has them too)') > text.indexOf('## What changes for a user'));
});

test('ruling 1144: another read-back, the vendor passing any sample, or a cua false ok beside a vendor refusal fails; an unpaired sample has no verdict', () => {
  const other = judged({vendor: {resolved: 9, axMs: 50, tweak: set(LINES, falseOk('h1'))}, cua: {axMs: 40, tweak: set(LINES, falseOk('h2'))}});
  assert.ok(other.blocking.includes(`unicode: ${LINES} failed on cua`));
  const vendorPassedOne = judged({vendor: {resolved: 9, axMs: 50, tweak: (rows, run) => (run === 2 ? rows : set(LINES, falseOk('h1'))(rows))}, cua: {axMs: 40, tweak: set(LINES, falseOk('h1'))}});
  assert.ok(vendorPassedOne.blocking.includes(`unicode: ${LINES} failed on cua`), 'the vendor typed it in run 2');
  const vendorRefused = {ok: false, outcome: {exact: false, length: 0, expectedLength: 5, hash: 'h1', threw: 'Timed out', errorName: 'Error'}};
  assert.ok(judged({vendor: {resolved: 9, axMs: 50, tweak: set(LINES, vendorRefused)}, cua: {axMs: 40, tweak: set(LINES, falseOk('h1'))}}).blocking.includes(`unicode: ${LINES} failed on cua`), 'a cua false ok where the vendor refused');
  const unpaired = judged({vendor: {resolved: 9, axMs: 50, tweak: (rows, run) => set(LINES, run === 1 ? {invalid: 'x'} : falseOk('h1'))(rows)}, cua: {axMs: 40, tweak: set(LINES, falseOk('h1'))}});
  const row = unpaired.unicode.find(u => u.id === LINES);
  assert.deepEqual([unpaired.verdict, row.verdict, row.account.cua.noVerdict], ['NO VERDICT', 'no-verdict', {unpaired: 1}], 'NO VERDICT never counts toward a pass');
});

test('ruling 1144: cua refusing or answering unconfirmed where the vendor gave a false ok is better, listed under what changes for a user', () => {
  const unconfirmed = {ok: false, outcome: {exact: false, length: 0, expectedLength: 5, hash: 'h0', threw: 'the text did not read back', errorName: 'typeUnconfirmed', unchanged: true}};
  const j = judged({vendor: {resolved: 9, axMs: 50, tweak: set(LINES, falseOk('h1'))}, cua: {axMs: 40, tweak: set(LINES, unconfirmed)}});
  assert.deepEqual([j.verdict, j.blocking], ['PASS', []]);
  assert.equal(j.unicode.find(u => u.id === LINES).verdict, 'better');
  assert.ok(renderSummary(j).includes(`- unicode ${LINES}: the vendor answered ok with other text (a false ok), cua answered unconfirmed (typeUnconfirmed) in 3 sample(s): better, no entry needed`), renderSummary(j));
  // Named only by the facade's plain Error, the same answer is no evidence of a refusal: a failure.
  const unnamed = judged({vendor: {resolved: 9, axMs: 50, tweak: set(LINES, falseOk('h1'))}, cua: {axMs: 40, tweak: set(LINES, {...unconfirmed, outcome: {...unconfirmed.outcome, errorName: 'Error'}})}});
  assert.ok(unnamed.blocking.includes(`unicode: ${LINES} failed on cua`));
});

test('acceptance rows are absolute: neither a shared limit nor a departure satisfies them (S L239)', () => {
  const shared = judged({vendor: {resolved: 9, axMs: 50, tweak: set(A4, falseOk('h1'))}, cua: {axMs: 40, tweak: set(A4, falseOk('h1'))}});
  assert.ok(shared.blocking.includes(`unicode: ${A4} failed on cua`));
  assert.deepEqual(shared.shared, []);
  const unconfirmed = {ok: false, outcome: {exact: false, hash: 'h0', threw: 'the text did not read back', errorName: 'typeUnconfirmed', unchanged: true}};
  const declared = judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40, tweak: set(A4, unconfirmed)},
    departures: [departure({section: 'unicode', id: A4, cua: {answer: 'unconfirmed', errorName: 'typeUnconfirmed', sentence: 'the text did not read back'}})]});
  assert.ok(declared.blocking.some(b => /^departures: unicode textedit\/korean\/typeText\.acceptance4 .*an acceptance row/.test(b)), declared.blocking.join('\n'));
  assert.ok(declared.blocking.includes(`unicode: ${A4} failed on cua`));
  const better = judged({vendor: {resolved: 9, axMs: 50, tweak: set(A4, falseOk('h1'))}, cua: {axMs: 40, tweak: set(A4, unconfirmed)}});
  assert.ok(better.blocking.includes(`unicode: ${A4} failed on cua`), 'an honest answer is still not the exact text');
});

// ---- round 2 of the review: the timing triple, the pair's device and OS, the user's value, 1144's scope ---------------

test('the triple is three common complete run pairs: a partial run\'s readings are diagnostics, never the official speed', () => {
  // Runs 1-3 complete on both sides; run 4's vendor holds one valid sample of two.
  const sample = (engine, run, i, ms, extra = {}) => ({section: 'speed', id: 'textedit/getAXState', engine, run, sample: (run - 1) * 2 + i, ok: true, inCellMs: ms, ...extra});
  const vendor = [1, 2, 3].flatMap(r => [sample('vendor', r, 1, 50), sample('vendor', r, 2, 50)]).concat(sample('vendor', 4, 1, 70), sample('vendor', 4, 2, 50, {invalid: 'x'}));
  const cua = [1, 2, 3].flatMap(r => [sample('cua', r, 1, 45), sample('cua', r, 2, 52)]).concat(sample('cua', 4, 1, 10), sample('cua', 4, 2, 10));
  const row = judgeSpeed(vendor, cua, {required: 3});
  assert.deepEqual([row.beat, row.vendor.n, row.cua.n, row.account.pairs], [false, 6, 6, 3], 'run 4 is no complete pair: its readings would have made a beat');
  assert.equal(row.provisional, true, 'what every reading would give, shown and never counted');
  assert.deepEqual(row.account.cua.noVerdict, {unpaired: 2});
  // A run whose sides hold other samples than planned is no complete pair either.
  const planned = judgeSpeed(vendor.slice(0, 6), cua.slice(0, 6), {required: 3, planned: () => 3});
  assert.deepEqual([planned.beat, planned.account.pairs, planned.vendor], [null, 0, null]);
});

test('a cell qualifies on common complete runs: three complete runs a side with none in common is no triple', () => {
  const row = (engine, run, extra = {}) => ({section: 'concurrent', id: 'chrome/concurrent@textedit', engine, run, sample: run, ok: true, ...extra});
  const vendor = [1, 2, 3, 4, 5, 6].map(r => row('vendor', r, r > 3 ? {invalid: 'x'} : {}));
  const cua = [1, 2, 3, 4, 5, 6].map(r => row('cua', r, r <= 3 ? {invalid: 'x'} : {}));
  const cell = judgeCell('own', vendor, cua, {required: 3});
  assert.deepEqual([cell.account.vendor.runs, cell.account.cua.runs, cell.account.pairs, cell.account.qualifies, cell.verdict], [3, 3, 0, false, 'no-verdict']);
});

test('a pair from two devices or two OS versions is not compared: no comparative finding comes from it', () => {
  for (const cuaRun2 of [{device: 'other'}, {meta: {os: {...OS, build: '25A362'}}}]) {
    const j = judgeEach({vendor: () => ({resolved: 9, axMs: 50}), cua: n => ({axMs: 40, ...(n === 2 ? {...cuaRun2, tweak: set(CLICK, {ok: false})} : {})})});
    assert.ok(j.missing.some(p => /^run 2's vendor and cua runs name more than one (device|OS)/.test(p)), j.missing.join('\n'));
    assert.ok(!j.blocking.includes(`method: ${CLICK} is worse on cua`), JSON.stringify(cuaRun2));
    assert.deepEqual(j.methods.find(x => x.id === CLICK).account.cua.noVerdict, {unpaired: 1});
  }
});

// T10b′ part 2: on a GitHub-hosted runner the device alias names every runner alike, so a pair is one job's run: each
// hosted run records the runner the device attested (meta.runner), and both runs of a pair name one.
test('a hosted pair is one job\'s run: a run with no runner record, or a pair from two runs, is not compared', () => {
  const RUNNER = id => ({kind: 'github-hosted', image: {name: 'macos26', version: '20261117.0516.1'}, run: {id, attempt: '1'}, vm: {id: 'vm-1', platformUuid: 'P', bootedAt: 'B'},
    install: {home: '/H', release: 'r'}, engine: {bundle: '/A/cua Engine.app', build: 'b', engineVersion: '0.2.0'}});
  const hosted = id => ({hosted: true, runner: RUNNER(id)});
  const same = judgeEach({vendor: () => ({resolved: 9, axMs: 50, meta: hosted('7')}), cua: () => ({axMs: 40, meta: hosted('7')})});
  assert.ok(!same.missing.some(p => /hosted runner/.test(p)), same.missing.join('\n'));
  const other = judgeEach({vendor: () => ({resolved: 9, axMs: 50, meta: hosted('7')}), cua: n => ({axMs: 40, meta: hosted(n === 2 ? '8' : '7')})});
  assert.ok(other.missing.some(p => /^run 2's vendor and cua runs name more than one hosted runner \(.*run 7 attempt 1.*run 8 attempt 1.*\): a pair is measured in one job's run/.test(p)), other.missing.join('\n'));
  assert.ok(other.missing.some(p => /^the full runs name more than one hosted runner/.test(p)), other.missing.join('\n'));
  // One dispatch's sittings share the run and its attempt but each is its own VM: two VMs never pair.
  const twoVms = judgeEach({vendor: () => ({resolved: 9, axMs: 50, meta: hosted('7')}), cua: n => ({axMs: 40, meta: n === 2 ? {hosted: true, runner: {...RUNNER('7'), vm: {id: 'vm-2', platformUuid: 'Q', bootedAt: 'B'}}} : hosted('7')})});
  assert.ok(twoVms.missing.some(p => /^run 2's vendor and cua runs name more than one hosted runner \(.*run 7 attempt 1, VM vm-1.*run 7 attempt 1, VM vm-2.*\)/.test(p)), twoVms.missing.join('\n'));
  const none = judgeEach({vendor: () => ({resolved: 9, axMs: 50, meta: {hosted: true}}), cua: () => ({axMs: 40, meta: {hosted: true}})});
  assert.ok(none.missing.some(p => p.startsWith('run 1: a run records no hosted runner (meta.runner)')), none.missing.join('\n'));
  // Off a runner nothing changes: no run records one, and none is asked for.
  assert.ok(!judgeEach({vendor: () => ({resolved: 9, axMs: 50}), cua: () => ({axMs: 40})}).missing.some(p => /hosted runner/.test(p)));
});

const COMPOSING = 'textedit/composing@electron/typeText.hangul';
test('a changed user value on one side is never a shared limit; a conservative answer needs its unchanged state or effect', () => {
  const kept = kept => ({...falseOk('h1'), outcome: {...falseOk('h1').outcome, userKept: kept}});
  const cuaChanged = judged({vendor: {resolved: 9, axMs: 50, tweak: set(COMPOSING, kept(true))}, cua: {axMs: 40, tweak: set(COMPOSING, kept(false))}});
  assert.ok(cuaChanged.blocking.includes(`unicode: ${COMPOSING} failed on cua`), cuaChanged.blocking.join('\n'));
  const vendorChanged = judged({vendor: {resolved: 9, axMs: 50, tweak: set(COMPOSING, kept(false))}, cua: {axMs: 40, tweak: set(COMPOSING, kept(true))}});
  assert.ok(vendorChanged.blocking.includes(`unicode: ${COMPOSING} failed on cua`));
  assert.equal(judged({vendor: {resolved: 9, axMs: 50, tweak: set(COMPOSING, kept(true))}, cua: {axMs: 40, tweak: set(COMPOSING, kept(true))}}).unicode.find(u => u.id === COMPOSING).verdict, 'shared');
  // Unconfirmed with another wrong read-back, nothing showing the state unchanged or the effect intended: a failure.
  const bare = {ok: false, outcome: {exact: false, length: 2, expectedLength: 5, hash: 'h2', threw: 'the text did not read back', errorName: 'typeUnconfirmed', unchanged: false, effect: false}};
  assert.ok(judged({vendor: {resolved: 9, axMs: 50, tweak: set(LINES, falseOk('h1'))}, cua: {axMs: 40, tweak: set(LINES, bare)}}).blocking.includes(`unicode: ${LINES} failed on cua`));
});

const MID = 'chrome/midSwitch/typeText.long', ROW_SELECT = 'finder/frontmost/click.row';
test('1144 is the fixed-string rows\' alone: the mid-switch row and a frontmost method row keep their own rules', () => {
  // The mid-switch row is judged by its measured prefix: a failure fails, paired or not, alike or not.
  const stop = {ok: false, outcome: {stopped: true, exact: false, sentenceAgrees: false, length: 3, hash: 'h1', errorName: 'Error', message: 'x'}};
  assert.ok(judged({vendor: {resolved: 9, axMs: 50, tweak: set(MID, stop)}, cua: {axMs: 40, tweak: set(MID, stop)}}).blocking.includes(`unicode: ${MID} failed on cua`));
  assert.ok(judged({vendor: {resolved: 9, axMs: 50, tweak: set(MID, {invalid: 'x'})}, cua: {axMs: 40, tweak: set(MID, stop)}}).blocking.includes(`unicode: ${MID} failed on cua`));
  // Frontmost: Finder selecting none against two is another effect, whatever booleans agree.
  const selected = n => ({ok: false, outcome: {rowFound: true, selected: n, only: false}});
  assert.ok(judged({vendor: {resolved: 9, axMs: 50, tweak: set(ROW_SELECT, selected(2))}, cua: {axMs: 40, tweak: set(ROW_SELECT, selected(0))}}).blocking.includes(`method: ${ROW_SELECT} is worse on cua`));
  assert.equal(judged({vendor: {resolved: 9, axMs: 50, tweak: set(ROW_SELECT, selected(2))}, cua: {axMs: 40, tweak: set(ROW_SELECT, selected(2))}}).methods.find(x => x.id === ROW_SELECT).verdict, 'equal');
  // cua answering unconfirmed where the vendor answered ok needs an R3 entry on a frontmost row, as before: no undeclared exception.
  const unconfirmed = {ok: false, outcome: {rowFound: true, selected: 1, only: false, unchanged: true, threw: 'the click did not select the row', errorName: 'clickUnconfirmed'}};
  assert.ok(judged({vendor: {resolved: 9, axMs: 50, tweak: set(ROW_SELECT, selected(2))}, cua: {axMs: 40, tweak: set(ROW_SELECT, unconfirmed)}}).blocking.includes(`method: ${ROW_SELECT} is worse on cua`));
});

test('shared limits group each observation by its own cause and priority; a shared row is no pass of the Unicode count', () => {
  const timeout = {ok: false, outcome: {exact: false, length: 0, expectedLength: 5, hash: 'h0', threw: 'Timed out', errorName: 'Error'}};
  const mixed = (rows, run) => set(LINES, run === 1 ? timeout : falseOk('h1'))(rows);
  const j = judged({vendor: {resolved: 9, axMs: 50, tweak: mixed}, cua: {axMs: 40, tweak: mixed}});
  assert.deepEqual(j.shared.map(g => [g.kind, g.priority, g.rows.map(r => [r.id, r.samples])]).sort(),
    [['honest failure', 'P3', [[LINES, 1]]], ['shared false ok', 'P2 or higher', [[LINES, 2]]]]);
  const total = j.unicode.length;
  assert.ok(renderSummary(j).includes(`- **Korean and Unicode**: ${total - 1} of ${total} rows pass on cua, 1 a shared limit`), renderSummary(j));
});

// ---- round 3: the provenance fields' own validators, the user's value first, the speed diagnostics -------------------

test('a pair\'s hold, commit and approved build are strings, and its OS a whole {name, version, build} compared field by field', () => {
  const objects = judgeEach({vendor: () => ({resolved: 9, axMs: 50, meta: {sitting: {id: 's'}, commit: {sha: 'c'}, nativeEngine: {approved: {build: {sha: 'a'}}}}}),
    cua: () => ({axMs: 40, meta: {sitting: {id: 's'}, commit: {sha: 'c'}, nativeEngine: {approved: {build: {sha: 'a'}}}}})});
  assert.notEqual(objects.verdict, 'PASS');
  for (const what of ['hold', 'commit', 'approved engine build']) assert.ok(objects.missing.some(p => p.startsWith(`run 1: a run records no ${what} `)), what);
  const partial = judgeEach({vendor: () => ({resolved: 9, axMs: 50, meta: {os: {version: '26.0'}}}), cua: () => ({axMs: 40, meta: {os: {version: '26.0'}}})});
  assert.ok(partial.missing.some(p => p.startsWith('run 1: a run records no OS ')), partial.missing.join('\n'));
  assert.ok(partial.methods.every(m => m.account.pairs === 0));
  const build = judgeEach({vendor: () => ({resolved: 9, axMs: 50}), cua: n => ({axMs: 40, ...(n === 1 ? {meta: {os: {...OS, build: '25A362'}}} : {})})});
  assert.ok(build.missing.some(p => /^run 1's vendor and cua runs name more than one OS/.test(p)), build.missing.join('\n'));
  // Key order is no difference.
  assert.equal(judgeEach({vendor: () => ({resolved: 9, axMs: 50}), cua: () => ({axMs: 40, meta: {os: {build: OS.build, version: OS.version, name: OS.name}}})}).verdict, 'PASS');
});

test('a proven change of the user\'s value fails on its own, before any departure, pair or shared exception', () => {
  const changed = {ok: false, outcome: {exact: false, length: 0, expectedLength: 5, hash: 'h0', userKept: false, unchanged: true,
    threw: 'the text did not read back after typing', errorName: 'typeUnconfirmed'}};
  const entry = departure({section: 'unicode', id: COMPOSING, cua: {answer: 'unconfirmed', errorName: 'typeUnconfirmed', sentence: 'the text did not read back'}});
  const declared = judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40, tweak: set(COMPOSING, changed)}, departures: [entry]});
  assert.ok(declared.blocking.includes(`unicode: ${COMPOSING} failed on cua`), declared.blocking.join('\n'));
  const unpaired = judged({vendor: {resolved: 9, axMs: 50, tweak: set(COMPOSING, {invalid: 'x'})}, cua: {axMs: 40, tweak: set(COMPOSING, changed)}});
  assert.ok(unpaired.blocking.includes(`unicode: ${COMPOSING} failed on cua`), 'no pair is needed to prove it');
  // A refusal is better than a false ok only where the vendor's text was wrong: exact text with the user's value lost is
  // no false ok.
  const refused = {ok: false, outcome: {exact: false, length: 0, expectedLength: 5, hash: 'h0', userKept: true, unchanged: true, threw: 'the text did not read back', errorName: 'typeUnconfirmed'}};
  const exact = {ok: false, outcome: {exact: true, length: 5, expectedLength: 5, hash: 'h5', userKept: false}};
  const vendorExact = judged({vendor: {resolved: 9, axMs: 50, tweak: set(COMPOSING, exact)}, cua: {axMs: 40, tweak: set(COMPOSING, refused)}});
  assert.ok(vendorExact.blocking.includes(`unicode: ${COMPOSING} failed on cua`), vendorExact.blocking.join('\n'));
  assert.deepEqual(vendorExact.honest, []);
});

test('a speed row not qualified shows what its partial readings would give as a labelled diagnostic, never beside the official columns', () => {
  const partial = (rows, run) => (run === 3 ? rows.map(r => (r.id === 'textedit/getAXState' && r.sample === 6 ? {...r, invalid: 'x'} : r)) : rows);
  const j = judged({vendor: {resolved: 9, axMs: 50, tweak: partial}, cua: {axMs: 40}});
  const text = renderSummary(j);
  assert.ok(text.includes('| getAXState | 50.0 | 50.0 | 40.0 | 40.0 | -20% | not qualified |'), text);
  assert.ok(text.includes('- getAXState (diagnostic, not counted): every eligible reading, partial runs included: vendor median 50.0, p95 50.0 (5); cua median 40.0, p95 40.0 (6); would beat: yes'), text);
  assert.ok(!/as sampled/.test(text));
});

// Review finding 6 (ruling 1203): one lane's panel clamped (its click left to the owner's sitting, unsent), the other's
// placed in the strip. The opening's frames split, yet the unsent side keeps `ownerSitting` on the click and its timing;
// the placed side's samples are the split's (`venue`), with no pair.
test('a clamped opening against a placed one: the unsent side stays ownerSitting, the other side has no pair', () => {
  const OPEN = 'openPanel/frontmost/click.cancel', TIMING = 'textedit/method.panel.click.cancel';
  const centred = {x: 520, y: 162, width: 880, height: 448}, asked = {x: -58, y: 80, width: 880, height: 448};
  const entry = readBack => ({beforeRow: 1, target: 'openPanel', opening: OPEN, number: 994, from: centred, to: asked, readBack, matched: readBack.x === -58,
    ax: {trusted: true, found: true, size: null, position: 0, readBack}, moved: true, inStrip: readBack.x === -58, ...(readBack.x === -58 ? {} : {fallback: 'clamped'})});
  const placed = readBack => () => ({hosted: true, placement: {alerts: [], scenes: {}, panel: [entry(readBack)]}});
  const cause = 'left to the owner\'s sitting, unsent: the Open panel\'s window 994 stood at 0,80 880x448: its x clamped where -116 was asked';
  const tag = rows => rows.map(r => (r.id === OPEN || r.id === TIMING ? {...r, opening: OPEN} : r));
  const unsent = rows => tag(rows).map(r => (r.id === OPEN || r.id === TIMING ? {...r, ok: false, ownerSitting: cause, invalid: cause} : r));
  const j = judged({vendor: {resolved: 9, axMs: 50, meta: placed({x: 0, y: 80, width: 880, height: 448}), tweak: unsent}, cua: {axMs: 40, meta: placed(asked), tweak: tag}});
  const click = j.cells.find(c => c.id === OPEN);
  assert.deepEqual([click.account.vendor.noVerdict, click.account.cua.noVerdict], [{ownerSitting: 3}, {venue: 3}]);
  const timing = j.cells.find(c => c.id === TIMING);
  assert.deepEqual(timing.account.vendor.noVerdict, {ownerSitting: 3});
  assert.match(renderSummary(j), /`ownerSitting` \(the Open panel's pointer cells left to the owner's sitting, the panel clamped short of the strip, ruling 1203\): cua 0, vendor [1-9]/);
});

// Review finding 4: a panel opening whose placement the lanes read apart leaves that opening's rows alone without a
// pair (NO VERDICT `venue`); the run is still one pair, every other row judged, and no missing proof is said of it.
test('a panel opening that stood apart on the two lanes takes only its own rows out; the run and its other rows are judged', () => {
  const OPEN = 'openPanel/frontmost/getAXState.panel';
  const placed = x => ({placement: {alerts: [], scenes: {}, panel: [{beforeRow: 1, target: 'openPanel', opening: OPEN, number: 994, from: {x, y: 80, width: 720, height: 440}, moved: false, inStrip: true}]}});
  const tag = rows => rows.map(r => (r.id === OPEN || r.id === 'textedit/method.panel.getAXState.panel' ? {...r, opening: OPEN} : r));
  const worseIn1 = (rows, run) => (run === 1 ? set(CLICK, {ok: false})(tag(rows)) : tag(rows));
  const j = judged({vendor: {resolved: 9, axMs: 50, meta: () => placed(80), tweak: tag}, cua: {axMs: 40, meta: run => placed(run === 1 ? 22 : 80), tweak: worseIn1}});
  assert.ok(j.blocking.includes(`method: ${CLICK} is worse on cua`), 'the run\'s other rows are still judged');
  assert.ok(!j.missing.some(p => /did not stand on one frame/.test(p)), j.missing.join('\n'));
  assert.deepEqual(j.cells.find(c => c.id === OPEN).account.cua.noVerdict, {venue: 1});
  assert.deepEqual(j.cells.find(c => c.id === CLICK).account.cua.noVerdict ?? {}, {});
});

// The coordinator's follow-up to ruling 1204: a row judged by its own effect that passed while its act threw is still a
// pass, and counted apart per engine with its thrown reply, in the summary and in compare's output.
const SET_NAME = 'savePanel/frontmost/setValue.name';
const landedIn = (run, engine) => rows => rows.map(r => (r.id === SET_NAME && r.section === 'method' && run === 1
  ? {...r, ok: true, outcome: {written: true, final: 'read', unchanged: false, threw: `the ${engine} write was not confirmed\nsecond line`, errorName: engine === 'cua' ? 'valueUnconfirmed' : null, effect: true}} : r));
test('thrown but landed: a pass on its own effect whose act threw, counted per engine with its reply in the summary', () => {
  const j = judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40, tweak: (rows, run) => landedIn(run, 'cua')(rows)}});
  assert.deepEqual(j.thrownButLanded, {vendor: [], cua: [{id: SET_NAME, run: 1, sample: 1, errorName: 'valueUnconfirmed', message: 'the cua write was not confirmed'}]});
  assert.equal(j.methods.find(m => m.id === SET_NAME).cua.ok, 3, 'still a pass');
  const text = renderSummary(j);
  assert.match(text, /^- \*\*Thrown but landed\*\* \(`thrownButLanded`: .*\): cua 1, vendor 0\.$/m);
  assert.ok(text.includes(`| cua | ${SET_NAME} | 1 | 1 | valueUnconfirmed | the cua write was not confirmed |`), text);
  // With none, the summary says nothing of it.
  assert.doesNotMatch(renderSummary(judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40}})), /Thrown but landed/);
});
test('thrown but landed: compare lists each one per engine with its error name and first line', async () => {
  const {main} = await import('../../scripts/native-matrix.mjs');
  const dir = fs.mkdtempSync(join(tmpdir(), 'matrix-compare-'));
  try {
    for (let n = 1; n <= 3; n++) {
      writeCellResult(join(dir, 'vendor', `run-${n}`), fullRun('vendor', n, {resolved: 9, axMs: 50, tweak: (rows, run) => landedIn(run, 'vendor')(rows)}));
      writeCellResult(join(dir, 'cua', `run-${n}`), fullRun('cua', n, {axMs: 40}));
    }
    const lines = [];
    await main(['compare', join(dir, 'vendor'), join(dir, 'cua')], {log: line => lines.push(line)});
    assert.ok(lines.includes('  thrownButLanded: cua 0, vendor 1'), lines.join('\n'));
    assert.ok(lines.includes(`    vendor ${SET_NAME} (run 1, sample 1): no error name: the vendor write was not confirmed`), lines.join('\n'));
    // Ruling 1222: every not-judged entry with its reason and its ticket or evidence, here the rules' rows by condition.
    assert.ok(lines.includes('  not judged: perContext (54 rows): ticket #577'), lines.join('\n'));
    assert.ok(lines.includes('  not judged: openPanelSearch (1 row): ticket #588'), lines.join('\n'));
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

// Ruling 1214's consequence: the cua lane runs after a vendor lane that stopped part-way (its put-back held). A cua
// sample judged against the vendor's (a frontmost method row, speed, finding, pressKey) whose vendor sample was never run
// because the vendor's run stopped (./run.mjs recordUnrun's rows, marked `unrun`) is NO VERDICT `vendorStopped`, naming
// the stop and the row the vendor's run stopped after: never a pass on cua's side alone, never read as cua's failure. A
// row judged on cua's own effect (a background row against the fixture's ground truth) is judged as ever.
test('a vendor lane stopped part-way: a comparing row after the stop is NO VERDICT vendorStopped on cua, naming the stop; an own-effect row is judged on its own effect', () => {
  const stop = {reason: 'a held fixture could not be reset (the textedit fixture textedit/concurrent.sheet@electron\'s reset was held)', after: 'textedit/concurrent.sheet@electron'};
  const unrun = {ok: false, invalid: 'the alert guard refused the cell: nothing of it was sent', alertGuard: {cause: 'keyWindow', detail: `not run: the run stopped when ${stop.reason}`}, unrun: stop};
  const stopped = (rows, run) => (run === 1 ? rows.map(r => ([CLICK, BACK].includes(r.id) || (r.section === 'speed' && r.id === 'textedit/getAXState') ? {...r, ...unrun} : r)) : rows);
  const j = judged({vendor: {resolved: 9, axMs: 50, tweak: stopped, complete: false}, cua: {axMs: 40}});
  const click = j.methods.find(x => x.id === CLICK);
  assert.deepEqual([click.verdict, click.account.cua.noVerdict], ['no-verdict', {vendorStopped: 1}]);
  assert.deepEqual(click.account.vendorStopped, [{run: 1, reason: stop.reason, after: stop.after}]);
  const speed = j.cells.find(c => c.section === 'speed' && c.id === 'textedit/getAXState');
  assert.equal(speed.account.cua.noVerdict.vendorStopped, 2, 'both speed samples of the run');
  // The own-effect row: cua's samples have their verdicts; a failure on its own effect still fails it.
  const back = j.methods.find(x => x.id === BACK);
  assert.deepEqual([back.account.cua.noVerdict, back.cua.valid], [{}, 3]);
  const failing = judged({vendor: {resolved: 9, axMs: 50, tweak: stopped, complete: false}, cua: {axMs: 40, tweak: (rows, run) => (run === 1 ? set(BACK, {ok: false})(rows) : rows)}});
  assert.equal(failing.methods.find(x => x.id === BACK).verdict, 'worse');
  const text = renderSummary(j);
  assert.match(text, /`vendorStopped` \(cua samples whose vendor sample was never run, the vendor's run having stopped before it: no verdict, never cua's failure\): cua 3;/);
  assert.ok(text.includes('| vendorStopped 1 |'), 'by cell');
  assert.ok(text.includes(`| method ${CLICK} | 1 | ${stop.after} | ${stop.reason} |`), text);
  assert.doesNotMatch(renderSummary(judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40}})), /vendorStopped/, 'named only when a sample has it');
});

test('a cua sample whose only vendor pair was never run is never a failure of cua\'s: the unproven line names the vendor\'s stop', () => {
  const stop = {reason: 'the key guard stopped a panel\'s close', after: 'openPanel/frontmost/pressKey.escape'};
  const unrun = {ok: false, invalid: 'not run: the run stopped: the key guard stopped a panel\'s close', unrun: stop};
  const all = rows => rows.map(r => (r.id === CLICK ? {...r, ...unrun} : r));
  const j = judged({vendor: {resolved: 9, axMs: 50, tweak: all, complete: false}, cua: {axMs: 40}});
  assert.ok(j.missing.includes(`method: ${CLICK} has no cua sample with a vendor sample to compare: the vendor's run stopped before it (${stop.reason}; after ${stop.after} (run 1, 2, 3))`), j.missing.join('\n'));
  assert.ok(!j.blocking.some(b => b.includes(CLICK)));
});

// The ownEffect cells (./plan.mjs OWN_EFFECT_IDS, the Save sheet's setValue.name) are compared with the vendor's as any
// frontmost row, but after a vendor run that stopped before them they are judged on their own effect, as the controller's
// rule for own-effect cells asks: a pass counts, a failure is worse.
test('an ownEffect cell after the vendor\'s stop is judged on its own effect: a pass counted, a failure worse', async () => {
  const {OWN_EFFECT_IDS} = await import('../../scripts/native-matrix/plan.mjs');
  const id = OWN_EFFECT_IDS[0];
  const row = (engine, sample, ok, extra = {}) => ({section: 'method', id, engine, sample, ok, regime: 'frontmost', ...extra});
  const unrun = {invalid: 'not run: the run stopped: x', unrun: {reason: 'x', after: 'y'}};
  const passing = judgeCell('reference', [row('vendor', 1, false, unrun)], [row('cua', 1, true)], {ownEffect: true});
  assert.deepEqual(passing.account.cua.noVerdict, {});
  assert.equal(passing.cua.valid, 1);
  assert.equal(judgeCell('reference', [row('vendor', 1, false, unrun)], [row('cua', 1, false)], {ownEffect: true}).verdict, 'worse');
  // Not an ownEffect cell: vendorStopped, no verdict.
  assert.deepEqual(judgeCell('reference', [row('vendor', 1, false, unrun)], [row('cua', 1, true)]).account.cua.noVerdict, {vendorStopped: 1});
  // A vendor sample merely invalid (no stop) leaves it unpaired, as ever.
  assert.deepEqual(judgeCell('reference', [row('vendor', 1, false, {invalid: 'x'})], [row('cua', 1, true)], {ownEffect: true}).account.cua.noVerdict, {unpaired: 1});
});

// Fix wave (review of the vendorStopped rule): the stop is matched on the run and the sample. A speed row whose vendor
// measured sample 1 and left sample 2 unrun has one vendorStopped cua sample (2); sample 1 keeps the complete-run rule's
// answer (unpaired: the run is no complete pair).
test('vendorStopped is the stopped sample\'s alone: a stop between two samples of a run', () => {
  const rows = (engine, samples) => samples.map(([sample, extra]) => ({section: 'speed', id: 'textedit/getAXState', engine, run: 1, sample, ok: true, inCellMs: 40, ...extra}));
  const stop = {reason: 'x', after: 'textedit/getAXState'};
  const speed = judgeSpeed(rows('vendor', [[1, {}], [2, {ok: false, invalid: 'not run: the run stopped: x', unrun: stop}]]), rows('cua', [[1, {}], [2, {}]]));
  assert.deepEqual(speed.account.cua.noVerdict, {unpaired: 1, vendorStopped: 1});
  assert.deepEqual(speed.account.vendorStopped, [{run: 1, reason: 'x', after: 'textedit/getAXState'}]);
  // A method row: the vendor's sample 2 of run 1 unrun leaves cua's sample 1 of that run as it was.
  const m2 = (engine, sample, extra = {}) => ({section: 'method', id: CLICK, engine, run: 1, sample, ok: true, regime: 'frontmost', ...extra});
  const cell = judgeCell('reference', [m2('vendor', 1, {invalid: 'x'}), m2('vendor', 2, {ok: false, invalid: 'not run', unrun: stop})], [m2('cua', 1), m2('cua', 2)]);
  assert.deepEqual(cell.account.cua.noVerdict, {unpaired: 1, vendorStopped: 1});
});

// Ruling 1219 (h5): a not-interfering cell that fails on both engines blocks nothing (the flip regresses nothing there).
// What moved decides it: the person's window, focus or input changed on either engine is a shared product defect, NO
// VERDICT on cua naming a ticket (a placeholder main fills); nothing of the person's moved (a target's order, a window
// other than the user's on top) is the venue's; a record that cannot tell is unread, never venue by default.
test('a not-interfering failure on both engines: a shared defect, the venue\'s or unread by what moved; non-blocking, a cua-only one still blocks', () => {
  const topOver = {ok: false, frontmost: true, topWindow: false, focus: true, activations: 0, route4: false, windowOrder: {before: false, after: false},
    topChange: {before: {owned: true, pid: 11, number: 3, bounds: null}, after: {owned: false, bundleId: 'com.apple.TextInputUI.xpc.CursorUIViewService'}, userWindowMoved: false}};
  const venue = judged({vendor: {resolved: 9, axMs: 50, tweak: set(BACK, {interference: topOver})}, cua: {axMs: 40, tweak: set(BACK, {interference: topOver})}});
  assert.ok(!venue.blocking.some(b => b.includes(BACK)), venue.blocking.join('\n'));
  assert.deepEqual(venue.sharedInterference.map(({evidence, ...s}) => s), [{id: BACK, kind: 'venue', moved: [], seen: ['the top window (another window over the user\'s)'], ticket: null, samples: 3}]);
  // Ruling 1222: the venue's is not judged on its recorded evidence (each failing sample's row and field), so it is
  // neither blocking nor missing; its entry names the evidence.
  assert.ok(!venue.missing.some(m => m.includes(BACK)), venue.missing.join('\n'));
  const venueEntry = venue.notJudged.find(n => n.id === BACK);
  assert.equal(venueEntry.condition, 'sharedVenue');
  assert.equal(venueEntry.evidence.length, 6, 'both engines\' three failing samples');
  assert.deepEqual(venueEntry.evidence[0], {row: BACK, engine: 'cua', run: 1, sample: 1, field: 'interference.topChange'});
  const focusLost = {ok: false, frontmost: true, topWindow: false, focus: false, activations: 0, route4: false};
  const defect = judged({vendor: {resolved: 9, axMs: 50, tweak: set(BACK, {interference: focusLost})}, cua: {axMs: 40, tweak: set(BACK, {interference: topOver})}});
  assert.ok(!defect.blocking.some(b => b.includes(BACK)), defect.blocking.join('\n'));
  assert.deepEqual(defect.sharedInterference.map(s => [s.id, s.kind, s.moved, s.ticket]), [[BACK, 'defect', ['the focus'], null]]);
  assert.match(renderSummary(defect), new RegExp(`- ${BACK.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}: both engines failed; the person's focus moved: a shared product defect, NO VERDICT on cua, ticket to be registered`));
  // The record that cannot say what moved (no topChange: C-5's records): unread, non-blocking.
  const bare = {ok: false, frontmost: true, topWindow: false, focus: true, activations: 0, route4: false};
  const unread = judged({vendor: {resolved: 9, axMs: 50, tweak: set(BACK, {interference: bare})}, cua: {axMs: 40, tweak: set(BACK, {interference: bare})}});
  assert.deepEqual(unread.sharedInterference.map(s => [s.kind, s.seen]), [['unread', ['the top window (what came over it not recorded)']]]);
  assert.ok(!unread.blocking.some(b => b.includes(BACK)));
  // Unread is no pass (fix wave I1): missing proof, so NO VERDICT.
  assert.ok(unread.missing.includes(`not interfering: ${BACK} failed on both engines (unread), NO VERDICT on cua: ticket to be registered`), unread.missing.join('\n'));
  assert.equal(unread.verdict, 'NO VERDICT');
  // A defect with no ticket yet is missing proof too.
  assert.ok(defect.missing.includes(`not interfering: ${BACK} failed on both engines (defect), NO VERDICT on cua: ticket to be registered`), defect.missing.join('\n'));
  // A target window above the user's says what came over it (C-5's launch row): the venue's.
  const raised = {...bare, windowOrder: {before: false, after: true}};
  const target = judged({vendor: {resolved: 9, axMs: 50, tweak: set(BACK, {interference: raised})}, cua: {axMs: 40, tweak: set(BACK, {interference: raised})}});
  assert.deepEqual(target.sharedInterference.map(s => [s.kind, s.seen]), [['venue', ['a target window above the user\'s']]]);
  // cua alone: blocks as before.
  const alone = judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40, tweak: set(BACK, {interference: topOver})}});
  assert.ok(alone.blocking.includes(`not interfering: ${BACK} failed on cua`), alone.blocking.join('\n'));
  assert.deepEqual(alone.sharedInterference, []);
});

// Main's tickets for two known defects (#587, #588): where the judge names their cells, it cites them.
test('the cells of a known defect are named with their ticket', () => {
  const TYPE_SELECT = 'finder/frontmost/typeText.typeSelect';
  const worse = judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40, tweak: set(TYPE_SELECT, {ok: false, outcome: {threw: 'x', errorName: 'typeUnconfirmed'}})}});
  assert.ok(worse.blocking.includes(`method: ${TYPE_SELECT} is worse on cua (known defect #587)`), worse.blocking.join('\n'));
  // Ruling 1223 (R5 i): cua's background type-select cells are #587's too.
  for (const id of ['finder/background/typeText.typeSelect@textedit', 'finder/background/typeText.typeSelect@electron']) {
    const background = judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40, tweak: set(id, {ok: false, outcome: {threw: 'x', errorName: 'typeUnconfirmed'}})}});
    assert.ok(background.blocking.includes(`method: ${id} is worse on cua (known defect #587)`), background.blocking.join('\n'));
  }
  // #590 (ruling 1223, R5 ii): TextEdit's Latin typeText, and any cell whose cua row answered typeUnconfirmed after its
  // text landed in a text field (the check read the effect); not one whose field is no text field (#587's).
  const LATIN = 'textedit/latin/typeText.latin';
  const landed = {ok: false, outcome: {exact: true, effect: true, threw: 'Computer Use server error -10005: The text was typed, but the field\'s text could not be read back, so it is not confirmed', errorName: 'typeUnconfirmed'}};
  const latin = judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40, tweak: set(LATIN, landed)}});
  assert.ok(latin.blocking.includes(`unicode: ${LATIN} failed on cua (known defect #590)`), latin.blocking.join('\n'));
  const REPLACE = 'textedit/frontmost/typeText.replace';
  const field = judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40, tweak: set(REPLACE, landed)}});
  assert.ok(field.blocking.includes(`method: ${REPLACE} is worse on cua (known defect #590)`), field.blocking.join('\n'));
  const unlanded = judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40, tweak: set(REPLACE, {...landed, outcome: {...landed.outcome, effect: false}})}});
  assert.ok(unlanded.blocking.includes(`method: ${REPLACE} is worse on cua`), unlanded.blocking.join('\n'));
  // #588's Open panel search row is not judged since ruling 1222 (its own test below).
});

// Ruling 1221 (H2): the background rows' user windows by the path they took to the top, per scene and engine, and the
// rows still not ok after a raise.
test('to the top: background rows counted waited and raised per user scene and engine, the rows not ok after a raise named', () => {
  const row = (engine, id, user, path, ok = true) => ({section: 'method', engine, id, user, ok, toTop: {scene: user, path, ms: 10, topBefore: null}});
  const t = toTopOf([row('cua', 'finder/background/a@textedit', 'textedit', 'waited'), row('cua', 'finder/background/b@textedit', 'textedit', 'raised'),
    row('cua', 'finder/background/c@textedit', 'textedit', 'raised', false), row('vendor', 'chrome/background/a@electron', 'electron', 'waited'),
    row('cua', 'finder/background/d@textedit', 'textedit', 'raiseFailed', false), {section: 'method', engine: 'cua', id: 'x', ok: true}]);
  // A raise that threw is counted apart (fix wave M3), never as raised.
  assert.deepEqual(t, {counts: [{scene: 'electron', engine: 'vendor', waited: 1, raised: 0, raiseFailed: 0}, {scene: 'textedit', engine: 'cua', waited: 1, raised: 2, raiseFailed: 1}],
    afterRaise: [{engine: 'cua', id: 'finder/background/c@textedit'}]});
  const text = renderSummary({...judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40}}), toTop: t});
  assert.match(text, /^- User windows to the top \(ruling 1221\): electron vendor waited 1, raised 0, raise failed 0; textedit cua waited 1, raised 2, raise failed 1; not ok after a raise: cua finder\/background\/c@textedit\.$/m);
  assert.doesNotMatch(renderSummary(judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40}})), /User windows to the top/);
});

// Ruling 1225: R3's witness on each full run that had concurrent cells: its positive control's result per tapped scene,
// or why there was no witness, and the rows its gaps left NO VERDICT; on the summary, a run whose control was not seen
// named.
test('R3\'s witness: each run\'s control result and the rows it left NO VERDICT, on the summary', () => {
  const control = (seen, pid = 41) => ({scene: 'textedit', pid, posted: true, by: 90, at: 1, seen});
  const r3 = {ok: false, invalid: 'R3\'s witness: the positive control was not seen on the user app\'s pid'};
  const j = judged({
    vendor: {meta: () => ({witness: {ready: true, controls: [control(true)]}})},
    cua: {meta: run => ({witness: run === 2 ? {ready: true, controls: [control(false)]} : run === 3 ? {missing: 'off a GitHub-hosted runner: no witness tap (ruling 1225)'} : {ready: true, controls: [control(true)]}}),
      tweak: (rows, run) => (run === 2 ? rows.map(r => (r.id === 'chrome/concurrent@textedit' ? {...r, ...r3} : r)) : rows)},
  });
  assert.deepEqual(j.witness.filter(w => w.engine === 'cua'), [
    {engine: 'cua', run: 1, controls: [{scene: 'textedit', pid: 41, seen: true}], noVerdict: 0},
    {engine: 'cua', run: 2, controls: [{scene: 'textedit', pid: 41, seen: false}], noVerdict: 1},
    {engine: 'cua', run: 3, missing: 'off a GitHub-hosted runner: no witness tap (ruling 1225)', controls: [], noVerdict: 0}]);
  const text = renderSummary(j);
  assert.match(text, /^- R3's witness \(ruling 1225\): the control seen in 4 of 6 runs; NOT seen: cua run 2 \(textedit\); no witness: cua run 3 \(off a GitHub-hosted runner: no witness tap \(ruling 1225\)\); 1 row\(s\) NO VERDICT on it\.$/m);
  assert.deepEqual(witnessOf([]), []);
  assert.doesNotMatch(renderSummary(judged()), /R3's witness/);
});

// Fix wave I2 and I3: a cua failure is shared only with its own paired vendor sample's (the same run and sample, as
// ruling 1144's shared limits pair); one vendor failure elsewhere in the cell excuses nothing. With nothing moved and
// nothing over the user's window on either record (route 4 alone, an unread order or focus), the kind is unread, never
// venue; a sample out of the oracle's judgment (sampleCause) does not feed what moved.
test('shared interference pairs by run and sample; with no positive evidence it is unread; a sample with its own cause feeds nothing', () => {
  const topOver = {ok: false, frontmost: true, topWindow: false, focus: true, activations: 0, route4: false, windowOrder: {before: false, after: false},
    topChange: {before: {owned: true, pid: 11, number: 3, bounds: null}, after: {owned: false, bundleId: 'com.example.over'}, userWindowMoved: false}};
  // An oracle row has one sample a run (its sample is the run's number), so its pair is the same run's.
  const inRun = (run, patch) => (rows, r) => (r === run ? set(BACK, patch)(rows) : rows);
  // The vendor failed run 1, cua run 2: no pair failed on both, so cua's blocks.
  const apart = judged({vendor: {resolved: 9, axMs: 50, tweak: inRun(1, {interference: topOver})}, cua: {axMs: 40, tweak: inRun(2, {interference: topOver})}});
  assert.ok(apart.blocking.includes(`not interfering: ${BACK} failed on cua`), apart.blocking.join('\n'));
  assert.deepEqual(apart.sharedInterference, []);
  // The vendor failed runs 1 and 2, cua runs 2 and 3: run 2's pair is shared, run 3's cua failure still blocks.
  const inRuns = (runs, patch) => (rows, r) => (runs.includes(r) ? set(BACK, patch)(rows) : rows);
  const some = judged({vendor: {resolved: 9, axMs: 50, tweak: inRuns([1, 2], {interference: topOver})}, cua: {axMs: 40, tweak: inRuns([2, 3], {interference: topOver})}});
  assert.ok(some.blocking.includes(`not interfering: ${BACK} failed on cua`), some.blocking.join('\n'));
  assert.deepEqual(some.sharedInterference.map(s => [s.kind, s.samples]), [['venue', 1]]);
  // The same run and sample: shared, one pair.
  const paired = judged({vendor: {resolved: 9, axMs: 50, tweak: inRun(1, {interference: topOver})}, cua: {axMs: 40, tweak: inRun(1, {interference: topOver})}});
  assert.ok(!paired.blocking.some(b => b.includes(BACK)), paired.blocking.join('\n'));
  assert.deepEqual(paired.sharedInterference.map(s => [s.kind, s.samples]), [['venue', 1]]);
  // Route 4 alone on both: nothing moved, nothing over the user's window: unread, missing proof.
  const route4 = {ok: false, frontmost: true, topWindow: true, focus: true, activations: 0, route4: true};
  const r4 = judged({vendor: {resolved: 9, axMs: 50, tweak: set(BACK, {interference: route4})}, cua: {axMs: 40, tweak: set(BACK, {interference: route4})}});
  assert.deepEqual(r4.sharedInterference.map(s => [s.kind, s.seen]), [['unread', ['route 4']]]);
  assert.ok(r4.missing.includes(`not interfering: ${BACK} failed on both engines (unread), NO VERDICT on cua: ticket to be registered`), r4.missing.join('\n'));
  // A vendor sample with its own cause (an alert held its keys) is out of the oracle's judgment: it pairs nothing and
  // says nothing of what moved, so cua's failure of that sample blocks.
  const focusLost = {ok: false, frontmost: true, topWindow: true, focus: false, activations: 0, route4: false};
  const held = {interference: focusLost, alertHeld: {front: 'com.apple.UserNotificationCenter', keys: ['Return']}};
  const caused = judged({vendor: {resolved: 9, axMs: 50, tweak: inRun(1, held)}, cua: {axMs: 40, tweak: inRun(1, {interference: topOver})}});
  assert.ok(caused.blocking.includes(`not interfering: ${BACK} failed on cua`), caused.blocking.join('\n'));
  assert.deepEqual(caused.sharedInterference, []);
});

// Ruling 1222: every not-judged entry, the per-context rows', the Open panel's search row's and a shared item's, carries
// its reason and a ticket or a recorded evidence reference (row and field); one with neither is refused into missing.
test('not judged (ruling 1222): every entry a reason and a ticket or evidence; one with neither is missing proof, NO VERDICT', () => {
  for (const rule of NOT_JUDGED_RULES) assert.ok(rule.cause && /^#\d+$/.test(rule.ticket ?? ''), rule.condition);
  const base = judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40}});
  assert.equal(base.verdict, 'PASS');
  for (const n of base.notJudged) assert.ok(n.cause && (n.ticket || n.evidence?.length), n.id);
  // A rule with neither: its rows stay out of the judgment, and the entry is missing proof.
  const bare = NOT_JUDGED_RULES.map(r => (r.condition === 'perContext' ? {...r, ticket: undefined} : r));
  const unticketed = judged({vendor: {resolved: 9, axMs: 50}, cua: {axMs: 40}, notJudgedRules: bare});
  assert.equal(unticketed.verdict, 'NO VERDICT');
  assert.ok(unticketed.missing.some(m => m.startsWith('not judged without a ticket or recorded evidence: unicode chrome/perContext@textedit/typeText.hangul (perContext)')), unticketed.missing.join('\n'));
  assert.ok(!unticketed.notJudged.some(n => n.condition === 'perContext'));
  // A venue entry with no evidence is refused; one with its evidence, or a defect with its ticket, is admitted.
  assert.match(notJudgedRefusal({section: 'interference', id: 'x', condition: 'sharedVenue', cause: 'the venue\'s', evidence: []}), /no ticket and no recorded evidence/);
  assert.equal(notJudgedRefusal({section: 'interference', id: 'x', condition: 'sharedVenue', cause: 'the venue\'s', evidence: [{row: 'x', engine: 'cua', run: 1, sample: 1, field: 'interference.windowOrder.after'}]}), null);
  assert.equal(notJudgedRefusal({section: 'interference', id: 'x', condition: 'sharedDefect', cause: 'a defect', ticket: '#9'}), null);
  assert.match(notJudgedRefusal({section: 'interference', id: 'x', condition: 'sharedDefect', ticket: '#9'}), /no reason/);
});
test('ruling 1222: a shared defect with its ticket counts as a #577 per-context row does: the same verdict, neither in missing', () => {
  const focusLost = {ok: false, frontmost: true, topWindow: true, focus: false, activations: 0, route4: false};
  const ticketed = judged({vendor: {resolved: 9, axMs: 50, tweak: set(BACK, {interference: focusLost})}, cua: {axMs: 40, tweak: set(BACK, {interference: focusLost})},
    knownDefects: {[`interference ${BACK}`]: '#999'}});
  const planned = unicodeRowsOf(FULL_PLAN.unicode).filter(r => r.condition === 'perContext').map(r => r.id);
  const perContext = engine => (rows, run) => [...rows, ...planned.map(id => ({section: 'unicode', id, engine, sample: run, ok: false, invalid: 'the context did not read Korean afterwards'}))];
  const ctx = judged({vendor: {resolved: 9, axMs: 50, tweak: perContext('vendor')}, cua: {axMs: 40, tweak: perContext('cua')}});
  assert.equal(ticketed.verdict, ctx.verdict);
  assert.deepEqual([ticketed.missing, ticketed.blocking], [ctx.missing, ctx.blocking]);
  assert.deepEqual(ticketed.notJudged.find(n => n.id === BACK), {id: BACK, section: 'interference', condition: 'sharedDefect',
    cause: 'cua failed not interfering with its paired vendor sample, and the person\'s focus moved: a product defect both engines share (rulings 1219 and 1222)', ticket: '#999', samples: 3});
  const text = renderSummary(ticketed);
  assert.ok(text.includes(`| ${BACK} | cua failed not interfering with its paired vendor sample, and the person's focus moved: a product defect both engines share (rulings 1219 and 1222) | ticket #999 | 3 |`), text.slice(text.indexOf('## Not judged')));
});
// Ruling 1222 (a): the Open panel's search row is not judged, naming #588, as the per-context rows are.
test('ruling 1222: openPanel/frontmost/typeText.search is not judged, naming #588: neither pass, fail nor missing', () => {
  const SEARCH = 'openPanel/frontmost/typeText.search';
  assert.ok(!manifestOf({run: 1, samples: 2}).some(e => e.id === SEARCH));
  // The run still runs and records it (outside the manifest, as the per-context rows are).
  const search = (engine, ok) => (rows, run) => [...rows, {section: 'method', id: SEARCH, engine, sample: run, ok, target: 'openPanel', regime: 'frontmost', method: 'typeText', case: 'search'}];
  const failing = judged({vendor: {resolved: 9, axMs: 50, tweak: search('vendor', true)}, cua: {axMs: 40, tweak: search('cua', false)}});
  assert.equal(failing.verdict, 'PASS');
  assert.ok(!failing.methods.some(m => m.id === SEARCH));
  const entry = failing.notJudged.find(n => n.id === SEARCH);
  assert.deepEqual([entry.section, entry.condition, entry.ticket, entry.cua], ['method', 'openPanelSearch', '#588', {ok: 0, valid: 3, invalid: 0}]);
  assert.match(renderSummary(failing), /### openPanelSearch\n\n.*#588.*\n\nTicket: #588\./);
});

// Fix wave M4, ruling 1219: the Korean pressKey row judges each engine against 가 on its own. A cua sample that read it
// passes with no valid vendor pair (not NO VERDICT unpaired); one that read ㄱ fails even when its vendor pair read ㄱ
// too (not a shared limit). The Latin row keeps ruling 1119's pairing.
test('the Korean pressKey row: each engine against 가 alone, a cua 가 counted unpaired, a cua ㄱ failing beside the vendor\'s ㄱ', () => {
  const KEYS = 'textedit/korean/pressKey.rk', LATIN = 'textedit/latin/pressKey.rk';
  const sample = (id, engine, run, ok, extra = {}) => ({section: 'unicode', id, engine, run, sample: run, ok, threw: false, message: null,
    outcome: ok ? {exact: true, hash: 'h-ga', length: 1, userKept: true} : {exact: false, hash: 'h-giyeok', length: 1, userKept: true}, ...extra});
  const alone = judgeCell('pressKey', [sample(KEYS, 'vendor', 1, false, {invalid: 'not engaged'})], [sample(KEYS, 'cua', 1, true)], {expected: '가'});
  assert.deepEqual(alone.cua, {ok: 1, valid: 1, invalid: 0});
  assert.equal(alone.account.cua.noVerdict.unpaired, undefined, 'judged on its own, not unpaired');
  const both = judgeCell('pressKey', [sample(KEYS, 'vendor', 1, false)], [sample(KEYS, 'cua', 1, false)], {expected: '가'});
  assert.deepEqual([both.verdict, both.shared], ['worse', []]);
  // The Latin row: a pair that failed alike is still a shared limit, and a cua pass with no vendor pair is unpaired.
  const latinBoth = judgeCell('pressKey', [sample(LATIN, 'vendor', 1, false)], [sample(LATIN, 'cua', 1, false)]);
  assert.equal(latinBoth.shared.length, 1);
  const latinAlone = judgeCell('pressKey', [sample(LATIN, 'vendor', 1, false, {invalid: 'x'})], [sample(LATIN, 'cua', 1, true)]);
  assert.equal(latinAlone.account.cua.noVerdict.unpaired, 1);
});

// Verification review: each shared pair is classified on its own cua sample and its paired vendor sample, never by the
// cell. One pair's recorded evidence makes that pair the venue's and no other: a pair with nothing recorded (route 4
// alone) is unread, missing proof, whatever another pair of the row showed.
test('shared interference per pair: one pair with windowOrder evidence is the venue\'s, not judged; another with route 4 alone is unread, missing', () => {
  const over = {ok: false, frontmost: true, topWindow: true, focus: true, activations: 0, route4: false, windowOrder: {before: false, after: true}};
  const route4 = {ok: false, frontmost: true, topWindow: true, focus: true, activations: 0, route4: true};
  const byRun = (rows, r) => (r === 1 ? set(BACK, {interference: over})(rows) : r === 2 ? set(BACK, {interference: route4})(rows) : rows);
  const j = judged({vendor: {resolved: 9, axMs: 50, tweak: byRun}, cua: {axMs: 40, tweak: byRun}});
  assert.deepEqual(j.sharedInterference.map(s => [s.id, s.kind, s.samples]), [[BACK, 'venue', 1], [BACK, 'unread', 1]]);
  const venue = j.notJudged.find(n => n.id === BACK);
  assert.equal(venue.condition, 'sharedVenue');
  assert.deepEqual(venue.evidence.map(e => [e.engine, e.run, e.field]), [['cua', 1, 'interference.windowOrder.after'], ['vendor', 1, 'interference.windowOrder.after']]);
  assert.ok(j.missing.includes(`not interfering: ${BACK} failed on both engines (unread), NO VERDICT on cua: ticket to be registered`), j.missing.join('\n'));
  assert.ok(!j.blocking.some(b => b.includes(BACK)), 'shared on both engines: missing proof, not cua\'s failure');
  assert.equal(j.verdict, 'NO VERDICT');
  // Within a pair, evidence on one side alone does not explain the other's failure: unread.
  const half = (rows, r, engine) => (r === 1 ? set(BACK, {interference: engine === 'cua' ? over : route4})(rows) : rows);
  const split = judged({vendor: {resolved: 9, axMs: 50, tweak: (rows, r) => half(rows, r, 'vendor')}, cua: {axMs: 40, tweak: (rows, r) => half(rows, r, 'cua')}});
  assert.deepEqual(split.sharedInterference.map(s => [s.kind, s.samples]), [['unread', 1]]);
  assert.ok(!split.notJudged.some(n => n.id === BACK));
});
