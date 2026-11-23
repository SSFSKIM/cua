// What a hosted sitting's job prints and keeps (scripts/hosted-sittings/counts.mjs, pilot-reads.mjs): per cell, the
// runs every sample of which has a verdict and the verdict samples of each run (T10a's request to the design session),
// and the pilot's readings of what part 1 left unread on a runner. Results are built in memory; nothing runs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cellCounts, renderCounts} from '../../scripts/hosted-sittings/counts.mjs';
import {pilotReads, renderPilotReads} from '../../scripts/hosted-sittings/pilot-reads.mjs';
import {timeFocusProbe} from '../../scripts/hosted-sittings/focus-timing.mjs';
import {SCENES} from '../../scripts/repl-parity/scenes-mac.mjs';

const account = (byRun, pairs = 0) => {
  const side = runs => ({verdicts: Object.values(runs).reduce((n, r) => n + r.verdicts, 0), runs: Object.values(runs).filter(r => r.verdicts === r.samples).length, byRun: runs, noVerdict: {}});
  return {vendor: side(byRun.vendor), cua: side(byRun.cua), pairs, pairRuns: [], qualifies: pairs >= 3};
};
// A judgment's cells as ./native-matrix/summary.mjs judge gives them (the full runs' accounts).
const JUDGMENT = {cells: [
  {section: 'method', id: 'textedit/frontmost/click.control', verdict: 'equal', qualifies: false,
    account: account({vendor: {1: {verdicts: 10, samples: 10}}, cua: {1: {verdicts: 7, samples: 10}}})},
  {section: 'speed', id: 'textedit/getAXState', verdict: 'no-verdict', qualifies: false, account: account({vendor: {}, cua: {}})},
]};
const UNC = 'com.apple.UserNotificationCenter';
const HELD = {when: 'at the key guard for super+n', count: 1, windows: [{bundleId: UNC, layer: 8, titled: null, size: [420, 180]}], checks: 3};
const saveSheet = {path: 'c/save-sheet/cua/run-1/result.json', result: {cell: 'intervention-save-sheet', meta: {run: 1, hosted: true, alertsHeld: [HELD]}, rows: [
  {section: 'intervention', id: 'textedit/intervention.saveSheet', engine: 'cua', sample: 1, ok: true,
    frontKey: {apps: ['com.apple.TextEdit'], activate: {app: 'com.apple.TextEdit', front: true, key: true}, before: {front: 'com.apple.TextEdit', key: 'com.apple.TextEdit'}, after: {front: 'com.apple.TextEdit', key: 'com.apple.TextEdit'}}},
  {section: 'intervention', id: 'textedit/intervention.saveSheet', engine: 'cua', sample: 2, ok: false, invalid: 'the Save sheet\'s destination was not set',
    outcome: {observed: {before: {trailer: 'none', count: 0, lines: []}, after: {trailer: 'focused', count: 2, lines: [{index: 1, depth: 0, parent: null, id: 'saveAsNameTextField', head: 'text field Save As', focused: true}]}}}},
]}};

