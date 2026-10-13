// A Chrome stand-in for the selector engine's tests: tabs and out-of-process frames whose documents are small fake
// DOMs, isolated worlds that run the service's expressions for real in node:vm contexts, and the remote objects the
// DevTools protocol hands out (objectIds, backendNodeIds). It answers the CDP methods src/browser-service/injected.mjs
// and selectors.mjs send (Page.getFrameTree, Page.createIsolatedWorld, Runtime.evaluate / callFunctionOn /
// getProperties / releaseObject, DOM.describeNode / resolveNode, Target.getTargets) in the protocol's shapes, behind a
// backend API (the BackendApi surface CdpController uses), so the real controller routes every call.
//
// The InjectedScript the service installs is FAKE_INJECTED_SOURCE (passed to InjectedScripts as its source): the slice
// of Playwright's API the engine calls, over these DOMs. Selector grammar: parts joined by " >> "; a part is `#id`,
// `.class`, a tag name, `text=<substring>` or `nth=<n>`; a later part matches among the earlier part's descendants.
//
// The worlds behave as Chrome's do for these tests: Page.createIsolatedWorld returns the frame's context for the name
// until the frame's document changes; a frame element's contentWindow, read from an isolated world, is the child
// frame's window in the caller's world (a context of its own, made on first use); a cross-origin child's
// contentDocument is null and its window's document throws; an out-of-process child (its own target) the same.
import vm from 'node:vm';

export const FAKE_INJECTED_SOURCE = `var PlaywrightInjected = {InjectedScript: class FakeInjectedScript {
  constructor(window, options) { this.window = window; this.document = window.document; this.options = options; }
  parseSelector(selector) {
    if (typeof selector !== 'string' || selector.trim() === '') throw new Error('Malformed selector: ' + selector);
    return {parts: selector.split(' >> ').map(source => {
      const eq = source.indexOf('=');
      const named = eq > 0 && /^[a-z:-]+$/.test(source.slice(0, eq));
      return named ? {name: source.slice(0, eq), body: source.slice(eq + 1), source} : {name: 'css', body: source, source};
    })};
  }
  _matches(part, element) {
    if (part.name === 'text') return String(element.textContent ?? '').includes(part.body);
    if (part.name !== 'css') throw new Error('Unsupported selector engine: ' + part.name);
    const b = part.body;
    if (b.startsWith('#')) return element.id === b.slice(1);
    if (b.startsWith('.')) return element.classList.includes(b.slice(1));
    return element.localName === b;
  }
  querySelectorAll(parsed, root) {
    if (parsed.parts.some(p => p.name === 'internal:control')) throw new Error('enter-frame reached querySelectorAll');
    let scopes = [root];
    for (const part of parsed.parts) {
      if (part.name === 'nth') { scopes = scopes.slice(Number(part.body), Number(part.body) + 1); continue; }
      const found = [];
      for (const scope of scopes) for (const element of scope.descendants()) if (this._matches(part, element) && !found.includes(element)) found.push(element);
      scopes = found;
    }
    return scopes;
  }
  elementState(element, state) {
    if (!element.isConnected) return {matches: false, received: 'error:notconnected'};
    if (state === 'visible') return {matches: element.visible, received: element.visible ? 'visible' : 'hidden'};
    if (state === 'enabled') return {matches: !element.disabled, received: element.disabled ? 'disabled' : 'enabled'};
    throw new Error('Unexpected element state: ' + state);
  }
  strictModeViolationError(parsed, matches) {
    const error = new Error('strict mode violation: ' + parsed.parts.map(p => p.source).join(' >> ') + ' resolved to ' + matches.length + ' elements');
    delete error.stack;
    return error;
  }
  checkDeprecatedSelectorUsage() {}
}};`;

let nextBackendNodeId = 100;

class FakeElement {
  constructor(localName, {id = '', cls = [], text = '', visible = true, disabled = false, attrs = {}, children = []} = {}) {
    this.localName = localName;
    this.tagName = localName.toUpperCase();
    this.id = id;
    this.classList = Array.isArray(cls) ? cls : [cls];
    this.ownText = text;
    this.visible = visible;
    this.disabled = disabled;
    this.attrs = {...attrs, ...(id ? {id} : {})};
    this.children = children;
    this.backendNodeId = nextBackendNodeId++;
    this.ownerDocument = null;
    this.connected = true;
    for (const child of children) child.parent = this;
  }
  get isConnected() { return this.connected && this.ownerDocument != null; }
  get textContent() { return this.ownText + this.children.map(c => c.textContent).join(''); }
  get innerText() { return this.visible ? this.textContent : ''; }
  getAttribute(name) { return Object.hasOwn(this.attrs, name) ? String(this.attrs[name]) : null; }
  *descendants() { for (const child of this.children) { yield child; yield* child.descendants(); } }
  scrollIntoView() {}
  getBoundingClientRect() { return {left: 10, top: 20, width: 300, height: 150}; }
  get clientWidth() { return 300; }
  get clientHeight() { return 150; }
}

