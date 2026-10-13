// Selector resolution (src/browser-service/selectors.mjs, the resolution half of the vendor's Pf): a Playwright selector
// is resolved in the page by the injected script, through same-process frames in the page and through cross-origin and
// out-of-process frames by CDP (`>> internal:control=enter-frame >>`), strictly with the vendor's visible fallback,
// polling until the command's Deadline; strict-mode violations and an open dialog end the polling at once. The engine
// runs over the real CdpController and InjectedScripts against a fake Chrome whose worlds run the service's
// expressions in node:vm (support/page-world.mjs), so the in-page halves are exercised as written.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CdpController} from '../../src/browser-service/cdp.mjs';
import {Deadline} from '../../src/browser-service/budgets.mjs';
import {BrowserServiceError} from '../../src/browser-service/errors.mjs';
import {InjectedScripts, WORLD_NAME} from '../../src/browser-service/injected.mjs';
import {ENTER_FRAME, SELECTOR_DEADLINE_EXCEEDED, SelectorEngine, ElementHandle} from '../../src/browser-service/selectors.mjs';
import {FAKE_INJECTED_SOURCE, el, iframe, pageWorld} from './support/page-world.mjs';

const TAB = 7;
const MAIN = `MAIN-${TAB}`;
const rejection = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function setup(elements) {
  const {api, browser} = pageWorld();
  browser.tab(TAB, {elements});
  const cdp = new CdpController(api);
  const injected = new InjectedScripts(cdp, {source: FAKE_INJECTED_SOURCE});
  return {api, browser, cdp, injected, selectors: new SelectorEngine(cdp, injected)};
}
const evaluations = browser => browser.calls.filter(c => c.method === 'Runtime.evaluate' && !c.params.expression.includes('PlaywrightInjected.InjectedScript'));
const nodeOf = (browser, id) => [...browser.frame(MAIN).document.descendants()].find(e => e.id === id);

test('resolve returns a handle on the one matching element (backend node, frame, target); the objects it used are released', async () => {
  const {browser, selectors} = setup([el('button', {id: 'go', text: 'Go'}), el('p', {text: 'text'})]);
  const handle = await selectors.resolve('#go', TAB, {deadline: new Deadline(2000)});
  assert.ok(handle instanceof ElementHandle);
  assert.equal(handle.backendNodeId, nodeOf(browser, 'go').backendNodeId);
  assert.equal(handle.frameId, MAIN);
  assert.deepEqual(handle.target, {tabId: TAB});
  assert.deepEqual(handle.oopifFrameChain, []);
  assert.equal(handle.selector, '#go');
  assert.equal(browser.objects.size, 0);
  assert.equal(await handle.evaluate((element, injected, arg) => `${element.textContent}${arg}`, {arg: '!', deadline: new Deadline(1000)}), 'Go!');
  const resolved = browser.calls.find(c => c.method === 'DOM.resolveNode');
  assert.deepEqual(resolved.params, {backendNodeId: handle.backendNodeId, executionContextId: browser.world(MAIN, WORLD_NAME).id},
    'the handle evaluates in the injected script\'s world');
  assert.equal(browser.objects.size, 0);
});

test('resolve polls until the element appears, within the deadline', async () => {
  const {browser, selectors} = setup([]);
  setTimeout(() => browser.navigate(MAIN, {elements: [el('div', {id: 'late', text: 'Late'})]}), 350);
  const handle = await selectors.resolve('#late', {tabId: TAB}, {deadline: new Deadline(3000)});
  assert.equal(handle.backendNodeId, nodeOf(browser, 'late').backendNodeId);
  assert.ok(evaluations(browser).length >= 3, 'tried again every 100 ms');
});

