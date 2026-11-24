// The key-route diagnostic's lane (ruling 1198): scripts/native-matrix/key-route-run.mjs in a matrix run on the run's
// doubles, and its device side (scripts/native-matrix/key-route-device.mjs) on spies. TextEdit's Open panel opened by
// ⌘O under the key guard, the AX half read, the taps started on TextEdit and the panel service, one pressKey("Escape")
// through the lane, the taps stopped, the panel read by the device and cancelled by Accessibility when the Escape did
// not close it; a panel left up stops the run, named. Off a hosted runner the device opens and cancels nothing.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {PANEL_SERVICE} from '../../scripts/hosted-sittings/alert-guard.mjs';
import {buildTapApp, cancelPanel, main as deviceMain, startTap, stopTap, TAP_APP, TAP_BUNDLE_ID, TAP_EXECUTABLE} from '../../scripts/native-matrix/key-route-device.mjs';
import {KEY_ROUTE_ESCAPE, tapTargets} from '../../scripts/native-matrix/key-route-run.mjs';
import {resolveCell} from '../../scripts/native-matrix/registry.mjs';
import {planOf, scenesOf} from '../../scripts/native-matrix/run.mjs';
import {args, runWith} from './run-doubles.mjs';

const TEXTEDIT_PID = 501;
const tagOf = code => /cua-matrix-cell: ([\w.-]+)/.exec(code)?.[1] ?? null;
const AX = {trusted: true, pid: TEXTEDIT_PID, actualPid: 700, cuaKeyboardTarget: TEXTEDIT_PID, staticReadingTarget: 700, chain: [], processes: {700: {bundleId: PANEL_SERVICE}},
  routes: [{route: 'runningApplicationsPanelService', pids: [700], matchesActual: true}]};

// A run of the key-route plan: `device` answers each key-route device command by its name, `escape` the press cell.
async function keyRouteRun({device = {}, escape = {pressed: true, at: [1, 2], threw: null, closed: false}, open = {opened: true}} = {}) {
  const answers = {read: AX, 'tap start': {launched: true, ready: true, pid: 41, listenAccess: true, taps: []},
    'tap stop': {exited: true, killed: false, why: 'stop', events: [{label: 'textedit', tapPid: TEXTEDIT_PID, target: TEXTEDIT_PID, source: 900, at: 2}]},
    panel: {trusted: true, up: true}, cancel: {found: true, via: 'cancelButton', pressed: 0, closed: true}, ...device};
  const calls = [];
  const run = await runWith({plan: planOf('key-route'), cellName: 'key-route', calls,
    ops: {scenes: (base, a) => (a[0] === 'up' ? {...base(a), pid: TEXTEDIT_PID} : base(a)),
      keyRoute: (base, a) => { base(a); return {answer: answers[a[0] === 'tap' ? `tap ${a[1]}` : a[0]], at: [5, 6]}; }},
    cell: code => (tagOf(code) === 'key-route.escape' ? escape : /pressKey\("super\+o"\)/.test(code) ? open : null)});
  return {...run, calls, keyRoute: run.result.meta.keyRoute, device: run.steps.filter(s => s.startsWith('key-route ')).map(args)};
}

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
  assert.equal(keyRoute.tap.stop.events[0].source, 900);
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
    'tap stop': {exited: false, killed: true, why: null, events: []}}});
  assert.equal(code, 1);
  assert.equal(keyRoute.closed, false);
  assert.deepEqual(keyRoute.cleanup, ['the tap app (pid 41) did not exit when stopped', 'TextEdit\'s Open panel stayed up after the AX cancel']);
  assert.ok(result.problems.some(p => /stopped: TextEdit's Open panel stayed up after the AX cancel/.test(p)), JSON.stringify(result.problems));
});

