// The scroll of the cua and dom_cua commands (src/browser-service/wheel-scroll.mjs; #141, #168, rulings 726 and 727): a
// mouse wheel at the point, its effect read back from the page. The page here is a small model of the scroll-relevant
// DOM (elements with their overflow, scroll extents and offsets; a document's scrolling element; frames) whose wheel
// handling is Chrome's: the first scroller outward from the element at the point with room moves, a moment after the
// wheel (the compositor's), unless the page handles the wheel itself or its frames stall. The service's in-page
// expressions run against it in node:vm (support/page-vm.mjs), as written.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Cursor} from '../../src/browser-service/cursor.mjs';
import {CuaInput, INPUT_HANDLERS} from '../../src/browser-service/input.mjs';
import {scrollUnconfirmed} from '../../src/browser-service/wheel-scroll.mjs';
import {evaluateInPage} from './support/page-vm.mjs';

const rejection = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };

class Box {
  constructor(tag, {overflowX = 'visible', overflowY = 'visible', width = 800, height = 600, scrollWidth = width, scrollHeight = height, scrollLeft = 0, scrollTop = 0} = {}, children = []) {
    Object.assign(this, {tagName: tag.toUpperCase(), overflowX, overflowY, clientWidth: width, clientHeight: height, scrollWidth, scrollHeight, scrollLeft, scrollTop});
    this.children = children;
    this.parentElement = null;
    for (const child of children) child.parentElement = this;
  }
}

// A document whose root (html, its scrolling element) holds `body`; `at` the element at every point.
function pageDocument(body, {rootHeight = 600, rootScrollHeight = 600, at = body} = {}) {
  const html = new Box('html', {height: rootHeight, scrollHeight: rootScrollHeight}, [body]);
  const doc = {documentElement: html, scrollingElement: html, elementFromPoint: () => at};
  doc.defaultView = {getComputedStyle: el => ({overflowX: el.overflowX, overflowY: el.overflowY})};
  return doc;
}

// `wheel`: 'scroll' (Chrome's chaining, applied 20 ms after the wheel), 'own' (the page calls preventDefault and moves
// its own content), 'stall' (no frame comes).
function setup(doc, {wheel = 'scroll', wheelDoc = doc} = {}) {
  const log = [];
  const moved = [];
  const applyWheel = ({deltaX, deltaY}) => {
    if (wheel === 'own') { moved.push('content'); return; }
    if (wheel === 'stall') return;
    let el = wheelDoc.elementFromPoint(0, 0);
    for (; el != null; el = el === wheelDoc.scrollingElement ? null : (el.parentElement ?? wheelDoc.scrollingElement)) {
      const root = el === wheelDoc.scrollingElement;
      const roomY = deltaY > 0 ? el.scrollHeight - el.clientHeight - el.scrollTop : -el.scrollTop;
      const scrollsY = root || /^(auto|scroll)$/.test(el.overflowY);
      if (deltaY !== 0 && scrollsY && (deltaY > 0 ? roomY >= 1 : el.scrollTop >= 1)) {
        const target = el;
        setTimeout(() => { target.scrollTop = Math.max(0, Math.min(target.scrollHeight - target.clientHeight, target.scrollTop + deltaY)); moved.push(target.tagName); }, 20);
        return;
      }
    }
  };
  const cdp = {
    async callTarget(target, method, params, options = {}) {
      options.deadline?.timeoutMs();
      log.push({method, params, options});
      if (method === 'Runtime.evaluate') return await evaluateInPage({document: doc}, params);
      if (method === 'Input.dispatchMouseEvent' && params.type === 'mouseWheel') applyWheel(params);
      return {};
    },
    async call(tabId, method, params, options) { return await this.callTarget({tabId}, method, params, options); },
  };
  const cursor = new Cursor({async moveMouse() { return {}; }});
  const session = {cdp, cursor, platform: 'linux', input: new CuaInput(cdp, cursor, {}, {platform: 'linux'})};
  const scroll = params => INPUT_HANDLERS.cua_scroll({browser_id: 'b', tab_id: '4', x: 280, y: 200, scroll_x: 0, ...params}, session);
  const sent = () => log.filter(e => e.method === 'Input.dispatchMouseEvent').map(e => e.params);
  const probes = () => log.filter(e => e.method === 'Runtime.evaluate').length;
  return {log, moved, scroll, sent, probes, session};
}

test('a scroll sends one mouse wheel at the point, and answers once the page has scrolled the way it asked', async () => {
  const doc = pageDocument(new Box('body'), {rootScrollHeight: 2400});
  const {scroll, sent, moved} = setup(doc);
  assert.deepEqual(await scroll({scroll_y: 400}), {});
  assert.deepEqual(sent(), [
    {type: 'mouseMoved', x: 280, y: 200, button: 'none', buttons: 0, modifiers: 0},
    {type: 'mouseWheel', x: 280, y: 200, deltaX: 0, deltaY: 400, modifiers: 0},
  ]);
  assert.equal(doc.scrollingElement.scrollTop, 400);
  assert.deepEqual(moved, ['HTML']);
});

