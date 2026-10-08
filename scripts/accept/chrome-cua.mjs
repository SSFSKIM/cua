// The cua route's live acceptance scenarios (spec docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md,
// Acceptance 3-6), run by scripts/accept-chrome.mjs --route cua against `cua serve` over MCP, with the cua host's
// <name>.json (beside its socket in $CUA_HOME/chrome/b) as the host-side evidence:
//   user tab      a page of the runner's own, on a loopback origin of its own, opened in the profile as a person would
//                 (Chrome itself, `open -a`), is listed through the vendor's user-tabs API, claimed and read; reading it
//                 must raise the origin-access elicitation for that origin, which reaches the client and the runner's
//                 policy accepts (claimTab itself is exempt from the vendor's origin gate, so the read is what asks);
//                 after end_task the tab is open and owned by no session. Chrome's debugger infobar while it is claimed
//                 is the owner's observation, not the runner's;
//   turn end      three created tabs, one marked deliverable and one handoff: after end_task the unmarked one is closed,
//                 the deliverable open and unowned, the handoff owned and detached, and listed by the next task;
//   two clients   two `cua serve` processes each drive their own tab; neither lists the other's, and an executeCdp on one
//                 session's tab from another session is refused by the host with its exact string;
//   Chrome after  with a task open, the owner quits and reopens Chrome: the open task's next call fails classified and
//   serve         fast, end_task ends it, and a new task drives the profile through the same pre-listed socket.
// The user-tab exception (acceptance 3): the C2 runner's rule is that user tabs are never bound, read, screenshotted or
// closed. This scenario claims, reads and finally closes exactly one user tab: the one the runner itself opened on its
// own loopback page, found by that page's per-run URL. No other user tab is claimed, and nothing about any other user
// tab (title, URL, id) leaves the REPL. Every tab a scenario creates or opens is closed by it, whatever failed.
import {readFileSync} from 'node:fs';
import {connect} from 'node:net';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {createPeer, frameDecoder} from '../../src/chrome/protocol.mjs';
import {backendDir, socketNameFor, socketPathFor} from '../../src/chrome/extension.mjs';
import {classifyError, sanitizeVendorText} from '../probe/chrome/original/classify.mjs';
import {cellRunner, LIMITS, noteGoto} from './chrome-run.mjs';
import * as cells from './chrome-cells.mjs';

