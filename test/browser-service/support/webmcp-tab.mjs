// A tab with Chrome's native WebMCP for the WebMCP tests (src/browser-service/webmcp.mjs): frames whose documents hold
// a modelContext of tools, in the tab's process or out of it, and a CDP controller stand-in that answers the methods the
// WebMCP classes send, running each Runtime.evaluate for real in a node:vm world of the frame it names, behind a
// session double that announces `webmcp` (by default) and records the backend's webMcpToolInvoked notifications.
import vm from 'node:vm';
import {Emitter} from '../../../src/browser-service/cdp.mjs';
import {WEBMCP_HANDLERS, WebMcp} from '../../../src/browser-service/webmcp.mjs';

// A frame: its document's modelContext holds `tools` ({name, title?, description?, inputSchema, annotations?, run(input)});
// each isolated world made in it is a node:vm context whose globals reach that document.
export function frame(id, url, {secure = true, localhost = false, parentId, tools = []} = {}) {
  const origin = new URL(url).origin;
  const window = {};
  const listeners = [];
  const modelContext = {
    async getTools() { return this.tools.map(tool => ({...tool, window, origin})); },
    // Chrome's two-argument form: the input arrives as JSON text.
    async executeTool(tool, inputJson) {
      const found = this.tools.find(t => t.name === tool.name);
      return await found.run(JSON.parse(inputJson));
    },
    addEventListener(type, listener) { listeners.push(listener); },
    tools,
  };
  return {
    id, url, parentId, origin, window, modelContext,
    changeTools(next) { modelContext.tools = next; for (const listener of listeners) listener(); },
    info: {id, url, parentId, loaderId: `L-${id}`, securityOrigin: origin, secureContextType: secure ? 'Secure' : 'InsecureScheme',
      ...(localhost ? {securityOriginDetails: {isLocalhost: true}} : {})},
  };
}

// The tab: a top frame with child frames in its process, and out-of-process frames each a target of its own; a CDP
// controller stand-in that records every call and runs Runtime.evaluate in the world it names.
export function webMcpTab({frames, oopifs = {}, capabilities = [{id: 'webmcp'}]} = {}) {
  const [top, ...children] = frames;
  const calls = [], notifications = [];
  const worlds = new Map();             // executionContextId -> {context, frame}
  let nextContext = 1;
  const frameOf = (target, frameId) => (target.targetId != null ? oopifs[target.targetId] : [top, ...children].find(f => f.id === frameId));
  const tree = root => ({frame: root.info, childFrames: root === top ? children.map(child => ({frame: child.info})) : undefined});
  const cdp = new Emitter();
  cdp.cleanupHandlers = new Set();
  cdp.addTabCleanupHandler = handler => { cdp.cleanupHandlers.add(handler); return () => cdp.cleanupHandlers.delete(handler); };
  cdp.call = (tabId, method, params, options) => cdp.callTarget({tabId}, method, params, options);
  cdp.targetForFrameOrAttach = async (tabId, frameId) => { calls.push({method: 'attach', frameId}); return oopifs[frameId] ? {tabId, targetId: frameId} : null; };
  cdp.callTarget = async (target, method, params, options = {}) => {
    calls.push({target, method, params});
    switch (method) {
      case 'Page.getFrameTree': return {frameTree: tree(target.targetId != null ? oopifs[target.targetId] : top)};
      case 'Target.getTargets': return {targetInfos: [{targetId: 'page', type: 'page'}, ...Object.keys(oopifs).map(targetId => ({targetId, type: 'iframe', tabId: target.tabId}))]};
      case 'DOM.getFrameOwner':
        if (target.targetId == null && oopifs[params.frameId]) return {backendNodeId: 9};
        throw new Error('Frame with the given id was not found.');
      case 'WebMCP.enable': return {};
      case 'Page.createIsolatedWorld': {
        const f = frameOf(target, params.frameId);
        const context = vm.createContext({window: f.window, document: {modelContext: f.modelContext}, origin: f.origin, crypto, AbortSignal, JSON, Reflect, Map, Error});
        const executionContextId = nextContext++;
        worlds.set(executionContextId, {context, frame: f, worldName: params.worldName, grant: params.grantUniveralAccess});
        return {executionContextId};
      }
      case 'Runtime.evaluate': {
        options.beforeDispatch?.();
        try {
          return {result: {type: 'object', value: structuredClone(await vm.runInContext(params.expression, worlds.get(params.contextId).context))}};
        } catch (error) {
          return {exceptionDetails: {text: 'Uncaught', exception: {description: `Error: ${error.message}`}}};
        }
      }
      default: throw new Error(`unexpected ${method}`);
    }
  };
  let sessionId = 'session-a';
  const session = {
    cdp, capabilities: {browser: [], tab: capabilities}, clientInfo: {name: 'MAWS'},
    getCurrentSessionId: () => sessionId,
    requestMeta: () => ({callId: 'call-7'}),
    api: {
      sendWebMcpToolInvoked(params) { notifications.push(params); },
      pageEvents: [], takePageEvents() { return this.pageEvents.splice(0); }, matchesCurrentSessionId: id => id === sessionId,
    },
    tabs: {events: [], takeEvents() { return this.events.splice(0); }},
  };
  session.webmcp = new WebMcp(session);
  const run = (type, params = {}) => WEBMCP_HANDLERS[type]({browser_id: 'b', tab_id: '5', ...params}, session);
  const event = (method, params, source = {tabId: 5}) => cdp.emit('event', {method, params, source});
  return {session, calls, worlds, notifications, run, event, setSession: id => { sessionId = id; }};
}
