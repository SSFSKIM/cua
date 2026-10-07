// The cua route's live acceptance scenarios (scripts/accept/chrome-cua.mjs) against fake MCP sessions and a scripted
// host status (no runtime, no browser): what each scenario sends, what it requires of the host's <name>.json, how it
// cleans up whatever happened, and the helpers that reach a live host directly (the status file, the socket probe, the
// raw backend client against a real host with the fake extension).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {runHost} from '../src/chrome/host.mjs';
import {backendDir, socketNameFor} from '../src/chrome/extension.mjs';
import {createFakeCuaExtension} from './helpers/fake-cua-extension.mjs';
import {shortScratch} from './fixtures/runtime-fixture.mjs';
import {
  hostStatus, ownerOfTab, socketAccepts, openAsUserArgs, rawBackendClient, rawSessionCall, routePreconditions,
  userTabScenario, turnEndScenario, twoClientScenario, chromeRestartScenario,
} from '../scripts/accept/chrome-cua.mjs';

const PAGE = {origin: 'http://127.0.0.1:4567', url: 'http://127.0.0.1:4567/', documentMarker: 'doc-m', userUrl: 'http://127.0.0.1:4567/user', userMarker: 'user-m',
  framedUrl: 'http://127.0.0.1:4567/framed', framedMarker: 'framed-m', frameMarker: 'frame-m'};
const marker = out => ({result: {content: [{type: 'text', text: `PROBERESULT ${JSON.stringify(out)}`}]}});
const ended = {result: {structuredContent: {status: 'ended'}}};

// Answers each js cell by its title and each other tool by name; records what was sent, in order.
function fakeSession(answers = {}) {
  const sent = [];
  return {
    sent,
    request: async (method, params) => {
      const name = params.name === 'js' ? params.arguments.title.replace('cua accept ', '') : params.name;
      sent.push(name);
      const answer = answers[name];
      if (!answer) return name === 'end_task' ? ended : name.startsWith('select') ? marker({selected: true, userApi: true}) : marker({});
      return typeof answer === 'function' ? answer() : answer;
    },
    call: async name => { sent.push(name); return answers[name] ? answers[name]() : ended; },
  };
}

function harness() {
  const steps = [];
  return {steps, facts: {cellsSent: [], tabOperations: 0}, record: (name, status, detail) => { steps.push({name, status, detail}); return status === 'PASS'; },
    status: name => steps.find(s => s.name === name)?.status};
}

// A status file whose content follows the scenario: `script` is consulted with the cells sent so far.
const scripted = (session, script) => async () => script(session.sent);
const statusWith = sessions => ({instanceId: 'inst', pid: 1, sessions: Object.entries(sessions).map(([session_id, tabs]) => ({session_id, turn_id: 't', tabs}))});
const tab = (tabId, origin, mark = 'none', attached = true) => ({tabId, origin, mark, attached});
const fast = {pollMs: 1, settleMs: 20};

test('the user-tab claim: found among the user tabs, claimed, read, then released open at end_task and closed by the runner', async () => {
  const session = fakeSession({
    findUserTab: marker({matches: 1, tabId: 41}),
    claimUserTab: marker({tabId: 41, markerRead: true}),
    userTabOpen: marker({open: true}),
    closeUserTab: marker({listed: true, closed: true, stillListed: false}),
  });
  const opened = [];
  const h = harness();
  await userTabScenario({session, page: PAGE, instanceId: 'inst', record: h.record, facts: h.facts, ...fast,
    openAsUser: url => { opened.push(url); return {code: 0}; },
    statusOf: scripted(session, sent => statusWith(sent.includes('end_task') ? {s1: []} : {s1: [tab(41, 'claimed')]}))});
  assert.deepEqual(opened, [PAGE.userUrl]);
  assert.deepEqual(session.sent, ['selectUserTask', 'findUserTab', 'claimUserTab', 'end_task', 'selectUserCheck', 'userTabOpen', 'closeUserTab', 'end_task']);
  for (const step of ['user-tab-opened-as-user', 'user-tab-listed', 'user-tab-claimed-and-read', 'user-tab-owned-while-claimed', 'user-tab-released-open', 'user-tab-closed-by-runner'])
    assert.equal(h.status(step), 'PASS', step);
});

