// Ported from readable chatgpt-26.928.40906 BS:54717-56661 (class Pf, the locator orchestrator: its resolution half, resolvePlaywrightSelectorNode, evaluateOnPlaywrightNode, evaluateOnPlaywrightSelectorWithTarget, evaluateOnPlaywrightSelectorAll, evaluateOnPlaywrightPage, nodeForResolvedSelectorTarget, frameIdForElementObject, withPlaywrightNode, evaluateSingleSelectorInResolvedTarget, evaluateSelectorAllInTarget, resolveSelectorTarget, frameRouteForFirstOopif, frameIdForFrameMatch, targetForFrame and selectorScopeFunctions); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: aa, Zv, Q1, kf, e_, Cc, Sf, nZ, oZ and o_ (BS:56733-56906); Cf (BS:54703).
//
// Playwright selectors resolved the vendor's way: the injected script (injected.mjs) evaluates the selector in the
// page, in the world of the frame the resolution has reached. `>> internal:control=enter-frame >>` enters a frame: a
// same-process frame the page can reach is entered in the page itself (its window gets an injected script of its own);
// a frame the page cannot reach (cross-origin, or out of process) is entered through CDP: its frame id from the frame
// element, its own target when it is out of process (the controller attaches it), its own isolated world either way.
// A query matching several elements is a strict-mode violation unless exactly one of them is visible (the vendor's
// fallback; `strict: true` removes it). Resolution polls every 100 ms until the command's Deadline; a strict-mode
// violation and an open dialog (dialog_open, the M1a ruling) end it at once.
//
// The interface the reads, evaluate, snapshot and the actions build on, one SelectorEngine per CDP controller:
//   resolve(selector, frame, {deadline, strict}) -> ElementHandle (backendNodeId, frameId, target, oopifFrameChain)
//   resolveAll(selector, frame, {deadline}) -> {handles: ElementHandle[], target, frameId, oopifFrameChain, selector,
//     documentBackendNodeId}: every match (none is not an error) and the frame the query ran in, which evaluateAll
//     binds the user's callback to even when nothing matched
//   evaluateOnSelector(selector, frame, fn, {arg, deadline, strict}) -> {result, target, frameId, executionContextId,
//     oopifFrameChain}: fn(element, injected, arg, scope) in the page, resolution and call in one evaluation
//   evaluateOnSelectorAll(selector, frame, fn, {arg, deadline}) -> fn(elements, injected, arg)
//   evaluateInFrame(frame, fn, {arg, deadline}) -> fn(injected, arg), unpolled
//   ElementHandle.evaluate(fn, {arg, deadline}) -> fn(element, injected, arg) on the resolved element
// `frame` is a tab id or {tabId, sessionId? | targetId?, frameId?}; `deadline` defaults to the 3 s action budget, and
// a zero budget makes one attempt whose dispatches get the 3 s; `retry: false` makes one attempt. Functions run in the
// injected script's world: they must not close over anything in node, and no user script may be passed to them (they
// are retried; user code goes to the page's world by the handles' backend nodes, dispatched once).
//
// Departures from Pf: every frame's script lives in the isolated world (injected.mjs), so CDP routing always carries
// the frame id; a frame window's own injected script gets the root's credential check (the vendor's lacks it, and its
// reads then fail in same-process frames). Dropped: the in-app browser's frame content sizes, documentOnly (MCP-app
// documents), the bound selector and credential flows built on it, telemetry and command timing.
import {DEFAULT_ACTION_MS, Deadline} from './budgets.mjs';
import {BrowserServiceError} from './errors.mjs';
import {INJECTED_GLOBAL, INJECTED_OPTIONS, SELECTOR_DEADLINE_EXCEEDED, checkSelectorDeadline, pageError, remoteObjects, resultValue, targetKey} from './injected.mjs';

export const ENTER_FRAME = ' >> internal:control=enter-frame >> ';                                                    // Cc
export {SELECTOR_DEADLINE_EXCEEDED};
const FRAME_TARGET_UNAVAILABLE = 'Frame target is not available for this iframe selector path';                      // Cf
const POLL_MS = 100;

