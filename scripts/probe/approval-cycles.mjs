// #216's hosted witness, its pure half (the script is scripts/approval-cycles.mjs; the gate's disposition is
// docs/evidence/2026-11-23-own-native-engine/gates/216.md): the steps a connection runs, the class of a bind's refusal
// read from the policy's sentence (src/services/engine/policy.mjs notApproved), whether a moment counts as an alert in
// front, and the judge over what each connection recorded. An approval is judged by behaviour (what the client was
// asked, whether a bind was refused for approval) and by the call's `cua/approval` result meta, which the policy sets
// from the connection's stamp on every answer (who answered, the connection's opaque id, the runtime generation).

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
// request), declinedEarlier (the connection's memory answered), cancelled, or notApproved (the bare sentence of an engine
// before #216's). Only the sentence's line is read.
export function refusalOf(text) {
  const line = String(text ?? '').split('\n').find(l => l.includes(NOT_APPROVED));
  if (line === undefined) return null;
  if (line.includes(': it was declined earlier on this connection')) return 'declinedEarlier';
  if (line.includes(': the client declined the approval request')) return 'declinedNow';
  if (line.includes(': the client cancelled the approval request')) return 'cancelled';
  return 'notApproved';
}

// Whether a sample of the screen ({front: bundle id of the frontmost app, keyOwnerPid: the pid owning the top on-screen
// window, alertPids: the pids of the ALERT_APPS running}) has an alert in front or key.
export const alertInFront = sample => ALERT_APPS.includes(sample?.front) || (sample?.alertPids ?? []).includes(sample?.keyOwnerPid);

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const EXPECTED_REFUSAL = k => (k === 0 ? 'declinedNow' : 'declinedEarlier');

// Why a bind proves nothing about its approval, or null. An alert in front or key at any sample is NO VERDICT. A bind
// that failed with no approval refusal proves the approval passed only when its `cua/approval` says accept (the policy
// sets it once the answer is in, before the engine is asked); otherwise it may have failed before the approval ran.
function inconclusive(bind) {
  if (bind.alert) return 'an alert was in front or key';
  if (bind.activated === false) return 'the approved app did not take front and key before it';
  if (bind.refusal !== null || !bind.failed) return null;
  if (bind.app === 'approve' && bind.approval?.action === 'accept') return null;
  return 'it failed before its approval was shown';
}

