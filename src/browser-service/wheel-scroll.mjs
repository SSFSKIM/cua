// The scroll of the cua and dom_cua commands (#141, #168; the design session's rulings 726 and 727): a mouse wheel at
// the point, its effect read from the page. The vendor synthesizes a scroll gesture (Input.synthesizeScrollGesture),
// which answers only once Chrome has rendered the gesture frame by frame, so on a busy machine, or in a renderer
// starved of frames, it ran past the host's 10 s and failed. A wheel event answers once the page has the event; the
// scroll it starts is read back instead.
//
// Before the wheel, the page says what the wheel would scroll: the first element outward from the one at the point
// (through same-origin frames, the scroll chaining outward from each frame to its owner's document) with room in the
// requested direction, a document's scrolling element last. With no room anywhere, nothing can move: the wheel is sent
// and the scroll answers at once, as the gesture did. With room, the scroll waits, up to the action budget, for that
// scroller to move in the requested direction; when it does not, the answer says what is known: the wheel was sent,
// nothing was seen to scroll, and the page may handle the wheel itself (a map, a virtual list), so observe it before
// retrying. A point in a frame the page cannot read cannot be observed: the wheel is sent and the scroll answers, as the
// gesture did.
import {DEFAULT_ACTION_MS, Deadline} from './budgets.mjs';
import {BrowserServiceError} from './errors.mjs';

const POLL_MS = 50;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const scrollUnconfirmed = ms => `Timed out after ${ms}ms waiting for the scroll to take effect: the wheel was sent, but nothing was seen to `
  + 'scroll; the page may handle the wheel itself, so observe the page before retrying.';

// In the page: the scroller a wheel of (dx, dy) at (x, y) would move -> {observable: true, room: true, path, left, top},
// {observable: true, room: false}, or {observable: false} when the point is in a frame the page cannot read. `path`
// finds the scroller again: the frame owners' child-index paths from the top document down, then the scroller's own
// (null for its document's scrolling element).
function locateScroller(x, y, dx, dy) {
  const indexPath = (doc, el) => {
    const path = [];
    for (let node = el; node != null && node !== doc.documentElement; node = node.parentElement) path.unshift(Array.prototype.indexOf.call(node.parentElement.children, node));
    return path;
  };
  const hasRoom = (doc, el) => {
    const root = el === doc.scrollingElement;
    const style = root ? null : doc.defaultView.getComputedStyle(el);
    const scrolls = overflow => root || /^(auto|scroll|overlay)$/.test(overflow);
    const roomY = dy > 0 ? el.scrollHeight - el.clientHeight - el.scrollTop : dy < 0 ? el.scrollTop : 0;
    const roomX = dx > 0 ? el.scrollWidth - el.clientWidth - el.scrollLeft : dx < 0 ? el.scrollLeft : 0;
    return (dy !== 0 && scrolls(style?.overflowY) && roomY >= 1) || (dx !== 0 && scrolls(style?.overflowX) && roomX >= 1);
  };
  // The documents from the top one in to the point's, each with the element the chaining starts from in it.
  const levels = [];
  let doc = document, px = x, py = y;
  for (;;) {
    const el = doc.elementFromPoint(px, py);
    if (el != null && (el.tagName === 'IFRAME' || el.tagName === 'FRAME')) {
      let inner = null;
      try { inner = el.contentDocument; } catch {}
      if (inner == null) return {observable: false};
      levels.push({doc, start: el, owner: indexPath(doc, el)});
      const box = el.getBoundingClientRect();
      px -= box.left + el.clientLeft;
      py -= box.top + el.clientTop;
      doc = inner;
      continue;
    }
    levels.push({doc, start: el ?? doc.scrollingElement});
    break;
  }
  for (let level = levels.length - 1; level >= 0; level--) {
    const {doc: here, start} = levels[level];
    // a frame owner's level starts from the owner's parent: the owner itself scrolls nothing of its document
    const first = level === levels.length - 1 ? start : start.parentElement;
    for (let el = first; el != null; el = el === here.scrollingElement ? null : (el.parentElement ?? here.scrollingElement)) {
      if (!hasRoom(here, el)) continue;
      const frames = levels.slice(0, level).map(l => l.owner);
      return {observable: true, room: true, path: {frames, element: el === here.scrollingElement ? null : indexPath(here, el)}, left: el.scrollLeft, top: el.scrollTop};
    }
  }
  return {observable: true, room: false};
}

// In the page: where the scroller `path` names is now -> {left, top}, or null when it is gone.
function readScroller(path) {
  let doc = document;
  const follow = (d, indices) => {
    let node = d.documentElement;
    for (const i of indices) { node = node?.children[i]; if (node == null) return null; }
    return node;
  };
  for (const owner of path.frames) {
    const frame = follow(doc, owner);
    let inner = null;
    try { inner = frame?.contentDocument; } catch {}
    if (inner == null) return null;
    doc = inner;
  }
  const el = path.element == null ? doc.scrollingElement : follow(doc, path.element);
  return el == null ? null : {left: el.scrollLeft, top: el.scrollTop};
}

const call = (fn, ...args) => `(${fn.toString()})(${args.map(a => JSON.stringify(a)).join(', ')})`;

async function evaluateValue(cdp, tabId, expression, options) {
  const result = await cdp.call(tabId, 'Runtime.evaluate', {expression, returnByValue: true}, options);
  if (result?.exceptionDetails != null) throw new Error('the scroll probe threw');
  return result?.result?.value;
}

// Whether `now` has moved from `before` in the direction of (dx, dy).
const movedFrom = (before, now, dx, dy) => now != null
  && ((dy > 0 && now.top > before.top) || (dy < 0 && now.top < before.top) || (dx > 0 && now.left > before.left) || (dx < 0 && now.left < before.left));

// Scrolls the tab's page by (scrollX, scrollY) CSS pixels at `point` (the top document's) with a mouse wheel; the
// pointer is already there. `boundMs` how long the effect is waited for.
export async function wheelScroll(cdp, tabId, {modifiers, point, scrollX, scrollY, boundMs = DEFAULT_ACTION_MS}) {
  let scroller;
  try {
    scroller = await evaluateValue(cdp, tabId, call(locateScroller, point.x, point.y, scrollX, scrollY), {deadline: new Deadline(boundMs), preserveOnTimeout: true});
  } catch {
    scroller = {observable: false};
  }
  await cdp.call(tabId, 'Input.dispatchMouseEvent', {type: 'mouseWheel', x: point.x, y: point.y, deltaX: scrollX, deltaY: scrollY, modifiers});
  if (scroller?.observable !== true || scroller.room !== true) return;
  const deadline = new Deadline(boundMs);
  for (;;) {
    let now = null;
    try {
      now = await evaluateValue(cdp, tabId, call(readScroller, scroller.path), {deadline, preserveOnTimeout: true});
    } catch {}
    if (movedFrom(scroller, now, scrollX, scrollY)) return;
    if (deadline.remaining() <= POLL_MS) throw new BrowserServiceError('timeout', scrollUnconfirmed(boundMs));
    await sleep(POLL_MS);
  }
}
