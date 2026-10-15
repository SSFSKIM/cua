// The capability host: the parity harness's test backend for the optional capabilities no live host announces yet
// (spec docs/doperpowers/specs/2026-10-13-own-browser-service-design.md, Decision Log "session, for M5"). cua's real
// host program (src/chrome/host.mjs createHost) with the fake cua extension (test/helpers/fake-cua-extension.mjs) behind
// it, served on a backend socket like a Chrome profile's, whose getInfo also announces the browser capability `history`
// and the tab capabilities `cdp`, `webmcp` and `browserAuth`, and which answers getUserHistory itself. No Chrome and no
// network: each tab is a scripted page whose navigations commit with the events Chrome sends, whose main frame is a
// secure document on CAPABILITY_ORIGIN registering one WebMCP tool, and whose isolated worlds run the services' scripts
// in a node:vm context holding that document's modelContext (test/browser-service/support/webmcp-tab.mjs's model of
// Chrome's WebMCP). Everything else a service sends is answered as the fake extension answers it, so a page script that
// needs a DOM (the vendor's Playwright injection) fails there, the same way for both services.
//
// The harness starts it in a scratch home (scripts/browser-parity/capability-home.mjs) and drives it through the real
// REPL client under `cua serve`, the same way for both services: `run --device local --backend capability-host`.
import {createServer} from 'node:net';
import {mkdirSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import vm from 'node:vm';
import {createHost} from '../../src/chrome/host.mjs';
import {backendDir} from '../../src/chrome/extension.mjs';
import {createPeer, frameDecoder} from '../../src/chrome/protocol.mjs';
import {createFakeCuaExtension} from '../helpers/fake-cua-extension.mjs';
import {frame as webMcpFrame} from '../browser-service/support/webmcp-tab.mjs';

export const CAPABILITY_ORIGIN = 'https://cua-capability.example';
export const CAPABILITIES = Object.freeze({
  browser: [{id: 'history'}],
  tab: [{id: 'cdp'}, {id: 'webmcp'}, {id: 'browserAuth'}],
});
const HISTORY_VISITED = '2026-10-14T10:00:00.000Z';
// The page's one WebMCP tool: its answer names its input, so an invocation that never reached the page cannot pass.
const SEARCH_TOOL = {name: 'search', title: 'Search', description: 'Search the catalogue',
  inputSchema: {type: 'object', properties: {q: {type: 'string'}}}, run: async input => `results for ${input.q}`};

// getUserHistory's answer, made from the query it was sent: one visit per query (or one for an unfiltered listing),
// cut to the limit.
export function historyFor({queries, limit} = {}) {
  const items = (queries?.length ? queries : ['recent']).map(q => ({url: `${CAPABILITY_ORIGIN}/history/${encodeURIComponent(q)}`, title: `History: ${q}`, dateVisited: HISTORY_VISITED}));
  return Number.isInteger(limit) && limit > 0 ? items.slice(0, limit) : items;
}

// The scripted pages: per tab a URL, a navigation history, a loader and a document (its WebMCP frame), the events of
// each commit sent through the fake extension `ext` (bound after it is made).
function scriptedPages() {
  const pages = new Map();
  const worlds = new Map();             // executionContextId -> vm context
  let ext = null, nextEntry = 1, nextLoader = 1, nextContext = 1;
  const documentFor = url => webMcpFrame('main', url.startsWith('https:') ? url : `${CAPABILITY_ORIGIN}/`, {tools: url.startsWith('https:') ? [SEARCH_TOOL] : []});
  const page = tabId => {
    if (!pages.has(tabId)) pages.set(tabId, {url: 'about:blank', history: [{id: nextEntry++, url: 'about:blank'}], index: 0, loader: `L${nextLoader++}`, document: documentFor('about:blank')});
    return pages.get(tabId);
  };
  const frameInfo = (tabId, p) => {
    const secure = p.url.startsWith('https:');
    return {id: `F${tabId}`, loaderId: p.loader, url: p.url, securityOrigin: secure ? new URL(p.url).origin : '://',
      secureContextType: secure ? 'Secure' : 'InsecureScheme', mimeType: 'text/html'};
  };
  const commit = (tabId, url, {replace = false} = {}) => {
    const p = page(tabId);
    p.url = url;
    p.loader = `L${nextLoader++}`;
    p.document = documentFor(url);
    if (!replace) {
      p.history = [...p.history.slice(0, p.index + 1), {id: nextEntry++, url}];
      p.index = p.history.length - 1;
    }
    const tab = ext.state.tabs.get(tabId);
    if (tab) Object.assign(tab, {url, title: url.startsWith('https:') ? 'Capability fixture' : ''});
    const debuggee = {tabId};
    setImmediate(() => {
      ext.cdpEvent(debuggee, 'Page.frameStartedLoading', {frameId: `F${tabId}`});
      ext.cdpEvent(debuggee, 'Page.frameNavigated', {frame: frameInfo(tabId, p), type: 'Navigation'});
      ext.cdpEvent(debuggee, 'Page.domContentEventFired', {timestamp: 1});
      ext.cdpEvent(debuggee, 'Page.loadEventFired', {timestamp: 2});
    });
  };
  async function evaluateInWorld(context, expression) {
    try {
      const value = await vm.runInContext(expression, context);
      return {result: value === undefined ? {type: 'undefined'} : {type: value === null ? 'object' : typeof value, value: structuredClone(value)}};
    } catch (error) {
      return {exceptionDetails: {text: 'Uncaught', exception: {description: `Error: ${error?.message ?? error}`}}};
    }
  }
  const cdp = ({debuggee, method, params}) => {
    const tabId = debuggee.tabId;
    const p = page(tabId);
    switch (method) {
      case 'Page.getFrameTree':
        return {frameTree: {frame: frameInfo(tabId, p)}};
      case 'Page.getNavigationHistory':
        return {currentIndex: p.index, entries: p.history.map(e => ({...e, title: ''}))};
      case 'Page.navigate':
        commit(tabId, params.url);
        return {frameId: `F${tabId}`, loaderId: `L${nextLoader}`};
      case 'Page.navigateToHistoryEntry': {
        p.index = p.history.findIndex(e => e.id === params.entryId);
        commit(tabId, p.history[p.index].url, {replace: true});
        return {};
      }
      case 'Page.reload':
        commit(tabId, p.url, {replace: true});
        return {};
      case 'Page.createIsolatedWorld': {
        const d = p.document;
        const context = vm.createContext({window: d.window, document: {modelContext: d.modelContext}, origin: d.origin, crypto, AbortSignal, JSON, Reflect, Map, Error});
        const executionContextId = nextContext++;
        worlds.set(executionContextId, context);
        return {executionContextId};
      }
      case 'Runtime.evaluate':
        if (params?.contextId != null && worlds.has(params.contextId)) return evaluateInWorld(worlds.get(params.contextId), params.expression);
        // The main world: the document's location and state, what both services read after a navigation.
        return {result: {type: 'object', value: {href: p.url, readyState: 'complete'}}};
      case 'Target.closeTarget':
        setImmediate(() => ext.userCloseTab(Number(String(params.targetId).replace(/^T-/, ''))));
        return {success: true};
      default:
        return {};
    }
  };
  return {cdp, bind(extension) { ext = extension; }};
}

// Starts the host on `<home>/chrome/b/<socketName>.sock` -> {socketPath, instanceId, close()}. The host's own state
// (its status and the harness's trace activation, $CUA_HOME/state/host-trace.json) lives in `home` too.
export async function startCapabilityHost({home, socketName = 'capability-host', userTabs = []}) {
  const pages = scriptedPages();
  const ext = createFakeCuaExtension({cdp: pages.cdp, tabs: userTabs});
  pages.bind(ext);
  const host = createHost({extension: ext.api, hello: ext.hello(), home});
  ext.onNotify = (method, params) => host.onExtensionNotification({method, params});
  const dir = backendDir(home);
  mkdirSync(dir, {recursive: true, mode: 0o700});
  const socketPath = join(dir, `${socketName}.sock`);
  rmSync(socketPath, {force: true});
  const sockets = new Set();
  const server = createServer(socket => {
    sockets.add(socket);
    const client = {notify: (method, params) => peer.notify(method, params)};
    const handlers = Object.fromEntries(host.methods.map(method => [method, params => host.handleBackendRequest(client, {method, params})]));
    const hostInfo = handlers.getInfo;
    handlers.getInfo = async params => {
      const info = await hostInfo(params);
      return {...info, capabilities: {browser: [...info.capabilities.browser, ...CAPABILITIES.browser], tab: [...info.capabilities.tab, ...CAPABILITIES.tab]}};
    };
    handlers.getUserHistory = async params => historyFor(params);
    const peer = createPeer({send: bytes => { if (!socket.destroyed) socket.write(bytes); }, handlers});
    const decode = frameDecoder();
    socket.on('data', chunk => {
      try { for (const message of decode(chunk)) peer.receive(message); } catch { socket.destroy(); }
    });
    socket.on('error', () => {});
    socket.once('close', () => {
      sockets.delete(socket);
      peer.close('client closed');
      host.clientClosed(client).catch(() => {});
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); });
  return {
    socketPath, instanceId: ext.instanceId,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => server.close(resolve));
      host.extensionClosed();
      rmSync(socketPath, {force: true});
    },
  };
}
