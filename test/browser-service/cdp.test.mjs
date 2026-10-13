// The CDP controller (src/browser-service/cdp.mjs, the vendor's cf): lazy attach with focus emulation, Page.enable and
// OOPIF auto-attach; the one re-attach retry on "Debugger unattached"; the Deadline carried into every call; target and
// session routing for out-of-process frames; the event stream and the raw event queue; JavaScript dialog tracking and
// blocking with beforeunload accepted. Unit tests drive a scripted backend API with CDP answers in Chrome's shape
// (fixtures/cdp.mjs); the last tests drive the real host program with the fake extension.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CdpController} from '../../src/browser-service/cdp.mjs';
import {BackendApi, connect} from '../../src/browser-service/backend.mjs';
import {Deadline, DEADLINE_EXCEEDED} from '../../src/browser-service/budgets.mjs';
import {
  MAIN_FRAME, OOPIF_FRAME, OOPIF_SESSION, getFrameTree, getTargets, iframeTarget, attachedToTarget, frameNavigated,
  dialogOpening, dialogClosed, evaluated, thrown, HOST_TIMEOUT, UNATTACHED, TAB_NOT_ATTACHED,
} from './fixtures/cdp.mjs';
import {nativePipe, startRealHost, waitFor} from './support/real-host.mjs';

const settle = () => new Promise(resolve => setImmediate(resolve));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const rejection = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };
const TAB = 7;

// A backend API (the BackendApi surface the controller uses) whose CDP answers come from `answers` (method -> value or
// (params) => value) and whose scripted failures (`fail(method, message, times)`) reject the next calls of a method.
// `delays` (method or 'attach' -> ms) makes those answers take that long; every call records when it was dispatched.
// With `host: true` the double enforces each command's timeoutMs as the real host does (src/chrome/host.mjs executeCdp:
// default 10 s; past it the host's sentence, and the tab detached unless preserveDebuggerOnTimeout, so the next command
// on it answers "Debugger unattached" until it is attached again).
function scriptedApi(answers = {}, delays = {}, {host = false} = {}) {
  const listeners = {onCDPEvent: [], onCDPDetach: []};
  const hostDetached = new Set();
  const calls = [];
  const failures = [];
  const answer = (method, params) => {
    const i = failures.findIndex(f => f.method === method && f.times > 0);
    if (i >= 0) { failures[i].times--; throw new Error(failures[i].message); }
    const a = Object.hasOwn(answers, method) ? answers[method] : {};
    return typeof a === 'function' ? a(params) : structuredClone(a);
  };
  return {
    calls, answers,
    cdpCalls: () => calls.filter(c => c.op === 'executeCdp').map(c => c.params.method),
    fail(method, message, times = 1) { failures.push({method, message, times}); },
    addEventListener(name, handler) { listeners[name].push(handler); return () => {}; },
    async attach(tabId) {
      calls.push({op: 'attach', tabId, at: Date.now()});
      if (delays.attach) await sleep(delays.attach);
      answer('attach');
      hostDetached.delete(tabId);
      return {};
    },
    async detach(tabId) { calls.push({op: 'detach', tabId}); return {}; },
    async attachTarget(tabId, targetId) { calls.push({op: 'attachTarget', tabId, targetId}); answer('attachTarget'); return {}; },
    async detachTarget(tabId, targetId) { calls.push({op: 'detachTarget', tabId, targetId}); return {}; },
    async getCommittedTabUrl(tabId) { calls.push({op: 'getCommittedTabUrl', tabId}); return 'https://committed.test/'; },
    async executeCdp(params) {
      calls.push({op: 'executeCdp', params: structuredClone(params), at: Date.now()});
      await settle();
      if (host) {
        const tabId = params.target.tabId;
        if (hostDetached.has(tabId)) throw new Error(UNATTACHED);
        const limit = typeof params.timeoutMs === 'number' && params.timeoutMs > 0 ? params.timeoutMs : 10_000;
        if ((delays[params.method] ?? 0) > limit) {
          await sleep(limit);
          if (params.preserveDebuggerOnTimeout !== true) hostDetached.add(tabId);
          throw new Error(HOST_TIMEOUT(limit, params.method));
        }
      }
      if (delays[params.method]) await sleep(delays[params.method]);
      return answer(params.method, params);
    },
    event(source, method, params) { for (const l of listeners.onCDPEvent) l({source, method, params}); },
    detached(params) { for (const l of listeners.onCDPDetach) l(params); },
  };
}

async function attached(answers) {
  const api = scriptedApi(answers);
  const cdp = new CdpController(api);
  await cdp.attach(TAB);
  api.calls.length = 0;
  return {api, cdp};
}

test('the first call attaches the tab: attach, focus emulation, Page.enable, OOPIF auto-attach, then the command; later calls do not', async () => {
  const api = scriptedApi({'Runtime.evaluate': evaluated(2)});
  const cdp = new CdpController(api);
  const attachedTabs = [];
  cdp.on('tabAttached', tabId => attachedTabs.push(tabId));
  assert.deepEqual(await cdp.call(TAB, 'Runtime.evaluate', {expression: '1+1'}), evaluated(2));
  assert.deepEqual(api.calls.map(c => c.op === 'executeCdp' ? c.params.method : c.op),
    ['attach', 'Emulation.setFocusEmulationEnabled', 'Page.enable', 'Target.setAutoAttach', 'Runtime.evaluate']);
  assert.deepEqual(api.calls.find(c => c.params?.method === 'Target.setAutoAttach').params.commandParams,
    {autoAttach: true, flatten: true, waitForDebuggerOnStart: false, filter: [{type: 'iframe', exclude: false}]});
  assert.deepEqual(api.calls.at(-1).params, {target: {tabId: TAB}, method: 'Runtime.evaluate', commandParams: {expression: '1+1'}});
  assert.deepEqual(attachedTabs, [TAB]);
  assert.equal(cdp.isTabAttached(TAB), true);
  api.calls.length = 0;
  await cdp.call(TAB, 'Page.reload');
  assert.deepEqual(api.cdpCalls(), ['Page.reload']);
  assert.deepEqual(api.calls[0].params.commandParams, {}, 'absent params are sent as {}');
  await assert.rejects(cdp.call('x', 'Page.reload'), /callCdp requires numeric tab_id/);
});

