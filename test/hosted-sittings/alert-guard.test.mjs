// The shared alert guard and placement (rulings 1154, 1160, 1164; scripts/hosted-sittings/alert-guard.mjs): the one
// module sittings A, B, C and D call before a pointer event, a key and a capture, and to place their windows clear of
// replayd's alerts. The matrix's own tests (test/native-matrix/alert-guard.test.mjs) cover the rules it shares.
import assert from 'node:assert/strict';
import test from 'node:test';
import {captureCause, clearFrame, countGuards, guardCause, guardMark, guardReading, keyCause, keyWindowCause, overlaps, PANEL_SERVICE, placeWindows, recordKeyUnread, recordKeyWindowReading, recordRefusal} from '../../scripts/hosted-sittings/alert-guard.mjs';
import * as matrixGuard from '../../scripts/native-matrix/alert-guard.mjs';

const UNC = 'com.apple.UserNotificationCenter';
const rect = (x, y, width, height) => ({x, y, width, height});
const alertAt = (bounds, number = 90) => ({ownerPid: 77, ownerName: 'UserNotificationCenter', ownerBundleId: UNC, layer: 8, number, name: null, bounds});
const own = (pid, number, bounds, bundle = 'com.apple.TextEdit') => ({ownerPid: pid, ownerName: 'App', ownerBundleId: bundle, layer: 0, number, name: 'a title', bounds});
const DISPLAY = rect(0, 0, 1920, 1080);
// The warm-ups' alerts as the pilot read them at 1024x768 (hosted.md, Pilot B), and TextEdit's window then.
const CUA_ALERT = rect(382, 118, 260, 348), VENDOR_ALERT = rect(411, 147, 260, 364);
const TEXTEDIT_FRAME = rect(79, 31, 627, 677);

test('the matrix keeps working through the shared module: one rule, one implementation', () => {
  for (const name of ['clearFrame', 'guardCause', 'overlaps', 'contains', 'isAlertWindow', 'isPanelWindow', 'MENU_BAR', 'ALERT_MARGIN', 'PANEL_SERVICE']) {
    assert.ok(name in matrixGuard, name);
  }
  assert.equal(matrixGuard.guardCause, guardCause);
  assert.equal(matrixGuard.clearFrame, clearFrame);
});

test('a reading by pid: every window of a run-launched app, one recorded window of a shared process, the Open panel; titles never leave', () => {
  const windows = [alertAt(CUA_ALERT, 90), alertAt(VENDOR_ALERT, 91), own(600, 7, TEXTEDIT_FRAME), own(600, 8, rect(100, 60, 627, 677)),
    own(410, 21, rect(1100, 600, 600, 400), 'com.apple.finder'), own(410, 22, rect(0, 0, 600, 400), 'com.apple.finder'),
    {ownerPid: 12, ownerName: 'Open', ownerBundleId: PANEL_SERVICE, layer: 0, number: 55, name: 'Open', bounds: rect(300, 150, 800, 500)}];
  const read = guardReading(windows, [{scene: 'textedit', pid: 600}, {scene: 'finder', pid: 410, number: 21, only: true}], [DISPLAY]);
  assert.deepEqual(read.alerts, [{number: 90, layer: 8, bounds: CUA_ALERT}, {number: 91, layer: 8, bounds: VENDOR_ALERT}]);
  assert.deepEqual(read.windows.map(w => [w.scene, w.number, w.recorded]), [['textedit', 7, false], ['textedit', 8, false], ['finder', 21, true], ['openPanel', 55, false]]);
  assert.deepEqual(read.displays, [DISPLAY]);
  assert.ok(!JSON.stringify(read).includes('title'), 'no title leaves the device');
  // A recorded window not on screen is kept with no bounds; an unread list is unread, never an empty screen.
  assert.deepEqual(guardReading([], [{scene: 'finder', pid: 410, number: 21, only: true}]).windows, [{scene: 'finder', number: 21, recorded: true, bounds: null}]);
  assert.equal(guardReading(null, [{scene: 'textedit', pid: 600}]), null);
});

