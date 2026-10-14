// Ported from readable chatgpt-26.928.40906 BS:56921-57053 (rM, gZ and bZ: playwright_evaluate's page, locator and selector_mode 'all' paths); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: the result projection serializeResult and runUserScript (BS:59863-59934); lZ, cZ, uZ, dZ, pZ, fZ (BS:56921-56933);
// sM, lM and _Z (BS:59936-59985); tM (BS:57230-57236).
//
// `playwright_evaluate` runs the caller's script in the page's main world, as Playwright's page.evaluate does: the
// DOM, fetch, XMLHttpRequest, cookies and navigation are the page's own (the spec's "Lifted"; the vendor's read-only
// membrane, its isolated world and its frozen wrappers are not ported). The REPL client sends the script as a function
// body (BC yl and fl: `const arg = ...; return ...`); it runs with `this` the window and, in the locator forms, the
// binding `element` (the one element the selector resolves to, strictly with the vendor's visible fallback) or
// `elements` (every match, in the frame the selector reached, [] when none). The value returned is the vendor's
// bounded projection (depth 8, arrays 2,000 items, objects 200 keys, strings 200,000 characters, a repeated object
// "[Circular]"), with every browser type the vendor's read-only scope wraps (nodes, collections, rects, styles, CSS,
// ranges, ...) adapted to its wrappers' and builders' shapes.
//
// The no-replay rule (a deliberate departure from the vendor's evaluator, which runs a script again after a lost
// context and retries the locator form until its deadline): resolving the selector may poll until the budget runs
// out, but once the script has been dispatched (the one Runtime.evaluate or Runtime.callFunctionOn that carries it) it
// is never dispatched again. A lost context, a navigation, a detached debugger or the budget running out after that
// point fails with evaluate_interrupted, saying the page may have run it. The budget is the command's `timeout_ms`,
// clamped (3 s by default, at most 120 s); an explicit 0 is one attempt bounded by 3 s (the M1b ruling).
//
// Interface for later milestones: `new PageEvaluator(cdp, selectors).evaluateInPage(frame, script, args, {deadline})`.
// `frame` is a tab id or {tabId, sessionId? | targetId?} (the target's main frame), an ElementHandle (binding
// `element`, in the element's frame) or a resolveAll result (binding `elements`, in the frame the query ran in);
// `script` is a function body; `args` (an array of JSON values) becomes its `arguments`.
import {Deadline, clamp} from './budgets.mjs';
import {BrowserServiceError} from './errors.mjs';
import {CREDENTIAL_FIELDS, isProtectedCredentialField, remoteObjects} from './injected.mjs';
import {SELECTOR_DEADLINE_EXCEEDED, attemptBudget, finalError} from './selectors.mjs';
import {tabIdOf} from './tabs.mjs';