test('a claimed tab still owned after end_task fails the release check, and the runner still closes its page', async () => {
  const session = fakeSession({findUserTab: marker({matches: 1, tabId: 41}), claimUserTab: marker({tabId: 41, markerRead: true}),
    userTabOpen: marker({open: true}), closeUserTab: marker({listed: true, closed: true, stillListed: false})});
  const h = harness();
  await userTabScenario({session, page: PAGE, instanceId: 'inst', record: h.record, facts: h.facts, ...fast, openAsUser: () => ({code: 0}),
    statusOf: async () => statusWith({s1: [tab(41, 'claimed')]})});
  assert.equal(h.status('user-tab-released-open'), 'FAIL');
  assert.ok(session.sent.includes('closeUserTab'));
});

test('a user tab that never appears fails the listing; nothing is claimed, and the runner still tries to close the page it opened', async () => {
  const session = fakeSession({findUserTab: marker({matches: 0, tabId: null})});
  const h = harness();
  await userTabScenario({session, page: PAGE, instanceId: 'inst', record: h.record, facts: h.facts, ...fast, openAsUser: () => ({code: 0}), statusOf: async () => statusWith({})});
  assert.equal(h.status('user-tab-listed'), 'FAIL');
  assert.equal(session.sent.includes('claimUserTab'), false);
  assert.deepEqual(session.sent.slice(-2), ['closeUserTab', 'end_task']);
});

test('turn end: the unmarked tab closes, the deliverable is released open, the handoff stays owned detached and is listed next turn', async () => {
  const ids = {unmarked: 11, deliverable: 12, handoff: 13};
  const session = fakeSession({
    createMarkedTabs: marker({ids, marked: true, gotoMs: [300, 200, 250]}),
    listAfterTurn: marker({agent: {unmarked: false, deliverable: false, handoff: true}, user: {unmarked: false, deliverable: true, handoff: false}}),
    closeMarkedTabs: marker({handoffClosed: true, deliverableClosed: true, leftover: []}),
  });
  const h = harness();
  await turnEndScenario({session, page: PAGE, instanceId: 'inst', record: h.record, facts: h.facts, ...fast,
    statusOf: scripted(session, sent => statusWith(sent.includes('end_task')
      ? {s1: [tab(13, 'created', 'handoff', false)]}
      : {s1: [tab(11, 'created'), tab(12, 'created', 'deliverable'), tab(13, 'created', 'handoff')]}))});
  assert.deepEqual(session.sent, ['selectMarkTask', 'createMarkedTabs', 'end_task', 'selectMarkNext', 'listAfterTurn', 'closeMarkedTabs', 'end_task']);
  for (const step of ['turn-end-three-tabs-marked', 'turn-end-host-state', 'turn-end-next-turn-lists-handoff', 'turn-end-cleanup'])
    assert.equal(h.status(step), 'PASS', `${step}: ${JSON.stringify(h.steps)}`);
  assert.deepEqual(h.facts.gotoMs.slice(-3), [300, 200, 250]);
});

test('turn end: an unmarked tab still owned after end_task fails the host-state check', async () => {
  const ids = {unmarked: 11, deliverable: 12, handoff: 13};
  const session = fakeSession({createMarkedTabs: marker({ids, marked: true}),
    listAfterTurn: marker({agent: {handoff: true}, user: {deliverable: true}}), closeMarkedTabs: marker({handoffClosed: true, deliverableClosed: true, leftover: []})});
  const h = harness();
  await turnEndScenario({session, page: PAGE, instanceId: 'inst', record: h.record, facts: h.facts, ...fast,
    statusOf: async () => statusWith({s1: [tab(11, 'created'), tab(13, 'created', 'handoff', false)]})});
  assert.equal(h.status('turn-end-host-state'), 'FAIL');
  assert.ok(session.sent.includes('closeMarkedTabs'), 'cleanup runs whatever the verdict');
});

