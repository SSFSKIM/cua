// tab_screenshot through the real host, the fake extension answering as a scripted page (the vendor's zp, WG and HG,
// readable chatgpt-26.928.40906 BS:43870-44103): a viewport screenshot is a fresh screencast frame at CSS size, else a
// JPEG capture of the visual viewport at CSS scale; a clip and a full page are captures beyond the viewport.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execute, readyBrowser, rejection, scriptedPages, serviceOnHost} from './support/service-on-host.mjs';

const VIEWPORT = {pageX: 0, pageY: 120, clientWidth: 800, clientHeight: 600};

// A page with device pixel ratio `dpr`; `screencast(tabId, params, ext)` answers Page.startScreencast (it may send
// frames), `capture` is the Page.captureScreenshot answer.
function screenPages({dpr = 2, screencast = () => ({}), capture = {data: 'Q0FQVFVSRQ=='}, contentSize = {x: 0, y: 0, width: 800, height: 2400}} = {}) {
  const pages = scriptedPages();
  let ext;
  const cdp = request => {
    const {debuggee: {tabId}, method, params} = request;
    const log = () => pages.sent.push({tabId, method, params});
    switch (method) {
      case 'Runtime.evaluate':
        if (params?.expression === 'window.devicePixelRatio') { log(); return {result: {type: 'number', value: dpr}}; }
        break;
      case 'Page.getLayoutMetrics': log(); return {cssVisualViewport: VIEWPORT, cssContentSize: contentSize};
      case 'Page.startScreencast': log(); return screencast(tabId, params, ext);
      case 'Page.captureScreenshot': log(); return capture;
      case 'Page.stopScreencast': case 'Page.screencastFrameAck': log(); return {};
    }
    return pages.cdp(request);
  };
  return {...pages, cdp, bind(extension) { ext = extension; pages.bind(extension); }};
}

async function tabOn(t, options) {
  const pages = screenPages(options);
  const env = await serviceOnHost(t, {pages});
  const browserId = await readyBrowser(env.service);
  const {id} = await execute(env.service, {type: 'create_tab', browser_id: browserId});
  const shoot = (params = {}) => execute(env.service, {type: 'tab_screenshot', browser_id: browserId, tab_id: id, ...params});
  const sent = method => pages.sent.filter(s => s.method === method);
  return {...env, pages, tabId: id, shoot, sent};
}

const frame = (ext, tabId, {data, sessionId, timestamp}) =>
  setImmediate(() => ext.cdpEvent({tabId}, 'Page.screencastFrame', {data, sessionId, metadata: {timestamp}}));

test('a viewport screenshot is the first screencast frame newer than the request, at the viewport\'s CSS size', async t => {
  const {shoot, sent} = await tabOn(t, {screencast: (tabId, params, ext) => {
    frame(ext, tabId, {data: 'U1RBTEU=', sessionId: 1, timestamp: Date.now() / 1000 - 60});
    setTimeout(() => frame(ext, tabId, {data: 'RlJFU0g=', sessionId: 2, timestamp: Date.now() / 1000 + 1}), 20);
    return {};
  }});
  assert.deepEqual(await shoot(), {data: 'RlJFU0g='});
  assert.deepEqual(sent('Page.startScreencast').map(s => s.params), [{everyNthFrame: 1, format: 'jpeg', maxHeight: 600, maxWidth: 800, quality: 80}]);
  assert.deepEqual(sent('Page.screencastFrameAck').map(s => s.params.sessionId), [1, 2], 'the stale frame is acknowledged and skipped');
  assert.equal(sent('Page.stopScreencast').length, 1);
  assert.equal(sent('Page.captureScreenshot').length, 0);
});

test('without a screencast frame the viewport is captured as JPEG 80 at CSS scale', async t => {
  const {shoot, sent} = await tabOn(t, {screencast: () => { throw new Error('screencast unavailable'); }});
  assert.deepEqual(await shoot(), {data: 'Q0FQVFVSRQ=='});
  assert.deepEqual(sent('Page.captureScreenshot').map(s => s.params), [{format: 'jpeg', quality: 80, clip: {x: 0, y: 120, width: 800, height: 600, scale: 0.5}}]);
});

test('a screencast that sends no frame gives up after 2 s and the viewport is captured', async t => {
  const {shoot, sent} = await tabOn(t);
  const started = Date.now();
  assert.deepEqual(await shoot(), {data: 'Q0FQVFVSRQ=='});
  const took = Date.now() - started;
  assert.ok(took >= 1900 && took < 4000, `${took} ms`);
  assert.equal(sent('Page.stopScreencast').length, 1, 'the screencast is stopped');
  assert.equal(sent('Page.captureScreenshot').length, 1);
});

test('a page zoomed out (device pixel ratio below 1) is captured without a screencast', async t => {
  const {shoot, sent} = await tabOn(t, {dpr: 0.5});
  assert.deepEqual(await shoot(), {data: 'Q0FQVFVSRQ=='});
  assert.equal(sent('Page.startScreencast').length, 0);
  assert.equal(sent('Page.captureScreenshot')[0].params.clip.scale, 2);
});

test('a clip is captured beyond the viewport at CSS scale; its size must be positive', async t => {
  const {shoot, sent} = await tabOn(t);
  assert.deepEqual(await shoot({cropX: 10, cropY: 20, cropWidth: 320, cropHeight: 240}), {data: 'Q0FQVFVSRQ=='});
  assert.deepEqual(sent('Page.captureScreenshot').map(s => s.params),
    [{format: 'jpeg', quality: 80, captureBeyondViewport: true, clip: {x: 10, y: 20, width: 320, height: 240, scale: 0.5}}]);
  assert.equal(sent('Page.startScreencast').length, 0);
  assert.equal((await rejection(shoot({cropX: 0, cropY: 0, cropWidth: 0, cropHeight: 10}))).message, 'tab_screenshot crop width and height must be positive');
});

test('a full page is captured at its CSS content size', async t => {
  const {shoot, sent} = await tabOn(t);
  assert.deepEqual(await shoot({fullPage: true}), {data: 'Q0FQVFVSRQ=='});
  assert.deepEqual(sent('Page.captureScreenshot').map(s => s.params),
    [{format: 'jpeg', quality: 80, captureBeyondViewport: true, clip: {x: 0, y: 0, width: 800, height: 2400, scale: 0.5}}]);
});

test('a full page without a content size, and a capture without data, fail with the vendor\'s sentences', async t => {
  const empty = await tabOn(t, {contentSize: {x: 0, y: 0, width: 0, height: 0}});
  assert.equal((await rejection(empty.shoot({fullPage: true}))).message, 'Page.getLayoutMetrics returned no valid cssContentSize for full-page screenshot.');
  const blank = await tabOn(t, {capture: {data: ''}});
  assert.equal((await rejection(blank.shoot({fullPage: true}))).message, `Page.captureScreenshot returned no data for tab ${blank.tabId}.`);
});