test('concurrent first calls share one attachment', async () => {
  const api = scriptedApi();
  const cdp = new CdpController(api);
  await Promise.all([cdp.call(TAB, 'A.one'), cdp.call(TAB, 'A.two'), cdp.attach(TAB)]);
  assert.equal(api.calls.filter(c => c.op === 'attach').length, 1);
});

test('a refused focus emulation or filtered auto-attach is tolerated (auto-attach retried without the filter); a deadline is not', async () => {
  const api = scriptedApi();
  api.fail('Emulation.setFocusEmulationEnabled', 'Not allowed');
  api.fail('Target.setAutoAttach', 'Invalid parameters: filter');
  const cdp = new CdpController(api);
  await cdp.call(TAB, 'DOM.enable');
  const autoAttach = api.calls.filter(c => c.params?.method === 'Target.setAutoAttach').map(c => c.params.commandParams);
  assert.deepEqual(autoAttach, [
    {autoAttach: true, flatten: true, waitForDebuggerOnStart: false, filter: [{type: 'iframe', exclude: false}]},
    {autoAttach: true, flatten: true, waitForDebuggerOnStart: false},
  ]);
  assert.equal(cdp.isTabAttached(TAB), true);
  const slow = scriptedApi();
  slow.fail('Emulation.setFocusEmulationEnabled', HOST_TIMEOUT(10000, 'Emulation.setFocusEmulationEnabled'));
  const strict = new CdpController(slow);
  assert.match((await rejection(strict.call(TAB, 'DOM.enable'))).message, /Timed out after/);
  assert.equal(strict.isTabAttached(TAB), false, 'a failed attachment is forgotten');
});

test('"Debugger unattached" from the backend forgets the tab, attaches it again and retries the command once', async () => {
  const {api, cdp} = await attached({'Runtime.evaluate': evaluated('ok')});
  const detachedTabs = [];
  cdp.on('tabDetached', tabId => detachedTabs.push(tabId));
  api.fail('Runtime.evaluate', UNATTACHED);
  assert.deepEqual(await cdp.call(TAB, 'Runtime.evaluate', {expression: 'x'}), evaluated('ok'));
  assert.deepEqual(api.calls.map(c => c.op === 'executeCdp' ? c.params.method : c.op),
    ['Runtime.evaluate', 'attach', 'Emulation.setFocusEmulationEnabled', 'Page.enable', 'Target.setAutoAttach', 'Runtime.evaluate']);
  assert.deepEqual(detachedTabs, [TAB]);
});

test('Chrome\'s "Debugger is not attached" is retried the same way; a second failure is tab_detached with the backend\'s words', async () => {
  const {api, cdp} = await attached();
  api.fail('DOM.getDocument', TAB_NOT_ATTACHED(TAB));
  await cdp.call(TAB, 'DOM.getDocument');
  assert.equal(api.calls.filter(c => c.op === 'attach').length, 1);
  api.calls.length = 0;
  api.fail('DOM.getDocument', UNATTACHED, 2);
  const error = await rejection(cdp.call(TAB, 'DOM.getDocument'));
  assert.equal(error.name, 'BrowserServiceError');
  assert.equal(error.code, 'tab_detached');
  assert.equal(error.message, UNATTACHED);
  assert.equal(api.cdpCalls().filter(m => m === 'DOM.getDocument').length, 2, 'one retry, not more');
});

test('an attach the backend refuses with "Debugger unattached" is retried once too', async () => {
  const api = scriptedApi();
  api.fail('attach', UNATTACHED);
  const cdp = new CdpController(api);
  await cdp.call(TAB, 'DOM.enable');
  assert.equal(api.calls.filter(c => c.op === 'attach').length, 2);
});

test('a command on a frame session is not retried, but the tab\'s attachment is forgotten', async () => {
  const {api, cdp} = await attached();
  api.fail('Runtime.evaluate', UNATTACHED);
  const error = await rejection(cdp.callTarget({tabId: TAB, sessionId: OOPIF_SESSION}, 'Runtime.evaluate', {expression: '1'}));
  assert.equal(error.code, 'tab_detached');
  assert.equal(api.calls.filter(c => c.op === 'attach').length, 0);
  assert.equal(cdp.isTabAttached(TAB), false);
});

test('the host\'s CDP timeout is a timeout error with the host\'s sentence', async () => {
  const {api, cdp} = await attached();
  api.fail('Runtime.evaluate', HOST_TIMEOUT(250, 'Runtime.evaluate'));
  const error = await rejection(cdp.call(TAB, 'Runtime.evaluate', {expression: 'while(1);'}, {timeoutMs: 250}));
  assert.equal(error.name, 'BrowserServiceError');
  assert.equal(error.code, 'timeout');
  assert.equal(error.message, HOST_TIMEOUT(250, 'Runtime.evaluate'));
  assert.equal(error.retryable, true);
  api.fail('Runtime.evaluate', 'Execution context was destroyed.');
  const other = await rejection(cdp.call(TAB, 'Runtime.evaluate', {expression: '1'}));
  assert.equal(other.name, 'Error', 'other CDP errors pass through unchanged');
  assert.equal(other.message, 'Execution context was destroyed.');
});

