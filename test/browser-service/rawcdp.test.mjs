// tab_cdp_call and tab_cdp_events (src/browser-service/rawcdp.mjs, the vendor's O1 and M1 over its raw CDP method gate,
// readable chatgpt-26.928.40906 BS:53872-54245): refused as an unavailable capability on cua's host, which announces no
// `cdp`; for a backend that does, the vendor's gate (domains, refused methods and parameters, the service's document
// interception kept on the tab) and the raw call's own rules (3 s by default, the debugger kept, no raw Fetch, Network
// or Target call while the service guards a request or releases a paused document response).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COMMAND_HANDLERS} from '../../src/browser-service/index.mjs';
import {BrowserServiceError} from '../../src/browser-service/errors.mjs';
import {RAW_CDP_HANDLERS, permittedRawCall} from '../../src/browser-service/rawcdp.mjs';
import {CdpController} from '../../src/browser-service/cdp.mjs';
import {DocumentResponses} from '../../src/browser-service/downloads.mjs';
import {execute, readyBrowser, rejection, serviceOnHost} from './support/service-on-host.mjs';

const NOT_SUPPORTED = 'This method is not supported through raw CDP.';

test('both raw CDP commands are registered', () => {
  for (const type of ['tab_cdp_call', 'tab_cdp_events']) assert.equal(typeof COMMAND_HANDLERS.get(type), 'function', type);
});

test('on cua\'s host, which announces no cdp capability, both commands fail as an unavailable capability and send nothing', async t => {
  const env = await serviceOnHost(t);
  const browserId = await readyBrowser(env.service);
  const {id} = await execute(env.service, {type: 'create_tab', browser_id: browserId});
  // The vendor's documentation gate comes first (these documents are required reading for the commands).
  for (const name of ['confirmations', 'capabilities/tab/cdp']) await execute(env.service, {type: 'get_documentation', name});
  const before = env.pages.sent.length;
  for (const params of [{type: 'tab_cdp_call', method: 'Runtime.evaluate', params: {expression: '1'}}, {type: 'tab_cdp_events'}]) {
    const error = await rejection(execute(env.service, {browser_id: browserId, tab_id: id, ...params}));
    assert.ok(error instanceof BrowserServiceError);
    assert.equal(error.code, 'browser_capability_unavailable');
    assert.equal(error.message, 'This browser does not provide the "cdp" capability.');
  }
  assert.equal(env.pages.sent.length, before, 'no CDP call');
});

test('the method gate: listed domains only, the refused domains, methods and parameters, each refusal naming the API to use', () => {
  const refused = (method, params, message = NOT_SUPPORTED) => assert.throws(() => permittedRawCall(method, params, {preserveDocumentInterception: true}), {message}, method);
  for (const method of ['Browser.close', 'SystemInfo.getInfo', 'noDomain', 'Storage.clearDataForOrigin', 'Target.createTarget', 'WebAuthn.enable',
    'Page.crash', 'Network.getCertificate', 'Page.addScriptToEvaluateOnNewDocument']) refused(method, {});
  refused('Page.navigate', {url: 'https://example.com'}, `${NOT_SUPPORTED} Use tab.goto(url) instead.`);
  refused('Input.dispatchKeyEvent', {}, `${NOT_SUPPORTED} Use tab.cua.type(...) or tab.cua.keypress(...) instead.`);
  refused('Page.setInterceptFileChooserDialog', {enabled: true}, `${NOT_SUPPORTED} Use tab.playwright.waitForEvent("filechooser") and chooser.setFiles(...) instead.`);
  refused('Page.reload', {scriptToEvaluateOnLoad: 'x'}, `${NOT_SUPPORTED} Use tab.reload() instead.`);
  refused('Network.enable', {enableDurableMessages: true});
  refused('Tracing.start', {tracingBackend: 'system'});
  refused('Tracing.start', {traceConfig: {enableSystrace: true}});
  refused('Page.createIsolatedWorld', {frameId: 'F', grantUniveralAccess: true});
  assert.deepEqual(permittedRawCall('Page.reload', {}, {preserveDocumentInterception: true}), {});
  assert.deepEqual(permittedRawCall('Runtime.evaluate', {expression: '1'}, {preserveDocumentInterception: true}), {expression: '1'});
  assert.deepEqual(permittedRawCall('Tracing.start', {categories: 'devtools'}, {preserveDocumentInterception: true}), {categories: 'devtools'});
});

