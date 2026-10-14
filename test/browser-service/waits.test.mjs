// playwright_wait_for_load_state, playwright_wait_for_url and playwright_wait_for_timeout through the real host, the
// fake extension answering as a scripted page whose document state and events the test drives (the vendor's r1, s1 and
// n1, readable chatgpt-26.928.40906 BS:50098-50349).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserServiceError} from '../../src/browser-service/errors.mjs';
import {execute, readyBrowser, rejection, scriptedPages, serviceOnHost, waitFor} from './support/service-on-host.mjs';

// Scripted pages whose document reports `doc.readyState` and `doc.href`, and a frame tree with `doc.loader`.
function documentPages() {
  const doc = {readyState: 'complete', href: 'https://example.com/start', loader: 'L1'};
  const pages = scriptedPages();
  const cdp = request => {
    const tabId = request.debuggee.tabId;
    if (request.method === 'Runtime.evaluate') { pages.sent.push({tabId, method: request.method, params: request.params}); return {result: {type: 'object', value: {href: doc.href, readyState: doc.readyState}}}; }
    if (request.method === 'Page.setLifecycleEventsEnabled') doc.onLifecycleEnabled?.(tabId);
    if (request.method === 'Page.getFrameTree') { pages.sent.push({tabId, method: request.method, params: request.params}); return {frameTree: {frame: {id: `F${tabId}`, loaderId: doc.loader, url: doc.href}}}; }
    return pages.cdp(request);
  };
  return {...pages, cdp, doc};
}

async function tabOn(t) {
  const pages = documentPages();
  const env = await serviceOnHost(t, {pages});
  const browserId = await readyBrowser(env.service);
  const {id} = await execute(env.service, {type: 'create_tab', browser_id: browserId});
  const run = params => execute(env.service, {browser_id: browserId, tab_id: id, ...params});
  const event = (method, params) => env.ext.cdpEvent({tabId: Number(id)}, method, params);
  const sent = method => pages.sent.filter(s => s.method === method).length;
  return {...env, pages, doc: pages.doc, tabId: id, run, event, sent};
}

test('wait_for_load_state answers {} at once when the document has reached the state', async t => {
  const {run, doc, sent} = await tabOn(t);
  assert.deepEqual(await run({type: 'playwright_wait_for_load_state'}), {});
  doc.readyState = 'interactive';
  assert.deepEqual(await run({type: 'playwright_wait_for_load_state', state: 'domcontentloaded'}), {});
  assert.equal(sent('Page.enable') >= 2, true);
});

test('wait_for_load_state waits for the load event of a loading document', async t => {
  const {run, doc, event} = await tabOn(t);
  doc.readyState = 'loading';
  const waiting = run({type: 'playwright_wait_for_load_state', state: 'load', timeout_ms: 2000});
  let settled = false;
  waiting.then(() => { settled = true; }, () => { settled = true; });
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(settled, false, 'still loading');
  event('Page.domContentEventFired', {timestamp: 1});
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(settled, false, 'DOMContentLoaded is not load');
  event('Page.loadEventFired', {timestamp: 2});
  assert.deepEqual(await waiting, {});
});

test('wait_for_load_state times out with the vendor\'s sentence at the caller\'s budget, which may exceed 3 s', async t => {
  const {run, doc, event, tabId} = await tabOn(t);
  doc.readyState = 'loading';
  let started = Date.now();
  const error = await rejection(run({type: 'playwright_wait_for_load_state', timeout_ms: 200}));
  assert.ok(error instanceof BrowserServiceError);
  assert.equal(error.code, 'timeout');
  assert.equal(error.message, `Timed out waiting for load in tab ${tabId}.`);
  assert.ok(Date.now() - started < 1500, `bounded by timeout_ms (${Date.now() - started} ms)`);
  started = Date.now();
  const lifted = run({type: 'playwright_wait_for_load_state', timeout_ms: 5000});
  setTimeout(() => event('Page.loadEventFired', {timestamp: 3}), 3300);
  assert.deepEqual(await lifted, {});
  assert.ok(Date.now() - started >= 3200, 'waited past the vendor\'s 3 s cap');
});

