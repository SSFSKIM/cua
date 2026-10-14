// Ported from readable chatgpt-26.928.40906 BS:46309-46905 (the WebMCP classes: Xt, zB, Jt, Jm, Lr, KB, XB, GB, JB, YB, GX, ZB, Zs, eO, tO, Qs, Ym, Zm, Av, ea, Qm, ef, tf, rO, and the commands hc and nO); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: the browser notifications qN, jN, Bee and HN (BS:65896-66000); ri (BS:35351-35385); the dispatch's invoke
// check and webMcpToolInvoked notification (BS:66380-66392, BS:66419-66425); uh.sendWebMcpToolInvoked
// (BS:67847-67852); YT and JT (BS:10519-10530); the result schema qE (BS:32262-32281); Eo (BS:10537-10539).
//
// tab.capabilities.get("webmcp"), for a backend that announces the tab capability `webmcp` (cua's host does not, so on
// its route both commands are refused as the vendor refuses them there and the model never sees the capability). The
// tools a page registers with Chrome's native WebMCP (document.modelContext, the WebMCP CDP domain) are read per
// secure frame, its out-of-process frames included, by a script in an isolated world of each frame (webmcp-page.mjs),
// each under a registration id bound to the exact registration and to a generation of the tab: any change of the
// tab's frames, worlds or tools (WebMCP.toolsAdded/Removed, a navigation, a detach) starts a new generation, and a
// tool of an older one is refused as stale ("Call fetchTools() again"), never invoked. A page whose tools exceed the
// vendor's limits (100 tools, 64 KiB of descriptors, 10 registration changes per document) has WebMCP disabled until
// it navigates. After each cell, the tabs whose tools changed, or that the session has not seen yet, are listed in a
// "Browser notifications" content item, as the vendor does. Invoking a tool tells the backend (webMcpToolInvoked).
// Changed: the gate is the backend's announcement as the session holds it (less the launch's disabled capabilities),
// where the vendor asks getInfo again and reads its Codex config switch (webmcp_enabled); the limits are the vendor's
// defaults, where it reads them from its Statsig config; the isolated world is named cua-browser-webmcp-<uuid>; a
// listed tool of the wrong shape fails with a sentence of cua's own, where the vendor's schema check throws its
// ZodError. Dropped: the per-tool approval prompt and Auto-review (DI, the webmcp-tool-call check), telemetry
// (recordCommand's WebMCP calls), the model check of the runtime (`-luna`) and the credential observation gate.
import {Deadline} from './budgets.mjs';
import {BrowserServiceError} from './errors.mjs';
import {tabIdOf} from './tabs.mjs';
import {WEBMCP_PAGE_SCRIPT} from './webmcp-page.mjs';

export const STALE = 'WebMCP tool registration is stale. Call fetchTools() again.';                                 // Xt
const OVER_LIMITS = 'WebMCP is disabled for this page because the site’s WebMCP configuration exceeds supported limits. After correcting the configuration, reset NodeREPL and refresh the browser tab to retry.';  // Qs
const LIMITS = Object.freeze({maxTools: 100, maxTotalDescriptorBytes: 65536, maxRegistrationChanges: 10});            // Zs
const READ_TOOLS_MS = 10000;                                                                                          // zX
const NOTIFICATIONS_MS = 10000;                                                                                       // HN's 10 s
const LIST = 'webmcp_list_tools', INVOKE = 'webmcp_invoke_tool';

let lastGeneration = 0;                                                                                               // VB

const messageOf = error => (error instanceof Error ? error.message : String(error));
const byteLength = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;                              // tO

// A command target's events: the target itself, matched by session, target or the top document (GB).
function sameTarget(target, source) {
  if (target.tabId !== source.tabId) return false;
  if (target.sessionId != null) return target.sessionId === source.sessionId;
  if (target.targetId != null) return target.targetId === source.targetId;
  return source.sessionId == null && source.targetId == null;
}