export const CUA_LIMITS = {
  ...LIMITS,
  create: {cellMs: 90_000, callMs: 120_000},
  createThree: {cellMs: 240_000, callMs: 270_000},
  findUserTab: {cellMs: 40_000, callMs: 70_000},
  endTaskMs: 30_000,
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ---- the host, observed directly ------------------------------------------------------------------------------------

export const socketPathOf = (home, instanceId) => socketPathFor(home, socketNameFor(instanceId));

// The host's <name>.json for a profile's instance, or null when no host has written one (or it is mid-rewrite).
export function hostStatus(home, instanceId) {
  try { return JSON.parse(readFileSync(join(backendDir(home), `${socketNameFor(instanceId)}.json`), 'utf8')); } catch { return null; }
}

// -> {session_id, tab} of the session owning `tabId`, or null when none does.
export function ownerOfTab(status, tabId) {
  for (const s of status?.sessions ?? []) {
    const tab = (s.tabs ?? []).find(t => t.tabId === tabId);
    if (tab) return {session_id: s.session_id, tab};
  }
  return null;
}

// Whether something accepts a connection at the socket path within `ms`.
export function socketAccepts(path, ms = 500) {
  return new Promise(resolve => {
    const socket = connect(path);
    const done = live => { clearTimeout(timer); socket.destroy(); resolve(live); };
    const timer = setTimeout(() => done(false), ms);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

// A backend client of the host's socket, as the vendor service is one, for the checks the agent API cannot make.
export function rawBackendClient(socketPath) {
  return new Promise((resolve, reject) => {
    const socket = connect(socketPath);
    const peer = createPeer({send: bytes => socket.write(bytes), handlers: {onCDPEvent: () => {}, onCDPDetach: () => {}}});
    const decode = frameDecoder();
    socket.on('data', chunk => { for (const message of decode(chunk)) peer.receive(message); });
    socket.once('error', reject);
    socket.once('close', () => peer.close('socket closed'));
    socket.once('connect', () => resolve({
      // -> {ok: true, result} | {ok: false, error: <the host's message>}
      call: ({sessionId, turnId = 'accept', method, params = {}}) => peer.request(method, {...params, session_id: sessionId, turn_id: turnId, session_context: 'acceptance'})
        .then(result => ({ok: true, result}), error => ({ok: false, error: String(error?.message ?? error)})),
      end: ({sessionId, turnId = 'accept'}) => peer.request('turnEnded', {session_id: sessionId, turn_id: turnId}).catch(() => {}),
      // A request outside any session (getInfo).
      request: (method, params = {}) => peer.request(method, params).then(result => ({ok: true, result}), error => ({ok: false, error: String(error?.message ?? error)})),
      close: () => socket.destroy(),
    }));
  });
}

// One request in a session of its own, whose turn is then ended and whose connection is closed.
export async function rawSessionCall({socketPath, sessionId, method, params}) {
  const client = await rawBackendClient(socketPath);
  try {
    const outcome = await client.call({sessionId, method, params});
    await client.end({sessionId});
    return outcome;
  } finally { client.close(); }
}

// The host's own getInfo answer, as the service receives it before normalizing it (the service's BrowserInfo keeps only
// two metadata fields, so a header field could not be seen through cua.listBrowsers).
export async function rawGetInfo(socketPath) {
  const client = await rawBackendClient(socketPath);
  try { return await client.request('getInfo'); } finally { client.close(); }
}

// `open` arguments that open a URL in the running Chrome's named profile as a person would (Chrome's own process
// hands it to the running browser); the agent is not involved.
export const openAsUserArgs = (url, profileDirectory) => ['-n', '-a', 'Google Chrome', '--args', `--profile-directory=${profileDirectory}`, url];

// The route's own preconditions. The cua route needs no Codex login and its host is the profile's socket accepting a
// connection; the vendor route keeps its login gate and counts the OpenAI hosts Chrome runs. A run on a route other than
// the home's is refused (the runtime would list the other route's backends). -> {missing, loginGate, liveHosts, ...}
export function routePreconditions({route, homeRoute, socketLive, authPresent, liveHosts}) {
  const missing = [];
  if (route === 'cua') {
    if (homeRoute !== 'cua') missing.push(`the home is on the ${homeRoute ?? 'no'} route, not cua (cua chrome register switches it)`);
    if (!socketLive) missing.push('no cua host serves this profile\'s socket (is the cua extension loaded and connected in it?)');
    // The no-login negative control: an existence check only, never opened.
    if (authPresent) missing.push('the home has a Codex credential file (state/codex/auth.json): the no-login control fails; use a scratch home that never ran cua login');
    return {missing, loginGate: false, liveHosts: socketLive ? 1 : 0, codexAuthPresent: authPresent};
  }
  if (homeRoute === 'cua') missing.push('the home is on the cua route, not vendor (cua chrome register --vendor switches it)');
  if (!liveHosts) missing.push('no OpenAI Chrome host is running');
  return {missing, loginGate: true, liveHosts};
}

// ---- shared pieces --------------------------------------------------------------------------------------------------

const endTask = async (session, limits) => {
  const reply = await session.request('tools/call', {name: 'end_task', arguments: {}}, limits.endTaskMs ?? 30_000);
  return reply.result?.structuredContent?.status ?? (reply.timedOut ? 'timed_out' : null);
};
const endedOk = status => status === 'ended' || status === 'noop';

// Polls the status until `ready(status)` or `settleMs` passes; -> the last status read.
async function settle(statusOf, ready, {pollMs, settleMs}) {
  const deadline = Date.now() + settleMs;
  for (;;) {
    const status = await statusOf();
    if (ready(status) || Date.now() >= deadline) return status;
    await sleep(pollMs);
  }
}

const brief = cell => ({class: cell.class, ...(cell.text ? {text: cell.text} : {})});

// ---- acceptance 3: the user-tab claim --------------------------------------------------------------------------------

export async function userTabScenario({session, page, instanceId, record, facts, statusOf, openAsUser, limits = CUA_LIMITS, pollMs = 100, settleMs = 5000}) {
  const run = cellRunner({session, facts, limits});
  const ns = '__accUser';
  let opened = false;
  let tabId = null;
  try {
    const select = await run('selectUserTask', cells.selectInto(ns, instanceId), limits.select);
    if (!record('user-tab-select', select.result?.selected && select.result?.userApi ? 'PASS' : 'FAIL', {...brief(select), userApi: select.result?.userApi ?? null})) return;
    const open = openAsUser(page.userUrl);
    opened = open.code === 0;
    if (!record('user-tab-opened-as-user', opened ? 'PASS' : 'FAIL', {how: 'open -n -a "Google Chrome" --args --profile-directory=<dir> <runner page>', exit: open.code})) return;
    const find = await run('findUserTab', cells.findUserTab(ns, page), limits.findUserTab);
    if (!record('user-tab-listed', find.result?.matches === 1 ? 'PASS' : 'FAIL', {...brief(find), matches: find.result?.matches ?? null, infoKeys: find.result?.keys ?? []})) return;
    const before = facts.elicitations.length;
    const claim = await run('claimUserTab', cells.claimUserTab(ns, page), limits.goto);
    tabId = Number.isInteger(claim.result?.tabId) ? claim.result.tabId : find.result?.tabId ?? null;
    // The approval for the user tab's own origin must have reached the client (and been accepted) during the claim and read.
    const userIndex = page.origins.indexOf(page.userOrigin);
    const asked = facts.elicitations.slice(before).filter(e => e.kind === 'origin-access');
    const approved = asked.some(e => e.answered.startsWith('accept') && e.originIndex === userIndex);
    if (!record('user-tab-claimed-and-read', claim.result?.markerRead === true && approved ? 'PASS' : 'FAIL',
      {...brief(claim), markerRead: claim.result?.markerRead ?? null, tabIdsAgree: claim.result?.tabId === find.result?.tabId,
        originAccessAsked: asked.length, approvedForUserOrigin: approved})) return;
    const owner = ownerOfTab(await statusOf(), tabId);
    record('user-tab-owned-while-claimed', owner?.tab.origin === 'claimed' ? 'PASS' : 'FAIL', {owned: Boolean(owner), origin: owner?.tab.origin ?? null, attached: owner?.tab.attached ?? null});
  } finally {
    const ended = await endTask(session, limits);
    record('user-tab-end-task', endedOk(ended) ? 'PASS' : 'FAIL', {status: ended});
    if (opened) {
      // The tab was opened by the runner, so it is checked and then closed by the runner whatever happened above.
      const after = tabId === null ? null : await settle(statusOf, s => ownerOfTab(s, tabId) === null, {pollMs, settleMs});
      const check = await run('selectUserCheck', cells.selectInto(ns, instanceId), limits.select);
      if (tabId !== null && check.result?.selected) {
        const still = await run('userTabOpen', cells.userTabOpen(ns, page));
        const unowned = after !== null && ownerOfTab(after, tabId) === null;
        record('user-tab-released-open', still.result?.open === true && unowned ? 'PASS' : 'FAIL', {...brief(still), open: still.result?.open ?? null, ownedBySession: !unowned, statusRead: after !== null});
      }
      const close = check.result?.selected ? await run('closeUserTab', cells.closeUserTab(ns, page)) : null;
      const closed = close?.result?.closed === true && close.result.stillListed === false;
      record('user-tab-closed-by-runner', closed ? 'PASS' : 'FAIL', close ? {...brief(close), listed: close.result?.listed ?? null, stillListed: close.result?.stillListed ?? null} : {why: 'no browser in the check task'});
      if (!closed) facts.leftoverNotes = [...(facts.leftoverNotes ?? []), 'the runner\'s user-tab page ("CUA acceptance user tab" on 127.0.0.1) may still be open; close it by hand'];
      const endedCheck = await endTask(session, limits);
      if (!endedOk(endedCheck)) record('user-tab-check-end-task', 'FAIL', {status: endedCheck});
    }
  }
}

// ---- acceptance 4: turn end and handoff ------------------------------------------------------------------------------

const ROLES = ['unmarked', 'deliverable', 'handoff'];

export async function turnEndScenario({session, page, instanceId, record, facts, statusOf, limits = CUA_LIMITS, pollMs = 100, settleMs = 5000}) {
  const run = cellRunner({session, facts, limits});
  const ns = '__accMark';
  let ids = {};
  try {
    const select = await run('selectMarkTask', cells.selectInto(ns, instanceId), limits.select);
    if (!record('turn-end-select', select.result?.selected ? 'PASS' : 'FAIL', brief(select))) return;
    const made = await run('createMarkedTabs', cells.createMarkedTabs(ns, page), limits.createThree);
    ids = Object.fromEntries(Object.entries(made.result?.ids ?? {}).filter(([, id]) => Number.isInteger(id)));
    noteGoto(facts, 'turn-end', made.result?.gotoMs ?? []);
    const before = await statusOf();
    const owners = ROLES.map(role => ownerOfTab(before, ids[role]));
    const oneSession = owners.every(o => o && o.session_id === owners[0]?.session_id);
    const marks = owners.map(o => o?.tab.mark ?? null);
    record('turn-end-three-tabs-marked', made.result?.marked === true && Object.keys(ids).length === 3 && oneSession && marks.join() === 'none,deliverable,handoff' ? 'PASS' : 'FAIL',
      {...brief(made), created: Object.keys(ids).length, oneSession, marks});
  } finally {
    const ended = await endTask(session, limits);
    record('turn-end-end-task', endedOk(ended) ? 'PASS' : 'FAIL', {status: ended});
  }
  if (!Object.keys(ids).length) return;
  const expected = s => ownerOfTab(s, ids.unmarked) === null && ownerOfTab(s, ids.deliverable) === null && ownerOfTab(s, ids.handoff)?.tab.attached === false;
  const after = await settle(statusOf, expected, {pollMs, settleMs});
  const handoff = ownerOfTab(after, ids.handoff);
  record('turn-end-host-state', Object.keys(ids).length === 3 && expected(after) ? 'PASS' : 'FAIL', {
    unmarkedOwned: ownerOfTab(after, ids.unmarked) !== null, deliverableOwned: ownerOfTab(after, ids.deliverable) !== null,
    handoff: handoff ? {owned: true, mark: handoff.tab.mark, attached: handoff.tab.attached} : {owned: false}});
  try {
    const select = await run('selectMarkNext', cells.selectInto(ns, instanceId), limits.select);
    if (!select.result?.selected) { record('turn-end-next-turn-lists-handoff', 'FAIL', {why: 'no browser in the next task', ...brief(select)}); return; }
    const listed = await run('listAfterTurn', cells.listAfterTurn(ns, ids));
    const a = listed.result?.agent ?? {}, u = listed.result?.user ?? {};
    record('turn-end-next-turn-lists-handoff', a.handoff === true && !a.unmarked && !a.deliverable && u.deliverable === true && !u.unmarked ? 'PASS' : 'FAIL',
      {...brief(listed), agentTabs: a, userTabs: u, unmarkedClosed: !a.unmarked && !u.unmarked});
    const close = await run('closeMarkedTabs', cells.closeMarkedTabs(ns, ids), limits.create);
    const leftover = close.result?.leftover ?? null;
    record('turn-end-cleanup', Array.isArray(leftover) && !leftover.length ? 'PASS' : 'FAIL', {...brief(close), leftover, ...(close.result?.closeErrors ? {closeErrors: close.result.closeErrors.map(e => sanitizeVendorText(e, 160))} : {})});
    if (!Array.isArray(leftover) || leftover.length) facts.leftoverNotes = [...(facts.leftoverNotes ?? []), `turn-end tabs on the runner's page may still be open (${leftover?.join(', ') ?? 'unknown'}); close them by hand`];
  } finally {
    const ended = await endTask(session, limits);
    if (!endedOk(ended)) record('turn-end-next-end-task', 'FAIL', {status: ended});
  }
}

// ---- acceptance 5: two clients ---------------------------------------------------------------------------------------

export async function twoClientScenario({sessions, page, instanceId, record, facts, statusOf, rawCall, limits = CUA_LIMITS}) {
  const names = ['A', 'B'];
  const runs = sessions.map(session => cellRunner({session, facts, limits}));
  const ns = names.map(n => `__accClient${n}`);
  const own = [null, null];
  try {
    const selected = await Promise.all(runs.map((run, i) => run(`selectClient${names[i]}`, cells.selectInto(ns[i], instanceId), limits.select)));
    if (!selected.every(s => s.result?.selected)) { record('two-clients-own-tabs', 'FAIL', {why: 'a session selected no browser', cells: selected.map(brief)}); return; }
    const created = await Promise.all(runs.map((run, i) => run('createOwnTab', cells.createOwnTab(ns[i], page), limits.create)));
    created.forEach((c, i) => { if (Number.isInteger(c.result?.tabId)) own[i] = c.result.tabId; noteGoto(facts, `two-clients-${names[i]}`, c.result?.gotoMs); });
    if (!record('two-clients-own-tabs', created.every(c => c.result?.markerRead === true) && own.every(Number.isInteger) && own[0] !== own[1] ? 'PASS' : 'FAIL', {cells: created.map(brief), distinct: own[0] !== own[1]})) return;
    const status = await statusOf();
    const owners = own.map(id => ownerOfTab(status, id));
    record('two-clients-host-sessions', owners.every(o => o?.tab.origin === 'created') && owners[0].session_id !== owners[1].session_id ? 'PASS' : 'FAIL',
      {sessions: status?.sessions?.length ?? null, ownedByDistinctSessions: Boolean(owners[0] && owners[1] && owners[0].session_id !== owners[1].session_id)});
    const lists = await Promise.all(runs.map((run, i) => run('listOwnAndOther', cells.listOwnAndOther(ns[i], own[1 - i]))));
    record('two-clients-lists-disjoint', lists.every(l => l.result?.ownListed === true && l.result?.otherListed === false) ? 'PASS' : 'FAIL',
      {cells: lists.map(l => ({...brief(l), ownListed: l.result?.ownListed ?? null, otherListed: l.result?.otherListed ?? null}))});
    // What the vendor API itself does with the other session's tab id: informational (the service may refuse before
    // the host is asked); the host's own refusal is the check below.
    facts.agentApiOnOtherTab = lists.map(l => (l.result?.otherReachable ? 'reached' : l.result?.otherError ? {class: classifyError(l.result.otherError), text: sanitizeVendorText(l.result.otherError, 160)} : null));
    const sessionId = `cua-accept-other-${randomUUID()}`;
    const listing = await rawCall({sessionId, method: 'getTabs', params: {}});
    const cdp = await rawCall({sessionId, method: 'executeCdp', params: {target: {tabId: own[0]}, method: 'Runtime.evaluate', commandParams: {expression: '1', returnByValue: true}}});
    record('two-clients-foreign-cdp-refused', !cdp.ok && cdp.error === 'tab owned by another session' && listing.ok && Array.isArray(listing.result) && listing.result.length === 0 ? 'PASS' : 'FAIL',
      {foreignGetTabs: listing.ok ? listing.result?.length ?? null : sanitizeVendorText(listing.error, 120), executeCdp: cdp.ok ? 'answered' : sanitizeVendorText(cdp.error, 120)});
  } finally {
    const closes = await Promise.all(runs.map((run, i) => (own[i] === null ? null : run('closeOwnTab', cells.closeOwnTab(ns[i])))));
    const ends = await Promise.all(sessions.map(session => endTask(session, limits)));
    const clean = closes.every((c, i) => own[i] === null || (c?.result?.closed === true && c.result.stillListed === false));
    record('two-clients-cleanup', clean && ends.every(endedOk) ? 'PASS' : 'FAIL', {closed: closes.map(c => c?.result?.closed ?? null), stillListed: closes.map(c => c?.result?.stillListed ?? null), endTask: ends});
    if (!clean) facts.leftoverNotes = [...(facts.leftoverNotes ?? []), 'a two-client tab on the runner\'s page may still be open; close it by hand'];
  }
}

// ---- acceptance 6: Chrome after serve --------------------------------------------------------------------------------

// How fast the open task's next call must fail once its host is gone. The service's backend requests have no timeout of
// their own (a closed connection rejects them at once; browser-service.mjs Oi rejectPendingRequests), the extension
// route bounds a CDP command by 10 s (the vendor extension's default, which the host enforces: DEFAULT_CDP_TIMEOUT_MS),
// and the service bounds a backend's getInfo by 5 s (BS:67475 dte). The bound is the CDP one plus a 5 s margin.
export const RESTART_FAILURE_BOUND_MS = 15_000;

export async function chromeRestartScenario({session, page, instanceId, record, facts, statusOf, hostLive, announce, waitMs = 15 * 60_000, pollMs = 1000, limits = CUA_LIMITS}) {
  const run = cellRunner({session, facts, limits});
  const ns = '__accRestart';
  const select = await run('selectRestartTask', cells.selectInto(ns, instanceId), limits.select);
  const created = select.result?.selected ? await run('createOwnTab', cells.createOwnTab(ns, page), limits.create) : null;
  noteGoto(facts, 'restart-before', created?.result?.gotoMs);
  if (!record('restart-task-open', created?.result?.markerRead === true ? 'PASS' : 'FAIL', created ? brief(created) : brief(select))) {
    await endTask(session, limits);
    return;
  }
  const pid = (await statusOf())?.pid ?? null;
  if (pid === null) {
    // Without the host's pid a restart cannot be told from the host that is there now; the owner is not asked.
    record('restart-host-status-before', 'FAIL', {why: 'the host\'s status file names no pid before the restart'});
    const close = await run('closeOwnTab', cells.closeOwnTab(ns));
    if (!(close.result?.closed === true)) facts.leftoverNotes = [...(facts.leftoverNotes ?? []), 'the restart scenario\'s tab on the runner\'s page may still be open; close it by hand'];
    await endTask(session, limits);
    return;
  }
  announce(`quit and reopen Chrome now: the runner waits up to ${Math.round(waitMs / 60_000)} min for the cua host to restart`);
  const started = Date.now();
  let goneAt = null;
  let restarted = false;
  while (Date.now() - started < waitMs) {
    const now = await statusOf();
    if (now?.pid !== pid) goneAt ??= Date.now();
    if (now && now.pid !== pid && await hostLive()) { restarted = true; break; }
    await sleep(pollMs);
  }
  if (!restarted) {
    record('restart-owner-restarted-chrome', 'BLOCKED', {why: `the cua host did not restart within ${waitMs} ms: the owner's quit-and-reopen of Chrome did not happen`, hostWentAway: goneAt !== null});
    const close = await run('closeOwnTab', cells.closeOwnTab(ns));
    if (!(close.result?.closed === true)) facts.leftoverNotes = [...(facts.leftoverNotes ?? []), 'the restart scenario\'s tab on the runner\'s page may still be open; close it by hand'];
    await endTask(session, limits);
    return;
  }
  record('restart-owner-restarted-chrome', 'PASS', {waitedMs: Date.now() - started, newHostPid: true});
  const after = await run('afterRestart', cells.afterRestart(ns));
  const failure = after.result?.failure ?? (after.result ? null : after.text ?? null);
  const failedInMs = after.result?.ms ?? after.durationMs;
  record('restart-open-task-fails-classified', failure && !after.result?.reached && failedInMs <= RESTART_FAILURE_BOUND_MS ? 'PASS' : 'FAIL',
    {class: failure ? classifyError(failure) : 'ok', text: failure ? sanitizeVendorText(failure, 200) : null, failedInMs, boundMs: RESTART_FAILURE_BOUND_MS, cellMs: after.durationMs});
  const ended = await endTask(session, limits);
  record('restart-end-task', endedOk(ended) ? 'PASS' : 'FAIL', {status: ended});
  try {
    const again = await run('selectRestartNext', cells.selectInto(ns, instanceId), limits.select);
    const made = again.result?.selected ? await run('createOwnTabAfter', cells.createOwnTab(ns, page), limits.create) : null;
    noteGoto(facts, 'restart-after', made?.result?.gotoMs);
    const close = Number.isInteger(made?.result?.tabId) ? await run('closeOwnTabAfter', cells.closeOwnTab(ns)) : null;
    record('restart-new-task-drives-profile', made?.result?.markerRead === true && close?.result?.closed === true && close.result.stillListed === false ? 'PASS' : 'FAIL',
      {select: brief(again), create: made ? brief(made) : null, closed: close?.result?.closed ?? null});
  } finally {
    await endTask(session, limits);
  }
  // Chrome may restore the first task's tab on reopen (its "continue where you left off" setting); the old host could
  // not close it once its port was gone.
  facts.restartNote = 'the first task\'s tab was open when Chrome quit; Chrome may restore it on reopen (close it by hand if so)';
}