// --- in the page ------------------------------------------------------------------------------------------------------
// These run in the injected script's world, stringified into the expressions below (the vendor's aa and
// selectorScopeFunctions). They name `document` (the world's) and the prelude's constants.

function querySelectorStrictWithVisibleFallback(injected, parsedSelector, root, strict = false) {
  const matches = injected.querySelectorAll(parsedSelector, root);
  if (!matches.length) {
    injected.checkDeprecatedSelectorUsage(parsedSelector, matches);
    return null;
  }
  if (matches.length === 1) {
    injected.checkDeprecatedSelectorUsage(parsedSelector, matches);
    return matches[0];
  }
  if (strict) throw injected.strictModeViolationError(parsedSelector, matches);
  const visibleMatches = matches.filter(element => !!injected.elementState(element, 'visible').matches);
  if (visibleMatches.length === 1) return visibleMatches[0];
  throw injected.strictModeViolationError(parsedSelector, matches);
}

function injectedForWindow(rootInjected, targetWindow) {
  if (!targetWindow) throw new Error('Frame window is not available');
  if (targetWindow[cuaInjectedGlobal]) return targetWindow[cuaInjectedGlobal];
  const injected = new rootInjected.constructor(targetWindow, cuaInjectedOptions);
  injected.isProtectedCredentialField = rootInjected.isProtectedCredentialField;
  targetWindow[cuaInjectedGlobal] = injected;
  return injected;
}

function sliceParsedSelector(parsedSelector, startIndex, endIndex) {
  const sliced = {...parsedSelector, parts: parsedSelector.parts.slice(startIndex, endIndex)};
  if (parsedSelector.capture === undefined) delete sliced.capture;
  else if (parsedSelector.capture >= startIndex && parsedSelector.capture < endIndex) sliced.capture = parsedSelector.capture - startIndex;
  else delete sliced.capture;
  return sliced;
}

function frameContentGeometry(frameElement) {
  const rect = frameElement.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) throw new Error('Frame does not have an actionable bounding box');
  const offsetWidth = Number(frameElement.offsetWidth) || rect.width;
  const offsetHeight = Number(frameElement.offsetHeight) || rect.height;
  const clientWidth = Number(frameElement.clientWidth);
  const clientHeight = Number(frameElement.clientHeight);
  if (offsetWidth <= 0 || offsetHeight <= 0 || clientWidth <= 0 || clientHeight <= 0) throw new Error('Frame does not have an actionable bounding box');
  const scaleX = rect.width / offsetWidth;
  const scaleY = rect.height / offsetHeight;
  return {left: rect.left + (Number(frameElement.clientLeft) || 0) * scaleX, scaleX, scaleY, top: rect.top + (Number(frameElement.clientTop) || 0) * scaleY};
}

function pointThroughFrameElement(point, frameElement) {
  const geometry = frameContentGeometry(frameElement);
  return {x: geometry.left + point.x * geometry.scaleX, y: geometry.top + point.y * geometry.scaleY};
}

// A point in the innermost frame's viewport, in the top document's, the frames scrolled into view on the way (M1c).
function prepareFrameChainForPointerAction(frameChain, point, scrollAlignment) {
  const block = scrollAlignment?.block ?? 'center';
  const inline = scrollAlignment?.inline ?? 'nearest';
  let currentPoint = point;
  for (const frameScope of frameChain.slice().reverse()) {
    frameScope.element.scrollIntoView({block, inline, behavior: 'instant'});
    const state = frameScope.injected.elementState(frameScope.element, 'visible');
    if (state.received === 'error:notconnected') throw new Error('Frame is not connected');
    if (!state.matches) throw new Error('Frame is not visible');
    currentPoint = pointThroughFrameElement(currentPoint, frameScope.element);
  }
  return currentPoint;
}

