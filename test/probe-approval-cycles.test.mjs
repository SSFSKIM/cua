// #216's hosted witness, its pure half (scripts/probe/approval-cycles.mjs): the plan of steps, the classification of a
// bind's answer, the screen sample, and the judge over what the connections recorded.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {approvalCyclesPlan, attestationStop, bindRecord, judgeApprovalCycles, refusalOf, resetStep, screenState, stoppedVerdict, verdictLine} from '../scripts/probe/approval-cycles.mjs';
import {STATE_1} from '../scripts/probe/lib.mjs';

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

test('the screen is clear, has an alert in front or key, or could not be read; an unread sample proves no alert absent', () => {
  assert.equal(screenState({front: 'com.apple.TextEdit', keyOwnerPid: 10, alertPids: [99]}), 'clear');
  assert.equal(screenState({front: 'com.apple.UserNotificationCenter', keyOwnerPid: 10, alertPids: []}), 'alert');
  assert.equal(screenState({front: 'com.apple.TextEdit', keyOwnerPid: 99, alertPids: [99]}), 'alert', 'key but not front');
  assert.equal(screenState({front: null, keyOwnerPid: 10, alertPids: []}), 'unread', 'the frontmost app unread');
  assert.equal(screenState({front: 'com.apple.TextEdit', keyOwnerPid: null, alertPids: []}), 'unread', 'the key window unread');
  assert.equal(screenState(null), 'unread');
});

// A connection's record as the script keeps it.
const CONNECTION = 'a5a26df15524';
const approval = (action, answeredBy, runtimeGeneration = 0, connection = CONNECTION) => ({action, answeredBy, connection, runtimeGeneration, scope: 'connection'});
const bind = (app, cycle, asked, refusal = null, more = {}) => ({app, cycle, dispatched: true, blocked: null, after: 'clear', asked, refusal, failed: false, restarted: false, taskId: `t${cycle}`,
  approval: approval(app === 'approve' ? 'accept' : 'decline', asked ? 'client' : 'memory', more.generation ?? (cycle >= 2 ? 1 : 0)), ...more});
function goodConnection(cycles = 2) {
  const binds = [bind('approve', 0, 1), bind('decline', 0, 1, 'declinedNow'), bind('approve', 0, 0)];
  for (let n = 1; n <= cycles; n++) binds.push(bind('approve', n, 0, null, {restarted: n === 2}), bind('decline', n, 0, 'declinedEarlier'));
  const steps = [];
  for (let n = 1; n <= cycles; n++) steps.push({step: 'end_task', cycle: n, ok: true}, ...(n === 1 ? [{step: 'js_reset', cycle: 1, ok: true}] : []));
  return {name: 'first', pid: 10, binds, steps, other: 0};
}
const second = () => ({name: 'second', pid: 11, binds: [bind('approve', 0, 1), bind('decline', 0, 1, 'declinedNow')].map(b => ({...b, approval: {...b.approval, connection: 'b1b2b3b4b5b6'}})), steps: [], other: 0});
const judge = (connections, more = {}) => judgeApprovalCycles({cycles: 2, idleAt: 2, connections, ...more});

test('the judge passes when each app is asked once per connection, the approved one is never refused and the declined one is refused from memory after its first answer', () => {
  const verdict = judge([goodConnection(), second()]);
  assert.deepEqual(verdict.problems, []);
  assert.deepEqual(verdict.inconclusive, []);
  assert.equal(verdict.verdict, 'pass');
  assert.equal(verdict.ok, true);
  assert.match(verdict.detail, /first \(pid 10, connection a5a26df15524\): 7 binds, 7 sent, approve asked 1, decline asked 1, approve refused 0, approve failed after its approval 0, inconclusive 0; 3 tasks; 1 js_reset; 1 restart/);
});

