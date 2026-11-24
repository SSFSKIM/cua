// The alert guard (ruling 1154; scripts/native-matrix/alert-guard.mjs): the device's reading of the alert windows and the
// run's own, what refuses a pointer cell, which cells send a pointer, the placement of a window clear of the alerts, and
// the device commands that read and place.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {main} from '../../scripts/native-matrix/matrix-device.mjs';
import {writeState} from '../../scripts/repl-parity/scenes-mac.mjs';
import {MOVE_REFUSED_OFF_HOSTED} from '../../scripts/hosted-sittings/runner.mjs';
import {alertBoundsOf, clearFrame, contains, guardCause, isAlertWindow, isPanelWindow, MENU_BAR, overlaps, PANEL_SERVICE, sendsPointer} from '../../scripts/native-matrix/alert-guard.mjs';
import {CAPTURE_ALERT_PROCESS} from '../../scripts/native-matrix/live-checks.mjs';
import {CASES} from '../../scripts/native-matrix/plan.mjs';

const UNC = CAPTURE_ALERT_PROCESS;
const rect = (x, y, width, height) => ({x, y, width, height});
const alertAt = (bounds, number = 90) => ({ownerPid: 77, ownerName: 'UserNotificationCenter', ownerBundleId: UNC, layer: 0, number, name: null, bounds});
// The Electron fixture's placement and a window list holding it.
const ELECTRON = {pid: 501, window: {number: 41}};
const electronWindow = bounds => ({ownerPid: 501, ownerName: 'cua fixture', ownerBundleId: 'com.cua.fixture', layer: 0, number: 41, name: null, bounds});
const PLACED = rect(140, 100, 720, 560);

test('rectangles: overlap needs shared area; a point is inside with its edges', () => {
  assert.equal(overlaps(rect(0, 0, 100, 100), rect(50, 50, 100, 100)), true);
  assert.equal(overlaps(rect(0, 0, 100, 100), rect(100, 0, 100, 100)), false, 'edges that only touch');
  assert.equal(overlaps(rect(0, 0, 100, 100), null), false);
  assert.equal(contains(rect(10, 10, 20, 20), [10, 30]), true);
  assert.equal(contains(rect(10, 10, 20, 20), [31, 15]), false);
});

test('the device\'s reading: the alert windows\' bounds and the run\'s windows by pid and number; an unread list is unread', () => {
  const windows = [alertAt(rect(700, 200, 420, 180)), electronWindow(PLACED),
    {ownerPid: 9, ownerName: 'Owner', ownerBundleId: 'com.example.owner', layer: 0, number: 3, name: 'secret title', bounds: rect(0, 0, 500, 500)},
    {ownerPid: 12, ownerName: 'Open', ownerBundleId: PANEL_SERVICE, layer: 0, number: 55, name: null, bounds: rect(300, 150, 800, 500)},
    {ownerPid: 12, ownerName: 'Open', ownerBundleId: PANEL_SERVICE, layer: 0, number: 56, name: null, bounds: rect(0, 0, 4, 4)}];
  const read = alertBoundsOf(windows, {electron: ELECTRON, textedit: {pid: 600, window: {number: 7}}}, [rect(0, 0, 1920, 1080)]);
  assert.deepEqual(read, {alerts: [{number: 90, layer: 0, bounds: rect(700, 200, 420, 180)}],
    windows: [{scene: 'electron', number: 41, recorded: true, bounds: PLACED}, {scene: 'textedit', number: 7, recorded: true, bounds: null},
      {scene: 'openPanel', number: 55, recorded: false, bounds: rect(300, 150, 800, 500)}],
    displays: [rect(0, 0, 1920, 1080)]});
  assert.ok(!JSON.stringify(read).includes('secret'), 'nothing of another app\'s window leaves the device');
  assert.equal(alertBoundsOf(null, {electron: ELECTRON}), null);
  assert.equal(isAlertWindow({ownerName: 'UserNotificationCenter', ownerBundleId: null}), true, 'by its process name when the bundle id was not read');
});

