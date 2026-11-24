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
  // An order without the person's window, or with it not known by its number, proves no target stayed below it.
  assert.equal(targetAbove([alert], ['com.apple.TextEdit'], {pid: 7, number: 3}), null, 'neither window read');
  assert.equal(targetAbove([], ['com.apple.TextEdit'], {pid: 7, number: 3}), null);
  assert.equal(targetAbove([user, target], ['com.apple.TextEdit'], {pid: 7, number: null}), null, 'the person\'s window not known');
  assert.equal(targetAbove([target, user], ['com.apple.TextEdit'], {pid: 7, number: null}), null);
  const held = judgeInterference({...same, order: order([alert, user, target], [alert, user, target])});
  assert.equal(held.ok, true);
  assert.deepEqual(held.windowOrder, {before: false, after: false});
  const raised = judgeInterference({...same, order: order([alert, user, target], [alert, target, user])});
  assert.equal(raised.ok, false, 'front and top unchanged by the readings, the target raised under the alert above the person\'s window');
  assert.deepEqual([raised.frontmost, raised.topWindow, raised.windowOrder], [true, true, {before: false, after: true}]);
  // An out-of-process target (TextEdit's Open panel) is found by its service's bundle id.
  const panel = {owned: false, bundleId: 'com.apple.appkit.xpc.openAndSavePanelService', layer: 0};
  assert.equal(judgeInterference({...same, targets: ['com.apple.TextEdit', panel.bundleId], order: order([user, panel], [panel, user])}).ok, false);
  // Unread after the act: the row fails, as a front it could not read would; so does an order that proves nothing.
  assert.equal(judgeInterference({...same, order: order([user, target], null)}).ok, false);
  const empty = judgeInterference({...same, order: order([user, target], [])});
  assert.deepEqual([empty.ok, empty.windowOrder], [false, {before: false, after: null}]);
  // No order given (a record from before the oracle read it): judged as before, the field absent.
  assert.equal('windowOrder' in judgeInterference(same), false);
});

// Ruling 1219 (h5): a top window that changed is recorded with what stood on top before and after, so a judge can tell
// the person's own window moving from another window over it.
test('judgeInterference records what the top window was before and after when it changed', () => {
  const user = {ownerPid: 11, number: 3, bounds: {x: 0, y: 0, width: 10, height: 10}, owned: true};
  const reading = topWindow => ({frontmost: {pid: 11, bundleId: 'com.apple.TextEdit', owned: true}, topWindow});
  const over = judgeInterference({before: reading(user), after: reading({ownerPid: null, number: null, bounds: null, owned: false}), userPid: 11, scene: 'finder',
    named: {before: null, after: {owned: false, bundleId: 'com.example.over', number: 9, ownerPid: 66, layer: 0}}});
  assert.deepEqual(over.topChange, {before: {owned: true, pid: 11, number: 3, bounds: user.bounds}, after: {owned: false, bundleId: 'com.example.over'}, userWindowMoved: false});
  const moved = judgeInterference({before: reading(user), after: reading({...user, bounds: {x: 5, y: 0, width: 10, height: 10}}), userPid: 11, scene: 'finder'});
  assert.equal(moved.topChange.userWindowMoved, true);
  assert.equal('topChange' in judgeInterference({before: reading(user), after: reading(user), userPid: 11, scene: 'finder'}), false);
});

