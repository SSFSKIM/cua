// #216's hosted witness, its pure half (the script is scripts/approval-cycles.mjs; the gate's disposition is
// docs/evidence/2026-11-23-own-native-engine/gates/216.md): the steps a connection runs, the class of a bind's refusal
// read from the policy's sentence (src/services/engine/policy.mjs notApproved), and the judge over what each connection
// recorded. An approval is judged by behaviour: what the client was asked, and whether a bind was refused for approval.

const NOT_APPROVED = 'Computer Use was not approved to use ';

// The steps of the first connection: the approved app, the declined one and the approved one again in one task, then
// `cycles` times an end_task and a bind of each in the new task; js_reset in cycle `resetAt` and an idle stop (the
// runtime replaced under the connection) in cycle `idleAt`, each before that cycle's binds.
export function approvalCyclesPlan(cycles, {resetAt = 5, idleAt = 10} = {}) {
  const plan = [{step: 'bind', app: 'approve'}, {step: 'bind', app: 'decline'}, {step: 'bind', app: 'approve'}];
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

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// `connections` [{name, pid, binds: [{app: 'approve'|'decline', asked, refusal, failed, restarted, taskId}], other,
// resets}], the first one the cycles' connection, the second a new connection binding each app once. -> {ok, problems,
// detail}. Each connection asks for each app once, at its first bind; the approved app is never refused for approval (a
// bind that failed otherwise, a capture say, is counted and reported); the declined app is refused declinedNow at its
// first bind and declinedEarlier after; nothing else is asked. The first connection also shows a new task after every
// end_task, its js_reset and a runtime restarted by the idle stop; the second is another cua serve.
export function judgeApprovalCycles({cycles, connections}) {
  const problems = [];
  if (!connections?.length) return {ok: false, problems: ['no connection ran'], detail: ''};
  const details = [];
  connections.forEach((connection, i) => {
    const {name, pid, binds, other = 0, resets = 0} = connection;
    const problem = text => problems.push(`${name}: ${text}`);
    if (i > 0 && pid === connections[0].pid) problem(`served by the first connection's process (pid ${pid}); a new connection is a new cua serve`);
    const of = app => binds.map((bind, index) => ({...bind, n: index + 1})).filter(bind => bind.app === app);
    const approve = of('approve');
    const decline = of('decline');
    const asked = list => list.reduce((sum, bind) => sum + bind.asked, 0);
    for (const [list, label] of [[approve, 'approved'], [decline, 'declined']]) {
      if (!list.length) problem(`the ${label} app was never bound`);
      else if (asked(list) !== 1 || list[0].asked !== 1) problem(`the ${label} app was asked ${asked(list)} times; once, at its first bind, is expected`);
      if (label === 'approved') {
        for (const bind of list) if (bind.refusal !== null) problem(`the approved app was refused at bind ${bind.n} (${bind.refusal}): its approval was lost`);
      } else {
        list.forEach((bind, k) => {
          const expected = k === 0 ? 'declinedNow' : 'declinedEarlier';
          if (bind.refusal === expected) return;
          const seen = bind.refusal === null ? 'was not refused (none)' : `was refused as ${bind.refusal}`;
          problem(`the declined app's bind ${bind.n} ${seen}; ${expected} is expected${k === 0 ? '' : ' after its first answer'}`);
        });
      }
    }
    if (other > 0) problem(`${plural(other, 'other request')} ${other === 1 ? 'was' : 'were'} asked of the client`);
    const tasks = new Set(binds.map(bind => bind.taskId)).size;
    const restarts = binds.filter(bind => bind.restarted).length;
    if (i === 0) {
      if (tasks < cycles + 1) problem(`${plural(tasks, 'task')} across ${cycles} end_task cycles; a new task after each end_task is expected`);
      if (resets === 0) problem('js_reset never ran');
      if (restarts === 0) problem('the idle stop never restarted the runtime');
    }
    details.push(`${name} (pid ${pid}): ${binds.length} binds, approve asked ${asked(approve)}, decline asked ${asked(decline)}, `
      + `approve refused ${approve.filter(bind => bind.refusal !== null).length}, approve failed otherwise ${approve.filter(bind => bind.failed && bind.refusal === null).length}; `
      + `${plural(tasks, 'task')}; ${resets} js_reset; ${plural(restarts, 'idle restart')}`);
  });
  if (connections.length < 2) problems.push('no second connection ran: a new connection must ask again');
  return {ok: problems.length === 0, problems, detail: details.join(' | ')};
}
