// Ported from readable chatgpt-26.928.40906 BS:55212-55721 (class Pf, the locator orchestrator: its action half, clickLocator, focusLocator, prepareLocatorFill, prepareSequentialInput, readCheckedState, performPointerAction, resolvePointerActionTarget, currentTopLevelPointForAction, currentPointInParentFrame, obstructingFrameHitTarget, obstructingFrameBoundaryHitTarget and describeBackendNodeForHitTarget); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: the commands zl, Xl (BS:43822-43862), UO, qO, Rv, zO, PJ, GO, VO and JO (BS:49616-50012); K1 (BS:56676-56732);
// z1 (BS:54588-54594); t_ and eZ (BS:54695-54716); Y1 (BS:56900-56906); aZ (BS:56913-56919).
//
// The locator actions, the vendor's way. A pointer action resolves its selector (selectors.mjs, polling until the
// command's budget: `timeout_ms`, clamped, 3 s by default and at most 120 s) with a function that requires the
// element's states (visible and enabled, unless forced), scrolls it into view, waits for its box to hold still over
// animation frames, requires the states again and takes the box's centre, mapped out through same-process frames in
// the page and through out-of-process frames by their owners' content quads; an element covering an out-of-process
// frame's owner at the point is an obstruction, tried again with the end, then the start scroll alignment, and named
// if it stays. Then the Input events go to the element's target (cursor first, page load waited for: input.mjs).
// fill selects the field's text and pastes the value over it (paste.mjs); press focuses the element and presses keys
// in its target (keyboard.mjs), a clipboard shortcut going to the virtual clipboard; pressSequentially types character
// by character, its focus checked before each, within 5 s at most; selectOption and the checked state go through the
// injected script; waitFor polls a state. Every in-page function here is ours and side-effect free until it acts, so
// the engine may retry it; a strict-mode violation or an open dialog ends the polling at once.
// Dropped from Pf: the synthetic document-scoped click (MCP-app documents), the in-app browser's input target tokens
// and box-model frame geometry, telemetry and command timing, the bound selector, the download source policy check.
import {DOWNLOAD_MS, Deadline, PRESS_SEQUENTIALLY_MS, clamp} from './budgets.mjs';
import {BrowserServiceError, isDeadlineError, serviceError} from './errors.mjs';
import {checkSelectorDeadline} from './injected.mjs';
import {pointThroughQuad} from './input.mjs';
import {modifierMask, pressKeys, typeCharacter} from './keyboard.mjs';
import {performClipboardShortcut, typeText} from './paste.mjs';
import {tabIdOf} from './tabs.mjs';

const CENTER = {block: 'center', inline: 'nearest'};                                                                 // t_
const SCROLL_ALIGNMENTS = [CENTER, {block: 'end', inline: 'end'}, {block: 'start', inline: 'start'}];               // eZ
const WAIT_FOR_STATES = new Set(['attached', 'detached', 'visible', 'hidden']);
const SEQUENTIAL_KEY_GAP_MS = 50;                                                                                    // AJ
const CLEANUP_MS = 500;

const isNested = target => target.sessionId != null || target.targetId != null;                                     // dt
const sameTarget = (a, b) => a.tabId === b.tabId && a.sessionId === b.sessionId && a.targetId === b.targetId;        // PJ
const locatorButton = button => (button === 'right' || button === 'middle' ? button : 'left');                       // z1
const budgetOf = params => new Deadline(clamp(params.timeout_ms));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const attributeOf = (attributes, name) => {                                                                          // Y1
  for (let i = 0; i < attributes.length; i += 2) if (attributes[i] === name) return attributes[i + 1];
};

// A phase of a command bounded by the command's overall deadline: what is left of it, at most `timeoutMs` clamped;
// the deadline's own error once it is spent.
function within(overall, timeoutMs) {
  checkSelectorDeadline(overall);
  return new Deadline(Math.max(1, Math.min(overall.remaining(), clamp(timeoutMs))));
}

// --- in the page (the injected script's world; called as fn(element, injected, arg, scope)) -------------------------

