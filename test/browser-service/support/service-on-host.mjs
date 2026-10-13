// The cua browser service (src/browser-service/index.mjs) on the real host program with the fake cua extension behind
// it, under a fake node_repl runtime: the turn metadata the runtime gives each call, its nativePipe (a real Unix socket)
// and its turn-ended hook. The fake extension's CDP answers are a scripted page per tab: a document with a URL, a main
// frame, a navigation history, and the events Chrome sends when a navigation commits and loads (`autoLoad: false`
// keeps a navigation from ever committing).
import {createBrowserService} from '../../../src/browser-service/index.mjs';
import {nativePipe, startRealHost, waitFor} from './real-host.mjs';

export {waitFor};

export function scriptedPages({autoLoad = true, navigateError = null} = {}) {
  const pages = new Map();                 // tabId -> {url, history: [{id, url}], index, loader}
  let ext = null;
  let nextEntry = 1;
  let nextLoader = 1;
  const page = tabId => {
    if (!pages.has(tabId)) pages.set(tabId, {url: 'about:blank', history: [{id: nextEntry++, url: 'about:blank'}], index: 0, loader: `L${nextLoader++}`});
    return pages.get(tabId);
  };
  const commit = (tabId, url, {replace = false} = {}) => {
    const p = page(tabId);
    p.url = url;
    p.loader = `L${nextLoader++}`;
    if (!replace) {
      p.history = [...p.history.slice(0, p.index + 1), {id: nextEntry++, url}];
      p.index = p.history.length - 1;
    }
    const debuggee = {tabId};
    setImmediate(() => {
      ext.cdpEvent(debuggee, 'Page.frameStartedLoading', {frameId: `F${tabId}`});
      ext.cdpEvent(debuggee, 'Page.frameNavigated', {frame: {id: `F${tabId}`, loaderId: p.loader, url}, type: 'Navigation'});
      ext.cdpEvent(debuggee, 'Page.domContentEventFired', {timestamp: 1});
      ext.cdpEvent(debuggee, 'Page.loadEventFired', {timestamp: 2});
    });
  };
  const sent = [];
  const cdp = ({debuggee, method, params}) => {
    const tabId = debuggee.tabId;
    sent.push({tabId, method, params});
    const p = page(tabId);
    switch (method) {
      case 'Runtime.evaluate':
        return {result: {type: 'object', value: {href: p.url, readyState: 'complete'}}};
      case 'Page.getFrameTree':
        return {frameTree: {frame: {id: `F${tabId}`, loaderId: p.loader, url: p.url}}};
      case 'Page.getNavigationHistory':
        return {currentIndex: p.index, entries: p.history.map(e => ({...e, title: ''}))};
      case 'Page.navigate':
        if (navigateError) return {frameId: `F${tabId}`, errorText: navigateError};
        if (autoLoad) commit(tabId, params.url);
        return {frameId: `F${tabId}`, loaderId: `L${nextLoader}`};
      case 'Page.navigateToHistoryEntry': {
        const index = p.history.findIndex(e => e.id === params.entryId);
        p.index = index;
        if (autoLoad) commit(tabId, p.history[index].url, {replace: true});
        return {};
      }
      case 'Page.reload':
        if (autoLoad) commit(tabId, p.url, {replace: true});
        return {};
      case 'Target.closeTarget':
        // Chrome closes the page's tab (the fake extension: as if the person closed it).
        setImmediate(() => ext.userCloseTab(Number(String(params.targetId).replace(/^T-/, ''))));
        return {success: true};
      default:
        return {};
    }
  };
  return {cdp, pages, page, sent, bind(extension) { ext = extension; }};
}

// -> {service, ext, runtime, pages, turnEnded(turn), setTurn(turn), requests()}: `requests()` are the backend methods
// the host received (from the host's own log of the extension's calls is not enough: the service's requests are what
// the host answers), read through the fake runtime's nativePipe.
export async function serviceOnHost(t, {fake = {}, pages = scriptedPages(), env = {}, turn = {session_id: 'session-a', turn_id: 'turn-1'}} = {}) {
  const {ext, socketPath} = await startRealHost(t, {cdp: pages.cdp, ...fake});
  pages.bind(ext);
  const turnHandlers = new Set();
  const requests = [];
  const meta = {current: turn};
  const runtime = {
    env: {BROWSER_USE_BACKEND_PATHS: socketPath, BROWSER_USE_AVAILABLE_BACKENDS: 'chrome', ...env},
    get requestMeta() { return meta.current == null ? {} : {'x-codex-turn-metadata': meta.current}; },
    nativePipe: {
      async createConnection(path) {
        const stream = await nativePipe.createConnection(path);
        return Object.freeze({
          write(bytes) {
            try { requests.push(JSON.parse(Buffer.from(bytes).subarray(4).toString('utf8')).method); } catch {}
            stream.write(bytes);
          },
          on: (event, listener) => stream.on(event, listener),
          off: (event, listener) => stream.off(event, listener),
          end: () => stream.end(),
        });
      },
    },
    addTurnEndedHandler(handler) {
      turnHandlers.add(handler);
      return () => turnHandlers.delete(handler);
    },
  };
  const service = createBrowserService({runtime});
  t.after(() => service.dispose());
  return {
    service, ext, runtime, pages, socketPath,
    requests: () => [...requests],
    setTurn(next) { meta.current = next; },
    async turnEnded(ended = meta.current) { await Promise.all([...turnHandlers].map(h => h.run(ended))); },
    turnHandlerCount: () => turnHandlers.size,
  };
}

// The calls a test makes most: setup, then the one browser's id.
export async function readyBrowser(service) {
  await service.handleRpc({method: 'setup', params: {environment: 'codex-app'}});
  const [browser] = await service.handleRpc({method: 'execute', params: {type: 'list_browsers'}});
  return browser.id;
}

export const execute = (service, params) => service.handleRpc({method: 'execute', params});

export async function rejection(promise) {
  try { await promise; } catch (error) { return error; }
  throw new Error('expected a rejection');
}
