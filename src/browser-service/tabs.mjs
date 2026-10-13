// Ported from readable chatgpt-26.928.40906 BS:62045-62082 (class Uf, the backend's tabs); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: th, the tabs a session acquired per turn (BS:64333-64391); Df, the user's tabs (BS:60224-60260); the turn's
// end in rh (BS:64755-64760); V (BS:18539-18545); the tab commands dO, nf, mO, a1, uO, pO, fO, VS, md and mc
// (BS:46289-46306, 46998-47078, 50348-50361, 27533-27637).
//
// One TabRegistry per backend: the tabs of the current session as the backend (the host) keeps them, the tabs this
// service created or acquired in each turn, the user's tabs and claiming them, marks, the session's name, and the
// turn's end. Ownership, turn fencing and cleanup are the host's (src/chrome/host.mjs): at the turn's end the registry
// only detaches the turn's tabs; the host then closes unmarked created tabs and releases claimed ones. A tab acquired
// in an earlier turn is claimed again before the next turn's command uses it (needsReclaim; the dispatch in index.mjs).
// Dropped: the credential observation gate's hiding of a manual-saving tab's title and URL, and the "update the
// ChatGPT extension" rewording of a refused mark (the host's own refusal is the truer sentence on cua's route).
import {BrowserServiceError, serviceError} from './errors.mjs';

// A tab id the vendor accepts: a positive integer, from a string or a number (V).
export function tabIdOf(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Expected a positive integer');
  return id;
}

export class TabRegistry {
  // `api` the backend's BackendApi, `cdp` its CdpController.
  constructor(api, cdp, {preferredWindowId} = {}) {
    this.api = api;
    this.cdp = cdp;
    this.preferredWindowId = preferredWindowId;
  }

  api;
  cdp;
  preferredWindowId;
  sessions = new Map();          // session_id -> {acquiredTabs: Map(tabId -> origin), claimedTurnIds: Map(tabId -> turn_id), pendingEvents}

  // --- the backend's tabs (Uf) -----------------------------------------------------------------------------------

  async create() { return await this.api.createTab(this.preferredWindowId); }

  async list() { return await this.api.getTabs(); }

  async get(tabId) {
    const tabs = await this.list();
    const tab = tabs.find(t => t.id === tabId);
    if (tab == null) throw serviceError('tab_not_found', tabId, tabs);
    return tab;
  }

  // The session's selected tab (getActive).
  async select() {
    const tab = (await this.list()).find(t => t.active);
    if (tab == null) throw new Error('No active tab found');
    return tab;
  }

  async mark(tabId, status) { await this.api.markTab(tabId, status); }

  async name(name) { await this.api.nameSession(name); }

  // --- the user's tabs (Df) --------------------------------------------------------------------------------------

  async openUserTabs() { return await this.api.getUserTabs(); }

  async claim(tabId) { return await this.api.claimUserTab(tabId); }

  // --- the turn ----------------------------------------------------------------------------------------------------

  // Run before the backend hears the turn ended: the turn's tabs are detached while the turn is still the current one.
  async endTurn(stillCurrent = () => true) {
    if (stillCurrent()) await this.cdp.detachAllTabs();
  }

  // --- what this service created and acquired, per session and turn (th) ---------------------------------------------

  recordCreated(tabId) {
    const session = this.currentSession();
    session.acquiredTabs.set(tabId, 'agent');
    const turn = this.api.getCurrentTurnId();
    if (turn != null) session.claimedTurnIds.set(tabId, turn);
    session.pendingEvents.push({type: 'tab_created', tabId, origin: 'agent'});
  }

  recordAcquired(tabId, origin = 'external') {
    const session = this.currentSession();
    const turn = this.api.getCurrentTurnId();
    if (turn != null) session.claimedTurnIds.set(tabId, turn);
    if (!session.acquiredTabs.has(tabId)) {
      session.acquiredTabs.set(tabId, origin);
      session.pendingEvents.push({type: 'tab_acquired', tabId, origin});
    }
  }

  // Whether the tab was acquired in an earlier turn of this session and not yet in this one.
  needsReclaim(tabId) {
    const turn = this.api.getCurrentTurnId();
    if (turn == null) return false;
    const session = this.currentSession();
    return session.acquiredTabs.has(tabId) && session.claimedTurnIds.get(tabId) !== turn;
  }

  takeEvents() { return this.currentSession().pendingEvents.splice(0); }

  currentSession() {
    const id = this.api.getCurrentSessionId();
    let session = this.sessions.get(id);
    if (session == null) {
      session = {acquiredTabs: new Map(), claimedTurnIds: new Map(), pendingEvents: []};
      this.sessions.set(id, session);
    }
    return session;
  }
}

const withTitleAndUrl = tab => ({
  ...(tab.title == null ? {} : {title: tab.title}),
  ...(tab.url == null ? {} : {url: tab.url}),
});

// The tab commands, each `(params, session)` with the backend's BrowserSession (session.mjs).
export const TAB_HANDLERS = {
  async create_tab(params, session) {
    const tab = await session.tabs.create();
    session.tabs.recordCreated(tab.id);
    return {id: tab.id.toString()};
  },

  async get_tab(params, session) {
    const tab = await session.tabs.get(tabIdOf(params.tab_id));
    if (tab.sessionControlled !== false) session.tabs.recordAcquired(tab.id);
    return {id: String(tab.id), ...withTitleAndUrl(tab)};
  },

  async list_tabs(params, session) {
    return {
      tabs: (await session.tabs.list()).map(tab => ({
        id: tab.id.toString(),
        providerTabId: tab.providerTabId,
        ...(tab.url == null ? {} : {url: tab.url}),
        ...(tab.title == null ? {} : {title: tab.title}),
      })),
    };
  },

  async selected_tab(params, session) {
    try {
      const tab = await session.tabs.select();
      if (tab.sessionControlled !== false) session.tabs.recordAcquired(tab.id);
      return {id: tab.id.toString()};
    } catch {
      return {};
    }
  },

  async close_tab(params, session) {
    const tabId = Number(params.tab_id);
    if (!Number.isInteger(tabId) || tabId <= 0) throw new Error('close_tab requires a positive integer tab_id');
    await session.cdp.closeTab(tabId);
    return {};
  },

  async mark_tab(params, session) {
    await session.tabs.mark(tabIdOf(params.tab_id), params.status);
    return {};
  },

  async name_session(params, session) {
    const name = params.name.trim();
    if (!name) throw new Error('name_session requires a name');
    await session.tabs.name(name);
    return {};
  },

  async browser_user_open_tabs(params, session) {
    return {
      tabs: (await session.tabs.openUserTabs()).map(tab => ({
        id: String(tab.id),
        ...(tab.providerTabId == null ? {} : {providerTabId: tab.providerTabId}),
        ...withTitleAndUrl(tab),
        ...(tab.lastOpened == null ? {} : {lastOpened: tab.lastOpened}),
        ...(tab.tabGroup == null ? {} : {tabGroup: tab.tabGroup}),
      })),
    };
  },

  async browser_user_claim_tab(params, session) {
    const tab = await session.tabs.claim(tabIdOf(params.tab_id));
    session.tabs.recordAcquired(tab.id);
    return {id: String(tab.id), ...withTitleAndUrl(tab)};
  },

  // The vendor serves a manual handoff only on a CDP backend announcing browserAuth (cloud browsers); never on an
  // extension backend, whose manifest does not offer it (mc).
  async tab_manual_handoff_request(params, session) {
    throw new BrowserServiceError('browser_capability_unavailable', `${session.clientInfo.name} does not support command "tab_manual_handoff_request".`);
  },
};
