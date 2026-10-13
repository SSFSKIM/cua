// Ported from readable chatgpt-26.928.40906 BS:38149-38900 (iR, aR, qz, Wy, lR, Hy, jz, cR, Hz, $y, zy, $z, zz, Gz, Vz, Kz, Xz, Jz and uR: dom_cua_get_visible_dom); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: kz, Iz, Rz, GI, VI, KI, XI, JI, Cs, $I, zI, Dz, eR, Uy and Bz (BS:37847-38113); qy and jy (BS:38006-38030);
// the constants Oz, Mz, Nz, Lz, jl, Wl, nR, rR and oR (BS:38114-38148); aC (BS:10598).
//
// `dom_cua_get_visible_dom`: one line per interactive element a person could see in the viewport (links, buttons,
// fields, elements with a role, a tabindex or an onclick handler, editable content), rendered as a tag with a few
// attributes and up to 160 characters of its text, frames included (each visible iframe's listing clipped to the
// part of it the viewport shows; child frames get one second in all, half a second per call). The listing stops at
// 20,000 characters or 200 elements: fixed, because the unchanged client's get_visible_dom() cannot carry an option
// (the spec's "Not lifted"). Every element is numbered: `node_id=<n>` is a public id, stable while the frame's
// document lives, that the DOM-CUA actions (M1c) resolve with `node(tabId, id)`. The listing's page function runs
// in an isolated world of its own per frame document, `cua-browser-dom-cua`, which keeps the elements the ids name.
// Dropped from aR: the Auto-review reviewer's listing (reviewerOnly, capturedFrameIds) and the credential frame it
// prioritised; the in-app browser's frame limits.
import {Deadline, LOAD_MS} from './budgets.mjs';
import {CREDENTIAL_FIELDS, isProtectedCredentialField} from './injected.mjs';
import {tabIdOf} from './tabs.mjs';

export const DOM_WORLD_NAME = 'cua-browser-dom-cua';                                                                  // Rz
const WORLD_LIMIT = 50;                                                                                                // kz
const PUBLIC_ID_LIMIT = 5000;                                                                                          // Iz
const MAX_CHARS = 20000;                                                                                               // jl
const MAX_ELEMENTS = 200;                                                                                              // Wl
const CHILD_CALL_MS = 500;                                                                                             // nR
const CHILD_FRAMES_MS = 1000;                                                                                          // rR
const OVERLAY_ROOT_ID = 'codex-agent-overlay-root';                                                                    // aC
const PAGE_OPTIONS = Object.freeze({
  booleanAttributeNames: ['checked', 'disabled', 'multiple', 'readonly', 'required', 'selected'],                     // Nz
  codexOverlayRootId: OVERLAY_ROOT_ID,
  interactiveRoleNames: ['button', 'checkbox', 'combobox', 'link', 'menuitem', 'option', 'radio', 'slider', 'spinbutton', 'switch', 'tab', 'textbox'],  // Lz
  interactiveTags: ['a', 'button', 'details', 'input', 'option', 'select', 'summary', 'textarea'],                     // Oz
  renderedAttributeNames: ['aria-disabled', 'aria-label', 'contenteditable', 'href', 'name', 'placeholder', 'role', 'title', 'type', 'value'],  // Mz
});

const isContextLost = error => /Cannot find context|Execution context was destroyed|context.*destroyed|context.*not found/i.test(
  error instanceof Error ? error.message : String(error));                                                             // Bz
const targetIdentity = target => `${target.tabId}:${target.sessionId ?? ''}:${target.targetId ?? ''}`;              // Uy
const roomLeft = output => output.lines.length < MAX_ELEMENTS && output.chars < MAX_CHARS;                            // Hy
const childCallMs = until => Math.max(1, Math.min(CHILD_CALL_MS, until - Date.now()));                                 // $y