// A tool as the model is shown it (ri).
export function modelTool(tool) {
  return {
    name: tool.name, call_name: tool.call_name,
    ...(tool.title == null ? {} : {title: tool.title}),
    ...(tool.description == null ? {} : {description: tool.description}),
    inputSchema: tool.input_schema,
    ...(tool.annotations == null ? {} : {annotations: tool.annotations}),
    ...(tool.origin == null ? {} : {origin: tool.origin}),
    ...(tool.pageUrl == null ? {} : {pageUrl: tool.pageUrl}),
  };
}

// The comparable description of a tool list (tf).
function toolsSnapshot(tools) {
  return JSON.stringify(tools.map(tool => ({
    name: tool.name,
    ...(tool.title == null ? {} : {title: tool.title}),
    ...(tool.description == null ? {} : {description: tool.description}),
    inputSchema: tool.input_schema,
    ...(tool.annotations == null ? {} : {annotations: tool.annotations}),
    ...(tool.origin == null ? {} : {origin: tool.origin}),
  })));
}

// A listed tool in the result's shape (qE): the known fields, each of its type.
const HINTS = ['readOnlyHint', 'untrustedContentHint', 'consequentialHint'];
function resultTool(tool) {
  const string = value => typeof value === 'string';
  const optional = (value, check) => value === undefined || check(value);
  const annotations = tool?.annotations;
  const valid = tool != null && typeof tool === 'object' && string(tool.name) && string(tool.call_name) && string(tool.registration_id)
    && optional(tool.title, string) && optional(tool.description, string) && optional(tool.origin, string) && optional(tool.pageUrl, string)
    && optional(annotations, a => a != null && typeof a === 'object' && !Array.isArray(a) && HINTS.every(h => optional(a[h], v => typeof v === 'boolean')));
  if (!valid) throw new Error('WebMCP fetchTools returned an invalid tool.');
  const out = {name: tool.name, call_name: tool.call_name, registration_id: tool.registration_id};
  for (const key of ['title', 'description']) if (tool[key] !== undefined) out[key] = tool[key];
  out.input_schema = tool.input_schema;
  if (annotations !== undefined) out.annotations = Object.fromEntries(HINTS.filter(h => annotations[h] !== undefined).map(h => [h, annotations[h]]));
  for (const key of ['origin', 'pageUrl']) if (tool[key] !== undefined) out[key] = tool[key];
  return out;
}

// "WebMCP tools are available in tab <id>:" and the tools as the model calls them (Bee).
function availableTools(tabId, tools) {
  return [`WebMCP tools are available in tab ${tabId}:`, '', '```json',
    JSON.stringify(tools.map(modelTool).map(({call_name: callName, ...rest}) => ({...rest, name: callName}))), '```'].join('\n');
}

const isWebMcpChanged = event => event.version === 1 && event.type === 'webmcp_changed' && Number.isInteger(event.tabId) && event.tabId > 0;  // YT

// One session's WebMCP: per tab, the tracked frames, worlds and registrations of the current generation (the vendor's
// Xm, keyed by the controller) and the tools each browser session was last shown (its fc, keyed by the context).
export class WebMcp {
  // `session` a BrowserSession: its cdp, api, capabilities and clientInfo.
  constructor(session) {
    this.session = session;
    this.cdp = session.cdp;
    this.cdp.on('event', event => this.observe(event));
    const forget = tabId => {
      const tracked = this.tracked.get(tabId);
      if (tracked != null) this.newGeneration(tracked);
      this.tracked.delete(tabId);
    };
    this.cdp.on('tabDetached', forget);
    this.cdp.addTabCleanupHandler(forget);
  }

  session;
  cdp;
  tracked = new Map();           // tabId -> {generation, worldName, worlds, registrations, observedTargets, notifiedGenerations, frameSnapshot?}
  pages = new Map();             // tabId -> {toolsBySession, registrationChanges, disabled, snapshot?}  (rO)

  // A tab's tracking, made on first use (Jt).
  trackedTab(tabId) {
    let tracked = this.tracked.get(tabId);
    if (tracked == null) {
      tracked = {generation: ++lastGeneration, worldName: `cua-browser-webmcp-${crypto.randomUUID()}`, worlds: new Map(),
        registrations: new Map(), observedTargets: new Map(), notifiedGenerations: new Map()};
      this.tracked.set(tabId, tracked);
    }
    return tracked;
  }

