// The key-route diagnostic's lane (ruling 1198): scripts/native-matrix/key-route-run.mjs in a matrix run on the run's
// doubles, and its device side (scripts/native-matrix/key-route-device.mjs) on spies. TextEdit's Open panel opened by
// ⌘O under the key guard, the AX half read, the taps started on TextEdit and the panel service, one pressKey("Escape")
// through the lane, the taps stopped, the panel read by the device and cancelled by Accessibility when the Escape did
// not close it; a panel left up stops the run, named. Off a hosted runner the device opens and cancels nothing.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {PANEL_SERVICE} from '../../scripts/hosted-sittings/alert-guard.mjs';
import {runnerRecord} from '../../scripts/hosted-sittings/runner.mjs';
import {buildTapApp, cancelPanel, main as deviceMain, startTap, stopTap, TAP_APP, TAP_BUNDLE_ID, TAP_EXECUTABLE} from '../../scripts/native-matrix/key-route-device.mjs';
import {captureOf, KEY_ROUTE_ESCAPE, refuseKeyRouteOffRunner, tapTargets} from '../../scripts/native-matrix/key-route-run.mjs';
import {resolveCell} from '../../scripts/native-matrix/registry.mjs';
import {planOf, scenesOf} from '../../scripts/native-matrix/run.mjs';
import {args, BUNDLE, runWith} from './run-doubles.mjs';

const TEXTEDIT_PID = 501;
const tagOf = code => /cua-matrix-cell: ([\w.-]+)/.exec(code)?.[1] ?? null;
const AX = {trusted: true, pid: TEXTEDIT_PID, actualPid: 700, cuaKeyboardTarget: TEXTEDIT_PID, staticReadingTarget: 700, chain: [], processes: {700: {bundleId: PANEL_SERVICE}},
  routes: [{route: 'runningApplicationsPanelService', pids: [700], matchesActual: true}]};

// The hosted runner the key-route cell runs on: the controller's environment and the device's own record of the job.
const HOSTED_ENV = {RUNNER_ENVIRONMENT: 'github-hosted', ImageOS: 'macos26', ImageVersion: '1', GITHUB_RUN_ID: '7', GITHUB_RUN_ATTEMPT: '1'};
const RUNNER = runnerRecord(HOSTED_ENV, {install: {home: '/H', release: 'r'}, engine: {bundle: BUNDLE, build: 'b', engineVersion: '0.5.0'}, vm: {id: 'v', platformUuid: 'P', bootedAt: 'B'}});
const TAP_STARTED = {launched: true, ready: true, pid: 41, listenAccess: true, taps: [{label: 'textedit', pid: TEXTEDIT_PID, created: true}]};

// A run of the key-route plan on a hosted runner: `device` answers each key-route device command by its name (a
// function answers by throwing or computing), `escape` the press cell; `env`, `platform` and `runner` the run's venue.
async function keyRouteRun({device = {}, escape = {pressed: true, at: [1, 2], threw: null, closed: false}, open = {opened: true}, env = HOSTED_ENV, platform = 'darwin', runner = RUNNER, ops = {}} = {}) {
  const answers = {read: AX, 'tap start': TAP_STARTED,
    'tap stop': {exited: true, killed: false, why: 'stop', logRead: true, ready: true, rawEvents: [{label: 'textedit', tapPid: TEXTEDIT_PID, target: TEXTEDIT_PID, source: 900, at: 2}]},
    panel: {trusted: true, up: true}, cancel: {found: true, via: 'cancelButton', pressed: 0, closed: true}, ...device};
  const calls = [];
  const answer = name => (typeof answers[name] === 'function' ? answers[name]() : answers[name]);
  const run = await runWith({plan: planOf('key-route'), cellName: 'key-route', calls, env, platform,
    ops: {scenes: (base, a) => (a[0] === 'up' ? {...base(a), pid: TEXTEDIT_PID} : base(a)), preflight: (base, a) => ({...base(a), runner}),
      keyRoute: (base, a) => { base(a); return {answer: answer(a[0] === 'tap' ? `tap ${a[1]}` : a[0]), at: [5, 6]}; }, ...ops},
    cell: code => (tagOf(code) === 'key-route.escape' ? escape : /pressKey\("super\+o"\)/.test(code) ? open : null)});
  return {...run, calls, keyRoute: run.result?.meta.keyRoute, device: run.steps.filter(s => s.startsWith('key-route ')).map(args)};
}