// The part of `clip` inside `viewport`, or null (qy); a rect's visible part in its own coordinates, or null (jy).
function intersect(clip, viewport) {
  const r = {bottom: Math.min(clip.bottom, viewport.bottom), left: Math.max(clip.left, viewport.left), right: Math.min(clip.right, viewport.right), top: Math.max(clip.top, viewport.top)};
  return r.right > r.left && r.bottom > r.top ? r : null;
}
function clipInside(rect, clip) {
  const r = intersect(rect, clip);
  return r == null ? null : {bottom: r.bottom - rect.top, left: r.left - rect.left, right: r.right - rect.left, top: r.top - rect.top};
}

// The page function's answer, checked (zz, Gz, Vz, Kz, Xz).
const finite = value => typeof value === 'number' && Number.isFinite(value);
const isRect = r => r != null && typeof r === 'object' && finite(r.bottom) && finite(r.left) && finite(r.right) && finite(r.top);
const isSize = s => s != null && typeof s === 'object' && finite(s.height) && s.height > 0 && finite(s.width) && s.width > 0;
function listingOf(value) {
  if (value == null || typeof value !== 'object' || !Array.isArray(value.items) || value.viewport == null) return null;
  return {
    frameElements: Array.isArray(value.frameElements) ? value.frameElements.filter(f => f != null && typeof f === 'object' && typeof f.ref === 'string'
      && isRect(f.rect) && (f.size == null || isSize(f.size)) && (f.url == null || typeof f.url === 'string')) : [],
    items: value.items.filter(item => item != null && typeof item === 'object' && typeof item.ref === 'string' && typeof item.line === 'string'),
    viewport: value.viewport,
  };
}

const exceptionText = details => (typeof details.exception?.value === 'string' ? details.exception.value
  : details.exception?.description ?? details.text ?? 'Visible DOM evaluation failed');                               // uR