// The point a pointer action aims at (resolvePointerActionTarget's function): the element's states required, the
// element scrolled into view and its box let settle, the centre mapped to the routed target's viewport.
async function pointerActionPoint(element, injected, arg, scope) {
  const frames = {
    async waitForAnimationFrame() {
      await new Promise(resolve => {
        const view = element.ownerDocument?.defaultView;
        if (typeof view?.requestAnimationFrame === 'function') {
          const timer = typeof view.setTimeout === 'function' ? view.setTimeout(() => { view.cancelAnimationFrame?.(frame); resolve(); }, 50) : undefined;
          const frame = view.requestAnimationFrame(() => {
            if (timer != null) view.clearTimeout(timer);
            resolve();
          });
          return;
        }
        if (typeof view?.setTimeout === 'function') {
          view.setTimeout(resolve, 0);
          return;
        }
        resolve();
      });
    },
    sameRect(a, b) { return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height; },
    async waitForStableBoundingRect() {
      let rect = element.getBoundingClientRect();
      let stable = 0;
      for (let i = 0; i < 10; i += 1) {
        await frames.waitForAnimationFrame();
        const next = element.getBoundingClientRect();
        if (frames.sameRect(rect, next)) {
          stable += 1;
          rect = next;
          if (stable >= 2) break;
          continue;
        }
        stable = 0;
        rect = next;
      }
      return rect;
    },
  };
  const requireStates = () => {
    for (const name of arg.requiredStates) {
      const state = injected.elementState(element, name);
      if (state.received === 'error:notconnected') throw new Error('Element is not connected');
      if (!state.matches) throw new Error('Element is not ' + name);
    }
  };
  requireStates();
  element.scrollIntoView({block: arg.scrollAlignment.block, inline: arg.scrollAlignment.inline, behavior: 'instant'});
  const rect = await frames.waitForStableBoundingRect();
  requireStates();
  if (!rect || rect.width <= 0 || rect.height <= 0) throw new Error('Element does not have a clickable bounding box');
  return scope.prepareFrameChainForPointerAction({x: Math.max(0, rect.left + rect.width / 2), y: Math.max(0, rect.top + rect.height / 2)}, arg.scrollAlignment);
}

// Focuses the element for keys or a paste (K1): its frames and its states checked, the field behind a label when
// asked, scrolled into view, focused (its text selected when asked), and checked to hold the focus.
async function focusElement(element, injected, arg) {
  for (let frame = element.ownerDocument.defaultView?.frameElement; frame != null; frame = frame.ownerDocument.defaultView?.frameElement) {
    if (!injected.elementState(frame, 'visible').matches) throw new Error('Ancestor frame is not visible');
  }
  const states = ['visible', 'enabled'];
  if (arg.requireEditable) states.push('editable');
  for (const name of states) {
    const state = injected.elementState(element, name);
    if (state.received === 'error:notconnected') throw new Error('Element is not connected');
    if (!state.matches) throw new Error('Element is not ' + name);
  }
  const target = arg.retargetInput ? injected.retarget(element, 'follow-label') : element;
  if (target == null) throw new Error('Element is not connected');
  element.scrollIntoView({block: 'center', inline: 'nearest'});
  const focused = await injected.expect(target, {expression: 'to.be.focused', isNot: false});
  const outcome = arg.selectText ? injected.selectText(target) : focused.matches ? 'done' : injected.focusNode(target, false);
  if (outcome !== 'done') throw new Error(String(outcome));
  if (!(await injected.expect(target, {expression: 'to.be.focused', isNot: false})).matches) throw new Error('Element is not focused');
}

// Fills the field the injected script's way (prepareLocatorFill's function): 'done' when the value was set directly
// (dates, colours, ranges), else 'needsinput' with the field's text selected for the paste.
function prepareFill(element, injected, arg) {
  for (const name of arg.states) {
    const state = injected.elementState(element, name);
    if (state.received === 'error:notconnected') throw new Error('Element is not connected');
    if (!state.matches) throw new Error('Element is not ' + name);
  }
  element.scrollIntoView({block: 'center', inline: 'nearest'});
  const outcome = injected.fill(element, arg.value);
  if (outcome === 'error:notconnected') throw new Error('Element is not connected');
  if (outcome !== 'done' && outcome !== 'needsinput') throw new Error(outcome);
  if (outcome === 'done') return 'done';
  if ((typeof injected.retarget === 'function' ? injected.retarget(element, 'follow-label') : element) == null) throw new Error('Element is not connected');
  return outcome;
}