test('off a GitHub-hosted runner the key-route cell refuses before it begins anything on the device or writes any output', async () => {
  for (const venue of [{env: {}}, {env: HOSTED_ENV, platform: 'linux'}]) {
    const live = [];
    await assert.rejects(keyRouteRun({...venue, ops: {live: (base, a) => { live.push(a[0]); return base(a); }}}),
      /the key-route cell: refused: it runs only on a GitHub-hosted (macOS )?runner/);
    assert.deepEqual(live, [], 'no begin');
  }
  // A dry run drives nothing, so it is not refused.
  assert.doesNotThrow(() => refuseKeyRouteOffRunner(planOf('key-route'), {dryRun: true, env: {}, platform: 'darwin'}));
  assert.doesNotThrow(() => refuseKeyRouteOffRunner(planOf('background', {scene: 'textedit', user: 'finder'}), {env: {}, platform: 'darwin'}));
});

test('a hosted controller whose device attests no run of this job brings no scene up and touches no panel', async () => {
  const {result, steps, device} = await keyRouteRun({runner: null});
  assert.equal(result.complete, false);
  assert.ok(result.problems.some(p => /the key-route cell: refused: the device attests no GitHub-hosted run of this job/.test(p)), JSON.stringify(result.problems));
  assert.ok(!steps.some(s => /^scenes .*"up"/.test(s)), 'no scene up');
  assert.deepEqual(device, []);
});

test('the key-route plan brings up TextEdit alone, writes no row, and is a registry cell of the matrix\'s own', async () => {
  const plan = planOf('key-route');
  assert.equal(plan.keyRoute, true);
  assert.equal(plan.id, 'key-route');
  assert.deepEqual(scenesOf(plan), ['textedit']);
  assert.deepEqual((await resolveCell('key-route')).plan, 'key-route');
});

test('the lane: ⌘O under the key guard, the AX half, the taps on TextEdit and the panel service, one Escape, the taps stopped, the panel read and cancelled by AX', async () => {
  const {code, result, keyRoute, device, calls} = await keyRouteRun();
  // Complete, with no row to judge: the cell's verdict is no-verdict and its exit 1 by the matrix's rule; the sitting's
  // step reads `complete` and the meta, never this exit.
  assert.deepEqual([result.complete, result.problems, result.rows, result.verdict, code], [true, [], [], 'no-verdict', 1]);
  assert.deepEqual(device.map(a => a.slice(0, a[0] === 'tap' ? 2 : 1).join(' ')), ['read', 'tap start', 'tap stop', 'panel', 'cancel']);
  assert.deepEqual(device[0], ['read', '--pid', String(TEXTEDIT_PID), '--run', result.meta.runDir]);
  assert.deepEqual(device[1].filter((a, i) => device[1][i - 1] === '--pid'), [`textedit:${TEXTEDIT_PID}`, 'panelService:700']);
  // The Escape went through the lane, between the taps' start and stop, after ⌘O.
  const tags = calls.map(c => (tagOf(c.code) === 'key-route.escape' ? 'escape' : /pressKey\("super\+o"\)/.test(c.code) ? 'open' : null)).filter(Boolean);
  assert.deepEqual(tags, ['open', 'escape']);
  assert.deepEqual(keyRoute.opened, {ok: true});
  assert.deepEqual(keyRoute.ax, AX);
  assert.deepEqual(keyRoute.press, {sent: true, at: [1, 2], threw: null, closedByEngineView: false, route: null});
  assert.deepEqual([keyRoute.after.up, keyRoute.cancel.via, keyRoute.closed, keyRoute.cleanup], [true, 'cancelButton', true, []]);
  assert.equal(keyRoute.tap.stop.rawEvents[0].source, 900);
  // Every device step's window is the harness's, intending no app.
  assert.ok(result.meta.keyRoute && result.complete);
});

