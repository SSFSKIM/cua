// playwright_evaluate (src/browser-service/evaluate.mjs): the caller's script runs in the page's own world (not the
// injected script's), as a function body with `element` or `elements` bound in the locator forms, and its value comes
// back as the vendor's bounded projection. The no-replay rule: resolving the selector may poll, but the one dispatch
// that carries the script is never repeated; whatever interrupts it afterwards (a lost context, a navigation, the
// debugger detaching, the budget) is evaluate_interrupted. Runs over the real CdpController, InjectedScripts and
// SelectorEngine against the fake Chrome of support/page-world.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Deadline} from '../../src/browser-service/budgets.mjs';
import {CdpController} from '../../src/browser-service/cdp.mjs';
import {BrowserServiceError} from '../../src/browser-service/errors.mjs';
import {DEADLINE_SENTENCE, EVALUATE_HANDLERS, PageEvaluator} from '../../src/browser-service/evaluate.mjs';
import {InjectedScripts, WORLD_NAME} from '../../src/browser-service/injected.mjs';
import {ENTER_FRAME, SelectorEngine} from '../../src/browser-service/selectors.mjs';
import {FAKE_INJECTED_SOURCE, el, iframe, pageWorld} from './support/page-world.mjs';

const TAB = 7;
const MAIN = `MAIN-${TAB}`;
const rejection = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };

function setup(elements, {slow = {}} = {}) {
  const {api, browser} = pageWorld();
  // The real backend abandons an answer at the command's deadline (backend.mjs); the fake is made to do the same.
  // `slow` delays the answers of the methods it names by its milliseconds.
  const executeCdp = params => (slow[params.method] ? new Promise(resolve => setTimeout(resolve, slow[params.method])).then(() => api.answer(params)) : api.answer(params));
  api.answer = api.executeCdp;
  api.executeCdp = (params, {deadline} = {}) => (deadline ? deadline.race(executeCdp(params)) : executeCdp(params));
  browser.tab(TAB, {elements});
  const cdp = new CdpController(api);
  const injected = new InjectedScripts(cdp, {source: FAKE_INJECTED_SOURCE});
  const selectors = new SelectorEngine(cdp, injected);
  const session = {cdp, injected, selectors, evaluator: new PageEvaluator(cdp, selectors), clientInfo: {name: 'cua'}};
  const evaluate = params => EVALUATE_HANDLERS.playwright_evaluate({browser_id: 'b', tab_id: String(TAB), ...params}, session);
  return {browser, session, evaluate};
}
// The REPL client's script bodies (BC yl and fl).
const pageScript = (fn, arg) => `const arg = ${JSON.stringify(arg)};\nconst __playwrightEvaluate = (${fn.toString()});\nreturn await __playwrightEvaluate(arg);`;
const locatorScript = (fn, all = false) => `const arg = undefined;\nconst __playwrightEvaluate = (${fn.toString()});\nreturn await __playwrightEvaluate(${all ? 'elements' : 'element'}, arg);`;
// The calls that carried the user's script.
const dispatches = browser => browser.calls.filter(c => c.op === 'executeCdp'
  && ((c.method === 'Runtime.callFunctionOn' && c.params.functionDeclaration.includes('__cuaArguments'))
    || (c.method === 'Runtime.evaluate' && c.params.expression.includes('__cuaArguments'))));

test('the page form runs once in the page\'s own world, with `this` the window, and returns the projected value', async () => {
  const {browser, evaluate} = setup([el('p', {cls: 'item', text: 'Alpha'})]);
  const {value} = await evaluate({script: pageScript(arg => ({arg, title: document.body.localName, same: this === window}), 'x')});
  assert.deepEqual(value, {arg: 'x', title: 'body', same: true});
  const [dispatch] = dispatches(browser);
  assert.equal(dispatches(browser).length, 1);
  assert.equal(dispatch.params.contextId, undefined, 'no context id: the page\'s own world');
  assert.equal(dispatch.params.returnByValue, true);
  assert.ok(dispatch.timeoutMs > 0 && dispatch.timeoutMs <= 3000);
  assert.ok(browser.world(MAIN, '').global.document === browser.frame(MAIN).document);
  assert.equal(browser.world(MAIN, WORLD_NAME), undefined, 'the injected script was not needed');
});