test('the judge fails the loss #216 reports, and every other departure, naming each', () => {
  const lost = goodConnection();
  lost.binds[2] = bind('approve', 0, 0, 'declinedEarlier', {approval: approval('decline', 'memory')});
  lost.binds[5] = bind('approve', 2, 1, 'declinedNow', {restarted: true, approval: approval('decline', 'client', 1)});
  assert.deepEqual(judge([lost, second()]).problems, [
    'first: the approved app was refused at bind 3 (declinedEarlier): its approval was lost',
    'first: the approved app was asked again at bind 6 (2 asks); once per connection is expected',
    'first: the approved app was refused at bind 6 (declinedNow): its approval was lost',
  ]);

  // A fresh ask for the approved app after its persisted accept, even one the client accepts again, is a loss too.
  // Two asks within the first bind are a second ask too: the count is per connection, whichever bind saw it.
  const twice = goodConnection();
  twice.binds[0] = bind('approve', 0, 2);
  const doubled = judge([twice, second()]);
  assert.deepEqual(doubled.problems, ['first: the approved app was asked again at bind 1 (2 asks); once per connection is expected']);
  assert.equal(doubled.verdict, 'fail');
  assert.match(doubled.detail, /approve asked 2/);
  const secondTwice = second();
  secondTwice.binds[1] = {...secondTwice.binds[1], asked: 3};
  assert.deepEqual(judge([goodConnection(), secondTwice]).problems, ['second: the declined app was asked again at bind 2 (3 asks); once per connection is expected']);

  const reasked = goodConnection();
  reasked.binds[3] = bind('approve', 1, 1);
  assert.deepEqual(judge([reasked, second()]).problems, ['first: the approved app was asked again at bind 4 (2 asks); once per connection is expected']);

  // A refusal is judged against its own ask: a fresh decline where none was asked, a second ask of the declined app.
  const asked = goodConnection();
  asked.binds[4] = bind('decline', 1, 0, 'declinedNow');
  asked.binds[6] = bind('decline', 2, 1, 'declinedNow');
  asked.other = 2;
  assert.deepEqual(judge([asked, second()]).problems, [
    'first: the declined app\'s bind 5 was refused as declinedNow; declinedEarlier is expected by its ask',
    'first: the declined app was asked again at bind 7 (2 asks); once per connection is expected',
    'first: 2 other requests were asked of the client',
  ]);

  const disagrees = goodConnection();
  disagrees.binds[3].approval = approval('decline', 'memory', 0);
  disagrees.binds[6].approval = approval('decline', 'client', 1);
  disagrees.binds[1] = {...disagrees.binds[1], approval: {...disagrees.binds[1].approval, connection: 'ffffffffffff'}};
  assert.deepEqual(judge([disagrees, second()]).problems, [
    'first: bind 4 (approved) was not refused, but its cua/approval says decline',
    'first: bind 7 (declined) was answered by client by its cua/approval, where its ask says memory',
    'first: cua/approval names 2 connections (a5a26df15524, ffffffffffff); one is expected',
  ]);

  const flat = goodConnection();
  for (const b of flat.binds) Object.assign(b, {taskId: 't0', restarted: false});
  flat.steps = [{step: 'end_task', cycle: 1, ok: false, detail: 'isError'}, {step: 'end_task', cycle: 2, ok: true}];
  flat.binds[1] = bind('decline', 0, 1, null, {taskId: 't0'});
  assert.deepEqual(judge([flat, second()]).problems, [
    'first: the declined app\'s bind 2 was not refused (none); declinedNow is expected by its ask',
    'first: end_task of cycle 1 failed (isError)',
    'first: cycle 1 ran in cycle 0\'s task; end_task must start a new one',
    'first: cycle 2 ran in cycle 0\'s task; end_task must start a new one',
    'first: js_reset never ran',
    'first: bind 6, the first after the idle stop, did not open with the restart notice',
  ]);

  const mixed = goodConnection();
  mixed.binds[4] = {...mixed.binds[4], taskId: 'tX'};
  mixed.binds[5] = {...mixed.binds[5], approval: approval('accept', 'memory', 0)};
  assert.deepEqual(judge([mixed, second()]).problems, [
    'first: cycle 1\'s binds ran in 2 tasks; one is expected',
    'first: bind 6, after the idle stop, went to runtime generation 0, not past bind 5\'s 0',
  ]);

  assert.deepEqual(judge([goodConnection()]).problems, ['no second connection ran: a new connection must ask again']);
  const remembered = second();
  remembered.binds[0] = {...remembered.binds[0], asked: 0, approval: {...remembered.binds[0].approval, answeredBy: 'memory'}};
  assert.deepEqual(judge([goodConnection(), remembered]).problems, ['second: bind 1 (approved) was answered without the client ever being asked on this connection']);
  const same = second();
  same.pid = 10;
  same.binds = same.binds.map(b => ({...b, approval: {...b.approval, connection: CONNECTION}}));
  assert.deepEqual(judge([goodConnection(), same]).problems, [
    'second: served by the first connection\'s process (pid 10); a new connection is a new cua serve',
    'second: cua/approval names the first connection\'s id (a5a26df15524); a new connection has its own',
  ]);
});

