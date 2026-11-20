// The wheel scroll's protocol (src/browser-service/wheel-scroll.mjs): the probe names the scroller as a remote object,
// the wheel goes only after the probe has answered, the held scroller is read until it moves or the bound runs out,
// and the probe's objects are released. The page's own behaviour (chaining, frames, shadow roots, RTL, a locked
// viewport, handlers that take the wheel) is wheel-scroll-chrome.test.mjs's, in a real Chrome; this needs none.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Cursor} from '../../src/browser-service/cursor.mjs';
import {CuaInput, INPUT_HANDLERS} from '../../src/browser-service/input.mjs';
import {scrollUnconfirmed, scrollUnprobed, wheelScroll} from '../../src/browser-service/wheel-scroll.mjs';

const rejection = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };

// `facts` what the probe answers; `positions` the held scroller's successive offsets; `fail` which step fails.
function page({facts = {observable: true, room: true, left: 0, top: 0}, positions = [{left: 0, top: 400}], fail = null} = {}) {
  const log = [];
  let read = 0;
  const cdp = {
    async call(tabId, method, params, options = {}) {
      log.push({method, params, options});
      if (fail === method || (fail === 'facts' && params.functionDeclaration?.includes('observable'))) throw new Error('Timed out after 3000ms waiting for CDP command ' + method + '.');
      if (method === 'DOM.getNodeForLocation') return {backendNodeId: 7};
      if (method === 'DOM.resolveNode') return {object: {type: 'object', objectId: 'node'}};
      if (method === 'Runtime.callFunctionOn' && params.objectId === 'node') return fail === 'exception' ? {exceptionDetails: {text: 'Uncaught'}} : {result: {type: 'object', objectId: 'probe'}};
      if (method === 'Runtime.callFunctionOn' && params.objectId === 'probe') {
        return params.functionDeclaration.includes('this.scroller') ? {result: {type: 'object', objectId: 'scroller'}} : {result: {type: 'object', value: facts}};
      }
      if (method === 'Runtime.callFunctionOn' && params.objectId === 'scroller') return {result: {type: 'object', value: positions[Math.min(read++, positions.length - 1)]}};
      return {};
    },
  };
  const scroll = args => wheelScroll(cdp, 4, {modifiers: 0, point: {x: 280, y: 200}, scrollX: 0, scrollY: 400, boundMs: 300, ...args});
  const methods = () => log.map(e => e.method);
  return {cdp, log, scroll, methods};
}