test('a stalled Page.enable still ends at timeout_ms (the deadline is enforced after dispatch)', async t => {
  const {run, ext, tabId} = await tabOn(t);
  ext.holdCdp('Page.enable');
  const started = Date.now();
  const error = await rejection(run({type: 'playwright_wait_for_load_state', timeout_ms: 150}));
  assert.ok(Date.now() - started < 1000, `settled after ${Date.now() - started} ms`);
  assert.ok(error instanceof BrowserServiceError);
  assert.equal(error.code, 'timeout');
  ext.releaseCdp('Page.enable');
  assert.ok(tabId);
});

test('networkidle waits for the main frame\'s networkIdle lifecycle event of its current loader', async t => {
  const {run, event, tabId, sent} = await tabOn(t);
  const waiting = run({type: 'playwright_wait_for_load_state', state: 'networkidle', timeout_ms: 2000});
  await waitFor(() => sent('Page.setLifecycleEventsEnabled') === 1, 'lifecycle events enabled');
  event('Page.lifecycleEvent', {name: 'networkIdle', frameId: `F${tabId}`, loaderId: 'L-other'});
  event('Page.lifecycleEvent', {name: 'networkIdle', frameId: `F${tabId}`, loaderId: 'L1'});
  assert.deepEqual(await waiting, {});
});

test('networkidle restarts on a new main-frame document and times out with the vendor\'s sentence', async t => {
  const {run, event, tabId, sent} = await tabOn(t);
  const waiting = run({type: 'playwright_wait_for_load_state', state: 'networkidle', timeout_ms: 400});
  await waitFor(() => sent('Page.setLifecycleEventsEnabled') === 1, 'lifecycle events enabled');
  event('Page.frameNavigated', {frame: {id: `F${tabId}`, loaderId: 'L2', url: 'https://example.com/next'}, type: 'Navigation'});
  event('Page.lifecycleEvent', {name: 'networkIdle', frameId: `F${tabId}`, loaderId: 'L1'});
  const error = await rejection(waiting);
  assert.equal(error.message, `Timed out waiting for networkidle in tab ${tabId}.`);
});

test('a zero budget is one observation: a complete document, or one idle when observed, succeeds; otherwise the vendor\'s timeout', async t => {
  const {run, doc, event, tabId} = await tabOn(t);
  assert.deepEqual(await run({type: 'playwright_wait_for_load_state', timeout_ms: 0}), {});
  doc.readyState = 'interactive';
  assert.deepEqual(await run({type: 'playwright_wait_for_load_state', state: 'domcontentloaded', timeout_ms: 0}), {});
  doc.readyState = 'loading';
  assert.equal((await rejection(run({type: 'playwright_wait_for_load_state', timeout_ms: 0}))).message, `Timed out waiting for load in tab ${tabId}.`);
  doc.onLifecycleEnabled = id => event('Page.lifecycleEvent', {name: 'networkIdle', frameId: `F${id}`, loaderId: 'L1'});
  assert.deepEqual(await run({type: 'playwright_wait_for_load_state', state: 'networkidle', timeout_ms: 0}), {});
  doc.onLifecycleEnabled = undefined;
  assert.equal((await rejection(run({type: 'playwright_wait_for_load_state', state: 'networkidle', timeout_ms: 0}))).message,
    `Timed out waiting for networkidle in tab ${tabId}.`);
});

test('networkidle fails when the tab detaches', async t => {
  const {run, ext, tabId, sent} = await tabOn(t);
  const waiting = run({type: 'playwright_wait_for_load_state', state: 'networkidle', timeout_ms: 2000});
  await waitFor(() => sent('Page.setLifecycleEventsEnabled') === 1, 'lifecycle events enabled');
  ext.userCancel({tabId: Number(tabId)});
  const error = await rejection(waiting);
  assert.equal(error.message, `Tab ${tabId} detached while waiting for networkidle.`);
});