// The root and injected script the selector's last part is queried with, after entering its frames in the page; null
// when a frame on the way is not there.
function selectorScopeFor(initialInjected, parsedSelector, strict = false) {
  let currentRoot = document;
  let currentInjected = initialInjected;
  const frameChain = [];
  let partStart = 0;
  while (true) {
    const enterFrameIndex = parsedSelector.parts.findIndex((part, index) => index >= partStart && part.name === 'internal:control' && part.body === 'enter-frame');
    if (enterFrameIndex === -1) {
      return {
        frameChain, injected: currentInjected, root: currentRoot,
        prepareFrameChainForPointerAction: (point, scrollAlignment) => prepareFrameChainForPointerAction(frameChain, point, scrollAlignment),
        parsed: sliceParsedSelector(parsedSelector, partStart, parsedSelector.parts.length),
      };
    }
    const frameElement = querySelectorStrictWithVisibleFallback(currentInjected, sliceParsedSelector(parsedSelector, partStart, enterFrameIndex), currentRoot, strict);
    if (!frameElement) return null;
    const tagName = String(frameElement.localName || frameElement.tagName || '').toLowerCase();
    if (tagName !== 'iframe' && tagName !== 'frame') throw new Error('internal:control=enter-frame must target a frame element');
    let frameWindow;
    let frameDocument;
    try {
      frameWindow = frameElement.contentWindow;
      frameDocument = frameElement.contentDocument || frameWindow?.document;
    } catch {
      throw new Error(unsupportedFrameAccessMessage);
    }
    if (!frameWindow || !frameDocument) throw new Error(unsupportedFrameAccessMessage);
    frameChain.push({element: frameElement, injected: currentInjected});
    currentRoot = frameDocument;
    currentInjected = injectedForWindow(initialInjected, frameWindow);
    partStart = enterFrameIndex + 1;
  }
}

// The first frame element on the selector's way the page cannot enter (cross-origin or out of process), the frames
// before it entered; null when every frame is reachable (or one is not there yet).
function firstUnreachableFrame(initialInjected, parsedSelector, strict, scrollFrameIntoView) {
  let currentRoot = document;
  let currentInjected = initialInjected;
  let partStart = 0;
  while (true) {
    const enterFrameIndex = parsedSelector.parts.findIndex((part, index) => index >= partStart && part.name === 'internal:control' && part.body === 'enter-frame');
    if (enterFrameIndex === -1) return null;
    const frameElement = querySelectorStrictWithVisibleFallback(currentInjected, sliceParsedSelector(parsedSelector, partStart, enterFrameIndex), currentRoot, strict);
    if (!frameElement) return null;
    const tagName = String(frameElement.localName || frameElement.tagName || '').toLowerCase();
    if (tagName !== 'iframe' && tagName !== 'frame') throw new Error('internal:control=enter-frame must target a frame element');
    const state = currentInjected.elementState(frameElement, 'visible');
    if (state.received === 'error:notconnected') throw new Error('Frame is not connected');
    if (!state.matches) throw new Error('Frame is not visible');
    if (scrollFrameIntoView) frameElement.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'});
    let frameWindow;
    let frameDocument;
    try {
      frameWindow = frameElement.contentWindow;
      frameDocument = frameElement.contentDocument || frameWindow?.document;
    } catch {
      return frameElement;
    }
    if (!frameWindow || !frameDocument) return frameElement;
    currentRoot = frameDocument;
    currentInjected = injectedForWindow(initialInjected, frameWindow);
    partStart = enterFrameIndex + 1;
  }
}

// Called on a frame element: how many frames deep it is in this world's document, and its size and identity.
function describeFrameElement() {
  let ownerDocument = this.ownerDocument;
  let enterFrameCount = 1;
  while (ownerDocument !== document) {
    const ownerFrame = ownerDocument?.defaultView?.frameElement;
    if (!ownerFrame) throw new Error('Frame is not connected');
    ownerDocument = ownerFrame.ownerDocument;
    enterFrameCount += 1;
  }
  const rect = this.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) throw new Error('Frame does not have an actionable bounding box');
  const width = Number(this.clientWidth) || rect.width;
  const height = Number(this.clientHeight) || rect.height;
  if (width <= 0 || height <= 0) throw new Error('Frame does not have an actionable bounding box');
  return {enterFrameCount, frameName: this.name || undefined, frameUrl: this.src || undefined, size: {height, width}};
}