test('a probe that fails or does not answer sends no wheel, and answers the timeout with nothing scrolled', async () => {
  for (const fail of ['DOM.getNodeForLocation', 'DOM.resolveNode', 'exception', 'facts']) {
    const {scroll, methods} = page({fail});
    const error = await rejection(scroll());
    assert.deepEqual([error.code, error.message], ['timeout', scrollUnprobed(300)], fail);
    assert.equal(methods().includes('Input.dispatchMouseEvent'), false, `${fail}: no wheel`);
    assert.equal(methods().at(-1), 'Runtime.releaseObjectGroup', `${fail}: the probe's objects are released`);
  }
  assert.match(scrollUnprobed(3000), /^Timed out after 3000ms: the page did not answer the scroll's probe, so no wheel was sent; nothing was scrolled, so it is safe to retry\.$/);
});

test('with room, the wheel goes after the probe, the held scroller is read until it moves, and the objects are released', async () => {
  const {scroll, log, methods} = page({positions: [{left: 0, top: 0}, {left: 0, top: 0}, {left: 0, top: 120}]});
  assert.equal(await scroll(), undefined);
  assert.deepEqual(methods(), ['DOM.getNodeForLocation', 'DOM.resolveNode', 'Runtime.callFunctionOn', 'Runtime.callFunctionOn', 'Runtime.callFunctionOn',
    'Input.dispatchMouseEvent', 'Runtime.callFunctionOn', 'Runtime.callFunctionOn', 'Runtime.callFunctionOn', 'Runtime.releaseObjectGroup']);
  assert.equal(log[2].params.returnByValue, false, 'the probe answers the scroller as an object, not a path');
  const groups = new Set(log.map(e => e.params.objectGroup).filter(Boolean));
  assert.equal(groups.size, 1, 'one object group of its own, held and released');
  assert.deepEqual(log.find(e => e.method === 'Input.dispatchMouseEvent').params, {type: 'mouseWheel', x: 280, y: 200, deltaX: 0, deltaY: 400, modifiers: 0});
  assert.ok(log.filter(e => e.method !== 'Input.dispatchMouseEvent').every(e => e.options.preserveOnTimeout === true && e.options.deadline != null),
    'every page read keeps the debugger, bounded');
  assert.ok(log.filter(e => e.params.objectId === 'scroller').length === 3, 'the same held scroller is read each time');
});

test('with room but no movement within the bound, the no-movement answer; a scroller that left its document never counts as moved', async () => {
  for (const positions of [[{left: 0, top: 0}], [null]]) {
    const {scroll, methods} = page({positions});
    const error = await rejection(scroll());
    assert.deepEqual([error.code, error.message], ['timeout', scrollUnconfirmed(300)]);
    assert.equal(methods().at(-1), 'Runtime.releaseObjectGroup');
  }
  const {scroll} = page({facts: {observable: true, room: true, left: 0, top: 0}, positions: [{left: 0, top: -10}]});
  assert.equal((await rejection(scroll())).message, scrollUnconfirmed(300), 'a move the other way is not the asked one');
});

// "At once": nothing is read after the wheel, and no wait of any kind is taken out of the bound (this page answers at
// once, so the scroll takes a sliver of a bound this long).
test('with no room, or a point that cannot be observed, the wheel is sent and the scroll answers at once', async () => {
  for (const facts of [{observable: true, room: false}, {observable: false, room: false}]) {
    const {scroll, methods} = page({facts});
    const boundMs = 5000, started = Date.now();
    assert.equal(await scroll({boundMs}), undefined);
    const ms = Date.now() - started;
    assert.deepEqual(methods(), ['DOM.getNodeForLocation', 'DOM.resolveNode', 'Runtime.callFunctionOn', 'Runtime.callFunctionOn', 'Input.dispatchMouseEvent', 'Runtime.releaseObjectGroup'], JSON.stringify(facts));
    assert.ok(ms < boundMs / 5, `${JSON.stringify(facts)}: answered within a fifth of the bound (${ms} ms)`);
  }
});

test('cua_scroll aims the cursor, moves to the point, then scrolls there by the wheel', async () => {
  const {cdp, methods} = page({facts: {observable: true, room: false}});
  const cursor = new Cursor({async moveMouse() { return {}; }});
  const session = {cdp, cursor, platform: 'linux', input: new CuaInput(cdp, cursor, {}, {platform: 'linux'})};
  cdp.callTarget = (target, method, params, options) => cdp.call(target.tabId, method, params, options);
  assert.deepEqual(await INPUT_HANDLERS.cua_scroll({browser_id: 'b', tab_id: '4', x: 280, y: 200, scroll_x: 0, scroll_y: 400}, session), {});
  assert.deepEqual(methods(), ['Input.dispatchMouseEvent', 'DOM.getNodeForLocation', 'DOM.resolveNode', 'Runtime.callFunctionOn', 'Runtime.callFunctionOn', 'Input.dispatchMouseEvent', 'Runtime.releaseObjectGroup']);
});

test('two scrolls never share an object group: each releases only its own', async () => {
  const a = page({facts: {observable: true, room: false}}), b = page({facts: {observable: true, room: false}});
  await a.scroll(); await b.scroll();
  const groupOf = log => log.find(e => e.method === 'Runtime.releaseObjectGroup').params.objectGroup;
  assert.notEqual(groupOf(a.log), groupOf(b.log));
});