test('the Deadline reaches the backend as the call\'s timeoutMs; a spent one dispatches nothing; beforeDispatch marks the dispatch', async () => {
  const {api, cdp} = await attached();
  await cdp.call(TAB, 'Runtime.evaluate', {expression: '1'}, {deadline: new Deadline(4000)});
  const sent = api.calls.at(-1).params;
  assert.ok(sent.timeoutMs > 3800 && sent.timeoutMs <= 4000, `timeoutMs ${sent.timeoutMs}`);
  await cdp.call(TAB, 'Runtime.evaluate', {expression: '1'}, {deadline: new Deadline(4000), timeoutMs: 300});
  assert.equal(api.calls.at(-1).params.timeoutMs, 300, 'the smaller of the caller\'s bound and what is left');
  await cdp.call(TAB, 'Runtime.evaluate', {expression: '1'}, {timeoutMs: 900});
  assert.equal(api.calls.at(-1).params.timeoutMs, 900);
  api.calls.length = 0;
  const spent = await rejection(cdp.call(TAB, 'Runtime.evaluate', {expression: '1'}, {deadline: new Deadline(0)}));
  assert.equal(spent.code, 'timeout');
  assert.equal(spent.message, DEADLINE_EXCEEDED);
  assert.deepEqual(api.calls, []);
  const order = [];
  const marked = scriptedApi();
  const marking = new CdpController(marked);
  const original = marked.executeCdp;
  marked.executeCdp = params => { order.push(`send:${params.method}`); return original(params); };
  await marking.call(TAB, 'Runtime.callFunctionOn', {}, {beforeDispatch: () => order.push('dispatch'), prepareDispatch: async () => { order.push('prepare'); }});
  assert.deepEqual(order.slice(-3), ['prepare', 'dispatch', 'send:Runtime.callFunctionOn']);
});

test('a first attachment gives each setup command what the command has left, not the allowance it started with', async () => {
  const api = scriptedApi({}, {attach: 20, 'Emulation.setFocusEmulationEnabled': 20, 'Page.enable': 20, 'Target.setAutoAttach': 20});
  const cdp = new CdpController(api);
  const deadline = new Deadline(400);
  await cdp.call(TAB, 'Runtime.evaluate', {expression: '1'}, {deadline});
  const sent = api.calls.filter(c => c.op === 'executeCdp');
  assert.deepEqual(sent.map(c => c.params.method), ['Emulation.setFocusEmulationEnabled', 'Page.enable', 'Target.setAutoAttach', 'Runtime.evaluate']);
  for (const c of sent) assert.ok(c.params.timeoutMs <= deadline.at - c.at + 2, `${c.params.method}: timeoutMs ${c.params.timeoutMs} with ${deadline.at - c.at} ms left`);
  const allowances = sent.map(c => c.params.timeoutMs);
  assert.ok(allowances.every((ms, i) => i === 0 || ms < allowances[i - 1]), `each later command has less: ${allowances}`);
});

test('a deadline that runs out during the first attachment stops it: the caller gets timeout and nothing more is dispatched', async () => {
  const api = scriptedApi({}, {attach: 10, 'Emulation.setFocusEmulationEnabled': 10, 'Page.enable': 60});
  const cdp = new CdpController(api);
  const deadline = new Deadline(50);
  const error = await rejection(cdp.call(TAB, 'Runtime.evaluate', {expression: '1'}, {deadline}));
  assert.equal(error.code, 'timeout');
  await sleep(150);
  const sent = api.calls.filter(c => c.op === 'executeCdp').map(c => c.params.method);
  assert.deepEqual(sent, ['Emulation.setFocusEmulationEnabled', 'Page.enable'].slice(0, sent.length), 'no auto-attach and no command after the budget ran out');
  assert.ok(api.calls.every(c => c.at < deadline.at), 'every dispatch happened within the budget');
  assert.equal(cdp.isTabAttached(TAB), false, 'the unfinished attachment is forgotten');
  await cdp.call(TAB, 'Runtime.evaluate', {expression: '2'});
  assert.equal(api.calls.at(-1).params.method, 'Runtime.evaluate', 'the next command attaches afresh');
});

test('a caller sharing an attachment whose starter ran out of budget attaches again on its own budget', async () => {
  const api = scriptedApi({}, {attach: 10, 'Emulation.setFocusEmulationEnabled': 10, 'Page.enable': 60});
  const cdp = new CdpController(api);
  const [short, patient] = await Promise.allSettled([
    cdp.call(TAB, 'Runtime.evaluate', {expression: 'short'}, {deadline: new Deadline(50)}),
    cdp.call(TAB, 'Runtime.evaluate', {expression: 'patient'}, {deadline: new Deadline(2000)}),
  ]);
  assert.equal(short.reason?.code, 'timeout');
  assert.equal(patient.status, 'fulfilled');
  assert.equal(api.calls.filter(c => c.op === 'attach').length, 2);
  assert.deepEqual(api.calls.filter(c => c.params?.method === 'Runtime.evaluate').map(c => c.params.commandParams.expression), ['patient']);
});

test('host double: a joined caller re-attaches after the host timed out a setup command the starter\'s deadline bounded', async () => {
  const api = scriptedApi({}, {'Emulation.setFocusEmulationEnabled': 60}, {host: true});
  const cdp = new CdpController(api);
  const [short, patient] = await Promise.allSettled([
    cdp.call(TAB, 'Runtime.evaluate', {expression: 'short'}, {deadline: new Deadline(40)}),
    cdp.call(TAB, 'Runtime.evaluate', {expression: 'patient'}, {deadline: new Deadline(2000)}),
  ]);
  const focus = api.calls.filter(c => c.params?.method === 'Emulation.setFocusEmulationEnabled');
  assert.ok(focus[0].params.timeoutMs <= 40, 'the starter\'s budget bounded the first focus emulation');
  assert.equal(short.reason?.code, 'timeout');
  await waitFor(() => api.calls.length > 0 && focus.length > 0, 'the focus emulation');
  assert.equal(patient.status, 'fulfilled', patient.reason?.message);
  assert.equal(api.calls.filter(c => c.op === 'attach').length, 2);
  assert.ok(focus[1].at - focus[0].at >= focus[0].params.timeoutMs, 'the retry followed the host\'s timeout of the first, not the service\'s own check');
  assert.ok(focus[1].params.timeoutMs > 1000, 'the second attachment runs on the patient caller\'s budget');
  assert.deepEqual(api.calls.filter(c => c.params?.method === 'Runtime.evaluate').map(c => c.params.commandParams.expression), ['patient']);
});

