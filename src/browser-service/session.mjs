// Ported from readable chatgpt-26.928.40906 BS:64664-64840 (class rh, the service's state for one backend); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
//
// One BrowserSession per backend connection, made the first time a command names its browser: the backend's CDP
// controller (cdp.mjs), its tabs (tabs.mjs) and the locator engine over the controller (the injected script's
// installation, injected.mjs, and selector resolution, selectors.mjs). It hooks the turn's end into the backend API
// (the turn's tabs are detached before the host hears turnEnded) and disposes itself when the connection closes. The
// later milestones add their parts here (downloads, the clipboard, ...). Dropped from rh: the credential observation
// gate, the security and preferences objects (no site policy, no Codex config), the orbit session follow, site
// instructions and the AX tree.
import {CdpController} from './cdp.mjs';
import {InjectedScripts} from './injected.mjs';
import {SelectorEngine} from './selectors.mjs';
import {TabRegistry} from './tabs.mjs';

export class BrowserSession {
  // `api` the backend's BackendApi, `browserId` the id the service lists it under, `clientInfo` its getInfo answer.
  constructor(api, browserId, clientInfo, {preferredWindowId} = {}) {
    this.api = api;
    this.browserId = browserId;
    this.clientInfo = clientInfo;
    this.cdp = new CdpController(api);
    this.tabs = new TabRegistry(api, this.cdp, {preferredWindowId});
    this.injected = new InjectedScripts(this.cdp);
    this.selectors = new SelectorEngine(this.cdp, this.injected);
    this.removeCloseListener = api.addCloseListener(() => {
      this.transportClosed = true;
      return this.dispose();
    });
    api.detachTurn = stillCurrent => this.tabs.endTurn(stillCurrent);
  }

  api;
  browserId;
  clientInfo;
  cdp;
  tabs;
  injected;
  selectors;
  removeCloseListener;
  transportClosed = false;
  disposePromise;

  getCurrentSessionId() { return this.api.getCurrentSessionId(); }

  async dispose() {
    this.disposePromise ??= (async () => {
      this.removeCloseListener();
      this.api.detachTurn = undefined;
      await this.cdp.detachAllTabs();
      if (!this.transportClosed) await this.api.close();
    })();
    await this.disposePromise;
  }
}
