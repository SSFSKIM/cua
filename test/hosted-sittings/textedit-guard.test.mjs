// Sitting D's alert guard and placement (scripts/hosted-sittings/textedit-guard.mjs; rulings 1154, 1160, 1164): the
// scratch document's and accept-native's TextEdit fixture's windows placed clear of the alerts, and each fixture cell
// that types or presses a key refused with the alert holding the key (the key-cell premise); the refusal reaches the
// hosted check as NO VERDICT, and only the fixture's own checks may go unproven by it. All with doubles.
import assert from 'node:assert/strict';
import test from 'node:test';
import {APPROVALS_CHECK, FIXTURE_VERDICT_CHECK, fixtureGuardRecord, fixtureKeyCell, OWN_STEPS, SECRET_STEPS, STEP, uiDeliveryCheck} from '../../scripts/accept/textedit.mjs';
import {recordKeyUnread} from '../../scripts/hosted-sittings/alert-guard.mjs';
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

// One fixture key cell against a guard (fixtureKeyCell): the session's pause, the guard's one fresh reading, the front
// check, the cell; `order` records them.
async function keyCellWith(guard, {captures = false, observations = {}} = {}) {
  const order = [], sent = [];
  const session = {pauseWait: async () => { order.push('pause'); }, dispatch: async code => { order.push('dispatch'); sent.push(code); return {ok: true}; }};
  const reading = {read: options => { order.push('guard'); return guard.read(options); }};
  const out = await fixtureKeyCell({session, step: STEP.type, keys: ['typeText'], code: 'type', stepMs: 5, frontmost: () => { order.push('frontmost'); return 'com.apple.TextEdit'; },
    guard: reading, captures, observations});
  return {out, order, sent, observations};
}
const guardOn = (bounds, options) => textEditGuard({pids: () => [600], io: io(bounds, options)});
const UNDER = rect(79, 31, 627, 677), CLEAR = rect(700, 31, 627, 677);

// The key-cell premise A and C share (scripts/hosted-sittings/alert-guard.mjs keyCause): route 3's activation click
// goes to the target's pid only, so a key cell is refused when the alert holds the key, and the key guard's own check
// refuses it when TextEdit is not in front; an alert merely overlapping the document refuses no key cell. A key reading
// not taken refuses nothing either: the cell goes unguarded against the alert holding the key, and is counted.
test('sitting D: the fixture\'s key cells follow the key-cell premise; a key reading not taken is counted, never hidden', async () => {
  const holding = await keyCellWith(guardOn(CLEAR, {key: UNC}));
  assert.equal(holding.out.refused.category, 'alert');
  assert.match(holding.out.refused.detail, /holds the key/);
  assert.equal((await keyCellWith(guardOn(UNDER))).out.sent, true, 'an overlapping alert alone is the pointer rule\'s, not a key cell\'s');
  const unread = await keyCellWith({read: () => { throw new Error('pgrep failed'); }});
  assert.equal(unread.out.sent, true);
  assert.deepEqual(unread.observations.keyUnread, {[STEP.type]: 1});
  const noFocus = await keyCellWith(guardOn(CLEAR, {key: null}));
  assert.deepEqual([noFocus.out.sent, noFocus.observations.keyUnread], [true, {[STEP.type]: 1}]);
  assert.equal((await keyCellWith(guardOn(CLEAR))).observations.keyUnread, undefined);
});

// The marker cell types and then captures TextEdit's window (markerCell's getScreenshot): it is held to the capture rule
// as well, a window under an alert or an unread screen refusing the whole cell before it is sent.
test('sitting D: the marker cell\'s capture under the shared capture rule: TextEdit\'s window under an alert, or unread, refuses the cell unsent', async () => {
  const under = await keyCellWith(guardOn(UNDER), {captures: true});
  assert.deepEqual([under.out.sent, under.out.refused.category], [false, 'alert']);
  assert.match(under.out.refused.detail, /overlaps the textedit window 7/);
  assert.deepEqual(under.sent, []);
  assert.deepEqual(under.observations.alertGuardStop, {cause: 'alert', detail: under.out.refused.detail, at: STEP.type});
  const unread = await keyCellWith({read: () => ({key: 'com.apple.TextEdit', bounds: null})}, {captures: true});
  assert.equal(unread.out.refused.category, 'unread');
  assert.equal((await keyCellWith(guardOn(CLEAR), {captures: true})).out.sent, true, 'a window clear of every alert is exempt');
});