test('to the tab itself the service keeps its document interception; a child target may manage its own Fetch domain', () => {
  const tab = {preserveDocumentInterception: true}, child = {preserveDocumentInterception: false};
  assert.throws(() => permittedRawCall('Fetch.disable', {}, tab), {message: `${NOT_SUPPORTED} Use Fetch.enable with an empty patterns array to clear raw interception.`});
  const enableRefusal = {message: `${NOT_SUPPORTED} Use explicit non-Document resourceType patterns; Browser Use reserves Document responses for browser-managed navigation.`};
  assert.throws(() => permittedRawCall('Fetch.enable', {}, tab), enableRefusal);
  assert.throws(() => permittedRawCall('Fetch.enable', {patterns: [{resourceType: 'Document'}]}, tab), enableRefusal);
  assert.throws(() => permittedRawCall('Fetch.enable', {patterns: [{urlPattern: '*'}]}, tab), enableRefusal);
  assert.deepEqual(permittedRawCall('Fetch.enable', {patterns: [{resourceType: 'Image', requestStage: 'Request'}]}, tab),
    {patterns: [{resourceType: 'Image', requestStage: 'Request'}, {requestStage: 'Response', resourceType: 'Document'}]});
  assert.deepEqual(permittedRawCall('Fetch.enable', {patterns: []}, tab), {patterns: [{requestStage: 'Response', resourceType: 'Document'}]});
  assert.deepEqual(permittedRawCall('Fetch.disable', {}, child), {});
  assert.deepEqual(permittedRawCall('Fetch.enable', {patterns: [{resourceType: 'Document'}]}, child), {patterns: [{resourceType: 'Document'}]});
});

// A session whose backend announced `cdp`, over a recording controller and document responses.
function announced({type = 'extension', interceptors = false, paused = false, capabilities = [{id: 'cdp'}]} = {}) {
  const calls = [], reads = [];
  const responses = {interceptors, paused, ready: 0,
    hasRequestInterceptors: () => responses.interceptors, hasOwnedPausedResponses: () => responses.paused,
    ensureInterceptionReady: async () => { responses.ready += 1; }};
  const session = {
    clientInfo: {type}, capabilities: {browser: [], tab: capabilities}, documentResponses: responses,
    cdp: {
      async callRawCdp(tabId, method, params, options) {
        await options.prepareDispatch();
        options.beforeDispatch();
        calls.push({tabId, method, params, target: options.target, timeoutMs: options.timeoutMs});
        return method === 'Runtime.evaluate' ? {result: {type: 'number', value: 2}} : undefined;
      },
      async readRawCdpEvents(tabId, options) { reads.push({tabId, ...options}); return {cursor: 4, events: [], hasMore: false, truncated: false}; },
    },
  };
  const run = (command, params) => RAW_CDP_HANDLERS[command]({browser_id: 'b', tab_id: '5', ...params}, session);
  return {session, responses, calls, reads, run};
}