test('every window the run made counts: a new document cascaded over the alert refuses TextEdit\'s cells; Finder keeps only the run\'s window', () => {
  const alert = rect(382, 118, 289, 393);
  const textedit = {pid: 600, window: {number: 7}}, finder = {pid: 410, window: {number: 21}};
  const windows = [alertAt(alert),
    {ownerPid: 600, ownerName: 'TextEdit', ownerBundleId: 'com.apple.TextEdit', layer: 0, number: 7, name: null, bounds: rect(800, 100, 600, 500)},
    // super+n's untitled document, cascaded down onto the alert; its sheet a window of its own.
    {ownerPid: 600, ownerName: 'TextEdit', ownerBundleId: 'com.apple.TextEdit', layer: 0, number: 8, name: null, bounds: rect(420, 140, 600, 500)},
    {ownerPid: 410, ownerName: 'Finder', ownerBundleId: 'com.apple.finder', layer: 0, number: 21, name: null, bounds: rect(1100, 600, 600, 400)},
    // An owner's Finder window: never the run's, never read.
    {ownerPid: 410, ownerName: 'Finder', ownerBundleId: 'com.apple.finder', layer: 0, number: 22, name: 'Owner', bounds: rect(300, 100, 600, 400)}];
  const read = alertBoundsOf(windows, {textedit, finder});
  assert.deepEqual(read.windows.map(w => [w.scene, w.number, w.recorded]), [['textedit', 7, true], ['textedit', 8, false], ['finder', 21, true]]);
  assert.match(guardCause(read, {}, {scenes: ['textedit']}).detail, /overlaps the textedit window 8/);
  // Per target: Finder's own window is clear, so its cells run while TextEdit's new document sits under the alert.
  assert.equal(guardCause(read, {}, {scenes: ['finder']}), null);
  // No target named (a cell the guard cannot tie to a scene): every window of the run.
  assert.equal(guardCause(read).category, 'alert');
});

test('the Open panel by its service\'s bundle id or, unread, its process name; its windows count for every target', () => {
  assert.equal(isPanelWindow({ownerBundleId: PANEL_SERVICE}), true);
  assert.equal(isPanelWindow({ownerBundleId: null, ownerName: 'Open and Save Panel Service'}), true);
  assert.equal(isPanelWindow({ownerBundleId: null, ownerName: 'com.apple.appkit.xpc.openAndSavePanelService'}), true);
  assert.equal(isPanelWindow({ownerBundleId: null, ownerName: 'TextEdit'}), false);
  const read = alertBoundsOf([alertAt(rect(382, 118, 289, 393)), {ownerPid: 12, ownerName: 'Open and Save Panel Service', ownerBundleId: null, layer: 0, number: 55, name: null, bounds: rect(300, 150, 800, 500)}], {});
  assert.equal(guardCause(read, {}, {scenes: ['textedit']}).category, 'alert', 'a TextEdit cell with the panel up clicks into the panel');
});

test('a point inside an alert is refused, through the window it lies in; a window clear of every alert is sent', () => {
  // #259's point: the fixture's window point (60, 84) on screen. Inside the alert, so its window overlaps the alert.
  const point = [PLACED.x + 60, PLACED.y + 84];
  const over = {alerts: [{number: 90, layer: 0, bounds: rect(point[0] - 10, point[1] - 10, 400, 150)}], windows: [{scene: 'electron', bounds: PLACED}]};
  assert.ok(contains(over.alerts[0].bounds, point));
  assert.deepEqual(guardCause(over).category, 'alert');
  assert.match(guardCause(over).detail, /overlaps the electron window/);
  // The alert beside the window: every point of it is clear.
  const clear = {alerts: [{number: 90, layer: 0, bounds: rect(900, 200, 420, 180)}], windows: [{scene: 'electron', bounds: PLACED}]};
  assert.ok(!contains(clear.alerts[0].bounds, point));
  assert.equal(guardCause(clear), null);
  // A region intersecting the alert (the window's corner under it) is refused even with the aimed point outside it.
  const corner = {alerts: [{number: 90, layer: 0, bounds: rect(800, 600, 300, 200)}], windows: [{scene: 'electron', bounds: PLACED}]};
  assert.ok(!contains(corner.alerts[0].bounds, point));
  assert.equal(guardCause(corner).category, 'alert');
  // No alert at all.
  assert.equal(guardCause({alerts: [], windows: [{scene: 'electron', bounds: PLACED}]}), null);
});