// Focuses the field for pressSequentially and marks it with the command's token (prepareSequentialInput's function).
function prepareSequential(element, injected, arg) {
  for (const name of arg.states) {
    const state = injected.elementState(element, name);
    if (state.received === 'error:notconnected') throw new Error('Element is not connected');
    if (!state.matches) throw new Error('Element is not ' + name);
  }
  element.scrollIntoView({block: 'center', inline: 'nearest'});
  const target = typeof injected.retarget === 'function' ? injected.retarget(element, 'follow-label') : element;
  if (target == null) throw new Error('Element is not connected');
  if (!target.matches(':focus')) {
    const outcome = injected.focusNode(target, false);
    if (outcome !== 'done') throw new Error(String(outcome));
  }
  Object.defineProperty(target, '__codexPressSequentiallyTargetToken', {configurable: true, value: arg.targetToken});
  return true;
}

// Whether the marked field still holds the focus, through its shadow roots and frames (zO's per-key check).
function holdsSequentialFocus(element, injected, arg, scope) {
  const target = typeof injected.retarget === 'function' ? injected.retarget(element, 'follow-label') : element;
  if (target == null) return false;
  const focusedThroughRoots = node => {
    let current = node;
    while (current != null) {
      const root = current.getRootNode?.();
      if (root == null || root.activeElement !== current) return false;
      if (!('host' in root)) return true;
      current = root.host;
    }
    return false;
  };
  return Object.getOwnPropertyDescriptor(target, '__codexPressSequentiallyTargetToken')?.value === arg.targetToken
    && (target.matches(':focus') || focusedThroughRoots(target))
    && scope.frameChain.every(({element: frame}) => focusedThroughRoots(frame));
}

function clearSequentialToken(element, injected, arg) {
  const target = typeof injected.retarget === 'function' ? injected.retarget(element, 'follow-label') : element;
  if (target != null && Object.getOwnPropertyDescriptor(target, '__codexPressSequentiallyTargetToken')?.value === arg.targetToken) {
    Reflect.deleteProperty(target, '__codexPressSequentiallyTargetToken');
  }
}

function selectOptions(element, injected, arg) {
  const state = injected.elementState(element, 'enabled');
  if (state.received === 'error:notconnected') throw new Error('Element is not connected');
  if (!state.matches) throw new Error('Element is not enabled');
  const selected = injected.selectOptions(element, arg.selections);
  if (typeof selected === 'string' && selected.startsWith('error:')) throw new Error(selected);
  return true;
}

function checkedState(element, injected) {
  const state = injected.elementState(element, 'checked');
  if (state.received === 'error:notconnected') throw new Error('Element is not connected');
  return {checked: !!state.matches, isRadio: !!state.isRadio};
}

function stateReached(elements, injected, arg) {
  const element = elements[0] ?? null;
  if (arg.state === 'attached') {
    if (element) return true;
    throw new Error('Element is not attached');
  }
  if (arg.state === 'detached') {
    if (!element) return true;
    throw new Error('Element is still attached');
  }
  if (!element) {
    if (arg.state === 'hidden') return true;
    throw new Error('Element is not attached');
  }
  const state = injected.elementState(element, arg.state);
  if (state.received === 'error:notconnected') throw new Error('Element is not connected');
  if (state.matches) return true;
  throw new Error('Element is not ' + arg.state);
}

// The URL of the media the element is, holds or is inside of (qO's first function).
function mediaUrl(element) {
  element.scrollIntoView({block: 'center', inline: 'nearest'});
  const media = element.closest?.('img, video, source, a[href]') ?? element.querySelector?.('img, video, source, a[href]') ?? element;
  const read = (node, name) => {
    if (name === 'src' && node.getAttribute('src')?.trim() === '') return null;
    const value = node[name];
    return typeof value === 'string' && value.length > 0 ? value : null;
  };
  const url = read(media, 'currentSrc') ?? read(media, 'src') ?? read(media, 'href') ?? '';
  if (!url) throw new Error('Matched element does not expose a downloadable URL');
  return url;
}

