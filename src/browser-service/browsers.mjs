// Ported from readable chatgpt-26.928.40906 BS:68344-68420 (class hh, the browsers the service can select); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: the selection functions pL, fL, hL, Bte, fh, mh, Ote, vi, Mte, gL, Nte and mL (BS:68213-68343), TC, Kg, Vg and
// Bg (BS:18353-18390, 9985); the browser shapes A_ and po (BS:66007-66035); the preference wC (BS:11047-11066); SI
// (BS:36403); the four selection commands P_, I_, R_ and B_ (BS:66036-66075).
//
// The backends discovered on the sockets the launch names (backend.mjs discoverBackends), refreshed when a selection
// is asked for and otherwise kept, and how a request picks one: by its id, by a backend type ("extension") or a browser
// family ("chrome", "edge"), the default (the preferred extension instance, else any extension), or the one best placed
// for a URL (an extension with a tab open on it). One turn-ended hook (backend.mjs TurnEndedTracker) serves every
// backend. Dropped from hh: the Codex config preferences and the in-app browser's session filtering and diagnostics.
import {BackendApi, discoverBackends, TurnEndedTracker, turnMetadata} from './backend.mjs';
import {BrowserServiceError, serviceError} from './errors.mjs';
import {browserCapabilities} from './manifest.mjs';
import {isIP} from 'node:net';

const OPEN_TABS_MS = 1000;                                           // Dte
const BACKEND_TYPES = ['extension', 'iab', 'cdp', 'mcpapps'];        // Kg, Vg
const FAMILIES = ['chrome', 'edge'];                                  // Bg (the keys of za)

// The extension instance and window the launch prefers (wC): BROWSER_USE_PREFERRED_EXTENSION_INSTANCE_ID (or its
// Chrome-named predecessor) and BROWSER_USE_PREFERRED_WINDOW_ID; null when no instance is named.
export function browserPreference(env) {
  const named = name => (typeof env?.[name] === 'string' && env[name].trim() ? env[name].trim() : undefined);
  const extensionInstanceId = named('BROWSER_USE_PREFERRED_EXTENSION_INSTANCE_ID') ?? named('BROWSER_USE_PREFERRED_CHROME_EXTENSION_INSTANCE_ID');
  if (extensionInstanceId == null) return null;
  const windowId = Number(named('BROWSER_USE_PREFERRED_WINDOW_ID') ?? named('BROWSER_USE_PREFERRED_CHROME_WINDOW_ID'));
  return {extensionInstanceId, ...(Number.isSafeInteger(windowId) && windowId >= 0 ? {preferredWindowId: windowId} : {})};
}

// A browser as list_browsers answers it (A_).
export function browserListing(id, info) {
  return {
    family: info.family,
    id,
    name: info.name,
    type: BACKEND_TYPES.includes(info.type) ? info.type : undefined,
    profileName: info.metadata?.profileName,
    metadata: info.metadata == null ? undefined : {extensionInstanceId: info.metadata.extensionInstanceId, codexSessionId: info.metadata.codexSessionId},
  };
}

// A browser as the selection commands answer it (po): the listing, the backend's API overrides and its capabilities.
export function browserSelection(env, id, info) {
  const capabilities = browserCapabilities(env, info.capabilities);
  const handoff = info.type === 'cdp' && capabilities.tab?.some(({id: capability}) => capability === 'browserAuth') === true;
  return {
    ...browserListing(id, info),
    apiSupportOverrides: handoff ? {...info.apiSupportOverrides, 'Tab.requestManualHandoff': true} : info.apiSupportOverrides,
    capabilities,
  };
}

// Whether a browser answers to the id a request names: its own id, its backend type, or (an extension) its family (TC).
function answersTo(browser, requested) {
  if (BACKEND_TYPES.includes(requested)) return browser.info.type === requested;
  if (FAMILIES.includes(requested)) return browser.info.type === 'extension' && (browser.info.family ?? 'chrome') === requested;
  return browser.id === requested;
}

const isPreferredExtension = (info, preference) => preference != null && info.type === 'extension' && info.metadata?.extensionInstanceId === preference.extensionInstanceId;   // fh

// The default browser (fL): an in-app browser, the preferred extension, any extension, the first.
function defaultBrowser(browsers, preference) {
  return browsers.find(({info}) => info.type === 'iab') ?? browsers.find(({info}) => isPreferredExtension(info, preference))
    ?? browsers.find(({info}) => info.type === 'extension') ?? browsers[0];
}

const isLocal = url => url.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname.toLowerCase()) || url.hostname.toLowerCase().endsWith('.localhost');   // gL, SI
const parsedUrl = text => { try { return new URL(text); } catch { return null; } };                                                   // Nte
const withoutHash = url => { const copy = new URL(url); copy.hash = ''; return copy.href; };                                         // mL

// Whether two host names are one registrable hierarchy: the shorter, a dotted non-IP name, is a suffix of the longer (Ote).
function sameHierarchy(a, b) {
  const x = a.toLowerCase().replace(/\.$/, ''), y = b.toLowerCase().replace(/\.$/, '');
  const [shorter, longer] = x.length < y.length ? [x, y] : [y, x];
  return shorter.includes('.') && isIP(shorter) === 0 && longer.endsWith(`.${shorter}`);
}

function withTabOn(candidates, url, how) {                                                                             // mh
  return candidates.filter(({openTabUrls}) => openTabUrls.some(text => {
    const open = parsedUrl(text);
    if (open == null) return false;
    switch (how) {
      case 'exact': return withoutHash(open) === withoutHash(url);
      case 'originPathname': return open.origin === url.origin && open.pathname === url.pathname;
      case 'hostname': return open.hostname === url.hostname;
      case 'hierarchy': return sameHierarchy(open.hostname, url.hostname);
    }
    return false;
  }));
}