test('on cua\'s host every judged bind carries the complete stamp: the fallback shape, or none, fails', () => {
  const fallback = b => ({...b, approval: {action: b.approval.action, answeredBy: b.approval.answeredBy, connection: null, runtimeGeneration: null, scope: null}});
  const first = goodConnection();
  first.binds = first.binds.map(fallback);
  const verdict = judge([first, {...second(), binds: second().binds.map(fallback)}]);
  assert.equal(verdict.verdict, 'fail');
  assert.equal(verdict.problems.length, 9, 'each of the nine binds');
  assert.equal(verdict.problems[0], 'first: bind 1 (approved) carries an incomplete cua/approval (connection, runtimeGeneration, scope)');
  assert.ok(verdict.inconclusive.includes('second: the connection ids could not both be read, so a new connection is not shown to have a new id'));
  assert.ok(verdict.inconclusive.includes('first: bind 6\'s runtime generation could not be compared with one before the idle stop'));

  const none = goodConnection();
  none.binds[4] = {...none.binds[4], approval: null};
  assert.deepEqual(judge([none, second()]).problems, ['first: bind 5 (declined) carries no cua/approval']);
});

test('which refusal is fresh comes from the asks: a first decline under an alert leaves the cached one after it judged as cached', () => {
  const first = goodConnection();
  first.binds[1] = {...first.binds[1], after: 'alert'};
  const verdict = judge([first, second()]);
  assert.deepEqual(verdict.problems, []);
  assert.deepEqual(verdict.inconclusive, ['first: bind 2 (decline): an alert was in front or key after it']);
  assert.equal(verdict.verdict, 'no verdict');

  // The approved app's first ask unread after it: its remembered accepts after it still count.
  const approved = goodConnection();
  approved.binds[0] = {...approved.binds[0], after: 'unread'};
  assert.deepEqual(judge([approved, second()]).problems, []);
  assert.deepEqual(judge([approved, second()]).inconclusive, ['first: bind 1 (approve): the front and key after it could not be read']);
});

test('a bind not sent, under an alert, unread after, or failed without its approval is NO VERDICT, never a pass; a failure outranks it', () => {
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
  assert.equal(verdict.inconclusive[0], 'first: bind 1 (approve): it failed before its approval was shown');

  const skipped = goodConnection();
  skipped.binds[3] = {...skipped.binds[3], dispatched: false, blocked: 'activation', asked: 0, approval: null, taskId: null, after: null};
  skipped.binds[4] = {...skipped.binds[4], dispatched: false, blocked: 'alert', asked: 0, approval: null, taskId: null, after: null};
  skipped.binds[6] = {...skipped.binds[6], after: 'unread'};
  assert.deepEqual(judge([skipped, second()]).inconclusive, [
    'first: bind 4 (approve): not sent: the approved app did not take front and key',
    'first: bind 5 (decline): not sent: an alert was in front or key before it',
    'first: bind 7 (decline): the front and key after it could not be read',
  ]);
  assert.equal(judge([skipped, second()]).verdict, 'no verdict');

  skipped.binds[5] = bind('approve', 2, 0, 'declinedEarlier', {restarted: true, approval: approval('decline', 'memory', 1)});
  assert.equal(judge([skipped, second()]).verdict, 'fail');
});

