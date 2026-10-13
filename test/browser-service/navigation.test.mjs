// navigate_tab_url, navigate_tab_back, navigate_tab_forward and navigate_tab_reload through the real host, the fake
// extension answering as a scripted page (support/service-on-host.mjs).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserServiceError} from '../../src/browser-service/errors.mjs';
import {execute, readyBrowser, rejection, scriptedPages, serviceOnHost} from './support/service-on-host.mjs';

async function tabOn(t, options) {
  const env = await serviceOnHost(t, options);
  const browserId = await readyBrowser(env.service);
  const {id} = await execute(env.service, {type: 'create_tab', browser_id: browserId});
  const run = params => execute(env.service, {browser_id: browserId, tab_id: id, ...params});
  return {...env, browserId, tabId: id, run};
}

test('navigate_tab_url waits for the main frame to commit the URL and load, then answers {}', async t => {
  const {run, pages, tabId} = await tabOn(t);
  assert.deepEqual(await run({type: 'navigate_tab_url', url: 'https://example.com/a'}), {});
  assert.equal(pages.page(Number(tabId)).url, 'https://example.com/a');
  const methods = pages.sent.map(s => s.method);
  assert.ok(methods.indexOf('Page.navigate') > methods.indexOf('Page.getFrameTree'), methods.join(','));
});

test('a URL the navigation check refuses never reaches the page', async t => {
  const {run, pages} = await tabOn(t);
  for (const [url, code] of [['not a url', 'invalid_url'], ['file:///etc/passwd', 'unsupported_protocol'], ['javascript:alert(1)', 'unsupported_protocol']]) {
    const error = await rejection(run({type: 'navigate_tab_url', url}));
    assert.ok(error instanceof BrowserServiceError, url);
    assert.equal(error.code, code, url);
  }
  assert.equal(pages.sent.filter(s => s.method === 'Page.navigate').length, 0);
});

test('Chrome\'s refusal of the navigation is reported in the vendor\'s sentence, without the URL\'s query', async t => {
  const {run, tabId} = await tabOn(t, {pages: scriptedPages({navigateError: 'net::ERR_NAME_NOT_RESOLVED'})});
  const error = await rejection(run({type: 'navigate_tab_url', url: 'https://nowhere.invalid/path?q=secret'}));
  assert.equal(error.message, `Browser Use cannot open https://nowhere.invalid/path in tab ${tabId}. Browser reported: net::ERR_NAME_NOT_RESOLVED`);
});

test('a navigation that never commits times out at timeout_ms with the vendor\'s sentence', async t => {
  const {run, tabId} = await tabOn(t, {pages: scriptedPages({autoLoad: false})});
  const started = Date.now();
  const error = await rejection(run({type: 'navigate_tab_url', url: 'https://example.com/slow', timeout_ms: 300}));
  assert.ok(error instanceof BrowserServiceError);
  assert.equal(error.code, 'timeout');
  assert.equal(error.message, `Timed out waiting for tab ${tabId} to navigate to https://example.com/slow.`);
  assert.ok(Date.now() - started < 3000, 'bounded by timeout_ms');
});

test('back and forward move through the tab\'s history and wait for the load', async t => {
  const {run, pages, tabId} = await tabOn(t);
  await run({type: 'navigate_tab_url', url: 'https://example.com/a'});
  await run({type: 'navigate_tab_url', url: 'https://example.com/b'});
  assert.deepEqual(await run({type: 'navigate_tab_back'}), {});
  assert.equal(pages.page(Number(tabId)).url, 'https://example.com/a');
  assert.deepEqual(await run({type: 'navigate_tab_forward'}), {});
  assert.equal(pages.page(Number(tabId)).url, 'https://example.com/b');
  assert.equal((await rejection(run({type: 'navigate_tab_forward'}))).message, 'Cannot navigate forward: no next page in history.');
  await run({type: 'navigate_tab_back'});
  await run({type: 'navigate_tab_back'});
  assert.equal((await rejection(run({type: 'navigate_tab_back'}))).message, 'Cannot navigate back: no previous page in history.');
});

test('reload reloads the page and waits for its load', async t => {
  const {run, pages, tabId} = await tabOn(t);
  await run({type: 'navigate_tab_url', url: 'https://example.com/a'});
  const loader = pages.page(Number(tabId)).loader;
  assert.deepEqual(await run({type: 'navigate_tab_reload'}), {});
  assert.notEqual(pages.page(Number(tabId)).loader, loader);
  assert.equal(pages.sent.filter(s => s.method === 'Page.reload').length, 1);
});

test('a reload whose CDP command stalls and whose host-side detach stalls too still ends at timeout_ms (the host never answers)', async t => {
  const {run, ext} = await tabOn(t);
  await run({type: 'navigate_tab_url', url: 'https://example.com/a'});
  ext.holdCdp('Page.reload');
  ext.stall('debugger.detach');
  const started = Date.now();
  const error = await rejection(run({type: 'navigate_tab_reload', timeout_ms: 40}));
  assert.ok(Date.now() - started < 800, `settled after ${Date.now() - started} ms (an unbounded wait never settles; one bounded only by timeoutMs and the grace takes over a second)`);
  assert.ok(error instanceof BrowserServiceError);
  assert.equal(error.code, 'timeout');
  ext.releaseCdp('Page.reload', {});
  assert.equal(ext.calls.filter(c => c.params?.method === 'Page.reload').length, 1, 'never dispatched twice (no replay)');
});

test('the history commands refuse a tab id that is not a positive integer, in the vendor\'s words', async t => {
  const {run} = await tabOn(t);
  for (const type of ['navigate_tab_back', 'navigate_tab_forward', 'navigate_tab_reload'])
    assert.equal((await rejection(run({type, tab_id: '-1'}))).message, `${type} requires a positive integer tab_id`);
});
