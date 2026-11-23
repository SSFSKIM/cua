// The setup's warm-up captures (scripts/hosted-sittings/warm-up.mjs; ruling 1153): each copy (cua's engine, the
// vendor's helper) makes its first capture in setup, outside every judged cell, so replayd's alert for it is raised
// there; the record keeps the alert it raised and how long UserNotificationCenter held the front. The wait only
// watches: nothing here clicks, keys, answers or writes. Every session, process and reading is a double.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {alertWindows, captureOnce, waitForAlertToLeave, warmUp} from '../../scripts/hosted-sittings/warm-up.mjs';
import {MARKER} from '../../scripts/native-baseline/cells.mjs';

const HOSTED = {RUNNER_ENVIRONMENT: 'github-hosted'};
const UNC = {pid: 2596, bundleId: 'com.apple.UserNotificationCenter'};
const FINDER = {pid: 410, bundleId: 'com.apple.finder'};

// A clock that moves only when the code under test sleeps.
function clock() {
  let t = 0;
  const sleeps = [];
  return {now: () => t, sleep: async ms => { sleeps.push(ms); t += ms; }, sleeps};
}

test('the wait ends once UserNotificationCenter leaves the front, and keeps what it saw', async () => {
  const c = clock();
  const fronts = [UNC, UNC, FINDER];
  const wait = await waitForAlertToLeave({frontmost: () => fronts.shift(), ...c, limitMs: 60_000, pollMs: 1_000});
  assert.deepEqual(wait, {cleared: true, waitedMs: 2_000, polls: 3, seen: [UNC, FINDER], front: FINDER});
});

test('the wait is bounded: an alert that never leaves is recorded as still in front, with no retry past the bound', async () => {
  const c = clock();
  const wait = await waitForAlertToLeave({frontmost: () => UNC, ...c, limitMs: 5_000, pollMs: 1_000});
  assert.deepEqual(wait, {cleared: false, waitedMs: 5_000, polls: 6, seen: [UNC], front: UNC});
  assert.ok(c.sleeps.every(ms => ms === 1_000) && c.sleeps.length === 5);
});

test('an unreadable front is not a front free of the alert', async () => {
  const c = clock();
  const fronts = [UNC, null, () => { throw new Error('lsappinfo failed'); }, FINDER];
  const wait = await waitForAlertToLeave({frontmost: () => { const f = fronts.shift(); return typeof f === 'function' ? f() : f; }, ...c, limitMs: 60_000, pollMs: 1_000});
  assert.equal(wait.cleared, true);
  assert.equal(wait.polls, 4);
  assert.deepEqual(wait.seen, [UNC, 'unreadable', FINDER]);
});

test('the alert\'s windows as the window server lists them: UserNotificationCenter\'s only, never a title', () => {
  const list = [
    {ownerPid: 2596, ownerName: 'UserNotificationCenter', ownerBundleId: 'com.apple.UserNotificationCenter', layer: 0, number: 81, name: null, bounds: {x: 362, y: 230, width: 300, height: 268}},
    {ownerPid: 2596, ownerName: 'UserNotificationCenter', ownerBundleId: null, layer: 0, number: 82, name: 'cua Engine', bounds: {x: 372, y: 240, width: 300, height: 268}},
    {ownerPid: 410, ownerName: 'Finder', ownerBundleId: 'com.apple.finder', layer: 0, number: 12, name: 'Desktop', bounds: {x: 0, y: 0, width: 1024, height: 768}},
  ];
  assert.deepEqual(alertWindows(list), [
    {pid: 2596, number: 81, layer: 0, titled: null, bounds: {x: 362, y: 230, width: 300, height: 268}},
    {pid: 2596, number: 82, layer: 0, titled: true, bounds: {x: 372, y: 240, width: 300, height: 268}},
  ]);
  assert.equal(alertWindows(null), null, 'an unread list is not an empty screen');
});

function warmUpDeps({capture = async () => ({ok: true, engine: 'vendor'}), alerts = 2, fronts = [UNC, UNC, FINDER], windows = () => [{ownerPid: 2596, ownerBundleId: UNC.bundleId, layer: 0, number: 81, name: null, bounds: {x: 1, y: 2, width: 3, height: 4}}]} = {}) {
  const c = clock();
  const calls = [];
  return {c, calls, deps: {env: HOSTED, platform: 'darwin', ...c, limitMs: 60_000, pollMs: 1_000,
    capture: async copy => { calls.push(`capture ${copy}`); return capture(copy); },
    watchAlerts: () => { calls.push('watch'); return {ready: Promise.resolve(true), stop: async () => { calls.push('watch stop'); return {alerts, intact: true}; }}; },
    frontmost: () => fronts.shift() ?? FINDER, windows: () => { calls.push('windows'); return windows(); }}};
}