test('a mutation made by the script stays in the page (no read-only membrane)', async () => {
  const {browser, evaluate} = setup([el('p', {id: 'p', text: 'before'})]);
  await evaluate({script: pageScript(() => { window.changed = 'yes'; return true; })});
  assert.equal(browser.world(MAIN, '').global.changed, 'yes');
  assert.deepEqual(await evaluate({script: pageScript(() => window.changed)}), {value: 'yes'});
});

test('the locator form resolves in the injected world, then binds `element` in the page\'s world and dispatches once', async () => {
  const {browser, evaluate} = setup([el('p', {id: 'a', cls: 'item', text: 'Alpha'}), el('p', {cls: 'item', text: 'Beta'})]);
  const {value} = await evaluate({selector: '#a', script: locatorScript(element => [element.textContent, this === window])});
  assert.deepEqual(value, ['Alpha', true]);
  const resolved = browser.calls.filter(c => c.method === 'DOM.resolveNode');
  assert.ok(resolved.some(c => c.params.executionContextId == null), 'the element resolved in the page\'s own world');
  assert.equal(dispatches(browser).length, 1);
  assert.equal(browser.objects.size, 0, 'every remote object released');
});

test('the locator form polls the selector until the element appears, then dispatches once', async () => {
  const {browser, evaluate} = setup([]);
  setTimeout(() => browser.navigate(MAIN, {elements: [el('div', {id: 'late', text: 'Late'})]}), 300);
  const {value} = await evaluate({selector: '#late', timeout_ms: 3000, script: locatorScript(element => element.textContent)});
  assert.equal(value, 'Late');
  assert.equal(dispatches(browser).length, 1);
});