test('host double: a joined caller does not retry a timeout from the starter\'s own smaller per-call bound', async () => {
  const api = scriptedApi({}, {'Emulation.setFocusEmulationEnabled': 60}, {host: true});
  const cdp = new CdpController(api);
  const [starter, joined] = await Promise.allSettled([
    cdp.call(TAB, 'Runtime.evaluate', {expression: 'a'}, {deadline: new Deadline(2000), timeoutMs: 20}),
    cdp.call(TAB, 'Runtime.evaluate', {expression: 'b'}, {deadline: new Deadline(2000)}),
  ]);
  assert.equal(starter.reason?.message, HOST_TIMEOUT(20, 'Emulation.setFocusEmulationEnabled'));
  assert.equal(joined.reason?.code, 'timeout', 'the per-call bound was the command\'s choice, not a spent budget');
  assert.equal(api.calls.filter(c => c.op === 'attach').length, 1);
});

test('a joined caller does not retry an attachment that failed for any other reason', async () => {
  const api = scriptedApi({}, {attach: 10});
  api.fail('attach', 'Tab 7 is not part of browser session s');
  const cdp = new CdpController(api);
  const results = await Promise.allSettled([
    cdp.call(TAB, 'DOM.enable', {}, {deadline: new Deadline(30)}),
    cdp.call(TAB, 'DOM.enable', {}, {deadline: new Deadline(2000)}),
  ]);
  assert.deepEqual(results.map(r => r.reason?.message), ['Tab 7 is not part of browser session s', 'Tab 7 is not part of browser session s']);
  assert.equal(api.calls.filter(c => c.op === 'attach').length, 1);
});

test('a deadline spent before the first attachment dispatches nothing at all', async () => {
  const api = scriptedApi();
  const cdp = new CdpController(api);
  assert.equal((await rejection(cdp.call(TAB, 'Runtime.evaluate', {}, {deadline: new Deadline(0)}))).code, 'timeout');
  assert.deepEqual(api.calls, []);
});

test('readDocumentState carries the deadline into its evaluation', async () => {
  const {api, cdp} = await attached({'Runtime.evaluate': evaluated({href: 'https://fixture.test/', readyState: 'complete'})});
  await cdp.readDocumentState(TAB, {deadline: new Deadline(700)});
  assert.ok(api.calls.at(-1).params.timeoutMs <= 700, `timeoutMs ${api.calls.at(-1).params.timeoutMs}`);
  assert.equal(await cdp.readDocumentState(TAB, {deadline: new Deadline(0)}), undefined);
  assert.equal(api.calls.length, 1, 'a spent deadline reads nothing');
});

test('a dialog opening while the command is being prepared blocks it before dispatch', async () => {
  const {api, cdp} = await attached();
  const error = await rejection(cdp.call(TAB, 'Runtime.evaluate', {expression: '1'}, {
    prepareDispatch: async () => { api.event({tabId: TAB}, 'Page.javascriptDialogOpening', dialogOpening()); },
    beforeDispatch: () => assert.fail('a blocked command is never marked dispatched'),
  }));
  assert.equal(error.code, 'dialog_open');
  assert.deepEqual(cdp.dialogs.current(TAB), {id: '1', type: 'alert'});
  assert.deepEqual(api.calls, []);
});

test('a dialog opening while the tab is being attached blocks the command that attached it', async () => {
  let api;
  api = scriptedApi({'Page.enable': () => { api.event({tabId: TAB}, 'Page.javascriptDialogOpening', dialogOpening({type: 'confirm'})); return {}; }});
  const cdp = new CdpController(api);
  const error = await rejection(cdp.call(TAB, 'Runtime.evaluate', {expression: '1'}));
  assert.equal(error.code, 'dialog_open');
  assert.equal(api.cdpCalls().includes('Runtime.evaluate'), false);
});

test('send is the spec\'s entry point: a tab id or a target, the deadline, and preserveOnTimeout on the wire', async () => {
  const {api, cdp} = await attached();
  await cdp.send(TAB, 'Page.captureScreenshot', {format: 'jpeg'}, {preserveOnTimeout: true});
  assert.deepEqual(api.calls.at(-1).params, {target: {tabId: TAB}, method: 'Page.captureScreenshot', commandParams: {format: 'jpeg'}, preserveDebuggerOnTimeout: true});
  await cdp.send({tabId: TAB, sessionId: OOPIF_SESSION}, 'DOM.getDocument', {}, {deadline: new Deadline(1000)});
  assert.deepEqual(api.calls.at(-1).params.target, {tabId: TAB, sessionId: OOPIF_SESSION});
  assert.ok(api.calls.at(-1).params.timeoutMs <= 1000);
  await assert.rejects(cdp.send({tabId: 'nope'}, 'DOM.enable'), /requires numeric tab_id/);
});

test('detach runs the cleanup handlers, detaches the tab\'s frame targets and the tab, and forgets it', async () => {
  const {api, cdp} = await attached({'Target.getTargets': getTargets(TAB, [iframeTarget()]), 'Page.getFrameTree': getFrameTree(OOPIF_FRAME)});
  assert.deepEqual(await cdp.targetForFrameOrAttach(TAB, OOPIF_FRAME), {tabId: TAB, targetId: OOPIF_FRAME});
  api.calls.length = 0;
  const cleaned = [];
  cdp.addTabCleanupHandler(tabId => { cleaned.push(tabId); });
  await cdp.detach(TAB);
  assert.deepEqual(cleaned, [TAB]);
  assert.deepEqual(api.calls.filter(c => c.op !== 'executeCdp').map(c => [c.op, c.targetId ?? c.tabId]), [['detachTarget', OOPIF_FRAME], ['detach', TAB]]);
  assert.equal(cdp.isTabAttached(TAB), false);
  assert.equal(cdp.targetForFrame(TAB, OOPIF_FRAME), null);
  await cdp.detach(TAB);
  assert.equal(api.calls.filter(c => c.op === 'detach').length, 1, 'detaching a detached tab does nothing');
});

test('onCDPDetach forgets the tab, and the next command attaches it again', async () => {
  const {api, cdp} = await attached();
  api.detached({tabId: TAB, reason: 'target_closed'});
  assert.equal(cdp.isTabAttached(TAB), false);
  await cdp.call(TAB, 'DOM.enable');
  assert.equal(api.calls.filter(c => c.op === 'attach').length, 1);
});