// runTextEdit's key cell (scripts/accept/textedit.mjs fixtureKeyCell): the pause wait first, then the guard's fresh
// reading, then the front check and the cell; a refusal sends nothing and is recorded as every sitting records it, and
// it reaches accept-native's report (fixtureGuardRecord) and the hosted check as NO VERDICT.
test('sitting D: a refused key cell sends nothing, reads the guard after the pause, and its record reaches the hosted check as NO VERDICT', async () => {
  const {out, order, sent, observations} = await keyCellWith(guardOn(CLEAR, {key: UNC}));
  assert.deepEqual(order, ['pause', 'guard'], 'the guard is read after the pause, and nothing is checked or sent after a refusal');
  assert.deepEqual(sent, []);
  assert.equal(out.sent, false);
  assert.deepEqual(out.mark.alertGuard, {cause: 'alert', detail: 'com.apple.UserNotificationCenter holds the key'});
  assert.deepEqual(observations.alertGuardStop, {cause: 'alert', detail: 'com.apple.UserNotificationCenter holds the key', at: STEP.type});
  assert.deepEqual(observations.alertGuardCounts, {[STEP.type]: {alert: 1, unread: 0}});
  recordKeyUnread(observations, STEP.closeDoc);
  const kept = fixtureGuardRecord(observations);
  assert.deepEqual(kept, {alertGuardStop: observations.alertGuardStop, alertGuardCounts: observations.alertGuardCounts, keyUnread: {[STEP.closeDoc]: 1}});
  assert.deepEqual(fixtureGuardRecord({}), {}, 'nothing refused or unread: nothing in the report');
  assert.deepEqual(fixtureGuardRecord({keyUnread: {a: 1}}), {keyUnread: {a: 1}});
  assert.equal(CHECKS.acceptance({record: '/o/a.json'}, {exit: 1, readJson: () => ({...refusedReport(), alertGuardStop: undefined, ...kept})})[0], 'NO VERDICT');
  // Clear: the pause, the guard, the front check, then the cell.
  const clear = await keyCellWith(guardOn(CLEAR));
  assert.deepEqual(clear.order, ['pause', 'guard', 'frontmost', 'dispatch']);
  assert.deepEqual(clear.out, {sent: true, result: {ok: true}});
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
  const report = refusedReport();
  const [status, reason] = CHECKS.acceptance(step, {exit: 1, readJson: () => report});
  assert.equal(status, 'NO VERDICT');
  assert.match(reason, /^alert: the alert guard refused type marker/);
  assert.equal(CHECKS.acceptance(step, {exit: 1, readJson: () => ({...report, items: [{id: 1, status: 'FAIL', checks: [checkOf('npm test', 'FAIL')]}, ...report.items]})})[0], 'FAIL');
  assert.equal(CHECKS.acceptance(step, {exit: 3, readJson: () => ({status: 'BLOCKED', items: report.items})})[0], 'FAIL', 'no refusal: as `exit`');
  assert.equal(CHECKS.acceptance(step, {exit: 1, readJson: () => null})[0], 'FAIL');
  assert.deepEqual(CHECKS.acceptance(step, {exit: 0, readJson: () => null}), ['PASS', null]);
});

