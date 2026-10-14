// tab_browser_auth_handoff (src/browser-service/authhandoff.mjs, the local form of the vendor's UB, readable
// chatgpt-26.928.40906 BS:44114-44134 with BX and Ys): refused on cua's host, which announces no browserAuth; for a
// backend that does, the request is checked as the vendor checks it, the tab is marked handoff for the person to sign
// in themselves, and the answer is the vendor's "the person took over" result. Nothing is collected, filled or asked.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AUTH_HANDOFF_HANDLERS} from '../../src/browser-service/authhandoff.mjs';
import {BrowserServiceError} from '../../src/browser-service/errors.mjs';
import {COMMAND_HANDLERS} from '../../src/browser-service/index.mjs';
import {execute, readyBrowser, rejection, serviceOnHost} from './support/service-on-host.mjs';

const ORIGIN = 'https://accounts.example.com';
const FIELDS = [
  {id: 'user', label: 'Email', type: 'email', required: true, selector: '#email'},
  {id: 'pass', label: 'Password', type: 'password', required: true, selector: '#password'},
];

test('tab_browser_auth_handoff is registered', () => {
  assert.equal(typeof COMMAND_HANDLERS.get('tab_browser_auth_handoff'), 'function');
});

test('on cua\'s host, which announces no browserAuth, the request is refused as the vendor refuses it there, nothing sent', async t => {
  const env = await serviceOnHost(t);
  const browserId = await readyBrowser(env.service);
  const {id} = await execute(env.service, {type: 'create_tab', browser_id: browserId});
  const unread = await rejection(execute(env.service, {type: 'tab_browser_auth_handoff', browser_id: browserId, tab_id: id, origin: ORIGIN, fields: FIELDS}));
  assert.match(unread.message, /^Required documentation has not been read: "capabilities\/tab\/browserAuth"/, 'its document first, as the vendor\'s');
  await execute(env.service, {type: 'get_documentation', name: 'capabilities/tab/browserAuth'});
  const before = env.requests().length;
  const error = await rejection(execute(env.service, {type: 'tab_browser_auth_handoff', browser_id: browserId, tab_id: id, origin: ORIGIN, fields: FIELDS}));
  assert.ok(error instanceof BrowserServiceError);
  assert.equal(error.code, 'browser_capability_unavailable');
  assert.equal(error.message, 'cua does not support command "tab_browser_auth_handoff".');
  assert.deepEqual(env.requests().slice(before), [], 'no backend request');
});

// A session whose backend announced browserAuth, its tab's main frame `frame`, recording marks and CDP calls.
function announced({frame = {id: 'F1', loaderId: 'L1', securityOrigin: ORIGIN, url: `${ORIGIN}/signin?next=%2F`}, capabilities = [{id: 'browserAuth'}]} = {}) {
  const marks = [], calls = [];
  const session = {
    clientInfo: {name: 'MAWS'}, capabilities: {browser: [], tab: capabilities},
    cdp: {async call(tabId, method) { calls.push({tabId, method}); return {frameTree: {frame}}; }},
    tabs: {async mark(tabId, status) { marks.push({tabId, status}); }},
  };
  const run = params => AUTH_HANDOFF_HANDLERS.tab_browser_auth_handoff({browser_id: 'b', tab_id: '7', origin: ORIGIN, fields: FIELDS, ...params}, session);
  return {marks, calls, run};
}

test('the tab is handed to the person: marked handoff, answered with the vendor\'s "took over" result', async () => {
  for (const request of [{}, {submit: {selector: '#password', action: 'press_enter'}}, {submit: {selector: '#sign-in', action: 'click'}}, {fields: [], qr_code: true}, {fields: [], options: [{id: 'google', label: 'Google', selector: '#google'}, {id: 'mail', label: 'email', field_ids: []}]}]) {
    const {marks, calls, run} = announced();
    assert.deepEqual(await run(request), {status: 'declined', reason: 'user_took_over'}, JSON.stringify(request));
    assert.deepEqual(calls, [{tabId: 7, method: 'Page.getFrameTree'}]);
    assert.deepEqual(marks, [{tabId: 7, status: 'handoff'}]);
  }
});

test('a page no longer on the request\'s origin, or not fully known, is reported and the tab left unmarked', async () => {
  const cases = [
    [{origin: 'https://other.example.com'}, undefined, 'origin_changed'],
    [{}, {id: 'F1', loaderId: 'L1', securityOrigin: 'https://evil.example', url: `${ORIGIN}/signin`}, 'origin_changed'],
    [{origin: undefined}, {id: 'F1', loaderId: 'L1', securityOrigin: 'chrome://newtab', url: 'chrome://newtab/'}, 'origin_changed'],
    [{}, {id: 'F1', loaderId: '', securityOrigin: ORIGIN, url: `${ORIGIN}/signin`}, 'page_changed'],
  ];
  for (const [request, frame, status] of cases) {
    const {marks, run} = announced(frame == null ? {} : {frame});
    assert.deepEqual(await run(request), {status}, JSON.stringify([request, frame]));
    assert.deepEqual(marks, []);
  }
});

test('fields and options sharing an id or selector, an option naming an unknown field, or a submit click on a credential field are locator_invalid before the page is read', async () => {
  const cases = [
    {fields: [FIELDS[0], {...FIELDS[1], id: 'user'}]},
    {fields: [FIELDS[0], {...FIELDS[1], selector: '#email'}]},
    {fields: [FIELDS[0]], options: [{id: 'a', label: 'A', selector: '#email'}, {id: 'b', label: 'B', field_ids: ['user']}]},
    {fields: [FIELDS[0]], options: [{id: 'a', label: 'A', field_ids: ['user']}, {id: 'a', label: 'B', selector: '#b'}]},
    {fields: [FIELDS[0]], options: [{id: 'a', label: 'A', field_ids: ['nobody']}, {id: 'b', label: 'B', selector: '#b'}]},
    {fields: [FIELDS[0]], options: [{id: 'a', label: 'A', field_ids: ['user', 'user']}, {id: 'b', label: 'B', selector: '#b'}]},
    {submit: {selector: '#password', action: 'click'}},
  ];
  for (const request of cases) {
    const {marks, calls, run} = announced();
    assert.deepEqual(await run(request), {status: 'locator_invalid'}, JSON.stringify(request));
    assert.deepEqual([marks, calls], [[], []]);
  }
});

test('a backend that does not announce browserAuth is refused in its own name', async () => {
  const {marks, calls, run} = announced({capabilities: [{id: 'webmcp'}]});
  const error = await rejection(run({}));
  assert.equal(error.code, 'browser_capability_unavailable');
  assert.equal(error.message, 'MAWS does not support command "tab_browser_auth_handoff".');
  assert.deepEqual([marks, calls], [[], []]);
});