// Called on an element: the frame element of its document, when it has one.
function ownerFrameElement() {
  try {
    return this.ownerDocument?.defaultView?.frameElement ?? null;
  } catch {
    return null;
  }
}

const PRELUDE = `
const cuaInjectedGlobal = ${JSON.stringify(INJECTED_GLOBAL)};
const cuaInjectedOptions = ${JSON.stringify(INJECTED_OPTIONS)};
const unsupportedFrameAccessMessage = "Cross-origin or out-of-process iframes are not supported by this runtime selector path";
${[querySelectorStrictWithVisibleFallback, injectedForWindow, sliceParsedSelector, frameContentGeometry, pointThroughFrameElement,
  prepareFrameChainForPointerAction, selectorScopeFor, firstUnreachableFrame].map(String).join('\n')}
`;

const argument = value => JSON.stringify(value) ?? 'undefined';                                                       // e_

// --- the expressions ----------------------------------------------------------------------------------------------------

const unreachableFrameExpression = (selector, strict, scroll) => `(() => {
  ${PRELUDE}
  return firstUnreachableFrame(window.${INJECTED_GLOBAL}, window.${INJECTED_GLOBAL}.parseSelector(${JSON.stringify(selector)}), ${strict === true}, ${scroll !== false});
})()`;

const elementExpression = (selector, strict) => `(() => {
  ${PRELUDE}
  const initialInjected = window.${INJECTED_GLOBAL};
  const scope = selectorScopeFor(initialInjected, initialInjected.parseSelector(${JSON.stringify(selector)}), ${strict === true});
  const element = scope ? querySelectorStrictWithVisibleFallback(scope.injected, scope.parsed, scope.root, ${strict === true}) : null;
  if (!element) throw new Error("No element matched selector");
  return element;
})()`;

// -> [the frame element of the frame the query ran in when it was entered in the page (else null), that frame's
// document (the world's own when a frame on the way is missing), ...the matches].
const elementsExpression = selector => `(() => {
  ${PRELUDE}
  const initialInjected = window.${INJECTED_GLOBAL};
  const scope = selectorScopeFor(initialInjected, initialInjected.parseSelector(${JSON.stringify(selector)}));
  if (!scope) return [null, document];
  return [scope.frameChain.length ? scope.frameChain[scope.frameChain.length - 1].element : null, scope.root,
    ...scope.injected.querySelectorAll(scope.parsed, scope.root)];
})()`;

const evaluateOneExpression = (selector, fn, arg, strict) => `(async () => {
  const __name = (target) => target;
  ${PRELUDE}
  const initialInjected = window.${INJECTED_GLOBAL};
  const parsed = initialInjected.parseSelector(${JSON.stringify(selector)});
  const scope = selectorScopeFor(initialInjected, parsed, ${strict === true});
  const element = scope ? querySelectorStrictWithVisibleFallback(scope.injected, scope.parsed, scope.root, ${strict === true}) : null;
  if (!element) throw new Error("No element matched selector");
  return await (${fn})(element, scope.injected, ${argument(arg)}, scope);
})()`;

const evaluateAllExpression = (selector, fn, arg) => `(async () => {
  const __name = (target) => target;
  ${PRELUDE}
  const initialInjected = window.${INJECTED_GLOBAL};
  const scope = selectorScopeFor(initialInjected, initialInjected.parseSelector(${JSON.stringify(selector)}));
  const elements = scope ? scope.injected.querySelectorAll(scope.parsed, scope.root) : [];
  return await (${fn})(elements, scope ? scope.injected : initialInjected, ${argument(arg)});
})()`;

