// The wheel scroll (src/browser-service/wheel-scroll.mjs; rulings 726, 727, and the fix wave of PR #382's review) in a
// real headless Chrome (support/real-chrome.mjs): with room to move, ok only once the scroller the wheel moves has
// been seen to move; with none, ok at once; a probe the page does not answer sends nothing. Skipped where this
// machine has no Chrome.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromePath, realChrome} from './support/real-chrome.mjs';
import {scrollUnconfirmed, wheelScroll} from '../../src/browser-service/wheel-scroll.mjs';

const skip = chromePath() == null ? 'no Chrome on this machine' : false;
const BOUND = 1000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const rejection = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };
const page = body => `<!doctype html><html><head><style>body{margin:0}</style></head><body>${body}</body></html>`;
const tall = '<div style="height:3000px"></div>';
// a scroller at the page's top left, 300 by 200, its content `inner` (CSS) big
const box = (id, {style = '', inner = 'height:1000px', attrs = ''} = {}) => `<div id="${id}" ${attrs} style="overflow:auto;width:300px;height:200px;${style}"><div style="${inner}"></div></div>`;
const noWheel = id => `<script>document.getElementById(${JSON.stringify(id)}).addEventListener('wheel', e => e.preventDefault(), {passive: false});</script>`;
const PAGES = {
  '/tall': page(tall),
  '/fits': page('<p>short</p>'),
  '/own': page(tall + '<script>addEventListener("wheel", e => e.preventDefault(), {passive: false});</script>'),
  '/busy': page(tall + '<script>window.wheels = 0; addEventListener("wheel", () => window.wheels++);</script>'),
  '/chain': page(box('inner') + tall),
  '/hidden-box': page(box('inner', {style: 'overflow:hidden'}) + tall),
  '/swap': page(`<div id="holder">${box('real')}</div><script>
    const real = document.getElementById('real');
    real.addEventListener('wheel', e => { e.preventDefault();
      const decoy = document.createElement('div'); decoy.style.cssText = 'overflow:auto;width:300px;height:200px';
      decoy.innerHTML = '<div style="height:1000px"></div>'; real.before(decoy); decoy.scrollTop = 80; }, {passive: false});</script>`),
  '/shadow': page(`<div id="host"></div><script>
    const root = document.getElementById('host').attachShadow({mode: 'open'});
    root.innerHTML = '<div id="s" style="overflow:auto;width:300px;height:200px"><div style="height:1000px"></div></div>';
    window.inner = root.getElementById('s');
    if (location.search === '?prevent') inner.addEventListener('wheel', e => e.preventDefault(), {passive: false});</script>`),
  '/rtl': page(box('x', {attrs: 'dir="rtl"', inner: 'width:1000px;height:10px'})),
  '/ltr': page(box('x', {inner: 'width:1000px;height:10px'})),
  '/locked': `<!doctype html><html style="overflow:hidden"><head><style>body{margin:0}</style></head><body>${tall}</body></html>`,
  '/locked-body': page(tall).replace('<body>', '<body style="overflow:hidden">'),
  '/frame-same': page(`<iframe id="f" style="border:0;width:300px;height:200px" srcdoc='<body style="margin:0"><div style="height:2000px"></div></body>'></iframe>`),
  '/frame-cross': page('<iframe id="f" style="border:0;width:300px;height:200px" src="__CROSS__"></iframe>'),
  '/cross-inner': page(tall),
};

async function setup(t) {
  const chrome = await realChrome(t, PAGES);
  PAGES['/frame-cross'] = PAGES['/frame-cross'].replace('__CROSS__', chrome.url('/cross-inner', 'localhost'));
  const scroll = (path, args) => (async () => { await chrome.load(path); return wheelScroll(chrome.cdp, 1, {modifiers: 0, point: {x: 100, y: 100}, scrollX: 0, scrollY: 0, boundMs: BOUND, ...args}); })();
  const wheels = () => chrome.cdp.sent.filter(c => c.method === 'Input.dispatchMouseEvent' && c.params.type === 'mouseWheel').length;
  return {chrome, scroll, wheels};
}
const timed = async work => { const started = Date.now(); const value = await work; return {value, ms: Date.now() - started}; };

test('real Chrome: a page with room moves and the scroll answers ok; one with none answers ok at once', {skip}, async t => {
  const {chrome, scroll} = await setup(t);
  assert.equal(await scroll('/tall', {scrollY: 400}), undefined);
  assert.ok(await chrome.evaluate('scrollY') > 0, 'the page moved before the answer');
  const fits = await timed(scroll('/fits', {scrollY: 400}));
  assert.ok(fits.ms < BOUND / 2, `no room, answered at once (${fits.ms} ms)`);
});

test('real Chrome: a page that handles the wheel itself gets the honest no-movement answer', {skip}, async t => {
  const {scroll} = await setup(t);
  const error = await rejection(scroll('/own', {scrollY: 400}));
  assert.deepEqual([error.code, error.message], ['timeout', scrollUnconfirmed(BOUND)]);
});

