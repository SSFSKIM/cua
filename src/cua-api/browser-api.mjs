// Ported from readable chatgpt-26.928.40906 R/cua_node/@oai/cua/dist/lib/js/oai_js_cua/src/tinysky_alt/create_browser_api.js:5-290,
// tab_reference.js:3-59 and setup_browser.js:3-19 (the cua browser facade over the browser client's agent), for
// docs/doperpowers/specs/2026-10-14-own-repl-host-design.md (M3, CuaBootstrap; Table 1 cua.getBrowser,
// createBrowserTab, getTab, listBrowsers, listTabs). #120's clean-room rewrite replaces this port before distribution.
//
// setup_browser sets the browser client up (./browser-client.mjs) with every Tab decorated (./bind-tab.mjs), Tab.ax kept
// out of the generated documentation and the documents this facade supersedes excluded. create_browser_api(browsers,
// emitter) -> the cua browser members. A selected browser's documentation is loaded before use and emitted on first use;
// a created or bound tab's initial accessibility state is read and emitted before the tab is returned (except a new-tab
// page, whose metadata is emitted instead). Dropped, per the surface inventory's Tables 2 and 3: the
// CUA_REPL_BROWSER_ENV modes (the client's default environment stands), the in-app browser's tab-mention source default
// and its match bypass, and the Orbit signed new-tab page. Extension tab mentions and chrome://newtab stay.
import {bind_tab} from './bind-tab.mjs';
import {get_browser_tabs} from './get-state.mjs';

export function setup_browser({setupBrowserRuntime, exclude_browser_confirmations}) {
  const excludedDocumentation = ['tab-claiming-chrome', 'tab-mentions-iab'];
  if (exclude_browser_confirmations) excludedDocumentation.push('confirmations');
  return setupBrowserRuntime({decorateTab: bind_tab, undocumentedApiMembers: ['Tab.ax'], excludedDocumentation});
}

// A strict tab-v1 mention URL -> {source, browser_id, tab_id, title, url}; anything else throws.
export function parse_tab_mention(mention) {
  const url = URL.parse(mention);
  if (url === null) throw new Error('Invalid tab mention URL.');
  if (url.protocol !== 'plugin:' || url.host !== 'openai-bundled' || !['browser', 'chrome', 'chrome-dev', 'chrome-internal'].includes(url.username)
    || url.password !== '' || (url.pathname !== '' && url.pathname !== '/') || url.hash !== '') throw new Error('Invalid tab mention URL.');
  const fields = Object.fromEntries(url.searchParams);
  const {mention: kind, source, browserId, tabId, title, url: tabUrl} = fields;
  const resolvedSource = url.username === 'browser' ? source : 'extension';
  if (kind !== 'tab-v1' || url.searchParams.size !== Object.keys(fields).length || (resolvedSource !== 'iab' && resolvedSource !== 'extension')
    || browserId === undefined || browserId.trim() === '' || tabId === undefined || tabId.trim() === '' || title === undefined || tabUrl === undefined)
    throw new Error('Invalid tab mention fields.');
  return {source: resolvedSource, browser_id: browserId, tab_id: tabId, title, url: tabUrl};
}

// The id of the one listed browser a parsed mention names (its type and extension instance).
export async function get_mentioned_browser_id(browsers, mention) {
  const matches = (await browsers.list()).filter(browser => browser.type === mention.source && browser.metadata?.extensionInstanceId === mention.browser_id);
  if (matches.length === 0) throw new Error('The browser/profile referenced by the tab mention is unavailable.');
  if (matches.length !== 1) throw new Error(`Multiple browsers match the tab mention's browser/profile: ${JSON.stringify(matches)}`);
  return matches[0].id;
}

const NEW_TAB_URLS = ['chrome://newtab', 'chrome://newtab/'];
const withScheme = url => (url === undefined || URL.canParse(url) ? url : `https://${url}`);

