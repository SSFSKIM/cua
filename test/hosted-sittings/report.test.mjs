// What a hosted sitting's job prints and keeps (scripts/hosted-sittings/counts.mjs, pilot-reads.mjs): per cell, the
// runs every sample of which has a verdict and the verdict samples of each run (T10a's request to the design session),
// and the pilot's readings of what part 1 left unread on a runner. Results are built in memory; nothing runs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cellCounts, guardTally, renderCounts, renderGuardTally, renderKeyWindowObserved} from '../../scripts/hosted-sittings/counts.mjs';
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
      vendor: {complete: 1, runs: 1, byRun: {1: {verdicts: 10, samples: 10}}, alert: 0, keyUnread: 0, keyWindow: 0, keyWindowUnread: 0, keyWindowUnreadReasons: {}}, cua: {complete: 0, runs: 1, byRun: {1: {verdicts: 7, samples: 10}}, alert: 0, keyUnread: 0, keyWindow: 0, keyWindowUnread: 0, keyWindowUnreadReasons: {}}},
    {cell: 'intervention textedit/intervention.saveSheet', source: 'intervention-save-sheet', pairs: null, qualifies: null,
      vendor: {complete: 0, runs: 0, byRun: {}, alert: 0, keyUnread: 0, keyWindow: 0, keyWindowUnread: 0, keyWindowUnreadReasons: {}}, cua: {complete: 0, runs: 1, byRun: {1: {verdicts: 1, samples: 2}}, alert: 0, keyUnread: 0, keyWindow: 0, keyWindowUnread: 0, keyWindowUnreadReasons: {}}},
  ], 'a cell with no sample on either side is left out');
  const text = renderCounts(counts);
  assert.match(text, /^\| cell \| source \| vendor: complete runs \| vendor: verdicts by run \| vendor: NO VERDICT alert \| vendor: NO VERDICT keyWindow \| vendor: key cells guarded unread \| vendor: cells key window unread \| cua: complete runs \| cua: verdicts by run \| cua: NO VERDICT alert \| cua: NO VERDICT keyWindow \| cua: key cells guarded unread \| cua: cells key window unread \| complete pairs \|$/m);
  assert.match(text, /^\| method textedit\/frontmost\/click\.control \| matrix \| 1 of 1 \| 1: 10\/10 \| 0 \| 0 \| 0 \| 0 \| 0 of 1 \| 1: 7\/10 \| 0 \| 0 \| 0 \| 0 \| 0 \|$/m);
  assert.match(text, /^\| intervention textedit\/intervention\.saveSheet \| intervention-save-sheet \| 0 of 0 \| - \| 0 \| 0 \| 0 \| 0 \| 0 of 1 \| 1: 1\/2 \| 0 \| 0 \| 0 \| 0 \| - \|$/m);
  assert.match(renderCounts([]), /No matrix cell result/);
});

test('ruling 1154: per cell and per side, the samples NO VERDICT alert, the alert guard\'s refusals among them', () => {
  const judged = {cells: [{section: 'method', id: 'electron/frontmost/click.point', verdict: 'no-verdict', qualifies: false,
    account: (() => { const a = account({vendor: {1: {verdicts: 9, samples: 10}}, cua: {1: {verdicts: 7, samples: 10}}}); a.vendor.noVerdict = {alert: 1}; a.cua.noVerdict = {alert: 2, unread: 1}; return a; })()}]};
  const guarded = {path: 'c/save-sheet/vendor/run-1/result.json', result: {cell: 'intervention-save-sheet', meta: {run: 1, hosted: true}, rows: [
    {section: 'intervention', id: 'textedit/intervention.saveSheet', engine: 'vendor', sample: 1, ok: false, invalid: 'the alert guard refused the cell: nothing of it was sent',
      alertGuard: {cause: 'alert', detail: 'com.apple.UserNotificationCenter holds the key'}}]}};
  const counts = cellCounts([{path: 'c/vendor/run-1/result.json', result: {cell: 'matrix', meta: {planId: 'full'}, rows: []}}, guarded], {judgeFull: () => judged});
  assert.deepEqual(counts.map(c => [c.cell, c.vendor.alert, c.cua.alert]), [['method electron/frontmost/click.point', 1, 2], ['intervention textedit/intervention.saveSheet', 1, 0]]);
  assert.match(renderCounts(counts), /^\| method electron\/frontmost\/click\.point \| matrix \| 0 of 1 \| 1: 9\/10 \| 1 \| 0 \| 0 \| 0 \| 0 of 1 \| 1: 7\/10 \| 2 \| 0 \| 0 \| 0 \| 0 \|$/m);
});

