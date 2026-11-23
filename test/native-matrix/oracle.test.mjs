// The non-interference oracle (scripts/native-matrix/oracle.mjs): readings kept to the run's own processes, the user
// window found for the key guard, activations charged to the row whose action they fall in, and each row judged.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ACTIVATION_MARGIN_MS, accountActivations, judgeInterference, ownedReading, sameFront, targetAbove, userWindowOf} from '../../scripts/native-matrix/oracle.mjs';

const bounds = {x: 10, y: 20, width: 800, height: 600};
const raw = (pid, ownerPid = pid, b = bounds) => ({at: 1, frontmost: {pid, bundleId: pid === 7 ? 'com.apple.finder' : 'com.example.owner'}, topWindow: {ownerPid, number: 42, bounds: b, onScreen: true}});
const finder = ownedReading(raw(7), [7, 8]);

test('a reading leaves the device with the run\'s own pids only', () => {
  assert.deepEqual(finder.frontmost, {pid: 7, bundleId: 'com.apple.finder', owned: true});
  assert.deepEqual(finder.topWindow, {ownerPid: 7, number: 42, bounds, owned: true});
  const foreign = ownedReading(raw(99), [7, 8]);
  assert.deepEqual(foreign.frontmost, {pid: null, bundleId: 'com.example.owner', owned: false});
  assert.deepEqual(foreign.topWindow, {ownerPid: null, number: null, bounds: null, owned: false});
  assert.deepEqual(ownedReading({at: 2, frontmost: null, topWindow: null}, [7]), {at: 2, frontmost: null, topWindow: null});
});

test('the user window: the user scene frontmost and owning the top window', () => {
  assert.deepEqual(userWindowOf(finder, 7), {pid: 7, bounds});
  assert.equal(userWindowOf(finder, 8), null);
  assert.equal(userWindowOf(ownedReading(raw(7, 8), [7, 8]), 7), null, 'another of the run\'s windows on top');
  assert.equal(userWindowOf(ownedReading(raw(99), [7]), 7), null);
});

test('the front compares pid, bundle id, window number and bounds', () => {
  assert.deepEqual(sameFront(finder, ownedReading(raw(7), [7, 8])), {frontmost: true, topWindow: true});
  assert.deepEqual(sameFront(finder, ownedReading(raw(8), [7, 8])), {frontmost: false, topWindow: false});
  assert.deepEqual(sameFront(finder, ownedReading(raw(7, 7, {...bounds, x: 11}), [7, 8])), {frontmost: true, topWindow: false});
  assert.deepEqual(sameFront(finder, ownedReading(raw(99), [7, 8])), {frontmost: false, topWindow: false});
  assert.deepEqual(sameFront(finder, null), {frontmost: false, topWindow: false}, 'an unread front never passes');
});

test('every activation is accounted for: the harness\'s, a row\'s, a measure\'s, the phases around; anything else is not', () => {
  const windows = [{key: 'setup', kind: 'setup', at: [500, 600]}, {key: 'a', kind: 'row', at: [1000, 1100]}, {key: 'h', kind: 'harness', at: [1040, 1060], apps: ['user']},
    {key: 'b', kind: 'row', at: [5000, 5050]}, {key: 'm', kind: 'measure', at: [8000, 8100]}];
  const events = [
    {kind: 'activated', bundleId: 'x', at: 1020}, {kind: 'activated', bundleId: 'user', at: 1050}, {kind: 'activated', bundleId: 'y', at: 1100 + ACTIVATION_MARGIN_MS},
    {kind: 'deactivated', bundleId: 'z', at: 1050}, {kind: 'activated', bundleId: 'gap', at: 3000},
    {kind: 'activated', bundleId: 'probe', pid: 55, at: 5010}, {kind: 'activated', bundleId: 'before', at: 100},
    {kind: 'activated', bundleId: 'measured', at: 8050}, {kind: 'activated', bundleId: 'after', at: 20_000}, {kind: 'activated', bundleId: 'untimed'},
  ];
  const {byRow, accounted, unaccounted} = accountActivations(events, windows, {probePids: [55]});
  assert.deepEqual(byRow.a.map(e => e.bundleId), ['x', 'y']);
  assert.deepEqual(byRow.b, []);
  assert.deepEqual(accounted.map(a => [a.kind, a.bundleId]), [['harness', 'user'], ['outside', 'before'], ['measure', 'measured'], ['outside', 'after']]);
  assert.deepEqual(unaccounted.map(e => e.bundleId), ['gap', 'untimed']);
});