test('resolve times out with the vendor\'s sentence and the timeout code; no call goes out after the deadline', async () => {
  const {browser, selectors} = setup([el('p', {id: 'other'})]);
  const started = Date.now();
  const error = await rejection(selectors.resolve('#missing', TAB, {deadline: new Deadline(400)}));
  const took = Date.now() - started;
  assert.ok(error instanceof BrowserServiceError);
  assert.equal(error.code, 'timeout');
  assert.match(error.message, /^(Playwright selector deadline exceeded|Timed out after 400ms waiting for selector #missing: .*No element matched selector)$/);
  assert.equal(SELECTOR_DEADLINE_EXCEEDED, 'Playwright selector deadline exceeded');
  assert.ok(took >= 380 && took < 1500, `took ${took} ms`);
  const count = browser.calls.length;
  await sleep(150);
  assert.equal(browser.calls.length, count, 'nothing is left polling');
  for (const call of browser.calls.filter(c => c.op === 'executeCdp' && c.method !== 'Runtime.releaseObject')) {
    assert.ok(call.timeoutMs > 0 && call.timeoutMs <= 400, `${call.method} carried ${call.timeoutMs}`);
  }
});

test('a zero budget makes one attempt, its dispatches bounded by the 3 s action budget (the controller\'s ruling)', async () => {
  const {browser, selectors} = setup([el('p', {id: 'here', text: 'here'})]);
  const error = await rejection(selectors.resolve('#missing', TAB, {deadline: new Deadline(0)}));
  assert.equal(error.code, 'timeout');
  assert.match(error.message, /^Timed out after 0ms waiting for selector #missing: Browser Use encountered an error interacting with this webpage: Error: No element matched selector$/);
  assert.equal(evaluations(browser).length, 1);
  const dispatched = browser.calls.filter(c => c.op === 'executeCdp' && c.method !== 'Runtime.releaseObject');
  assert.ok(dispatched.length > 0);
  for (const call of dispatched) assert.ok(call.timeoutMs > 2000 && call.timeoutMs <= 3000, `${call.method} carried ${call.timeoutMs}`);
  const found = await selectors.resolve('#here', TAB, {deadline: new Deadline(0)});
  assert.equal(await found.evaluate(e => e.textContent, {deadline: new Deadline(0)}), 'here');
  assert.deepEqual((await selectors.resolveAll('p', TAB, {deadline: new Deadline(0)})).handles.length, 1);
  assert.equal(await selectors.evaluateInFrame(TAB, () => 'ran', {deadline: new Deadline(0)}), 'ran');
});

test('a budget spent mid-command dispatches nothing further', async () => {
  const {browser, selectors} = setup([]);
  const deadline = new Deadline(150);
  await rejection(selectors.resolve('#missing', TAB, {deadline}));
  const after = browser.calls.filter(c => c.op === 'executeCdp' && c.method !== 'Runtime.releaseObject').length;
  await rejection(selectors.resolve('#missing', TAB, {deadline}));
  assert.equal(browser.calls.filter(c => c.op === 'executeCdp' && c.method !== 'Runtime.releaseObject').length, after);
});

test('failing reads leave no remote objects behind, polled or not', async () => {
  const {browser, selectors} = setup([el('p', {id: 'p', text: 'p'})]);
  await rejection(selectors.evaluateOnSelector('#missing', TAB, e => e.textContent, {deadline: new Deadline(250)}));
  await rejection(selectors.evaluateOnSelector('#p', TAB, () => { throw new Error('boom'); }, {deadline: new Deadline(250)}));
  await rejection(selectors.evaluateOnSelectorAll('#p', TAB, () => { throw new Error('boom'); }, {deadline: new Deadline(250)}));
  await rejection(selectors.evaluateInFrame(TAB, () => { throw new Error('boom'); }, {deadline: new Deadline(250)}));
  await rejection(selectors.resolve('#missing', TAB, {deadline: new Deadline(250)}));
  const handle = await selectors.resolve('#p', TAB, {deadline: new Deadline(1000)});
  await rejection(handle.evaluate(() => { throw new Error('boom'); }, {deadline: new Deadline(1000)}));
  assert.equal(browser.objects.size, 0);
  assert.ok(browser.cdpCalls().includes('Runtime.releaseObject'));
});

test('two visible matches are a strict-mode violation at once, with the vendor\'s sentence; one visible among them is the vendor\'s fallback unless strict', async () => {
  const {browser, selectors} = setup([el('button', {cls: 'dup', text: 'A'}), el('button', {cls: 'dup', text: 'B'}),
    el('a', {cls: 'pair', text: 'shown'}), el('a', {cls: 'pair', text: 'hidden', visible: false})]);
  const started = Date.now();
  const error = await rejection(selectors.resolve('.dup', TAB, {deadline: new Deadline(2000)}));
  assert.ok(Date.now() - started < 500, 'not retried');
  assert.ok(error instanceof BrowserServiceError);
  assert.equal(error.code, 'strict_mode_violation');
  assert.equal(error.message, 'Browser Use encountered an error interacting with this webpage: Error: strict mode violation: .dup resolved to 2 elements');
  assert.equal(evaluations(browser).length, 1);

  const shown = await selectors.resolve('.pair', TAB, {deadline: new Deadline(2000)});
  assert.equal(await shown.evaluate(element => element.textContent), 'shown');
  const strict = await rejection(selectors.resolve('.pair', TAB, {deadline: new Deadline(2000), strict: true}));
  assert.equal(strict.code, 'strict_mode_violation');
});

test('an open dialog ends the polling with dialog_open', async () => {
  const {browser, selectors} = setup([]);
  setTimeout(() => browser.event({tabId: TAB}, 'Page.javascriptDialogOpening', {type: 'confirm', message: 'sure?', url: 'https://fixture.test/'}), 250);
  const started = Date.now();
  const error = await rejection(selectors.resolve('#never', TAB, {deadline: new Deadline(3000)}));
  assert.equal(error.code, 'dialog_open');
  assert.ok(Date.now() - started < 1000, 'not waited out');
});

test('resolveAll returns a handle per match, and none at once when nothing matches', async () => {
  const {browser, selectors} = setup([el('li', {text: 'one'}), el('li', {text: 'two'}), el('li', {text: 'three', visible: false})]);
  const all = await selectors.resolveAll('li', TAB, {deadline: new Deadline(2000)});
  const {handles} = all;
  assert.equal(handles.length, 3);
  assert.deepEqual({...all, handles: undefined}, {target: {tabId: TAB}, frameId: MAIN, oopifFrameChain: [], selector: 'li',
    documentBackendNodeId: browser.frame(MAIN).document.backendNodeId, handles: undefined});
  assert.deepEqual(handles.map(h => h.frameId), [MAIN, MAIN, MAIN]);
  assert.deepEqual(await Promise.all(handles.map(h => h.evaluate(e => e.textContent))), ['one', 'two', 'three']);
  assert.equal(browser.objects.size, 0);
  const started = Date.now();
  const none = await selectors.resolveAll('#none', TAB, {deadline: new Deadline(2000)});
  assert.deepEqual(none.handles, []);
  assert.equal(none.frameId, MAIN);
  assert.equal(browser.objects.size, 0);
  assert.ok(Date.now() - started < 300);
});

test('evaluateOnSelector and evaluateOnSelectorAll run a function with the element(s), the injected script and an argument, in one evaluation', async () => {
  const {browser, selectors} = setup([el('p', {id: 'p', text: 'para'}), el('li', {text: 'a'}), el('li', {text: 'b'})]);
  const deadline = new Deadline(2000);
  const read = await selectors.evaluateOnSelector('#p', TAB, (element, injected, arg, scope) =>
    ({text: element.textContent, arg, visible: injected.elementState(element, 'visible').matches, frames: scope.frameChain.length}), {arg: {x: 1}, deadline});
  assert.deepEqual(read.result, {text: 'para', arg: {x: 1}, visible: true, frames: 0});
  assert.deepEqual(read.target, {tabId: TAB});
  assert.equal(read.frameId, MAIN);
  browser.calls.length = 0;
  assert.equal(await selectors.evaluateOnSelectorAll('li', TAB, elements => elements.length, {deadline}), 2);
  assert.deepEqual(browser.cdpCalls(), ['Runtime.evaluate']);
  assert.deepEqual(await selectors.evaluateOnSelectorAll('li', TAB, (elements, injected, {suffix}) => elements.map(e => e.textContent + suffix), {arg: {suffix: '.'}, deadline}), ['a.', 'b.']);
  assert.deepEqual(await selectors.evaluateInFrame(TAB, (injected, arg) => typeof injected.parseSelector + arg, {arg: '!', deadline}), 'function!');
});

test('a page error inside the function is retried until the deadline, then reported with it', async () => {
  const {selectors} = setup([el('p', {id: 'p'})]);
  const error = await rejection(selectors.evaluateOnSelector('#p', TAB, () => { throw new Error('not yet'); }, {deadline: new Deadline(300)}));
  assert.equal(error.code, 'timeout');
  const once = await rejection(selectors.evaluateOnSelector('#p', TAB, () => { throw new Error('not yet'); }, {deadline: new Deadline(2000), retry: false}));
  assert.equal(once.message, 'Browser Use encountered an error interacting with this webpage: Error: not yet');
});

test('a same-process frame is entered in the page; the handle names the inner frame', async () => {
  const {browser, selectors} = setup([iframe({id: 'f', frame: {id: 'SAME', url: 'https://fixture.test/inner', elements: [el('button', {id: 'inner', text: 'Inner'})]}})]);
  const selector = `#f${ENTER_FRAME}#inner`;
  assert.equal(ENTER_FRAME, ' >> internal:control=enter-frame >> ');
  const handle = await selectors.resolve(selector, TAB, {deadline: new Deadline(2000)});
  assert.equal(handle.frameId, 'SAME');
  assert.deepEqual(handle.target, {tabId: TAB});
  assert.equal(handle.backendNodeId, [...browser.frame('SAME').document.descendants()].find(e => e.id === 'inner').backendNodeId);
  const read = await selectors.evaluateOnSelector(selector, TAB, (element, injected, arg, scope) => [element.textContent, scope.frameChain.length], {deadline: new Deadline(2000)});
  assert.deepEqual(read.result, ['Inner', 1]);
  assert.equal(browser.world('SAME', WORLD_NAME), undefined, 'no world was made for the inner frame by CDP');
  assert.equal(await handle.evaluate(e => e.textContent), 'Inner');
});

test('a cross-origin frame in the same process is entered through its own world', async () => {
  const {browser, selectors} = setup([iframe({id: 'x', name: 'pay', frame: {id: 'CROSS', url: 'https://other.test/pay', access: 'cross', elements: [el('input', {id: 'card'})]}})]);
  const handle = await selectors.resolve(`#x${ENTER_FRAME}#card`, TAB, {deadline: new Deadline(2000)});
  assert.equal(handle.frameId, 'CROSS');
  assert.deepEqual(handle.target, {tabId: TAB});
  assert.equal(handle.selector, `#x${ENTER_FRAME}#card`, 'the handle keeps the selector it was resolved from');
  assert.equal(handle.oopifFrameChain.length, 1);
  assert.deepEqual(handle.oopifFrameChain[0], {frameId: 'CROSS', parentTarget: {tabId: TAB}, size: {height: 150, width: 300}});
  assert.ok(browser.world('CROSS', WORLD_NAME), 'the cross-origin frame got its own world');
  assert.equal(await handle.evaluate(e => e.id), 'card');
  assert.equal(browser.objects.size, 0);
});

test('an out-of-process frame is entered on its own target', async () => {
  const {browser, selectors} = setup([iframe({id: 'o', frame: {id: 'OOPIF', url: 'https://oop.test/', access: 'oopif', elements: [el('a', {id: 'deep', text: 'Deep'})]}})]);
  const handle = await selectors.resolve(`#o${ENTER_FRAME}#deep`, TAB, {deadline: new Deadline(2000)});
  assert.deepEqual(handle.target, {tabId: TAB, targetId: 'OOPIF'});
  assert.equal(handle.frameId, 'OOPIF');
  assert.deepEqual(handle.oopifFrameChain, [{frameId: 'OOPIF', parentTarget: {tabId: TAB}, size: {height: 150, width: 300}}]);
  assert.ok(browser.calls.some(c => c.op === 'attachTarget' && c.targetId === 'OOPIF'));
  const read = await selectors.evaluateOnSelector(`#o${ENTER_FRAME}#deep`, TAB, e => e.textContent, {deadline: new Deadline(2000)});
  assert.equal(read.result, 'Deep');
  assert.deepEqual(read.target, {tabId: TAB, targetId: 'OOPIF'});
  assert.equal(await handle.evaluate(e => e.textContent), 'Deep');
});

test('enter-frame on an element that is not a frame, or a hidden frame, fails (after polling)', async () => {
  const {selectors} = setup([el('div', {id: 'd'}), iframe({id: 'h', visible: false, frame: {id: 'HID', access: 'cross', elements: []}})]);
  const notFrame = await rejection(selectors.resolve(`#d${ENTER_FRAME}#x`, TAB, {deadline: new Deadline(0)}));
  assert.match(notFrame.message, /internal:control=enter-frame must target a frame element/);
  const hidden = await rejection(selectors.resolve(`#h${ENTER_FRAME}#x`, TAB, {deadline: new Deadline(0)}));
  assert.match(hidden.message, /Frame is not visible/);
});

test('resolveAll and the evaluations reach into frames too', async () => {
  const {selectors} = setup([iframe({id: 'f', frame: {id: 'SAME', elements: [el('li', {text: '1'}), el('li', {text: '2'})]}}),
    iframe({id: 'o', frame: {id: 'OOPIF', url: 'https://oop.test/', access: 'oopif', elements: [el('li', {text: '3'})]}})]);
  const deadline = new Deadline(2000);
  const same = await selectors.resolveAll(`#f${ENTER_FRAME}li`, TAB, {deadline});
  assert.deepEqual(same.handles.map(h => h.frameId), ['SAME', 'SAME']);
  const oop = await selectors.resolveAll(`#o${ENTER_FRAME}li`, TAB, {deadline});
  assert.deepEqual(oop.handles.map(h => [h.frameId, h.target.targetId]), [['OOPIF', 'OOPIF']]);
  assert.equal(await selectors.evaluateOnSelectorAll(`#o${ENTER_FRAME}li`, TAB, elements => elements.length, {deadline}), 1);
});

test('a browser session carries one locator engine over its controller, installing the vendored script', async () => {
  const {BrowserSession} = await import('../../src/browser-service/session.mjs');
  const {installExpression} = await import('../../src/browser-service/injected.mjs');
  const {api} = pageWorld();
  const session = new BrowserSession({...api, addCloseListener: () => () => {}}, 'b1', {type: 'extension'});
  assert.ok(session.selectors instanceof SelectorEngine);
  assert.equal(session.selectors.cdp, session.cdp);
  assert.equal(session.selectors.injected, session.injected);
  assert.equal(session.injected.installParams.expression, installExpression());
});

test('resolveAll names the frame the query ran in when nothing matches: a same-process frame, an out-of-process one, a missing one', async () => {
  const {browser, selectors} = setup([iframe({id: 'f', frame: {id: 'SAME', elements: [el('p')]}}),
    iframe({id: 'o', frame: {id: 'OOPIF', url: 'https://oop.test/', access: 'oopif', elements: []}})]);
  const deadline = new Deadline(2000);
  const same = await selectors.resolveAll(`#f${ENTER_FRAME}li`, TAB, {deadline});
  assert.deepEqual(same.handles, []);
  assert.equal(same.frameId, 'SAME');
  assert.deepEqual(same.target, {tabId: TAB});
  assert.equal(same.documentBackendNodeId, browser.frame('SAME').document.backendNodeId, 'the inner document, for evaluateAll to bind to');
  const oop = await selectors.resolveAll(`#o${ENTER_FRAME}li`, TAB, {deadline});
  assert.deepEqual([oop.handles, oop.frameId, oop.target], [[], 'OOPIF', {tabId: TAB, targetId: 'OOPIF'}]);
  assert.equal(oop.documentBackendNodeId, browser.frame('OOPIF').document.backendNodeId);
  const missing = await selectors.resolveAll(`#gone${ENTER_FRAME}li`, TAB, {deadline});
  assert.deepEqual([missing.handles, missing.frameId], [[], MAIN], 'a frame not there: the world the query ran in');
  assert.equal(browser.objects.size, 0);
});