// The key-cell premise: a key cell whose key reading was not taken is sent unguarded against the alert holding the key.
// Each result counts them under the span's key (meta.keyUnread); a row's `row:<index>` is that row's cell.
test('per cell and per side, the key cells guarded with their key reading not taken, beside NO VERDICT alert; a harness key cell on its own line', () => {
  const full = side => ({path: `c/${side}/run-1/result.json`, result: {cell: 'matrix', lanes: [{host: side, engine: side}], meta: {planId: 'full', keyUnread: {'row:1': 2, 'row:1:2': 1, 'close-panel:escape': 1}},
    rows: [{section: 'method', id: 'textedit/frontmost/click.control', engine: side}, {section: 'method', id: 'textedit/frontmost/typeText.replace', engine: side}]}});
  const judged = {cells: [{section: 'method', id: 'textedit/frontmost/typeText.replace', verdict: 'equal', qualifies: false,
    account: account({vendor: {1: {verdicts: 10, samples: 10}}, cua: {1: {verdicts: 10, samples: 10}}})}]};
  const counts = cellCounts([full('vendor'), full('cua')], {judgeFull: () => judged});
  assert.deepEqual(counts.map(c => [c.cell, c.source, c.vendor.keyUnread, c.cua.keyUnread]), [
    ['method textedit/frontmost/typeText.replace', 'matrix', 3, 3],
    ['harness close-panel:escape', 'matrix', 1, 1],
  ]);
  const text = renderCounts(counts);
  assert.match(text, /^\| method textedit\/frontmost\/typeText\.replace \| matrix \| 1 of 1 \| 1: 10\/10 \| 0 \| 0 \| 3 \| 0 \| 1 of 1 \| 1: 10\/10 \| 0 \| 0 \| 3 \| 0 \| 0 \|$/m);
  assert.match(text, /key cells guarded unread/);
});

// Every sitting's records, whatever their producer (A's meta.json, the matrix's result.json meta, D's acceptance.json):
// per step and cell, the refusals NO VERDICT `alert` and `unread`, and the key cells sent with their key reading not
// taken, so sitting.md shows how many key cells went unchecked on each side.
test('the guard tally per step and cell: refusals by cause beside the key cells guarded unread, from every record shape', () => {
  const tally = guardTally([
    {step: 'vv-1', record: {alertGuardCounts: {'task.act': {alert: 1, unread: 0}}, keyUnread: {'task.act': 2, quit: 1}}},
    {step: 'matrix-cua-1', record: {meta: {keyUnread: {'row:3': 1}}}},
    {step: 'accept-native', record: {alertGuardCounts: {'connection A: type and observe the marker': {alert: 0, unread: 1}}}},
    {step: 'vc-1', record: {complete: true}},
    {step: 'cc-1', record: null},
  ]);
  assert.deepEqual(tally, [
    {step: 'vv-1', cell: 'task.act', alert: 1, unread: 0, keyWindow: 0, keyUnread: 2, keyWindowRead: 0, keyWindowUnread: 0, keyWindowUnreadReasons: {}},
    {step: 'vv-1', cell: 'quit', alert: 0, unread: 0, keyWindow: 0, keyUnread: 1, keyWindowRead: 0, keyWindowUnread: 0, keyWindowUnreadReasons: {}},
    {step: 'matrix-cua-1', cell: 'row:3', alert: 0, unread: 0, keyWindow: 0, keyUnread: 1, keyWindowRead: 0, keyWindowUnread: 0, keyWindowUnreadReasons: {}},
    {step: 'accept-native', cell: 'connection A: type and observe the marker', alert: 0, unread: 1, keyWindow: 0, keyUnread: 0, keyWindowRead: 0, keyWindowUnread: 0, keyWindowUnreadReasons: {}},
  ]);
  const text = renderGuardTally(tally);
  assert.match(text, /^\| step \| cell \| NO VERDICT alert \| NO VERDICT unread \| NO VERDICT keyWindow \| key cells guarded unread \| cells key window read \| cells key window unread \|$/m);
  assert.match(text, /^\| vv-1 \| task\.act \| 1 \| 0 \| 0 \| 2 \| 0 \| 0 \|$/m);
  assert.match(renderGuardTally([]), /No refusal, no key cell guarded unread and no key-window reading/);
});