export const RESULT_LIMITS = Object.freeze({maxDepth: 8, maxArrayLength: 2000, maxObjectKeys: 200, maxStringLength: 200000});   // lZ, cZ, uZ, dZ
const POLL_MS = 100;                                                                                                   // pZ
const RELEASE_MS = 100;                                                                                                // eM
const MODULE_LOADING = /\bimport\b(?:(?:\s+)|(?:\/\/[^\n\r]*(?:\r?\n|$))|(?:\/\*[\s\S]*?\*\/))*\(/;                  // fZ
export const DEADLINE_SENTENCE = 'playwright.evaluate exceeded its deadline';                                          // tM
const NOT_RUN_AGAIN = 'The script was sent to the page once and may have run there; it was not run again.';

const messageOf = error => String(error instanceof Error ? error.message : error);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// The vendor's refusal of module loading (sM): the page's evaluate has no import, as the isolated REPL never had.
export function checkScript(script) {
  if (typeof script !== 'string') throw new Error('playwright.evaluate requires a script');
  if (MODULE_LOADING.test(script)) throw new Error('module loading is not available in playwright.evaluate');
}

// Runs in the page: the bounded projection of a script's value (serializeResult). An ordinary object projects by its
// own enumerable keys, as the vendor's does (no toJSON is called: a Date or a URL is {}). Every browser type the
// vendor's read-only scope hands out through a wrapper factory or a read-only builder (BS:57301-59500) is adapted to
// what that wrapper or builder serialises to, by its platform tag (the main world has the real objects, whose fields
// are prototype getters): an attribute as the vendor's read-only attribute (null for a credential field's value
// attribute); other nodes as their summaries; node, rule, sheet and rect collections and token lists as arrays;
// attributes, time ranges and track lists as the builders' items; data sets, validity, rects, styles, media lists,
// CSS rules and style sheets, ranges, selections, media query lists, the visual viewport and the font set as the
// wrappers' toJSON shapes; the location as {} (the vendor's has no own keys). `isProtectedField(element)` names the
// fields whose value attribute the attribute list leaves out. An adapter's output holds values, node summaries and
// further adapted objects only.
export function projectResult(value, {maxDepth, maxArrayLength, maxObjectKeys, maxStringLength}, isProtectedField = () => false) {
  const seen = new WeakSet();
  const tagOf = current => {
    try {
      return Object.prototype.toString.call(current).slice(8, -1);
    } catch {
      return '';
    }
  };
  const hasOwn = Object.prototype.hasOwnProperty;
  // At most maxArrayLength items of a collection, read by index (or by its iterator when it has no length) and never
  // past the limit; a collection that throws partway gives the items it yielded before.
  const bounded = (list, mapItem = item => item) => {
    const output = [];
    try {
      if (typeof list.length === 'number') {
        for (let index = 0; index < list.length && output.length < maxArrayLength; index += 1) output[output.length] = mapItem(list[index], index);
      } else {
        for (const item of list) {
          if (output.length >= maxArrayLength) break;
          output[output.length] = mapItem(item, output.length);
        }
      }
    } catch {}
    return output;
  };
  const isNode = current => typeof current.nodeType === 'number' && typeof current.nodeName === 'string' && typeof current.cloneNode === 'function';
  const stringOrUndefined = v => (typeof v === 'string' ? v : undefined);
  const nodeSummary = node => (node == null ? null : node.nodeType === 1
    ? {id: node.id, tagName: node.tagName, textContent: node.textContent}
    : {name: stringOrUndefined(node.name), nodeName: node.nodeName, nodeType: node.nodeType, publicId: stringOrUndefined(node.publicId),
      systemId: stringOrUndefined(node.systemId), textContent: node.textContent});
  const asArray = list => bounded(list);
  // An attribute as the vendor's read-only attribute (makeReadonlyAttribute, BS:57312-57319).
  const attribute = a => ({name: a.name, nodeName: a.name, nodeValue: a.value, specified: true, value: a.value});
  // A bare attribute: the vendor's attribute, or null for a credential field's value attribute, which its read-only
  // attribute list leaves out (getNamedItem answers null).
  const bareAttribute = a => (a.ownerElement != null && String(a.name).toLowerCase() === 'value' && isProtectedField(a.ownerElement) ? null : attribute(a));
  const rect = r => ({bottom: r.bottom, height: r.height, left: r.left, right: r.right, top: r.top, width: r.width, x: r.x, y: r.y});
  const style = declaration => {
    const output = {};
    for (let index = 0; index < Math.min(declaration.length, maxObjectKeys); index += 1) {
      const name = declaration.item(index);
      output[name] = declaration.getPropertyValue(name);
    }
    return output;
  };
  const mediaList = media => bounded(media, (item, index) => media.item(index) ?? '');
  const VALIDITY = ['badInput', 'customError', 'patternMismatch', 'rangeOverflow', 'rangeUnderflow', 'stepMismatch', 'tooLong', 'tooShort', 'typeMismatch', 'valid', 'valueMissing'];
  const RULE_TEXTS = ['conditionText', 'href', 'keyText', 'name', 'selectorText'];
  const cssRule = rule => {
    const output = {cssText: rule.cssText, type: rule.type};
    for (const name of RULE_TEXTS) if (typeof rule[name] === 'string') output[name] = rule[name];
    if (rule.style != null) output.style = style(rule.style);
    return output;
  };
  const ADAPTERS = {
    NodeList: asArray, HTMLCollection: asArray, HTMLFormControlsCollection: asArray, HTMLOptionsCollection: asArray, RadioNodeList: asArray,
    StyleSheetList: asArray, CSSRuleList: asArray, DOMRectList: asArray,
    DOMTokenList: list => bounded(list, String),
    NamedNodeMap: attributes => {
      const read = bounded(attributes);
      const owner = read.length > 0 ? read[0].ownerElement : null;
      const hidden = owner != null && isProtectedField(owner);
      return read.filter(a => !hidden || a.name.toLowerCase() !== 'value').map(attribute);
    },
    DOMStringMap: dataset => Object.fromEntries(Object.keys(dataset).map(key => [key, dataset[key]])),
    TimeRanges: ranges => bounded({length: ranges.length}, (item, index) => ({end: ranges.end(index), start: ranges.start(index)})),
    ValidityState: validity => Object.fromEntries(VALIDITY.map(name => [name, validity[name] === true])),
    DOMRect: rect, DOMRectReadOnly: rect,
    CSSStyleDeclaration: style, CSSStyleProperties: style, CSS2Properties: style,
    MediaList: mediaList,
    CSSStyleSheet: sheet => {
      const output = {disabled: sheet.disabled === true, href: sheet.href, media: sheet.media == null ? null : mediaList(sheet.media), title: sheet.title, type: sheet.type};
      try {
        output.ruleCount = sheet.cssRules.length;
      } catch (error) {
        output.ruleAccessError = error instanceof Error ? error.name || error.message : String(error);
      }
      return output;
    },
    Range: range => ({collapsed: range.collapsed, commonAncestorContainer: nodeSummary(range.commonAncestorContainer), endOffset: range.endOffset,
      startOffset: range.startOffset, text: range.toString()}),
    Selection: selection => ({anchorNode: nodeSummary(selection.anchorNode), anchorOffset: selection.anchorOffset, focusNode: nodeSummary(selection.focusNode),
      focusOffset: selection.focusOffset, isCollapsed: selection.isCollapsed, rangeCount: selection.rangeCount, text: selection.toString(), type: selection.type}),
    MediaQueryList: query => ({matches: query.matches === true, media: query.media}),
    VisualViewport: v => ({height: v.height, offsetLeft: v.offsetLeft, offsetTop: v.offsetTop, pageLeft: v.pageLeft, pageTop: v.pageTop, scale: v.scale, width: v.width}),
    FontFaceSet: fonts => ({size: fonts.size, status: fonts.status}),
    Location: () => ({}),
  };
  const TRACK_LISTS = new Set(['TextTrackList', 'AudioTrackList', 'VideoTrackList']);
  const track = t => ({enabled: t.enabled === true, id: typeof t.id === 'string' ? t.id : '', kind: typeof t.kind === 'string' ? t.kind : '',
    label: typeof t.label === 'string' ? t.label : '', language: typeof t.language === 'string' ? t.language : '',
    mode: typeof t.mode === 'string' ? t.mode : undefined, selected: t.selected === true});
  const adapterFor = tag => (Object.hasOwn(ADAPTERS, tag) ? ADAPTERS[tag]
    : TRACK_LISTS.has(tag) ? tracks => bounded(tracks, track)
      : /^CSS[A-Za-z]*Rule$/.test(tag) ? cssRule : null);
  const serializeNonObject = current => {
    switch (typeof current) {
      case 'bigint': return current.toString();
      case 'boolean':
      case 'undefined': return current;
      case 'function':
      case 'symbol': return undefined;
      case 'number': return Number.isFinite(current) ? current : null;
      case 'string': return current.length > maxStringLength ? `${current.slice(0, maxStringLength)}[Truncated]` : current;
      default: return current;
    }
  };
  const serializeObject = (current, depth) => {
    if (depth > maxDepth) return '[MaxDepth]';
    if (seen.has(current)) return '[Circular]';
    seen.add(current);
    const tag = tagOf(current);
    if (tag === 'Attr' || (current.nodeType === 2 && isNode(current))) return serialize(bareAttribute(current), depth);
    if (isNode(current)) return serialize(nodeSummary(current), depth);
    const adapter = adapterFor(tag);
    if (adapter != null) return serialize(adapter(current), depth);
    if (Array.isArray(current)) {
      const items = [];
      for (let index = 0; index < current.length && index < maxArrayLength; index += 1) items[index] = serialize(current[index], depth + 1);
      return items;
    }
    const output = {};
    let keys = 0;
    for (const key in current) {
      if (!hasOwn.call(current, key)) continue;
      if (keys++ >= maxObjectKeys) break;
      const serialized = serialize(current[key], depth + 1);
      if (serialized !== undefined) output[key] = serialized;
    }
    return output;
  };
  const serialize = (current, depth) => (current == null || typeof current !== 'object' ? serializeNonObject(current) : serializeObject(current, depth));
  return serialize(value, 0);
}

// In the service: the projection's limits applied again to the by-value result, so a page that replaced the globals the
// in-page projection uses (Array.prototype.slice, Object.keys, ...) cannot return more than the limits allow. A value the
// in-page projection bounded passes unchanged (its markers are strings; a truncated string truncates to itself).
export function boundResult(value, {maxDepth, maxArrayLength, maxObjectKeys, maxStringLength}) {
  const bound = (current, depth) => {
    if (typeof current === 'string') return current.length > maxStringLength ? `${current.slice(0, maxStringLength)}[Truncated]` : current;
    if (current == null || typeof current !== 'object') return current;
    if (depth > maxDepth) return '[MaxDepth]';
    if (Array.isArray(current)) return current.slice(0, maxArrayLength).map(item => bound(item, depth + 1));
    return Object.fromEntries(Object.keys(current).slice(0, maxObjectKeys).map(key => [key, bound(current[key], depth + 1)]));
  };
  return bound(value, 0);
}

// The function declaration that runs `script` (a function body) with `binding` declared before it and its value
// projected (runUserScript, without the vendor's with-scope membrane).
function userFunction(script, binding) {
  return `async function (...__cuaArguments) {
  const __name = (target) => target;
  ${binding}
  const __cuaValue = await (async function () {
    "use strict";
${script}
  }).apply(globalThis, __cuaArguments);
  return (${projectResult.toString()})(__cuaValue, ${JSON.stringify(RESULT_LIMITS)},
    element => (${isProtectedCredentialField.toString()})(element, ${JSON.stringify(CREDENTIAL_FIELDS)}));
}`;
}

// The value of a by-value Runtime result, or the page's exception as the vendor words it (lM, _Z).
function evaluationValue(result) {
  if (result.exceptionDetails != null) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Runtime.evaluate failed');
  }
  const remote = result.result;
  if (remote == null) return undefined;
  if (remote.unserializableValue == null) return remote.value;
  switch (remote.unserializableValue) {
    case '-0': return -0;
    case 'NaN':
    case 'Infinity':
    case '-Infinity': return null;
    default: return /^-?\d+n$/.test(remote.unserializableValue) ? remote.unserializableValue.slice(0, -1) : remote.unserializableValue;
  }
}

