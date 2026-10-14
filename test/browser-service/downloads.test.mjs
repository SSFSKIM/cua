// Downloads (src/browser-service/downloads.mjs, the vendor's yf and Mf with LZ, YO and LO, readable
// chatgpt-26.928.40906 BS:53611-53860, BS:60883-61180, BS:50015-50031 and BS:49544-49552). Through the real host and
// the fake extension: every attached tab's document responses are paused (Fetch, response stage) and released by the
// service; a response that is a download is failed unless a wait is armed, in which case it is let through and the
// wait answers when the host's onDownloadChange reports the download Chrome made of it complete, by id, its path the
// one Chrome gave (under Chrome's download directory). The media variant's request matching is shown on the classes
// over a scripted controller.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COMMAND_HANDLERS} from '../../src/browser-service/index.mjs';
import {Emitter} from '../../src/browser-service/cdp.mjs';
import {DocumentResponses, Downloads} from '../../src/browser-service/downloads.mjs';
import {BrowserServiceError} from '../../src/browser-service/errors.mjs';
import {execute, readyBrowser, rejection, scriptedPages, serviceOnHost, waitFor} from './support/service-on-host.mjs';

const DOCUMENTS = {requestStage: 'Response', resourceType: 'Document'};
const URL_A = 'https://example.com/files/parity.txt';
const PATH_A = '/Users/agent/Downloads/parity.txt';
const header = (name, value) => ({name, value});
const ATTACHMENT = [header('Content-Type', 'text/plain'), header('Content-Disposition', 'attachment; filename="parity.txt"')];

let nextRequest = 1;
// Chrome pausing a document response (Fetch.requestPaused at the response stage).
const pausedResponse = ({url = URL_A, headers = ATTACHMENT, status = 200, resourceType = 'Document', errorReason, frameId = 'F1', requestId = `R${nextRequest++}`} = {}) => ({
  requestId, frameId, resourceType, request: {url, method: 'GET', headers: {}},
  ...(errorReason ? {responseErrorReason: errorReason} : {responseStatusCode: status, responseStatusText: 'OK', responseHeaders: headers}),
});

async function tabOn(t) {
  const pages = scriptedPages();
  const env = await serviceOnHost(t, {pages});
  const browserId = await readyBrowser(env.service);
  const {id} = await execute(env.service, {type: 'create_tab', browser_id: browserId});
  const run = params => execute(env.service, {browser_id: browserId, tab_id: id, ...params});
  await run({type: 'navigate_tab_url', url: 'https://example.com/downloads'});
  const sent = method => pages.sent.filter(s => s.method === method && s.tabId === Number(id)).map(s => s.params);
  const pause = (options = {}, sessionId) => {
    const params = pausedResponse(options);
    env.ext.cdpEvent({tabId: Number(id)}, 'Fetch.requestPaused', params, sessionId);
    return params.requestId;
  };
  const released = requestId => ['Fetch.continueResponse', 'Fetch.failRequest', 'Fetch.continueRequest']
    .flatMap(method => sent(method).filter(p => p.requestId === requestId).map(p => ({method, ...p})));
  const settledOf = promise => {
    const state = {settled: false};
    promise.then(() => { state.settled = true; }, () => { state.settled = true; });
    return state;
  };
  return {...env, pages, run, sent, pause, released, settledOf, tabId: id};
}

test('the download commands are registered', () => {
  for (const type of ['playwright_wait_for_download', 'playwright_download_path', 'playwright_locator_download_media']) {
    assert.equal(typeof COMMAND_HANDLERS.get(type), 'function', type);
  }
});