test('an onCDPDetach naming a frame target drops that target only: the tab, its dialog and other frames stay', async () => {
  const {api, cdp} = await attached();
  api.event({tabId: TAB}, 'Target.attachedToTarget', attachedToTarget());
  api.event({tabId: TAB}, 'Page.javascriptDialogOpening', dialogOpening());
  api.detached({tabId: TAB, targetId: OOPIF_FRAME, reason: 'target_closed'});
  assert.equal(cdp.isTabAttached(TAB), true);
  assert.equal(cdp.targetForFrame(TAB, OOPIF_FRAME), null);
  assert.deepEqual(cdp.getJsDialog(TAB), {id: '1', type: 'alert'});
});

test('events of an attached tab are emitted with the tab id; a frame session\'s events route to its tab; others are dropped', async () => {
  const {api, cdp} = await attached();
  const events = [];
  cdp.on('event', e => events.push(e));
  api.event({tabId: TAB}, 'Page.loadEventFired', {timestamp: 1});
  api.event({tabId: 99}, 'Page.loadEventFired', {timestamp: 2});
  api.event({sessionId: 'unknown'}, 'Runtime.consoleAPICalled', {});
  api.event({tabId: TAB}, 'Target.attachedToTarget', attachedToTarget());
  api.event({sessionId: OOPIF_SESSION}, 'Runtime.consoleAPICalled', {type: 'log'});
  assert.deepEqual(events.map(e => [e.method, e.source]), [
    ['Page.loadEventFired', {tabId: TAB}],
    ['Target.attachedToTarget', {tabId: TAB}],
    ['Runtime.consoleAPICalled', {sessionId: OOPIF_SESSION, tabId: TAB}],
  ]);
});

test('OOPIF routing: an auto-attached frame\'s session is found by its frame id, follows its navigation, and leaves on detach', async () => {
  const {api, cdp} = await attached();
  api.event({tabId: TAB}, 'Target.attachedToTarget', attachedToTarget());
  assert.deepEqual(cdp.targetForFrame(TAB, OOPIF_FRAME), {tabId: TAB, sessionId: OOPIF_SESSION}, 'an iframe target id is its frame id');
  assert.equal(cdp.targetIdForFrame(TAB, OOPIF_FRAME), OOPIF_FRAME);
  api.event({tabId: TAB, sessionId: OOPIF_SESSION}, 'Page.frameNavigated', frameNavigated({id: OOPIF_FRAME, url: 'https://other.test/next', parentId: MAIN_FRAME}));
  assert.deepEqual(cdp.targetForFrame(TAB, OOPIF_FRAME), {tabId: TAB, sessionId: OOPIF_SESSION});
  api.event({tabId: TAB}, 'Target.detachedFromTarget', {sessionId: OOPIF_SESSION, targetId: OOPIF_FRAME});
  assert.equal(cdp.targetForFrame(TAB, OOPIF_FRAME), null);
  api.event({tabId: TAB}, 'Target.attachedToTarget', attachedToTarget());
  api.event({tabId: TAB}, 'Page.frameDetached', {frameId: OOPIF_FRAME, reason: 'remove'});
  assert.equal(cdp.targetForFrame(TAB, OOPIF_FRAME), null);
  api.event({tabId: TAB}, 'Target.attachedToTarget', {sessionId: 'W1', targetInfo: {targetId: 'W1T', type: 'service_worker', url: 'https://fixture.test/sw.js'}, waitingForDebugger: false});
  assert.equal(cdp.targetForFrame(TAB, 'W1T'), null, 'only frame targets are routed');
});

test('targetForFrameOrAttach attaches an out-of-process frame by its target and initialises its session', async () => {
  const {api, cdp} = await attached({
    'Target.getTargets': getTargets(TAB, [iframeTarget()]),
    'Page.getFrameTree': ({target}) => (target.targetId ? getFrameTree(OOPIF_FRAME, 'https://other.test/frame') : getFrameTree()),
  });
  const target = await cdp.targetForFrameOrAttach(TAB, OOPIF_FRAME);
  assert.deepEqual(target, {tabId: TAB, targetId: OOPIF_FRAME});
  assert.deepEqual(api.calls.map(c => c.op === 'executeCdp' ? `${c.params.method}@${c.params.target.targetId ?? 'tab'}` : `${c.op}:${c.targetId ?? c.tabId}`),
    ['Target.getTargets@tab', `attachTarget:${OOPIF_FRAME}`, `Page.enable@${OOPIF_FRAME}`, `Runtime.enable@${OOPIF_FRAME}`, `Page.getFrameTree@${OOPIF_FRAME}`]);
  api.calls.length = 0;
  assert.deepEqual(await cdp.targetForFrameOrAttach(TAB, OOPIF_FRAME), target, 'known now: no second attach');
  assert.deepEqual(api.calls, []);
  assert.equal(await cdp.targetForFrameOrAttach(TAB, 'NOT-A-FRAME'), null);
  assert.equal(await cdp.targetForFrameOrAttach('x', OOPIF_FRAME), null);
});

test('enableOopifAutoAttach is sent once per attachment', async () => {
  const {api, cdp} = await attached();
  await cdp.enableOopifAutoAttach(TAB);
  assert.deepEqual(api.calls, [], 'the attach handler already enabled it');
  api.detached({tabId: TAB, reason: 'target_closed'});
  await cdp.attach(TAB);
  assert.equal(api.cdpCalls().filter(m => m === 'Target.setAutoAttach').length, 1);
});