test('per cell: the runs every sample of which has a verdict, and each run\'s verdict samples, from the full runs and every other cell', () => {
  const counts = cellCounts([{path: 'c/vendor/run-1/result.json', result: {cell: 'matrix', meta: {planId: 'full'}, rows: []}}, saveSheet], {judgeFull: () => JUDGMENT});
  assert.deepEqual(counts, [
    {cell: 'method textedit/frontmost/click.control', source: 'matrix', pairs: 0, qualifies: false,
      vendor: {complete: 1, runs: 1, byRun: {1: {verdicts: 10, samples: 10}}}, cua: {complete: 0, runs: 1, byRun: {1: {verdicts: 7, samples: 10}}}},
    {cell: 'intervention textedit/intervention.saveSheet', source: 'intervention-save-sheet', pairs: null, qualifies: null,
      vendor: {complete: 0, runs: 0, byRun: {}}, cua: {complete: 0, runs: 1, byRun: {1: {verdicts: 1, samples: 2}}}},
  ], 'a cell with no sample on either side is left out');
  const text = renderCounts(counts);
  assert.match(text, /^\| cell \| source \| vendor: complete runs \| vendor: verdicts by run \| cua: complete runs \| cua: verdicts by run \| complete pairs \|$/m);
  assert.match(text, /^\| method textedit\/frontmost\/click\.control \| matrix \| 1 of 1 \| 1: 10\/10 \| 0 of 1 \| 1: 7\/10 \| 0 \|$/m);
  assert.match(text, /^\| intervention textedit\/intervention\.saveSheet \| intervention-save-sheet \| 0 of 0 \| - \| 0 of 1 \| 1: 1\/2 \| - \|$/m);
  assert.match(renderCounts([]), /No matrix cell result/);
});

test('without any full run the judge is not asked', () => {
  let asked = false;
  assert.equal(cellCounts([saveSheet], {judgeFull: () => { asked = true; return JUDGMENT; }}).length, 1);
  assert.equal(asked, false);
});

// A hosted pilot's full runs, reduced to the rows the reads look at.
const fk = (front, key) => ({apps: [], activate: {app: front, front: true, key: true}, before: {front, key}, after: {front, key}});
const full = (engine, rows, meta = {}) => ({path: `c/${engine}/run-1/result.json`, result: {cell: 'matrix', lanes: [{engine}], meta: {planId: 'full', run: 1, hosted: true, ...meta}, rows}});
const PANEL = 'com.apple.appkit.xpc.openAndSavePanelService';
const RESULTS = [
  full('vendor', [
    {section: 'method', id: 'openPanel/frontmost/click.control', target: 'openPanel', regime: 'frontmost', engine: 'vendor', sample: 1, ok: true, frontKey: fk('com.apple.TextEdit', `${PANEL}.v2`)},
    {section: 'method', id: 'chrome/frontmost/click.control', target: 'chrome', regime: 'frontmost', engine: 'vendor', sample: 1, ok: true, frontKey: fk(SCENES.chrome.bundleId, SCENES.chrome.bundleId)},
    {section: 'method', id: 'electron/frontmost/click.control', target: 'electron', regime: 'frontmost', engine: 'vendor', sample: 1, ok: true, frontKey: fk(SCENES.electron.bundleId, 'com.github.Electron')},
    {section: 'method', id: 'textedit/background/click.element@finder', engine: 'vendor', sample: 1, ok: false, outcome: {keystroke: {posted: true, finderSelected: false, documentUnchanged: true}}},
    {section: 'method', id: 'finder/frontmost/typeText.typeSelect', engine: 'vendor', sample: 1, ok: false, outcome: {errorName: 'Error'}},
  ], {unicode: {readings: [{when: 'korean:textedit post-refocus', current: 'com.apple.inputmethod.Korean.2SetKorean', layout: 'com.apple.keylayout.2SetHangul', held: true}]}}),
  full('cua', [
    {section: 'method', id: 'textedit/background/click.element@finder', engine: 'cua', sample: 1, ok: true, outcome: {keystroke: {posted: true, finderSelected: true, documentUnchanged: true}}},
    {section: 'method', id: 'finder/frontmost/typeText.typeSelect', engine: 'cua', sample: 1, ok: false, outcome: {errorName: 'typeUnconfirmed'}},
  ], {unicode: {readings: [{when: 'korean:textedit post-refocus', current: 'com.apple.keylayout.ABC', layout: 'com.apple.keylayout.ABC', held: false}]}}),
  saveSheet,
];