test('an attached tab\'s document responses are paused and released: pages continue, unrequested downloads are failed', async t => {
  const {sent, pause, released} = await tabOn(t);
  assert.deepEqual(sent('Fetch.enable'), [{patterns: [DOCUMENTS]}], 'interception set up once, at attach');
  const page = pause({url: 'https://example.com/next', headers: [header('content-type', 'text/html; charset=utf-8')]});
  const pdf = pause({url: 'https://example.com/a.pdf', headers: [header('content-type', 'application/pdf')]});
  const download = pause();
  const plain = pause({url: 'https://example.com/data.json', headers: [header('content-type', 'application/json')]});
  const redirect = pause({status: 302, headers: [header('location', '/elsewhere'), header('content-type', 'application/octet-stream')]});
  const failed = pause({errorReason: 'Failed'});
  await waitFor(() => [page, pdf, download, plain, redirect, failed].every(id => released(id).length === 1), 'every response to be released');
  assert.deepEqual(released(page), [{method: 'Fetch.continueResponse', requestId: page}]);
  assert.deepEqual(released(pdf), [{method: 'Fetch.continueResponse', requestId: pdf}], 'a PDF is shown, not downloaded, without a wait');
  assert.deepEqual(released(download), [{method: 'Fetch.failRequest', requestId: download, errorReason: 'BlockedByClient'}]);
  assert.deepEqual(released(plain), [{method: 'Fetch.failRequest', requestId: plain, errorReason: 'BlockedByClient'}], 'a type Chrome would download');
  assert.deepEqual(released(redirect), [{method: 'Fetch.continueResponse', requestId: redirect}], 'a redirect is followed');
  assert.deepEqual(released(failed), [{method: 'Fetch.continueRequest', requestId: failed}]);
});

test('a paused response of another resource type or of a frame\'s session is left alone', async t => {
  const {pause, released} = await tabOn(t);
  const script = pause({resourceType: 'Script'});
  const framed = pause({}, 'FRAME-SESSION');
  const page = pause({headers: [header('content-type', 'text/html')]});
  await waitFor(() => released(page).length === 1, 'the page to be released');
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.deepEqual(released(script), []);
  assert.deepEqual(released(framed), []);
});

test('waitForEvent("download") lets the next download through and answers its id when Chrome completes it; path() answers where', async t => {
  const {run, ext, pause, released, settledOf} = await tabOn(t);
  const waiting = run({type: 'playwright_wait_for_download', timeout_ms: 5000});
  const state = settledOf(waiting);
  await new Promise(resolve => setTimeout(resolve, 20));
  const requestId = pause();
  await waitFor(() => released(requestId).length === 1, 'the download response to be let through');
  assert.deepEqual(released(requestId), [{method: 'Fetch.continueResponse', requestId}]);
  ext.downloadCreated({id: 6, url: 'https://example.com/other.bin', filename: ''});
  ext.downloadCreated({id: 7, url: URL_A, filename: ''});
  ext.downloadChanged(6, {state: 'complete'});
  ext.downloadChanged(7, {filename: PATH_A});
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(state.settled, false, 'in progress: a filename is not completion, another download is not this one');
  ext.downloadChanged(7, {state: 'complete'});
  assert.deepEqual(await waiting, {download_id: '7'});
  assert.deepEqual(await run({type: 'playwright_download_path', download_id: '7'}), {path: PATH_A});
  assert.deepEqual(await run({type: 'playwright_download_path', download_id: '99'}), {path: null});
  assert.equal((await rejection(run({type: 'playwright_download_path', download_id: ''}))).message, 'playwright_download_path requires a download_id');
  const after = pause();
  await waitFor(() => released(after).length === 1, 'the next download to be refused');
  assert.equal(released(after)[0].method, 'Fetch.failRequest', 'the wait let one download through, no more');
});

