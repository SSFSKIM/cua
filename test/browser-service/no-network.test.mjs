// The network and disk proof's unit half (the spec's "Network and disk proof", acceptance 7; Decision Log 2026-10-14,
// the M3 rulings): cua's browser service makes no call to the runtime's network, config, telemetry or elicitation hooks
// at all. Every feature that reaches beyond the machine does so inside the page, with the person's session (the
// exports, the transcript, page assets), or through the backend (history, tab context). Under a fake node_repl runtime
// whose fetch, config, telemetry and createElicitation throw on any use (zero allowances), and with Node's own fetch
// replaced the same way, the service runs setup, browser selection, a tab's commands, every M3 feature and the
// after-cell notifications on cua's host and fake extension, and for the capabilities no host announces yet
// (webmcp, browserAuth), over a backend that does.
import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AUTH_HANDOFF_HANDLERS} from '../../src/browser-service/authhandoff.mjs';
import {browserNotifications} from '../../src/browser-service/webmcp.mjs';
import {evaluateInPage, pageResponse} from './support/page-vm.mjs';
import {execute, readyBrowser, rejection, scriptedPages, serviceOnHost} from './support/service-on-host.mjs';
import {frame, webMcpTab} from './support/webmcp-tab.mjs';

const HOOKS = ['fetch', 'config', 'telemetry', 'createElicitation'];
const used = [];

// A hook that records and throws on any call or member read.
const trap = name => new Proxy(function hook() {}, {
  apply() { used.push(name); throw new Error(`nodeRepl.${name} was called`); },
  get(target, member) { used.push(`${name}.${String(member)}`); throw new Error(`nodeRepl.${name}.${String(member)} was read`); },
});
const runtimeHooks = Object.fromEntries(HOOKS.map(name => [name, trap(name)]));