  newGeneration(tracked) {                                                                                           // KB
    tracked.generation = ++lastGeneration;
    tracked.worlds.clear();
    tracked.registrations.clear();
  }

  // Jt's event listener, and rO's: a change in a tracked world or frame ends the generation; a main-frame navigation
  // gives the page a fresh start against its limits.
  observe(event) {
    const tabId = event.source.tabId;
    const tracked = this.tracked.get(tabId);
    if (tracked != null) {
      const source = event.method === 'Target.detachedFromTarget' ? {tabId, sessionId: event.params.sessionId, targetId: event.params.targetId} : event.source;
      const worlds = [...tracked.worlds.values()];
      if (['WebMCP.toolsAdded', 'WebMCP.toolsRemoved', 'Runtime.executionContextsCleared', 'Target.detachedFromTarget'].includes(event.method)
        && worlds.some(world => sameTarget(world.target, source))) this.newGeneration(tracked);
      if (event.method === 'Runtime.executionContextDestroyed'
        && worlds.some(world => sameTarget(world.target, event.source) && world.executionContextId === event.params.executionContextId)) this.newGeneration(tracked);
      if (['Page.frameNavigated', 'Page.frameAttached', 'Page.frameDetached', 'Page.documentOpened'].includes(event.method)) this.newGeneration(tracked);
      if (event.method === 'Target.detachedFromTarget') {
        tracked.observedTargets.delete(event.params.sessionId);
        if (event.params.targetId != null) tracked.observedTargets.delete(event.params.targetId);
      }
    }
    if (event.method === 'Page.frameNavigated' && event.source.sessionId == null && event.source.targetId == null && event.params.frame.parentId == null) {
      const page = this.pages.get(tabId);
      if (page != null) Object.assign(page, {snapshot: undefined, registrationChanges: 0, disabled: false});
    }
  }

  page(tabId) {                                                                                                      // rO
    let page = this.pages.get(tabId);
    if (page == null) {
      page = {toolsBySession: new Map(), registrationChanges: 0, disabled: false};
      this.pages.set(tabId, page);
    }
    return page;
  }

  // The generation a step began in must still be current (Lr).
  static assertGeneration(tracked, generation) {
    if (tracked.generation !== generation) throw new Error(STALE);
  }

  // The backend offers WebMCP; else the vendor's refusal, the tools the sessions were shown forgotten (ea, Av).
  assertEnabled(type) {
    const {capabilities, clientInfo} = this.session;
    if (!capabilities.tab.some(capability => capability?.id === 'webmcp')) {
      for (const [tabId, page] of this.pages) {
        const tracked = this.trackedTab(tabId);
        for (const sessionId of page.toolsBySession.keys()) tracked.notifiedGenerations.delete(sessionId);
        page.toolsBySession.clear();
      }
      throw new BrowserServiceError('browser_capability_unavailable', `${clientInfo.name} does not support command "${type}".`);
    }
  }

  assertNotDisabled(tabId) {                                                                                         // Qm
    if (this.pages.get(tabId)?.disabled === true) throw new Error(OVER_LIMITS);
  }

  // The tool registration the current browser session was shown in the current generation, or undefined (ef).
  shownTool(tabId, registrationId) {
    const page = this.pages.get(tabId);
    if (page == null || page.disabled) return undefined;
    const shown = page.toolsBySession.get(this.session.getCurrentSessionId());
    return shown?.generation === this.trackedTab(tabId).generation ? shown.tools.find(tool => tool.registration_id === registrationId) : undefined;
  }