// Ruling 1223 (R3): C-6's Finder and Chrome concurrent@textedit rows found a 52×22 window of the user TextEdit's own pid on
// top after the act. Another window of the user app's process on top is no interference only when the user window
// keeps its number, its bounds and the focus (the focus probe names it at its bounds), the user's input landed, and the
// witness tap (ruling 1225, ./witness.mjs) shows the engine posted nothing to the user app's pid in the cell; then the
// pass says so. A witness that did not cover the cell (no tap, a gap in its coverage, its positive control unseen) is
// NO VERDICT, never a pass or a failure, unless the row fails on something else.
test('ruling 1223: a top window of the user app\'s own process passes only with the user window kept, the input landed and the witness clean', () => {
  const userWindow = {pid: 11, number: 3};
  const user = {ownerPid: 11, number: 3, bounds: {x: 0, y: 0, width: 500, height: 400}, owned: true};
  const popup = {ownerPid: 11, number: 9, bounds: {x: 40, y: 60, width: 52, height: 22}, owned: true};
  const reading = topWindow => ({frontmost: {pid: 11, bundleId: 'com.apple.TextEdit', owned: true}, topWindow});
  const entry = (w, bundleId = 'com.apple.TextEdit') => ({owned: true, pid: w.ownerPid, number: w.number, bundleId, layer: 0});
  const driven = {owned: true, pid: 7, number: 4, bundleId: 'com.apple.finder', layer: 0};
  const kept = {appOwned: true, appPid: 11, named: true, valueHash: 'h'};
  const base = {before: reading(user), after: reading(popup), userPid: 11, scene: 'finder', focus: kept, userLanded: true, userWindow, targets: ['com.apple.finder'],
    order: {before: [entry(user), driven], after: [entry(popup), entry(user), driven]}};
  const witnessed = {source: 'tap', gaps: [], others: [], probe: 4};
  const clean = judgeInterference({...base, posts: witnessed});
  assert.equal(clean.ok, true, JSON.stringify(clean));
  assert.equal(clean.topWindowBy, 'user app\'s own window');
  assert.deepEqual(clean.userAppWindow, {pass: true, failed: []});
  assert.equal(clean.noVerdict, undefined);
  // A post to the user app's pid from anyone but the simulated person (the probe) fails it.
  const posted = judgeInterference({...base, posts: {...witnessed, others: [{target: 11, kind: 'keyDown'}]}});
  assert.equal(posted.ok, false);
  assert.deepEqual(posted.userAppWindow, {pass: false, failed: ['the engine posted to the user app\'s pid in the cell (tap: 1 event)']});
  assert.equal(posted.noVerdict, undefined);
  // No witness (off a hosted runner, or its tap never started) or one with a gap: NO VERDICT, what is missing named.
  const unrecorded = judgeInterference(base);
  assert.equal(unrecorded.ok, false);
  assert.deepEqual(unrecorded.userAppWindow, {pass: false, failed: [], noVerdict: 'no witness tap covered the cell: where the engine posted is unrecorded'});
  assert.equal(unrecorded.noVerdict, unrecorded.userAppWindow.noVerdict);
  assert.equal(unrecorded.topWindowBy, undefined);
  for (const gap of ['the tap started after the cell began', 'the positive control was not seen on the user app\'s pid']) {
    const r = judgeInterference({...base, posts: {...witnessed, gaps: [gap], others: [{target: 11, kind: 'keyDown'}]}});
    assert.deepEqual([r.ok, r.noVerdict, r.userAppWindow.failed], [false, gap, []], gap);
  }
  // A row failing on something else stays failed whatever the witness: NO VERDICT only where the witness alone decides.
  const elsewhere = judgeInterference({...base, activations: [{bundleId: 'com.apple.finder'}]});
  assert.deepEqual([elsewhere.ok, elsewhere.noVerdict], [false, undefined]);
  // Each other condition, alone, fails it.
  const conditions = [
    [{focus: {...kept, named: false}}, 'the user window is not the focused window at its bounds'],
    [{userLanded: false}, 'the user\'s input did not land'],
    [{order: {...base.order, after: [entry(popup), driven]}}, 'the user window\'s number is not in the order after the act'],
  ];
  for (const [over, failure] of conditions) {
    const r = judgeInterference({...base, posts: witnessed, ...over});
    assert.equal(r.ok, false, failure);
    assert.ok(r.userAppWindow.failed.includes(failure), JSON.stringify(r.userAppWindow));
    // A failed condition is a failure even with no witness: never NO VERDICT.
    const unwitnessed = judgeInterference({...base, ...over});
    assert.deepEqual([unwitnessed.ok, unwitnessed.noVerdict, unwitnessed.userAppWindow.failed.includes(failure)], [false, undefined, true], failure);
  }
  // Fix wave M3: a row that never measured the user's landing (a background row's, userLanded null) gets no R3 record:
  // the top window changed, it fails as any such row does.
  for (const userLanded of [null, undefined]) {
    const background = judgeInterference({...base, userLanded, posts: witnessed});
    assert.deepEqual([background.ok, 'userAppWindow' in background, background.noVerdict], [false, false, undefined], String(userLanded));
  }
  // Another process's window on top, or the user window itself changed, is not this case.
  assert.equal('userAppWindow' in judgeInterference({...base, after: reading({...popup, ownerPid: 66, owned: false})}), false);
  assert.equal('userAppWindow' in judgeInterference({...base, after: reading({...user, bounds: {x: 5, y: 0, width: 500, height: 400}})}), false);
});