test('with a wait armed, a PDF, image or video response is downloaded, marked as an attachment', async t => {
  const {run, ext, pause, released} = await tabOn(t);
  const waiting = run({type: 'playwright_wait_for_download', timeout_ms: 5000});
  await new Promise(resolve => setTimeout(resolve, 20));
  const page = pause({headers: [header('content-type', 'text/html')]});
  const pdf = pause({url: 'https://example.com/a.pdf', headers: [header('Content-Type', 'application/pdf'), header('Content-Disposition', 'inline; filename="a.pdf"')]});
  await waitFor(() => released(pdf).length === 1 && released(page).length === 1, 'both responses to be released');
  assert.deepEqual(released(page), [{method: 'Fetch.continueResponse', requestId: page}], 'a page is still a page');
  assert.deepEqual(released(pdf), [{method: 'Fetch.continueResponse', requestId: pdf, responseCode: 200, responsePhrase: 'OK',
    responseHeaders: [header('Content-Type', 'application/pdf'), header('Content-Disposition', 'attachment; filename="a.pdf"')]}]);
  ext.downloadCreated({id: 8, url: 'https://example.com/a.pdf', filename: '/Users/agent/Downloads/a.pdf'});
  ext.downloadChanged(8, {state: 'complete'});
  assert.deepEqual(await waiting, {download_id: '8'});
});

test('the wait fails with the vendor\'s sentences: its budget, a failed or canceled download, a second wait in the tab', async t => {
  const {run, ext, pause, released} = await tabOn(t);
  let started = Date.now();
  const timedOut = await rejection(run({type: 'playwright_wait_for_download', timeout_ms: 200}));
  assert.ok(timedOut instanceof BrowserServiceError);
  assert.equal(timedOut.code, 'timeout');
  assert.equal(timedOut.message, 'Timed out after 200ms waiting for download.');
  assert.ok(Date.now() - started < 1500, `bounded by timeout_ms (${Date.now() - started} ms)`);
  started = Date.now();
  assert.equal((await rejection(run({type: 'playwright_wait_for_download', timeout_ms: 0}))).message, 'Timed out after 0ms waiting for download.');
  assert.ok(Date.now() - started < 500, 'a zero budget ends at once');

  const failing = run({type: 'playwright_wait_for_download', timeout_ms: 5000});
  const second = await rejection(run({type: 'playwright_wait_for_download', timeout_ms: 5000}));
  assert.equal(second.message, 'A download is already in progress in this tab. Wait for it to finish before starting another.');
  await new Promise(resolve => setTimeout(resolve, 20));
  const first = pause();
  await waitFor(() => released(first).length === 1, 'the download to be let through');
  ext.downloadCreated({id: 11, url: URL_A, filename: ''});
  ext.downloadChanged(11, {state: 'interrupted', error: 'NETWORK_FAILED'});
  assert.equal((await rejection(failing)).message, 'Download 11 failed.');

  const canceling = run({type: 'playwright_wait_for_download', timeout_ms: 5000});
  await new Promise(resolve => setTimeout(resolve, 20));
  const again = pause();
  await waitFor(() => released(again).length === 1, 'the download to be let through');
  ext.downloadCreated({id: 12, url: URL_A, filename: ''});
  ext.downloadChanged(12, {state: 'interrupted', error: 'USER_CANCELED'});
  assert.equal((await rejection(canceling)).message, 'Download 12 was canceled.');
});

test('a wait that times out after Chrome began the download releases nothing twice and keeps the tab usable', async t => {
  const {run, ext, pause, released} = await tabOn(t);
  const waiting = run({type: 'playwright_wait_for_download', timeout_ms: 300});
  await new Promise(resolve => setTimeout(resolve, 20));
  const requestId = pause();
  await waitFor(() => released(requestId).length === 1, 'the download to be let through');
  ext.downloadCreated({id: 13, url: URL_A, filename: ''});
  assert.equal((await rejection(waiting)).message, 'Timed out after 300ms waiting for download.');
  assert.equal(released(requestId).length, 1);
  assert.deepEqual(await run({type: 'navigate_tab_reload'}), {});
});

// --- the classes, over a scripted controller ----------------------------------------------------------------------

// A controller that records calls and lets the test emit events, and a backend API that lets it notify downloads.
function scriptedController() {
  const cdp = new Emitter();
  cdp.calls = [];
  cdp.attachHandlers = [];
  cdp.addTabAttachHandler = handler => { cdp.attachHandlers.push(handler); return () => {}; };
  cdp.isTabAttached = () => true;
  cdp.call = async (tabId, method, params, options) => { cdp.calls.push({tabId, method, params, options}); return {}; };
  const api = new Emitter();
  api.addEventListener = (name, handler) => api.on(name, handler);
  api.matchesCurrentSessionId = id => id === 'session-a';
  return {cdp, api};
}

