// #216's hosted witness, its pure half (scripts/probe/approval-cycles.mjs): the plan of steps, the classification of a
// bind's answer, the alert sample, and the judge over what the connections recorded.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {alertInFront, approvalCyclesPlan, judgeApprovalCycles, refusalOf} from '../scripts/probe/approval-cycles.mjs';

test('the plan binds the approved app, the declined one and the approved one again, then each cycle ends the task and binds both; js_reset and the idle stop once each', () => {
  const plan = approvalCyclesPlan(3, {resetAt: 2, idleAt: 3});
  assert.deepEqual(plan, [
    {step: 'bind', app: 'approve', cycle: 0}, {step: 'bind', app: 'decline', cycle: 0}, {step: 'bind', app: 'approve', cycle: 0},
    {step: 'end_task', cycle: 1}, {step: 'bind', app: 'approve', cycle: 1}, {step: 'bind', app: 'decline', cycle: 1},
    {step: 'end_task', cycle: 2}, {step: 'js_reset', cycle: 2}, {step: 'bind', app: 'approve', cycle: 2}, {step: 'bind', app: 'decline', cycle: 2},
    {step: 'end_task', cycle: 3}, {step: 'idle', cycle: 3}, {step: 'bind', app: 'approve', cycle: 3}, {step: 'bind', app: 'decline', cycle: 3},
  ]);
  assert.equal(approvalCyclesPlan(20).filter(s => s.step === 'end_task').length, 20);
  assert.deepEqual(approvalCyclesPlan(20).filter(s => s.step === 'js_reset' || s.step === 'idle').map(s => [s.step, s.cycle]), [['js_reset', 5], ['idle', 10]]);
});

test('a bind\'s answer is classified by the policy\'s sentence alone, whatever follows the first line', () => {
  assert.equal(refusalOf('bound'), null);
  assert.equal(refusalOf('cua: the runtime was stopped after 8 s without a tool call and has restarted for this call. …\nbound'), null);
  assert.equal(refusalOf('Error: Computer Use was not approved to use Calculator: the client declined the approval request; it is not asked again on this connection.\n    at x'), 'declinedNow');
  assert.equal(refusalOf('Computer Use was not approved to use Calculator: it was declined earlier on this connection, so it was not asked again.'), 'declinedEarlier');
  assert.equal(refusalOf('Computer Use was not approved to use TextEdit: the client cancelled the approval request without an answer.'), 'cancelled');
  assert.equal(refusalOf('Computer Use was not approved to use TextEdit'), 'notApproved', 'an engine before #216\'s sentence');
});

test('an alert is in front when a system prompt is the frontmost app or owns the top window', () => {
  assert.equal(alertInFront({front: 'com.apple.TextEdit', keyOwnerPid: 10, alertPids: [99]}), false);
  assert.equal(alertInFront({front: 'com.apple.UserNotificationCenter', keyOwnerPid: 10, alertPids: []}), true);
  assert.equal(alertInFront({front: 'com.apple.TextEdit', keyOwnerPid: 99, alertPids: [99]}), true, 'key but not front');
  assert.equal(alertInFront(null), false);
});

// A connection's record as the script keeps it.
const CONNECTION = 'a5a26df15524';
const approval = (action, answeredBy, runtimeGeneration = 0, connection = CONNECTION) => ({action, answeredBy, connection, runtimeGeneration, scope: 'connection'});
const bind = (app, cycle, asked, refusal = null, more = {}) => ({app, cycle, asked, refusal, failed: false, restarted: false, taskId: `t${cycle}`, alert: false, activated: true,
  approval: approval(app === 'approve' ? 'accept' : 'decline', asked ? 'client' : 'memory', more.generation ?? (cycle >= 2 ? 1 : 0)), ...more});
function goodConnection(cycles = 2) {
  const binds = [bind('approve', 0, 1), bind('decline', 0, 1, 'declinedNow'), bind('approve', 0, 0)];
  for (let n = 1; n <= cycles; n++) binds.push(bind('approve', n, 0, null, {restarted: n === 2}), bind('decline', n, 0, 'declinedEarlier'));
  const steps = [];
  for (let n = 1; n <= cycles; n++) steps.push({step: 'end_task', cycle: n, ok: true}, ...(n === 1 ? [{step: 'js_reset', cycle: 1, ok: true}] : []));
  return {name: 'first', pid: 10, binds, steps, other: 0};
}
const second = () => ({name: 'second', pid: 11, binds: [bind('approve', 0, 1), bind('decline', 0, 1, 'declinedNow')].map(b => ({...b, approval: {...b.approval, connection: 'b1b2b3b4b5b6'}})), steps: [], other: 0});
const judge = connections => judgeApprovalCycles({cycles: 2, idleAt: 2, connections});

test('the judge passes when each app is asked once per connection, the approved one is never refused and the declined one is refused from memory after its first answer', () => {
  const verdict = judge([goodConnection(), second()]);
  assert.deepEqual(verdict.problems, []);
  assert.deepEqual(verdict.inconclusive, []);
  assert.equal(verdict.verdict, 'pass');
  assert.equal(verdict.ok, true);
  assert.match(verdict.detail, /first \(pid 10, connection a5a26df15524\): 7 binds, approve asked 1, decline asked 1, approve refused 0, approve failed after its approval 0, inconclusive 0; 3 tasks; 1 js_reset; 1 restart/);
});

