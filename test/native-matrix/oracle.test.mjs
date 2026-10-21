// The non-interference oracle (scripts/native-matrix/oracle.mjs): readings kept to the run's own processes, the user
// window found for the key guard, activations charged to the row whose action they fall in, and each row judged.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ACTIVATION_MARGIN_MS, accountActivations, judgeInterference, ownedReading, sameFront, userWindowOf} from '../../scripts/native-matrix/oracle.mjs';

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