// A CDP failure's own sentence: the extension relays Chrome's protocol errors as JSON ({code, message}).
function cdpSentence(error) {
  const message = messageOf(error);
  try {
    const parsed = JSON.parse(message);
    if (typeof parsed?.message === 'string') return parsed.message;
  } catch {}
  return message;
}

// What a failure after the script's dispatch reports: the budget's sentence or the cause's, and that it was not rerun.
function interrupted(error, deadline) {
  const timedOut = deadline.expired() || (error instanceof BrowserServiceError && error.code === 'timeout');
  const sentence = timedOut ? DEADLINE_SENTENCE : `playwright.evaluate was interrupted: ${cdpSentence(error).replace(/\.$/, '')}`;
  return new BrowserServiceError('evaluate_interrupted', `${sentence}. ${NOT_RUN_AGAIN}`, {cause: error});
}

const isResolveAllResult = frame => frame != null && typeof frame === 'object' && Array.isArray(frame.handles) && frame.documentBackendNodeId != null;
const isElementHandle = frame => frame != null && typeof frame === 'object' && typeof frame.backendNodeId === 'number' && frame.target != null;

export class PageEvaluator {
  // `cdp` the backend's CdpController, `selectors` its SelectorEngine.
  constructor(cdp, selectors) {
    this.cdp = cdp;
    this.selectors = selectors;
  }

