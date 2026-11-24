// The matrix's device side (scripts/native-matrix/matrix-device.mjs), against doubles: the oracle's reading kept to the
// run's own processes with the watcher's liveness, the focus probe only on a window the run owns, the alert watch, a
// launch identified and journaled at once and quit only while it is the same process, and the compiled readers.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {alerts, compiled, documentState, executablePaths, fieldFrame, focusedText, deviceLoad, isWatcher, launchIntent, ownedFocus, PROBE_FILE, probeFinish, probeStart, quitLaunched, read, recordLaunch, settleLaunches, source, WINDOWLESS, windowlessUp} from '../../scripts/native-matrix/matrix-device.mjs';

// A GitHub-hosted runner's environment, where the input source may be written (ruling 1188); the owner's Mac's.
const HOSTED = {env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'darwin'}, OWNERS_MAC = {env: {}, platform: 'darwin'};

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
});

test('ownedFocus: why the named window was not the focused one, recorded for the run\'s own window only', () => {
  const named = {pid: 7, bounds: {x: 820, y: 261, width: 920, height: 492}};
  // Hold 2a: the probe read no focused application at all (every background row, every user app, both engines).
  assert.deepEqual(ownedFocus({focusedApp: null, focusedWindow: null, named: false, valueHash: null, accessibility: true}, [7], named),
    {appOwned: false, appPid: null, named: false, valueHash: null,
      unnamed: {accessibility: true, appRead: false, appNamed: false, windowRead: false, windowNamed: false, deltas: null}});
  // The named app focused, its focused window off by a few points: the per-axis deltas, focused minus named.
  const off = ownedFocus({focusedApp: {pid: 7, bundleId: 'com.apple.finder'}, focusedWindow: {pid: 7, bounds: {x: 820, y: 261, width: 920, height: 520}},
    named: false, valueHash: null, accessibility: true}, [7], named);
  assert.deepEqual(off.unnamed, {accessibility: true, appRead: true, appNamed: true, windowRead: true, windowNamed: true, deltas: {x: 0, y: 0, width: 0, height: 28}});
  // Another app focused: whether it was the named one, never its pid or its window's bounds.
  const other = ownedFocus({focusedApp: {pid: 99, bundleId: 'com.example.other'}, focusedWindow: {pid: 99, bounds: {x: 1, y: 2, width: 3, height: 4}},
    named: false, valueHash: null, accessibility: true}, [7], named);
  assert.deepEqual(other, {appOwned: false, appPid: null, named: false, valueHash: null,
    unnamed: {accessibility: true, appRead: true, appNamed: false, windowRead: true, windowNamed: false, deltas: null}});
  assert.ok(!JSON.stringify(other).includes('99') && !JSON.stringify(other).includes('other'), 'nothing of another app leaves');
  // The probe without its own Accessibility grant says so; a named window records no reason.
  assert.equal(ownedFocus({focusedApp: null, named: false, accessibility: false}, [7], named).unnamed.accessibility, false);
  assert.equal(ownedFocus({focusedApp: {pid: 7}, focusedWindow: {pid: 7, bounds: named.bounds}, named: true, valueHash: null}, [7], named).unnamed, undefined);
  // read() hands the probe's window to it.
  const io = {state: () => state, launched: () => [], watcherRuns: () => true, frontWindow: () => ({at: 5, frontmost: null, topWindow: null}),
    probe: () => ({focusedApp: null, focusedWindow: null, named: false, valueHash: null, accessibility: true})};
  assert.equal(read({focus: '7,820,261,920,492'}, io).focus.unnamed.appRead, false);
  assert.equal(isWatcher([{pid: 5, command: '/A/cua Engine.app/Contents/MacOS/cua-engine'}], 5), false);
});

test('read: an unowned top window records only whether the engine under test owns it, never its pid, number or bounds', () => {
  const home = '/Users/o/Library/Application Support/cua-spike-vendor', roots = {approvedRuntime: home, approvedEngine: '/A/cua Engine.app'};
  const paths = {500: `${home}/runtimes/1.2/Codex Computer Use.app/Contents/MacOS/ChatGPT Computer Use`, 600: '/Applications/Mail.app/Contents/MacOS/Mail', 700: `${home}-old/x`};
  const asked = [];
  const ioOf = ownerPid => ({state: () => state, launched: () => [], watcherRuns: () => false, enginePids: () => [],
    executablePaths: pids => { asked.push(pids); return new Map(pids.filter(p => paths[p]).map(p => [p, paths[p]])); },
    frontWindow: () => ({at: 5, frontmost: {pid: ownerPid, bundleId: 'x'}, topWindow: {ownerPid, number: 9, bounds: {x: 1510, y: 611, width: 126, height: 126}, onScreen: true}})});
  const top = (pid, given = roots) => read({...given}, ioOf(pid)).reading.topWindow;
  assert.deepEqual(top(500), {ownerPid: null, number: null, bounds: null, owned: false, engine: true});
  assert.deepEqual(top(600), {ownerPid: null, number: null, bounds: null, owned: false, engine: false});
  assert.equal(top(700).engine, false, 'a sibling directory is not the engine');
  assert.equal(top(800).engine, null, 'an unresolved owner is unknown');
  assert.equal(top(500, {}).engine, null, 'no roots given, unknown');
  asked.length = 0;
  assert.equal(Object.hasOwn(top(7), 'engine'), false, 'the run\'s own top window is unchanged');
  assert.deepEqual(asked, [], 'and not resolved');
});