  // The tab's secure frames, each frame target observed with WebMCP.enable, out-of-process frames attached (Jm over zB).
  async frames(tabId, deadline) {
    const tracked = this.trackedTab(tabId);
    const generation = tracked.generation;
    const options = deadline == null ? {} : {deadline};
    const top = {tabId};
    const {frameTree} = await this.cdp.callTarget(top, 'Page.getFrameTree', undefined, options);
    const {targetInfos} = await this.cdp.call(tabId, 'Target.getTargets', undefined, options);
    const frameTargets = new Set(targetInfos
      .filter(info => (info.type === 'iframe' || (info.type === 'other' && typeof info.url === 'string')) && (info.tabId == null || info.tabId === tabId))
      .map(info => info.targetId));
    const pending = [{target: top, frameTree}];
    const frames = [];
    const identities = new Map();
    for (const {target, frameTree: tree} of pending) {
      await this.observeTarget(tracked, target, options);
      const queue = [tree];
      for (const {frame, childFrames} of queue) {
        identities.set(frame.id, JSON.stringify([frame.parentId, frame.loaderId, target.sessionId, target.targetId]));
        const secure = frame.secureContextType === 'Secure' || frame.secureContextType === 'SecureLocalhost';
        const origin = frame.securityOrigin;
        if (secure && ((origin === 'file://' && frame.url.startsWith('file://')) || origin.startsWith('https://')
          || (origin.startsWith('http://') && frame.securityOriginDetails?.isLocalhost === true))) {
          let fileUrl;
          if (origin === 'file://') {
            const url = new URL(frame.url);
            url.search = '';
            url.hash = '';
            fileUrl = url.href;
          }
          frames.push({target, frameId: frame.id, origin, fileUrl});
        }
        if (childFrames != null) queue.push(...childFrames);
      }
      // The frame targets this target owns: attached and walked in turn.
      const owned = await Promise.all([...frameTargets].map(async targetId => {
        try {
          await this.cdp.callTarget(target, 'DOM.getFrameOwner', {frameId: targetId}, options);
          return targetId;
        } catch (error) {
          if (/Frame with the given id (?:was not found|does not belong to the target)/.test(messageOf(error))) return null;
          throw error;
        }
      }));
      for (const targetId of owned) {
        if (targetId == null) continue;
        frameTargets.delete(targetId);
        const child = await this.cdp.targetForFrameOrAttach(tabId, targetId, options);
        if (child == null) throw new Error(STALE);
        const childTree = await this.cdp.callTarget(child, 'Page.getFrameTree', undefined, options);
        if (childTree.frameTree.frame.id !== targetId) throw new Error(STALE);
        pending.push({target: child, frameTree: childTree.frameTree});
      }
    }
    const snapshot = JSON.stringify([...identities].sort(([a], [b]) => a.localeCompare(b)));
    WebMcp.assertGeneration(tracked, generation);
    if (tracked.frameSnapshot != null && tracked.frameSnapshot !== snapshot) this.newGeneration(tracked);
    tracked.frameSnapshot = snapshot;
    return {frames, pageUrl: frameTree.frame.url || undefined};
  }

  // WebMCP.enable once per target of the tab, shared by concurrent callers, forgotten when it fails.
  async observeTarget(tracked, target, options) {
    const key = target.sessionId ?? target.targetId ?? 'top';
    let enabling = tracked.observedTargets.get(key);
    if (enabling == null) {
      enabling = this.cdp.callTarget(target, 'WebMCP.enable', undefined, options).then(() => {});
      tracked.observedTargets.set(key, enabling);
    }
    try {
      await enabling;
    } catch (error) {
      tracked.observedTargets.delete(key);
      throw error;
    }
  }

  // The frame's WebMCP world in the current generation, made once (GX).
  async world(frame, deadline) {
    const tracked = this.trackedTab(frame.target.tabId);
    const generation = tracked.generation;
    const known = tracked.worlds.get(frame.frameId);
    if (known != null) return known;
    const {executionContextId} = await this.cdp.callTarget(frame.target, 'Page.createIsolatedWorld',
      {frameId: frame.frameId, grantUniveralAccess: false, worldName: tracked.worldName}, deadline == null ? {} : {deadline});
    WebMcp.assertGeneration(tracked, generation);
    const world = {...frame, generation, executionContextId};
    tracked.worlds.set(frame.frameId, world);
    return world;
  }