// Runs in the frame's DOM-CUA world (Jz): the frame's visible interactive elements, numbered by the world's own refs,
// and its visible frame elements.
function visibleElements(options, isProtected, credentialFields) {
  const interactiveTags = new Set(options.interactiveTags);
  const interactiveRoles = new Set(options.interactiveRoleNames);
  const frameElements = [];
  const items = [];
  let chars = 0;
  let truncated = false;
  const state = (globalThis.__browserUseVisibleDomState ??= {elementToRef: new WeakMap(), nextId: 1, refToElement: new Map()});
  state.refToElement.clear();
  const visual = window.visualViewport;
  const viewport = visual
    ? {bottom: visual.offsetTop + visual.height, left: visual.offsetLeft, right: visual.offsetLeft + visual.width, top: visual.offsetTop}
    : {bottom: window.innerHeight, left: 0, right: window.innerWidth, top: 0};
  const clip = options.viewportClip == null ? viewport : {
    bottom: Math.min(viewport.bottom, options.viewportClip.bottom), left: Math.max(viewport.left, options.viewportClip.left),
    right: Math.min(viewport.right, options.viewportClip.right), top: Math.max(viewport.top, options.viewportClip.top),
  };
  const tagOf = element => (element.localName || element.nodeName || '').toLowerCase();
  const skippedText = new Set(['noscript', 'script', 'style', 'template']);
  const isOverlay = element => element.getAttribute('id') === options.codexOverlayRootId;
  const isInteractive = element => {
    const tag = tagOf(element);
    if (element.getAttribute('aria-hidden') === 'true' || element.hasAttribute('hidden') || (tag === 'input' && element.getAttribute('type') === 'hidden')) return false;
    const editable = element.getAttribute('contenteditable');
    const role = element.getAttribute('role');
    return interactiveTags.has(tag) || (editable != null && editable.toLowerCase() !== 'false') || element.hasAttribute('href')
      || element.hasAttribute('onclick') || (role != null && interactiveRoles.has(role.trim().toLowerCase()))
      || Number(element.getAttribute('tabindex') ?? -1) >= 0;
  };
  const isFrame = element => {
    const tag = tagOf(element);
    return tag === 'frame' || tag === 'iframe';
  };
  const visibleRect = element => {
    const style = window.getComputedStyle(element);
    if (style.visibility !== 'visible' || style.display === 'none' || style.pointerEvents === 'none' || Number(style.opacity) <= 0.01) return null;
    for (const rect of element.getClientRects()) {
      if (!(rect.width <= 0) && !(rect.height <= 0) && !(rect.right <= clip.left) && !(rect.left >= clip.right) && !(rect.bottom <= clip.top) && !(rect.top >= clip.bottom)) {
        return {bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top};
      }
    }
    return null;
  };
  const collapse = text => text.replace(/\s+/g, ' ').trim();
  const escape = text => text.replace(/[\t\n\f\r]+/g, ' ').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const textOf = element => {
    const parts = [];
    let length = 0;
    const visit = node => {
      if (length >= 160) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = collapse(node.nodeValue || '');
        if (text.length > 0) {
          parts.push(text);
          length += text.length + 1;
        }
        return;
      }
      if (node.nodeType === Node.ELEMENT_NODE && skippedText.has(tagOf(node))) return;
      if (node instanceof HTMLTextAreaElement) {
        if (isProtected(node, credentialFields)) return;
        const text = collapse(node.value);
        if (text.length > 0) {
          parts.push(text);
          length += text.length + 1;
        }
        return;
      }
      for (const child of node.childNodes || []) {
        if (length >= 160) break;
        visit(child);
      }
      if (node.nodeType === Node.ELEMENT_NODE && node.shadowRoot) {
        for (const child of node.shadowRoot.childNodes) {
          if (length >= 160) break;
          visit(child);
        }
      }
    };
    visit(element);
    return collapse(parts.join(' ')).slice(0, 160);
  };
  const refOf = element => {
    let ref = state.elementToRef.get(element);
    if (ref == null) {
      ref = String(state.nextId++);
      state.elementToRef.set(element, ref);
    }
    return ref;
  };
  const lineOf = (element, ref) => {
    const tag = tagOf(element);
    const attributes = [`node_id=${ref}`];
    for (const name of options.renderedAttributeNames) {
      if (name === 'value' && isProtected(element, credentialFields)) {
        if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) && element.value) {
          attributes.push('value="<redacted>"');
        }
        continue;
      }
      const value = name === 'value' && ((element instanceof HTMLInputElement && element.type !== 'checkbox' && element.type !== 'radio') || element instanceof HTMLSelectElement)
        ? element.value : element.getAttribute(name);
      if (value != null && value !== '') attributes.push(`${name}="${escape(value)}"`);
    }
    for (const name of options.booleanAttributeNames) {
      if (name === 'checked' && element instanceof HTMLInputElement ? element.checked
        : name === 'selected' && element instanceof HTMLOptionElement ? element.selected : element.hasAttribute(name)) {
        attributes.push(`${name}="true"`);
      }
    }
    if (element instanceof HTMLInputElement && element.indeterminate) attributes.push('indeterminate="true"');
    const text = textOf(element);
    return text.length === 0 ? `<${tag} ${attributes.join(' ')} />` : `<${tag} ${attributes.join(' ')}>${escape(text)}</${tag}>`;
  };
  const full = () => truncated || items.length >= options.maxElements || chars >= options.maxChars;
  const addItem = element => {
    if (full()) return;
    const ref = refOf(element);
    const line = lineOf(element, ref);
    const added = line.length + (items.length === 0 ? 0 : 1);
    if (chars + added > options.maxChars) {
      truncated = true;
      return;
    }
    items.push({line, ref});
    state.refToElement.set(ref, element);
    chars += added;
  };
  const addFrame = element => {
    if (frameElements.length >= options.maxElements) return;
    const rect = visibleRect(element);
    if (rect == null) return;
    const ref = refOf(element);
    if (frameElements.some(frame => frame.ref === ref)) return;
    const src = element.src;
    const width = element.clientWidth > 0 ? element.clientWidth : rect.right - rect.left;
    const height = element.clientHeight > 0 ? element.clientHeight : rect.bottom - rect.top;
    frameElements.push({rect, ref, size: {height, width}, ...(src.length > 0 ? {url: src} : {})});
    state.refToElement.set(ref, element);
  };
  const walk = node => {
    if (full()) return;
    if (node.nodeType === Node.DOCUMENT_NODE) {
      if (node.documentElement) walk(node.documentElement);
      return;
    }
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      for (const child of node.children) {
        if (full()) break;
        walk(child);
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || isOverlay(node)) return;
    if (isFrame(node)) addFrame(node);
    if (isInteractive(node) && visibleRect(node) != null) addItem(node);
    if (node.shadowRoot && !full()) walk(node.shadowRoot);
    for (const child of node.children) {
      if (full()) break;
      walk(child);
    }
  };
  walk(document);
  return {frameElements, items, viewport};
}

