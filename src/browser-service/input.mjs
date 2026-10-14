// Ported from readable chatgpt-26.928.40906 BS:60345-60709 (Bf, the pointer and key input of the cua and dom_cua commands); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: the commands SC, EC, AC (BS:18604-18652), UC, qC, jC (BS:20532-20582), ay (BS:27528-27531), rf, oO, iO, sO, aO, lO,
// cO, VX and Pv (BS:46904-46996); jt, CC and Yv (BS:18514-18531, 54595-54604); sj, Ro and zu (BS:18550-18603); c_,
// AZ, PZ, kZ and IZ (BS:60264-60344); YI, ZI, QI and tR (BS:37933-38031, 38105-38107).
//
// The model's coordinate input (`tab.cua.*`) and DOM-CUA input (`tab.dom_cua.*`, by the node ids
// dom_cua_get_visible_dom lists): CDP mouse events at a viewport point, the agent's cursor aimed first (cursor.mjs),
// a click's page load waited for (up to its budget, 3 s by default); drags along a path with the left button held,
// released however the drag ends; scrolls as a synthesized mouse-wheel gesture; key presses (keyboard.mjs) with the
// clipboard shortcuts served by the virtual clipboard; typing by paste (paste.mjs). A DOM-CUA node is scrolled into
// view in its frame, its visible centre taken, and the point mapped out through its frames' owners: a node inside an
// out-of-process frame gets its events in that frame's own target, at its point there. Dropped from Bf: the in-app
// browser's rounding and closed-shadow-root guard, and its mouseWheel scrolling.
import {Deadline, LOAD_MS, clamp} from './budgets.mjs';
import {modifierMask, pressKeys} from './keyboard.mjs';
import {performClipboardShortcut, typeText} from './paste.mjs';
import {attemptBudget} from './selectors.mjs';
import {tabIdOf} from './tabs.mjs';

const isNested = target => target.sessionId != null || target.targetId != null;                                     // dt
const targetIdentity = target => `${target.tabId}:${target.sessionId ?? ''}:${target.targetId ?? ''}`;               // Uy
const sameTarget = (a, b) => targetIdentity(a) === targetIdentity(b);                                                 // tR
const buttonMask = button => (button === 'right' ? 2 : button === 'middle' ? 4 : 1);                                 // Yv
// The click's own budget: the vendor names 10 s for cua clicks, which its clamp (3 s at most) cuts to 3 s.
const CUA_CLICK_MS = clamp(10000, 3000);

function requireFinitePoint(command, point) {                                                                         // jt
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) throw new Error(`${command} requires finite x and y coordinates`);
}

function cuaButton(button) {                                                                                          // CC
  switch (button) {
    case undefined: case 1: return 'left';
    case 2: return 'middle';
    case 3: return 'right';
    default: throw new Error(`Unsupported CUA mouse button: ${button}`);
  }
}

// A DOM-CUA node id as the vendor's schema checks it (iO).
function nodeIdOf(value, command, required = true) {
  if (value === undefined) {
    if (required) throw new Error(`${command} node_id is required`);
    return undefined;
  }
  if (typeof value !== 'string') throw new Error(`${command} node_id must be a string`);
  if (value.length < 1) throw new Error(`${command} node_id must not be empty`);
  return value;
}

// The bounding box of a quad (zu), or null.
function quadBounds(quad) {
  if (quad == null || quad.length < 8) return null;
  const xs = [quad[0], quad[2], quad[4], quad[6]].filter(n => n != null);
  const ys = [quad[1], quad[3], quad[5], quad[7]].filter(n => n != null);
  if (xs.length !== 4 || ys.length !== 4) return null;
  return {bottom: Math.max(...ys), left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys)};
}