test('a run that stopped early leaves its unexecuted steps NO VERDICT; what it did observe can still fail it', () => {
  const partial = goodConnection();
  partial.binds = partial.binds.slice(0, 4);
  partial.steps = [{step: 'end_task', cycle: 1, ok: true}];
  const stopped = judge([partial], {complete: false});
  assert.deepEqual(stopped.problems, []);
  assert.deepEqual(stopped.inconclusive, ['not run: js_reset', 'not run: the binds after the idle stop (cycle 2)', 'not run: the second connection']);
  assert.equal(stopped.verdict, 'no verdict');

  assert.deepEqual(judge([partial]).problems, ['first: js_reset never ran', 'first: no bind ran in cycle 2, after the idle stop', 'no second connection ran: a new connection must ask again']);
  assert.equal(judge([], {complete: false}).verdict, 'no verdict');
  assert.equal(judge([]).verdict, 'fail');

  partial.binds[2] = bind('approve', 0, 0, 'declinedEarlier', {approval: approval('decline', 'memory')});
  assert.equal(judge([partial], {complete: false}).verdict, 'fail');
});

test('an end_task that found no task because every bind before it was blocked is NO VERDICT; any other end_task failure fails', () => {
  const blocked = goodConnection();
  for (const k of [3, 4]) blocked.binds[k] = {...blocked.binds[k], dispatched: false, blocked: 'activation', asked: 0, approval: null, taskId: null, after: null};
  blocked.steps = blocked.steps.map(step => (step.step === 'end_task' && step.cycle === 2 ? {step: 'end_task', cycle: 2, ok: false, detail: 'status noop', noTask: true} : step));
  const verdict = judge([blocked, second()]);
  assert.deepEqual(verdict.problems, []);
  assert.ok(verdict.inconclusive.includes('first: end_task of cycle 2 found no task (status noop): no call had opened one since the last'), verdict.inconclusive.join(' | '));
  assert.equal(verdict.verdict, 'no verdict');

  blocked.steps = blocked.steps.map(step => (step.noTask ? {step: 'end_task', cycle: 2, ok: false, detail: 'status noop'} : step));
  assert.deepEqual(judge([blocked, second()]).problems, ['first: end_task of cycle 2 failed (status noop)']);
});

// Ruling 1149: the witness drives cua's engine; a bind the vendor's engine answered (state 1) measured nothing of cua's,
// so the run stops NO VERDICT, the cause named, never a pass and never a fail of cua's engine. What it observed before
// on cua's engine can still fail it, as any stopped run's can.
test('ruling 1149: a bind that attests the vendor engine stops the run NO VERDICT naming state 1; the run prints its verdict line', () => {
  const expected = {engine: 'cua', version: '0.2.0', build: 'a'.repeat(64)};
  assert.equal(attestationStop({'cua/nativeEngine': {...expected}}, expected), null);
  const stop = attestationStop({'cua/nativeEngine': {engine: 'vendor', version: null, build: 'r'}}, expected);
  assert.equal(stop.noVerdict, true);
  assert.ok(stop.message.startsWith(`refused on the attestation: ${STATE_1}`), stop.message);
  assert.equal(attestationStop({}, expected).noVerdict, true, 'no attestation: the engine that answered is unknown');

  const partial = goodConnection();
  partial.binds = partial.binds.slice(0, 4);
  const stopped = {message: `first: ${stop.message}`, noVerdict: stop.noVerdict};
  const verdict = stoppedVerdict(judge([partial], {complete: false}), stopped);
  assert.deepEqual([verdict.verdict, verdict.ok, verdict.stopped], ['no verdict', false, stopped.message]);
  partial.binds[2] = bind('approve', 0, 0, 'declinedEarlier', {approval: approval('decline', 'memory')});
  assert.equal(stoppedVerdict(judge([partial], {complete: false}), stopped).verdict, 'fail', 'what cua\'s engine did before still fails it');
  assert.equal(stoppedVerdict(judge([goodConnection()], {complete: false}), {message: 'first: no answer', noVerdict: false}).verdict, 'fail', 'any other stop fails');
  assert.equal(stoppedVerdict(judge([goodConnection(), second()]), null).verdict, 'pass');
  assert.deepEqual(['pass', 'fail', 'no verdict'].map(verdictLine), ['VERDICT: PASS', 'VERDICT: FAIL', 'VERDICT: NO VERDICT']);
});