class FakeDocument {
  constructor(frame, elements) {
    this.frame = frame;
    this.body = new FakeElement('body', {children: elements});
    this.adopt(this.body);
  }
  adopt(element) {
    element.ownerDocument = this;
    for (const child of element.children) this.adopt(child);
  }
  get defaultView() { return {frameElement: this.frame.frameElement, document: this}; }
  *descendants() { yield this.body; yield* this.body.descendants(); }
}

export const el = (localName, options) => new FakeElement(localName, options);

// A frame element; `frame` is the child's {id, url, access: 'same' | 'cross' | 'oopif', elements}.
export function iframe({id = '', name = '', visible = true, frame}) {
  const element = new FakeElement('iframe', {id, visible, attrs: {...(name ? {name} : {})}});
  element.name = name;
  element.src = frame.url;
  element.childFrameSpec = frame;
  return element;
}

// -> {api, browser}: `api` the backend API for a CdpController; `browser` the pages, worlds and objects behind it.
export function pageWorld() {
  const listeners = {onCDPEvent: [], onCDPDetach: []};
  const calls = [];
  const processes = new Map();           // key -> {key, tabId, rootFrameId, frames: Map(frameId -> frame)}
  const contexts = new Map();            // executionContextId -> {id, frame, worldName, global, context}
  const objects = new Map();             // objectId -> {value, ctx}
  let nextContextId = 1;
  let nextObjectId = 1;
  let currentWorld = null;               // the world of the running evaluation (contentWindow reads use it)
  const failures = [];

  const processKey = target => target.sessionId ?? target.targetId ?? `tab:${target.tabId}`;
  const processOf = target => {
    const process = processes.get(processKey(target));
    if (process == null) throw new Error(`No target ${JSON.stringify(target)}`);
    return process;
  };

  function buildFrame(process, spec, parentFrameId, frameElement) {
    const frame = {id: spec.id, url: spec.url ?? 'https://fixture.test/', name: frameElement?.name ?? '', parentFrameId,
      frameElement, access: spec.access ?? 'same', process, worlds: new Map(), loader: 1};
    frame.document = new FakeDocument(frame, spec.elements ?? []);
    process.frames.set(frame.id, frame);
    wireChildFrames(process, frame);
    return frame;
  }

  function wireChildFrames(process, frame) {
    for (const element of frame.document.descendants()) {
      const spec = element.childFrameSpec;
      if (spec == null) continue;
      element.contentFrameId = spec.id;
      if (spec.access === 'oopif') {
        const child = {key: spec.id, tabId: process.tabId, rootFrameId: spec.id, frames: new Map()};
        processes.set(child.key, child);
        buildFrame(child, spec, frame.id, element);
        Object.defineProperty(element, 'contentDocument', {get: () => null, configurable: true});
        Object.defineProperty(element, 'contentWindow', {get: () => ({get document() { throw new Error('SecurityError: Blocked a frame from accessing a cross-origin frame.'); }}), configurable: true});
        continue;
      }
      const child = buildFrame(process, spec, frame.id, element);
      Object.defineProperty(element, 'contentDocument', {get: () => (child.access === 'cross' ? null : child.document), configurable: true});
      Object.defineProperty(element, 'contentWindow', {configurable: true, get: () => {
        if (child.access === 'cross') return {get document() { throw new Error('SecurityError: Blocked a frame from accessing a cross-origin frame.'); }};
        return worldOf(child, `${String(currentWorld).replace(/\/via-parent$/, '')}/via-parent`).global;
      }});
    }
  }

  function worldOf(frame, worldName) {
    let ctx = frame.worlds.get(worldName);
    if (ctx == null) {
      const global = {document: frame.document};
      global.window = global;
      ctx = {id: nextContextId++, frame, worldName, global, context: vm.createContext(global)};
      frame.worlds.set(worldName, ctx);
      contexts.set(ctx.id, ctx);
    }
    return ctx;
  }

  function dropFrame(frame) {
    for (const ctx of frame.worlds.values()) contexts.delete(ctx.id);
    frame.worlds.clear();
    for (const child of [...frame.process.frames.values()]) if (child.parentFrameId === frame.id) { frame.process.frames.delete(child.id); dropFrame(child); }
    for (const process of [...processes.values()]) if (process.rootFrameId !== frame.process.rootFrameId && process.frames.get(process.rootFrameId)?.parentFrameId === frame.id) processes.delete(process.key);
  }

  const register = (value, ctx, group) => {
    const objectId = `obj-${nextObjectId++}`;
    objects.set(objectId, {value, ctx, group});
    return objectId;
  };

  function remote(value, ctx, byValue, group) {
    if (value === undefined) return {type: 'undefined'};
    if (value === null) return {type: 'object', subtype: 'null', value: null};
    if (byValue || typeof value !== 'object') return {type: typeof value, value: JSON.parse(JSON.stringify(value))};
    return {type: 'object', ...(value instanceof FakeElement ? {subtype: 'node'} : Array.isArray(value) ? {subtype: 'array'} : {}), objectId: register(value, ctx, group)};
  }

  async function run(ctx, work, byValue, group) {
    try {
      const previous = currentWorld;
      currentWorld = ctx.worldName;
      let value;
      try { value = work(); } finally { currentWorld = previous; }
      value = await value;
      return {result: remote(value, ctx, byValue, group)};
    } catch (error) {
      const description = `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`;
      const exception = {type: 'object', subtype: 'error', description, objectId: register(error, ctx, group)};
      return {result: exception, exceptionDetails: {exceptionId: 1, text: 'Uncaught', lineNumber: 0, columnNumber: 0, exception}};
    }
  }

  function frameTree(process, frame) {
    const children = [...process.frames.values()].filter(f => f.parentFrameId === frame.id);
    return {frame: {id: frame.id, loaderId: `L${frame.loader}`, url: frame.url, ...(frame.name ? {name: frame.name} : {}),
      ...(frame.parentFrameId ? {parentId: frame.parentFrameId} : {})}, ...(children.length ? {childFrames: children.map(c => frameTree(process, c))} : {})};
  }

  const handlers = {
    'Page.getFrameTree': (target) => {
      const process = processOf(target);
      return {frameTree: frameTree(process, process.frames.get(process.rootFrameId))};
    },
    'Page.createIsolatedWorld': (target, {frameId, worldName}) => {
      const frame = processOf(target).frames.get(frameId);
      if (frame == null) throw new Error('No frame for given id found');
      return {executionContextId: worldOf(frame, worldName).id};
    },
    'Runtime.evaluate': async (target, params) => {
      const ctx = contexts.get(params.contextId);
      if (ctx == null || ctx.frame.process !== processOf(target)) throw new Error('Cannot find context with specified id');
      ctx.evaluations = (ctx.evaluations ?? 0) + 1;
      return await run(ctx, () => vm.runInContext(params.expression, ctx.context), params.returnByValue === true, params.objectGroup);
    },
    'Runtime.callFunctionOn': async (target, params) => {
      const object = objects.get(params.objectId);
      if (object == null) throw new Error('Could not find object with given id');
      const args = (params.arguments ?? []).map(a => (a.objectId != null ? objects.get(a.objectId)?.value : a.value));
      return await run(object.ctx, () => vm.runInContext(`(${params.functionDeclaration})`, object.ctx.context).apply(object.value, args), params.returnByValue === true);
    },
    'Runtime.getProperties': (target, {objectId}) => {
      const object = objects.get(objectId);
      if (object == null) throw new Error('Could not find object with given id');
      // The properties' objects join the object's group, as V8's do.
      return {result: Object.keys(object.value).map(name => ({name, value: remote(object.value[name], object.ctx, false, object.group), enumerable: true}))};
    },
    'Runtime.releaseObject': (target, {objectId}) => { objects.delete(objectId); return {}; },
    'Runtime.releaseObjectGroup': (target, {objectGroup}) => {
      for (const [objectId, object] of objects) if (object.group === objectGroup) objects.delete(objectId);
      return {};
    },
    'DOM.describeNode': (target, {objectId}) => {
      const element = objects.get(objectId)?.value;
      if (!(element instanceof FakeElement)) throw new Error('Could not find node with given id');
      return {node: {nodeId: 0, backendNodeId: element.backendNodeId, nodeName: element.tagName, localName: element.localName,
        ...(element.contentFrameId ? {frameId: element.contentFrameId} : {})}};
    },
    'DOM.resolveNode': (target, {backendNodeId, executionContextId}) => {
      const process = processOf(target);
      for (const frame of process.frames.values()) {
        for (const element of frame.document.descendants()) {
          if (element.backendNodeId !== backendNodeId) continue;
          const ctx = executionContextId == null ? worldOf(frame, '') : contexts.get(executionContextId);
          if (ctx == null) throw new Error('Cannot find context with specified id');
          return {object: {type: 'object', subtype: 'node', objectId: register(element, ctx)}};
        }
      }
      throw new Error('No node with given id found');
    },
    'Target.getTargets': (target) => ({targetInfos: [
      {targetId: `PAGE-${target.tabId}`, type: 'page', url: 'https://fixture.test/', attached: true, tabId: target.tabId},
      ...[...processes.values()].filter(p => p.tabId === target.tabId && !p.key.startsWith('tab:'))
        .map(p => ({targetId: p.rootFrameId, type: 'iframe', url: p.frames.get(p.rootFrameId).url, attached: false})),
    ]}),
  };

  const browser = {
    calls, contexts, objects, processes,
    // A tab whose main frame `frameId` holds `elements` (and frames, through iframe()).
    tab(tabId, {frameId = `MAIN-${tabId}`, url = 'https://fixture.test/', elements = []} = {}) {
      const process = {key: `tab:${tabId}`, tabId, rootFrameId: frameId, frames: new Map()};
      processes.set(process.key, process);
      buildFrame(process, {id: frameId, url, elements}, undefined, null);
      return browser;
    },
    frame(frameId) {
      for (const process of processes.values()) if (process.frames.has(frameId)) return process.frames.get(frameId);
      throw new Error(`no frame ${frameId}`);
    },
    // The frame's document replaced (its contexts destroyed, its child frames gone); Chrome's Page.frameNavigated sent
    // from `source` unless `silent`.
    navigate(frameId, {elements = [], url, source, silent = false} = {}) {
      const frame = browser.frame(frameId);
      dropFrame(frame);
      frame.loader += 1;
      if (url) frame.url = url;
      frame.document = new FakeDocument(frame, elements);
      wireChildFrames(frame.process, frame);
      if (!silent) browser.event(source ?? {tabId: frame.process.tabId}, 'Page.frameNavigated',
        {frame: {id: frame.id, loaderId: `L${frame.loader}`, url: frame.url, ...(frame.parentFrameId ? {parentId: frame.parentFrameId} : {})}, type: 'Navigation'});
    },
    // Every context of the frame destroyed without an event (Chrome's "Cannot find context" race).
    destroyContexts(frameId) {
      const frame = browser.frame(frameId);
      for (const ctx of frame.worlds.values()) contexts.delete(ctx.id);
      frame.worlds.clear();
    },
    // `method`'s next `times` calls reject with `message`.
    fail(method, message, times = 1) { failures.push({method, message, times}); },
    // A world's global object, by frame and name (for asserting what an expression installed).
    world(frameId, worldName) { return browser.frame(frameId).worlds.get(worldName); },
    event(source, method, params) { for (const l of listeners.onCDPEvent) l({source, method, params}); },
    cdpCalls: () => calls.filter(c => c.op === 'executeCdp').map(c => c.method),
  };

  const api = {
    addEventListener(name, handler) { listeners[name].push(handler); return () => {}; },
    async attach(tabId) { calls.push({op: 'attach', tabId}); return {}; },
    async detach(tabId) { calls.push({op: 'detach', tabId}); return {}; },
    async attachTarget(tabId, targetId) {
      calls.push({op: 'attachTarget', tabId, targetId});
      if (!processes.has(targetId)) throw new Error(`No target with given id ${targetId}`);
      return {};
    },
    async detachTarget(tabId, targetId) { calls.push({op: 'detachTarget', tabId, targetId}); return {}; },
    async getCommittedTabUrl() { return 'https://fixture.test/'; },
    async executeCdp({target, method, commandParams, timeoutMs}) {
      calls.push({op: 'executeCdp', target, method, params: commandParams, timeoutMs});
      await new Promise(resolve => setImmediate(resolve));
      const i = failures.findIndex(f => f.method === method && f.times > 0);
      if (i >= 0) { failures[i].times--; throw new Error(failures[i].message); }
      const handler = handlers[method];
      return handler == null ? {} : await handler(target, commandParams ?? {});
    },
  };
  return {api, browser};
}