test('a JavaScript dialog is tracked from Page.javascriptDialogOpening and blocks every command but Page.handleJavaScriptDialog with dialog_open', async () => {
  const {api, cdp} = await attached();
  assert.equal(cdp.getJsDialog(TAB), undefined);
  assert.equal(cdp.dialogs.current(TAB), undefined);
  cdp.dialogs.blockIfOpen(TAB);
  api.event({tabId: TAB}, 'Page.javascriptDialogOpening', dialogOpening({type: 'confirm', message: 'Sure?'}));
  assert.deepEqual(cdp.getJsDialog(TAB), {id: '1', type: 'confirm'});
  assert.deepEqual(cdp.dialogs.current(TAB), {id: '1', type: 'confirm'});
  const blocked = await rejection(cdp.call(TAB, 'Runtime.evaluate', {expression: 'document.title'}));
  assert.equal(blocked.name, 'BrowserServiceError');
  assert.equal(blocked.code, 'dialog_open');
  assert.equal(blocked.message, 'A confirm JavaScript dialog is active in this tab. Use `tab.getJsDialog()` to get it and dismiss it first.');
  assert.throws(() => cdp.dialogs.blockIfOpen(TAB), error => error.code === 'dialog_open');
  assert.deepEqual(api.calls, [], 'a blocked command never reaches the backend');
  await cdp.call(TAB, 'Page.handleJavaScriptDialog', {accept: true});
  assert.deepEqual(api.cdpCalls(), ['Page.handleJavaScriptDialog']);
  api.event({tabId: TAB}, 'Page.javascriptDialogClosed', dialogClosed());
  assert.equal(cdp.getJsDialog(TAB), undefined);
  await cdp.call(TAB, 'Runtime.evaluate', {expression: 'document.title'});
});

test('the dialog record keeps message, prompt default, url and target; prompt text, activation and deletion follow the vendor', async () => {
  const {api, cdp} = await attached();
  api.event({tabId: TAB}, 'Page.javascriptDialogOpening', dialogOpening({type: 'prompt', message: 'Name?', defaultPrompt: 'Ada'}));
  const dialog = cdp.activeJsDialog(TAB, '1');
  assert.deepEqual(dialog, {id: '1', type: 'prompt', message: 'Name?', promptText: 'Ada', url: 'https://fixture.test/', target: {tabId: TAB}});
  cdp.updateJsDialogPrompt(TAB, '1', 'Grace');
  assert.equal(cdp.activeJsDialog(TAB, '1').promptText, 'Grace');
  assert.throws(() => cdp.activeJsDialog(TAB, '2'), /JavaScript dialog is no longer active/);
  assert.throws(() => cdp.activeJsDialog(TAB, ''), /handleJsDialog requires a dialog_id/);
  cdp.deleteJsDialog(TAB, '2');
  assert.notEqual(cdp.getJsDialog(TAB), undefined, 'deleting another id leaves it');
  cdp.deleteJsDialog(TAB, '1');
  assert.equal(cdp.getJsDialog(TAB), undefined);
  api.event({tabId: TAB}, 'Page.javascriptDialogOpening', dialogOpening({type: 'alert'}));
  assert.throws(() => cdp.updateJsDialogPrompt(TAB, '2', 'x'), /Only prompt dialogs accept text/);
  api.event({tabId: TAB}, 'Page.javascriptDialogOpening', dialogOpening({type: 'print'}));
  assert.equal(cdp.getJsDialog(TAB).type, 'alert', 'an unknown dialog type is ignored');
});

test('beforeunload is accepted at once (to the dialog\'s own target) and tracked until it closes', async () => {
  const {api, cdp} = await attached();
  api.event({tabId: TAB}, 'Page.javascriptDialogOpening', dialogOpening({type: 'beforeunload', message: ''}));
  await waitFor(() => api.cdpCalls().includes('Page.handleJavaScriptDialog'), 'the auto-accept');
  assert.deepEqual(api.calls.at(-1).params, {target: {tabId: TAB}, method: 'Page.handleJavaScriptDialog', commandParams: {accept: true}});
  assert.equal(cdp.getJsDialog(TAB).type, 'beforeunload');
  api.event({tabId: TAB}, 'Page.javascriptDialogClosed', dialogClosed());
  assert.equal(cdp.getJsDialog(TAB), undefined);
  api.event({tabId: TAB}, 'Target.attachedToTarget', attachedToTarget());
  api.calls.length = 0;
  api.event({sessionId: OOPIF_SESSION}, 'Page.javascriptDialogOpening', dialogOpening({type: 'beforeunload', frameId: OOPIF_FRAME}));
  await waitFor(() => api.cdpCalls().includes('Page.handleJavaScriptDialog'), 'the frame\'s auto-accept');
  assert.deepEqual(api.calls.at(-1).params.target, {tabId: TAB, sessionId: OOPIF_SESSION});
});

test('a dialog in a frame session closes only from that session, and leaves with the session', async () => {
  const {api, cdp} = await attached();
  api.event({tabId: TAB}, 'Target.attachedToTarget', attachedToTarget());
  api.event({sessionId: OOPIF_SESSION}, 'Page.javascriptDialogOpening', dialogOpening({frameId: OOPIF_FRAME}));
  assert.deepEqual(cdp.activeJsDialog(TAB, '1').target, {tabId: TAB, sessionId: OOPIF_SESSION});
  api.event({tabId: TAB}, 'Page.javascriptDialogClosed', dialogClosed());
  assert.notEqual(cdp.getJsDialog(TAB), undefined, 'the main frame closing a dialog is not the frame\'s');
  api.event({tabId: TAB}, 'Target.detachedFromTarget', {sessionId: OOPIF_SESSION});
  assert.equal(cdp.getJsDialog(TAB), undefined);
});

test('a forgotten tab forgets its dialog', async () => {
  const {api, cdp} = await attached();
  api.event({tabId: TAB}, 'Page.javascriptDialogOpening', dialogOpening());
  api.detached({tabId: TAB, reason: 'canceled_by_user'});
  assert.equal(cdp.getJsDialog(TAB), undefined);
});