test('real Chrome: an inner scroller at its edge chains the wheel to the page, which is watched; overflow:hidden is no scroller', {skip}, async t => {
  const {chrome, scroll} = await setup(t);
  await chrome.load('/chain');
  await chrome.evaluate('document.getElementById("inner").scrollTop = 1000');
  assert.equal(await wheelScroll(chrome.cdp, 1, {modifiers: 0, point: {x: 100, y: 100}, scrollX: 0, scrollY: 300, boundMs: BOUND}), undefined);
  assert.ok(await chrome.evaluate('scrollY') > 0, 'the page moved');
  assert.equal(await scroll('/hidden-box', {scrollY: 300}), undefined);
  assert.equal(await chrome.evaluate('document.getElementById("inner").scrollTop'), 0);
  assert.ok(await chrome.evaluate('scrollY') > 0);
});

test('real Chrome: a same-origin frame\'s document is watched; a cross-origin frame cannot be read and answers as before', {skip}, async t => {
  const {chrome, scroll} = await setup(t);
  assert.equal(await scroll('/frame-same', {scrollY: 300}), undefined);
  assert.ok(await chrome.evaluate('document.getElementById("f").contentWindow.scrollY') > 0);
  assert.equal(await scroll('/frame-cross', {scrollY: 300}), undefined);
});

// Review finding 1 (P1): a probe the page does not answer is not "unobservable"; nothing is sent, and the answer says so.
test('real Chrome: a probe the busy page does not answer within the budget sends no wheel and answers retry-safe', {skip}, async t => {
  const {chrome, wheels} = await setup(t);
  await chrome.load('/busy');
  await chrome.evaluate('setTimeout(() => { const end = Date.now() + 3000; while (Date.now() < end); }, 0), 1');
  await sleep(50);
  const error = await rejection(wheelScroll(chrome.cdp, 1, {modifiers: 0, point: {x: 100, y: 100}, scrollX: 0, scrollY: 400, boundMs: BOUND}));
  assert.equal(error.code, 'timeout');
  assert.match(error.message, /the page did not answer the scroll's probe.*nothing was scrolled, so it is safe to retry/);
  assert.equal(wheels(), 0, 'no wheel was sent');
  await sleep(3000);
  assert.deepEqual([await chrome.evaluate('window.wheels'), await chrome.evaluate('scrollY')], [0, 0], 'and none lands later');
});

// Review finding 2 (P2): the scroller is the element itself, not a child-index path a new sibling can take over.
test('real Chrome: a wheel handler that inserts a scrolled sibling before the scroller does not stand in for it', {skip}, async t => {
  const {chrome, scroll} = await setup(t);
  const error = await rejection(scroll('/swap', {scrollY: 300}));
  assert.deepEqual([error.code, error.message], ['timeout', scrollUnconfirmed(BOUND)]);
  assert.equal(await chrome.evaluate('document.getElementById("real").scrollTop'), 0);
});

// Review finding 3 (P2): an open shadow root's scroller is found and watched.
test('real Chrome: a scroller inside an open shadow root is the one watched', {skip}, async t => {
  const {chrome, scroll} = await setup(t);
  assert.equal(await scroll('/shadow', {scrollY: 300}), undefined);
  assert.ok(await chrome.evaluate('inner.scrollTop') > 0);
  const error = await rejection(scroll('/shadow?prevent', {scrollY: 300}));
  assert.deepEqual([error.code, error.message], ['timeout', scrollUnconfirmed(BOUND)], 'it had room, and nothing moved');
});

// Review finding 4 (P2): the room follows the scroller's direction; an RTL scroller runs from 0 at its right edge down.
test('real Chrome: horizontal room in an RTL and an LTR scroller, both directions', {skip}, async t => {
  const {chrome, scroll} = await setup(t);
  for (const [path, toEdge, inward, sign] of [['/rtl', 100, -100, -1], ['/ltr', -100, 100, 1]]) {
    const edge = await timed(scroll(path, {scrollX: toEdge}));
    assert.ok(edge.ms < BOUND / 2, `${path}: at its starting edge, no room that way, ok at once (${edge.ms} ms)`);
    assert.equal(await scroll(path, {scrollX: inward}), undefined, `${path}: room the other way`);
    assert.ok(Math.sign(await chrome.evaluate('document.getElementById("x").scrollLeft')) === sign, `${path}: it moved before the answer`);
  }
});

// Review finding 5 (P2): the viewport's own overflow decides whether the document scrolls at all.
test('real Chrome: a scroll-locked page (overflow hidden on html, or on body) has no room and answers ok at once', {skip}, async t => {
  const {scroll} = await setup(t);
  for (const path of ['/locked', '/locked-body']) {
    const locked = await timed(scroll(path, {scrollY: 400}));
    assert.equal(locked.value, undefined, path);
    assert.ok(locked.ms < BOUND / 2, `${path}: answered at once (${locked.ms} ms)`);
  }
});