const tick = () => new Promise(resolve => setImmediate(resolve));

test('media: the request for the media URL in its frame (and its redirects) is let through as a download, nothing else', async () => {
  const {cdp, api} = scriptedController();
  const responses = new DocumentResponses(cdp);
  const downloads = new Downloads(api, responses);
  const event = params => cdp.emit('event', {method: 'Fetch.requestPaused', source: {tabId: 3}, params});
  const release = await downloads.enableMediaDownload(3, 'https://cdn.test/image.svg#frag', 'MEDIA-FRAME');
  assert.deepEqual(cdp.calls.filter(c => c.method === 'Fetch.enable').map(c => c.params.patterns),
    [[DOCUMENTS], [{requestStage: 'Request'}, DOCUMENTS]], 'requests are intercepted while the media download is armed');
  const request = (requestId, url, frameId, redirectedRequestId) => event({requestId, frameId, resourceType: 'Document', request: {url}, ...(redirectedRequestId ? {redirectedRequestId} : {})});
  request('other-frame', 'https://cdn.test/image.svg', 'ELSEWHERE');
  request('media', 'https://cdn.test/image.svg', 'MEDIA-FRAME');
  request('redirected', 'https://cdn2.test/image.svg', 'MEDIA-FRAME', 'media');
  await tick();
  assert.deepEqual(cdp.calls.filter(c => c.method === 'Fetch.continueRequest').map(c => c.params.requestId), ['other-frame', 'media', 'redirected']);
  const waiting = downloads.waitForDownload(3, 2000);
  const svg = [header('content-type', 'image/svg+xml')];
  event(pausedResponse({requestId: 'other-frame', url: 'https://cdn.test/image.svg', headers: svg}));
  event(pausedResponse({requestId: 'redirected', url: 'https://cdn2.test/image.svg', headers: svg}));
  await tick();
  const continued = cdp.calls.filter(c => c.method === 'Fetch.continueResponse').map(c => c.params);
  assert.deepEqual(continued.map(c => c.requestId), ['other-frame', 'redirected']);
  assert.equal(continued[0].responseHeaders, undefined, 'another request\'s image is shown');
  assert.deepEqual(continued[1].responseHeaders, [...svg, header('Content-Disposition', 'attachment')]);
  api.emit('onDownloadChange', {id: '21', url: 'https://cdn2.test/image.svg', filename: '', status: 'started', session_id: 'session-b'});
  api.emit('onDownloadChange', {id: '22', url: 'https://cdn2.test/image.svg', filename: '', status: 'started'});
  api.emit('onDownloadChange', {id: '22', url: 'https://cdn2.test/image.svg', filename: '/Downloads/image.svg', status: 'complete'});
  assert.equal((await waiting).filename, '/Downloads/image.svg');
  assert.equal(downloads.getPath('21'), null, 'another session\'s download is not this one\'s');
  await release();
  assert.deepEqual(cdp.calls.filter(c => c.method === 'Fetch.enable').at(-1).params.patterns, [DOCUMENTS], 'request interception off again');
});

test('interception is set up once per attachment, on the attachment\'s budget, and again after a detach', async () => {
  const {cdp} = scriptedController();
  const responses = new DocumentResponses(cdp);
  const options = {deadline: {marker: true}};
  await cdp.attachHandlers[0](4, options);
  await cdp.attachHandlers[0](4, options);
  assert.deepEqual(cdp.calls.map(c => [c.method, c.options]), [['Fetch.enable', options]]);
  cdp.emit('tabDetached', 4);
  await cdp.attachHandlers[0](4, options);
  assert.equal(cdp.calls.length, 2);
  assert.equal(responses.hasOwnedPausedResponses(4), false);
  assert.equal(responses.hasRequestInterceptors(4), false);
});