test('a pointer event: refused under an overlapping alert, with the alert in front or key, or on an unread screen; else sent', () => {
  const windows = [alertAt(CUA_ALERT), own(600, 7, TEXTEDIT_FRAME)];
  const under = guardReading(windows, [{scene: 'textedit', pid: 600}], [DISPLAY]);
  assert.deepEqual(guardCause(under, {front: 'com.apple.TextEdit', key: 'com.apple.TextEdit'}, {scenes: ['textedit']}).category, 'alert');
  const clear = guardReading([alertAt(CUA_ALERT), own(600, 7, rect(700, 31, 627, 677))], [{scene: 'textedit', pid: 600}], [DISPLAY]);
  assert.equal(guardCause(clear, {front: 'com.apple.TextEdit', key: 'com.apple.TextEdit'}, {scenes: ['textedit']}), null);
  assert.match(guardCause(clear, {front: UNC}).detail, /holds the front/);
  assert.match(guardCause(clear, {front: 'com.apple.TextEdit', key: UNC}).detail, /holds the key/);
  assert.equal(guardCause(null).category, 'unread');
});

test('a key: refused only when the alert holds the key; an unread key is no refusal of its own', () => {
  assert.deepEqual(keyCause({front: 'com.apple.TextEdit', key: UNC}), {category: 'alert', detail: `${UNC} holds the key`});
  assert.equal(keyCause({front: 'com.apple.TextEdit', key: 'com.apple.TextEdit'}), null);
  assert.equal(keyCause({front: UNC, key: null}), null, 'the front is the key guard\'s own to judge');
});

test('a capture: a window capture of a window clear of every alert is exempt; a screen or region capture meeting an alert is NO VERDICT alert', () => {
  const windows = [alertAt(CUA_ALERT), own(600, 7, rect(700, 31, 627, 677))];
  const read = guardReading(windows, [{scene: 'textedit', pid: 600}], [DISPLAY]);
  assert.equal(captureCause(read, {scenes: ['textedit']}), null, 'the window, clear');
  assert.equal(captureCause(guardReading([alertAt(CUA_ALERT), own(600, 7, TEXTEDIT_FRAME)], [{scene: 'textedit', pid: 600}], [DISPLAY]), {scenes: ['textedit']}).category, 'alert');
  assert.equal(captureCause(read, {kind: 'screen'}).category, 'alert', 'a screen capture shows every alert on it');
  assert.equal(captureCause({...read, alerts: []}, {kind: 'screen'}), null);
  assert.equal(captureCause(read, {kind: 'region', region: rect(1000, 600, 200, 200)}), null);
  assert.equal(captureCause(read, {kind: 'region', region: rect(400, 200, 50, 50)}).category, 'alert');
  assert.equal(captureCause(null, {scenes: ['textedit']}).category, 'unread');
  // A capture is never refused for front or key: only what it shows counts.
  assert.equal(captureCause(read, {scenes: ['textedit']}), null);
});

