// Sitting D's alert guard and placement (scripts/hosted-sittings/textedit-guard.mjs; rulings 1154, 1160, 1164): the
// scratch document's and accept-native's TextEdit fixture's windows placed clear of the alerts, and each fixture cell
// that types or presses a key (cua's engine may click around it) refused under an overlapping alert, the alert in front
// or key, or an unread screen; the refusal reaches the hosted check as NO VERDICT. All with doubles.
import assert from 'node:assert/strict';
import test from 'node:test';
import {alertGuardRefusal} from '../../scripts/accept/textedit.mjs';
import {CHECKS} from '../../scripts/hosted-sittings/checks.mjs';
import {sittingPlan} from '../../scripts/hosted-sittings/plan.mjs';
import {textEditGuard} from '../../scripts/hosted-sittings/textedit-guard.mjs';

const UNC = 'com.apple.UserNotificationCenter';
const rect = (x, y, width, height) => ({x, y, width, height});
const ALERT = rect(382, 118, 260, 348);
const windowsWith = bounds => [{ownerPid: 77, ownerName: 'UserNotificationCenter', ownerBundleId: UNC, layer: 8, number: 90, name: null, bounds: ALERT},
  {ownerPid: 600, ownerName: 'TextEdit', ownerBundleId: 'com.apple.TextEdit', layer: 0, number: 7, name: 'verify-bind.txt', bounds}];
const io = (bounds, {key = 'com.apple.TextEdit', moves = []} = {}) => ({screen: () => ({windows: windowsWith(bounds), displays: [rect(0, 0, 1920, 1080)]}),
  frontmost: () => ({pid: 600, bundleId: 'com.apple.TextEdit'}), focus: () => ({focusedApp: {pid: 600, bundleId: key}, focusedWindow: null}),
  frameProbe: args => { moves.push(args); const f = args.at(-1).split(',').map(Number); return {readBack: rect(...f), matched: true, exitStatus: 0}; }});

test('sitting D: the fixture\'s key cells refused under an overlapping alert, with the alert holding the key, or unread; sent when clear', () => {
  const under = textEditGuard({pids: () => [600], io: io(rect(79, 31, 627, 677))});
  assert.deepEqual(alertGuardRefusal(under).category, 'alert');
  assert.match(alertGuardRefusal(under).detail, /overlaps the textedit window 7/);
  const clear = textEditGuard({pids: () => [600], io: io(rect(700, 31, 627, 677))});
  assert.equal(alertGuardRefusal(clear), null);
  assert.match(alertGuardRefusal(textEditGuard({pids: () => [600], io: io(rect(700, 31, 627, 677), {key: UNC})})).detail, /holds the key/);
  assert.equal(alertGuardRefusal(textEditGuard({pids: () => [600], io: {...io(rect(0, 0, 1, 1)), screen: () => { throw new Error('swift exited 1'); }}})).category, 'unread');
  assert.equal(alertGuardRefusal({check: () => { throw new Error('pgrep failed'); }}).category, 'unread', 'a guard that throws is unread, never clear');
});

test('sitting D: the document placed clear of the alerts by its pid, from, to and the read-back recorded', async () => {
  const moves = [];
  const placed = await textEditGuard({pids: () => [600], io: io(rect(79, 31, 627, 677), {moves})}).place();
  assert.deepEqual(placed.alerts, [ALERT]);
  const [w] = placed.windows;
  assert.deepEqual([w.scene, w.number, w.from, w.moved, w.matched], ['textedit', 7, rect(79, 31, 627, 677), true, true]);
  assert.deepEqual(w.readBack, w.to);
  assert.deepEqual(moves[0].slice(0, 5), ['window-frame', '--pid', '600', '--window', '7']);
  assert.ok(!JSON.stringify(placed).includes('verify-bind'), 'no title is kept');
});

test('sitting D\'s hosted check: accept-native\'s refusal in the fixture is NO VERDICT; another item\'s failure stays FAIL; exit 0 passes', () => {
  const plan = sittingPlan('d', {out: '/o', scratch: '/s', approvedRuntime: '/h', approvedEngine: '/e', runId: '1-1', commit: 'c'});
  const step = plan.steps.find(s => s.id === 'accept-native');
  assert.deepEqual([step.check, step.record, step.report], ['acceptance', '/o/acceptance.json', '/o/acceptance.json']);
  assert.deepEqual(plan.steps.find(s => s.id === 'textedit-up').argv.slice(-2), ['--record', '/o/textedit-placement.json']);
  const stop = {cause: 'alert', detail: 'alert window 90 (382,118 260x348) overlaps the textedit window 7 (79,31 627x677)', at: 'type marker'};
  const items = statuses => statuses.map(([id, status]) => ({id, status}));
  const report = {status: 'BLOCKED', alertGuardStop: stop, items: items([[1, 'PASS'], [5, 'BLOCKED'], [6, 'BLOCKED'], [8, 'FAIL'], [10, 'PASS']])};
  const [status, reason] = CHECKS.acceptance(step, {exit: 1, readJson: () => report});
  assert.equal(status, 'NO VERDICT');
  assert.match(reason, /^alert: the alert guard refused type marker/);
  assert.equal(CHECKS.acceptance(step, {exit: 1, readJson: () => ({...report, items: items([[1, 'FAIL'], [5, 'BLOCKED']])})})[0], 'FAIL');
  assert.equal(CHECKS.acceptance(step, {exit: 3, readJson: () => ({status: 'BLOCKED', items: items([[5, 'BLOCKED']])})})[0], 'FAIL', 'no refusal: as `exit`');
  assert.equal(CHECKS.acceptance(step, {exit: 1, readJson: () => null})[0], 'FAIL');
  assert.deepEqual(CHECKS.acceptance(step, {exit: 0, readJson: () => null}), ['PASS', null]);
});