test('the panel\'s frame as the AX half found it is handed to the device\'s panel reading and its cancel', async () => {
  const {device} = await keyRouteRun({device: {read: {...AX, panel: {up: true, frame: {x: 22, y: 80, width: 720, height: 440}}}}});
  assert.deepEqual(device.filter(a => ['panel', 'cancel'].includes(a[0])).map(a => a.slice(0, 5)),
    [['panel', '--pid', String(TEXTEDIT_PID), '--frame', '22,80,720,440'], ['cancel', '--pid', String(TEXTEDIT_PID), '--frame', '22,80,720,440']]);
  const {io, calls} = deviceIo();
  await deviceMain(['panel', '--run', '/r', '--pid', '5', '--frame', '22,80,720,440'], {io});
  await deviceMain(['cancel', '--run', '/r', '--pid', '5', '--frame', '22,80,720,440'], {io});
  assert.deepEqual(calls, [['helper', 'panel', '5', '22,80,720,440'], ['helper', 'cancel', '5', '22,80,720,440']]);
  await assert.rejects(deviceMain(['panel', '--run', '/r', '--pid', '5', '--frame', '22,80'], {io}), /--frame needs x,y,w,h/);
});

test('an Escape that closed the panel leaves nothing to cancel', async () => {
  const {keyRoute, device} = await keyRouteRun({device: {panel: {trusted: true, up: false}}, escape: {pressed: true, at: [1, 2], threw: null, closed: true}});
  assert.ok(!device.some(a => a[0] === 'cancel'));
  assert.deepEqual([keyRoute.after.up, keyRoute.cancel, keyRoute.closed, keyRoute.cleanup], [false, null, true, []]);
});

test('a panel the AX cancel did not close is a cleanup failure, named, and stops the run; a tap that did not exit is named too', async () => {
  const {code, result, keyRoute} = await keyRouteRun({device: {cancel: {found: true, via: 'button', pressed: -25204, closed: false},
    'tap stop': {exited: false, killed: true, why: null, rawEvents: []}}});
  assert.equal(code, 1);
  assert.equal(keyRoute.closed, false);
  assert.deepEqual(keyRoute.cleanup, ['the tap app (pid 41) did not exit when stopped', 'TextEdit\'s Open panel stayed up after the AX cancel']);
  assert.ok(result.problems.some(p => /stopped: TextEdit's Open panel is not confirmed closed: TextEdit's Open panel stayed up after the AX cancel/.test(p)), JSON.stringify(result.problems));
});

test('a panel that did not open is recorded; the device still reads it, and nothing is pressed', async () => {
  const {keyRoute, device, calls} = await keyRouteRun({open: {opened: false}, device: {panel: {trusted: true, up: false}}});
  assert.deepEqual(keyRoute.opened, {ok: false, reason: 'the Open panel did not open (not seen)'});
  assert.deepEqual(device.map(a => a[0]), ['panel']);
  assert.ok(!calls.some(c => tagOf(c.code) === 'key-route.escape'));
  assert.deepEqual([keyRoute.press, keyRoute.closed, keyRoute.cleanup], [null, true, []]);
});

test('a panel reading that fails or is unread still gets the AX cancel, and only the cancel\'s own reading closes it', async () => {
  const threw = await keyRouteRun({device: {panel: () => { throw new Error('ssh: timed out'); }}});
  assert.ok(threw.device.some(a => a[0] === 'cancel'));
  // The cancel's own reading confirmed it: the cleanup holds; the failed reading is kept as the reading.
  assert.deepEqual([threw.keyRoute.after, threw.keyRoute.closed, threw.keyRoute.cleanup], [{error: 'the panel reading failed: ssh: timed out'}, true, []]);
  const unread = await keyRouteRun({device: {panel: {trusted: true, up: null, unread: ['windowList']}}});
  assert.ok(unread.device.some(a => a[0] === 'cancel'));
  assert.equal(unread.keyRoute.closed, true);
});