export function create_browser_api(browsers, emitter) {
  // The browser `options.browser` names, else the one serving `url`, else the default, else the first listed; its
  // documentation is loaded before it is returned.
  async function selectBrowser(options, url) {
    let browser;
    if ((options == null ? undefined : options.browser) !== undefined) {
      browser = await browsers.get(options.browser);
    } else if (url !== undefined && browsers.getForUrl !== undefined) {
      browser = await browsers.getForUrl(url);
    } else if (browsers.getDefault !== undefined) {
      browser = await browsers.getDefault();
    } else {
      const first = (await browsers.list())[0];
      if (first === undefined) throw new Error('No browser is available.');
      browser = await browsers.get(first.id);
    }
    await emitter.load_browser_documentation(browser);
    return browser;
  }

  // Emits the tab's full initial accessibility state (with the browser's first-use documentation) and returns the tab.
  async function observed(tab, browser) {
    const state = await tab.getAXState({disableDiffing: true, emit: false});
    await emitter.emit(state, {browser});
    return tab;
  }

  return {
    browsers,
    async getBrowser(options) {
      let id = options == null ? undefined : options.id;
      if ((options == null ? undefined : options.extensionInstanceId) !== undefined) {
        if (id !== undefined) throw new Error('Specify either id or extensionInstanceId, not both.');
        const matches = (await browsers.list()).filter(browser => browser.type === 'extension' && browser.metadata?.extensionInstanceId === options.extensionInstanceId);
        if (matches.length === 0) throw new Error('The Chrome instance is unavailable.');
        if (matches.length !== 1) throw new Error(`Multiple browsers match the Chrome instance: ${JSON.stringify(matches)}`);
        id = matches[0].id;
      }
      const url = withScheme(options == null ? undefined : options.url);
      const browser = await selectBrowser({browser: id}, url);
      await emitter.emit(undefined, {browser});
      return browser;
    },
    async createBrowserTab(browserId, url, options) {
      if (typeof browserId != 'string' || browserId.trim() === '') throw new Error('createBrowserTab requires a browser ID. Select one with cua.getBrowser().');
      const target = withScheme(url);
      const browser = await selectBrowser({browser: browserId});
      if (browser.tabs.new === undefined) throw new Error(`Browser ${browser.browserId} does not support creating tabs.`);
      if ((options == null ? undefined : options.sessionName) !== undefined) {
        if (typeof browser.nameSession != 'function') throw new Error(`Browser ${browser.browserId} does not support sessionName.`);
        await browser.nameSession(options.sessionName);
      }
      if ((options == null ? undefined : options.visible) !== undefined) {
        if (browser.capabilities === undefined) throw new Error(`Browser ${browser.browserId} does not support visibility control.`);
        const visibility = await browser.capabilities.get('visibility');
        await visibility.set(options.visible);
      }
      const tab = await browser.tabs.new();
      if (tab.goto !== undefined) {
        await tab.goto(target ?? 'about:blank');
      } else if (target !== undefined) {
        await tab.close?.call(tab);
        throw new Error(`Tab ${tab.id} does not support navigation.`);
      }
      return observed(tab, browser);
    },
    async getTab(reference, options) {
      let browser;
      let managed;
      let matches;
      if (typeof reference == 'string') {
        if (reference === '') throw new Error('getTab requires a tab reference');
        browser = await selectBrowser(options);
        managed = await browser.tabs.list();
        matches = await matchingTabs({browser, managed_tab_list: managed, matches: tab => tab.id === reference || tab.providerTabId === reference});
      } else if ('mention' in reference) {
        const mention = parse_tab_mention(reference.mention);
        browser = await selectBrowser({browser: await get_mentioned_browser_id(browsers, mention)});
        if ((options == null ? undefined : options.browser) !== undefined) {
          if ((await browsers.get(options.browser)).browserId !== browser.browserId) throw new Error('The requested browser does not match the tab mention\'s browser/profile.');
        }
        managed = await browser.tabs.list();
        matches = await matchingTabs({browser, managed_tab_list: managed, matches: tab => tab.providerTabId === mention.tab_id});
        const found = matches[0];
        if (found !== undefined && (found.title !== mention.title || found.url !== mention.url)) throw new Error('Stale tab mention: the tab\'s title or URL has changed.');
      } else {
        if (!URL.canParse(reference.url)) throw new Error('getTab requires an absolute URL.');
        if (!(options == null ? undefined : options.browser)) throw new Error('getTab({ url }) requires an explicit browser.');
        browser = await selectBrowser(options);
        managed = await browser.tabs.list();
        const user = (await browser.user?.openTabs?.call(browser.user)) ?? [];
        const byId = new Map([...user, ...managed].map(tab => [tab.id, tab]));
        matches = [...byId.values()].filter(tab => tab.url === reference.url);
      }
      const match = matches[0];
      if (match === undefined) throw new Error(`Tab not found in browser ${browser.browserId}.`);
      if (matches.length !== 1) {
        const browserId = browser.browserId;
        const listed = matches.map(tab => Object.assign(Object.assign({}, tab), {browserId}));
        throw new Error(`Multiple tabs match the reference in browser ${browserId}: ${JSON.stringify(listed)}`);
      }
      let tab;
      if (managed.some(entry => entry.id === match.id)) {
        tab = await browser.tabs.get(match.id);
      } else {
        if (browser.user?.claimTab === undefined) throw new Error(`Tab ${match.id} cannot be claimed in browser ${browser.browserId}.`);
        tab = await browser.user.claimTab(match);
      }
      if (NEW_TAB_URLS.includes(match.url)) {
        await emitter.emit(Object.assign(Object.assign({}, match), {browserId: browser.browserId}), {browser});
        return tab;
      }
      return observed(tab, browser);
    },
    async listBrowsers(options) {
      const listed = await browsers.list();
      await emitter.emit(listed, options);
      return listed;
    },
    async listTabs(options) {
      let selected;
      let scope;
      if ((options == null ? undefined : options.browser) !== undefined) {
        selected = await selectBrowser(options);
        scope = [{id: selected.browserId}];
      } else {
        scope = await browsers.list();
      }
      const perBrowser = await Promise.all(scope.map(async info => {
        const browser = selected ?? (await browsers.get(info.id));
        const tabs = await get_browser_tabs(browser);
        const browserId = browser.browserId;
        return tabs.map(tab => Object.assign(Object.assign({}, tab), {browserId}));
      }));
      const tabs = perBrowser.flat();
      await emitter.emit(tabs, Object.assign(Object.assign({}, options), {browser: selected}));
      return tabs;
    },
  };
}

// The tabs `matches` selects: from the managed tabs if any match, else from the user's open tabs merged with the
// managed ones (a managed tab keeps the user inventory's provider tab id when it has none of its own).
async function matchingTabs({browser, managed_tab_list, matches}) {
  const managed = managed_tab_list.filter(matches);
  if (managed.length !== 0) return managed;
  const user = (await browser.user?.openTabs?.call(browser.user)) ?? [];
  const byId = new Map();
  for (const tab of user) byId.set(tab.id, tab);
  const providerIds = new Map(user.map(tab => [tab.id, tab.providerTabId]));
  for (const tab of managed_tab_list) byId.set(tab.id, Object.assign(Object.assign({}, tab), {providerTabId: tab.providerTabId ?? providerIds.get(tab.id)}));
  return [...byId.values()].filter(matches);
}
