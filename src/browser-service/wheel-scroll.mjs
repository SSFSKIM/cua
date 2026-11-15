// The scroll of the cua and dom_cua commands (#141, #168; the design session's rulings 726 and 727, and the fix wave of
// PR #382's review): a mouse wheel at the point, its effect read from the page. The vendor synthesizes a scroll gesture
// (Input.synthesizeScrollGesture), which answers only once Chrome has rendered the gesture frame by frame, so on a busy
// machine, or in a renderer starved of frames, it ran past the host's 10 s and failed. A wheel event answers once the
// page has the event; the scroll it starts is read back instead.
//
// Before the wheel, the page names what the wheel would scroll: the first element outward from the one at the point,
// with room in the requested direction. The search goes into open shadow roots and same-origin frames under the point,
// then outward along the composed tree and through frames' owners, as Chrome chains a wheel; a document's scrolling
// element scrolls unless the viewport's overflow (html's, else body's) is hidden or clip; horizontal room follows the
// scroller's direction (an RTL scroller runs from 0 at its right edge into negative offsets). The scroller is held as
// the element itself (a remote object in a group the scroll releases), never found again by position, so nothing the
// page inserts can stand in for it, and the page never sees the probe.
//  - No room anywhere: nothing can move, so the wheel is sent and the scroll answers at once, as the gesture did.
//  - Room: the scroll waits, up to the action budget, for that scroller to move in the requested direction; when it
//    does not, the answer says what is known: the wheel was sent, nothing was seen to scroll, and the page may handle
//    the wheel itself (a map, a virtual list), so observe it before retrying.
//  - A point in a frame the page cannot read cannot be observed: the wheel is sent and the scroll answers, as the
//    gesture did. A closed shadow root is its host's content: what is inside cannot be read, so the room is its host's
//    and its ancestors', and a scroll that only something inside it could take answers the no-movement answer above.
//  - A probe the page does not answer (busy, navigating, or failing) sends no wheel: the scroll answers the contract's
//    timeout with nothing scrolled, safe to retry (the design session's ruling on the review's P1). A wheel queued into
//    a stalled renderer would land later and unconfirmed.
import {DEFAULT_ACTION_MS, Deadline} from './budgets.mjs';
import {BrowserServiceError} from './errors.mjs';

const POLL_MS = 50;
const RELEASE_MS = 1000;
const GROUP = 'cua-wheel-scroll';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const scrollUnconfirmed = ms => `Timed out after ${ms}ms waiting for the scroll to take effect: the wheel was sent, but nothing was seen to `
  + 'scroll; the page may handle the wheel itself, so observe the page before retrying.';
export const scrollUnprobed = ms => `Timed out after ${ms}ms: the page did not answer the scroll's probe, so no wheel was sent; nothing was scrolled, `
  + 'so it is safe to retry.';

// In the page: what a wheel of (dx, dy) at (x, y) would scroll -> {observable: true, room: true, scroller, left, top},
// {observable: true, room: false}, or {observable: false} when the point is in a frame the page cannot read.
function locateScroller(x, y, dx, dy) {
  const styleOf = (doc, el) => doc.defaultView.getComputedStyle(el);
  const viewportOverflow = (doc, key) => {
    const own = styleOf(doc, doc.documentElement)[key];
    return own !== 'visible' || doc.body == null ? own : styleOf(doc, doc.body)[key];
  };
  const scrolls = (doc, el, key) => (el === doc.scrollingElement ? !/^(hidden|clip)$/.test(viewportOverflow(doc, key))
    : /^(auto|scroll|overlay)$/.test(styleOf(doc, el)[key]));
  const hasRoom = (doc, el) => {
    const roomY = dy > 0 ? el.scrollHeight - el.clientHeight - el.scrollTop : dy < 0 ? el.scrollTop : 0;
    const maxX = el.scrollWidth - el.clientWidth, left = el.scrollLeft, rtl = styleOf(doc, el).direction === 'rtl';
    const roomX = dx > 0 ? (rtl ? -left : maxX - left) : dx < 0 ? (rtl ? maxX + left : left) : 0;
    return (dy !== 0 && roomY >= 1 && scrolls(doc, el, 'overflowY')) || (dx !== 0 && roomX >= 1 && scrolls(doc, el, 'overflowX'));
  };
  // the composed tree's parent within one document: a slot, else the parent, else a shadow root's host
  const parentOf = el => {
    if (el.assignedSlot != null) return el.assignedSlot;
    if (el.parentElement != null) return el.parentElement;
    const root = el.getRootNode();
    return root !== el && root.host != null ? root.host : null;
  };
  // The documents from the top one in to the point's, each with the element the chaining starts from in it.
  const levels = [];
  let doc = document, px = x, py = y;
  for (;;) {
    let el = doc.elementFromPoint(px, py);
    for (let inner; el?.shadowRoot != null && (inner = el.shadowRoot.elementFromPoint(px, py)) != null && inner !== el;) el = inner;
    if (el != null && (el.tagName === 'IFRAME' || el.tagName === 'FRAME')) {
      let content = null;
      try { content = el.contentDocument; } catch {}
      if (content == null) return {observable: false};
      levels.push({doc, start: el});
      const box = el.getBoundingClientRect();
      px -= box.left + el.clientLeft;
      py -= box.top + el.clientTop;
      doc = content;
      continue;
    }
    levels.push({doc, start: el ?? doc.scrollingElement});
    break;
  }
  const found = el => ({observable: true, room: true, scroller: el, left: el.scrollLeft, top: el.scrollTop});
  for (let level = levels.length - 1; level >= 0; level--) {
    const {doc: here, start} = levels[level];
    let sawRoot = false;
    // a frame owner's level starts from the owner's parent: the owner itself scrolls nothing of its document
    for (let el = level === levels.length - 1 ? start : parentOf(start); el != null; el = parentOf(el)) {
      if (el === here.scrollingElement) sawRoot = true;
      if (hasRoom(here, el)) return found(el);
    }
    if (!sawRoot && here.scrollingElement != null && hasRoom(here, here.scrollingElement)) return found(here.scrollingElement);
  }
  return {observable: true, room: false};
}

