// The matrix's device side (scripts/native-matrix/matrix-device.mjs), against doubles: the oracle's reading kept to the
// run's own processes with the watcher's liveness, the focus probe only on a window the run owns, the alert watch, a
// launch identified and journaled at once and quit only while it is the same process, and the compiled readers.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {alerts, compiled, isWatcher, launchIntent, ownedFocus, PROBE_FILE, probeFinish, probeStart, quitLaunched, read, recordLaunch, settleLaunches, source, WINDOWLESS, windowlessUp} from '../../scripts/native-matrix/matrix-device.mjs';

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
  assert.deepEqual(read({focus: '40,0,25,900,700', watcher: 900}, io).focus, {appOwned: true, appPid: 7, named: true, valueHash: null}, 'a journaled launch is the run\'s own');
  assert.deepEqual(probed, [['focus', '--window', '40,0,25,900,700']]);
  assert.throws(() => read({focus: '99,0,25,900,700'}, io), /does not own/);
  assert.throws(() => read({focus: '7,0,25'}, io), /pid,x,y,w,h/);
  assert.deepEqual(ownedFocus({focusedApp: {pid: 99}, named: false}, [7]), {appOwned: false, appPid: null, named: false, valueHash: null});
  // The value's hash leaves only for the named window, which read() allows only when it is the run's own.
  assert.deepEqual(ownedFocus({focusedApp: {pid: 7}, named: true, valueHash: 'ab'.repeat(32)}, [7]).valueHash, 'ab'.repeat(32));
  assert.equal(ownedFocus({focusedApp: {pid: 7}, named: false, valueHash: 'ab'.repeat(32)}, [7]).valueHash, null, 'never another window\'s');
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
  assert.deepEqual(recordLaunch({scene: 'electron', since: 9_500}, io), {recorded: true, pid: 40, candidates: 1});
  assert.deepEqual(j.list, [{scene: 'electron', bundleId: 'io.github.ssfskim.cua.fixture.electron', pid: 40, at: 10_000}]);
  assert.deepEqual(recordLaunch({scene: 'electron', since: 9_500}, io), {recorded: false, pid: null, candidates: 0}, 'the journaled one is not new');
  assert.throws(() => recordLaunch({scene: 'textedit', since: 1}, io), /not textedit/);
  // The pid now runs another process (another start time): never signalled.
  starts[40] = 20_000;
  assert.deepEqual(await quitLaunched(io), {quit: 0, remaining: 0, gone: 1, pending: 0});
  assert.deepEqual(quitting, []);
  assert.deepEqual(j.list, []);
  starts[40] = 10_000;
  j.writeLaunched([{scene: 'electron', bundleId: 'io.github.ssfskim.cua.fixture.electron', pid: 40, at: 10_000}]);
  assert.deepEqual(await quitLaunched(io), {quit: 1, remaining: 0, gone: 0, pending: 0});
  assert.deepEqual(quitting, [40]);
  assert.deepEqual(j.list, []);
});

test('a launch\'s intent is journaled before the act; a controller that died after it leaves recovery the new process only', async () => {
  const j = journal();
  const quitting = [];
  // The fixture's instances: 30 (before the intent, the snapshot), then 40 (started after it), and 41 started before it
  // that the snapshot missed (never the run's).
  let running = [{pid: 30}];
  const starts = {30: 1_000, 40: 10_000, 41: 8_000};
  const io = {state: () => ({scenes: {}}), ...j, runningApps: () => running, launchOf: pid => starts[pid] ?? null, now: () => 9_500,
    quit: async pids => { quitting.push(...pids); return {quit: pids, remaining: []}; }};
  assert.deepEqual(launchIntent({scene: 'electron'}, io), {at: 9_500, pids: [30]});
  assert.deepEqual(j.list, [{intent: true, scene: 'electron', bundleId: 'io.github.ssfskim.cua.fixture.electron', at: 9_500, pids: [30]}]);
  assert.throws(() => launchIntent({scene: 'textedit'}, io), /not textedit/);
  // The controller died: no record. The engine had launched 40. The intent stays until the settle.
  running = [{pid: 30}, {pid: 40}, {pid: 41}];
  assert.deepEqual(await quitLaunched(io), {quit: 1, remaining: 0, gone: 0, pending: 1});
  assert.deepEqual(quitting, [40]);
  assert.deepEqual(j.list.map(l => l.intent === true), [true]);
  j.writeLaunched([]);
  // The controller survived: the record replaces the intent with the precise identity.
  quitting.length = 0;
  running = [{pid: 30}];
  launchIntent({scene: 'electron'}, io);
  running = [{pid: 30}, {pid: 40}];
  assert.deepEqual(recordLaunch({scene: 'electron', since: 9_500}, io), {recorded: true, pid: 40, candidates: 1});
  assert.deepEqual(j.list, [{scene: 'electron', bundleId: 'io.github.ssfskim.cua.fixture.electron', pid: 40, at: 10_000}]);
  assert.deepEqual(await quitLaunched(io), {quit: 1, remaining: 0, gone: 0, pending: 0});
  assert.deepEqual(quitting, [40]);
});