test('with no room to scroll in the asked direction anywhere at the point, the wheel is sent and the scroll answers at once', async () => {
  for (const [what, doc, delta] of [
    ['a page that does not scroll', pageDocument(new Box('body')), 400],
    ['a page at its end', pageDocument(new Box('body'), {rootScrollHeight: 2400}), 400],
    ['a page at its top, scrolled up', pageDocument(new Box('body'), {rootScrollHeight: 2400}), -400],
  ]) {
    if (what === 'a page at its end') doc.scrollingElement.scrollTop = 1800;
    const {scroll, sent, probes} = setup(doc, {wheel: 'stall'});
    const started = Date.now();
    assert.deepEqual(await scroll({scroll_y: delta}), {}, what);
    assert.ok(Date.now() - started < 1000, `${what}: answered at once (${Date.now() - started} ms)`);
    assert.equal(sent().at(-1).type, 'mouseWheel', what);
    assert.equal(probes(), 1, `${what}: nothing to wait for`);
  }
});

test('with room to scroll but nothing moving within the bound, the scroll times out saying the wheel was sent and nothing was seen to scroll', async () => {
  const doc = pageDocument(new Box('body'), {rootScrollHeight: 2400});
  const {session} = setup(doc, {wheel: 'stall'});
  const started = Date.now();
  const error = await rejection(session.input.scrollPoint({modifiers: 0, point: {x: 280, y: 200}, scrollX: 0, scrollY: 400, tabId: 4}));
  assert.equal(error.code, 'timeout');
  assert.equal(error.message, scrollUnconfirmed(3000));
  assert.ok(Date.now() - started >= 2900, 'it waited the action budget');
});

test('a page that handles the wheel itself (preventDefault, moving its own content) gets the same honest answer: the wheel was sent, nothing was seen to scroll', async () => {
  const doc = pageDocument(new Box('body'), {rootScrollHeight: 2400});
  const {scroll, moved} = setup(doc, {wheel: 'own'});
  const error = await rejection(scroll({scroll_y: 400}));
  assert.equal(error.code, 'timeout');
  assert.equal(error.message, scrollUnconfirmed(3000));
  assert.match(error.message, /the wheel was sent.*the page may handle the wheel itself, so observe the page before retrying/);
  assert.deepEqual(moved, ['content'], 'the page did react, which is why the answer says it may have');
  assert.equal(doc.scrollingElement.scrollTop, 0);
});

test('an inner scroller with room is the one watched; one at its edge chains the wheel to the page, which is watched instead', async () => {
  const list = () => new Box('div', {overflowY: 'auto', height: 200, scrollHeight: 1000});
  const inner = list();
  const room = setup(pageDocument(new Box('body', {}, [inner]), {rootScrollHeight: 2400, at: inner}));
  assert.deepEqual(await room.scroll({scroll_y: 100}), {});
  assert.deepEqual([inner.scrollTop, room.moved], [100, ['DIV']], 'the inner list moved, the page did not');

  const atEdge = list();
  atEdge.scrollTop = 800;
  const doc = pageDocument(new Box('body', {}, [atEdge]), {rootScrollHeight: 2400, at: atEdge});
  const chained = setup(doc);
  assert.deepEqual(await chained.scroll({scroll_y: 100}), {}, 'ok, not "no room": the page had room');
  assert.deepEqual([atEdge.scrollTop, doc.scrollingElement.scrollTop, chained.moved], [800, 100, ['HTML']]);

  const hidden = new Box('div', {overflowY: 'hidden', height: 200, scrollHeight: 1000});
  const notScroller = setup(pageDocument(new Box('body', {}, [hidden]), {rootScrollHeight: 2400, at: hidden}));
  assert.deepEqual(await notScroller.scroll({scroll_y: 100}), {});
  assert.deepEqual([hidden.scrollTop, notScroller.moved], [0, ['HTML']], 'an overflow:hidden box is not a scroller');
});

test('a point in a frame the page cannot read is not observable: the wheel is sent and the scroll answers, as the gesture did', async () => {
  const frame = new Box('iframe');
  Object.defineProperty(frame, 'contentDocument', {get() { throw new Error('cross-origin'); }});
  const {scroll, sent, probes} = setup(pageDocument(new Box('body', {}, [frame]), {rootScrollHeight: 2400, at: frame}), {wheel: 'stall'});
  assert.deepEqual(await scroll({scroll_y: 400}), {});
  assert.equal(sent().at(-1).type, 'mouseWheel');
  assert.equal(probes(), 1);
});

test('a same-origin frame at the point is entered: the scroller in its document is the one watched', async () => {
  const innerDoc = pageDocument(new Box('body'), {rootScrollHeight: 1200});
  const frame = new Box('iframe', {width: 300, height: 150});
  Object.assign(frame, {contentDocument: innerDoc, clientLeft: 0, clientTop: 0, getBoundingClientRect: () => ({left: 100, top: 100})});
  const outer = pageDocument(new Box('body', {}, [frame]), {rootScrollHeight: 2400, at: frame});
  // the page is read from the top document; Chrome gives the wheel to the frame's document under the point
  const {scroll, moved} = setup(outer, {wheelDoc: innerDoc});
  assert.deepEqual(await scroll({scroll_y: 400}), {});
  assert.deepEqual([innerDoc.scrollingElement.scrollTop, outer.scrollingElement.scrollTop, moved], [400, 0, ['HTML']]);
});

test('the scroll\'s page reads keep the tab\'s debugger if their budget runs out, as a locator\'s do', async () => {
  const {scroll, log} = setup(pageDocument(new Box('body'), {rootScrollHeight: 2400}));
  await scroll({scroll_y: 400});
  const reads = log.filter(e => e.method === 'Runtime.evaluate');
  assert.ok(reads.length >= 2);
  assert.ok(reads.every(e => e.options.preserveOnTimeout === true && e.options.deadline != null));
});