  // Runs the page script's `call` in a world, dispatched only while the world's generation is current (ZB).
  async evaluate(world, call, timeoutMs, deadline) {
    const answer = await this.cdp.callTarget(world.target, 'Runtime.evaluate', {
      awaitPromise: true, contextId: world.executionContextId, expression: `${WEBMCP_PAGE_SCRIPT}\n${call}`, returnByValue: true, timeout: timeoutMs,
    }, {
      ...(timeoutMs === undefined ? {} : {timeoutMs}), ...(deadline == null ? {} : {deadline}),
      beforeDispatch: () => WebMcp.assertGeneration(this.trackedTab(world.target.tabId), world.generation),
    });
    if (answer.exceptionDetails != null) throw new Error(answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text);
    return answer.result.value;
  }

  // Every secure frame's tools in one generation (JB).
  async readTools(tabId, deadline) {
    const tracked = this.trackedTab(tabId);
    const {frames, pageUrl} = await this.frames(tabId, deadline);
    const generation = tracked.generation;
    const tools = (await Promise.all(frames.map(async frame => {
      const world = await this.world(frame, deadline);
      const listed = await this.evaluate(world, `webMcp.readTools(${JSON.stringify({generation, pageUrl, staleRegistrationError: STALE})})`, READ_TOOLS_MS, deadline);
      WebMcp.assertGeneration(tracked, generation);
      if (!Array.isArray(listed)) throw new Error('WebMCP fetchTools failed: no result returned.');
      for (const tool of listed) {
        if (typeof tool?.registration_id !== 'string' || tool.origin !== frame.origin) throw new Error('Invalid native WebMCP tool owner.');
        tracked.registrations.set(tool.registration_id, world);
        if (frame.fileUrl != null) tool.origin = frame.fileUrl;
      }
      return listed;
    }))).flat();
    await this.frames(tabId, deadline);
    WebMcp.assertGeneration(tracked, generation);
    return {generation, tools};
  }

  // The tab's tools within the page's limits, the page disabled when it exceeds them (Ym).
  async listTools(tabId, deadline) {
    this.assertEnabled(LIST);
    const page = this.page(tabId);
    if (page.disabled) throw new Error(OVER_LIMITS);
    const tracked = this.trackedTab(tabId);
    const {generation, tools: read} = await this.readTools(tabId, deadline);
    this.assertEnabled(LIST);
    if (page.disabled) throw new Error(OVER_LIMITS);
    WebMcp.assertGeneration(tracked, generation);
    if (read.length > LIMITS.maxTools) {
      page.disabled = true;
      throw new Error(OVER_LIMITS);
    }
    const tools = read.map(resultTool);
    if (byteLength(tools.map(tool => ({...modelTool(tool), call_name: undefined}))) > LIMITS.maxTotalDescriptorBytes) {
      page.disabled = true;
      throw new Error(OVER_LIMITS);
    }
    const snapshot = toolsSnapshot(tools);
    if (page.snapshot != null && page.snapshot !== snapshot && ++page.registrationChanges > LIMITS.maxRegistrationChanges) {
      page.disabled = true;
      throw new Error(OVER_LIMITS);
    }
    page.snapshot = snapshot;
    return {generation, tools};
  }

  // Records the tools the current browser session is shown; -> what it was shown before in this generation, 'stale'
  // when it was shown tools of an older one, else undefined (Zm).
  recordShown(tabId, listed) {
    const page = this.page(tabId);
    const tracked = this.trackedTab(tabId);
    WebMcp.assertGeneration(tracked, listed.generation);
    const sessionId = this.session.getCurrentSessionId();
    tracked.notifiedGenerations.set(sessionId, listed.generation);
    const previous = page.toolsBySession.get(sessionId);
    const before = previous?.generation === listed.generation ? previous.tools : undefined;
    page.toolsBySession.set(sessionId, {generation: listed.generation, tools: structuredClone(page.disabled ? [] : listed.tools)});
    if (before != null) return toolsSnapshot(before);
    return previous != null && previous.tools.length > 0 ? 'stale' : undefined;
  }