test('a controller that died before the launched app appeared: the intent outlives every quit until the work is stopped and settled', async () => {
  const j = journal();
  const quitting = [];
  let running = [{pid: 30}];
  let t = 9_500;
  const starts = {30: 1_000, 40: 10_000};
  const io = {state: () => ({scenes: {}}), ...j, runningApps: () => running, launchOf: pid => starts[pid] ?? null, now: () => t, sleep: async ms => { t += ms; },
    quit: async pids => { quitting.push(...pids); running = running.filter(p => !pids.includes(p.pid)); return {quit: pids, remaining: []}; }};
  launchIntent({scene: 'electron'}, io);
  // Before the recovery: nothing launched yet, and the intent stays.
  assert.deepEqual(await quitLaunched(io), {quit: 0, remaining: 0, gone: 0, pending: 1});
  assert.equal(j.list.filter(l => l.intent).length, 1);
  // The in-flight request launches it afterwards; the next quit (or the settle) still finds it.
  running = [{pid: 30}, {pid: 40}];
  assert.deepEqual(await quitLaunched(io), {quit: 1, remaining: 0, gone: 0, pending: 1});
  assert.deepEqual(quitting, [40]);
  // With the work stopped, the settle waits for quiet and only then clears the intent.
  assert.deepEqual(await settleLaunches({quietMs: 2_000, maxMs: 10_000}, io), {quit: 0, remaining: 0, pending: 0, waitedMs: 2_000});
  assert.deepEqual(j.list, []);
});

