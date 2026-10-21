// The matrix's device side (scripts/native-matrix/matrix-device.mjs), against doubles: the oracle's reading kept to the
// run's own processes with the watcher's liveness, the focus probe only on a window the run owns, the alert watch, a
// launch identified and journaled at once and quit only while it is the same process, and the compiled readers.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {alerts, compiled, isWatcher, openDocument, ownedFocus, quitLaunched, read, recordLaunch, WINDOWLESS, windowlessUp} from '../../scripts/native-matrix/matrix-device.mjs';

const state = {scenes: {textedit: {pid: 11}, finder: {pid: 7}}};
const bounds = {x: 0, y: 25, width: 900, height: 700};
const tmp = () => fs.mkdtempSync(join(tmpdir(), 'matrix-device-'));
// A journal in memory, as the run directory's file would hold it.
const journal = (list = []) => ({launched: () => list, writeLaunched: next => { list.splice(0, list.length, ...next); }, list});

test('read: the run\'s own pids and bounds, another app by bundle id only, the watcher\'s liveness, the focus probe only on an owned window', () => {
  const probed = [];
  const io = {state: () => state, launched: () => [{pid: 40}], watcherRuns: pid => pid === 900,
    frontWindow: () => ({at: 5, frontmost: {pid: 7, bundleId: 'com.apple.finder'}, topWindow: {ownerPid: 7, number: 3, bounds, onScreen: true}}),
    probe: args => { probed.push(args); return {focusedApp: {pid: 7, bundleId: 'com.apple.finder'}, focusedWindow: {pid: 7, bounds}, named: true, valueHash: null}; }};
  const r = read({watcher: 900}, io);
  assert.deepEqual(r.reading, {at: 5, frontmost: {pid: 7, bundleId: 'com.apple.finder', owned: true}, topWindow: {ownerPid: 7, number: 3, bounds, owned: true}});
  assert.equal(r.watcher, true);
  assert.ok(r.at[0] <= r.at[1]);
  assert.equal(read({watcher: 901}, io).watcher, false, 'a watcher that is gone is not coverage');
  assert.equal(read({}, io).watcher, false, 'no watcher named, no coverage');
  assert.deepEqual(probed, []);
  assert.deepEqual(read({focus: '40,0,25,900,700', watcher: 900}, io).focus, {appOwned: true, appPid: 7, named: true}, 'a journaled launch is the run\'s own');
  assert.deepEqual(probed, [['focus', '--window', '40,0,25,900,700']]);
  assert.throws(() => read({focus: '99,0,25,900,700'}, io), /does not own/);
  assert.throws(() => read({focus: '7,0,25'}, io), /pid,x,y,w,h/);
  assert.deepEqual(ownedFocus({focusedApp: {pid: 99}, named: false}, [7]), {appOwned: false, appPid: null, named: false});
  assert.equal(isWatcher([{pid: 5, command: '/A/cua Engine.app/Contents/MacOS/cua-engine --probe watch-activations'}], 5), true);
  assert.equal(isWatcher([{pid: 5, command: '/A/cua Engine.app/Contents/MacOS/cua-engine'}], 5), false);
});

