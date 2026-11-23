// #216's hosted witness, its pure half (the script is scripts/approval-cycles.mjs; the gate's disposition is
// docs/evidence/2026-11-23-own-native-engine/gates/216.md): the steps a connection runs, the class of a bind's refusal
// read from the policy's sentence (src/services/engine/policy.mjs notApproved), whether a sample of the screen has an
// alert in front, and the judge over what each connection recorded. An approval is judged by behaviour (what the client
// was asked, whether a bind was refused for approval) and by the call's `cua/approval` result meta, which on cua's own
// host carries the connection's stamp (who answered, the connection's opaque id, the runtime generation).
import {attestationProblem, boundedError, isLifecycleRejection} from './lib.mjs';
import {resultText} from '../accept/mcp-session.mjs';

const NOT_APPROVED = 'Computer Use was not approved to use ';
// System prompts that take the front (scripts/mini-rules.mjs SYSTEM_PROMPTS): replayd's capture alert is
// UserNotificationCenter's (H0 (ii)). A bind with one in front or key is NO VERDICT (rulings 1136 and 1141).
export const ALERT_APPS = Object.freeze(['com.apple.UserNotificationCenter', 'com.apple.SecurityAgent', 'com.apple.coreservices.uiagent']);

// The steps of the first connection: the approved app, the declined one and the approved one again in one task, then
// `cycles` times an end_task and a bind of each in the new task; js_reset in cycle `resetAt` and an idle stop (the
// runtime replaced under the connection) in cycle `idleAt`, each before that cycle's binds.
export function approvalCyclesPlan(cycles, {resetAt = 5, idleAt = 10} = {}) {
  const plan = [{step: 'bind', app: 'approve', cycle: 0}, {step: 'bind', app: 'decline', cycle: 0}, {step: 'bind', app: 'approve', cycle: 0}];
  for (let cycle = 1; cycle <= cycles; cycle++) {
    plan.push({step: 'end_task', cycle});
    if (cycle === resetAt) plan.push({step: 'js_reset', cycle});
    if (cycle === idleAt) plan.push({step: 'idle', cycle});
    plan.push({step: 'bind', app: 'approve', cycle}, {step: 'bind', app: 'decline', cycle});
  }
  return plan;
}

// A bind result's text -> null (no approval refusal), or the refusal's class: declinedNow (the client declined this
// request), declinedEarlier (the connection's memory answered), cancelled, declined (a decline whose provenance the host
// could not tell), or notApproved (the bare sentence of an engine before #216's). Only the sentence's line is read.
export function refusalOf(text) {
  const line = String(text ?? '').split('\n').find(l => l.includes(NOT_APPROVED));
  if (line === undefined) return null;
  if (line.includes(': it was declined earlier on this connection')) return 'declinedEarlier';
  if (line.includes(': the client declined the approval request')) return 'declinedNow';
  if (line.includes(': the client cancelled the approval request')) return 'cancelled';
  if (line.includes(': the approval request was declined')) return 'declined';
  return 'notApproved';
}