test('placement: each Finder window under an alert moved clear by the module\'s clearFrame from the fresh reading, from, to and readBack recorded', async () => {
  const finderUnder = rect(500, 150, 600, 400);
  const read = guardReading([alertAt(CUA_ALERT, 90), alertAt(VENDOR_ALERT, 91), own(410, 20, finderUnder, 'com.apple.finder'), own(410, 21, rect(1100, 600, 600, 400), 'com.apple.finder')],
    [{scene: 'finder', pid: 410}], [DISPLAY]);
  const moves = [];
  const placed = await placeWindows(read, {move: ({number, frame}) => { moves.push([number, frame]); return {readBack: frame, matched: true}; }});
  assert.deepEqual(placed.alerts, [CUA_ALERT, VENDOR_ALERT]);
  assert.deepEqual(placed.displays, [DISPLAY]);
  const finder = placed.windows.find(w => w.number === 20);
  assert.equal(finder.moved, true);
  assert.deepEqual(finder.from, finderUnder);
  assert.ok(![CUA_ALERT, VENDOR_ALERT].some(a => overlaps(a, finder.to)));
  assert.deepEqual(finder.readBack, finder.to);
  assert.equal(finder.matched, true);
  assert.equal('reason' in finder, false);
  assert.deepEqual(placed.windows.find(w => w.number === 21), {scene: 'finder', number: 21, from: rect(1100, 600, 600, 400), moved: false});
  assert.deepEqual(moves.map(([n]) => n), [20], 'only the window under an alert is moved');
  // A move the probe did not complete: moved only when the window reads back somewhere else; why it is not placed.
  const partly = (await placeWindows(read, {move: () => ({readBack: rect(0, 0, 600, 400), matched: false, exitStatus: 5})})).windows.find(w => w.number === 20);
  assert.deepEqual([partly.moved, partly.matched, partly.readBack], [true, false, rect(0, 0, 600, 400)]);
  assert.match(partly.reason, /the frame probe did not place it \(exit 5\)/);
  const refused = (await placeWindows(read, {move: () => ({readBack: null, matched: false, exitStatus: 2})})).windows.find(w => w.number === 20);
  assert.deepEqual([refused.moved, refused.matched, refused.readBack], [false, false, null]);
  assert.match(refused.reason, /exit 2.*no read-back/);
  const threw = (await placeWindows(read, {move: () => ({error: '--window 20 is not a window of pid 410 on screen'})})).windows.find(w => w.number === 20);
  assert.deepEqual([threw.moved, threw.matched], [false, false]);
  assert.match(threw.reason, /the move failed: --window 20 is not a window of pid 410/);
  assert.deepEqual(await placeWindows(null, {move: () => assert.fail('nothing is moved unread')}), {unread: true});
  // A window with no room on the display stays, with the reason.
  const tight = guardReading([alertAt(rect(0, 0, 900, 700)), own(410, 7, rect(10, 30, 800, 600), 'com.apple.finder')], [{scene: 'finder', pid: 410}], [rect(0, 0, 1000, 700)]);
  const stuck = await placeWindows(tight, {move: () => assert.fail('no frame to move to')});
  assert.match(stuck.windows[0].reason, /no 800x600 frame/);
});

// Pilot B (run 45274556933) recorded TextEdit's window `moved: true, readBack: null, matched: false`: the engine's frame
// probe moves Finder windows only (WindowFrameProbe.swift refuses every other process), so no other window is offered
// to it. Such a window is recorded where it was read, not moved, with why; the guard then refuses what it overlaps.
test('placement: a window the frame probe cannot move (TextEdit\'s, the Open panel\'s) is not offered to it, and stays recorded where it was read, with why', async () => {
  const panel = {ownerPid: 12, ownerName: 'Open', ownerBundleId: PANEL_SERVICE, layer: 0, number: 55, name: 'Open', bounds: rect(300, 150, 800, 500)};
  const read = guardReading([alertAt(CUA_ALERT, 90), alertAt(VENDOR_ALERT, 91), own(600, 66, TEXTEDIT_FRAME), panel], [{scene: 'textedit', pid: 600}], [DISPLAY]);
  const placed = await placeWindows(read, {move: () => assert.fail('the frame probe moves Finder windows only')});
  assert.deepEqual(placed.windows.map(w => [w.scene, w.number, w.moved]), [['textedit', 66, false], ['openPanel', 55, false]]);
  const textedit = placed.windows[0];
  assert.deepEqual(textedit.from, TEXTEDIT_FRAME);
  assert.equal('to' in textedit || 'readBack' in textedit || 'matched' in textedit, false, 'nothing was asked, so nothing was read back');
  assert.match(textedit.reason, /the frame probe moves Finder windows only: the textedit window stays where it was read/);
  assert.match(placed.windows[1].reason, /the openPanel window stays where it was read/);
});

test('the refusal\'s mark and the counts: per cell, by cause', () => {
  assert.deepEqual(guardMark({category: 'alert', detail: 'd'}), {alertGuard: {cause: 'alert', detail: 'd'}, invalid: 'the alert guard refused the cell: nothing of it was sent'});
  assert.deepEqual(countGuards([{cell: 'chrome/action', cause: 'alert'}, {cell: 'chrome/action', cause: 'alert'}, {cell: 'textedit/action', cause: 'unread'}]),
    {'chrome/action': {alert: 2, unread: 0}, 'textedit/action': {alert: 0, unread: 1}});
});