// Clicks a hidden download link for `url` beside the element (qO's second function).
function clickDownloadLink(element, injected, url) {
  const link = element.ownerDocument.createElement('a');
  link.href = url;
  link.download = url.split('/').pop()?.split('?')[0] || 'download';
  link.rel = 'noopener';
  link.style.display = 'none';
  element.ownerDocument.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

// --- in node ----------------------------------------------------------------------------------------------------------

// The point a pointer action dispatches at (resolvePointerActionTarget): {point (the top document's), inputPoint and
// inputTarget (the element's own target's), target, frameBoundaries (each out-of-process frame crossed)}.
async function resolvePointerActionTarget(session, params, {requiredStates, scrollAlignment}) {
  const tabId = tabIdOf(params.tab_id);
  const resolved = await session.selectors.evaluateOnSelector(params.selector, tabId, pointerActionPoint,
    {arg: {requiredStates, scrollAlignment: scrollAlignment ?? CENTER}, deadline: budgetOf(params)});
  const top = await currentTopLevelPointForAction(session, resolved.result, resolved.oopifFrameChain, {deadline: budgetOf(params)});
  return {frameBoundaries: top.frameBoundaries, inputPoint: resolved.result, inputTarget: resolved.target, point: top.point, target: resolved.target};
}

// A point in the innermost out-of-process frame, mapped out through each frame's owner to the top document.
async function currentTopLevelPointForAction(session, point, oopifFrameChain, options) {
  if (!oopifFrameChain?.length) return {frameBoundaries: [], point};
  let mapped = point;
  const frameBoundaries = [];
  for (const frame of oopifFrameChain.slice().reverse()) {
    const outer = await currentPointInParentFrame(session, frame, mapped, options);
    mapped = outer.point;
    frameBoundaries.push({frame, ownerBackendNodeId: outer.backendNodeId, point: mapped});
  }
  return {frameBoundaries, point: mapped};
}

async function currentPointInParentFrame(session, frame, point, options) {
  if (frame.frameId == null) throw new Error('Cannot recompute OOPIF frame offset without a frame id');
  const {backendNodeId} = await session.cdp.callTarget(frame.parentTarget, 'DOM.getFrameOwner', {frameId: frame.frameId}, options);
  const {quads} = await session.cdp.callTarget(frame.parentTarget, 'DOM.getContentQuads', {backendNodeId}, options);
  const mapped = pointThroughQuad(point, frame.size, quads[0]);
  if (mapped == null) throw new Error('Frame owner does not have content quads');
  return {backendNodeId, point: mapped};
}

// The element covering a crossed frame's owner at the point, described, or null (innermost boundary first).
async function obstructingFrameHitTarget(session, resolved, options) {
  for (const boundary of resolved.frameBoundaries.slice().reverse()) {
    const obstruction = await obstructingFrameBoundaryHitTarget(session, boundary, options);
    if (obstruction != null) return obstruction;
  }
  return null;
}

// The vendor treats any failure of the hit test as no obstruction. Here only a lookup that found nothing is: an open
// dialog and a spent budget end the action before anything is dispatched (the M1a rulings).
const endsAction = error => (error instanceof BrowserServiceError && (error.code === 'dialog_open' || error.code === 'timeout'))
  || isDeadlineError(error);

async function obstructingFrameBoundaryHitTarget(session, boundary, options) {
  let hit;
  try {
    hit = await session.cdp.callTarget(boundary.frame.parentTarget, 'DOM.getNodeForLocation',
      {x: Math.round(boundary.point.x), y: Math.round(boundary.point.y), includeUserAgentShadowDOM: true}, options);
  } catch (error) {
    if (endsAction(error)) throw error;
    return null;
  }
  if (hit.backendNodeId === boundary.ownerBackendNodeId || hit.frameId === boundary.frame.frameId) return null;
  return await describeHitTarget(session, boundary.frame.parentTarget, hit.backendNodeId, options);
}

async function describeHitTarget(session, target, backendNodeId, options) {
  try {
    const {node} = await session.cdp.callTarget(target, 'DOM.describeNode', {backendNodeId}, options);
    const tag = node.localName || node.nodeName?.toLowerCase() || 'unknown';
    const attributes = Array.isArray(node.attributes) ? node.attributes : [];
    const id = attributeOf(attributes, 'id');
    const classes = attributeOf(attributes, 'class');
    return `<${tag}${id ? `#${id}` : ''}${classes ? `.${classes.trim().split(/\s+/).slice(0, 3).join('.')}` : ''}>`;
  } catch (error) {
    if (endsAction(error)) throw error;
    return 'another element';
  }
}

// Resolves the pointer target with each scroll alignment until no element covers it, then dispatches.
async function performPointerAction(session, params, {actionName, dispatch, force, requiredStates, timeoutMs}) {
  let obstruction = null;
  for (const scrollAlignment of force ? [CENTER] : SCROLL_ALIGNMENTS) {
    const resolved = await resolvePointerActionTarget(session, params, {requiredStates, scrollAlignment});
    obstruction = force ? null : await obstructingFrameHitTarget(session, resolved, {deadline: new Deadline(timeoutMs)});
    if (obstruction == null) {
      await dispatch(resolved);
      return;
    }
  }
  throw new Error(`Element does not receive pointer events at the ${actionName} point; ${obstruction ?? 'another element'} intercepts the ${actionName}`);
}

async function clickLocator(session, params, clickCount) {
  const tabId = tabIdOf(params.tab_id);
  const timeoutMs = clamp(params.timeout_ms);
  const button = locatorButton(params.button);
  const modifiers = modifierMask(params.modifiers, session.platform);
  const force = params.force === true;
  await performPointerAction(session, params, {
    actionName: clickCount === 1 ? 'click' : 'dblclick',
    dispatch: async resolved => {
      await session.input.clickPoint({
        button, clickCount, ...(isNested(resolved.target) ? {inputPoint: resolved.inputPoint, inputTarget: resolved.inputTarget, loadTarget: resolved.target} : {}),
        modifiers, point: resolved.point, tabId, timeoutMs,
      });
    },
    force, requiredStates: force ? [] : ['visible', 'enabled'], timeoutMs,
  });
}

// Focuses the locator's element -> {executionContextId, target} of the world it was focused from. The resolution polls
// within `deadline` when one is given (a clipboard shortcut's, which already began), else its own caller-sized budget.
async function focusLocator(session, params, {requireEditable, selectText, deadline}) {
  const {executionContextId, target} = await session.selectors.evaluateOnSelector(params.selector, tabIdOf(params.tab_id), focusElement,
    {arg: {requireEditable, selectText, retargetInput: requireEditable || selectText === true}, deadline: deadline ?? budgetOf(params)});
  return {executionContextId, target};
}

async function readCheckedState(session, params) {
  return (await session.selectors.evaluateOnSelector(params.selector, tabIdOf(params.tab_id), checkedState, {deadline: budgetOf(params)})).result;
}

export const ACTION_HANDLERS = {
  async playwright_locator_click(params, session) {
    await clickLocator(session, params, 1);
    return {};
  },

  async playwright_locator_dblclick(params, session) {
    await clickLocator(session, params, 2);
    return {};
  },

  // fill (replace) and locator.type (no replace): the field focused, or its text selected, then the value pasted.
  async playwright_locator_fill(params, session) {
    if (typeof params.value !== 'string') throw new Error('playwright_locator_fill requires string value');
    const replace = params.replace !== false;
    const tabId = tabIdOf(params.tab_id);
    const prepared = replace
      ? await session.selectors.evaluateOnSelector(params.selector, tabId, prepareFill,
        {arg: {states: ['visible', 'enabled', 'editable'], value: params.value}, deadline: budgetOf(params)})
      : await focusLocator(session, params, {requireEditable: true});
    if (prepared.result === 'done') return {};
    // The paste is a phase of its own, with the caller's budget, as the selection was.
    await typeText(session, {executionContextId: prepared.executionContextId, target: prepared.target, includeRichText: false,
      replaceInputValue: replace, tab_id: params.tab_id, text: params.value}, 'playwright_locator_fill', {deadline: budgetOf(params)});
    return {};
  },

  async playwright_locator_press(params, session) {
    if (typeof params.value !== 'string' || !params.value) throw new Error('playwright_locator_press requires value');
    const tabId = tabIdOf(params.tab_id);
    const deadline = budgetOf(params);
    const focus = async (forPaste, within) => await focusLocator(session, params, {requireEditable: false, deadline: within});
    if (await performClipboardShortcut({commandType: 'playwright_locator_press', deadline, session, keys: params.value, tabId, focusTarget: focus})) return {};
    const focused = await focus();
    await pressKeys(session.cdp, focused.target, params.value, {deadline, platform: session.platform});
    return {};
  },

  // Each character a key press (or inserted text) into the focused field, 50 ms apart, the field's focus checked
  // before each; the whole within 5 s at most (zO), whatever the caller asks.
  async playwright_locator_press_sequentially(params, session) {
    if (typeof params.value !== 'string') throw new Error('playwright_locator_press_sequentially requires string value');
    const tabId = tabIdOf(params.tab_id);
    const overall = new Deadline(clamp(params.timeout_ms ?? PRESS_SEQUENTIALLY_MS, PRESS_SEQUENTIALLY_MS));
    const targetToken = crypto.randomUUID();
    const prepared = await session.selectors.evaluateOnSelector(params.selector, tabId, prepareSequential,
      {arg: {states: ['visible', 'enabled', 'editable'], targetToken}, deadline: within(overall, params.timeout_ms)});
    const characters = Array.from(params.value);
    try {
      for (const [index, character] of characters.entries()) {
        const check = await session.selectors.evaluateOnSelector(params.selector, tabId, holdsSequentialFocus,
          {arg: {targetToken}, deadline: within(overall, params.timeout_ms), retry: false});
        if (!check.result || !sameTarget(prepared.target, check.target)) throw new Error('pressSequentially target changed or lost focus while typing');
        await typeCharacter(session.cdp, prepared.target, character, {deadline: overall, platform: session.platform});
        if (index < characters.length - 1) await sleep(SEQUENTIAL_KEY_GAP_MS);
      }
    } finally {
      await session.selectors.evaluateOnSelector(params.selector, tabId, clearSequentialToken,
        {arg: {targetToken}, deadline: new Deadline(CLEANUP_MS), retry: false}).catch(() => {});
    }
    return {};
  },

  async playwright_locator_select_option(params, session) {
    await session.selectors.evaluateOnSelector(params.selector, tabIdOf(params.tab_id), selectOptions,
      {arg: {selections: params.selections ?? []}, deadline: budgetOf(params)});
    return {};
  },

  async playwright_locator_set_checked(params, session) {
    if (typeof params.checked !== 'boolean') throw new Error('playwright_locator_set_checked requires checked');
    const current = await readCheckedState(session, params);
    if (current.checked === params.checked) return {};
    if (current.isRadio && !params.checked) throw new Error('Cannot uncheck a radio button');
    await clickLocator(session, params, 1);
    if ((await readCheckedState(session, params)).checked !== params.checked) throw new Error(`Click did not change checked state to ${String(params.checked)}`);
    return {};
  },

  async playwright_locator_wait_for(params, session) {
    const state = params.state ?? 'visible';
    if (!WAIT_FOR_STATES.has(state)) throw new Error(`Unsupported waitFor state: ${String(state)}`);
    await session.selectors.evaluateOnSelectorAll(params.selector, tabIdOf(params.tab_id), stateReached, {arg: {state}, deadline: budgetOf(params)});
    return {};
  },

  // The locator half: the media's URL and frame found, a download link for it clicked, all within the command's
  // budget (`timeout_ms`, 120 s by default and at most). The downloads half (the session's downloads: the armed
  // interception, the wait and the file's path) is M2's; until it is there the command is not served.
  async playwright_locator_download_media(params, session) {
    const tabId = tabIdOf(params.tab_id);
    const downloads = session.downloads;
    if (downloads == null) throw serviceError('unsupported_command', 'playwright_locator_download_media');
    return await downloads.withDownload(tabId, async () => {
      const budget = clamp(params.timeout_ms ?? DOWNLOAD_MS, DOWNLOAD_MS);
      const deadline = new Deadline(budget);
      const left = () => {
        const ms = deadline.remaining();
        if (ms <= 0) throw new Error(`Timed out after ${budget}ms downloading media.`);
        return ms;
      };
      const {frameId} = await session.selectors.resolve(params.selector, tabId, {deadline: new Deadline(clamp(left()))});
      const {result: url} = await session.selectors.evaluateOnSelector(params.selector, tabId, mediaUrl, {deadline: new Deadline(clamp(left()))});
      if (frameId == null) throw new Error('Could not determine the media frame');
      left();
      const release = await downloads.enableMediaDownload(tabId, url, frameId);
      try {
        await session.selectors.evaluateOnSelector(params.selector, tabId, clickDownloadLink, {arg: url, deadline: new Deadline(clamp(left()))});
        return {path: (await downloads.waitForDownload(tabId, left())).filename};
      } finally {
        await release();
      }
    });
  },
};