test('the alert holding the front or the key refuses; unread bounds are unread, not a clear screen', () => {
  const clear = {alerts: [], windows: [{scene: 'electron', bounds: PLACED}]};
  assert.deepEqual(guardCause(clear, {front: UNC, key: 'com.cua.fixture'}), {category: 'alert', detail: `${UNC} holds the front`});
  assert.deepEqual(guardCause(clear, {front: 'com.cua.fixture', key: UNC}), {category: 'alert', detail: `${UNC} holds the key`});
  assert.equal(guardCause(null).category, 'unread');
  assert.equal(guardCause(undefined, {front: 'com.cua.fixture', key: 'com.cua.fixture'}).category, 'unread');
  assert.equal(guardCause({alerts: [{number: 1, layer: 0, bounds: null}], windows: []}).category, 'unread');
});

test('the cells that send a pointer: every click, drag and scroll call, by element or by point; keys and observations do not', () => {
  const pointer = Object.entries(CASES).flatMap(([target, cases]) => cases.flatMap(c => [
    ...(sendsPointer(c.prepare) ? [`${target} ${c.method}.${c.case} prepare`] : []), ...(sendsPointer(c.act) ? [`${target} ${c.method}.${c.case} act`] : [])]));
  // The acts that send one.
  for (const act of ['textedit click.element act', 'textedit click.control act', 'textedit scroll.down act', 'textedit drag.select act', 'textedit click.invalidIndex act',
    'openPanel click.cancel act', 'finder click.row act', 'finder scroll.down act', 'chrome click.checkbox act', 'chrome click.apply act', 'chrome drag.select act',
    'electron click.button act', 'electron drag.select act', 'electron click.selection act', 'electron click.point act',
    'chrome click.pointerdown act', 'electron click.pointerdown act']) assert.ok(pointer.includes(act), act);
  // The prepares that may: a focus click, a scroll back up, a row's harness click, the drag's verification clicks.
  for (const prepare of ['textedit pressKey.selectAll prepare', 'finder pressKey.down prepare', 'chrome typeText.replace prepare', 'electron click.point prepare',
    'textedit drag.select prepare', 'textedit performSecondaryAction.down prepare']) assert.ok(pointer.includes(prepare), prepare);
  for (const none of ['textedit typeText.replace act', 'textedit pressKey.selectAll act', 'textedit performSecondaryAction.down act', 'textedit getAXState.tree prepare',
    'textedit listApps.running act', 'chrome setValue.name prepare', 'electron setValue.text act']) assert.ok(!pointer.includes(none), none);
});

test('avoidance: a frame clear of the alerts stays; one under an alert moves the least, the same size, on its display below the menu bar', () => {
  const display = [rect(0, 0, 1920, 1080)];
  assert.deepEqual(clearFrame(PLACED, [rect(1200, 200, 420, 180)], display), {frame: PLACED, moved: false});
  // An alert over the fixture's right part: the window moves beside it the shortest way.
  const alert = rect(750, 220, 420, 180);
  const out = clearFrame(PLACED, [{bounds: alert}], display);
  assert.equal(out.moved, true);
  assert.deepEqual([out.frame.width, out.frame.height], [720, 560]);
  assert.equal(overlaps(out.frame, alert), false);
  assert.ok(out.frame.y >= MENU_BAR && out.frame.x >= 0 && out.frame.x + 720 <= 1920 && out.frame.y + 560 <= 1080);
  // The smallest move: left of the alert (x 22, a move of 118) beats below it (y 408, 308) and right of it (x 1178, 1038).
  assert.deepEqual(out.frame, {x: 22, y: 100, width: 720, height: 560});
  // Two alerts: clear of both.
  const two = clearFrame(PLACED, [alert, rect(100, 420, 300, 200)], display);
  assert.equal(two.moved, true);
  assert.ok(![alert, rect(100, 420, 300, 200)].some(a => overlaps(a, two.frame)));
  // No room on a small display, and no display read.
  assert.deepEqual(clearFrame(PLACED, [rect(0, 0, 800, 700)], [rect(0, 0, 900, 700)]).frame, null);
  assert.match(clearFrame(PLACED, [alert], []).reason, /no display/);
});

// ---- the device commands ----------------------------------------------------------------------------------------------

const withRun = async body => {
  const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'matrix-guard-')));
  try { writeState(dir, {scenes: {electron: ELECTRON}}); return await body(dir); } finally { fs.rmSync(dir, {recursive: true, force: true}); }
};

