// The shared guard's device side (scripts/hosted-sittings/guard-device.mjs): the fresh reading a sitting asks for before
// a pointer event, a key or a capture, and the frame probe that places a window, all with doubles.
import assert from 'node:assert/strict';
import test from 'node:test';
import {guardCause} from '../../scripts/hosted-sittings/alert-guard.mjs';
import {main, parseTarget} from '../../scripts/hosted-sittings/guard-device.mjs';

const UNC = 'com.apple.UserNotificationCenter';
const rect = (x, y, width, height) => ({x, y, width, height});
const alert = {ownerPid: 77, ownerName: 'UserNotificationCenter', ownerBundleId: UNC, layer: 8, number: 90, name: null, bounds: rect(382, 118, 260, 348)};
const textedit = (number, bounds) => ({ownerPid: 600, ownerName: 'TextEdit', ownerBundleId: 'com.apple.TextEdit', layer: 0, number, name: 'Untitled', bounds});
const screen = {windows: [alert, textedit(7, rect(79, 31, 627, 677))], displays: [rect(0, 0, 1920, 1080)]};
const io = (extra = {}) => ({screen: () => screen, frontmost: () => ({pid: 600, bundleId: 'com.apple.TextEdit'}),
  focus: () => ({focusedApp: {pid: 600, bundleId: 'com.apple.TextEdit'}, focusedWindow: {pid: 600, bounds: rect(79, 31, 627, 677)}}), ...extra});

test('a target: scene, pid, and for a shared process its one window', () => {
  assert.deepEqual(parseTarget('textedit:600'), {scene: 'textedit', pid: 600, number: null, only: false});
  assert.deepEqual(parseTarget('finder:410:21:only'), {scene: 'finder', pid: 410, number: 21, only: true});
  assert.throws(() => parseTarget('textedit'), /--target/);
  assert.throws(() => parseTarget('textedit:x'), /--target/);
});

test('read: the alerts and the target\'s windows, the front, and with --key the key and its window; the guard refuses from it', async () => {
  const out = await main(['read', '--target', 'textedit:600', '--key'], {io: io()});
  assert.deepEqual(out.bounds.alerts, [{number: 90, layer: 8, bounds: alert.bounds}]);
  assert.deepEqual(out.bounds.windows, [{scene: 'textedit', number: 7, recorded: false, bounds: rect(79, 31, 627, 677)}]);
  assert.equal(out.front, 'com.apple.TextEdit');
  assert.equal(out.key, 'com.apple.TextEdit');
  assert.deepEqual(out.keyWindow, {owned: true, bounds: rect(79, 31, 627, 677)});
  assert.ok(Array.isArray(out.at) && out.at.length === 2);
  assert.ok(!JSON.stringify(out).includes('Untitled'), 'no title leaves the device');
  assert.equal(guardCause(out.bounds, out, {scenes: ['textedit']}).category, 'alert');
  // Without --key no focus probe runs; a key window not the target's is named by its owner's bundle only.
  let probed = 0;
  const bare = await main(['read', '--target', 'textedit:600'], {io: io({focus: () => { probed++; return null; }})});
  assert.equal(probed, 0);
  assert.equal(bare.key, null);
  const foreign = await main(['read', '--target', 'textedit:600', '--key'], {io: io({focus: () => ({focusedApp: {pid: 77, bundleId: UNC}, focusedWindow: {pid: 77, bounds: alert.bounds}})})});
  assert.deepEqual([foreign.key, foreign.keyWindow], [UNC, {owned: false}]);
});

