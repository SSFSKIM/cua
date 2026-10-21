// The matrix's device side (scripts/native-matrix/matrix-device.mjs), against doubles: the oracle's reading kept to the
// run's own processes, the focus probe only on a window the run owns, and a launch-path app brought down only when the
// run launched it (not recorded by the scenes, launched since the row began).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {launched, ownedFocus, read} from '../../scripts/native-matrix/matrix-device.mjs';

const state = {scenes: {textedit: {pid: 11}, finder: {pid: 7}}};
const bounds = {x: 0, y: 25, width: 900, height: 700};

test('read: the run\'s own pids and bounds, another app by bundle id only; the focus probe only on an owned window', () => {
  const probed = [];
  const io = {state: () => state, frontWindow: () => ({at: 5, frontmost: {pid: 7, bundleId: 'com.apple.finder'}, topWindow: {ownerPid: 7, number: 3, bounds, onScreen: true}}),
    probe: args => { probed.push(args); return {focusedApp: {pid: 7, bundleId: 'com.apple.finder'}, focusedWindow: {pid: 7, bounds}, named: true, valueHash: null}; }};
  assert.deepEqual(read({}, io), {reading: {at: 5, frontmost: {pid: 7, bundleId: 'com.apple.finder', owned: true}, topWindow: {ownerPid: 7, number: 3, bounds, owned: true}}});
  assert.deepEqual(probed, []);
  assert.deepEqual(read({focus: '7,0,25,900,700'}, io).focus, {appOwned: true, appPid: 7, named: true});
  assert.deepEqual(probed, [['focus', '--window', '7,0,25,900,700']]);
  assert.throws(() => read({focus: '99,0,25,900,700'}, io), /does not own/);
  assert.throws(() => read({focus: '7,0,25'}, io), /pid,x,y,w,h/);
  assert.deepEqual(ownedFocus({focusedApp: {pid: 99}, named: false}, [7]), {appOwned: false, appPid: null, named: false});
});

test('launched: only an unrecorded process of the scene\'s app that started since the row began is quit', async () => {
  const quitting = [];
  const io = {state: () => state, runningApps: () => [{pid: 11}, {pid: 40}, {pid: 41}], launchOf: pid => (pid === 40 ? 10_000 : 2_000),
    quit: async pids => { quitting.push(...pids); return {quit: pids, remaining: []}; }};
  assert.deepEqual(await launched({scene: 'textedit', since: 9_500}, io), {found: 1, quit: 1, remaining: 0});
  assert.deepEqual(quitting, [40], 'the recorded scene process and an older one are left alone');
  assert.deepEqual(await launched({scene: 'electron', since: 20_000}, io), {found: 0, quit: 0, remaining: 0});
  await assert.rejects(launched({scene: 'finder', since: 1}, io), /covers textedit and electron/);
  await assert.rejects(launched({scene: 'chrome', since: 1}, io), /not chrome/);
});