// accept-native's report as a refusal in the fixture leaves it (scripts/accept-native.mjs items 5, 6 and 8): the
// fixture's own checks BLOCKED, every other check of those items passed, item 1 passed.
const checkOf = (name, status) => ({name, status, detail: 'd'});
const STOP = {cause: 'alert', detail: 'alert window 90 (382,118 260x348) overlaps the textedit window 7 (79,31 627x677)', at: 'type marker'};
const refusedReport = ({six = [], eight = []} = {}) => ({status: 'FAIL', alertGuardStop: STOP, items: [
  {id: 1, status: 'PASS', checks: [checkOf('npm test', 'PASS')]},
  {id: 5, status: 'BLOCKED', checks: [checkOf(FIXTURE_VERDICT_CHECK, 'BLOCKED'), ...OWN_STEPS.map(step => checkOf(step, step === STEP.type ? 'BLOCKED' : 'PASS'))]},
  {id: 6, status: 'BLOCKED', checks: [checkOf('secrets list returns keys only', 'PASS'), checkOf('MCP secrets_list returns keys only', 'PASS'), ...six,
    ...SECRET_STEPS.map(step => checkOf(uiDeliveryCheck(step), 'BLOCKED'))]},
  {id: 8, status: 'BLOCKED', checks: [checkOf('lifecycle state machine, races, deadlines, EOF, elicitation routing, bounded teardown', 'PASS'), ...eight,
    checkOf(APPROVALS_CHECK, 'BLOCKED')]},
]});

test('sitting D\'s hosted check: a real failure in items 6 or 8 beside the fixture\'s refusal is FAIL, named; only the fixture\'s own checks may go unproven', () => {
  const step = {check: 'acceptance', record: '/o/acceptance.json'};
  const secrets = CHECKS.acceptance(step, {exit: 1, readJson: () => refusedReport({six: [checkOf('secrets remove deletes the key\'s file', 'FAIL')]})});
  assert.equal(secrets[0], 'FAIL');
  assert.match(secrets[1], /item 6: secrets remove deletes the key's file FAIL/);
  assert.match(secrets[1], /the alert guard also refused type marker/);
  const lifecycle = CHECKS.acceptance(step, {exit: 1, readJson: () => refusedReport({eight: [checkOf('observed: idle EOF closes cleanly with no runtime left', 'FAIL')]})});
  assert.equal(lifecycle[0], 'FAIL');
  assert.match(lifecycle[1], /item 8: observed: idle EOF closes cleanly/);
  // A check the fixture does not produce that is only BLOCKED (verify.mjs produced no secrets_list, say) is unproven by
  // another cause than the guard's: not the refusal's to excuse.
  assert.equal(CHECKS.acceptance(step, {exit: 1, readJson: () => refusedReport({six: [checkOf('opt-in --live-secrets', 'BLOCKED')]})})[0], 'FAIL');
  assert.equal(CHECKS.acceptance(step, {exit: 1, readJson: () => refusedReport({six: [checkOf('subprocess output complete', 'FAIL')]})})[0], 'FAIL');
  // A fixture check that FAILed ran and failed: a step the refusal left unrun reads BLOCKED (the refused step, an
  // inventory check of a step never run, an approvals observation not made), never FAIL. The typed text not the marker
  // (STEP.type FAIL, the fixture going on) beside a refusal at connection B's secret key cell is a failure, named.
  const typeFailed = refusedReport();
  typeFailed.alertGuardStop = {...STOP, at: STEP.secretType};
  const own = typeFailed.items.find(item => item.id === 5);
  own.checks = [checkOf(FIXTURE_VERDICT_CHECK, 'FAIL'), ...OWN_STEPS.map(step => checkOf(step, step === STEP.type ? 'FAIL' : 'PASS'))];
  typeFailed.items.find(item => item.id === 6).checks.find(c => c.name === uiDeliveryCheck(STEP.secretType)).status = 'BLOCKED';
  const [typed, why] = CHECKS.acceptance(step, {exit: 1, readJson: () => typeFailed});
  assert.equal(typed, 'FAIL');
  assert.match(why, new RegExp(`item 5: ${STEP.type} FAIL`));
  assert.match(why, /the alert guard also refused secret: type the reference/);
  // An item of the three with no checks to read is not excused either.
  assert.equal(CHECKS.acceptance(step, {exit: 1, readJson: () => ({...refusedReport(), items: [{id: 6, status: 'BLOCKED'}]})})[0], 'FAIL');
});