const ORIGINAL = {fetch: globalThis.fetch, nodeRepl: globalThis.nodeRepl, TMPDIR: process.env.TMPDIR};
let scratch;
before(() => {
  scratch = mkdtempSync(join(tmpdir(), 'cua-no-network-'));
  process.env.TMPDIR = scratch;
  globalThis.fetch = async () => { used.push('globalThis.fetch'); throw new Error('globalThis.fetch was called'); };
  globalThis.nodeRepl = {env: {}, requestMeta: {}, ...runtimeHooks};
});
after(() => {
  globalThis.fetch = ORIGINAL.fetch;
  if (ORIGINAL.nodeRepl === undefined) delete globalThis.nodeRepl; else globalThis.nodeRepl = ORIGINAL.nodeRepl;
  if (ORIGINAL.TMPDIR === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = ORIGINAL.TMPDIR;
  rmSync(scratch, {recursive: true, force: true});
});

const PAGE = 'http://127.0.0.1:48732/counter.html';
const DOC = 'https://docs.google.com/document/d/DOC1/edit';
const VIDEO = 'https://www.youtube.com/watch?v=abcdefghijk';
const CAPTION = 'https://www.youtube.com/api/timedtext?v=abcdefghijk&lang=en&fmt=srv3';
const ASSET = 'http://127.0.0.1:48732/a.png';
// A cross-origin image the page loaded that Chrome no longer holds: bundled by a fetch inside the page.
const CDN_ASSET = 'https://cdn.example/b.png';
const CDN_BYTES = 'cross-origin png bytes';

// The page each tab shows, by its URL: a Google Doc whose export the page fetches, a YouTube watch page whose player
// requests its captions, a page with a loaded image Chrome holds and a cross-origin one it does not; every page fetch
// recorded (the page's own traffic).
function pageGlobals(url, pageFetches) {
  const fetch = async (requested, init) => {
    pageFetches.push(requested);
    if (requested.startsWith('https://docs.google.com/')) return pageResponse('# Doc\n');
    if (requested === CDN_ASSET && init?.credentials === 'include') return pageResponse(CDN_BYTES, {headers: {'content-type': 'image/png'}});
    if (requested.startsWith('https://www.youtube.com/api/timedtext')) return pageResponse(JSON.stringify({events: [{tStartMs: 0, segs: [{utf8: 'Hello'}]}]}), {headers: {'content-type': 'application/json'}});
    throw new TypeError(`Failed to fetch ${requested} ${init?.method ?? ''}`);
  };
  if (url !== VIDEO) return {fetch, location: {href: url}};
  let on = false, observed = [];
  const observers = [];
  const player = {
    getVideoData: () => ({video_id: 'abcdefghijk'}), isSubtitlesOn: () => on, toggleSubtitles: () => { on = !on; },
    toggleSubtitlesOn: () => { on = true; observed = [{name: CAPTION, startTime: 10}]; for (const callback of observers) callback({getEntries: () => observed}); },
  };
  return {
    fetch, location: {href: url}, performance: {now: () => 5},
    document: {querySelector: selector => (selector === 'ytd-player' ? {getPlayer: () => player} : null)},
    PerformanceObserver: class {
      constructor(callback) { this.callback = callback; }
      observe() { observers.push(this.callback); if (observed.length) this.callback({getEntries: () => observed}); }
      disconnect() { observers.splice(observers.indexOf(this.callback), 1); }
    },
  };
}

async function trappedService(t) {
  const pages = scriptedPages();
  const pageFetches = [];
  const urls = new Map();       // tabId -> the URL its page is scripted as
  const cdp = request => {
    const {debuggee: {tabId}, method, params} = request;
    const url = urls.get(tabId);
    switch (method) {
      case 'DOMSnapshot.captureSnapshot':
        return {strings: [url ?? PAGE], documents: [{documentURL: 0, nodes: {backendNodeId: [], nodeName: [], attributes: []}, layout: {nodeIndex: [], styles: []}}]};
      case 'Page.getResourceTree': return {frameTree: {frame: {id: `F${tabId}`}, resources: [{url: ASSET, mimeType: 'image/png', type: 'Image'}]}};
      case 'Page.getResourceContent':
        if (params.url !== ASSET) throw new Error('No resource with given URL found');
        return {content: Buffer.from('png').toString('base64'), base64Encoded: true};
      case 'Runtime.evaluate':
        if (params.expression.startsWith('({ href: window.location.href')) return {result: {type: 'object', value: {href: url ?? PAGE, readyState: 'complete'}}};
        if (params.expression.startsWith('performance.getEntriesByType("resource")')) return {result: {type: 'object', value: [{name: ASSET, initiatorType: 'img'}, {name: CDN_ASSET, initiatorType: 'img'}]}};
        if (params.expression.startsWith('Array.from(document.querySelectorAll("svg"))')) return {result: {type: 'object', value: []}};
        if (url != null) return evaluateInPage(pageGlobals(url, pageFetches), params);
    }
    return pages.cdp(request);
  };
  const items = [], hooks = [];
  const env = await serviceOnHost(t, {pages: {...pages, cdp}, runtimeHooks: {
    ...runtimeHooks,
    addAfterSubmittedCodeHook(hook) { hooks.push(hook); return () => {}; },
    emitContentItem(item) { items.push(item); },
  }});
  const browserId = await readyBrowser(env.service);
  const run = params => execute(env.service, {browser_id: browserId, ...params});
  const tab = async url => {
    const {id} = await run({type: 'create_tab'});
    if (url != null) {
      urls.set(Number(id), url);
      Object.assign(env.ext.state.tabs.get(Number(id)), {url, title: 'Page'});
    }
    return id;
  };
  return {...env, browserId, run, tab, pageFetches, items, afterCell: () => Promise.all(hooks.map(hook => hook.run()))};
}

test('setup, browser selection and a tab\'s commands use none of the runtime\'s network, config, telemetry or elicitation hooks', async t => {
  used.length = 0;
  const {service, run, tab, afterCell, turnEnded} = await trappedService(t);
  await service.handleRpc({method: 'execute', params: {type: 'get_default_browser'}});
  const [browser] = await service.handleRpc({method: 'execute', params: {type: 'list_browsers'}});
  await service.handleRpc({method: 'execute', params: {type: 'get_browser', id: browser.id}});
  assert.match(await run({type: 'get_browser_documentation'}), /cua browser service/);
  for (const name of ['confirmations', 'webmcp', 'capabilities/tab/browserAuth', 'capabilities/tab/webmcp', 'screenshots']) {
    await service.handleRpc({method: 'execute', params: {type: 'get_documentation', name}});
  }
  await run({type: 'name_session', name: 'no network'});
  const id = await tab();
  await run({type: 'navigate_tab_url', tab_id: id, url: 'https://example.com/'});
  await run({type: 'navigate_tab_reload', tab_id: id});
  await run({type: 'navigate_tab_back', tab_id: id});
  assert.equal((await run({type: 'get_tab', tab_id: id})).id, id);
  assert.equal((await run({type: 'list_tabs'})).tabs.length, 1);
  await run({type: 'mark_tab', tab_id: id, status: 'deliverable'});
  await afterCell();
  await turnEnded();
  assert.deepEqual(used, []);
});

test('every M3 feature, the after-cell notifications included, uses none of them either', async t => {
  used.length = 0;
  const {service, run, tab, pageFetches, items, afterCell} = await trappedService(t);
  for (const name of ['confirmations', 'webmcp', 'capabilities/tab/browserAuth']) {
    await service.handleRpc({method: 'execute', params: {type: 'get_documentation', name}});
  }
  // Content exports and the transcript: fetched inside the page.
  const doc = await tab(DOC);
  assert.match((await run({type: 'tab_content_export_gsuite', tab_id: doc, format: 'md'})).path, /\.md$/);
  const video = await tab(VIDEO);
  assert.match((await run({type: 'tab_content_export_youtube_transcript', tab_id: video})).path, /\.txt$/);
  assert.match((await rejection(run({type: 'tab_content_export', tab_id: doc, format: 'markdown'}))).message, /cua does not support command "tab_content_export"/);
  // Page assets: listed from the page, bundled from Chrome's loaded copy, else (the cross-origin one) by a fetch inside
  // the page.
  const page = await tab(PAGE);
  const inventory = await run({type: 'tab_page_assets_list', tab_id: page});
  assert.deepEqual(inventory.assets.map(a => a.url).sort(), [ASSET, CDN_ASSET]);
  const bundle = await run({type: 'tab_page_assets_bundle', tab_id: page, inventoryId: inventory.id});
  assert.equal(bundle.summary.downloadedCount, 2);
  const written = Object.fromEntries(bundle.assets.map(a => [a.url, readFileSync(a.path, 'utf8')]));
  assert.deepEqual(written, {[ASSET]: 'png', [CDN_ASSET]: CDN_BYTES});
  // The bot-detection report, the user's tab context and history (through the backend), WebMCP and browserAuth (not
  // announced by cua's host).
  assert.equal((await run({type: 'tab_bot_detection_report', tab_id: page, reason: 'captcha_failed'})).status, 'reported');
  assert.match((await rejection(run({type: 'browser_user_get_tab_context', tab_id: page, expected_url: PAGE}))).message, /executeTabRead/);
  assert.match((await rejection(run({type: 'browser_user_history', queries: ['a']}))).message, /getUserHistory/);
  assert.match((await rejection(run({type: 'webmcp_list_tools', tab_id: page}))).message, /does not support command "webmcp_list_tools"/);
  assert.match((await rejection(run({type: 'webmcp_invoke_tool', tab_id: page, tool_name: 't', registration_id: 'r', input: {}}))).message, /stale/);
  assert.match((await rejection(run({type: 'tab_browser_auth_handoff', tab_id: page, origin: 'http://127.0.0.1:48732', fields: [], qr_code: true}))).message, /does not support command/);
  await afterCell();
  assert.deepEqual(items, []);
  assert.deepEqual(pageFetches, ['https://docs.google.com/document/d/DOC1/export?format=md',
    'https://www.youtube.com/api/timedtext?v=abcdefghijk&lang=en&fmt=json3', CDN_ASSET], 'the page\'s own fetches, nothing else');
  assert.deepEqual(used, []);
});

test('WebMCP and browserAuth over a backend that announces them use none of them either', async () => {
  used.length = 0;
  const webmcp = webMcpTab({frames: [frame('F1', 'https://shop.example/', {tools: [{name: 'search', inputSchema: {}, run: async () => 'ok'}]})]});
  const {tools: [search]} = await webmcp.run('webmcp_list_tools');
  assert.deepEqual(await webmcp.run('webmcp_invoke_tool', {tool_name: 'search', registration_id: search.registration_id, input: {}}), {result: 'ok'});
  webmcp.session.tabs.events.push({type: 'tab_acquired', tabId: 5, origin: 'external'});
  webmcp.event('WebMCP.toolsRemoved', {tools: []});
  await browserNotifications([webmcp.session]);
  const marks = [];
  const auth = {
    clientInfo: {name: 'MAWS'}, capabilities: {browser: [], tab: [{id: 'browserAuth'}]},
    cdp: {async call() { return {frameTree: {frame: {id: 'F1', loaderId: 'L1', securityOrigin: 'https://a.example', url: 'https://a.example/login'}}}; }},
    tabs: {async mark(tabId, status) { marks.push(status); }},
  };
  assert.deepEqual(await AUTH_HANDOFF_HANDLERS.tab_browser_auth_handoff({tab_id: '3', origin: 'https://a.example', fields: [], qr_code: true}, auth),
    {status: 'declined', reason: 'user_took_over'});
  assert.deepEqual(marks, ['handoff']);
  assert.deepEqual(used, []);
});