// The key-window requirement: with --key-window the reading adds the first target's own key window (ax-state.swift window
// on the scene window: the recorded one, else the target's frontmost on-screen window), read outside either engine.
test('read --key-window: the target app\'s own focused and main windows against its scene window; unread when it cannot be read', async () => {
  const asked = [];
  const axState = (pid, bounds) => { asked.push([pid, bounds]); return {trusted: true, ok: true, frontmost: true, found: true, focused: true, main: true, focusedWindow: 'run', mainWindow: 'run', windows: 1, failed: []}; };
  const out = await main(['read', '--target', 'textedit:600', '--key-window'], {io: io({axState})});
  assert.deepEqual(asked, [[600, '79,31,627,677']]);
  assert.deepEqual(out.ownKey, {scene: 'textedit', number: 7, trusted: true, ok: true, frontmost: true, focusedWindow: 'run', mainWindow: 'run'});
  // A recorded window is the one read, whatever is in front of it.
  const finder = {ownerPid: 410, ownerName: 'Finder', ownerBundleId: 'com.apple.finder', layer: 0, number: 21, name: 'x', bounds: rect(22, 80, 800, 520)};
  const two = io({axState, screen: () => ({...screen, windows: [{...finder, number: 22, bounds: rect(0, 0, 400, 300)}, finder]})});
  asked.length = 0;
  assert.equal((await main(['read', '--target', 'finder:410:21:only', '--key-window'], {io: two})).ownKey.number, 21);
  assert.deepEqual(asked, [[410, '22,80,800,520']]);
  // No --key-window: no reading taken. The scene window not on screen, an untrusted reader or a failed read: unread.
  assert.equal((await main(['read', '--target', 'textedit:600'], {io: io({axState: () => assert.fail('not asked')})})).ownKey, undefined);
  const gone = await main(['read', '--target', 'textedit:999', '--key-window'], {io: io({axState})});
  assert.deepEqual(gone.ownKey, {scene: 'textedit', number: null, trusted: null, ok: false, reason: 'the scene window is not on screen'});
  assert.deepEqual((await main(['read', '--target', 'textedit:600', '--key-window'], {io: io({axState: () => ({trusted: false})})})).ownKey,
    {scene: 'textedit', number: 7, trusted: false, ok: false, frontmost: null, focusedWindow: null, mainWindow: null});
  assert.equal((await main(['read', '--target', 'textedit:600', '--key-window'], {io: io({axState: () => { throw new Error('swiftc failed'); }})})).ownKey.ok, false);
});

test('read: an unread screen is unread bounds, an unread front or key is null, never a clear screen', async () => {
  const out = await main(['read', '--target', 'textedit:600', '--key'], {io: io({screen: () => { throw new Error('swift exited 1'); }, frontmost: () => null, focus: () => { throw new Error('no engine'); }})});
  assert.equal(out.bounds, null);
  assert.equal(out.front, null);
  assert.equal(out.key, null);
  assert.equal(guardCause(out.bounds, out).category, 'unread');
});

test('place: the target\'s window or the Open panel\'s moved by the frame probe and read back; any other window refused', async () => {
  const asked = [];
  const placeIo = io({screen: () => ({...screen, windows: [...screen.windows, {ownerPid: 12, ownerName: 'Open and Save Panel Service', ownerBundleId: null, layer: 0, number: 55, name: null, bounds: rect(300, 150, 800, 500)}]}),
    frameProbe: args => { asked.push(args); const f = args.at(-1).split(',').map(Number); return {readBack: {x: f[0], y: f[1], width: f[2], height: f[3]}, matched: true, exitStatus: 0}; }});
  const out = await main(['place', '--pid', '600', '--window', '7', '--frame', '700,31,627,677'], {io: placeIo});
  assert.deepEqual(out, {requested: rect(700, 31, 627, 677), readBack: rect(700, 31, 627, 677), matched: true, exitStatus: 0, pid: 600});
  assert.deepEqual(asked[0], ['window-frame', '--pid', '600', '--window', '7', '--frame', '700,31,627,677']);
  const panel = await main(['place', '--panel', '--window', '55', '--frame', '1000,150,800,500'], {io: placeIo});
  assert.equal(panel.pid, 12);
  await assert.rejects(main(['place', '--pid', '600', '--window', '90', '--frame', '0,0,1,1'], {io: placeIo}), /not a window of pid 600/);
  await assert.rejects(main(['place', '--panel', '--window', '7', '--frame', '0,0,1,1'], {io: placeIo}), /no Open panel window/);
  // A read-back off the frame does not match.
  const off = await main(['place', '--pid', '600', '--window', '7', '--frame', '700,31,627,677'], {io: io({frameProbe: () => ({readBack: rect(690, 31, 627, 677), matched: true, exitStatus: 0})})});
  assert.equal(off.matched, false);
});