  // Runs a tool of the current generation (YB).
  async invokeTool(tabId, registrationId, input, timeoutMs) {
    const tracked = this.trackedTab(tabId);
    const world = tracked.registrations.get(registrationId);
    if (world == null) throw new Error(STALE);
    await this.frames(tabId);
    WebMcp.assertGeneration(tracked, world.generation);
    return await this.evaluate(world, `webMcp.invokeTool(${JSON.stringify({
      registrationId, generation: world.generation, inputJson: JSON.stringify(input ?? null), timeoutMs, staleRegistrationError: STALE,
    })})`, timeoutMs);
  }

  // The notification text for one tab, or '' (jN).
  async tabNotification(tabId, deadline, retry = true) {
    if (deadline.expired()) return '';
    try {
      this.assertEnabled(LIST);
      const listed = await this.listTools(tabId, deadline);
      if (deadline.expired()) return '';
      const shown = this.recordShown(tabId, listed);
      const {tools} = listed;
      if (shown === toolsSnapshot(tools) || (shown == null && tools.length === 0)) return '';
      return tools.length === 0 ? `WebMCP tools are no longer available in tab ${tabId}.` : availableTools(tabId, tools);
    } catch (error) {
      if (retry && messageOf(error).includes(STALE)) return await this.tabNotification(tabId, deadline, false);
      return '';
    }
  }

  // The notifications of the tabs whose tools changed (the backend's webmcp_changed page events), that the current
  // browser session has not been shown in their current generation, or that the turn acquired from the person (qN).
  async notifications(pageEvents, tabEvents, deadline) {
    const tabIds = new Set(pageEvents.filter(isWebMcpChanged).map(({tabId}) => tabId));
    const sessionId = this.session.getCurrentSessionId();
    for (const [tabId, tracked] of this.tracked) if (tracked.notifiedGenerations.get(sessionId) !== tracked.generation) tabIds.add(tabId);  // XB
    for (const event of tabEvents) if (event.type === 'tab_acquired' && event.origin === 'external') tabIds.add(event.tabId);
    return (await Promise.all([...tabIds].map(tabId => this.tabNotification(tabId, deadline)))).filter(text => text.length > 0);
  }
}

// The "Browser notifications" content item for the sessions that ran commands since the last cell, or '' (HN).
export async function browserNotifications(sessions) {
  const deadline = new Deadline(NOTIFICATIONS_MS);
  const items = [];
  for (const session of sessions) {
    const pageEvents = session.api.takePageEvents().filter(event => event.version === 1 && session.api.matchesCurrentSessionId(event.session_id));
    const tabEvents = session.tabs.takeEvents();
    items.push(...await session.webmcp.notifications(pageEvents, tabEvents, deadline));
  }
  return items.length === 0 ? '' : `Browser notifications:\n\n${items.join('\n\n')}\n`;
}

export const WEBMCP_HANDLERS = {
  async webmcp_list_tools(params, session) {                                                                         // nO
    const tabId = tabIdOf(params.tab_id);
    const listed = await session.webmcp.listTools(tabId);
    session.webmcp.recordShown(tabId, listed);
    return {tools: listed.tools};
  },

  async webmcp_invoke_tool(params, session) {                                                                        // the dispatch's check, then hc
    const tabId = tabIdOf(params.tab_id);
    const {webmcp} = session;
    webmcp.assertNotDisabled(tabId);
    const tool = webmcp.shownTool(tabId, params.registration_id);
    if (tool == null) throw new Error(STALE);
    session.api.sendWebMcpToolInvoked({parentCallId: session.requestMeta()?.callId, tabId, toolName: tool.name});
    webmcp.assertEnabled(INVOKE);
    webmcp.assertNotDisabled(tabId);
    if (webmcp.shownTool(tabId, params.registration_id) == null) throw new Error(STALE);
    const result = await webmcp.invokeTool(tabId, params.registration_id, params.input, params.timeout_ms);
    if (result !== null && typeof result !== 'string') throw new Error('WebMCP executeTool returned an invalid result.');
    return {result};
  },
};
