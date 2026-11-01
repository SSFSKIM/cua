// The matrix's device side (scripts/native-matrix/matrix-device.mjs), against doubles: the oracle's reading kept to the
// run's own processes with the watcher's liveness, the focus probe only on a window the run owns, the alert watch, a
// launch identified and journaled at once and quit only while it is the same process, and the compiled readers.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {alerts, compiled, executablePaths, deviceLoad, isWatcher, launchIntent, ownedFocus, PROBE_FILE, probeFinish, probeStart, quitLaunched, read, recordLaunch, settleLaunches, source, WINDOWLESS, windowlessUp} from '../../scripts/native-matrix/matrix-device.mjs';

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
  // MAWS B2's regime: the selection reads back as current while the keyboard layout stays ABC (the probe's `layout`).
  let perContext = false, current = 'com.apple.keylayout.ABC';
  const layout = 'com.apple.keylayout.ABC';
  const io = {probe: args => { calls.push(args.join(' ')); if (args[1] === 'current') return {id: current, layout}; current = args[1]; return {selected: true, current: {id: current, layout}}; },
    readPerContext: () => perContext, writePerContext: value => { perContext = value; },
    saveInput: () => ({kept: false, saved: {source: {id: 'com.apple.keylayout.ABC'}, perContext: false}}), restoreInput: async ({keep}) => ({keep, sourceRestored: true, perContextRestored: true})};
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

test('a probe whose await is stuck keeps its handle, marked; nothing starts while the journal shows it running, and it is dropped once it has exited', () => {
  const dir = tmp();
  try {
    let running = 'the probe input-source#a is still running';
    const launched = [];
    const io = {dir, state: () => state, launched: () => [], now: () => 1_000_000, probeStuck: () => running,
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