// A point in a frame's viewport, in the coordinates of the document its owner's content quad is in (Ro, sj): mapped
// across the quad by the frame's size when it is known, else offset by the quad's corner. Null without a quad.
export function pointThroughQuad(point, size, quad) {
  if (quad == null || quad.length < 8) return null;
  if (size != null) {
    const origin = {x: quad[0] ?? 0, y: quad[1] ?? 0};
    const right = {x: quad[2] ?? 0, y: quad[3] ?? 0};
    const down = {x: quad[6] ?? 0, y: quad[7] ?? 0};
    const sx = point.x / size.width;
    const sy = point.y / size.height;
    return {x: origin.x + sx * (right.x - origin.x) + sy * (down.x - origin.x), y: origin.y + sx * (right.y - origin.y) + sy * (down.y - origin.y)};
  }
  const bounds = quadBounds(quad);
  return bounds == null ? null : {x: bounds.left + point.x, y: bounds.top + point.y};
}

// --- DOM-CUA nodes --------------------------------------------------------------------------------------------------

// Runs in the frame's DOM-CUA world (PZ): the listed element scrolled into view, the centre of its first client rect
// that the listing's clip shows, or null when it is gone.
function visibleNodePoint(ref, clip) {
  const element = globalThis.__browserUseVisibleDomState?.refToElement.get(ref);
  if (!element?.isConnected) return null;
  element.scrollIntoView({block: 'nearest', inline: 'nearest'});
  const centre = rect => {
    if (rect.width <= 0 || rect.height <= 0) return null;
    const left = Math.max(rect.left, clip.left);
    const right = Math.min(rect.right, clip.right);
    const top = Math.max(rect.top, clip.top);
    const bottom = Math.min(rect.bottom, clip.bottom);
    return right > left && bottom > top ? {x: left + (right - left) / 2, y: top + (bottom - top) / 2} : null;
  };
  for (const rect of element.getClientRects()) {
    const point = centre(rect);
    if (point != null) return point;
  }
  return centre(element.getBoundingClientRect());
}

const nodePointExpression = (ref, clip) => `(() => {
    const __name = (target) => target;
    return (${visibleNodePoint.toString()})(${JSON.stringify(ref)}, ${JSON.stringify(clip)});
  })()`;                                                                                                              // AZ

const pointOf = value => (value != null && typeof value === 'object' && typeof value.x === 'number' && typeof value.y === 'number'
  ? {x: value.x, y: value.y} : null);                                                                                 // kZ
const exceptionText = details => (typeof details.exception?.value === 'string' ? details.exception.value
  : details.exception?.description ?? details.text ?? 'DOM node failed');                                             // IZ

export class CuaInput {
  // `cdp` the backend's CdpController, `cursor` its Cursor, `visibleDom` the DOM-CUA listings (visible-dom.mjs).
  constructor(cdp, cursor, visibleDom, {platform} = {}) {
    this.cdp = cdp;
    this.cursor = cursor;
    this.visibleDom = visibleDom;
    this.platform = platform;
  }

  cdp;
  cursor;
  visibleDom;
  platform;

  async dispatchKeyPress({commandName, keys, tabId}) {
    if (!Array.isArray(keys) || keys.length === 0) throw new Error(`${commandName} requires a non-empty keys array`);
    await pressKeys(this.cdp, tabIdOf(tabId), keys, {platform: this.platform});
  }

  async dispatchMouseMove(tabId, point, modifiers) {
    await this.cursor.moveMouse(tabId, point.x, point.y);
    await this.cdp.call(tabId, 'Input.dispatchMouseEvent', {type: 'mouseMoved', x: point.x, y: point.y, button: 'none', buttons: 0, modifiers});
  }

  // Clicks the listed node `nodeId` `clickCount` times.
  async clickDomCuaNode({clickCount, nodeId, tabId, timeoutMs}) {
    const {inputPoint, point, target} = await this.domCuaNodePoints(tabId, nodeId);
    await this.clickPoint({
      clickCount, ...(isNested(target) ? {inputPoint, inputTarget: target, loadTarget: target} : {}),
      modifiers: 0, point, tabId, timeoutMs: timeoutMs == null ? undefined : clamp(timeoutMs),
    });
  }

  async scrollDomCuaNode({nodeId, scrollX, scrollY, tabId}) {
    const {point} = await this.domCuaNodePoints(tabId, nodeId);
    await this.scrollPoint({modifiers: 0, point, scrollX, scrollY, tabId});
  }