test('a harness step excuses only the activation it intended: another app\'s, in a row that overlaps its margin, is the row\'s', () => {
  // activate(user) at [1000, 1100]; the row starts at 1150, inside the step's margin; TextEdit activates at 1400.
  const windows = [{key: 'activate:finder', kind: 'harness', at: [1000, 1100], apps: ['com.apple.finder']}, {key: 'r', kind: 'row', at: [1150, 1800]}];
  const events = [{kind: 'activated', bundleId: 'com.apple.finder', at: 1090}, {kind: 'activated', bundleId: 'com.apple.TextEdit', at: 1400}];
  const {byRow, accounted, unaccounted} = accountActivations(events, windows);
  assert.deepEqual(byRow.r.map(e => e.bundleId), ['com.apple.TextEdit']);
  assert.deepEqual(accounted.map(a => [a.kind, a.bundleId]), [['harness', 'com.apple.finder']]);
  assert.deepEqual(unaccounted, []);
  // A harness step that intends no activation (a background open, a quit) excuses none; outside a row it is unaccounted.
  const quiet = accountActivations([{kind: 'activated', bundleId: 'com.example.other', at: 3010}],
    [{key: 'r', kind: 'row', at: [1000, 1100]}, {key: 'open', kind: 'harness', at: [3000, 3020], apps: []}, {key: 'r2', kind: 'row', at: [6000, 6100]}]);
  assert.deepEqual(quiet.unaccounted.map(e => e.bundleId), ['com.example.other']);
});

test('a row passes only with the front unchanged, no activation and no route 4 outside an accepted family', () => {
  const same = {before: finder, after: finder, scene: 'textedit'};
  assert.deepEqual(judgeInterference({...same, inputRoute: 3}), {ok: true, frontmost: true, topWindow: true, focus: null, activations: 0, route4: false});
  // The focus probe after the action: the user window must keep the keyboard focus.
  assert.equal(judgeInterference({...same, userPid: 7, focus: {appOwned: true, appPid: 7, named: true}}).ok, true);
  const lost = judgeInterference({...same, userPid: 7, focus: {appOwned: true, appPid: 11, named: false}});
  assert.equal(lost.ok, false);
  assert.equal(lost.focus, false);
  assert.equal(judgeInterference({...same, userPid: 7, focus: {appOwned: false, appPid: null, named: false}}).ok, false);
  // Why the focus was not the user window's rides on the row, recorded and never judged.
  const unnamed = {accessibility: true, appRead: false, appNamed: false, windowRead: false, windowNamed: false, deltas: null};
  const unread = judgeInterference({...same, userPid: 7, focus: {appOwned: false, appPid: null, named: false, unnamed}});
  assert.deepEqual(unread, {ok: false, frontmost: true, topWindow: true, focus: false, focusUnnamed: unnamed, activations: 0, route4: false});
  assert.equal(judgeInterference({...same, inputRoute: 4}).ok, false);
  const accepted = judgeInterference({...same, inputRoute: 4, accepted: {route4: ['AppKit text'], selfActivating: []}});
  assert.equal(accepted.ok, true);
  assert.equal(accepted.declared.kind, 'route4-accepted');
  assert.equal(judgeInterference({...same, activations: [{kind: 'activated', bundleId: 'com.apple.TextEdit', at: 1}]}).ok, false, 'a steal handed back is still one');
  assert.equal(judgeInterference({...same, after: ownedReading(raw(8), [7, 8])}).ok, false);
});