test('the raw event queue: sequenced events after a cursor, a limit with hasMore, eviction past 1000 and a reset on a new top-level origin', async () => {
  const {api, cdp} = await attached();
  for (let i = 1; i <= 3; i++) api.event({tabId: TAB}, 'Network.requestWillBeSent', {requestId: `r${i}`});
  const all = await cdp.readRawCdpEvents(TAB, {afterSequence: 0});
  assert.deepEqual(all.events.map(e => [e.sequence, e.params.requestId]), [[1, 'r1'], [2, 'r2'], [3, 'r3']]);
  assert.deepEqual({cursor: all.cursor, hasMore: all.hasMore, truncated: all.truncated}, {cursor: 3, hasMore: false, truncated: false});
  const page = await cdp.readRawCdpEvents(TAB, {afterSequence: 0, limit: 2, methods: ['Network.requestWillBeSent']});
  assert.deepEqual({n: page.events.length, cursor: page.cursor, hasMore: page.hasMore}, {n: 2, cursor: 2, hasMore: true});
  assert.deepEqual((await cdp.readRawCdpEvents(TAB, {afterSequence: 2})).events.map(e => e.sequence), [3]);
  assert.deepEqual((await cdp.readRawCdpEvents(TAB, {})).events, [], 'no cursor: only what comes after now');
  for (let i = 0; i < 1000; i++) api.event({tabId: TAB}, 'Network.dataReceived', {requestId: 'r', dataLength: i});
  const evicted = await cdp.readRawCdpEvents(TAB, {afterSequence: 0});
  assert.equal(evicted.truncated, true);
  assert.equal(evicted.events.length, 1000);
  api.event({tabId: TAB}, 'Page.frameNavigated', frameNavigated({url: 'https://elsewhere.test/'}));
  assert.equal(cdp.currentTopLevelUrl(TAB), 'https://elsewhere.test/');
  const reset = await cdp.readRawCdpEvents(TAB, {afterSequence: 1003});
  assert.deepEqual(reset.events, [], 'events of the previous origin are discarded');
  const waiting = cdp.readRawCdpEvents(TAB, {timeoutMs: 1000});
  await settle();
  api.event({tabId: TAB}, 'Network.requestWillBeSent', {requestId: 'late'});
  assert.deepEqual((await waiting).events.map(e => e.params.requestId), ['late']);
});

test('internal screencast frames stay out of the raw queue; a raw screencast holds the internal one off', async () => {
  const {api, cdp} = await attached();
  let seen = 0;
  await cdp.withInternalScreencast(TAB, async isOwn => {
    api.event({tabId: TAB}, 'Page.screencastFrame', {data: 'AAA', metadata: {}, sessionId: 1});
    seen = isOwn({source: {tabId: TAB}, method: 'Page.screencastFrame', params: {sessionId: 1}}) ? 1 : 0;
  });
  assert.equal(seen, 1);
  api.event({tabId: TAB}, 'Page.screencastFrame', {data: 'BBB', metadata: {}, sessionId: 1});
  assert.deepEqual((await cdp.readRawCdpEvents(TAB, {afterSequence: 0})).events, [], 'a retired session\'s late frame is internal too');
  await cdp.callRawCdp(TAB, 'Page.startScreencast', {format: 'jpeg'});
  assert.equal(api.calls.at(-1).params.preserveDebuggerOnTimeout, true);
  assert.equal(await cdp.withInternalScreencast(TAB, async () => 'ran'), undefined);
  await cdp.callRawCdp(TAB, 'Page.stopScreencast');
  assert.equal(await cdp.withInternalScreencast(TAB, async () => 'ran'), 'ran');
  await assert.rejects(cdp.callRawCdp(TAB, 'DOM.enable', {}, {target: {sessionId: 'nope'}}), /CDP session nope is not attached to tab 7/);
});

test('waitForEvent resolves on a matching event of the tab, rejects with its timeout sentence as timeout, and runs its action after arming', async () => {
  const {api, cdp} = await attached();
  const armed = cdp.waitForEvent(TAB, e => e.method === 'Page.loadEventFired', {timeoutMs: 1000, timeoutMessage: 'no load',
    action: async () => { api.event({tabId: TAB}, 'Page.loadEventFired', {timestamp: 9}); }});
  assert.equal((await armed).params.timestamp, 9);
  const late = await rejection(cdp.waitForEvent(TAB, () => false, {timeoutMs: 20, timeoutMessage: 'Timed out after 20ms waiting for file chooser.'}));
  assert.equal(late.code, 'timeout');
  assert.equal(late.message, 'Timed out after 20ms waiting for file chooser.');
  assert.equal((await rejection(cdp.waitForEvent(TAB, () => false, {timeoutMs: 10}))).message, 'Timed out after 10ms waiting for a browser event.');
  assert.equal(await cdp.waitForEvent(TAB, () => false, {timeoutMs: 1000, timeoutMessage: 'x', initialCheck: async () => true}), undefined);
  const controller = new AbortController();
  const aborted = cdp.waitForEvent(TAB, () => false, {timeoutMs: 1000, timeoutMessage: 'x', signal: controller.signal});
  controller.abort();
  await assert.rejects(aborted, /waitForEvent aborted/);
  await assert.rejects(cdp.waitForEvent(TAB, () => { throw 'bad'; }, {timeoutMs: 1000, timeoutMessage: 'x',
    action: async () => api.event({tabId: TAB}, 'Page.loadEventFired', {})}), /waitForEvent predicate failed: bad/);
});

test('waitForPageLoadEvent: a load that starts waits for its load event; a same-document navigation ends it; nothing ends it after the classification window', async () => {
  const {api, cdp} = await attached();
  api.event({tabId: TAB}, 'Page.frameNavigated', frameNavigated());
  let done = false;
  const loading = cdp.waitForPageLoadEvent(TAB, {timeoutMs: 1000}).then(() => { done = true; });
  api.event({tabId: TAB}, 'Page.frameStartedLoading', {frameId: MAIN_FRAME});
  await sleep(300);
  assert.equal(done, false, 'a started load outlives the 250 ms classification window');
  api.event({tabId: TAB}, 'Page.loadEventFired', {timestamp: 2});
  await loading;
  const inDocument = cdp.waitForPageLoadEvent(TAB, {timeoutMs: 1000});
  api.event({tabId: TAB}, 'Page.navigatedWithinDocument', {frameId: MAIN_FRAME, url: 'https://fixture.test/#b', navigationType: 'fragment'});
  await inDocument;
  assert.equal(cdp.currentTopLevelUrl(TAB), 'https://fixture.test/#b');
  const started = Date.now();
  await cdp.waitForPageLoadEvent(TAB, {timeoutMs: 1000});
  assert.ok(Date.now() - started < 900, 'no navigation: resolved after the classification window');
});