test('a refusal recorded once, alike in every sitting: the per-cell entry, the counts, the first stop, and the row\'s mark', () => {
  const record = {};
  const mark = recordRefusal(record, 'task.close', {category: 'alert', detail: 'd1'}, {sample: 2});
  assert.deepEqual(mark, guardMark({category: 'alert', detail: 'd1'}));
  recordRefusal(record, 'quit', {category: 'unread', detail: 'd2'});
  assert.deepEqual(record.alertGuards, [{cell: 'task.close', sample: 2, cause: 'alert', detail: 'd1'}, {cell: 'quit', cause: 'unread', detail: 'd2'}]);
  assert.deepEqual(record.alertGuardCounts, {'task.close': {alert: 1, unread: 0}, quit: {alert: 0, unread: 1}});
  assert.deepEqual(record.alertGuardStop, {cause: 'alert', detail: 'd1', at: 'task.close'}, 'the first refusal is the stop');
});

test('a key cell sent with its key reading not taken is counted per cell beside the refusals: unguarded, never hidden', () => {
  const record = {};
  recordKeyUnread(record, 'task.act');
  recordKeyUnread(record, 'task.act');
  recordKeyUnread(record, 'quit');
  assert.deepEqual(record.keyUnread, {'task.act': 2, quit: 1});
  assert.equal(record.alertGuardStop, undefined, 'no refusal: the cell was sent');
});