const FACTS = 'function () { return {observable: this.observable, room: this.room === true, left: this.left, top: this.top}; }';
const SCROLLER = 'function () { return this.scroller; }';
// the held scroller's offsets now, or null once it has left its document
const POSITION = 'function () { return this.isConnected ? {left: this.scrollLeft, top: this.scrollTop} : null; }';

const call = (fn, ...args) => `(${fn.toString()})(${args.map(a => JSON.stringify(a)).join(', ')})`;
const answered = result => {
  if (result == null || result.exceptionDetails != null) throw new Error('the scroll probe threw');
  return result.result;
};

// Whether `now` has moved from `before` in the direction of (dx, dy).
const movedFrom = (before, now, dx, dy) => now != null
  && ((dy > 0 && now.top > before.top) || (dy < 0 && now.top < before.top) || (dx > 0 && now.left > before.left) || (dx < 0 && now.left < before.left));

// Scrolls the tab's page by (scrollX, scrollY) CSS pixels at `point` (the top document's) with a mouse wheel; the
// pointer is already there. `boundMs` bounds the probe, and then the wait for the effect.
export async function wheelScroll(cdp, tabId, {modifiers, point, scrollX, scrollY, boundMs = DEFAULT_ACTION_MS}) {
  const page = (method, params, deadline) => cdp.call(tabId, method, params, {deadline, preserveOnTimeout: true});
  const release = () => page('Runtime.releaseObjectGroup', {objectGroup: GROUP}, new Deadline(RELEASE_MS)).catch(() => {});
  try {
    let facts, scroller = null;
    try {
      const probe = new Deadline(boundMs);
      const located = answered(await page('Runtime.evaluate', {expression: call(locateScroller, point.x, point.y, scrollX, scrollY), returnByValue: false, objectGroup: GROUP}, probe));
      if (located?.objectId == null) throw new Error('the scroll probe answered no object');
      facts = answered(await page('Runtime.callFunctionOn', {objectId: located.objectId, functionDeclaration: FACTS, returnByValue: true}, probe))?.value;
      if (facts == null || typeof facts !== 'object') throw new Error('the scroll probe answered nothing');
      if (facts.observable === true && facts.room) {
        scroller = answered(await page('Runtime.callFunctionOn', {objectId: located.objectId, functionDeclaration: SCROLLER, returnByValue: false, objectGroup: GROUP}, probe))?.objectId;
        if (scroller == null) throw new Error('the scroll probe lost its scroller');
      }
    } catch {
      throw new BrowserServiceError('timeout', scrollUnprobed(boundMs));
    }
    await cdp.call(tabId, 'Input.dispatchMouseEvent', {type: 'mouseWheel', x: point.x, y: point.y, deltaX: scrollX, deltaY: scrollY, modifiers});
    if (scroller == null) return;
    const deadline = new Deadline(boundMs);
    for (;;) {
      let now = null;
      try {
        now = answered(await page('Runtime.callFunctionOn', {objectId: scroller, functionDeclaration: POSITION, returnByValue: true}, deadline))?.value ?? null;
      } catch {}
      if (movedFrom(facts, now, scrollX, scrollY)) return;
      if (deadline.remaining() <= POLL_MS) throw new BrowserServiceError('timeout', scrollUnconfirmed(boundMs));
      await sleep(POLL_MS);
    }
  } finally {
    await release();
  }
}
