// Ported from readable chatgpt-26.928.40906 BS:64664-64840 (class rh, the service's state for one backend); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
//
// One BrowserSession per backend connection, made the first time a command names its browser: the backend's CDP
// controller (cdp.mjs), its tabs (tabs.mjs), the locator engine over the controller (the injected script's
// installation, injected.mjs, and selector resolution, selectors.mjs), the page's evaluate (evaluate.mjs), the
// visible-DOM listing with its node ids (visible-dom.mjs), the agent's cursor (cursor.mjs), the virtual clipboard
// (clipboard.mjs) and the pointer and key input the actions dispatch through (input.mjs), on this machine's platform
// (keys: ControlOrMeta, the macOS editing commands). It hooks the turn's end into the backend API (the turn's tabs are
// detached before the host hears turnEnded) and disposes itself when the connection closes. The later milestones add
// their parts here (downloads, the clipboard's page bridge, ...). Dropped from rh: the credential observation gate, the
// security and preferences objects (no site policy, no Codex config), the orbit session follow, site instructions and
// the AX tree.
import {CdpController} from './cdp.mjs';
import {Clipboard} from './clipboard.mjs';
import {Cursor} from './cursor.mjs';
import {PageEvaluator} from './evaluate.mjs';
import {InjectedScripts} from './injected.mjs';
import {CuaInput} from './input.mjs';
import {PLATFORM} from './keyboard.mjs';
import {SelectorEngine} from './selectors.mjs';
import {TabRegistry} from './tabs.mjs';
import {VisibleDom} from './visible-dom.mjs';

export class BrowserSession {
  // `api` the backend's BackendApi, `browserId` the id the service lists it under, `clientInfo` its getInfo answer.
  constructor(api, browserId, clientInfo, {preferredWindowId, platform = PLATFORM} = {}) {
    this.api = api;
    this.browserId = browserId;
    this.clientInfo = clientInfo;
    this.cdp = new CdpController(api);
    this.tabs = new TabRegistry(api, this.cdp, {preferredWindowId});
    this.injected = new InjectedScripts(this.cdp);
    this.selectors = new SelectorEngine(this.cdp, this.injected);
    this.evaluator = new PageEvaluator(this.cdp, this.selectors);
    this.visibleDom = new VisibleDom(this.cdp);
    this.platform = platform;
    this.cursor = new Cursor(api);
    this.clipboard = new Clipboard();
    this.input = new CuaInput(this.cdp, this.cursor, this.visibleDom, {platform});
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
  evaluator;
  visibleDom;
  platform;
  cursor;
  clipboard;
  input;
  removeCloseListener;
  transportClosed = false;
  disposePromise;

  getCurrentSessionId() { return this.api.getCurrentSessionId(); }

  async dispose() {
    this.disposePromise ??= (async () => {
      this.removeCloseListener();
      this.api.detachTurn = undefined;
      this.clipboard.dispose();
      await this.cdp.detachAllTabs();
      if (!this.transportClosed) await this.api.close();
    })();
    await this.disposePromise;
  }
}