test('two clients: each lists only its own tab, the host has two sessions, and another session\'s executeCdp is refused', async () => {
  const a = fakeSession({createOwnTab: marker({tabId: 21, markerRead: true, gotoMs: 100}), listOwnAndOther: marker({ownListed: true, otherListed: false, otherError: 'Tab not found: 22'}), closeOwnTab: marker({closed: true, stillListed: false})});
  const b = fakeSession({createOwnTab: marker({tabId: 22, markerRead: true, gotoMs: 120}), listOwnAndOther: marker({ownListed: true, otherListed: false, otherError: 'Tab not found: 21'}), closeOwnTab: marker({closed: true, stillListed: false})});
  const raw = [];
  const h = harness();
  await twoClientScenario({sessions: [a, b], page: PAGE, instanceId: 'inst', record: h.record, facts: h.facts, ...fast,
    statusOf: async () => statusWith({s1: [tab(21, 'created')], s2: [tab(22, 'created')]}),
    rawCall: async ({method, params}) => { raw.push({method, params}); return method === 'executeCdp' ? {ok: false, error: 'tab owned by another session'} : {ok: true, result: []}; }});
  assert.deepEqual(a.sent, ['selectClientA', 'createOwnTab', 'listOwnAndOther', 'closeOwnTab', 'end_task']);
  assert.deepEqual(raw.map(r => r.method), ['getTabs', 'executeCdp']);
  assert.equal(raw[1].params.target.tabId, 21);
  for (const step of ['two-clients-own-tabs', 'two-clients-lists-disjoint', 'two-clients-host-sessions', 'two-clients-foreign-cdp-refused', 'two-clients-cleanup'])
    assert.equal(h.status(step), 'PASS', `${step}: ${JSON.stringify(h.steps)}`);
});

test('two clients: a foreign executeCdp that is answered (or refused with another message) fails', async () => {
  for (const answer of [{ok: true, result: {}}, {ok: false, error: 'Tab 21 is not part of browser session x'}]) {
    const a = fakeSession({createOwnTab: marker({tabId: 21, markerRead: true}), listOwnAndOther: marker({ownListed: true, otherListed: false}), closeOwnTab: marker({closed: true, stillListed: false})});
    const b = fakeSession({createOwnTab: marker({tabId: 22, markerRead: true}), listOwnAndOther: marker({ownListed: true, otherListed: false}), closeOwnTab: marker({closed: true, stillListed: false})});
    const h = harness();
    await twoClientScenario({sessions: [a, b], page: PAGE, instanceId: 'inst', record: h.record, facts: h.facts, ...fast,
      statusOf: async () => statusWith({s1: [tab(21, 'created')], s2: [tab(22, 'created')]}),
      rawCall: async ({method}) => (method === 'executeCdp' ? answer : {ok: true, result: []})});
    assert.equal(h.status('two-clients-foreign-cdp-refused'), 'FAIL');
  }
});

test('Chrome after serve: waits for the owner\'s restart, the open task fails fast and classified, end_task ends, a new task drives the profile', async () => {
  const session = fakeSession({
    createOwnTab: marker({tabId: 31, markerRead: true}),
    afterRestart: marker({failure: 'Browser backend connection closed', ms: 40}),
    createOwnTabAfter: marker({tabId: 77, markerRead: true}),
    closeOwnTabAfter: marker({closed: true, stillListed: false}),
  });
  let pid = 100;
  let polls = 0;
  const announced = [];
  const h = harness();
  await chromeRestartScenario({session, page: PAGE, instanceId: 'inst', record: h.record, facts: h.facts, ...fast, waitMs: 1000,
    announce: line => announced.push(line),
    statusOf: async () => { polls++; if (polls === 3) pid = null; if (polls === 5) pid = 200; return pid ? {pid, sessions: []} : null; },
    hostLive: async () => pid !== null});
  assert.equal(announced.length, 1);
  assert.deepEqual(session.sent, ['selectRestartTask', 'createOwnTab', 'afterRestart', 'end_task', 'selectRestartNext', 'createOwnTabAfter', 'closeOwnTabAfter', 'end_task']);
  for (const step of ['restart-task-open', 'restart-owner-restarted-chrome', 'restart-open-task-fails-classified', 'restart-end-task', 'restart-new-task-drives-profile'])
    assert.equal(h.status(step), 'PASS', `${step}: ${JSON.stringify(h.steps)}`);
});

test('Chrome after serve: no restart within the wait is BLOCKED (the owner\'s step), and nothing further is sent but the cleanup', async () => {
  const session = fakeSession({createOwnTab: marker({tabId: 31, markerRead: true}), closeOwnTab: marker({closed: true, stillListed: false})});
  const h = harness();
  await chromeRestartScenario({session, page: PAGE, instanceId: 'inst', record: h.record, facts: h.facts, ...fast, waitMs: 30, announce: () => {},
    statusOf: async () => ({pid: 100, sessions: []}), hostLive: async () => true});
  assert.equal(h.status('restart-owner-restarted-chrome'), 'BLOCKED');
  assert.deepEqual(session.sent, ['selectRestartTask', 'createOwnTab', 'closeOwnTab', 'end_task']);
});