test('the settle quits what appears while it waits, and keeps an intent it could not see settle within its bound', async () => {
  const j = journal();
  let running = [], appeared = false;
  let t = 9_500;
  // The in-flight launch appears once, a second into the settle.
  const io = {state: () => ({scenes: {}}), ...j, runningApps: () => running, launchOf: pid => (pid === 41 ? t : ({40: 10_000})[pid] ?? null), now: () => t,
    sleep: async ms => { t += ms; if (t >= 10_500 && !appeared) { appeared = true; running = [{pid: 40}]; } },
    quit: async pids => { running = running.filter(p => !pids.includes(p.pid)); return {quit: pids, remaining: []}; }};
  launchIntent({scene: 'electron'}, io);
  const settled = await settleLaunches({quietMs: 2_000, maxMs: 10_000}, io);
  assert.equal(settled.quit, 1, 'the late launch was quit');
  assert.equal(settled.pending, 0);
  // A launch that keeps reappearing (each time a new process) never reaches quiet: the intent stays for the next cleanup.
  launchIntent({scene: 'electron'}, io);
  io.sleep = async ms => { t += ms; running = [{pid: 41}]; };
  const busy = await settleLaunches({quietMs: 2_000, maxMs: 3_000}, io);
  assert.equal(busy.pending, 1);
  assert.equal(j.list.filter(l => l.intent).length, 1);
  // Nothing journaled: nothing to wait for.
  const empty = journal();
  assert.deepEqual(await settleLaunches({}, {...io, ...empty}), {quit: 0, remaining: 0, pending: 0, waitedMs: 0});
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

test('probe start and finish: a scheduled keystroke or switch launched on the run\'s own window and awaited in a second command; one at a time', () => {
  const dir = tmp();
  try {
    const launched = [], awaited = [];
    const io = {dir, state: () => state, launched: () => [], now: () => 1_000_000,
      probeLaunch: args => { launched.push(args); return {command: args[0], label: 'x', pid: 901, start: 'T', scratch: '/tmp/s', out: '/tmp/s/out.json', launchedAt: 1_000_000}; },
      probeAwait: handle => { awaited.push(handle.pid); return {pid: 901, postedAt: 1_003_001, units: 2, chars: 2, mode: 'typed', layout: 'com.apple.keylayout.ABC', presses: []}; }};
    const started = probeStart({kind: 'keystroke', window: '11,0,25,900,700', text: 'qz', lead: 3000}, io);
    assert.equal(started.scheduled, 1_003_000);
    assert.deepEqual(launched[0], ['keystroke', '--user-pid', '11', '--user-bounds', '0,25,900,700', '--at', '1003000', 'qz']);
    assert.ok(fs.existsSync(join(dir, PROBE_FILE)));
    assert.throws(() => probeStart({kind: 'keystroke', window: '11,0,25,900,700', text: 'qz', lead: 3000}, io), /a probe is already pending/);
    // A handle past the probe's bound (a run that died before its finish) is dropped, not a refusal.
    const later = {...io, now: () => 1_000_000 + 61_000};
    assert.equal(probeStart({kind: 'keystroke', window: '11,0,25,900,700', text: 'qz', lead: 3000}, later).scheduled, 1_064_000);
    assert.deepEqual(probeFinish(io).answer.postedAt, 1_003_001);
    assert.deepEqual(awaited, [901]);
    assert.ok(!fs.existsSync(join(dir, PROBE_FILE)), 'the handle goes once awaited');
    assert.throws(() => probeFinish(io), /no probe is pending/);
    probeStart({kind: 'keystroke', window: '11,0,25,900,700', text: 'r', lead: 3000, mode: 'ansiKeys'}, io);
    assert.deepEqual(launched[2].slice(0, 2), ['keystroke', '--ansi-keys']);
    probeFinish(io);
    probeStart({kind: 'input-source', id: 'com.apple.inputmethod.Korean.2SetKorean', lead: 1500}, io);
    assert.deepEqual(launched[3], ['input-source', 'com.apple.inputmethod.Korean.2SetKorean', '--at', '1001500']);
    probeFinish(io);
    assert.throws(() => probeStart({kind: 'keystroke', window: '99,0,25,900,700', text: 'qz', lead: 3000}, io), /does not own/, 'a keystroke is gated only on the run\'s own window');
    assert.throws(() => probeStart({kind: 'keystroke', window: '11,0,25,900,700', text: 'qz', lead: 90_000}, io), /--lead/);
    assert.throws(() => probeStart({kind: 'keystroke', window: '11,0,25,900,700', text: 'q z', lead: 3000}, io), /text/);
    assert.throws(() => probeStart({kind: 'focus', lead: 3000}, io), /keystroke or input-source/);
    assert.equal(launched.length, 4, 'nothing launched on a refusal');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('source: the owner\'s source and preference saved before the first switch (the live harness\'s record), a selection read back, the per-context preference written and read, the restore kept for the put-back', async () => {
  const calls = [];
  let perContext = false, current = 'com.apple.keylayout.ABC';
  const io = {probe: args => { calls.push(args.join(' ')); if (args[1] === 'current') return {id: current}; current = args[1]; return {selected: true, current: {id: current}}; },
    readPerContext: () => perContext, writePerContext: value => { perContext = value; },
    saveInput: () => ({kept: false, saved: {source: {id: 'com.apple.keylayout.ABC'}, perContext: false}}), restoreInput: async ({keep}) => ({keep, sourceRestored: true, perContextRestored: true})};
  assert.deepEqual(await source('save', {}, io), {kept: false, saved: {source: 'com.apple.keylayout.ABC', perContext: false}});
  assert.deepEqual(await source('select', {id: 'com.apple.inputmethod.Korean.2SetKorean'}, io), {selected: true, current: 'com.apple.inputmethod.Korean.2SetKorean'});
  assert.deepEqual(await source('current', {}, io), {current: 'com.apple.inputmethod.Korean.2SetKorean'});
  assert.deepEqual(await source('per-context', {value: 'on'}, io), {perContext: true});
  assert.deepEqual(await source('restore', {}, io), {keep: true, sourceRestored: true, perContextRestored: true}, 'the record stays for the put-back to verify');
  await assert.rejects(() => source('select', {id: 'not an id'}, io), /source id/);
  await assert.rejects(() => source('per-context', {value: 'maybe'}, io), /on or off/);
});