  // Presses the left button at the path's first point, moves through the rest with it held and releases it at the
  // last point reached, also when a move fails.
  async dragPath({modifiers, path, tabId}) {
    const tab = tabIdOf(tabId);
    const [start, ...rest] = path;
    if (!start) throw new Error('cua_drag requires a non-empty path');
    const button = 'left';
    await this.dispatchMouseMove(tab, start, modifiers);
    await this.dispatchMouseDown({button, clickCount: 1, modifiers, point: start, target: {tabId: tab}});
    let last = start;
    let released = false;
    try {
      for (const point of rest) {
        last = point;
        await this.dispatchPressedMouseMove(tab, point, button, modifiers);
      }
      released = true;
      await this.dispatchMouseRelease({button, clickCount: 1, modifiers, point: last, target: {tabId: tab}});
    } finally {
      if (!released) await this.dispatchMouseRelease({button, clickCount: 1, modifiers, point: last, target: {tabId: tab}}).catch(() => {});
    }
  }

  async scrollPoint({modifiers, point, scrollX, scrollY, tabId}) {
    const tab = tabIdOf(tabId);
    await this.dispatchMouseMove(tab, point, modifiers);
    await this.cdp.call(tab, 'Input.synthesizeScrollGesture', {
      x: point.x, y: point.y, xDistance: scrollX === 0 ? 0 : -scrollX, yDistance: scrollY === 0 ? 0 : -scrollY,
      gestureSourceType: 'mouse', preventFling: true, speed: 8000,
    });
  }

  // Clicks at `point` (the top document's) `clickCount` times, the events going to `inputTarget` at `inputPoint` when
  // the element is in an out-of-process frame; then waits for a page load the click started. One deadline, the click's
  // budget (`timeoutMs`, clamped), bounds the whole: the cursor's acknowledgment, every Input call and the load wait
  // (also when the click fails). A load in `loadTarget` (the frame) is waited for beside the tab's.
  async clickPoint({button = 'left', clickCount, inputPoint, inputTarget, loadTarget, modifiers, point, tabId, timeoutMs}) {
    const tab = tabIdOf(tabId);
    const budget = clamp(timeoutMs);
    // An explicit zero budget is one attempt bounded by the default 3 s (the M1b ruling), not a spent deadline.
    const deadline = attemptBudget(new Deadline(budget));
    const at = inputPoint ?? point;
    const target = inputTarget ?? {tabId: tab};
    const waitFor = loadOf => this.cdp.waitForPageLoadEvent(loadOf, {timeoutMs: budget, deadline});
    const loaded = loadTarget == null || !isNested(loadTarget) ? waitFor(tab) : Promise.all([waitFor(loadTarget), waitFor(tab)]);
    try {
      await this.cursor.moveMouse(tab, point.x, point.y, {deadline});
      await this.cdp.callTarget(target, 'Input.dispatchMouseEvent', {type: 'mouseMoved', x: at.x, y: at.y, button: 'none', buttons: 0, modifiers}, {deadline});
      for (let count = 1; count <= clickCount; count += 1) {
        await this.dispatchMouseDown({button, clickCount: count, deadline, modifiers, point: at, target});
        await this.dispatchMouseRelease({button, clickCount: count, deadline, modifiers, point: at, target});
      }
    } catch (error) {
      await loaded.catch(() => {});
      throw error;
    }
    await loaded;
  }

  async dispatchMouseDown({button, clickCount, deadline, modifiers, point, target}) {
    await this.cdp.callTarget(target, 'Input.dispatchMouseEvent', {
      type: 'mousePressed', x: point.x, y: point.y, button, buttons: buttonMask(button), clickCount, modifiers,
    }, deadline === undefined ? {} : {deadline});
  }

