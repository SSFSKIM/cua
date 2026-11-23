// Sitting D's alert guard and placement (scripts/hosted-sittings/textedit-guard.mjs; rulings 1154, 1160, 1164): the
// scratch document's and accept-native's TextEdit fixture's windows placed clear of the alerts, and each fixture cell
// that types or presses a key refused with the alert holding the key (the key-cell premise); the refusal reaches the
// hosted check as NO VERDICT, and only the fixture's own checks may go unproven by it. All with doubles.
import assert from 'node:assert/strict';
import test from 'node:test';
import {alertGuardRefusal, APPROVALS_CHECK, FIXTURE_VERDICT_CHECK, fixtureGuardRecord, fixtureKeyCell, OWN_STEPS, SECRET_STEPS, STEP, uiDeliveryCheck} from '../../scripts/accept/textedit.mjs';
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

// The key-cell premise A and C share (scripts/hosted-sittings/alert-guard.mjs keyCause): route 3's activation click
// goes to the target's pid only, so a key cell is refused when the alert holds the key, and the key guard's own check
// refuses it when TextEdit is not in front; an alert merely overlapping the document refuses no key cell.
test('sitting D: the fixture\'s key cells follow the key-cell premise: refused only with the alert holding the key; a reading not taken refuses nothing of its own', () => {
  const holding = textEditGuard({pids: () => [600], io: io(rect(700, 31, 627, 677), {key: UNC})});
  assert.equal(alertGuardRefusal(holding).category, 'alert');
  assert.match(alertGuardRefusal(holding).detail, /holds the key/);
  assert.equal(alertGuardRefusal(textEditGuard({pids: () => [600], io: io(rect(79, 31, 627, 677))})), null, 'an overlapping alert alone is the pointer rule\'s, not a key cell\'s');
  assert.equal(alertGuardRefusal(textEditGuard({pids: () => [600], io: io(rect(700, 31, 627, 677))})), null);
  assert.equal(alertGuardRefusal({check: () => { throw new Error('pgrep failed'); }}), null, 'as A\'s keyGuard: the front check still stands before the cell');
});

// runTextEdit's key cell (scripts/accept/textedit.mjs fixtureKeyCell): the pause wait first, then the guard's fresh
// reading, then the front check and the cell; a refusal sends nothing and is recorded as every sitting records it, and
// it reaches accept-native's report (fixtureGuardRecord) and the hosted check as NO VERDICT.
test('sitting D: a refused key cell sends nothing, reads the guard after the pause, and its record reaches the hosted check as NO VERDICT', async () => {
  const order = [], sent = [];
  const session = {pauseWait: async () => { order.push('pause'); }, dispatch: async code => { order.push('dispatch'); sent.push(code); return {ok: true}; }};
  const holding = {check: () => { order.push('guard'); return {category: 'alert', detail: 'com.apple.UserNotificationCenter holds the key'}; }};
  const observations = {};
  const out = await fixtureKeyCell({session, step: STEP.type, keys: ['typeText'], code: 'type', stepMs: 5, frontmost: () => { order.push('frontmost'); return 'com.apple.TextEdit'; }, guard: holding, observations});
  assert.deepEqual(order, ['pause', 'guard'], 'the guard is read after the pause, and nothing is checked or sent after a refusal');
  assert.deepEqual(sent, []);
  assert.equal(out.sent, false);
  assert.equal(out.refused.category, 'alert');
  assert.deepEqual(out.mark.alertGuard, {cause: 'alert', detail: 'com.apple.UserNotificationCenter holds the key'});
  assert.deepEqual(observations.alertGuardStop, {cause: 'alert', detail: 'com.apple.UserNotificationCenter holds the key', at: STEP.type});
  assert.deepEqual(observations.alertGuardCounts, {[STEP.type]: {alert: 1, unread: 0}});
  const kept = fixtureGuardRecord(observations);
  assert.deepEqual(kept, {alertGuardStop: observations.alertGuardStop, alertGuardCounts: observations.alertGuardCounts});
  assert.deepEqual(fixtureGuardRecord({}), {}, 'no refusal: nothing in the report');
  assert.equal(CHECKS.acceptance({record: '/o/a.json'}, {exit: 1, readJson: () => ({...refusedReport(), alertGuardStop: undefined, ...kept})})[0], 'NO VERDICT');

  // Clear: the pause, the guard, the front check, then the cell.
  order.length = 0;
  const clear = await fixtureKeyCell({session, step: STEP.type, keys: ['typeText'], code: 'type', stepMs: 5, frontmost: () => { order.push('frontmost'); return 'com.apple.TextEdit'; }, guard: {check: () => { order.push('guard'); return null; }}, observations: {}});
  assert.deepEqual(order, ['pause', 'guard', 'frontmost', 'dispatch']);
  assert.deepEqual(clear, {sent: true, result: {ok: true}});
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
  // An item of the three with no checks to read is not excused either.
  assert.equal(CHECKS.acceptance(step, {exit: 1, readJson: () => ({...refusedReport(), items: [{id: 6, status: 'BLOCKED'}]})})[0], 'FAIL');
});