const listingExpression = (maxChars, maxElements, viewportClip) => `(() => {
    const __name = (target) => target;
    return (${visibleElements.toString()})(
      ${JSON.stringify({...PAGE_OPTIONS, maxChars, maxElements, viewportClip})},
      ${isProtectedCredentialField.toString()},
      ${JSON.stringify(CREDENTIAL_FIELDS)},
    );
  })()`;

// The element a frame's listing numbered `ref` (Hz).
const elementExpression = ref => `(() => {
    const __name = (target) => target;
    const state = globalThis.__browserUseVisibleDomState;
    return state?.refToElement?.get(${JSON.stringify(ref)}) ?? null;
  })()`;

// The DOM-CUA listings of one CDP controller: the per-tab registry of public node ids and the frames they live in
// (jn), and the frames' DOM-CUA worlds (qn).
export class VisibleDom {
  constructor(cdp) {
    this.cdp = cdp;
    cdp.addTabCleanupHandler(tabId => {                                                                                // GI
      this.tabs.delete(tabId);
      for (const key of this.worlds.keys()) if (key.startsWith(`${tabId}:`)) this.worlds.delete(key);
    });
  }

  cdp;
  tabs = new Map();              // tabId -> {mainFrameKey, framesById, nextPublicId, nodeByPublicId, publicIdByFrameLocalRef}
  worlds = new Map();            // `${target}:${frameId}:${loaderId}` -> {executionContextId}

  // The listing of tab `tabId` (aR): its main frame, then its visible child frames.
  async listing(tabId, {deadline = new Deadline(LOAD_MS)} = {}) {
    const {frameTree} = await this.cdp.call(tabId, 'Page.getFrameTree', undefined, {deadline});
    this.resetTab(tabId, `${frameTree.frame.id}:${frameTree.frame.loaderId ?? ''}`);
    const output = {chars: 0, lines: []};
    const top = await this.listFrame({
      childFrameDeadline: Date.now() + CHILD_FRAMES_MS, deadline, output, tabId, viewportClip: undefined,
      frameReference: {frameId: frameTree.frame.id, loaderId: frameTree.frame.loaderId, target: {tabId}},
    });
    if (top?.viewportClip == null || !roomLeft(output)) return output.lines.join('\n');
    await this.listChildFrames({
      childFrames: top.childFrames, childFrameDeadline: Math.min(Date.now() + CHILD_FRAMES_MS, deadline.at),
      frameReference: top.frame, output, tabId, viewportClip: top.viewportClip,
    });
    return output.lines.join('\n');
  }

  // The element a listing numbered `publicId` in tab `tabId`: {frameId, loaderId, localRef, target, viewportClip} (JI).
  node(tabId, publicId) {
    const node = this.tabs.get(tabId)?.nodeByPublicId.get(String(publicId));
    if (node == null) throw new Error(`DOM node ${publicId} is stale or missing`);
    return node;
  }