test('the pilot reads what part 1 left unread on a runner, each from the rows that show it, and names what nothing showed', () => {
  const reads = pilotReads(RESULTS, {focusTiming: {samples: 5, medianMs: 640, maxMs: 910}});
  // The panel service's id belongs to the window order, which no row keeps (its oracle keeps only booleans): unread, the
  // front/key ids on the panel's rows given beside it as what they are.
  assert.deepEqual(reads.openPanel, {expected: PANEL, windowOrder: null, frontKey: [`${PANEL}.v2`, 'com.apple.TextEdit']});
  assert.deepEqual(reads.focusedApps.chrome, {expected: SCENES.chrome.bundleId, read: [SCENES.chrome.bundleId], matches: true});
  assert.deepEqual(reads.focusedApps.electron, {expected: SCENES.electron.bundleId, read: ['com.github.Electron'], matches: false});
  assert.deepEqual(reads.typeSelect, {vendor: [{sample: 1, run: 1, posted: true, finderSelected: false, documentUnchanged: true, gate: null}],
    cua: [{sample: 1, run: 1, posted: true, finderSelected: true, documentUnchanged: true, gate: null}]});
  assert.deepEqual(reads.korean, {vendor: {held: 1, of: 1}, cua: {held: 0, of: 1, read: ['com.apple.keylayout.ABC / com.apple.keylayout.ABC']}});
  assert.deepEqual(reads.savePanel.observed.length, 1);
  assert.equal(reads.savePanel.observed[0].after.lines[0].id, 'saveAsNameTextField');
  // The capture alert is held by its owner and a bound, never identified: its held readings are kept for that, and the
  // limitation is said whether or not any was held.
  assert.deepEqual(reads.captureAlert, {identified: false, held: [{count: 1, windows: HELD.windows, checks: 3}]});
  assert.deepEqual(reads.focusProbe, {samples: 5, medianMs: 640, maxMs: 910});
  assert.deepEqual(reads.vendorErrorNames, {Error: 1});
  assert.deepEqual(reads.unread, ['openPanel']);
  const text = renderPilotReads(reads);
  for (const heading of ['Open panel', 'Save panel', 'Focused app', 'Finder type-select', 'Focus probe', '2-Set', 'cua/errorName'])
    assert.ok(text.includes(heading), heading);
  assert.match(text, /Electron fixture: read com\.github\.Electron, the scene names .*: \*\*differs\*\*/);
  assert.match(text, /\*\*Save panel\*\* \(#212, SAVE_PANEL_CONTROLS\): 1 observation\(s\) recorded; the first: saveAsNameTextField \(text field Save As\)\./);
  assert.match(text, /\*\*Capture alert\*\*.*not identified.*; held: 1 window \(layer 8, title unreadable, 420 × 180\) at 3 checks\./);
  assert.match(text, /\*\*Open panel\*\*: not read: the window order's service id is on no row .*; the front\/key ids on its rows \(not the window order\): com\.apple\.appkit/);
});

test('the focus probe is timed launch by launch, an unanswered launch timed and counted apart', () => {
  let t = 0;
  const answers = [{focusedApp: {bundleId: 'a'}}, {error: 'not trusted'}, {focusedApp: null}];
  const costs = [600, 900, 700];
  let i = 0;
  const timing = timeFocusProbe({samples: 3, now: () => t, probe: args => { assert.deepEqual(args, ['focus']); t += costs[i]; return answers[i++]; }});
  assert.deepEqual(timing, {samples: 3, answered: 2, medianMs: 700, maxMs: 900, ms: [600, 900, 700]});
});

test('a pilot without the rows names each question it could not read', () => {
  const reads = pilotReads([]);
  assert.deepEqual(reads.unread, ['openPanel', 'savePanel', 'focusedApps.chrome', 'focusedApps.electron', 'typeSelect', 'focusProbe', 'korean', 'vendorErrorNames', 'captureAlert']);
  assert.match(renderPilotReads(reads), /Not read in this pilot: openPanel, savePanel/);
  assert.match(renderPilotReads(reads), /\*\*Capture alert\*\*.*not identified.*; none held in this pilot\./);
});