test('the status helpers read <name>.json beside the socket and find a tab\'s owner', t => {
  const scratch = shortScratch('cua-h3-');
  t.after(scratch.cleanup);
  assert.equal(hostStatus(scratch.dir, 'inst-1'), null);
  mkdirSync(backendDir(scratch.dir), {recursive: true});
  const status = statusWith({s1: [tab(5, 'created')], s2: [tab(6, 'claimed', 'none', false)]});
  writeFileSync(join(backendDir(scratch.dir), `${socketNameFor('inst-1')}.json`), JSON.stringify(status));
  assert.deepEqual(hostStatus(scratch.dir, 'inst-1'), status);
  assert.deepEqual(ownerOfTab(status, 6), {session_id: 's2', tab: tab(6, 'claimed', 'none', false)});
  assert.equal(ownerOfTab(status, 7), null);
  assert.equal(ownerOfTab(null, 7), null);
});

test('the user\'s tab is opened through Chrome itself in the named profile, as a person would', () => {
  assert.deepEqual(openAsUserArgs('http://127.0.0.1:1/user', 'Default'), ['-n', '-a', 'Google Chrome', '--args', '--profile-directory=Default', 'http://127.0.0.1:1/user']);
});

test('the raw backend client reaches a live host: another session\'s executeCdp is refused with the host\'s exact string', async t => {
  const scratch = shortScratch('cua-h3-');
  t.after(scratch.cleanup);
  const ext = createFakeCuaExtension();
  const toHost = new PassThrough(), fromHost = new PassThrough();
  const port = ext.connect({toHost, fromHost});
  const done = runHost({stdin: toHost, stdout: fromHost, home: scratch.dir, pid: 990_001});
  t.after(async () => { port.disconnect(); await done; });
  const socketPath = join(backendDir(scratch.dir), `${socketNameFor(ext.instanceId)}.sock`);
  const deadline = Date.now() + 3000;
  while (!(await socketAccepts(socketPath, 200))) { if (Date.now() > deadline) throw new Error('host never listened'); await new Promise(r => setTimeout(r, 10)); }
  const owner = await rawBackendClient(socketPath);       // stays connected: a closed client's session ends
  t.after(() => owner.close());
  const created = await owner.call({sessionId: 'owner', method: 'createTab', params: {}});
  assert.equal(created.ok, true);
  const refused = await rawSessionCall({socketPath, sessionId: 'intruder', method: 'executeCdp', params: {target: {tabId: created.result.id}, method: 'Runtime.evaluate', commandParams: {expression: '1'}}});
  assert.deepEqual(refused, {ok: false, error: 'tab owned by another session'});
  assert.deepEqual(await rawSessionCall({socketPath, sessionId: 'intruder', method: 'getTabs', params: {}}), {ok: true, result: []});
  assert.equal(await socketAccepts(join(scratch.dir, 'nothing.sock'), 200), false);
});

test('the route\'s preconditions: the cua route needs no Codex login and counts its host by the profile\'s own socket', () => {
  const cua = routePreconditions({route: 'cua', homeRoute: 'cua', socketLive: true, authPresent: false});
  assert.deepEqual(cua, {missing: [], loginGate: false, liveHosts: 1, codexAuthPresent: false});
  assert.deepEqual(routePreconditions({route: 'cua', homeRoute: 'cua', socketLive: false, authPresent: false}).missing, ['no cua host serves this profile\'s socket (is the cua extension loaded and connected in it?)']);
  assert.deepEqual(routePreconditions({route: 'cua', homeRoute: 'vendor', socketLive: true, authPresent: false}).missing, ['the home is on the vendor route, not cua (cua chrome register switches it)']);
  const vendor = routePreconditions({route: 'vendor', homeRoute: 'vendor', liveHosts: 2});
  assert.deepEqual(vendor, {missing: [], loginGate: true, liveHosts: 2});
  assert.deepEqual(routePreconditions({route: 'vendor', homeRoute: null, liveHosts: 0}).missing, ['no OpenAI Chrome host is running']);
});