const evaluateFrameExpression = (fn, arg) => `(async () => {
  const __name = (target) => target;
  const injected = window.${INJECTED_GLOBAL};
  return await (${fn})(injected, ${argument(arg)});
})()`;

const handleFunction = fn => `function (arg) {
  const __name = (target) => target;
  const injected = window.${INJECTED_GLOBAL};
  if (!this.isConnected) throw new Error("Element is not connected");
  return (${fn})(this, injected, arg);
}`;

// --- in node --------------------------------------------------------------------------------------------------------

const messageOf = error => String(error instanceof Error ? error.message : error);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isInheritingUrl = url => {                                                                                     // nZ
  if (url == null) return false;
  try {
    const {protocol} = new URL(url);
    return protocol === 'about:' || protocol === 'data:';
  } catch {
    return false;
  }
};
const frameList = tree => [tree.frame, ...(tree.childFrames ?? []).flatMap(frameList)];                             // o_

// A failure no further attempt can mend (kf, and the M1a ruling on dialogs) -> the error to throw, or null.
export function finalError(error) {
  if (error instanceof BrowserServiceError) return error.code === 'dialog_open' || error.code === 'strict_mode_violation' ? error : null;
  if (messageOf(error).includes('strict mode violation:')) return new BrowserServiceError('strict_mode_violation', messageOf(error), {cause: error});
  return null;
}

function startOf(frame) {
  const given = typeof frame === 'object' && frame != null ? frame : {tabId: frame};
  const tabId = Number(given.tabId);
  if (!Number.isFinite(tabId)) throw new Error('Playwright selectors require a numeric tab_id');
  const target = {tabId, ...(given.sessionId != null ? {sessionId: given.sessionId} : given.targetId != null ? {targetId: given.targetId} : {})};
  return {target, frameId: given.frameId ?? undefined, oopifFrameChain: []};
}

const objectsOf = remoteObjects;

// The budget one attempt's dispatches get: the command's, or, for an explicit zero budget (one attempt, as the vendor's
// loop makes it), the default action budget instead of the host's own bound (the controller's M1b ruling).
export const attemptBudget = deadline => (deadline.ms > 0 ? deadline : new Deadline(DEFAULT_ACTION_MS));

// An element a selector resolved to, by its backend node: valid until its document changes.
export class ElementHandle {
  constructor(engine, {backendNodeId, frameId, target, oopifFrameChain, selector}) {
    Object.defineProperty(this, 'engine', {value: engine});
    this.backendNodeId = backendNodeId;
    this.frameId = frameId;
    this.target = target;
    this.oopifFrameChain = oopifFrameChain;
    this.selector = selector;
  }

  // fn(element, injected, arg) on the element in the injected script's world -> its value.
  async evaluate(fn, options = {}) {
    return await this.engine.evaluateOnHandle(this, fn, options);
  }
}

export class SelectorEngine {
  // `cdp` the backend's CdpController, `injected` its InjectedScripts.
  constructor(cdp, injected) {
    this.cdp = cdp;
    this.injected = injected;
  }

  cdp;
  injected;
  groups = 0;                    // the object groups nodesFor has used

  // --- the interface ------------------------------------------------------------------------------------------------

  async resolve(selector, frame, {deadline = new Deadline(DEFAULT_ACTION_MS), strict = false, retry = true, scrollFrameIntoView} = {}) {
    const start = startOf(frame);
    return await this.poll(selector, async bound => {
      const scope = await this.route(start, selector, {deadline: bound, strict, scrollFrameIntoView});
      const node = await this.nodeFor(scope, {deadline: bound, strict});
      return new ElementHandle(this, {...node, target: scope.target, oopifFrameChain: scope.oopifFrameChain, selector});
    }, {deadline, retry});
  }