  async dispatchMouseRelease({button, clickCount, deadline, modifiers, point, target}) {
    await this.cdp.callTarget(target, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: point.x, y: point.y, button, buttons: 0, clickCount, modifiers,
    }, deadline === undefined ? {} : {deadline});
  }

  async dispatchPressedMouseMove(tabId, point, button, modifiers) {
    await this.cursor.moveMouse(tabId, point.x, point.y, {waitForArrival: false});
    await this.cdp.call(tabId, 'Input.dispatchMouseEvent', {type: 'mouseMoved', x: point.x, y: point.y, button, buttons: buttonMask(button), modifiers});
  }

  // The listed node's point (c_): `point` in the top document, `inputPoint` in the node's own target, and that target.
  async domCuaNodePoints(tabId, nodeId) {
    const tab = tabIdOf(tabId);
    const node = this.visibleDom.node(tab, nodeId);
    const result = await this.visibleDom.evaluate(node.target, node.frameId, node.loaderId, nodePointExpression(node.localRef, node.viewportClip),
      {returnByValue: true, deadline: new Deadline(LOAD_MS)});
    if (result.exceptionDetails != null) {
      for (const objectId of new Set([result.result?.objectId, result.exceptionDetails.exception?.objectId])) {
        if (objectId != null) await this.cdp.callTarget(node.target, 'Runtime.releaseObject', {objectId}).catch(() => {});
      }
      throw new Error(exceptionText(result.exceptionDetails));
    }
    const point = pointOf(result.result?.value);
    if (point == null) throw new Error(`DOM node ${nodeId} is stale or missing`);
    return {inputPoint: await this.pointInOwnTarget(tab, node.frameId, point), point: await this.pointInTopDocument(tab, node.frameId, point), target: node.target};
  }

  // A frame's point in its own target's viewport (QI). A frame owner's content quad is already in the target's
  // viewport, so one mapping through the frame's own owner accounts for every same-target ancestor; the vendor's QI
  // mapped through each of them again (a nested same-process frame inside an out-of-process one landed off by the
  // ancestors' offsets, and its events disagreed with the cursor's point from pointInTopDocument).
  async pointInOwnTarget(tabId, frameId, point) {
    const frame = this.frameOf(tabId, frameId);
    if (frame.parentFrameId == null) return point;
    const parent = this.parentOf(tabId, frame);
    return sameTarget(frame.target, parent.target) ? await this.pointInParent(parent.target, frame, point) : point;
  }

  // A frame's point mapped out through every frame to the top document (ZI): across each frame's owner where the
  // target changes, skipping same-target ancestors whose owner the frame's own point already accounts for.
  async pointInTopDocument(tabId, frameId, point) {
    let frame = this.frameOf(tabId, frameId);
    let mapped = point;
    while (frame?.parentFrameId != null) {
      const parent = this.parentOf(tabId, frame);
      mapped = await this.pointInParent(parent.target, frame, mapped);
      frame = parent;
      while (frame.parentFrameId != null) {
        const next = this.parentOf(tabId, frame);
        if (!sameTarget(frame.target, next.target)) break;
        frame = next;
      }
    }
    return mapped;
  }

  frameOf(tabId, frameId) {
    const frame = this.visibleDom.frame(tabId, frameId);
    if (frame == null) throw new Error(`Missing DOM CUA frame ${frameId}`);
    return frame;
  }

  parentOf(tabId, frame) {
    const parent = this.visibleDom.frame(tabId, frame.parentFrameId);
    if (parent == null) throw new Error(`Missing parent DOM CUA frame ${frame.frameId}`);
    return parent;
  }

  // A point in `frame`, in its parent's document, through the frame owner's content quad (YI).
  async pointInParent(parentTarget, frame, point) {
    const {backendNodeId} = await this.cdp.callTarget(parentTarget, 'DOM.getFrameOwner', {frameId: frame.frameId});
    const {quads} = await this.cdp.callTarget(parentTarget, 'DOM.getContentQuads', {backendNodeId});
    const mapped = pointThroughQuad(point, frame.size, quads[0]);
    if (mapped == null) throw new Error(`Missing frame geometry for DOM CUA frame ${frame.frameId}`);
    return mapped;
  }
}

// --- the commands -----------------------------------------------------------------------------------------------------

// The vendor sends a typed paste and a clipboard shortcut without a budget of their own, so each CDP call is the host's
// 10 s at most; here one 10 s deadline bounds the whole operation.
const pasteDeadline = () => new Deadline(LOAD_MS);

async function keypress(commandType, params, session) {
  if (Array.isArray(params.keys) && await performClipboardShortcut({commandType, deadline: pasteDeadline(), session, keys: params.keys, tabId: params.tab_id})) return {};
  await session.input.dispatchKeyPress({commandName: commandType, keys: params.keys, tabId: params.tab_id});
  return {};
}