  // The frame a listing reached, as {frameId, loaderId?, parentFrameId?, size?, target}, or undefined.
  frame(tabId, frameId) { return this.tabs.get(tabId)?.framesById.get(frameId); }

  // Runtime.evaluate of `expression` in the frame's DOM-CUA world, the world made again once when its context is
  // gone (Cs). Only the listing's own side-effect-free expressions come here.
  async evaluate(target, frameId, loaderId, expression, {returnByValue, deadline}) {
    let world = await this.world(target, frameId, loaderId, deadline);
    try {
      return await this.evaluateInWorld(target, world, expression, {returnByValue, deadline});
    } catch (error) {
      if (!isContextLost(error)) throw error;
      this.worlds.delete(`${targetIdentity(target)}:${frameId}:${loaderId ?? ''}`);
      world = await this.world(target, frameId, loaderId, deadline);
      return await this.evaluateInWorld(target, world, expression, {returnByValue, deadline});
    }
  }

  // --- the listing's steps ------------------------------------------------------------------------------------------

  resetTab(tabId, mainFrameKey) {                                                                                      // VI
    const known = this.tabs.get(tabId);
    const state = known?.mainFrameKey === mainFrameKey ? known
      : {framesById: new Map(), mainFrameKey, nextPublicId: 1, nodeByPublicId: new Map(), publicIdByFrameLocalRef: new Map()};
    state.framesById.clear();
    state.nodeByPublicId.clear();
    if (state.publicIdByFrameLocalRef.size > PUBLIC_ID_LIMIT) {
      state.publicIdByFrameLocalRef.clear();
      state.nextPublicId = 1;
    }
    this.tabs.set(tabId, state);
  }

  publicId(tabId, frame, localRef, viewportClip) {                                                                     // XI
    const state = this.tabs.get(tabId);
    if (state == null) throw new Error('DOM CUA snapshot state is missing');
    const key = `${frame.frameId}:${frame.loaderId ?? ''}:${localRef}`;
    let id = state.publicIdByFrameLocalRef.get(key);
    if (id == null) {
      id = String(state.nextPublicId++);
      state.publicIdByFrameLocalRef.set(key, id);
    }
    state.nodeByPublicId.set(id, {frameId: frame.frameId, loaderId: frame.loaderId, localRef, target: frame.target, viewportClip});
    return id;
  }

  // One frame's lines, within what is left of the caps (Wy) -> {childFrames, frame, viewportClip}, or null when it was
  // not read (a child frame's failure is not the listing's).
  async listFrame({childFrameDeadline, deadline, frameReference, output, tabId, viewportClip}) {
    const isChild = frameReference.parentFrameId != null;
    if (!roomLeft(output) || (isChild && Date.now() >= childFrameDeadline)) return null;
    this.tabs.get(tabId)?.framesById.set(frameReference.frameId, frameReference);                                     // KI
    const maxElements = MAX_ELEMENTS - output.lines.length;
    const maxChars = MAX_CHARS - output.chars;
    const lineLimit = output.lines.length + maxElements;
    const charLimit = output.chars + maxChars;
    const callDeadline = isChild ? new Deadline(childCallMs(childFrameDeadline)) : deadline;
    let listing;
    try {
      listing = await this.frameListing(frameReference, maxChars, maxElements, viewportClip, callDeadline);
    } catch (error) {
      if (isChild) return null;
      throw error;
    }
    if (listing == null) return null;
    const clip = viewportClip == null ? listing.viewport : intersect(viewportClip, listing.viewport);
    if (clip == null) return {childFrames: [], frame: frameReference, viewportClip: clip};
    for (const item of listing.items) {
      if (output.lines.length >= lineLimit || output.chars >= charLimit) break;
      const id = this.publicId(tabId, frameReference, item.ref, clip);
      const line = item.line.replace(`node_id=${item.ref}`, `node_id=${id}`);
      const added = line.length + (output.lines.length === 0 ? 0 : 1);
      if (output.chars + added > charLimit) break;
      output.lines.push(line);
      output.chars += added;
    }
    return {childFrames: listing.frameElements, frame: frameReference, viewportClip: clip};
  }