  async resolveAll(selector, frame, {deadline = new Deadline(DEFAULT_ACTION_MS), retry = true} = {}) {
    const start = startOf(frame);
    return await this.poll(selector, async bound => {
      const scope = await this.route(start, selector, {deadline: bound});
      return await this.nodesFor(scope, selector, {deadline: bound});
    }, {deadline, retry});
  }

  async evaluateOnSelector(selector, frame, fn, {arg, deadline = new Deadline(DEFAULT_ACTION_MS), strict = false, retry = true, scrollFrameIntoView} = {}) {
    const start = startOf(frame);
    return await this.poll(selector, async bound => {
      const scope = await this.route(start, selector, {deadline: bound, strict, scrollFrameIntoView});
      checkSelectorDeadline(bound);
      const result = await this.injected.evaluate(scope.target, scope.frameId,
        {expression: evaluateOneExpression(scope.selector, fn.toString(), arg, strict), awaitPromise: true, returnByValue: true}, {deadline: bound});
      return {result: await this.injected.valueOf(scope.target, result), target: scope.target, frameId: result.frameId, executionContextId: result.executionContextId, oopifFrameChain: scope.oopifFrameChain};
    }, {deadline, retry});
  }

  async evaluateOnSelectorAll(selector, frame, fn, {arg, deadline = new Deadline(DEFAULT_ACTION_MS), retry = true} = {}) {
    const start = startOf(frame);
    return await this.poll(selector, async bound => {
      const scope = await this.route(start, selector, {deadline: bound});
      checkSelectorDeadline(bound);
      return await this.injected.evaluateValue(scope.target, scope.frameId, evaluateAllExpression(scope.selector, fn.toString(), arg), {deadline: bound});
    }, {deadline, retry});
  }

  async evaluateInFrame(frame, fn, {arg, deadline = new Deadline(DEFAULT_ACTION_MS)} = {}) {
    const {target, frameId} = startOf(frame);
    return await this.injected.evaluateValue(target, frameId, evaluateFrameExpression(fn.toString(), arg), {deadline: attemptBudget(deadline)});
  }

  async evaluateOnHandle(handle, fn, {arg, deadline = new Deadline(DEFAULT_ACTION_MS)} = {}) {
    const options = {deadline: attemptBudget(deadline)};
    await this.injected.install(handle.target, handle.frameId, options);
    const executionContextId = await this.injected.world(handle.target, handle.frameId, options);
    const {object} = await this.cdp.callTarget(handle.target, 'DOM.resolveNode', {backendNodeId: handle.backendNodeId, executionContextId}, options);
    if (object?.objectId == null) throw new Error('Playwright node has no document-bound handle');
    let result;
    try {
      result = await this.cdp.callTarget(handle.target, 'Runtime.callFunctionOn', {
        arguments: arg == null ? [] : [{value: arg}], awaitPromise: true, functionDeclaration: handleFunction(fn.toString()),
        objectId: object.objectId, returnByValue: true, userGesture: true,
      }, options);
      return resultValue(result);
    } finally {
      await this.injected.release(handle.target, [object.objectId, ...remoteObjects(result)]);
    }
  }

  // --- polling (Zv) -------------------------------------------------------------------------------------------------

  // Runs `attempt(deadline)` until it succeeds, a failure is final, or the deadline passes; every 100 ms. A zero budget
  // is one attempt (the vendor's qe of 0), its dispatches bounded by the default action budget.
  async poll(selector, attempt, {deadline, retry = true}) {
    const startedAt = Date.now();
    const bound = attemptBudget(deadline);
    while (true) {
      checkSelectorDeadline(bound);
      try {
        return await attempt(bound);
      } catch (error) {
        const final = finalError(error);
        if (final != null) throw final;
        if (!retry) throw error;
        if (Date.now() - startedAt >= deadline.ms) {
          throw new BrowserServiceError('timeout', `Timed out after ${deadline.ms}ms waiting for selector ${selector}: ${messageOf(error)}`, {cause: error});
        }
        checkSelectorDeadline(bound);
        await sleep(Math.max(1, Math.min(POLL_MS, bound.remaining())));
      }
    }
  }