test('wait_for_url answers the current URL when it already matches, its glob anchored on both ends', async t => {
  const {run} = await tabOn(t);
  assert.deepEqual(await run({type: 'playwright_wait_for_url', url: 'https://example.com/start'}), {url: 'https://example.com/start'});
  assert.deepEqual(await run({type: 'playwright_wait_for_url', url: '**/st*'}), {url: 'https://example.com/start'});
  // An explicit zero budget is one attempt: a URL already there is found.
  assert.deepEqual(await run({type: 'playwright_wait_for_url', url: '**/start', timeout_ms: 0}), {url: 'https://example.com/start'});
  // '*' stops at a slash; the glob is anchored at its end; regular-expression characters are literal.
  assert.deepEqual(await run({type: 'playwright_wait_for_url', url: 'https://*/start'}), {url: 'https://example.com/start'});
  const error = await rejection(run({type: 'playwright_wait_for_url', url: 'https:*start', timeout_ms: 100}));
  assert.match(error.message, /^Timed out waiting for URL https:\*start in tab \d+\.$/);
  assert.equal((await rejection(run({type: 'playwright_wait_for_url', url: 'https://*/sta', timeout_ms: 100}))).code, 'timeout');
  assert.equal((await rejection(run({type: 'playwright_wait_for_url', url: 'https://example.com/st.rt', timeout_ms: 100}))).code, 'timeout');
  assert.equal((await rejection(run({type: 'playwright_wait_for_url', url: ''}))).message, 'playwright_wait_for_url requires a url');
});

test('wait_for_url waits for the main frame to commit a matching URL; a child frame\'s does not count', async t => {
  const {run, event, tabId} = await tabOn(t);
  const waiting = run({type: 'playwright_wait_for_url', url: '**/target.html', timeout_ms: 2000});
  await new Promise(resolve => setTimeout(resolve, 100));
  event('Page.frameNavigated', {frame: {id: 'child', parentId: `F${tabId}`, loaderId: 'C1', url: 'https://example.com/target.html'}, type: 'Navigation'});
  event('Page.frameNavigated', {frame: {id: `F${tabId}`, loaderId: 'L2', url: 'https://example.com/other.html'}, type: 'Navigation'});
  let settled = false;
  waiting.then(() => { settled = true; }, () => { settled = true; });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(settled, false);
  event('Page.frameNavigated', {frame: {id: `F${tabId}`, loaderId: 'L3', url: 'https://example.com/target.html'}, type: 'Navigation'});
  assert.deepEqual(await waiting, {url: 'https://example.com/target.html'});
});

test('wait_for_url takes a same-document navigation, then waits for wait_until\'s load state', async t => {
  const {run, event, doc, tabId} = await tabOn(t);
  doc.readyState = 'loading';
  const waiting = run({type: 'playwright_wait_for_url', url: '**#done', wait_until: 'load', timeout_ms: 2000});
  await new Promise(resolve => setTimeout(resolve, 100));
  event('Page.navigatedWithinDocument', {frameId: `F${tabId}`, url: 'https://example.com/start#done'});
  let settled = false;
  waiting.then(() => { settled = true; }, () => { settled = true; });
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(settled, false, 'the load is still pending');
  event('Page.loadEventFired', {timestamp: 4});
  assert.deepEqual(await waiting, {url: 'https://example.com/start#done'});
});

test('wait_for_timeout waits the time asked, uncapped by the action budget, in a known tab', async t => {
  const {run, browserId, service} = await tabOn(t);
  const started = Date.now();
  assert.deepEqual(await run({type: 'playwright_wait_for_timeout', timeout_ms: 250}), {});
  assert.ok(Date.now() - started >= 240);
  const error = await rejection(execute(service, {type: 'playwright_wait_for_timeout', browser_id: browserId, tab_id: 'nope', timeout_ms: 10}));
  assert.ok(error instanceof Error);
});