test('read --with alert-bounds: one fresh screen read, the alerts and the run\'s windows; an unreadable screen is unread (null)', async () => {
  await withRun(async dir => {
    const screen = {windows: [alertAt(rect(700, 200, 420, 180)), electronWindow(PLACED)], displays: [rect(0, 0, 1920, 1080)]};
    const io = {frontWindow: () => ({frontmost: {pid: 501, bundleId: 'com.cua.fixture'}, topWindow: null}), probe: () => ({focusedApp: {bundleId: 'com.cua.fixture'}}),
      enginePids: () => [], watcherRuns: () => true, screen: () => screen};
    const out = await main(['read', '--run', dir, '--with', 'front-key,alert-bounds'], {io});
    assert.deepEqual(out.alertBounds, {alerts: [{number: 90, layer: 0, bounds: rect(700, 200, 420, 180)}], windows: [{scene: 'electron', number: 41, recorded: true, bounds: PLACED}], displays: [rect(0, 0, 1920, 1080)]});
    assert.equal(guardCause(out.alertBounds, out.frontKey).category, 'alert');
    const unread = await main(['read', '--run', dir, '--with', 'alert-bounds'], {io: {...io, screen: () => { throw new Error('swift exited 1'); }}});
    assert.equal(unread.alertBounds, null);
    assert.equal(guardCause(unread.alertBounds).category, 'unread');
  });
});

test('read --key-window <scene>: the scene app\'s own key window, read by ax-state at the window a cell acts in; a scene not up or a list unread is not taken', async () => {
  await withRun(async dir => {
    const asked = [];
    const io = {frontWindow: () => ({frontmost: {pid: 501, bundleId: 'com.cua.fixture'}, topWindow: null}), enginePids: () => [], watcherRuns: () => true,
      windows: () => [alertAt(rect(700, 200, 420, 180)), electronWindow(PLACED)],
      axState: (pid, bounds) => { asked.push([pid, bounds]); return {trusted: true, ok: true, frontmost: true, focused: false, main: true, focusedWindow: 'none', mainWindow: 'run', windows: 1}; }};
    const out = await main(['read', '--run', dir, '--key-window', 'electron'], {io});
    assert.deepEqual(asked, [[501, '140,100,720,560']]);
    assert.deepEqual(out.ownKey, {scene: 'electron', number: 41, trusted: true, ok: true, found: null, failed: [], frontmost: true, focusedWindow: 'none', mainWindow: 'run'});
    // A scene whose process the run launched is read at its frontmost window, the one a cell acts in (a second window
    // ⌘N opened, say), not the recorded one; Finder, a process the run did not launch, at the recorded window only.
    const second = {...electronWindow(rect(160, 120, 720, 560)), number: 44};
    asked.length = 0;
    assert.equal((await main(['read', '--run', dir, '--key-window', 'electron'], {io: {...io, windows: () => [second, electronWindow(PLACED)]}})).ownKey.number, 44);
    assert.deepEqual(asked, [[501, '160,120,720,560']]);
    writeState(dir, {scenes: {electron: ELECTRON, finder: {pid: 410, window: {number: 21}}}});
    const owner = {ownerPid: 410, layer: 0, number: 22, bounds: rect(0, 0, 400, 300)}, run = {ownerPid: 410, layer: 0, number: 21, bounds: rect(22, 80, 800, 520)};
    assert.equal((await main(['read', '--run', dir, '--key-window', 'finder'], {io: {...io, windows: () => [owner, run]}})).ownKey.number, 21);
    // Not up in this run, or the window list unread: not taken, with why.
    assert.deepEqual((await main(['read', '--run', dir, '--key-window', 'chrome'], {io})).ownKey, {scene: 'chrome', number: null, trusted: null, ok: false, reason: 'the scene is not up in this run'});
    const unread = await main(['read', '--run', dir, '--key-window', 'electron'], {io: {...io, windows: () => { throw new Error('swift exited 1'); }}});
    assert.equal(unread.ownKey.reason, 'the window list was unread');
    assert.equal((await main(['read', '--run', dir], {io})).ownKey, undefined);
  });
});