  // The visible child frames' listings, depth first, until the caps or the child frames' second run out (lR).
  async listChildFrames({childFrames, childFrameDeadline, frameReference, output, tabId, viewportClip}) {
    if (!roomLeft(output)) return;
    for (const child of childFrames) {
      if (!roomLeft(output) || Date.now() >= childFrameDeadline) break;
      const clip = clipInside(child.rect, viewportClip);
      if (clip == null) continue;
      const frameId = await this.frameIdOf(frameReference, child.ref, new Deadline(childCallMs(childFrameDeadline))).catch(() => null);
      if (frameId == null) continue;
      const target = (await this.cdp.targetForFrameOrAttach(tabId, frameId, {deadline: new Deadline(childCallMs(childFrameDeadline))},
        child.url == null ? {} : {url: child.url}).catch(() => null)) ?? frameReference.target;
      const listed = await this.listFrame({
        childFrameDeadline, output, tabId, viewportClip: clip,
        frameReference: {frameId, parentFrameId: frameReference.frameId, size: child.size, target},
      });
      if (listed?.viewportClip != null) {
        await this.listChildFrames({childFrames: listed.childFrames, childFrameDeadline, frameReference: listed.frame, output, tabId, viewportClip: listed.viewportClip});
      }
    }
  }

  async frameListing(frame, maxChars, maxElements, viewportClip, deadline) {                                          // jz
    const result = await this.evaluate(frame.target, frame.frameId, frame.loaderId, listingExpression(maxChars, maxElements, viewportClip), {returnByValue: true, deadline});
    if (result.exceptionDetails != null) throw new Error(exceptionText(result.exceptionDetails));
    return listingOf(result.result?.value);
  }

  // The frame id of the frame element the listing numbered `ref`, or null (cR).
  async frameIdOf(frame, ref, deadline) {
    const result = await this.evaluate(frame.target, frame.frameId, frame.loaderId, elementExpression(ref), {returnByValue: false, deadline});
    if (result.exceptionDetails != null) throw new Error(exceptionText(result.exceptionDetails));
    const objectId = result.result?.objectId;
    if (typeof objectId !== 'string') return null;
    try {
      const {node} = await this.cdp.callTarget(frame.target, 'DOM.describeNode', {objectId}, {deadline});
      return typeof node.frameId === 'string' ? node.frameId : null;
    } finally {
      await this.cdp.callTarget(frame.target, 'Runtime.releaseObject', {objectId}, {deadline: new Deadline(CHILD_CALL_MS)}).catch(() => {});
    }
  }

  async world(target, frameId, loaderId, deadline) {                                                                  // $I
    const key = `${targetIdentity(target)}:${frameId}:${loaderId ?? ''}`;
    const known = this.worlds.get(key);
    if (known != null) return known;
    const {executionContextId} = await this.cdp.callTarget(target, 'Page.createIsolatedWorld',
      {frameId, grantUniveralAccess: false, worldName: DOM_WORLD_NAME}, {deadline});
    const world = {executionContextId};
    this.worlds.set(key, world);
    if (this.worlds.size > WORLD_LIMIT) this.worlds.delete(this.worlds.keys().next().value);
    return world;
  }

  async evaluateInWorld(target, world, expression, {returnByValue, deadline}) {                                       // zI
    return await this.cdp.callTarget(target, 'Runtime.evaluate', {
      awaitPromise: true, contextId: world.executionContextId, expression, returnByValue, timeout: deadline.timeoutMs(),
    }, {deadline});
  }
}

export const VISIBLE_DOM_HANDLERS = {
  // The unchanged client sends only the browser and tab (BC get_visible_dom), so the listing takes no options.
  async dom_cua_get_visible_dom(params, session) {
    return await session.visibleDom.listing(tabIdOf(params.tab_id));
  },
};