// The bind the script appends when a stop interrupts it (approval-cycles.mjs: bindRecord, sent, asked by whichever engine
// answered, then the stop marked on it before its finally appends it): no task id, no approval, nothing read after.
const stoppedBind = (app, cycle, stop) => Object.assign(bindRecord({app, cycle, blocked: null}), {asked: 1, unmeasured: stop.message});

test('ruling 1149: the bind a vendor or missing attestation stopped is unmeasured, outside the task, restart and approval judgement; earlier attested binds are still judged', () => {
  const expected = {engine: 'cua', version: '0.2.0', build: 'a'.repeat(64)};
  for (const meta of [{'cua/nativeEngine': {engine: 'vendor', version: null, build: 'r'}}, {}]) {
    const stop = attestationStop(meta, expected);
    const partial = goodConnection();
    partial.binds = [...partial.binds.slice(0, 3), stoppedBind('approve', 1, stop)];
    const judged = judge([partial], {complete: false});
    assert.deepEqual(judged.problems, [], JSON.stringify(meta));
    assert.ok(judged.inconclusive.some(line => line.startsWith(`first: bind 4 (approve): not measured: ${stop.message}`)), judged.inconclusive.join(' | '));
    assert.equal(stoppedVerdict(judged, {message: stop.message, noVerdict: true}).verdict, 'no verdict');

    // The stopped bind's asks are not the connection's: a later first bind is not "asked again" by it.
    const second = {name: 'second', pid: 11, binds: [stoppedBind('approve', 0, stop)], steps: [], other: 0};
    assert.ok(!judge([goodConnection(), second], {complete: false}).problems.some(p => /asked again|task id|cua\/approval/.test(p)));

    // A failure on an earlier, attested bind still fails the run.
    const lost = goodConnection();
    lost.binds = [...lost.binds.slice(0, 2), bind('approve', 0, 0, 'declinedEarlier', {approval: approval('decline', 'memory')}), stoppedBind('approve', 1, stop)];
    assert.equal(stoppedVerdict(judge([lost], {complete: false}), {message: stop.message, noVerdict: true}).verdict, 'fail');
  }
});

test('ruling 1149: a js_reset counts as done only when it attests cua\'s engine; a pre-dispatch rejection stays a failure of its own', () => {
  const expected = {engine: 'cua', version: '0.2.0', build: 'a'.repeat(64)};
  const answered = (meta, isError = false) => ({content: [{type: 'text', text: isError ? 'Error: x' : 'reset'}], isError, _meta: {'cua/taskId': 't1', ...meta}});
  assert.deepEqual(resetStep(answered({'cua/nativeEngine': expected}), expected, 5), {step: {step: 'js_reset', cycle: 5, ok: true}, stop: null});
  for (const meta of [{'cua/nativeEngine': {engine: 'vendor', version: null, build: 'r'}}, {}]) {
    const {step, stop} = resetStep(answered(meta), expected, 5);
    assert.equal(step.ok, false);
    assert.equal(step.unmeasured, stop.message);
    assert.equal(stop.noVerdict, true);
    const partial = goodConnection();
    partial.steps = [{step: 'end_task', cycle: 1, ok: true}, step];
    const judged = judge([partial], {complete: false});
    assert.ok(!judged.problems.some(p => /js_reset/.test(p)), judged.problems.join(' | '));
    assert.ok(judged.inconclusive.some(line => line.startsWith('first: js_reset of cycle 5 not measured')), judged.inconclusive.join(' | '));
  }
  const failed = resetStep(answered({'cua/nativeEngine': expected}, true), expected, 5);
  assert.deepEqual([failed.step.ok, failed.step.detail, failed.stop], [false, 'Error: x', null]);
  const rejected = resetStep({content: [{type: 'text', text: 'ending'}], isError: true, structuredContent: {status: 'error', code: 'task_ending'}}, expected, 5);
  assert.deepEqual([rejected.step.ok, rejected.step.detail, rejected.stop], [false, 'rejected before dispatch (task_ending)', null]);
});
