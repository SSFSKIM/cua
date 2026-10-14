// Ported from readable chatgpt-26.928.40906 BS:61255-62043 (class Ff, the page assets: CM, SM and the inventory helpers, YZ/ZZ/QZ/eQ and the bundling helpers); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: cM and uM, tab_page_assets_bundle and tab_page_assets_list (BS:59983-60005); the payloads (BS:35207-35311).
//
// tab.capabilities.get("pageAssets"), for a backend that announces it (cua's host does not, so the model never reaches
// these on its route; the vendor's handlers do not check the announcement, nor do these). list() inventories the files
// the page has loaded (its resource timing), each with the DOM attributes and computed styles that reference it as
// further sources (a reference to something never loaded adds nothing), and the page's inline SVGs; the inventory is
// kept for the tab's current URL. bundle() writes an inventory's file assets (fonts, images, stylesheets, videos and the
// inline SVGs; never scripts or other responses), all or those of the given kinds or ids, to a fresh directory under the
// temporary directory's browser-use/assets: each from Chrome's own copy of the loaded resource, else by one fetch inside
// the page with the person's session there, whatever the asset's origin (only URLs the inventory found the page itself
// loading, never one a caller names); a response whose type does not fit its kind, or that cannot be had, is a failure
// in the result. A manifest.json lists both.
// Changed: cua's own byte bounds (byte-bounds.mjs): an asset over 50 MiB, from Chrome or from the page, fails with
// ASSET_TOO_LARGE (bounded while the page reads it and again on this side before decoding), and an asset that would take
// the bundle past 200 MiB fails with BUNDLE_TOO_LARGE. At most ACQUIRING (4) assets are read at once (the vendor reads
// them all at once), so what is in memory is bounded whatever the inventory's size, and none is read once the bundle's
// budget is spent. Dropped: the approvals (ensurePageAssetDownloadAllowed and the cross-origin
// ensurePageAssetFallbackFetchAllowed, with their elicitations and origin policy; the session's ruling of 2026-10-14
// matches the vendor's effective behaviour on the cua route, its approval accepted) and the failure
// telemetry (DM).
import {createHash, randomUUID} from 'node:crypto';
import {ASSET_TOO_LARGE, BUNDLE_TOO_LARGE, MAX_BUNDLE_BYTES, MAX_FILE_BYTES, decodedLength, readBoundedBodyInPage} from './byte-bounds.mjs';
import {tabIdOf} from './tabs.mjs';

const STYLE_PROPERTIES = ['background-image', 'border-image-source', 'cursor', 'list-style-image', 'mask-image'];      // TM
const RESOURCE_TIMING = 'performance.getEntriesByType("resource").map((entry) => ({\n        initiatorType: "initiatorType" in entry ? entry.initiatorType : undefined,\n        name: entry.name,\n      }))';
const INLINE_SVGS = 'Array.from(document.querySelectorAll("svg")).map((svg, index) => ({\n        markup: svg.outerHTML,\n        name:\n          svg.getAttribute("aria-label") ||\n          svg.querySelector("title")?.textContent?.trim() ||\n          svg.id ||\n          "svg-" + (index + 1),\n      }))';

// --- the inventory -----------------------------------------------------------------------------------------------------

const stringAt = (strings, index) => (index == null || index < 0 ? '' : strings[index] ?? '');                       // Ac

// The first 8 bytes of the text's SHA-256, in hex: an asset's id (AM).
const assetId = text => createHash('sha256').update(text).digest().subarray(0, 8).toString('hex');

