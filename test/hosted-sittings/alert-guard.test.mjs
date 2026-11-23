// The shared alert guard and placement (rulings 1154, 1160, 1164; scripts/hosted-sittings/alert-guard.mjs): the one
// module sittings A, B, C and D call before a pointer event, a key and a capture, and to place their windows clear of
// replayd's alerts. The matrix's own tests (test/native-matrix/alert-guard.test.mjs) cover the rules it shares.
import assert from 'node:assert/strict';
import test from 'node:test';
import {captureCause, clearFrame, countGuards, guardCause, guardMark, guardReading, keyCause, overlaps, PANEL_SERVICE, placeWindows} from '../../scripts/hosted-sittings/alert-guard.mjs';
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

test('placement: each window under an alert moved clear by the module\'s clearFrame from the fresh reading, from, to and readBack recorded', async () => {
  const read = guardReading([alertAt(CUA_ALERT, 90), alertAt(VENDOR_ALERT, 91), own(600, 7, TEXTEDIT_FRAME), own(410, 21, rect(1100, 600, 600, 400), 'com.apple.finder')],
    [{scene: 'textedit', pid: 600}, {scene: 'finder', pid: 410, number: 21, only: true}], [DISPLAY]);
  const moves = [];
  const placed = await placeWindows(read, {move: ({number, frame}) => { moves.push([number, frame]); return {readBack: frame, matched: true}; }});
  assert.deepEqual(placed.alerts, [CUA_ALERT, VENDOR_ALERT]);
  assert.deepEqual(placed.displays, [DISPLAY]);
  const textedit = placed.windows.find(w => w.number === 7);
  assert.equal(textedit.moved, true);
  assert.deepEqual(textedit.from, TEXTEDIT_FRAME);
  assert.ok(![CUA_ALERT, VENDOR_ALERT].some(a => overlaps(a, textedit.to)));
  assert.deepEqual(textedit.readBack, textedit.to);
  assert.equal(textedit.matched, true);
  assert.deepEqual(placed.windows.find(w => w.number === 21), {scene: 'finder', number: 21, from: rect(1100, 600, 600, 400), moved: false});
  assert.deepEqual(moves.map(([n]) => n), [7], 'only the window under an alert is moved');
  // A move whose read-back differs is kept as it read back; an unread screen places nothing.
  const off = await placeWindows(read, {move: () => ({readBack: rect(0, 0, 1, 1), matched: false})});
  assert.equal(off.windows.find(w => w.number === 7).matched, false);
  assert.deepEqual(await placeWindows(null, {move: () => assert.fail('nothing is moved unread')}), {unread: true});
  // A window with no room on the display stays, with the reason.
  const tight = guardReading([alertAt(rect(0, 0, 900, 700)), own(600, 7, rect(10, 30, 800, 600))], [{scene: 'textedit', pid: 600}], [rect(0, 0, 1000, 700)]);
  const stuck = await placeWindows(tight, {move: () => assert.fail('no frame to move to')});
  assert.match(stuck.windows[0].reason, /no 800x600 frame/);
});

test('the refusal\'s mark and the counts: per cell, by cause', () => {
  assert.deepEqual(guardMark({category: 'alert', detail: 'd'}), {alertGuard: {cause: 'alert', detail: 'd'}, invalid: 'the alert guard refused the cell: nothing of it was sent'});
  assert.deepEqual(countGuards([{cell: 'chrome/action', cause: 'alert'}, {cell: 'chrome/action', cause: 'alert'}, {cell: 'textedit/action', cause: 'unread'}]),
    {'chrome/action': {alert: 2, unread: 0}, 'textedit/action': {alert: 0, unread: 1}});
});