// The key-window requirement (ruling 1169's addition): a click or key cell whose scene app held another key window is
// refused, NO VERDICT keyWindow; one whose key-window reading was not taken is sent and counted (keyWindowUnread), per
// cell and side as the alert guard's are.
test('per cell and side, and per step: the cells NO VERDICT keyWindow and those sent with their key window unread', () => {
  const judged = {cells: [{section: 'method', id: 'electron/frontmost/click.point', verdict: 'no-verdict', qualifies: false,
    account: (() => { const a = account({vendor: {1: {verdicts: 8, samples: 10}}, cua: {1: {verdicts: 10, samples: 10}}}); a.vendor.noVerdict = {keyWindow: 2}; return a; })()}]};
  const full = side => ({path: `c/${side}/run-1/result.json`, result: {cell: 'matrix', lanes: [{host: side, engine: side}],
    meta: {planId: 'full', ...(side === 'cua' ? {keyWindowUnread: {'row:0': 2, 'close-panel': 1}, keyWindowUnreadReasons: {'row:0': {'the reader is not trusted for Accessibility': 2}, 'close-panel': {'the scene window is not on screen': 1}}} : {})}, rows: [{section: 'method', id: 'electron/frontmost/click.point', engine: side}]}});
  const keyWindowed = {path: 'c/save-sheet/cua/run-1/result.json', result: {cell: 'intervention-save-sheet', meta: {run: 1, hosted: true}, rows: [
    {section: 'intervention', id: 'textedit/intervention.saveSheet', engine: 'cua', sample: 1, ok: false, invalid: 'the alert guard refused the cell: nothing of it was sent',
      alertGuard: {cause: 'keyWindow', detail: 'the textedit app\'s key window is another of its windows, not the scene window 4'}}]}};
  const counts = cellCounts([full('vendor'), full('cua'), keyWindowed], {judgeFull: () => judged});
  assert.deepEqual(counts.map(c => [c.cell, c.vendor.keyWindow, c.cua.keyWindow, c.vendor.keyWindowUnread, c.cua.keyWindowUnread]), [
    ['method electron/frontmost/click.point', 2, 0, 0, 2],
    ['intervention textedit/intervention.saveSheet', 0, 1, 0, 0],
    ['harness close-panel', 0, 0, 0, 1],
  ]);
  assert.match(renderCounts(counts), /^\| method electron\/frontmost\/click\.point \| matrix \| 0 of 1 \| 1: 8\/10 \| 0 \| 2 \| 0 \| 0 \| 1 of 1 \| 1: 10\/10 \| 0 \| 0 \| 0 \| 2 \(the reader is not trusted for Accessibility 2\) \| 0 \|$/m);
  assert.deepEqual(counts.find(c => c.cell === 'harness close-panel').cua.keyWindowUnreadReasons, {'the scene window is not on screen': 1});
  const tally = guardTally([
    {step: 'vc-1', record: {alertGuardCounts: {'task.act': {alert: 0, unread: 0, keyWindow: 1}}, keyWindowUnread: {quit: 1}, keyWindowUnreadReasons: {quit: {'the reader is not trusted for Accessibility': 1}}}},
    {step: 'matrix-cua-1', record: {meta: {keyWindowUnread: {'row:3': 2}}}},
  ]);
  assert.deepEqual(tally, [
    {step: 'vc-1', cell: 'task.act', alert: 0, unread: 0, keyWindow: 1, keyUnread: 0, keyWindowRead: 0, keyWindowUnread: 0, keyWindowUnreadReasons: {}},
    {step: 'vc-1', cell: 'quit', alert: 0, unread: 0, keyWindow: 0, keyUnread: 0, keyWindowRead: 0, keyWindowUnread: 1, keyWindowUnreadReasons: {'the reader is not trusted for Accessibility': 1}},
    {step: 'matrix-cua-1', cell: 'row:3', alert: 0, unread: 0, keyWindow: 0, keyUnread: 0, keyWindowRead: 0, keyWindowUnread: 2, keyWindowUnreadReasons: {}},
  ]);
  assert.match(renderGuardTally(tally), /^\| vc-1 \| quit \| 0 \| 0 \| 0 \| 0 \| 0 \| 1 \(the reader is not trusted for Accessibility 1\) \|$/m);
});