// The key-window requirement (the design session's addition to ruling 1169; pilot B, run 45254955711: the Electron
// fixture frontmost with no key window): before a click or key cell the scene's app holds the scene window as its own
// key window, read outside either engine (ax-state.swift window: the app's AXFocusedWindow and AXMainWindow against the
// scene window), which an app that is not frontmost answers too.
test('the key-window rule: the scene window is its app\'s focused window; an app in the background may answer none with it main', () => {
  const own = (focusedWindow, mainWindow = 'run', frontmost = true) => ({trusted: true, ok: true, scene: 'electron', number: 5, frontmost, focusedWindow, mainWindow});
  assert.equal(keyWindowCause(own('run')), null);
  assert.deepEqual(keyWindowCause(own('none')), {category: 'keyWindow', detail: 'the electron app holds no key window (its focused window none, its main window the scene window 5) while frontmost'});
  assert.match(keyWindowCause(own('other', 'other')).detail, /the electron app's key window is another of its windows, not the scene window 5/);
  // In the background an app keeps its main window and may report no focused window: the main window is then its own.
  assert.equal(keyWindowCause(own('none', 'run', false)), null);
  assert.equal(keyWindowCause(own('other', 'run', false)).category, 'keyWindow');
  assert.equal(keyWindowCause(own('none', 'none', false)).category, 'keyWindow');
  // Not read (an untrusted reader, a failed read, the scene window not on screen): nothing refused; the sitting counts it.
  for (const unread of [null, {trusted: false}, {...own('none'), ok: false}]) assert.equal(keyWindowCause(unread), null);
  const record = {};
  recordKeyWindowReading(record, 'chrome/action', {trusted: false, ok: false, reason: 'the reader is not trusted for Accessibility'});
  recordKeyWindowReading(record, 'chrome/action', {trusted: false, ok: false, reason: 'the reader is not trusted for Accessibility'});
  recordKeyWindowReading(record, 'chrome/action', null);
  assert.deepEqual(record.keyWindowUnread, {'chrome/action': 3});
  // A reading taken is counted too: the sitting judges the requirement on its own readings.
  recordKeyWindowReading(record, 'chrome/action', own('run'));
  recordKeyWindowReading(record, 'chrome/action', own('run', 'run', false));
  assert.deepEqual([record.keyWindowRead, record.keyWindowUnread], [{'chrome/action': 2}, {'chrome/action': 3}]);
  // Each kept with why, so a sitting tells an untrusted reader (the requirement vacuous) from a window not there.
  assert.deepEqual(record.keyWindowUnreadReasons, {'chrome/action': {'the reader is not trusted for Accessibility': 2, 'the guard reading was not taken': 1}});
  // A refusal of this kind is counted beside the alert's, in the same record.
  recordRefusal(record, 'electron/action', keyWindowCause(own('none')));
  assert.deepEqual(record.alertGuardCounts, {'electron/action': {alert: 0, unread: 0, keyWindow: 1}});
  assert.equal(record.alertGuardStop.cause, 'keyWindow');
});

// Pilot C-4: a sheet on the scene window holds the app's focus (ax-state's `sheet`): the scene window's own, as the
// reading of a sheet in front already is. Every refusal names the window Accessibility held focused.
test('the key-window rule: a sheet of the scene window focused holds only where exempt (ruling 1214); a refusal names the focused window', () => {
  const own = (focusedWindow, focused) => ({trusted: true, ok: true, scene: 'textedit', number: 586, frontmost: false, focusedWindow, mainWindow: 'run', ...(focused === undefined ? {} : {focused})});
  const sheet = {number: 590, frame: {x: 10, y: 20, width: 300, height: 200}, role: 'AXSheet', subrole: null, parent: 586, of: 'own'};
  assert.equal(keyWindowCause(own('sheet', sheet), {sheetParent: 586}), null);
  // Exempt only with the sheet's proved parent the case's own document (ruling 1214's third condition).
  assert.match(keyWindowCause(own('sheet', {...sheet, parent: 428}), {sheetParent: 586}).detail, /is a sheet on the scene window 586, outside a case/);
  assert.match(keyWindowCause(own('sheet', {...sheet, parent: null}), {sheetParent: 586}).detail, /is a sheet on the scene window 586, outside a case/);
  assert.match(keyWindowCause(own('sheet'), {sheetParent: 586}).detail, /is a sheet on the scene window 586, outside a case/);
  // A focused AXSheet is never the window read itself, even where Accessibility lists it among the app's windows and the
  // bounds lookup matched it: refused as a sheet, exempt or not (fix wave, review of ax-state's direct-equality path).
  const listed = {...sheet, number: 590, parent: 586};
  for (const exempt of [{}, {sheetParent: 586}, {sheetParent: 590}]) {
    const cause = keyWindowCause({...own('run', listed), number: 590}, exempt);
    assert.equal(cause?.detail, 'the textedit app\'s key window is a sheet Accessibility lists as a window of its own (the scene window 590), outside a case that opened it on the run\'s own window (Accessibility\'s focused window: window 590 at 10,20 300x200, AXSheet, a sheet of window 586, the run\'s own)', JSON.stringify(exempt));
  }
  // Not exempt (a case that opens no sheet, or a sheet on a window other than the run's own): refused, the sheet named.
  const refusedSheet = keyWindowCause(own('sheet', {...sheet, of: 'scene'}));
  assert.equal(refusedSheet.detail, 'the textedit app\'s key window is a sheet on the scene window 586, outside a case that opened it on the run\'s own window (Accessibility\'s focused window: window 590 at 10,20 300x200, AXSheet, a sheet of window 586, the scene\'s)');
  assert.deepEqual(refusedSheet.focused, {...sheet, of: 'scene'});
  const focused = {number: 412, frame: {x: 81, y: 73, width: 880, height: 448}, role: 'AXWindow', subrole: 'AXStandardWindow', parent: null, of: 'scene'};
  const cause = keyWindowCause(own('other', focused));
  assert.equal(cause.detail, 'the textedit app\'s key window is another of its windows, not the scene window 586 (Accessibility\'s focused window: window 412 at 81,73 880x448, AXWindow/AXStandardWindow, the scene\'s)');
  assert.deepEqual(cause.focused, focused);
  assert.match(keyWindowCause(own('other', {...focused, number: null, of: 'neither'})).detail, /focused window: not in the window list, at 81,73 880x448, AXWindow\/AXStandardWindow, neither the scene's nor the run's own\)$/);
  assert.match(keyWindowCause(own('other', null)).detail, /not the scene window 586 \(Accessibility's focused window: none\)$/);
  assert.match(keyWindowCause(own('other', 'unread')).detail, /\(Accessibility's focused window: unread\)$/);
  // A reading without the focused window (an older reader) refuses as before.
  assert.equal(keyWindowCause(own('other')).detail, 'the textedit app\'s key window is another of its windows, not the scene window 586');
  assert.equal(keyWindowCause(own('other')).focused, undefined);
});