test('the alert watch: a baseline of window numbers, then an alert process or a new low window aborts, the run\'s own never', () => {
  const dir = tmp();
  try {
    let windows = [{number: 1, ownerPid: 99, ownerName: 'Dock', layer: 20}, {number: 2, ownerPid: 7, layer: 0}];
    const io = {dir, windows: () => windows, state: () => state, launched: () => []};
    assert.throws(() => alerts('check', io), /no alert baseline/);
    assert.deepEqual(alerts('baseline', io), {baseline: 2});
    assert.equal(alerts('check', io).abort, false);
    windows = [...windows, {number: 3, ownerPid: 11, layer: 0, name: 'cua-scene'}];
    assert.equal(alerts('check', io).abort, false, 'a new window of the run\'s own TextEdit');
    windows = [...windows, {number: 4, ownerPid: 300, ownerBundleId: 'com.apple.UserNotificationCenter', name: 'Allow paste?', layer: 8}];
    const flagged = alerts('check', io);
    assert.equal(flagged.abort, true);
    assert.doesNotMatch(JSON.stringify(flagged), /Allow paste/, 'no alert text leaves');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('a launch is identified and journaled at once, and quit only while it is the same process', async () => {
  const j = journal();
  const quitting = [];
  const starts = {11: 2_000, 40: 10_000, 41: 1_000};
  const io = {state: () => state, ...j, runningApps: () => [{pid: 11}, {pid: 40}, {pid: 41}], launchOf: pid => starts[pid] ?? null,
    quit: async pids => { quitting.push(...pids); return {quit: pids, remaining: []}; }};
  assert.deepEqual(recordLaunch({scene: 'textedit', since: 9_500}, io), {recorded: true, pid: 40, candidates: 1});
  assert.deepEqual(j.list, [{scene: 'textedit', bundleId: 'com.apple.TextEdit', pid: 40, at: 10_000}]);
  assert.deepEqual(recordLaunch({scene: 'textedit', since: 9_500}, io), {recorded: false, pid: null, candidates: 0}, 'the journaled one is not new');
  assert.throws(() => recordLaunch({scene: 'chrome', since: 1}, io), /not chrome/);
  // The pid now runs another process (another start time): never signalled.
  starts[40] = 20_000;
  assert.deepEqual(await quitLaunched(io), {quit: 0, remaining: 0, gone: 1});
  assert.deepEqual(quitting, []);
  assert.deepEqual(j.list, []);
  starts[40] = 10_000;
  j.writeLaunched([{scene: 'textedit', bundleId: 'com.apple.TextEdit', pid: 40, at: 10_000}]);
  assert.deepEqual(await quitLaunched(io), {quit: 1, remaining: 0, gone: 0});
  assert.deepEqual(quitting, [40]);
  assert.deepEqual(j.list, []);
});

test('the run\'s document is opened only into the TextEdit the row launched, and only while it is the one running', () => {
  const opened = [];
  const io = (journal, running) => ({launched: () => journal, runningApps: () => running.map(pid => ({pid})), writeDocument: () => '/run/matrix-launch/cua-scene.rtf',
    openDocument: file => opened.push(file)});
  const ours = [{scene: 'textedit', bundleId: 'com.apple.TextEdit', pid: 40, at: 1}];
  assert.deepEqual(openDocument(io(ours, [40])), {opened: true});
  assert.deepEqual(opened, ['/run/matrix-launch/cua-scene.rtf']);
  assert.equal(openDocument(io(ours, [40, 41])).opened, false, 'another TextEdit runs: open would reach either');
  assert.equal(openDocument(io([], [40])).opened, false, 'nothing journaled: not the run\'s launch');
  assert.equal(openDocument(io(ours, [41])).opened, false);
  assert.equal(opened.length, 1);
});

test('the windowless fixture comes up in the background and is journaled; one already running refuses', async () => {
  const j = journal();
  let running = [];
  let t = 1_000;
  const io = {...j, app: () => '/cache/w.app', open: () => { running = [{pid: 77}]; }, runningApps: id => (id === WINDOWLESS.bundleId ? running : []),
    launchOf: () => 1_000, sleep: async () => { t += 100; }, now: () => t};
  assert.deepEqual(await windowlessUp(io), {pid: 77, app: '/cache/w.app'});
  assert.deepEqual(j.list, [{scene: 'windowless', bundleId: WINDOWLESS.bundleId, pid: 77, at: 1_000}]);
  await assert.rejects(windowlessUp(io), /already runs/);
});

test('a Swift reader is compiled once per source and reused', () => {
  const dir = tmp();
  try {
    const script = join(dir, 'reader.swift');
    fs.writeFileSync(script, 'print("{}")');
    const calls = [];
    const exec = (cmd, args) => { calls.push(cmd); fs.writeFileSync(args.at(-1), 'binary'); };
    const first = compiled(script, dir, {exec});
    assert.equal(compiled(script, dir, {exec}), first);
    assert.deepEqual(calls, ['/usr/bin/swiftc']);
    fs.writeFileSync(script, 'print("[]")');
    assert.notEqual(compiled(script, dir, {exec}), first, 'a changed source is compiled again');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});