const preferredOf = candidates => candidates.find(({type}) => type === 'iab') ?? candidates.find(({matchesPreferredExtension}) => matchesPreferredExtension) ?? candidates[0];   // vi

// The URLs of the tabs open in a backend (Mte): the user's tabs of an extension, bounded at 1 s; none on failure.
async function openTabUrls(api, type) {
  if (type !== 'iab' && type !== 'extension') return [];
  let timer;
  try {
    const listing = type === 'extension' ? api.getUserTabs() : api.getTabs();
    const bound = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out after ${OPEN_TABS_MS}ms waiting for open browser tabs.`)), OPEN_TABS_MS); });
    return (await Promise.race([listing, bound])).flatMap(({url}) => (typeof url === 'string' ? [url] : []));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// The browser best placed for a URL (hL, Bte).
async function browserForUrl(browsers, text, preference) {
  const url = new URL(text);
  if (browsers.length === 1) return browsers[0];
  if (isLocal(url)) {
    const iab = browsers.find(({info}) => info.type === 'iab');
    if (iab != null) return iab;
  }
  const candidates = await Promise.all(browsers.map(async b => ({
    id: b.id, type: b.info.type, matchesPreferredExtension: isPreferredExtension(b.info, preference), openTabUrls: await openTabUrls(b.api, b.info.type),
  })));
  const iabs = candidates.filter(({type}) => type === 'iab');
  const extensions = candidates.filter(({type}) => type === 'extension');
  let id;
  if (isLocal(url) && iabs.length > 0) id = preferredOf(iabs)?.id;
  else {
    const both = [...iabs, ...extensions];
    id = preferredOf(withTabOn(both, url, 'exact'))?.id ?? preferredOf(withTabOn(both, url, 'originPathname'))?.id
      ?? preferredOf(withTabOn(both, url, 'hostname'))?.id ?? preferredOf(withTabOn(both, url, 'hierarchy'))?.id
      ?? preferredOf(iabs)?.id ?? preferredOf(extensions)?.id ?? candidates[0]?.id;
  }
  return browsers.find(b => b.id === id);
}

export class BrowserContext {
  // `runtime` is the node_repl runtime (env, requestMeta, nativePipe, addTurnEndedHandler).
  constructor(runtime) {
    this.runtime = runtime;
    this.env = runtime.env ?? {};
    this.preference = browserPreference(this.env);
    this.turnEndedTracker = new TurnEndedTracker(runtime);
  }

  runtime;
  env;
  preference;
  turnEndedTracker;
  browsers = null;
  refreshPromise = null;
  tracked = new WeakSet();

  async refresh() {
    this.refreshPromise ??= (async () => {
      const found = await discoverBackends(this.env, {
        nativePipe: this.runtime.nativePipe,
        previous: this.browsers ?? [],
        createApi: backend => new BackendApi(backend, {getTurnMetadata: () => turnMetadata(this.runtime), turnEndedTracker: this.turnEndedTracker}),
      });
      this.browsers = found;
      for (const browser of found) this.track(browser);
    })().finally(() => { this.refreshPromise = null; });
    await this.refreshPromise;
  }

  list() { return this.getBrowsers(); }

  async get(id) {
    const browser = (await this.getBrowsers()).find(b => answersTo(b, id));
    if (browser == null) throw serviceError('browser_not_found', id);
    return browser;
  }

  async getDefault() {
    const browser = defaultBrowser(await this.getBrowsers(), this.preference);
    if (browser == null) throw new BrowserServiceError('browser_not_found', 'No browser is available');
    return browser;
  }

  async getForUrl(url) {
    const browser = await browserForUrl(await this.getBrowsers(), url, this.preference);
    if (browser == null) throw new BrowserServiceError('browser_not_found', 'No browser is available');
    return browser;
  }

  // The window a new tab of this backend opens in: the preferred one, for the preferred extension.
  preferredWindowIdFor(info) {
    return isPreferredExtension(info, this.preference) ? this.preference?.preferredWindowId : undefined;
  }

  selection(browser) { return browserSelection(this.env, browser.id, browser.info); }

  async dispose() {
    if (this.refreshPromise != null) await this.refreshPromise.catch(() => {});
    this.turnEndedTracker.dispose();
    const browsers = this.browsers;
    this.browsers = null;
    await Promise.all(browsers?.map(({api}) => api.close().catch(() => {})) ?? []);
  }

  async getBrowsers() {
    if (this.browsers == null) await this.refresh();
    return this.browsers ?? [];
  }

  // A backend whose connection closes leaves the list.
  track(browser) {
    if (this.tracked.has(browser.api)) return;
    this.tracked.add(browser.api);
    browser.api.addCloseListener(() => {
      if (this.browsers != null) this.browsers = this.browsers.filter(b => b !== browser);
    });
  }
}

// The four selection commands (zN's B_, P_, R_ and I_): each refreshes the backends first.
export const SELECTION_HANDLERS = {
  async list_browsers(params, runtime) {
    await runtime.context.refresh();
    return (await runtime.context.list()).map(({id, info}) => browserListing(id, info));
  },
  async get_browser(params, runtime) {
    await runtime.context.refresh();
    return runtime.context.selection(await runtime.context.get(params.id));
  },
  async get_default_browser(params, runtime) {
    await runtime.context.refresh();
    return runtime.context.selection(await runtime.context.getDefault());
  },
  async get_browser_for_url(params, runtime) {
    await runtime.context.refresh();
    return runtime.context.selection(await runtime.context.getForUrl(params.url));
  },
};