test('a panel that did not open is recorded; the device still reads it, and nothing is pressed', async () => {
  const {keyRoute, device, calls} = await keyRouteRun({open: {opened: false}, device: {panel: {trusted: true, up: false}}});
  assert.deepEqual(keyRoute.opened, {ok: false, reason: 'the Open panel did not open (not seen)'});
  assert.deepEqual(device.map(a => a[0]), ['panel']);
  assert.ok(!calls.some(c => tagOf(c.code) === 'key-route.escape'));
  assert.deepEqual([keyRoute.press, keyRoute.closed, keyRoute.cleanup], [null, true, []]);
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

// The device side on spies.
function deviceIo({env = {RUNNER_ENVIRONMENT: 'github-hosted'}, files = {}, alive = () => false, isTap = () => true} = {}) {
  const calls = [];
  return {calls, files, io: {
    env, platform: 'darwin', sleep: async () => {},
    helper: a => { calls.push(['helper', ...a]); return {trusted: true, closed: true}; },
    exists: path => { calls.push(['exists', path]); return path === TAP_EXECUTABLE; },
    mkdir: path => calls.push(['mkdir', path]), remove: path => { calls.push(['remove', path]); delete files[path]; },
    readText: path => files[path] ?? '', writeText: (path, text) => { calls.push(['write', path]); files[path] = text; },
    open: a => { calls.push(['open', ...a]); files[a[a.indexOf('--out') + 1]] = `${JSON.stringify({ready: true, pid: 41, listenAccess: true, taps: [{label: 'textedit', pid: 5, created: true}]})}\n`; },
    alive: pid => { calls.push(['alive', pid]); return alive(pid); }, kill: pid => calls.push(['kill', pid]), isTap: pid => { calls.push(['isTap', pid]); return isTap(pid); },
  }};
}

test('off a hosted runner the device side opens nothing and cancels nothing', async () => {
  const {io, calls} = deviceIo({env: {}});
  const start = await deviceMain(['tap', 'start', '--run', '/r', '--pid', 'textedit:5'], {io});
  assert.match(start.answer.refused, /the key-route tap: refused: it runs only on a GitHub-hosted runner/);
  const cancel = await deviceMain(['cancel', '--run', '/r', '--pid', '5'], {io});
  assert.deepEqual(cancel.answer.closed, false);
  assert.match(cancel.answer.refused, /the key-route cancel: refused/);
  assert.deepEqual(calls, []);
  assert.throws(() => buildTapApp({env: {}, platform: 'darwin', exec: () => { throw new Error('ran'); }, fsys: {rmSync: () => { throw new Error('wrote'); }}}), /the key-route tap app: refused/);
});

test('tap start launches the tap app through LaunchServices with its targets and waits for its taps; tap stop stops it and keeps only the Escape lines', async () => {
  const {io, calls, files} = deviceIo();
  const start = await startTap({run: '/r', targets: ['textedit:5', 'panelService:700']}, io);
  assert.deepEqual(start, {launched: true, ready: true, pid: 41, listenAccess: true, taps: [{label: 'textedit', pid: 5, created: true}]});
  const open = calls.find(c => c[0] === 'open');
  assert.deepEqual(open.slice(1, 6), ['-n', '-g', '-a', TAP_APP, '--args']);
  assert.deepEqual(open.slice(open.indexOf('--max-seconds'), open.indexOf('--max-seconds') + 6), ['--max-seconds', '120', '--pid', 'textedit:5', '--pid', 'panelService:700']);
  files[join('/r', 'key-route', 'tap.jsonl')] += [{label: 'panelService', tapPid: 700, keycode: 53, target: 700, source: 900, at: 3}, {stopped: true, why: 'stop'}].map(l => JSON.stringify(l)).join('\n');
  const stop = await stopTap({run: '/r'}, io);
  assert.deepEqual(stop, {exited: true, killed: false, why: 'stop', events: [{label: 'panelService', tapPid: 700, target: 700, source: 900, at: 3}]});
  assert.ok(calls.some(c => c[0] === 'write' && c[1] === join('/r', 'key-route', 'tap.stop')), 'told to stop by its stop file');
  assert.deepEqual(await stopTap({run: '/r'}, io), {exited: null, killed: false, why: null, events: [], reason: 'no tap was started in this run'});
  await assert.rejects(startTap({run: '/r', targets: ['bad']}, io), /--pid <label>:<pid>/);
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
