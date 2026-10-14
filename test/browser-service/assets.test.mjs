// The page assets (src/browser-service/assets.mjs, the vendor's Ff with CM/SM and its bundling YZ/QZ/eQ/ZZ, readable
// chatgpt-26.928.40906 BS:61255-62043, and the commands cM/uM, BS:59983-60005), through the real host and the fake
// extension: list() inventories the resources the page has loaded (its resource timing), with the DOM attributes and
// computed styles that use them as extra sources, and its inline SVGs; bundle() writes the chosen file assets of an
// inventory still valid for the page to a fresh directory under the temporary directory's browser-use/assets, from
// Chrome's loaded resources, else by a fetch inside the page from the page's own origin only, with a manifest.
import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {COMMAND_HANDLERS} from '../../src/browser-service/index.mjs';
import {evaluateInPage, pageResponse} from './support/page-vm.mjs';
import {execute, readyBrowser, rejection, scriptedPages, serviceOnHost} from './support/service-on-host.mjs';

const ORIGINAL_TMPDIR = process.env.TMPDIR;
const BASE = tmpdir();
const made = [];
after(() => {
  if (ORIGINAL_TMPDIR === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = ORIGINAL_TMPDIR;
  for (const dir of made) rmSync(dir, {recursive: true, force: true});
});

const PAGE = 'http://127.0.0.1:48732/assets/index.html';
const ORIGIN = 'http://127.0.0.1:48732';
const assetId = text => createHash('sha256').update(text).digest().subarray(0, 8).toString('hex');
const SVG = '<svg aria-label="Logo"><path d="M0 0"/></svg>';

// The page: loaded resources (resource timing), a DOM snapshot whose strings, nodes and computed styles reference them,
// one inline SVG; Chrome's resource cache answers `cached` (url -> {content, base64Encoded, mimeType}); a fetch inside
// the page answers `fetchable` (url -> {body, contentType}).
function assetPages({resources, cached = {}, fetchable = {}} = {}) {
  const pages = scriptedPages();
  const fetched = [];
  const strings = [PAGE, 'HTML', 'IMG', 'src', 'a.png', 'LINK', 'href', 'style.css', 'rel', 'stylesheet', 'IMG', 'missing.png', 'DIV', 'url("a.png")', 'none', 'url(cursor.cur)', 'IMG', 'srcset', 'a.png 1x, https://cdn.example/b.jpg 2x'];
  const snapshot = {
    strings,
    documents: [{
      documentURL: 0,
      nodes: {
        backendNodeId: [1, 5, 6, 7, 8, 0, 9],
        nodeName: [1, 2, 5, 10, 12, 12, 16],
        attributes: [[], [3, 4], [6, 7, 8, 9], [3, 11], [], [], [17, 18]],
      },
      layout: {nodeIndex: [4, 1], styles: [[13, 14, 14, 14, 14], [14, 14, 15, 14, 14]]},
    }],
  };
  const cdp = request => {
    const {debuggee: {tabId}, method, params} = request;
    switch (method) {
      case 'DOMSnapshot.captureSnapshot': pages.sent.push({tabId, method, params}); return snapshot;
      case 'Page.getResourceTree': return {frameTree: {frame: {id: `F${tabId}`}, resources: Object.entries(cached).map(([url, r]) => ({url, mimeType: r.mimeType, type: 'Other'}))}};
      case 'Page.getResourceContent': {
        pages.sent.push({tabId, method, params});
        const hit = cached[params.url];
        if (hit == null) throw new Error('No resource with given URL found');
        return {content: hit.content, base64Encoded: hit.base64Encoded};
      }
      case 'Runtime.evaluate':
        if (params.expression.startsWith('performance.getEntriesByType("resource")')) return {result: {type: 'object', value: resources}};
        if (params.expression.startsWith('Array.from(document.querySelectorAll("svg"))')) return {result: {type: 'object', value: [{markup: SVG, name: 'Logo'}, {markup: '', name: 'svg-2'}]}};
        if (!params.expression.startsWith('({ href: window.location.href')) {
          return evaluateInPage({fetch: async (url, init) => {
            fetched.push({url, credentials: init.credentials});
            const r = fetchable[url];
            if (r == null) throw new TypeError('Failed to fetch');
            return pageResponse(r.body, {headers: {'content-type': r.contentType}});
          }}, params);
        }
    }
    return pages.cdp(request);
  };
  return {...pages, cdp, fetched};
}

const RESOURCES = [
  {name: `${ORIGIN}/assets/a.png`, initiatorType: 'img'},
  {name: `${ORIGIN}/assets/style.css`, initiatorType: 'link'},
  {name: `${ORIGIN}/assets/font.woff2`, initiatorType: 'css'},
  {name: `${ORIGIN}/api/data`, initiatorType: 'fetch'},
  {name: `${ORIGIN}/assets/app.js#v2`, initiatorType: 'script'},
  {name: 'https://cdn.example/b.jpg', initiatorType: 'img'},
  {name: ''},
];

async function assetTab(t, options) {
  const tmp = mkdtempSync(join(BASE, 'cua-assets-'));
  made.push(tmp);
  process.env.TMPDIR = tmp;
  const pages = assetPages(options);
  const env = await serviceOnHost(t, {pages});
  const browserId = await readyBrowser(env.service);
  const {id} = await execute(env.service, {type: 'create_tab', browser_id: browserId});
  Object.assign(env.ext.state.tabs.get(Number(id)), {url: PAGE, title: 'Assets'});
  const run = params => execute(env.service, {browser_id: browserId, tab_id: id, ...params});
  return {...env, pages, tmp, run, tabId: Number(id), navigate: url => { env.ext.state.tabs.get(Number(id)).url = url; }};
}

test('the asset commands are registered', () => {
  for (const type of ['tab_page_assets_list', 'tab_page_assets_bundle']) assert.equal(typeof COMMAND_HANDLERS.get(type), 'function', type);
});

test('list() inventories the loaded resources, adds the DOM and style sources that use them, and the inline SVGs', async t => {
  const {run, pages} = await assetTab(t, {resources: RESOURCES});
  const inventory = await run({type: 'tab_page_assets_list'});
  assert.match(inventory.id, /^[0-9a-f-]{36}$/);
  assert.equal(inventory.pageUrl, PAGE);
  assert.deepEqual(inventory.assets, [
    {id: assetId(`${ORIGIN}/assets/a.png`), kind: 'image', name: 'a.png', url: `${ORIGIN}/assets/a.png`, sources: [
      {kind: 'resource', property: 'img'}, {kind: 'attribute', nodeId: 5, property: 'src'}, {kind: 'attribute', nodeId: 9, property: 'srcset'},
      {kind: 'computedStyle', nodeId: 8, property: 'background-image'},
    ]},
    {id: assetId(`${ORIGIN}/assets/style.css`), kind: 'stylesheet', name: 'style.css', url: `${ORIGIN}/assets/style.css`, sources: [
      {kind: 'resource', property: 'link'}, {kind: 'attribute', nodeId: 6, property: 'href'},
    ]},
    {id: assetId(`${ORIGIN}/assets/font.woff2`), kind: 'font', name: 'font.woff2', url: `${ORIGIN}/assets/font.woff2`, sources: [{kind: 'resource', property: 'css'}]},
    {id: assetId(`${ORIGIN}/api/data`), kind: 'other', name: 'data', url: `${ORIGIN}/api/data`, sources: [{kind: 'resource', property: 'fetch'}]},
    {id: assetId(`${ORIGIN}/assets/app.js#v2`), kind: 'script', name: 'app.js#v2', url: `${ORIGIN}/assets/app.js#v2`, sources: [{kind: 'resource', property: 'script'}]},
    {id: assetId('https://cdn.example/b.jpg'), kind: 'image', name: 'b.jpg', url: 'https://cdn.example/b.jpg', sources: [
      {kind: 'resource', property: 'img'}, {kind: 'attribute', nodeId: 9, property: 'srcset'},
    ]},
  ], 'a DOM or style reference to a resource the page never loaded (missing.png, cursor.cur) adds nothing of its own');
  assert.deepEqual(inventory.inlineSvgs, [{id: assetId(`0:${SVG}`), markup: SVG, name: 'Logo'}]);
  assert.deepEqual(inventory.summary, {byKind: {font: 1, image: 2, other: 1, script: 1, stylesheet: 1, video: 0}, inlineSvgCount: 1, totalCount: 6});
  const capture = pages.sent.find(s => s.method === 'DOMSnapshot.captureSnapshot');
  assert.deepEqual(capture.params, {computedStyles: ['background-image', 'border-image-source', 'cursor', 'list-style-image', 'mask-image'], includeDOMRects: false});
});

test('bundle() refuses an inventory of another page, unknown ids, unsupported kinds and an empty selection', async t => {
  const {run, navigate} = await assetTab(t, {resources: RESOURCES});
  const {id} = await run({type: 'tab_page_assets_list'});
  const bundle = extra => run({type: 'tab_page_assets_bundle', inventoryId: id, ...extra});
  assert.equal((await rejection(run({type: 'tab_page_assets_bundle', inventoryId: 'nope'}))).message, 'Asset inventory is no longer valid for this page');
  assert.equal((await rejection(bundle({assetIds: ['0000000000000000']}))).message, 'Asset bundle request included unknown asset ids');
  assert.equal((await rejection(bundle({assetIds: [assetId(`${ORIGIN}/assets/app.js#v2`)]}))).message, 'Asset bundle request included unsupported asset kinds');
  assert.equal((await rejection(bundle({kinds: ['video']}))).message, 'Asset bundle request matched no discovered assets');
  navigate(`${ORIGIN}/elsewhere.html`);
  assert.equal((await rejection(bundle({}))).message, 'Asset inventory is no longer valid for this page');
});

test('bundle() writes loaded resources from Chrome, fetches the rest from the page\'s own origin only, and lists every failure', async t => {
  const png = Buffer.from('PNGDATA').toString('base64');
  const {run, pages, tmp} = await assetTab(t, {
    resources: [...RESOURCES, {name: `${ORIGIN}/assets/wrong.png`, initiatorType: 'img'}],
    cached: {
      [`${ORIGIN}/assets/a.png`]: {content: png, base64Encoded: true, mimeType: 'image/png'},
      [`${ORIGIN}/assets/style.css`]: {content: 'body{color:red}', base64Encoded: false, mimeType: 'text/css'},
      [`${ORIGIN}/assets/wrong.png`]: {content: '<html>', base64Encoded: false, mimeType: 'text/html'},
    },
    fetchable: {
      [`${ORIGIN}/assets/font.woff2`]: {body: 'WOFF2', contentType: 'font/woff2'},
      'https://cdn.example/b.jpg': {body: 'JPEG', contentType: 'image/jpeg'},
    },
  });
  const {id} = await run({type: 'tab_page_assets_list'});
  const result = await run({type: 'tab_page_assets_bundle', inventoryId: id});
  const dir = result.directoryPath;
  assert.match(dir, new RegExp(`^${tmp}/browser-use/assets/[0-9a-f-]{36}$`));
  const byUrl = Object.fromEntries(result.assets.map(a => [a.url, a]));
  assert.deepEqual(byUrl[`${ORIGIN}/assets/a.png`], {contentType: 'image/png', id: assetId(`${ORIGIN}/assets/a.png`), kind: 'image', name: 'a.png', path: `${dir}/${assetId(`${ORIGIN}/assets/a.png`)}.png`, url: `${ORIGIN}/assets/a.png`});
  assert.equal(readFileSync(byUrl[`${ORIGIN}/assets/a.png`].path, 'utf8'), 'PNGDATA');
  assert.equal(readFileSync(byUrl[`${ORIGIN}/assets/style.css`].path, 'utf8'), 'body{color:red}');
  assert.equal(byUrl[`${ORIGIN}/assets/font.woff2`].contentType, 'font/woff2');
  assert.equal(readFileSync(byUrl[`${ORIGIN}/assets/font.woff2`].path, 'utf8'), 'WOFF2');
  const svg = byUrl[`inline-svg:${assetId(`0:${SVG}`)}`];
  assert.deepEqual(svg, {contentType: 'image/svg+xml', id: assetId(`0:${SVG}`), kind: 'image', name: 'Logo', path: `${dir}/${assetId(`0:${SVG}`)}.svg`, url: `inline-svg:${assetId(`0:${SVG}`)}`});
  assert.equal(readFileSync(svg.path, 'utf8'), SVG);
  assert.deepEqual(pages.fetched, [{url: `${ORIGIN}/assets/font.woff2`, credentials: 'include'}], 'one page fetch, same origin, never the CDN');
  const failures = Object.fromEntries(result.failures.map(f => [f.url, f]));
  assert.deepEqual(Object.keys(failures).sort(), [`${ORIGIN}/assets/wrong.png`, 'https://cdn.example/b.jpg']);
  assert.equal(failures[`${ORIGIN}/assets/wrong.png`].reason, 'Asset response type text/html is not valid for image');
  assert.equal(failures[`${ORIGIN}/assets/wrong.png`].contentType, 'text/html');
  assert.equal(failures['https://cdn.example/b.jpg'].reason, 'Loaded resource fetch failed: No resource with given URL found; page fetch failed: cua fetches page assets only from the page\'s own origin');
  assert.equal(failures['https://cdn.example/b.jpg'].contentType, null);
  assert.deepEqual({...result.summary, elapsedMs: typeof result.summary.elapsedMs}, {downloadedCount: 4, elapsedMs: 'number', failedCount: 2, requestedCount: 6});
  assert.equal(result.manifestPath, `${dir}/manifest.json`);
  assert.deepEqual(JSON.parse(readFileSync(result.manifestPath, 'utf8')), {assets: result.assets, failures: result.failures});
  assert.deepEqual(readdirSync(dir).length, 5, 'four assets and the manifest');
});

test('bundle() with kinds or asset ids takes only those; an inline SVG counts as an image', async t => {
  const {run} = await assetTab(t, {resources: RESOURCES, cached: {[`${ORIGIN}/assets/style.css`]: {content: 'a{}', base64Encoded: false, mimeType: 'text/css'}}});
  const {id} = await run({type: 'tab_page_assets_list'});
  const styles = await run({type: 'tab_page_assets_bundle', inventoryId: id, kinds: ['stylesheet']});
  assert.deepEqual(styles.assets.map(a => a.name), ['style.css']);
  const svg = await run({type: 'tab_page_assets_bundle', inventoryId: id, assetIds: [assetId(`0:${SVG}`)]});
  assert.deepEqual(svg.assets.map(a => a.kind), ['image']);
  assert.deepEqual(svg.summary.requestedCount, 1);
});