function urlPath(url) {                                                                                                // PM
  try { return new URL(url, 'https://example.invalid').pathname; } catch { return url.split(/[?#]/, 1)[0] ?? url; }
}

function urlFragment(url) {                                                                                            // KZ
  try { return new URL(url, 'https://example.invalid').hash.slice(1) || null; } catch { return url.split('#', 2)[1] || null; }
}

function kindOfUrl(url) {                                                                                              // Ec
  const path = urlPath(url).toLowerCase();
  if (/\.(avif|gif|ico|jpe?g|png|svg|webp)$/.test(path)) return 'image';
  if (/\.(mp4|mov|m4v|webm)$/.test(path)) return 'video';
  if (/\.(otf|ttf|woff2?)$/.test(path)) return 'font';
  if (/\.css$/.test(path)) return 'stylesheet';
  if (/\.m?js$/.test(path)) return 'script';
  return 'other';
}

function assetName(url) {                                                                                              // VZ
  const last = urlPath(url).split('/').filter(Boolean).at(-1);
  if (!last) return url;
  const fragment = urlFragment(url);
  return fragment == null ? last : `${last}#${fragment}`;
}

function absoluteUrl(url, base) {                                                                                      // p_
  try { return new URL(url, base || undefined).toString(); } catch { return url; }
}

const cssUrls = value => [...value.matchAll(/url\((["']?)(.*?)\1\)/g)].map(m => m[2]?.trim()).filter(u => !!u);       // XZ

function asset({kind, source, url}) {                                                                                  // Lf
  return {kind: kind === 'other' ? kindOfUrl(url) : kind, name: assetName(url), sources: [source], url};
}

function addAsset(assets, found) {                                                                                     // EM
  const known = assets.get(found.url);
  if (known == null) {
    assets.set(found.url, found);
    return;
  }
  known.sources.push(...found.sources);
  if (known.kind === 'other' && found.kind !== 'other') known.kind = found.kind;
}

function addSourceOfLoaded(assets, found) {                                                                            // _M
  if (assets.has(found.url)) addAsset(assets, found);
}

function resourceKind(entry) {                                                                                         // GZ
  const byUrl = kindOfUrl(entry.name ?? '');
  if (byUrl !== 'other') return byUrl;
  switch (entry.initiatorType) {
    case 'css': return 'stylesheet';
    case 'font': return 'font';
    case 'img': return 'image';
    case 'script': return 'script';
    case 'video': return 'video';
    default: return kindOfUrl(entry.name ?? '');
  }
}

// The resources the page loaded, from its resource timing (vM).
async function loadedResources(cdp, tabId) {
  return ((await cdp.evaluateJavascript(tabId, RESOURCE_TIMING)) ?? [])
    .flatMap(entry => (entry.name ? [asset({kind: resourceKind(entry), source: {kind: 'resource', property: entry.initiatorType}, url: entry.name})] : []));
}

// The snapshot's elements with a backend node: {attributes, nodeId, tagName} (WZ, HZ).
function snapshotElements(document, strings) {
  return (document.nodes.backendNodeId ?? []).flatMap((nodeId, index) => {
    if (nodeId <= 0) return [];
    const flat = document.nodes.attributes?.[index] ?? [];
    const attributes = {};
    for (let i = 0; i < flat.length; i += 2) {
      const name = stringAt(strings, flat[i]);
      if (name.length > 0) attributes[name] = stringAt(strings, flat[i + 1]);
    }
    return [{attributes, nodeId, tagName: stringAt(strings, document.nodes.nodeName?.[index]).toLowerCase()}];
  });
}

// The assets an element's attributes name ($Z, lo, wM).
function attributeAssets(element, base) {
  const found = [];
  const one = (property, kind) => {
    const value = element.attributes[property];
    if (value) found.push(asset({kind, source: {kind: 'attribute', nodeId: element.nodeId, property}, url: absoluteUrl(value, base)}));
  };
  const set = (property, kind) => {
    const value = element.attributes[property];
    if (!value) return;
    for (const candidate of value.split(',')) {
      const url = candidate.trim().split(/\s+/, 1)[0];
      if (url) found.push(asset({kind, source: {kind: 'attribute', nodeId: element.nodeId, property}, url: absoluteUrl(url, base)}));
    }
  };
  switch (element.tagName) {
    case 'img': one('src', 'image'); set('srcset', 'image'); break;
    case 'source': one('src', 'video'); set('srcset', 'image'); break;
    case 'video': one('poster', 'image'); one('src', 'video'); break;
    case 'script': one('src', 'script'); break;
    case 'link': one('href', element.attributes.rel === 'stylesheet' ? 'stylesheet' : 'other'); break;
    case 'use': one('href', 'image'); one('xlink:href', 'image'); break;
  }
  return found;
}

// The images the laid-out elements' computed styles name (zZ).
function styleAssets(document, strings, base) {
  const found = [];
  for (const [layoutIndex, nodeIndex] of document.layout.nodeIndex.entries()) {
    const nodeId = document.nodes.backendNodeId?.[nodeIndex];
    if (nodeId == null || nodeId <= 0) continue;
    const styles = document.layout.styles[layoutIndex] ?? [];
    for (const [i, property] of STYLE_PROPERTIES.entries()) {
      for (const url of cssUrls(stringAt(strings, styles[i]))) {
        found.push(asset({kind: 'image', source: {kind: 'computedStyle', nodeId, property}, url: absoluteUrl(url, base)}));
      }
    }
  }
  return found;
}

const withIds = async assets => assets.map(a => ({id: assetId(a.url), ...a}));                                       // xM

// The page's loaded resources, with the DOM's and the styles' references to them as further sources (CM).
async function pageAssets(cdp, tabId) {
  const snapshot = await cdp.call(tabId, 'DOMSnapshot.captureSnapshot', {computedStyles: [...STYLE_PROPERTIES], includeDOMRects: false});   // jZ
  const document = snapshot.documents[0];
  if (document == null) return await withIds(await loadedResources(cdp, tabId));
  const base = stringAt(snapshot.strings, document.documentURL);
  const assets = new Map();
  for (const found of await loadedResources(cdp, tabId)) addAsset(assets, found);
  for (const element of snapshotElements(document, snapshot.strings)) for (const found of attributeAssets(element, base)) addSourceOfLoaded(assets, found);
  for (const found of styleAssets(document, snapshot.strings, base)) addSourceOfLoaded(assets, found);
  return await withIds([...assets.values()]);
}

// The page's inline SVGs with markup: {id, markup, name} (SM).
async function inlineSvgs(cdp, tabId) {
  const svgs = (await cdp.evaluateJavascript(tabId, INLINE_SVGS)) ?? [];
  return svgs.flatMap((svg, index) => (svg.markup ? [{id: assetId(`${index}:${svg.markup}`), markup: svg.markup, name: svg.name || `svg-${index + 1}`}] : []));
}

function countByKind(assets) {                                                                                         // JZ
  const counts = {font: 0, image: 0, other: 0, script: 0, stylesheet: 0, video: 0};
  for (const a of assets) counts[a.kind] += 1;
  return counts;
}

// --- bundling ----------------------------------------------------------------------------------------------------------

// An inventory entry that bundles: an inline SVG, or a font, image, stylesheet or video (IM).
function bundles(entry) {
  if (entry.source === 'inline-svg') return true;
  switch (entry.asset.kind) {
    case 'font': case 'image': case 'stylesheet': case 'video': return true;
    default: return false;
  }
}

function contentTypeFits(kind, type) {                                                                                 // nQ
  if (type == null) return kind === 'stylesheet';
  switch (kind) {
    case 'font': return type.startsWith('font/') || ['application/font-woff', 'application/font-woff2', 'application/vnd.ms-fontobject', 'application/x-font-opentype', 'application/x-font-ttf'].includes(type);
    case 'image': return type.startsWith('image/');
    case 'stylesheet': return type === 'text/css';
    case 'video': return type.startsWith('video/');
  }
}

const responseFits = (asset, type) => contentTypeFits(asset.kind, type) || (type === 'application/octet-stream' && kindOfUrl(asset.url) === asset.kind);   // rQ

// A Content-Type's essence, lower-cased: the MIME type, 'invalid', or null when absent (oQ).
function mimeType(contentType) {
  const essence = contentType?.split(';', 1)[0]?.trim().toLowerCase();
  if (!essence) return null;
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(essence) ? essence : 'invalid';
}

function extensionOf(url) {                                                                                            // sQ, iQ
  let path;
  try { path = new URL(url).pathname; } catch { path = url.split(/[?#]/, 1)[0] ?? url; }
  const name = path.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
}

function failure({contentType, entry, reason}) {                                                                       // RM
  return entry.source === 'inline-svg'
    ? {contentType, id: entry.asset.id, name: entry.asset.name, reason, url: `inline-svg:${entry.asset.id}`}
    : {contentType, id: entry.asset.id, name: entry.asset.name, reason, url: entry.asset.url};
}

const messageOf = error => (error instanceof Error ? error.message : 'Asset bundling failed');                         // kM

function mimeTypeIn(frameTree, url) {                                                                                  // BM
  if (frameTree == null) return null;
  const found = frameTree.resources?.find(r => r.url === url)?.mimeType;
  if (found != null) return found;
  for (const child of frameTree.childFrames ?? []) {
    const type = mimeTypeIn(child, url);
    if (type != null) return type;
  }
  return null;
}

// In the page: one GET of the asset with the page's credentials, the body (read within `maxBytes` by `readBody`) as
// base64 (ZZ). Serialised with toString.
async function fetchAssetInPage({url, maxBytes, tooLarge}, readBody) {
  const response = await fetch(url, {credentials: 'include', method: 'GET'});
  if (!response.ok) throw new Error(`Asset request failed with HTTP ${response.status}`);
  const bytes = await readBody(response, maxBytes, tooLarge);
  const chunk = 32768;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return {base64: btoa(binary), contentType: response.headers.get('content-type')};
}

const ACQUIRING = 4;

// An asset over its byte bound: the bundle records it with the fixed sentence, and does not fetch it again.
class TooLarge extends Error {
  constructor(sentence) { super(sentence); }
}

// The asset's bytes: Chrome's copy of the loaded resource (eQ), else a fetch inside the page (QZ) -> {base64,
// contentType}, at most `maxBytes` either way.
async function assetContent(cdp, tabId, url, maxBytes) {
  const frameId = (await cdp.call(tabId, 'Page.getFrameTree')).frameTree?.frame?.id ?? null;                           // tQ
  let loadedError;
  try {
    if (frameId == null) throw new Error('Unable to determine frame id');
    await cdp.call(tabId, 'Page.enable');
    const [content, tree] = await Promise.all([cdp.call(tabId, 'Page.getResourceContent', {frameId, url}), cdp.call(tabId, 'Page.getResourceTree')]);
    const size = content.base64Encoded === true ? decodedLength(content.content) : Buffer.byteLength(content.content);
    if (size > maxBytes) throw new TooLarge(ASSET_TOO_LARGE);
    return {
      base64: content.base64Encoded === true ? content.content : btoa(Array.from(new TextEncoder().encode(content.content), b => String.fromCharCode(b)).join('')),
      contentType: mimeTypeIn(tree.frameTree, url),
    };
  } catch (error) {
    if (error instanceof TooLarge) throw error;
    loadedError = error;
  }
  let fetched;
  try {
    const args = JSON.stringify({url, maxBytes, tooLarge: ASSET_TOO_LARGE});
    fetched = await cdp.evaluateJavascript(tabId, `(${fetchAssetInPage.toString()})(${args},${readBoundedBodyInPage.toString()})`, {awaitPromise: true});
    if (fetched == null) throw new Error('Unable to bundle asset');
  } catch (error) {
    if (messageOf(error).endsWith(ASSET_TOO_LARGE)) throw new TooLarge(ASSET_TOO_LARGE);
    throw new Error(`Loaded resource fetch failed: ${messageOf(loadedError)}; page fetch failed: ${messageOf(error)}`, {cause: error});
  }
  if (typeof fetched.base64 !== 'string' || decodedLength(fetched.base64) > maxBytes) throw new TooLarge(ASSET_TOO_LARGE);
  return fetched;
}

// One inventory entry written into `directory` within the bundle's `budget` ({used, maxAssetBytes, maxBundleBytes})
// -> {asset} or {failure} (YZ).
async function bundleOne({budget, cdp, directory, entry, filesystem, tabId}) {
  // Counts `size` bytes against the bundle, or refuses them.
  const take = size => {
    if (budget.used + size > budget.maxBundleBytes) throw new TooLarge(BUNDLE_TOO_LARGE);
    budget.used += size;
  };
  try {
    if (budget.used >= budget.maxBundleBytes) throw new TooLarge(BUNDLE_TOO_LARGE);
    if (entry.source === 'inline-svg') {
      const size = Buffer.byteLength(entry.asset.markup);
      if (size > budget.maxAssetBytes) throw new TooLarge(ASSET_TOO_LARGE);
      take(size);
      const path = `${directory}/${entry.asset.id}.svg`;
      await filesystem.writeFile(path, entry.asset.markup);
      return {asset: {contentType: 'image/svg+xml', id: entry.asset.id, kind: 'image', name: entry.asset.name, path, url: `inline-svg:${entry.asset.id}`}};
    }
    const asset = entry.asset;
    const content = await assetContent(cdp, tabId, asset.url, budget.maxAssetBytes);
    const type = mimeType(content.contentType);
    if (!responseFits(asset, type)) {
      return {failure: failure({contentType: type, entry, reason: `Asset response type ${type ?? 'missing'} is not valid for ${asset.kind}`})};
    }
    take(decodedLength(content.base64));
    const path = `${directory}/${asset.id}${extensionOf(asset.url)}`;
    await filesystem.writeFile(path, Uint8Array.from(atob(content.base64), c => c.charCodeAt(0)));
    return {asset: {contentType: content.contentType, id: asset.id, kind: asset.kind, name: asset.name, path, url: asset.url}};
  } catch (error) {
    return {failure: failure({contentType: null, entry, reason: error instanceof Error ? error.message : 'Asset bundling failed'})};
  }
}

// --- the capability ----------------------------------------------------------------------------------------------------

export class PageAssets {
  // `limits` the byte bounds, {maxAssetBytes, maxBundleBytes} (byte-bounds.mjs's by default).
  constructor(cdp, filesystem, {maxAssetBytes = MAX_FILE_BYTES, maxBundleBytes = MAX_BUNDLE_BYTES} = {}) {
    this.cdp = cdp;
    this.filesystem = filesystem;
    this.limits = {maxAssetBytes, maxBundleBytes};
  }

  cdp;
  filesystem;
  limits;
  inventoriesById = new Map();          // id -> {assetsById: Map(id -> {source, asset}), documentUrl, tabId}

  async list({documentUrl, tabId}) {
    const [assets, svgs] = await Promise.all([pageAssets(this.cdp, tabId), inlineSvgs(this.cdp, tabId)]);
    const id = this.createInventory({assets, documentUrl, inlineSvgs: svgs, tabId});
    return {
      assets, id, inlineSvgs: svgs, pageUrl: documentUrl ?? null,
      summary: {byKind: countByKind(assets), inlineSvgCount: svgs.length, totalCount: assets.length},
    };
  }

  async bundle({assetIds, documentUrl, inventoryId, kinds, tabId}) {
    const started = performance.now();
    const chosen = this.getAssets({assetIds, documentUrl, inventoryId, kinds, tabId});
    if (chosen == null) throw new Error('Asset inventory is no longer valid for this page');
    if (chosen.missingAssetIds.length > 0) throw new Error('Asset bundle request included unknown asset ids');
    if (assetIds != null && chosen.assets.some(entry => !bundles(entry))) throw new Error('Asset bundle request included unsupported asset kinds');
    const entries = chosen.assets.filter(bundles);
    if (entries.length === 0) throw new Error('Asset bundle request matched no discovered assets');
    const directory = `${this.filesystem.tmpDir}/browser-use/assets/${randomUUID()}`;
    await this.filesystem.mkdir(directory, {recursive: true});
    const budget = {used: 0, ...this.limits};
    const results = new Array(entries.length);
    let next = 0;
    const worker = async () => {
      while (next < entries.length) {
        const index = next++;
        results[index] = await bundleOne({budget, cdp: this.cdp, directory, entry: entries[index], filesystem: this.filesystem, tabId});
      }
    };
    await Promise.all(Array.from({length: Math.min(ACQUIRING, entries.length)}, worker));
    const assets = results.flatMap(r => (r.asset == null ? [] : [r.asset]));
    const failures = results.flatMap(r => (r.failure == null ? [] : [r.failure]));
    const manifestPath = `${directory}/manifest.json`;
    await this.filesystem.writeFile(manifestPath, JSON.stringify({assets, failures}, null, 2));
    return {
      assets, directoryPath: directory, failures, manifestPath,
      summary: {downloadedCount: assets.length, elapsedMs: performance.now() - started, failedCount: failures.length, requestedCount: entries.length},
    };
  }

  createInventory({assets, documentUrl, inlineSvgs: svgs, tabId}) {
    const id = randomUUID();
    const assetsById = new Map();
    for (const a of assets) assetsById.set(a.id, {source: 'page-asset', asset: a});
    for (const svg of svgs) assetsById.set(svg.id, {source: 'inline-svg', asset: svg});
    this.inventoriesById.set(id, {assetsById, documentUrl, tabId});
    return id;
  }

  // The inventory's entries for these ids (all without), of these kinds (an inline SVG is an image), or null when the
  // inventory is unknown or was taken of another URL or tab.
  getAssets({assetIds, documentUrl, inventoryId, kinds, tabId}) {
    const inventory = this.inventoriesById.get(inventoryId);
    if (inventory == null || inventory.documentUrl !== documentUrl || inventory.tabId !== tabId) return null;
    const missingAssetIds = assetIds?.filter(id => !inventory.assetsById.has(id)) ?? [];
    const picked = assetIds == null ? [...inventory.assetsById.values()] : assetIds.flatMap(id => {
      const entry = inventory.assetsById.get(id);
      return entry == null ? [] : [entry];
    });
    return {
      assets: picked.filter(entry => kinds == null || kinds.includes(entry.source === 'inline-svg' ? 'image' : entry.asset.kind)),
      missingAssetIds,
    };
  }
}

export const ASSET_HANDLERS = {
  async tab_page_assets_list(params, session) {                                                                      // uM
    const tabId = tabIdOf(params.tab_id);
    const tab = await session.tabs.get(tabId);
    return await session.pageAssets.list({documentUrl: tab.url, tabId});
  },

  async tab_page_assets_bundle(params, session) {                                                                    // cM
    const tabId = tabIdOf(params.tab_id);
    const tab = await session.tabs.get(tabId);
    return await session.pageAssets.bundle({assetIds: params.assetIds, documentUrl: tab.url, inventoryId: params.inventoryId, kinds: params.kinds, tabId});
  },
};