test('a missing element times out with the vendor\'s evaluating sentence, the script never dispatched', async () => {
  const {browser, evaluate} = setup([el('p', {id: 'other'})]);
  const error = await rejection(evaluate({selector: '#missing', timeout_ms: 300, script: locatorScript(element => element.textContent)}));
  assert.equal(error.code, 'timeout');
  assert.match(error.message, /^Timed out after 300ms evaluating selector #missing: .*No element matched selector/);
  assert.equal(dispatches(browser).length, 0);
});

test('a strict-mode violation and an open dialog end the locator form at once, the script never dispatched', async () => {
  const {browser, evaluate} = setup([el('b', {cls: 'dup'}), el('b', {cls: 'dup'})]);
  const strict = await rejection(evaluate({selector: '.dup', timeout_ms: 2000, script: locatorScript(e => e)}));
  assert.equal(strict.code, 'strict_mode_violation');
  browser.event({tabId: TAB}, 'Page.javascriptDialogOpening', {type: 'alert', message: 'hi', url: 'https://fixture.test/'});
  const dialog = await rejection(evaluate({script: pageScript(() => 1)}));
  assert.equal(dialog.code, 'dialog_open');
  assert.equal(dispatches(browser).length, 0);
});

test('selector_mode "all" binds every match, and [] in the frame the query reached when none matches', async () => {
  const {browser, evaluate} = setup([el('li', {text: 'one'}), el('li', {text: 'two'}),
    iframe({id: 'f', frame: {id: 'SAME', url: 'https://fixture.test/frame', elements: [el('em', {text: 'inner'})]}})]);
  assert.deepEqual((await evaluate({selector: 'li', selector_mode: 'all', script: locatorScript(elements => elements.map(e => e.textContent), true)})).value, ['one', 'two']);
  const none = await evaluate({selector: `#f${ENTER_FRAME}.none`, selector_mode: 'all', script: locatorScript(elements => [elements.length, document === window.document, document.body.children[0].textContent], true)});
  assert.deepEqual(none.value, [0, true, 'inner'], 'the callback ran once, in the frame\'s own document');
  assert.equal(dispatches(browser).length, 2);
  assert.equal(browser.objects.size, 0);
  await assert.rejects(evaluate({selector_mode: 'all', script: locatorScript(e => e, true)}), /selector_mode=all requires a selector/);
});

test('module loading is refused before anything is sent', async () => {
  const {browser, evaluate} = setup([]);
  await assert.rejects(evaluate({script: 'return await import("https://example.test/x.js");'}), /^Error: module loading is not available in playwright\.evaluate$/);
  assert.equal(browser.calls.length, 0);
});

test('a page exception is the script\'s own error, with the page\'s description, not an interruption', async () => {
  const {browser, evaluate} = setup([]);
  const error = await rejection(evaluate({script: pageScript(() => { throw new TypeError('boom'); })}));
  assert.ok(!(error instanceof BrowserServiceError));
  assert.match(error.message, /^TypeError: boom/);
  assert.equal(browser.objects.size, 0, 'the exception object released');
});

// --- the no-replay rule -------------------------------------------------------------------------------------------

test('no replay: the context lost while the script runs is evaluate_interrupted, sent once, the session usable after', async () => {
  const {browser, evaluate} = setup([el('p', {id: 'p', text: 'p'})]);
  browser.fail('Runtime.callFunctionOn', 'Execution context was destroyed.');
  const error = await rejection(evaluate({selector: '#p', timeout_ms: 2000, script: locatorScript(element => element.textContent)}));
  assert.equal(error.code, 'evaluate_interrupted');
  assert.equal(error.message, 'playwright.evaluate was interrupted: Execution context was destroyed. The script was sent to the page once and may have run there; it was not run again.');
  assert.equal(dispatches(browser).length, 1);
  assert.deepEqual(await evaluate({selector: '#p', script: locatorScript(element => element.textContent)}), {value: 'p'});
});

test('no replay: a navigation during the script is evaluate_interrupted, sent once', async () => {
  const {browser, evaluate} = setup([]);
  browser.fail('Runtime.evaluate', 'Inspected target navigated or closed');
  const error = await rejection(evaluate({script: pageScript(() => 1)}));
  assert.equal(error.code, 'evaluate_interrupted');
  assert.match(error.message, /^playwright\.evaluate was interrupted: Inspected target navigated or closed\. .*it was not run again\.$/);
  assert.equal(browser.calls.filter(c => c.method === 'Runtime.evaluate').length, 1);
});

test('no replay: a CDP error the extension relays as JSON is worded by its message', async () => {
  const {browser, evaluate} = setup([]);
  browser.fail('Runtime.evaluate', JSON.stringify({code: -32000, message: 'Inspected target navigated or closed'}));
  const error = await rejection(evaluate({script: pageScript(() => 1)}));
  assert.equal(error.message, 'playwright.evaluate was interrupted: Inspected target navigated or closed. The script was sent to the page once and may have run there; it was not run again.');
});

test('no replay: the debugger detaching under the script is not answered by sending it again', async () => {
  const {browser, evaluate} = setup([el('p', {id: 'p', text: 'p'})]);
  browser.fail('Runtime.callFunctionOn', 'Debugger unattached');
  const error = await rejection(evaluate({selector: '#p', timeout_ms: 2000, script: locatorScript(element => element.textContent)}));
  assert.equal(error.code, 'evaluate_interrupted');
  assert.match(error.message, /Debugger unattached/);
  assert.equal(browser.calls.filter(c => c.method === 'Runtime.callFunctionOn' && c.params.functionDeclaration.includes('__cuaArguments')).length, 1,
    'the controller re-attached, but the script was not sent again');
});

test('no replay: a script still running when the budget ends is evaluate_interrupted at the budget, sent once, the session usable after', async () => {
  const {browser, evaluate} = setup([]);
  const started = Date.now();
  const error = await rejection(evaluate({timeout_ms: 400, script: pageScript(async () => { window.started = true; await new Promise(() => {}); })}));
  const took = Date.now() - started;
  assert.equal(error.code, 'evaluate_interrupted');
  assert.equal(error.message, `${DEADLINE_SENTENCE}. The script was sent to the page once and may have run there; it was not run again.`);
  assert.ok(took >= 380 && took < 1500, `took ${took} ms`);
  assert.equal(dispatches(browser).length, 1);
  assert.equal(browser.world(MAIN, '').global.started, true, 'the page ran it: the timeout rolled nothing back');
  assert.ok(dispatches(browser)[0].params.timeout <= 400);
  assert.deepEqual(await evaluate({script: pageScript(() => window.started)}), {value: true});
});

test('the budget is the caller\'s up to 120 s; an explicit zero is one attempt bounded by 3 s', async () => {
  const {browser, evaluate} = setup([el('p', {id: 'p', text: 'p'})]);
  await evaluate({script: pageScript(() => 1), timeout_ms: 15000});
  assert.ok(dispatches(browser)[0].params.timeout > 3000 && dispatches(browser)[0].params.timeout <= 15000);
  await evaluate({script: pageScript(() => 1), timeout_ms: 500000});
  assert.ok(dispatches(browser)[1].params.timeout > 100000 && dispatches(browser)[1].params.timeout <= 120000);
  assert.deepEqual(await evaluate({selector: '#p', timeout_ms: 0, script: locatorScript(element => element.textContent)}), {value: 'p'});
  const before = browser.calls.length;
  const missing = await rejection(evaluate({selector: '#missing', timeout_ms: 0, script: locatorScript(element => element.textContent)}));
  assert.equal(missing.code, 'timeout');
  const attempts = browser.calls.slice(before).filter(c => c.method === 'Runtime.evaluate' && !c.params.expression.includes('PlaywrightInjected.InjectedScript'));
  assert.equal(attempts.length, 1, 'one resolution attempt');
  for (const call of browser.calls.slice(before).filter(c => c.op === 'executeCdp' && !/release/.test(c.method))) {
    assert.ok(call.timeoutMs > 2000 && call.timeoutMs <= 3000, `${call.method} carried ${call.timeoutMs}`);
  }
});

test('a zero budget is one 3 s attempt across the selector\'s preparation and the script, in every form', async () => {
  for (const form of [{selector: 'li', selector_mode: 'all', all: true, slow: {'Runtime.getProperties': 2200}},
    {selector: '#one', all: false, slow: {'DOM.describeNode': 2200}}]) {
    // The preparation (the in-page query, resolving the matches) takes most of the attempt; the script never ends.
    const {browser, evaluate} = setup([el('li', {id: 'one', text: 'one'})], {slow: form.slow});
    const started = Date.now();
    const error = await rejection(evaluate({selector: form.selector, selector_mode: form.selector_mode, timeout_ms: 0,
      script: locatorScript(async () => { await new Promise(() => {}); }, form.all)}));
    const took = Date.now() - started;
    assert.equal(error.code, 'evaluate_interrupted', `${form.selector}: ${error.message}`);
    assert.ok(took >= 2900 && took < 3600, `${form.selector}: the attempt took ${took} ms, not a second 3 s`);
    assert.equal(dispatches(browser).length, 1);
  }
});

test('evaluateInPage takes a tab, an element handle or a resolveAll result, and the script\'s arguments', async () => {
  const {session} = setup([el('p', {id: 'p', text: 'p'}), el('i', {text: 'x'})]);
  const deadline = new Deadline(2000);
  assert.equal(await session.evaluator.evaluateInPage(TAB, 'return arguments[0] + arguments[1];', [2, 3], {deadline}), 5);
  const handle = await session.selectors.resolve('#p', TAB, {deadline});
  assert.equal(await session.evaluator.evaluateInPage(handle, 'return element.textContent + arguments[0];', ['!'], {deadline}), 'p!');
  const all = await session.selectors.resolveAll('i', TAB, {deadline});
  assert.deepEqual(await session.evaluator.evaluateInPage(all, 'return [elements.length, arguments[0]];', ['y'], {deadline}), [1, 'y']);
  await assert.rejects(session.evaluator.evaluateInPage({tabId: TAB, frameId: 'SAME'}, 'return 1;', [], {deadline}), /child frame/);
});