test('the judge fails the loss #216 reports, and every other departure, naming each', () => {
  const lost = goodConnection();
  lost.binds[2] = bind('approve', 0, 0, 'declinedEarlier', {approval: approval('decline', 'memory')});
  lost.binds[5] = bind('approve', 2, 1, 'declinedNow', {restarted: true, approval: approval('decline', 'client', 1)});
  assert.deepEqual(judge([lost, second()]).problems, [
    'first: the approved app was asked 2 times; once, at its first bind that reached the approval, is expected',
    'first: the approved app was refused at bind 3 (declinedEarlier): its approval was lost',
    'first: the approved app was refused at bind 6 (declinedNow): its approval was lost',
  ]);

  // A fresh ask for the approved app after its persisted accept, even one the client accepts again, is a loss too.
  const reasked = goodConnection();
  reasked.binds[3] = bind('approve', 1, 1);
  assert.deepEqual(judge([reasked, second()]).problems, ['first: the approved app was asked 2 times; once, at its first bind that reached the approval, is expected']);

  const asked = goodConnection();
  asked.binds[4] = bind('decline', 1, 1, 'declinedNow');
  asked.other = 2;
  assert.deepEqual(judge([asked, second()]).problems, [
    'first: the declined app was asked 2 times; once, at its first bind that reached the approval, is expected',
    'first: the declined app\'s bind 5 was refused as declinedNow; declinedEarlier is expected after its first answer',
    'first: 2 other requests were asked of the client',
  ]);

  const disagrees = goodConnection();
  disagrees.binds[6].approval = approval('decline', 'client', 1);
  disagrees.binds[1] = {...disagrees.binds[1], approval: {...disagrees.binds[1].approval, connection: 'ffffffffffff'}};
  assert.deepEqual(judge([disagrees, second()]).problems, [
    'first: bind 7 (declined) was answered by client by its cua/approval, where memory is expected',
    'first: cua/approval names 2 connections (a5a26df15524, ffffffffffff); one is expected',
  ]);

  const flat = goodConnection();
  for (const b of flat.binds) Object.assign(b, {taskId: 't0', restarted: false});
  flat.steps = [{step: 'end_task', cycle: 1, ok: false, detail: 'isError'}, {step: 'end_task', cycle: 2, ok: true}];
  flat.binds[1] = bind('decline', 0, 1, null);
  assert.deepEqual(judge([flat, second()]).problems, [
    'first: the declined app\'s bind 2 was not refused (none); declinedNow is expected',
    'first: end_task of cycle 1 failed (isError)',
    'first: cycle 1 ran in cycle 0\'s task; end_task must start a new one',
    'first: cycle 2 ran in cycle 0\'s task; end_task must start a new one',
    'first: js_reset never ran',
    'first: the first bind of cycle 2 did not open with the restart notice: the idle stop was not seen',
  ]);

  const mixed = goodConnection();
  mixed.binds[4] = {...mixed.binds[4], taskId: 'tX'};
  mixed.binds[5] = {...mixed.binds[5], approval: approval('accept', 'memory', 0)};
  assert.deepEqual(judge([mixed, second()]).problems, [
    'first: cycle 1\'s binds ran in 2 tasks; one is expected',
    'first: the bind after the idle stop went to runtime generation 0, not past 0',
  ]);

  assert.deepEqual(judge([goodConnection()]).problems, ['no second connection ran: a new connection must ask again']);
  const remembered = second();
  remembered.binds[0] = {...remembered.binds[0], asked: 0, approval: {...remembered.binds[0].approval, answeredBy: 'memory'}};
  assert.deepEqual(judge([goodConnection(), remembered]).problems, ['second: the approved app was asked 0 times; once, at its first bind that reached the approval, is expected']);
  const same = second();
  same.pid = 10;
  same.binds = same.binds.map(b => ({...b, approval: {...b.approval, connection: CONNECTION}}));
  assert.deepEqual(judge([goodConnection(), same]).problems, [
    'second: served by the first connection\'s process (pid 10); a new connection is a new cua serve',
    'second: cua/approval names the first connection\'s id (a5a26df15524); a new connection has its own',
  ]);
});

test('a bind that failed is evidence only with its cua/approval; one without it, or with an alert in front, is NO VERDICT, never a pass', () => {
  // Failed after the approval passed (a capture, say): the approval is shown, so it counts.
  const after = goodConnection();
  after.binds[3] = {...after.binds[3], failed: true};
  assert.equal(judge([after, second()]).verdict, 'pass');
  assert.match(judge([after, second()]).detail, /approve failed after its approval 1/);

  // Every approved bind failed before its approval was shown (no cua/approval): nothing is proven.
  const before = goodConnection();
  for (const b of before.binds) if (b.app === 'approve') Object.assign(b, {failed: true, approval: null, asked: 0});
  const verdict = judge([before, second()]);
  assert.deepEqual(verdict.problems, []);
  assert.equal(verdict.verdict, 'no verdict');
  assert.equal(verdict.ok, false);
  assert.equal(verdict.inconclusive.length, 4);
  assert.match(verdict.inconclusive[0], /first: bind 1 \(approve\): it failed before its approval was shown/);

  const alert = goodConnection();
  alert.binds[4] = {...alert.binds[4], alert: true};
  alert.binds[3] = {...alert.binds[3], activated: false};
  assert.deepEqual(judge([alert, second()]).inconclusive, ['first: bind 4 (approve): the approved app did not take front and key before it', 'first: bind 5 (decline): an alert was in front or key']);
  assert.equal(judge([alert, second()]).verdict, 'no verdict');

  // A failure outranks a NO VERDICT.
  alert.binds[5] = bind('approve', 2, 0, 'declinedEarlier', {restarted: true, approval: approval('decline', 'memory', 1)});
  assert.equal(judge([alert, second()]).verdict, 'fail');
});