test('a cancel that fails, is refused, or reads the panel unread leaves it unconfirmed: a cleanup failure, named, that stops the run', async () => {
  for (const [cancel, named] of [[() => { throw new Error('ssh: lost'); }, 'the AX cancel failed: ssh: lost'],
    [{closed: false, refused: 'the key-route cancel: refused: x'}, 'the AX cancel was refused: the key-route cancel: refused: x'],
    [{found: true, via: 'cancelButton', pressed: 0, closed: false, unread: ['ax']}, 'TextEdit\'s Open panel is not confirmed gone after the AX cancel (unread: ax)'],
    [{found: false, via: null, pressed: null, closed: false, unread: []}, 'the AX cancel found no panel to cancel, and no reading says it is gone']]) {
    const {code, keyRoute, result} = await keyRouteRun({device: {cancel}});
    assert.equal(code, 1);
    assert.equal(keyRoute.closed, false);
    assert.ok(keyRoute.cleanup.includes(named), JSON.stringify(keyRoute.cleanup));
    assert.ok(result.problems.some(p => /stopped: TextEdit's Open panel is not confirmed closed/.test(p)), JSON.stringify(result.problems));
  }
});

test('the escape cell observes the panel first, presses once, and reports the press\'s own device-clock window', () => {
  assert.equal(tagOf(KEY_ROUTE_ESCAPE), 'key-route.escape');
  assert.equal(KEY_ROUTE_ESCAPE.split('pressKey(').length - 1, 1);
  assert.match(KEY_ROUTE_ESCAPE, /await __app\.pressKey\("Escape"\)/);
  assert.match(KEY_ROUTE_ESCAPE, /if \(!panel\(ax\)\) return \{pressed: false/);
  assert.deepEqual(tapTargets(TEXTEDIT_PID, {...AX, actualPid: 702, routes: [{route: 'runningApplicationsPanelService', pids: [700, 701]}]}),
    [`textedit:${TEXTEDIT_PID}`, 'panelService:700', 'panelService:701', 'actual:702']);
  assert.deepEqual(tapTargets(TEXTEDIT_PID, null), [`textedit:${TEXTEDIT_PID}`]);
});

test('the taps also watch the selected ancestor\'s pid when no other tap covers it', () => {
  assert.deepEqual(tapTargets(TEXTEDIT_PID, {...AX, selectedAncestor: {depth: 3, pid: 703}}), [`textedit:${TEXTEDIT_PID}`, 'panelService:700', 'selected:703']);
  for (const selectedAncestor of [{depth: 3, pid: 700}, {depth: 1, pid: TEXTEDIT_PID}, null, 'unavailable'])
    assert.deepEqual(tapTargets(TEXTEDIT_PID, {...AX, selectedAncestor}), [`textedit:${TEXTEDIT_PID}`, 'panelService:700'], JSON.stringify(selectedAncestor));
  assert.deepEqual(tapTargets(TEXTEDIT_PID, {...AX, actualPid: 702, selectedAncestor: {depth: 2, pid: 702}}), [`textedit:${TEXTEDIT_PID}`, 'panelService:700', 'actual:702']);
});

// The capture: which Escape keyDowns the press's own window owns, and why there are none when there are none.
const STOPPED = {exited: true, killed: false, why: 'stop', logRead: true, ready: true, rawEvents: []};
const PRESS = {sent: true, at: [1_000, 1_010]};
const event = (at, extra = {}) => ({label: 'textedit', tapPid: TEXTEDIT_PID, target: TEXTEDIT_PID, source: 900, at, ...extra});

test('captureOf keeps the events inside the press\'s window apart from the rest, and never prints a pid it could not read as 0', () => {
  const capture = captureOf({start: TAP_STARTED, stop: {...STOPPED, rawEvents: [event(900), event(960), event(1_005, {target: 0, source: -1}), event(1_400), event(1_600)]}}, PRESS);
  assert.equal(capture.state, 'seen');
  assert.deepEqual(capture.window, [950, 1_510]);
  assert.deepEqual(capture.events.map(e => [e.at, e.target, e.source]), [[960, TEXTEDIT_PID, 900], [1_005, 'unavailable', 'unavailable'], [1_400, TEXTEDIT_PID, 900]]);
  assert.deepEqual(capture.unmatched.map(e => e.at), [900, 1_600]);
  assert.deepEqual(capture.failures, []);
});

test('captureOf tells a tap that saw nothing from a tap that failed, and names each failure', () => {
  assert.deepEqual(captureOf({start: TAP_STARTED, stop: {...STOPPED, rawEvents: [event(5_000)]}}, PRESS), {state: 'none', window: [950, 1_510], failures: [], events: [], unmatched: [event(5_000)]});
  const failed = (tap, press = PRESS) => { const c = captureOf(tap, press); assert.equal(c.state, 'failed', JSON.stringify(c)); return c.failures; };
  assert.deepEqual(failed(null), ['no tap was started']);
  assert.deepEqual(failed({start: {launched: false, refused: 'the key-route tap: refused: x'}}), ['the tap was refused: the key-route tap: refused: x']);
  assert.deepEqual(failed({start: {launched: false, reason: 'the tap app is not built'}}), ['the tap did not launch: the tap app is not built']);
  assert.deepEqual(failed({start: {launched: true, ready: false, reason: 'no readiness within 10 s'}, stop: STOPPED}), ['the tap did not report ready: no readiness within 10 s']);
  assert.deepEqual(failed({start: {...TAP_STARTED, listenAccess: false}, stop: STOPPED}), ['the tap app has no Input Monitoring access']);
  assert.deepEqual(failed({start: {...TAP_STARTED, taps: [{label: 'textedit', pid: 5, created: true}, {label: 'panelService', pid: 700, created: false}]}, stop: STOPPED}),
    ['the panelService tap (pid 700) was not created']);
  assert.deepEqual(failed({start: {...TAP_STARTED, taps: []}, stop: STOPPED}), ['the tap app created no tap']);
  assert.deepEqual(failed({start: TAP_STARTED}), ['the tap was not stopped']);
  assert.deepEqual(failed({start: TAP_STARTED, stop: {...STOPPED, logRead: false, ready: false}}), ['the tap\'s log could not be read']);
  assert.deepEqual(failed({start: TAP_STARTED, stop: {...STOPPED, ready: false}}), ['the tap\'s log holds no readiness line']);
  // Its readiness is not enough: the tap must be shown live through the press, by its own stop line ("stop": it was
  // running when told to stop, after the press) or by having to be killed then; one that ended earlier saw nothing.
  assert.deepEqual(failed({start: TAP_STARTED, stop: {...STOPPED, why: 'max-seconds'}}), ['the tap ended at its own bound, not when told to stop: it is not shown live through the press']);
  assert.deepEqual(failed({start: TAP_STARTED, stop: {...STOPPED, why: null}}), ['the tap ended before it was told to stop (its log holds no stop line): it is not shown live through the press']);
  assert.equal(captureOf({start: TAP_STARTED, stop: {...STOPPED, why: null, exited: false, killed: true}}, PRESS).state, 'none', 'running when stopped, so live through the press');
  // No press, no window: every event is unmatched, and the state says so.
  assert.deepEqual(captureOf({start: TAP_STARTED, stop: {...STOPPED, rawEvents: [event(3)]}}, {sent: false, reason: 'x'}),
    {state: 'no-press', window: null, failures: [], events: [], unmatched: [event(3)]});
});

// The device side on spies.
function deviceIo({env = {RUNNER_ENVIRONMENT: 'github-hosted'}, files = {}, alive = () => false, isTap = () => true} = {}) {
  const calls = [];
  return {calls, files, io: {
    env, platform: 'darwin', sleep: async () => {}, now: () => 1_000, nonce: () => 'n0nce',
    helper: a => { calls.push(['helper', ...a]); return {trusted: true, closed: true}; },
    exists: path => { calls.push(['exists', path]); return path === TAP_EXECUTABLE; },
    mkdir: path => calls.push(['mkdir', path]), remove: path => { calls.push(['remove', path]); delete files[path]; },
    // A file never written is unread (null), as the device's own readText answers a read that failed.
    readText: path => files[path] ?? null, writeText: (path, text) => { calls.push(['write', path]); files[path] = text; },
    open: a => { calls.push(['open', ...a]); files[a[a.indexOf('--out') + 1]] = `${JSON.stringify({ready: true, pid: 41, listenAccess: true, taps: [{label: 'textedit', pid: 5, created: true}]})}\n`; },
    alive: pid => { calls.push(['alive', pid]); return alive(pid); }, kill: pid => calls.push(['kill', pid]), isTap: pid => { calls.push(['isTap', pid]); return isTap(pid); },
  }};
}

test('off a hosted runner every device command refuses before it reads, compiles, opens, writes or cancels anything', async () => {
  const {io, calls} = deviceIo({env: {}});
  for (const argv of [['read', '--pid', '5'], ['panel', '--pid', '5'], ['cancel', '--pid', '5'], ['tap', 'start', '--pid', 'textedit:5'], ['tap', 'stop'], ['bogus']]) {
    const out = await deviceMain([...argv, '--run', '/r'], {io});
    assert.match(out.answer.refused, /the key-route device: refused: it runs only on a GitHub-hosted runner/, argv.join(' '));
    assert.equal(out.answer.closed, undefined);
  }
  assert.deepEqual(calls, []);
  // Each hosted-only function checks for itself too (the #560 pattern), whoever calls it.
  assert.match((await startTap({run: '/r', targets: ['textedit:5']}, io)).refused, /the key-route tap: refused/);
  assert.match((await stopTap({run: '/r'}, io)).refused, /the key-route tap: refused/);
  assert.match(cancelPanel(5, io).refused, /the key-route cancel: refused/);
  assert.deepEqual(calls, []);
  assert.throws(() => buildTapApp({env: {}, platform: 'darwin', exec: () => { throw new Error('ran'); }, fsys: {rmSync: () => { throw new Error('wrote'); }}}), /the key-route tap app: refused/);
});

test('tap start admits its own launch: a fresh nonce in the run\'s admission file, written just before the app is opened and handed to it', async () => {
  const {io, calls, files} = deviceIo();
  await startTap({run: '/r', targets: ['textedit:5']}, io);
  const admission = join('/r', 'key-route', 'tap.admission');
  const open = calls.find(c => c[0] === 'open');
  assert.deepEqual(open.slice(open.indexOf('--admission'), open.indexOf('--admission') + 4), ['--admission', admission, '--nonce', 'n0nce']);
  assert.deepEqual(JSON.parse(files[admission]), {nonce: 'n0nce', at: 1_000});
  assert.ok(calls.findIndex(c => c[0] === 'write' && c[1] === admission) < calls.indexOf(open), 'written before the open');
  // The default nonce is random hex, a new one per launch.
  const {defaultIo} = await import('../../scripts/native-matrix/key-route-device.mjs');
  const a = defaultIo('/r').nonce(), b = defaultIo('/r').nonce();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, b);
});

test('tap start launches the tap app through LaunchServices with its targets and waits for its taps; tap stop stops it and keeps only the Escape lines', async () => {
  const {io, calls, files} = deviceIo();
  const start = await startTap({run: '/r', targets: ['textedit:5', 'panelService:700']}, io);
  assert.deepEqual(start, {launched: true, ready: true, pid: 41, listenAccess: true, taps: [{label: 'textedit', pid: 5, created: true}]});
  const open = calls.find(c => c[0] === 'open');
  // The hosted marker handed to the tap's own process through LaunchServices, which it checks first.
  assert.deepEqual(open.slice(1, 8), ['-n', '-g', '--env', 'RUNNER_ENVIRONMENT=github-hosted', '-a', TAP_APP, '--args']);
  assert.deepEqual(open.slice(open.indexOf('--max-seconds'), open.indexOf('--max-seconds') + 6), ['--max-seconds', '120', '--pid', 'textedit:5', '--pid', 'panelService:700']);
  files[join('/r', 'key-route', 'tap.jsonl')] += [{label: 'panelService', tapPid: 700, keycode: 53, target: 700, source: 900, at: 3}, {stopped: true, why: 'stop'}].map(l => JSON.stringify(l)).join('\n');
  const stop = await stopTap({run: '/r'}, io);
  assert.deepEqual(stop, {exited: true, killed: false, why: 'stop', logRead: true, ready: true, rawEvents: [{label: 'panelService', tapPid: 700, target: 700, source: 900, at: 3}]});
  assert.ok(calls.some(c => c[0] === 'write' && c[1] === join('/r', 'key-route', 'tap.stop')), 'told to stop by its stop file');
  assert.deepEqual(await stopTap({run: '/r'}, io), {exited: null, killed: false, why: null, logRead: false, ready: false, rawEvents: [], reason: 'no tap was started in this run'});
  await assert.rejects(startTap({run: '/r', targets: ['bad']}, io), /--pid <label>:<pid>/);
});

test('tap stop tells a log it could not read from a log that held no Escape', async () => {
  const {io, files} = deviceIo();
  await startTap({run: '/r', targets: ['textedit:5']}, io);
  delete files[join('/r', 'key-route', 'tap.jsonl')];
  assert.deepEqual(await stopTap({run: '/r'}, io), {exited: true, killed: false, why: null, logRead: false, ready: false, rawEvents: []});
});

test('a tap that outlives its stop is killed, only when it is the tap; one never built is not launched', async () => {
  const lives = deviceIo({alive: () => true});
  await startTap({run: '/r', targets: ['textedit:5']}, lives.io);
  const stop = await stopTap({run: '/r'}, lives.io);
  assert.deepEqual([stop.exited, stop.killed], [false, true]);
  assert.ok(lives.calls.some(c => c[0] === 'kill' && c[1] === 41));
  const stranger = deviceIo({alive: () => true, isTap: () => false});
  await startTap({run: '/r', targets: ['textedit:5']}, stranger.io);
  assert.deepEqual((await stopTap({run: '/r'}, stranger.io)).killed, false);
  assert.ok(!stranger.calls.some(c => c[0] === 'kill'));
  const none = deviceIo();
  none.io.exists = () => false;
  assert.deepEqual(await startTap({run: '/r', targets: ['textedit:5']}, none.io), {launched: false, reason: `the tap app is not built at ${TAP_APP} (the sitting step builds it)`});
  assert.ok(!none.calls.some(c => c[0] === 'open'));
  assert.deepEqual(cancelPanel(5, deviceIo().io), {trusted: true, closed: true});
});

test('the tap app is built afresh, its Info.plist its own background-only identity, then ad-hoc signed under that identifier', () => {
  const ran = [], wrote = {};
  const built = buildTapApp({env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'darwin', exec: (cmd, a) => ran.push([cmd, ...a]),
    fsys: {rmSync: path => ran.push(['rm', path]), mkdirSync: () => {}, writeFileSync: (path, text) => { wrote[path] = text; }}});
  assert.deepEqual(built, {app: TAP_APP, bundleId: TAP_BUNDLE_ID});
  assert.deepEqual(ran.map(r => r[0]), ['rm', '/usr/bin/swiftc', '/usr/bin/codesign']);
  assert.deepEqual(ran[2].slice(1), ['--force', '--sign', '-', '--identifier', TAP_BUNDLE_ID, TAP_APP]);
  const plist = wrote[join(TAP_APP, 'Contents', 'Info.plist')];
  assert.match(plist, new RegExp(`<key>CFBundleIdentifier</key><string>${TAP_BUNDLE_ID.replaceAll('.', '\\.')}</string>`));
  assert.match(plist, /<key>LSBackgroundOnly<\/key><true\/>/);
});
