// #216's hosted witness, its pure half (scripts/probe/approval-cycles.mjs): the plan of steps, the classification of a
// bind's answer, and the judge over what the connections recorded.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {approvalCyclesPlan, judgeApprovalCycles, refusalOf} from '../scripts/probe/approval-cycles.mjs';

test('the plan binds the approved app, the declined one and the approved one again, then each cycle ends the task and binds both; js_reset and the idle stop once each', () => {
  const plan = approvalCyclesPlan(3, {resetAt: 2, idleAt: 3});
  assert.deepEqual(plan, [
    {step: 'bind', app: 'approve'}, {step: 'bind', app: 'decline'}, {step: 'bind', app: 'approve'},
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

// A connection's record as the script keeps it.
const bind = (app, asked, refusal = null, more = {}) => ({app, asked, refusal, failed: false, restarted: false, taskId: 't1', ...more});
function goodConnection(cycles = 2) {
  const binds = [bind('approve', 1), bind('decline', 1, 'declinedNow'), bind('approve', 0)];
  for (let n = 1; n <= cycles; n++) binds.push(bind('approve', 0, null, {taskId: `t${n + 1}`, restarted: n === 2}), bind('decline', 0, 'declinedEarlier', {taskId: `t${n + 1}`}));
  return {name: 'first', pid: 10, binds, other: 0, resets: 1, idles: 1};
}
const second = () => ({name: 'second', pid: 11, binds: [bind('approve', 1), bind('decline', 1, 'declinedNow')], other: 0, resets: 0, idles: 0});

test('the judge passes when each app is asked once per connection, the approved one is never refused and the declined one is refused from memory after its first answer', () => {
  const verdict = judgeApprovalCycles({cycles: 2, connections: [goodConnection(), second()]});
  assert.deepEqual(verdict.problems, []);
  assert.equal(verdict.ok, true);
  assert.match(verdict.detail, /first \(pid 10\): 7 binds, approve asked 1, decline asked 1, approve refused 0, approve failed otherwise 0; 3 tasks; 1 js_reset; 1 idle restart/);
});

test('the judge fails the loss #216 reports, and every other departure, naming each', () => {
  const lost = goodConnection();
  lost.binds[2] = bind('approve', 0, 'declinedEarlier');
  lost.binds[5] = bind('approve', 1, 'declinedNow', {taskId: 't3', restarted: true});
  assert.deepEqual(judgeApprovalCycles({cycles: 2, connections: [lost, second()]}).problems, [
    'first: the approved app was asked 2 times; once, at its first bind, is expected',
    'first: the approved app was refused at bind 3 (declinedEarlier): its approval was lost',
    'first: the approved app was refused at bind 6 (declinedNow): its approval was lost',
  ]);

  const asked = goodConnection();
  asked.binds[4] = bind('decline', 1, 'declinedNow', {taskId: 't2'});
  asked.other = 2;
  assert.deepEqual(judgeApprovalCycles({cycles: 2, connections: [asked, second()]}).problems, [
    'first: the declined app was asked 2 times; once, at its first bind, is expected',
    'first: the declined app\'s bind 5 was refused as declinedNow; declinedEarlier is expected after its first answer',
    'first: 2 other requests were asked of the client',
  ]);

  const flat = goodConnection();
  for (const b of flat.binds) Object.assign(b, {taskId: 't1', restarted: false});
  Object.assign(flat, {resets: 0, idles: 0});
  flat.binds[1] = bind('decline', 1, null);
  assert.deepEqual(judgeApprovalCycles({cycles: 2, connections: [flat, second()]}).problems, [
    'first: the declined app\'s bind 2 was not refused (none); declinedNow is expected',
    'first: 1 task across 2 end_task cycles; a new task after each end_task is expected',
    'first: js_reset never ran',
    'first: the idle stop never restarted the runtime',
  ]);

  assert.deepEqual(judgeApprovalCycles({cycles: 2, connections: [goodConnection()]}).problems, ['no second connection ran: a new connection must ask again']);
  const remembered = second();
  remembered.binds[0].asked = 0;
  assert.deepEqual(judgeApprovalCycles({cycles: 2, connections: [goodConnection(), remembered]}).problems, ['second: the approved app was asked 0 times; once, at its first bind, is expected']);
  const samePid = second();
  samePid.pid = 10;
  assert.deepEqual(judgeApprovalCycles({cycles: 2, connections: [goodConnection(), samePid]}).problems, ['second: served by the first connection\'s process (pid 10); a new connection is a new cua serve']);
});

test('an approved app\'s bind that fails for another reason (a capture, say) is reported, not judged an approval loss', () => {
  const connection = goodConnection();
  connection.binds[5] = bind('approve', 0, null, {failed: true, taskId: 't3', restarted: true});
  const verdict = judgeApprovalCycles({cycles: 2, connections: [connection, second()]});
  assert.deepEqual(verdict.problems, []);
  assert.match(verdict.detail, /approve failed otherwise 1/);
});