test('read: the reading\'s `at` covers what it covered at 38ecfa07, and the engine-ownership lookup runs after it closes and after the focus probe', () => {
  // A clock that ticks on every read, and every io call logged with the clock at that moment.
  let t = 0;
  const realNow = Date.now;
  Date.now = () => ++t;
  const calls = [];
  const log = (name, value) => { calls.push({name, t}); return value; };
  const io = {state: () => log('state', state), launched: () => log('launched', []), watcherRuns: () => log('watcherRuns', true), enginePids: () => log('enginePids', []),
    frontWindow: () => log('frontWindow', {at: 5, frontmost: {pid: 500, bundleId: 'x'}, topWindow: {ownerPid: 500, number: 9, bounds, onScreen: true}}),
    probe: () => log('probe', {focusedApp: {pid: 7}, named: false}),
    executablePaths: pids => log('executablePaths', new Map(pids.map(p => [p, '/A/cua Engine.app/Contents/MacOS/x'])))};
  let r;
  try { r = read({focus: '7,0,25,900,700', watcher: 900, approvedEngine: '/A/cua Engine.app'}, io); } finally { Date.now = realNow; }
  assert.deepEqual(calls.map(c => c.name), ['enginePids', 'state', 'launched', 'frontWindow', 'watcherRuns', 'probe', 'executablePaths'],
    'the engine\'s pids are read before the reading opens; the focus probe follows the window read as at 38ecfa07; the ownership lookup comes last');
  assert.ok(calls[0].t < r.at[0], 'the engine\'s pids are read before `at` opens');
  const inside = calls.filter(c => c.name !== 'executablePaths' && c.name !== 'enginePids');
  assert.ok(inside.every(c => c.t >= r.at[0] && c.t < r.at[1]), 'the reading\'s own calls are inside `at`');
  assert.ok(calls.at(-1).t >= r.at[1], 'the lookup runs after `at` closes');
  assert.equal(r.reading.topWindow.engine, true, 'its answer is still recorded');
  assert.equal(r.reading.topWindow.ownerPid, null, 'never the pid');
});