test('a warm-up: the alert watch around one capture, then the front, the alert\'s windows and the bounded wait, all recorded', async () => {
  const {calls, deps} = warmUpDeps();
  const out = await warmUp('vendor', deps);
  assert.deepEqual(calls, ['watch', 'capture vendor', 'watch stop', 'windows', 'windows']);
  assert.deepEqual(out.capture, {ok: true, engine: 'vendor'});
  assert.deepEqual(out.captureAlerts, {watched: true, count: 2});
  assert.deepEqual(out.frontAfter, UNC);
  assert.deepEqual(out.windowsAfter, [{pid: 2596, number: 81, layer: 0, titled: null, bounds: {x: 1, y: 2, width: 3, height: 4}}]);
  assert.deepEqual({cleared: out.wait.cleared, polls: out.wait.polls}, {cleared: true, polls: 2});
  assert.ok(Array.isArray(out.windowsAtEnd));
});

test('a warm-up whose capture fails, or whose readers fail, is recorded and never thrown: the sitting goes on', async () => {
  const {deps} = warmUpDeps({capture: async () => { throw new Error('initialize failed (no answer)'); }, windows: () => { throw new Error('swift: not found'); }});
  const out = await warmUp('cua', deps);
  assert.deepEqual(out.capture, {ok: false, error: 'initialize failed (no answer)'});
  assert.equal(out.windowsAfter, null);
});

test('a warm-up refuses off a GitHub-hosted runner before any capture', async () => {
  for (const [env, platform] of [[{}, 'darwin'], [HOSTED, 'linux']]) {
    const {calls, deps} = warmUpDeps();
    await assert.rejects(warmUp('vendor', {...deps, env, platform}), /refused/);
    assert.deepEqual(calls, []);
  }
});

// The capture itself: one session of `cua serve` on the copy, the vendor's helper run as it always runs (its bind of
// TextEdit and one screenshot), the TextEdit approval accepted and nothing else, then the TextEdit it launched ended
// by pid.
function session({reply, approvals = []}) {
  const state = {opened: null, closed: false, answers: []};
  const open = options => {
    state.opened = options;
    for (const msg of approvals) state.answers.push(options.onServerRequest(msg));
    return {initialize: async () => ({}), js: async code => { state.code = code; return reply; }, close: async () => { state.closed = true; }};
  };
  return {state, open};
}
const approval = app => ({method: 'elicitation/create', params: {message: `Allow Computer Use to use "${app === 'com.apple.TextEdit' ? 'TextEdit' : app}"?`, mode: 'form', requestedSchema: {type: 'object', properties: {}},
  _meta: {connector_id: 'computer-use', codex_approval_kind: 'mcp_tool_call', tool_params: {app}}}});
const cellReply = (value, engine = 'vendor') => ({result: {content: [{type: 'text', text: `${MARKER}${JSON.stringify({ok: true, value, inCellMs: 5})}`}], _meta: {'cua/nativeEngine': {engine, version: '1', build: 'b'}}}});

test('the capture: one session on the copy, TextEdit\'s approval only, and the TextEdit it launched ended by pid', async () => {
  const {state, open} = session({reply: cellReply({bytes: 51_234}), approvals: [approval('com.apple.TextEdit'), approval('com.apple.finder')]});
  // None before the session, the bind's after it, none once signalled.
  const reads = [[], [4009]];
  let ended = false;
  const signalled = [];
  const out = await captureOnce('vendor', {env: {HOME: '/Users/runner'}, checkout: '/w/cua', open, sleep: async () => {},
    textEditPids: () => (ended ? [] : reads.shift() ?? [4009]), signal: pid => { signalled.push(pid); ended = true; }});
  assert.equal(state.opened.env.CUA_NATIVE_ENGINE, 'vendor');
  assert.deepEqual(state.opened.args, ['/w/cua/bin/cua.mjs', 'serve']);
  assert.deepEqual(state.answers, [{action: 'accept', content: {}}, {action: 'decline'}]);
  assert.match(state.code, /cua\.getApp\("com\.apple\.TextEdit"\)[\s\S]*getScreenshot/);
  assert.equal(state.closed, true);
  assert.deepEqual(out, {ok: true, engine: 'vendor', bytes: 51_234, textEdit: {pids: [4009], ended: true}});
  assert.deepEqual(signalled, [4009]);
});

test('the capture refuses to start while TextEdit already runs (it ends only the TextEdit it launched), and keeps a cell\'s error', async () => {
  const busy = session({reply: cellReply({})});
  const refused = await captureOnce('cua', {env: {}, checkout: '/w/cua', open: busy.open, sleep: async () => {}, textEditPids: () => [77], signal: () => assert.fail('no signal')});
  assert.equal(busy.state.opened, null);
  assert.deepEqual(refused, {ok: false, error: 'TextEdit is already running (pid 77): the warm-up ends only the TextEdit it launches'});
  const failing = session({reply: {result: {content: [{type: 'text', text: `${MARKER}${JSON.stringify({ok: false, error: 'timeoutReached', inCellMs: 9})}`}]}}});
  const out = await captureOnce('cua', {env: {}, checkout: '/w/cua', open: failing.open, sleep: async () => {}, textEditPids: () => [], signal: () => {}});
  assert.deepEqual(out, {ok: false, engine: null, error: 'timeoutReached', textEdit: {pids: [], ended: true}});
  assert.equal(failing.state.closed, true);
});
