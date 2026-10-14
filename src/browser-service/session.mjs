// Ported from readable chatgpt-26.928.40906 BS:64664-64840 (class rh, the service's state for one backend); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
//
// One BrowserSession per backend connection, made the first time a command names its browser: the backend's CDP
// controller (cdp.mjs), the document responses its tabs pause and the downloads over them (downloads.mjs), its tabs
// (tabs.mjs), the locator engine over the controller (the injected script's installation, injected.mjs, and selector
// resolution, selectors.mjs), the page's evaluate (evaluate.mjs), the visible-DOM listing with its node ids
// (visible-dom.mjs), the agent's cursor (cursor.mjs), the virtual clipboard with its page bridges (clipboard.mjs), the
// pointer and key input the actions dispatch through (input.mjs), on this machine's platform (keys: ControlOrMeta,
// the macOS editing commands), each tab's console log (devlogs.mjs), the page asset inventories (assets.mjs), each
// tab's WebMCP tools (webmcp.mjs), and the filesystem the files a command returns are written to (filesystem.mjs);
// `requestMeta()` is the current call's request metadata from the node_repl runtime. `capabilities` are the ones the
// backend announced, less those the launch disabled (manifest.mjs browserCapabilities). It hooks the turn's end into the
// backend API (the page clipboard bridges removed, then the turn's tabs detached before the host hears turnEnded) and
// disposes itself when the connection closes. The later milestones add their parts here. Dropped from rh: the
// credential observation gate, the security and preferences objects (no site policy, no Codex config), the orbit
// session follow, site instructions and the AX tree.
import {PageAssets} from './assets.mjs';
import {CdpController} from './cdp.mjs';
import {Clipboard} from './clipboard.mjs';
import {Cursor} from './cursor.mjs';
import {DevLogs} from './devlogs.mjs';
import {DocumentResponses, Downloads} from './downloads.mjs';
import {PageEvaluator} from './evaluate.mjs';
import {LOCAL_FILESYSTEM} from './filesystem.mjs';
import {InjectedScripts} from './injected.mjs';
import {CuaInput} from './input.mjs';
import {PLATFORM} from './keyboard.mjs';
import {SelectorEngine} from './selectors.mjs';
import {TabRegistry} from './tabs.mjs';
import {VisibleDom} from './visible-dom.mjs';
import {WebMcp} from './webmcp.mjs';

export class BrowserSession {
  // `api` the backend's BackendApi, `browserId` the id the service lists it under, `clientInfo` its getInfo answer.
  constructor(api, browserId, clientInfo, {preferredWindowId, platform = PLATFORM, capabilities = clientInfo.capabilities, filesystem = LOCAL_FILESYSTEM, requestMeta = () => undefined} = {}) {
    this.api = api;
    this.browserId = browserId;
    this.clientInfo = clientInfo;
    this.capabilities = {browser: capabilities?.browser ?? [], tab: capabilities?.tab ?? []};
    this.filesystem = filesystem;
    this.requestMeta = requestMeta;
    this.cdp = new CdpController(api);
    this.dev = new DevLogs(this.cdp);
    this.documentResponses = new DocumentResponses(this.cdp);
    this.downloads = new Downloads(api, this.documentResponses);
    this.tabs = new TabRegistry(api, this.cdp, {preferredWindowId});
    this.injected = new InjectedScripts(this.cdp);
    this.selectors = new SelectorEngine(this.cdp, this.injected);
    this.evaluator = new PageEvaluator(this.cdp, this.selectors);
    this.visibleDom = new VisibleDom(this.cdp);
    this.platform = platform;
    this.cursor = new Cursor(api);
    this.clipboard = new Clipboard();
    this.input = new CuaInput(this.cdp, this.cursor, this.visibleDom, {platform});
    this.pageAssets = new PageAssets(this.cdp, filesystem);
    this.webmcp = new WebMcp(this);
    this.removeCloseListener = api.addCloseListener(() => {
      this.transportClosed = true;
      return this.dispose();
    });
    api.detachTurn = async stillCurrent => {
      await this.clipboard.cleanupPageClipboards();
      await this.tabs.endTurn(stillCurrent);
    };
  }

  api;
  browserId;
  clientInfo;
  capabilities;
  filesystem;
  requestMeta;
  cdp;
  dev;
  documentResponses;
  downloads;
  tabs;
  injected;
  selectors;
  evaluator;
  visibleDom;
  platform;
  cursor;
  clipboard;
  input;
  pageAssets;
  webmcp;
  removeCloseListener;
  transportClosed = false;
  disposePromise;

  getCurrentSessionId() { return this.api.getCurrentSessionId(); }

  async dispose() {
    this.disposePromise ??= (async () => {
      this.removeCloseListener();
      this.api.detachTurn = undefined;
      await this.clipboard.dispose();
      await this.cdp.detachAllTabs();
      if (!this.transportClosed) await this.api.close();
    })();
    await this.disposePromise;
  }
}