test('with the capability announced, a call goes to the tab or a child target on 3 s by default, its answer or {} returned', async () => {
  const {calls, responses, run} = announced();
  assert.deepEqual(await run('tab_cdp_call', {method: 'Runtime.evaluate', params: {expression: '1+1'}}), {result: {type: 'number', value: 2}});
  assert.deepEqual(await run('tab_cdp_call', {method: 'Fetch.enable', params: {patterns: [{resourceType: 'Image'}]}, timeout_ms: 500}), {});
  assert.deepEqual(await run('tab_cdp_call', {method: 'Fetch.disable', target: {session_id: 'S1'}}), {});
  assert.deepEqual(calls, [
    {tabId: 5, method: 'Runtime.evaluate', params: {expression: '1+1'}, target: undefined, timeoutMs: 3000},
    {tabId: 5, method: 'Fetch.enable', params: {patterns: [{resourceType: 'Image'}, {requestStage: 'Response', resourceType: 'Document'}]}, target: undefined, timeoutMs: 500},
    {tabId: 5, method: 'Fetch.disable', params: undefined, target: {sessionId: 'S1'}, timeoutMs: 3000},
  ]);
  assert.equal(responses.ready, 3, 'the tab\'s interception is ready before each dispatch');
});

test('no raw Fetch, Network or Target call while a request is guarded, and no raw call while a document response is being released', async () => {
  const guarded = announced({interceptors: true});
  assert.equal((await rejection(guarded.run('tab_cdp_call', {method: 'Network.enable'}))).message, 'Raw CDP is unavailable while Browser Use is protecting a browser request.');
  assert.deepEqual(await guarded.run('tab_cdp_call', {method: 'DOM.enable'}), {});
  const releasing = announced({paused: true});
  assert.equal((await rejection(releasing.run('tab_cdp_call', {method: 'DOM.enable'}))).message, 'Raw CDP is unavailable while Browser Use is resolving a paused document response.');
  assert.deepEqual(releasing.calls, []);
});

test('tab_cdp_events reads the tab\'s buffered events with the caller\'s cursor, filters and wait', async () => {
  const {reads, run} = announced();
  assert.deepEqual(await run('tab_cdp_events', {after_sequence: 3, limit: 10, methods: ['Page.loadEventFired'], target: {target_id: 'T1'}, timeout_ms: 250}),
    {cursor: 4, events: [], hasMore: false, truncated: false});
  assert.deepEqual(reads, [{tabId: 5, afterSequence: 3, limit: 10, methods: ['Page.loadEventFired'], target: {targetId: 'T1'}, timeoutMs: 250}]);
});

test('a backend type the vendor never offers raw CDP to is refused with its sentence, even when it announces the capability', async () => {
  const {run} = announced({type: 'mcpapps'});
  assert.equal((await rejection(run('tab_cdp_events', {}))).message, 'Full CDP access is currently only available for browser extension and in-app browser tabs.');
});

test('a target must name exactly one non-empty session_id or target_id: an empty one never reaches the tab itself', async () => {
  // The real controller, whose rawCdpTarget would resolve an empty selector to the tab, over a backend that records.
  const sent = [];
  const api = {
    addEventListener() { return () => {}; },
    async attach() { return {}; }, async detach() { return {}; },
    async executeCdp(params) { sent.push(params.method); return {}; },
  };
  const cdp = new CdpController(api);
  const session = {clientInfo: {type: 'extension'}, capabilities: {browser: [], tab: [{id: 'cdp'}]}, cdp, documentResponses: new DocumentResponses(cdp)};
  const run = (command, params) => RAW_CDP_HANDLERS[command]({browser_id: 'b', tab_id: '5', ...params}, session);
  const sentence = 'CDP target must provide exactly one of session_id or target_id.';
  for (const target of [{}, {session_id: ''}, {target_id: ''}, {session_id: 'S1', target_id: 'T1'}, null, 'S1', {session_id: 7}]) {
    assert.equal((await rejection(run('tab_cdp_call', {method: 'Fetch.disable', target}))).message, sentence, JSON.stringify(target));
    assert.equal((await rejection(run('tab_cdp_events', {target}))).message, sentence, JSON.stringify(target));
  }
  assert.deepEqual(sent, [], 'nothing dispatched, the tab\'s document interception untouched');
  assert.equal((await rejection(run('tab_cdp_call', {method: 'Fetch.disable'}))).message, `${NOT_SUPPORTED} Use Fetch.enable with an empty patterns array to clear raw interception.`);
  assert.deepEqual(sent, []);
});