// The agent cursor (#235): the approved engine's panel is a display-wide layer-0 window of its own, ordered above the
// window it acts in; the oracle's front reading passes over the windows of the processes running from the approved
// engine's bundle, as the keystroke probe's gate and the composition guard do, so it is never the oracle's front window.
test('read: the approved engine\'s cursor window is passed over; without the engine\'s pids it would be the front window', () => {
  const cursor = {ownerPid: 31, number: 990, bounds: {x: 0, y: 0, width: 1512, height: 982}, onScreen: true};
  const user = {ownerPid: 7, number: 3, bounds, onScreen: true};
  const asked = [];
  const ioWith = pids => ({state: () => state, launched: () => [], watcherRuns: () => true,
    enginePids: roots => { asked.push(roots); return pids; },
    executablePaths: list => new Map(list.map(p => [p, '/A/cua Engine.app/Contents/MacOS/cua-engine'])),
    frontWindow: ({skipPids = []} = {}) => ({at: 5, frontmost: {pid: 7, bundleId: 'com.apple.finder'}, topWindow: skipPids.includes(31) ? user : cursor})});
  const skipped = read({approvedEngine: '/A/cua Engine.app'}, ioWith([31]));
  assert.deepEqual(skipped.reading.topWindow, {ownerPid: 7, number: 3, bounds, owned: true}, 'the user\'s window, as if no cursor were there');
  assert.deepEqual(asked, [['/A/cua Engine.app']]);
  const unskipped = read({approvedEngine: '/A/cua Engine.app'}, ioWith([]));
  assert.deepEqual(unskipped.reading.topWindow, {ownerPid: null, number: null, bounds: null, owned: false, engine: true}, 'not running from the bundle: not skipped');
  asked.length = 0;
  assert.deepEqual(read({}, ioWith([31])).reading.topWindow.owned, false, 'no approved engine named: nothing skipped');
  assert.deepEqual(asked, [], 'and no lookup');
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
    // The window server answered no list (./system-windows.swift's null): unread, never a screen free of alerts.
    windows = null;
    assert.throws(() => alerts('check', io), /could not be read/);
    assert.throws(() => alerts('baseline', io), /could not be read/);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('the alert watch leaves out the engine under test: a window whose owner runs from the approved runtime or engine bundle', () => {
  const dir = tmp();
  const home = '/Users/o/Library/Application Support/cua-spike-vendor', bundle = '/Users/o/Library/Application Support/cua/engine/cua Engine.app';
  const paths = {
    500: `${home}/runtimes/1.2/node_modules/@oai/sky/Codex Computer Use.app/Contents/MacOS/ChatGPT Computer Use`,
    501: `${bundle}/Contents/MacOS/cua-engine`,
    502: `${home}-old/runtimes/1.2/Codex Computer Use.app/Contents/MacOS/ChatGPT Computer Use`,
    503: `${bundle}x/Contents/MacOS/cua-engine`,
  };
  const asked = [];
  try {
    let windows = [{number: 1, ownerPid: 99, ownerName: 'Dock', layer: 20}];
    const io = {dir, windows: () => windows, state: () => state, launched: () => [], executablePaths: pids => { asked.push(pids); return new Map(pids.filter(p => paths[p]).map(p => [p, paths[p]])); }};
    alerts('baseline', io);
    const roots = {approvedRuntime: home, approvedEngine: bundle};
    windows = [...windows, {number: 2, ownerPid: 500, ownerName: 'ChatGPT Computer Use', layer: 0}, {number: 3, ownerPid: 501, ownerName: 'cua-engine', layer: 0}, {number: 4, ownerPid: 11, layer: 0}];
    assert.equal(alerts('check', io, roots).abort, false, 'the engine\'s own overlay is not an alert');
    assert.ok(asked.at(-1).includes(500) && !asked.at(-1).includes(11), 'only owners outside the run are resolved');
    assert.equal(alerts('check', io).abort, true, 'with no roots given, nothing is left out');
    for (const pid of [502, 503, 504]) {
      const flagged = alerts('check', {...io, windows: () => [...windows, {number: 9, ownerPid: pid, ownerName: 'X', layer: 0}]}, roots);
      assert.equal(flagged.abort, true, `pid ${pid}: a sibling path or an unresolved pid stays flagged`);
      assert.deepEqual(flagged.export.unknown, {count: 1, windows: [{layer: 0, isAlertProcess: false}]});
    }
    // An alert process stays an alert whatever else runs.
    assert.equal(alerts('check', {...io, windows: () => [...windows, {number: 10, ownerPid: 300, ownerBundleId: 'com.apple.UserNotificationCenter', layer: 8}]}, roots).abort, true);
    // A hosted run holds replayd's capture alert (rulings 1136/1141) and reports it.
    const hosted = alerts('check', {...io, windows: () => [...windows, {number: 10, ownerPid: 300, ownerBundleId: 'com.apple.UserNotificationCenter', layer: 8}]}, {...roots, hosted: true});
    assert.equal(hosted.abort, false);
    assert.equal(hosted.export.held.count, 1);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('executable paths come from ps, a vanished pid simply absent', () => {
  const out = executablePaths([1, 731, 99999], {exec: (cmd, args) => { assert.equal(cmd, '/bin/ps'); assert.deepEqual(args, ['-o', 'pid=,comm=', '-p', '1,731,99999']);
    return '    1 /sbin/launchd\n  731 /System/Library/CoreServices/Dock.app/Contents/MacOS/Dock\n'; }});
  assert.deepEqual([...out], [[1, '/sbin/launchd'], [731, '/System/Library/CoreServices/Dock.app/Contents/MacOS/Dock']]);
  assert.deepEqual([...executablePaths([], {exec: () => assert.fail('no ps for no pids')})], []);
  const failing = executablePaths([5], {exec: () => { const e = new Error('exit 1'); e.stdout = '    5 /a b/c\n'; throw e; }});
  assert.deepEqual([...failing], [[5, '/a b/c']]);
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
    const io = {dir, state: () => state, launched: () => [], now: () => 1_000_000, ...HOSTED,
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
    // Acceptance 3's witness types a run-owned file's name (dashes inside it), never something the probe could read as a flag.
    assert.throws(() => probeStart({kind: 'keystroke', window: '11,0,25,900,700', text: '--at', lead: 3000}, io), /text/);
    assert.throws(() => probeStart({kind: 'focus', lead: 3000}, io), /keystroke or input-source/);
    assert.equal(launched.length, 4, 'nothing launched on a refusal');
    probeStart({kind: 'keystroke', window: '11,0,25,900,700', text: 'scene-file-007', lead: 1500}, io);
    assert.equal(launched[4].at(-1), 'scene-file-007');
    probeFinish(io);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('source: the owner\'s source and preference saved before the first switch (the live harness\'s record), a selection read back, the per-context preference written and read, the restore kept for the put-back', async () => {
  const calls = [];
  // MAWS B2's regime: the selection reads back as current while the keyboard layout stays ABC (the probe's `layout`).
  let perContext = false, current = 'com.apple.keylayout.ABC';
  const layout = 'com.apple.keylayout.ABC';
  const io = {probe: args => { calls.push(args.join(' ')); if (args[1] === 'current') return {id: current, layout}; current = args[1]; return {selected: true, current: {id: current, layout}}; },
    readPerContext: () => perContext, writePerContext: value => { perContext = value; }, ...HOSTED,
    saveInput: () => ({kept: false, saved: {source: {id: 'com.apple.keylayout.ABC'}, perContext: false}}), restoreInput: async ({keep}) => ({keep, sourceRestored: true, perContextRestored: true})};
  assert.deepEqual(await source('state', {}, io), {writable: true, current: 'com.apple.keylayout.ABC', layout: 'com.apple.keylayout.ABC', perContext: false, venueMissing: []});
  assert.deepEqual((await source('state', {}, {...io, venueInputMissing: () => ['com.apple.inputmethod.Korean.2SetKorean']})).venueMissing, ['com.apple.inputmethod.Korean.2SetKorean'], 'the sources the runner could not enable (ruling 1189)');
  assert.deepEqual(await source('save', {}, io), {kept: false, saved: {source: 'com.apple.keylayout.ABC', perContext: false}});
  assert.deepEqual(await source('select', {id: 'com.apple.inputmethod.Korean.2SetKorean'}, io),
    {selected: true, current: 'com.apple.inputmethod.Korean.2SetKorean', layout: 'com.apple.keylayout.ABC'}, 'the layout read beside the source');
  assert.deepEqual(await source('current', {}, io), {current: 'com.apple.inputmethod.Korean.2SetKorean', layout: 'com.apple.keylayout.ABC'});
  assert.deepEqual(await source('per-context', {value: 'on'}, io), {perContext: true});
  assert.deepEqual(await source('restore', {}, io), {keep: true, sourceRestored: true, perContextRestored: true}, 'the record stays for the put-back to verify');
  await assert.rejects(() => source('select', {id: 'not an id'}, io), /source id/);
  await assert.rejects(() => source('per-context', {value: 'maybe'}, io), /on or off/);
  // An earlier probe that may still act (the device's journal, ./live-device.mjs probeBarrier): no selection behind it.
  await assert.rejects(() => source('select', {id: 'com.apple.keylayout.ABC'}, {...io, probeStuck: () => 'the probe input-source#a is still running'}), /may still act: the probe input-source#a/);
});

// Ruling 1188: off a GitHub-hosted runner the device says so and reads the owner's values; every write is refused
// before the probe, defaults or the record is touched.
test('source and probe off a hosted runner: state reads the owner\'s values and says no write; save, select, per-context and a scheduled switch are refused untouched', async () => {
  const dir = tmp();
  try {
    const touched = [];
    const io = {dir, state: () => state, launched: () => [], now: () => 1_000_000, ...OWNERS_MAC,
      probe: args => { if (args[1] !== 'current') touched.push(args.join(' ')); return {id: 'com.apple.keylayout.US', layout: 'com.apple.keylayout.US'}; },
      readPerContext: () => null, writePerContext: value => touched.push(`write ${value}`), saveInput: () => touched.push('save'),
      restoreInput: async () => ({sourceRestored: true, perContextRestored: true}), probeLaunch: args => touched.push(args.join(' '))};
    const read = await source('state', {}, io);
    assert.deepEqual({...read, refused: undefined}, {writable: false, refused: undefined, current: 'com.apple.keylayout.US', layout: 'com.apple.keylayout.US', perContext: null, venueMissing: []});
    assert.match(read.refused, /ruling 1188/);
    await assert.rejects(() => source('save', {}, io), /source save: refused: .*ruling 1188/);
    await assert.rejects(() => source('select', {id: 'com.apple.keylayout.ABC'}, io), /source select: refused/);
    await assert.rejects(() => source('per-context', {value: 'off'}, io), /source per-context: refused/);
    assert.throws(() => probeStart({kind: 'input-source', id: 'com.apple.inputmethod.Korean.2SetKorean', lead: 1500}, io), /probe input-source: refused/);
    assert.deepEqual(touched, []);
    assert.equal(fs.existsSync(join(dir, PROBE_FILE)), false);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('a probe whose await is stuck keeps its handle, marked; nothing starts while the journal shows it running, and it is dropped once it has exited', () => {
  const dir = tmp();
  try {
    let running = 'the probe input-source#a is still running';
    const launched = [];
    const io = {dir, state: () => state, launched: () => [], now: () => 1_000_000, probeStuck: () => running, ...HOSTED,
      probeLaunch: args => { launched.push(args); return {command: args[0], label: 'input-source#a', pid: 901, start: 'T', scratch: '/tmp/s', out: '/tmp/s/out.json', launchedAt: 1_000_000}; },
      probeAwait: () => { throw Object.assign(new Error('the input-source probe (pid 901) did not exit after SIGKILL'), {stuck: true}); }};
    running = null;
    probeStart({kind: 'input-source', id: 'com.apple.inputmethod.Korean.2SetKorean', lead: 1500}, io);
    running = 'the probe input-source#a is still running';
    assert.throws(() => probeFinish(io), /did not exit after SIGKILL/);
    const kept = JSON.parse(fs.readFileSync(join(dir, PROBE_FILE), 'utf8'));
    assert.match(kept.stuck, /did not exit after SIGKILL/, 'the stuck handle stays on the device for the next command');
    assert.throws(() => probeStart({kind: 'keystroke', window: '11,0,25,900,700', text: 'qz', lead: 3000}, io), /may still act: the probe input-source#a/);
    assert.equal(launched.length, 1);
    running = null;
    probeStart({kind: 'keystroke', window: '11,0,25,900,700', text: 'qz', lead: 3000}, io);
    assert.equal(launched.length, 2, 'once the journal shows it exited, the stuck handle is dropped');
    // An await that failed otherwise (the probe stopped): the handle goes.
    const plain = {...io, probeAwait: () => { throw new Error('the keystroke probe did not finish within 60 s; its process was stopped'); }};
    assert.throws(() => probeFinish(plain), /its process was stopped/);
    assert.ok(!fs.existsSync(join(dir, PROBE_FILE)));
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('load: the Mac\'s load averages, uptime and core count, nothing else', () => {
  assert.deepEqual(deviceLoad({loadavg: () => [2.345, 1.5, 0.75], uptime: () => 86_400.6, cpus: () => 10}), {loadavg: [2.35, 1.5, 0.75], uptimeS: 86_401, cpus: 10});
  const real = deviceLoad();
  assert.equal(real.loadavg.length, 3);
  assert.ok(Number.isInteger(real.uptimeS) && Number.isInteger(real.cpus));
});

test('Electron\'s accessibility mode: a read given --electron-mode returns the fixture record\'s latest mode and time, after the reading\'s window; the export returns the whole record, sanitized', async () => {
  const {electronModeRecord, main} = await import('../../scripts/native-matrix/matrix-device.mjs');
  const record = '{"at":10,"enabled":false,"source":"start"}\nnot json\n{"at":25,"enabled":true,"source":"event","extra":"x"}\n';
  const io = {state: () => state, launched: () => [], watcherRuns: () => true, electronRecord: () => record,
    frontWindow: () => ({at: 5, frontmost: {pid: 7, bundleId: 'com.apple.finder'}, topWindow: {ownerPid: 7, number: 3, bounds, onScreen: true}})};
  assert.deepEqual(read({watcher: 900, electronMode: true}, io).electronMode, {enabled: true, at: 25});
  assert.equal('electronMode' in read({watcher: 900}, io), false, 'only when asked');
  assert.equal(read({electronMode: true}, {...io, electronRecord: () => null}).electronMode, null, 'no record: null');
  assert.deepEqual(electronModeRecord(io), {records: [{at: 10, enabled: false, source: 'start'}, {at: 25, enabled: true, source: 'event'}]});
  assert.deepEqual(electronModeRecord({...io, electronRecord: () => null}), {records: null});
  // The CLI reads the record from the Electron scene's user-data directory in the run's scene state.
  const {writeState} = await import('../../scripts/repl-parity/scenes-mac.mjs');
  const {FIXTURE_ACCESSIBILITY_FILE} = await import('../../scripts/native-matrix/fixtures/electron-fixture.mjs');
  const dir = fs.realpathSync(tmp());
  try {
    const userDataDir = join(dir, 'electron-user-data');
    fs.mkdirSync(userDataDir);
    fs.writeFileSync(join(userDataDir, FIXTURE_ACCESSIBILITY_FILE), record);
    writeState(dir, {scenes: {electron: {pid: 12, userDataDir}}});
    assert.deepEqual((await main(['electron-mode', '--run', dir])).records.map(r => r.at), [10, 25]);
    writeState(dir, {scenes: {}});
    assert.deepEqual(await main(['electron-mode', '--run', dir]), {records: null}, 'the scene is down: nothing to read');
    await assert.rejects(main(['read', '--run', dir, '--electron-mode', 'yes']), /--electron-mode latest/);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

// T10b′ (the M5 wave-1 record): the front/key readings (./front-key.mjs's contract) and the window order (#485).
test('read: front and key as bundle ids when asked, the key from the focus probe (the --focus one reused), and nothing else of another app', () => {
  const probed = [];
  const io = {state: () => state, launched: () => [], watcherRuns: () => true,
    frontWindow: () => ({at: 5, frontmost: {pid: 99, bundleId: 'com.apple.UserNotificationCenter'}, topWindow: {ownerPid: 7, number: 3, bounds, onScreen: true}}),
    probe: args => { probed.push(args); return {focusedApp: {pid: 98, bundleId: 'com.example.key'}, focusedWindow: {pid: 98, bounds}, named: false, valueHash: null}; }};
  const r = read({watcher: 900, frontKey: true}, io);
  assert.deepEqual(r.frontKey, {front: 'com.apple.UserNotificationCenter', key: 'com.example.key'});
  assert.deepEqual(probed, [['focus']], 'one focus probe, naming no window');
  assert.doesNotMatch(JSON.stringify(r.frontKey), /98|99/, 'bundle ids only, never a pid');
  probed.length = 0;
  const both = read({watcher: 900, frontKey: true, focus: '7,0,25,900,700'}, io);
  assert.deepEqual(probed, [['focus', '--window', '7,0,25,900,700']], 'the --focus probe\'s report serves the key too');
  assert.equal(both.frontKey.key, 'com.example.key');
  assert.equal('frontKey' in read({watcher: 900}, io), false, 'only when asked');
  // Unreadable: null, never a guess.
  const blind = read({frontKey: true}, {...io, frontWindow: () => ({at: 5, frontmost: null, topWindow: null}), probe: () => ({focusedApp: null})});
  assert.deepEqual(blind.frontKey, {front: null, key: null});
  assert.deepEqual(read({frontKey: true}, {...io, probe: () => { throw new Error('probe failed'); }}).frontKey.key, null, 'a failed probe reads nothing');
});

test('read: the window order front to back, the run\'s own windows by pid and number, any other by bundle id and layer only, the engine\'s own passed over', () => {
  const windows = [
    {ownerPid: 99, ownerName: 'Notification Center', ownerBundleId: 'com.apple.UserNotificationCenter', layer: 8, number: 501, name: 'secret', bounds},
    {ownerPid: 50, ownerName: 'cua Engine', ownerBundleId: 'io.github.ssfskim.cua.engine', layer: 1000, number: 502, name: null, bounds},
    {ownerPid: 7, ownerName: 'Finder', ownerBundleId: 'com.apple.finder', layer: 0, number: 3, name: 'run', bounds},
    {ownerPid: 11, ownerName: 'TextEdit', ownerBundleId: 'com.apple.TextEdit', layer: 0, number: 4, name: 'doc', bounds},
    {ownerPid: 98, ownerName: 'Other', ownerBundleId: 'com.example.other', layer: 0, number: 600, name: 'mine', bounds},
  ];
  const io = {state: () => state, launched: () => [], watcherRuns: () => true, windows: () => windows, enginePids: () => [50],
    frontWindow: () => ({at: 5, frontmost: {pid: 7, bundleId: 'com.apple.finder'}, topWindow: {ownerPid: 7, number: 3, bounds, onScreen: true}})};
  const r = read({windowOrder: true, approvedEngine: '/A/cua Engine.app'}, io);
  assert.deepEqual(r.windowOrder, [
    {owned: false, bundleId: 'com.apple.UserNotificationCenter', layer: 8},
    {owned: true, pid: 7, number: 3, bundleId: 'com.apple.finder', layer: 0},
    {owned: true, pid: 11, number: 4, bundleId: 'com.apple.TextEdit', layer: 0},
    {owned: false, bundleId: 'com.example.other', layer: 0},
  ]);
  assert.doesNotMatch(JSON.stringify(r.windowOrder), /secret|mine|Notification Center|501|600|98|99/, 'nothing of another app\'s window but its bundle id and layer');
  assert.equal('windowOrder' in read({}, io), false, 'only when asked');
  // The window server answered no list (./system-windows.swift's null): the order stays unread, never an empty screen.
  assert.equal(read({windowOrder: true}, {...io, windows: () => null}).windowOrder, null);
  assert.deepEqual(read({windowOrder: true}, {...io, windows: () => []}).windowOrder, [], 'an empty list read is a reading');
});

test('system-windows.swift answers an unread list as null, not as an empty screen', () => {
  const swift = fs.readFileSync(new URL('../../scripts/native-matrix/system-windows.swift', import.meta.url), 'utf8');
  assert.doesNotMatch(swift, /as\? \[\[String: Any\]\]\) \?\? \[\]/, 'no failed read turned into []');
  assert.match(swift, /"windows": windows\.map \{ \$0 as Any \} \?\? NSNull\(\)/);
});

test('the activate step\'s own check: front and key read after the scene\'s activation, a few times while the key lags, bundle ids only', async () => {
  const {activationCheck, main} = await import('../../scripts/native-matrix/matrix-device.mjs');
  let reads = 0;
  const slept = [];
  const io = {frontWindow: () => ({at: 5, frontmost: {pid: 11, bundleId: 'com.apple.TextEdit'}, topWindow: null}),
    probe: () => ({focusedApp: {pid: 11, bundleId: ++reads < 3 ? 'com.apple.UserNotificationCenter' : 'com.apple.TextEdit'}}), sleep: ms => { slept.push(ms); }};
  assert.deepEqual(await activationCheck('com.apple.TextEdit', io), {front: 'com.apple.TextEdit', key: 'com.apple.TextEdit'});
  assert.equal(reads, 3, 'read again until the key followed the front');
  reads = -100;
  assert.deepEqual(await activationCheck('com.apple.TextEdit', io), {front: 'com.apple.TextEdit', key: 'com.apple.UserNotificationCenter'}, 'bounded: what the last read showed');
  // The CLI: `step activate <scene>` answers the scenes command's answer, the check beside it, inside the step's window.
  const dir = fs.realpathSync(tmp());
  try {
    reads = 10;
    const out = await main(['step', 'activate', 'textedit', '--run', dir], {io: {...io, scenes: async args => ({scene: args[1], ok: true})}});
    assert.deepEqual(out.answer, {scene: 'textedit', ok: true});
    assert.deepEqual(out.frontKey, {front: 'com.apple.TextEdit', key: 'com.apple.TextEdit'});
    assert.ok(out.at[0] <= out.at[1]);
    // Fix wave I5: the scenes command is handed the engine under test's pids by both roots, as `read` skips them, and the
    // harness's raise.
    let handed = null;
    const raiseWindow = () => ({raised: 0});
    await main(['step', 'activate', 'textedit', '--top-window', 'yes', '--run', dir, '--approved-runtime', '/R', '--approved-engine', '/E'],
      {io: {...io, raiseWindow, enginePids: bundles => (bundles.join() === '/R,/E' ? [900, 901] : []), scenes: async (args, extra) => { handed = extra; return {scene: args[1], ok: true}; }}});
    assert.deepEqual([handed.enginePids(), handed.raiseWindow], [[900, 901], raiseWindow]);
    const down = await main(['step', 'down', 'textedit', '--run', dir], {io: {...io, scenes: async () => ({down: true})}});
    assert.equal('frontKey' in down, false, 'only an activation is checked');
    await assert.rejects(main(['read', '--run', dir, '--with', 'front-key,titles']), /--with/);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

// The matrix's adapter builds the same argv (re-review of 671c8f5bb): #212's save sheet is read through its parent only
// when the sheet's bounds reach ax-state.
test('the matrix device forwards the sheet\'s bounds to ax-state window: the argv it builds', async () => {
  const {axStateOf} = await import('../../scripts/native-matrix/matrix-device.mjs');
  const ran = [];
  const axState = axStateOf('/run', {compile: (script, dir) => `${dir}/${script.split('/').at(-1)}.bin`, exec: (path, args) => { ran.push([path, ...args]); return '{"trusted":true}'; }});
  axState(600, '262,127,603,505', '323,149,480,300');
  axState(600, '262,127,603,505');
  assert.deepEqual(ran, [['/run/ax-state.swift.bin', 'window', '600', '262,127,603,505', '323,149,480,300'], ['/run/ax-state.swift.bin', 'window', '600', '262,127,603,505']]);
});

// Ruling 1219 (h3): the front-window read passes over the engine under test's own windows on either lane alike: cua's
// engine bundle and the vendor's runtime home (its overlay and helper, com.openai.sky.CUAService /
// SkyComputerUseService), as the alert watch does. Every window passed over is recorded (bundle, number, layer), and the
// top window the read names (its bundle and number, its owner's pid for the run's own or on a hosted runner).
test('read: the vendor\'s overlay is passed over as cua\'s cursor is; each skip and the top window named are recorded', () => {
  const overlay = {ownerPid: 41, number: 77, bundleId: 'com.openai.sky.CUAService', layer: 0};
  const user = {ownerPid: 7, number: 3, bounds, onScreen: true};
  const asked = [];
  const io = (env = {RUNNER_ENVIRONMENT: 'github-hosted'}) => ({state: () => state, launched: () => [], watcherRuns: () => true, env, platform: 'darwin',
    enginePids: roots => { asked.push(roots); return [41]; },
    executablePaths: list => new Map(list.map(p => [p, '/R/runtime/SkyComputerUseService'])),
    frontWindow: ({skipPids = []} = {}) => (skipPids.includes(41)
      ? {at: 5, frontmost: {pid: 7, bundleId: 'com.apple.finder'}, topWindow: user, topBundleId: 'com.apple.finder', skipped: [overlay]}
      : {at: 5, frontmost: {pid: 7, bundleId: 'com.apple.finder'}, topWindow: {ownerPid: 41, number: 77, bounds, onScreen: true}, topBundleId: 'com.openai.sky.CUAService', skipped: []})});
  const r = read({approvedRuntime: '/R', approvedEngine: '/A/cua Engine.app'}, io());
  assert.deepEqual(asked, [['/R', '/A/cua Engine.app']], 'both roots of the engine under test, as the alert watch reads them');
  assert.deepEqual(r.reading.topWindow, {ownerPid: 7, number: 3, bounds, owned: true});
  assert.deepEqual(r.frontWindow, {top: {owned: true, bundleId: 'com.apple.finder', number: 3, ownerPid: 7, layer: 0},
    skipped: [{bundleId: 'com.openai.sky.CUAService', number: 77, layer: 0}]});
  // Another app's top window: named by its bundle; its number and pid only on a hosted runner, never on an owner's Mac.
  const unowned = {...io(), enginePids: () => []};
  assert.deepEqual(read({approvedRuntime: '/R'}, unowned).frontWindow, {top: {owned: false, bundleId: 'com.openai.sky.CUAService', number: 77, ownerPid: 41, layer: 0}, skipped: []});
  assert.deepEqual(read({approvedRuntime: '/R'}, {...unowned, env: {}}).frontWindow, {top: {owned: false, bundleId: 'com.openai.sky.CUAService', number: null, ownerPid: null, layer: 0}, skipped: []});
});

// Ruling 1221 (F2): #212's unsaved proof reads TextEdit's own window through Accessibility (ax-state document), never a
// folder: whether a document on disk is behind it and whether its edits are unsaved.
test('document: the window the run opened read by Accessibility at its bounds, booleans only; not taken when it is not on screen', () => {
  const asked = [];
  const windows = [{ownerPid: 11, number: 70, layer: 0, bounds}, {ownerPid: 11, number: 71, layer: 0, bounds: {x: 40, y: 60, width: 500, height: 400}}];
  const io = {state: () => state, windows: () => windows,
    axDocument: (pid, rect) => { asked.push([pid, rect]); return {trusted: true, ok: true, failed: [], found: true, document: false, edited: true, editedFrom: 'window'}; }};
  assert.deepEqual(documentState({scene: 'textedit', window: '71'}, io), {ok: true, number: 71, found: true, document: false, edited: true, editedFrom: 'window'});
  assert.deepEqual(asked, [[11, '40,60,500,400']]);
  assert.deepEqual(documentState({scene: 'textedit', window: '72'}, io), {ok: false, number: 72, reason: 'window 72 is not on screen'});
  const saved = {...io, axDocument: () => ({trusted: true, ok: true, failed: [], found: true, document: true, edited: false, editedFrom: 'window'})};
  assert.deepEqual(documentState({scene: 'textedit', window: '70'}, saved), {ok: true, number: 70, found: true, document: true, edited: false, editedFrom: 'window'});
  const unread = {...io, axDocument: () => ({trusted: true, ok: false, failed: ['edited'], found: true, document: false, edited: null, editedFrom: null})};
  assert.deepEqual(documentState({scene: 'textedit', window: '70'}, unread), {ok: false, number: 70, found: true, document: false, edited: null, editedFrom: null, reason: 'a read failed: edited'});
  assert.deepEqual(documentState({scene: 'textedit', window: '70'}, {...io, axDocument: () => ({trusted: false})}), {ok: false, number: 70, reason: 'the reader is not trusted for Accessibility'});
  // Fix wave M1: two windows at the bounds (the saved scene document's among them) leave the read unread, never a "saved".
  const twin = {...io, axDocument: () => ({trusted: true, ok: false, failed: ['ambiguous'], found: true, atBounds: 2, document: null, edited: null, editedFrom: null})};
  assert.deepEqual(documentState({scene: 'textedit', window: '70'}, twin), {ok: false, number: 70, found: true, document: null, edited: null, editedFrom: null,
    reason: 'Accessibility lists 2 windows at its bounds: which one is the run\'s cannot be told'});
  assert.throws(() => documentState({scene: 'textedit', window: 'x'}, io), /--window/);
});

// #590 (ruling 1223, R5 ii): right after a typeUnconfirmed the harness reads the scene's focused text element itself
// (ax-state text), outside either engine: its role, character count and selected range, each read that
// failed named with its AXError. Numbers and a role only.
test('focused-text: the scene\'s focused text element read by the harness, each failed read with its AXError', () => {
  const asked = [];
  const io = {state: () => state, axText: pid => { asked.push(pid); return {trusted: true, ok: true, failed: [], errors: {}, role: 'AXTextArea', frame: null, characters: 44, selected: {location: 44, length: 0}, bounds: []}; }};
  assert.deepEqual(focusedText({scene: 'textedit'}, io), {ok: true, role: 'AXTextArea', characters: 44, selected: {location: 44, length: 0}, failed: [], errors: {}});
  assert.deepEqual(asked, [11]);
  const failed = {...io, axText: () => ({trusted: true, ok: false, failed: ['selected'], errors: {selected: -25212}, role: 'AXTextArea', characters: 44, selected: null})};
  assert.deepEqual(focusedText({scene: 'textedit'}, failed), {ok: false, role: 'AXTextArea', characters: 44, selected: null, failed: ['selected'], errors: {selected: -25212}});
  assert.deepEqual(focusedText({scene: 'textedit'}, {...io, axText: () => ({trusted: false})}), {ok: false, reason: 'the reader is not trusted for Accessibility'});
  assert.deepEqual(focusedText({scene: 'textedit'}, {...io, axText: () => { throw new Error('the reader did not run'); }}), {ok: false, reason: 'the reader did not run'});
  assert.deepEqual(focusedText({scene: 'finder'}, {...io, state: () => ({scenes: {}})}), {ok: false, reason: 'the scene is not up in this run'});
});

// Ruling 1226: Chrome's drag grounds its points on its notes field's own frame, read by Accessibility outside either
// engine (ax-state field): the one element of the role in the scene's window, its frame in that window's points.
test('field-frame: the one element of a role in the scene\'s window, its frame in window points; unread when it is not exactly one', () => {
  const asked = [];
  const chromeState = {scenes: {chrome: {pid: 31, window: {number: 90}}}};
  const windows = [{ownerPid: 31, number: 90, layer: 0, bounds: {x: 22, y: 60, width: 800, height: 760}}];
  const answer = over => ({trusted: true, ok: true, failed: [], found: true, count: 1, walked: 140, frame: {x: 38, y: 247, width: 444, height: 126}, ...over});
  const io = (over = {}) => ({state: () => chromeState, windows: () => windows, axField: (pid, rect, role) => { asked.push([pid, rect, role]); return answer(over); }});
  assert.deepEqual(fieldFrame({scene: 'chrome', role: 'AXTextArea'}, io()), {ok: true, window: {width: 800, height: 760}, field: {x: 16, y: 187, width: 444, height: 126}});
  assert.deepEqual(asked, [[31, '22,60,800,760', 'AXTextArea']]);
  const reason = over => fieldFrame({scene: 'chrome', role: 'AXTextArea'}, io(over)).reason;
  assert.equal(reason({count: 2}), 'Accessibility lists 2 elements of role AXTextArea in the window: which one is the field cannot be told');
  assert.equal(reason({count: 0, frame: null}), 'Accessibility lists no element of role AXTextArea in the window');
  assert.equal(reason({found: false, ok: false, count: 0, frame: null}), 'Accessibility lists no window at its bounds');
  assert.equal(reason({ok: false, failed: ['frame'], frame: null}), 'a read failed: frame');
  assert.equal(fieldFrame({scene: 'chrome', role: 'AXTextArea'}, {...io(), axField: () => ({trusted: false})}).reason, 'the reader is not trusted for Accessibility');
  assert.equal(fieldFrame({scene: 'chrome', role: 'AXTextArea'}, {...io(), windows: () => []}).reason, 'window 90 is not on screen');
  assert.equal(fieldFrame({scene: 'electron', role: 'AXTextArea'}, io()).reason, 'the scene is not up in this run');
  assert.throws(() => fieldFrame({scene: 'chrome', role: 'textarea'}, io()), /--role takes an AX role/);
});
