// The non-interference oracle (scripts/native-matrix/oracle.mjs): readings kept to the run's own processes, the user
// window found for the key guard, activations charged to the row whose action they fall in, and each row judged.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ACTIVATION_MARGIN_MS, attributeActivations, judgeInterference, ownedReading, sameFront, userWindowOf} from '../../scripts/native-matrix/oracle.mjs';

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

test('activations are charged to the row whose action they fall in, with the margin after its end', () => {
  const rows = [{key: 'a', at: [1000, 1100]}, {key: 'b', at: [5000, 5050]}];
  const events = [
    {kind: 'activated', bundleId: 'x', at: 1050}, {kind: 'activated', bundleId: 'y', at: 1100 + ACTIVATION_MARGIN_MS},
    {kind: 'deactivated', bundleId: 'z', at: 1050}, {kind: 'activated', bundleId: 'w', at: 3000},
    {kind: 'activated', bundleId: 'probe', pid: 55, at: 5010}, {kind: 'activated', bundleId: 'v', at: 900},
  ];
  const {byRow, unattributed} = attributeActivations(events, rows, {probePids: [55]});
  assert.deepEqual(byRow.a.map(e => e.bundleId), ['x', 'y']);
  assert.deepEqual(byRow.b, []);
  assert.deepEqual(unattributed.map(e => e.bundleId), ['w', 'v']);
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