  cdp;
  selectors;
  groups = 0;

  // Runs `script` once in the page's main world -> the projection of its value. See the module header for `frame`.
  async evaluateInPage(frame, script, args = [], {deadline = new Deadline(clamp(undefined))} = {}) {
    checkScript(script);
    if (!Array.isArray(args)) throw new TypeError('evaluateInPage args must be an array');
    const bound = attemptBudget(deadline);
    if (isResolveAllResult(frame)) return await this.evaluateOnElements(frame, script, args, bound);
    if (isElementHandle(frame)) return await this.evaluateOnElement(frame, script, args, bound);
    const given = typeof frame === 'object' && frame != null ? frame : {tabId: frame};
    if (given.frameId != null) throw new TypeError('evaluateInPage evaluates a child frame through an element or a resolveAll result');
    const target = {tabId: tabIdOf(given.tabId), ...(given.sessionId != null ? {sessionId: given.sessionId} : given.targetId != null ? {targetId: given.targetId} : {})};
    return await this.dispatch(target, 'Runtime.evaluate', {
      expression: `(${userFunction(script, '')})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true, userGesture: true,
      timeout: bound.timeoutMs(),
    }, bound);
  }

  // The locator form: the selector resolved (polled, never past the budget), its element resolved in the page's world,
  // then the script dispatched once (bZ without its retries of the script). Resolution and the script share one attempt
  // budget, so a zero budget is one 3 s attempt in all.
  async evaluateOnSelector(selector, tabId, script, args, deadline) {
    checkScript(script);
    const bound = attemptBudget(deadline);
    const startedAt = Date.now();
    let lastFailure;
    while (true) {
      const objectGroup = `cua-evaluate-${++this.groups}`;
      let handle;
      let objectId;
      try {
        handle = await this.selectors.resolve(selector, tabId, {deadline: bound, retry: false});
        ({object: {objectId}} = await this.cdp.callTarget(handle.target, 'DOM.resolveNode', {backendNodeId: handle.backendNodeId, objectGroup}, {deadline: bound}));
      } catch (error) {
        if (handle != null) await this.releaseGroup(handle.target, objectGroup);
        const final = finalError(error);
        if (final != null) throw final;
        // The budget running out names the last real failure, not only the deadline.
        const failure = lastFailure != null && messageOf(error) === SELECTOR_DEADLINE_EXCEEDED ? lastFailure : error;
        lastFailure = failure;
        if (Date.now() - startedAt >= deadline.ms || bound.expired()) {
          throw new BrowserServiceError('timeout', `Timed out after ${deadline.ms}ms evaluating selector ${selector}: ${messageOf(failure)}`, {cause: failure});
        }
        await sleep(Math.max(1, Math.min(POLL_MS, bound.remaining())));
        continue;
      }
      try {
        return await this.callOn(handle.target, objectId, userFunction(script, 'const element = this;'), args, bound);
      } finally {
        await this.releaseGroup(handle.target, objectGroup);
      }
    }
  }

  async evaluateOnElement(handle, script, args, bound) {
    const objectGroup = `cua-evaluate-${++this.groups}`;
    try {
      const {object} = await this.cdp.callTarget(handle.target, 'DOM.resolveNode', {backendNodeId: handle.backendNodeId, objectGroup}, {deadline: bound});
      return await this.callOn(handle.target, object.objectId, userFunction(script, 'const element = this;'), args, bound);
    } finally {
      await this.releaseGroup(handle.target, objectGroup);
    }
  }

  // The 'all' form: the matches and their document resolved in the page's world of the frame the query ran in; the
  // script runs once with `elements` (also when there are none).
  async evaluateOnElements(all, script, args, bound) {
    const objectGroup = `cua-evaluate-${++this.groups}`;
    try {
      const resolve = backendNodeId => this.cdp.callTarget(all.target, 'DOM.resolveNode', {backendNodeId, objectGroup}, {deadline: bound});
      const [document, ...elements] = await Promise.all([resolve(all.documentBackendNodeId), ...all.handles.map(handle => resolve(handle.backendNodeId))]);
      const declaration = userFunction(script, `const elements = __cuaArguments.splice(0, ${elements.length});`);
      return await this.callOn(all.target, document.object.objectId, declaration, args, bound, elements.map(({object}) => ({objectId: object.objectId})));
    } finally {
      await this.releaseGroup(all.target, objectGroup);
    }
  }

  async callOn(target, objectId, functionDeclaration, args, bound, objectArguments = []) {
    return await this.dispatch(target, 'Runtime.callFunctionOn', {
      objectId, functionDeclaration, arguments: [...objectArguments, ...args.map(value => ({value}))],
      awaitPromise: true, returnByValue: true, userGesture: true,
    }, bound);
  }

  // The one dispatch of a script. The controller sends a command again after "Debugger unattached"; the dispatch hook
  // refuses that second send, so the script reaches the page at most once.
  async dispatch(target, method, params, deadline) {
    let dispatched = false;
    let result;
    try {
      result = await this.cdp.callTarget(target, method, params, {
        deadline, preserveOnTimeout: true,
        beforeDispatch: () => {
          if (dispatched) throw new Error('Debugger unattached');
          dispatched = true;
        },
      });
    } catch (error) {
      if (!dispatched) throw error;
      throw interrupted(error, deadline);
    }
    try {
      return boundResult(evaluationValue(result), RESULT_LIMITS);
    } finally {
      const owned = remoteObjects(result).filter(id => id != null);
      if (owned.length) await this.release(target, owned);
    }
  }

  async release(target, objectIds) {
    for (const objectId of objectIds) {
      await this.cdp.callTarget(target, 'Runtime.releaseObject', {objectId}, {deadline: new Deadline(RELEASE_MS)}).catch(() => {});
    }
  }

  async releaseGroup(target, objectGroup) {
    await this.cdp.callTarget(target, 'Runtime.releaseObjectGroup', {objectGroup}, {deadline: new Deadline(RELEASE_MS)}).catch(() => {});
  }
}

export const EVALUATE_HANDLERS = {
  async playwright_evaluate(params, session) {
    const tabId = tabIdOf(params.tab_id);
    const deadline = new Deadline(clamp(params.timeout_ms));
    checkScript(params.script);
    let value;
    if (params.selector_mode === 'all') {
      if (params.selector == null) throw new Error('playwright.evaluate selector_mode=all requires a selector');
      // One attempt budget for the query and the script: a zero budget's 3 s is not made twice.
      const bound = attemptBudget(deadline);
      const all = await session.selectors.resolveAll(params.selector, tabId, {deadline: bound, retry: deadline.ms > 0});
      value = await session.evaluator.evaluateInPage(all, params.script, [], {deadline: bound});
    } else if (params.selector != null) {
      value = await session.evaluator.evaluateOnSelector(params.selector, tabId, params.script, [], deadline);
    } else {
      value = await session.evaluator.evaluateInPage(tabId, params.script, [], {deadline});
    }
    return {value};
  },
};