// Recorded check (3) of ruling 1169: whether the key-window requirement was observed, at a glance, judged on the sitting's
// own readings (taken, refused, unread by reason); setup's reading of the grant over the loopback ssh is context only.
test('the key-window requirement at a glance: judged on the sitting\'s own readings, setup\'s grant reading context only', () => {
  const NOT = 'the reader is not trusted for Accessibility';
  const row = (step, cell, {read = 0, refused = 0, reasons = {}} = {}) => ({step, cell, alert: 0, unread: 0, keyWindow: refused, keyUnread: 0,
    keyWindowRead: read, keyWindowUnread: Object.values(reasons).reduce((a, b) => a + b, 0), keyWindowUnreadReasons: reasons});
  const observed = renderKeyWindowObserved({trusted: true, via: 'loopback ssh'}, [row('vc-1', 'task.act', {read: 3, refused: 1})]);
  assert.match(observed, /^## The key-window requirement/);
  assert.match(observed, /^In this sitting's records: 3 click or key cells sent with the key window read; 1 refused NO VERDICT keyWindow; 0 sent with the key window unread\.$/m);
  assert.match(observed, /^Setup's reading of the reader's grant over the loopback ssh: trusted\. Context only/m);
  assert.match(observed, /^Observed\.$/m);
  const part = renderKeyWindowObserved({trusted: true, via: 'loopback ssh'}, [row('vc-1', 'task.act', {read: 1}), row('matrix-cua-1', 'row:3', {reasons: {'the scene window is not on screen': 2}})]);
  assert.match(part, /2 sent with the key window unread \(the scene window is not on screen 2\)/);
  assert.match(part, /^Observed, except for the 2 cells sent unread\.$/m);
  // Every reading unread checked nothing, whatever setup read of the grant.
  for (const trust of [{trusted: false, reason: NOT, via: 'loopback ssh'}, {trusted: true, via: 'loopback ssh'}, null]) {
    assert.match(renderKeyWindowObserved(trust, [row('matrix-cua-1', 'row:3', {reasons: {[NOT]: 5}})]), /^Vacuous: every key-window reading went unread, so no cell was checked\.$/m);
  }
  assert.match(renderKeyWindowObserved({trusted: false, reason: NOT, via: 'loopback ssh'}, []), /not trusted \(the reader is not trusted for Accessibility\)/);
  assert.match(renderKeyWindowObserved(null, []), /Setup recorded no reading of the reader's grant/);
  // A refusal is a reading taken: the requirement held somewhere, whatever else went unread.
  assert.match(renderKeyWindowObserved(null, [row('vc-1', 'task.act', {refused: 1, reasons: {[NOT]: 1}})]), /^Observed, except for the 1 cell sent unread\.$/m);
});

// A sitting with no key-window reading (E, F, or a run that stopped before its first click or key cell) observed nothing,
// not the requirement; even a cell of the guard tally refused for an alert is no key-window reading.
test('the key-window requirement with no reading in the sitting: not observed, never "Observed"', () => {
  for (const tally of [[], guardTally([{step: 'cc-1', record: {alertGuardCounts: {'task.act': {alert: 1, unread: 0}}}}, {step: 'ee-1', record: null}])]) {
    const text = renderKeyWindowObserved({trusted: true, via: 'loopback ssh'}, tally);
    assert.match(text, /^No key-window reading was taken: the requirement was not observed in this sitting\.$/m);
    assert.doesNotMatch(text, /^Observed/m);
  }
});

// D reads in the job's own process chain (accept-native's guard, not over the loopback ssh): its acceptance record's own
// readings judge it, so an ssh grant reading of not trusted does not make D's checked cells vacuous.
test('sitting D is judged on its own reads: acceptance.json\'s key-window readings, beside an untrusted ssh grant reading', () => {
  const STEP = 'connection A: type and observe the marker';
  const tally = guardTally([{step: 'accept-native', record: {keyWindowRead: {[STEP]: 4}, keyWindowUnread: {[STEP]: 1}, keyWindowUnreadReasons: {[STEP]: {'the scene window is not on screen': 1}}}}]);
  assert.deepEqual(tally.map(t => [t.cell, t.keyWindowRead, t.keyWindowUnread]), [[STEP, 4, 1]]);
  const text = renderKeyWindowObserved({trusted: false, reason: 'the reader is not trusted for Accessibility', via: 'loopback ssh'}, tally);
  assert.match(text, /4 click or key cells sent with the key window read/);
  assert.match(text, /^Observed, except for the 1 cell sent unread\.$/m);
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