  // --- one attempt's steps ------------------------------------------------------------------------------------------

  // The target, frame and rest of the selector after every frame the page cannot enter was entered by CDP
  // (resolveSelectorTarget).
  async route(start, selector, options) {
    let scope = start;
    let rest = selector;
    while (true) {
      checkSelectorDeadline(options.deadline);
      const next = await this.enterFirstUnreachableFrame(scope, rest, options);
      if (next == null) return {...scope, selector: rest};
      scope = next;
      rest = next.selector;
    }
  }

  // Enters the first frame on the selector's way the page cannot (frameRouteForFirstOopif) -> the scope inside it, or
  // null when there is none.
  async enterFirstUnreachableFrame(scope, selector, {deadline, strict, scrollFrameIntoView}) {
    if (!selector.includes(ENTER_FRAME)) return null;
    checkSelectorDeadline(deadline);
    await this.cdp.enableOopifAutoAttach(scope.target.tabId, {deadline});
    checkSelectorDeadline(deadline);
    const found = await this.injected.evaluate(scope.target, scope.frameId,
      {expression: unreachableFrameExpression(selector, strict, scrollFrameIntoView), returnByValue: false}, {deadline});
    const owned = objectsOf(found);
    try {
      const error = pageError(found);
      if (error != null) throw error;
      const frameObject = found.result?.objectId;
      if (frameObject == null) {
        checkSelectorDeadline(deadline);
        return null;
      }
      checkSelectorDeadline(deadline);
      const [described, node] = await Promise.allSettled([
        this.cdp.callTarget(scope.target, 'Runtime.callFunctionOn', {functionDeclaration: describeFrameElement.toString(), objectId: frameObject, returnByValue: true}, {deadline}),
        this.cdp.callTarget(scope.target, 'DOM.describeNode', {objectId: frameObject}, {deadline}),
      ]);
      if (described.status === 'rejected') throw described.reason;
      owned.push(...objectsOf(described.value));
      if (node.status === 'rejected') throw node.reason;
      const info = resultValue(described.value);
      const frameId = typeof node.value.node.frameId === 'string' ? node.value.node.frameId : await this.frameIdForFrameMatch(scope.target, info, {deadline});
      const sameProcess = isInheritingUrl(info.frameUrl)
        || (frameId != null && this.injected.worlds.has(targetKey(scope.target, frameId)) && this.cdp.targetForFrame(scope.target.tabId, frameId) == null);
      const target = sameProcess ? null : await this.targetForFrame(scope.target, frameId, info, {deadline});
      checkSelectorDeadline(deadline);
      if (frameId == null) throw new Error(FRAME_TARGET_UNAVAILABLE);
      const entry = {frameId, parentTarget: scope.target, size: info.size};
      const last = scope.oopifFrameChain.at(-1);
      const oopifFrameChain = last != null && targetKey(last.parentTarget) === targetKey(entry.parentTarget)
        ? [...scope.oopifFrameChain.slice(0, -1), entry] : [...scope.oopifFrameChain, entry];
      return {frameId, oopifFrameChain, selector: selector.split(ENTER_FRAME).slice(info.enterFrameCount).join(ENTER_FRAME), target: target ?? scope.target};
    } finally {
      await this.injected.release(scope.target, owned);
    }
  }

  // The frame a frame element shows, by its URL and name in the frame tree when DOM.describeNode does not name it.
  async frameIdForFrameMatch(target, info, options) {
    if (info.frameUrl == null) return null;
    const {frameTree} = await this.cdp.callTarget(target, 'Page.getFrameTree', undefined, options);
    const matches = frameList(frameTree).filter(f => f.url === info.frameUrl && (info.frameName == null || f.name === info.frameName));
    return matches.length === 1 ? matches[0].id : null;
  }