export const INPUT_HANDLERS = {
  async cua_click(params, session) {
    const tabId = tabIdOf(params.tab_id);
    requireFinitePoint('cua_click', params);
    await session.input.clickPoint({button: cuaButton(params.button), clickCount: 1, modifiers: modifierMask(params.keys, session.platform),
      point: {x: params.x, y: params.y}, tabId, timeoutMs: CUA_CLICK_MS});
    return {};
  },

  async cua_double_click(params, session) {
    const tabId = tabIdOf(params.tab_id);
    requireFinitePoint('cua_double_click', params);
    await session.input.clickPoint({clickCount: 2, modifiers: modifierMask(params.keys, session.platform), point: {x: params.x, y: params.y}, tabId, timeoutMs: CUA_CLICK_MS});
    return {};
  },

  async cua_drag(params, session) {
    const tabId = tabIdOf(params.tab_id);
    const modifiers = modifierMask(params.keys, session.platform);
    if (!Array.isArray(params.path) || params.path.length === 0) throw new Error('cua_drag requires a non-empty path');
    for (const point of params.path) requireFinitePoint('cua_drag', point);
    await session.input.dragPath({modifiers, path: params.path, tabId});
    return {};
  },

  async cua_keypress(params, session) { return await keypress('cua_keypress', params, session); },

  // The pointer moved to the point, the agent's cursor aimed there first (qC).
  async cua_move(params, session) {
    const tabId = tabIdOf(params.tab_id);
    requireFinitePoint('cua_move', params);
    await session.input.dispatchMouseMove(tabId, {x: params.x, y: params.y}, modifierMask(params.keys, session.platform));
    return {};
  },

  async cua_scroll(params, session) {
    const tabId = tabIdOf(params.tab_id);
    requireFinitePoint('cua_scroll', params);
    await session.input.scrollPoint({modifiers: modifierMask(params.keys, session.platform), point: {x: params.x, y: params.y},
      scrollX: params.scroll_x, scrollY: params.scroll_y, tabId});
    return {};
  },

  // Only the tab and the text reach the paste: the focused-world options are the locator actions' (fill).
  async cua_type(params, session) {
    await typeText(session, {tab_id: params.tab_id, text: params.text}, 'cua_type', {deadline: pasteDeadline()});
    return {};
  },

  async dom_cua_click(params, session) {
    const nodeId = nodeIdOf(params.node_id, 'dom_cua_click');
    await session.input.clickDomCuaNode({clickCount: 1, nodeId, tabId: tabIdOf(params.tab_id), timeoutMs: params.timeout_ms});
    return {};
  },

  async dom_cua_double_click(params, session) {
    const nodeId = nodeIdOf(params.node_id, 'dom_cua_double_click');
    await session.input.clickDomCuaNode({clickCount: 2, nodeId, tabId: tabIdOf(params.tab_id), timeoutMs: params.timeout_ms});
    return {};
  },

  async dom_cua_keypress(params, session) { return await keypress('dom_cua_keypress', params, session); },

  // At the node, or at the centre of the visual viewport when no node is named (VX).
  async dom_cua_scroll(params, session) {
    const tabId = tabIdOf(params.tab_id);
    const nodeId = nodeIdOf(params.node_id, 'dom_cua_scroll', false);
    if (nodeId != null) {
      await session.input.scrollDomCuaNode({nodeId, scrollX: params.scroll_x, scrollY: params.scroll_y, tabId});
      return {};
    }
    const {cssVisualViewport} = await session.cdp.call(tabId, 'Page.getLayoutMetrics');
    await session.input.scrollPoint({modifiers: 0, point: {x: cssVisualViewport.clientWidth / 2, y: cssVisualViewport.clientHeight / 2},
      scrollX: params.scroll_x, scrollY: params.scroll_y, tabId});
    return {};
  },

  async dom_cua_type(params, session) {
    await typeText(session, {tab_id: params.tab_id, text: params.text}, 'dom_cua_type', {deadline: pasteDeadline()});
    return {};
  },
};