// A sample of the screen ({front: the frontmost app's bundle id, keyOwnerPid: the pid owning the top on-screen window,
// alertPids: the pids of the ALERT_APPS running}) -> 'clear', 'alert' (a system prompt in front or key) or 'unread' (a
// part could not be read, which proves nothing either way).
export function screenState(sample) {
  if (!sample || typeof sample.front !== 'string' || !Number.isSafeInteger(sample.keyOwnerPid)) return 'unread';
  return ALERT_APPS.includes(sample.front) || (sample.alertPids ?? []).includes(sample.keyOwnerPid) ? 'alert' : 'clear';
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const ACTIONS = ['accept', 'decline', 'cancel'];
// A complete stamp, as cua's own host's connection sets it (src/mcp/approval-memory.mjs) and the policy reports it.
const stampProblem = approval => {
  if (!approval || typeof approval !== 'object') return 'carries no cua/approval';
  const missing = [
    !ACTIONS.includes(approval.action) && 'action',
    !['memory', 'client'].includes(approval.answeredBy) && 'answeredBy',
    !(typeof approval.connection === 'string' && /^[0-9a-f]{1,32}$/.test(approval.connection)) && 'connection',
    !(Number.isSafeInteger(approval.runtimeGeneration) && approval.runtimeGeneration >= 0) && 'runtimeGeneration',
    approval.scope !== 'connection' && 'scope',
  ].filter(Boolean);
  return missing.length ? `carries an incomplete cua/approval (${missing.join(', ')})` : null;
};

// Why a bind proves nothing about its approval, or null. A bind not sent (its activation did not take, or an alert was
// up before it), one with an alert in front or key after it or whose screen could not be read after it, is NO VERDICT.
// A bind that failed with no approval refusal proves the approval passed only when its `cua/approval` says accept (the
// policy sets it once the answer is in, before the engine is asked); otherwise it may have failed before the approval.
// A bind a stop interrupted (`unmeasured`, ruling 1149: another engine answered it, or none attested) measured nothing:
// it is NO VERDICT and stays out of the asks, the tasks, the restart and the approval judgement (`measured`).
const measured = bind => bind.dispatched && !bind.unmeasured;
const notJudged = call => call.unmeasured && call.other ? `; ${plural(call.other, 'other request')} during it, not judged` : '';
function inconclusive(bind) {
  if (bind.unmeasured) return `not measured: ${bind.unmeasured}`;
  if (!bind.dispatched) return bind.blocked === 'alert' ? 'not sent: an alert was in front or key before it' : 'not sent: the approved app did not take front and key';
  if (bind.after === 'alert') return 'an alert was in front or key after it';
  if (bind.after !== 'clear') return 'the front and key after it could not be read';
  if (bind.refusal !== null || !bind.failed) return null;
  if (bind.app === 'approve' && bind.approval?.action === 'accept') return null;
  return 'it failed before its approval was shown';
}

// `connections` [{name, pid, binds: [{app: 'approve'|'decline', cycle, dispatched, blocked, after, asked, refusal,
// failed, restarted, taskId, approval, other, unmeasured?}], steps: [{step, cycle, ok, detail?, noTask?, other?, unmeasured?}],
// other}] (`other` on a bind or step: the client's other requests while that call was in flight, on the connection: those
// between calls; `unmeasured`: why a stop left the bind or step measuring nothing, NO VERDICT, its other requests
// diagnostic only; `noTask`: an end_task
// that found no task when no call since the last one had opened any, every bind between them not sent): the first is the cycles'
// connection, the second a new connection binding each app once. `idleAt`: the cycle whose first bind follows the idle
// stop. `complete`: whether every planned step ran (false when the run stopped early). -> {verdict: 'pass' | 'fail' |
// 'no verdict', ok, problems, inconclusive, detail}; ok only for a pass, a fail outranks a no verdict.
//
// Observed failures are problems: an approved app refused or asked again; a refusal of the declined app that does not
// match its own ask (asked during the bind: declinedNow; not asked, after an earlier ask: declinedEarlier); an answer
// from memory before the client was ever asked on the connection; a judged bind's cua/approval incomplete, its action
// not the result's, or its answeredBy not its ask; two connection ids on one connection, or the first's on the second;
// another request asked; an end_task or js_reset that failed (an end_task with no task to end, because nothing opened
// one, is NO VERDICT); a cycle in two tasks or reusing an earlier task; the
// bind after the idle stop without the restart notice or on no later generation; the second connection on the first's
// process. What could not be shown (an inconclusive bind, a step the run never reached, a comparison with nothing to
// compare) is NO VERDICT.
export function judgeApprovalCycles({cycles, idleAt = 10, connections = [], complete = true}) {
  const problems = [];
  const unproven = [];
  const details = [];
  const unexecuted = text => unproven.push(`not run: ${text}`);
  const ids = [];
  if (!connections.length) {
    if (complete) problems.push('no connection ran');
    else unexecuted('no connection ran');
  }
  connections.forEach((connection, i) => {
    const {name, pid, binds = [], steps = [], other: between = 0} = connection;
    const problem = text => problems.push(`${name}: ${text}`);
    const unsure = text => unproven.push(`${name}: ${text}`);
    if (i > 0 && pid === connections[0].pid) problem(`served by the first connection's process (pid ${pid}); a new connection is a new cua serve`);
    const numbered = binds.map((bind, index) => ({...bind, n: index + 1, why: inconclusive(bind)}));
    const asks = {approve: 0, decline: 0};
    for (const bind of numbered) {
      const label = bind.app === 'approve' ? 'approved' : 'declined';
      const before = asks[bind.app];
      if (measured(bind)) asks[bind.app] += bind.asked;
      if (measured(bind) && bind.asked > 0 && before + bind.asked > 1) problem(`the ${label} app was asked again at bind ${bind.n} (${before + bind.asked} asks); once per connection is expected`);
      if (bind.why) { unsure(`bind ${bind.n} (${bind.app}): ${bind.why}${notJudged(bind)}`); continue; }
      if (bind.asked === 0 && before === 0) problem(`bind ${bind.n} (${label}) was answered without the client ever being asked on this connection`);
      const stamp = stampProblem(bind.approval);
      if (stamp) problem(`bind ${bind.n} (${label}) ${stamp}`);
      const answeredBy = bind.asked > 0 ? 'client' : 'memory';
      if (!stamp && bind.approval.answeredBy !== answeredBy) problem(`bind ${bind.n} (${label}) was answered by ${bind.approval.answeredBy} by its cua/approval, where its ask says ${answeredBy}`);
      if (bind.app === 'approve') {
        if (bind.refusal !== null) problem(`the approved app was refused at bind ${bind.n} (${bind.refusal}): its approval was lost`);
        else if (!stamp && bind.approval.action !== 'accept') problem(`bind ${bind.n} (approved) was not refused, but its cua/approval says ${bind.approval.action}`);
      } else {
        const expected = bind.asked > 0 ? 'declinedNow' : 'declinedEarlier';
        if (bind.refusal !== expected) problem(`the declined app's bind ${bind.n} ${bind.refusal === null ? 'was not refused (none)' : `was refused as ${bind.refusal}`}; ${expected} is expected by its ask`);
        if (!stamp && bind.approval.action !== 'decline') problem(`bind ${bind.n} (declined) carries cua/approval action ${bind.approval.action}, not decline`);
      }
    }
    for (const app of ['approve', 'decline']) {
      if (numbered.some(bind => bind.app === app && !bind.unmeasured)) continue;
      if (complete) problem(`the ${app === 'approve' ? 'approved' : 'declined'} app was never bound`);
      else unexecuted(`${name}'s ${app === 'approve' ? 'approved' : 'declined'} app was never bound`);
    }
    // Another request fails the run unless the call it came during measured nothing (ruling 1149: it may be the other
    // engine's, which this witness does not judge).
    const other = between + [...binds, ...steps].filter(call => !call.unmeasured).reduce((sum, call) => sum + (call.other ?? 0), 0);
    if (other > 0) problem(`${plural(other, 'other request')} ${other === 1 ? 'was' : 'were'} asked of the client`);
    for (const step of steps) {
      if (step.ok) continue;
      if (step.unmeasured) { unsure(`${step.step} of cycle ${step.cycle} not measured: ${step.unmeasured}${notJudged(step)}`); continue; }
      if (step.noTask) unsure(`${step.step} of cycle ${step.cycle} found no task (${step.detail}): no call had opened one since the last`);
      else problem(`${step.step} of cycle ${step.cycle} failed${step.detail ? ` (${step.detail})` : ''}`);
    }

    // One connection id per connection, and the second's not the first's.
    const judged = numbered.filter(bind => !bind.why && !stampProblem(bind.approval));
    const connectionIds = [...new Set(judged.map(bind => bind.approval.connection))];
    if (connectionIds.length > 1) problem(`cua/approval names ${connectionIds.length} connections (${connectionIds.join(', ')}); one is expected`);
    ids.push(connectionIds.length === 1 ? connectionIds[0] : null);
    if (i > 0) {
      if (ids[0] === null || ids[i] === null) unsure('the connection ids could not both be read, so a new connection is not shown to have a new id');
      else if (ids[i] === ids[0]) problem(`cua/approval names the first connection's id (${ids[0]}); a new connection has its own`);
    }

    // One task per cycle, each new: the binds sent in one cycle share a task, and no cycle reuses another's.
    const tasks = new Map();
    for (const bind of numbered.filter(measured)) {
      if (bind.taskId == null) { problem(`bind ${bind.n} carries no task id`); continue; }
      tasks.set(bind.cycle, [...new Set([...(tasks.get(bind.cycle) ?? []), bind.taskId])]);
    }
    for (const [cycle, list] of tasks) if (list.length > 1) problem(`cycle ${cycle}'s binds ran in ${list.length} tasks; one is expected`);
    const firsts = [...tasks].map(([cycle, list]) => [cycle, list[0]]);
    firsts.forEach(([cycle, task], k) => {
      const earlier = firsts.slice(0, k).find(([, other]) => other === task);
      if (earlier) problem(`cycle ${cycle} ran in cycle ${earlier[0]}'s task; end_task must start a new one`);
    });

    if (i === 0) {
      if (!steps.some(step => step.step === 'js_reset')) {
        if (complete) problem('js_reset never ran');
        else unexecuted('js_reset');
      }
      const after = numbered.find(bind => bind.cycle === idleAt && measured(bind));
      if (!after) {
        if (complete && !numbered.some(bind => bind.cycle === idleAt)) problem(`no bind ran in cycle ${idleAt}, after the idle stop`);
        else if (complete) unsure(`no bind of cycle ${idleAt} was sent, so the idle stop is not shown`);
        else unexecuted(`the binds after the idle stop (cycle ${idleAt})`);
      } else if (!after.restarted) problem(`bind ${after.n}, the first after the idle stop, did not open with the restart notice`);
      else {
        const now = stampProblem(after.approval) ? null : after.approval.runtimeGeneration;
        const earlier = numbered.slice(0, after.n - 1).reverse().find(bind => measured(bind) && !stampProblem(bind.approval));
        if (now === null || !earlier) unsure(`bind ${after.n}'s runtime generation could not be compared with one before the idle stop`);
        else if (!(now > earlier.approval.runtimeGeneration)) problem(`bind ${after.n}, after the idle stop, went to runtime generation ${now}, not past bind ${earlier.n}'s ${earlier.approval.runtimeGeneration}`);
      }
    }
    const approve = numbered.filter(bind => bind.app === 'approve');
    details.push(`${name} (pid ${pid}, connection ${ids[i] ?? 'unknown'}): ${plural(binds.length, 'bind')}, ${numbered.filter(b => b.dispatched).length} sent, `
      + `approve asked ${asks.approve}, decline asked ${asks.decline}, approve refused ${approve.filter(b => b.refusal !== null).length}, `
      + `approve failed after its approval ${approve.filter(b => b.failed && b.refusal === null && b.approval?.action === 'accept').length}, inconclusive ${numbered.filter(b => b.why).length}; `
      + `${plural(tasks.size, 'task')}; ${plural(steps.filter(s => s.step === 'js_reset').length, 'js_reset')}; ${plural(numbered.filter(b => b.restarted).length, 'restart')}`);
  });
  if (connections.length === 1) {
    if (complete) problems.push('no second connection ran: a new connection must ask again');
    else unexecuted('the second connection');
  }
  const verdict = problems.length ? 'fail' : unproven.length ? 'no verdict' : 'pass';
  return {verdict, ok: verdict === 'pass', problems, inconclusive: unproven, detail: details.join(' | ')};
}

// Ruling 1149: a bind's result `_meta` against the attestation the witness expects, cua's engine on its approved build.
// -> null when it attests it; else the error that stops the run, NO VERDICT (`noVerdict`), since another engine
// answered (the vendor's: state 1) or none is shown, and nothing of cua's engine was measured by that bind.
export function attestationStop(meta, expected) {
  const problem = attestationProblem(meta, expected);
  return problem && Object.assign(new Error(`refused on the attestation: ${problem}`), {noVerdict: true});
}

// A bind's record as the script starts it (`blocked`: why it was not sent, or null), the judge's input shape. The
// client's other requests while it is in flight count on it (`other`). A stop while it runs marks it `unmeasured` (the
// stop's message): it measured nothing the judge may read.
export const bindRecord = ({app, cycle, blocked}) => ({app, cycle, dispatched: !blocked, blocked, after: null, asked: 0, refusal: null, failed: false,
  restarted: false, taskId: null, approval: null, other: 0});

// A js_reset's answer -> {step (the record's), stop (the error that stops the run, or null)}. The connection
// lifecycle's rejection is a failure of its own (no engine ran it); an answer must attest cua's engine before it counts
// (src/mcp/server.mjs attests js_reset as js), else it is unmeasured and stops the run NO VERDICT (attestationStop); an
// attested error result is the reset's failure.
export function resetStep(result, expected, cycle) {
  const base = {step: 'js_reset', cycle};
  if (isLifecycleRejection(result)) return {step: {...base, ok: false, detail: `rejected before dispatch (${result.structuredContent.code})`}, stop: null};
  const stop = attestationStop(result?._meta, expected);
  if (stop) return {step: {...base, ok: false, unmeasured: stop.message}, stop};
  return {step: {...base, ok: !result.isError, ...(result.isError ? {detail: boundedError(resultText({result}))} : {})}, stop: null};
}

// The run's verdict: the judge's (`judged`, judgeApprovalCycles over what was recorded, `complete` false when the run
// stopped), or, for a run that stopped (`stopped` {message, noVerdict}), a fail for any stop that is not NO VERDICT's
// (no answer, a protocol error) and else NO VERDICT unless what it did observe fails it. -> the judge's, with the stop.
export function stoppedVerdict(judged, stopped) {
  if (!stopped) return judged;
  const verdict = !stopped.noVerdict ? 'fail' : judged.verdict === 'pass' ? 'no verdict' : judged.verdict;
  return {...judged, verdict, ok: false, stopped: stopped.message};
}

// The line the hosted sitting's `verdict` check reads (scripts/hosted-sittings/checks.mjs).
export const verdictLine = verdict => `VERDICT: ${verdict.toUpperCase()}`;