test('a launch-path row: the launched app\'s own activation is declared for the owner, any other fails', () => {
  const launch = {before: finder, after: finder, scene: 'textedit', launched: 'com.apple.TextEdit'};
  const own = judgeInterference({...launch, activations: [{kind: 'activated', bundleId: 'com.apple.TextEdit', at: 1}]});
  assert.equal(own.ok, false);
  assert.equal(own.declared.kind, 'self-activating');
  const other = judgeInterference({...launch, activations: [{kind: 'activated', bundleId: 'com.example.other', at: 1}]});
  assert.equal(other.ok, false);
  assert.equal(other.declared, undefined);
  assert.equal(judgeInterference({...launch, activations: [{kind: 'activated', bundleId: 'com.apple.TextEdit', at: 1}], accepted: {route4: [], selfActivating: ['AppKit text']}}).ok, true);
});

test('the engine flag on an unowned top window is recorded, never judged', () => {
  const unowned = engine => ({at: 1, frontmost: {pid: null, bundleId: 'com.x', owned: false}, topWindow: {ownerPid: null, number: null, bounds: null, owned: false, engine}});
  assert.deepEqual(sameFront(unowned(true), unowned(false)), {frontmost: true, topWindow: true});
  assert.deepEqual(sameFront(unowned(true), unowned(null)), sameFront(unowned(false), unowned(false)));
  const judged = engine => judgeInterference({before: unowned(false), after: unowned(engine), scene: 'textedit'});
  assert.deepEqual(judged(true), judged(false));
  assert.equal(userWindowOf(unowned(true), 7), null);
});

// #485 (ruling 1069): a background cell that leaves the target's window above the person's fails non-interference,
// whatever the front and the top window read (an alert's window on top of both, say), read from the window order.
test('the window order: the target\'s window above the person\'s fails the row; above an unrelated window, or below the person\'s, does not', () => {
  const user = {owned: true, pid: 7, number: 3, bundleId: 'com.apple.finder', layer: 0};
  const target = {owned: true, pid: 11, number: 4, bundleId: 'com.apple.TextEdit', layer: 0};
  const alert = {owned: false, bundleId: 'com.apple.UserNotificationCenter', layer: 8};
  const order = (before, after) => ({before, after});
  const same = {before: finder, after: finder, scene: 'textedit', targets: ['com.apple.TextEdit'], userWindow: {pid: 7, number: 3}};
  assert.equal(targetAbove([alert, user, target], ['com.apple.TextEdit'], {pid: 7, number: 3}), false);
  assert.equal(targetAbove([alert, target, user], ['com.apple.TextEdit'], {pid: 7, number: 3}), true);
  assert.equal(targetAbove(null, ['com.apple.TextEdit'], {pid: 7, number: 3}), null, 'unread: no verdict of its own');
  assert.equal(targetAbove([target], ['com.apple.TextEdit'], {pid: 7, number: 3}), true, 'the person\'s window gone, any target window is above it');
  const held = judgeInterference({...same, order: order([alert, user, target], [alert, user, target])});
  assert.equal(held.ok, true);
  assert.deepEqual(held.windowOrder, {before: false, after: false});
  const raised = judgeInterference({...same, order: order([alert, user, target], [alert, target, user])});
  assert.equal(raised.ok, false, 'front and top unchanged by the readings, the target raised under the alert above the person\'s window');
  assert.deepEqual([raised.frontmost, raised.topWindow, raised.windowOrder], [true, true, {before: false, after: true}]);
  // An out-of-process target (TextEdit's Open panel) is found by its service's bundle id.
  const panel = {owned: false, bundleId: 'com.apple.appkit.xpc.openAndSavePanelService', layer: 0};
  assert.equal(judgeInterference({...same, targets: ['com.apple.TextEdit', panel.bundleId], order: order([user, panel], [panel, user])}).ok, false);
  // Unread after the act: the row fails, as a front it could not read would.
  assert.equal(judgeInterference({...same, order: order([user, target], null)}).ok, false);
  // No order given (a record from before the oracle read it): judged as before, the field absent.
  assert.equal('windowOrder' in judgeInterference(same), false);
});