  // The out-of-process frame's own target (attached on demand), or null when the frame is in the parent's process.
  async targetForFrame(parentTarget, frameId, info, {deadline}) {
    checkSelectorDeadline(deadline);
    return await this.cdp.targetForFrameOrAttach(parentTarget.tabId, frameId, {deadline},
      {parentTarget, ...(info.frameUrl != null ? {url: info.frameUrl} : {})});
  }

  // The element the scope's selector resolves to -> {backendNodeId, frameId} (nodeForResolvedSelectorTarget).
  async nodeFor(scope, {deadline, strict}) {
    const found = await this.injected.evaluate(scope.target, scope.frameId, {expression: elementExpression(scope.selector, strict), returnByValue: false}, {deadline});
    const owned = objectsOf(found);
    try {
      const error = pageError(found);
      if (error != null) throw error;
      const objectId = found.result?.objectId;
      if (objectId == null) throw new Error('Playwright selector did not resolve to a DOM node');
      const {node} = await this.cdp.callTarget(scope.target, 'DOM.describeNode', {objectId}, {deadline});
      const frameId = scope.selector.includes(ENTER_FRAME) ? (await this.frameIdForElement(scope.target, objectId, {deadline})) ?? found.frameId : found.frameId;
      return {backendNodeId: node.backendNodeId, frameId};
    } finally {
      await this.injected.release(scope.target, owned);
    }
  }

  // Every element the scope's selector matches, as handles, with the frame the query ran in (also when nothing
  // matched): {target, frameId, oopifFrameChain, selector, documentBackendNodeId, handles}. The remote objects are held
  // in one group, released at once.
  async nodesFor(scope, selector, {deadline}) {
    const objectGroup = `cua-selectors-${++this.groups}`;
    try {
      const found = await this.injected.evaluate(scope.target, scope.frameId,
        {expression: elementsExpression(scope.selector), returnByValue: false, objectGroup}, {deadline});
      const error = pageError(found);
      if (error != null) throw error;
      const {result: properties} = await this.cdp.callTarget(scope.target, 'Runtime.getProperties', {objectId: found.result.objectId, ownProperties: true}, {deadline});
      const byIndex = new Map(properties.filter(p => /^\d+$/.test(p.name)).map(p => [Number(p.name), p.value?.objectId]));
      const elementIds = [...byIndex.keys()].filter(i => i >= 2).sort((a, b) => a - b).map(i => byIndex.get(i));
      const describe = objectId => this.cdp.callTarget(scope.target, 'DOM.describeNode', {objectId}, {deadline});
      const frameElement = byIndex.get(0);
      const [frameNode, documentNode, ...nodes] = await Promise.all([
        frameElement == null ? undefined : describe(frameElement), describe(byIndex.get(1)), ...elementIds.map(describe),
      ]);
      const frameId = frameNode?.node.frameId ?? found.frameId;
      return {
        target: scope.target, frameId, oopifFrameChain: scope.oopifFrameChain, selector, documentBackendNodeId: documentNode.node.backendNodeId,
        handles: nodes.map(({node}) => new ElementHandle(this, {backendNodeId: node.backendNodeId, frameId, target: scope.target, oopifFrameChain: scope.oopifFrameChain, selector})),
      };
    } finally {
      await this.cdp.callTarget(scope.target, 'Runtime.releaseObjectGroup', {objectGroup}, {deadline: new Deadline(POLL_MS)}).catch(() => {});
    }
  }

  // The frame an element's document is in, when it is a child frame of the world's (frameIdForElementObject).
  async frameIdForElement(target, objectId, options) {
    const found = await this.cdp.callTarget(target, 'Runtime.callFunctionOn', {functionDeclaration: ownerFrameElement.toString(), objectId, returnByValue: false}, options);
    const owned = objectsOf(found);
    try {
      const error = pageError(found);
      if (error != null) throw error;
      const frameElement = found.result?.objectId;
      if (frameElement == null) return undefined;
      const {node} = await this.cdp.callTarget(target, 'DOM.describeNode', {objectId: frameElement}, options);
      return node.frameId;
    } finally {
      await this.injected.release(target, owned);
    }
  }
}