test('evaluateJavascript returns the value or throws the page\'s exception; readDocumentState records the top-level URL', async () => {
  const {api, cdp} = await attached({'Runtime.evaluate': ({commandParams}) => (commandParams.expression === 'missing'
    ? thrown() : commandParams.expression.includes('readyState') ? evaluated({href: 'https://fixture.test/doc', readyState: 'complete'}) : evaluated(42))});
  assert.equal(await cdp.evaluateJavascript(TAB, '6*7'), 42);
  assert.deepEqual(api.calls.at(-1).params.commandParams, {expression: '6*7', returnByValue: true});
  await assert.rejects(cdp.evaluateJavascript(TAB, 'missing'), {message: 'Browser Use encountered an error interacting with this webpage: ReferenceError: missing is not defined\n    at <anonymous>:1:1'});
  assert.deepEqual(await cdp.readDocumentState(TAB), {href: 'https://fixture.test/doc', readyState: 'complete'});
  assert.equal(cdp.currentTopLevelUrl(TAB), 'https://fixture.test/doc');
  assert.equal(await cdp.readCommittedTabUrl(TAB), 'https://committed.test/');
  assert.equal(cdp.currentTopLevelUrl(TAB), 'https://committed.test/');
});

test('closeTab closes the page target and forgets the tab; detachAllTabs detaches every tab', async () => {
  const {api, cdp} = await attached({'Target.getTargets': getTargets(TAB)});
  await cdp.closeTab(TAB);
  assert.deepEqual(api.calls.at(-1).params, {target: {tabId: TAB}, method: 'Target.closeTarget', commandParams: {targetId: `PAGE-${TAB}`}});
  assert.equal(cdp.isTabAttached(TAB), false);
  await cdp.attach(8);
  await cdp.attach(9);
  await cdp.detachAllTabs();
  assert.deepEqual(api.calls.filter(c => c.op === 'detach').map(c => c.tabId).sort(), [8, 9]);
});

test('a tab lost behind the controller\'s back still releases its attached frame targets at the next detach', async () => {
  const {api, cdp} = await attached({'Target.getTargets': getTargets(TAB, [iframeTarget()]), 'Page.getFrameTree': getFrameTree(OOPIF_FRAME)});
  await cdp.targetForFrameOrAttach(TAB, OOPIF_FRAME);
  api.detached({tabId: TAB, reason: 'target_closed'});
  await cdp.attach(TAB);
  api.calls.length = 0;
  await cdp.detach(TAB);
  assert.deepEqual(api.calls.map(c => [c.op, c.targetId ?? c.tabId]), [['detachTarget', OOPIF_FRAME], ['detach', TAB]]);
});

// --- against the real host ---------------------------------------------------------------------------------------------

async function realController(t, fake) {
  const host = await startRealHost(t, fake);
  const meta = {session_id: 'cdp-real', turn_id: 't1'};
  const api = new BackendApi(await connect(host.socketPath, {nativePipe}), {getTurnMetadata: () => meta});
  t.after(() => api.close());
  const cdp = new CdpController(api);
  const tab = await api.createTab();
  return {host, api, cdp, tabId: tab.id};
}

test('real host: attaching sends focus emulation, Page.enable and auto-attach to the tab\'s debuggee; a dialog event blocks the next command', async t => {
  const {host, cdp, tabId} = await realController(t);
  await cdp.call(tabId, 'Runtime.evaluate', {expression: '1'});
  const sent = host.ext.calls.filter(c => c.method === 'debugger.sendCommand').map(c => c.params.method);
  assert.deepEqual(sent, ['Emulation.setFocusEmulationEnabled', 'Page.enable', 'Target.setAutoAttach', 'Runtime.evaluate']);
  host.ext.cdpEvent({tabId}, 'Page.javascriptDialogOpening', dialogOpening());
  await waitFor(() => cdp.getJsDialog(tabId) !== undefined, 'the dialog to be tracked');
  assert.equal((await rejection(cdp.call(tabId, 'Runtime.evaluate', {expression: '2'}))).code, 'dialog_open');
});

test('real host: beforeunload is accepted through the host as Page.handleJavaScriptDialog', async t => {
  const {host, cdp, tabId} = await realController(t);
  await cdp.attach(tabId);
  host.ext.cdpEvent({tabId}, 'Page.javascriptDialogOpening', dialogOpening({type: 'beforeunload', message: ''}));
  await waitFor(() => host.ext.calls.some(c => c.params?.method === 'Page.handleJavaScriptDialog'), 'the accept to reach the extension');
  assert.deepEqual(host.ext.calls.find(c => c.params?.method === 'Page.handleJavaScriptDialog').params.params, {accept: true});
});

test('real host: a command the host timed out (detaching the tab) leaves "Debugger unattached", which the next command recovers from', async t => {
  const {host, cdp, tabId} = await realController(t);
  await cdp.attach(tabId);
  host.ext.holdCdp('Runtime.evaluate');
  const timedOut = await rejection(cdp.call(tabId, 'Runtime.evaluate', {expression: 'slow'}, {timeoutMs: 50}));
  assert.equal(timedOut.code, 'timeout');
  assert.equal(timedOut.message, HOST_TIMEOUT(50, 'Runtime.evaluate'));
  host.ext.releaseCdp('Runtime.evaluate', evaluated('late'));
  await waitFor(() => !host.ext.state.held.has(`tab:${tabId}`), 'the host to detach the timed-out tab');
  const attachesBefore = host.ext.calls.filter(c => c.method === 'debugger.attach').length;
  assert.deepEqual(await cdp.call(tabId, 'DOM.enable'), {});
  assert.equal(host.ext.calls.filter(c => c.method === 'debugger.attach').length, attachesBefore + 1, 'one re-attach');
  host.ext.holdCdp('Runtime.evaluate');
  await rejection(cdp.call(tabId, 'Runtime.evaluate', {expression: 'slow'}, {timeoutMs: 50, preserveOnTimeout: true}));
  host.ext.releaseCdp('Runtime.evaluate', evaluated('late'));
  assert.equal(host.ext.state.held.has(`tab:${tabId}`), true, 'preserveOnTimeout keeps the debugger');
});