// The device's own environment on a GitHub-hosted runner, as loopback.sh hands it the sessions.
const HOSTED_DEVICE = {env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'darwin'};
test('place: the scene\'s recorded window moved by the frame probe and read back; a read-back off the frame does not match', async () => {
  await withRun(async dir => {
    const asked = [];
    const probe = back => args => { asked.push(args); return {pid: 501, window: 41, readBack: back, matched: true, exitStatus: 0}; };
    const to = rect(22, 100, 720, 560);
    const out = await main(['place', '--run', dir, '--scene', 'electron', '--frame', '22,100,720,560'], {io: {...HOSTED_DEVICE, probe: probe(to)}});
    assert.deepEqual(out.answer, {requested: to, readBack: to, matched: true, exitStatus: 0});
    assert.deepEqual(asked, [['window-frame', '--pid', '501', '--window', '41', '--frame', '22,100,720,560']]);
    assert.equal((await main(['place', '--run', dir, '--scene', 'electron', '--frame', '22,100,720,560'], {io: {...HOSTED_DEVICE, probe: probe(rect(22, 120, 720, 560))}})).answer.matched, false);
    await assert.rejects(main(['place', '--run', dir, '--scene', 'chrome', '--frame', '0,0,1,1'], {io: {...HOSTED_DEVICE, probe: probe(to)}}), /names no scene/);
    await assert.rejects(main(['place', '--run', dir, '--scene', 'electron', '--frame', '0,0'], {io: {...HOSTED_DEVICE, probe: probe(to)}}), /x,y,w,h/);
    // The Open panel: its window found by number on screen, the service's pid from the list, moved by the harness's own
    // AX helper, never the engine's frame probe (./panel-device.test.mjs has the rest).
    asked.length = 0;
    let at = rect(300, 100, 800, 500);
    const screen = () => ({windows: [{ownerPid: 12, ownerName: 'Open and Save Panel Service', ownerBundleId: null, layer: 0, number: 77, name: null, bounds: at}]});
    const panelAx = args => { at = rect(679, 100, 800, 500); return {trusted: true, found: true, size: 0, position: 0, readBack: at, args}; };
    const panel = await main(['place', '--run', dir, '--scene', 'openPanel', '--window', '77', '--frame', '679,100,800,500'], {io: {...HOSTED_DEVICE, probe: probe(to), screen, panelAx}});
    assert.deepEqual([panel.answer.readBack, panel.answer.matched, panel.answer.pid], [rect(679, 100, 800, 500), true, 12]);
    assert.deepEqual(asked, [], 'the engine\'s frame probe is not asked for a panel');
    await assert.rejects(main(['place', '--run', dir, '--scene', 'openPanel', '--window', '78', '--frame', '0,0,1,1'], {io: {...HOSTED_DEVICE, probe: probe(to), screen, panelAx}}), /no panel window/);
    // Off a GitHub-hosted runner (the mini's session) the move is refused before anything is read or asked of the probe.
    for (const off of [{env: {}, platform: 'darwin'}, {env: HOSTED_DEVICE.env, platform: 'linux'}]) {
      const refused = await main(['place', '--run', dir, '--scene', 'electron', '--frame', '22,100,720,560'],
        {io: {...off, probe: () => assert.fail('the probe is not asked'), screen: () => assert.fail('nothing read'), state: () => assert.fail('nothing read')}});
      assert.deepEqual(refused.answer, {requested: to, readBack: null, matched: false, exitStatus: null, refused: MOVE_REFUSED_OFF_HOSTED});
    }
  });
});

// The production default: an io with no `env` reads process.env, so the variable is set (or unset) there and restored.
async function withRunnerEnvironment(value, body) {
  const before = process.env.RUNNER_ENVIRONMENT;
  if (value === undefined) delete process.env.RUNNER_ENVIRONMENT; else process.env.RUNNER_ENVIRONMENT = value;
  try { return await body(); } finally { if (before === undefined) delete process.env.RUNNER_ENVIRONMENT; else process.env.RUNNER_ENVIRONMENT = before; }
}
test('place with no env in its io reads the process\'s RUNNER_ENVIRONMENT: refused without it, moved with it', async () => {
  await withRun(async dir => {
    const to = rect(22, 100, 720, 560), args = ['place', '--run', dir, '--scene', 'electron', '--frame', '22,100,720,560'];
    const off = await withRunnerEnvironment(undefined, () => main(args, {io: {platform: 'darwin', probe: () => assert.fail('the probe is not asked'), state: () => assert.fail('nothing read')}}));
    assert.equal(off.answer.refused, MOVE_REFUSED_OFF_HOSTED);
    const on = await withRunnerEnvironment('github-hosted', () => main(args, {io: {platform: 'darwin', probe: () => ({readBack: to, matched: true, exitStatus: 0})}}));
    assert.deepEqual(on.answer, {requested: to, readBack: to, matched: true, exitStatus: 0});
  });
});