// `connections` [{name, pid, binds: [{app: 'approve'|'decline', cycle, asked, refusal, failed, restarted, taskId,
// approval, alert, activated}], steps: [{step, cycle, ok}], other}], the first one the cycles' connection, the second a new
// connection binding each app once; `idleAt`, the cycle whose first bind follows the idle stop. -> {verdict: 'pass' |
// 'fail' | 'no verdict', ok, problems, inconclusive, detail}. ok only for a pass; a fail outranks a no verdict.
//
// Each app is asked once per connection, at the first bind that reached its approval; the approved app is never refused
// and every bind of it completes or shows its approval passed; the declined app reads declinedNow at its first answer
// and declinedEarlier after; `cua/approval` agrees (the asking bind answered by the client, the rest by memory) and
// names one connection throughout; nothing else is asked; every end_task and js_reset succeeded. The first connection
// also runs one task per cycle, each a new one, and the bind after the idle stop opens with the restart notice on a
// later runtime generation; the second is another process and another connection id.
export function judgeApprovalCycles({cycles, idleAt = 10, connections}) {
  if (!connections?.length) return {verdict: 'fail', ok: false, problems: ['no connection ran'], inconclusive: [], detail: ''};
  const problems = [];
  const unproven = [];
  const details = [];
  const ids = [];
  connections.forEach((connection, i) => {
    const {name, pid, binds = [], steps = [], other = 0} = connection;
    const problem = text => problems.push(`${name}: ${text}`);
    const numbered = binds.map((bind, index) => ({...bind, n: index + 1, why: inconclusive(bind)}));
    for (const bind of numbered) if (bind.why) unproven.push(`${name}: bind ${bind.n} (${bind.app}): ${bind.why}`);
    if (i > 0 && pid === connections[0].pid) problem(`served by the first connection's process (pid ${pid}); a new connection is a new cua serve`);

    for (const [app, label] of [['approve', 'approved'], ['decline', 'declined']]) {
      const list = numbered.filter(bind => bind.app === app);
      const total = list.reduce((sum, bind) => sum + bind.asked, 0);
      const asking = list.findIndex(bind => bind.asked > 0);
      const conclusive = list.filter(bind => !bind.why);
      if (!list.length) problem(`the ${label} app was never bound`);
      else if (total > 1 || (total === 1 && list.slice(0, asking).some(bind => !bind.why)) || (total === 0 && conclusive.length))
        problem(`the ${label} app was asked ${total} times; once, at its first bind that reached the approval, is expected`);
      for (const bind of list) {
        if (bind.why) continue;
        const expectedBy = bind.asked > 0 ? 'client' : 'memory';
        if (bind.approval && bind.approval.answeredBy !== expectedBy) problem(`bind ${bind.n} (${label}) was answered by ${bind.approval.answeredBy} by its cua/approval, where ${expectedBy} is expected`);
        if (!bind.approval) problem(`bind ${bind.n} (${label}) carries no cua/approval`);
      }
      if (app === 'approve') {
        for (const bind of list) if (!bind.why && bind.refusal !== null) problem(`the approved app was refused at bind ${bind.n} (${bind.refusal}): its approval was lost`);
      } else {
        conclusive.forEach((bind, k) => {
          if (bind.refusal === EXPECTED_REFUSAL(k)) return;
          const seen = bind.refusal === null ? 'was not refused (none)' : `was refused as ${bind.refusal}`;
          problem(`the declined app's bind ${bind.n} ${seen}; ${EXPECTED_REFUSAL(k)} is expected${k === 0 ? '' : ' after its first answer'}`);
        });
      }
    }
    if (other > 0) problem(`${plural(other, 'other request')} ${other === 1 ? 'was' : 'were'} asked of the client`);
    for (const step of steps) if (!step.ok) problem(`${step.step} of cycle ${step.cycle} failed${step.detail ? ` (${step.detail})` : ''}`);

    const connectionIds = [...new Set(numbered.map(bind => bind.approval?.connection).filter(id => id != null))];
    if (connectionIds.length > 1) problem(`cua/approval names ${connectionIds.length} connections (${connectionIds.join(', ')}); one is expected`);
    ids.push(connectionIds[0] ?? null);
    if (i > 0 && ids[0] !== null && ids[i] === ids[0]) problem(`cua/approval names the first connection's id (${ids[0]}); a new connection has its own`);

    // One task per cycle, each new: binds of one cycle share a task, and no cycle reuses another's.
    const tasks = new Map();
    for (const bind of numbered) {
      if (bind.taskId == null) { problem(`bind ${bind.n} carries no task id`); continue; }
      tasks.set(bind.cycle, [...new Set([...(tasks.get(bind.cycle) ?? []), bind.taskId])]);
    }
    for (const [cycle, list] of tasks) if (list.length > 1) problem(`cycle ${cycle}'s binds ran in ${list.length} tasks; one is expected`);
    const firsts = [...tasks].map(([cycle, list]) => [cycle, list[0]]);
    firsts.forEach(([cycle, task], k) => {
      const earlier = firsts.slice(0, k).find(([, other]) => other === task);
      if (earlier) problem(`cycle ${cycle} ran in cycle ${earlier[0]}'s task; end_task must start a new one`);
    });
    const restarts = numbered.filter(bind => bind.restarted);
    if (i === 0) {
      if (tasks.size < cycles + 1) problem(`${plural(tasks.size, 'task')} across ${cycles} end_task cycles; one per cycle is expected`);
      if (!steps.some(step => step.step === 'js_reset')) problem('js_reset never ran');
      const after = numbered.findIndex(bind => bind.cycle === idleAt);
      if (after < 0 || !numbered[after].restarted) problem(`the first bind of cycle ${idleAt} did not open with the restart notice: the idle stop was not seen`);
      else {
        const before = numbered.slice(0, after).reverse().find(bind => bind.approval?.runtimeGeneration != null);
        const now = numbered[after].approval?.runtimeGeneration;
        if (before && now != null && !(now > before.approval.runtimeGeneration)) problem(`the bind after the idle stop went to runtime generation ${now}, not past ${before.approval.runtimeGeneration}`);
      }
    }
    const approve = numbered.filter(bind => bind.app === 'approve');
    details.push(`${name} (pid ${pid}, connection ${ids[i] ?? 'unknown'}): ${binds.length} binds, approve asked ${approve.reduce((s, b) => s + b.asked, 0)}, `
      + `decline asked ${numbered.filter(b => b.app === 'decline').reduce((s, b) => s + b.asked, 0)}, approve refused ${approve.filter(b => b.refusal !== null).length}, `
      + `approve failed after its approval ${approve.filter(b => b.failed && b.refusal === null && b.approval?.action === 'accept').length}, inconclusive ${numbered.filter(b => b.why).length}; `
      + `${plural(tasks.size, 'task')}; ${plural(steps.filter(s => s.step === 'js_reset').length, 'js_reset')}; ${plural(restarts.length, 'restart')}`);
  });
  if (connections.length < 2) problems.push('no second connection ran: a new connection must ask again');
  const verdict = problems.length ? 'fail' : unproven.length ? 'no verdict' : 'pass';
  return {verdict, ok: verdict === 'pass', problems, inconclusive: unproven, detail: details.join(' | ')};
}
